import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';

const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';

function makeNarrationModel(
	providerId: string,
	modelId: string,
	userPriority: number,
): ModelRegistryRecord {
	return {
		providerId,
		modelId,
		displayName: modelId,
		pool: 'creative',
		capabilities: ['text_generation', 'creative_writing'],
		contextWindow: 32768,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 10,
		userPriority,
		roleEligibility: ['narrative.generate'],
		fallbackEligibility: true,
		isEmergencyFloor: false,
		accessStatus: 'accessible',
		lifecycleState: 'active',
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['text', 'json'],
		hasStructuredOutput: false,
	};
}

test('S4 category routes are bound to their owning task and start at the task pin before deterministic recovery', () => {
	const orchestrator = new MultiModelOrchestrator();
	const states = orchestrator.getCategoryRuntimeStates();

	for (const state of states) {
		const firstTask = state.tasks[0];
		assert.ok(firstTask, 'Category has no owning task: ' + state.category);

		const configuredRoute = orchestrator.getFallbackChain(firstTask);
		assert.deepEqual(state.fallbackChain, configuredRoute, state.category);
		assert.ok(configuredRoute.length > 0, 'Empty route: ' + state.category);
		assert.equal(configuredRoute.at(-1), emergencyKey, 'Route must terminate at deterministic recovery: ' + state.category);

		const pinned = orchestrator.getPinnedModelForTask(firstTask);
		if (!state.mode || state.mode === 'AUTO') {
			if (pinned) {
				assert.equal(
					configuredRoute[0],
					pinned,
					'Configured primary must match the task pin for ' + state.category,
				);
				assert.equal(
					state.activeModelKey,
					pinned,
					'Category AUTO state must expose its task pin as active primary for ' + state.category,
				);
			}
		}
	}

	const narration = states.find((entry) => entry.category === 'narration');
	assert.ok(narration);
	assert.equal(narration?.tasks[0], 'narrative.generate');
});

test('S4 configured task route is authoritative for primary selection, even against a higher-scoring unrelated eligible model', () => {
	const orchestrator = new MultiModelOrchestrator();
	const routePrimary = makeNarrationModel('route_primary', 'route-primary', 10);
	const routeFallback = makeNarrationModel('route_fallback', 'route-fallback', 20);
	const unrelatedHighScore = makeNarrationModel('unrelated', 'unrelated-high-score', 10000);

	orchestrator.registerModel(routePrimary);
	orchestrator.registerModel(routeFallback);
	orchestrator.registerModel(unrelatedHighScore);

	const primaryAdapter = new DeterministicMockAdapter('route_primary');
	const fallbackAdapter = new DeterministicMockAdapter('route_fallback');
	const unrelatedAdapter = new DeterministicMockAdapter('unrelated');
	orchestrator.registerAdapter(primaryAdapter);
	orchestrator.registerAdapter(fallbackAdapter);
	orchestrator.registerAdapter(unrelatedAdapter);

	orchestrator.setFallbackChain('narrative.generate', [
		'route_primary::route-primary',
		'route_fallback::route-fallback',
		emergencyKey,
	]);
	orchestrator.pinModelForTask('narrative.generate', '');

	const selection = orchestrator.selectBestModel('narrative.generate');

	assert.equal(selection.selectedModel.modelId, 'route-primary');
	assert.deepEqual(
		selection.fallbacks.slice(0, 2).map((model) => model.modelId),
		['route-fallback', 'emergency-fallback-local'],
	);
	assert.notEqual(selection.selectedModel.modelId, 'unrelated-high-score');
});

test('S4 configured route reaches only its ordered fallbacks before deterministic emergency', async () => {
	const orchestrator = new MultiModelOrchestrator();
	const primary = makeNarrationModel('route_primary_fail', 'route-primary-fail', 10);
	const secondary = makeNarrationModel('route_secondary_fail', 'route-secondary-fail', 20);
	const tertiary = makeNarrationModel('route_tertiary_fail', 'route-tertiary-fail', 30);
	const unrelated = makeNarrationModel('unrelated_healthy', 'unrelated-healthy', 10000);

	for (const model of [primary, secondary, tertiary, unrelated]) {
		orchestrator.registerModel(model);
	}

	for (const providerId of ['route_primary_fail', 'route_secondary_fail', 'route_tertiary_fail']) {
		const adapter = new DeterministicMockAdapter(providerId);
		adapter.failureMode = '500';
		adapter.maxFailuresBeforeSuccess = 999;
		orchestrator.registerAdapter(adapter);
	}
	orchestrator.registerAdapter(new DeterministicMockAdapter('unrelated_healthy'));

	orchestrator.setFallbackChain('narrative.generate', [
		'route_primary_fail::route-primary-fail',
		'route_secondary_fail::route-secondary-fail',
		'route_tertiary_fail::route-tertiary-fail',
		emergencyKey,
	]);
	orchestrator.pinModelForTask('narrative.generate', 'route_primary_fail::route-primary-fail');

	const result = await orchestrator.executeTaskGeneration(
		'narrative.generate',
		'Generate a narration test turn.',
		'Return a concise narration.',
		{ timeoutMs: 2000, maxTokens: 100 },
	);

	const attempted = result.attemptsTrail.map((entry) => entry.modelId);
	assert.deepEqual(attempted, [
		'route-primary-fail',
		'route-secondary-fail',
		'route-tertiary-fail',
		'emergency-fallback-local',
	]);
	assert.equal(attempted.includes('unrelated-healthy'), false);
	assert.equal(result.source, 'DETERMINISTIC_FALLBACK');
});
