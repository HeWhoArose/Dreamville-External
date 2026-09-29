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

test('verified free catalog excludes paid Gemini 3.8 and includes verified Gemini free models', () => {
	process.env.NODE_TEST_CONTEXT = '1';
	const orchestrator = new MultiModelOrchestrator();
	const catalog = orchestrator.getFreeModelCatalog();
	const keys = new Set(catalog.map((entry) => entry.providerId + '::' + entry.modelId));

	assert.equal(keys.has('google_gemini::gemini-3.8-flash'), false);
	assert.equal(keys.has('google_gemini::gemini-3.5-flash'), true);
	assert.equal(keys.has('google_gemini::gemini-3.5-flash-lite'), true);
});
