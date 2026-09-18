import { describe, it, beforeEach } from 'node:test';
import * as assert from 'assert';
import { SensoryEngine } from '../server/domain/sensoryEngine';

describe('CH14 - Sensory Engine Epistemic Security (DEF-CH14-04)', () => {
  let engine: SensoryEngine;

  beforeEach(() => {
    engine = new SensoryEngine();
  });

  const baseContext = {
    listenerPosition: { x: 5, y: 5 },
    entities: [
      { name: 'player', x: 5, y: 5 },
      { name: 'visible_goblin', x: 8, y: 5 },
      { name: 'loc_cavern', x: 10, y: 10 }
    ]
  };

  it('TEST A: Visible source -> cue emitted', () => {
    const res = engine.resolveAudioCuesToEvents(['shout from the visible_goblin'], baseContext);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].suppressed, undefined);
    assert.ok(res[0].audioDirection);
    assert.strictEqual(res[0].audioDirection?.radius, 13);
  });

  it('TEST B: Hidden source -> cue suppressed', () => {
    const res = engine.resolveAudioCuesToEvents(['shout from the hidden_dragon'], baseContext);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].suppressed, true);
    assert.strictEqual(res[0].audioDirection, undefined);
    assert.strictEqual(res[0].intensity, 0);
  });

  it('TEST C: Undiscovered location -> cue suppressed', () => {
    const res = engine.resolveAudioCuesToEvents(['rumble at loc_unknown_abyss'], baseContext);
    assert.strictEqual(res[0].suppressed, true);
  });

  it('TEST D: Nonexistent source -> cue suppressed', () => {
    const res = engine.resolveAudioCuesToEvents(['whisper from a ghost'], baseContext);
    assert.strictEqual(res[0].suppressed, true);
  });

  it('TEST E: Malformed source -> cue suppressed', () => {
    const res = engine.resolveAudioCuesToEvents(['!!!&&&'], baseContext);
    assert.strictEqual(res[0].suppressed, true);
  });

  it('TEST F: Authorized combat source -> cue emitted', () => {
    const res = engine.resolveAudioCuesToEvents(['stab the visible_goblin'], baseContext);
    assert.strictEqual(res[0].suppressed, undefined);
    assert.ok(res[0].audioDirection);
  });

  it('TEST G: Authorized geography source -> cue emitted', () => {
    const res = engine.resolveAudioCuesToEvents(['echo in loc_cavern'], baseContext);
    assert.strictEqual(res[0].suppressed, undefined);
    assert.ok(res[0].audioDirection);
  });

  it('TEST H: Exact same cue executed twice -> deterministic result', () => {
    const res1 = engine.resolveAudioCuesToEvents(['shout from the visible_goblin'], baseContext);
    const res2 = engine.resolveAudioCuesToEvents(['shout from the visible_goblin'], baseContext);
    assert.strictEqual(res1[0].audioDirection?.radius, res2[0].audioDirection?.radius);
    assert.strictEqual(res1[0].audioDirection?.volume, res2[0].audioDirection?.volume);
  });
  
  it('Spatial Math regression checks', () => {
    // Distance 0
    let res = engine.resolveAudioCuesToEvents(['player'], baseContext);
    assert.strictEqual(res[0].audioDirection?.volume, 1.0);
    assert.strictEqual(res[0].audioDirection?.radius, 10);
    
    // Distance 3 (visible_goblin is at 8, 5; listener at 5,5)
    res = engine.resolveAudioCuesToEvents(['visible_goblin'], baseContext);
    assert.strictEqual(res[0].audioDirection?.volume, 1.0); // max(0.1, 1 / max(1, 3/5)) -> 1 / max(1, 0.6) = 1
    assert.strictEqual(res[0].audioDirection?.radius, 13);
    
    // Distance 7.07 (loc_cavern is at 10,10; listener at 5,5 -> dx=5, dy=5 -> dist=7.07)
    res = engine.resolveAudioCuesToEvents(['loc_cavern'], baseContext);
    assert.ok(res[0].audioDirection?.volume! < 1.0); // 1 / (7.07 / 5) = 1 / 1.414 = 0.707
    assert.ok(res[0].audioDirection?.volume! > 0.7);
    assert.ok(res[0].audioDirection?.radius! > 17);
  });
});
