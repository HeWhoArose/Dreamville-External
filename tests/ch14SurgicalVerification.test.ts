import { test } from 'node:test';
import * as assert from 'node:assert';
import { worldRepository } from '../server/repositories/worldRepository';
import { SensoryEngine, AudioSettings } from '../server/domain/sensoryEngine';
import { SfxRegistry } from '../server/domain/sfxRegistry';
import { CampaignArchiveService } from '../server/domain/campaignArchive';

test('DEF-CH14-01: Direct Speech Synthesis & Transcription Do NOT Mutate Narrative History', async () => {
  const storyId = 'test_speech_mutation_story';
  worldRepository.getWorldClock(storyId); // Ensure story initialized
  const orchestrator = worldRepository.getAiOrchestrator();

  const initialNarrative = orchestrator.exportNarrativeHistory(storyId);
  const initialCheckpoints = orchestrator.getAllCheckpoints(storyId);

  // Synthesize speech directly
  const synthRes = await orchestrator.synthesizeSpeech({
    storyId,
    text: 'Greetings, traveler of the whispering stars.',
  });
  assert.strictEqual(synthRes.success, true);
  assert.ok(synthRes.audioResultBase64, 'Should return audioBase64 from adapter');

  // Transcribe audio directly
  const transcribeRes = await orchestrator.transcribeAudio({
    storyId,
    audioBase64: synthRes.audioResultBase64 || '',
  });
  assert.strictEqual(transcribeRes.success, true);
  assert.ok(transcribeRes.text, 'Should return transcribed text');

  // Verify zero mutation of narrative history and checkpoints
  const afterNarrative = orchestrator.exportNarrativeHistory(storyId);
  const afterCheckpoints = orchestrator.getAllCheckpoints(storyId);

  assert.strictEqual(
    afterNarrative.length,
    initialNarrative.length,
    'Narrative history length must remain unchanged'
  );
  assert.strictEqual(
    afterCheckpoints.length,
    initialCheckpoints.length,
    'Continuation checkpoints count must remain unchanged'
  );
});

test('DEF-CH14-02 & DEF-CH14-03: Campaign Archive Sensory State & Multi-Story Isolation', () => {
  const sensoryEngine = worldRepository.getSensoryEngine();
  const storyA = 'story_isolate_a';
  const storyB = 'story_isolate_b';

  // Configure Story A
  sensoryEngine.updateSettings(storyA, {
    sfxVolume: 0.35,
    hapticIntensity: 'light',
    masterAudio: 0.7,
  });
  sensoryEngine.setVoiceProfile(storyA, {
    actorId: 'npc_eloria',
    providerId: 'google_gemini',
    voiceId: 'gemini-female-1',
    speed: 1.1,
    pitch: 0.95,
    styleHints: ['mysterious'],
    language: 'en-US',
    enabled: true,
  });

  // Configure Story B with distinct values
  sensoryEngine.updateSettings(storyB, {
    sfxVolume: 0.9,
    hapticIntensity: 'heavy',
    masterAudio: 1.0,
  });
  sensoryEngine.setVoiceProfile(storyB, {
    actorId: 'npc_garrick',
    providerId: 'google_gemini',
    voiceId: 'gemini-male-2',
    speed: 0.9,
    pitch: 0.8,
    styleHints: ['gruff'],
    language: 'en-US',
    enabled: true,
  });

  // Export Story A
  const archiveA = CampaignArchiveService.createArchive({
    campaignId: 'campaign_story_a',
    title: 'Story A Campaign',
    worldState: {},
    playerState: {},
    inventoryState: {},
    npcsState: [],
    chronicleState: {},
    narrativeState: [],
    capabilitiesState: {},
    combatState: {},
    memoriesState: [],
    livingWorldState: {},
    sensoryState: {
      settings: sensoryEngine.getSettings(storyA),
      voiceProfiles: sensoryEngine.getAllVoiceProfiles(storyA),
    },
  });

  assert.ok(
    archiveA.partitions['canonical/sensory_config.json'],
    'Archive must contain canonical/sensory_config.json'
  );

  // Restore archiveA into a new story C
  const storyC = 'story_isolate_c';
  const restoreRes = worldRepository.restoreCampaignArchive(archiveA, storyC);
  assert.strictEqual(restoreRes.success, true);

  // Verify Story C got Story A's settings
  const settingsC = sensoryEngine.getSettings(storyC);
  assert.strictEqual(settingsC.sfxVolume, 0.35);
  assert.strictEqual(settingsC.hapticIntensity, 'light');
  assert.strictEqual(settingsC.masterAudio, 0.7);

  // CRITICAL (DEF-CH14-03): Story B settings and profiles MUST NOT have been overwritten or wiped
  const settingsB = sensoryEngine.getSettings(storyB);
  assert.strictEqual(
    settingsB.sfxVolume,
    0.9,
    'Story B sfxVolume must remain preserved after Story C restore'
  );
  assert.strictEqual(
    settingsB.hapticIntensity,
    'heavy',
    'Story B hapticIntensity must remain preserved'
  );
  const profileB = sensoryEngine.getVoiceProfile(storyB, 'npc_garrick');
  assert.ok(profileB, 'Story B voice profile must remain preserved');
  assert.strictEqual(profileB?.voiceId, 'gemini-male-2');
});

test('DEF-CH14-04: Adversarial Epistemic Suppression Leak Prevention', () => {
  const engine = new SensoryEngine();
  const context = {
    listenerPosition: { x: 5, y: 5 },
    entities: [
      { name: 'player', x: 5, y: 5 },
      { name: 'visible_guide', x: 7, y: 5 },
    ],
  };

  // Adversarial cue with unauthorized hidden entity "Malakor"
  const adversarialCue = 'whisper from hidden assassin Malakor in the shadows';
  const resolved = engine.resolveAudioCuesToEvents([adversarialCue], context);

  assert.strictEqual(resolved.length, 1);
  const event = resolved[0];

  assert.strictEqual(event.suppressed, true, 'Event must be suppressed');
  assert.strictEqual(event.intensity, 0, 'Suppressed event intensity must be 0');
  assert.strictEqual(event.audioDirection, undefined, 'Suppressed event audioDirection must be undefined');

  // Verify NO field in event contains secret entity name or raw cue text
  const serialized = JSON.stringify(event);
  assert.strictEqual(
    serialized.includes('Malakor'),
    false,
    'Suppressed event MUST NOT leak entity name "Malakor"'
  );
  assert.strictEqual(
    serialized.includes('hidden assassin'),
    false,
    'Suppressed event MUST NOT leak "hidden assassin"'
  );
  assert.strictEqual(
    serialized.includes(adversarialCue),
    false,
    'Suppressed event MUST NOT leak raw cue string'
  );
  assert.strictEqual(
    event.visualDirection,
    undefined,
    'visualDirection must be undefined for suppressed events'
  );
});

test('DEF-CH14-05: Typed SFX Registry Resolution', () => {
  assert.ok(SfxRegistry.has('combat.stab'));
  assert.ok(SfxRegistry.has('magic.heal'));
  assert.ok(SfxRegistry.has('ui.quest_complete'));

  const stabDef = SfxRegistry.resolve('combat.stab');
  assert.ok(stabDef);
  assert.strictEqual(stabDef?.priority, 'HIGH');
  assert.strictEqual(stabDef?.defaultHaptic, 'heavy');

  const engine = new SensoryEngine();
  const typedEvents = engine.resolveAudioCuesToEvents([
    {
      eventId: 'evt_combat_1',
      type: 'STAB',
      audio: {
        cue: 'combat.stab',
        priority: 'HIGH',
      },
      intensity: 1.0,
    },
  ]);

  assert.strictEqual(typedEvents.length, 1);
  assert.strictEqual(typedEvents[0].audio?.cue, 'combat.stab');
  assert.strictEqual(typedEvents[0].audio?.priority, 'HIGH');
  assert.strictEqual(typedEvents[0].hapticDirection, 'heavy');
});

test('R12: Derived Speech Cache with Invalidation', () => {
  const engine = new SensoryEngine();
  const cache = engine.getSpeechCache();

  const key1 = cache.computeKey('Hello world', {
    actorId: 'player',
    providerId: 'google_gemini',
    voiceId: 'v1',
    speed: 1.0,
    pitch: 1.0,
    styleHints: ['calm'],
    language: 'en-US',
    enabled: true,
  });

  cache.set(key1, 'base64_audio_data_123');
  assert.strictEqual(cache.get(key1), 'base64_audio_data_123');

  // Key changes when speed or pitch changes
  const key2 = cache.computeKey('Hello world', {
    actorId: 'player',
    providerId: 'google_gemini',
    voiceId: 'v1',
    speed: 1.2,
    pitch: 1.0,
    styleHints: ['calm'],
    language: 'en-US',
    enabled: true,
  });
  assert.notStrictEqual(key1, key2);

  // Updating engine settings invalidates cache
  engine.updateSettings('story_cache_test', { sfxVolume: 0.2 });
  assert.strictEqual(cache.get(key1), null, 'Cache must be cleared on settings update');
});
