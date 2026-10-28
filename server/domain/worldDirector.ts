/**
 * World Director — opening-scene readiness diagnostics.
 *
 * This first slice is intentionally read-only: it identifies when an
 * investigation premise is not backed by the canonical scene projection.
 * It does not create facts or replace any canonical authority.
 */

import type { WorldRepository } from '../repositories/worldRepository';
import type { WorldDirectorPreparationResult } from '../services/worldDirectorPreparationService';
import { isPublicArchetype, normalizeLocationArchetype } from './locationArchetypes';
import {
  WORLD_DIRECTOR_INVESTIGATION_EVENT_CATEGORY,
  WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES,
  assessWorldDirectorInvestigationSceneContract,
  type WorldDirectorInvestigationIssueCode,
  type WorldDirectorInvestigationRequirementResult,
  type WorldDirectorInvestigationSceneContractInput,
  type WorldDirectorInvestigationSceneContractReport,
} from './worldDirectorPreparationContract';

export type WorldDirectorSceneProfile = 'INVESTIGATION' | 'RESTRICTED_SITE' | 'ABANDONED_SITE' | 'PUBLIC_SOCIAL' | 'ORDINARY_ROOM' | 'GENERAL';

export type WorldDirectorReadinessStatus =
  | 'READY'
  | 'READY_WITH_UNCERTAINTY'
  | 'INCOMPLETE'
  | 'NOT_APPLICABLE';

export interface WorldDirectorSceneObjectEvidence {
  id?: string;
  name?: string;
  kind?: string;
  description?: string;
  tags?: string[];
  properties?: Record<string, unknown>;
  visible?: boolean;
  visibleToPlayer?: boolean;
}

export interface WorldDirectorEntityEvidence {
  id?: string;
  name?: string;
  displayName?: string;
  role?: string;
  kind?: string;
  presence?: string;
  isAlive?: boolean;
  visibleToPlayer?: boolean;
  currentActivity?: string;
}

export interface WorldDirectorEventEvidence {
  id?: string;
  summary?: string;
  type?: string;
  locationId?: string;
}

export interface OpeningSceneReadinessInput {
  startingSituation?: string;
  sceneObjects?: WorldDirectorSceneObjectEvidence[];
  visibleEntities?: WorldDirectorEntityEvidence[];
  visibleEvents?: WorldDirectorEventEvidence[];
  /** Canonically recorded open questions; these are uncertainty, not missing facts to invent. */
  unresolvedQuestions?: string[];
  /** When supplied, readiness is resolved against the canonical owner records. */
  worldRepo?: WorldRepository;
  storyId?: string;
  currentLocationId?: string;
  preparationKey?: string;
}

export interface WorldDirectorReadinessIssue {
  code:
    | 'INVESTIGATION_VICTIM_NOT_ESTABLISHED'
    | 'INVESTIGATION_EVIDENCE_NOT_ESTABLISHED'
    | 'INVESTIGATION_UNRESOLVED_QUESTION'
    | 'RESTRICTED_SITE_ACCESS_NOT_ESTABLISHED'
    | 'RESTRICTED_SITE_BOUNDARY_NOT_VISIBLE'
    | 'ABANDONED_SITE_ABSENCE_NOT_ESTABLISHED'
    | 'ABANDONED_SITE_PHYSICAL_CUE_NOT_VISIBLE'
    | 'PUBLIC_SOCIAL_OCCUPANCY_UNKNOWN'
    | 'PUBLIC_SOCIAL_OCCUPANCY_NOT_INHABITED'
    | 'PUBLIC_SOCIAL_ACTIVITY_NOT_ESTABLISHED'
    | 'ORDINARY_ROOM_SCENE_ANCHOR_NOT_VISIBLE'
    | 'ORDINARY_ROOM_OCCUPANCY_UNKNOWN'
    | WorldDirectorInvestigationIssueCode;
  requirement: string;
  message: string;
  recoveryAction?: string;
}

export interface WorldDirectorReadinessReport {
  profile: WorldDirectorSceneProfile;
  status: WorldDirectorReadinessStatus;
  issues: WorldDirectorReadinessIssue[];
  investigationRequirements?: WorldDirectorInvestigationRequirementResult[];
  investigationSceneContract?: WorldDirectorInvestigationSceneContractReport;
  preparation?: WorldDirectorPreparationResult;
  evidenceCounts: {
    visibleSceneObjects: number;
    visibleEntities: number;
    visibleEvents: number;
  };
}

/**
 * Conservative signal only: the premise selects a readiness profile; it does
 * not establish that any victim, clue, culprit, or event exists canonically.
 */
function isInvestigationPremise(value: string): boolean {
  return /\b(?:murder|murdered|homicide|corpse|dead body|crime scene|victim|forensic examination)\b/i.test(value)
    || /\binvestigat\w{0,12}.{0,48}\b(?:death|body|victim|crime|murder)\b/i.test(value);
}

function normalizedVisibleObjects(objects: WorldDirectorSceneObjectEvidence[]) {
  return objects.filter((object) => object.visible !== false && object.visibleToPlayer !== false);
}

function normalizedVisibleEntities(entities: WorldDirectorEntityEvidence[]) {
  return entities.filter((entity) =>
    entity.visibleToPlayer !== false &&
    (entity.presence === undefined || entity.presence === 'present'),
  );
}

function searchableObjectText(object: WorldDirectorSceneObjectEvidence): string {
  return [
    object.name,
    object.description,
    ...(Array.isArray(object.tags) ? object.tags : []),
    object.properties ? JSON.stringify(object.properties) : '',
  ].filter(Boolean).join(' ').toLowerCase();
}

function searchableEntityText(entity: WorldDirectorEntityEvidence): string {
  return [entity.name, entity.displayName, entity.role, entity.kind, entity.currentActivity]
    .filter(Boolean).join(' ').toLowerCase();
}

function investigationSceneContractFromOwners(
  repository: WorldRepository,
  storyId: string,
  requestedLocationId: string,
  requestedPreparationKey?: string,
): WorldDirectorInvestigationSceneContractInput {
  const location = repository.getGeographyGraph(storyId).getNode(requestedLocationId);
  const locationId = location?.id || '';
  const run = repository.getStoryRun(storyId);
  const preparationKey = requestedPreparationKey || run?.startingSituation?.worldDirectorInvestigation?.preparationKey;
  const candidateManifest = preparationKey ? run?.runtimeState?.worldDirectorPreparations?.[preparationKey] : undefined;
  const preparationManifest = candidateManifest?.locationId === requestedLocationId ? candidateManifest : undefined;
  const preparationRefs = preparationManifest?.recordRefs;
  const plannedEvents = Array.isArray(run?.plannedEvents) ? run.plannedEvents : [];
  const eventStates = run?.eventStates || {};
  const investigationEvents = plannedEvents.filter((event: any) =>
    event?.category === WORLD_DIRECTOR_INVESTIGATION_EVENT_CATEGORY,
  ).filter((event: any) => !preparationManifest || event.id === preparationRefs?.incident);
  const activeEvents = investigationEvents.filter((event: any) =>
    (eventStates[event.id]?.status || event.status) === 'ACTIVE',
  );
  const referenceConflicts: NonNullable<WorldDirectorInvestigationSceneContractInput['referenceConflicts']> = [];
  let incident: WorldDirectorInvestigationSceneContractInput['incident'];
  if (activeEvents.length === 1) {
    const event = activeEvents[0];
    incident = {
      owner: 'WORLD_TIMELINE',
      recordRef: String(event.id || ''),
      locationId: String(event.locationId || ''),
      state: 'COMMITTED_ACTIVE',
    };
  } else if (activeEvents.length > 1) {
    referenceConflicts.push({
      requirementId: 'CURRENT_INCIDENT',
      code: 'INCIDENT_REFERENCE_CONFLICT',
      recordRefs: activeEvents.map((event: any) => String(event.id || '')).filter(Boolean),
    });
  } else if (investigationEvents.length > 1) {
    referenceConflicts.push({
      requirementId: 'CURRENT_INCIDENT',
      code: 'INCIDENT_REFERENCE_CONFLICT',
      recordRefs: investigationEvents.map((event: any) => String(event.id || '')).filter(Boolean),
    });
  } else if (investigationEvents.length === 1) {
    const event = investigationEvents[0];
    const state = eventStates[event.id]?.status || event.status;
    incident = {
      owner: 'WORLD_TIMELINE',
      recordRef: String(event.id || ''),
      locationId: String(event.locationId || ''),
      state: state === 'COMPLETED' || state === 'RESOLVED' ? 'HISTORICAL' : 'PROPOSED',
    };
  }

  const entityCards = repository.getEntityCards(storyId);
  const victimCandidates = entityCards.filter((card) =>
    card.metadata?.worldDirectorRole === WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.victim
      && (!preparationManifest || card.id === preparationRefs?.victim),
  );
  const sceneObjects = Array.isArray(location?.sceneObjects) ? location.sceneObjects : [];
  const bodyCandidates = sceneObjects.filter((object) =>
    object.properties?.worldDirectorRole === WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.body
      && (!preparationManifest || object.id === preparationRefs?.body),
  );
  const bodyVictimRefs = new Set(bodyCandidates
    .map((object) => String(object.properties?.representsVictimRef || '').trim())
    .filter(Boolean));
  const linkedVictims = victimCandidates.filter((victim) => bodyVictimRefs.has(victim.id));
  const usableVictims = linkedVictims.length ? linkedVictims : victimCandidates;

  let victim: WorldDirectorInvestigationSceneContractInput['victim'];
  if (usableVictims.length === 1) {
    victim = { owner: 'ENTITY_REGISTRY', recordRef: usableVictims[0].id, state: 'COMMITTED' };
  } else if (usableVictims.length > 1) {
    referenceConflicts.push({
      requirementId: 'VICTIM_IDENTITY',
      code: 'VICTIM_REFERENCE_CONFLICT',
      recordRefs: usableVictims.map((candidate) => candidate.id),
    });
  }

  const linkedBodies = victim
    ? bodyCandidates.filter((object) => object.properties?.representsVictimRef === victim!.recordRef)
    : bodyCandidates;
  let body: WorldDirectorInvestigationSceneContractInput['body'];
  if (linkedBodies.length === 1) {
    const object = linkedBodies[0];
    body = {
      owner: 'GEOGRAPHY_GRAPH',
      recordRef: object.id,
      locationId,
      presence: 'PRESENT',
      visibleToPlayer: object.visible !== false,
      discoverable: object.properties?.discoverable === true,
      representsVictimRef: String(object.properties?.representsVictimRef || ''),
    };
  } else if (linkedBodies.length > 1) {
    referenceConflicts.push({
      requirementId: 'VICTIM_BODY',
      code: 'BODY_REFERENCE_CONFLICT',
      recordRefs: linkedBodies.map((candidate) => candidate.id),
    });
  } else if (bodyCandidates.length === 1) {
    const object = bodyCandidates[0];
    body = {
      owner: 'GEOGRAPHY_GRAPH',
      recordRef: object.id,
      locationId,
      presence: 'PRESENT',
      visibleToPlayer: object.visible !== false,
      discoverable: object.properties?.discoverable === true,
      representsVictimRef: String(object.properties?.representsVictimRef || ''),
    };
  }

  const evidence = sceneObjects
    .filter((object) => object.properties?.worldDirectorRole === WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.evidence
      && (!preparationManifest || (Array.isArray(preparationRefs?.evidence) && preparationRefs.evidence.includes(object.id))))
    .map((object) => ({
      owner: 'GEOGRAPHY_GRAPH' as const,
      recordRef: object.id,
      locationId,
      presence: object.properties?.presence === 'ABSENT' ? 'ABSENT' as const : 'PRESENT' as const,
      visibleToPlayer: object.visible !== false,
      discoverable: object.properties?.discoverable === true,
    }));

  return {
    currentLocationId: locationId,
    incident,
    victim,
    body,
    evidence,
    referenceConflicts,
  };
}

export class WorldDirector {
  /**
   * Checks whether a starting investigation is backed by visible canonical
   * scene anchors. A READY report is not proof that the full incident is
   * complete; it only means this initial minimum contract is satisfied.
   */
  public static assessOpeningSceneReadiness(
    input: OpeningSceneReadinessInput,
  ): WorldDirectorReadinessReport {
    const objects = normalizedVisibleObjects(input.sceneObjects || []);
    const entities = normalizedVisibleEntities(input.visibleEntities || []);
    const events = (input.visibleEvents || []).filter((event) => Boolean(String(event.summary || '').trim()));
    const evidenceCounts = {
      visibleSceneObjects: objects.length,
      visibleEntities: entities.length,
      visibleEvents: events.length,
    };

    if (!isInvestigationPremise(String(input.startingSituation || ''))) {
      const canonicalLocation = input.worldRepo && input.storyId && input.currentLocationId
        ? input.worldRepo.getGeographyGraph(input.storyId).getNode(input.currentLocationId)
        : undefined;
      if (String(canonicalLocation?.archetype || '').trim().toUpperCase() === 'RESTRICTED_SITE') {
        const population = canonicalLocation?.population;
        const issues: WorldDirectorReadinessIssue[] = [];
        if (population?.status !== 'RESTRICTED' || population.accessControlled !== true) {
          issues.push({
            code: 'RESTRICTED_SITE_ACCESS_NOT_ESTABLISHED',
            requirement: 'Canonical restricted occupancy with explicit access control',
            message: 'The location is authored as a restricted site, but its canonical occupancy does not establish restricted, access-controlled entry.',
          });
        }
        const visibleBoundary = normalizedVisibleObjects(canonicalLocation?.sceneObjects || []).some((object) =>
          /\b(?:seal(?:ed)?|grille|warden|access|restrict(?:ed|ion)?|lock(?:ed)?|gate|guard|authoriz\w*)\b/i.test(searchableObjectText(object)),
        );
        if (!visibleBoundary) {
          issues.push({
            code: 'RESTRICTED_SITE_BOUNDARY_NOT_VISIBLE',
            requirement: 'A visible canonical cue establishes the access boundary',
            message: 'The restricted site has no visible canonical boundary cue, so narration must not imply that the player can perceive one.',
          });
        }
        return {
          profile: 'RESTRICTED_SITE',
          status: issues.length ? 'INCOMPLETE' : 'READY',
          issues,
          evidenceCounts,
        };
      }
      if (String(canonicalLocation?.archetype || '').trim().toUpperCase() === 'ABANDONED_SITE') {
        const population = canonicalLocation?.population;
        const issues: WorldDirectorReadinessIssue[] = [];
        if (population?.status !== 'ABANDONED' || population.expectedPopulation !== 'NONE') {
          issues.push({
            code: 'ABANDONED_SITE_ABSENCE_NOT_ESTABLISHED',
            requirement: 'Canonical ABANDONED occupancy with no expected resident population',
            message: 'The location is authored as an abandoned site, but its canonical occupancy does not explicitly establish that ordinary resident population is absent.',
          });
        }
        const physicalCues = [
          ...(Array.isArray(canonicalLocation?.environment?.features) ? canonicalLocation.environment.features : []),
          ...normalizedVisibleObjects(canonicalLocation?.sceneObjects || []).map(searchableObjectText),
        ].join(' ').toLowerCase();
        if (!/\b(?:flood(?:ed|ing)?|collaps(?:e|ed|ing)|ruin(?:ed)?|derelict|broken|overgrown|evacuat\w*|sealed|vacant|deserted|charred|crumbl\w*|decay(?:ed|ing)?)\b/i.test(physicalCues)) {
          issues.push({
            code: 'ABANDONED_SITE_PHYSICAL_CUE_NOT_VISIBLE',
            requirement: 'Visible canonical environmental or object evidence of abandonment',
            message: 'The abandoned site has no visible canonical physical cue supporting its condition; narration must not invent one.',
          });
        }
        return {
          profile: 'ABANDONED_SITE',
          status: issues.length ? 'INCOMPLETE' : 'READY',
          issues,
          evidenceCounts,
        };
      }
      const canonicalArchetype = normalizeLocationArchetype(canonicalLocation?.archetype);
      if (canonicalArchetype && isPublicArchetype(canonicalArchetype)) {
        const population = canonicalLocation?.population;
        const issues: WorldDirectorReadinessIssue[] = [];
        let status: WorldDirectorReadinessStatus = 'READY';
        if (population?.status === 'UNKNOWN' || !population?.status) {
          status = 'READY_WITH_UNCERTAINTY';
          issues.push({
            code: 'PUBLIC_SOCIAL_OCCUPANCY_UNKNOWN',
            requirement: 'Preserve unknown public-place occupancy as uncertainty',
            message: 'Occupancy at this public or social location is unknown; use only visible occupants and established aggregate activity without claiming presence or absence beyond that evidence.',
          });
        } else if (population.status !== 'INHABITED' || population.expectedPopulation === 'NONE') {
          status = 'INCOMPLETE';
          issues.push({
            code: 'PUBLIC_SOCIAL_OCCUPANCY_NOT_INHABITED',
            requirement: 'Canonical inhabited occupancy for a public/social scene profile',
            message: 'The public/social location is not canonically established as inhabited; do not generate ordinary crowd activity from its archetype alone.',
          });
        } else if (!entities.length && !String(canonicalLocation?.environment?.ambientActivity || '').trim()) {
          status = 'INCOMPLETE';
          issues.push({
            code: 'PUBLIC_SOCIAL_ACTIVITY_NOT_ESTABLISHED',
            requirement: 'A visible occupant or authored aggregate activity cue',
            message: 'The location is marked inhabited, but no visible occupant or canonical aggregate activity cue is available to ground social-scene narration.',
          });
        }
        return {
          profile: 'PUBLIC_SOCIAL',
          status,
          issues,
          evidenceCounts,
        };
      }
      if (canonicalArchetype === 'ROOM') {
        const issues: WorldDirectorReadinessIssue[] = [];
        const visibleFeatures = [
          ...(Array.isArray(canonicalLocation?.environment?.features) ? canonicalLocation.environment.features : []),
          ...normalizedVisibleObjects(canonicalLocation?.sceneObjects || []).map(searchableObjectText),
        ].filter((feature) => String(feature || '').trim());
        if (!visibleFeatures.length) {
          issues.push({
            code: 'ORDINARY_ROOM_SCENE_ANCHOR_NOT_VISIBLE',
            requirement: 'At least one visible canonical room feature or scene object',
            message: 'The room has no visible canonical physical anchor, so narration must not supply furnishings or other concrete room details.',
          });
        }
        const population = canonicalLocation?.population;
        const occupancyUnknown = !population?.status || population.status === 'UNKNOWN';
        if (occupancyUnknown) {
          issues.push({
            code: 'ORDINARY_ROOM_OCCUPANCY_UNKNOWN',
            requirement: 'Keep unknown room occupancy unresolved',
            message: 'Room occupancy is unknown; use only listed visible occupants and do not infer that the room is occupied or empty.',
          });
        }
        return {
          profile: 'ORDINARY_ROOM',
          status: !visibleFeatures.length
            ? 'INCOMPLETE'
            : occupancyUnknown
              ? 'READY_WITH_UNCERTAINTY'
              : 'READY',
          issues,
          evidenceCounts,
        };
      }
      return {
        profile: 'GENERAL',
        status: 'NOT_APPLICABLE',
        issues: [],
        evidenceCounts,
      };
    }

    if (input.worldRepo && input.storyId && input.currentLocationId) {
      const contractInput = investigationSceneContractFromOwners(
        input.worldRepo,
        input.storyId,
        input.currentLocationId,
        input.preparationKey,
      );
      const investigationSceneContract = assessWorldDirectorInvestigationSceneContract({
        ...contractInput,
        unresolvedQuestions: input.unresolvedQuestions,
      });
      return {
        profile: 'INVESTIGATION',
        status: investigationSceneContract.status,
        issues: investigationSceneContract.issues.map((issue) => ({
          code: issue.code,
          requirement: issue.requirementId,
          message: issue.recoveryAction,
          recoveryAction: issue.recoveryAction,
        })),
        investigationRequirements: investigationSceneContract.requirements,
        investigationSceneContract,
        evidenceCounts,
      };
    }

    const objectText = objects.map(searchableObjectText);
    const entityText = entities.map(searchableEntityText);
    const victimEstablished = [...objectText, ...entityText].some((value) =>
      /\b(?:victim|corpse|dead body|body of|deceased|murdered person|casualty)\b/.test(value),
    );

    const evidenceEstablished = objects.some((object) => {
      const value = searchableObjectText(object);
      return /\b(?:evidence|clue|blood|bloodstain|bloodied|weapon|footprint|fingerprint|forensic|shell casing|spent casing|broken lock|forced entry|drag mark|struggle)\b/.test(value);
    }) || events.some((event) =>
      /\b(?:evidence|clue|blood|weapon|footprint|fingerprint|forensic|forced entry|struggle)\b/i.test(String(event.summary || '')),
    );

    const issues: WorldDirectorReadinessIssue[] = [];
    if (!victimEstablished) {
      issues.push({
        code: 'INVESTIGATION_VICTIM_NOT_ESTABLISHED',
        requirement: 'A visible canonical representation of the victim or body',
        message: 'The starting situation establishes an investigation, but the visible canonical scene projection does not establish a victim/body anchor.',
      });
    }
    if (!evidenceEstablished) {
      issues.push({
        code: 'INVESTIGATION_EVIDENCE_NOT_ESTABLISHED',
        requirement: 'At least one visible canonical evidence or clue anchor',
        message: 'The starting situation establishes an investigation, but no visible canonical evidence/clue anchor is present in the scene projection.',
      });
    }

    const unresolvedQuestions = (input.unresolvedQuestions || [])
      .map((question) => String(question || '').trim())
      .filter(Boolean);
    for (const question of unresolvedQuestions) {
      issues.push({
        code: 'INVESTIGATION_UNRESOLVED_QUESTION',
        requirement: 'Preserve the question as unresolved; do not infer its answer',
        message: `The investigation remains unresolved: ${question}`,
      });
    }

    const hasMissingRequirements = issues.some((issue) =>
      issue.code !== 'INVESTIGATION_UNRESOLVED_QUESTION',
    );
    return {
      profile: 'INVESTIGATION',
      status: hasMissingRequirements
        ? 'INCOMPLETE'
        : unresolvedQuestions.length
          ? 'READY_WITH_UNCERTAINTY'
          : 'READY',
      issues,
      evidenceCounts,
    };
  }
}
