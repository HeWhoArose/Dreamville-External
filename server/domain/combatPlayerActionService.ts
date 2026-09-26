import type { CombatNarrativeResolution } from '../../src/types';
import type { WorldRepository } from '../repositories/worldRepository';
import { combatEffectEngine } from './combatEffectEngine';
import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';

export interface CombatPlayerActionResult {
  success: boolean;
  errorReason?: string;
  resolution?: CombatNarrativeResolution;
  actionType?: 'ATTACK' | 'CAST' | 'MOVE';
  targetId?: string;
  advanceTurn: boolean;
}

export class CombatPlayerActionService {
  public async resolve(params: {
    storyId: string;
    actorId: string;
    actionText: string;
    repository: WorldRepository;
  }): Promise<CombatPlayerActionResult> {
    const combat = params.repository.getCombatEngine(params.storyId);
    if (combat.getCombatPhase() !== 'ACTIVE') return { success: false, errorReason: 'Combat is not in an active player-action phase.', advanceTurn: false };
    const actor = combat.getParticipant(params.actorId);
    if (!actor || combat.getCurrentActor()?.id !== params.actorId || !combat.projectCombatForActor(params.actorId, params.repository.getCombatPerceptionOptions(params.storyId, params.actorId)).isPlayerTurn) {
      return { success: false, errorReason: 'It is not the player actor\'s turn.', advanceTurn: false };
    }

    const text = params.actionText.trim();
    const lower = text.toLowerCase();
    const visible = combat.getParticipants().filter((participant) => participant.id !== params.actorId && !participant.isDead && combat.isParticipantKnownToActor(params.actorId, participant, params.repository.getCombatPerceptionOptions(params.storyId, params.actorId)));
    const target = this.findTarget(text, visible);
    const capabilities = params.repository.getCapabilityEngine(params.storyId).getEffectiveActorCapabilities(params.actorId, params.repository.getInventoryEngine(params.storyId));
    const capability = capabilities.find((candidate) => lower.includes(candidate.name.toLowerCase()) || lower.includes(candidate.id.toLowerCase()));

    let mechanical: any;
    let actionType: 'ATTACK' | 'CAST' | 'MOVE' = 'CAST';
    let actionLabel = text;
    let targetId = target?.id;

    const moveMatch = lower.match(/(?:move|go|advance|retreat)\s+(?:to\s+)?(\d+)\s*[, ]\s*(\d+)/);
    if (moveMatch) {
      const move = combat.moveActor(params.actorId, Number(moveMatch[1]), Number(moveMatch[2]));
      if (!move.success) return { success: false, errorReason: move.errorReason, advanceTurn: false };
      mechanical = { success: true, movedTo: { x: Number(moveMatch[1]), y: Number(moveMatch[2]) }, totalDamage: 0, canonicalEventIds: [] };
      actionType = 'MOVE';
      actionLabel = 'Move';
    } else if (capability?.effectDefinition) {
      if (!target && capability.effectDefinition.targetingMode !== 'SELF') return { success: false, errorReason: 'The action requires a visible target.' , advanceTurn: false };
      actionLabel = capability.name;
      targetId = target?.id;
      mechanical = combatEffectEngine.resolve(combat, params.actorId, targetId ? [targetId] : [], capability.effectDefinition, { consumeAction: true });
      actionType = 'CAST';
    } else {
      const spellName = lower.replace(/^cast\s+/, '').replace(/^use\s+/, '').split(/\s+at\s+|\s+on\s+/)[0].trim();
      const spell = combat.getSpellRuntime().getSpell(spellName);
      if (spell) {
        if (!target && spell.targetType !== 'SELF') return { success: false, errorReason: 'The spell requires a visible target.', advanceTurn: false };
        actionLabel = spell.name;
        targetId = target?.id;
        const cast = combat.executeSpellCast({ actorId: params.actorId, spellId: spell.id, targetId, consumeResource: true });
        mechanical = { success: cast.success, errorReason: cast.errorReason, spellResult: cast.result, totalDamage: cast.result?.damageInflicted || 0, canonicalEventIds: [] };
      } else if (/(attack|strike|hit|shoot|stab|slash|fire)/.test(lower)) {
        if (!target) return { success: false, errorReason: 'The attack requires a visible hostile target.', advanceTurn: false };
        const attack = combat.executeAttack(params.actorId, target.id, { consumeAction: true });
        mechanical = { success: attack.success, errorReason: attack.errorReason, attackResult: attack, totalDamage: attack.damage || 0, canonicalEventIds: [] };
        actionType = 'ATTACK';
      } else {
        return { success: false, errorReason: 'The combat action could not be mapped to a canonical move, attack, spell, or owned capability.', advanceTurn: false };
      }
    }

    if (!mechanical?.success) return { success: false, errorReason: mechanical?.errorReason || 'Combat action failed.', advanceTurn: false };
    const updatedTargets = targetId ? [combat.getParticipant(targetId)].filter(Boolean).map((participant) => ({ targetId: participant!.id, hpCurrent: participant!.hpCurrent, hpMax: participant!.hpMax, targetDied: participant!.isDead })) : [];
    const rolls: CombatNarrativeResolution['rolls'] = [];
    const attackRoll = mechanical.attackResult?.roll || mechanical.spellResult?.attackResult?.roll;
    const saveRoll = mechanical.spellResult?.savingThrowResult?.roll;
    const damageRoll = mechanical.attackResult?.damageRoll;
    if (attackRoll) rolls.push({ label: actionType === 'CAST' ? 'Spell Attack' : 'Attack', roll: attackRoll, total: attackRoll.total, kind: 'ATTACK' });
    if (saveRoll) rolls.push({ label: mechanical.spellResult.savingThrowResult.ability + ' Saving Throw', roll: saveRoll, total: saveRoll.total, kind: 'SAVE' });
    if (damageRoll) rolls.push({ label: 'Damage', roll: damageRoll, total: damageRoll.total, kind: 'DAMAGE' });
    const hits = mechanical.attackResult?.hits ?? mechanical.spellResult?.attackResult?.hits ?? (mechanical.spellResult?.savingThrowResult ? !mechanical.spellResult.savingThrowResult.succeeds : undefined);
    const saveResult = mechanical.spellResult?.savingThrowResult;
    const damage = Number(mechanical.totalDamage || 0);
    const targetName = targetId ? (combat.getParticipant(targetId)?.name || 'target') : 'the battlefield';
    const mechanicalSummary = actionLabel + ': ' + (
      saveResult
        ? (saveResult.succeeds ? saveResult.ability + ' save succeeded; the spell effect was partially avoided.' : saveResult.ability + ' save failed; the spell effect landed.')
        : hits === false
          ? 'failed to hit or overcome the defense.'
          : 'resolved successfully.'
    ) + (damage > 0 ? ' Damage: ' + damage + '.' : '');
    const narration = await this.generateNarration(params, mechanicalSummary, targetName, updatedTargets[0]?.hpCurrent);
    const resolution: CombatNarrativeResolution = {
      id: deterministicId('combat_player_resolution', params.storyId, params.actorId, params.actionText, combat.getCurrentRound(), combat.getDiceEngine().getRollCounter()),
      actorId: params.actorId,
      targetIds: targetId ? [targetId] : [],
      actionText: text,
      actionLabel,
      rolls,
      success: true,
      hits,
      damage,
      targetHp: updatedTargets,
      mechanicalSummary,
      narrativeResponse: narration,
      canonicalEventIds: mechanical.canonicalEventIds || [],
      createdAt: formatCanonicalTimestamp(params.repository.getWorldClock(params.storyId).getTimestamp()),
    };
    combat.setLastResolution(resolution);
    return { success: true, resolution, actionType, targetId, advanceTurn: true };
  }

  private findTarget(text: string, participants: import('./combatEngine').BattlefieldParticipant[]): import('./combatEngine').BattlefieldParticipant | undefined {
    const lower = text.toLowerCase();
    const explicit = participants.find((participant) => lower.includes(participant.name.toLowerCase()) || lower.includes(participant.id.toLowerCase()));
    return explicit || (participants.length === 1 ? participants[0] : undefined);
  }

  private async generateNarration(params: { storyId: string; actorId: string; actionText: string; repository: WorldRepository }, mechanicalSummary: string, targetName: string, targetHp?: number): Promise<string> {
    try {
      const generated = await params.repository.getAiOrchestrator().generateNarrativeOnly({
        storyId: params.storyId,
        playerAction: params.actionText,
        committedOutcome: mechanicalSummary + (targetHp !== undefined ? ' ' + targetName + ' has ' + targetHp + ' HP remaining.' : ''),
        continuationDirective: 'This is an active tactical combat action. The mechanical result is already resolved. Narrate only that committed outcome; never invent a different roll, damage, target state, or condition.',
      });
      if (generated.success && generated.turnPackage?.narrative?.length) return generated.turnPackage.narrative.join('\n\n').trim();
    } catch {
      // Deterministic fallback below.
    }
    return mechanicalSummary + (targetHp !== undefined ? ' ' + targetName + ' has ' + targetHp + ' HP remaining.' : '');
  }
}

export const combatPlayerActionService = new CombatPlayerActionService();