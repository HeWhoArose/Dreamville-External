import test from 'node:test';
import assert from 'node:assert/strict';

import { DomainAdjudicationBridge } from '../server/domain/aiOrchestrator';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function fixture() {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase4_director_fixture';
	repository.seedStory(storyId);
	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I move closer to hear the rumors.',
		worldRepo: repository,
	});
	const intent = PlayerIntentInterpreter.deterministic(
		'I move closer to hear the rumors.',
		situation,
	);
	const research = NarrativeResearchPipeline.research({
		repository,
		storyId,
		currentSituation: CurrentSituationBuilder.build({
			storyId,
			playerAction: intent.originalText,
			currentAction: intent,
			worldRepo: repository,
		}),
		playerIntent: intent,
		playerAction: intent.originalText,
	});
	return { repository, storyId, situation, intent, research };
}

test('Phase 4 turns listen-and-approach into an explicit one-turn plan', () => {
	const { situation, intent, research } = fixture();
	const plan = NarrativeDirector.create({ situation, intent, research });
	const prompt = NarrativeDirector.toPromptContext(plan);

	assert.equal(plan.turnId, situation.turnId);
	assert.equal(plan.expiresAfterNarration, true);
	assert.match(plan.objective, /gather_information|approach_and_listen/i);
	assert.ok(plan.immediateSteps.some((step) => /closer|passive|movement/i.test(step)));
	assert.ok(plan.immediateSteps.some((step) => /information/i.test(step)));
	assert.ok(plan.continuityRequirements.some((rule) => /Do not create player speech/i.test(rule)));
	assert.ok(plan.continuityRequirements.some((rule) => /observation/listening/i.test(rule)));
	assert.ok(plan.forbiddenAssumptions.some((rule) => /rumor|hearsay/i.test(rule)));
	assert.match(prompt, /EPHEMERAL/i);
});

test('Phase 4 plan does not create persistent runtime state', () => {
	const { repository, storyId, situation, intent, research } = fixture();
	const before = JSON.stringify(repository.getStoryRun(storyId)?.runtimeState || {});
	NarrativeDirector.create({ situation, intent, research });
	const after = JSON.stringify(repository.getStoryRun(storyId)?.runtimeState || {});
	assert.equal(after, before);
});

test('Phase 4 plan remains safe with empty research', () => {
	const { situation, intent } = fixture();
	const emptyResearch = {
		storyId: situation.storyId,
		turnId: situation.turnId,
		query: intent.originalText,
		viewerActorId: situation.player.actorId,
		failures: ['simulated provider/store failure'],
		packet: {} as any,
		blocks: [],
		excluded: [],
		budgets: { scene: 700, entities: 700, memories: 600, lore: 600, plot: 500, total: 2400 },
		promptContext: 'NARRATIVE RESEARCH RESULTS\nNo additional research was available.',
		totalTokens: 18,
		capturedAt: situation.worldTime,
	};
	const plan = NarrativeDirector.create({ situation, intent, research: emptyResearch });
	assert.ok(plan.immediateSteps.length > 0);
	assert.ok(plan.forbiddenAssumptions.length > 0);
	assert.equal(plan.informationToReveal.length > 0, true);
	assert.match(plan.informationToReveal[0].presentation, /NO_RELIABLE_ANSWER|UNCERTAIN|RUMOR|FACT/);
});

test('Phase 4 passes the ephemeral plan into canonical adjudication metadata without persisting the plan', () => {
	const { repository, storyId, situation, intent, research } = fixture();
	const plan = NarrativeDirector.create({ situation, intent, research });
	const result = DomainAdjudicationBridge.adjudicate({
		narrative: ['The protagonist listens without speaking.'],
		dialogue: [],
		events: [],
		stateChanges: [],
		memoryCandidates: [],
		audioCues: [],
	}, repository, storyId, plan);

	assert.equal(result.allApproved, true);
	assert.equal(result.narrativePlanObjective, plan.objective);
	assert.deepEqual(result.expectedNarrativeEffectKinds, plan.stateEffectsExpected.map((effect) => effect.kind));
	assert.equal(result.narrativePlanObjective?.includes('Do not'), false);
});
