import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { captureCanonicalStateSnapshot } from '../server/domain/canonicalSnapshot';
import { oocToolRegistry } from '../server/domain/oocToolRegistry';

function seed() {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase15_ooc_tools';
	repository.seedStory(storyId);
	return { repository, storyId, actorId: repository.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}` };
}

test('Phase 15 OOC registry exposes only canonical read/write tools', async () => {
	const { repository, storyId, actorId } = seed();
	const tools = oocToolRegistry.listTools();
	assert.ok(tools.some((tool) => tool.name === 'search_memory' && tool.mode === 'READ'));
	assert.ok(tools.some((tool) => tool.name === 'equip_item' && tool.mode === 'MUTATE'));
	const result = await oocToolRegistry.execute(repository, {
		storyId,
		actorId,
		call: { name: 'not_a_real_tool' },
	});
	assert.equal(result.success, false);
});

test('Phase 15 OOC read tools remain epistemically scoped', async () => {
	const { repository, storyId, actorId } = seed();
	const result = await oocToolRegistry.execute(repository, {
		storyId,
		actorId,
		call: { name: 'search_memory', arguments: { query: 'secret' } },
	});
	assert.equal(result.success, true);
	assert.ok(Array.isArray(result.data));
});

test('Phase 15 invalid OOC equipment mutation fails closed without state drift', async () => {
	const { repository, storyId, actorId } = seed();
	const before = captureCanonicalStateSnapshot(storyId, repository);
	const result = await oocToolRegistry.execute(repository, {
		storyId,
		actorId,
		call: { name: 'equip_item', arguments: { itemId: 'does-not-exist', slot: 'body' } },
	});
	const after = captureCanonicalStateSnapshot(storyId, repository);
	assert.equal(result.success, false);
	assert.deepEqual(after, before);
});

test('Phase 15 invalid OOC ability mutation fails closed without fabricated capability state', async () => {
	const { repository, storyId, actorId } = seed();
	const before = captureCanonicalStateSnapshot(storyId, repository);
	const result = await oocToolRegistry.execute(repository, {
		storyId,
		actorId,
		call: { name: 'use_ability', arguments: { abilityId: 'unknown_ability', targetId: actorId } },
	});
	const after = captureCanonicalStateSnapshot(storyId, repository);
	assert.equal(result.success, false);
	assert.deepEqual(after, before);
});

test('Phase 15 OOC rest tool rejects malformed durations before canonical mutation', async () => {
	const { repository, storyId, actorId } = seed();
	const before = captureCanonicalStateSnapshot(storyId, repository);
	const result = await oocToolRegistry.execute(repository, {
		storyId,
		actorId,
		call: { name: 'rest', arguments: { action: 'ADVANCE', seconds: -1 } },
	});
	const after = captureCanonicalStateSnapshot(storyId, repository);
	assert.equal(result.success, false);
	assert.deepEqual(after, before);
});

test('Phase 15 OOC world-time tool rejects unsafe intervals', async () => {
	const { repository, storyId, actorId } = seed();
	const result = await oocToolRegistry.execute(repository, {
		storyId,
		actorId,
		call: { name: 'advance_time', arguments: { seconds: 86401 } },
	});
	assert.equal(result.success, false);
});

test('Phase 15 canonical OOC mutation emits a canonical event when valid', async () => {
	const { repository, storyId, actorId } = seed();
	const beforeCount = repository.getCanonicalCommandEvents(storyId).length;
	const result = await oocToolRegistry.execute(repository, {
		storyId,
		actorId,
		call: { name: 'advance_time', arguments: { seconds: 60 } },
	});
	assert.equal(result.success, true);
	assert.ok(result.commandId);
	assert.equal(repository.getCanonicalCommandEvents(storyId).length, beforeCount + 1);
});

test('Phase 15 OOC mutation replay is deterministic', async () => {
	const { repository, storyId, actorId } = seed();
	const first = await oocToolRegistry.execute(repository, {
		storyId,
		actorId,
		call: { name: 'advance_time', arguments: { seconds: 60 } },
		sequence: 1,
	});
	const second = await oocToolRegistry.execute(repository, {
		storyId,
		actorId,
		call: { name: 'advance_time', arguments: { seconds: 60 } },
		sequence: 1,
	});
	assert.equal(first.success, true);
	assert.equal(second.success, true);
	assert.equal(second.commandId, first.commandId);
});
