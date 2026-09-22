import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityRegistry } from '../server/domain/entityCard';

test('entity templates produce reusable independent instances', () => {
	const registry = new EntityRegistry('entity_test');
	const template = registry.createTemplate({
		name: 'Common Cockroach',
		kind: 'CREATURE',
		coreStats: {
			level: 1,
			hpCurrent: 1,
			hpMax: 1,
			armorClass: 10,
			speed: 5,
			abilityScores: { strength: 1, dexterity: 4, constitution: 1, intelligence: 0, wisdom: 1, charisma: 0 },
		},
		behavior: { defaultBehavior: 'Flee', threatResponse: 'Flee when threatened.', priorities: ['Survive', 'Seek food'], routines: [] },
		personality: { traits: [], values: [], motivations: ['Survival'], fears: [], desires: [] },
		social: { factionIds: [], reputation: {}, relationships: {} },
		worldState: { isAlive: true, presence: 'unknown' },
		traits: [], capabilities: [], feats: [], equipment: [], memoryRefs: [],
	});

	const first = registry.instantiateTemplate(template.id);
	const second = registry.instantiateTemplate(template.id);
	assert.equal(template.lifecycle.status, 'TEMPLATE');
	assert.notEqual(first.id, second.id);
	assert.equal(first.templateId, template.id);
	assert.equal(second.templateId, template.id);
	assert.equal(first.lifecycle.status, 'ACTIVE');
});

test('merchant entity cards can omit creature-only mechanics', () => {
	const registry = new EntityRegistry('merchant_test');
	const merchant = registry.upsert({
		name: 'Borin',
		kind: 'MERCHANT',
		identity: { species: 'Human', aliases: [] },
		classification: { profession: 'Merchant', tags: ['merchant'] },
		personality: { traits: ['Greedy'], values: ['Profit'], motivations: ['Trade'], fears: [], desires: ['Reach Stonehaven'] },
		behavior: { defaultBehavior: 'Trade', threatResponse: 'Negotiate', priorities: ['Protect inventory'], routines: [] },
		social: { factionIds: [], reputation: {}, relationships: {} },
		economy: { wealth: 347, currency: { gold: 347 }, inventoryItemIds: [], inventorySummary: ['Healing Potion x3'], assets: [] },
		background: { history: 'Former caravan assistant.', importantEvents: [] },
		worldState: { currentActivity: 'Trading', currentGoal: 'Reach Stonehaven', isAlive: true, presence: 'present' },
		traits: [], capabilities: [], feats: [], equipment: [], memoryRefs: [],
	});
	assert.equal(merchant.economy?.wealth, 347);
	assert.equal(merchant.background?.history, 'Former caravan assistant.');
	assert.equal(merchant.coreStats, undefined);
});
