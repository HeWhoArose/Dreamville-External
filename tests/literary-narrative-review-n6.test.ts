import test from 'node:test';
import assert from 'node:assert/strict';
import { LiteraryNarrativeReview } from '../server/domain/literaryNarrativeReview';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';

function intent() {
	return {
		action: 'look around',
		goal: 'observe the room',
		interactionMode: 'PASSIVE_OBSERVATION' as const,
		speechIntent: false,
		movementIntent: false,
		observationIntent: true,
		informationGoal: undefined,
		explicitTargets: [],
		impliedTargets: [],
		confidence: 1,
		source: 'DETERMINISTIC' as const,
		originalText: 'I look around.',
	};
}

function setup(storyId: string) {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);
	const situation = CurrentSituationBuilder.build({ storyId, playerAction: 'I look around.', worldRepo: repository });
	const research = NarrativeResearchPipeline.research({ repository, storyId, currentSituation: situation, playerIntent: intent(), playerAction: 'I look around.' });
	const plan = NarrativeDirector.create({ repository, storyId, situation, intent: intent(), research });
	return { repository, situation, plan };
}

test('N6 flags generic AI-like openings', () => {
	const { situation, plan } = setup('n6_generic');
	const review = LiteraryNarrativeReview.review({ intent: intent(), situation, plan, turnPackage: { narrative: ['The figure looks at you. The figure stands quietly.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] } });
	assert.ok(review.issues.some((issue) => issue.code === 'GENERIC_OPENING'));
});

test('N6 detects repeated phrase structure without changing canonical state', () => {
	const { repository, situation, plan } = setup('n6_repeat');
	const before = repository.getCanonicalCommandEvents('n6_repeat').length;
	const review = LiteraryNarrativeReview.review({ intent: intent(), situation, plan, turnPackage: { narrative: ['Cold wind moves through the stone hall, and the cold wind moves through the stone hall.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] } });
	assert.ok(review.issues.some((issue) => issue.code === 'REPETITIVE_PHRASE'));
	assert.equal(repository.getCanonicalCommandEvents('n6_repeat').length, before);
});

test('N6 accepts concrete scene-specific narration', () => {
	const { situation, plan } = setup('n6_specific');
	const review = LiteraryNarrativeReview.review({ intent: intent(), situation, plan, turnPackage: { narrative: ['The brass orrery ticks beside the cracked archway while blue light catches on the dust above the floor.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] } });
	assert.equal(review.decision, 'ACCEPT');
	assert.ok(review.score >= 80);
});

test('N6 review is independent from semantic canonical review', () => {
	const { situation, plan } = setup('n6_separation');
	const review = LiteraryNarrativeReview.review({ intent: intent(), situation, plan, turnPackage: { narrative: ['The figure looks at you.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] } });
	assert.equal(review.source, 'DETERMINISTIC');
	assert.ok(review.score < 100);
});


test('N6 flags a report that contains atmosphere but no substantive response', () => {
	const { situation, plan } = setup('n6_report_substance');
	const reportIntent = {
		action: 'report',
		goal: 'communicate_with_target',
		interactionMode: 'DIALOGUE' as const,
		speechIntent: true,
		movementIntent: false,
		observationIntent: false,
		informationGoal: undefined,
		explicitTargets: [],
		impliedTargets: [],
		confidence: 1,
		source: 'DETERMINISTIC' as const,
		originalText: 'I report to the registrar.',
	};
	const review = LiteraryNarrativeReview.review({
		intent: reportIntent,
		situation,
		plan,
		turnPackage: {
			narrative: ['The corridor smells of dust. Bronze lamps cast long shadows across the stone floor. The distant crowd rolls like thunder through the arena.'],
			dialogue: [],
			events: [],
			stateChanges: [],
			memoryCandidates: [],
			audioCues: [],
		},
	});
	assert.equal(review.decision, 'REWRITE');
	assert.ok(review.issues.some((issue) => issue.code === 'LOW_ACTION_SUBSTANCE'));
});

test('N6 accepts a report with an actual response', () => {
	const { situation, plan } = setup('n6_report_response');
	const reportIntent = {
		action: 'report',
		goal: 'communicate_with_target',
		interactionMode: 'DIALOGUE' as const,
		speechIntent: true,
		movementIntent: false,
		observationIntent: false,
		informationGoal: undefined,
		explicitTargets: [],
		impliedTargets: [],
		confidence: 1,
		source: 'DETERMINISTIC' as const,
		originalText: 'I report to the registrar.',
	};
	const review = LiteraryNarrativeReview.review({
		intent: reportIntent,
		situation,
		plan,
		turnPackage: {
			narrative: ['You give the registrar your report. She listens, asks for the missing detail, and directs you to wait by the eastern gate.'],
			dialogue: [{ speaker: 'Registrar', text: 'Wait by the eastern gate.' }],
			events: [],
			stateChanges: [],
			memoryCandidates: [],
			audioCues: [],
		},
	});
	assert.equal(review.issues.some((issue) => issue.code === 'LOW_ACTION_SUBSTANCE'), false);
});
