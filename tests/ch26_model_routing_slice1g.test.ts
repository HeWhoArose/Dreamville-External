import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

// Mock fs.existsSync and fs.writeFileSync to isolate test configurations
const originalExistsSync = fs.existsSync;
fs.existsSync = (path: any) => {
  if (typeof path === 'string' && path.includes('orchestrator_config')) {
    return false;
  }
  return originalExistsSync(path);
};

const originalWriteFileSync = fs.writeFileSync;
fs.writeFileSync = (path: any, data: any, options: any) => {
  if (typeof path === 'string' && path.includes('orchestrator_config')) {
    return;
  }
  return originalWriteFileSync(path, data, options);
};

describe('Model Routing Slice 1G - Fallback Chain Management & Real Model Connection', () => {
  after(() => {
    fs.existsSync = originalExistsSync;
    fs.writeFileSync = originalWriteFileSync;
  });
  it('initializes default fallback chains and allows custom fallback chain updates', () => {
    const orchestrator = new MultiModelOrchestrator();
    const defaultChain = orchestrator.getFallbackChain('narrative.generate');
    
    assert.ok(defaultChain);
    assert.ok(defaultChain.length >= 2);
    assert.ok(defaultChain[0].includes('gemini-3.5-flash') || defaultChain[0].includes('gemini-3.6-flash'));
    assert.ok(defaultChain[defaultChain.length - 1].includes('emergency-fallback-local'));

    // Update fallback chain
    const customChain = [
      'google_gemini::gemini-3.6-flash',
      'google_gemini::gemini-2.5-flash',
      'google_gemini::gemini-1.5-pro-long',
      'provider_deterministic_emergency::emergency-fallback-local',
    ];
    orchestrator.setFallbackChain('narrative.generate', customChain);

    const retrieved = orchestrator.getFallbackChain('narrative.generate');
    assert.deepEqual(retrieved, customChain);
  });

  it('selects models respecting configured task fallback chains and preserves emergency floor safety layer', () => {
    const orchestrator = new MultiModelOrchestrator();
    orchestrator.pinModelForTask('narrative.generate', null);
    const customChain = [
      'google_gemini::gemini-3.6-flash',
      'google_gemini::gemini-2.5-flash',
    ];
    orchestrator.setFallbackChain('narrative.generate', customChain);

    const selection = orchestrator.selectBestModel('narrative.generate', { contextTokens: 1000 });
    assert.ok(selection.selectedModel);
    assert.equal(selection.selectedModel.modelId, 'gemini-3.5-flash');
    // Emergency floor should be automatically appended if missing and eligible
    assert.ok(selection.fallbacks.some(f => f.isEmergencyFloor));
  });
});
