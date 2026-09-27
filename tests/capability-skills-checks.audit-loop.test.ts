import test from 'node:test';
import assert from 'node:assert/strict';
import { StoryCheckEngine } from '../server/domain/storyCheckEngine';
import {
	STORY_SKILL_CHECK_REGISTRY,
	getStorySkillCheckDefinition,
} from '../server/domain/storySkillCheckRegistry';

const EXPECTED_SKILLS = [
	['acrobatics', 'Acrobatics', 'Dexterity', 'I balance across the narrow ledge.'],
	['animal_handling', 'Animal Handling', 'Wisdom', 'I calm the frightened horse.'],
	['arcana', 'Arcana', 'Intelligence', 'I identify the magical rune.'],
	['athletics', 'Athletics', 'Strength', 'I climb the steep wall.'],
	['deception', 'Deception', 'Charisma', 'I lie about what I saw.'],
	['history', 'History', 'Intelligence', 'I recall the ancient kingdom.'],
	['insight', 'Insight', 'Wisdom', 'I read her motives.'],
	['intimidation', 'Intimidation', 'Charisma', 'I threaten the guard.'],
	['investigation', 'Investigation', 'Intelligence', 'I investigate the hidden mechanism.'],
	['medicine', 'Medicine', 'Wisdom', 'I treat the wounded soldier.'],
	['nature', 'Nature', 'Intelligence', 'I identify the poisonous flora.'],
	['perception', 'Perception', 'Wisdom', 'I spot the hidden ambusher.'],
	['performance', 'Performance', 'Charisma', 'I perform a song for the crowd.'],
	['persuasion', 'Persuasion', 'Charisma', 'I convince the merchant to lower the price.'],
	['religion', 'Religion', 'Intelligence', 'I recognize the sacred symbol.'],
	['sleight_of_hand', 'Sleight of Hand', 'Dexterity', 'I pickpocket the coin.'],
	['stealth', 'Stealth', 'Dexterity', 'I sneak past the guards.'],
	['survival', 'Survival', 'Wisdom', 'I track the footprints through the forest.'],
] as const;

function characterFor(ability: string): any {
	return {
		coreStats: {
			level: 1,
			strength: 12,
			dexterity: 12,
			constitution: 12,
			intelligence: 12,
			wisdom: 12,
			charisma: 12,
			ac: 12,
			speed: 30,
			hitDice: '1d10',
			hpCurrent: 10,
			hpMax: 10,
		},
		skills: [
			{
				id: 'skill_test',
				name: 'PLACEHOLDER',
				proficiency: 'PROFICIENT',
				isProficient: true,
				isExpertise: false,
				governingAbility: ability,
			},
		],
	};
}

test('canonical story skill registry contains exactly the 18 standard skills', () => {
	assert.equal(STORY_SKILL_CHECK_REGISTRY.length, 18);
	assert.deepEqual(
		STORY_SKILL_CHECK_REGISTRY.map((definition) => definition.id).sort(),
		EXPECTED_SKILLS.map(([id]) => id).sort(),
	);
});

test('each standard skill resolves through the central registry across ten audit passes', () => {
	for (let audit = 1; audit <= 10; audit += 1) {
		for (const [id, name, ability, action] of EXPECTED_SKILLS) {
			const definition = getStorySkillCheckDefinition(id);
			assert.ok(definition, `Audit ${audit}: missing registry entry for ${id}`);
			assert.equal(definition!.name, name, `Audit ${audit}: wrong display name for ${id}`);
			assert.equal(definition!.governingAbility, ability, `Audit ${audit}: wrong governing ability for ${id}`);

			const engine = new StoryCheckEngine();
			const character = characterFor(ability);
			character.skills[0].id = id;
			character.skills[0].name = name;

			const result = engine.resolve(`skill_audit_${audit}_${id}`, action, character);
			assert.ok(result, `Audit ${audit}: no check resolved for ${name}`);
			assert.equal(result!.skill, name, `Audit ${audit}: wrong skill result for ${name}`);
			assert.equal(result!.ability, ability, `Audit ${audit}: wrong ability result for ${name}`);
			assert.equal(result!.proficiencyLevel, 'PROFICIENT', `Audit ${audit}: proficiency lost for ${name}`);
		}
	}
});

test('skill checks accept actor-owned skill IDs even when display names vary', () => {
	const engine = new StoryCheckEngine();
	const character = characterFor('Wisdom');
	character.skills = [
		{
			id: 'insight',
			name: 'Custom Insight Label',
			proficiency: 'EXPERTISE',
			isProficient: true,
			isExpertise: true,
			governingAbility: 'Wisdom',
		},
	];

	const result = engine.resolve('skill_id_alias_test', 'I read his motives.', character);

	assert.ok(result);
	assert.equal(result!.skill, 'Insight');
	assert.equal(result!.ability, 'Wisdom');
	assert.equal(result!.proficiencyLevel, 'EXPERTISE');
	assert.equal(result!.proficiencyBonus, 4);
});

test('skill-check resolution is read-only with respect to canonical actor skill state', () => {
	const engine = new StoryCheckEngine();
	const character = characterFor('Wisdom');
	character.skills = [{
		id: 'insight',
		name: 'Insight',
		proficiency: 'PROFICIENT',
		isProficient: true,
		isExpertise: false,
		governingAbility: 'Wisdom',
	}];
	const before = JSON.parse(JSON.stringify(character));

	const result = engine.resolve('read_only_skill_check', 'I read his motives.', character);

	assert.ok(result);
	assert.deepEqual(character, before);
});

test('routine actions remain narration-only when no skill trigger or authored challenge exists', () => {
	const engine = new StoryCheckEngine();
	const result = engine.resolve(
		'routine_action_boundary',
		'I walk forward.',
		characterFor('Wisdom'),
	);
	assert.equal(result, null);
});


test('story check authority rejects non-active actor and reads the canonical actor state', () => {
	const { storyCheckAuthority } = require('../server/domain/storyCheckAuthority');
	const engine = new StoryCheckEngine();
	const run = {
		characterCoreStats: {
			level: 1,
			strength: 10,
			dexterity: 10,
			constitution: 10,
			intelligence: 10,
			wisdom: 14,
			charisma: 10,
		},
		characterSkills: [
			{
				id: 'insight',
				name: 'Insight',
				proficiency: 'PROFICIENT',
				isProficient: true,
				isExpertise: false,
				governingAbility: 'Wisdom',
			},
		],
		protagonist: undefined,
	};

	const repository = {
		getPlayerLifecycle: () => ({ actorId: 'player-1' }),
		getStoryRun: () => run,
		getConditionEngine: () => ({
			exportActorState: () => undefined,
		}),
		getRulesProfile: () => undefined,
		getStoryCheckEngine: () => engine,
	} as any;

	assert.equal(
		storyCheckAuthority.resolve(repository, {
			storyId: 'story-authority',
			actorId: 'other-actor',
			actionText: 'I read his motives.',
		}),
		null,
	);

	const result = storyCheckAuthority.resolve(repository, {
		storyId: 'story-authority',
		actorId: 'player-1',
		actionText: 'I read his motives.',
	});

	assert.ok(result);
	assert.equal(result!.skill, 'Insight');
	assert.equal(result!.ability, 'Wisdom');
});
