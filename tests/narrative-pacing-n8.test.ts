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
	assert.equal(discovery.profile, 'STANDARD', 'a routine information request is not automatically an expansive discovery scene');
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
	const momentumSituation = { ...situation, visibleEvents: [], recentTurns: [{ playerAction: 'previous', narration: 'A previous beat.', worldTime: situation.worldTime }], location: { ...situation.location, description: '' } };
	const contract = NarrativePacingEngine.resolve({ situation: momentumSituation, intent: intent({ informationGoal: undefined, observationIntent: true, action: 'observe', originalText: 'I observe.' }), continuityState: { ...continuity, sceneMomentum: 'BUILDING' } });
	assert.equal(contract.profile, 'COMPACT');
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


test('N8 treats ambient NPC activity as scene texture, not a reason to expand narration', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n8_ambient_not_discovery');
	const base = CurrentSituationBuilder.build({ storyId: 'n8_ambient_not_discovery', playerAction: 'I ask how to get clearance.', worldRepo: repository });
	const situation = {
		...base,
		recentTurns: [{ playerAction: 'I ask where to buy a map.', narration: 'A merchant answers briefly.', worldTime: base.worldTime }],
		visibleEvents: [
			{ id: 'ambient-1', type: 'SOCIAL_OPPORTUNITY', summary: 'Mira Fen is calling out wares to passersby.', source: 'WORLD_ACTIVITY_DIRECTOR', locationId: base.location.id },
		],
	};
	const contract = NarrativePacingEngine.resolve({
		situation,
		intent: intent({
			action: 'ask about clearance',
			goal: 'get information',
			interactionMode: 'DIALOGUE',
			speechIntent: true,
			observationIntent: false,
			informationGoal: 'how to get clearance',
			originalText: 'How does one get such clearance?',
		}),
	});
	assert.equal(contract.profile, 'COMPACT');
	assert.ok(contract.controls.maxWords <= 155);
});

test('N8 opening-scene pacing grounds the player without a long scenic inventory', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n8_opening_brevity');
	const situation = CurrentSituationBuilder.build({ storyId: 'n8_opening_brevity', playerAction: 'I look around.', worldRepo: repository });
	const contract = NarrativePacingEngine.resolve({ situation, intent: intent() });
	assert.equal(contract.profile, 'EXPANDED');
	assert.equal(contract.controls.maxWords, 190);
	assert.equal(contract.controls.maxParagraphs, 2);
});
