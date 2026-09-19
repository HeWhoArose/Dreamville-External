import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStoryMenu } from '../src/components/storyContext/storyNavigationModel';
import { compileProviderNeutralPrompt } from '../src/components/common/imageAssetTypes';
import { COMPENDIUM_CATEGORIES } from '../src/components/compendium/compendiumTypes';
import { INITIAL_COMPENDIUM_ITEMS } from '../src/components/compendium/compendiumData';

test('Phase 1.5 — Story Navigation Menu Composition (INVESTIGATION ruleset without active combat hides combat)', () => {
  const menu = deriveStoryMenu({
    rules: 'INVESTIGATION',
    genre: 'Sci-Fi',
    hasActiveCombat: false,
  });

  const hasCombat = menu.some((entry) => entry.id === 'combat');
  assert.equal(hasCombat, false, 'Combat should be hidden for INVESTIGATION ruleset when combat is inactive');

  const hasStory = menu.some((entry) => entry.id === 'story');
  assert.equal(hasStory, true, 'Story View should be present');
});

test('Phase 1.5 — Story Navigation Menu Composition (FULL_DND shows combat when active)', () => {
  const menu = deriveStoryMenu({
    rules: 'FULL_DND',
    hasActiveCombat: true,
  });

  const combatEntry = menu.find((entry) => entry.id === 'combat');
  assert.ok(combatEntry, 'Combat entry should exist');
  assert.equal(combatEntry?.badge, 'COMBAT', 'Combat entry should be badged COMBAT');
});

test('Phase 1.5 — Provider-Neutral Prompt Compiler produces structured engine prompt', () => {
  const prompt = compileProviderNeutralPrompt({
    slotId: 'test_world_01',
    slotType: 'world_cover',
    title: 'Aethelgard High Sanctum',
    setting: 'Dark fantasy gothic citadel with glowing purple ether spires',
    mood: 'epic and mysterious',
  });

  assert.ok(prompt.includes('Aethelgard High Sanctum'), 'Prompt contains title');
  assert.ok(prompt.includes('Dark fantasy gothic citadel'), 'Prompt contains setting');
  assert.ok(prompt.includes('Constraints: No modern artifacts'), 'Prompt enforces negative constraints');
});

test('Phase 1.5 — Compendium maintains 7 canonical categories', () => {
  assert.equal(COMPENDIUM_CATEGORIES.length, 7, 'Compendium should have exactly 7 categories');
  const ids = COMPENDIUM_CATEGORIES.map((c) => c.id);
  assert.ok(ids.includes('characters'));
  assert.ok(ids.includes('equipment'));
  assert.ok(ids.includes('powers'));
  assert.ok(ids.includes('npcs'));
  assert.ok(ids.includes('creatures'));
  assert.ok(ids.includes('worlds'));
  assert.ok(ids.includes('visuals'));
});

test('Phase 1.5 — Compendium dataset holds initial entries across categories', () => {
  assert.ok(INITIAL_COMPENDIUM_ITEMS.length >= 7, 'Compendium should hold sample entries for all categories');
  const characterItems = INITIAL_COMPENDIUM_ITEMS.filter((item) => item.category === 'characters');
  assert.ok(characterItems.length > 0, 'Character entries exist');
});
