import test from 'node:test';
import assert from 'node:assert/strict';

import {
	InventoryItemEngine,
	buildItemDescription,
	buildItemUseCases,
} from '../server/domain/inventoryItem';

const actorId = 'item_information_regression_actor';

test('item definitions receive a non-empty description when authored description is missing', () => {
	const engine = new InventoryItemEngine();
	engine.registerDefinition({
		id: 'regression_missing_description',
		name: 'Mystery Tonic',
		category: 'Potion',
		rarity: 'Common',
		description: '',
		weightKg: 0.1,
		baseValueGold: 4,
		maxDurability: 1,
		tags: ['consumable'],
		properties: { healAmount: 7 },
		consumption: { mode: 'QUANTITY' },
	});

	const definition = engine.getItemDefinition('regression_missing_description');
	assert.ok(definition);
	assert.ok(definition.description.trim().length > 0);
	assert.match(definition.description, /7 HP/i);
	assert.ok(Array.isArray(definition.useCases));
	assert.ok(definition.useCases!.some((entry) => /restores 7 HP/i.test(entry)));
});

test('item use-case generation remains informational and does not imply an executed action', () => {
	const uses = buildItemUseCases({
		name: 'Iron Staff',
		category: 'Weapon',
		equipable: true,
		allowedSlots: ['mainHand'],
		properties: { damageDice: '1d6', damageType: 'bludgeoning' },
	});

	assert.ok(uses.some((entry) => /use in combat/i.test(entry)));
	assert.ok(uses.some((entry) => /1d6/i.test(entry)));
	assert.equal(uses.some((entry) => /inspected|executed|committed|advanced the turn/i.test(entry)), false);
});

test('identical non-equippable item definitions stack quantity instead of creating duplicate instances', () => {
	const engine = new InventoryItemEngine();
	engine.registerDefinition({
		id: 'regression_stackable_material',
		name: 'Moonstone Shard',
		category: 'Material',
		rarity: 'Common',
		description: 'A pale shard used in arcane crafting.',
		weightKg: 0.05,
		baseValueGold: 3,
		maxDurability: 1,
		tags: ['material'],
		properties: {},
	});

	const first = engine.createInstance({
		defId: 'regression_stackable_material',
		ownerEntityId: actorId,
		quantity: 2,
		provenance: 'LOOT',
	});
	const second = engine.createInstance({
		defId: 'regression_stackable_material',
		ownerEntityId: actorId,
		quantity: 3,
		provenance: 'LOOT',
	});

	const inventory = engine.getActorInventory(actorId);
	assert.equal(inventory.length, 1);
	assert.equal(inventory[0].id, first.id);
	assert.equal(inventory[0].id, second.id);
	assert.equal(inventory[0].quantity, 5);
});

test('equippable items remain distinct instances because duplicate equipment can occupy separate slots', () => {
	const engine = new InventoryItemEngine();
	const first = engine.createInstance({
		defId: 'def_ring_light',
		ownerEntityId: actorId,
		provenance: 'LOOT',
	});
	const second = engine.createInstance({
		defId: 'def_ring_light',
		ownerEntityId: actorId,
		provenance: 'LOOT',
	});

	assert.notEqual(first.id, second.id);
	assert.equal(engine.getActorInventory(actorId).length, 2);
});

test('genesis item with missing description receives a canonical description and use-cases', () => {
	const engine = new InventoryItemEngine();
	engine.seedFromGenesisEquipment(actorId, {
		inventory: [{
			id: 'genesis_unknown_tool',
			name: 'Resonance Tuning Fork',
			category: 'Tool',
			isEquipped: false,
			quantity: 1,
			properties: {},
			provenance: 'CHARACTER_GENESIS',
		}],
	});

	const item = engine.getActorInventory(actorId)[0];
	assert.ok(item);
	const definition = engine.getItemDefinition(item.defId);
	assert.ok(definition);
	assert.ok(definition.description.trim().length > 0);
	assert.ok(definition.useCases!.length > 0);
});
