import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComicScenePrompt } from '../server/services/comicSceneGenerator';

test('current-scene comic prompt is anchored to the latest turn only', () => {
  const result = buildComicScenePrompt({
    worldTitle: 'The Sunken Spire',
    location: {
      name: 'Pressure-Sealed Archive',
      region: 'Undersea Trench',
      description: 'A steel chamber with bioluminescent windows.',
      ambientSensory: 'Cold pressure hum and blue light.',
    },
    protagonist: {
      name: 'Unknown Dark Knight',
      role: 'Protagonist',
      portraitEmoji: '🛡️',
    },
    visibleCharacters: [
      { name: 'The Archivist', role: 'NPC', title: 'Keeper' },
    ],
    latestAction: {
      description: 'I raise my blade toward the Archivist.',
      narrativeResponse: 'The blade catches the chamber light as the Archivist steps back.',
      checkResult: {
        success: true,
        total: 18,
        difficultyClass: 14,
        consequence: { summary: 'The Archivist retreats one step.' },
      },
    },
    activeDialogue: {
      speakerName: 'The Archivist',
      text: 'Wait.',
    },
  });

  assert.equal(result.panelCount, 4);
  assert.equal(result.aspectRatio, '16:9');
  assert.match(result.prompt, /latest turn only/i);
  assert.match(result.prompt, /raise my blade/i);
  assert.match(result.prompt, /Archivist retreats one step/i);
  assert.match(result.prompt, /Do NOT use previous dialogue/i);
  assert.match(result.prompt, /no flashbacks/i);
  assert.match(result.prompt, /failed actions as successful/i);
  assert.doesNotMatch(result.prompt, /old opening scene/i);
});

test('comic generation context contract does not require dialogue history', () => {
  const result = buildComicScenePrompt({
    location: { name: 'Current Hall' },
    protagonist: { name: 'Hero' },
    visibleCharacters: [],
    latestAction: {
      description: 'I open the gate.',
      narrativeResponse: 'The gate groans open.',
    },
    activeDialogue: null,
  });

  assert.match(result.prompt, /Current location: Current Hall/i);
  assert.match(result.prompt, /Immediate player action: I open the gate/i);
  assert.doesNotMatch(result.prompt, /dialogueHistory/i);
});
