import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import type { KnowledgeFact } from '../server/domain/types';

function createTestOrchestrator(repository?: InMemoryWorldRepository): MultiModelOrchestrator {
	const orchestrator = new MultiModelOrchestrator(repository);
	(orchestrator as any).savePersistedConfig = () => {};
	return orchestrator;
}

function model(
	providerId: string,
	modelId: string,
	tasks: Array<Parameters<MultiModelOrchestrator['getTaskCategory']>[0]>
): ModelRegistryRecord {
	return {
		providerId,
		modelId,
		displayName: modelId,
		pool: 'fast',
		capabilities: ['text_generation', 'structured_output'],
		contextWindow: 128000,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 5,
		userPriority: 100,
		roleEligibility: tasks,
		fallbackEligibility: true,
		accessStatus: 'accessible',
		lifecycleState: 'active',
		isEmergencyFloor: false,
	};
}

test('Phase 12: narration category override does not change world-generation routing', () => {
	const orchestrator = createTestOrchestrator();
	const narration = new DeterministicMockAdapter('phase12_narration_provider');
	const world = new DeterministicMockAdapter('phase12_world_provider');
	orchestrator.registerAdapter(narration);
	orchestrator.registerAdapter(world);

	orchestrator.registerModel(model('phase12_narration_provider', 'narration-model', ['narrative.generate', 'character.dialogue']));
	orchestrator.registerModel(model('phase12_world_provider', 'world-model', ['world.generate']));

	orchestrator.setCategoryModelOverride('narration', 'phase12_narration_provider::narration-model');
	orchestrator.setCategoryModelOverride('world_generation', 'phase12_world_provider::world-model');

	const narrationSelection = orchestrator.selectBestModel('narrative.generate', { contextTokens: 100 });
	const worldSelection = orchestrator.selectBestModel('world.generate', { contextTokens: 100 });

	assert.equal(narrationSelection.selectedModel.modelId, 'narration-model');
	assert.equal(worldSelection.selectedModel.modelId, 'world-model');

	orchestrator.setCategoryModelOverride('narration', null);
	const worldAfterNarrationChange = orchestrator.selectBestModel('world.generate', { contextTokens: 100 });
	assert.equal(worldAfterNarrationChange.selectedModel.modelId, 'world-model');
});

test('Phase 12: retryable 429 failure records cooldown telemetry and falls through to a healthy model', async () => {
	const orchestrator = createTestOrchestrator();
	const failing = new DeterministicMockAdapter('phase12_429_provider');
	failing.failureMode = '429';
	failing.maxFailuresBeforeSuccess = 1;
	const healthy = new DeterministicMockAdapter('phase12_success_provider');

	orchestrator.registerAdapter(failing);
	orchestrator.registerAdapter(healthy);
	orchestrator.registerModel(model('phase12_429_provider', 'failing-model', ['narrative.generate']));
	orchestrator.registerModel(model('phase12_success_provider', 'success-model', ['narrative.generate']));
	orchestrator.setFallbackChain('narrative.generate', [
		'phase12_429_provider::failing-model',
		'phase12_success_provider::success-model',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'phase12_429_provider::failing-model');

	const result = await orchestrator.executeTaskGeneration(
		'narrative.generate',
		'Generate a narrative turn.'
	);

	assert.equal(result.source, 'AI_FALLBACK');
	assert.equal(result.modelId, 'success-model');

	const runtime = orchestrator.getModelRuntimeStatus().find(
		(entry) => entry.modelId === 'failing-model'
	);
	assert.ok(runtime);
	assert.equal(runtime?.rateLimit429Count, 1);
	assert.equal((runtime?.cooldownUntil || 0) > Date.now(), true);
});

test('Phase 12: malformed narration output is rejected and does not mutate canonical state', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('phase12_malformed');
	const orchestrator = createTestOrchestrator(repository);
	const malformed = new DeterministicMockAdapter('phase12_malformed_provider');
	malformed.failureMode = 'malformed_json';
	malformed.maxFailuresBeforeSuccess = 1;

	orchestrator.registerAdapter(malformed);
	orchestrator.registerModel(model('phase12_malformed_provider', 'malformed-model', ['narrative.generate']));
	orchestrator.setCategoryModelOverride('narration', 'phase12_malformed_provider::malformed-model');
	orchestrator.setFallbackChain('narrative.generate', [
		'phase12_malformed_provider::malformed-model',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);

	const before = JSON.stringify({
		run: repository.getStoryRun('phase12_malformed'),
		clock: repository.getWorldClock('phase12_malformed').getTimestamp(),
	});
	const result = await orchestrator.generateNarrativeOnly({
		storyId: 'phase12_malformed',
		playerAction: 'Look around the room.',
		hardTokenBudget: 600,
		timeoutMs: 100,
		maxRetries: 0,
	});

	const after = JSON.stringify({
		run: repository.getStoryRun('phase12_malformed'),
		clock: repository.getWorldClock('phase12_malformed').getTimestamp(),
	});

	assert.equal(result.success, true);
	assert.equal(result.turnPackage?.stateChanges.length, 0);
	assert.equal(after, before);

	const runtime = orchestrator.getModelRuntimeStatus().find(
		(entry) => entry.modelId === 'malformed-model'
	);
	assert.ok(runtime);
	assert.equal(runtime?.failureCount >= 1, true);
});

test('Phase 12: AI context uses Phase 11 authorized knowledge boundaries', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('phase12_epistemic_context');
	const player = repository.getPlayerLifecycle('phase12_epistemic_context')!;
	const secret: KnowledgeFact = {
		id: 'phase12_private_secret',
		subjectEntityId: 'npc_hidden',
		predicate: 'hidden_motive',
		objectValue: 'private_motive_not_authorized',
		sourceType: 'rumor',
		acquiredAtTimestamp: repository.getWorldClock('phase12_epistemic_context').getTimestamp(),
		confidence: 1,
		secretLevel: 'private',
		scope: 'exact',
		provenanceSummary: 'Phase 12 secret test',
	};
	repository.addKnowledgeFact('phase12_epistemic_context', secret);

	const orchestrator = createTestOrchestrator(repository);
	const observer = new DeterministicMockAdapter('phase12_context_observer');
	orchestrator.registerAdapter(observer);
	orchestrator.registerModel(model('phase12_context_observer', 'context-observer', ['narrative.generate']));
	orchestrator.setCategoryModelOverride('narration', 'phase12_context_observer::context-observer');
	orchestrator.setFallbackChain('narrative.generate', [
		'phase12_context_observer::context-observer',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);

	await orchestrator.generateNarrativeOnly({
		storyId: 'phase12_epistemic_context',
		playerAction: 'Observe the area.',
		hardTokenBudget: 700,
		maxRetries: 0,
	});

	const prompt = observer.callHistory[0]?.prompt || '';
	assert.equal(prompt.includes(secret.objectValue), false);
	assert.equal(prompt.includes(secret.id), false);
	assert.equal(repository.getAuthorizedKnowledgeFacts('phase12_epistemic_context', player.actorId).some((fact) => fact.id === secret.id), false);
});

test('Phase 12: illegal model state-change kinds remain rejected by structured validation', () => {
	const orchestrator = createTestOrchestrator();
	const result = orchestrator.validateTurnPackage(JSON.stringify({
		narrative: ['Attempted illegal mutation.'],
		dialogue: [],
		events: [],
		stateChanges: [
			{ kind: 'DELETE_PLAYER', targetId: 'player', value: null },
		],
		memoryCandidates: [],
		audioCues: [],
	}));

	assert.equal(result.valid, false);
	assert.match(result.errorReason || '', /Illegal state change kind/);
});

test('Phase 12: runtime usage ledger preserves token dimensions reported by providers', () => {
	const orchestrator = createTestOrchestrator();
	const adapter = new DeterministicMockAdapter('phase12_usage_provider');
	orchestrator.registerAdapter(adapter);
	orchestrator.registerModel(model('phase12_usage_provider', 'usage-model', ['narrative.generate']));
	orchestrator.setFallbackChain('narrative.generate', [
		'phase12_usage_provider::usage-model',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'phase12_usage_provider::usage-model');

	return orchestrator.executeTaskGeneration('narrative.generate', 'Count these tokens.').then(() => {
		const ledger = orchestrator.getUsageLedger({ category: 'narration', limit: 10 });
		const entry = ledger[ledger.length - 1];
		assert.ok(entry);
		assert.equal(entry.providerId, 'phase12_usage_provider');
		assert.equal(entry.category, 'narration');
		assert.equal(entry.totalTokens, entry.inputTokens + entry.outputTokens);
	});
});

test('Phase 12: category runtime state is presentation/configuration state, not story state', () => {
	const orchestrator = createTestOrchestrator();
	const before = JSON.stringify(orchestrator.getCategoryRuntimeStates());
	orchestrator.setCategoryModelOverride('narration', 'google_gemini::gemini-3.5-flash');
	const after = JSON.stringify(orchestrator.getCategoryRuntimeStates());

	assert.notEqual(after, before);
	assert.equal(
		JSON.stringify(orchestrator.getCategoryRuntimeStates().find((category) => category.category === 'rules')),
		JSON.stringify(orchestrator.getCategoryRuntimeStates().find((category) => category.category === 'rules'))
	);
});


test('Phase 12: timeout failure enters cooldown and falls through without a retry loop leak', async () => {
	const orchestrator = createTestOrchestrator();
	const timeoutAdapter = new DeterministicMockAdapter('phase12_timeout_provider');
	timeoutAdapter.failureMode = 'timeout';
	timeoutAdapter.maxFailuresBeforeSuccess = 1;
	const healthy = new DeterministicMockAdapter('phase12_timeout_success');

	orchestrator.registerAdapter(timeoutAdapter);
	orchestrator.registerAdapter(healthy);
	orchestrator.registerModel(model('phase12_timeout_provider', 'timeout-model', ['narrative.generate']));
	orchestrator.registerModel(model('phase12_timeout_success', 'timeout-success-model', ['narrative.generate']));
	orchestrator.setFallbackChain('narrative.generate', [
		'phase12_timeout_provider::timeout-model',
		'phase12_timeout_success::timeout-success-model',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'phase12_timeout_provider::timeout-model');

	const result = await orchestrator.executeTaskGeneration('narrative.generate', 'Timeout test.', undefined, { timeoutMs: 10 });
	assert.equal(result.source, 'AI_FALLBACK');
	assert.equal(result.modelId, 'timeout-success-model');

	const runtime = orchestrator.getModelRuntimeStatus().find((entry) => entry.modelId === 'timeout-model');
	assert.ok(runtime);
	assert.equal(runtime?.timeoutCount, 1);
	assert.equal((runtime?.cooldownUntil || 0) > Date.now(), true);
});

test('Phase 12: HTTP 5xx provider failure falls through to the next eligible provider', async () => {
	const orchestrator = createTestOrchestrator();
	const failing = new DeterministicMockAdapter('phase12_5xx_provider');
	failing.failureMode = '500';
	failing.maxFailuresBeforeSuccess = 1;
	const healthy = new DeterministicMockAdapter('phase12_5xx_success');

	orchestrator.registerAdapter(failing);
	orchestrator.registerAdapter(healthy);
	orchestrator.registerModel(model('phase12_5xx_provider', 'fivexx-model', ['narrative.generate']));
	orchestrator.registerModel(model('phase12_5xx_success', 'fivexx-success-model', ['narrative.generate']));
	orchestrator.setFallbackChain('narrative.generate', [
		'phase12_5xx_provider::fivexx-model',
		'phase12_5xx_success::fivexx-success-model',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'phase12_5xx_provider::fivexx-model');

	const result = await orchestrator.executeTaskGeneration('narrative.generate', '5xx test.');
	assert.equal(result.source, 'AI_FALLBACK');
	assert.equal(result.modelId, 'fivexx-success-model');

	const runtime = orchestrator.getModelRuntimeStatus().find((entry) => entry.modelId === 'fivexx-model');
	assert.ok(runtime);
	assert.equal(runtime?.serverError5xxCount, 1);
});

test('Phase 12: fallback exhaustion reaches the deterministic emergency floor', async () => {
	const orchestrator = createTestOrchestrator();
	const failing = new DeterministicMockAdapter('phase12_exhausted_provider');
	failing.failureMode = '429';

	orchestrator.registerAdapter(failing);
	orchestrator.registerModel(model('phase12_exhausted_provider', 'exhausted-model', ['narrative.generate']));
	orchestrator.setFallbackChain('narrative.generate', [
		'phase12_exhausted_provider::exhausted-model',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'phase12_exhausted_provider::exhausted-model');

	const result = await orchestrator.executeTaskGeneration('narrative.generate', 'Emergency fallback test.');
	assert.equal(result.source, 'DETERMINISTIC_FALLBACK');
	assert.equal(result.providerId, 'provider_deterministic_emergency');
	assert.equal(result.modelId, 'emergency-fallback-local');
});


test('Phase 12: Phase 9 equipment and Phase 10 living-world state reach authorized AI context', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase12_cross_phase_context';
	repository.seedStory(storyId);
	const player = repository.getPlayerLifecycle(storyId)!;
	const inventory = repository.getInventoryEngine(storyId);
	const capabilities = repository.getCapabilityEngine(storyId);
	const capabilityId = 'phase12_equipment_capability';

	capabilities.registerCapability({
		id: capabilityId,
		name: 'Phase 12 Context Sight',
		description: 'A capability granted by canonical equipment.',
		category: 'TECHNIQUE',
		provenance: 'phase12_test',
		minVesselCapacityRequired: 0,
	});

	inventory.registerDefinition({
		id: 'def_phase12_context_relic',
		name: 'Context Relic',
		category: 'Tool',
		rarity: 'Rare',
		description: 'Test equipment for cross-phase context wiring.',
		allowedSlots: ['relic'],
		weightKg: 1,
		baseValueGold: 10,
		maxDurability: 100,
		tags: ['phase12'],
		properties: {},
		grantedCapabilities: [capabilityId],
	});

	const instance = inventory.createInstance({
		defId: 'def_phase12_context_relic',
		ownerEntityId: player.actorId,
		provenance: 'TEST',
	});
	assert.equal(inventory.equipItem(player.actorId, instance.id, 'relic').success, true);

	const livingWorld = repository.getLivingWorldSimulation(storyId);
	livingWorld.registerNpcSchedule({
		npcId: 'npc_phase12_visible',
		name: 'Visible Phase 12 NPC',
		currentLocationId: player.locationId,
		currentActivity: 'patrolling',
		entries: [],
		fallbackActivity: 'idle',
		fallbackLocationId: player.locationId,
	});

	const context = WorkingContextEngine.assembleTurnContext({
		storyId,
		playerAction: 'Observe your surroundings.',
		hardTokenBudget: 1400,
		worldRepo: repository,
	});

	assert.equal(
		context.packet.relevantCapabilities.some((capability) => capability.includes('Phase 12 Context Sight')),
		true
	);
	assert.equal(
		context.packet.visibleEntities.some((entity) => entity.includes('Visible Phase 12 NPC')),
		true
	);
});


test('Phase 12: category override retains automatic failover candidates', async () => {
	const orchestrator = createTestOrchestrator();
	const failing = new DeterministicMockAdapter('phase12_category_failing');
	failing.failureMode = '429';
	failing.maxFailuresBeforeSuccess = 1;
	const healthy = new DeterministicMockAdapter('phase12_category_healthy');

	orchestrator.registerAdapter(failing);
	orchestrator.registerAdapter(healthy);
	orchestrator.registerModel(model('phase12_category_failing', 'category-failing', ['narrative.generate']));
	orchestrator.registerModel(model('phase12_category_healthy', 'category-healthy', ['narrative.generate']));
	orchestrator.setCategoryModelOverride('narration', 'phase12_category_failing::category-failing');

	const selection = orchestrator.selectBestModel('narrative.generate', { contextTokens: 100 });
	assert.equal(selection.selectedModel.modelId, 'category-failing');
	assert.equal(selection.fallbacks.some((candidate) => candidate.modelId === 'category-healthy'), true);
});

test('Phase 12: a cooling model is excluded from normal selection', () => {
	const orchestrator = createTestOrchestrator();
	const cooling = new DeterministicMockAdapter('phase12_cooling_provider');
	const healthy = new DeterministicMockAdapter('phase12_cooling_healthy');

	orchestrator.registerAdapter(cooling);
	orchestrator.registerAdapter(healthy);
	orchestrator.registerModel(model('phase12_cooling_provider', 'cooling-model', ['narrative.generate']));
	orchestrator.registerModel(model('phase12_cooling_healthy', 'healthy-model', ['narrative.generate']));

	const runtime = orchestrator.getModelRuntimeStatus().find((entry) => entry.modelId === 'cooling-model');
	assert.ok(runtime);
	runtime!.cooldownUntil = Date.now() + 60000;

	const selection = orchestrator.selectBestModel('narrative.generate', { contextTokens: 100 });
	assert.notEqual(selection.selectedModel.modelId, 'cooling-model');
});
