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

function getLedger(repository: WorldRepository, storyId: string): CanonicalCommitLedgerEntry[] {
  const run = repository.getStoryRun(storyId);
  const ledger = Array.isArray(run?.runtimeState?.canonicalCommitLedger)
    ? run!.runtimeState!.canonicalCommitLedger
    : [];
  return ledger.map((entry: CanonicalCommitLedgerEntry) => clone(entry));
}

function saveLedger(repository: WorldRepository, storyId: string, ledger: CanonicalCommitLedgerEntry[]): void {
  const run = repository.getStoryRun(storyId);
  if (!run) return;
  run.runtimeState = { ...(run.runtimeState || {}), canonicalCommitLedger: ledger.slice(-100) };
  repository.saveStoryRun(run);
}

export class CanonicalCommitLedger {
  public static begin(repository: WorldRepository, command: CanonicalCommand, preStateSnapshot: CanonicalStateSnapshot, preStateHash: string, now: string): CanonicalCommitLedgerEntry {
    const existing = this.find(repository, command.storyId, command.commandId);
    if (existing) return existing;
    const entry: CanonicalCommitLedgerEntry = {
      ledgerId: 'ledger_' + command.storyId + '_' + command.commandId,
      storyId: command.storyId,
      commandId: command.commandId,
      phase: 'PREPARED',
      startedAt: now,
      updatedAt: now,
      transactionMode: command.transactionMode || 'ROLLBACK',
      preStateHash,
      preStateSnapshot: clone(preStateSnapshot),
      commandPayload: clone(command.payload),
      ownerPhases: { handler: 'PENDING', customRules: 'PENDING', state: 'PENDING', event: 'PENDING' },
      recoveryAction: 'ABORT_AND_RESTORE',
    };
    saveLedger(repository, command.storyId, [...getLedger(repository, command.storyId), entry]);
    return entry;
  }

  public static find(repository: WorldRepository, storyId: string, commandId: string): CanonicalCommitLedgerEntry | undefined {
    return getLedger(repository, storyId).find((entry) => entry.commandId === commandId);
  }

  public static markPhase(repository: WorldRepository, storyId: string, commandId: string, phase: CanonicalCommitPhase, now: string, updates: Partial<CanonicalCommitLedgerEntry> = {}): CanonicalCommitLedgerEntry | undefined {
    const ledger = getLedger(repository, storyId);
    const index = ledger.findIndex((entry) => entry.commandId === commandId);
    if (index < 0) return undefined;
    const current = ledger[index];
    ledger[index] = { ...current, ...updates, phase, updatedAt: now, ownerPhases: { ...current.ownerPhases, ...(updates.ownerPhases || {}) } };
    saveLedger(repository, storyId, ledger);
    return ledger[index];
  }

  public static recoverInterrupted(repository: WorldRepository, storyId: string, now: string): CanonicalCommitLedgerEntry[] {
    const ledger = getLedger(repository, storyId);
    const interrupted = ledger.filter((entry) => !['COMMITTED', 'ABORTED'].includes(entry.phase));
    const recovered: CanonicalCommitLedgerEntry[] = [];
    for (const entry of interrupted) {
      repository.restoreCanonicalStateSnapshot(clone(entry.preStateSnapshot));
      recovered.push({
        ...entry,
        phase: 'ABORTED',
        updatedAt: now,
        recoveryAction: 'ABORT_AND_RESTORE',
        errorReason: 'Interrupted canonical command was recovered by restoring its durable pre-state checkpoint.',
        ownerPhases: { ...entry.ownerPhases, state: 'VERIFIED' },
      });
    }
    if (interrupted.length > 0) {
      const updated = ledger.map((entry) => recovered.find((item) => item.commandId === entry.commandId) || entry);
      saveLedger(repository, storyId, updated);
    }
    return recovered;
  }
}

export const canonicalCommitLedger = CanonicalCommitLedger;