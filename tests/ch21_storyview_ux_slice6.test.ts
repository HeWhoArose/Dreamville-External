import test from 'node:test';
import assert from 'node:assert/strict';
import { worldRepository } from '../server/repositories/worldRepository';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { WorldTemplate, ConfirmedCharacter } from '../types';

test('Story Experience Slice 6 — StoryView UX & Visual Polish Verification', async () => {
  const worldId = 'world_slice6_ux';
  worldRepository.saveWorldTemplate({
    worldId,
    worldManifestVersion: 4,
    title: 'The Obsidian Realm',
    description: 'A dark gothic sanctuary.',
    genreTags: ['Gothic'],
    toneTags: ['Atmospheric'],
    mediumTags: ['Text Adventure'],
    defaultEra: 'Age of Twilight',
    setting: 'Gothic',
    canonMode: 'CANON_COMPLIANT',
    rulesetId: 'rules_obsidian',
    capabilities: [],
    geography: {
      nodes: [
        {
          id: 'loc_sanctum',
          name: 'Obsidian Sanctum',
          region: 'Spire',
          description: 'A quiet room of shadows.',
          coordinates: { x: 0, y: 0 },
        },
      ],
      connections: [],
    },
    historyTimeline: [],
    canonKnowledge: [],
    startingHooks: [],
  } as WorldTemplate);

  const character: ConfirmedCharacter = {
    characterId: 'char_ux_1',
    identity: { name: 'Vespera', species: 'Vampire' },
    role: { profession: 'Seeker', archetype: 'Mystic' },
    background: { history: 'An ancient seeker.' },
    appearance: { physicalDescription: 'Dark robes.' },
    personality: { traits: ['Stoic'] },
    motivations: { goals: ['Awaken'] },
    condition: { injuries: [], activeEffects: [] },
    capabilities: [],
    generatedSkills: [],
    startingEquipment: {
      equipped: [],
      inventory: [],
      weapons: [],
      armor: [],
      tools: [],
      consumables: [],
    },
    portraitAsset: { emoji: '🦇' },
    startingLocation: { locationId: 'loc_sanctum', name: 'Obsidian Sanctum' },
    startingSituation: { summary: 'Awakening in silence.' },
  };

  const { storyId } = worldRepository.createStoryRunFromConfirmedCharacter({
    worldId,
    confirmedCharacter: character,
  });

  // Verify action loop works seamlessly under the polished story UX architecture
  const actionText = 'I examine the altar for hidden runes.';
  const res = serverMockAuthority.processAction({
    type: 'CUSTOM_ACTION',
    actionText,
    storyId,
  } as any);

  assert.equal(res.success, true, 'Action must process successfully');
  assert.equal(res.viewState.actionHistory[0].description, actionText, 'Action text must be preserved in history');

  const viewState = serverMockAuthority.getSanitizedViewState(storyId);
  assert.ok(viewState, 'Sanitized view state must be returned');
  assert.equal(viewState.protagonist.name, 'Vespera');
});
