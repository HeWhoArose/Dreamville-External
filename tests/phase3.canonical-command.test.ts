import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { canonicalCommandEngine } from '../server/domain/canonicalCommandEngine';
import { captureCanonicalStateSnapshot, compareCanonicalSnapshots } from '../server/domain/canonicalSnapshot';

function seedRepo(storyId: string) {
	const repo = new InMemoryWorldRepository();
	repo.seedStory(storyId);
	return repo;
}

test('Phase 3 — canonical command commits once and emits one canonical event', async () => {
	const storyId = 'phase3_command_commit';
	const repo = seedRepo(storyId);
	const before = captureCanonicalStateSnapshot(storyId, repo);
	let executions = 0;

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_commit_001',
			storyId,
			actorId: before.player?.actorId || `player_actor_${storyId}`,
			type: 'INTERACT',
			payload: { action: 'OPEN_DOOR' },
			source: 'PLAYER',
		},
		async () => {
			executions += 1;
			const run = repo.getStoryRun(storyId);
			run.canonicalCommandTestCounter = (run.canonicalCommandTestCounter || 0) + 1;
			repo.saveStoryRun(run);
			return {
				success: true,
				data: { accepted: true },
				summary: 'Test interaction committed.',
			};
		}
	);

	assert.equal(result.success, true);
	assert.equal(executions, 1);
	assert.equal(repo.getCanonicalCommandEvents(storyId).length, 1);
	assert.equal(repo.getCanonicalCommandEvents(storyId)[0].commandId, 'cmd_commit_001');
	assert.ok(result.event?.mutationCount && result.event.mutationCount > 0);

	const after = captureCanonicalStateSnapshot(storyId, repo);
	assert.equal(compareCanonicalSnapshots(before, after).identical, false);
});

test('Phase 3 — rejected command rolls back every mutation made before rejection', async () => {
	const storyId = 'phase3_command_rollback';
	const repo = seedRepo(storyId);
	const before = captureCanonicalStateSnapshot(storyId, repo);
	const originalRun = repo.getStoryRun(storyId);
	const originalValue = originalRun.canonicalCommandTestCounter;

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_rollback_001',
			storyId,
			actorId: before.player?.actorId || `player_actor_${storyId}`,
			type: 'INTERACT',
			payload: { action: 'INVALID' },
			source: 'PLAYER',
		},
		async () => {
			const run = repo.getStoryRun(storyId);
			run.canonicalCommandTestCounter = 999;
			repo.saveStoryRun(run);
			return {
				success: false,
				errorReason: 'Rejected after staged mutation.',
			};
		}
	);

	assert.equal(result.success, false);
	assert.equal(result.rolledBack, true);
	assert.equal(repo.getStoryRun(storyId)?.canonicalCommandTestCounter, originalValue);
	assert.deepEqual(repo.getCanonicalCommandEvents(storyId), []);
	assert.equal(compareCanonicalSnapshots(before, captureCanonicalStateSnapshot(storyId, repo)).identical, true);
});

test('Phase 3 — duplicate commandId cannot execute a second time', async () => {
	const storyId = 'phase3_command_duplicate';
	const repo = seedRepo(storyId);
	let executions = 0;

	const command = {
		commandId: 'cmd_duplicate_001',
		storyId,
		actorId: repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`,
		type: 'INTERACT' as const,
		payload: { action: 'OBSERVE' },
		source: 'PLAYER' as const,
	};

	const first = await canonicalCommandEngine.execute(repo, command, async () => {
		executions += 1;
		return { success: true, data: { value: executions }, summary: 'Observation committed.' };
	});

	const second = await canonicalCommandEngine.execute(repo, command, async () => {
		executions += 1;
		return { success: true, data: { value: executions }, summary: 'This must not execute twice.' };
	});

	assert.equal(first.success, true);
	assert.equal(second.success, true);
	assert.equal(executions, 1);
	assert.equal(repo.getCanonicalCommandEvents(storyId).length, 1);
	assert.deepEqual(second.data, first.data);
});

test('Phase 3 — duplicate commandId with a different payload is rejected', async () => {
	const storyId = 'phase3_command_conflict';
	const repo = seedRepo(storyId);

	const base = {
		commandId: 'cmd_conflict_001',
		storyId,
		actorId: repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`,
		type: 'MOVE' as const,
		source: 'PLAYER' as const,
	};

	await canonicalCommandEngine.execute(
		repo,
		{ ...base, payload: { targetX: 1, targetY: 2 } },
		async () => ({ success: true, data: { accepted: true }, summary: 'Move committed.' })
	);

	const conflict = await canonicalCommandEngine.execute(
		repo,
		{ ...base, payload: { targetX: 9, targetY: 9 } },
		async () => ({ success: true, data: { accepted: true }, summary: 'Must not execute.' })
	);

	assert.equal(conflict.success, false);
	assert.match(conflict.errorReason || '', /different payload/i);
});
