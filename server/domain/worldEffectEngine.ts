import type { WorldRepository } from '../repositories/worldRepository';
import type { CombatEffectDefinition, CombatEffectScale, CombatOutcomeType } from '../../src/types';
import type { EvidenceCategory, EvidenceVisibility } from './historicalEvidence';

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

interface WorldEffectProjectionPayload {
  geography?: {
    nodes?: Array<{ id: string; accessible?: boolean; discovered?: boolean; description?: string; ambientSensory?: string }>;
    edges?: Array<{ id: string; isBlocked: boolean; blockReason?: string }>;
  };
  storyThreads?: Array<{ threadId: string; status?: string; stage?: number; locationId?: string; description?: string; evidenceItems?: string[]; evidenceGathered?: string[] }>;
  plannedEvents?: Array<{ eventId: string; status?: string; description?: string; locationId?: string; participatingActors?: string[]; plannedConsequences?: string[] }>;
  livingWorld?: {
    physiologies?: Array<{ entityId: string; set?: Record<string, number>; delta?: Record<string, number> }>;
    scheduledEvents?: Array<Record<string, unknown>>;
  };
  chronicleEvidence?: { category?: EvidenceCategory; primarySubjectId?: string; secondarySubjectId?: string; locationId?: string; summary: string; details: string; visibility?: EvidenceVisibility; provenance?: string; confidentialToEntityIds?: string[] };
}

function validateProjectionPayload(raw: unknown): { success: boolean; errorReason?: string; projection?: WorldEffectProjectionPayload } {
  if (raw === undefined) return { success: true, projection: {} };
  if (!raw || typeof raw !== 'object') return { success: false, errorReason: 'worldProjection must be an object.' };
  const projection = raw as WorldEffectProjectionPayload;
  if (projection.geography?.nodes) {
    if (!Array.isArray(projection.geography.nodes) || projection.geography.nodes.length > 50) return { success: false, errorReason: 'worldProjection.geography.nodes must contain at most 50 entries.' };
    for (const node of projection.geography.nodes) {
      if (!node || typeof node.id !== 'string' || !node.id.trim()) return { success: false, errorReason: 'Each geography node patch requires a non-empty id.' };
      if (node.accessible !== undefined && typeof node.accessible !== 'boolean') return { success: false, errorReason: 'Geography accessible must be boolean.' };
      if (node.discovered !== undefined && typeof node.discovered !== 'boolean') return { success: false, errorReason: 'Geography discovered must be boolean.' };
    }
  }
  if (projection.geography?.edges) {
    if (!Array.isArray(projection.geography.edges) || projection.geography.edges.length > 50) return { success: false, errorReason: 'worldProjection.geography.edges must contain at most 50 entries.' };
    for (const edge of projection.geography.edges) {
      if (!edge || typeof edge.id !== 'string' || !edge.id.trim() || typeof edge.isBlocked !== 'boolean') return { success: false, errorReason: 'Each geography edge patch requires id and boolean isBlocked.' };
    }
  }
  if (projection.storyThreads) {
    if (!Array.isArray(projection.storyThreads) || projection.storyThreads.length > 50) return { success: false, errorReason: 'storyThreads projection must contain at most 50 entries.' };
    for (const thread of projection.storyThreads) {
      if (!thread || typeof thread.threadId !== 'string' || !thread.threadId.trim()) return { success: false, errorReason: 'Each story thread patch requires threadId.' };
      if (thread.stage !== undefined && (!Number.isFinite(thread.stage) || thread.stage < 0)) return { success: false, errorReason: 'Story thread stage must be a finite non-negative number.' };
    }
  }
  if (projection.plannedEvents) {
    if (!Array.isArray(projection.plannedEvents) || projection.plannedEvents.length > 50) return { success: false, errorReason: 'plannedEvents projection must contain at most 50 entries.' };
    for (const event of projection.plannedEvents) {
      if (!event || typeof event.eventId !== 'string' || !event.eventId.trim()) return { success: false, errorReason: 'Each planned-event patch requires eventId.' };
    }
  }
  if (projection.livingWorld?.physiologies) {
    if (!Array.isArray(projection.livingWorld.physiologies) || projection.livingWorld.physiologies.length > 50) return { success: false, errorReason: 'livingWorld physiologies projection must contain at most 50 entries.' };
    for (const change of projection.livingWorld.physiologies) {
      if (!change || typeof change.entityId !== 'string' || !change.entityId.trim()) return { success: false, errorReason: 'Each physiology patch requires entityId.' };
      for (const values of [change.set, change.delta]) {
        if (values) for (const [key, value] of Object.entries(values)) {
          if (!['hunger', 'thirst', 'fatigue', 'pain', 'stress', 'morale'].includes(key) || !Number.isFinite(value)) return { success: false, errorReason: 'Unsupported or non-finite living-world physiology field.' };
        }
      }
    }
  }
  if (projection.livingWorld?.scheduledEvents && projection.livingWorld.scheduledEvents.length > 20) return { success: false, errorReason: 'At most 20 scheduled living-world events may be projected by one effect.' };
  if (projection.chronicleEvidence) {
    if (!projection.chronicleEvidence.summary?.trim() || !projection.chronicleEvidence.details?.trim()) return { success: false, errorReason: 'chronicleEvidence requires summary and details.' };
    if (projection.chronicleEvidence.confidentialToEntityIds && projection.chronicleEvidence.confidentialToEntityIds.length > 50) return { success: false, errorReason: 'chronicleEvidence confidential audience is too large.' };
  }
  return { success: true, projection };
}
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
    if (definition.outcome === 'ENVIRONMENT_DAMAGED' || definition.outcome === 'ENVIRONMENT_DESTROYED') {
      const destructibleId = String(definition.outcomePayload?.destructibleId || '').trim();
      const amount = Number(definition.outcomePayload?.amount ?? definition.outcomePayload?.damage ?? 0);
      if (!destructibleId) return { success: false, errorReason: 'Environment outcomes require destructibleId.' };
      if (!Number.isFinite(amount) || amount < 0) return { success: false, errorReason: 'Environment outcomes require a finite non-negative amount.' };
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

    const projectionValidation = validateProjectionPayload(definition.outcomePayload?.worldProjection);
    if (!projectionValidation.success) {
      return {
        success: false,
        errorReason: projectionValidation.errorReason,
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

    if (definition.outcome === 'ENVIRONMENT_DAMAGED' || definition.outcome === 'ENVIRONMENT_DESTROYED') {
      const destructibleId = String(definition.outcomePayload?.destructibleId || '').trim();
      const amount = Math.max(0, Number(definition.outcomePayload?.amount ?? definition.outcomePayload?.damage ?? 0) || 0);
      const damageType = String(definition.outcomePayload?.damageType || definition.damageType || 'custom');
      const environmentResult = combat.damageDestructibleObject(destructibleId, amount, damageType);
      if (!environmentResult.success) {
        return {
          success: false,
          errorReason: environmentResult.errorReason,
          effectId: definition.id,
          affectedEntityIds: [],
          changedScopes: [],
        };
      }
      if (
        definition.outcome === 'ENVIRONMENT_DESTROYED' &&
        !environmentResult.destroyed &&
        !environmentResult.wasDestroyed
      ) {
        return {
          success: false,
          errorReason: 'Environment destruction outcome did not destroy the targeted object.',
          effectId: definition.id,
          affectedEntityIds: [],
          changedScopes: [],
        };
      }
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

    const projection = projectionValidation.projection || {};
    const projectionChangedScopes: string[] = [];

    if (projection.geography) {
      const geography = repository.getGeographyGraph(storyId);
      for (const nodePatch of projection.geography.nodes || []) {
        const result = geography.patchNode(nodePatch.id, nodePatch);
        if (!result.success) return { success: false, errorReason: result.errorReason, effectId: definition.id, affectedEntityIds, changedScopes: projectionChangedScopes };
        projectionChangedScopes.push('WORLD_NODE:' + nodePatch.id);
      }
      for (const edgePatch of projection.geography.edges || []) {
        const result = geography.patchEdge(edgePatch.id, edgePatch);
        if (!result.success) return { success: false, errorReason: result.errorReason, effectId: definition.id, affectedEntityIds, changedScopes: projectionChangedScopes };
        projectionChangedScopes.push('WORLD_EDGE:' + edgePatch.id);
      }
    }

    if (projection.storyThreads) {
      for (const patch of projection.storyThreads) {
        const existing = repository.getStoryThreads(storyId).find((thread: any) => thread.threadId === patch.threadId);
        if (!existing) return { success: false, errorReason: "Story thread '" + patch.threadId + "' does not exist in the canonical story-thread registry.", effectId: definition.id, affectedEntityIds, changedScopes: projectionChangedScopes };
        repository.saveStoryThread({
          ...existing,
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.stage !== undefined ? { stage: Math.trunc(patch.stage) } : {}),
          ...(patch.locationId !== undefined ? { locationId: patch.locationId } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.evidenceItems !== undefined ? { evidenceItems: [...patch.evidenceItems] } : {}),
          ...(patch.evidenceGathered !== undefined ? { evidenceGathered: [...patch.evidenceGathered] } : {}),
          updatedAt: new Date().toISOString(),
        });
        projectionChangedScopes.push('STORY_THREAD:' + patch.threadId);
      }
    }

    if (projection.plannedEvents) {
      const run = repository.getStoryRun(storyId);
      if (!run) return { success: false, errorReason: 'Canonical story run is unavailable for planned-event projection.', effectId: definition.id, affectedEntityIds, changedScopes: projectionChangedScopes };
      const plannedEvents = Array.isArray(run.plannedEvents) ? [...run.plannedEvents] : [];
      const eventStates = { ...(run.eventStates || {}) };
      for (const patch of projection.plannedEvents) {
        const index = plannedEvents.findIndex((event: any) => event?.id === patch.eventId);
        if (index < 0) return { success: false, errorReason: "Planned event '" + patch.eventId + "' does not exist in the canonical story timeline.", effectId: definition.id, affectedEntityIds, changedScopes: projectionChangedScopes };
        const existing = plannedEvents[index];
        plannedEvents[index] = {
          ...existing,
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.locationId !== undefined ? { locationId: patch.locationId } : {}),
          ...(patch.participatingActors !== undefined ? { participatingActors: [...patch.participatingActors] } : {}),
          ...(patch.plannedConsequences !== undefined ? { plannedConsequences: [...patch.plannedConsequences] } : {}),
        };
        eventStates[patch.eventId] = { ...(eventStates[patch.eventId] || {}), id: patch.eventId, status: patch.status || existing.status || 'PLANNED' };
        projectionChangedScopes.push('PLANNED_EVENT:' + patch.eventId);
      }
      repository.saveStoryRun({ ...run, plannedEvents, eventStates });
    }

    if (projection.livingWorld) {
      const livingWorld = repository.getLivingWorldSimulation(storyId);
      for (const change of projection.livingWorld.physiologies || []) {
        const result = livingWorld.patchEntityPhysiology({ entityId: change.entityId, set: change.set as any, delta: change.delta as any });
        if (!result.success) return { success: false, errorReason: result.errorReason, effectId: definition.id, affectedEntityIds, changedScopes: projectionChangedScopes };
        projectionChangedScopes.push('LIVING_PHYSIOLOGY:' + change.entityId);
      }
      for (const event of projection.livingWorld.scheduledEvents || []) {
        if (!event || typeof event.id !== 'string' || !event.id.trim() || typeof event.kind !== 'string' || typeof event.name !== 'string' || typeof event.locationId !== 'string' || !event.triggerTimestamp || typeof event.triggerTimestamp.totalElapsedSeconds !== 'number') {
          return { success: false, errorReason: 'Scheduled living-world event has invalid canonical fields.', effectId: definition.id, affectedEntityIds, changedScopes: projectionChangedScopes };
        }
        livingWorld.scheduleEvent(event as any);
        projectionChangedScopes.push('LIVING_EVENT:' + event.id);
      }
    }

    if (projection.chronicleEvidence) {
      const evidence = projection.chronicleEvidence;
      const fallbackLocation = repository.getGeographyGraph(storyId).getAllNodes()[0]?.id || storyId;
      repository.getHistoricalChronicleEngine(storyId).recordEvidence({
        id: 'world_effect_evidence_' + storyId + '_' + definition.id + '_' + projectionChangedScopes.length,
        category: evidence.category || 'WORLD_ANOMALY',
        timestamp: repository.getWorldClock(storyId).getTimestamp(),
        primarySubjectId: evidence.primarySubjectId || actorId,
        secondarySubjectId: evidence.secondarySubjectId,
        locationId: evidence.locationId || repository.getCurrentLocation(storyId) || fallbackLocation,
        summary: evidence.summary,
        details: evidence.details,
        sourceEventId: definition.id,
        provenance: evidence.provenance || 'canonical_world_effect',
        visibility: evidence.visibility || 'PUBLIC',
        confidentialToEntityIds: evidence.confidentialToEntityIds,
        rawStateSnapshot: { changedScopes: [...projectionChangedScopes], outcome: definition.outcome, scale: definition.scale },
      });
      projectionChangedScopes.push('CHRONICLE:' + definition.id);
    }

    changedScopes.push(...projectionChangedScopes);
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
      destructibleId:
        definition.outcome === 'ENVIRONMENT_DAMAGED' || definition.outcome === 'ENVIRONMENT_DESTROYED'
          ? String(definition.outcomePayload?.destructibleId || '')
          : undefined,
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
