import test from 'node:test';
import assert from 'node:assert/strict';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';
import { NarratorVoiceEngine } from '../server/domain/narratorVoiceEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

test('N2 voice state reaches the real narration prompt after research and planning', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n2_prompt_connection';
	repository.seedStory(storyId);
	const action = 'I inspect the old doorway.';
	const situation = CurrentSituationBuilder.build({ storyId, playerAction: action, worldRepo: repository });
	const intent = PlayerIntentInterpreter.deterministic(action, situation);
	const research = NarrativeResearchPipeline.research({ repository, storyId, currentSituation: situation, playerIntent: intent, playerAction: action });
	const plan = NarrativeDirector.create({ situation, intent, research });
	const voice = NarratorVoiceEngine.resolve(repository, storyId, repository.getNarrativeProfile(storyId), {
		enabled: true,
		voiceProfileId: 'voice.n2.integration.v1',
		cadence: 'BRISK',
		descriptiveDensity: 'LEAN',
	});
	const result = buildNarrationPrompt({ situation, intent, research, plan, narratorVoiceState: voice, maxPromptTokens: 2200 });
	assert.ok(result.prompt.indexOf('NARRATOR VOICE CONTRACT') < result.prompt.indexOf('CURRENT SITUATION'));
	assert.match(result.prompt, /voice\.n2\.integration\.v1/);
	assert.match(result.prompt, /Cadence: BRISK/);
	assert.match(result.prompt, /Descriptive density: LEAN/);
	assert.equal(result.narratorVoiceState?.profileId, 'voice.n2.integration.v1');
});
