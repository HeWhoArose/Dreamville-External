import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

describe('N19 Gemini-first live narrative routing', () => {
	it('seeds Gemini as the primary narrative generator with non-Gemini fallbacks', () => {
		const orchestrator = new MultiModelOrchestrator();
		const narrative = orchestrator.getFallbackChain('narrative.generate');
		const dialogue = orchestrator.getFallbackChain('character.dialogue');
		const review = orchestrator.getFallbackChain('narrative.review');

		assert.equal(narrative[0], 'google_gemini::gemini-3.5-flash');
		assert.equal(dialogue[0], 'google_gemini::gemini-3.5-flash');
		assert.equal(review[0], 'google_gemini::gemini-3.5-flash');

		assert.ok(narrative.includes('groq::qwen/qwen3.8-27b'));
		assert.ok(narrative.includes('openrouter::inclusionai/ling-3.0-flash:free'));
		assert.ok(narrative.includes('provider_deterministic_emergency::emergency-fallback-local'));
		assert.ok(dialogue.includes('groq::qwen/qwen3.8-27b'));
		assert.ok(review.includes('groq::qwen/qwen3.8-27b'));
	});

	it('keeps N19 creative per-turn routing policy for narrative generation', async () => {
		const { getAiTaskRoutingPolicy } = await import('../server/domain/aiQualityRouting');
		const policy = getAiTaskRoutingPolicy('narrative.generate');
		assert.equal(policy.qualityTier, 'CREATIVE');
		assert.equal(policy.cadence, 'PER_TURN');
	});
});
