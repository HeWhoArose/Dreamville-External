import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CombatInspector } from '../src/components/combat/CombatInspector';
import { BossPhasePanel } from '../src/components/combat/BossPhasePanel';
import { WorldEffectPreview } from '../src/components/combat/WorldEffectPreview';
import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { combatEffectEngine } from '../server/domain/combatEffectEngine';

const h = React.createElement;

function person(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hero', name: 'Hero', x: 0, y: 0, initiative: 100, team: 'player_allies' as const, hpCurrent: 300, hpMax: 300,
    armorClass: 12, speedCells: 8, attackBonus: 8, damageFormula: '1d8+3', conditions: [], isDead: false, ...overrides,
  } as any;
}

function realResult() {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(person());
  engine.addParticipant(person({ id: 'ogre', name: 'Ogre', team: 'enemies', x: 2, y: 0, armorClass: 11, initiative: 1 }));
  engine.addObstacle({ x: 1, y: 0, isImpassable: false, cover: 'HALF' });
  engine.rollInitiative();
  return combatEffectEngine.resolve(engine, 'hero', ['ogre'], {
    id: 'lasers', name: 'Finger Lasers', resolutionMode: 'MULTI_INSTANCE', scale: 'PERSON', actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET', instanceCount: 3, damageFormula: '1d8', damageType: 'radiant',
  });
}

test('inspector: the engine reports how each attack was made up, including terrain cover', () => {
  const result = realResult();
  assert.equal(result.success, true);
  const first = result.instances![0];
  assert.ok(first.attackBreakdown?.some((row) => row.label === 'Attack bonus' && row.value === 8));
  assert.ok(first.defenseBreakdown?.some((row) => row.label === 'Armor class' && row.value === 11));
  assert.ok(first.defenseBreakdown?.some((row) => row.label === 'Cover' && row.value === 2), 'the low wall shows up in the defence');
  assert.equal(first.targetArmorClass, 13, 'the reported armor class includes the cover the roll used');
});

test('inspector: summary first, one line per instance, details only when asked', () => {
  const result = realResult();
  const collapsed = renderToStaticMarkup(h(CombatInspector, { result, names: { ogre: 'Ogre' } }));
  assert.match(collapsed, /inspector-summary/);
  assert.match(collapsed, /3 instances/);
  assert.match(collapsed, /#1 Ogre/);
  assert.doesNotMatch(collapsed, /instance-details-0/, 'details are collapsed by default');

  const expanded = renderToStaticMarkup(h(CombatInspector, { result, names: { ogre: 'Ogre' }, defaultExpanded: true }));
  assert.match(expanded, /instance-details-0/);
  assert.match(expanded, /Attack bonus/);
  assert.match(expanded, /Target defence/);
  assert.match(expanded, /Cover/);
  assert.match(expanded, /Damage roll/);
});

test('inspector: a blocked effect says it never arrived and the action was still spent', () => {
  const html = renderToStaticMarkup(h(CombatInspector, {
    result: {
      success: true, effectName: 'Fire Burst', instances: [], totalDamage: 0, deliveryBlocked: true,
      deliveryResults: [{ targetId: 'ogre', delivered: false, reason: 'Warded: the effect cannot reach this target.' }],
    },
    names: { ogre: 'Ogre' },
  }));
  assert.match(html, /never reached its target/);
  assert.match(html, /Ogre: not reached/);
});

test('boss panel: shows the phase, what it changed, the unlocked abilities and the boss resources', () => {
  const dragon = person({
    id: 'dragon', name: 'Ashmaw', team: 'enemies', hpCurrent: 40, hpMax: 100, bossPhaseId: 'enraged', bossTargetPriority: 'LOWEST_HP',
    bossPhaseModifiers: { 'combat.attackBonus': 2 }, bossPhaseAbilities: ['fire_breath'], combatResources: { legendary_charges: 3 },
  });
  const html = renderToStaticMarkup(h(BossPhasePanel, { participants: [person(), dragon] }));
  assert.match(html, /boss-phase-panel/);
  assert.match(html, /Ashmaw/);
  assert.match(html, /enraged/);
  assert.match(html, /40% health/);
  assert.match(html, /attackBonus \+2/);
  assert.match(html, /fire breath/);
  assert.match(html, /legendary charges: 3/);
  assert.equal(renderToStaticMarkup(h(BossPhasePanel, { participants: [person()] })), '', 'no boss, no panel');
});

test('world effect preview: a city effect reads as a world event, with the scale ladder and a no-mutation note', () => {
  const html = renderToStaticMarkup(h(WorldEffectPreview, {
    preview: { scale: 'CITY', outcome: 'WORLD_STATE_CHANGED', targetIds: [], abstraction: 'MACRO', changedScopes: ['CITY:cataclysm'] },
  }));
  assert.match(html, /World effect preview/);
  assert.match(html, /World event/);
  assert.match(html, /not as damage to individual creatures/);
  assert.match(html, /Nothing has been applied to the live world/);
  assert.equal((html.match(/bg-violet-500/g) || []).length, 6, 'six of the ten scales are lit up for a city');
  assert.equal(renderToStaticMarkup(h(WorldEffectPreview, { preview: undefined })), '');
});
