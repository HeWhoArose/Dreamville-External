import test from 'node:test';
import assert from 'node:assert/strict';

import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function situation() {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase2_intent_test';
	repository.seedStory(storyId);
	const currentSituation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'observe the current area',
		worldRepo: repository,
	});
	return { repository, storyId, currentSituation };
}

test('listen intent never becomes speech', () => {
	const { currentSituation } = situation();
	const intent = PlayerIntentInterpreter.deterministic(
		'I move closer to hear the rumors.',
		currentSituation,
	);

	assert.equal(intent.action, 'approach_and_listen');
	assert.equal(intent.goal, 'gather_information');
	assert.equal(intent.interactionMode, 'PASSIVE_OBSERVATION');
	assert.equal(intent.speechIntent, false);
	assert.equal(intent.movementIntent, true);
	assert.equal(intent.observationIntent, true);
});

test('information listening preserves passive intent', () => {
	const { currentSituation } = situation();
	const intent = PlayerIntentInterpreter.deterministic(
		'I listen for anything about the missing caravan.',
		currentSituation,
	);

	assert.equal(intent.interactionMode, 'PASSIVE_OBSERVATION');
	assert.equal(intent.speechIntent, false);
	assert.equal(intent.observationIntent, true);
	assert.equal(intent.goal, 'gather_information');
	assert.match(intent.informationGoal || '', /missing caravan/i);
});

test('explicit question becomes dialogue', () => {
	const { currentSituation } = situation();
	const intent = PlayerIntentInterpreter.deterministic(
		'I ask the guard what happened.',
		currentSituation,
	);

	assert.equal(intent.interactionMode, 'DIALOGUE');
	assert.equal(intent.speechIntent, true);
	assert.equal(intent.observationIntent, false);
});

test('movement and observation can coexist without speech', () => {
	const { currentSituation } = situation();
	const intent = PlayerIntentInterpreter.deterministic(
		'I quietly approach the doorway and watch the guards.',
		currentSituation,
	);

	assert.equal(intent.movementIntent, true);
	assert.equal(intent.observationIntent, true);
	assert.equal(intent.speechIntent, false);
	assert.equal(intent.interactionMode, 'EXPLORATION');
});

test('attack is classified as combat without inventing dialogue', () => {
	const { currentSituation } = situation();
	const intent = PlayerIntentInterpreter.deterministic(
		'I attack the creature with my sword.',
		currentSituation,
	);

	assert.equal(intent.interactionMode, 'COMBAT');
	assert.equal(intent.speechIntent, false);
});

test('empty input is safe and produces no action', () => {
	const intent = PlayerIntentInterpreter.deterministic('');
	assert.equal(intent.action, 'no_action');
	assert.equal(intent.confidence, 0);
});

test('malformed AI output is rejected instead of becoming canonical intent', () => {
	const { currentSituation } = situation();
	const result = PlayerIntentInterpreter.fromModel(
		{
			interactionMode: 'NOT_A_REAL_MODE',
			action: 'ask_about_rumors',
			speechIntent: true,
		},
		'I move closer to hear the rumors.',
		currentSituation,
	);

	assert.equal(result, null);
});

test('AI intent cannot introduce speech when deterministic text contains no speech intent', () => {
	const { currentSituation } = situation();
	const result = PlayerIntentInterpreter.fromModel(
		{
			action: 'ask_about_rumors',
			goal: 'gather_information',
			interactionMode: 'DIALOGUE',
			speechIntent: true,
			movementIntent: true,
			observationIntent: true,
			confidence: 0.99,
			explicitTargets: [],
			impliedTargets: [],
		},
		'I move closer to hear the rumors.',
		currentSituation,
	);

	assert.ok(result);
	assert.equal(result.speechIntent, false);
	assert.equal(result.interactionMode, 'PASSIVE_OBSERVATION');
});

test('model output retains explicit movement plus observation', () => {
	const { currentSituation } = situation();
	const result = PlayerIntentInterpreter.fromModel(
		{
			action: 'approach_and_listen',
			goal: 'gather_information',
			interactionMode: 'PASSIVE_OBSERVATION',
			speechIntent: false,
			movementIntent: true,
			observationIntent: true,
			informationGoal: 'learn the rumor',
			explicitTargets: [],
			impliedTargets: [],
			confidence: 0.95,
		},
		'I move closer to hear the rumors.',
		currentSituation,
	);

	assert.ok(result);
	assert.equal(result.action, 'approach_and_listen');
	assert.equal(result.movementIntent, true);
	assert.equal(result.observationIntent, true);
	assert.equal(result.speechIntent, false);
});


test('AI intent cannot invent a target absent from player text or visible scene', () => {
	const { currentSituation } = situation();
	const result = PlayerIntentInterpreter.fromModel(
		{
			action: 'inspect_secret_door',
			goal: 'inspect target',
			interactionMode: 'MANIPULATION',
			speechIntent: false,
			movementIntent: false,
			observationIntent: true,
			explicitTargets: [{ id: 'invented-door', name: 'Secret Door', kind: 'OBJECT' }],
			impliedTargets: [],
			confidence: 0.99,
		},
		'I inspect the wall.',
		currentSituation,
	);

	assert.ok(result);
	assert.equal(result.explicitTargets.some((target) => target.name === 'Secret Door'), false);
});
