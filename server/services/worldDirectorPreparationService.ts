import { createHash } from 'node:crypto';

import { canonicalCommandEngine } from '../domain/canonicalCommandEngine';
import {
  buildWorldDirectorStableRecordId,
  evaluateWorldDirectorLifecycleTransition,
  planWorldDirectorOwnedRecord,
  worldDirectorOwnershipAdapters,
  WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION,
  WORLD_DIRECTOR_INVESTIGATION_EVENT_CATEGORY,
  WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES,
} from '../domain/worldDirectorPreparationContract';
import type { InMemoryWorldRepository, WorldRepository } from '../repositories/worldRepository';
import type { WorldDirectorInvestigationSeed } from '../../src/types';

export interface WorldDirectorPreparationIssue {
  code: 'SCENARIO_INVALID' | 'SOURCE_REFERENCE_INVALID' | 'LOCATION_MISSING' | 'OWNER_CONFLICT' | 'COMMIT_FAILED';
  message: string;
  recordRef?: string;
}

export interface WorldDirectorPreparationResult {
  status: 'NOT_REQUESTED' | 'PREPARED' | 'ALREADY_PREPARED' | 'BLOCKED';
  preparationKey?: string;
  sourceRef?: string;
  canonicalChanges: string[];
  recordRefs?: { incident: string; victim: string; body: string; evidence: string[] };
  issues: WorldDirectorPreparationIssue[];
}

function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateSeed(value: unknown): value is WorldDirectorInvestigationSeed {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const seed = value as Partial<WorldDirectorInvestigationSeed>;
  if (seed.schemaVersion !== 1 || seed.profile !== 'INVESTIGATION' || !isNonEmpty(seed.preparationKey) || !isNonEmpty(seed.sourceRef)
    || seed.claimKind !== 'AUTHORED_TRUTH' || !seed.victim || !isNonEmpty(seed.victim.name)
    || !seed.body || !isNonEmpty(seed.body.name)
    || typeof seed.body.visible !== 'boolean' || typeof seed.body.discoverable !== 'boolean'
    || (!seed.body.visible && !seed.body.discoverable)
    || !Array.isArray(seed.evidence) || seed.evidence.length === 0 || seed.evidence.length > 8) return false;
  const slots = new Set<string>();
  for (const anchor of seed.evidence) {
    if (!anchor || !isNonEmpty(anchor.slot) || !isNonEmpty(anchor.name)
      || typeof anchor.visible !== 'boolean' || typeof anchor.discoverable !== 'boolean'
      || (!anchor.visible && !anchor.discoverable) || slots.has(anchor.slot.trim())) return false;
    slots.add(anchor.slot.trim());
  }
  return Array.isArray(seed.unresolvedQuestions || []);
}

function sourceRefForRun(run: any): string | undefined {
  const characterId = run?.protagonist?.characterId || run?.characterId || run?.protagonist?.id;
  return isNonEmpty(characterId) ? `${characterId}:startingSituation` : undefined;
}

function ownershipMarker(preparationKey: string, role: string) {
  return { contractVersion: WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION, preparationKey, role };
}

function blocked(
  code: WorldDirectorPreparationIssue['code'],
  message: string,
  preparationKey?: string,
  sourceRef?: string,
  recordRef?: string,
): WorldDirectorPreparationResult {
  return {
    status: 'BLOCKED',
    preparationKey,
    sourceRef,
    canonicalChanges: [],
    issues: [{ code, message, ...(recordRef ? { recordRef } : {}) }],
  };
}

/**
 * Materializes only an explicitly structured, confirmed investigation seed.
 * Prose classification remains diagnostic and never authorizes a write.
 */
export class WorldDirectorPreparationService {
  public static async prepareOpeningInvestigation(
    repository: WorldRepository,
    storyId: string,
    locationId: string,
  ): Promise<WorldDirectorPreparationResult> {
    const run = repository.getStoryRun(storyId);
    const seed = run?.startingSituation?.worldDirectorInvestigation;
    if (seed === undefined) {
      return { status: 'NOT_REQUESTED', canonicalChanges: [], issues: [] };
    }
    if (!validateSeed(seed)) {
      return blocked('SCENARIO_INVALID', 'The confirmed investigation seed is malformed or lacks visible/discoverable physical anchors.');
    }
    const expectedSourceRef = sourceRefForRun(run);
    if (!expectedSourceRef || seed.sourceRef !== expectedSourceRef) {
      return blocked('SOURCE_REFERENCE_INVALID', 'The investigation seed must cite this StoryRun’s confirmed starting situation.', seed.preparationKey, seed.sourceRef);
    }
    const graphLocation = repository.getGeographyGraph(storyId).getNode(locationId);
    if (!graphLocation) {
      return blocked('LOCATION_MISSING', 'The canonical opening location does not exist in GeographyGraph.', seed.preparationKey, seed.sourceRef, locationId);
    }

    const preparationKey = seed.preparationKey.trim();
    const scenarioFingerprint = createHash('sha256').update(stableJson(seed)).digest('hex');
    const incidentId = buildWorldDirectorStableRecordId({ storyId, preparationKey, recordKind: 'CANONICAL_EVENT', role: 'INVESTIGATION_INCIDENT', scopeId: locationId });
    const victimId = buildWorldDirectorStableRecordId({ storyId, preparationKey, recordKind: 'ENTITY', role: 'INVESTIGATION_VICTIM', scopeId: locationId });
    const bodyId = buildWorldDirectorStableRecordId({ storyId, preparationKey, recordKind: 'SCENE_OBJECT', role: 'INVESTIGATION_BODY', scopeId: locationId });
    const evidenceIds = seed.evidence.map((anchor) => buildWorldDirectorStableRecordId({
      storyId,
      preparationKey,
      recordKind: 'SCENE_OBJECT',
      role: `INVESTIGATION_EVIDENCE:${anchor.slot.trim()}`,
      scopeId: locationId,
    }));
    const commandId = buildWorldDirectorStableRecordId({ storyId, preparationKey, recordKind: 'CANONICAL_EVENT', role: 'INVESTIGATION_PREPARATION_COMMAND', scopeId: locationId });
    const priorManifest = run?.runtimeState?.worldDirectorPreparations?.[preparationKey];
    const priorCommand = (Array.isArray(run?.canonicalEvents) ? run.canonicalEvents : []).find((event: any) => event?.commandId === commandId);
    if (priorCommand) {
      if (!priorManifest || priorManifest.locationId !== locationId || priorManifest.scenarioFingerprint !== scenarioFingerprint) {
        return blocked('COMMIT_FAILED', 'A prior preparation command exists but its manifest is missing or does not match this scenario revision.', preparationKey, seed.sourceRef, commandId);
      }
      return {
        status: 'ALREADY_PREPARED',
        preparationKey,
        sourceRef: seed.sourceRef,
        canonicalChanges: [],
        recordRefs: priorManifest.recordRefs,
        issues: [],
      };
    }
    const commandResult = await canonicalCommandEngine.execute<any, { recordRefs: WorldDirectorPreparationResult['recordRefs']; canonicalChanges: string[] }>(
      repository as InMemoryWorldRepository,
      {
        commandId,
        storyId,
        actorId: run?.protagonist?.characterId,
        type: 'INTERACT',
        payload: { action: 'WORLD_DIRECTOR_PREPARE_INVESTIGATION', preparationKey, sourceRef: seed.sourceRef, scenarioFingerprint },
        source: 'SYSTEM',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const staged = context.repository;
        const graph = staged.getGeographyGraph(storyId);
        const location = graph.getNode(locationId);
        const stagedRun = staged.getStoryRun(storyId);
        if (!location || !stagedRun) return { success: false, errorReason: 'The canonical location or StoryRun disappeared before preparation.' };

        const markerByRole = {
          incident: ownershipMarker(preparationKey, 'INVESTIGATION_INCIDENT'),
          victim: ownershipMarker(preparationKey, WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.victim),
          body: ownershipMarker(preparationKey, WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.body),
        };
        const plannedEvents = Array.isArray(stagedRun.plannedEvents) ? stagedRun.plannedEvents : [];
        const eventStates = stagedRun.eventStates || {};
        const existingIncident = plannedEvents.find((event: any) => event?.id === incidentId);
        const activeForeignIncidents = plannedEvents.filter((event: any) =>
          event?.category === WORLD_DIRECTOR_INVESTIGATION_EVENT_CATEGORY && event.locationId === locationId
          && event.id !== incidentId && (eventStates[event.id]?.status || event.status) === 'ACTIVE',
        );
        if (activeForeignIncidents.length) {
          return { success: false, errorReason: `OWNER_CONFLICT: another active investigation incident already exists at this location (${activeForeignIncidents.map((event: any) => event.id).join(', ')}).` };
        }
        const eventAdapter = {
          canUpdateExisting: true,
          read: (record: any) => record?.metadata?.worldDirectorOwnership || null,
          withMarker: (record: any, marker: any) => ({ ...record, metadata: { ...(record.metadata || {}), worldDirectorOwnership: marker } }),
        };
        const desiredIncident = {
          id: incidentId,
          title: seed.victim.name ? `Investigation at ${location.name}` : 'Investigation incident',
          description: 'An authored investigation incident is active at this location.',
          category: WORLD_DIRECTOR_INVESTIGATION_EVENT_CATEGORY,
          isQuest: false,
          locationId,
          status: 'ACTIVE',
          visibility: 'PUBLIC',
          participatingActors: [],
          plannedConsequences: [],
          metadata: { sourceRef: seed.sourceRef, worldDirectorOwnership: markerByRole.incident },
        };
        const incidentPlan = planWorldDirectorOwnedRecord(
          existingIncident,
          desiredIncident,
          { recordId: incidentId, preparationKey, role: 'INVESTIGATION_INCIDENT' },
          eventAdapter,
          (existing, desired) => ({ ...desired, ...existing, metadata: { ...(desired.metadata || {}), ...(existing.metadata || {}) } }),
        );
        if (incidentPlan.decision.disposition === 'CONFLICT' || !incidentPlan.record) {
          return { success: false, errorReason: `OWNER_CONFLICT: incident ${incidentId} has conflicting ownership (${incidentPlan.decision.reason}).` };
        }
        const priorEventStatus = eventStates[incidentId]?.status || existingIncident?.status || 'PLANNED';
        const lifecycle = evaluateWorldDirectorLifecycleTransition(
          priorEventStatus === 'PLANNED' || priorEventStatus === 'ACTIVE' ? priorEventStatus : 'RESOLVED',
          'ACTIVE',
        );
        if (!lifecycle.allowed) return { success: false, errorReason: `OWNER_CONFLICT: incident lifecycle cannot transition to ACTIVE (${priorEventStatus}).` };

        const existingVictim = staged.getEntityCard(storyId, victimId);
        const otherVictim = staged.getEntityCards(storyId).find((card) =>
          card.metadata?.worldDirectorRole === WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.victim
          && card.worldState?.locationId === locationId
          && card.id !== victimId,
        );
        if (otherVictim) return { success: false, errorReason: `OWNER_CONFLICT: another victim identity is already anchored at this location (${otherVictim.id}).` };
        const desiredVictim: any = {
          id: victimId,
          storyId,
          name: seed.victim.name.trim(),
          kind: 'CHARACTER',
          identity: { species: seed.victim.species, aliases: [] },
          classification: { role: 'Victim', tags: ['investigation-victim'] },
          worldState: { locationId, currentActivity: 'deceased', isAlive: false, presence: 'absent' },
          lifecycle: { status: 'DEAD' },
          metadata: { worldDirectorRole: WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.victim, worldDirectorOwnership: markerByRole.victim },
          provenance: { source: 'WORLD_DIRECTOR_PREPARATION', createdBy: 'SYSTEM', sourceRef: seed.sourceRef },
        };
        const victimPlan = planWorldDirectorOwnedRecord(
          existingVictim,
          desiredVictim,
          { recordId: victimId, preparationKey, role: WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.victim },
          worldDirectorOwnershipAdapters.entityCard,
          (existing, desired) => ({ ...desired, ...existing, metadata: { ...(desired.metadata || {}), ...(existing.metadata || {}) } }),
        );
        if (victimPlan.decision.disposition === 'CONFLICT' || !victimPlan.record) {
          return { success: false, errorReason: `OWNER_CONFLICT: victim ${victimId} has conflicting ownership (${victimPlan.decision.reason}).` };
        }

        const sceneObjects = Array.isArray(location.sceneObjects) ? location.sceneObjects : [];
        const makeObject = (id: string, role: string, name: string, description: string | undefined, visible: boolean, discoverable: boolean) => ({
          id,
          name: name.trim(),
          kind: 'OTHER' as const,
          description,
          visible,
          interactable: discoverable,
          tags: ['investigation', role.toLowerCase()],
          properties: {
            worldDirectorRole: role,
            worldDirectorOwnership: ownershipMarker(preparationKey, role),
            sourceRef: seed.sourceRef,
            presence: 'PRESENT',
            discoverable,
            ...(role === WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.body ? { representsVictimRef: victimId } : {}),
          },
        });
        const desiredObjects = [
          makeObject(bodyId, WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.body, seed.body.name, seed.body.description, seed.body.visible, seed.body.discoverable),
          ...seed.evidence.map((anchor, index) => makeObject(evidenceIds[index], WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.evidence, anchor.name, anchor.description, anchor.visible, anchor.discoverable)),
        ];
        const objectPlans = desiredObjects.map((desired) => {
          const existing = sceneObjects.find((candidate: any) => candidate.id === desired.id);
          const role = String(desired.properties.worldDirectorRole);
          return {
            existing,
            desired,
            plan: planWorldDirectorOwnedRecord(
              existing,
              desired,
              { recordId: desired.id, preparationKey, role },
              worldDirectorOwnershipAdapters.sceneObject,
              (owned, next) => ({
                ...next,
                ...owned,
                properties: { ...(next.properties || {}), ...(owned.properties || {}) },
              }),
            ),
          };
        });
        const conflict = objectPlans.find((entry) => entry.plan.decision.disposition === 'CONFLICT' || !entry.plan.record);
        if (conflict) return { success: false, errorReason: `OWNER_CONFLICT: scene object ${conflict.desired.id} has conflicting ownership (${conflict.plan.decision.reason}).` };

        const desiredObjectIds = new Set(desiredObjects.map((object) => object.id));
        const duplicateRole = sceneObjects.find((object: any) => {
          const role = object.properties?.worldDirectorRole;
          return (role === WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.body || role === WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.evidence)
            && !desiredObjectIds.has(object.id);
        });
        if (duplicateRole) return { success: false, errorReason: `OWNER_CONFLICT: preparation already owns a different ${duplicateRole.properties?.worldDirectorRole} record (${duplicateRole.id}).` };

        const canonicalChanges: string[] = [];
        if (incidentPlan.changed) {
          const nextEvent = { ...incidentPlan.record, status: 'ACTIVE' };
          if (existingIncident) plannedEvents[plannedEvents.findIndex((event: any) => event.id === incidentId)] = nextEvent;
          else plannedEvents.push(nextEvent);
          stagedRun.plannedEvents = plannedEvents;
          stagedRun.eventStates = { ...eventStates, [incidentId]: { ...(eventStates[incidentId] || {}), id: incidentId, status: 'ACTIVE' } };
          canonicalChanges.push(incidentId);
        } else if (priorEventStatus === 'PLANNED') {
          stagedRun.eventStates = { ...eventStates, [incidentId]: { ...(eventStates[incidentId] || {}), id: incidentId, status: 'ACTIVE' } };
          canonicalChanges.push(incidentId);
        }
        if (victimPlan.changed) {
          staged.saveEntityCard(storyId, victimPlan.record);
          canonicalChanges.push(victimId);
        }
        for (const entry of objectPlans) {
          if (!entry.plan.changed || !entry.plan.record) continue;
          const mutation = entry.existing
            ? graph.patchSceneObject(locationId, entry.desired.id, entry.plan.record)
            : graph.addSceneObject(locationId, entry.plan.record);
          if (!mutation.success) return { success: false, errorReason: mutation.errorReason || `Could not commit scene object ${entry.desired.id}.` };
          canonicalChanges.push(entry.desired.id);
        }

        const refs = { incident: incidentId, victim: victimId, body: bodyId, evidence: evidenceIds };
        stagedRun.plannedEvents = plannedEvents;
        stagedRun.runtimeState = {
          ...(stagedRun.runtimeState || {}),
          worldDirectorPreparations: {
            ...(stagedRun.runtimeState?.worldDirectorPreparations || {}),
            [preparationKey]: { contractVersion: WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION, status: 'ACTIVE', sourceRef: seed.sourceRef, locationId, scenarioFingerprint, recordRefs: refs },
          },
        };
        staged.saveStoryRun(stagedRun);
        return {
          success: true,
          data: { recordRefs: refs, canonicalChanges },
          summary: `Prepared authored investigation ${preparationKey} at ${locationId}.`,
        };
      },
    );

    if (!commandResult.success) {
      const error = String(commandResult.errorReason || 'Canonical preparation command failed.');
      const code = error.startsWith('OWNER_CONFLICT:') ? 'OWNER_CONFLICT' : 'COMMIT_FAILED';
      return blocked(code, error.replace(/^OWNER_CONFLICT:\s*/, ''), preparationKey, seed.sourceRef);
    }
    const data = commandResult.data;
    if (data?.recordRefs) {
      return { status: 'PREPARED', preparationKey, sourceRef: seed.sourceRef, canonicalChanges: data.canonicalChanges || [], recordRefs: data.recordRefs, issues: [] };
    }
    const manifest = repository.getStoryRun(storyId)?.runtimeState?.worldDirectorPreparations?.[preparationKey];
    return {
      status: 'ALREADY_PREPARED',
      preparationKey,
      sourceRef: seed.sourceRef,
      canonicalChanges: [],
      recordRefs: manifest?.recordRefs,
      issues: [],
    };
  }
}
