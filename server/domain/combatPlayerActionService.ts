import type { CombatNarrativeResolution } from '../../src/types';
import type { WorldRepository } from '../repositories/worldRepository';
import { combatEffectEngine } from './combatEffectEngine';
import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import { actionResolutionFromCombat } from './actionResolution';

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
      const spellName = lower.replace(/^(?:i\s+)?(?:cast|use)\s+/, '').split(/\s+at\s+|\s+on\s+/)[0].trim();
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
    const attackRoll = mechanical.attackResult?.roll || mechanical.spellResult?.attackResult?.roll || mechanical.instances?.[0]?.roll;
    const saveRoll = mechanical.spellResult?.savingThrowResult?.roll;
    const damageRoll = mechanical.attackResult?.damageRoll || mechanical.instances?.[0]?.damageRoll;
    if (attackRoll) rolls.push({ label: actionType === 'CAST' ? 'Spell Attack' : 'Attack', roll: attackRoll, total: attackRoll.total, kind: 'ATTACK' });
    if (saveRoll) rolls.push({ label: mechanical.spellResult.savingThrowResult.ability + ' Saving Throw', roll: saveRoll, total: saveRoll.total, kind: 'SAVE' });
    if (damageRoll) rolls.push({ label: 'Damage', roll: damageRoll, total: damageRoll.total, kind: 'DAMAGE' });
    const hits =
      mechanical.attackResult?.hits ??
      mechanical.spellResult?.attackResult?.hits ??
      (mechanical.spellResult?.savingThrowResult
        ? !mechanical.spellResult.savingThrowResult.succeeds
        : (Array.isArray(mechanical.instances) && mechanical.instances.length > 0
            ? mechanical.instances.some((inst: any) => Boolean(inst.hits))
            : undefined));
    const saveResult = mechanical.spellResult?.savingThrowResult;
    const damage = Number(mechanical.totalDamage || 0);
    const healing = Number(mechanical.spellResult?.healingApplied || mechanical.healing || 0);

    const capabilityConditionsApplied = Array.isArray(mechanical.conditionsApplied)
      ? mechanical.conditionsApplied
          .filter((entry: any) => entry && typeof entry === 'object' && entry.applied !== false && !entry.immune)
          .map((entry: any) => String(entry.conditionIdOrName || '').trim())
          .filter(Boolean)
      : [];
    const spellConditionsApplied = Array.isArray(mechanical.spellResult?.conditionsApplied)
      ? mechanical.spellResult.conditionsApplied.map((c: any) => String(c || '').trim()).filter(Boolean)
      : [];
    const conditionsApplied = Array.from(new Set([...capabilityConditionsApplied, ...spellConditionsApplied]));

    const spellConditionsRemoved = Array.isArray(mechanical.spellResult?.conditionsRemoved)
      ? mechanical.spellResult.conditionsRemoved.map((c: any) => String(c || '').trim()).filter(Boolean)
      : [];
    const brokenConcentrationRemoved = Array.isArray(mechanical.spellResult?.targetConcentrationCheck?.cleanedUpConditions)
      ? mechanical.spellResult.targetConcentrationCheck.cleanedUpConditions
          .map((entry: any) => String(entry?.condition || '').trim())
          .filter(Boolean)
      : [];
    const conditionsRemoved = Array.from(new Set([...spellConditionsRemoved, ...brokenConcentrationRemoved]));

    const rawForcedMovement =
      mechanical.spellResult?.movementCollision ||
      mechanical.attackResult?.forcedMovement ||
      (Array.isArray(mechanical.instances)
        ? mechanical.instances.find((inst: any) => inst?.forcedMovement)?.forcedMovement
        : undefined);
    const spellMovementApplied = mechanical.spellResult?.movementApplied;
    const rawCollisions = Array.isArray(rawForcedMovement?.collisions)
      ? rawForcedMovement.collisions
      : (rawForcedMovement?.collision ? [rawForcedMovement.collision] : []);
    const collisionDamage = rawCollisions.reduce(
      (sum: number, col: any) => sum + Number(col?.damageToMover || 0),
      0,
    );
    const secondaryDamage = Number(mechanical.secondaryDamage || collisionDamage || 0);
    const forcedMoved = Boolean(rawForcedMovement?.moved || spellMovementApplied);
    const distanceCells = Number(
      rawForcedMovement?.actualDistanceCells ??
      (spellMovementApplied
        ? Math.round(Math.hypot(spellMovementApplied.to.x - spellMovementApplied.from.x, spellMovementApplied.to.y - spellMovementApplied.from.y))
        : 0),
    );
    const destinationCoord = rawForcedMovement?.to || spellMovementApplied?.to;
    const forcedMovement = (forcedMoved || rawCollisions.length > 0)
      ? {
          moved: forcedMoved,
          distanceCells,
          distanceFeet: distanceCells > 0 ? distanceCells * 5 : undefined,
          from: rawForcedMovement?.from || spellMovementApplied?.from,
          to: destinationCoord,
          destination: destinationCoord ? `(${destinationCoord.x}, ${destinationCoord.y})` : undefined,
          collided: rawCollisions.length > 0,
          obstacleName:
            rawCollisions[0]?.blockerName ||
            (rawCollisions[0]?.kind ? String(rawCollisions[0].kind).toLowerCase().replace(/_/g, ' ') : undefined),
          collisionDamage: collisionDamage > 0 ? collisionDamage : (secondaryDamage > 0 ? secondaryDamage : undefined),
        }
      : undefined;

    const concentration = (
      mechanical.spellResult?.concentrationEstablished ||
      mechanical.spellResult?.brokenPreviousConcentration?.spellName ||
      mechanical.spellResult?.targetConcentrationCheck
    )
      ? {
          establishedSpellName: mechanical.spellResult?.concentrationEstablished ? actionLabel : undefined,
          brokenPreviousSpellName: mechanical.spellResult?.brokenPreviousConcentration?.spellName,
          targetBrokenSpellName: mechanical.spellResult?.targetConcentrationCheck?.concentrationBroken
            ? mechanical.spellResult.targetConcentrationCheck.spellName
            : undefined,
          targetMaintainedConcentration:
            mechanical.spellResult?.targetConcentrationCheck && !mechanical.spellResult.targetConcentrationCheck.concentrationBroken
              ? true
              : undefined,
        }
      : undefined;

    const targetName = targetId ? (combat.getParticipant(targetId)?.name || 'target') : 'the battlefield';
    const mechanicalSummary = [
      actionLabel + ': ' + (
        saveResult
          ? (saveResult.succeeds ? saveResult.ability + ' save succeeded; the spell effect was partially avoided.' : saveResult.ability + ' save failed; the spell effect landed.')
          : hits === false
            ? 'failed to hit or overcome the defense.'
            : 'resolved successfully.'
      ),
      damage > 0 ? `Damage: ${damage}.` : '',
      healing > 0 ? `Restored ${healing} health.` : '',
      conditionsApplied.length > 0 ? `Applied condition${conditionsApplied.length > 1 ? 's' : ''}: ${conditionsApplied.join(', ')}.` : '',
      conditionsRemoved.length > 0 ? `Removed condition${conditionsRemoved.length > 1 ? 's' : ''}: ${conditionsRemoved.join(', ')}.` : '',
      forcedMovement?.moved ? `Target was forced to move${forcedMovement.distanceFeet ? ' ' + forcedMovement.distanceFeet + ' feet' : ''}${forcedMovement.destination ? ' to ' + forcedMovement.destination : ''}.` : '',
      forcedMovement?.collided ? `Target collided${forcedMovement.obstacleName ? ' with ' + forcedMovement.obstacleName : ''}${forcedMovement.collisionDamage ? ' for ' + forcedMovement.collisionDamage + ' collision damage' : ''}.` : '',
      concentration?.brokenPreviousSpellName ? `Previous concentration on ${concentration.brokenPreviousSpellName} ended.` : '',
      concentration?.establishedSpellName ? `Concentration established on ${concentration.establishedSpellName}.` : '',
      concentration?.targetBrokenSpellName ? `Target lost concentration on ${concentration.targetBrokenSpellName}.` : '',
    ].filter(Boolean).join(' ');

    const resolutionId = deterministicId('combat_player_resolution', params.storyId, params.actorId, params.actionText, combat.getCurrentRound(), combat.getDiceEngine().getRollCounter());
    const actionResolution = actionResolutionFromCombat({
      id: resolutionId,
      actorId: params.actorId,
      targetIds: targetId ? [targetId] : [],
      actionText: text,
      actionLabel,
      rolls,
      success: true,
      hits,
      damage,
      secondaryDamage: secondaryDamage > 0 ? secondaryDamage : undefined,
      healing: healing > 0 ? healing : undefined,
      conditionsApplied: conditionsApplied.length > 0 ? conditionsApplied : undefined,
      conditionsRemoved: conditionsRemoved.length > 0 ? conditionsRemoved : undefined,
      forcedMovement,
      concentration,
      targetHp: updatedTargets,
      mechanicalSummary,
      narrativeResponse: '',
      canonicalEventIds: mechanical.canonicalEventIds || [],
      createdAt: formatCanonicalTimestamp(params.repository.getWorldClock(params.storyId).getTimestamp()),
    }, params.storyId);
    const narrationResult = await this.generateNarration(params, mechanicalSummary, targetName, updatedTargets[0]?.hpCurrent, actionResolution);
    const resolution: CombatNarrativeResolution = {
      id: resolutionId,
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
      narrativeResponse: narrationResult.text,
      fallbackUsed: narrationResult.fallbackUsed,
      narrativeSource: narrationResult.source,
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

  private async generateNarration(params: { storyId: string; actorId: string; actionText: string; repository: WorldRepository }, mechanicalSummary: string, targetName: string, targetHp?: number, actionResolution?: import('./actionResolution').ActionResolution): Promise<{ text: string; source: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK'; fallbackUsed: boolean }> {
    try {
      const generated = await params.repository.getAiOrchestrator().generateNarrativeOnly({
        storyId: params.storyId,
        playerAction: params.actionText,
        actionResolution,
        maxRetries: 1,
        repository: params.repository,
        committedOutcome: mechanicalSummary + (targetHp !== undefined ? ' ' + targetName + ' has ' + targetHp + ' HP remaining.' : ''),
        continuationDirective: 'This is an active tactical combat action. The mechanical result is already resolved. Narrate only that committed outcome; never invent a different roll, damage, target state, or condition.',
      });
      const text = generated.success ? (generated.turnPackage?.narrative || []).join('\n\n').trim() : '';
      if (text) {
        const source = generated.source || 'AI_FALLBACK';
        return { text, source, fallbackUsed: source !== 'AI_PRIMARY' };
      }
    } catch {
      // Deterministic fallback below.
    }
    return { text: mechanicalSummary + (targetHp !== undefined ? ' ' + targetName + ' has ' + targetHp + ' HP remaining.' : ''), source: 'DETERMINISTIC_FALLBACK', fallbackUsed: true };
  }
}

export const combatPlayerActionService = new CombatPlayerActionService();