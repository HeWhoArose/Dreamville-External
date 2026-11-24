import { createHash } from 'node:crypto';

/**
 * EntityLifecycleStage represents the 4-stage ontological progression of living-world entities:
 * EPHEMERAL -> PROPOSED -> ACTIVE_TEMPORARY -> PERSISTENT
 */
export type EntityLifecycleStage = 'EPHEMERAL' | 'PROPOSED' | 'ACTIVE_TEMPORARY' | 'PERSISTENT';

export interface SimulationPrecondition {
  predicate: string;
  expected: unknown;
}

export interface SimulationStateTransition {
  type: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}

export interface SimulationProvenance {
  source: 'AUTHORED' | 'DETERMINISTIC_ARCHETYPE' | 'MODEL_PROPOSED';
  timestamp: string;
  agentOrModelId?: string;
}

export interface SimulationSafeFallback {
  message: string;
  stateChanges?: unknown[];
}

/**
 * Strongly-typed WorldSimulationProposal contract conforming to PROJECT.md § World Simulator ↔ Canonical Store.
 */
export interface WorldSimulationProposal {
  proposalId: string;
  idempotencyKey: string;
  worldVersion: number;
  baseStateHash: string;
  entityType?: EntityLifecycleStage;
  proposedStateTransition: SimulationStateTransition;
  requiredPreconditions: SimulationPrecondition[];
  provenance: SimulationProvenance;
  safeFallback: SimulationSafeFallback;
}

export type AdjudicationResultCode =
  | 'PROPOSAL_COMMITTED'
  | 'STALE_PROPOSAL_REJECTED'
  | 'PRECONDITION_FAILED'
  | 'FORBIDDEN_MUTATION_REJECTED';

export interface WorldSimulationCommitRecord {
  kind: string;
  targetId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  provenance: string;
}

export interface WorldSimulationAdjudicationResult {
  accepted: boolean;
  code: AdjudicationResultCode;
  message: string;
  worldVersion: number;
  stateHash: string;
  commitRecords: WorldSimulationCommitRecord[];
}

/**
 * Backwards-compatible alias for existing test runners and external modules.
 */
export type AdjudicationResult = WorldSimulationAdjudicationResult;

export interface SimulationWorldState {
  worldVersion: number;
  state: Record<string, unknown>;
  stateHash: string;
}

const FORBIDDEN_CANON_KEYWORDS = ['key', 'weapon', 'clue', 'corpse', 'evidence', 'plot_macguffin'];

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : stableStringify(item))).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
}

/**
 * Deterministic Compare-And-Swap (CAS) state adjudicator for living-world simulation proposals.
 */
export class WorldSimulatorAdjudicator {
  /**
   * Deterministic 16-hex state hash using SHA-256 over canonical key-sorted JSON serialization.
   */
  public static calculateStateHash(state: Record<string, unknown>): string {
    return createHash('sha256').update(stableStringify(state)).digest('hex').slice(0, 16);
  }

  /**
   * Adjudicates a simulation proposal against the current canonical world state using strict CAS checks.
   */
  public static adjudicate(
    currentWorld: SimulationWorldState,
    proposal: WorldSimulationProposal
  ): WorldSimulationAdjudicationResult {
    // 1. CAS Check: worldVersion (stale proposal rejection, including negative/diverged versions)
    if (proposal.worldVersion !== currentWorld.worldVersion) {
      return {
        accepted: false,
        code: 'STALE_PROPOSAL_REJECTED',
        message: `Stale proposal rejected: proposal version ${proposal.worldVersion} !== canon version ${currentWorld.worldVersion}`,
        worldVersion: currentWorld.worldVersion,
        stateHash: currentWorld.stateHash,
        commitRecords: [],
      };
    }

    // 2. Base state hash check
    if (proposal.baseStateHash !== currentWorld.stateHash) {
      return {
        accepted: false,
        code: 'STALE_PROPOSAL_REJECTED',
        message: `Stale proposal rejected: base hash mismatch (proposal: ${proposal.baseStateHash}, canon: ${currentWorld.stateHash})`,
        worldVersion: currentWorld.worldVersion,
        stateHash: currentWorld.stateHash,
        commitRecords: [],
      };
    }

    // 3. Preconditions check
    for (const cond of proposal.requiredPreconditions || []) {
      const actual = currentWorld.state[cond.predicate];
      if (actual !== cond.expected) {
        return {
          accepted: false,
          code: 'PRECONDITION_FAILED',
          message: `Precondition failed for ${cond.predicate}: expected ${JSON.stringify(cond.expected)}, got ${JSON.stringify(actual)}`,
          worldVersion: currentWorld.worldVersion,
          stateHash: currentWorld.stateHash,
          commitRecords: [],
        };
      }
    }

    // 4. Forbidden canon mutation check
    const payload = proposal.proposedStateTransition?.payload;
    const transitionType = proposal.proposedStateTransition?.type;
    const targetId = proposal.proposedStateTransition?.targetId?.toLowerCase() || '';

    const isExplicitlyForbidden = Boolean(payload?.forbiddenCanonMutation);
    const isInventQuestItem = transitionType === 'INVENT_QUEST_ITEM' || transitionType === 'FORBIDDEN_MUTATION';
    const isForbiddenTarget = FORBIDDEN_CANON_KEYWORDS.some((kw) => targetId.includes(kw) && !payload?.allowedByCanon);

    if (isExplicitlyForbidden || isInventQuestItem || isForbiddenTarget) {
      return {
        accepted: false,
        code: 'FORBIDDEN_MUTATION_REJECTED',
        message: 'Forbidden canon mutation detected and rejected by adjudication gate.',
        worldVersion: currentWorld.worldVersion,
        stateHash: currentWorld.stateHash,
        commitRecords: [],
      };
    }

    // 5. Atomic state commit
    const newVersion = currentWorld.worldVersion + 1;
    const newState = { ...currentWorld.state, ...(payload || {}) };
    const newHash = this.calculateStateHash(newState);

    return {
      accepted: true,
      code: 'PROPOSAL_COMMITTED',
      message: 'Proposal successfully adjudicated and committed.',
      worldVersion: newVersion,
      stateHash: newHash,
      commitRecords: [
        {
          kind: proposal.proposedStateTransition.type,
          targetId: proposal.proposedStateTransition.targetId || 'target_entity',
          operation: 'CREATE',
          provenance: proposal.provenance.source,
        },
      ],
    };
  }
}
