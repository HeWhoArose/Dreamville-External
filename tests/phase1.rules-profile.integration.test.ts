import test from 'node:test';
import assert from 'node:assert/strict';
import { StoryCheckEngine } from '../server/domain/storyCheckEngine';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

const character = {
	coreStats: {
		level: 1,
		strength: 10,
		dexterity: 12,
		constitution: 10,
		intelligence: 12,
		wisdom: 12,
		charisma: 10,
		savingThrowProficiencies: [],
	},
	skills: [],
};

test('Phase 1 integration: CUSTOM_HOMEBREW_DND does not invent an ability check', () => {
	const engine = new StoryCheckEngine();
	const profile = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');
	const result = engine.resolve('phase1_custom_no_check', 'I investigate the ancient door', character, undefined, profile);
	assert.equal(result, null);
});

test('Phase 1 integration: CUSTOM_HOMEBREW_DND accepts an explicitly authored challenge', () => {
	const engine = new StoryCheckEngine();
	const profile = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');
	const result = engine.resolve(
		'phase1_custom_authored',
		'I investigate the ancient door',
		character,
		{
			id: 'challenge_door',
			label: 'Ancient Door Protocol',
			sourceType: 'EVENT',
			sourceId: 'evt_door',
			keywords: ['investigate'],
			testType: 'ABILITY_CHECK',
			skill: 'Investigation',
			difficultyClass: 12,
			resolutionMode: 'DND_STANDARD',
			reason: 'The world explicitly opts into the D&D check resolver.',
		},
		profile
	);
	assert.notEqual(result, null);
	assert.equal(result?.challengeId, 'challenge_door');
});

test('Phase 1 integration: HYBRID_DND can disable implicit ability checks while preserving authored challenges', () => {
	const engine = new StoryCheckEngine();
	const profile = rulesProfileEngine.resolve({
		mode: 'HYBRID_DND',
		rulesProfile: {
			overrides: [{
				ruleId: 'implicit_ability_checks',
				operation: 'DISABLE',
				reason: 'Use authored challenges only for investigation.',
			}],
		},
	}).profile;

	assert.equal(
		engine.resolve('phase1_hybrid_disabled', 'I investigate the ancient door', character, undefined, profile),
		null
	);

	const authored = engine.resolve(
		'phase1_hybrid_authored',
		'I investigate the ancient door',
		character,
		{
			id: 'challenge_hybrid',
			label: 'Authored Investigation',
			sourceType: 'EVENT',
			sourceId: 'evt_hybrid',
			keywords: ['investigate'],
			testType: 'ABILITY_CHECK',
			skill: 'Investigation',
			difficultyClass: 12,
			reason: 'Explicit hybrid rule.',
		},
		profile
	);
	assert.notEqual(authored, null);
});

test('Phase 1 integration: StoryCheckEngine honors the StoryRun profile passed by authority', () => {
	const engine = new StoryCheckEngine();
	const customProfile = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');

	assert.equal(
		engine.resolve(
			'phase1_authority_profile',
			'I inspect the rune',
			character,
			undefined,
			customProfile
		),
		null
	);
});

test('Phase 1 integration: CUSTOM_HOMEBREW_DND rejects authored challenges without an explicit resolver', () => {
	const engine = new StoryCheckEngine();
	const profile = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');

	const result = engine.resolve(
		'phase1_custom_unresolved',
		'I investigate the ancient door',
		character,
		{
			id: 'challenge_unresolved',
			label: 'Unresolved Custom Door',
			sourceType: 'EVENT',
			sourceId: 'evt_unresolved',
			keywords: ['investigate'],
			testType: 'ABILITY_CHECK',
			skill: 'Investigation',
			difficultyClass: 12,
		},
		profile
	);

	assert.equal(result, null);
});

test('Phase 1 integration: CUSTOM_HOMEBREW_DND can explicitly use the D&D resolver', () => {
	const engine = new StoryCheckEngine();
	const profile = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');

	const result = engine.resolve(
		'phase1_custom_explicit_dnd',
		'I investigate the ancient door',
		character,
		{
			id: 'challenge_explicit_dnd',
			label: 'Explicit D&D Door Check',
			sourceType: 'EVENT',
			sourceId: 'evt_explicit_dnd',
			keywords: ['investigate'],
			testType: 'ABILITY_CHECK',
			skill: 'Investigation',
			difficultyClass: 12,
			resolutionMode: 'DND_STANDARD',
		},
		profile
	);

	assert.notEqual(result, null);
	assert.equal(result?.challengeId, 'challenge_explicit_dnd');
});

test('Phase 1 integration: CUSTOM_HOMEBREW_DND custom D20 resolution does not apply D&D proficiency rules', () => {
	const engine = new StoryCheckEngine();
	const profile = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');

	const result = engine.resolve(
		'phase1_custom_d20',
		'I inspect the ancient door',
		character,
		{
			id: 'challenge_custom_d20',
			label: 'Custom Rune Check',
			sourceType: 'EVENT',
			sourceId: 'evt_custom_d20',
			keywords: ['inspect'],
			difficultyClass: 10,
			resolutionMode: 'CUSTOM_D20',
			customModifier: 3,
		},
		profile
	);

	assert.notEqual(result, null);
	assert.equal(result?.testType, 'CUSTOM_CHECK');
	assert.equal(result?.ability, 'CUSTOM');
	assert.equal(result?.skill, 'Custom Rule');
	assert.equal(result?.proficiencyBonus, 0);
	assert.equal(result?.abilityModifier, 0);
	assert.equal(result?.modifierSources[0]?.kind, 'CUSTOM_RULE');
});

test('Phase 1 integration: persisted StoryRun profile is re-canonicalized from the run mode', () => {
	const repository = new InMemoryWorldRepository();

	repository.saveWorldTemplate({
		worldId: 'phase1_profile_world',
		dndRulesMode: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND'),
		worldRules: [],
		ruleConstraints: [],
		canonicalCapabilities: [],
		rulesetId: 'CUSTOM_HOMEBREW_DND',
	});

	repository.saveStoryRun({
		storyId: 'phase1_profile_run',
		worldId: 'phase1_profile_world',
		dndRulesMode: 'CUSTOM_HOMEBREW_DND',
		ruleset: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: rulesProfileEngine.createDefault('FULL_DND'),
	});

	const resolved = repository.getRulesProfile('phase1_profile_run');
	assert.equal(resolved?.mode, 'CUSTOM_HOMEBREW_DND');
	assert.equal(resolved?.baseRuleset, 'NONE');
	assert.equal(resolved?.allowImplicitAbilityChecks, false);
	assert.equal(resolved?.allowStandardDndSpellRules, false);
});

test('Phase 1 integration: internal NPC tactical execution honors the active rules profile', async () => {
	const { NpcTacticalDecisionPolicy } = await import('../server/domain/tacticalDecisionPolicy');
	const { TacticalCombatEngine } = await import('../server/domain/combatEngine');

	const combatEngine = new TacticalCombatEngine(42);
	combatEngine.addParticipant({
		id: 'npc_guard',
		name: 'Guard',
		x: 0,
		y: 0,
		initiative: 10,
		team: 'enemies',
		hpCurrent: 20,
		hpMax: 20,
		armorClass: 12,
		speedCells: 4,
		attackBonus: 3,
		damageFormula: '1d4+1',
		conditions: [],
		isDead: false,
	});

	const result = NpcTacticalDecisionPolicy.executeDecidedAction(
		{
			actorId: 'npc_guard',
			actionType: 'END_TURN',
			reason: 'Rule gate test.',
			priorityScore: 1,
		},
		combatEngine,
		undefined,
		rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND')
	);

	assert.equal(result.success, false);
});

test('Phase 1 integration: client-supplied spell rule overrides cannot bypass canonical StoryRun rules', () => {
	const repository = new InMemoryWorldRepository();
	const profile = rulesProfileEngine.createDefault('HYBRID_DND');

	repository.saveWorldTemplate({
		worldId: 'phase1_spell_authority_world',
		dndRulesMode: 'HYBRID_DND',
		rulesProfile: profile,
		worldRules: [],
		ruleConstraints: [],
		canonicalCapabilities: [],
		rulesetId: 'HYBRID_DND',
	});

	repository.saveStoryRun({
		storyId: 'phase1_spell_authority_run',
		worldId: 'phase1_spell_authority_world',
		dndRulesMode: 'HYBRID_DND',
		ruleset: 'HYBRID_DND',
		rulesProfile: profile,
		canonicalCapabilities: [],
	});

	const result = repository.evaluateCustomSpellProposal('phase1_spell_authority_run', {
		spellName: 'Client Override Spell',
		spellLevel: 9,
		casterLevel: 1,
		customRulesOverrides: { maxAllowedSpellLevel: 9 },
	});

	assert.equal(result.approved, false);
	assert.equal(result.maxAvailableLevel, 1);
});

test('Phase 1 integration: authored challenge keywords normalize without losing whitespace semantics', async () => {
	const { StoryCheckChallengeResolver } = await import('../server/domain/storyCheckChallengeResolver');
	const resolver = new StoryCheckChallengeResolver();

	const challenge = resolver.resolve({
		actionText: 'I inspect the ancient door.',
		sceneText: '',
		run: {
			storyCheckChallenges: [{
				id: 'challenge_keyword_normalization',
				label: 'Ancient Door',
				sourceType: 'EVENT',
				sourceId: 'evt_keyword',
				keywords: ['ancient door'],
				difficultyClass: 10,
				resolutionMode: 'CUSTOM_D20',
			}],
		},
	});

	assert.equal(challenge?.id, 'challenge_keyword_normalization');
});
