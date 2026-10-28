import type { EntityCard } from './entityCard';
import type { HistoricalEvidence } from './historicalEvidence';
import type { KnowledgeFact, LocationSceneObject } from './types';

/**
 * World Director preparation identity contract.
 *
 * This module keeps identity, ownership, lifecycle, and readiness decisions
 * pure. WorldDirectorPreparationService may apply these decisions only inside
 * a staged canonical command for an explicit confirmed scenario seed.
 */

export const WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION = 1 as const;

export const WORLD_DIRECTOR_INVESTIGATION_EVENT_CATEGORY = 'INVESTIGATION_INCIDENT' as const;
export const WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES = {
  victim: 'INVESTIGATION_VICTIM',
  body: 'INVESTIGATION_BODY',
  evidence: 'INVESTIGATION_EVIDENCE',
} as const;

/**
 * Investigation claims keep authored scenario truth, committed canonical
 * records, generated suggestions, and unanswered questions distinct. Narrative
 * prose by itself is not a claim source; callers must supply an explicit ref.
 */
export type WorldDirectorInvestigationClaim =
  | {
      kind: 'AUTHORED_TRUTH';
      claimId: string;
      statement: string;
      sourceRef: string;
    }
  | {
      kind: 'CANONICAL_FACT';
      claimId: string;
      statement: string;
      recordRef: string;
    }
  | {
      kind: 'GENERATED_PROPOSAL';
      proposalId: string;
      statement: string;
      generator: string;
      basedOnRefs: string[];
    }
  | {
      kind: 'AUTHORIZED_PROPOSAL';
      proposalId: string;
      statement: string;
      generator: string;
      basedOnRefs: string[];
      authorizationRef: string;
    }
  | {
      kind: 'UNKNOWN';
      questionId: string;
      question: string;
    };

export interface WorldDirectorInvestigationClaimAssessment {
  classification: WorldDirectorInvestigationClaim['kind'];
  establishesCanonicalFact: boolean;
  maySupportPreparation: boolean;
  requiresCanonicalOwnerCommit: boolean;
  reason: string;
}

function requireClaimReference(name: string, value: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`World Director investigation claim requires a non-empty ${name}.`);
  }
}

/**
 * Only an owner-backed canonical record satisfies a prepared-scene fact
 * requirement. Structured authored truth may justify proposing a record;
 * generated content cannot do that on its own, and unknowns stay unanswered.
 */
export function assessWorldDirectorInvestigationClaim(
  claim: WorldDirectorInvestigationClaim,
): WorldDirectorInvestigationClaimAssessment {
  switch (claim.kind) {
    case 'AUTHORED_TRUTH': {
      requireClaimReference('claimId', claim.claimId);
      requireClaimReference('statement', claim.statement);
      requireClaimReference('sourceRef', claim.sourceRef);
      return {
        classification: claim.kind,
        establishesCanonicalFact: false,
        maySupportPreparation: true,
        requiresCanonicalOwnerCommit: true,
        reason: 'Structured authored truth can support preparation, but it is not a committed scene record.',
      };
    }
    case 'CANONICAL_FACT': {
      requireClaimReference('claimId', claim.claimId);
      requireClaimReference('statement', claim.statement);
      requireClaimReference('recordRef', claim.recordRef);
      return {
        classification: claim.kind,
        establishesCanonicalFact: true,
        maySupportPreparation: true,
        requiresCanonicalOwnerCommit: false,
        reason: 'The canonical owner record establishes this fact for readiness evaluation.',
      };
    }
    case 'GENERATED_PROPOSAL': {
      requireClaimReference('proposalId', claim.proposalId);
      requireClaimReference('statement', claim.statement);
      requireClaimReference('generator', claim.generator);
      if (!Array.isArray(claim.basedOnRefs) || claim.basedOnRefs.length === 0) {
        throw new Error('World Director generated proposal requires at least one supporting reference.');
      }
      claim.basedOnRefs.forEach((ref, index) => requireClaimReference(`basedOnRefs[${index}]`, ref));
      return {
        classification: claim.kind,
        establishesCanonicalFact: false,
        maySupportPreparation: false,
        requiresCanonicalOwnerCommit: true,
        reason: 'Generated proposals remain hypotheses until independently authorized and committed through a canonical owner.',
      };
    }
    case 'AUTHORIZED_PROPOSAL': {
      requireClaimReference('proposalId', claim.proposalId);
      requireClaimReference('statement', claim.statement);
      requireClaimReference('generator', claim.generator);
      requireClaimReference('authorizationRef', claim.authorizationRef);
      if (!Array.isArray(claim.basedOnRefs) || claim.basedOnRefs.length === 0) {
        throw new Error('World Director authorized proposal requires at least one supporting reference.');
      }
      claim.basedOnRefs.forEach((ref, index) => requireClaimReference(`basedOnRefs[${index}]`, ref));
      return {
        classification: claim.kind,
        establishesCanonicalFact: false,
        maySupportPreparation: true,
        requiresCanonicalOwnerCommit: true,
        reason: 'Explicitly authorized proposals may support a preparation request but remain non-canonical until an owner commits a record.',
      };
    }
    case 'UNKNOWN': {
      requireClaimReference('questionId', claim.questionId);
      requireClaimReference('question', claim.question);
      return {
        classification: claim.kind,
        establishesCanonicalFact: false,
        maySupportPreparation: false,
        requiresCanonicalOwnerCommit: false,
        reason: 'The conclusion is unknown and must remain unresolved until new authoritative evidence exists.',
      };
    }
  }
}

export interface WorldDirectorInvestigationIncidentRef {
  owner: 'WORLD_TIMELINE';
  recordRef: string;
  locationId: string;
  state: 'COMMITTED_ACTIVE' | 'PROPOSED' | 'HISTORICAL';
}

export interface WorldDirectorInvestigationVictimRef {
  owner: 'ENTITY_REGISTRY';
  recordRef: string;
  state: 'COMMITTED' | 'PROPOSED';
}

export interface WorldDirectorInvestigationPhysicalAnchorRef {
  owner: 'GEOGRAPHY_GRAPH';
  recordRef: string;
  locationId: string;
  presence: 'PRESENT' | 'ABSENT';
  visibleToPlayer: boolean;
  discoverable: boolean;
}

export interface WorldDirectorInvestigationBodyRef extends WorldDirectorInvestigationPhysicalAnchorRef {
  representsVictimRef: string;
}

export interface WorldDirectorInvestigationSceneContractInput {
  currentLocationId: string;
  incident?: WorldDirectorInvestigationIncidentRef;
  victim?: WorldDirectorInvestigationVictimRef;
  body?: WorldDirectorInvestigationBodyRef;
  evidence?: WorldDirectorInvestigationPhysicalAnchorRef[];
  referenceConflicts?: Array<{
    requirementId: WorldDirectorInvestigationRequirementId;
    code: 'INCIDENT_REFERENCE_CONFLICT' | 'VICTIM_REFERENCE_CONFLICT' | 'BODY_REFERENCE_CONFLICT';
    recordRefs: string[];
  }>;
  unresolvedQuestions?: string[];
}

export type WorldDirectorInvestigationRequirementId =
  | 'CURRENT_INCIDENT'
  | 'VICTIM_IDENTITY'
  | 'VICTIM_BODY'
  | 'DISCOVERABLE_EVIDENCE';

export interface WorldDirectorInvestigationRequirementResult {
  id: WorldDirectorInvestigationRequirementId;
  status: 'SATISFIED' | 'MISSING';
  recordRefs: string[];
  reason?: string;
}

export type WorldDirectorInvestigationIssueCode =
  | 'SCENE_LOCATION_MISSING'
  | 'INCIDENT_REFERENCE_CONFLICT'
  | 'INCIDENT_REFERENCE_MISSING'
  | 'INCIDENT_OWNER_CONFLICT'
  | 'INCIDENT_NOT_COMMITTED_ACTIVE'
  | 'INCIDENT_LOCATION_MISMATCH'
  | 'VICTIM_REFERENCE_MISSING'
  | 'VICTIM_REFERENCE_CONFLICT'
  | 'VICTIM_OWNER_CONFLICT'
  | 'VICTIM_NOT_COMMITTED'
  | 'BODY_REFERENCE_MISSING'
  | 'BODY_REFERENCE_CONFLICT'
  | 'BODY_OWNER_CONFLICT'
  | 'BODY_NOT_PRESENT'
  | 'BODY_LOCATION_MISMATCH'
  | 'BODY_VICTIM_LINK_MISMATCH'
  | 'BODY_NOT_DISCOVERABLE'
  | 'EVIDENCE_REFERENCE_MISSING'
  | 'EVIDENCE_OWNER_CONFLICT'
  | 'EVIDENCE_NOT_PRESENT'
  | 'EVIDENCE_LOCATION_MISMATCH'
  | 'EVIDENCE_NOT_DISCOVERABLE';

export interface WorldDirectorInvestigationIssue {
  code: WorldDirectorInvestigationIssueCode;
  requirementId: WorldDirectorInvestigationRequirementId;
  recordRef?: string;
  recoveryAction: string;
}

export interface WorldDirectorInvestigationSceneContractReport {
  status: 'READY' | 'READY_WITH_UNCERTAINTY' | 'INCOMPLETE';
  requirements: WorldDirectorInvestigationRequirementResult[];
  issues: WorldDirectorInvestigationIssue[];
  unresolvedQuestions: string[];
}

function nonEmptyRecordRef(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Checks the minimum structured contract for the first isolated-shack murder
 * fixture. Proposals, historical records, off-location objects, and hidden
 * undiscoverable objects cannot satisfy present-scene requirements.
 */
export function assessWorldDirectorInvestigationSceneContract(
  input: WorldDirectorInvestigationSceneContractInput,
): WorldDirectorInvestigationSceneContractReport {
  const locationId = String(input.currentLocationId || '').trim();
  const incident = input.incident;
  const victim = input.victim;
  const body = input.body;
  const evidenceRecords = Array.isArray(input.evidence) ? input.evidence : [];
  const issues: WorldDirectorInvestigationIssue[] = [];
  const addIssue = (
    code: WorldDirectorInvestigationIssueCode,
    requirementId: WorldDirectorInvestigationRequirementId,
    recoveryAction: string,
    recordRef?: string,
  ) => issues.push({ code, requirementId, recoveryAction, ...(recordRef ? { recordRef } : {}) });

  if (!locationId) {
    addIssue('SCENE_LOCATION_MISSING', 'CURRENT_INCIDENT', 'Resolve the canonical current location before assessing this scene.');
  }

  if (!incident) {
    addIssue('INCIDENT_REFERENCE_MISSING', 'CURRENT_INCIDENT', 'Author or resolve the required incident through its canonical event owner.');
  } else if (incident.owner !== 'WORLD_TIMELINE') {
    addIssue('INCIDENT_OWNER_CONFLICT', 'CURRENT_INCIDENT', 'Read the incident from the canonical world timeline; do not adopt a record from another owner.', incident.recordRef);
  } else if (!nonEmptyRecordRef(incident.recordRef)) {
    addIssue('INCIDENT_REFERENCE_MISSING', 'CURRENT_INCIDENT', 'Repair the missing incident record reference from its canonical owner.');
  } else if (incident.state !== 'COMMITTED_ACTIVE') {
    addIssue('INCIDENT_NOT_COMMITTED_ACTIVE', 'CURRENT_INCIDENT', 'Commit an authorized active incident through its canonical owner; proposals and historical events do not qualify.', incident.recordRef);
  } else if (incident.locationId !== locationId) {
    addIssue('INCIDENT_LOCATION_MISMATCH', 'CURRENT_INCIDENT', 'Revisit the incident location or correct its canonical location reference.', incident.recordRef);
  }

  if (!victim) {
    addIssue('VICTIM_REFERENCE_MISSING', 'VICTIM_IDENTITY', 'Resolve the victim identity through EntityRegistry or keep the requirement explicitly incomplete.');
  } else if (victim.owner !== 'ENTITY_REGISTRY') {
    addIssue('VICTIM_OWNER_CONFLICT', 'VICTIM_IDENTITY', 'Read the victim identity from EntityRegistry; do not adopt a record from another owner.', victim.recordRef);
  } else if (!nonEmptyRecordRef(victim.recordRef)) {
    addIssue('VICTIM_REFERENCE_MISSING', 'VICTIM_IDENTITY', 'Repair the missing victim record reference from EntityRegistry.');
  } else if (victim.state !== 'COMMITTED') {
    addIssue('VICTIM_NOT_COMMITTED', 'VICTIM_IDENTITY', 'Commit the authorized victim identity through EntityRegistry before treating it as scene truth.', victim.recordRef);
  }

  if (!body) {
    addIssue('BODY_REFERENCE_MISSING', 'VICTIM_BODY', 'Resolve a body scene object through GeographyGraph and link it to the canonical victim record.');
  } else if (body.owner !== 'GEOGRAPHY_GRAPH') {
    addIssue('BODY_OWNER_CONFLICT', 'VICTIM_BODY', 'Read the body from GeographyGraph; do not adopt a body record from another owner.', body.recordRef);
  } else if (!nonEmptyRecordRef(body.recordRef)) {
    addIssue('BODY_REFERENCE_MISSING', 'VICTIM_BODY', 'Repair the missing body record reference from GeographyGraph.');
  } else if (body.presence !== 'PRESENT') {
    addIssue('BODY_NOT_PRESENT', 'VICTIM_BODY', 'Confirm physical presence through GeographyGraph; an absent or consumed body cannot satisfy this scene. ', body.recordRef);
  } else if (body.locationId !== locationId) {
    addIssue('BODY_LOCATION_MISMATCH', 'VICTIM_BODY', 'Revisit the body location or correct the canonical scene-object location.', body.recordRef);
  } else if (!victim || body.representsVictimRef !== victim.recordRef) {
    addIssue('BODY_VICTIM_LINK_MISMATCH', 'VICTIM_BODY', 'Resolve the body-to-victim link from canonical records; do not infer identity from prose.', body.recordRef);
  } else if (!body.visibleToPlayer && !body.discoverable) {
    addIssue('BODY_NOT_DISCOVERABLE', 'VICTIM_BODY', 'Make the present body visible or discoverable only if canonical scene policy allows it.', body.recordRef);
  }

  const incidentValid = Boolean(
    locationId && incident?.owner === 'WORLD_TIMELINE' &&
    incident.state === 'COMMITTED_ACTIVE' &&
    nonEmptyRecordRef(incident.recordRef) && incident.locationId === locationId,
  );
  const victimValid = Boolean(
    victim?.owner === 'ENTITY_REGISTRY' && victim.state === 'COMMITTED' &&
    nonEmptyRecordRef(victim.recordRef),
  );
  const bodyValid = Boolean(
    body?.owner === 'GEOGRAPHY_GRAPH' && nonEmptyRecordRef(body.recordRef) &&
    body.locationId === locationId && body.presence === 'PRESENT' &&
    (body.visibleToPlayer || body.discoverable) && victimValid &&
    body.representsVictimRef === victim?.recordRef,
  );
  const validEvidence = evidenceRecords.filter((evidence) =>
    evidence?.owner === 'GEOGRAPHY_GRAPH' &&
    nonEmptyRecordRef(evidence.recordRef) &&
    evidence.locationId === locationId &&
    evidence.presence === 'PRESENT' &&
    (evidence.visibleToPlayer || evidence.discoverable),
  );

  if (!validEvidence.length) {
    if (!evidenceRecords.length) {
      addIssue('EVIDENCE_REFERENCE_MISSING', 'DISCOVERABLE_EVIDENCE', 'Resolve at least one evidence record through GeographyGraph.');
    } else {
      for (const candidate of evidenceRecords) {
        if (candidate?.owner !== 'GEOGRAPHY_GRAPH') {
          addIssue('EVIDENCE_OWNER_CONFLICT', 'DISCOVERABLE_EVIDENCE', 'Read evidence from GeographyGraph; do not adopt a record from another owner.', candidate?.recordRef);
        } else if (!nonEmptyRecordRef(candidate.recordRef)) {
          addIssue('EVIDENCE_REFERENCE_MISSING', 'DISCOVERABLE_EVIDENCE', 'Repair the missing evidence record reference from GeographyGraph.');
        } else if (candidate.presence !== 'PRESENT') {
          addIssue('EVIDENCE_NOT_PRESENT', 'DISCOVERABLE_EVIDENCE', 'Confirm the evidence remains physically present; consumed or removed objects do not satisfy readiness.', candidate.recordRef);
        } else if (candidate.locationId !== locationId) {
          addIssue('EVIDENCE_LOCATION_MISMATCH', 'DISCOVERABLE_EVIDENCE', 'Revisit the evidence location or correct the canonical scene-object location.', candidate.recordRef);
        } else if (!candidate.visibleToPlayer && !candidate.discoverable) {
          addIssue('EVIDENCE_NOT_DISCOVERABLE', 'DISCOVERABLE_EVIDENCE', 'Make the evidence visible or searchable only if canonical scene policy allows it.', candidate.recordRef);
        }
      }
    }
  }

  for (const conflict of Array.isArray(input.referenceConflicts) ? input.referenceConflicts : []) {
    addIssue(
      conflict.code,
      conflict.requirementId,
      'Resolve the competing canonical references explicitly; do not select or merge one by guesswork.',
      conflict.recordRefs.filter(nonEmptyRecordRef).join(', ') || undefined,
    );
  }

  const requirements: WorldDirectorInvestigationRequirementResult[] = [
    {
      id: 'CURRENT_INCIDENT',
      status: incidentValid ? 'SATISFIED' : 'MISSING',
      recordRefs: incidentValid ? [incident!.recordRef] : [],
      reason: incidentValid ? undefined : 'A committed active incident at the current location is required; a proposal or historical record is insufficient.',
    },
    {
      id: 'VICTIM_IDENTITY',
      status: victimValid ? 'SATISFIED' : 'MISSING',
      recordRefs: victimValid ? [victim!.recordRef] : [],
      reason: victimValid ? undefined : 'A committed victim identity record is required.',
    },
    {
      id: 'VICTIM_BODY',
      status: bodyValid ? 'SATISFIED' : 'MISSING',
      recordRefs: bodyValid ? [body!.recordRef, victim!.recordRef] : [],
      reason: bodyValid ? undefined : 'A present, visible or discoverable body record at this location must reference the committed victim identity.',
    },
    {
      id: 'DISCOVERABLE_EVIDENCE',
      status: validEvidence.length > 0 ? 'SATISFIED' : 'MISSING',
      recordRefs: validEvidence.map((evidence) => evidence.recordRef),
      reason: validEvidence.length > 0 ? undefined : 'At least one present, visible or discoverable evidence record at this location is required.',
    },
  ];

  const unresolvedQuestions = (Array.isArray(input.unresolvedQuestions) ? input.unresolvedQuestions : [])
    .map((question) => String(question || '').trim())
    .filter(Boolean);
  const hasMissingRequirements = requirements.some((requirement) => requirement.status === 'MISSING');

  return {
    status: hasMissingRequirements
      ? 'INCOMPLETE'
      : unresolvedQuestions.length
        ? 'READY_WITH_UNCERTAINTY'
        : 'READY',
    requirements,
    issues,
    unresolvedQuestions,
  };
}

export type WorldDirectorPreparedRecordKind =
  | 'SCENE_OBJECT'
  | 'ENTITY'
  | 'WORLD_FACT'
  | 'CHRONICLE_EVIDENCE'
  | 'CANONICAL_EVENT';

export interface WorldDirectorStableIdentityInput {
  storyId: string;
  preparationKey: string;
  recordKind: WorldDirectorPreparedRecordKind;
  role: string;
  /** Owning location ID for location-scoped records; explicit scope for others. */
  scopeId: string;
}

export interface WorldDirectorOwnershipMarker {
  contractVersion: number;
  preparationKey: string;
  role: string;
}

export type WorldDirectorOwnershipDisposition =
  | 'CREATE'
  | 'RECONCILE_OWNED'
  | 'CONFLICT';

function requiredIdentityPart(name: string, value: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`World Director stable identity requires a non-empty ${name}.`);
  }
  const normalized = value.trim();
  if (normalized.length > 240) {
    throw new Error(`World Director stable identity ${name} exceeds 240 characters.`);
  }
  return normalized;
}

/**
 * Produces a readable, unambiguous, deterministic ID from explicit canonical
 * identity inputs. The preparation key must be authored/supplied by the caller;
 * this function never derives identity from narrative prose or current time.
 *
 * Each encoded segment is separated by '|', which encodeURIComponent escapes
 * inside values, avoiding delimiter ambiguity. No lossy short hash is used.
 */
export function buildWorldDirectorStableRecordId(
  input: WorldDirectorStableIdentityInput,
): string {
  const parts = [
    requiredIdentityPart('storyId', input.storyId),
    requiredIdentityPart('preparationKey', input.preparationKey),
    requiredIdentityPart('recordKind', input.recordKind),
    requiredIdentityPart('role', input.role),
    requiredIdentityPart('scopeId', input.scopeId),
  ];
  return `wdp:v${WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION}:${parts.map((part) => encodeURIComponent(part)).join('|')}`;
}

/**
 * A record is mutable by a preparation only when its explicit ownership marker
 * matches both the stable preparation key and role at the current contract
 * version. Existing authored/unmarked records are conflicts, never overwritten.
 */
export function classifyWorldDirectorOwnership(
  existing: WorldDirectorOwnershipMarker | null | undefined,
  expected: Pick<WorldDirectorOwnershipMarker, 'preparationKey' | 'role'>,
): WorldDirectorOwnershipDisposition {
  if (!existing) return 'CREATE';
  if (
    existing.contractVersion === WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION &&
    existing.preparationKey === expected.preparationKey &&
    existing.role === expected.role
  ) {
    return 'RECONCILE_OWNED';
  }
  return 'CONFLICT';
}

/**
 * Proposed incident-preparation lifecycle. This is a pure policy contract only:
 * it does not mutate canonical records or define cleanup/retention semantics.
 * Production adoption remains blocked on durable recovery and owner adapters.
 */
export type WorldDirectorPreparationLifecycleState =
  | 'PLANNED'
  | 'ACTIVE'
  | 'RESOLVED'
  | 'CANCELLED'
  | 'SUPERSEDED';

export interface WorldDirectorLifecycleTransition {
  allowed: boolean;
  from: WorldDirectorPreparationLifecycleState;
  to: WorldDirectorPreparationLifecycleState;
  idempotent: boolean;
  reason: string;
}

const WORLD_DIRECTOR_LIFECYCLE_TRANSITIONS: Record<
  WorldDirectorPreparationLifecycleState,
  readonly WorldDirectorPreparationLifecycleState[]
> = {
  PLANNED: ['ACTIVE', 'CANCELLED', 'SUPERSEDED'],
  ACTIVE: ['RESOLVED', 'CANCELLED', 'SUPERSEDED'],
  RESOLVED: [],
  CANCELLED: [],
  SUPERSEDED: [],
};

/**
 * Evaluates lifecycle transitions without performing writes.
 * Repeating the current state is an idempotent no-op; terminal states cannot
 * be reopened under the same preparation identity.
 */
export function evaluateWorldDirectorLifecycleTransition(
  from: WorldDirectorPreparationLifecycleState,
  to: WorldDirectorPreparationLifecycleState,
): WorldDirectorLifecycleTransition {
  if (from === to) {
    return {
      allowed: true,
      from,
      to,
      idempotent: true,
      reason: 'Preparation already has the requested lifecycle state.',
    };
  }

  const allowed = WORLD_DIRECTOR_LIFECYCLE_TRANSITIONS[from].includes(to);
  return {
    allowed,
    from,
    to,
    idempotent: false,
    reason: allowed
      ? 'Lifecycle transition is permitted by the preparation contract.'
      : 'Lifecycle transition is not permitted; use an explicit new preparation identity for a new lifecycle.',
  };
}

export interface WorldDirectorOwnerRecordRef {
  id: string;
  ownershipMarker?: WorldDirectorOwnershipMarker | null;
}

export interface WorldDirectorOwnerAdapterExpectation {
  recordId: string;
  preparationKey: string;
  role: string;
}

export type WorldDirectorOwnerAdapterConflictReason =
  | 'RECORD_ID_MISMATCH'
  | 'EXISTING_RECORD_UNOWNED'
  | 'PREPARATION_KEY_MISMATCH'
  | 'ROLE_MISMATCH'
  | 'CONTRACT_VERSION_MISMATCH'
  | 'DESIRED_RECORD_MARKER_CONFLICT'
  | 'OWNER_APPEND_ONLY';

export interface WorldDirectorOwnerAdapterDecision {
  disposition: WorldDirectorOwnershipDisposition;
  recordId: string;
  reason:
    | 'RECORD_ABSENT'
    | 'OWNED_RECORD_MATCH'
    | WorldDirectorOwnerAdapterConflictReason;
  mayCreate: boolean;
  mayUpdate: boolean;
  /** Deletion is intentionally forbidden until per-owner lifecycle retention is approved. */
  mayDelete: false;
}

/**
 * Adapter-safe decision that distinguishes a truly absent record from an
 * existing authored/unmarked record. Never treat a missing marker on an
 * existing record as permission to create/adopt/overwrite it.
 *
 * This function only decides; it does not mutate any canonical owner.
 */
export function evaluateWorldDirectorOwnerRecord(
  existing: WorldDirectorOwnerRecordRef | null | undefined,
  expected: WorldDirectorOwnerAdapterExpectation,
): WorldDirectorOwnerAdapterDecision {
  if (!existing) {
    return {
      disposition: 'CREATE',
      recordId: expected.recordId,
      reason: 'RECORD_ABSENT',
      mayCreate: true,
      mayUpdate: false,
      mayDelete: false,
    };
  }

  const conflict = (reason: WorldDirectorOwnerAdapterConflictReason): WorldDirectorOwnerAdapterDecision => ({
    disposition: 'CONFLICT',
    recordId: existing.id,
    reason,
    mayCreate: false,
    mayUpdate: false,
    mayDelete: false,
  });

  if (existing.id !== expected.recordId) return conflict('RECORD_ID_MISMATCH');
  const marker = existing.ownershipMarker;
  if (!marker) return conflict('EXISTING_RECORD_UNOWNED');
  if (marker.contractVersion !== WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION) {
    return conflict('CONTRACT_VERSION_MISMATCH');
  }
  if (marker.preparationKey !== expected.preparationKey) {
    return conflict('PREPARATION_KEY_MISMATCH');
  }
  if (marker.role !== expected.role) return conflict('ROLE_MISMATCH');

  return {
    disposition: 'RECONCILE_OWNED',
    recordId: existing.id,
    reason: 'OWNED_RECORD_MATCH',
    mayCreate: false,
    mayUpdate: true,
    mayDelete: false,
  };
}

export interface WorldDirectorOwnershipAdapter<TRecord> {
  /** Whether this canonical owner supports in-place reconciliation of existing records. */
  canUpdateExisting: boolean;
  read(record: TRecord): WorldDirectorOwnershipMarker | null;
  /**
   * Returns a new record and preserves unrelated owner metadata.
   * Call only after evaluateWorldDirectorOwnerRecord permits CREATE or RECONCILE_OWNED.
   */
  withMarker(record: TRecord, marker: WorldDirectorOwnershipMarker): TRecord;
}

function parseOwnershipMarker(value: unknown): WorldDirectorOwnershipMarker | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const marker = value as Partial<WorldDirectorOwnershipMarker>;
  if (
    typeof marker.contractVersion !== 'number' ||
    typeof marker.preparationKey !== 'string' ||
    typeof marker.role !== 'string'
  ) return null;
  return {
    contractVersion: marker.contractVersion,
    preparationKey: marker.preparationKey,
    role: marker.role,
  };
}

function assertMarkerMayBeWritten(existingValue: unknown, marker: WorldDirectorOwnershipMarker): void {
  if (existingValue === undefined || existingValue === null) return;
  const existing = parseOwnershipMarker(existingValue);
  if (
    !existing ||
    existing.contractVersion !== marker.contractVersion ||
    existing.preparationKey !== marker.preparationKey ||
    existing.role !== marker.role
  ) {
    throw new Error('World Director ownership adapter refuses to replace a conflicting ownership marker.');
  }
}

function cloneMarker(marker: WorldDirectorOwnershipMarker): WorldDirectorOwnershipMarker {
  return {
    contractVersion: marker.contractVersion,
    preparationKey: marker.preparationKey,
    role: marker.role,
  };
}

/**
 * Explicit marker serialization adapters for canonical owners. These functions
 * are pure record transformations; they do not persist or mutate owner state.
 */
export const worldDirectorOwnershipAdapters = {
  sceneObject: {
    canUpdateExisting: true,
    read(record: LocationSceneObject): WorldDirectorOwnershipMarker | null {
      return parseOwnershipMarker(record.properties?.worldDirectorOwnership);
    },
    withMarker(record: LocationSceneObject, marker: WorldDirectorOwnershipMarker): LocationSceneObject {
      const existingValue = record.properties?.worldDirectorOwnership;
      assertMarkerMayBeWritten(existingValue, marker);
      return {
        ...record,
        properties: {
          ...(record.properties || {}),
          worldDirectorOwnership: cloneMarker(marker),
        },
      };
    },
  } satisfies WorldDirectorOwnershipAdapter<LocationSceneObject>,
  entityCard: {
    canUpdateExisting: true,
    read(record: EntityCard): WorldDirectorOwnershipMarker | null {
      return parseOwnershipMarker(record.metadata?.worldDirectorOwnership);
    },
    withMarker(record: EntityCard, marker: WorldDirectorOwnershipMarker): EntityCard {
      const existingValue = record.metadata?.worldDirectorOwnership;
      assertMarkerMayBeWritten(existingValue, marker);
      return {
        ...record,
        metadata: {
          ...(record.metadata || {}),
          worldDirectorOwnership: cloneMarker(marker),
        },
      };
    },
  } satisfies WorldDirectorOwnershipAdapter<EntityCard>,
  historicalEvidence: {
    canUpdateExisting: false,
    read(record: HistoricalEvidence): WorldDirectorOwnershipMarker | null {
      return parseOwnershipMarker(record.metadata?.worldDirectorOwnership);
    },
    withMarker(record: HistoricalEvidence, marker: WorldDirectorOwnershipMarker): HistoricalEvidence {
      const existingValue = record.metadata?.worldDirectorOwnership;
      assertMarkerMayBeWritten(existingValue, marker);
      return {
        ...record,
        metadata: {
          ...(record.metadata || {}),
          worldDirectorOwnership: cloneMarker(marker),
        },
      };
    },
  } satisfies WorldDirectorOwnershipAdapter<HistoricalEvidence>,
  knowledgeFact: {
    canUpdateExisting: false,
    read(record: KnowledgeFact): WorldDirectorOwnershipMarker | null {
      return parseOwnershipMarker(record.metadata?.worldDirectorOwnership);
    },
    withMarker(record: KnowledgeFact, marker: WorldDirectorOwnershipMarker): KnowledgeFact {
      const existingValue = record.metadata?.worldDirectorOwnership;
      assertMarkerMayBeWritten(existingValue, marker);
      return {
        ...record,
        metadata: {
          ...(record.metadata || {}),
          worldDirectorOwnership: cloneMarker(marker),
        },
      };
    },
  } satisfies WorldDirectorOwnershipAdapter<KnowledgeFact>,
};

export interface WorldDirectorOwnerRecordPlan<TRecord> {
  decision: WorldDirectorOwnerAdapterDecision;
  /** Proposed record only; callers must still commit through the canonical transaction owner. */
  record?: TRecord;
  changed: boolean;
}

function ownerConflictDecision(
  recordId: string,
  reason: WorldDirectorOwnerAdapterConflictReason,
): WorldDirectorOwnerAdapterDecision {
  return {
    disposition: 'CONFLICT',
    recordId,
    reason,
    mayCreate: false,
    mayUpdate: false,
    mayDelete: false,
  };
}

/**
 * Plans create/reconcile without mutating the existing record or any canonical
 * owner. Owner-specific merge functions must preserve unrelated fields. Conflicts
 * return the existing record unchanged; deletion is never proposed here.
 */
export function planWorldDirectorOwnedRecord<TRecord extends { id: string }>(
  existing: TRecord | null | undefined,
  desired: TRecord,
  expected: WorldDirectorOwnerAdapterExpectation,
  adapter: WorldDirectorOwnershipAdapter<TRecord>,
  mergeOwned: (existing: TRecord, desired: TRecord) => TRecord,
): WorldDirectorOwnerRecordPlan<TRecord> {
  if (desired.id !== expected.recordId) {
    return {
      decision: ownerConflictDecision(desired.id, 'RECORD_ID_MISMATCH'),
      record: existing || undefined,
      changed: false,
    };
  }

  const existingRef = existing
    ? { id: existing.id, ownershipMarker: adapter.read(existing) }
    : undefined;
  const decision = evaluateWorldDirectorOwnerRecord(existingRef, expected);
  if (decision.disposition === 'CONFLICT') {
    return { decision, record: existing || undefined, changed: false };
  }

  const marker: WorldDirectorOwnershipMarker = {
    contractVersion: WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION,
    preparationKey: expected.preparationKey,
    role: expected.role,
  };

  try {
    if (decision.disposition === 'CREATE') {
      return {
        decision,
        record: adapter.withMarker(desired, marker),
        changed: true,
      };
    }

    const merged = mergeOwned(existing as TRecord, desired);
    if (merged.id !== expected.recordId) {
      return {
        decision: ownerConflictDecision(merged.id, 'RECORD_ID_MISMATCH'),
        record: existing || undefined,
        changed: false,
      };
    }
    const plannedRecord = adapter.withMarker(merged, marker);
    const changed = JSON.stringify(plannedRecord) !== JSON.stringify(existing);
    if (changed && !adapter.canUpdateExisting) {
      return {
        decision: ownerConflictDecision(existing?.id || desired.id, 'OWNER_APPEND_ONLY'),
        record: existing ?? undefined,
        changed: false,
      };
    }
    return {
      decision: adapter.canUpdateExisting ? decision : { ...decision, mayUpdate: false },
      record: plannedRecord,
      changed,
    };
  } catch {
    return {
      decision: ownerConflictDecision(existing?.id || desired.id, 'DESIRED_RECORD_MARKER_CONFLICT'),
      record: existing || undefined,
      changed: false,
    };
  }
}

