import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { canonicalCommandEngine } from '../server/domain/canonicalCommandEngine';
import { captureCanonicalStateSnapshot, compareCanonicalSnapshots } from '../server/domain/canonicalSnapshot';

function seedRepo(storyId: string) {
	const repo = new InMemoryWorldRepository();
	repo.seedStory(storyId);
	repo.saveStoryRun({
		storyId,
		id: storyId,
		worldId: 'world_solar_archive',
		characterName: 'Phase 3 Hero',
		storyMode: 'PROTAGONIST',
		dndRulesMode: 'FULL_DND',
	});
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

test('Phase 3 — command payload validation rejects malformed MOVE before mutation', async () => {
	const storyId = 'phase3_command_validation';
	const repo = seedRepo(storyId);
	const before = captureCanonicalStateSnapshot(storyId, repo);

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_validation_001',
			storyId,
			actorId: before.player?.actorId || `player_actor_${storyId}`,
			type: 'MOVE',
			payload: { targetX: '10', targetY: 4 } as any,
			source: 'PLAYER',
		},
		async () => {
			throw new Error('Handler must not run when validation fails.');
		}
	);

	assert.equal(result.success, false);
	assert.match(result.errorReason || '', /numeric targetX and targetY/i);
	assert.equal(result.rolledBack, false);
	assert.equal(compareCanonicalSnapshots(before, captureCanonicalStateSnapshot(storyId, repo)).identical, true);
});

test('Phase 3 — rollback restores a real combat mutation after downstream rejection', async () => {
	const storyId = 'phase3_combat_rollback';
	const repo = seedRepo(storyId);
	const combat = repo.getCombatEngine(storyId);
	const hero = repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;

	combat.addParticipant({
		id: hero,
		name: 'Hero',
		x: 0,
		y: 0,
		initiative: 20,
		team: 'player_allies',
		hpCurrent: 20,
		hpMax: 20,
		armorClass: 12,
		speedCells: 6,
		attackBonus: 5,
		damageFormula: '1d4+1',
		conditions: [],
		isDead: false,
	});
	combat.addParticipant({
		id: 'phase3_enemy',
		name: 'Enemy',
		x: 10,
		y: 10,
		initiative: 1,
		team: 'enemies',
		hpCurrent: 20,
		hpMax: 20,
		armorClass: 12,
		speedCells: 6,
		attackBonus: 3,
		damageFormula: '1d4+1',
		conditions: [],
		isDead: false,
	});
	combat.rollInitiative();

	const before = captureCanonicalStateSnapshot(storyId, repo);
	const command = {
		commandId: 'cmd_combat_rollback_001',
		storyId,
		actorId: hero,
		type: 'MOVE' as const,
		payload: { targetX: 3, targetY: 0 },
		source: 'PLAYER' as const,
	};

	const result = await canonicalCommandEngine.execute(repo, command, async () => {
		const move = combat.moveActor(hero, 3, 0);
		assert.equal(move.success, true);
		return {
			success: false,
			errorReason: 'Simulated post-resolution failure after movement mutation.',
		};
	});

	assert.equal(result.success, false);
	assert.equal(result.rolledBack, true);
	assert.equal(combat.getParticipant(hero)?.x, 0);
	assert.equal(combat.getParticipant(hero)?.y, 0);
	assert.equal(compareCanonicalSnapshots(before, captureCanonicalStateSnapshot(storyId, repo)).identical, true);
});

test('Phase 3 — AI commands use the same payload validation as player commands', async () => {
	const storyId = 'phase3_ai_validation';
	const repo = seedRepo(storyId);
	const actorId = repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_ai_invalid_move_001',
			storyId,
			actorId,
			type: 'MOVE',
			payload: { targetX: 4, targetY: 'invalid' } as any,
			source: 'AI',
		},
		async () => {
			throw new Error('AI handler must not execute when command validation fails.');
		}
	);

	assert.equal(result.success, false);
	assert.match(result.errorReason || '', /numeric targetX and targetY/i);
	assert.equal(repo.getCanonicalCommandEvents(storyId).length, 0);
});

test('Phase 3 — commands for the same story serialize to prevent snapshot races', async () => {
	const storyId = 'phase3_story_serialization';
	const repo = seedRepo(storyId);
	const actorId = repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;
	const order: string[] = [];

	const makeCommand = (commandId: string, delayMs: number) =>
		canonicalCommandEngine.execute(
			repo,
			{
				commandId,
				storyId,
				actorId,
				type: 'INTERACT',
				payload: { action: commandId },
				source: 'PLAYER',
			},
			async () => {
				order.push(`${commandId}:start`);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
				const run = repo.getStoryRun(storyId);
				run.commandSequence = [...(run.commandSequence || []), commandId];
				repo.saveStoryRun(run);
				order.push(`${commandId}:end`);
				return { success: true, data: { commandId }, summary: `${commandId} committed.` };
			}
		);

	await Promise.all([
		makeCommand('cmd_serial_1', 30),
		makeCommand('cmd_serial_2', 0),
	]);

	assert.deepEqual(order, [
		'cmd_serial_1:start',
		'cmd_serial_1:end',
		'cmd_serial_2:start',
		'cmd_serial_2:end',
	]);
	assert.deepEqual(repo.getStoryRun(storyId)?.commandSequence, ['cmd_serial_1', 'cmd_serial_2']);
	assert.equal(repo.getCanonicalCommandEvents(storyId).length, 2);
});
