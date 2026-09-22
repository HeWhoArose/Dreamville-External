import type { WorldRepository } from '../repositories/worldRepository';
import type { CombatEffectDefinition, CombatEffectScale, CombatOutcomeType } from '../../src/types';

export interface WorldEffectResolution {
  success: boolean;
  errorReason?: string;
  effectId: string;
  outcome?: CombatOutcomeType;
  affectedEntityIds: string[];
  changedScopes: string[];
  worldEventId?: string;
  activeEffect?: Record<string, unknown>;
}

const SCALE_ORDER: CombatEffectScale[] = ['PERSON','GROUP','ENCOUNTER','STRUCTURE','DISTRICT','CITY','REGION','CONTINENT','PLANET','COSMIC'];

export class WorldEffectEngine {
  public validate(definition: CombatEffectDefinition): { success: boolean; errorReason?: string } {
    if (!definition?.id?.trim()) return { success: false, errorReason: 'World effect requires an id.' };
    if (!['OUTCOME','WORLD_EFFECT'].includes(definition.resolutionMode)) return { success: false, errorReason: 'Definition is not a world/outcome effect.' };
    if (!definition.outcome) return { success: false, errorReason: 'World effect requires an outcome.' };
    if (!SCALE_ORDER.includes(definition.scale)) return { success: false, errorReason: 'World effect has an unsupported scale.' };
    return { success: true };
  }

  public apply(params: {
    repository: WorldRepository;
    storyId: string;
    actorId: string;
    definition: CombatEffectDefinition;
    targetIds?: string[];
    authorityVerified: boolean;
  }): WorldEffectResolution {
    const { repository, storyId, actorId, definition, targetIds = [] } = params;
    const validation = this.validate(definition);
    if (!validation.success) return { success: false, errorReason: validation.errorReason, effectId: definition.id, affectedEntityIds: [], changedScopes: [] };
    if (!params.authorityVerified) return { success: false, errorReason: 'World effect authority was not verified by the canonical capability/command layer.', effectId: definition.id, affectedEntityIds: [], changedScopes: [] };

    const combat = repository.getCombatEngine(storyId);
    const changedScopes = [definition.scale];
    const affectedEntityIds: string[] = [];
    for (const targetId of targetIds) {
      const participant = combat.getParticipant(targetId);
      if (participant) {
        participant.hpCurrent = 0;
        participant.isDead = true;
        if (!participant.conditions.includes('Dead')) participant.conditions.push('Dead');
        affectedEntityIds.push(targetId);
        continue;
      }
      const card = repository.getEntityCard(storyId, targetId);
      if (card) {
        repository.setEntityLifecycleStatus(storyId, targetId, 'DESTROYED');
        affectedEntityIds.push(targetId);
      }
    }

    const worldEventId = `world_effect_${storyId}_${definition.id}_${repository.getWorldClock(storyId).getTimestamp().totalElapsedSeconds}_${repository.getActiveEffects(storyId).length}`;
    const effectRecord = {
      id: worldEventId,
      storyId,
      actorId,
      effectId: definition.id,
      name: definition.name,
      outcome: definition.outcome,
      scale: definition.scale,
      targetIds: [...targetIds],
      affectedEntityIds: [...affectedEntityIds],
      changedScopes: [...changedScopes],
      description: definition.outcomeReason || `${definition.name} resolved at ${definition.scale} scale.`,
      persistent: false,
      resolvedAt: repository.getWorldClock(storyId).getTimestamp(),
    };
    repository.saveActiveEffect(effectRecord);
    repository.saveWorldFact(storyId, {
      id: worldEventId,
      category: 'WORLD_EFFECT',
      type: definition.outcome,
      scale: definition.scale,
      actorId,
      targetIds: [...targetIds],
      affectedEntityIds: [...affectedEntityIds],
      canonical: true,
    });

    return { success: true, effectId: definition.id, outcome: definition.outcome, affectedEntityIds, changedScopes, worldEventId, activeEffect: effectRecord };
  }
}

export const worldEffectEngine = new WorldEffectEngine();
