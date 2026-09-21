import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
	assert.equal('resultData' in repo.getCanonicalCommandEvents(storyId)[0], false);
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

test('Phase 3 — rejected STAGED handlers cannot leak mutations into the live repository', async () => {
	const storyId = 'phase3_staged_rejected_live_leak';
	const repo = seedRepo(storyId);
	const before = captureCanonicalStateSnapshot(storyId, repo);
	const actorId = repo.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId;

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_staged_rejected_live_leak_001',
			storyId,
			actorId,
			type: 'INTERACT',
			payload: { action: 'FORCE_REJECTED_LIVE_REPOSITORY_LEAK' },
			source: 'SYSTEM',
			transactionMode: 'STAGED',
		},
		async () => {
			const liveRun = repo.getStoryRun(storyId)!;
			liveRun.rejectedLeakMarker = 'must_not_survive';
			repo.saveStoryRun(liveRun);
			return {
				success: false,
				errorReason: 'Intentional rejection after live repository leak.',
			};
		}
	);

	assert.equal(result.success, false);
	assert.equal(result.rolledBack, true);
	assert.match(result.errorReason || '', /mutated live canonical state/i);
	assert.equal(compareCanonicalSnapshots(before, captureCanonicalStateSnapshot(storyId, repo)).identical, true);
	assert.equal(repo.getStoryRun(storyId)?.rejectedLeakMarker, undefined);
	assert.equal(repo.getCanonicalCommandEvents(storyId).length, 0);
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

test('Phase 3 — staged living-world mutations roll back when the command is rejected', async () => {
	const storyId = 'phase3_living_world_rollback';
	const repo = seedRepo(storyId);
	const before = captureCanonicalStateSnapshot(storyId, repo);
	const actorId = repo.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId;

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_living_world_rollback_001',
			storyId,
			actorId,
			type: 'INTERACT',
			payload: { action: 'SCHEDULE_AND_REJECT' },
			source: 'SYSTEM',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			context.repository.getLivingWorldSimulation(storyId).scheduleEvent({
				id: 'phase3_scheduled_event_rollback',
				kind: 'TEST',
				name: 'Phase 3 rollback event',
				locationId: 'loc_whispering_orrery',
				triggerTimestamp: { totalElapsedSeconds: 60, cycle: 1, period: 'Dawn' },
				isResolved: false,
				status: 'pending',
			});
			return { success: false, errorReason: 'Intentional living-world rejection.' };
		}
	);

	assert.equal(result.success, false);
	assert.equal(result.rolledBack, true);
	assert.equal(compareCanonicalSnapshots(before, captureCanonicalStateSnapshot(storyId, repo)).identical, true);
	assert.equal(repo.getCanonicalCommandEvents(storyId).length, 0);
});

test('Phase 3 — staged world-time simulation rolls back all canonical mutations on rejection', async () => {
	const storyId = 'phase3_living_world_time_rollback';
	const repo = seedRepo(storyId);
	const before = captureCanonicalStateSnapshot(storyId, repo);
	const actorId = repo.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId;
	const { WorldSimulationService } = await import('../server/simulation/worldSimulationService');

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_living_world_time_rollback_001',
			storyId,
			actorId,
			type: 'ADVANCE_TIME',
			payload: { seconds: 3600 },
			source: 'SYSTEM',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			const simulation = new WorldSimulationService(context.repository);
			simulation.advanceTime(storyId, 3600);
			return { success: false, errorReason: 'Intentional world-time rejection.' };
		}
	);

	assert.equal(result.success, false);
	assert.equal(result.rolledBack, true);
	assert.equal(compareCanonicalSnapshots(before, captureCanonicalStateSnapshot(storyId, repo)).identical, true);
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

test('Phase 3 — STAGED commands keep live canonical state unchanged until commit', async () => {
	const storyId = 'phase3_staged_commit';
	const repo = seedRepo(storyId);
	const actorId = repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_staged_commit_001',
			storyId,
			actorId,
			type: 'INTERACT',
			payload: { action: 'STAGED_MUTATION' },
			source: 'PLAYER',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			const stagedRun = context.repository.getStoryRun(storyId)!;
			stagedRun.stagedMutationMarker = 'committed';
			context.repository.saveStoryRun(stagedRun);

			assert.equal(repo.getStoryRun(storyId)?.stagedMutationMarker, undefined);
			return {
				success: true,
				data: { committed: true },
				summary: 'Staged mutation committed.',
			};
		}
	);

	assert.equal(result.success, true);
	assert.equal(result.event?.transactionMode, 'STAGED');
	assert.equal(repo.getStoryRun(storyId)?.stagedMutationMarker, 'committed');
	assert.equal(result.event?.mutationCount && result.event.mutationCount > 0, true);
});

test('Phase 3 — STAGED handlers that leak into the live repository are rejected and rolled back', async () => {
	const storyId = 'phase3_staged_live_leak_guard';
	const repo = seedRepo(storyId);
	const before = captureCanonicalStateSnapshot(storyId, repo);
	const actorId = repo.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId;

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_staged_live_leak_guard_001',
			storyId,
			actorId,
			type: 'INTERACT',
			payload: { action: 'FORCE_LIVE_REPOSITORY_LEAK' },
			source: 'SYSTEM',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			const stagedRun = context.repository.getStoryRun(storyId)!;
			stagedRun.stagedMarker = 'isolated';
			context.repository.saveStoryRun(stagedRun);

			// Simulate a legacy/global dependency accidentally mutating the live repository.
			const liveRun = repo.getStoryRun(storyId)!;
			liveRun.leakedMarker = 'must_not_survive';
			repo.saveStoryRun(liveRun);

			return {
				success: true,
				data: { accepted: true },
				summary: 'Intentional staged live-repository leak test.',
			};
		}
	);

	assert.equal(result.success, false);
	assert.equal(result.rolledBack, true);
	assert.match(result.errorReason || '', /mutated live canonical state/i);
	assert.equal(compareCanonicalSnapshots(before, captureCanonicalStateSnapshot(storyId, repo)).identical, true);
	assert.equal(repo.getStoryRun(storyId)?.leakedMarker, undefined);
	assert.equal(repo.getCanonicalCommandEvents(storyId).length, 0);
});
test('Phase 3 — rejected STAGED commands never touch live canonical state', async () => {
	const storyId = 'phase3_staged_reject';
	const repo = seedRepo(storyId);
	const actorId = repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_staged_reject_001',
			storyId,
			actorId,
			type: 'INTERACT',
			payload: { action: 'STAGED_REJECT' },
			source: 'PLAYER',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			const stagedRun = context.repository.getStoryRun(storyId)!;
			stagedRun.rejectedMarker = 'must_not_commit';
			context.repository.saveStoryRun(stagedRun);
			return {
				success: false,
				errorReason: 'Intentional staged rejection.',
			};
		}
	);

	assert.equal(result.success, false);
	assert.equal(result.rolledBack, true);
	assert.equal(repo.getStoryRun(storyId)?.rejectedMarker, undefined);
	assert.equal(repo.getCanonicalCommandEvents(storyId).length, 0);
});

test('Phase 3 — canonical validator accepts location movement and time advancement payloads', async () => {
	const storyId = 'phase3_payload_variants';
	const repo = seedRepo(storyId);
	const actorId = repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;

	const moveResult = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_location_move_001',
			storyId,
			actorId,
			type: 'MOVE',
			payload: { targetLocationId: 'loc_north_gate' },
			source: 'PLAYER',
		},
		async () => ({ success: true, data: { accepted: true }, summary: 'Location move accepted.' })
	);
	assert.equal(moveResult.success, true);

	const timeResult = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_advance_time_001',
			storyId,
			actorId,
			type: 'ADVANCE_TIME',
			payload: { seconds: 60 },
			source: 'PLAYER',
		},
		async () => ({ success: true, data: { accepted: true }, summary: 'Time advance accepted.' })
	);
	assert.equal(timeResult.success, true);
});

test('Phase 3 — commit failure rolls a STAGED transaction back to the pre-command snapshot', async () => {
	const storyId = 'phase3_commit_failure_rollback';
	const repo = seedRepo(storyId);
	const actorId = repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;
	const before = captureCanonicalStateSnapshot(storyId, repo);
	const originalAppend = repo.appendCanonicalCommandEvent.bind(repo);

	(repo as any).appendCanonicalCommandEvent = () => {
		throw new Error('Simulated canonical event emission failure.');
	};

	try {
		const result = await canonicalCommandEngine.execute(
			repo,
			{
				commandId: 'cmd_commit_failure_001',
				storyId,
				actorId,
				type: 'INTERACT',
				payload: { action: 'FORCE_COMMIT_FAILURE' },
				source: 'PLAYER',
				transactionMode: 'STAGED',
			},
			async (_command, context) => {
				const run = context.repository.getStoryRun(storyId)!;
				run.commitFailureMarker = 'must_rollback';
				context.repository.saveStoryRun(run);
				return {
					success: true,
					data: { accepted: true },
					summary: 'Intentional commit-failure test mutation.',
				};
			}
		);

		assert.equal(result.success, false);
		assert.equal(result.rolledBack, true);
		assert.match(result.errorReason || '', /event emission failure/i);
		assert.equal(compareCanonicalSnapshots(before, captureCanonicalStateSnapshot(storyId, repo)).identical, true);
		assert.equal(repo.getCanonicalCommandEvents(storyId).length, 0);
	} finally {
		(repo as any).appendCanonicalCommandEvent = originalAppend;
	}
});


test('Phase 3 — staged transaction does not persist speculative repository state before commit', async () => {
	const storyId = 'phase3_transaction_persistence_boundary';
	const tempDir = mkdtempSync(join(tmpdir(), 'dreambook-phase3-'));
	const persistencePath = join(tempDir, 'data.json');
	const previousPath = process.env.DREAMBOOK_PERSISTENCE_PATH;

	process.env.DREAMBOOK_PERSISTENCE_PATH = persistencePath;
	try {
		const repo = seedRepo(storyId);
		const before = JSON.parse(readFileSync(persistencePath, 'utf8'));
		const beforeCounter = before.storyRuns?.[storyId]?.canonicalCommandTestCounter;

		let persistedDuringHandler: number | undefined;
		const result = await canonicalCommandEngine.execute(
			repo,
			{
				commandId: 'cmd_staged_persistence_001',
				storyId,
				actorId: repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`,
				type: 'INTERACT',
				payload: { action: 'PERSISTENCE_BOUNDARY' },
				source: 'PLAYER',
				transactionMode: 'STAGED',
			},
			async (_command, context) => {
				const run = context.repository.getStoryRun(storyId);
				run.canonicalCommandTestCounter = 7;
				context.repository.saveStoryRun(run);
				persistedDuringHandler = JSON.parse(readFileSync(persistencePath, 'utf8')).storyRuns?.[storyId]?.canonicalCommandTestCounter;
				return { success: true, data: { committed: true }, summary: 'Staged persistence boundary committed.' };
			}
		);

		assert.equal(result.success, true);
		assert.equal(persistedDuringHandler, beforeCounter);
		const persistedAfterCommit = JSON.parse(readFileSync(persistencePath, 'utf8'));
		assert.equal(persistedAfterCommit.storyRuns?.[storyId]?.canonicalCommandTestCounter, 7);
		assert.equal(repo.getStoryRun(storyId)?.canonicalCommandTestCounter, 7);
	} finally {
		if (previousPath === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
		else process.env.DREAMBOOK_PERSISTENCE_PATH = previousPath;
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test('Phase 3 — staged story-director resolution reads and writes the transaction repository', async () => {
	const storyId = 'phase3_story_director_transaction_scope';
	const repo = seedRepo(storyId);

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'cmd_story_director_transaction_scope_001',
			storyId,
			actorId: repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`,
			type: 'INTERACT',
			payload: { action: 'STORY_DIRECTOR_STEP' },
			source: 'SYSTEM',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			context.repository.saveWorldFact(storyId, {
				factId: 'phase3_coded_cipher',
				statement: 'Coded cipher evidence discovered.',
				category: 'world_lore',
				subjectEntityId: 'player_character',
				predicate: 'has_evidence',
				objectValue: 'coded cipher',
				provenanceClass: 'DIRECT_RECORD',
				provenanceSummary: 'Phase 3 transaction test',
				sourceSegmentIds: [],
				confidence: 1,
				acquiredAtTimestamp: { totalElapsedSeconds: 0, cycle: 1, period: 'Dawn' },
			});

			const { storyDirectorService } = await import('../server/services/storyDirectorService');
			const result = storyDirectorService.stepDirector(storyId, context.repository);
			assert.equal(result.eventGenerated, true);
			assert.equal(result.beat?.beatId, 'beat_coded_cipher');
			return { success: true, data: result, summary: 'Story Director observed staged transaction state.' };
		}
	);

	assert.equal(result.success, true);
	assert.equal(repo.getWorldFacts(storyId).some((fact) => fact.factId === 'phase3_coded_cipher'), true);
});


test('Phase 3 — canonical snapshots are deep-isolated from later repository mutations', () => {
	const storyId = 'phase3_snapshot_deep_isolation';
	const repo = seedRepo(storyId);
	const run = repo.getStoryRun(storyId)!;
	run.nestedTransactionProbe = {
		thread: { title: 'Original', stage: 1 },
		effects: [{ effectId: 'effect_1', charges: 2 }],
	};
	repo.saveStoryRun(run);

	const snapshot = captureCanonicalStateSnapshot(storyId, repo);
	const liveRun = repo.getStoryRun(storyId)!;
	liveRun.nestedTransactionProbe.thread.title = 'Mutated';
	liveRun.nestedTransactionProbe.thread.stage = 99;
	liveRun.nestedTransactionProbe.effects[0].charges = 0;
	repo.saveStoryRun(liveRun);

	assert.equal(snapshot.adaptation.ch16Run?.nestedTransactionProbe?.thread?.title, 'Original');
	assert.equal(snapshot.adaptation.ch16Run?.nestedTransactionProbe?.thread?.stage, 1);
	assert.equal(snapshot.adaptation.ch16Run?.nestedTransactionProbe?.effects?.[0]?.charges, 2);
});
