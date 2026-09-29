import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DeterministicMockAdapter, MultiModelOrchestrator, type ModelRegistryRecord } from '../server/domain/aiOrchestrator';
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

test('fallback execution reaches a later AI tier before deterministic recovery', async () => {
  const orchestrator = new MultiModelOrchestrator();
  const primaryProvider = 'audit_production_route_primary';
  const secondaryProvider = 'audit_production_route_secondary';
  const primaryAdapter = new DeterministicMockAdapter(primaryProvider);
  const secondaryAdapter = new DeterministicMockAdapter(secondaryProvider);

  primaryAdapter.failureMode = '500';
  primaryAdapter.maxFailuresBeforeSuccess = 999;
  secondaryAdapter.cannedResponses.set(
    'narrative.generate',
    JSON.stringify({
      narrative: ['The secondary AI tier successfully produced the narration.'],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    }),
  );

  const makeModel = (providerId: string, modelId: string): ModelRegistryRecord => ({
    providerId,
    modelId,
    displayName: modelId,
    pool: 'creative',
    capabilities: ['text_generation', 'creative_writing', 'structured_output'],
    contextWindow: 131072,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 10,
    userPriority: 100,
    roleEligibility: ['narrative.generate'],
    fallbackEligibility: true,
    accessStatus: 'accessible',
    lifecycleState: 'active',
    isEmergencyFloor: false,
  });

  orchestrator.registerAdapter(primaryAdapter);
  orchestrator.registerAdapter(secondaryAdapter);
  orchestrator.registerModel(makeModel(primaryProvider, 'primary'));
  orchestrator.registerModel(makeModel(secondaryProvider, 'secondary'));

  orchestrator.setFallbackChain('narrative.generate', [
    primaryProvider + '::primary',
    secondaryProvider + '::secondary',
    emergency,
  ]);
  orchestrator.pinModelForTask('narrative.generate', primaryProvider + '::primary');

  const result = await orchestrator.executeTaskGeneration(
    'narrative.generate',
    'Run a production-style fallback audit.',
    undefined,
    {
      allowDeterministicFallback: true,
      timeoutMs: 1000,
    },
  );

  assert.equal(result.modelId, 'secondary');
  assert.equal(result.source, 'AI_FALLBACK');
  assert.deepEqual(
    result.attemptsTrail.map((entry) => entry.modelId),
    ['primary', 'secondary'],
  );
  assert.equal(
    result.attemptsTrail.some((entry) => entry.modelId === 'emergency-fallback-local'),
    false,
  );
});
;
