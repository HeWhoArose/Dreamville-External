import test from 'node:test';
import assert from 'node:assert/strict';
import { InventoryItemEngine } from '../server/domain/inventoryItem';
import { NarrativeStateBroker } from '../server/domain/narrativeStateBroker';

test('item use lookup returns availability and quantity without exposing unrelated inventory', () => {
	const inventory = new InventoryItemEngine();
	inventory.createInstance({
		defId: 'def_healing_salve',
		ownerEntityId: 'actor_1',
		quantity: 2,
		provenance: 'test',
	});
	const repository = {
		getInventoryEngine: () => inventory,
	} as any;

	const broker = new NarrativeStateBroker();
	const result = broker.inspectItemUse(repository, 'story_1', 'actor_1', 'I use my Alchemical Healing Salve.');

	assert.equal(result.requested, true);
	assert.equal(result.found, true);
	assert.equal(result.availableAmount, 2);
	assert.equal(result.definition?.properties?.healAmount, 12);
});

test('missing requested item is blocked instead of becoming a hallucinated use', () => {
	const inventory = new InventoryItemEngine();
	const repository = { getInventoryEngine: () => inventory } as any;
	const broker = new NarrativeStateBroker();

	const result = broker.inspectItemUse(repository, 'story_1', 'actor_1', 'I use my silver potion.');

	assert.equal(result.requested, true);
	assert.equal(result.found, false);
	assert.match(result.reason || '', /not present/i);
});

test('non-item narrative actions do not trigger inventory resolution', () => {
	const inventory = new InventoryItemEngine();
	const repository = { getInventoryEngine: () => inventory } as any;
	const broker = new NarrativeStateBroker();

	const result = broker.inspectItemUse(repository, 'story_1', 'actor_1', 'I walk toward the archive door.');

	assert.equal(result.requested, false);
});
