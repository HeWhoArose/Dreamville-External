import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';
import { getAllAiTaskContracts } from '../server/domain/aiTaskContracts';

const emergency = 'provider_deterministic_emergency::emergency-fallback-local';
const config = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'server/data/orchestrator_config.json'), 'utf8'),
);

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
  tactical_reasoning: 'groq::openai/gpt-oss-120b',
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

test('production task routes follow the documented category arrangement and never use openrouter/free random routing', () => {
  const routes = config.fallbackChains || {};

  for (const contract of getAllAiTaskContracts()) {
    const route = routes[contract.task];

    assert.ok(Array.isArray(route), 'Missing production route for ' + contract.task);

    if (contract.category === 'speech' || contract.category === 'image') {
      assert.equal(route.at(-1), emergency);
      continue;
    }

    assert.ok(route.length >= 2, 'Route is too short for ' + contract.task);
    const expectedPrimary = contract.task === 'combat.animation.plan'
      ? 'groq::qwen/qwen3.8-27b'
      : expectedStarts[contract.category];
    assert.equal(route[0], expectedPrimary, 'Unexpected primary for ' + contract.task);
    assert.equal(route.at(-1), emergency, 'Route must end in deterministic recovery: ' + contract.task);
    assert.equal(route.includes('openrouter::openrouter/free'), false);
    assert.equal(new Set(route).size, route.length, 'Route contains duplicates: ' + contract.task);
  }
});

test('critical narrative and dialogue routes contain cross-provider continuity fallbacks', () => {
  const routes = config.fallbackChains || {};

  for (const task of ['narrative.generate', 'character.dialogue', 'ooc.respond']) {
    const route = routes[task];
    assert.ok(Array.isArray(route));

    assert.ok(route.some((key: string) => key.startsWith('groq::')));
    assert.ok(route.some((key: string) => key.startsWith('openrouter::inclusionai/ling-3.0-flash:free')));
    assert.ok(route.some((key: string) => key.startsWith('openrouter::google/gemma-4-31b-it:free')));
    assert.ok(route.some((key: string) => key.startsWith('google_gemini::gemini-3.5-flash')));
    assert.equal(route.at(-1), emergency);
    assert.ok(route.length >= 5, 'Critical text route must have multiple AI recovery tiers: ' + task);
  }
});

test('every production fallback entry is adapter-addressable and leaves multiple AI tiers before deterministic recovery', () => {
  const supportedProviders = new Set(['google_gemini', 'openrouter', 'groq', 'provider_mock_stt', 'provider_mock_speech', 'google_imagen']);

  for (const contract of getAllAiTaskContracts()) {
    const route = config.fallbackChains?.[contract.task];
    assert.ok(Array.isArray(route), 'Missing route: ' + contract.task);

    const aiKeys = route.filter((key: string) => key !== emergency);
    for (const key of aiKeys) {
      const separator = key.indexOf('::');
      assert.ok(separator > 0, 'Malformed model key in ' + contract.task + ': ' + key);
      const providerId = key.slice(0, separator);
      assert.ok(supportedProviders.has(providerId), 'No adapter provider for ' + key);
    }

    if (contract.category !== 'speech' && contract.category !== 'image') {
      assert.ok(aiKeys.length >= 3, 'Text task needs at least three AI tiers before deterministic recovery: ' + contract.task);
    }
  }
});

test('configured routes do not fall directly to the deterministic floor when earlier providers are unavailable', () => {
  const cases: Array<{
    task: Parameters<MultiModelOrchestrator['selectBestModel']>[0];
    unavailableKeys: string[];
    expectedFallback: string;
  }> = [
    {
      task: 'narrative.generate',
      unavailableKeys: [
        'groq::qwen/qwen3.8-27b',
        'openrouter::inclusionai/ling-3.0-flash:free',
        'openrouter::google/gemma-4-31b-it:free',
      ],
      expectedFallback: 'google_gemini::gemini-3.5-flash',
    },
    {
      task: 'rules.adjudicate',
      unavailableKeys: [
        'groq::openai/gpt-oss-120b',
        'groq::qwen/qwen3.8-27b',
      ],
      expectedFallback: 'google_gemini::gemini-3.5-flash',
    },
    {
      task: 'character.extract',
      unavailableKeys: [
        'google_gemini::gemini-3.5-flash-lite',
      ],
      expectedFallback: 'groq::qwen/qwen3.8-27b',
    },
  ];

  for (const scenario of cases) {
    const orchestrator = new MultiModelOrchestrator();

    for (const key of scenario.unavailableKeys) {
      const [providerId, modelId] = key.split('::');
      orchestrator.updateModelHealth(providerId, modelId, 'Unavailable');
    }

    const selection = orchestrator.selectBestModel(scenario.task, { contextTokens: 1000 });

    assert.equal(
      selection.selectedModel.providerId + '::' + selection.selectedModel.modelId,
      scenario.expectedFallback,
      'Configured route should select the next viable AI model for ' + scenario.task,
    );
    assert.equal(selection.selectedModel.isEmergencyFloor, false);
  }
});
