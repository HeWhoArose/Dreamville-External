import test from 'node:test';
import assert from 'node:assert/strict';

import { NarrativeRichnessEvaluator } from '../server/domain/narrativeRichnessEvaluation';

function intent(overrides: Record<string, unknown> = {}) {
	return {
		action: 'attempt_action',
		interactionMode: 'DIRECT_INTERACTION',
		speechIntent: false,
		movementIntent: false,
		observationIntent: false,
		explicitTargets: [],
		impliedTargets: [],
		confidence: 0.9,
		source: 'DETERMINISTIC',
		originalText: 'I ready my blade and check my armour',
		...overrides,
	} as any;
}

function situation() {
	return {
		location: {
			id: 'arena',
			name: 'Grand Colosseum',
			ambientSensory: 'distant crowd noise',
		},
		nearbyEntities: [],
		visibleEvents: [],
	} as any;
}

function plan() {
	return {
		sceneComposition: {
			pacingShape: 'STANDARD',
			closingBeat: 'the equipment is ready',
			reactionPriority: [],
		},
		episodeProjection: {},
	} as any;
}

function turn(narrative: string) {
	return {
		narrative: [narrative],
		dialogue: [],
		events: [],
		stateChanges: [],
		memoryCandidates: [],
		audioCues: [],
		visualCues: [],
	} as any;
}

test('narrative substance passes when the player action is actually resolved', () => {
	const evaluation = NarrativeRichnessEvaluator.evaluate({
		intent: intent(),
		situation: situation(),
		plan: plan(),
		turnPackage: turn('I draw the blade, test its edge, tighten the loose armour strap, and settle the weight across my shoulders. The equipment is secure and I return my hand to the hilt.'),
	});

	const substance = evaluation.dimensions.find((item) => item.dimension === 'ACTION_SUBSTANCE');
	assert.ok(substance);
	assert.ok((substance?.score || 0) >= 0.50);
});

test('narrative substance rejects atmosphere-only padding for a concrete player action', () => {
	const evaluation = NarrativeRichnessEvaluator.evaluate({
		intent: intent(),
		situation: situation(),
		plan: plan(),
		turnPackage: turn('The colossal stone tiers rise beneath the bruised autumn sky. Brass catches the fading light while distant voices roll through the arena. Dust hangs in the warm air and shadows stretch across the floor.'),
	});

	const substance = evaluation.dimensions.find((item) => item.dimension === 'ACTION_SUBSTANCE');
	assert.ok(substance);
	assert.ok((substance?.score || 0) < 0.50);
	assert.equal(evaluation.decision, 'IMPROVE');
});

test('information turns require a response or a bounded lack of answer', () => {
	const evaluation = NarrativeRichnessEvaluator.evaluate({
		intent: intent({
			action: 'ask',
			interactionMode: 'DIALOGUE',
			speechIntent: true,
			originalText: 'I ask the registrar what I am to do',
		}),
		situation: situation(),
		plan: plan(),
		turnPackage: turn('The registrar looks up. The arena corridors are lined with old brass and stone, and the afternoon light falls across the floor.'),
	});

	const substance = evaluation.dimensions.find((item) => item.dimension === 'ACTION_SUBSTANCE');
	assert.ok(substance);
	assert.ok((substance?.score || 0) < 0.50);
});
