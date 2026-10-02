import test from 'node:test';
import assert from 'node:assert/strict';
import {
	getAiTaskRoutingPolicy,
	scoreModelForQualityTier,
	type AiQualityTier,
} from '../server/domain/aiQualityRouting';

const model = (overrides: Record<string, unknown> = {}) => ({
	providerId: 'test',
	modelId: 'model',
	displayName: 'Test',
	pool: 'creative',
	capabilities: ['text_generation'],
	contextWindow: 128000,
	health: 'Healthy',
	quota: 'Healthy',
	latencyMs: 500,
	userPriority: 50,
	roleEligibility: ['narrative.generate'],
	isEmergencyFloor: false,
	...overrides,
} as any);

test('N19 assigns creative per-turn routing to narration and dialogue', () => {
	assert.deepEqual(getAiTaskRoutingPolicy('narrative.generate'), {
		task: 'narrative.generate',
		qualityTier: 'CREATIVE',
		cadence: 'PER_TURN',
		reason: 'Final narration requires creative-writing capability on every resolved turn.',
	});
	assert.equal(getAiTaskRoutingPolicy('character.dialogue').qualityTier, 'CREATIVE');
	assert.equal(getAiTaskRoutingPolicy('character.dialogue').cadence, 'PER_TURN');
});

test('N19 routes auxiliary work to conditional or periodic cadences', () => {
	assert.equal(getAiTaskRoutingPolicy('research.query').cadence, 'CONDITIONAL');
	assert.equal(getAiTaskRoutingPolicy('summary.scene').cadence, 'PERIODIC');
	assert.equal(getAiTaskRoutingPolicy('memory.extract').cadence, 'CONDITIONAL');
	assert.equal(getAiTaskRoutingPolicy('intent.interpret').qualityTier, 'FAST');
});

test('N19 creative tier prefers creative-writing models without rejecting ordinary compatible models', () => {
	const creative = model({
		modelId: 'creative',
		pool: 'creative',
		capabilities: ['text_generation', 'creative_writing', 'long_context'],
	});
	const fast = model({
		modelId: 'fast',
		pool: 'fast',
		capabilities: ['text_generation', 'fast'],
	});
	assert.ok(scoreModelForQualityTier(creative, 'CREATIVE') > scoreModelForQualityTier(fast, 'CREATIVE'));
	assert.ok(scoreModelForQualityTier(fast, 'FAST') > scoreModelForQualityTier(creative, 'FAST'));
});

test('N19 premium creative tier prefers creative + reasoning + context', () => {
	const premium = model({
		modelId: 'premium',
		pool: 'creative',
		capabilities: ['text_generation', 'creative_writing', 'reasoning', 'long_context'],
		contextWindow: 1000000,
		outputTokenLimit: 8000,
	});
	const creative = model({
		modelId: 'creative',
		pool: 'creative',
		capabilities: ['text_generation', 'creative_writing'],
	});
	assert.ok(scoreModelForQualityTier(premium, 'PREMIUM_CREATIVE') > scoreModelForQualityTier(creative, 'PREMIUM_CREATIVE'));
});

test('N19 never promotes the deterministic emergency floor as a creative model', () => {
	const emergency = model({
		modelId: 'emergency',
		pool: 'emergency',
		isEmergencyFloor: true,
	});
	for (const tier of ['FAST', 'STANDARD', 'CREATIVE', 'PREMIUM_CREATIVE', 'REVIEW'] as AiQualityTier[]) {
		assert.equal(scoreModelForQualityTier(emergency, tier), -100000);
	}
});
