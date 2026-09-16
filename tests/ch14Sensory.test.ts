import { test } from 'node:test';
import * as assert from 'node:assert';
import { SensoryEngine } from '../server/domain/sensoryEngine';
import { CampaignArchiveService } from '../server/domain/campaignArchive';
import { worldRepository } from '../server/repositories/worldRepository';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

test('CH14: Voice Profile Persistence and Settings', () => {
  const sensoryEngine = new SensoryEngine();
  
  sensoryEngine.setVoiceProfile('story_1', {
    actorId: 'npc_maren',
    providerId: 'google_gemini',
    voiceId: 'gemini-voice-1',
    speed: 1.0,
    pitch: 1.0,
    styleHints: ['calm'],
    language: 'en-US',
    enabled: true
  });

  const profiles = sensoryEngine.getAllVoiceProfiles('story_1');
  assert.strictEqual(profiles.length, 1);
  assert.strictEqual(profiles[0].voiceId, 'gemini-voice-1');

  sensoryEngine.updateSettings('story_1', { sfxVolume: 0.5 });
  assert.strictEqual(sensoryEngine.getSettings('story_1').sfxVolume, 0.5);
});

test('CH14: Semantic Event Resolution', () => {
  const sensoryEngine = new SensoryEngine();
  const events = sensoryEngine.resolveAudioCuesToEvents(['The goblin lets out a loud shout', 'The player swings and lands a stab']);
  
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].type, 'SHOUT');
  assert.strictEqual(events[1].type, 'STAB');
  assert.strictEqual(events[1].hapticDirection, 'heavy');
});

test('CH14: Archive Persistence', () => {
  worldRepository.getSensoryEngine().updateSettings('default_story', { hapticIntensity: 'heavy' });
  const archive = CampaignArchiveService.createArchive({
    campaignId: 'test_camp',
    title: 'Test',
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
      settings: worldRepository.getSensoryEngine().getSettings('default_story'),
      voiceProfiles: worldRepository.getSensoryEngine().getAllVoiceProfiles('default_story')
    }
  });

  assert.ok(archive.partitions['canonical/sensory_config.json'], 'Archive should include sensory config');
  
  const result = worldRepository.restoreCampaignArchive(archive, 'restored_story');
  assert.strictEqual(result.success, true);
  
  const restoredSettings = worldRepository.getSensoryEngine().getSettings('restored_story');
  assert.strictEqual(restoredSettings.hapticIntensity, 'heavy');
});
