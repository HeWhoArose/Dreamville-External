import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	getAiTaskContract,
	getAllAiTaskContracts,
	evaluateAiTaskReadiness,
	validateAiTaskResponse,
} from '../server/domain/aiTaskContracts';
import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { AiContextAdapters } from '../server/domain/aiContextAdapters';

const makeModel = (providerId: string, modelId: string, task: 'combat.tactics' | 'narrative.generate', capabilities: string[]): ModelRegistryRecord => ({
	providerId,
	modelId,
	displayName: modelId,
	pool: task === 'combat.tactics' ? 'reasoning' : 'creative',
	capabilities,
	contextWindow: 32768,
	health: 'Healthy',
	quota: 'Healthy',
	latencyMs: 10,
	userPriority: 100,
	roleEligibility: [task],
	isEmergencyFloor: false,
	fallbackEligibility: true,
	accessStatus: 'accessible',
	lifecycleState: 'active',
	supportedInputTypes: ['text'],
	supportedOutputTypes: task === 'combat.tactics' ? ['json'] : ['text', 'json'],
	hasStructuredOutput: task === 'combat.tactics',
});

test('S4 contract registry covers every runtime task with explicit derived architecture metadata', () => {
	const contracts = getAllAiTaskContracts();
	assert.ok(contracts.length >= 20);
	const ids = new Set(contracts.map((contract) => contract.task));
	assert.equal(ids.size, contracts.length);

	for (const contract of contracts) {
		assert.ok(contract.contextContracts && contract.contextContracts.length > 0, contract.task);
		assert.ok(contract.fallbackPolicy && contract.fallbackPolicy.maxTotalAttempts >= contract.fallbackPolicy.maxPrimaryAttempts, contract.task);
		assert.ok(contract.downstreamConsumer, contract.task);
	}
});

test('S4 readiness rejects incompatible models before provider execution', () => {
	const model = { ...makeModel('test_provider', 'bad-tactical', 'combat.tactics', ['text_generation']), hasStructuredOutput: false };
	const readiness = evaluateAiTaskReadiness('combat.tactics', model, 100);
	assert.equal(readiness.state, 'REJECTED');
	assert.match(readiness.reason, /Structured output|capability/i);
	assert.equal(readiness.capabilityCompatible, false);
});

test('S4 central task validator rejects malformed structured output', () => {
	assert.equal(validateAiTaskResponse('combat.tactics', '{bad').valid, false);
	assert.equal(validateAiTaskResponse('combat.tactics', '[]').valid, false);
	assert.equal(validateAiTaskResponse('combat.tactics', '{"plan":"hold"}').valid, true);
});

test('S4 orchestrator falls through a schema-invalid model using the central task validator', async () => {
	const orchestrator = new MultiModelOrchestrator();
	const primary = makeModel('provider_primary_test', 'primary-tactical', 'combat.tactics', ['text_generation', 'structured_output']);
	const fallback = makeModel('provider_fallback_test', 'fallback-tactical', 'combat.tactics', ['text_generation', 'structured_output']);
	orchestrator.registerModel(primary);
	orchestrator.registerModel(fallback);
	const primaryAdapter = new DeterministicMockAdapter('provider_primary_test');
	primaryAdapter.cannedResponses.set('combat.tactics', 'not json');
	const fallbackAdapter = new DeterministicMockAdapter('provider_fallback_test');
	fallbackAdapter.cannedResponses.set('combat.tactics', '{"plan":"fallback"}');
	orchestrator.registerAdapter(primaryAdapter);
	orchestrator.registerAdapter(fallbackAdapter);
	orchestrator.setFallbackChain('combat.tactics', ['provider_fallback_test::fallback-tactical']);

	const result = await orchestrator.executeTaskGeneration(
		'combat.tactics',
		'Provide a tactical plan.',
		'Return the tactical plan.',
		{ forceModelId: 'primary-tactical', timeoutMs: 2000, maxTokens: 100 },
	);

	assert.equal(result.source, 'AI_FALLBACK');
	assert.equal(result.modelId, 'fallback-tactical');
	assert.equal(result.attempts, 2);
	assert.equal(result.attemptsTrail[0]?.status, 'FAILED');
	assert.equal(result.attemptsTrail[1]?.status, 'SUCCESS');
});

test('S4 context adapters build read-only, player-authorized task contexts', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'default_story';
	const actorId = repository.getPlayerLifecycle(storyId)?.actorId || ('player_actor_' + storyId);
	const before = JSON.stringify(repository.getCapabilityEngine(storyId).exportState());

	const rules = AiContextAdapters.buildRulesOutcomeContext(repository, storyId, actorId);
	const combat = AiContextAdapters.buildCombatAIContext(repository, storyId, actorId);
	const narrative = AiContextAdapters.buildNarrativeOutcomeContext(repository, {
		storyId,
		viewerActorId: actorId,
		playerAction: 'I look around.',
		hardTokenBudget: 900,
	});

	assert.equal(rules.actorId, actorId);
	assert.ok(combat.combatProjection);
	assert.ok(narrative.assembledText.length > 0);
	assert.equal(JSON.stringify(repository.getCapabilityEngine(storyId).exportState()), before);
	assert.ok(!JSON.stringify(narrative.assembledText).includes('hiddenCanonicalContext'));
});
