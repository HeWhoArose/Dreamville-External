import test from 'node:test';
import assert from 'node:assert/strict';

import { InventoryItemEngine } from '../server/domain/inventoryItem';
import { PlayerStateQueryResolver } from '../server/domain/playerStateQueryResolver';

test('currency query reports missing canonical balance instead of inventing coins', () => {
	const result = PlayerStateQueryResolver.resolve({
		actionText: 'I first check how much currency do I have',
		actorId: 'actor_query_test',
		inventory: new InventoryItemEngine(),
		recentActions: [],
	});
	assert.ok(result);
	assert.equal(result.kind, 'CURRENCY_BALANCE');
	assert.match(result.response, /no currency or coin items/i);
	assert.match(result.response, /will not invent/i);
	assert.deepEqual(result.evidenceItemIds, []);
});

test('calculation follow-up reuses the prior currency query context', () => {
	const result = PlayerStateQueryResolver.resolve({
		actionText: 'I calculate how much is there',
		actorId: 'actor_query_test',
		inventory: new InventoryItemEngine(),
		recentActions: [{
			description: 'I first check how much currency do I have',
			actionType: 'CUSTOM_ACTION',
		}],
	});
	assert.ok(result);
	assert.equal(result.kind, 'CURRENCY_BALANCE');
	assert.equal(result.isFollowUp, true);
	assert.match(result.response, /no recorded currency amount to calculate/i);
});

test('ordinary calculation without currency context is not intercepted', () => {
	const result = PlayerStateQueryResolver.resolve({
		actionText: 'I calculate the distance to the tower',
		actorId: 'actor_query_test',
		inventory: new InventoryItemEngine(),
		recentActions: [],
	});
	assert.equal(result, null);
});

test('inventory summary reads canonical owned item stacks', () => {
	const inventory = new InventoryItemEngine();
	inventory.seedStarterInventoryForActor('actor_query_test');
	const result = PlayerStateQueryResolver.resolve({
		actionText: 'Check my inventory',
		actorId: 'actor_query_test',
		inventory,
		recentActions: [],
	});
	assert.ok(result);
	assert.equal(result.kind, 'INVENTORY_SUMMARY');
	assert.match(result.response, /Iron Longsword|Chancery Iron Longsword/i);
	assert.ok(result.evidenceItemIds.length > 0);
});
