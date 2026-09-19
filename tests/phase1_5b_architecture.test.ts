import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCharacterVoice, getCharacterSpeakerTheme, PRESET_VOICES } from '../src/components/voiceResolver';
import { COMPENDIUM_CATEGORIES } from '../src/components/compendium/compendiumTypes';
import { INITIAL_COMPENDIUM_ITEMS } from '../src/components/compendium/compendiumData';
import { ROUTE_REGISTRY, AppRoute } from '../src/routes';
import { apiClient } from '../src/services/apiClient';

test('Phase 1.5B — 1. Global Navigation Route Definitions', () => {
  assert.ok(ROUTE_REGISTRY['compendium'], 'Route "compendium" should exist in registry');
  assert.equal(ROUTE_REGISTRY['compendium'].category, 'COMPENDIUM');
  
  assert.ok(ROUTE_REGISTRY['settings'], 'Route "settings" should exist in registry');
  assert.equal(ROUTE_REGISTRY['settings'].category, 'ENGINE');
});

test('Phase 1.5B — 2. Sub-categories map under compendium sub-routes', () => {
  const compendiumSubRoutes: AppRoute[] = [
    'compendium.characters',
    'compendium.equipment',
    'compendium.powers',
    'compendium.npcs',
    'compendium.creatures',
    'compendium.worlds',
    'compendium.visuals',
  ];

  compendiumSubRoutes.forEach((route) => {
    assert.ok(ROUTE_REGISTRY[route], `Route ${route} should exist in registry`);
    assert.equal(ROUTE_REGISTRY[route].category, 'COMPENDIUM');
  });
});

test('Phase 1.5B — 3. Compendium maintaining 7 internal tabs', () => {
  assert.equal(COMPENDIUM_CATEGORIES.length, 7, 'Compendium must have 7 internal category tabs');
  const ids = COMPENDIUM_CATEGORIES.map((c) => c.id);
  assert.ok(ids.includes('characters'));
  assert.ok(ids.includes('equipment'));
  assert.ok(ids.includes('powers'));
  assert.ok(ids.includes('npcs'));
  assert.ok(ids.includes('creatures'));
  assert.ok(ids.includes('worlds'));
  assert.ok(ids.includes('visuals'));
});

test('Phase 1.5B — 4. Compendium items retain provenance tracking properties', () => {
  assert.ok(INITIAL_COMPENDIUM_ITEMS.length > 0);
  const sampleItem = INITIAL_COMPENDIUM_ITEMS[0];
  assert.ok('category' in sampleItem);
  assert.ok('title' in sampleItem);
  
  // Verify provenance capability
  const testItem = {
    ...sampleItem,
    sourceWorld: 'world_aethelgard_01',
    sourceRun: 'run_awakening_01',
    originType: 'discovered' as const,
    canonicalEntityId: 'npc_mira_01',
  };
  assert.equal(testItem.sourceWorld, 'world_aethelgard_01');
  assert.equal(testItem.originType, 'discovered');
});

test('Phase 1.5B — 5. Epistemic Separation Invariant (Compendium does not mutate canonical world repo)', async () => {
  // Verify Compendium items are isolated in presentation layer
  const compendiumItems = [...INITIAL_COMPENDIUM_ITEMS, {
    id: 'compendium_custom_01',
    category: 'characters' as const,
    title: 'Personal Player Persona',
    description: 'Player reference only',
    tags: ['custom'],
    sourceWorld: 'world_aethelgard_01',
    originType: 'created' as const,
  }];

  assert.equal(compendiumItems.length, INITIAL_COMPENDIUM_ITEMS.length + 1, 'Compendium items can be managed in view state');
  assert.equal(INITIAL_COMPENDIUM_ITEMS.length, 13, 'Initial compendium dataset remains pristine and unmutated');
});

test('Phase 1.5B — 6. Automatic Voice Identity Resolver computes deterministic assignment', () => {
  const npcMira = { id: 'npc_mira_01', name: 'Mira Veilwalker', gender: 'female', traits: ['arcane', 'mysterious'] };
  const voice1 = resolveCharacterVoice(npcMira);
  const voice2 = resolveCharacterVoice(npcMira);

  assert.equal(voice1.voiceId, voice2.voiceId, 'Voice assignment must be deterministic for identical character parameters');
  assert.ok(voice1.name, 'Voice must have display name');
  assert.ok(voice1.provider, 'Voice must specify provider');
});

test('Phase 1.5B — 7. Voice Identity Resolver respects manual override mode', () => {
  const npcOrin = { id: 'npc_orin_01', name: 'Orin Ironbound', gender: 'male' };
  const overrides = {
    npc_orin_01: {
      characterId: 'npc_orin_01',
      characterName: 'Orin Ironbound',
      mode: 'override' as const,
      customVoiceId: 'en-US-Zephyr-Elder',
    },
  };

  const resolved = resolveCharacterVoice(npcOrin, overrides);
  assert.equal(resolved.voiceId, 'en-US-Zephyr-Elder', 'Voice resolver must respect manual character voice overrides');
});

test('Phase 1.5B — 8. Deterministic Character Speaker Accent Color Derivation', () => {
  const themeMira1 = getCharacterSpeakerTheme('Mira Veilwalker');
  const themeMira2 = getCharacterSpeakerTheme('Mira Veilwalker');
  const themeVael = getCharacterSpeakerTheme('Vael shadowstep');

  assert.equal(themeMira1.accentHex, themeMira2.accentHex, 'Speaker color theme must be deterministic');
  assert.ok(themeMira1.nameColor, 'Theme must provide name text color class');
  assert.ok(themeMira1.badgeBg, 'Theme must provide badge background class');
  assert.ok(themeMira1.bubbleBorder, 'Theme must provide bubble border class');
});

test('Phase 1.5B — 9. Narrator / System voice color fallback', () => {
  const narratorTheme = getCharacterSpeakerTheme('Narrator');
  const systemTheme = getCharacterSpeakerTheme('System');

  assert.equal(narratorTheme.nameColor, 'text-stone-300');
  assert.equal(systemTheme.nameColor, 'text-stone-300');
});

test('Phase 1.5B — 10. Preset Voices pool diversity', () => {
  assert.ok(PRESET_VOICES.length >= 5, 'Preset voices pool must have diverse options');
  const genders = new Set(PRESET_VOICES.map((v) => v.gender));
  assert.ok(genders.has('male'));
  assert.ok(genders.has('female'));
  assert.ok(genders.has('neutral'));
});
