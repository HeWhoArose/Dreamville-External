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


test('story session recorder preserves runtimeState and hashes it across explicit boundary-gap interactions', () => {
	const initial = {
		storyId: 'story_runtime_state_reserialization',
		worldClock: { seconds: 10 },
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

	// A persistence/runtime subsystem changes runtimeState between the previous
	// recorded post-state and the next command boundary. The mismatch is recorded
	// as its own AUXILIARY transition, never silently merged into the next command.
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

	assert.equal(StorySessionRecorder.appendBoundaryTransitionIfNeeded(recording, {
		storyId: 'story_runtime_state_reserialization',
		stateBefore: secondBefore,
		nextInteractionKind: 'DIRECT_TURN',
		nextInteractionSource: 'HTTP_ACTION',
	}), true);
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

	assert.equal(recording.interactions.length, 3);
	assert.equal(recording.interactions[1].kind, 'AUXILIARY');
	assert.equal(recording.interactions[1].source, 'STORY_SESSION_BOUNDARY_RECONCILIATION');
	assert.ok(
		recording.interactions[1].statePatch.some((operation) =>
			operation.path.startsWith('/adaptation/ch16Run/runtimeState'),
		),
		'the gap patch must retain intervening runtimeState updates for reconstruction',
	);
	assert.equal(StorySessionRecorder.validate(recording).valid, true);
	assert.deepEqual(StorySessionRecorder.applyPatches(recording), secondAfter);

	// Hashing must cover runtimeState too: a tampered runtimeState patch is an
	// integrity failure, while a real canonical location mismatch is still rejected.
	const tamperedRecording = StorySessionRecorder.export(recording);
	const runtimeStatePatch = tamperedRecording.interactions[1].statePatch.find((operation) =>
		operation.path.startsWith('/adaptation/ch16Run/runtimeState') && Object.prototype.hasOwnProperty.call(operation, 'value'),
	);
	assert.ok(runtimeStatePatch, 'the test must find a value-bearing runtimeState patch');
	runtimeStatePatch!.value = { tampered: true };
	assert.equal(StorySessionRecorder.validate(tamperedRecording).valid, false);

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
	assert.equal(recording.interactions.length, 3);
});


test('repository records out-of-band canonical snapshot changes as explicit AUXILIARY interactions', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'story_boundary_gap_' + Date.now();
	repository.seedStory(storyId);
	const initial = {
		storyId,
		worldClock: { seconds: 10 },
		player: { locationId: 'loc_orrery', hp: 10 },
		adaptation: { ch16Run: { storyId, canonicalEvents: [], runtimeState: { cacheRevision: 1 } } },
	};
	const afterFirst = JSON.parse(JSON.stringify(initial));
	afterFirst.player.locationId = 'loc_gate';
	const now = '2026-10-16T11:10:00.000Z';
	repository.recordStorySessionInteraction({
		storyId,
		kind: 'DIRECT_TURN',
		source: 'HTTP_ACTION',
		startedAt: now,
		completedAt: now,
		success: true,
		rolledBack: false,
		stateBefore: initial,
		stateAfter: afterFirst,
	});

	const afterBoundaryMutation = JSON.parse(JSON.stringify(afterFirst));
	afterBoundaryMutation.adaptation.ch16Run.runtimeState.cacheRevision = 2;
	afterBoundaryMutation.adaptation.ch16Run.runtimeState.derivedProjection = { refreshed: true };
	const afterSecond = JSON.parse(JSON.stringify(afterBoundaryMutation));
	afterSecond.player.locationId = 'loc_vault';
	repository.recordStorySessionInteraction({
		storyId,
		kind: 'DIRECT_TURN',
		source: 'HTTP_ACTION',
		startedAt: '2026-10-16T11:10:01.000Z',
		completedAt: '2026-10-16T11:10:01.100Z',
		success: true,
		rolledBack: false,
		stateBefore: afterBoundaryMutation,
		stateAfter: afterSecond,
	});

	const recording = repository.getStorySessionRecording(storyId);
	assert.ok(recording);
	assert.equal(recording!.interactions.length, 3);
	assert.equal(recording!.interactions[1].kind, 'AUXILIARY');
	assert.equal(recording!.interactions[1].source, 'STORY_SESSION_BOUNDARY_RECONCILIATION');
	assert.equal(StorySessionRecorder.validate(recording).valid, true);
	assert.deepEqual(StorySessionRecorder.applyPatches(recording), afterSecond);
});
