import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GildedDiceCard,
  gildedBannerText,
  gildedDiceSides,
  gildedKeptIndex,
  gildedShapeFor,
  resolveGildedOutcome,
} from '../src/components/common/GildedDiceCard';
import { CANONICAL_DICE_THEMES, isCanonicalDiceTheme } from '../src/data/diceThemes';
import { getDiceThemePreset } from '../src/components/common/diceThemes';
import type { RollRecord } from '../src/types';

const h = React.createElement;

function roll(overrides: Partial<RollRecord> = {}): RollRecord {
  return {
    rollId: 'r1', rulesetVersion: 'test', formula: '1d20+1', individualDice: [20], modifier: 1, total: 21,
    isCriticalSuccess: false, isCriticalFailure: false, timestamp: 0, ...overrides,
  } as RollRecord;
}

test('theme: the gilded card is a canonical, selectable dice theme with its own preset', () => {
  assert.ok(isCanonicalDiceTheme('GILDED_CARD'));
  assert.equal(CANONICAL_DICE_THEMES.find((theme) => theme.id === 'GILDED_CARD')?.mode, 'CARD');
  assert.equal(getDiceThemePreset('GILDED_CARD').mode, 'CARD');
  assert.equal(getDiceThemePreset('GILDED_CARD').customColorset.outline, '#fbbf24', 'gold edges');
});

test('outcome: a natural 20 or 1 decides alone; otherwise the total meets the difficulty class or does not', () => {
  assert.equal(resolveGildedOutcome({ total: 21, isCriticalSuccess: true, isCriticalFailure: false }, 13), 'CRITICAL_SUCCESS');
  assert.equal(resolveGildedOutcome({ total: 2, isCriticalSuccess: false, isCriticalFailure: true }, 5), 'CRITICAL_FAILURE');
  assert.equal(resolveGildedOutcome({ total: 13, isCriticalSuccess: false, isCriticalFailure: false }, 13), 'SUCCESS', 'meeting the DC succeeds');
  assert.equal(resolveGildedOutcome({ total: 12, isCriticalSuccess: false, isCriticalFailure: false }, 13), 'FAILURE');
  assert.equal(resolveGildedOutcome({ total: 12, isCriticalSuccess: false, isCriticalFailure: false }, undefined), 'RESULT');
});

test('banner: checks say success and failure, attacks say hit and miss', () => {
  assert.equal(gildedBannerText('CRITICAL_SUCCESS'), 'CRITICAL SUCCESS!');
  assert.equal(gildedBannerText('SUCCESS', 'ATTACK'), 'HIT!');
  assert.equal(gildedBannerText('FAILURE', 'ATTACK'), 'MISS');
  assert.equal(gildedBannerText('CRITICAL_SUCCESS', 'ATTACK'), 'CRITICAL HIT!');
});

test('dice: one die per term in the formula, and a silhouette for every standard die', () => {
  assert.deepEqual(gildedDiceSides({ formula: '2d6+1d4+3', diceTerms: undefined }), [6, 6, 4]);
  assert.deepEqual(gildedDiceSides({ formula: '1d20+5', diceTerms: undefined }), [20]);
  for (const sides of [4, 6, 8, 10, 12, 20]) {
    const shape = gildedShapeFor(sides);
    assert.ok(shape.outline.split(' ').length >= 3, `d${sides} has an outline`);
    assert.ok(shape.faces.length >= 2, `d${sides} has visible faces`);
  }
  assert.equal(gildedShapeFor(100), gildedShapeFor(20), 'an unusual die falls back to the d20 silhouette');
});

test('advantage and disadvantage: the kept die is the higher or lower one, the other is discarded', () => {
  assert.deepEqual(gildedKeptIndex([7, 15], 'ADVANTAGE', 16, 1), { keptIndex: 1, discardedIndex: 0 });
  assert.deepEqual(gildedKeptIndex([7, 15], 'DISADVANTAGE', 8, 1), { keptIndex: 0, discardedIndex: 1 });
  assert.deepEqual(gildedKeptIndex([14], undefined, 15, 1), { keptIndex: 0, discardedIndex: -1 });
});

test('card: before the roll it shows the check, bonuses and difficulty class, and one Roll button', () => {
  const html = renderToStaticMarkup(h(GildedDiceCard, { roll: roll(), title: 'Insight Check', bonusesLabel: '+1 Wisdom', difficultyClass: 13 }));
  assert.match(html, /Insight Check/);
  assert.match(html, /Bonuses: \+1 Wisdom/);
  assert.match(html, /Difficulty Class/);
  assert.match(html, />13</);
  assert.match(html, /gilded-roll-button/);
  assert.match(html, /data-outcome="PENDING"/);
  assert.doesNotMatch(html, /data-testid="gilded-banner"/, "no result yet");
});

test('card: the revealed critical success shows the equation and the banner', () => {
  const html = renderToStaticMarkup(h(GildedDiceCard, {
    roll: roll({ isCriticalSuccess: true }), title: 'Insight Check', bonusesLabel: '+1 Wisdom', difficultyClass: 13, revealed: true,
  }));
  assert.match(html, /data-outcome="CRITICAL_SUCCESS"/);
  assert.match(html, /20 \+ 1 = 21/);
  assert.match(html, /CRITICAL SUCCESS!/);
  assert.doesNotMatch(html, /gilded-roll-button/, 'a rolled card has no Roll button');
});

test('card: success, failure and a bare result read correctly', () => {
  const success = renderToStaticMarkup(h(GildedDiceCard, { roll: roll({ total: 15, individualDice: [14] }), title: 'Check', difficultyClass: 13, revealed: true }));
  assert.match(success, /SUCCESS!/);
  const failure = renderToStaticMarkup(h(GildedDiceCard, { roll: roll({ total: 9, individualDice: [8] }), title: 'Check', difficultyClass: 13, revealed: true }));
  assert.match(failure, /FAILURE/);
  const bare = renderToStaticMarkup(h(GildedDiceCard, { roll: roll({ total: 9, individualDice: [8] }), title: 'Check', revealed: true }));
  assert.match(bare, /gilded-total/);
  assert.doesNotMatch(bare, /gilded-dc/, 'no difficulty class panel without one');
});

test('card: an attack reads HIT or MISS against armor class, and a damage roll shows its total', () => {
  const hit = renderToStaticMarkup(h(GildedDiceCard, { roll: roll({ total: 17, individualDice: [14], modifier: 3 }), title: 'Attack', kind: 'ATTACK', difficultyClass: 15, difficultyLabel: 'Armor Class', revealed: true }));
  assert.match(hit, /Armor Class/);
  assert.match(hit, /HIT!/);
  const miss = renderToStaticMarkup(h(GildedDiceCard, { roll: roll({ total: 9, individualDice: [6], modifier: 3 }), title: 'Attack', kind: 'ATTACK', difficultyClass: 15, difficultyLabel: 'Armor Class', revealed: true }));
  assert.match(miss, /MISS/);
  const damage = renderToStaticMarkup(h(GildedDiceCard, { roll: roll({ formula: '1d8+3', total: 8, individualDice: [5], modifier: 3 }), title: 'Damage', kind: 'DAMAGE', resultSuffix: 'Damage to Gravus', revealed: true }));
  assert.match(damage, /gilded-total/);
  assert.match(damage, /Damage to Gravus/);
});

test('card: disadvantage shows two dice, keeps the lower one and marks the other discarded', () => {
  const html = renderToStaticMarkup(h(GildedDiceCard, {
    roll: roll({ individualDice: [4, 17], total: 5, modifier: 1, formula: '2d20+1' }), title: 'Stealth Check', difficultyClass: 12, advantage: 'DISADVANTAGE', revealed: true,
  }));
  assert.equal((html.match(/data-testid="gilded-die"/g) || []).length, 2);
  assert.match(html, /Disadvantage/);
  assert.match(html, /Discarded/);
  assert.match(html, /4 \+ 1 = 5|\b4 \+ 1 = 5\b/);
});

test('card: clicking the card body is the customise door when one is given', () => {
  const html = renderToStaticMarkup(h(GildedDiceCard, { roll: roll(), title: 'Check', onCustomize: () => undefined }));
  assert.match(html, /role="button"/);
  assert.match(html, /Click the card to customise this roll/);
});
