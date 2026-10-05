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
