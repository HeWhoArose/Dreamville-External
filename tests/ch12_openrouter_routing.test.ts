import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenRouterAdapter, MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

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
