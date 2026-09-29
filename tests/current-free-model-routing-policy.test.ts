import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';
import { getAllAiTaskContracts } from '../server/domain/aiTaskContracts';

const emergency = 'provider_deterministic_emergency::emergency-fallback-local';

const expectedStarts: Record<string, string> = {
  narration: 'groq::qwen/qwen3.8-27b',
  dialogue: 'groq::qwen/qwen3.8-27b',
  character_genesis: 'google_gemini::gemini-3.5-flash-lite',
  memory: 'google_gemini::gemini-3.5-flash-lite',
  summarization: 'google_gemini::gemini-3.5-flash-lite',
  intent_interpretation: 'google_gemini::gemini-3.5-flash-lite',
  capability_explanation: 'google_gemini::gemini-3.5-flash-lite',
  utility: 'google_gemini::gemini-3.5-flash-lite',
  rules: 'groq::openai/gpt-oss-120b',
  rule_analysis: 'groq::openai/gpt-oss-120b',
  tactical_reasoning: 'groq::qwen/qwen3.8-27b',
  capability_synthesis: 'groq::openai/gpt-oss-120b',
  world_generation: 'groq::qwen/qwen3.8-27b',
  research: 'groq::openai/gpt-oss-120b',
  research_world_brief: 'groq::openai/gpt-oss-120b',
  gameplay_advice: 'groq::qwen/qwen3.8-27b',
};

test('current free-model registry includes the configured Groq and OpenRouter anchors', () => {
  const orchestrator = new MultiModelOrchestrator();

  for (const [providerId, modelId] of [
    ['groq', 'qwen/qwen3.8-27b'],
    ['groq', 'openai/gpt-oss-120b'],
    ['groq', 'openai/gpt-oss-20b'],
    ['openrouter', 'inclusionai/ling-3.0-flash:free'],
    ['openrouter', 'google/gemma-4-31b-it:free'],
    ['openrouter', 'qwen/qwen3.8-27b:free'],
  ]) {
    const model = orchestrator.getModel(providerId, modelId);
    assert.ok(model, 'Missing seeded model ' + providerId + '::' + modelId);
    assert.equal(model?.isPaidModel, false);
    assert.equal(model?.freeTierStatus, 'VERIFIED');
  }

  assert.ok(orchestrator.getAdapter('groq'), 'Groq adapter must be registered');
  assert.ok(orchestrator.getAdapter('openrouter'), 'OpenRouter adapter must be registered');
});

test('task routes follow the documented category arrangement and never use openrouter/free random routing', () => {
  const orchestrator = new MultiModelOrchestrator();

  for (const contract of getAllAiTaskContracts()) {
    const route = orchestrator.getFallbackChain(contract.task);

    if (contract.category === 'speech' || contract.category === 'image') {
      assert.equal(route.at(-1), emergency);
      continue;
    }

    assert.ok(route.length >= 2, 'Route is too short for ' + contract.task);
    assert.equal(route[0], expectedStarts[contract.category], 'Unexpected primary for ' + contract.task);
    assert.equal(route.at(-1), emergency, 'Route must end in deterministic recovery: ' + contract.task);
    assert.equal(route.includes('openrouter::openrouter/free'), false);
  }
});

test('critical narrative and dialogue routes contain cross-provider continuity fallbacks', () => {
  const orchestrator = new MultiModelOrchestrator();

  for (const task of ['narrative.generate', 'character.dialogue', 'ooc.respond']) {
    const route = orchestrator.getFallbackChain(task);
    assert.ok(route.some((key) => key.startsWith('groq::')));
    assert.ok(route.some((key) => key.startsWith('openrouter::inclusionai/ling-3.0-flash:free')));
    assert.ok(route.some((key) => key.startsWith('openrouter::google/gemma-4-31b-it:free')));
    assert.ok(route.some((key) => key.startsWith('google_gemini::gemini-3.5-flash')));
    assert.equal(route.at(-1), emergency);
  }
});
