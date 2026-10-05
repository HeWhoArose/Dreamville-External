import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { getAllAiTaskContracts } from '../server/domain/aiTaskContracts';

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

test('S4 fresh orchestrator does not inherit persisted test-route mutations', () => {
	const orchestrator = new MultiModelOrchestrator();
	const narrativeRoute = orchestrator.getFallbackChain('narrative.generate');
	const narrativePin = orchestrator.getPinnedModelForTask('narrative.generate');
	const gameplayOverride = orchestrator.getCategoryModelOverride('gameplay_advice');
	assert.equal(narrativeRoute[0], 'google_gemini::gemini-3.5-flash');
	assert.equal(narrativePin, undefined);
	assert.equal(gameplayOverride, undefined);
});

test('S4 category routes enumerate and preserve route semantics for every owning task', () => {
	const orchestrator = new MultiModelOrchestrator();
	const states = orchestrator.getCategoryRuntimeStates();

	for (let pass = 0; pass < 10; pass++) {
		const contracts = getAllAiTaskContracts();
		const expectedByCategory = new Map<string, string[]>();

		for (const contract of contracts) {
			const list = expectedByCategory.get(contract.category) || [];
			list.push(contract.task);
			expectedByCategory.set(contract.category, list);
		}

		for (const state of states) {
			const expectedTasks = expectedByCategory.get(state.category) || [];
			assert.deepEqual(
				state.tasks,
				expectedTasks,
				'Category-to-task mapping drifted for ' + state.category,
			);
			assert.equal(
				state.taskRoutes.length,
				state.tasks.length,
				'Every category task must have its own route state: ' + state.category,
			);

			for (const task of state.tasks) {
				const route = state.taskRoutes.find((entry) => entry.task === task);
				assert.ok(route, 'Missing route state for ' + task);

				const configuredRoute = orchestrator.getFallbackChain(task);
				assert.deepEqual(
					route?.fallbackChain,
					configuredRoute,
					'Category state must expose the owning task route, not only the first task route: ' + task,
				);
				assert.ok(configuredRoute.length > 0, 'Empty route: ' + task);
				assert.equal(
					configuredRoute.at(-1),
					emergencyKey,
					'Route must terminate at deterministic recovery: ' + task,
				);

				const categoryOverride = orchestrator.getCategoryModelOverride(state.category);
				const pinned = orchestrator.getPinnedModelForTask(task);

				if (categoryOverride) {
					assert.equal(route?.activeModelKey, categoryOverride, 'Category override must apply to every eligible task: ' + task);
					assert.equal(route?.mode, 'CATEGORY_MANUAL');
				} else if (pinned) {
					assert.equal(route?.activeModelKey, pinned, 'Task pin must remain task-scoped: ' + task);
					assert.equal(route?.mode, 'TASK_PINNED');
				} else {
					assert.equal(route?.activeModelKey, configuredRoute[0], 'AUTO task route must start at its own configured route: ' + task);
					assert.equal(route?.mode, 'AUTO');
				}
			}
		}
	}
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


test('S4 category override is task-compatible inside multi-task speech category', () => {
	const orchestrator = new MultiModelOrchestrator();
	const state = orchestrator.getCategoryRuntimeStates().find((entry) => entry.category === 'speech');
	const tasks = state?.tasks || [];
	assert.deepEqual([...tasks].sort(), ['speech.generate', 'speech.transcribe']);

	orchestrator.registerModel({
		providerId: 'category_partial',
		modelId: 'partial-speech',
		displayName: 'Partial Speech Test Model',
		pool: 'speech',
		capabilities: ['speech_synthesis', 'text_generation'],
		contextWindow: 32768,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 10,
		userPriority: 100,
		roleEligibility: ['speech.generate'],
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['audio'],
		fallbackEligibility: true,
		isEmergencyFloor: false,
		accessStatus: 'accessible',
		lifecycleState: 'active',
	});

	orchestrator.setCategoryModelOverride('speech', 'category_partial::partial-speech');

	const runtime = orchestrator.getCategoryRuntimeStates().find((entry) => entry.category === 'speech');
	const generationRoute = runtime?.taskRoutes.find((route) => route.task === 'speech.generate');
	const transcriptionRoute = runtime?.taskRoutes.find((route) => route.task === 'speech.transcribe');

	assert.equal(generationRoute?.activeModelKey, 'category_partial::partial-speech');
	assert.equal(generationRoute?.mode, 'CATEGORY_MANUAL');
	assert.notEqual(transcriptionRoute?.activeModelKey, 'category_partial::partial-speech');
	assert.notEqual(transcriptionRoute?.mode, 'CATEGORY_MANUAL');

	assert.equal(orchestrator.selectBestModel('speech.generate').selectedModel.modelId, 'partial-speech');
	assert.notEqual(orchestrator.selectBestModel('speech.transcribe').selectedModel.modelId, 'partial-speech');
});
test('S4 valid category override is applied to every task in a multi-task category', () => {
	const orchestrator = new MultiModelOrchestrator();
	const category = 'gameplay_advice' as const;
	const tasks = orchestrator.getCategoryRuntimeStates().find((state) => state.category === category)?.tasks || [];
	assert.deepEqual([...tasks].sort(), ['ooc.respond', 'story.advice']);

	orchestrator.registerModel({
		providerId: 'category_shared',
		modelId: 'shared-gameplay-advice',
		displayName: 'Shared Gameplay Advice Test Model',
		pool: 'fast',
		capabilities: ['text_generation', 'fast', 'reasoning', 'structured_output'],
		contextWindow: 32768,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 10,
		userPriority: 500,
		roleEligibility: tasks,
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['text', 'json'],
		hasStructuredOutput: true,
		fallbackEligibility: true,
		isEmergencyFloor: false,
		accessStatus: 'accessible',
		lifecycleState: 'active',
	});

	orchestrator.setCategoryModelOverride(category, 'category_shared::shared-gameplay-advice');

	for (let pass = 0; pass < 10; pass++) {
		const state = orchestrator.getCategoryRuntimeStates().find((entry) => entry.category === category);
		assert.ok(state);
		assert.equal(state?.mode, 'MANUAL');
		assert.equal(state?.activeModelKey, 'category_shared::shared-gameplay-advice');

		for (const task of tasks) {
			const route = state?.taskRoutes.find((entry) => entry.task === task);
			assert.equal(route?.activeModelKey, 'category_shared::shared-gameplay-advice');
			assert.equal(route?.mode, 'CATEGORY_MANUAL');

			const selection = orchestrator.selectBestModel(task);
			assert.equal(selection.selectedModel.modelId, 'shared-gameplay-advice', 'Category override did not reach task ' + task);
		}
	}
});
