// Incident reproduction: Turn #4 NARRATION_AI_UNAVAILABLE (Qwen invalid dialogue + emergency floor rejected).
// Deterministic: no external API. Uses an InMemoryWorldRepository + mock adapters emulating
// (1) Qwen returning dialogue entries with missing speaker, (2) the emergency floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DeterministicEmergencyFloorAdapter,
  DeterministicMockAdapter,
  MultiModelOrchestrator,
  type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

const PLAYER_ACTION = 'Excuse me sir but what do you think of thyroid Citadel, do you like it here';

function modelRecord(providerId: string, modelId: string): ModelRegistryRecord {
  return {
    providerId, modelId, displayName: modelId, pool: 'fast',
    capabilities: ['text_generation', 'structured_output'],
    contextWindow: 128000, health: 'Healthy', quota: 'Healthy', latencyMs: 5,
    roleEligibility: ['narrative.generate', 'narrative.review'],
    // remaining required record fields default-provided below via helper in main test file style
  } as ModelRegistryRecord;
}

test('INCIDENT repro: malformed dialogue + emergency floor chain behaves per contract', async (t) => {
  // Step 1: pre-fix parser behavior — this is what the LIVE (pre-83211daa) build failed with.
  // The pre-fix parser required strict speaker/text keys; a Qwen response using aliases fails.
  const qwenLike = JSON.stringify({
    narrative: ['Beren Ashdown considers your question.'],
    dialogue: [
      { name: 'Beren Ashdown', content: 'It has its appeal. The place is impressive, though I am still making up my mind about living or working here.' },
    ],
    events: [], stateChanges: [], memoryCandidates: [], audioCues: [],
  });
  const orchestrator = new MultiModelOrchestrator(new InMemoryWorldRepository());
  (orchestrator as any).savePersistedConfig = () => {};
  const strictParse = (orchestrator as any).validateTurnPackage(qwenLike);
  assert.equal(strictParse.valid, true, 'HEAD must normalize {name, content} alias dialogue: ' + (strictParse.errorReason || 'ok'));
  assert.equal(strictParse.turnPackage?.dialogue?.[0]?.speaker, 'Beren Ashdown');
  assert.equal(strictParse.turnPackage?.dialogue?.[0]?.text?.includes('impressive'), true);

  // Step 2: emergency floor fallback must now answer the social question with grounded,
  // quoting narration (fixes the information-continuity rejection path).
  const emergency = new DeterministicEmergencyFloorAdapter();
  const res = await emergency.generate('narrative.generate',
    'Visible entities: Beren Ashdown [NPC]. Current action: ' + PLAYER_ACTION,
    { canonicalLocationName: 'Elysium Solar Citadel', playerAction: PLAYER_ACTION });
  const floor = (orchestrator as any).validateTurnPackage(res.text, { allowPlainTextNarration: true });
  assert.equal(floor.valid, true, floor.errorReason || 'ok');
  const narrationText = floor.turnPackage!.narrative.join(' ');
  assert.match(narrationText, /Beren Ashdown/);
  assert.match(narrationText, /[\u201c\u201d]/);      // quoted
  assert.equal((floor.turnPackage!.dialogue || []).length > 0, true);

  // Step 3: information-continuity guard accepts the emergency output.
  const info = (orchestrator as any).validateNarrativeInformationContinuity(narrationText, PLAYER_ACTION, undefined);
  assert.equal(info.valid, true, info.errorReason || 'ok');
});
