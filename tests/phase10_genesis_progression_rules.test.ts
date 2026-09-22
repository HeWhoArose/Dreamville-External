import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSkillCheckFormula } from '../src/data/rulesDice';
import { getInitialDndSkills } from '../src/data/dndSkillsCatalog';
import { StoryCheckEngine } from '../server/domain/storyCheckEngine';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { CharacterProgressionEngine } from '../server/domain/characterProgressionEngine';

test('FULL_DND forces standard skill checks to 1d20', () => {
	const skills = getInitialDndSkills([
		{
			id: 'stealth',
			name: 'Stealth',
			governingAbility: 'Dexterity',
			proficiency: 'NONE',
			isProficient: false,
			isExpertise: false,
			description: 'Custom override',
			checkFormula: '2d6',
			provenance: 'PLAYER_INPUT',
		},
	]);

	const stealth = skills.find((skill) => skill.id === 'stealth')!;
	assert.equal(stealth.checkFormula, '1d20');
	assert.equal(resolveSkillCheckFormula('FULL_DND', '2d6'), '1d20');
});

test('HYBRID_DND preserves an authored 2d6 skill check and StoryCheckEngine resolves it', () => {
	assert.equal(resolveSkillCheckFormula('HYBRID_DND', '2d6'), '2d6');

	const engine = new StoryCheckEngine();
	const result = engine.resolve(
		'hybrid_rules_test',
		'search the room',
		{
			coreStats: {
				level: 1,
				armorClass: 10,
				speed: 30,
				hitDice: '1d8',
				hpCurrent: 10,
				hpMax: 10,
				strength: 10,
				dexterity: 10,
				constitution: 10,
				intelligence: 10,
				wisdom: 10,
				charisma: 10,
			},
			skills: [{
				id: 'investigation',
				name: 'Investigation',
				governingAbility: 'Intelligence',
				proficiency: 'NONE',
				isProficient: false,
				isExpertise: false,
				description: 'Hybrid investigation.',
				checkFormula: '2d6',
				provenance: 'PLAYER_INPUT',
			}],
		},
		undefined,
		rulesProfileEngine.createDefault('HYBRID_DND')
	);

	assert.ok(result);
	assert.equal(result?.roll.formula, '2d6');
	assert.equal(result?.roll.diceTerms[0]?.count, 2);
	assert.equal(result?.roll.diceTerms[0]?.sides, 6);
});

test('Genesis progression seeding can register custom modules before a canonical transaction', () => {
	const engine = new CharacterProgressionEngine();
	const customClass = {
		id: 'class_custom_starforged',
		type: 'CLASS' as const,
		name: 'Starforged',
		version: 1,
		enabled: true,
		features: [{
			id: 'feature_starforged_1',
			name: 'Starforged Training',
			description: 'Training for the custom class.',
			level: 1,
			enabled: true,
			passiveModifiers: [],
			triggeredAbilities: [],
		}],
		provenance: 'CHARACTER_GENESIS',
	};

	const state = engine.seedFromCharacter(
		'actor_custom_module_test',
		{
			identity: {
				name: 'Aster',
				species: 'Human',
				age: 25,
				gender: 'unspecified',
			},
			role: {
				role: 'Pilot',
				archetype: 'Starforged',
				profession: 'Pilot',
			},
			coreStats: {
				level: 1,
				armorClass: 10,
				speed: 30,
				hitDice: '1d8',
				hpCurrent: 10,
				hpMax: 10,
				strength: 10,
				dexterity: 10,
				constitution: 10,
				intelligence: 10,
				wisdom: 10,
				charisma: 10,
			},
			feats: [],
			progression: {
				classId: customClass.id,
				featIds: [],
				moduleIds: [],
				customModules: [customClass],
			},
		},
		'GENESIS_TEST'
	);

	assert.equal(state.classId, customClass.id);
	assert.ok(state.enabledModuleIds.includes(customClass.id));
});
