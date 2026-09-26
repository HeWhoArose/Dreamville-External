import test from 'node:test';
import assert from 'node:assert/strict';

import { StoryActionAdvisor } from '../server/services/storyActionAdvisor';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import type { CapabilityDefinition } from '../server/domain/capabilityEngine';

function fireballCapability(): CapabilityDefinition {
	return {
		id: 'cap_fireball_test',
		name: 'Training Fireball',
		category: 'Magic',
		activationMode: 'immediate',
		powerTier: 'Major',
		baseEnergyCost: 10,
		baseStrainCost: 5,
		minVesselCapacityRequired: 0,
		description: 'A sphere of fire that detonates on impact.',
		actionType: 'action',
		targetType: 'area_of_effect',
		rangeScope: 'ranged',
		provenance: 'SYSTEM_CANON',
		checkFormula: '1d20',
	};
}

function seedRun(repository: InMemoryWorldRepository, storyId: string, role: string): void {
	repository.saveStoryRun({
		storyId,
		id: storyId,
		worldId: 'world_test',
		characterName: 'Test Hero',
		characterRole: role,
		storyMode: 'PROTAGONIST',
		dndRulesMode: 'FULL_DND',
		protagonist: {
			characterId: 'player_' + storyId,
			identity: { name: 'Test Hero', species: 'Human' },
			role: { profession: role, archetype: role },
			personality: { traits: [], motivations: [] },
			background: { history: '' },
			capabilities: [],
		},
		runtimeState: {},
	});
}

function givePlayerAnExistingCapability(
	repository: InMemoryWorldRepository,
	storyId: string,
	capability: CapabilityDefinition
): void {
	const engine = repository.getCapabilityEngine(storyId);
	engine.registerCapability(capability);
	const actorId = repository.getPlayerLifecycle(storyId)?.actorId || repository.getStoryRun(storyId)?.protagonist?.characterId || 'player_actor_' + storyId;
	engine.acquireSkill(actorId, capability.id, {
		libraryProvenance: {
			libraryStatus: 'APPROVED',
			sourceStoryIds: [storyId],
		},
	});
	repository.persistCapabilityState(storyId);
}

test('Phase 16 action advisor: compatible unlearned capability requires explicit acquisition approval', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase16_advisor_wizard';
	seedRun(repository, storyId, 'Wizard');

	const fireball = fireballCapability();
	repository.getCapabilityEngine(storyId).registerCapability(fireball);

	const advisor = new StoryActionAdvisor(repository);
	const advice = await advisor.advise(storyId, 'I cast Training Fireball');

	assert.equal(advice.mode, 'SUGGEST_ALTERNATIVE', JSON.stringify(advice.simulation));
	assert.ok(advice.proposal);
	assert.equal(advice.recognizedCapability?.id, 'cap_fireball_test');
	assert.equal(advice.canExecuteNow, false);
	assert.equal(repository.getEffectiveActorCapabilities(repository.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId).some((capability) => capability.id === 'cap_fireball_test'), false);
});

test('Phase 16 action advisor: ordinary Mage compatibility is not confused with Dark Mage incompatibility', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase16_advisor_mage';
	seedRun(repository, storyId, 'Mage');

	const fireball = fireballCapability();
	repository.getCapabilityEngine(storyId).registerCapability(fireball);

	const advisor = new StoryActionAdvisor(repository);
	const advice = await advisor.advise(storyId, 'I cast Training Fireball');

	assert.equal(advice.mode, 'SUGGEST_ALTERNATIVE');
	assert.ok(advice.proposal);
	assert.equal(advice.recognizedCapability?.id, 'cap_fireball_test');
});

test('Phase 16 action advisor: incompatible Fireball request from a Dark Mage produces a non-canonical alternative proposal', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase16_advisor_dark_mage';
	seedRun(repository, storyId, 'Dark Mage');

	const fireball = fireballCapability();
	repository.getCapabilityEngine(storyId).registerCapability(fireball);

	const seededRun = repository.getStoryRun(storyId);
	if (seededRun?.protagonist) {
		seededRun.protagonist.progression = { classId: 'class_wizard' };
		repository.saveStoryRun(seededRun);
	}

	const advisor = new StoryActionAdvisor(
		repository,
		async (concept, worldTemplate) => ({
			id: 'cap_dark_fire_test',
			name: 'Dark Fire',
			category: 'Magic',
			activationMode: 'immediate',
			powerTier: 'Major',
			baseEnergyCost: 12,
			baseStrainCost: 6,
			minVesselCapacityRequired: 0,
			description: 'Cursed flame expressed through shadow magic.',
			actionType: 'action',
			targetType: 'area_of_effect',
			rangeScope: 'ranged',
			provenance: 'ACTION_ADVISOR_AI',
			checkFormula: '1d20',
			effectDefinition: {
				resolutionMode: 'AREA',
				scale: 'ENCOUNTER',
				targetingMode: 'ALL_IN_AREA',
				damageFormula: '8d6',
				damageType: 'necrotic',
				attackFormula: '1d20',
				saveFormula: '1d20',
			},
			generatedSkills: [
				{
					name: 'Dark Flame Burst',
					description: 'A curse-shaped fire blast.',
					activationType: 'Active Action',
				},
			],
		} as any)
	);

	const advice = await advisor.advise(storyId, 'I cast Training Fireball');

	assert.ok(
		advice.mode === 'SUGGEST_ALTERNATIVE' || advice.mode === 'CAPABILITY_SIMULATION',
		'An incompatible capability request must never execute directly.'
	);
	if (advice.mode === 'SUGGEST_ALTERNATIVE') {
		assert.ok(advice.proposal);
		assert.equal(advice.proposal?.alternative.name, 'Dark Fire');
		assert.match(advice.proposal?.reasonRequestedCapabilityUnavailable || '', /does not currently have 'Training Fireball'/i);
	}
	assert.equal(
		repository.getEffectiveActorCapabilities(
			repository.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId
		).some((capability) => capability.name === 'Dark Fire'),
		false
	);
});

test('Phase 16 action advisor: an unknown capability request does not silently grant a new skill', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase16_advisor_novel_unknown';
	seedRun(repository, storyId, 'Dark Mage');

	const advisor = new StoryActionAdvisor(repository);
	const advice = await advisor.advise(storyId, 'I invent an entirely new forbidden star technique');

	assert.notEqual(advice.mode, 'EXECUTE_EXISTING');
	assert.equal(advice.canExecuteNow, false);
	assert.ok(advice.simulation || advice.proposal);
	assert.equal(
		repository.getEffectiveActorCapabilities(
			repository.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId
		).some((capability) => capability.name.includes('Star Curse')),
		false
	);
});
 
test('Phase 16 action advisor: already-learned capability resolves directly', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase16_advisor_existing';
	seedRun(repository, storyId, 'Wizard');

	const fireball = fireballCapability();
	givePlayerAnExistingCapability(repository, storyId, fireball);

	const advisor = new StoryActionAdvisor(repository);
	const advice = await advisor.advise(storyId, 'I cast Training Fireball');

	assert.equal(advice.mode, 'EXECUTE_EXISTING');
	assert.equal(advice.recognizedCapability?.id, 'cap_fireball_test');
	assert.equal(advice.canExecuteNow, true);
});

test('Phase 16 action advisor: generated action tips are advisory only and never create capabilities', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase16_advisor_tips';
	seedRun(repository, storyId, 'Wizard');

	givePlayerAnExistingCapability(repository, storyId, {
		...fireballCapability(),
		id: 'cap_fire_attack',
		name: 'Training Fireball',
	});

	const advisor = new StoryActionAdvisor(repository);
	const tips = await advisor.getTipsForAction(storyId, 'What can I do here?');

	assert.ok(Array.isArray(tips));
	assert.ok(tips.every((tip) => tip.title && tip.description && tip.actionText));
	assert.equal(
		repository.getEffectiveActorCapabilities(
			repository.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId
		).some((capability) => capability.id === 'cap_dark_fire_test'),
		false
	);
});


test('Phase 16 regression: ordinary movement never becomes a novel capability proposal', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase16_advisor_ordinary_move';
	seedRun(repository, storyId, 'Unknown Dark Knight');

	const advisor = new StoryActionAdvisor(repository);
	const advice = await advisor.advise(storyId, 'I move towards the structure');

	assert.equal(advice.mode, 'NORMAL_ACTION');
	assert.equal(advice.canExecuteNow, true);
	assert.equal(advice.proposal, undefined);
	assert.equal(advice.simulation, undefined);
});


test('Phase 16 contextual fallback: suggestions are tied to the visible scene when AI advice is unavailable', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase16_advisor_contextual_fallback';
	seedRun(repository, storyId, 'Ranger');

	const tips = await new StoryActionAdvisor(repository).getTipsForAction(storyId, '', {
		locationName: 'Abyssal Trench',
		locationDescription: 'Cold stone, burning vents, smoke, and fresh footprints surround a sealed structure.',
		startingSituation: 'A disturbance is coming from the structure.',
		recentActions: ['The ground trembled moments ago.'],
	});

	assert.ok(tips.length > 0);
	assert.ok(
		tips.some((tip) => /inspect|examine|investigate|disturbance|terrain|threat|position/i.test(
			`${tip.title} ${tip.description} ${tip.actionText}`
		))
	);
	assert.ok(
		tips.every((tip) => !/^use (?:a|an|the) known ability$/i.test(tip.title))
	);
});


test('Phase 16 regression: exact ordinary movement stays narrative and receives scene-grounded suggestions', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase16_advisor_move_exact_scene';
	seedRun(repository, storyId, 'Unknown Dark Knight');

	const advisor = new StoryActionAdvisor(repository);
	const advice = await advisor.advise(storyId, 'i move towards the structure', {
		locationName: 'Abyssal Trench',
		locationDescription: 'A sealed structure rises from the dark water beside fresh footprints.',
		startingSituation: 'A disturbance is coming from the structure.',
		recentActions: ['The ground trembled moments ago.'],
	});

	assert.equal(advice.mode, 'NORMAL_ACTION');
	assert.equal(advice.canExecuteNow, true);
	assert.equal(advice.proposal, undefined);
	assert.equal(advice.simulation, undefined);

	const titles = advice.tips.map((tip) => tip.title.toLowerCase());
	const actionTexts = advice.tips.map((tip) => tip.actionText.toLowerCase());
	assert.ok(
		titles.some((title) => /environment|investigate|disturbance|position|conversation/.test(title)) ||
		actionTexts.some((action) => /inspect|examine|position|respond/.test(action)),
		'Expected at least one contextual suggestion instead of only a generic known-ability recommendation.'
	);
});
