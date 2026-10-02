import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativePacingEngine } from '../server/domain/narrativePacingEngine';
import { NarrativeContinuityStateEngine } from '../server/domain/narrativeContinuityState';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';
import type { PlayerIntent } from '../server/domain/playerIntentInterpreter';

function intent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
	return {
		action: 'look around',
		goal: 'observe',
		interactionMode: 'PASSIVE_OBSERVATION',
		speechIntent: false,
		movementIntent: false,
		observationIntent: true,
		explicitTargets: [],
		impliedTargets: [],
		confidence: 1,
		source: 'DETERMINISTIC',
		originalText: 'I look around.',
		...overrides,
	};
}

test('N8 resolves materially different pacing profiles from the turn situation', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n8_profiles');
	const situation = CurrentSituationBuilder.build({ storyId: 'n8_profiles', playerAction: 'I wait.', worldRepo: repository });
	const micro = NarrativePacingEngine.resolve({ situation, intent: intent({ action: 'wait', observationIntent: false, originalText: 'I wait.' }) });
	const combat = NarrativePacingEngine.resolve({ situation, intent: intent({ action: 'attack', interactionMode: 'COMBAT', observationIntent: false, originalText: 'I attack the creature.' }) });
	const discovery = NarrativePacingEngine.resolve({ situation, intent: intent({ informationGoal: 'what happened here' }) });
	assert.equal(micro.profile, 'MICRO');
	assert.equal(combat.profile, 'KINETIC');
	assert.equal(discovery.profile, 'EXPANDED');
	assert.ok(micro.controls.maxWords < combat.controls.maxWords);
});

test('N8 uses N4 scene momentum without making it canonical', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n8_momentum');
	const situation = CurrentSituationBuilder.build({ storyId: 'n8_momentum', playerAction: 'I listen.', worldRepo: repository });
	const continuity = NarrativeContinuityStateEngine.recordAcceptedTurn({
		repository,
		storyId: 'n8_momentum',
		turnId: 'prior',
		situation,
		intent: intent({ action: 'attack', interactionMode: 'COMBAT', observationIntent: false }),
		narration: 'Steel strikes stone as the threat closes in.',
	});
	const before = repository.getCanonicalCommandEvents('n8_momentum').length;
	const contract = NarrativePacingEngine.resolve({ situation, intent: intent(), continuityState: { ...continuity, sceneMomentum: 'BUILDING' } });
	assert.equal(contract.profile, 'EXPANDED');
	assert.ok(contract.signals.includes('continuity_build'));
	assert.equal(repository.getCanonicalCommandEvents('n8_momentum').length, before);
});

test('N8 pacing contract reaches the real narration prompt', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n8_prompt');
	const situation = CurrentSituationBuilder.build({ storyId: 'n8_prompt', playerAction: 'I attack.', worldRepo: repository });
	const playerIntent = intent({ action: 'attack', interactionMode: 'COMBAT', observationIntent: false, originalText: 'I attack.' });
	const research = NarrativeResearchPipeline.research({ repository, storyId: 'n8_prompt', currentSituation: situation, playerIntent, playerAction: 'I attack.' });
	const plan = NarrativeDirector.create({ repository, storyId: 'n8_prompt', situation, intent: playerIntent, research });
	const prompt = buildNarrationPrompt({ situation, intent: playerIntent, research, plan, maxPromptTokens: 5000 });
	assert.match(prompt.prompt, /N8 ADAPTIVE PACING CONTRACT/);
	assert.match(prompt.prompt, /Profile: KINETIC/);
	assert.ok(prompt.narrativePacingContract);
});

test('N8 output budgeting expands and contracts with the selected profile', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n8_budget');
	const situation = CurrentSituationBuilder.build({ storyId: 'n8_budget', playerAction: 'I wait.', worldRepo: repository });
	const micro = NarrativePacingEngine.resolve({ situation, intent: intent({ action: 'wait', observationIntent: false, originalText: 'I wait.' }) });
	const expanded = NarrativePacingEngine.resolve({ situation, intent: intent({ informationGoal: 'what happened here' }) });
	assert.ok(NarrativePacingEngine.outputTokenBudget(expanded) >= NarrativePacingEngine.outputTokenBudget(micro));
});

test('N8 validates hard pacing ceilings but does not require padding to minimum length', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n8_validation');
	const situation = CurrentSituationBuilder.build({ storyId: 'n8_validation', playerAction: 'I wait.', worldRepo: repository });
	const contract = NarrativePacingEngine.resolve({ situation, intent: intent({ action: 'wait', observationIntent: false, originalText: 'I wait.' }) });
	assert.equal(NarrativePacingEngine.validateNarration('I wait.', contract).valid, true);
	const oversized = Array.from({ length: 120 }, () => 'word').join(' ');
	assert.equal(NarrativePacingEngine.validateNarration(oversized, contract).valid, false);
});

test('N8 can be disabled without changing the existing prompt contract', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n8_disabled');
	const situation = CurrentSituationBuilder.build({ storyId: 'n8_disabled', playerAction: 'I wait.', worldRepo: repository });
	const contract = NarrativePacingEngine.resolve({ situation, intent: intent(), controls: { enabled: false } });
	assert.equal(contract.profile, 'STANDARD');
	assert.equal(contract.controls.enabled, false);
	assert.match(NarrativePacingEngine.toPromptContext(contract), /disabled/i);
});
