import test from 'node:test';
import assert from 'node:assert/strict';
import { NarrativeContinuityStateEngine } from '../server/domain/narrativeContinuityState';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import type { PlayerIntent } from '../server/domain/playerIntentInterpreter';

function intent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
	return {
		action: 'listen_and_observe',
		goal: 'gather information',
		interactionMode: 'PASSIVE_OBSERVATION',
		speechIntent: false,
		movementIntent: false,
		observationIntent: true,
		informationGoal: 'what is happening here',
		explicitTargets: [],
		impliedTargets: [],
		confidence: 1,
		source: 'DETERMINISTIC',
		originalText: 'I listen.',
		...overrides,
	};
}

test('N4 starts bounded and deterministic', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n4_default');
	const state = NarrativeContinuityStateEngine.resolve(repository, 'n4_default');
	assert.equal(state.version, 1);
	assert.equal(state.tension, 0);
	assert.equal(state.emotionalTemperature, 'CALM');
	assert.equal(state.sceneMomentum, 'STEADY');
	assert.equal(state.recentNarrativeBeats.length, 0);
});

test('N4 persists accepted-turn continuity and decays tension without deleting history', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n4_persist');
	const situation = CurrentSituationBuilder.build({ storyId: 'n4_persist', playerAction: 'I attack.', worldRepo: repository });
	const state = NarrativeContinuityStateEngine.recordAcceptedTurn({
		repository,
		storyId: 'n4_persist',
		turnId: situation.turnId,
		situation,
		intent: intent({ action: 'attack', interactionMode: 'COMBAT', informationGoal: undefined, observationIntent: false }),
		narration: 'Steel rings against stone as the creature surges forward, and the chamber erupts into alarm.',
	});
	assert.ok(state.tension > 0);
	assert.equal(state.emotionalTemperature, 'CALM');
	assert.equal(state.sceneMomentum, 'ESCALATING');
	const resolved = NarrativeContinuityStateEngine.resolve(repository, 'n4_persist');
	assert.ok(resolved.tension < state.tension);
	assert.equal(resolved.recentNarrativeBeats.length, 1);
});

test('N4 tracks recent sensory motifs and response shapes to discourage repetition', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n4_motifs');
	const situation = CurrentSituationBuilder.build({ storyId: 'n4_motifs', playerAction: 'I look around.', worldRepo: repository });
	const state = NarrativeContinuityStateEngine.recordAcceptedTurn({
		repository,
		storyId: 'n4_motifs',
		turnId: situation.turnId,
		situation,
		intent: intent(),
		narration: 'A thin veil of smoke hangs over the stone floor while a cold wind moves through the doorway.',
	});
	assert.ok(state.recentSensoryMotifs.includes('smoke'));
	assert.ok(state.recentSensoryMotifs.includes('stone'));
	assert.ok(state.recentSensoryMotifs.includes('wind'));
	assert.ok(state.recentResponseShapes.some((shape) => shape.includes('passive_observation')));
});

test('N4 continuity is supplied to research and narration prompts', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n4_prompt');
	const situation = CurrentSituationBuilder.build({ storyId: 'n4_prompt', playerAction: 'I attack.', worldRepo: repository });
	const previous = NarrativeContinuityStateEngine.recordAcceptedTurn({
		repository,
		storyId: 'n4_prompt',
		turnId: 'previous',
		situation,
		intent: intent({ action: 'attack', interactionMode: 'COMBAT', informationGoal: undefined, observationIntent: false }),
		narration: 'A threat erupts from the darkness as steel strikes stone.',
	});
	const research = NarrativeResearchPipeline.research({
		repository,
		storyId: 'n4_prompt',
		currentSituation: situation,
		playerIntent: intent({ action: 'attack', interactionMode: 'COMBAT', informationGoal: undefined, observationIntent: false }),
		playerAction: 'I attack.',
	});
	assert.equal(research.continuityState.tension <= previous.tension, true);
	const plan = NarrativeDirector.create({ situation, intent: intent({ action: 'attack', interactionMode: 'COMBAT', informationGoal: undefined, observationIntent: false }), research });
	const prompt = buildNarrationPrompt({
		situation,
		intent: intent({ action: 'attack', interactionMode: 'COMBAT', informationGoal: undefined, observationIntent: false }),
		research,
		plan,
		narrativeContinuityState: previous,
		maxPromptTokens: 5000,
	});
	assert.match(prompt.prompt, /NARRATIVE CONTINUITY STATE v1/);
	assert.match(prompt.prompt, /Scene tension:/);
});

test('N4 does not create canonical state changes', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n4_canon');
	const before = repository.getCanonicalCommandEvents('n4_canon').length;
	const situation = CurrentSituationBuilder.build({ storyId: 'n4_canon', playerAction: 'I listen.', worldRepo: repository });
	NarrativeContinuityStateEngine.recordAcceptedTurn({
		repository,
		storyId: 'n4_canon',
		turnId: situation.turnId,
		situation,
		intent: intent(),
		narration: 'The room grows tense.',
	});
	assert.equal(repository.getCanonicalCommandEvents('n4_canon').length, before);
});
