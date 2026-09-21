import test from 'node:test';
import assert from 'node:assert/strict';
import { StoryCheckEngine } from '../server/domain/storyCheckEngine';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';

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
			reason: 'The world explicitly defines this as a challenge.',
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
