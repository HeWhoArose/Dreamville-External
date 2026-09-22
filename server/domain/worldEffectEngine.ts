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
    if (!validation.success) {
      return { success: false, errorReason: validation.errorReason, effectId: definition.id, affectedEntityIds: [], changedScopes: [] };
    }
    const combat = repository.getCombatEngine(storyId);
    const actionUse = combat.consumeCombatAction(actorId, definition.actionCost || 'ACTION');
    if (!actionUse.success) {
      return {
        success: false,
        errorReason: actionUse.errorReason,
        effectId: definition.id,
        affectedEntityIds: [],
        changedScopes: [],
      };
    }

    if (!params.authorityVerified) {
      return {
        success: false,
        errorReason: 'World effect authority was not verified by the canonical capability/command layer.',
        effectId: definition.id,
        affectedEntityIds: [],
        changedScopes: [],
      };
    }

    const combat = repository.getCombatEngine(storyId);
    const affectedEntityIds: string[] = [];
    const semanticMetadata: Record<string, unknown>[] = [];
    for (const targetId of Array.from(new Set(targetIds.filter(Boolean)))) {
      const combatResult = combat.applySemanticOutcome(targetId, definition.outcome!, definition.outcomePayload || {}, actorId);
      if (combatResult.success) {
        if (!affectedEntityIds.includes(targetId)) affectedEntityIds.push(targetId);
        if (combatResult.metadata) semanticMetadata.push({ targetId, ...combatResult.metadata });
      }

      const card = repository.getEntityCard(storyId, targetId);
      if (!card) continue;

      const metadata = { ...(card.metadata || {}) };
      if (definition.outcome === 'TRANSFORMED') {
        metadata.transformation = definition.outcomePayload?.transformation ?? definition.outcomePayload?.form ?? true;
      }
      if (definition.outcome === 'SEALED') {
        metadata.sealed = true;
      }
      if (definition.outcome === 'RESOURCE_GRANTED' || definition.outcome === 'RESOURCE_REMOVED') {
        metadata.resources = {
          ...((metadata.resources || {}) as Record<string, unknown>),
          [String(definition.outcomePayload?.resource || 'generic')]: {
            operation: definition.outcome,
            amount: definition.outcomePayload?.amount ?? 0,
          },
        };
      }

      const nextCard: any = {
        ...card,
        metadata,
      };
      const position = definition.outcome === 'TELEPORTED' ? definition.outcomePayload?.targetPosition : undefined;
      if (position && typeof position === 'object') {
        nextCard.metadata = {
          ...metadata,
          lastTeleport: position,
        };
      }
      repository.saveEntityCard(storyId, nextCard);

      if (definition.outcome === 'ERASE_FROM_WORLD' || definition.outcome === 'INSTANT_DEFEAT') {
        repository.setEntityLifecycleStatus(storyId, targetId, 'DEAD');
      } else if (definition.outcome === 'BANISHED' || definition.outcome === 'WORLD_STATE_CHANGED') {
        repository.setEntityLifecycleStatus(storyId, targetId, 'DORMANT');
      }
    }

    const scopeKey = definition.scale + ':' + definition.id;
    const changedScopes = [scopeKey];
    const sequence = repository.getActiveEffects(storyId).length + 1;
    const worldEventId = 'world_effect_' + storyId + '_' + definition.id + '_' + sequence;
    const macroConsequence = {
      scale: definition.scale,
      outcome: definition.outcome,
      targetIds: [...targetIds],
      affectedEntityIds: [...affectedEntityIds],
      semanticMetadata,
      scope: scopeKey,
      abstraction: ['PERSON', 'GROUP', 'ENCOUNTER'].includes(definition.scale) ? 'TACTICAL' : 'MACRO',
    };

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
      macroConsequence,
      description: definition.outcomeReason || definition.name + ' resolved at ' + definition.scale + ' scale.',
      persistent: false,
      presentationOnly: false,
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
      macroConsequence,
      canonical: true,
    });

    return {
      success: true,
      effectId: definition.id,
      outcome: definition.outcome,
      affectedEntityIds,
      changedScopes,
      worldEventId,
      activeEffect: effectRecord,
    };
  }
}

export const worldEffectEngine = new WorldEffectEngine();
