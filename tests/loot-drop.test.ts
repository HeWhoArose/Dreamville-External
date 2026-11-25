import test from 'node:test';
import assert from 'node:assert/strict';
import { InventoryItemEngine } from '../server/domain/inventoryItem';
import { dropDefeatedActorLoot } from '../server/domain/lootDrop';

function seeded() {
	const engine = new InventoryItemEngine();
	engine.seedFromGenesisEquipment('gladiator', {
		equipped: [{ id: 'g_sword', name: 'Notched Gladius', category: 'Weapon', isEquipped: true, slot: 'mainHand', quantity: 1, rarity: 'Common', properties: {}, provenance: 'CHARACTER_GENESIS' }],
		inventory: [{ id: 'g_flask', name: 'Water Flask', category: 'Miscellaneous', isEquipped: false, quantity: 1, rarity: 'Common', properties: {}, provenance: 'CHARACTER_GENESIS' }],
	});
	return engine;
}

test('a defeated actor drops equipped and carried items onto the ground of its location', () => {
	const engine = seeded();
	const dropped = dropDefeatedActorLoot(engine, 'gladiator', 'arena_sand');
	assert.equal(dropped.length, 2);
	assert.ok(dropped.some((d) => d.name === 'Notched Gladius' && d.wasEquipped));
	assert.equal(engine.getActorInventory('gladiator').length, 0);
	const ground = engine.getItemInstancesByOwner('arena_sand');
	assert.equal(ground.length, 2);
	assert.ok(ground.every((i) => i.containerType === 'ground' && !i.equippedSlot));
});

test('dropped gear keeps its condition and a second drop is a no-op', () => {
	const engine = seeded();
	const sword = engine.getActorInventory('gladiator').find((i) => i.name === 'Notched Gladius')!;
	engine.degradeDurability(sword.id, sword.maxDurability);
	const dropped = dropDefeatedActorLoot(engine, 'gladiator', 'arena_sand');
	assert.equal(dropped.find((d) => d.name === 'Notched Gladius')?.isBroken, true);
	assert.equal(engine.getItemInstance(sword.id)?.isBroken, true);
	assert.deepEqual(dropDefeatedActorLoot(engine, 'gladiator', 'arena_sand'), []);
});
