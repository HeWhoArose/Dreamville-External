import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OpenRouterAdapter,
  MultiModelOrchestrator,
  DeterministicMockAdapter,
} from '../server/domain/aiOrchestrator';

test('OpenRouter adapter discovers models and executes chat completions with the server key', async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/api/v1/models')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'openai/gpt-test',
              name: 'GPT Test',
              description: 'Test model',
              context_length: 128000,
              architecture: {
                input_modalities: ['text'],
                output_modalities: ['text'],
              },
              pricing: { prompt: '0', completion: '0' },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.endsWith('/api/v1/chat/completions')) {
      const body = JSON.parse(String(init?.body || '{}'));
      assert.equal(body.model, 'openai/gpt-test');
      return new Response(
        JSON.stringify({
          model: 'openai/gpt-test',
          choices: [{ message: { content: 'OK' } }],
          usage: { prompt_tokens: 3, completion_tokens: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('Not found', { status: 404 });
  }) as typeof fetch;

  try {
    const adapter = new OpenRouterAdapter();
    const models = await adapter.discoverModels();
    assert.equal(models.length, 1);
    assert.equal(models[0].id, 'openai/gpt-test');

    const result = await adapter.generate('utility.inspect', 'Ping', { modelId: 'openai/gpt-test' });
    assert.equal(result.text, 'OK');
    assert.equal(result.providerId, 'openrouter');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('configured fallback chain controls the actual fallback candidate set', () => {
  const orchestrator = new MultiModelOrchestrator();
  const task = 'rules.adjudicate';

  const primaryKey = 'google_gemini::gemini-3.6-flash';
  const secondaryKey = 'provider_mock_reasoning::mock-reasoning-pro';
  orchestrator.pinModelForTask(task, primaryKey);
  orchestrator.setFallbackChain(task, [
    primaryKey,
    secondaryKey,
    'provider_deterministic_emergency::emergency-fallback-local',
  ]);

  const selection = orchestrator.selectBestModel(task);
  assert.equal(selection.selectedModel.modelId, 'gemini-3.6-flash');
  assert.equal(selection.fallbacks[0]?.modelId, 'mock-reasoning-pro');
  assert.equal(selection.fallbacks.every((m) =>
    m.modelId === 'mock-reasoning-pro' || m.isEmergencyFloor
  ), true);
});


test('Character Genesis uses its own Character Genesis fallback route', () => {
  const orchestrator = new MultiModelOrchestrator();

  const primaryKey = 'google_gemini::gemini-3.5-flash';
  const fallbackKey = 'google_gemini::gemini-3.5-flash-lite';

  orchestrator.pinModelForTask('memory.extract', 'provider_mock_reasoning::mock-reasoning-pro');
  orchestrator.setFallbackChain('memory.extract', [
    'provider_mock_reasoning::mock-reasoning-pro',
    'provider_deterministic_emergency::emergency-fallback-local',
  ]);

  orchestrator.pinModelForTask('character.extract', primaryKey);
  orchestrator.setFallbackChain('character.extract', [
    primaryKey,
    fallbackKey,
    'provider_deterministic_emergency::emergency-fallback-local',
  ]);

  const selection = orchestrator.selectBestModel('character.extract');

  assert.equal(selection.selectedModel.modelId, 'gemini-3.5-flash');
  assert.deepEqual(
    selection.fallbacks.filter((model) => !model.isEmergencyFloor).map((model) => model.modelId),
    ['gemini-3.5-flash-lite']
  );
  assert.equal(
    selection.fallbacks.some((model) => model.modelId === 'mock-reasoning-pro'),
    false,
    'Character Genesis must not inherit the Memory & Extraction route.'
  );
});

test('task response validation failure advances to the next AI model instead of stopping at the first response', async () => {
  const orchestrator = new MultiModelOrchestrator();

  for (const model of orchestrator.getAllModels()) {
    if (!model.isEmergencyFloor) {
      orchestrator.updateModelHealth(model.providerId, model.modelId, 'DisabledByUser');
    }
  }

  const first = new DeterministicMockAdapter('provider_test_first');
  first.cannedResponses.set('narrative.generate', JSON.stringify({ ok: false, reason: 'schema-invalid' }));

  const second = new DeterministicMockAdapter('provider_test_second');
  second.cannedResponses.set('narrative.generate', JSON.stringify({ ok: true, value: 'usable' }));

  orchestrator.registerAdapter(first);
  orchestrator.registerAdapter(second);

  orchestrator.registerModel({
    providerId: 'provider_test_first',
    modelId: 'first-model',
    displayName: 'First Test Model',
    pool: 'fast',
    capabilities: ['text_generation', 'structured_output'],
    contextWindow: 64000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 20,
    userPriority: 100,
    roleEligibility: ['narrative.generate'],
    fallbackEligibility: true,
  });

  orchestrator.registerModel({
    providerId: 'provider_test_second',
    modelId: 'second-model',
    displayName: 'Second Test Model',
    pool: 'fast',
    capabilities: ['text_generation', 'structured_output'],
    contextWindow: 64000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 30,
    userPriority: 90,
    roleEligibility: ['narrative.generate'],
    fallbackEligibility: true,
  });

  (orchestrator as any).taskPinnedModels.set(
    'narrative.generate',
    'provider_test_first::first-model'
  );
  (orchestrator as any).taskFallbackChains.set('narrative.generate', [
    'provider_test_first::first-model',
    'provider_test_second::second-model',
    'provider_deterministic_emergency::emergency-fallback-local',
  ]);

  const result = await orchestrator.executeTaskGeneration(
    'narrative.generate',
    'Return the test response.',
    undefined,
    {
      timeoutMs: 1000,
      validateResponse: (text) => {
        try {
          const parsed = JSON.parse(text);
          return parsed?.ok === true
            ? { valid: true }
            : { valid: false, errorReason: 'Expected { ok: true }.' };
        } catch {
          return { valid: false, errorReason: 'Response was not valid JSON.' };
        }
      },
    }
  );

  assert.equal(result.source, 'AI_FALLBACK');
  assert.equal(result.modelId, 'second-model');
  assert.equal(result.attempts, 2);
  assert.equal(result.attemptsTrail.length, 2);
  assert.equal(result.attemptsTrail[0].status, 'FAILED');
  assert.match(result.attemptsTrail[0].error || '', /schema validation/i);
  assert.equal(result.attemptsTrail[1].status, 'SUCCESS');
});

test('manual category routing never promotes an ineligible fallback model into the narrative task', () => {
  const orchestrator = new MultiModelOrchestrator();

  const selected = new DeterministicMockAdapter('provider_category_selected');
  orchestrator.registerAdapter(selected);
  orchestrator.registerModel({
    providerId: 'provider_category_selected',
    modelId: 'narrative-selected',
    displayName: 'Narrative Selected',
    pool: 'creative',
    capabilities: ['text_generation', 'structured_output'],
    contextWindow: 64000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 20,
    userPriority: 100,
    roleEligibility: ['narrative.generate', 'character.dialogue'],
    fallbackEligibility: true,
  });

  orchestrator.registerModel({
    providerId: 'provider_category_other',
    modelId: 'combat-only',
    displayName: 'Combat Only',
    pool: 'reasoning',
    capabilities: ['reasoning'],
    contextWindow: 64000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 10,
    userPriority: 999,
    roleEligibility: ['combat.tactics'],
    fallbackEligibility: true,
  });

  orchestrator.setCategoryModelOverride(
    'narration',
    'provider_category_selected::narrative-selected'
  );
  orchestrator.pinModelForTask('narrative.generate', null);
  orchestrator.setFallbackChain('narrative.generate', [
    'provider_category_selected::narrative-selected',
    'provider_category_other::combat-only',
    'provider_deterministic_emergency::emergency-fallback-local',
  ]);

  try {
    const selection = orchestrator.selectBestModel('narrative.generate');
    assert.equal(selection.selectedModel.modelId, 'narrative-selected');
    assert.equal(selection.fallbacks.some((model) => model.modelId === 'combat-only'), false);

    const unrelated = orchestrator.getAllModels().find(
      (model) => model.modelId === 'combat-only'
    );
    assert.deepEqual(unrelated?.roleEligibility, ['combat.tactics']);
  } finally {
    orchestrator.setCategoryModelOverride('narration', null as any);
  }
});

test('manual category routing does not inject global recovery candidates after the selected model fails', async () => {
  const orchestrator = new MultiModelOrchestrator();

  const selected = new DeterministicMockAdapter('provider_category_selected_runtime');
  selected.failureMode = '500';
  selected.maxFailuresBeforeSuccess = 1;
  orchestrator.registerAdapter(selected);
  orchestrator.registerModel({
    providerId: 'provider_category_selected_runtime',
    modelId: 'narrative-selected-runtime',
    displayName: 'Narrative Selected Runtime',
    pool: 'creative',
    capabilities: ['text_generation', 'structured_output'],
    contextWindow: 64000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 20,
    userPriority: 100,
    roleEligibility: ['narrative.generate'],
    fallbackEligibility: true,
  });

  const unrelated = new DeterministicMockAdapter('provider_unrelated_runtime');
  unrelated.cannedResponses.set(
    'narrative.generate',
    JSON.stringify({ narrative: ['UNRELATED'] })
  );
  orchestrator.registerAdapter(unrelated);
  orchestrator.registerModel({
    providerId: 'provider_unrelated_runtime',
    modelId: 'combat-only-runtime',
    displayName: 'Combat Only Runtime',
    pool: 'reasoning',
    capabilities: ['reasoning'],
    contextWindow: 64000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 5,
    userPriority: 999,
    roleEligibility: ['combat.tactics'],
    fallbackEligibility: true,
  });

  orchestrator.setCategoryModelOverride(
    'narration',
    'provider_category_selected_runtime::narrative-selected-runtime'
  );
  orchestrator.pinModelForTask('narrative.generate', null);
  orchestrator.setFallbackChain('narrative.generate', [
    'provider_category_selected_runtime::narrative-selected-runtime',
    'provider_deterministic_emergency::emergency-fallback-local',
  ]);

  try {
    const result = await orchestrator.executeTaskGeneration(
      'narrative.generate',
      'Return a valid narrative turn.',
      undefined,
      {
        timeoutMs: 1000,
      }
    );

    assert.equal(result.modelId, 'emergency-fallback-local');
    assert.equal(result.source, 'DETERMINISTIC_FALLBACK');
    assert.equal(
      result.attemptsTrail.some((attempt) => attempt.modelId === 'combat-only-runtime'),
      false
    );
  } finally {
    orchestrator.setCategoryModelOverride('narration', null as any);
  }
});


test('OpenRouter extracts assistant text from structured content-part arrays', async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        model: 'provider/content-parts',
        choices: [{
          finish_reason: 'stop',
          message: {
            content: [
              { type: 'output_text', text: 'Part one ' },
              { type: 'text', text: 'part two' },
            ],
          },
        }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  ) as typeof fetch;

  try {
    const adapter = new OpenRouterAdapter();
    const result = await adapter.generate('character.extract', 'Return structured text.', {
      modelId: 'provider/content-parts',
    });
    assert.equal(result.text, 'Part one part two');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('OpenRouter reports tool-call-only responses distinctly instead of mislabeling them as empty', async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        model: 'provider/tool-only',
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          },
        }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  ) as typeof fetch;

  try {
    const adapter = new OpenRouterAdapter();
    await assert.rejects(
      () => adapter.generate('character.extract', 'Return structured text.', {
        modelId: 'provider/tool-only',
      }),
      /tool call\(s\).*no assistant text/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('OpenRouter reports reasoning-only responses distinctly so the orchestrator can fall back', async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        model: 'provider/reasoning-only',
        choices: [{
          finish_reason: 'stop',
          message: {
            content: null,
            reasoning: 'Internal reasoning exists, but there is no final answer.',
          },
        }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  ) as typeof fetch;

  try {
    const adapter = new OpenRouterAdapter();
    await assert.rejects(
      () => adapter.generate('character.extract', 'Return structured JSON.', {
        modelId: 'provider/reasoning-only',
      }),
      /reasoning\/thinking data.*no final assistant content/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('OpenRouter empty-content diagnostics include returned model, choice count, content shape, and finish reason', async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        model: 'provider/empty-content',
        choices: [{
          finish_reason: 'length',
          message: { content: null },
        }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  ) as typeof fetch;

  try {
    const adapter = new OpenRouterAdapter();
    await assert.rejects(
      () => adapter.generate('character.extract', 'Return structured JSON.', {
        modelId: 'provider/empty-content',
      }),
      /model=provider\/empty-content.*choices=1.*content=null.*finish_reason=length/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
