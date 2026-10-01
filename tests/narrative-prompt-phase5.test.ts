import test from 'node:test';
import assert from 'node:assert/strict';

import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { buildNarrationPrompt, projectSupportingWorkingContext } from '../server/domain/narrativePromptBuilder';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

test('Phase 5 prompt puts current situation, semantic intent, research, and plan into one ordered narration contract', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase5_prompt_order';
	repository.seedStory(storyId);
	const playerAction = 'I move closer to hear the rumors.';
	const initial = CurrentSituationBuilder.build({ storyId, playerAction, worldRepo: repository });
	const intent = PlayerIntentInterpreter.deterministic(playerAction, initial);
	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction,
		currentAction: intent,
		worldRepo: repository,
	});
	const research = NarrativeResearchPipeline.research({
		repository,
		storyId,
		currentSituation: situation,
		playerIntent: intent,
		playerAction,
	});
	const plan = NarrativeDirector.create({ situation, intent, research });

	const result = buildNarrationPrompt({
		situation,
		intent,
		research,
		plan,
		workingContext: 'SUPPORTING_CONTEXT_SENTINEL',
		maxPromptTokens: 2000,
	});

	const prompt = result.prompt;
	const indices = [
		prompt.indexOf('GLOBAL NARRATION INSTRUCTIONS'),
		prompt.indexOf('NARRATIVE STYLE'),
		prompt.indexOf('CURRENT SITUATION'),
		prompt.indexOf('PLAYER INTENT'),
		prompt.indexOf('NARRATIVE RESEARCH'),
		prompt.indexOf('NARRATIVE DIRECTOR PLAN'),
		prompt.indexOf('SUPPORTING WORKING CONTEXT'),
		prompt.indexOf('Canonical constraints:'),
		prompt.indexOf('OUTPUT CONTRACT'),
	];
	for (const index of indices) assert.ok(index >= 0, 'Expected prompt section missing.');
	for (let i = 1; i < indices.length; i += 1) assert.equal(indices[i] > indices[i - 1], true);

	assert.match(prompt, /speechIntent.*false/i);
	assert.match(prompt, /do not make the player speak|do not make the player.*speak/i);
	assert.match(prompt, /SUPPORTING_CONTEXT_SENTINEL/);
});

test('Phase 5 prompt contains an explicit player-agency boundary', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase5_player_agency';
	repository.seedStory(storyId);
	const action = 'I watch the doorway.';
	const situation = CurrentSituationBuilder.build({ storyId, playerAction: action, worldRepo: repository });
	const intent = PlayerIntentInterpreter.deterministic(action, situation);
	const research = NarrativeResearchPipeline.research({
		repository,
		storyId,
		currentSituation: situation,
		playerIntent: intent,
		playerAction: action,
	});
	const plan = NarrativeDirector.create({ situation, intent, research });
	const result = buildNarrationPrompt({
		situation,
		intent,
		research,
		plan,
		maxPromptTokens: 1600,
	});

	assert.match(result.prompt, /never choose a major future action for the player/i);
	assert.match(result.prompt, /State changes must come from canonical engines/commands/i);
	assert.match(result.prompt, /unsupported.*entities|unsupported.*objects/i);
});

test('Phase 5 prompt preserves uncertainty rather than turning research into canon', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase5_uncertainty';
	repository.seedStory(storyId);
	const action = 'I listen for rumors.';
	const situation = CurrentSituationBuilder.build({ storyId, playerAction: action, worldRepo: repository });
	const intent = PlayerIntentInterpreter.deterministic(action, situation);
	const research = NarrativeResearchPipeline.research({
		repository,
		storyId,
		currentSituation: situation,
		playerIntent: intent,
		playerAction: action,
	});
	const plan = NarrativeDirector.create({ situation, intent, research });
	const result = buildNarrationPrompt({
		situation,
		intent,
		research,
		plan,
		maxPromptTokens: 1400,
	});

	assert.match(result.prompt, /Preserve rumor, hearsay, memory, and uncertainty as uncertainty/i);
	assert.match(result.prompt, /Omitted or excluded information is not permission to invent it/i);
});

test('Phase 5 reuses the semantic passive-listening signal rather than raw action wording for core prompt behavior', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase5_semantic_signal';
	repository.seedStory(storyId);
	const action = 'I quietly draw nearer and listen in silence.';
	const situation = CurrentSituationBuilder.build({ storyId, playerAction: action, worldRepo: repository });
	const intent = PlayerIntentInterpreter.deterministic(action, situation);
	assert.equal(intent.speechIntent, false);
	assert.equal(intent.movementIntent, true);
	assert.equal(intent.observationIntent, true);
	assert.equal(intent.interactionMode, 'PASSIVE_OBSERVATION');

	const research = NarrativeResearchPipeline.research({ repository, storyId, currentSituation: situation, playerIntent: intent, playerAction: action });
	const plan = NarrativeDirector.create({ situation, intent, research });
	const prompt = buildNarrationPrompt({ situation, intent, research, plan }).prompt;
	assert.match(prompt, /If the player listens, watches, observes, overhears, or eavesdrops without explicit speech, do not make the player speak/i);
});
