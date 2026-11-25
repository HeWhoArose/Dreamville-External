import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiModelOrchestrator, DeterministicMockAdapter } from '../server/domain/aiOrchestrator';
import type { ModelRegistryRecord, ProviderGenerateOptions, ProviderGenerateResult, TaskId } from '../server/domain/aiOrchestrator';
import { AiTurnCallBudget } from '../server/domain/aiTurnCallBudget';

/**
 * Live run (2026-11-24, Gemini 3.1 Flash Lite): a one-model chain lost whole turns to a single
 * task-validation rejection. A reachable model gets one corrective retry that names the rejection.
 */
class ScriptedAdapter extends DeterministicMockAdapter {
  public prompts: string[] = [];
  constructor(id: string, private readonly replies: Array<string | Error>) { super(id); }
  public async generate(_task: TaskId, prompt: string, _options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    this.prompts.push(prompt);
    const reply = this.replies[Math.min(this.prompts.length - 1, this.replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return { text: reply, source: 'AI_PRIMARY', providerId: this.providerId, modelId: 'only-model' } as unknown as ProviderGenerateResult;
  }
}

function setup(replies: Array<string | Error>) {
  const orchestrator = new MultiModelOrchestrator();
  const adapter = new ScriptedAdapter('provider_retry_test', replies);
  orchestrator.registerModel({
    providerId: adapter.providerId, modelId: 'only-model', displayName: 'only-model', pool: 'creative',
    capabilities: ['text_generation', 'structured_output', 'creative_writing'], contextWindow: 128000,
    health: 'Healthy', quota: 'Healthy', latencyMs: 1, userPriority: 100,
    roleEligibility: ['narrative.generate'], fallbackEligibility: true, accessStatus: 'accessible', lifecycleState: 'active',
    supportedInputTypes: ['text'], supportedOutputTypes: ['text', 'json'], hasStructuredOutput: true,
  } as unknown as ModelRegistryRecord);
  orchestrator.registerAdapter(adapter);
  orchestrator.setFallbackChain('narrative.generate', [`${adapter.providerId}::only-model`, 'provider_deterministic_emergency::emergency-fallback-local']);
  return { orchestrator, adapter };
}

const validate = (text: string) => text.includes('GOOD') ? { valid: true } : { valid: false, errorReason: 'Micro beat is too long.' };

test('a validation rejection on a one-model chain is retried once with the rejection reason', async () => {
  const { orchestrator, adapter } = setup(['bad', 'GOOD answer']);
  const result = await orchestrator.executeTaskGeneration('narrative.generate', 'Write a beat.', undefined, {
    allowDeterministicFallback: false, validateResponse: validate,
  } as any);
  assert.equal(result.text, 'GOOD answer');
  assert.equal(adapter.prompts.length, 2);
  assert.doesNotMatch(adapter.prompts[0], /PREVIOUS ANSWER WAS REJECTED/);
  assert.match(adapter.prompts[1], /PREVIOUS ANSWER WAS REJECTED: Micro beat is too long/);
});

test('the corrective retry happens once only: two bad answers still fail the turn', async () => {
  const { orchestrator, adapter } = setup(['bad', 'still bad', 'GOOD answer']);
  await assert.rejects(() => orchestrator.executeTaskGeneration('narrative.generate', 'Write a beat.', undefined, {
    allowDeterministicFallback: false, validateResponse: validate,
  } as any));
  assert.equal(adapter.prompts.length, 2);
});

test('a persistent transport failure is not retried as a validation failure and stops after one extra try', async () => {
  const { orchestrator, adapter } = setup([new Error('503 high demand')]);
  await assert.rejects(() => orchestrator.executeTaskGeneration('narrative.generate', 'Write a beat.', undefined, {
    allowDeterministicFallback: false, validateResponse: validate, turnBudget: new AiTurnCallBudget(),
  } as any));
  assert.ok(adapter.prompts.length <= 2);
  adapter.prompts.forEach((p) => assert.doesNotMatch(p, /REJECTED/));
});

test('a single transient transport failure on the last candidate is retried once', async () => {
  const { orchestrator, adapter } = setup([new Error('503 high demand'), 'GOOD after retry']);
  const result = await orchestrator.executeTaskGeneration('narrative.generate', 'Write a beat.', undefined, {
    allowDeterministicFallback: false, validateResponse: validate, turnBudget: new AiTurnCallBudget(),
  } as any);
  assert.equal(result.text, 'GOOD after retry');
  assert.equal(adapter.prompts.length, 2);
  assert.doesNotMatch(adapter.prompts[1], /REJECTED/, 'transport retries carry no rejection feedback');
});

test('a turn-budgeted call waits out a short cooldown on a one-model route instead of failing instantly', async () => {
  const { orchestrator, adapter } = setup(['GOOD after cooldown']);
  const key = `${adapter.providerId}::only-model`;
  const model = (orchestrator as any).models.get(key);
  (orchestrator as any).ensureRuntimeStatus(model).cooldownUntil = Date.now() + 800;
  const started = Date.now();
  const result = await orchestrator.executeTaskGeneration('narrative.generate', 'Write a beat.', undefined, {
    allowDeterministicFallback: false, validateResponse: validate, turnBudget: new AiTurnCallBudget(),
  } as any);
  assert.equal(result.text, 'GOOD after cooldown');
  assert.ok(Date.now() - started >= 700, 'it must actually have waited for the cooldown');
  assert.equal(adapter.prompts.length, 1);
});
