import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { NarrativeNoveltyEngine } from '../server/domain/narrativeNoveltyEngine';
import { LiteraryNarrativeReview } from '../server/domain/literaryNarrativeReview';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';

test('N7 persists repeated motifs and identifies them on later turns', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n7_repeat');
	NarrativeNoveltyEngine.recordAcceptedTurn({ repository, storyId: 'n7_repeat', narration: 'The shadows danced across the stone wall while cold wind moved through the chamber.', turnNumber: 1 });
	NarrativeNoveltyEngine.recordAcceptedTurn({ repository, storyId: 'n7_repeat', narration: 'The shadows danced across the stone wall while the guard watched.', turnNumber: 2 });
	const state = NarrativeNoveltyEngine.resolve(repository, 'n7_repeat');
	const inspection = NarrativeNoveltyEngine.inspect({ repository, storyId: 'n7_repeat', narration: 'The shadows danced across the stone wall again.' });
	assert.ok(state.items.some((item) => item.category === 'TROPE' && item.key === 'dancing_shadows'));
	assert.ok(inspection.discouraged.length > 0);
});

test('N7 bounds its persistent ledger', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n7_bound');
	for (let i = 0; i < 20; i += 1) NarrativeNoveltyEngine.recordAcceptedTurn({ repository, storyId: 'n7_bound', narration: 'A fresh phrase ' + i + ' appears in the room.', turnNumber: i + 1 });
	assert.ok(NarrativeNoveltyEngine.resolve(repository, 'n7_bound').items.length <= 120);
});

test('N7 literary review can flag a repeated trope without changing canonical state', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n7_review');
	NarrativeNoveltyEngine.recordAcceptedTurn({ repository, storyId: 'n7_review', narration: 'The shadows danced across the stone wall.', turnNumber: 1 });
	NarrativeNoveltyEngine.recordAcceptedTurn({ repository, storyId: 'n7_review', narration: 'The shadows danced across the stone wall.', turnNumber: 2 });
	const situation = CurrentSituationBuilder.build({ storyId: 'n7_review', playerAction: 'I look around.', worldRepo: repository });
	const intent = { action: 'look around', goal: 'observe', interactionMode: 'PASSIVE_OBSERVATION' as const, speechIntent: false, movementIntent: false, observationIntent: true, explicitTargets: [], impliedTargets: [], confidence: 1, source: 'DETERMINISTIC' as const, originalText: 'I look around.' };
	const research = NarrativeResearchPipeline.research({ repository, storyId: 'n7_review', currentSituation: situation, playerIntent: intent, playerAction: 'I look around.' });
	const plan = NarrativeDirector.create({ repository, storyId: 'n7_review', situation, intent, research });
	const before = repository.getCanonicalCommandEvents('n7_review').length;
	const review = LiteraryNarrativeReview.review({ intent, situation, plan, turnPackage: { narrative: ['The shadows danced across the stone wall again.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] }, noveltyState: NarrativeNoveltyEngine.resolve(repository, 'n7_review') });
	assert.ok(review.issues.some((issue) => issue.code === 'REPETITIVE_PHRASE'));
	assert.equal(repository.getCanonicalCommandEvents('n7_review').length, before);
});

test('N7 does not force novelty when there is no prior repetition', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n7_fresh');
	const state = NarrativeNoveltyEngine.resolve(repository, 'n7_fresh');
	const result = NarrativeNoveltyEngine.inspect({ repository, storyId: 'n7_fresh', narration: 'Rain ticks softly against the brass housing.' });
	assert.equal(state.items.length, 0);
	assert.equal(result.discouraged.length, 0);
});


test('N7 remains bounded and does not mutate canonical command events', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n7_bounds');
	const before = repository.getCanonicalCommandEvents('n7_bounds').length;
	for (let i = 0; i < 50; i += 1) NarrativeNoveltyEngine.recordAcceptedTurn({ repository, storyId: 'n7_bounds', narration: 'A fresh observation enters the scene with a specific detail.', turnNumber: i + 1 });
	const state = NarrativeNoveltyEngine.resolve(repository, 'n7_bounds');
	assert.ok(state.items.length <= 120);
	assert.equal(repository.getCanonicalCommandEvents('n7_bounds').length, before);
});
