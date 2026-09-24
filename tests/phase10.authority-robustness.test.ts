import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterProgressionEngine } from '../server/domain/characterProgressionEngine';
import { CapabilityEngine } from '../server/domain/capabilityEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

test('Phase 10: progression resolver fails closed for missing actors', () => {
	const engine = new CharacterProgressionEngine();
	const result = engine.resolveModifiers('phase10_missing_actor');
	assert.deepEqual(result, {
		actorId: 'phase10_missing_actor',
		modifiers: [],
		sourceTrace: {},
	});
});

test('Phase 10: progression resolver still evaluates supplied authoritative modifiers without actor state', () => {
	const engine = new CharacterProgressionEngine();
	const result = engine.resolveModifiers('phase10_external_actor', undefined, [{
		id: 'phase10_item_bonus',
		target: 'combat.attackBonus',
		mode: 'ADD',
		value: 2,
		precedence: 60,
		stackGroup: 'PHASE10',
		source: {
			moduleId: 'item:phase10',
			moduleType: 'ITEM',
			featureId: 'phase10_item_bonus',
			sourceId: 'phase10_item_bonus',
			sourceName: 'Phase 10 Test Item',
			precedence: 60,
			stackGroup: 'PHASE10',
		},
	}]);
	assert.equal(result.actorId, 'phase10_external_actor');
	assert.equal(result.modifiers.length, 1);
	assert.equal(result.modifiers[0].target, 'combat.attackBonus');
	assert.equal(result.modifiers[0].value, 2);
});

test('Phase 10: capability resolver fails closed for unknown actors', () => {
	const engine = new CapabilityEngine();
	assert.deepEqual(engine.getEffectiveActorCapabilities('phase10_unknown_actor'), []);
});

test('Phase 10: duplicate equipped capability sources collapse to one capability with provenance', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'default_story';
	const actor = repository.getPlayerLifecycle(storyId)!.actorId;
	const inventory = repository.getInventoryEngine(storyId);
	const capabilities = repository.getCapabilityEngine(storyId);

	capabilities.registerCapability({
		id: 'phase10_shared_cap',
		name: 'Phase 10 Shared Capability',
		description: 'A capability granted by two items.',
		category: 'TECHNIQUE',
		provenance: 'phase10_test',
		minVesselCapacityRequired: 0,
	});
	const a = inventory.createInstance({
		defId: 'def_iron_sword',
		ownerEntityId: actor,
		provenance: 'TEST',
	});
	const b = inventory.createInstance({
		defId: 'def_iron_shield',
		ownerEntityId: actor,
		provenance: 'TEST',
	});
	const swordDef = inventory.getAllDefinitions().find((definition) => definition.id === a.defId)!;
	const shieldDef = inventory.getAllDefinitions().find((definition) => definition.id === b.defId)!;
	inventory.registerDefinition({
		...swordDef,
		grantedCapabilities: ['phase10_shared_cap'],
	});
	inventory.registerDefinition({
		...shieldDef,
		grantedCapabilities: ['phase10_shared_cap'],
	});
	inventory.equipItem(actor, a.id, 'mainHand');
	inventory.equipItem(actor, b.id, 'offHand');

	const effective = capabilities.getEffectiveActorCapabilities(actor, inventory);
	const shared = effective.filter((cap) => cap.id === 'phase10_shared_cap');
	assert.equal(shared.length, 1);
	assert.equal(shared[0].sources.filter((source) => source.type === 'EQUIPMENT').length, 2);
});

test('Phase 10: equipment capability resolution deduplicates the same two-hand instance', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'default_story';
	const actor = repository.getPlayerLifecycle(storyId)!.actorId;
	const inventory = repository.getInventoryEngine(storyId);
	const capabilities = repository.getCapabilityEngine(storyId);

	capabilities.registerCapability({
		id: 'phase10_two_hand_cap',
		name: 'Phase 10 Two-Hand Capability',
		description: 'A capability from a two-handed item.',
		category: 'TECHNIQUE',
		provenance: 'phase10_test',
		minVesselCapacityRequired: 0,
	});
	const item = inventory.createInstance({
		defId: 'def_iron_sword',
		ownerEntityId: actor,
		provenance: 'TEST',
	});
	const def = inventory.getAllDefinitions().find((definition) => definition.id === item.defId)!;
	inventory.registerDefinition({
		...def,
		handUsage: 'TWO_HAND',
		grantedCapabilities: ['phase10_two_hand_cap'],
	});
	inventory.equipItem(actor, item.id, 'mainHand');

	const effective = capabilities.getEffectiveActorCapabilities(actor, inventory);
	const shared = effective.find((cap) => cap.id === 'phase10_two_hand_cap');
	assert.ok(shared);
	assert.equal(shared?.sources.filter((source) => source.type === 'EQUIPMENT').length, 1);
});

test('Phase 10: capability resolution does not mutate inventory state', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'default_story';
	const actor = repository.getPlayerLifecycle(storyId)!.actorId;
	const inventory = repository.getInventoryEngine(storyId);
	const capabilities = repository.getCapabilityEngine(storyId);
	const before = JSON.stringify(inventory.exportState());
	capabilities.getEffectiveActorCapabilities(actor, inventory);
	assert.equal(JSON.stringify(inventory.exportState()), before);
});

test('Phase 10: equipment modifiers remain deterministic across repeated repository resolution', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'default_story';
	const actor = repository.getPlayerLifecycle(storyId)!.actorId;
	const inventory = repository.getInventoryEngine(storyId);
	const progression = repository.getCharacterProgressionEngine(storyId);
	const item = inventory.createInstance({
		defId: 'def_iron_sword',
		ownerEntityId: actor,
		provenance: 'TEST',
	});
	inventory.equipItem(actor, item.id, 'mainHand');
	const modifiers = inventory.getEquipmentModifiers(actor);
	const first = JSON.stringify(progression.resolveModifiers(actor, repository.getRulesProfile(storyId) || undefined, modifiers));
	const second = JSON.stringify(progression.resolveModifiers(actor, repository.getRulesProfile(storyId) || undefined, modifiers));
	assert.equal(second, first);
});
