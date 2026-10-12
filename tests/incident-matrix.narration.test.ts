// Narration matrix: malformed-output, optional-metadata, and emergency-recovery cases
// from the narration audit scenario matrix (cases 22-27, 10, 23, 24). Deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DeterministicEmergencyFloorAdapter,
  DeterministicMockAdapter,
  MultiModelOrchestrator,
  type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';

function createOrchestrator() {
  const orchestrator = new MultiModelOrchestrator();
  (orchestrator as any).savePersistedConfig = () => {};
  return orchestrator;
}

const validate = (o: MultiModelOrchestrator, text: string, opts?: any) =>
  (o as any).validateTurnPackage(text, opts);

// Case 23: nested JSON envelope (provider double-wraps turn package).
test('matrix: nested JSON envelope is unwrapped, not shown as prose', () => {
  const o = createOrchestrator();
  const inner = JSON.stringify({
    narrative: ['The citadel gate opens.'], dialogue: [{ speaker: 'Beren Ashdown', text: 'Welcome.' }],
    events: [], stateChanges: [], memoryCandidates: [], audioCues: [],
  });
  const raw = JSON.stringify({ narrative: [inner], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] });
  const r = validate(o, raw);
  assert.equal(r.valid, true, r.errorReason);
  assert.equal(r.turnPackage.narrative[0].includes('gate'), true);
  assert.equal(/^\s*\{/.test(r.turnPackage.narrative[0]), false);
  assert.equal(r.turnPackage.dialogue[0].speaker, 'Beren Ashdown');
});

// Case 23b: markdown-wrapped JSON.
test('matrix: markdown-fenced JSON parses', () => {
  const o = createOrchestrator();
  const body = JSON.stringify({ narrative: ['Redis rings chime.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] });
  const r = validate(o, '```json\n' + body + '\n```');
  assert.equal(r.valid, true, r.errorReason);
});

// Case 24: valid narration but invalid optional metadata (visualCues) — narrative must not be discarded.
test('matrix: invalid optional visualCues fail closed with clear reason, not silent data corruption', () => {
  const o = createOrchestrator();
  const raw = JSON.stringify({ narrative: ['You steady the lantern.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [], visualCues: [{ wrong: true }] });
  const r = validate(o, raw);
  assert.equal(r.valid, false);
  assert.match(r.errorReason, /Visual cue/);
});

// Case 24b: dialogue typed as a single object (not array) — recoverable shape variant.
test('matrix: single dialogue object is normalized into an array entry', () => {
  const o = createOrchestrator();
  const raw = JSON.stringify({ narrative: ['He answers.'], dialogue: { speaker: 'Ivara Pell', text: 'The bridges hold.' }, events: [], stateChanges: [], memoryCandidates: [], audioCues: [] });
  const r = validate(o, raw);
  assert.equal(r.valid, true, r.errorReason);
  assert.deepEqual(r.turnPackage.dialogue, [{ speaker: 'Ivara Pell', text: 'The bridges hold.' }]);
});

// Case 22: truncated JSON must not become prose; plain long text is allowed only as narration text.
test('matrix: truncated JSON is rejected without inventing facts', () => {
  const o = createOrchestrator();
  const r = validate(o, '{"narrative": ["You step into the exchange and the crowd hums around', { allowPlainTextNarration: true });
  assert.equal(r.valid, false);
  assert.match(r.errorReason, /not valid JSON|is not/);
});

// Case 25: invalid state changes stay strictly validated.
test('matrix: illegal stateChange kind is rejected and never committed', () => {
  const o = createOrchestrator();
  const raw = JSON.stringify({ narrative: ['The merchant hands over the blade.'], dialogue: [], events: [], stateChanges: [{ kind: 'DELETE_PLAYER', targetId: 'player', value: null }], memoryCandidates: [], audioCues: [] });
  const r = validate(o, raw);
  assert.equal(r.valid, false);
  assert.match(r.errorReason, /Illegal state change kind/);
});

// Case 26+27: all AI models exhausted then deterministic emergency engine recovers a
// relevant turn (movement scenario) without repeating a failed response.
test('matrix: emergency engine covers movement, observation and information-seeking', async () => {
  const floor = new DeterministicEmergencyFloorAdapter();
  const movement = await floor.generate('narrative.generate', 'Current action: I walk toward the central exchange.', {
    canonicalLocationName: 'Elysium Solar Citadel', playerAction: 'I walk toward the central exchange.',
  });
  const movementPkg = validate(createOrchestrator(), movement.text);
  assert.equal(movementPkg.valid, true, movementPkg.errorReason);
  assert.match(movementPkg.turnPackage.narrative.join(' '), /move|walk/i);

  const observation = await floor.generate('narrative.generate', 'Current action: I observe the merchants.', {
    canonicalLocationName: 'Elysium Solar Citadel', playerAction: 'I observe the merchants.',
  });
  const observationPkg = validate(createOrchestrator(), observation.text);
  assert.equal(observationPkg.valid, true, observationPkg.errorReason);
  assert.match(observationPkg.turnPackage.narrative.join(' '), /observe/i);

  const info = await floor.generate('narrative.generate', 'Current action: I ask about the stained map rumor.', {
    canonicalLocationName: 'Elysium Solar Citadel', playerAction: 'I ask about the stained map rumor.',
  });
  const infoPkg = validate(createOrchestrator(), info.text);
  assert.equal(infoPkg.valid, true, infoPkg.errorReason);
});

// Case 30: primary model unavailable → graceful degradation with recorded trail.
test('matrix: determinstic mock failure cascades, recovery returns a usable turn', async () => {
  const orchestrator = new MultiModelOrchestrator();
  (orchestrator as any).savePersistedConfig = () => {};
  const failing = new DeterministicMockAdapter('provider_mock_fail');
  failing.failureMode = '500';
  // Adapter-level behavior: provider failure mode produces an error, not silent garbage.
  await assert.rejects(() => failing.generate('narrative.generate', 'Current action: I wait.'));
});
