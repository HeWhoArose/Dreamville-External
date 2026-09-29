import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComicScenePrompt,
  resolveComicSceneVisualMoment,
} from '../server/services/comicSceneGenerator';

test('current-scene comic prompt is an exact single current visual moment', () => {
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
    },
    visibleCharacters: [
      { name: 'The Archivist', role: 'NPC', title: 'Keeper' },
    ],
    latestAction: {
      id: 'act_current',
      actionType: 'CUSTOM_ACTION',
      description: 'I take the ancient scroll and hide.',
      narrativeResponse: 'A sharp scrape echoes as the rusted guardian turns toward the empty plinth and searches the archive.',
      checkResult: {
        success: false,
        consequence: { summary: 'The failed decipher attempt yields no usable information.' },
      },
    },
    currentSituation: 'OLD OPENING SCENE THAT MUST NEVER BE USED FOR THIS TURN.',
    latestVisibleNarrative: 'OLD NARRATION THAT MUST NEVER BECOME THE CURRENT IMAGE.',
    activeDialogue: {
      speakerName: 'The Archivist',
      text: 'OLD DIALOGUE FROM AN EARLIER TURN.',
    },
  });

  assert.equal(result.panelCount, 1);
  assert.equal(result.sourceActionId, 'act_current');
  assert.equal(result.visualMoment.mode, 'CURRENT_TURN');
  assert.equal(result.visualMoment.primaryAction, 'I take the ancient scroll and hide.');
  assert.match(result.prompt, /Create ONE standalone comic-book illustration/i);
  assert.match(result.prompt, /I take the ancient scroll and hide/i);
  assert.match(result.prompt, /rusted guardian turns toward the empty plinth/i);
  assert.match(result.prompt, /canonical action failed/i);
  assert.match(result.prompt, /Use exactly 1 panel/i);
  assert.doesNotMatch(result.prompt, /OLD OPENING SCENE THAT MUST NEVER BE USED/i);
  assert.doesNotMatch(result.prompt, /OLD NARRATION THAT MUST NEVER BECOME THE CURRENT IMAGE/i);
  assert.doesNotMatch(result.prompt, /OLD DIALOGUE FROM AN EARLIER TURN/i);
  assert.doesNotMatch(result.prompt, /Panel 1: establish the exact current location/i);
  assert.doesNotMatch(result.prompt, /PANEL LOGIC/i);
});

test('committed turn completely suppresses opening-scene context', () => {
  const result = buildComicScenePrompt({
    location: { name: 'Lower Archive', region: 'Abyssal Trench' },
    protagonist: { name: 'Ael Drasil', role: 'Relic Researcher' },
    visibleCharacters: [{ name: 'Archive Guardian' }],
    latestAction: {
      id: 'act_hide',
      description: 'I move behind the broken pillar.',
      narrativeResponse: 'The guardian scans the plinth while Ael slips behind the pillar.',
    },
    currentSituation: 'Initial starting location with first-light atmosphere.',
    latestVisibleNarrative: 'The first scroll discovery from the opening scene.',
  });

  assert.equal(result.visualMoment.mode, 'CURRENT_TURN');
  assert.match(result.prompt, /move behind the broken pillar/i);
  assert.doesNotMatch(result.prompt, /Initial starting location with first-light atmosphere/i);
  assert.doesNotMatch(result.prompt, /first scroll discovery from the opening scene/i);
});

test('opening-state fallback is used only when there is no committed action', () => {
  const result = resolveComicSceneVisualMoment({
    location: { name: 'Starting Chamber' },
    protagonist: { name: 'Hero' },
    visibleCharacters: [],
    latestAction: undefined,
    currentSituation: 'The hero awakens in the starting chamber.',
  });

  assert.equal(result.mode, 'OPENING_STATE');
  assert.match(result.primaryAction, /hero awakens/i);
});

test('stale active dialogue is excluded from non-dialogue current-scene art', () => {
  const result = buildComicScenePrompt({
    worldTitle: 'Current World',
    location: { name: 'Current Hall' },
    protagonist: { name: 'Hero' },
    visibleCharacters: [{ name: 'Guard' }],
    latestAction: {
      id: 'act_strike',
      actionType: 'CUSTOM_ACTION',
      description: 'I strike the guard.',
      narrativeResponse: 'The guard staggers backward.',
    },
    activeDialogue: {
      speakerName: 'Guard',
      text: 'This was said on the previous turn.',
    },
  });

  assert.match(result.prompt, /I strike the guard/i);
  assert.doesNotMatch(result.prompt, /This was said on the previous turn/i);
});

test('dialogue is current only when the committed action is a dialogue choice', () => {
  const result = buildComicScenePrompt({
    location: { name: 'Current Hall' },
    protagonist: { name: 'Hero' },
    visibleCharacters: [{ name: 'Guide' }],
    latestAction: {
      id: 'act_dialogue',
      actionType: 'DIALOGUE_CHOICE',
      description: 'I answer the guide.',
      narrativeResponse: 'The guide listens carefully.',
    },
    activeDialogue: {
      speakerName: 'Guide',
      text: 'Why did you come here?',
    },
  });

  assert.match(result.prompt, /Current dialogue: Guide says:/i);
  assert.match(result.prompt, /Why did you come here/i);
});


test('current-turn visual cues create chronological panels without importing prior scenes', () => {
  const result = buildComicScenePrompt({
    location: { name: 'Lower Archive', region: 'Abyssal Trench' },
    protagonist: { name: 'Ael Drasil', role: 'Relic Researcher' },
    visibleCharacters: [{ name: 'Archive Guardian' }],
    latestAction: {
      id: 'act_dodge',
      actionType: 'CUSTOM_ACTION',
      description: 'I survive the attack and move behind cover.',
      narrativeResponse: 'A fireball screams past Ael\'s head. Ael dives behind the broken basalt pillar.',
      visualCues: [
        'A fireball screams past Ael\'s head, lighting the archive in orange as it narrowly misses.',
        'Ael dives behind the broken basalt pillar for cover.',
      ],
    },
    currentSituation: 'OLD OPENING SCENE MUST NOT APPEAR.',
    latestVisibleNarrative: 'OLD NARRATION MUST NOT APPEAR.',
  });

  assert.equal(result.panelCount, 2);
  assert.match(result.prompt, /Panel 1: depict ONLY this chronological visual beat/i);
  assert.match(result.prompt, /fireball screams past Ael/i);
  assert.match(result.prompt, /Panel 2: depict ONLY this chronological visual beat/i);
  assert.match(result.prompt, /dives behind the broken basalt pillar/i);
  assert.match(result.prompt, /Use exactly 2 panels/i);
  assert.doesNotMatch(result.prompt, /OLD OPENING SCENE MUST NOT APPEAR/i);
  assert.doesNotMatch(result.prompt, /OLD NARRATION MUST NOT APPEAR/i);
  assert.doesNotMatch(result.prompt, /previous image composition/i);
});

test('failed actions cannot be reinterpreted as success', () => {
  const result = buildComicScenePrompt({
    location: { name: 'Vault' },
    protagonist: { name: 'Rogue' },
    visibleCharacters: [{ name: 'Sentinel' }],
    latestAction: {
      id: 'act_failed',
      description: 'I bypass the sentinel.',
      narrativeResponse: 'The sentinel remains active.',
      checkResult: {
        success: false,
        consequence: { summary: 'The bypass attempt fails and the alarm remains active.' },
      },
    },
  });

  assert.match(result.prompt, /canonical action failed/i);
  assert.match(result.prompt, /alarm remains active/i);
  assert.match(result.prompt, /Never convert the failure into a success/i);
});
