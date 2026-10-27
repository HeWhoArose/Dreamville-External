/**
 * World Director preparation identity contract.
 *
 * This module is intentionally pure and is not wired to production mutation
 * paths yet. Canonical writes remain disabled until transaction recovery and
 * lifecycle reconciliation are proven.
 */

export const WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION = 1 as const;

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

