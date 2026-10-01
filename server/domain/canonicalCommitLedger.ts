import type { CanonicalStateSnapshot } from './canonicalSnapshot';
import type { CanonicalCommand } from './canonicalCommandEngine';
import type { WorldRepository } from '../repositories/worldRepository';

export type CanonicalCommitPhase =
  | 'PREPARED'
  | 'HANDLER_RESOLVED'
  | 'CUSTOM_RULES_VERIFIED'
  | 'STATE_APPLIED'
  | 'EVENT_RECORDED'
  | 'COMMITTED'
  | 'ABORTED';

export interface CanonicalCommitLedgerEntry {
  ledgerId: string;
  storyId: string;
  commandId: string;
  phase: CanonicalCommitPhase;
  startedAt: string;
  updatedAt: string;
  transactionMode: 'STAGED' | 'ROLLBACK';
  preStateHash: string;
  postStateHash?: string;
  preStateSnapshot: CanonicalStateSnapshot;
  commandPayload: Record<string, unknown>;
  ownerPhases: Record<string, 'PENDING' | 'VERIFIED'>;
  recoveryAction: 'ABORT_AND_RESTORE' | 'NONE';
  errorReason?: string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Operational transaction journal.
 *
 * Important boundary:
 * - It is deliberately NOT stored inside StoryRun.runtimeState.
 * - Canonical state remains the sole shared persisted source of truth.
 * - This journal is repository-instance scoped, so concurrent test workers and
 *   independent repository instances cannot recover each other's live commands.
 *
 * Durable restart/replay remains provided by CanonicalCommandEvent.replay checkpoints.
 * The journal adds owner-phase observability and same-process interruption recovery
 * without introducing a second persistent state database.
 */
const repositoryLedgers = new WeakMap<object, Map<string, CanonicalCommitLedgerEntry>>();

function ledgerFor(repository: WorldRepository): Map<string, CanonicalCommitLedgerEntry> {
  let ledger = repositoryLedgers.get(repository as object);
  if (!ledger) {
    ledger = new Map<string, CanonicalCommitLedgerEntry>();
    repositoryLedgers.set(repository as object, ledger);
  }
  return ledger;
}

export class CanonicalCommitLedger {
  public static begin(
    repository: WorldRepository,
    command: CanonicalCommand,
    preStateSnapshot: CanonicalStateSnapshot,
    preStateHash: string,
    now: string,
  ): CanonicalCommitLedgerEntry {
    const ledger = ledgerFor(repository);
    const existing = this.find(repository, command.storyId, command.commandId);
    if (existing && existing.phase !== 'ABORTED') return existing;

    const entry: CanonicalCommitLedgerEntry = {
      ledgerId: existing?.ledgerId || ('ledger_' + command.storyId + '_' + command.commandId),
      storyId: command.storyId,
      commandId: command.commandId,
      phase: 'PREPARED',
      startedAt: now,
      updatedAt: now,
      transactionMode: command.transactionMode || 'ROLLBACK',
      preStateHash,
      preStateSnapshot: clone(preStateSnapshot),
      commandPayload: clone(command.payload),
      ownerPhases: {
        handler: 'PENDING',
        customRules: 'PENDING',
        state: 'PENDING',
        event: 'PENDING',
      },
      recoveryAction: 'ABORT_AND_RESTORE',
    };

    ledger.set(command.storyId + '::' + command.commandId, entry);
    return entry;
  }

  public static find(
    repository: WorldRepository,
    storyId: string,
    commandId: string,
  ): CanonicalCommitLedgerEntry | undefined {
    return ledgerFor(repository).get(storyId + '::' + commandId);
  }

  public static markPhase(
    repository: WorldRepository,
    storyId: string,
    commandId: string,
    phase: CanonicalCommitPhase,
    now: string,
    updates: Partial<CanonicalCommitLedgerEntry> = {},
  ): CanonicalCommitLedgerEntry | undefined {
    const ledger = ledgerFor(repository);
    const key = storyId + '::' + commandId;
    const current = ledger.get(key);
    if (!current) return undefined;

    const next: CanonicalCommitLedgerEntry = {
      ...current,
      ...updates,
      phase,
      updatedAt: now,
      ownerPhases: {
        ...current.ownerPhases,
        ...(updates.ownerPhases || {}),
      },
    };
    ledger.set(key, next);
    return next;
  }

  /**
   * Recover only commands owned by this exact repository/runtime instance.
   * This is intentionally explicit; canonical state replay checkpoints remain
   * the cross-restart durability mechanism.
   */
  public static recoverInterrupted(
    repository: WorldRepository,
    storyId: string,
    now: string,
  ): CanonicalCommitLedgerEntry[] {
    const ledger = ledgerFor(repository);
    const interrupted = [...ledger.entries()]
      .filter(([key, entry]) =>
        key.startsWith(storyId + '::') &&
        !['COMMITTED', 'ABORTED'].includes(entry.phase)
      )
      .map(([, entry]) => entry);

    const recovered: CanonicalCommitLedgerEntry[] = [];
    for (const entry of interrupted) {
      repository.restoreCanonicalStateSnapshot(clone(entry.preStateSnapshot));
      const updated: CanonicalCommitLedgerEntry = {
        ...entry,
        phase: 'ABORTED',
        updatedAt: now,
        recoveryAction: 'ABORT_AND_RESTORE',
        errorReason: 'Interrupted canonical command was recovered by restoring its repository-local pre-state checkpoint.',
        ownerPhases: {
          ...entry.ownerPhases,
          state: 'VERIFIED',
        },
      };
      ledger.set(storyId + '::' + entry.commandId, updated);
      recovered.push(updated);
    }
    return recovered;
  }

  public static clearRepository(repository: WorldRepository): void {
    repositoryLedgers.delete(repository as object);
  }

  public static exportRepositoryLedger(repository: WorldRepository): CanonicalCommitLedgerEntry[] {
    return [...ledgerFor(repository).values()].map(clone);
  }
}

export const canonicalCommitLedger = CanonicalCommitLedger;
