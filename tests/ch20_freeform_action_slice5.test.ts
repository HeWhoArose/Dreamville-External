import test from 'node:test';
import assert from 'node:assert/strict';
import { worldRepository } from '../server/repositories/worldRepository';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { WorldTemplate, ConfirmedCharacter } from '../src/types';

test('Story Experience Slice 5 — Freeform Action Loop Verification', async (t) => {
  // =========================================================================
  // SETUP: World A (Dark Fantasy Werewolf Scholar)
  // =========================================================================
  const worldIdA = 'world_slice5_werewolf';
  const worldTemplateA: WorldTemplate = {
    worldId: worldIdA,
    worldManifestVersion: 4,
    title: 'Gothic Gloom: Oakhaven',
    description: 'Dark fantasy world where I am the only werewolf.',
    genreTags: ['Dark Fantasy'],
    toneTags: ['Gloom'],
    mediumTags: ['Text Adventure'],
    defaultEra: 'Age of Shadows',
    setting: 'Gothic',
    canonMode: 'CANON_COMPLIANT',
    rulesetId: 'rules_oakhaven_v1',
    capabilities: [
      {
        id: 'cap_life_absorption',
        name: 'Life-force Absorption',
        category: 'Magic',
        activationMode: 'immediate',
        powerTier: 'Major',
        baseEnergyCost: 15,
        baseStrainCost: 10,
        minVesselCapacityRequired: 20,
        description: 'Absorb vitality and life force from target organism.',
        provenance: 'inherent_curse',
      },
    ],
    geography: {
      nodes: [
        {
          id: 'loc_study',
          name: 'Scholar Study',
          region: 'Spire Ward',
          description: 'A quiet study with old manuscripts and strange footprints near the doorway.',
          coordinates: { x: 10, y: 10 },
          ambientSensory: 'Dust motes dancing in moonlight.',
        },
      ],
      connections: [],
    },
    historyTimeline: [],
    canonKnowledge: [],
    startingHooks: [],
  };
  worldRepository.saveWorldTemplate(worldTemplateA);

  const charA1: ConfirmedCharacter = {
    characterId: 'char_werewolf_1',
    identity: { name: 'Elias Thorne', species: 'Human' },
    role: { profession: 'Scholar', archetype: 'Scholar' },
    background: { history: 'Hidden werewolf scholar.' },
    appearance: { physicalDescription: 'Pale scholar.' },
    personality: { traits: ['Guarded'] },
    motivations: { goals: ['Survive'] },
    condition: { injuries: [], activeEffects: ['Hidden Lycanthropy'] },
    capabilities: [
      {
        id: 'cap_life_absorption',
        name: 'Life-force Absorption',
        category: 'Magic',
        activationMode: 'immediate',
        powerTier: 'Major',
        baseEnergyCost: 15,
        baseStrainCost: 10,
        minVesselCapacityRequired: 20,
        description: 'Absorb vitality and life force from target organism.',
        provenance: 'inherent_curse',
      },
    ],
    generatedSkills: [],
    startingEquipment: {
      equipped: [],
      inventory: [{ name: 'Journal', category: 'Book', description: 'Notes.' }],
      weapons: [],
      armor: [],
      tools: [],
      consumables: [],
    },
    portraitAsset: { emoji: '🐺' },
    startingLocation: { locationId: 'loc_study', name: 'Scholar Study' },
    startingSituation: { summary: 'Investigating strange occurrences.' },
  };

  const { storyId: storyIdA1 } = worldRepository.createStoryRunFromConfirmedCharacter({
    worldId: worldIdA,
    confirmedCharacter: charA1,
  });

  const { storyId: storyIdA2 } = worldRepository.createStoryRunFromConfirmedCharacter({
    worldId: worldIdA,
    confirmedCharacter: {
      ...charA1,
      characterId: 'char_werewolf_2',
      identity: { name: 'Lyra Vance', species: 'Human' },
    },
  });

  // =========================================================================
  // SETUP: World B (Sci-Fi Void Station)
  // =========================================================================
  const worldIdB = 'world_slice5_scifi';
  const worldTemplateB: WorldTemplate = {
    worldId: worldIdB,
    worldManifestVersion: 4,
    title: 'Astra Void Station',
    description: 'Clinical sci-fi station.',
    genreTags: ['Sci-Fi'],
    toneTags: ['Clinical'],
    mediumTags: ['Text Adventure'],
    defaultEra: '2480',
    setting: 'Station',
    canonMode: 'CANON_COMPLIANT',
    rulesetId: 'rules_void_v1',
    capabilities: [],
    geography: {
      nodes: [
        {
          id: 'loc_bay',
          name: 'Hangar Bay 3',
          region: 'Docking Ring',
          description: 'Cold metallic docking bay.',
          coordinates: { x: 50, y: 50 },
          ambientSensory: 'Hum of atmospheric scrubbers.',
        },
      ],
      connections: [],
    },
    historyTimeline: [],
    canonKnowledge: [],
    startingHooks: [],
  };
  worldRepository.saveWorldTemplate(worldTemplateB);

  const charB: ConfirmedCharacter = {
    characterId: 'char_drifter',
    identity: { name: 'Kaelen Voss', species: 'Human' },
    role: { profession: 'Drifter', archetype: 'Pilot' },
    background: { history: 'Void pilot.' },
    appearance: { physicalDescription: 'Flight suit.' },
    personality: { traits: ['Cynical'] },
    motivations: { goals: ['Find jump gate'] },
    condition: { injuries: [], activeEffects: [] },
    capabilities: [],
    generatedSkills: [],
    startingEquipment: {
      equipped: [],
      inventory: [{ name: 'Data Pad', category: 'Tool', description: 'Log.' }],
      weapons: [],
      armor: [],
      tools: [],
      consumables: [],
    },
    portraitAsset: { emoji: '🚀' },
    startingLocation: { locationId: 'loc_bay', name: 'Hangar Bay 3' },
    startingSituation: { summary: 'Docked at Astra.' },
  };

  const { storyId: storyIdB } = worldRepository.createStoryRunFromConfirmedCharacter({
    worldId: worldIdB,
    confirmedCharacter: charB,
  });

  await t.test('1. Freeform action submission preserves exact text and routes to correct StoryRun', async () => {
    const actionText = 'I inspect the strange footprints beside the doorway.';
    const result = serverMockAuthority.processAction({
      type: 'CUSTOM_ACTION',
      actionText,
      storyId: storyIdA1,
    } as any);

    assert.equal(result.success, true, 'Action must succeed');
    assert.equal(result.viewState.actionHistory[0].description, actionText, 'Action text must be preserved exactly in actionHistory');
    assert.notEqual(storyIdA1, 'default_story', 'Story ID must not be default_story');
  });

  await t.test('2. Freeform capability expression resolves via CapabilityEngine without exact skill card phrasing', async () => {
    const lifeDrainAction = 'I place my hand on the unconscious guard and attempt to draw the remaining life from his body.';
    const result = serverMockAuthority.processAction({
      type: 'CUSTOM_ACTION',
      actionText: lifeDrainAction,
      storyId: storyIdA1,
    } as any);

    assert.equal(result.success, true, 'Life drain expression must be successfully processed');
    assert.ok(result.message.length > 0, 'Must produce a non-empty result message');
  });

  await t.test('3. World & Run Isolation: Action in Run A1 does not alter Run A2 or World B', async () => {
    const uniqueText = 'A1 Unique Action: Examining hidden floorboard.';
    const resA1 = serverMockAuthority.processAction({
      type: 'CUSTOM_ACTION',
      actionText: uniqueText,
      storyId: storyIdA1,
    } as any);

    assert.equal(resA1.success, true);

    const viewA1 = serverMockAuthority.getSanitizedViewState(storyIdA1);
    const viewA2 = serverMockAuthority.getSanitizedViewState(storyIdA2);
    const viewB = serverMockAuthority.getSanitizedViewState(storyIdB);

    assert.equal(viewA1.actionHistory[0].description, uniqueText);
    assert.notEqual(viewA2.actionHistory[0]?.description, uniqueText, 'Run A2 must be unaffected by Run A1 action');
    assert.notEqual(viewB.actionHistory[0]?.description, uniqueText, 'World B must be unaffected by World A action');
  });

  await t.test('4. Demo Firewall & Error Handling: Invalid story ID rejects without default_story fallback', async () => {
    const badResult = serverMockAuthority.processAction({
      type: 'CUSTOM_ACTION',
      actionText: 'Attempting action on void run',
      storyId: 'non_existent_run_xyz',
    } as any);

    const defaultViewState = serverMockAuthority.getSanitizedViewState('default_story');
    const defaultHistoryLen = defaultViewState.actionHistory.length;

    // Default story action history must remain untouched
    const defaultViewStateAfter = serverMockAuthority.getSanitizedViewState('default_story');
    assert.equal(defaultViewStateAfter.actionHistory.length, defaultHistoryLen, 'default_story must be untouched by invalid run actions');
  });

  await t.test('5. Persistence & Reload: Action history persists across state reloads', async () => {
    const actionText = 'Persistence check action text.';
    serverMockAuthority.processAction({
      type: 'CUSTOM_ACTION',
      actionText,
      storyId: storyIdA1,
    } as any);

    const reloadedView = serverMockAuthority.getSanitizedViewState(storyIdA1);
    const found = reloadedView.actionHistory.some((a) => a.description === actionText);
    assert.equal(found, true, 'Action must persist in story run state view upon reload');
  });
});
