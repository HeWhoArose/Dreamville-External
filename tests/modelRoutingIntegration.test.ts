import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';
import fs from 'fs';
import path from 'path';

describe('MODEL ROUTING & TASK ASSIGNMENT OPERATIONAL INTEGRATION', () => {
  let orchestrator: MultiModelOrchestrator;
  const configFileName = (typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT)))
    ? 'orchestrator_config_test.json'
    : 'orchestrator_config.json';
  const configPath = path.join(process.cwd(), 'server', 'data', configFileName);

  beforeEach(() => {
    // Reset config file if present
    if (fs.existsSync(configPath)) {
      try {
        fs.unlinkSync(configPath);
      } catch (err) {
        // ignore
      }
    }
    orchestrator = new MultiModelOrchestrator();
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) {
      try {
        fs.unlinkSync(configPath);
      } catch (err) {
        // ignore
      }
    }
  });

  it('1. Model Registry: Seed models contain Gemini 3.6 Flash, Gemini 2.5 Pro, Gemini 2.5 Flash, and Emergency Floor', () => {
    const models = orchestrator.getAllModels();
    assert.ok(models.length >= 4);

    const proModel = models.find((m) => m.modelId === 'gemini-2.5-pro');
    assert.ok(proModel);
    assert.equal(proModel?.health, 'Unavailable');

    const flash25Model = models.find((m) => m.modelId === 'gemini-2.5-flash');
    assert.ok(flash25Model);
    assert.equal(flash25Model?.health, 'Throttled');

    const flash36Model = models.find((m) => m.modelId === 'gemini-3.6-flash');
    assert.ok(flash36Model);
    assert.equal(flash36Model?.health, 'Healthy');

    const floorModel = models.find((m) => m.modelId === 'emergency-fallback-local');
    assert.ok(floorModel);
    assert.equal(floorModel?.health, 'Healthy');
  });

  it('2. Model Readiness Truthfulness: Gemini 2.5 Pro is marked Unavailable, NOT Ready', () => {
    const proModel = orchestrator.getModel('google_gemini', 'gemini-2.5-pro');
    assert.equal(proModel?.accessStatus, 'unavailable');
    assert.equal(proModel?.health, 'Unavailable');
  });

  it('3. Pin Model For Task: Persists to disk and orchestrator memory', () => {
    orchestrator.pinModelForTask('narrative.generate', 'google_gemini::gemini-3.6-flash');
    
    assert.equal(orchestrator.getPinnedModelForTask('narrative.generate'), 'google_gemini::gemini-3.6-flash');
    assert.equal(orchestrator.getAllTaskPins()['narrative.generate'], 'google_gemini::gemini-3.6-flash');

    // Verify disk persistence
    assert.equal(fs.existsSync(configPath), true);
    const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(content.pins['narrative.generate'], 'google_gemini::gemini-3.6-flash');

    // Create new instance and verify reloaded pins
    const newOrchestrator = new MultiModelOrchestrator();
    assert.equal(newOrchestrator.getPinnedModelForTask('narrative.generate'), 'google_gemini::gemini-3.6-flash');
  });

  it('4. Role Eligibility & Select Best Model: Selects pinned healthy model if available', () => {
    orchestrator.pinModelForTask('character.dialogue', 'google_gemini::gemini-3.6-flash');
    const selected = orchestrator.selectBestModel('character.dialogue');
    assert.equal(selected?.selectedModel?.modelId, 'gemini-3.6-flash');
  });

  it('5. Fallback Chain: Skips unavailable gemini-2.5-pro and picks healthy model or emergency floor', () => {
    // If pinned model is unavailable (e.g. gemini-2.5-pro), selectBestModel falls back
    orchestrator.pinModelForTask('narrative.generate', 'google_gemini::gemini-2.5-pro');
    const selected = orchestrator.selectBestModel('narrative.generate');
    
    // Must NOT be gemini-2.5-pro because it's unavailable
    assert.notEqual(selected?.selectedModel?.modelId, 'gemini-2.5-pro');
    assert.ok(['gemini-3.6-flash', 'emergency-fallback-local'].includes(selected?.selectedModel?.modelId));
  });

  it('6. Real Connectivity Testbench: Returns truthful health result without crashing', { timeout: 15000 }, async () => {
    const testRes = await orchestrator.testModel('google_gemini', 'gemini-3.6-flash');
    assert.ok(testRes);
    assert.equal(typeof testRes.status, 'string');
    assert.equal(typeof testRes.latencyMs, 'number');

    const testProRes = await orchestrator.testModel('google_gemini', 'gemini-2.5-pro');
    assert.equal(testProRes.status, 'UNAVAILABLE');
    assert.ok(testProRes.message.includes('404'));
  });

  it('7. Emergency Floor Model: Always healthy and ready for failover', () => {
    const floor = orchestrator.getModel('provider_deterministic_emergency', 'emergency-fallback-local');
    assert.equal(floor?.health, 'Healthy');
    assert.equal(floor?.isEmergencyFloor, true);
  });
});
