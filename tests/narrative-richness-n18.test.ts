import test from 'node:test';
import assert from 'node:assert/strict';

import { NarrativeRichnessEvaluator } from '../server/domain/narrativeRichnessEvaluation';
import { LiteraryNarrativeReview } from '../server/domain/literaryNarrativeReview';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function makeIntent(overrides: Record<string, any> = {}) {
	return {
		action: 'investigate',
		goal: 'inspect the sealed archive',
		interactionMode: 'EXPLORATION',
		speechIntent: false,
		movementIntent: false,
		observationIntent: true,
		informationGoal: 'determine why the archive was sealed',
		explicitTargets: [],
		impliedTargets: [],
		confidence: 1,
		source: 'DETERMINISTIC',
		originalText: 'I inspect the sealed archive.',
		...overrides,
	};
}

function makeSituation() {
	return {
		storyId: 'n18-story',
		turnId: 'turn-18',
		worldTime: 'Night',
		location: {
			id: 'loc_archive',
			name: 'Rain-soaked Archive',
			regionId: 'region_harbor',
			description: 'A narrow archive with a brass desk, stone shelves, and a sealed iron cabinet.',
			ambientSensory: 'Rain taps the high windows while lamp smoke hangs above the desk.',
			connectedLocations: [],
		},
		nearbyEntities: [
			{ id: 'mara', name: 'Mara', visibleToPlayer: true },
			{ id: 'guard', name: 'Guard', visibleToPlayer: true },
		],
		visibleEvents: [{ summary: 'The archive door was sealed after the last inspection.' }],
		activeDialogue: { speakerId: 'mara', speakerName: 'Mara', text: 'You came back.' },
		recentTurns: [
			{
				playerAction: 'I return to the archive.',
				narration: 'The sealed archive still waits beneath the rain.',
				worldTime: 'Earlier',
			},
		],
	} as any;
}

function makePlan(overrides: Record<string, any> = {}) {
	return {
		sceneComposition: {
			beatType: 'REVELATION',
			pacingShape: 'STANDARD_BEAT',
			emotionalMovement: 'TURN',
			sensoryAnchor: 'Rain taps the windows.',
			narrativeFocus: ['sealed archive', 'Mara'],
			subtext: ['Mara deflects the question and refuses to answer.'],
			reactionPriority: ['Mara', 'Guard'],
			tensionDirection: 'TURN',
			closingBeat: 'Land the immediate implication of the discovered seal.',
			reveal: ['The seal is damaged from the inside.'],
			...(overrides.sceneComposition || {}),
		},
		episodeProjection: {
			recentBeats: ['The archive was sealed after the last inspection.'],
			continuityAnchors: ['Mara returned to the archive after the accusation.'],
			trajectory: 'TURN',
			...(overrides.episodeProjection || {}),
		},
	} as any;
}

function turn(narrative: string, dialogue: Array<{ speaker: string; text: string }> = []) {
	return {
		narrative: [narrative],
		dialogue,
		events: [],
		stateChanges: [],
		memoryCandidates: [],
		audioCues: [],
		visualCues: [],
	} as any;
}

test('N18 passes a grounded, characterful narration with multiple richness signals', () => {
	const evaluation = NarrativeRichnessEvaluator.evaluate({
		intent: makeIntent(),
		situation: makeSituation(),
		plan: makePlan(),
		turnPackage: turn(
			"Rain needles the archive windows as Mara's fingers tighten around the cracked seal. 'You came back,' she says, but she does not meet your eyes. The brass desk shivers when thunder rolls; the cold stone carries a metallic smell as the damaged seal cuts inward through the iron. The warning in Mara's voice makes the risk plain, and her hesitation says more than the answer she refuses to give. She exhales slowly and slides the letter toward you, leaving the accusation hanging between you.",
			[{ speaker: 'Mara', text: 'You came back.' }],
		),
		previousNarrations: ['The sealed archive still waits beneath the rain.'],
	});
	assert.equal(evaluation.decision, 'PASS');
	assert.ok(evaluation.overallScore >= 0.68);
	assert.ok(evaluation.dimensions.some((item) => item.dimension === 'SPECIFICITY' && item.status !== 'WEAK'));
	assert.ok(evaluation.dimensions.some((item) => item.dimension === 'SUBTEXT' && item.status !== 'WEAK'));
	assert.ok(evaluation.dimensions.some((item) => item.dimension === 'SENSORY_VARIETY' && item.status !== 'WEAK'));
});

test('N18 flags flat generic narration for improvement without changing canonical state', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n18-flat';
	repository.seedStory(storyId);
	const before = JSON.stringify(repository.getStoryRun(storyId));
	const evaluation = NarrativeRichnessEvaluator.evaluate({
		intent: makeIntent(),
		situation: makeSituation(),
		plan: makePlan(),
		turnPackage: turn('You look at the room. Mara says hello. The room is there. Everything seems normal.'),
	});
	const after = JSON.stringify(repository.getStoryRun(storyId));
	assert.equal(evaluation.decision, 'IMPROVE');
	assert.ok(evaluation.issues.length > 0);
	assert.ok(evaluation.issues.some((issue) => issue.dimension === 'SPECIFICITY' || issue.dimension === 'SUBTEXT' || issue.dimension === 'SETUP_PAYOFF'));
	assert.equal(after, before);
});

test('N18 does not punish a focused micro-turn for lacking unnecessary sensory channels', () => {
	const intent = makeIntent({
		action: 'observe',
		goal: 'notice the key',
		interactionMode: 'PASSIVE_OBSERVATION',
		observationIntent: true,
		informationGoal: undefined,
		originalText: 'I notice the key.',
	});
	const plan = makePlan({
		sceneComposition: {
			beatType: 'MICRO_ACTION',
			pacingShape: 'MICRO_BEAT',
			emotionalMovement: 'HOLD',
			sensoryAnchor: undefined,
			reactionPriority: [],
			tensionDirection: 'STEADY',
			subtext: [],
		},
	});
	const evaluation = NarrativeRichnessEvaluator.evaluate({
		intent,
		situation: makeSituation(),
		plan,
		turnPackage: turn('The key catches one brief glint beneath the desk.'),
	});
	const sensory = evaluation.dimensions.find((item) => item.dimension === 'SENSORY_VARIETY')!;
	assert.ok(sensory.score >= 0.68);
	assert.notEqual(sensory.status, 'WEAK');
});

test('N18 catches consequential player-agency takeover as a high-severity richness issue', () => {
	const evaluation = NarrativeRichnessEvaluator.evaluate({
		intent: makeIntent(),
		situation: makeSituation(),
		plan: makePlan(),
		turnPackage: turn('You decide to attack Mara, take the letter, and leave the archive before anyone can stop you.'),
	});
	const agency = evaluation.dimensions.find((item) => item.dimension === 'PLAYER_AGENCY')!;
	assert.equal(agency.status, 'WEAK');
	assert.ok(evaluation.issues.some((issue) => issue.dimension === 'PLAYER_AGENCY' && issue.severity === 'HIGH'));
	assert.equal(evaluation.decision, 'IMPROVE');
});

test('N18 returns a deterministic fallback result for empty narration', () => {
	const evaluation = NarrativeRichnessEvaluator.evaluate({
		intent: makeIntent(),
		situation: makeSituation(),
		plan: makePlan(),
		turnPackage: turn(''),
	});
	assert.equal(evaluation.decision, 'IMPROVE');
	assert.equal(evaluation.overallScore, 0);
	assert.equal(evaluation.source, 'DETERMINISTIC');
	assert.match(evaluation.fallbackReason || '', /No narration text/i);
});

test('N18 richness cues are carried into the existing literary rewrite prompt without adding a second review surface', () => {
	const evaluation = NarrativeRichnessEvaluator.evaluate({
		intent: makeIntent(),
		situation: makeSituation(),
		plan: makePlan(),
		turnPackage: turn('You see the room. Everything looks ordinary.'),
	});
	const prompt = LiteraryNarrativeReview.buildRewritePrompt({
		review: {
			decision: 'ACCEPT',
			issues: [],
			score: 100,
			source: 'DETERMINISTIC',
			confidence: 1,
		},
		richnessEvaluation: evaluation,
		turnPackage: turn('You see the room. Everything looks ordinary.'),
		intent: makeIntent(),
		situation: makeSituation(),
		plan: makePlan(),
	});
	assert.match(prompt, /N18 richness improvement guidance/i);
	assert.match(prompt, /Improve presentation richness only/i);
});

test('N18 evaluator remains presentation-only in the production orchestrator source', async () => {
	const fs = await import('node:fs/promises');
	const source = await fs.readFile(new URL('../server/domain/aiOrchestrator.ts', import.meta.url), 'utf8');
	assert.match(source, /NarrativeRichnessEvaluator\.evaluate/);
	assert.match(source, /narrativeRichnessEvaluation/);
	assert.doesNotMatch(source, /postRichness\.decision !== 'PASS'/);
	assert.match(source, /narrative\.review/);
});

test('N18 does not spend a second provider call on fallback candidates for richness-only improvement', async () => {
	const fs = await import('node:fs/promises');
	const source = await fs.readFile(new URL('../server/domain/aiOrchestrator.ts', import.meta.url), 'utf8');
	assert.match(
		source,
		/const needsLiteraryRewrite = literary\.decision === 'REWRITE' \|\| \(cIdx === 0 && narrativeRichnessEvaluation\.decision === 'IMPROVE'\);/,
	);
});
