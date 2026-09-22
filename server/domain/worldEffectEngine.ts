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

const SCALE_ORDER: CombatEffectScale[] = [
  'PERSON',
  'GROUP',
  'ENCOUNTER',
  'STRUCTURE',
  'DISTRICT',
  'CITY',
  'REGION',
  'CONTINENT',
  'PLANET',
  'COSMIC',
];

export class WorldEffectEngine {
  public validate(definition: CombatEffectDefinition): { success: boolean; errorReason?: string } {
    if (!definition?.id?.trim()) return { success: false, errorReason: 'World effect requires an id.' };
    if (!['OUTCOME', 'WORLD_EFFECT'].includes(definition.resolutionMode)) {
      return { success: false, errorReason: 'Definition is not a world/outcome effect.' };
    }
    if (!definition.outcome) return { success: false, errorReason: 'World effect requires an outcome.' };
    if (!SCALE_ORDER.includes(definition.scale)) {
      return { success: false, errorReason: 'World effect has an unsupported scale.' };
    }
    if (definition.outcome === 'RESOURCE_GRANTED' || definition.outcome === 'RESOURCE_REMOVED') {
      const resource = String(definition.outcomePayload?.resource || '').trim();
      const amount = Number(definition.outcomePayload?.amount ?? 0);
      if (!resource) return { success: false, errorReason: 'Resource outcomes require a non-empty resource name.' };
      if (!Number.isFinite(amount) || amount < 0) return { success: false, errorReason: 'Resource outcomes require a non-negative finite amount.' };
    }
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
      return {
        success: false,
        errorReason: validation.errorReason,
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
    const normalizedTargetIds = Array.from(new Set(targetIds.filter(Boolean)));

    for (const targetId of normalizedTargetIds) {
      if (!combat.getParticipant(targetId)) {
        return {
          success: false,
          errorReason: `Target '${targetId}' is not present in the canonical combat state.`,
          effectId: definition.id,
          affectedEntityIds: [],
          changedScopes: [],
        };
      }
    }

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

    const affectedEntityIds: string[] = [];
    const semanticMetadata: Record<string, unknown>[] = [];

    for (const targetId of normalizedTargetIds) {
      const combatResult = combat.applySemanticOutcome(
        targetId,
        definition.outcome!,
        definition.outcomePayload || {},
        actorId,
      );

      if (combatResult.success) {
        if (!affectedEntityIds.includes(targetId)) affectedEntityIds.push(targetId);
        if (combatResult.metadata) semanticMetadata.push({ targetId, ...combatResult.metadata });
      }

      if (
        combatResult.success &&
        definition.outcome === 'SUMMONED' &&
        typeof combatResult.metadata?.summonedId === 'string'
      ) {
        const summonedId = String(combatResult.metadata.summonedId);
        const rawParticipant =
          definition.outcomePayload?.participant &&
          typeof definition.outcomePayload.participant === 'object'
            ? definition.outcomePayload.participant as Record<string, unknown>
            : {};

        repository.getEntityRegistry(storyId).upsert({
          id: summonedId,
          name: String(rawParticipant.name || summonedId),
          kind: 'CREATURE',
          isTemplate: false,
          classification: {
            role: 'Summoned Entity',
            tags: ['summoned'],
          },
          coreStats: {
            hpCurrent: typeof rawParticipant.hpCurrent === 'number' ? rawParticipant.hpCurrent : undefined,
            hpMax: typeof rawParticipant.hpMax === 'number' ? rawParticipant.hpMax : undefined,
            armorClass: typeof rawParticipant.armorClass === 'number' ? rawParticipant.armorClass : undefined,
            speed: typeof rawParticipant.speedCells === 'number' ? rawParticipant.speedCells : undefined,
            abilityScores: {},
          },
          behavior: {
            defaultBehavior: 'Follow summoner intent.',
            combatBehavior:
              typeof rawParticipant.combatBehavior === 'string'
                ? rawParticipant.combatBehavior
                : 'Act according to canonical summoned-entity rules.',
            priorities: [],
            routines: [],
          },
          worldState: {
            isAlive: true,
            presence: 'present',
            locationId: typeof rawParticipant.locationId === 'string' ? rawParticipant.locationId : undefined,
          },
          capabilities: Array.isArray(rawParticipant.capabilities)
            ? rawParticipant.capabilities as Array<Record<string, unknown>>
            : [],
          feats: [],
          equipment: [],
          traits: ['SUMMONED'],
          memoryRefs: [],
          provenance: {
            source: 'COMBAT_SUMMON',
            createdBy: 'SYSTEM',
            sourceEventId: String(combatResult.metadata.eventId || definition.id),
            confidence: 1,
          },
          lifecycle: {
            status: 'ACTIVE',
          },
          metadata: {
            summonedBy: actorId,
            sourceEffectId: definition.id,
          },
        });
      }

      const card = repository.getEntityCard(storyId, targetId);
      if (!card) continue;

      const metadata = { ...(card.metadata || {}) };

      if (definition.outcome === 'TRANSFORMED') {
        metadata.transformation =
          definition.outcomePayload?.transformation ??
          definition.outcomePayload?.form ??
          true;
      }

      if (definition.outcome === 'SEALED') {
        metadata.sealed = true;
      }

      if (definition.outcome === 'RESOURCE_GRANTED' || definition.outcome === 'RESOURCE_REMOVED') {
        const resourceName = String(definition.outcomePayload?.resource || '').trim();
        const requestedAmount = Number(definition.outcomePayload?.amount ?? 0);
        const targetParticipant = combat.getParticipant(targetId);
        const combatResources = targetParticipant?.combatResources || {};
        const previousAmount = Math.max(0, Number(combatResources[resourceName] || 0));
        const nextAmount =
          definition.outcome === 'RESOURCE_GRANTED'
            ? previousAmount + requestedAmount
            : Math.max(0, previousAmount - requestedAmount);

        metadata.resources = {
          ...((metadata.resources || {}) as Record<string, unknown>),
          [resourceName]: {
            operation: definition.outcome,
            requestedAmount,
            previousAmount,
            newAmount: nextAmount,
          },
        };
      }

      if (definition.outcome === 'RESOURCE_GRANTED' || definition.outcome === 'RESOURCE_REMOVED') {
        const authoritativeParticipant = combat.getParticipant(targetId);
        metadata.combatResources = {
          ...(authoritativeParticipant?.combatResources || {}),
        };
      }

            const position =
        definition.outcome === 'TELEPORTED'
          ? definition.outcomePayload?.targetPosition
          : undefined;

      if (position && typeof position === 'object') {
        metadata.lastTeleport = position;
      }

      repository.saveEntityCard(storyId, {
        ...card,
        metadata,
      });

      if (definition.outcome === 'ERASE_FROM_WORLD' || definition.outcome === 'INSTANT_DEFEAT') {
        repository.setEntityLifecycleStatus(storyId, targetId, 'DEAD');
      } else if (
        definition.outcome === 'BANISHED' ||
        definition.outcome === 'WORLD_STATE_CHANGED'
      ) {
        repository.setEntityLifecycleStatus(storyId, targetId, 'DORMANT');
      }
    }

    const requestedScopeIds = Array.isArray(definition.outcomePayload?.scopeIds)
      ? definition.outcomePayload.scopeIds.map(String)
      : typeof definition.outcomePayload?.scopeId === 'string'
        ? [String(definition.outcomePayload.scopeId)]
        : [];

    const knownWorldNodeIds = new Set(
      repository.getGeographyGraph(storyId)
        .getAllNodes()
        .map((node: any) => String(node.id)),
    );

    const affectedWorldNodeIds = requestedScopeIds.filter((scopeId) =>
      knownWorldNodeIds.has(scopeId),
    );

    const scopeKey = definition.scale + ':' + definition.id;
    const changedScopes = [
      scopeKey,
      ...affectedWorldNodeIds.map((nodeId) => 'WORLD_NODE:' + nodeId),
      ...affectedEntityIds.map((entityId) => 'ENTITY:' + entityId),
    ];
    const sequence = repository.getActiveEffects(storyId).length + 1;
    const worldEventId =
      'world_effect_' + storyId + '_' + definition.id + '_' + sequence;

    const macroConsequence = {
      scale: definition.scale,
      outcome: definition.outcome,
      targetIds: [...normalizedTargetIds],
      affectedEntityIds: [...affectedEntityIds],
      semanticMetadata,
      affectedWorldNodeIds,
      scope: scopeKey,
      abstraction: ['PERSON', 'GROUP', 'ENCOUNTER'].includes(definition.scale)
        ? 'TACTICAL'
        : 'MACRO',
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
      affectedWorldNodeIds,
      description:
        definition.outcomeReason ||
        definition.name + ' resolved at ' + definition.scale + ' scale.',
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
