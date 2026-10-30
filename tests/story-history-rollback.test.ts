import test from 'node:test';
import assert from 'node:assert/strict';
import type { ActionLog } from '../src/types';
import {
  buildStoryHistoryRollbackPlan,
  retainJournalEntriesBeforeRollback,
} from '../server/domain/storyHistoryRollback';

function action(id: string, actionType: ActionLog['actionType'] = 'CUSTOM_ACTION', commandId = 'cmd_' + id): ActionLog {
  return {
    id,
    timestamp: 'Dawn',
    cycle: 1,
    actionType,
    description: id,
    epistemicValidation: 'MOCK_ENGINE_COMMITTED',
    authoritativeFeedback: id,
    canonicalCommandId: commandId,
  } as ActionLog;
}

function event(commandId: string, actionIdsBefore: string[], withUniverse = true): any {
  return {
    eventId: 'event_' + commandId,
    commandId,
    storyId: 'rollback_test',
    commandType: 'INTERACT',
    source: 'PLAYER',
    committedAt: 'Y2026-M01-D01T00:00:00',
    success: true,
    summary: commandId,
    mutationPaths: [],
    mutationCount: 0,
    transactionMode: 'ROLLBACK',
    replay: {
      preStateSnapshot: {
        storyId: 'rollback_test',
        adaptation: {
          ch16Run: {
            runtimeState: {
              actionHistory: actionIdsBefore.map((id) => ({ id })),
            },
          },
        },
      },
      ...(withUniverse ? {
        universeBefore: {
          universeId: 'universe_rollback_test',
          universeElapsedSeconds: 120,
          currentWorldId: 'world_test',
          currentStoryId: 'rollback_test',
          updatedAt: '2026-10-30T00:00:00.000Z',
          worldBindings: [],
        },
      } : {}),
    },
  };
}

test('rollback plan restores the exact prefix before the selected turn', () => {
  const actions = [
    action('turn_3'),
    action('turn_2'),
    action('turn_1'),
  ];
  const events = [
    event('cmd_turn_1', []),
    event('cmd_turn_2', ['turn_1']),
    event('cmd_turn_3', ['turn_2', 'turn_1']),
  ];

  const result = buildStoryHistoryRollbackPlan({
    actionHistory: actions,
    canonicalEvents: events,
    actionId: 'turn_2',
    hasUniverse: true,
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.plan.survivingActionIds, ['turn_1']);
  assert.deepEqual(result.plan.removedActionIds, ['turn_3', 'turn_2']);
  assert.deepEqual(result.plan.survivingEventIds, ['event_cmd_turn_1']);
  assert.deepEqual(result.plan.removedCommandIds, ['cmd_turn_2', 'cmd_turn_3']);
});

test('rollback refuses a missing checkpoint without changing story history', () => {
  const result = buildStoryHistoryRollbackPlan({
    actionHistory: [action('turn_1')],
    canonicalEvents: [],
    actionId: 'turn_1',
    hasUniverse: false,
  });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, 'ACTION_ROLLBACK_CHECKPOINT_UNAVAILABLE');
});

test('rollback refuses a checkpoint whose surviving history does not match', () => {
  const result = buildStoryHistoryRollbackPlan({
    actionHistory: [action('turn_2'), action('turn_1')],
    canonicalEvents: [event('cmd_turn_2', ['wrong_turn'])],
    actionId: 'turn_2',
    hasUniverse: true,
  });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, 'ACTION_ROLLBACK_CHECKPOINT_MISMATCH');
});

test('rollback refuses universe-backed stories without a universe checkpoint', () => {
  const result = buildStoryHistoryRollbackPlan({
    actionHistory: [action('turn_1')],
    canonicalEvents: [event('cmd_turn_1', [], false)],
    actionId: 'turn_1',
    hasUniverse: true,
  });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, 'ACTION_ROLLBACK_UNIVERSE_CHECKPOINT_UNAVAILABLE');
});

test('opening/system notes are not deletable as player turns', () => {
  const result = buildStoryHistoryRollbackPlan({
    actionHistory: [action('opening', 'NOTE_RECORD', 'cmd_opening')],
    canonicalEvents: [event('cmd_opening', [])],
    actionId: 'opening',
    hasUniverse: false,
  });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, 'ACTION_ROLLBACK_UNSUPPORTED');
});

test('rollback journal filtering removes records tied to deleted turns and preserves unrelated records', () => {
  const entries = [
    { turnId: 'cmd_turn_1', narration: 'first' },
    { actionId: 'turn_2', narration: 'second' },
    { sourceEventId: 'cmd_turn_3', narration: 'third' },
    { label: 'Unlinked player-authored pin' },
  ];

  assert.deepEqual(
    retainJournalEntriesBeforeRollback(entries, ['turn_2', 'cmd_turn_3']),
    [
      { turnId: 'cmd_turn_1', narration: 'first' },
      { label: 'Unlinked player-authored pin' },
    ],
  );
});
