import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import {
	evaluateAiTaskCandidatePreflight,
	getAllAiTaskContracts,
} from '../server/domain/aiTaskContracts';

function createAuditModel(
	providerId: string,
	modelId: string,
	tasks: Array<ModelRegistryRecord['roleEligibility'][number]>,
): ModelRegistryRecord {
	return {
		providerId,
		modelId,
		displayName: modelId,
		pool: 'fast',
		capabilities: ['text_generation', 'structured_output', 'fast'],
		contextWindow: 32768,
		outputTokenLimit: 2048,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 10,
		userPriority: 100,
		roleEligibility: tasks,
		fallbackEligibility: true,
		isEmergencyFloor: false,
		accessStatus: 'accessible',
		lifecycleState: 'active',
	};
}

test('AI model intelligence audit loop completes ten deterministic passes for task/category/fallback invariants', () => {
	const orchestrator = new MultiModelOrchestrator();
	const beforeRoutes = JSON.stringify(orchestrator.getAllFallbackChains());

	for (let pass = 0; pass < 10; pass++) {
		const contracts = getAllAiTaskContracts();
		assert.ok(contracts.length > 0);

		for (const contract of contracts) {
			const route = orchestrator.getFallbackChain(contract.task);
			assert.ok(route.length > 0, 'Empty fallback route: ' + contract.task);
			assert.equal(
				route.at(-1),
				'provider_deterministic_emergency::emergency-fallback-local',
				'Route must terminate at deterministic recovery: ' + contract.task,
			);

			const category = orchestrator.getTaskCategory(contract.task);
			const state = orchestrator
				.getCategoryRuntimeStates()
				.find((entry) => entry.category === category);
			assert.ok(state, 'Missing category runtime state: ' + category);
			assert.ok(
				state!.taskRoutes.some((entry) => entry.task === contract.task),
				'Category lost task route: ' + contract.task,
			);
		}

		assert.equal(JSON.stringify(orchestrator.getAllFallbackChains()), beforeRoutes);
	}
});

test('AI model intelligence audit loop preserves side-effect-free preflight and truthful unknown metadata', () => {
	const candidate = createAuditModel('audit_preflight', 'unknown-model', ['narrative.generate']);
	candidate.contextWindow = 0;
	candidate.outputTokenLimit = undefined;

	const before = JSON.stringify(candidate);

	for (let pass = 0; pass < 10; pass++) {
		const result = evaluateAiTaskCandidatePreflight(
			'narrative.generate',
			candidate,
			500000,
			500000,
		);

		assert.equal(result.eligible, true);
		assert.equal(result.state, 'READY');
		assert.equal(result.contextCapacityKnown, false);
		assert.equal(result.outputCapacityKnown, false);
		assert.equal(result.taskContractCompatible, true);
		assert.equal(JSON.stringify(candidate), before);
	}
});

test('AI model intelligence audit loop preserves ordered fallback and only advances after task-contract failure', async () => {
	const orchestrator = new MultiModelOrchestrator();

	const invalidAdapter = new DeterministicMockAdapter('audit_invalid');
	const validAdapter = new DeterministicMockAdapter('audit_valid');

	invalidAdapter.cannedResponses.set(
		'narrative.generate',
		JSON.stringify({ wrong: 'schema' }),
	);
	validAdapter.cannedResponses.set(
		'narrative.generate',
		JSON.stringify({
			narrative: ['Valid fallback narrative.'],
			dialogue: [],
			events: [],
			stateChanges: [],
			memoryCandidates: [],
			audioCues: [],
		}),
	);

	orchestrator.registerAdapter(invalidAdapter);
	orchestrator.registerAdapter(validAdapter);

	orchestrator.registerModel(
		createAuditModel('audit_invalid', 'invalid', ['narrative.generate']),
	);
	orchestrator.registerModel(
		createAuditModel('audit_valid', 'valid', ['narrative.generate']),
	);

	orchestrator.setFallbackChain('narrative.generate', [
		'audit_invalid::invalid',
		'audit_valid::valid',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'audit_invalid::invalid');

	for (let pass = 0; pass < 10; pass++) {
		const result = await orchestrator.executeTaskGeneration(
			'narrative.generate',
			'Run the audit loop.',
			undefined,
			{
				timeoutMs: 100,
				validateResponse: (text) => {
					const validation = orchestrator.validateTurnPackage(text);
					return validation.valid
						? { valid: true }
						: { valid: false, errorReason: validation.errorReason };
				},
			},
		);

		assert.equal(result.source, 'AI_FALLBACK');
		assert.equal(result.modelId, 'valid');
		assert.equal(result.attemptsTrail[0]?.modelId, 'invalid');
		assert.equal(result.attemptsTrail[0]?.status, 'FAILED');
		assert.equal(result.attemptsTrail[1]?.modelId, 'valid');
		assert.equal(result.attemptsTrail[1]?.status, 'SUCCESS');
	}
});
