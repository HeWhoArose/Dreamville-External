import test from 'node:test';
import assert from 'node:assert/strict';

import {
	canEquipItemToSlot,
	getEquipmentClass,
	getHandUsage,
	getOccupiedSlots,
	normalizeEquipmentSlot,
} from '../server/domain/equipmentRulesEngine';
import { InventoryItemEngine } from '../server/domain/inventoryItem';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { canonicalCommandEngine } from '../server/domain/canonicalCommandEngine';

const actorId = 'phase9_player';

function makeEngine(): InventoryItemEngine {
	return new InventoryItemEngine();
}

test('Phase 9: server equipment rules normalize Genesis-style aliases and two-hand semantics', () => {
	const staff = {
		name: 'Arcane Staff',
		category: 'Weapon',
		description: 'A two-handed staff.',
	};
	assert.equal(getEquipmentClass(staff), 'WEAPON');
	assert.equal(getHandUsage(staff), 'TWO_HAND');
	assert.deepEqual(getOccupiedSlots(staff, 'mainHand'), ['mainHand', 'offHand']);
	assert.equal(normalizeEquipmentSlot('back'), 'cloak');
	assert.equal(normalizeEquipmentSlot('belt'), 'waist');
	assert.equal(normalizeEquipmentSlot('ring'), 'ring1');
	assert.equal(canEquipItemToSlot(staff, 'mainHand'), true);
	assert.equal(canEquipItemToSlot(staff, 'body'), false);
});

test('Phase 9: invalid slots are rejected without mutating inventory state', () => {
	const engine = makeEngine();
	const item = engine.createInstance({
		defId: 'def_iron_sword',
		ownerEntityId: actorId,
		provenance: 'TEST',
	});
	const before = JSON.stringify(engine.exportState());
	const result = engine.equipItem(actorId, item.id, 'body' as any);
	assert.equal(result.success, false);
	assert.match(result.errorReason || '', /cannot be equipped/i);
	assert.equal(JSON.stringify(engine.exportState()), before);
});

test('Phase 9: duplicate ring instances occupy independent canonical slots', () => {
	const engine = makeEngine();
	engine.registerDefinition({
		id: 'phase9_ring',
		name: 'Phase 9 Ring',
		category: 'Accessory',
		rarity: 'Rare',
		description: 'A ring for slot conflict testing.',
		weightKg: 0.1,
		baseValueGold: 20,
		maxDurability: 100,
		tags: ['ring'],
		properties: {},
	});
	const a = engine.createInstance({ defId: 'phase9_ring', ownerEntityId: actorId, provenance: 'TEST' });
	const b = engine.createInstance({ defId: 'phase9_ring', ownerEntityId: actorId, provenance: 'TEST' });
	assert.equal(engine.equipItem(actorId, a.id, 'ring1').success, true);
	assert.equal(engine.equipItem(actorId, b.id, 'ring2').success, true);
	assert.equal(engine.getActorPaperDoll(actorId).ring1?.id, a.id);
	assert.equal(engine.getActorPaperDoll(actorId).ring2?.id, b.id);
});

test('Phase 9: two-handed equipment atomically displaces conflicting hand equipment', () => {
	const engine = makeEngine();
	engine.registerDefinition({
		id: 'phase9_staff',
		name: 'Phase 9 Great Staff',
		category: 'Weapon',
		rarity: 'Rare',
		description: 'A two-handed staff.',
		weightKg: 2,
		baseValueGold: 100,
		maxDurability: 100,
		tags: ['staff', 'two-hand'],
		properties: {},
	});
	const shield = engine.createInstance({ defId: 'def_iron_shield', ownerEntityId: actorId, provenance: 'TEST' });
	const staff = engine.createInstance({ defId: 'phase9_staff', ownerEntityId: actorId, provenance: 'TEST' });
	assert.equal(engine.equipItem(actorId, shield.id, 'offHand').success, true);
	const result = engine.equipItem(actorId, staff.id, 'mainHand');
	assert.equal(result.success, true);
	assert.deepEqual(result.displacedItems?.map((item) => item.id), [shield.id]);
	assert.equal(engine.getActorPaperDoll(actorId).mainHand?.id, staff.id);
	assert.equal(engine.getActorPaperDoll(actorId).offHand?.id, staff.id);
	assert.equal(engine.getItemInstance(shield.id)?.equippedSlot, null);
});

test('Phase 9: equipment modifiers are deterministic and duplicate instances do not collapse', () => {
	const engine = makeEngine();
	engine.registerDefinition({
		id: 'phase9_modifier_ring',
		name: 'Modifier Ring',
		category: 'Accessory',
		rarity: 'Rare',
		description: 'A deterministic modifier source.',
		weightKg: 0.1,
		baseValueGold: 25,
		maxDurability: 100,
		tags: ['ring'],
		properties: {},
		modifiers: [{
			id: 'phase9_attack',
			target: 'combat.attackBonus',
			mode: 'ADD',
			value: 2,
			precedence: 60,
			stackGroup: 'PHASE9_RING_ATTACK',
			source: {
				moduleId: 'phase9_modifier_ring',
				moduleType: 'ITEM',
				featureId: 'phase9_attack',
				sourceId: 'phase9_modifier_ring',
				sourceName: 'Modifier Ring',
				precedence: 60,
				stackGroup: 'PHASE9_RING_ATTACK',
			},
		}],
	});
	const a = engine.createInstance({ defId: 'phase9_modifier_ring', ownerEntityId: actorId, provenance: 'TEST' });
	const b = engine.createInstance({ defId: 'phase9_modifier_ring', ownerEntityId: actorId, provenance: 'TEST' });
	engine.equipItem(actorId, a.id, 'ring1');
	engine.equipItem(actorId, b.id, 'ring2');
	const modifiers = engine.getEquipmentModifiers(actorId);
	assert.equal(modifiers.length, 2);
	assert.notEqual(modifiers[0].id, modifiers[1].id);
	assert.deepEqual(modifiers.map((m) => m.id).sort(), modifiers.slice().map((m) => m.id).sort());
});

test('Phase 9: quantity consumables decrement and destroy cleanly at zero', () => {
	const engine = makeEngine();
	engine.registerDefinition({
		id: 'phase9_food',
		name: 'Phase 9 Ration',
		category: 'Food',
		rarity: 'Common',
		description: 'A finite consumable.',
		weightKg: 0.2,
		baseValueGold: 1,
		maxDurability: 1,
		tags: ['consumable'],
		properties: { healAmount: 4 },
		consumption: { mode: 'QUANTITY' },
	});
	const item = engine.createInstance({ defId: 'phase9_food', ownerEntityId: actorId, quantity: 3, provenance: 'TEST' });
	const first = engine.consumeItem(actorId, item.id, 1);
	assert.equal(first.success, true);
	assert.equal(first.remainingQuantity, 2);
	const second = engine.consumeItem(actorId, item.id, 2);
	assert.equal(second.success, true);
	assert.equal(second.destroyed, true);
	assert.equal(engine.getItemInstance(item.id), undefined);
});

test('Phase 9: charged consumables decrement charges and destroy at zero', () => {
	const engine = makeEngine();
	engine.registerDefinition({
		id: 'phase9_charge',
		name: 'Phase 9 Wand',
		category: 'Tool',
		rarity: 'Rare',
		description: 'A charged item.',
		weightKg: 0.4,
		baseValueGold: 80,
		maxDurability: 50,
		tags: ['charged'],
		properties: {},
		maxCharges: 2,
		consumption: { mode: 'CHARGE' },
	});
	const item = engine.createInstance({ defId: 'phase9_charge', ownerEntityId: actorId, provenance: 'TEST' });
	assert.equal(item.charges, 2);
	const first = engine.consumeItem(actorId, item.id, 1);
	assert.equal(first.remainingCharges, 1);
	assert.equal(first.destroyed, false);
	const second = engine.consumeItem(actorId, item.id, 1);
	assert.equal(second.remainingCharges, 0);
	assert.equal(second.destroyed, true);
	assert.equal(engine.getItemInstance(item.id), undefined);
});

test('Phase 9: destructive item operations remove authoritative instances', () => {
	const engine = makeEngine();
	const item = engine.createInstance({
		defId: 'def_iron_sword',
		ownerEntityId: actorId,
		provenance: 'TEST',
	});
	const result = engine.destroyItem(item.id);
	assert.equal(result.success, true);
	assert.equal(result.destroyedItem?.id, item.id);
	assert.equal(engine.getItemInstance(item.id), undefined);
});

test('Phase 9: inventory runtime state reloads from Story Run persistence', () => {
	const source = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase9_persistence';
	source.seedStory(storyId);
	const actor = source.getPlayerLifecycle(storyId)!.actorId;
	const inventory = source.getInventoryEngine(storyId);
	const item = inventory.createInstance({
		defId: 'def_iron_sword',
		ownerEntityId: actor,
		provenance: 'TEST',
	});
	assert.equal(inventory.equipItem(actor, item.id, 'mainHand').success, true);

	const run = source.getStoryRun(storyId)!;
	run.runtimeState = {
		...(run.runtimeState || {}),
		inventory: inventory.exportState(),
	};
	source.registerStoryRun(run);

	const reloaded = new InMemoryWorldRepository({ disablePersistence: true });
	reloaded.registerStoryRun(JSON.parse(JSON.stringify(run)));
	const imported = reloaded.getInventoryEngine(storyId);
	assert.equal(imported.getItemInstance(item.id)?.equippedSlot, 'mainHand');
});

test('Phase 9: staged inventory mutations roll back without leaking to live state', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'default_story';
	const actor = repository.getPlayerLifecycle(storyId)!.actorId;
	const inventory = repository.getInventoryEngine(storyId);
	const item = inventory.createInstance({
		defId: 'def_iron_sword',
		ownerEntityId: actor,
		provenance: 'TEST',
	});
	const before = JSON.stringify(inventory.exportState());

	const result = await canonicalCommandEngine.execute(
		repository,
		{
			commandId: 'phase9_rollback',
			storyId,
			actorId: actor,
			type: 'USE_ITEM',
			payload: { itemId: item.id, destroy: true },
			source: 'PLAYER',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			context.repository.getInventoryEngine(storyId).destroyItem(item.id);
			return { success: false, errorReason: 'Intentional Phase 9 rollback.' };
		}
	);
	assert.equal(result.success, false);
	assert.equal(result.rolledBack, true);
	assert.equal(JSON.stringify(inventory.exportState()), before);
	assert.ok(inventory.getItemInstance(item.id));
});

test('Phase 9: equipment custom rules are server-defined and execute through canonical USE_ITEM events', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'default_story';
	const actor = repository.getPlayerLifecycle(storyId)!.actorId;
	const inventory = repository.getInventoryEngine(storyId);

	inventory.registerDefinition({
		id: 'phase9_rule_food',
		name: 'Rulebound Biscuit',
		category: 'Food',
		rarity: 'Common',
		description: 'A test item with a server-authored rule.',
		weightKg: 0.1,
		baseValueGold: 1,
		maxDurability: 1,
		tags: ['rule-test'],
		properties: {},
		consumption: { mode: 'QUANTITY' },
		customRules: [{
			id: 'phase9_item_consumed',
			name: 'Track Item Consumption',
			version: 1,
			enabled: true,
			priority: 100,
			scope: 'ACTOR',
			trigger: { event: 'CANONICAL_COMMAND' },
			conditions: [{
				source: 'EVENT',
				path: 'payload.commandType',
				operator: 'EQ',
				value: 'USE_ITEM',
			}],
			effects: [{
				type: 'INCREMENT_RULE_STATE',
				key: 'phase9_item_consumed',
				amount: 1,
			}],
			provenance: 'ITEM_DEFINITION',
		}],
	});

	const item = inventory.createInstance({
		defId: 'phase9_rule_food',
		ownerEntityId: actor,
		provenance: 'TEST',
	});

	const result = await canonicalCommandEngine.execute(
		repository,
		{
			commandId: 'phase9_custom_rule',
			storyId,
			actorId: actor,
			type: 'USE_ITEM',
			payload: { itemId: item.id, amount: 1 },
			source: 'PLAYER',
			transactionMode: 'STAGED',
		},
		async (_command, context) => ({
			success: true,
			data: context.repository.getInventoryEngine(storyId).consumeItem(actor, item.id, 1),
			summary: 'Consumed Phase 9 test item.',
		})
	);

	assert.equal(result.success, true);
	const state = repository.getStoryRun(storyId)?.runtimeState?.customRules;
	assert.equal(state?.counters?.phase9_item_consumed, 1);
});
