import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

/**
 * Live OpenRouter run (2026-11-23) showed `ling-3.0-flash:free` and `qwen3.8-27b:free`
 * answering 404 "unavailable for free". These tests lock in the fix:
 * defaults no longer reference them, stale persisted configs are migrated, and a
 * provider-confirmed "no longer available" model stops being retried every turn.
 */
const RETIRED = ['openrouter::inclusionai/ling-3.0-flash:free', 'openrouter::qwen/qwen3.8-27b:free'];
const REPLACEMENT = 'openrouter::nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
const FREE_ROUTER = 'openrouter::openrouter/free';
const TASKS = ['narrative.generate', 'narrative.review', 'character.dialogue', 'intent.interpret', 'memory.extract'] as const;

test('default routes no longer reference retired free models and keep the free router', () => {
  const orchestrator = new MultiModelOrchestrator();
  for (const task of TASKS) {
    const chain = orchestrator.getFallbackChain(task);
    for (const retired of RETIRED) assert.equal(chain.includes(retired), false, `${task} still routes to ${retired}`);
    assert.equal(chain.length, new Set(chain).size, `${task} chain has duplicate entries`);
  }
  for (const task of TASKS) assert.equal(orchestrator.getFallbackChain(task).includes(FREE_ROUTER), false, 'random free router must not be used (consistency policy)');
  assert.ok(orchestrator.getFallbackChain('narrative.generate').includes(REPLACEMENT));
  assert.ok(orchestrator.getModel('openrouter', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'), 'replacement must be a registered model');
  assert.equal(orchestrator.getModel('openrouter', 'inclusionai/ling-3.0-flash:free'), undefined);
  assert.equal(orchestrator.getModel('openrouter', 'qwen/qwen3.8-27b:free'), undefined);
});

test('a stale persisted config is migrated to the free router without duplicates', () => {
  const configPath = path.resolve(process.cwd(), 'server', 'data', 'orchestrator_config_test.json');
  const previous = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : null;
  const previousFlag = process.env.DREAMVILLE_TEST_LOAD_PERSISTED_CONFIG;
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      pins: { 'narrative.generate': 'openrouter::inclusionai/ling-3.0-flash:free' },
      fallbackChains: {
        'narrative.generate': [
          'groq::qwen/qwen3.8-27b',
          'openrouter::inclusionai/ling-3.0-flash:free',
          'openrouter::nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
          'openrouter::qwen/qwen3.8-27b:free',
        ],
      },
      categoryOverrides: {},
      overrides: [],
      customModels: [
        { providerId: 'openrouter', modelId: 'inclusionai/ling-3.0-flash:free', displayName: 'Ling (stale)', pool: 'creative',
          capabilities: ['text_generation'], contextWindow: 8192, health: 'Healthy', quota: 'Healthy', latencyMs: 1, userPriority: 1,
          roleEligibility: ['narrative.generate'], supportedInputTypes: ['text'], supportedOutputTypes: ['text'] },
      ],
    }), 'utf-8');
    process.env.DREAMVILLE_TEST_LOAD_PERSISTED_CONFIG = '1';
    const orchestrator = new MultiModelOrchestrator();
    const chain = orchestrator.getFallbackChain('narrative.generate');
    for (const retired of RETIRED) assert.equal(chain.includes(retired), false);
    assert.equal(chain.filter((key) => key === REPLACEMENT).length, 1, 'replacement must appear exactly once');
    assert.equal(chain.includes('openrouter::dots-studio/dots-3-note-preview:free'), true, 'retired qwen route maps to its replacement');
    assert.equal(chain.length, new Set(chain).size, 'no duplicates after migration');
    assert.equal(orchestrator.getPinnedModelForTask('narrative.generate'), REPLACEMENT);
    assert.equal(orchestrator.getModel('openrouter', 'inclusionai/ling-3.0-flash:free'), undefined, 'stale custom model must not be re-registered');
  } finally {
    if (previousFlag === undefined) delete process.env.DREAMVILLE_TEST_LOAD_PERSISTED_CONFIG;
    else process.env.DREAMVILLE_TEST_LOAD_PERSISTED_CONFIG = previousFlag;
    if (previous === null) fs.rmSync(configPath, { force: true });
    else fs.writeFileSync(configPath, previous, 'utf-8');
  }
});

test('the tracked orchestrator_config.json has no retired routes', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'server', 'data', 'orchestrator_config.json'), 'utf-8'));
  for (const [task, chain] of Object.entries<string[]>(config.fallbackChains || {})) {
    for (const retired of RETIRED) assert.equal(chain.includes(retired), false, `${task} chain contains ${retired}`);
    assert.equal(chain.length, new Set(chain).size, `${task} chain has duplicates`);
  }
});

test('a provider-confirmed "unavailable for free" 404 puts the model on a long cooldown; a plain 5xx does not', () => {
  const orchestrator: any = new MultiModelOrchestrator();
  const dead = orchestrator.getModel('openrouter', 'google/gemma-4-31b-it:free');
  assert.ok(dead);
  const before = Date.now();
  orchestrator.recordProviderFailure(
    dead, 'narrative.generate',
    new Error('This model is unavailable for free. The paid version is available now - use this slug instead: x/y'),
    before,
  );
  const status = orchestrator.ensureRuntimeStatus(dead);
  assert.ok(status.cooldownUntil && status.cooldownUntil - before >= 5 * 60 * 60 * 1000, 'expected multi-hour cooldown');
  assert.equal(orchestrator.isModelInCooldown?.(dead) ?? true, true);

  const router = orchestrator.getModel('openrouter', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free');
  orchestrator.recordProviderFailure(router, 'narrative.generate', new Error('503 upstream unavailable'), Date.now());
  const transient = orchestrator.ensureRuntimeStatus(router);
  assert.ok(!transient.cooldownUntil || transient.cooldownUntil - Date.now() <= 60_000, 'transient failures keep the short backoff');
});
