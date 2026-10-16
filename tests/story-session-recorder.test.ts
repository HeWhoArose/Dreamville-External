import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorySessionRecorder } from '../server/domain/storySessionRecorder';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { StorySessionRecordingStore } from '../server/services/storySessionRecordingStore';

test('story session recorder reconstructs lossless state through JSON patches', () => {
	const initial = {
		worldClock: { seconds: 10 },
		player: { locationId: 'loc_a', hp: 10 },
		npcs: [{ id: 'maren', mood: 'calm' }],
	};
	const recording = StorySessionRecorder.start({
		storyId: 'story_test',
		title: 'Recorder Test',
		initialState: initial,
		engineVersion: 'test',
	});

	StorySessionRecorder.append(recording, {
		storyId: 'story_test',
		kind: 'DIRECT_TURN',
		source: 'AI',
		startedAt: '2026-10-05T10:00:00.000Z',
		completedAt: '2026-10-05T10:00:01.000Z',
		success: true,
		rolledBack: false,
		request: { playerAction: 'walk to the gate' },
		turn: {
			turnId: 'turn_1',
			task: 'narrative.generate',
			playerAction: 'walk to the gate',
			telemetry: { selectedProviderId: 'google_gemini', selectedModelId: 'gemini-3.5-flash' },
			attemptsTrail: [{ providerId: 'google_gemini', modelId: 'gemini-3.5-flash', status: 'SUCCESS', latencyMs: 100 }],
			turnPackage: { narrative: ['You walk toward the gate.'] },
		},
		stateBefore: initial,
		stateAfter: {
			worldClock: { seconds: 10 },
			player: { locationId: 'loc_gate', hp: 10 },
			npcs: [{ id: 'maren', mood: 'watchful' }],
		},
	});

	const validation = StorySessionRecorder.validate(recording);
	assert.equal(validation.valid, true);
	assert.equal(validation.interactionCount, 1);
	assert.deepEqual(StorySessionRecorder.applyPatches(recording), {
		worldClock: { seconds: 10 },
		player: { locationId: 'loc_gate', hp: 10 },
		npcs: [{ id: 'maren', mood: 'watchful' }],
	});
	assert.equal(recording.interactions[0].stateBeforeHash.length, 64);
	assert.equal(recording.interactions[0].stateAfterHash.length, 64);
});

test('story session recorder detects tampered state patches', () => {
	const recording = StorySessionRecorder.start({
		storyId: 'story_test_2',
		initialState: { value: 1 },
	});
	StorySessionRecorder.append(recording, {
		storyId: 'story_test_2',
		kind: 'CANONICAL_COMMAND',
		source: 'AI',
		startedAt: '2026-10-05T10:00:00.000Z',
		completedAt: '2026-10-05T10:00:00.100Z',
		success: true,
		rolledBack: false,
		stateBefore: { value: 1 },
		stateAfter: { value: 2 },
	});
	recording.interactions[0].statePatch[0].value = 999;
	const validation = StorySessionRecorder.validate(recording);
	assert.equal(validation.valid, false);
});


test('story session recorder rejects a state-before mismatch before appending', () => {
	const recording = StorySessionRecorder.start({
		storyId: 'story_state_mismatch',
		initialState: { value: 1 },
	});
	StorySessionRecorder.append(recording, {
		storyId: 'story_state_mismatch',
		kind: 'DIRECT_TURN',
		source: 'AI',
		startedAt: '2026-10-16T10:00:00.000Z',
		completedAt: '2026-10-16T10:00:00.100Z',
		success: true,
		rolledBack: false,
		stateBefore: { value: 1 },
		stateAfter: { value: 2 },
	});

	assert.throws(
		() => StorySessionRecorder.append(recording, {
			storyId: 'story_state_mismatch',
			kind: 'DIRECT_TURN',
			source: 'AI',
			startedAt: '2026-10-16T10:00:01.000Z',
			completedAt: '2026-10-16T10:00:01.100Z',
			success: true,
			rolledBack: false,
			stateBefore: { value: 999 },
			stateAfter: { value: 1000 },
		}),
		/Story session state-before mismatch/,
	);
	assert.equal(recording.interactions.length, 1);
	assert.equal(StorySessionRecorder.validate(recording).valid, true);
});

test('story session recorder refuses to append after it has been stopped', () => {
	const recording = StorySessionRecorder.start({
		storyId: 'story_stopped',
		initialState: { value: 1 },
	});
	StorySessionRecorder.stop(recording);

	assert.throws(
		() => StorySessionRecorder.append(recording, {
			storyId: 'story_stopped',
			kind: 'DIRECT_TURN',
			source: 'AI',
			startedAt: '2026-10-16T10:00:00.000Z',
			completedAt: '2026-10-16T10:00:00.100Z',
			success: true,
			rolledBack: false,
			stateBefore: { value: 1 },
			stateAfter: { value: 2 },
		}),
		/Cannot append to a stopped story session recording/,
	);
	assert.equal(StorySessionRecorder.validate(recording).valid, true);
});


test('recording-integrity errors do not fail canonical repository interaction recording', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('story_recorder_boundary');
	repository.recordStorySessionInteraction({
		storyId: 'story_recorder_boundary',
		kind: 'DIRECT_TURN',
		source: 'AI',
		startedAt: '2026-10-16T10:00:00.000Z',
		completedAt: '2026-10-16T10:00:00.100Z',
		success: true,
		rolledBack: false,
		stateBefore: { value: 1 },
		stateAfter: { value: 2 },
	});
	assert.doesNotThrow(() => repository.recordStorySessionInteraction({
		storyId: 'story_recorder_boundary',
		kind: 'DIRECT_TURN',
		source: 'AI',
		startedAt: '2026-10-16T10:00:01.000Z',
		completedAt: '2026-10-16T10:00:01.100Z',
		success: true,
		rolledBack: false,
		stateBefore: { value: 999 },
		stateAfter: { value: 1000 },
	}));
	assert.equal(repository.getStorySessionRecording('story_recorder_boundary')?.interactions.length, 1);
});


test('a first-interaction state-before mismatch cannot rewrite the recording initial state', () => {
	const recording = StorySessionRecorder.start({
		storyId: 'story_initial_state_immutable',
		runSessionId: 'run_initial_state_immutable',
		initialState: { value: 1 },
	});

	assert.throws(
		() => StorySessionRecorder.append(recording, {
			storyId: 'story_initial_state_immutable',
			kind: 'DIRECT_TURN',
			source: 'AI',
			startedAt: '2026-10-16T10:00:00.000Z',
			completedAt: '2026-10-16T10:00:00.100Z',
			success: true,
			rolledBack: false,
			stateBefore: { value: 999 },
			stateAfter: { value: 1000 },
		}),
		/Story session state-before mismatch/,
	);
	assert.deepEqual(recording.initialState, { value: 1 });
	assert.equal(recording.interactions.length, 0);
});

test('session recording store isolates recordings and sequence cursors by runSessionId', () => {
	const root = mkdtempSync(join(tmpdir(), 'dreamville-recordings-'));
	try {
		const store = new StorySessionRecordingStore(root, { enabled: true });
		const first = StorySessionRecorder.start({
			storyId: 'reused_story_id',
			runSessionId: 'run_a',
			initialState: { run: 'a' },
		});
		StorySessionRecorder.append(first, {
			storyId: 'reused_story_id',
			kind: 'DIRECT_TURN',
			source: 'AI',
			startedAt: '2026-10-16T10:00:00.000Z',
			completedAt: '2026-10-16T10:00:00.100Z',
			success: true,
			rolledBack: false,
			stateBefore: { run: 'a' },
			stateAfter: { run: 'a', turn: 1 },
		});
		store.save(first);

		const second = StorySessionRecorder.start({
			storyId: 'reused_story_id',
			runSessionId: 'run_b',
			initialState: { run: 'b' },
		});
		store.save(second);

		const loadedFirst = store.load('reused_story_id', 'run_a');
		const loadedSecond = store.load('reused_story_id', 'run_b');
		assert.ok(loadedFirst);
		assert.ok(loadedSecond);
		assert.equal(loadedFirst.recordingId, first.recordingId);
		assert.equal(loadedSecond.recordingId, second.recordingId);
		assert.equal(loadedFirst.runSessionId, 'run_a');
		assert.equal(loadedSecond.runSessionId, 'run_b');
		assert.equal(loadedFirst.interactions.length, 1);
		assert.equal(loadedSecond.interactions.length, 0);
		assert.deepEqual(loadedFirst.initialState, { run: 'a' });
		assert.deepEqual(loadedSecond.initialState, { run: 'b' });
		assert.equal(store.load('reused_story_id', 'run_missing'), null);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('repository starts a distinct recording when a storyId is reused for a new StoryRun', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'story_recording_run_reuse';
	repository.seedStory(storyId);

	const firstRun = repository.getStoryRun(storyId)!;
	firstRun.createdAt = '2026-10-16T10:00:00.000Z';
	firstRun.activeCharacterId = 'character_first_run';
	firstRun.worldId = 'world_first_run';
	firstRun.worldVersion = 1;
	repository.saveStoryRun(firstRun);

	const firstInitialState = { turn: 0, player: 'first' };
	const first = repository.ensureStorySessionRecording(storyId, 'First Run', firstInitialState);
	repository.recordStorySessionInteraction({
		storyId,
		kind: 'DIRECT_TURN',
		source: 'AI',
		startedAt: '2026-10-16T10:00:01.000Z',
		completedAt: '2026-10-16T10:00:01.100Z',
		success: true,
		rolledBack: false,
		stateBefore: firstInitialState,
		stateAfter: { turn: 1, player: 'first' },
	});

	const secondRun = {
		...repository.getStoryRun(storyId)!,
		createdAt: '2026-10-16T11:00:00.000Z',
		activeCharacterId: 'character_second_run',
		worldId: 'world_second_run',
		worldVersion: 2,
	};
	repository.saveStoryRun(secondRun);

	assert.equal(repository.getStorySessionRecording(storyId), null);
	const secondInitialState = { turn: 0, player: 'second' };
	const second = repository.ensureStorySessionRecording(storyId, 'Second Run', secondInitialState);
	assert.notEqual(second.recordingId, first.recordingId);
	assert.notEqual(second.runSessionId, first.runSessionId);
	assert.equal(second.interactions.length, 0);
	assert.deepEqual(second.initialState, secondInitialState);
	assert.equal(first.interactions.length, 1, 'The prior run recording remains intact in its own object.');
});


test('story session recorder preserves a continuous patch chain across denormalized runtimeState resaves', () => {
	const initial = {
		storyId: 'story_runtime_state_reserialization',
		player: { locationId: 'loc_orrery', hp: 10 },
		adaptation: {
			ch16Run: {
				storyId: 'story_runtime_state_reserialization',
				canonicalEvents: [],
				runtimeState: { narrativeContextHistory: [], materializedEngineState: { revision: 1 } },
			},
		},
	};
	const recording = StorySessionRecorder.start({
		storyId: 'story_runtime_state_reserialization',
		initialState: initial,
	});

	const firstAfter = JSON.parse(JSON.stringify(initial));
	firstAfter.player.locationId = 'loc_gate';
	firstAfter.adaptation.ch16Run.runtimeState = {
		...firstAfter.adaptation.ch16Run.runtimeState,
		narrativeContextHistory: [{ actionId: 'turn_1' }],
		materializedEngineState: { revision: 2 },
	};
	StorySessionRecorder.append(recording, {
		storyId: 'story_runtime_state_reserialization',
		kind: 'DIRECT_TURN',
		source: 'HTTP_ACTION',
		startedAt: '2026-10-16T11:00:00.000Z',
		completedAt: '2026-10-16T11:00:00.100Z',
		success: true,
		rolledBack: false,
		stateBefore: initial,
		stateAfter: firstAfter,
	});

	// A repository save reserializes denormalized StoryRun.runtimeState after the
	// previous canonical-command recorder boundary. Canonical state is unchanged.
	const secondBefore = JSON.parse(JSON.stringify(firstAfter));
	secondBefore.adaptation.ch16Run.runtimeState = {
		...secondBefore.adaptation.ch16Run.runtimeState,
		workingContextPins: ['scene:current'],
		materializedEngineState: { revision: 3 },
	};
	const secondAfter = JSON.parse(JSON.stringify(secondBefore));
	secondAfter.player.locationId = 'loc_vault';
	secondAfter.adaptation.ch16Run.runtimeState.narrativeContextHistory.push({ actionId: 'turn_2' });
	secondAfter.adaptation.ch16Run.runtimeState.materializedEngineState = { revision: 4 };

	StorySessionRecorder.append(recording, {
		storyId: 'story_runtime_state_reserialization',
		kind: 'DIRECT_TURN',
		source: 'HTTP_ACTION',
		startedAt: '2026-10-16T11:00:01.000Z',
		completedAt: '2026-10-16T11:00:01.100Z',
		success: true,
		rolledBack: false,
		stateBefore: secondBefore,
		stateAfter: secondAfter,
	});

	assert.equal(recording.interactions.length, 2);
	assert.ok(
		recording.interactions[1].statePatch.some((operation) =>
			operation.path.startsWith('/adaptation/ch16Run/runtimeState'),
		),
		'the second patch must retain intervening StoryRun runtimeState updates for reconstruction',
	);
	assert.equal(StorySessionRecorder.validate(recording).valid, true);
	assert.deepEqual(StorySessionRecorder.applyPatches(recording), secondAfter);

	// The normalization applies only to the denormalized runtimeState bundle;
	// a real canonical player-location change in stateBefore must still fail.
	const tamperedCanonicalBefore = JSON.parse(JSON.stringify(secondAfter));
	tamperedCanonicalBefore.player.locationId = 'loc_fabricated';
	assert.throws(
		() => StorySessionRecorder.append(recording, {
			storyId: 'story_runtime_state_reserialization',
			kind: 'DIRECT_TURN',
			source: 'HTTP_ACTION',
			startedAt: '2026-10-16T11:00:02.000Z',
			completedAt: '2026-10-16T11:00:02.100Z',
			success: true,
			rolledBack: false,
			stateBefore: tamperedCanonicalBefore,
			stateAfter: { ...tamperedCanonicalBefore, turn: 3 },
		}),
		/Story session state-before mismatch/,
	);
	assert.equal(recording.interactions.length, 2);
});
