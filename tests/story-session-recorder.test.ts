import assert from 'node:assert/strict';
import test from 'node:test';
import { StorySessionRecorder } from '../server/domain/storySessionRecorder';

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


test('story session recorder rejects a state-before mismatch at append time', () => {
	const recording = StorySessionRecorder.start({
		storyId: 'story_state_mismatch',
		runSessionId: 'run_1',
		initialState: { value: 1 },
	});

	assert.throws(
		() => StorySessionRecorder.append(recording, {
			storyId: 'story_state_mismatch',
			kind: 'DIRECT_TURN',
			source: 'AI',
			startedAt: '2026-10-05T10:00:00.000Z',
			completedAt: '2026-10-05T10:00:00.100Z',
			success: true,
			rolledBack: false,
			stateBefore: { value: 999 },
			stateAfter: { value: 2 },
		}),
		/Story session state-before mismatch/,
	);
	assert.equal(recording.interactions.length, 0);
});

test('story session recorder creates isolated recordings for distinct run sessions', () => {
	const first = StorySessionRecorder.start({
		storyId: 'same_story',
		runSessionId: 'run_a',
		initialState: { character: 'Elenion' },
	});
	const second = StorySessionRecorder.start({
		storyId: 'same_story',
		runSessionId: 'run_b',
		initialState: { character: 'Scribe Vael' },
	});

	assert.notEqual(first.recordingId, second.recordingId);
	assert.notEqual(first.runSessionId, second.runSessionId);
	assert.equal(first.initialState && (first.initialState as any).character, 'Elenion');
	assert.equal(second.initialState && (second.initialState as any).character, 'Scribe Vael');
	assert.equal(StorySessionRecorder.validate(first).valid, true);
	assert.equal(StorySessionRecorder.validate(second).valid, true);
});

test('story session recorder rejects appending after stop', () => {
	const recording = StorySessionRecorder.start({
		storyId: 'story_stopped',
		runSessionId: 'run_stopped',
		initialState: { value: 1 },
	});
	StorySessionRecorder.stop(recording);

	assert.throws(
		() => StorySessionRecorder.append(recording, {
			storyId: 'story_stopped',
			kind: 'DIRECT_TURN',
			source: 'AI',
			startedAt: '2026-10-05T10:00:00.000Z',
			completedAt: '2026-10-05T10:00:00.100Z',
			success: true,
			rolledBack: false,
			stateBefore: { value: 1 },
			stateAfter: { value: 2 },
		}),
		/Cannot append to a stopped story session recording/,
	);
});
