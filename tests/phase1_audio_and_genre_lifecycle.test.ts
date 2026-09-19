import { test } from 'node:test';
import * as assert from 'node:assert';
import { SensoryEngine } from '../server/domain/sensoryEngine';
import { worldRepository } from '../server/repositories/worldRepository';
import { worldSynthesisService } from '../server/services/worldSynthesisService';

test('Phase 1 Audio Lifecycle: Audio engine settings and lifecycle management', () => {
  const sensoryEngine = new SensoryEngine();
  const storyId = 'audio_lifecycle_story';

  // Invariant 1: Default master audio is respected and muted state can be cleanly toggled
  const defaultSettings = sensoryEngine.getSettings(storyId);
  assert.ok(defaultSettings, 'Default sensory settings should exist');
  assert.strictEqual(typeof defaultSettings.masterAudio, 'number');

  // Update volume and mute settings
  sensoryEngine.updateSettings(storyId, {
    masterAudio: 0.0,
    masterMuted: true,
    sfxVolume: 0.2,
    ambienceVolume: 0.0,
  });

  const updatedSettings = sensoryEngine.getSettings(storyId);
  assert.strictEqual(updatedSettings.masterAudio, 0.0);
  assert.strictEqual(updatedSettings.masterMuted, true);
  assert.strictEqual(updatedSettings.ambienceVolume, 0.0);
  assert.strictEqual(updatedSettings.sfxVolume, 0.2);

  // Invariant 2: Audio cues resolve to structured events without runaway state
  const cues = sensoryEngine.resolveAudioCuesToEvents([
    'A door creaks slowly',
    'Thunder rolls in the distance',
  ]);
  assert.ok(Array.isArray(cues));
});

test('Phase 1 Genre Decoupling: Discovery Preferences ≠ World Genre ≠ Ruleset', async () => {
  // Test that world synthesis explicitly preserves designated genre tags independently from ruleset or tone
  const synthesized = await worldSynthesisService.synthesizeWorldFromPremise({
    naturalLanguagePremise: 'A neon-lit cybernetic orbital spire governed by corporate AI.',
    title: 'Aegis Spire',
    genreTags: ['Cyberpunk', 'Sci-Fi'],
    toneTags: ['Grimdark'],
    dndRulesMode: 'FULL_DND',
    storyMode: 'PROTAGONIST',
  });

  assert.ok(synthesized.worldId, 'Synthesized world should have a unique worldId');
  assert.strictEqual(synthesized.title, 'Aegis Spire');
  assert.ok(synthesized.genreTags?.includes('Cyberpunk'), 'World genre tags must contain Cyberpunk');
  assert.ok(synthesized.toneTags?.includes('Grimdark'), 'World tone tags must contain Grimdark');
  assert.strictEqual(synthesized.rules, 'FULL_DND', 'Rules mode must be isolated and preserved on template');
  assert.strictEqual(synthesized.playstyle, 'PROTAGONIST', 'Story mode must be isolated and preserved on template');
});

test('Phase 1 World Manifest: Genre tags are first-class on world templates', () => {
  const worlds = worldRepository.getAllWorldTemplates();
  assert.ok(worlds.length > 0, 'World repository should have curated templates');

  for (const w of worlds) {
    assert.ok(w.worldId, 'World must have worldId');
    assert.ok(w.title, 'World must have title');
    assert.ok(Array.isArray(w.genreTags), `World ${w.title} must have genreTags array`);
    assert.ok(w.genreTags.length > 0, `World ${w.title} must have at least one genre tag`);
  }
});
