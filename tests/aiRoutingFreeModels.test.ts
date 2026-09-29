import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

test('free-model classification requires provider evidence', () => {
	const paidNamedFree: any = {
		providerId: 'openrouter',
		modelId: 'example-paid',
		displayName: 'Example Free Premium',
		pool: 'creative',
		capabilities: ['text_generation'],
		contextWindow: 32000,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 100,
		userPriority: 50,
		roleEligibility: ['narrative.generate'],
		isPaidModel: true,
		freeTierStatus: 'NOT_FREE',
		freeTierEvidenceSource: 'PROVIDER',
	};
	assert.equal(MultiModelOrchestrator.isFreeModelCandidate(paidNamedFree), false);

	const unknownNamedFree: any = {
		...paidNamedFree,
		isPaidModel: undefined,
		freeTierStatus: 'UNKNOWN',
		freeTierEvidenceSource: 'UNKNOWN',
	};
	assert.equal(MultiModelOrchestrator.isFreeModelCandidate(unknownNamedFree), false);

	const verifiedFree: any = {
		...paidNamedFree,
		isPaidModel: false,
		freeTierStatus: 'VERIFIED',
		freeTierEvidenceSource: 'PROVIDER',
	};
	assert.equal(MultiModelOrchestrator.isFreeModelCandidate(verifiedFree), true);
});

test('default free fallback route never treats paid or unknown models as free', () => {
	process.env.NODE_TEST_CONTEXT = '1';
	const orchestrator = new MultiModelOrchestrator();
	const chain = orchestrator.getFallbackChain('narrative.generate');

	for (const key of chain) {
		if (key.includes('emergency-fallback-local')) continue;
		const separator = key.indexOf('::');
		const providerId = separator >= 0 ? key.slice(0, separator) : '';
		const modelId = separator >= 0 ? key.slice(separator + 2) : key;
		const model = orchestrator.getModel(providerId, modelId);
		assert.ok(model, `Fallback model ${key} should be registered`);
		assert.equal(MultiModelOrchestrator.isFreeModelCandidate(model!), true, `Fallback model ${key} must be provider-verified free`);
	}
});
