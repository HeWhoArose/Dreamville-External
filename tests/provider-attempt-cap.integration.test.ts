import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiModelOrchestrator, DeterministicMockAdapter } from '../server/domain/aiOrchestrator';
import type { ModelRegistryRecord, ProviderGenerateOptions, ProviderGenerateResult, TaskId } from '../server/domain/aiOrchestrator';
import { AiTurnCallBudget } from '../server/domain/aiTurnCallBudget';

/**
 * Live run (2026-11-23): one turn made 8-14 real OpenRouter requests because a configured
 * fallback chain was walked end to end. A turn must never spend more than the cap.
 */
class AlwaysFailingAdapter extends DeterministicMockAdapter {
  public attempts = 0;
  public async generate(_task: TaskId, _prompt: string, _options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    this.attempts += 1;
    throw new Error('500 upstream server error');
  }
}

function model(providerId: string, modelId: string, priority: number): ModelRegistryRecord {
  return {
    providerId, modelId, displayName: modelId, pool: 'creative',
    capabilities: ['text_generation', 'structured_output', 'creative_writing'], contextWindow: 128000,
    health: 'Healthy', quota: 'Healthy', latencyMs: 1, userPriority: priority,
    roleEligibility: ['narrative.generate'], fallbackEligibility: true, accessStatus: 'accessible', lifecycleState: 'active',
    supportedInputTypes: ['text'], supportedOutputTypes: ['text', 'json'], hasStructuredOutput: true,
  } as unknown as ModelRegistryRecord;
}

test('a six-model failing chain makes at most the per-task cap of real requests in one turn', async () => {
  const orchestrator = new MultiModelOrchestrator();
  const adapter = new AlwaysFailingAdapter('provider_cap_fail');
  const keys: string[] = [];
  for (let i = 0; i < 6; i++) {
    orchestrator.registerModel(model(adapter.providerId, `fail-${i}`, 100 - i));
    keys.push(`${adapter.providerId}::fail-${i}`);
  }
  orchestrator.registerAdapter(adapter);
  orchestrator.setFallbackChain('narrative.generate', [...keys, 'provider_deterministic_emergency::emergency-fallback-local']);

  const budget = new AiTurnCallBudget();
  await assert.rejects(() => orchestrator.executeTaskGeneration('narrative.generate', 'Write a beat.', undefined, {
    turnBudget: budget,
    allowDeterministicFallback: false,
  }));

  assert.ok(adapter.attempts <= 4, `expected at most 4 real requests, got ${adapter.attempts}`);
  assert.ok(adapter.attempts >= 1);
  const snapshot = budget.snapshot();
  assert.equal(snapshot.providerAttemptsByTask['narrative.generate'], adapter.attempts);
  assert.ok(snapshot.blockedTasks.some((entry) => /provider attempt cap reached/i.test(entry.reason)), 'cap hit must be reported');
});

test('without a turn budget the chain behaves as before (no cap is imposed on callers that do not opt in)', async () => {
  const orchestrator = new MultiModelOrchestrator();
  const adapter = new AlwaysFailingAdapter('provider_nocap_fail');
  const keys: string[] = [];
  for (let i = 0; i < 6; i++) {
    orchestrator.registerModel(model(adapter.providerId, `fail-${i}`, 100 - i));
    keys.push(`${adapter.providerId}::fail-${i}`);
  }
  orchestrator.registerAdapter(adapter);
  orchestrator.setFallbackChain('narrative.generate', [...keys, 'provider_deterministic_emergency::emergency-fallback-local']);
  await assert.rejects(() => orchestrator.executeTaskGeneration('narrative.generate', 'Write a beat.', undefined, { allowDeterministicFallback: false }));
  assert.ok(adapter.attempts >= 5, `uncapped callers still walk the chain, got ${adapter.attempts}`);
});
