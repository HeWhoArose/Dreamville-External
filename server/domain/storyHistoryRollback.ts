import type { ActionLog } from '../../src/types';
import type { CanonicalCommandEvent } from './canonicalCommandEngine';
import type { CanonicalStateSnapshot } from './canonicalSnapshot';

export interface UniverseRollbackCheckpoint {
  universeId: string;
  universeElapsedSeconds: number;
  currentWorldId: string;
  currentStoryId: string;
  updatedAt: string;
  worldBindings: unknown[];
}

export interface StoryHistoryRollbackPlan {
  targetAction: ActionLog;
  targetIndex: number;
  targetEventIndex: number;
  targetEvent: CanonicalCommandEvent;
  preStateSnapshot: CanonicalStateSnapshot;
  removedActionIds: string[];
  survivingActionIds: string[];
  removedCommandIds: string[];
  survivingCommandIds: string[];
  removedEventIds: string[];
  survivingEventIds: string[];
  universeBefore?: UniverseRollbackCheckpoint;
}

export type StoryHistoryRollbackPlanResult =
  | { success: true; plan: StoryHistoryRollbackPlan }
  | { success: false; code: string; errorReason: string };

function idsMatch(left: unknown[], right: unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => String(value) === String(right[index]));
}

/**
 * Resolve a deletion/rollback only when the saved pre-turn checkpoint exactly
 * matches the action-history prefix that should survive. UI flags are hints;
 * this server-side validation is authoritative.
 */
export function buildStoryHistoryRollbackPlan(params: {
  actionHistory: ActionLog[];
  canonicalEvents: CanonicalCommandEvent[];
  actionId: string;
  hasUniverse: boolean;
}): StoryHistoryRollbackPlanResult {
  const actionId = String(params.actionId || '').trim();
  if (!actionId) {
    return { success: false, code: 'ACTION_ID_REQUIRED', errorReason: 'actionId is required.' };
  }

  const targetIndex = params.actionHistory.findIndex((entry) => entry.id === actionId);
  const targetAction = targetIndex >= 0 ? params.actionHistory[targetIndex] : undefined;
  if (!targetAction) {
    return { success: false, code: 'ACTION_NOT_FOUND', errorReason: 'The selected story turn was not found.' };
  }
  if (targetAction.actionType === 'NOTE_RECORD') {
    return { success: false, code: 'ACTION_ROLLBACK_UNSUPPORTED', errorReason: 'Opening and system notes are not player turns and cannot be rolled back with this control.' };
  }

  const canonicalCommandId = String(targetAction.canonicalCommandId || '').trim();
  const targetEvent = canonicalCommandId
    ? params.canonicalEvents.find((event) => event.commandId === canonicalCommandId)
    : undefined;
  const targetEventIndex = targetEvent
    ? params.canonicalEvents.findIndex((event) => event.eventId === targetEvent.eventId)
    : -1;
  const preStateSnapshot = targetEvent?.replay?.preStateSnapshot;
  if (!canonicalCommandId || !targetEvent || targetEventIndex < 0 || !preStateSnapshot) {
    return {
      success: false,
      code: 'ACTION_ROLLBACK_CHECKPOINT_UNAVAILABLE',
      errorReason: 'This older turn does not have a complete canonical pre-turn checkpoint. It has not been deleted or partially changed.',
    };
  }

  const checkpointHistory = preStateSnapshot.adaptation?.ch16Run?.runtimeState?.actionHistory;
  if (!Array.isArray(checkpointHistory)) {
    return {
      success: false,
      code: 'ACTION_ROLLBACK_HISTORY_CHECKPOINT_UNAVAILABLE',
      errorReason: 'The saved checkpoint does not contain the previous action history. Rollback was refused without changing the story.',
    };
  }

  const survivingActions = params.actionHistory.slice(targetIndex + 1);
  const expectedSurvivingIds = survivingActions.map((entry) => entry.id);
  const checkpointActionIds = checkpointHistory.map((entry: any) => String(entry?.id || ''));
  if (!idsMatch(checkpointActionIds, expectedSurvivingIds)) {
    return {
      success: false,
      code: 'ACTION_ROLLBACK_CHECKPOINT_MISMATCH',
      errorReason: 'The saved pre-turn checkpoint does not match the current surviving timeline. Rollback was refused to protect story state.',
    };
  }

  const universeBefore = targetEvent.replay.universeBefore as UniverseRollbackCheckpoint | undefined;
  if (params.hasUniverse && (!universeBefore?.universeId || !Array.isArray(universeBefore.worldBindings))) {
    return {
      success: false,
      code: 'ACTION_ROLLBACK_UNIVERSE_CHECKPOINT_UNAVAILABLE',
      errorReason: 'This turn predates safe cross-world memory checkpoints. Rollback was refused rather than leaving derived universe memories behind.',
    };
  }

  const removedActions = params.actionHistory.slice(0, targetIndex + 1);
  const removedEvents = params.canonicalEvents.slice(targetEventIndex);
  const survivingEvents = params.canonicalEvents.slice(0, targetEventIndex);

  return {
    success: true,
    plan: {
      targetAction,
      targetIndex,
      targetEventIndex,
      targetEvent,
      preStateSnapshot,
      removedActionIds: removedActions.map((entry) => entry.id),
      survivingActionIds: survivingActions.map((entry) => entry.id),
      removedCommandIds: removedEvents.map((event) => event.commandId),
      survivingCommandIds: survivingEvents.map((event) => event.commandId),
      removedEventIds: removedEvents.map((event) => event.eventId),
      survivingEventIds: survivingEvents.map((event) => event.eventId),
      ...(universeBefore ? { universeBefore } : {}),
    },
  };
}

/**
 * Journals are excluded from compact per-turn replay checkpoints. When rolling
 * back, retain entries that are not tied to one of the removed actions/events.
 * Unlinked user-authored records are deliberately preserved.
 */
export function retainJournalEntriesBeforeRollback<T extends Record<string, unknown>>(
  entries: T[] | undefined,
  removedIds: Iterable<string>,
): T[] {
  if (!Array.isArray(entries)) return [];
  const removed = new Set(Array.from(removedIds, (value) => String(value)));
  const referenceKeys = [
    'actionId',
    'sourceActionId',
    'turnId',
    'commandId',
    'canonicalCommandId',
    'eventId',
    'canonicalEventId',
    'sourceEventId',
  ];
  return entries.filter((entry) => {
    for (const key of referenceKeys) {
      const value = entry?.[key];
      if (typeof value === 'string' && removed.has(value)) return false;
    }
    return true;
  });
}
