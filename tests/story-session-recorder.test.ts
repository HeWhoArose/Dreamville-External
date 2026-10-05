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
	assert.equal(
		JSON.stringify(StorySessionRecorder.applyPatches(recording)),
		JSON.stringify(recording.finalState),
	);
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
