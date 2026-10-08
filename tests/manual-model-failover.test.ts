import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	MultiModelOrchestrator,
	type IProviderAdapter,
	type ModelRegistryRecord,
	type ProviderGenerateResult,
} from '../server/domain/aiOrchestrator';

class ControlledAdapter implements IProviderAdapter {
	public readonly providerId = 'test_manual_fallback_provider';
	public primaryMode: '429' | 'success' | 'unavailable' = 'success';
	public calls: string[] = [];
	public failModels = new Set<string>();

	async generate(
		_task: any,
		_prompt: string,
		options?: any,
	): Promise<ProviderGenerateResult> {
		const modelId = String(options?.modelId || '');
		this.calls.push(modelId);
		if (modelId === 'preferred-model' && this.primaryMode === '429') {
			throw new Error('Provider rate limit exceeded (HTTP 429 Too Many Requests).');
		}
		if (this.failModels.has(modelId)) {
			throw new Error('Injected provider failure for route-length regression.');	
		}
		return {
			text: 'VALID NARRATION',
			latencyMs: 1,
			inputTokens: 10,
			outputTokens: 4,
			modelId,
			providerId: this.providerId,
		};
	}

	async validateCredentials(): Promise<boolean> {
		return true;
	}
}

function model(modelId: string, priority: number, health: 'Healthy' | 'Unavailable' = 'Healthy'): ModelRegistryRecord {
	return {
		providerId: 'test_manual_fallback_provider',
		modelId,
		displayName: modelId,
		pool: 'creative',
		capabilities: ['text_generation', 'creative_writing', 'structured_output'],
		contextWindow: 131072,
		health,
		quota: 'Healthy',
		latencyMs: 1,
		userPriority: priority,
		roleEligibility: ['narrative.generate'],
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['text', 'json'],
		fallbackEligibility: true,
		accessStatus: 'accessible',
		isEmergencyFloor: false,
		outputTokenLimit: 8192,
	};
}

test('manual model selection falls through to the configured route when the requested model is unavailable at preflight', async () => {
	const orchestrator = new MultiModelOrchestrator();
	const originalChain = orchestrator.getFallbackChain('narrative.generate');
	try {
		const adapter = new ControlledAdapter();
		orchestrator.registerAdapter(adapter);
		orchestrator.registerModel(model('preferred-model', 200, 'Unavailable'));
		orchestrator.registerModel(model('fallback-model', 100));
		orchestrator.setFallbackChain('narrative.generate', [
			'test_manual_fallback_provider::preferred-model',
			'test_manual_fallback_provider::fallback-model',
		]);

		const result = await orchestrator.executeTaskGeneration(
			'narrative.generate',
			'Continue the current scene.',
			undefined,
			{
				forceModelId: 'test_manual_fallback_provider::preferred-model',
				allowDeterministicFallback: false,
				validateResponse: () => ({ valid: true }),
			},
		);

		assert.equal(result.modelId, 'fallback-model');
		assert.equal(result.providerId, 'test_manual_fallback_provider');
		assert.equal(result.source, 'AI_FALLBACK');
		assert.deepEqual(result.attemptsTrail.map((entry) => entry.modelId), ['fallback-model']);
	} finally {
		orchestrator.setFallbackChain('narrative.generate', originalChain);
	}
});

test('a transient provider 429 cools the preferred model without permanently marking its quota exhausted', async () => {
	const orchestrator = new MultiModelOrchestrator();
	const originalChain = orchestrator.getFallbackChain('narrative.generate');
	try {
		const adapter = new ControlledAdapter();
		adapter.primaryMode = '429';
		orchestrator.registerAdapter(adapter);
		orchestrator.registerModel(model('preferred-model', 200));
		orchestrator.registerModel(model('fallback-model', 100));
		orchestrator.setFallbackChain('narrative.generate', [
			'test_manual_fallback_provider::preferred-model',
			'test_manual_fallback_provider::fallback-model',
		]);

		const result = await orchestrator.executeTaskGeneration(
			'narrative.generate',
			'Continue the current scene.',
			undefined,
			{
				forceModelId: 'test_manual_fallback_provider::preferred-model',
				allowDeterministicFallback: false,
				validateResponse: () => ({ valid: true }),
			},
		);

		assert.equal(result.modelId, 'fallback-model');
		assert.equal(adapter.calls[0], 'preferred-model');
		assert.equal(adapter.calls[1], 'fallback-model');
		assert.equal(orchestrator.getModel('test_manual_fallback_provider', 'preferred-model')?.quota, 'Low');
		assert.notEqual(orchestrator.getModel('test_manual_fallback_provider', 'preferred-model')?.quota, 'Exhausted');
	} finally {
		orchestrator.setFallbackChain('narrative.generate', originalChain);
	}
});


test('configured fallback attempt budget follows the effective route instead of a fixed global cap', async () => {
	const orchestrator = new MultiModelOrchestrator();
	const originalChain = orchestrator.getFallbackChain('narrative.generate');
	try {
		const adapter = new ControlledAdapter();
		orchestrator.registerAdapter(adapter);
		const route = Array.from({ length: 6 }, (_, index) => {
			const id = 'route-model-' + String(index + 1);
			orchestrator.registerModel(model(id, 100 - index));
			return 'test_manual_fallback_provider::' + id;
		});
		orchestrator.setFallbackChain('narrative.generate', route);

		// Force every configured model to fail. A fixed maxTotalAttempts=5 would
		// incorrectly skip the sixth configured candidate and reach the emergency
		// floor early. The route-derived budget must attempt all six.
		(adapter as any).generate = async (_task: any, _prompt: string, options?: any) => {
			const modelId = String(options?.modelId || '');
			adapter.calls.push(modelId);
			throw new Error('simulated provider failure');
		};

		const result = await orchestrator.executeTaskGeneration(
			'narrative.generate',
			'Continue the current scene.',
			undefined,
			{
				allowDeterministicFallback: true,
				validateResponse: () => ({ valid: true }),
			},
		);

		assert.equal(result.source, 'DETERMINISTIC_FALLBACK');
		assert.deepEqual(adapter.calls, route.map((key) => key.split('::')[1]));
		assert.equal(result.attemptsTrail.filter((entry) => entry.status === 'FAILED').length, 6);
	} finally {
		orchestrator.setFallbackChain('narrative.generate', originalChain);
	}
});


test('configured fallback budget follows the effective route length instead of truncating after five models', async () => {
	const orchestrator = new MultiModelOrchestrator();
	const originalChain = orchestrator.getFallbackChain('narrative.generate');
	try {
		const adapter = new ControlledAdapter();
		adapter.failModels = new Set(['route-model-1', 'route-model-2', 'route-model-3', 'route-model-4', 'route-model-5']);
		orchestrator.registerAdapter(adapter);

		for (let index = 1; index <= 6; index++) {
			orchestrator.registerModel(model(`route-model-${index}`, 100 - index));
		}

		orchestrator.setFallbackChain('narrative.generate', Array.from({ length: 6 }, (_, index) =>
			`test_manual_fallback_provider::route-model-${index + 1}`,
		));

		const result = await orchestrator.executeTaskGeneration(
			'narrative.generate',
			'Continue the current scene.',
			undefined,
			{
				allowDeterministicFallback: false,
				validateResponse: () => ({ valid: true }),
			},
		);

		assert.equal(result.modelId, 'route-model-6');
		assert.equal(adapter.calls.length, 6);
		assert.deepEqual(adapter.calls, [
			'route-model-1',
			'route-model-2',
			'route-model-3',
			'route-model-4',
			'route-model-5',
			'route-model-6',
		]);
	} finally {
		orchestrator.setFallbackChain('narrative.generate', originalChain);
	}
});
