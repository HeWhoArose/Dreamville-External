import type { CombatNarrativeResolution, CombatTransitionState, CombatEffectDefinition } from '../../src/types';
import type { WorldRepository } from '../repositories/worldRepository';
import { combatEffectEngine } from './combatEffectEngine';
import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import type { EntityCard } from './entityCard';

export interface CombatEncounterCandidate {
  targetId: string;
  targetName: string;
  locationId: string;
  targetCard: EntityCard;
  targetAwareOfPlayer: boolean;
  reason: string;
}

export class CombatEncounterService {
  private readonly hostileTags = new Set(['hostile', 'enemy', 'aggressive', 'combatant', 'combat_spawn']);

  public isHostileAction(actionText: string): boolean {
    const text = String(actionText || '').toLowerCase();
    return ['attack', 'strike', 'hit', 'shoot', 'stab', 'slash', 'cast', 'spell', 'fireball', 'kill', 'blast', 'burn', 'freeze', 'ambush', 'sneak attack', 'smite', 'curse', 'harm']
      .some((token) => text.includes(token));
  }

  private isHostileCard(card: EntityCard, actorId: string, storyId: string, repository: WorldRepository): boolean {
    if (card.classification.tags.some((tag) => this.hostileTags.has(tag.toLowerCase()))) return true;
    const behavior = (card.behavior.combatBehavior || '') + ' ' + (card.behavior.threatResponse || '') + ' ' + (card.behavior.defaultBehavior || '');
    if (/attack|hunt|hostile/i.test(behavior)) return true;
    const relation = repository.getDynamicCharacterAgencyEngine(storyId).getRelationship(storyId, card.id, actorId);
    return Boolean(relation && (relation.stance === 'ENEMY' || relation.stance === 'RIVAL' || relation.hostility >= 55));
  }

  public findHostileCandidate(storyId: string, actorId: string, actionText: string, repository: WorldRepository): CombatEncounterCandidate | undefined {
    if (!this.isHostileAction(actionText)) return undefined;
    const player = repository.getPlayerLifecycle(storyId);
    const locationId = player?.locationId || repository.getCurrentLocation(storyId) || undefined;
    if (!locationId) return undefined;
    const cards = repository.getEntityCards(storyId).filter((card) => {
      if (!card || card.id === actorId) return false;
      if (!card.worldState.isAlive || card.worldState.presence !== 'present') return false;
      if (card.worldState.locationId !== locationId) return false;
      if (['DEAD', 'DESTROYED', 'ARCHIVED'].includes(card.lifecycle.status)) return false;
      if (card.id === actorId || card.kind === 'PLAYER') return false;
      return this.isHostileCard(card, actorId, storyId, repository);
    });
    const normalized = String(actionText || '').toLowerCase();
    const explicitlyNamed = cards.find((card) => normalized.includes(card.name.toLowerCase()) || card.identity.aliases.some((alias) => normalized.includes(alias.toLowerCase())));
    const target = explicitlyNamed || cards[0];
    if (!target) return undefined;
    const targetAwareOfPlayer = repository.isEntityEpistemicallyKnown(storyId, target.id, actorId);
    return {
      targetId: target.id,
      targetName: target.name,
      locationId,
      targetCard: target,
      targetAwareOfPlayer,
      reason: explicitlyNamed ? 'A hostile entity at the current location was explicitly named by the player.' : 'A hostile entity at the current location matches the current hostile action context.',
    };
  }

  public shouldUsePrecombatResolution(candidate: CombatEncounterCandidate): boolean {
    return !candidate.targetAwareOfPlayer;
  }

  public buildPendingCombatTransition(candidate: CombatEncounterCandidate): CombatTransitionState {
    return {
      started: false,
      phase: 'PRECOMBAT',
      narrativeLeadIn: candidate.targetName + ' is present, but has not yet perceived you. Resolve the opening action before initiative.',
      requiresInitiativeRoll: true,
      fromStory: true,
    };
  }

  public async resolvePrecombatAction(params: {
    storyId: string;
    actorId: string;
    targetId: string;
    actionText: string;
    repository: WorldRepository;
    advantageFromAmbush?: boolean;
  }): Promise<{ success: boolean; resolution?: CombatNarrativeResolution; transition?: CombatTransitionState; errorReason?: string }> {
    const combat = params.repository.getCombatEngine(params.storyId);
    const actor = combat.getParticipant(params.actorId);
    const target = combat.getParticipant(params.targetId);
    if (!actor || !target) return { success: false, errorReason: 'Pre-combat action requires canonical combat participants.' };
    const capEngine = params.repository.getCapabilityEngine(params.storyId);
    const effectiveCaps = capEngine.getEffectiveActorCapabilities(params.actorId, params.repository.getInventoryEngine(params.storyId));
    const text = params.actionText.trim().toLowerCase();
    const capability = effectiveCaps.find((candidate) => text === candidate.id.toLowerCase() || text.includes(candidate.name.toLowerCase()));
    let mechanical: any;
    let label = params.actionText.trim();
    if (capability?.effectDefinition) {
      label = capability.name;
      mechanical = combatEffectEngine.resolve(combat, params.actorId, [params.targetId], {
        ...capability.effectDefinition,
      } as CombatEffectDefinition, { consumeAction: false });
    } else {
      const spellName = text.replace(/^cast\s+/, '').replace(/^use\s+/, '').trim();
      const spell = combat.getSpellRuntime().getSpell(spellName);
      if (spell) {
        label = spell.name;
        const cast = combat.executeSpellCast({
          actorId: params.actorId,
          spellId: spell.id,
          targetId: params.targetId,
          advantage: false,
          disadvantage: false,
          consumeResource: false,
        } as any);
        mechanical = {
          success: cast.success,
          errorReason: cast.errorReason,
          instances: cast.result?.damageInflicted !== undefined ? [{
            instanceIndex: 0,
            targetId: params.targetId,
            hits: cast.result?.attackResult?.hits ?? (cast.result?.savingThrowResult ? !cast.result.savingThrowResult.succeeds : true),
            isCritical: Boolean(cast.result?.attackResult?.isCritical),
            damage: Number(cast.result?.damageInflicted || 0),
            targetDied: Boolean(cast.result?.targetDied),
            roll: cast.result?.attackResult?.roll || cast.result?.savingThrowResult?.roll,
          }] : [],
          totalDamage: Number(cast.result?.damageInflicted || 0),
          canonicalEventIds: [],
          spellResult: cast.result,
        };
      } else if (/(attack|strike|shoot|hit|stab|slash)/.test(text)) {
        const attack = combat.executeAttack(params.actorId, params.targetId, { consumeAction: false, advantage: Boolean(params.advantageFromAmbush) });
        mechanical = {
          success: attack.success,
          errorReason: attack.errorReason,
          instances: attack.success ? [{ instanceIndex: 0, targetId: params.targetId, hits: Boolean(attack.hits), isCritical: Boolean(attack.isCritical), damage: Number(attack.damage || 0), targetDied: Boolean(attack.targetDied), roll: attack.roll, attackRollTotal: attack.roll?.total, targetArmorClass: target.armorClass }] : [],
          totalDamage: Number(attack.damage || 0),
          canonicalEventIds: [],
        };
      } else {
        return { success: false, errorReason: 'The pre-combat action could not be mapped to an owned capability, canonical spell, or weapon attack.' };
      }
    }
    if (!mechanical?.success) return { success: false, errorReason: mechanical?.errorReason || 'Pre-combat resolution failed.' };
    const updatedTarget = combat.getParticipant(params.targetId) || target;
    const rolls: CombatNarrativeResolution['rolls'] = [];
    for (const [index, instance] of (mechanical.instances || []).entries()) {
      if (instance.roll) rolls.push({ label: instance.attackRollTotal !== undefined ? 'Attack ' + (index + 1) : 'Defense ' + (index + 1), roll: instance.roll, total: instance.roll.total, kind: instance.attackRollTotal !== undefined ? 'ATTACK' : 'SAVE' });
      if (instance.damageRoll) rolls.push({ label: 'Damage ' + (index + 1), roll: instance.damageRoll, total: instance.damageRoll.total, kind: 'DAMAGE' });
    }
    if (mechanical.spellResult?.attackResult?.roll) rolls.push({ label: 'Spell Attack', roll: mechanical.spellResult.attackResult.roll, total: mechanical.spellResult.attackResult.roll.total, kind: 'ATTACK' });
    if (mechanical.spellResult?.savingThrowResult?.roll) rolls.push({ label: mechanical.spellResult.savingThrowResult.ability + ' Saving Throw', roll: mechanical.spellResult.savingThrowResult.roll, total: mechanical.spellResult.savingThrowResult.roll.total, kind: 'SAVE' });
    const damage = Number(mechanical.totalDamage || mechanical.spellResult?.damageInflicted || 0);
    const first = mechanical.instances?.[0];
    const succeeded = Boolean(first?.hits || mechanical.spellResult?.attackResult?.hits || (mechanical.spellResult?.savingThrowResult && !mechanical.spellResult.savingThrowResult.succeeds));
    const mechanicalSummary = label + ': ' + (succeeded ? 'resolved successfully' : 'did not overcome the target defense') + (damage > 0 ? ' for ' + damage + ' damage.' : '.');
    const narration = await this.generateNarration({
      storyId: params.storyId,
      actionText: params.actionText,
      mechanicalSummary,
      targetName: updatedTarget.name,
      targetHp: updatedTarget.hpCurrent,
      repository: params.repository,
    });
    const resolution: CombatNarrativeResolution = {
      id: deterministicId('combat_precombat_resolution', params.storyId, params.actorId, params.targetId, params.actionText, combat.getCurrentRound(), combat.getDiceEngine().getRollCounter()),
      actorId: params.actorId,
      targetIds: [params.targetId],
      actionText: params.actionText,
      actionLabel: label,
      rolls,
      success: true,
      hits: first?.hits ?? mechanical.spellResult?.attackResult?.hits,
      damage,
      targetHp: [{ targetId: params.targetId, hpCurrent: updatedTarget.hpCurrent, hpMax: updatedTarget.hpMax, targetDied: updatedTarget.isDead }],
      mechanicalSummary,
      narrativeResponse: narration,
      canonicalEventIds: mechanical.canonicalEventIds || [],
      createdAt: formatCanonicalTimestamp(params.repository.getWorldClock(params.storyId).getTimestamp()),
    };
    combat.setLastResolution(resolution);
    combat.setCombatPhase('INITIATIVE_PENDING', { banner: 'Combat initiated. The opening action has resolved. Roll for initiative.' });
    const transition: CombatTransitionState = {
      started: true,
      phase: 'INITIATIVE_PENDING',
      narrativeLeadIn: 'Combat initiated. The opening action has resolved before initiative.',
      requiresInitiativeRoll: true,
      fromStory: true,
      precombatResolution: resolution,
      combatState: combat.projectCombatForActor(params.actorId, params.repository.getCombatPerceptionOptions(params.storyId, params.actorId)),
    };
    return { success: true, resolution, transition };
  }

  private async generateNarration(params: { storyId: string; actionText: string; mechanicalSummary: string; targetName: string; targetHp: number; repository: WorldRepository }): Promise<string> {
    try {
      const generated = await params.repository.getAiOrchestrator().generateNarrativeOnly({
        storyId: params.storyId,
        playerAction: params.actionText,
        committedOutcome: params.mechanicalSummary + ' ' + params.targetName + ' has ' + params.targetHp + ' HP remaining.',
        continuationDirective: 'This is a pre-combat opening action. Narrate the already-resolved result. Do not roll again and do not start initiative in the prose.',
      });
      if (generated.success && generated.turnPackage?.narrative?.length) return generated.turnPackage.narrative.join('\n\n').trim();
    } catch {
      // Deterministic fallback below.
    }
    return params.mechanicalSummary + ' ' + params.targetName + ' has ' + params.targetHp + ' HP remaining. Combat is now initiated; roll for initiative.';
  }
}

export const combatEncounterService = new CombatEncounterService();