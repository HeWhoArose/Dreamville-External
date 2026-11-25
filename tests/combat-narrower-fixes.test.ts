import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { combatEffectEngine, buildMultiattackEffect } from '../server/domain/combatEffectEngine';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { CharacterProgressionEngine } from '../server/domain/characterProgressionEngine';
import { subscribeProgressionTriggers } from '../server/domain/progressionTriggers';
import { getDndClassFeatureModules } from '../src/data/dndClassFeatures';

function hybrid(ruleToggles: Record<string, boolean> = {}) {
  return rulesProfileEngine.resolve({ mode: 'HYBRID_DND', rulesProfile: { mode: 'HYBRID_DND', ruleToggles } as any }).profile;
}

function person(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hero', name: 'Hero', x: 0, y: 0, initiative: 100, initiativeModifier: 100, team: 'player_allies' as const,
    hpCurrent: 400, hpMax: 400, armorClass: 10, speedCells: 8, attackBonus: 40, damageFormula: '1d6+2',
    conditions: [], isDead: false, ...overrides,
  } as any;
}

function arena(profile?: ReturnType<typeof hybrid>, extra: Array<Record<string, unknown>> = []) {
  const engine = new TacticalCombatEngine(1337);
  if (profile) engine.setRulesProfile(profile);
  engine.addParticipant(person());
  engine.addParticipant(person({ id: 'ogre', name: 'Ogre', team: 'enemies', x: 1, y: 0, hpCurrent: 9000, hpMax: 9000, initiative: 0, initiativeModifier: 0, armorClass: 8 }));
  for (const entry of extra) engine.addParticipant(person(entry));
  engine.rollInitiative();
  return engine;
}

const progression = (values: Record<string, number>) => (actorId: string) => actorId === 'hero'
  ? ({ actorId, modifiers: Object.entries(values).map(([target, value]) => ({ target, value, mode: 'ADD', precedence: 10, id: target, sources: [] })), sourceTrace: {} } as any)
  : undefined;

// ---------------------------------------------------------------- delivery per instance

const beams = (dc: number) => ({
  id: 'beams', name: 'Finger Lasers', resolutionMode: 'MULTI_INSTANCE' as const, scale: 'PERSON' as const, actionCost: 'ACTION' as const,
  targetingMode: 'ONE_TARGET' as const, instanceCount: 5, damageFormula: '1d8', damageType: 'radiant',
  deliveryMode: 'CHECK_REQUIRED' as const, deliveryDifficultyClass: dc,
});

test('delivery: each beam of a multi-instance effect rolls its own delivery check', () => {
  let sawPartial = false;
  for (let dc = 4; dc <= 19 && !sawPartial; dc += 1) {
    const engine = arena();
    const result = combatEffectEngine.resolve(engine, 'hero', ['ogre'], beams(dc));
    const delivered = (result.deliveryResults || []).filter((entry) => entry.delivered).length;
    assert.equal((result.deliveryResults || []).length, 5, 'one delivery result per beam');
    assert.deepEqual((result.deliveryResults || []).map((entry) => entry.instanceIndex), [0, 1, 2, 3, 4]);
    if (delivered === 0) assert.equal(result.deliveryBlocked, true);
    else assert.equal(result.instances?.length, delivered, 'only the beams that arrived were resolved');
    if (delivered > 0 && delivered < 5) sawPartial = true;
  }
  assert.ok(sawPartial, 'some difficulty class lets only some of the five beams through');
});

// ---------------------------------------------------------------- interrupt after execution

test('interrupt after execution: a cancelled effect still costs the action but not the resource', () => {
  const engine = arena();
  engine.grantSpecialResource('hero', 'ki', 3);
  assert.equal(engine.prepareInterrupt({ id: 'snuff', actorId: 'ogre', stage: 'AFTER_EXECUTION', action: 'CANCEL_EFFECT' }).success, true);
  const result = combatEffectEngine.resolve(engine, 'hero', ['ogre'], {
    id: 'ki_blast', name: 'Ki Blast', resolutionMode: 'AREA', scale: 'ENCOUNTER', actionCost: 'ACTION', targetingMode: 'ALL_IN_AREA',
    damageFormula: '2d6', damageType: 'force', resourceCost: { name: 'ki', amount: 1 },
  });
  assert.equal(result.success, true);
  assert.equal(result.interrupted?.stage, 'AFTER_EXECUTION');
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, false, 'the action was spent');
  assert.equal(engine.getTurnResources('hero')?.specialResources?.ki, 3, 'the ki was not');
  assert.ok(engine.getCombatEffectEvents().some((event) => event.eventType === 'EXECUTION_INTERRUPTED'));
});

// ---------------------------------------------------------------- Sneak Attack and Rage are rolled by the engine

test('sneak attack: extra dice once per turn, with an ally beside the target, only while the rule is on', () => {
  const run = (profile?: ReturnType<typeof hybrid>, withAlly = true) => {
    const engine = arena(profile, withAlly ? [{ id: 'friend', name: 'Friend', x: 2, y: 0, initiative: 50 }] : []);
    engine.setProgressionModifierResolver(progression({ 'combat.sneakAttackDice': 3 }));
    const definition = buildMultiattackEffect(engine, 'hero', 'ogre', 2)!;
    return combatEffectEngine.resolve(engine, 'hero', ['ogre'], definition);
  };
  const result = run();
  assert.equal(result.success, true);
  const first = result.instances![0];
  const second = result.instances![1];
  assert.ok(first.hits && first.riders?.some((rider) => rider.id === 'sneak_attack'), 'the first hit carries Sneak Attack');
  assert.match(first.riders![0].label, /3d6/);
  assert.ok(first.riders![0].amount >= 3 && first.riders![0].amount <= 18);
  assert.equal(second.riders, undefined, 'once per turn');

  assert.equal(run(hybrid({ 'class.sneak_attack': false })).instances![0].riders, undefined, 'no rider when the rule is off');
  assert.equal(run(undefined, false).instances![0].riders, undefined, 'no ally beside the target and no advantage: no sneak attack');
});

test('sneak attack: advantage qualifies without an ally, disadvantage disqualifies', () => {
  const withNotes = (notes: { advantage: string[]; disadvantage: string[] }) => {
    const engine = arena();
    engine.setProgressionModifierResolver(progression({ 'combat.sneakAttackDice': 2 }));
    return (engine as any).damageRiders(engine.getParticipant('hero'), engine.getParticipant('ogre'), 1, false, notes);
  };
  assert.equal(withNotes({ advantage: ['Flanking'], disadvantage: [] }).length, 1);
  assert.equal(withNotes({ advantage: ['Flanking'], disadvantage: ['Fighting underwater'] }).length, 0);
  assert.equal(withNotes({ advantage: [], disadvantage: [] }).length, 0);
});

test('rage: the damage bonus applies to melee attacks while raging, and only if the rule allows a rage', () => {
  const engine = arena();
  engine.setProgressionModifierResolver(progression({ 'combat.rageDamage': 2 }));
  assert.equal(engine.setRaging('hero', true).success, true);
  const raging = combatEffectEngine.resolve(engine, 'hero', ['ogre'], buildMultiattackEffect(engine, 'hero', 'ogre', 1)!);
  assert.ok(raging.instances![0].riders?.some((rider) => rider.id === 'rage' && rider.amount === 2));

  const calm = arena();
  calm.setProgressionModifierResolver(progression({ 'combat.rageDamage': 2 }));
  assert.equal(combatEffectEngine.resolve(calm, 'hero', ['ogre'], buildMultiattackEffect(calm, 'hero', 'ogre', 1)!).instances![0].riders, undefined, 'not raging, no bonus');

  const off = arena(hybrid({ 'class.rage': false }));
  assert.equal(off.setRaging('hero', true).success, false);
});

test('class library: sneak attack dice and rage damage grow with level', () => {
  const build = (classId: string, levels: number) => {
    const engine = new CharacterProgressionEngine();
    engine.registerModules(getDndClassFeatureModules() as any);
    engine.seedFromCharacter('hero', { identity: { name: 'Hero', species: 'Human' }, role: { profession: 'Rogue' }, coreStats: { level: 1 } as any, feats: [] });
    engine.selectModule('hero', 'CLASS', classId, 'sel', rulesProfileEngine.createDefault('FULL_DND'));
    for (let level = 2; level <= levels; level += 1) engine.levelUp('hero', `lvl-${level}`);
    return engine.resolveModifiers('hero', rulesProfileEngine.createDefault('FULL_DND')).modifiers;
  };
  const value = (modifiers: any[], target: string) => modifiers.find((entry) => entry.target === target)?.value;
  assert.equal(value(build('dnd_class_rogue', 1), 'combat.sneakAttackDice'), 1);
  assert.equal(value(build('dnd_class_rogue', 5), 'combat.sneakAttackDice'), 3);
  assert.equal(value(build('dnd_class_rogue', 19), 'combat.sneakAttackDice'), 10);
  assert.equal(value(build('dnd_class_barbarian', 1), 'combat.rageDamage'), 2);
  assert.equal(value(build('dnd_class_barbarian', 9), 'combat.rageDamage'), 3);
  assert.equal(value(build('dnd_class_barbarian', 16), 'combat.rageDamage'), 4);
});

// ---------------------------------------------------------------- abilities subscribe themselves to combat events

function momentumModule(ruleId?: string) {
  return {
    id: 'momentum_class', type: 'CLASS', name: 'Duelist', version: 1, enabled: true, provenance: 'test',
    features: [{
      id: 'momentum_feature', name: 'Momentum', description: 'Each attack builds momentum.', level: 1, enabled: true, ...(ruleId ? { ruleId } : {}),
      triggeredAbilities: [{
        id: 'momentum_ability', name: 'Momentum', description: 'Gain momentum when you attack.', trigger: 'ON_ATTACK', activationMode: 'PASSIVE',
        capabilityDefinition: {
          id: 'momentum_cap', name: 'Momentum',
          effectDefinition: { id: 'momentum_gain', name: 'Momentum', resolutionMode: 'OUTCOME', scale: 'PERSON', actionCost: 'FREE', targetingMode: 'SELF', outcome: 'RESOURCE_GRANTED', outcomePayload: { resource: 'momentum', amount: 1 } },
        },
      }],
    }],
  };
}

function subscribedFight(profile: ReturnType<typeof hybrid> | undefined, ruleId?: string) {
  const progressionEngine = new CharacterProgressionEngine();
  progressionEngine.registerModules([momentumModule(ruleId)] as any);
  progressionEngine.seedFromCharacter('hero', { identity: { name: 'Hero', species: 'Human' }, role: { profession: 'Duelist' }, coreStats: { level: 1 } as any, feats: [] });
  progressionEngine.selectModule('hero', 'CLASS', 'momentum_class', 'sel', rulesProfileEngine.createDefault('FULL_DND'));
  const engine = arena(profile);
  const ids = subscribeProgressionTriggers(engine, progressionEngine, 'hero', profile || rulesProfileEngine.createDefault('FULL_DND'));
  return { engine, ids };
}

test('triggers: an ability whose trigger is a combat event subscribes at the start of a fight and fires through the pipeline', () => {
  const { engine, ids } = subscribedFight(undefined);
  assert.deepEqual(ids, ['progression_hero_momentum_ability']);
  engine.executeAttack('hero', 'ogre');
  assert.equal(engine.getParticipant('hero')?.combatResources?.momentum, 1, 'attacking granted momentum');
  assert.ok(engine.getCombatEffectEvents().some((event) => event.eventType === 'TRIGGERED_EFFECT_RESOLVED'));
});

test('triggers: switching the feature\'s rule off means it never subscribes', () => {
  const { engine, ids } = subscribedFight(hybrid({ 'class.fighter_features': false }), 'class.fighter_features');
  assert.deepEqual(ids, []);
  engine.executeAttack('hero', 'ogre');
  assert.equal(engine.getParticipant('hero')?.combatResources?.momentum, undefined);
});
