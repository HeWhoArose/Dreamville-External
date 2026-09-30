import test from 'node:test';
import assert from 'node:assert/strict';
import { characterGenesisService } from '../server/services/characterGenesisService';
import { worldRepository } from '../server/repositories/worldRepository';
import { WorldTemplate } from '../src/types';

const testWorld: WorldTemplate = {
	worldId: 'world_additional_capability_test',
	worldManifestVersion: 1,
	title: 'Arcane Testing Grounds',
	description: 'A controlled world for Character Genesis regression tests.',
	genreTags: ['Fantasy'],
	toneTags: ['Arcane'],
	mediumTags: ['Text'],
	defaultEra: 'Test Era',
	setting: 'Testing Grounds',
	canonMode: 'CANON_COMPLIANT',
	rulesetId: 'rules_test',
	dndRulesMode: 'FULL_DND',
	capabilities: [],
	geography: { nodes: [], connections: [] },
	worldRules: [],
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

test('Character Genesis — batch additional capability discovery', async (t) => {
	worldRepository.saveWorldTemplate(testWorld);

	const originalGetAiOrchestrator = worldRepository.getAiOrchestrator;
	const response = {
		text: JSON.stringify({
			capabilities: [
				{
					name: 'Storm Calling',
					category: 'Magic',
					activationMode: 'channelled',
					powerTier: 'Major',
					baseEnergyCost: 20,
					baseStrainCost: 8,
					description: 'Shapes nearby atmospheric energy into controlled lightning and wind.',
					actionType: 'action',
					targetType: 'area_of_effect',
					rangeScope: 'ranged',
					checkFormula: '1d20',
					damageFormula: '2d6',
					effectDefinition: {
						resolutionMode: 'AREA',
						scale: 'GROUP',
						targetingMode: 'ALL_IN_AREA',
						instanceCount: 1,
						attackFormula: '1d20',
						saveFormula: '1d20',
						damageFormula: '2d6',
						damageType: 'lightning',
					},
					techniques: [
						{
							name: 'Lightning Arc',
							description: 'Projects a focused lightning strike.',
							activationType: 'Action',
							energyCost: 10,
							cooldownTurns: 1,
							range: 'Ranged',
							checkFormula: '1d20',
						},
					],
				},
				{
					name: 'Storm Calling',
					category: 'Magic',
					activationMode: 'channelled',
					powerTier: 'Major',
					description: 'Duplicate that must be filtered.',
					techniques: [{ name: 'Duplicate', description: 'Duplicate.', activationType: 'Action' }],
				},
				{
					name: 'Mirror Ward',
					category: 'Magic',
					activationMode: 'reaction',
					powerTier: 'Moderate',
					description: 'Forms a reflective ward that redirects selected attacks.',
					actionType: 'reaction',
					targetType: 'self',
					rangeScope: 'close',
					checkFormula: '1d20',
					techniques: [
						{
							name: 'Reflective Guard',
							description: 'Raises a defensive mirror plane.',
							activationType: 'Reaction',
							energyCost: 8,
							cooldownTurns: 2,
							range: 'Self',
						},
					],
				},
				{
					name: 'Wind Step',
					category: 'Movement',
					activationMode: 'immediate',
					powerTier: 'Minor',
					description: 'Uses compressed air to propel the character in a short burst.',
					actionType: 'bonus_action',
					targetType: 'self',
					rangeScope: 'close',
					checkFormula: '1d20',
					techniques: [
						{
							name: 'Gale Dash',
							description: 'A sudden compressed-air dash.',
							activationType: 'Bonus Action',
							energyCost: 6,
							cooldownTurns: 1,
							range: 'Self',
						},
					],
				},
				{
					name: 'Arcane Appraisal',
					category: 'Perception',
					activationMode: 'immediate',
					powerTier: 'Minor',
					description: 'Reads magical residue and reveals useful properties of an object.',
					actionType: 'action',
					targetType: 'single_target',
					rangeScope: 'close',
					checkFormula: '1d20',
					techniques: [
						{
							name: 'Resonance Scan',
							description: "Briefly reads an object's magical signature.",
							activationType: 'Action',
							energyCost: 4,
							cooldownTurns: 1,
							range: 'Close',
						},
					],
				},
				{
					name: 'Unused Fifth Option',
					category: 'Domain',
					activationMode: 'passive',
					powerTier: 'Major',
					description: 'Should not be returned when the requested maximum is four.',
					techniques: [
						{
							name: 'Domain Sense',
							description: 'Passive awareness.',
							activationType: 'Passive',
							energyCost: 0,
							cooldownTurns: 0,
							range: 'Self',
						},
					],
				},
			],
		}),
		source: 'AI_PRIMARY',
		providerId: 'provider_test',
		modelId: 'model_test',
		attempts: 1,
	};

	worldRepository.getAiOrchestrator = () => ({
		executeTaskGeneration: async () => response,
	} as any);

	t.after(() => {
		worldRepository.getAiOrchestrator = originalGetAiOrchestrator;
	});

	await t.test('returns at most four distinct proposals and excludes existing capabilities', async () => {
		const suggestions = await characterGenesisService.suggestAdditionalCapabilities(
			{
				worldId: testWorld.worldId,
				characterConcept: 'A battle mage who controls storms and reflective barriers.',
				existingCapabilities: [
					{
						id: 'cap_existing_storm',
						name: 'Storm Calling',
						category: 'Magic',
						activationMode: 'channelled',
						powerTier: 'Major',
						baseEnergyCost: 20,
						baseStrainCost: 8,
						minVesselCapacityRequired: 15,
						description: 'Existing storm control.',
						provenance: 'USER_EDITED',
					},
				],
				characterContext: {
					name: 'Astra',
					species: 'Human',
					role: 'PROTAGONIST',
					profession: 'Mage',
					background: 'Studied elemental magic and defensive wards.',
					personality: ['curious'],
					motivations: ['master elemental magic'],
					capabilities: ['Storm Calling'],
					skills: ['Fireball'],
				},
				desiredCount: 4,
			},
			testWorld,
		);

		assert.equal(suggestions.length, 3);
		assert.deepEqual(
			suggestions.map((capability) => capability.name),
			['Mirror Ward', 'Wind Step', 'Arcane Appraisal'],
		);
		assert.ok(suggestions.every((capability) => capability.provenance === 'AI_GENERATED'));
		assert.ok(suggestions.every((capability) => capability.generatedSkills.length >= 1));
		assert.ok(suggestions.every((capability) => capability.generatedSkills.every((skill) => skill.parentCapabilityId === capability.id)));
		assert.ok(suggestions.every((capability) => capability.checkFormula === '1d20'));
		assert.equal(
			new Set(suggestions.map((capability) => capability.name.toLowerCase())).size,
			suggestions.length,
		);
	});

	await t.test('does not create automatic suggestions when the model produces no usable output', async () => {
		const original = worldRepository.getAiOrchestrator;
		worldRepository.getAiOrchestrator = () => ({
			executeTaskGeneration: async () => ({
				text: JSON.stringify({ capabilities: [] }),
				source: 'AI_PRIMARY',
				providerId: 'provider_test',
				modelId: 'model_test',
				attempts: 1,
			}),
		} as any);

		try {
			await assert.rejects(
				() =>
					characterGenesisService.suggestAdditionalCapabilities(
						{
							worldId: testWorld.worldId,
							characterConcept: 'A mage.',
							existingCapabilities: [],
							characterContext: { profession: 'Mage' },
							desiredCount: 4,
						},
						testWorld,
					),
				(error: any) => {
					assert.equal(error?.code, 'AI_UNAVAILABLE');
					return true;
				},
			);
		} finally {
			worldRepository.getAiOrchestrator = original;
		}
	});
});
