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
  assert.match(result.prompt, /CURRENT SCENE VISUAL BRIEF/i);
  assert.match(result.prompt, /PANEL LOGIC/i);
  assert.match(result.prompt, /Panel 1: establish the exact current location/i);
  assert.match(result.prompt, /no flashbacks/i);
  assert.match(result.prompt, /A failed action must remain visibly failed/i);
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
  assert.match(result.prompt, /Immediate action: I open the gate/i);
  assert.doesNotMatch(result.prompt, /dialogueHistory/i);
});


test('stale active dialogue is excluded from non-dialogue current-scene art', () => {
  const result = buildComicScenePrompt({
    worldTitle: 'Current World',
    location: { name: 'Current Hall' },
    protagonist: { name: 'Hero' },
    visibleCharacters: [{ name: 'Guard' }],
    latestAction: {
      actionType: 'CUSTOM_ACTION',
      description: 'I strike the guard.',
      narrativeResponse: 'The guard staggers backward.',
    },
    activeDialogue: {
      speakerName: 'Guard',
      text: 'This was said on the previous turn.',
    },
  });

  assert.match(result.prompt, /Immediate player action: I strike the guard/i);
  assert.match(result.prompt, /Immediate narration from the latest turn: The guard staggers backward/i);
  assert.doesNotMatch(result.prompt, /This was said on the previous turn/i);
});


test('adaptive panel planning uses fewer panels when the turn has only one visual beat', () => {
	const result = buildComicScenePrompt({
		location: { name: 'Abyssal Trench', description: 'A sealed structure rises from the dark water.' },
		protagonist: { name: 'The Ashen Knight' },
		visibleCharacters: [],
		latestAction: {
			actionType: 'CUSTOM_ACTION',
			description: 'I move toward the structure.',
			narrativeResponse: 'The knight approaches the sealed structure.',
		},
		activeDialogue: null,
	});

	assert.equal(result.panelCount, 2);
	assert.match(result.prompt, /VISUAL SCENE BRIEF/i);
	assert.match(result.prompt, /Panel 2: depict the immediate current action or dialogue beat/i);
	assert.doesNotMatch(result.prompt, /Invent additional story beats/i);
});

test('stale dialogue does not enter non-dialogue comic prompts', () => {
	const result = buildComicScenePrompt({
		location: { name: 'Current Hall' },
		protagonist: { name: 'Hero' },
		visibleCharacters: [{ name: 'Guard' }],
		latestAction: {
			actionType: 'CUSTOM_ACTION',
			description: 'I inspect the gate.',
			narrativeResponse: 'The gate shows fresh scratches.',
		},
		activeDialogue: {
			speakerName: 'Guard',
			text: 'This was from the previous turn.',
		},
	});

	assert.doesNotMatch(result.prompt, /previous turn/i);
});
