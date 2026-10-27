import type { EntityCard } from './entityCard';
import type { HistoricalEvidence } from './historicalEvidence';
import type { KnowledgeFact, LocationSceneObject } from './types';

/**
 * World Director preparation identity contract.
 *
 * This module is intentionally pure and is not wired to production mutation
 * paths yet. Canonical writes remain disabled until transaction recovery and
 * lifecycle reconciliation are proven.
 */

export const WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION = 1 as const;

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

