import test from 'node:test';
import assert from 'node:assert/strict';

import { DeterministicRng, deterministicId, hashStringToSeed } from '../server/domain/deterministicRng';
import { Dnd521RulesetAdapter, LocalDiceEngine } from '../server/domain/combatEngine';
import { StoryCheckEngine } from '../server/domain/storyCheckEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { canonicalCommandEngine } from '../server/domain/canonicalCommandEngine';
import { captureCanonicalStateSnapshot } from '../server/domain/canonicalSnapshot';
import { WorldSynthesisService } from '../server/services/worldSynthesisService';

function seedRepo(storyId: string) {
	const repo = new InMemoryWorldRepository();
	repo.seedStory(storyId);
	repo.saveStoryRun({
		storyId,
		id: storyId,
		worldId: 'world_solar_archive',
		characterName: 'Phase 4 Hero',
		storyMode: 'PROTAGONIST',
		dndRulesMode: 'FULL_DND',
		generationSeed: 'phase4-replay-seed',
	});
	return repo;
}

function evidence(id: string) {
	return {
		id,
		category: 'WORLD_ANOMALY' as const,
		timestamp: {
			year: 42,
			month: 10,
			day: 14,
			hour: 17,
			minute: 42,
			second: 0,
			totalElapsedSeconds: 123,
		},
		primarySubjectId: 'player',
		locationId: 'loc_whispering_orrery',
		summary: 'A canonical anomaly was observed.',
		details: 'Phase 4 replay evidence.',
		sourceEventId: 'evt_phase4_test',
		provenance: 'direct_observation',
		visibility: 'PUBLIC' as const,
	};
}

test('Phase 4 — seeded RNG produces identical sequences and deterministic ids', () => {
	const a = new DeterministicRng('phase4-seed');
	const b = new DeterministicRng('phase4-seed');
	assert.deepEqual(
		Array.from({ length: 8 }, () => a.nextInt(1, 20)),
		Array.from({ length: 8 }, () => b.nextInt(1, 20))
	);
	assert.equal(deterministicId('evt', 'story', 1, 'attack'), deterministicId('evt', 'story', 1, 'attack'));
	assert.equal(hashStringToSeed('same-input'), hashStringToSeed('same-input'));
});

test('Phase 4 — deterministic ids are independent of object key order', () => {
	assert.equal(
		deterministicId('object', { alpha: 1, beta: 2 }),
		deterministicId('object', { beta: 2, alpha: 1 })
	);
});

test('Phase 4 — RNG state export/import resumes at the exact replay position', () => {
	const rng = new DeterministicRng(123456);
	rng.next();
	rng.next();
	const state = rng.exportState();
	const restored = new DeterministicRng(999);
	restored.importState(state);
	assert.equal(restored.next(), rng.next());
	assert.deepEqual(restored.exportState(), rng.exportState());
});

test('Phase 4 — LocalDiceEngine replay is independent of wall-clock time', () => {
	const first = new LocalDiceEngine(2026);
	const second = new LocalDiceEngine(2026);
	const a = first.roll('1d20+5');
	const b = second.roll('1d20+5');
	assert.deepEqual(
		{
			formula: a.formula,
			individualDice: a.individualDice,
			total: a.total,
			seedOrEntropyMetadata: a.seedOrEntropyMetadata,
			timestamp: a.timestamp,
		},
		{
			formula: b.formula,
			individualDice: b.individualDice,
			total: b.total,
			seedOrEntropyMetadata: b.seedOrEntropyMetadata,
			timestamp: b.timestamp,
		}
	);
});

test('Phase 4 — StoryCheckEngine persists and restores its RNG position', () => {
	const a = new StoryCheckEngine();
	const character = {
		coreStats: {
			level: 1,
			strength: 10,
			dexterity: 10,
			constitution: 10,
			intelligence: 16,
			wisdom: 12,
			charisma: 10,
			ac: 10,
			speed: 30,
			hitDice: '1d10',
			hpCurrent: 10,
			hpMax: 10,
		},
		skills: [{
			id: 'investigation',
			name: 'Investigation',
			governingAbility: 'Intelligence',
			proficiency: 'PROFICIENT',
			description: 'Investigate clues.',
			provenance: 'PLAYER_INPUT',
		}],
	};
	const first = a.resolve('phase4_story', 'I investigate the strange markings on the wall.', character);
	assert.ok(first);
	const state = a.exportState();
	const b = new StoryCheckEngine();
	b.importState(state);
	const aNext = a.resolve('phase4_story', 'I investigate the strange markings on the wall.', character);
	const bNext = b.resolve('phase4_story', 'I investigate the strange markings on the wall.', character);
	assert.deepEqual(aNext?.roll.individualDice, bNext?.roll.individualDice);
	assert.equal(aNext?.total, bNext?.total);
	assert.deepEqual(a.exportState(), b.exportState());
});

test('Phase 4 — combat attack replay matches from the same seeded state', () => {
	const adapter = new Dnd521RulesetAdapter();
	const a = new LocalDiceEngine(31415);
	const b = new LocalDiceEngine(31415);
	const first = adapter.resolveAttack({
		attackBonus: 5,
		targetArmorClass: 14,
		diceEngine: a,
	});
	const second = adapter.resolveAttack({
		attackBonus: 5,
		targetArmorClass: 14,
		diceEngine: b,
	});
	assert.deepEqual(first.roll.individualDice, second.roll.individualDice);
	assert.equal(first.hits, second.hits);
	assert.equal(first.isCritical, second.isCritical);
});

test('Phase 4 — rejected story-check commands restore RNG state exactly', async () => {
	const storyId = 'phase4_rng_rollback';
	const repo = seedRepo(storyId);
	const before = captureCanonicalStateSnapshot(storyId, repo);
	const character = {
		coreStats: {
			level: 1, strength: 10, dexterity: 10, constitution: 10,
			intelligence: 16, wisdom: 12, charisma: 10, ac: 10,
			speed: 30, hitDice: '1d10', hpCurrent: 10, hpMax: 10,
		},
		skills: [],
	};
	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'phase4_rng_rollback_001',
			storyId,
			type: 'INTERACT',
			payload: { action: 'ROLL_AND_REJECT' },
			source: 'SYSTEM',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			const check = context.repository.getStoryCheckEngine(storyId).resolve(
				storyId,
				'I investigate the strange markings on the wall.',
				character
			);
			assert.ok(check);
			return { success: false, errorReason: 'Intentional RNG rollback test.' };
		}
	);
	assert.equal(result.success, false);
	assert.deepEqual(captureCanonicalStateSnapshot(storyId, repo).storyChecks, before.storyChecks);
});

test('Phase 4 — repository snapshots carry StoryCheck RNG state', () => {
	const storyId = 'phase4_snapshot_rng';
	const repo = seedRepo(storyId);
	repo.getStoryCheckEngine(storyId).resolve(
		storyId,
		'I investigate the strange markings on the wall.',
		{
			coreStats: {
				level: 1, strength: 10, dexterity: 10, constitution: 10,
				intelligence: 16, wisdom: 12, charisma: 10, ac: 10,
				speed: 30, hitDice: '1d10', hpCurrent: 10, hpMax: 10,
			},
			skills: [],
		}
	);
	const snapshot = captureCanonicalStateSnapshot(storyId, repo);
	const isolated = new InMemoryWorldRepository({ disablePersistence: true });
	isolated.restoreCanonicalStateSnapshot(snapshot, { persist: false });
	assert.deepEqual(
		isolated.getStoryCheckEngine(storyId).exportState(),
		repo.getStoryCheckEngine(storyId).exportState()
	);
});

test('Phase 4 — Chronicle writes through repository authority only become visible after canonical commit', async () => {
	const storyId = 'phase4_chronicle_commit';
	const repo = seedRepo(storyId);

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'phase4_chronicle_commit_001',
			storyId,
			actorId: repo.getPlayerLifecycle(storyId)?.actorId,
			type: 'INTERACT',
			payload: { action: 'RECORD_CANONICAL_EVIDENCE' },
			source: 'SYSTEM',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			assert.equal(context.repository.getHistoricalChronicleEngine(storyId).getChronicleEntries().length, 0);
			context.repository.getHistoricalChronicleEngine(storyId).recordEvidence(evidence('phase4_ev_commit'));
			assert.equal(repo.getHistoricalChronicleEngine(storyId).getChronicleEntries().length, 0);
			return { success: true, data: { committed: true }, summary: 'Canonical Chronicle evidence committed.' };
		}
	);

	assert.equal(result.success, true);
	assert.equal(repo.getHistoricalChronicleEngine(storyId).getChronicleEntries().length, 1);
	assert.equal(repo.getHistoricalChronicleEngine(storyId).getEpistemicEvidence()[0].metadata?.canonicalEventId, result.event?.eventId);
	assert.equal(repo.getHistoricalChronicleEngine(storyId).getEpistemicEvidence()[0].metadata?.canonicalCommandId, result.commandId);
	assert.ok(result.event?.replay.preStateHash);
	assert.ok(result.event?.replay.postStateHash);
});

test('Phase 4 — rejected Chronicle transactions leave no evidence behind', async () => {
	const storyId = 'phase4_chronicle_reject';
	const repo = seedRepo(storyId);

	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'phase4_chronicle_reject_001',
			storyId,
			actorId: repo.getPlayerLifecycle(storyId)?.actorId,
			type: 'INTERACT',
			payload: { action: 'RECORD_AND_REJECT' },
			source: 'SYSTEM',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			context.repository.getHistoricalChronicleEngine(storyId).recordEvidence(evidence('phase4_ev_reject'));
			return { success: false, errorReason: 'Intentional Chronicle rollback test.' };
		}
	);

	assert.equal(result.success, false);
	assert.equal(repo.getHistoricalChronicleEngine(storyId).getChronicleEntries().length, 0);
	assert.equal(repo.getHistoricalChronicleEngine(storyId).getEpistemicEvidence().length, 0);
});

test('Phase 4 — direct repository Chronicle writes outside canonical transactions are rejected', () => {
	const repo = seedRepo('phase4_chronicle_gate');
	assert.throws(
		() => repo.getHistoricalChronicleEngine('phase4_chronicle_gate').recordEvidence(evidence('phase4_direct_write')),
		/active canonical command transaction/i
	);
});

test('Phase 4 — replay output hashing handles commands without result data', async () => {
	const storyId = 'phase4_replay_undefined_data';
	const repo = seedRepo(storyId);
	const result = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'phase4_replay_undefined_data_001',
			storyId,
			actorId: repo.getPlayerLifecycle(storyId)?.actorId,
			type: 'INTERACT',
			payload: { action: 'NO_RESULT_DATA' },
			source: 'SYSTEM',
			transactionMode: 'STAGED',
		},
		async () => ({
			success: true,
			summary: 'No result payload.',
		})
	);
	assert.equal(result.success, true);
	assert.match(result.event?.replay.resolvedDataHash || '', /^[0-9a-f]{8}$/);
});

test('Phase 4 — canonical command replay metadata is deterministic', async () => {
	const run = async (repo: InMemoryWorldRepository) => canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'phase4_replay_metadata_001',
			storyId: 'phase4_replay_metadata',
			actorId: repo.getPlayerLifecycle('phase4_replay_metadata')?.actorId,
			type: 'INTERACT',
			payload: { action: 'REPLAY_METADATA' },
			source: 'SYSTEM',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			const run = context.repository.getStoryRun('phase4_replay_metadata')!;
			run.replayMarker = (run.replayMarker || 0) + 1;
			context.repository.saveStoryRun(run);
			return { success: true, data: { marker: run.replayMarker }, summary: 'Replay metadata test.' };
		}
	);
	const first = await run(seedRepo('phase4_replay_metadata'));
	const second = await run(seedRepo('phase4_replay_metadata'));
	assert.deepEqual(first.event?.replay, second.event?.replay);
	assert.equal(first.event?.eventId, second.event?.eventId);
	assert.equal(first.event?.replay.resolvedDataHash, second.event?.replay.resolvedDataHash);
	assert.deepEqual(first.event?.replay.rngState, second.event?.replay.rngState);
});

test('Phase 4 — replay state hashing ignores presentation-only wall-clock metadata', async () => {
	const makeRepo = (createdAt: string, narrative: string) => {
		const repo = seedRepo('phase4_replay_volatile_metadata');
		const run = repo.getStoryRun('phase4_replay_volatile_metadata')!;
		run.createdAt = createdAt;
		run.updatedAt = createdAt;
		repo.saveStoryRun(run);
		repo.getAiOrchestrator().recordNarrativeHistory(
			'phase4_replay_volatile_metadata',
			{ role: 'narrator', content: narrative }
		);
		return repo;
	};

	const execute = async (repo: InMemoryWorldRepository) => canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'phase4_replay_volatile_metadata_001',
			storyId: 'phase4_replay_volatile_metadata',
			actorId: repo.getPlayerLifecycle('phase4_replay_volatile_metadata')?.actorId,
			type: 'INTERACT',
			payload: { action: 'REPLAY_VOLATILE_METADATA' },
			source: 'SYSTEM',
			transactionMode: 'STAGED',
		},
		async (_command, context) => {
			const run = context.repository.getStoryRun('phase4_replay_volatile_metadata')!;
			run.replayStableMarker = 'same';
			context.repository.saveStoryRun(run);
			return {
				success: true,
				data: {
					mechanicalResult: 'same',
					createdAt: run.createdAt,
					latencyMs: 999,
					narrative: ['presentation must not affect replay checksum'],
				},
				summary: 'Replay volatile metadata test.',
			};
		}
	);

	const first = await execute(makeRepo('2026-01-01T00:00:00.000Z', 'first narrative'));
	const second = await execute(makeRepo('2026-09-21T15:00:00.000Z', 'second narrative'));

	assert.equal(first.success, true);
	assert.equal(second.success, true);
	assert.equal(first.event?.replay.preStateHash, second.event?.replay.preStateHash);
	assert.equal(first.event?.replay.postStateHash, second.event?.replay.postStateHash);
	assert.equal(first.event?.replay.resolvedDataHash, second.event?.replay.resolvedDataHash);
});

test('Phase 4 — deterministic world synthesis uses identical deterministic candidate output for the same seed', () => {
	const service = new WorldSynthesisService();
	const input = {
		naturalLanguagePremise: 'A solar archive awakens beneath an ancient city.',
		title: 'The Solar Archive',
		genreTags: ['FANTASY'],
		toneTags: ['MYSTERY'],
		mediumTags: ['NOVEL'],
		storyMode: 'PROTAGONIST',
		dndRulesMode: 'FULL_DND',
	};
	const a = service.buildDeterministicCandidate(input as any, 'phase4-world-seed');
	const b = service.buildDeterministicCandidate(input as any, 'phase4-world-seed');
	assert.deepEqual(a, b);
});
