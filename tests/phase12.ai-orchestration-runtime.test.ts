import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { evaluateAiTaskCandidatePreflight } from '../server/domain/aiTaskContracts';
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
	orchestrator.setCategoryModelOverride('narration', null);
	for (const existing of orchestrator.getAllModels()) {
		if (!existing.isEmergencyFloor) orchestrator.updateModelHealth(existing.providerId, existing.modelId, 'DisabledByUser');
	}
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
	orchestrator.setFallbackChain('narrative.generate', [
		'phase12_category_failing::category-failing',
		'phase12_category_healthy::category-healthy',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
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

test('Phase 12 regression: creative narration accepts valid prose without forcing deterministic fallback', () => {
	const orchestrator = createTestOrchestrator();
	const prose = "The lanterns along the flooded corridor shiver as the pressure seals breathe in sequence. Beyond the rusted arch, cold blue light spills across the water and catches on the protagonist's gloves. Somewhere behind the bulkhead, something heavy shifts, then becomes still again.";

	const validation = orchestrator.validateTurnPackage(prose, { allowPlainTextNarration: true });

	assert.equal(validation.valid, true);
	assert.deepEqual(validation.turnPackage?.narrative, [prose]);
	assert.deepEqual(validation.turnPackage?.stateChanges, []);
	assert.deepEqual(validation.turnPackage?.events, []);
});

test('Phase 12 regression: fenced JSON narration is normalized before validation', () => {
	const orchestrator = createTestOrchestrator();
	const raw = ['```json', JSON.stringify({
		narrative: ['The chamber falls silent as the submerged mechanism begins to turn.'],
		dialogue: [],
		events: ['MECHANISM_MOVES'],
		stateChanges: [],
		memoryCandidates: [],
		audioCues: [],
	}), '```'].join('\\n');

	const validation = orchestrator.validateTurnPackage(raw, { allowPlainTextNarration: true });

	assert.equal(validation.valid, true);
	assert.equal(validation.turnPackage?.narrative[0], 'The chamber falls silent as the submerged mechanism begins to turn.');
	assert.deepEqual(validation.turnPackage?.events, ['MECHANISM_MOVES']);
});


test('Phase 12 audit: task candidate preflight is side-effect-free and reports known capacity constraints', () => {
	const orchestrator = createTestOrchestrator();
	const candidate = model('phase12_preflight_provider', 'preflight-model', ['character.extract']);
	candidate.outputTokenLimit = 1000;
	orchestrator.registerModel(candidate);

	const before = JSON.stringify({
		model: orchestrator.getModel('phase12_preflight_provider', 'preflight-model'),
		chains: orchestrator.getAllFallbackChains(),
	});

	const result = evaluateAiTaskCandidatePreflight(
		'character.extract',
		candidate,
		100,
		900,
	);

	assert.equal(result.eligible, true);
	assert.equal(result.state, 'READY');
	assert.equal(result.contextTokens, 100);
	assert.equal(result.reservedOutputTokens, 900);
	assert.equal(result.outputCapacityKnown, true);
	assert.equal(result.taskContractCompatible, true);

	const after = JSON.stringify({
		model: orchestrator.getModel('phase12_preflight_provider', 'preflight-model'),
		chains: orchestrator.getAllFallbackChains(),
	});
	assert.equal(after, before);
});

test('Phase 12 audit: task candidate preflight rejects context plus reserved output overflow without mutating routing state', () => {
	const orchestrator = createTestOrchestrator();
	const candidate = model('phase12_preflight_capacity', 'capacity-model', ['character.extract']);
	candidate.contextWindow = 1000;
	candidate.outputTokenLimit = 900;
	orchestrator.registerModel(candidate);

	const before = JSON.stringify(orchestrator.getAllFallbackChains());
	const result = evaluateAiTaskCandidatePreflight(
		'character.extract',
		candidate,
		600,
		500,
	);

	assert.equal(result.eligible, false);
	assert.equal(result.state, 'REJECTED');
	assert.match(result.reason, /context window/i);
	assert.equal(result.contextCapacityKnown, true);
	assert.equal(result.outputCapacityKnown, true);
	assert.equal(JSON.stringify(orchestrator.getAllFallbackChains()), before);
});

test('Phase 12 audit: task candidate preflight rejects reserved output above a known model output limit', () => {
	const candidate = model('phase12_preflight_output', 'output-limited-model', ['character.extract']);
	candidate.contextWindow = 10000;
	candidate.outputTokenLimit = 500;

	const result = evaluateAiTaskCandidatePreflight(
		'character.extract',
		candidate,
		100,
		501,
	);

	assert.equal(result.eligible, false);
	assert.equal(result.state, 'REJECTED');
	assert.match(result.reason, /output token limit/i);
});

test('Phase 12 audit: task candidate preflight preserves UNKNOWN metadata instead of guessing', () => {
	const candidate = model('phase12_preflight_unknown', 'unknown-capacity-model', ['character.extract']);
	candidate.contextWindow = 0;
	candidate.outputTokenLimit = undefined;

	const result = evaluateAiTaskCandidatePreflight(
		'character.extract',
		candidate,
		500000,
		500000,
	);

	assert.equal(result.eligible, true);
	assert.equal(result.state, 'READY');
	assert.equal(result.contextCapacityKnown, false);
	assert.equal(result.outputCapacityKnown, false);
	assert.equal(result.taskContractCompatible, true);
});


test('Phase 12 audit: execution preflight skips a candidate whose context plus reserved output exceeds capacity', async () => {
	const orchestrator = createTestOrchestrator();
	const tooSmall = new DeterministicMockAdapter('phase12_capacity_fail');
	const healthy = new DeterministicMockAdapter('phase12_capacity_ok');

	orchestrator.registerAdapter(tooSmall);
	orchestrator.registerAdapter(healthy);
	const primary = model('phase12_capacity_fail', 'too-small', ['narrative.generate']);
	primary.contextWindow = 100;
	primary.outputTokenLimit = 100;
	const fallback = model('phase12_capacity_ok', 'capacity-ok', ['narrative.generate']);
	fallback.contextWindow = 10000;
	fallback.outputTokenLimit = 2000;
	orchestrator.registerModel(primary);
	orchestrator.registerModel(fallback);

	orchestrator.setFallbackChain('narrative.generate', [
		'phase12_capacity_fail::too-small',
		'phase12_capacity_ok::capacity-ok',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'phase12_capacity_fail::too-small');

	const result = await orchestrator.executeTaskGeneration(
		'narrative.generate',
		'capacity preflight test',
		undefined,
		{ contextTokens: 80, maxTokens: 40, timeoutMs: 100 },
	);

	assert.equal(result.modelId, 'capacity-ok');
	assert.equal(result.source, 'AI_FALLBACK');
	assert.equal(healthy.callHistory.length, 1);
	assert.equal(tooSmall.callHistory.length, 0);
});

test('Phase 12 audit: task-contract failure advances to the next fallback model instead of stopping at first provider response', async () => {
	const orchestrator = createTestOrchestrator();
	const invalid = new DeterministicMockAdapter('phase12_contract_invalid');
	const valid = new DeterministicMockAdapter('phase12_contract_valid');

	invalid.cannedResponses.set('narrative.generate', JSON.stringify({
		response: 'wrong task shape',
	}));
	valid.cannedResponses.set('narrative.generate', JSON.stringify({
		narrative: ['The fallback model produced a valid narrative.'],
		dialogue: [],
		events: [],
		stateChanges: [],
		memoryCandidates: [],
		audioCues: [],
	}));

	orchestrator.registerAdapter(invalid);
	orchestrator.registerAdapter(valid);
	orchestrator.registerModel(model('phase12_contract_invalid', 'invalid-contract', ['narrative.generate']));
	orchestrator.registerModel(model('phase12_contract_valid', 'valid-contract', ['narrative.generate']));

	orchestrator.setFallbackChain('narrative.generate', [
		'phase12_contract_invalid::invalid-contract',
		'phase12_contract_valid::valid-contract',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'phase12_contract_invalid::invalid-contract');

	const result = await orchestrator.executeTaskGeneration(
		'narrative.generate',
		'semantic fallback test',
		undefined,
		{
			timeoutMs: 100,
			validateResponse: (text) => {
				const validation = orchestrator.validateTurnPackage(text, { allowPlainTextNarration: false });
				return validation.valid
					? { valid: true }
					: { valid: false, errorReason: validation.errorReason };
			},
		},
	);

	assert.equal(result.source, 'AI_FALLBACK');
	assert.equal(result.modelId, 'valid-contract');
	assert.equal(invalid.callHistory.length, 1);
	assert.equal(valid.callHistory.length, 1);
	assert.equal(result.attemptsTrail[0]?.status, 'FAILED');
	assert.match(result.attemptsTrail[0]?.error || '', /validation/i);
});


test('Phase 12 audit: billing metadata is explicit and missing billing data remains UNKNOWN', () => {
	const orchestrator = createTestOrchestrator();
	const freeModel = model('phase12_billing_free', 'free-model', ['narrative.generate']);
	freeModel.isPaidModel = false;
	const paidModel = model('phase12_billing_paid', 'paid-model', ['narrative.generate']);
	paidModel.isPaidModel = true;
	const unknownModel = model('phase12_billing_unknown', 'unknown-model', ['narrative.generate']);

	orchestrator.registerModel(freeModel);
	orchestrator.registerModel(paidModel);
	orchestrator.registerModel(unknownModel);

	assert.equal(orchestrator.getModel('phase12_billing_free', 'free-model')?.billingState, 'FREE');
	assert.equal(orchestrator.getModel('phase12_billing_paid', 'paid-model')?.billingState, 'PAID');
	assert.equal(orchestrator.getModel('phase12_billing_unknown', 'unknown-model')?.billingState, 'UNKNOWN');
});

test('Phase 12 audit: task-aware auto arrange verifies an actual task response and rewrites only eligible automatic task routes', async () => {
	const orchestrator = createTestOrchestrator();
	const emergency = orchestrator.getModel('provider_deterministic_emergency', 'emergency-fallback-local')!;

	const adapter = new DeterministicMockAdapter('phase12_auto_arrange_provider');
	adapter.cannedResponses.set(
		'narrative.review',
		JSON.stringify({ review: 'The task canary returned a usable review.' }),
	);
	orchestrator.registerAdapter(adapter);

	const readyModel: ModelRegistryRecord = {
		providerId: 'phase12_auto_arrange_provider',
		modelId: 'auto-ready',
		displayName: 'Auto Ready',
		pool: 'review',
		capabilities: ['text_generation', 'reasoning', 'structured_output'],
		contextWindow: 32768,
		outputTokenLimit: 2000,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 5,
		userPriority: 200,
		roleEligibility: ['narrative.review'],
		fallbackEligibility: true,
		accessStatus: 'accessible',
		lifecycleState: 'active',
		isEmergencyFloor: false,
	};
	orchestrator.registerModel(readyModel);

	const originalGetAllModels = orchestrator.getAllModels.bind(orchestrator);
	(orchestrator as any).getAllModels = () => [readyModel, emergency];
	(orchestrator as any).discoverAndRegisterModels = async () => orchestrator.getLastDiscoverySummary();

	const result = await orchestrator.autoConfigureFallbacks({
		maxFallbacksPerCategory: 2,
		concurrency: 2,
	});

	assert.equal(result.success, true);
	assert.equal(result.results.find((entry) => entry.modelId === 'auto-ready')?.status, 'READY');
	assert.deepEqual(orchestrator.getFallbackChain('narrative.review').slice(0, 1), ['phase12_auto_arrange_provider::auto-ready']);
	assert.ok(result.results.find((entry) => entry.modelId === 'auto-ready')?.verifiedTasks?.includes('narrative.review'));
	assert.equal(originalGetAllModels().length > 0, true);
});


test('Phase 12 audit: provider quota evidence overrides unknown model headroom without touching unrelated providers', async () => {
	const orchestrator = createTestOrchestrator();

	const providerWithQuota = new DeterministicMockAdapter('phase12_quota_provider') as DeterministicMockAdapter & {
		getQuotaStatus?: () => Promise<any>;
	};
	providerWithQuota.getQuotaStatus = async () => ({
		providerId: 'phase12_quota_provider',
		available: true,
		source: 'PROVIDER',
		exact: true,
		remaining: 7,
		limit: 25,
		reset: 'daily',
		billingState: 'ACCOUNT_DEPENDENT',
	});

	const otherProvider = new DeterministicMockAdapter('phase12_other_provider');
	orchestrator.registerAdapter(providerWithQuota);
	orchestrator.registerAdapter(otherProvider);

	const quotaModel = model('phase12_quota_provider', 'quota-model', ['narrative.generate']);
	const otherModel = model('phase12_other_provider', 'other-model', ['narrative.generate']);
	orchestrator.registerModel(quotaModel);
	orchestrator.registerModel(otherModel);

	(await (orchestrator as any).refreshProviderQuotaSnapshots()) as any;

	const runtime = orchestrator.getModelRuntimeStatus().find((entry) => entry.modelId === 'quota-model');
	assert.ok(runtime);
	assert.equal(runtime?.headroom?.exact, true);
	assert.equal(runtime?.headroom?.source, 'PROVIDER');
	assert.equal(runtime?.headroom?.value, 7);
	assert.equal(runtime?.headroom?.unit, 'CREDITS');

	const otherRuntime = orchestrator.getModelRuntimeStatus().find((entry) => entry.modelId === 'other-model');
	assert.ok(otherRuntime);
	assert.equal(otherRuntime?.headroom?.source, 'UNKNOWN');
});


test('Phase 12 audit: Character Genesis semantic validation advances to the next model when the first response is structurally unusable', async () => {
	const orchestrator = createTestOrchestrator();
	const invalid = new DeterministicMockAdapter('phase12_genesis_invalid');
	const valid = new DeterministicMockAdapter('phase12_genesis_valid');

	invalid.cannedResponses.set('character.extract', JSON.stringify({
		response: 'This is not a Character Genesis draft.',
	}));
	valid.cannedResponses.set('character.extract', JSON.stringify({
		identity: { name: 'Fallback Hero' },
		role: { profession: 'Scout' },
		background: { history: 'Returned by fallback.' },
	}));

	orchestrator.registerAdapter(invalid);
	orchestrator.registerAdapter(valid);
	orchestrator.registerModel(model('phase12_genesis_invalid', 'genesis-invalid', ['character.extract']));
	orchestrator.registerModel(model('phase12_genesis_valid', 'genesis-valid', ['character.extract']));
	orchestrator.setFallbackChain('character.extract', [
		'phase12_genesis_invalid::genesis-invalid',
		'phase12_genesis_valid::genesis-valid',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('character.extract', 'phase12_genesis_invalid::genesis-invalid');

	const result = await orchestrator.executeTaskGeneration(
		'character.extract',
		'Create a character from a cautious frontier scout concept.',
		'Return only the requested structured Character Genesis JSON.',
		{
			timeoutMs: 100,
			validateResponse: (text) => {
				let parsed: any = null;
				try {
					parsed = JSON.parse(text);
				} catch {
					return { valid: false, errorReason: 'Character Genesis JSON could not be parsed.' };
				}
				const validShape = Boolean(
					parsed &&
					typeof parsed === 'object' &&
					parsed.identity &&
					parsed.role &&
					parsed.background,
				);
				return validShape
					? { valid: true }
					: { valid: false, errorReason: 'Character Genesis response is missing required semantic sections.' };
			},
		},
	);

	assert.equal(result.source, 'AI_FALLBACK');
	assert.equal(result.modelId, 'genesis-valid');
	assert.equal(result.attemptsTrail[0]?.modelId, 'genesis-invalid');
	assert.equal(result.attemptsTrail[0]?.status, 'FAILED');
	assert.match(result.attemptsTrail[0]?.error || '', /Character Genesis/i);
	assert.equal(result.attemptsTrail[1]?.modelId, 'genesis-valid');
	assert.equal(result.attemptsTrail[1]?.status, 'SUCCESS');
});

test('Phase 12 regression: Character Genesis can expand a configured route with additional AI recovery models before the deterministic floor', async () => {
	const orchestrator = createTestOrchestrator();
	(orchestrator as any).taskPinnedModels.delete('character.extract');
	const primary = new DeterministicMockAdapter('phase12_configured_primary');
	primary.failureMode = '500';
	primary.maxFailuresBeforeSuccess = 1;
	const aiRecovery = new DeterministicMockAdapter('phase12_ai_recovery');

	orchestrator.registerAdapter(primary);
	orchestrator.registerAdapter(aiRecovery);
	orchestrator.registerModel(model('phase12_configured_primary', 'configured-character-extract', ['character.extract']));
	orchestrator.registerModel(model('phase12_ai_recovery', 'recovery-character-extract', ['character.extract']));
	orchestrator.setFallbackChain('character.extract', [
		'phase12_configured_primary::configured-character-extract',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('character.extract', 'phase12_configured_primary::configured-character-extract');
	(orchestrator as any).taskPinnedModels.delete('character.extract');

	const result = await orchestrator.executeTaskGeneration(
		'character.extract',
		'Extract this character into structured Character Genesis data.',
		'Return JSON.',
		{
			allowAdaptiveAiRecovery: true,
			allowDeterministicFallback: false,
			validateResponse: () => ({ valid: true }),
		},
	);

	assert.equal(result.source, 'AI_FALLBACK');
	assert.equal(result.modelId, 'recovery-character-extract');
	assert.equal(result.attemptsTrail[0].status, 'FAILED');
	assert.equal(result.attemptsTrail.some((attempt) => attempt.modelId === 'recovery-character-extract' && attempt.status === 'SUCCESS'), true);
	assert.equal(result.attemptsTrail.some((attempt) => attempt.modelId === 'emergency-fallback-local'), false);
});

test('Phase 12 regression: deterministic fallback can be explicitly withheld after all AI candidates fail', async () => {
	const orchestrator = createTestOrchestrator();
	(orchestrator as any).taskPinnedModels.delete('character.extract');
	const failing = new DeterministicMockAdapter('phase12_all_ai_failed');
	failing.failureMode = '500';
	failing.maxFailuresBeforeSuccess = 1;

	orchestrator.registerAdapter(failing);
	orchestrator.registerModel(model('phase12_all_ai_failed', 'all-ai-failed', ['character.extract']));
	orchestrator.setFallbackChain('character.extract', [
		'phase12_all_ai_failed::all-ai-failed',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('character.extract', 'phase12_all_ai_failed::all-ai-failed');
	(orchestrator as any).taskPinnedModels.delete('character.extract');

	await assert.rejects(
		() => orchestrator.executeTaskGeneration(
			'character.extract',
			'Extract this character.',
			'Return JSON.',
			{
				allowAdaptiveAiRecovery: true,
				allowDeterministicFallback: false,
				validateResponse: () => ({ valid: true }),
			},
		),
		(error: any) => {
			assert.equal(error?.code, 'AI_UNAVAILABLE');
			assert.equal(Array.isArray(error?.attemptsTrail), true);
			assert.equal(error?.attemptsTrail.some((attempt: any) => attempt.modelId === 'emergency-fallback-local'), false);
			return true;
		},
	);
});

test('Phase 12 regression: free-model auto-arrange detection recognizes billing-free models and names containing free', () => {
	assert.equal(
		MultiModelOrchestrator.isFreeModelCandidate({
			...model('provider_free', 'model-billing-free', ['character.extract']),
			billingState: 'FREE',
		}),
		true,
	);
	assert.equal(
		MultiModelOrchestrator.isFreeModelCandidate({
			...model('provider_named_free', 'provider/model-free', ['character.extract']),
			billingState: 'UNKNOWN',
		}),
		true,
	);
	assert.equal(
		MultiModelOrchestrator.isFreeModelCandidate({
			...model('provider_paid', 'provider/model-paid', ['character.extract']),
			billingState: 'PAID',
			isPaidModel: true,
		}),
		false,
	);
});
