import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { combatEffectEngine, buildMultiattackEffect } from '../server/domain/combatEffectEngine';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';

function hybrid(ruleToggles: Record<string, boolean> = {}) {
  return rulesProfileEngine.resolve({ mode: 'HYBRID_DND', rulesProfile: { mode: 'HYBRID_DND', ruleToggles } as any }).profile;
}

function person(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hero', name: 'Hero', x: 0, y: 0, initiative: 100, initiativeModifier: 100, team: 'player_allies' as const,
    hpCurrent: 200, hpMax: 200, armorClass: 12, speedCells: 8, attackBonus: 30, damageFormula: '1d8+3',
    conditions: [], isDead: false, ...overrides,
  } as any;
}

function arena(profile?: ReturnType<typeof hybrid>, enemy: Record<string, unknown> = {}) {
  const engine = new TacticalCombatEngine(1337);
  if (profile) engine.setRulesProfile(profile);
  engine.addParticipant(person());
  engine.addParticipant(person({ id: 'enemy', name: 'Ogre', team: 'enemies', x: 1, y: 0, hpCurrent: 1000, hpMax: 1000, initiative: 0, initiativeModifier: 0, ...enemy }));
  engine.rollInitiative();
  return engine;
}

const fireBurst = (extra: Record<string, unknown> = {}) => ({
  id: 'fire_burst', name: 'Fire Burst', resolutionMode: 'AREA' as const, scale: 'ENCOUNTER' as const, actionCost: 'ACTION' as const,
  targetingMode: 'ALL_IN_AREA' as const, damageFormula: '1d4+8', damageType: 'fire', ...extra,
});

// ------------------------------------------------------------ delivery stage

test('delivery: a ward blocks an executed effect before it arrives; the action is still spent', () => {
  const engine = arena(undefined, { wardedAgainst: ['fire'] });
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], fireBurst());
  assert.equal(result.success, true);
  assert.equal(result.deliveryBlocked, true);
  assert.equal(result.totalDamage, 0);
  assert.equal(result.deliveryResults?.[0].delivered, false);
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, false, 'the caster still used the action');
  assert.ok(engine.getCombatEffectEvents().some((event) => event.eventType === 'DELIVERY_BLOCKED'));
  assert.equal(engine.getParticipant('enemy')?.hpCurrent, 1000, 'nothing reached the target');

  const open = arena(undefined, { wardedAgainst: ['cold'] });
  const delivered = combatEffectEngine.resolve(open, 'hero', ['enemy'], fireBurst());
  assert.equal(delivered.deliveryBlocked, undefined);
  assert.equal((delivered.totalDamage || 0) > 0, true, 'a ward against cold does not stop fire');
});

test('delivery: a delivery check can fail on its own, separately from a save', () => {
  const blocked = combatEffectEngine.resolve(arena(), 'hero', ['enemy'], fireBurst({ deliveryMode: 'CHECK_REQUIRED', deliveryDifficultyClass: 99 }));
  assert.equal(blocked.deliveryBlocked, true);
  assert.equal(blocked.deliveryResults?.[0].reason, 'Delivery check failed.');
  const passed = combatEffectEngine.resolve(arena(), 'hero', ['enemy'], fireBurst({ deliveryMode: 'CHECK_REQUIRED', deliveryDifficultyClass: 1 }));
  assert.equal(passed.deliveryBlocked, undefined);
  assert.ok((passed.totalDamage || 0) > 0);
  const invalid = combatEffectEngine.validateDefinition(fireBurst({ deliveryMode: 'CHECK_REQUIRED' }) as any);
  assert.equal(invalid.success, false, 'a delivery check needs a difficulty class');
});

test('delivery: a ward against all effects stops everything, tags match too', () => {
  const warded = arena(undefined, { wardedAgainst: ['all'] });
  assert.equal(combatEffectEngine.resolve(warded, 'hero', ['enemy'], fireBurst()).deliveryBlocked, true);
  const tagged = arena(undefined, { wardedAgainst: ['magic'] });
  assert.equal(combatEffectEngine.resolve(tagged, 'hero', ['enemy'], fireBurst({ tags: ['MAGIC'] })).deliveryBlocked, true);
});

// ------------------------------------------------------------ stage interrupts

test('interrupt before delivery: a prepared Counterspell-style reaction cancels the effect and is used up', () => {
  const engine = arena();
  assert.equal(engine.prepareInterrupt({ id: 'counter', actorId: 'enemy', stage: 'BEFORE_DELIVERY', action: 'CANCEL_EFFECT' }).success, true);
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], fireBurst());
  assert.equal(result.deliveryBlocked, true);
  assert.equal(result.interrupted?.byActorId, 'enemy');
  assert.equal(engine.getTurnResources('enemy')?.reactionAvailable, false, 'the interrupt cost the reaction');
  assert.ok(engine.getCombatEffectEvents().some((event) => event.eventType === 'DELIVERY_INTERRUPTED'));
  const second = combatEffectEngine.resolve(engine, 'hero', ['enemy'], fireBurst(), { consumeAction: false });
  assert.ok((second.totalDamage || 0) > 0, 'the interrupt is single use');
});

test('interrupt before damage: a Shield-style reaction reduces the damage', () => {
  const plain = combatEffectEngine.resolve(arena(), 'hero', ['enemy'], fireBurst());
  const engine = arena();
  assert.equal(engine.prepareInterrupt({ id: 'shield', actorId: 'enemy', stage: 'BEFORE_DAMAGE', action: 'REDUCE_DAMAGE', amount: 4 }).success, true);
  const softened = combatEffectEngine.resolve(engine, 'hero', ['enemy'], fireBurst());
  assert.ok((plain.totalDamage || 0) >= 9);
  assert.equal(softened.totalDamage, (plain.totalDamage || 0) - 4, 'the same seeded roll, four points softer');
  assert.ok(engine.getCombatEffectEvents().some((event) => event.eventType === 'INTERRUPT_TRIGGERED'));
});

test('interrupts need a reaction and the reactions rule; unspent ones expire when their owner next acts', () => {
  const engine = arena();
  engine.consumeCombatAction('enemy', 'REACTION');
  assert.equal(engine.prepareInterrupt({ id: 'late', actorId: 'enemy', stage: 'BEFORE_DAMAGE', action: 'REDUCE_DAMAGE', amount: 1 }).success, false);
  const off = arena(hybrid({ 'combat.reactions': false }));
  assert.equal(off.prepareInterrupt({ id: 'off', actorId: 'enemy', stage: 'BEFORE_DAMAGE', action: 'REDUCE_DAMAGE', amount: 1 }).success, false);
  const expiring = arena();
  expiring.prepareInterrupt({ id: 'exp', actorId: 'enemy', stage: 'BEFORE_DAMAGE', action: 'REDUCE_DAMAGE', amount: 1 });
  expiring.advanceTurn();
  assert.equal(expiring.getPreparedInterrupts().length, 0, 'the enemy\'s own turn began, so the prepared reaction lapsed');
});

// ------------------------------------------------------------ triggered effects and the turn events

const rageGain = {
  id: 'rage_gain', name: 'Battle Fury', resolutionMode: 'OUTCOME' as const, scale: 'PERSON' as const, actionCost: 'FREE' as const,
  targetingMode: 'SELF' as const, outcome: 'RESOURCE_GRANTED' as const, outcomePayload: { resource: 'rage', amount: 1 },
};

test('triggered effects: an ability fires at the start of its owner\'s turn through the effect pipeline', () => {
  const engine = arena();
  assert.equal(engine.registerTriggeredEffect({ id: 'fury', ownerId: 'hero', event: 'ON_TURN_START', subject: 'OWNER', targeting: 'SELF', definition: rageGain }).success, true);
  engine.advanceTurn();
  engine.advanceTurn();
  assert.equal(engine.getParticipant('hero')?.combatResources?.rage, 1, 'rage was granted when the hero\'s turn began');
  assert.ok(engine.getCombatEffectEvents().some((event) => event.eventType === 'TRIGGERED_EFFECT_RESOLVED'));
});

test('triggered effects: ON_TURN_END, ON_HIT and a firing limit', () => {
  const engine = arena();
  engine.registerTriggeredEffect({ id: 'end', ownerId: 'hero', event: 'ON_TURN_END', subject: 'OWNER', targeting: 'SELF', definition: { ...rageGain, id: 'rage_end' } });
  engine.registerTriggeredEffect({ id: 'hit', ownerId: 'hero', event: 'ON_HIT', subject: 'OWNER', targeting: 'SELF', maxFirings: 1, definition: { ...rageGain, id: 'rage_hit' } });
  engine.executeAttack('hero', 'enemy');
  assert.equal(engine.getParticipant('hero')?.combatResources?.rage, 1, 'the hit fired once');
  engine.advanceTurn();
  assert.equal(engine.getParticipant('hero')?.combatResources?.rage, 2, 'ending the turn fired the second subscription');
  assert.equal(engine.getTriggeredEffects().find((entry) => entry.id === 'hit')?.firedCount, 1);
});

test('triggered effects survive a state export and import, and can be unregistered', () => {
  const engine = arena();
  engine.registerTriggeredEffect({ id: 'fury', ownerId: 'hero', event: 'ON_TURN_START', subject: 'OWNER', targeting: 'SELF', definition: rageGain });
  const snapshot = engine.exportState();
  const restored = new TacticalCombatEngine(1337);
  restored.importState(snapshot);
  assert.equal(restored.getTriggeredEffects().length, 1);
  assert.equal(restored.unregisterTriggeredEffect('fury'), true);
  assert.equal(restored.getTriggeredEffects().length, 0);
});

// ------------------------------------------------------------ special resources in the ledger

test('special resources: part of the turn ledger and spendable by effects, with rollback on failure', () => {
  const engine = arena();
  assert.equal(engine.grantSpecialResource('hero', 'ki', 2).success, true);
  assert.equal(engine.getTurnResources('hero')?.specialResources?.ki, 2);
  const costly = fireBurst({ id: 'ki_blast', name: 'Ki Blast', actionCost: 'BONUS_ACTION', resourceCost: { name: 'ki', amount: 1 } });
  assert.equal(combatEffectEngine.resolve(engine, 'hero', ['enemy'], costly).success, true);
  assert.equal(engine.getTurnResources('hero')?.specialResources?.ki, 1);
  const broke = arena();
  const refused = combatEffectEngine.resolve(broke, 'hero', ['enemy'], costly);
  assert.equal(refused.success, false);
  assert.equal(broke.getTurnResources('hero')?.bonusActionAvailable, true, 'a failed cost rolls the action back');
  assert.equal(engine.spendSpecialResource('hero', 'ki', 5).success, false);
});

// ------------------------------------------------------------ terrain: pits, bridges, traps, cover

function terrainArena(profile?: ReturnType<typeof hybrid>) {
  const engine = new TacticalCombatEngine(1337);
  if (profile) engine.setRulesProfile(profile);
  engine.addParticipant(person({ hpCurrent: 500, hpMax: 500 }));
  engine.addParticipant(person({ id: 'enemy', team: 'enemies', x: 7, y: 7, initiative: 0, initiativeModifier: 0 }));
  engine.rollInitiative();
  return engine;
}

test('pit: stepping in drops the creature, and a bridge over the pit makes it safe', () => {
  const pit = terrainArena();
  pit.addHazard({ id: 'pit1', type: 'pit', x: 3, y: 0, radiusCells: 0, durationTurns: 99, damagePerTurn: 0, fallFeet: 30 });
  assert.equal(pit.moveActor('hero', 3, 0).success, true);
  const fallen = pit.getParticipant('hero')!;
  assert.ok(fallen.hpCurrent <= 497 && fallen.hpCurrent >= 482, `30 ft is 3d6, hero at ${fallen.hpCurrent}`);
  assert.ok(fallen.conditions.includes('Prone'));

  const bridged = terrainArena();
  bridged.addHazard({ id: 'pit1', type: 'pit', x: 3, y: 0, radiusCells: 0, durationTurns: 99, damagePerTurn: 0, fallFeet: 30 });
  bridged.addHazard({ id: 'bridge1', type: 'bridge', x: 3, y: 0, radiusCells: 0, durationTurns: 99, damagePerTurn: 0 });
  bridged.moveActor('hero', 3, 0);
  assert.equal(bridged.getParticipant('hero')?.hpCurrent, 500, 'the bridge carries them over');

  const noFalls = terrainArena(hybrid({ 'combat.falling_damage': false }));
  noFalls.addHazard({ id: 'pit1', type: 'pit', x: 3, y: 0, radiusCells: 0, durationTurns: 99, damagePerTurn: 0, fallFeet: 30 });
  noFalls.moveActor('hero', 3, 0);
  assert.equal(noFalls.getParticipant('hero')?.hpCurrent, 500, 'with falling damage off a pit costs nothing');
});

test('a fall is resolved by the unified effect pipeline, not a side channel', () => {
  const engine = terrainArena();
  const result = engine.applyFallDamage('hero', 40);
  assert.equal(result.viaEffect, true);
  assert.ok(result.damage >= 4 && result.damage <= 24);
  assert.ok(engine.getCombatEffectEvents().some((event) => event.eventType === 'AREA_DAMAGE_RESOLVED' && event.targetId === 'hero'), 'the fall left a canonical damage event');
});

test('trap: springs once on the creature that steps on it, then disappears', () => {
  const engine = terrainArena();
  engine.addHazard({ id: 'trap1', type: 'trap', x: 2, y: 0, radiusCells: 0, durationTurns: 99, damagePerTurn: 12, damageType: 'piercing' });
  engine.moveActor('hero', 2, 0);
  assert.equal(engine.getParticipant('hero')?.hpCurrent, 488);
  assert.equal(engine.getHazards().some((hazard) => hazard.id === 'trap1'), false, 'a one-shot trap is spent');
});

test('terrain cover: a low wall on the line gives cover; one off the line, or the rule switched off, does not', () => {
  const build = (profile?: ReturnType<typeof hybrid>) => {
    const engine = new TacticalCombatEngine(1337);
    if (profile) engine.setRulesProfile(profile);
    engine.addParticipant(person());
    engine.addParticipant(person({ id: 'enemy', team: 'enemies', x: 4, y: 0, initiative: 0, initiativeModifier: 0 }));
    return engine;
  };
  const cover = (engine: TacticalCombatEngine) => (engine as any).getCoverBonus(engine.getParticipant('enemy'), engine.getParticipant('hero'));
  const open = build();
  assert.equal(cover(open), 0);
  const walled = build();
  walled.addObstacle({ x: 2, y: 0, isImpassable: false, cover: 'HALF' });
  assert.equal(cover(walled), 2, 'a low wall between them is half cover');
  const heavy = build();
  heavy.addObstacle({ x: 2, y: 0, isImpassable: false, cover: 'THREE_QUARTERS' });
  assert.equal(cover(heavy), 5);
  const offLine = build();
  offLine.addObstacle({ x: 2, y: 3, isImpassable: false, cover: 'HALF' });
  assert.equal(cover(offLine), 0, 'a wall off to the side gives nothing');
  const off = build(hybrid({ 'combat.cover': false }));
  off.addObstacle({ x: 2, y: 0, isImpassable: false, cover: 'HALF' });
  assert.equal(cover(off), 0);
  assert.equal(walled.getObstacles()[0].cover, 'HALF', 'cover survives in canonical state');
});

// ------------------------------------------------------------ Extra Attack through the unified pipeline

test('Extra Attack: granted by a progression modifier and also expressible as one multi-instance effect', () => {
  const engine = arena();
  engine.setProgressionModifierResolver((actorId) => actorId === 'hero'
    ? ({ actorId, modifiers: [{ target: 'combat.extraAttacks', value: 1, mode: 'ADD', precedence: 10, id: 'extra', sources: [] }], sourceTrace: {} } as any)
    : undefined);
  assert.equal(engine.executeAttack('hero', 'enemy').success, true);
  assert.equal(engine.executeAttack('hero', 'enemy').success, true, 'a second swing for the same action');
  assert.equal(engine.executeAttack('hero', 'enemy').success, false);

  const multi = arena();
  const definition = buildMultiattackEffect(multi, 'hero', 'enemy', 3)!;
  const result = combatEffectEngine.resolve(multi, 'hero', ['enemy'], definition);
  assert.equal(result.success, true);
  assert.equal(result.instances?.length, 3, 'three independent attack instances');
  assert.equal(multi.getTurnResources('hero')?.actionAvailable, false, 'for one action');
});
