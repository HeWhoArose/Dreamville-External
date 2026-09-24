import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { PHASE15_ACCEPTANCE_GATES, PHASE15_SCENARIO_MATRIX } from '../server/domain/phase15AcceptanceMatrix';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { narrativeProfileEngine } from '../server/domain/narrativeProfileEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { canonicalCommandEngine } from '../server/domain/canonicalCommandEngine';
import { captureCanonicalStateSnapshot } from '../server/domain/canonicalSnapshot';
import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { ConditionEngine } from '../server/domain/conditionEngine';
import { DeathSaveEngine } from '../server/domain/deathSaveEngine';
import { SpellRuntimeEngine } from '../server/domain/spellRuntime';
import { PersistenceMigrationService } from '../server/services/persistenceMigrationService';
import { MultiModelOrchestrator, DeterministicMockAdapter } from '../server/domain/aiOrchestrator';
import { DeveloperDiagnosticsService } from '../server/domain/developerDiagnosticsService';

function createTestOrchestrator(repository?: InMemoryWorldRepository): MultiModelOrchestrator {
	const orchestrator = new MultiModelOrchestrator(repository);
	(orchestrator as any).savePersistedConfig = () => {};
	return orchestrator;
}

function model(providerId: string, modelId: string, tasks: string[]) {
	return {
		providerId,
		modelId,
		displayName: modelId,
		pool: 'fast' as const,
		capabilities: ['text_generation', 'structured_output'],
		contextWindow: 128000,
		health: 'Healthy' as const,
		quota: 'Healthy' as const,
		latencyMs: 5,
		userPriority: 100,
		roleEligibility: tasks as any,
		fallbackEligibility: true,
		accessStatus: 'accessible' as const,
		lifecycleState: 'active' as const,
		isEmergencyFloor: false,
	};
}

function seedScenario(scenarioId: string, rulesMode: any, narrativeMode: any): InMemoryWorldRepository {
	const repo = new InMemoryWorldRepository({ disablePersistence: true });
	const worldId = scenarioId + '_world';
	repo.saveWorldTemplate({
		worldId,
		title: scenarioId,
		summary: 'Phase 15 acceptance world.',
		description: 'Phase 15 acceptance world.',
		rulesetId: rulesMode,
		dndRulesMode: rulesMode,
		rulesProfile: rulesProfileEngine.createDefault(rulesMode),
		storyMode: narrativeMode,
		narrativeProfile: narrativeProfileEngine.createDefault(narrativeMode),
		worldRules: [],
		ruleConstraints: [],
		canonicalCapabilities: [],
	});
	repo.saveStoryRun({
		storyId: scenarioId,
		id: scenarioId,
		worldId,
		characterName: 'Phase 15 Acceptance Hero',
		storyMode: narrativeMode,
		narrativeProfile: narrativeProfileEngine.createDefault(narrativeMode),
		dndRulesMode: rulesMode,
		rulesProfile: rulesProfileEngine.createDefault(rulesMode),
	});
	repo.seedStory(scenarioId);
	return repo;
}

test('Phase 15 master matrix contains all nine rules × narrative combinations', () => {
	assert.equal(PHASE15_SCENARIO_MATRIX.length, 9);
	const ids = new Set(PHASE15_SCENARIO_MATRIX.map((scenario) => `${scenario.rulesMode}::${scenario.narrativeMode}`));
	assert.equal(ids.size, 9);
	assert.equal(PHASE15_SCENARIO_MATRIX.every((scenario) => scenario.criticalBoundaries.length > 0), true);
});

test('Phase 15 executes every rules × narrative combination against canonical repository authority', () => {
	for (const scenario of PHASE15_SCENARIO_MATRIX) {
		const repo = seedScenario(scenario.id, scenario.rulesMode, scenario.narrativeMode);
		assert.equal(repo.getRulesProfile(scenario.id)?.mode, scenario.rulesMode);
		assert.equal(repo.getNarrativeProfile(scenario.id)?.mode, scenario.narrativeMode);

		const before = captureCanonicalStateSnapshot(scenario.id, repo);
		assert.equal(before.player?.actorId, `player_actor_${scenario.id}`);
	}
});

test('Phase 15 canonical command, combat, conditions and death integrate without crossing authority boundaries', async () => {
	const storyId = 'phase15_cross_system';
	const repo = seedScenario(storyId, 'FULL_DND', 'PROTAGONIST');

	const combat = new TacticalCombatEngine(31415);
	const playerId = `player_actor_${storyId}`;
	combat.addParticipant({
		id: playerId,
		name: 'Acceptance Hero',
		x: 0,
		y: 0,
		initiative: 20,
		team: 'player_allies',
		hpCurrent: 20,
		hpMax: 20,
		armorClass: 14,
		speedCells: 6,
		attackBonus: 5,
		damageFormula: '1d4+1',
		conditions: [],
		isDead: false,
	});
	combat.addParticipant({
		id: 'phase15_enemy',
		name: 'Acceptance Enemy',
		x: 1,
		y: 0,
		initiative: 1,
		team: 'enemies',
		hpCurrent: 20,
		hpMax: 20,
		armorClass: 14,
		speedCells: 6,
		attackBonus: 3,
		damageFormula: '1d4+1',
		conditions: [],
		isDead: false,
	});
	combat.startCombat();
	const attack = combat.executeAttack(playerId, 'phase15_enemy', { consumeAction: false });
	assert.equal(attack.success, true);

	const conditionEngine = new ConditionEngine();
	conditionEngine.seedActor(playerId);
	const conditionResult = conditionEngine.applyCondition(playerId, {
		definitionIdOrName: 'Poisoned',
		sourceId: 'phase15_test',
		applicationReason: 'Phase 15 integration smoke test',
		nowSeconds: 1,
	});
	assert.equal(conditionResult.applied, true);

	const death = new DeathSaveEngine();
	let deathState = death.createState();
	deathState = death.applyDamageAtZero(deathState, true).state;
	deathState = death.applyDamageAtZero(deathState, false).state;
	const finalDamage = death.applyDamageAtZero(deathState, false);
	assert.equal(finalDamage.died, true);

	const replay = await canonicalCommandEngine.execute(
		repo,
		{
			commandId: 'phase15_canonical_smoke_001',
			storyId,
			actorId: playerId,
			type: 'INTERACT',
			payload: { action: 'PHASE15_SMOKE' },
			source: 'PLAYER',
			transactionMode: 'STAGED',
		},
		async (_command, context) => ({
			success: true,
			data: {
				rulesMode: context.repository.getRulesProfile(storyId)?.mode,
				narrativeMode: context.repository.getNarrativeProfile(storyId)?.mode,
			},
			summary: 'Phase 15 canonical integration smoke test.',
		})
	);
	assert.equal(replay.success, true);
	assert.ok(replay.event?.replay.preStateHash);
	assert.ok(replay.event?.replay.postStateHash);
});

test('Phase 15 spell runtime remains authoritative and rejects unknown spell state without mutation', () => {
	const spellRuntime = new SpellRuntimeEngine();
	const result = spellRuntime.castSpellAuthoritative({
		request: {
			casterId: 'phase15_caster',
			spellId: 'phase15_unknown_spell',
			rulesProfile: rulesProfileEngine.createDefault('FULL_DND'),
		} as any,
	});
	assert.equal(result.success, false);
	assert.equal(result.errorCode, 'SPELL_NOT_FOUND');
});

test('Phase 15 persistence/migration preserves source data on failure', () => {
	const directory = mkdtempSync(join(tmpdir(), 'phase15-persistence-'));
	try {
		const filePath = join(directory, 'save.json');
		const original = {
			version: 999,
			schemaVersions: { world: 999, character: 999, rules: 999, content: 999 },
			worldTemplates: { protected: { title: 'Do Not Touch' } },
			storyRuns: {},
			confirmedCharacters: {},
		};
		const text = JSON.stringify(original, null, 2);
		writeFileSync(filePath, text);

		const inspected = PersistenceMigrationService.inspectFile(filePath);
		assert.equal(inspected.valid, false);

		const repaired = PersistenceMigrationService.repairFile(filePath);
		assert.equal(repaired.success, false);
		assert.equal(readFileSync(filePath, 'utf8'), text);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test('Phase 15 AI fallback survives a retryable provider failure and avoids canonical game mutation', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('phase15_ai_failure');
	const before = JSON.stringify({
		run: repository.getStoryRun('phase15_ai_failure'),
		clock: repository.getWorldClock('phase15_ai_failure').getTimestamp(),
	});

	const orchestrator = createTestOrchestrator(repository);
	const failing = new DeterministicMockAdapter('phase15_failing_provider');
	failing.failureMode = '429';
	failing.maxFailuresBeforeSuccess = 1;
	const healthy = new DeterministicMockAdapter('phase15_healthy_provider');
	orchestrator.registerAdapter(failing);
	orchestrator.registerAdapter(healthy);
	orchestrator.registerModel(model('phase15_failing_provider', 'failing-model', ['narrative.generate']));
	orchestrator.registerModel(model('phase15_healthy_provider', 'healthy-model', ['narrative.generate']));
	orchestrator.setFallbackChain('narrative.generate', [
		'phase15_failing_provider::failing-model',
		'phase15_healthy_provider::healthy-model',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'phase15_failing_provider::failing-model');

	const result = await orchestrator.executeTaskGeneration('narrative.generate', 'Phase 15 fallback smoke test.');
	assert.equal(result.source, 'AI_FALLBACK');
	assert.equal(result.modelId, 'healthy-model');

	const after = JSON.stringify({
		run: repository.getStoryRun('phase15_ai_failure'),
		clock: repository.getWorldClock('phase15_ai_failure').getTimestamp(),
	});
	assert.equal(after, before);
});

test('Phase 15 deterministic replay produces identical canonical replay metadata', async () => {
	const run = async (storyId: string) => {
		const repo = seedScenario(storyId, 'FULL_DND', 'PROTAGONIST');
		const actorId = repo.getPlayerLifecycle(storyId)?.actorId;
		return canonicalCommandEngine.execute(
			repo,
			{
				commandId: 'phase15_replay_001',
				storyId,
				actorId,
				type: 'INTERACT',
				payload: { action: 'DETERMINISTIC_REPLAY' },
				source: 'SYSTEM',
				transactionMode: 'STAGED',
			},
			async (_command, context) => ({
				success: true,
				data: {
					rules: context.repository.getRulesProfile(storyId)?.mode,
					narrative: context.repository.getNarrativeProfile(storyId)?.mode,
				},
				summary: 'Phase 15 deterministic replay.',
			})
		);
	};

	const first = await run('phase15_replay');
	const second = await run('phase15_replay');

	assert.equal(first.success, true);
	assert.equal(second.success, true);
	assert.equal(first.event?.eventId, second.event?.eventId);
	assert.deepEqual(first.event?.replay, second.event?.replay);
	assert.deepEqual(first.data, second.data);
});

test('Phase 15 stress probe handles a 5000-event diagnostic timeline with pagination', () => {
	const events = Array.from({ length: 5000 }, (_, index) => ({
		eventId: `phase15_evt_${index}`,
		commandId: `phase15_cmd_${index}`,
		commandType: 'INTERACT',
		source: 'SYSTEM',
		summary: 'Phase 15 stress event',
		mutationPaths: [],
		mutationCount: 0,
		replay: {
			canonicalSequence: index + 1,
			preStateHash: 'pre',
			postStateHash: 'post',
			resolvedDataHash: 'data',
			rngState: {},
		},
	}));
	const repository = { getCanonicalCommandEvents: () => events } as any;

	const started = performance.now();
	const page = DeveloperDiagnosticsService.getTimeline(repository, 'phase15_stress', 100, 4900);
	const elapsedMs = performance.now() - started;

	assert.equal(page.total, 5000);
	assert.equal(page.items.length, 100);
	assert.equal(page.items[0].eventId, 'phase15_evt_4900');
	assert.equal(page.hasMore, false);
	assert.ok(Number.isFinite(elapsedMs));
});
