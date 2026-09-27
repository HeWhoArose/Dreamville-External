import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository } from '../server/repositories/worldRepository';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

test('OOC: selectBestModel always yields an eligible model or emergency floor', () => {
  const orchestrator = new MultiModelOrchestrator();
  const selection = orchestrator.selectBestModel('ooc.respond');
  assert.ok(selection.selectedModel, 'Must have a selectedModel');
  assert.ok(selection.selectedModel.modelId, 'Must have a modelId');
  assert.ok(selection.fallbacks.length >= 0, 'Fallbacks array must exist');
});

test('OOC: selectBestModel falls back to emergency floor when all models are marked Unavailable', () => {
  const orchestrator = new MultiModelOrchestrator();
  for (const model of orchestrator.getAllModels()) {
    if (!model.isEmergencyFloor) {
      model.health = 'Unavailable';
    }
  }
  const selection = orchestrator.selectBestModel('ooc.respond');
  assert.equal(selection.selectedModel.isEmergencyFloor, true);
  assert.equal(selection.selectedModel.modelId, 'emergency-fallback-local');
  assert.ok(selection.selectedModel.roleEligibility.includes('ooc.respond'));
});

test('OOC: isCandidateUsable returns true for emergency floor on ooc.respond', () => {
  const orchestrator = new MultiModelOrchestrator();
  const emergency = orchestrator.getAllModels().find((m) => m.isEmergencyFloor);
  assert.ok(emergency, 'Emergency model must exist');
  assert.equal(orchestrator.isCandidateUsable(emergency, 'ooc.respond'), true);
});

test('OOC: executeTaskGeneration produces valid response without throwing even when providers unavailable', async () => {
  const orchestrator = new MultiModelOrchestrator();
  for (const model of orchestrator.getAllModels()) {
    if (!model.isEmergencyFloor) {
      model.health = 'Unavailable';
    }
  }
  const result = await orchestrator.executeTaskGeneration(
    'ooc.respond',
    'What abilities does my character have?',
    'You are DreamBook OOC.'
  );
  assert.ok(result.text, 'Must return non-empty text');
  assert.equal(result.source, 'DETERMINISTIC_FALLBACK');
  assert.equal(result.modelId, 'emergency-fallback-local');
  const parsed = JSON.parse(result.text);
  assert.ok(parsed.response, 'Parsed payload must contain response text');
});
