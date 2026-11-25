import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticalCombatEngine, LocalDiceEngine } from '../server/domain/combatEngine';
import { spellRuntime } from '../server/domain/spellRuntime';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { CharacterProgressionEngine } from '../server/domain/characterProgressionEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { RULES_CATALOGUE } from '../src/data/rulesCatalogue';
import { classFeatureRuleIds, getDndClassFeatureModules } from '../src/data/dndClassFeatures';

function hybrid(ruleToggles: Record<string, boolean> = {}) {
  return rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: { mode: 'HYBRID_DND', ruleToggles } as any,
  }).profile;
}

function actor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hero',
    name: 'Hero',
    x: 0,
    y: 0,
    initiative: 20,
    initiativeModifier: 100,
    team: 'player_allies' as const,
    hpCurrent: 30,
    hpMax: 30,
    armorClass: 1,
    speedCells: 6,
    attackBonus: 20,
    damageFormula: '1d6+2',
    conditions: [],
    saveModifiers: { STR: 2, DEX: 2 },
    isDead: false,
    ...overrides,
  } as any;
}

function duel(profile: ReturnType<typeof hybrid> | undefined, heroOverrides: Record<string, unknown> = {}) {
  const engine = new TacticalCombatEngine(1337);
  if (profile) engine.setRulesProfile(profile);
  engine.addParticipant(actor(heroOverrides));
  engine.addParticipant(actor({ id: 'enemy', name: 'Enemy', x: 1, y: 0, team: 'enemies', initiative: 1, initiativeModifier: 0, hpCurrent: 500, hpMax: 500, attackBonus: 0 }));
  engine.rollInitiative();
  return engine;
}

const get = (engine: TacticalCombatEngine, id: string) => (engine as any).participants.get(id);

// ---------------------------------------------------------------- combat

test('extra attack: two attacks for one action, a third is refused; with the rule off the second is refused', () => {
  const on = duel(undefined, { attacksPerAction: 2 });
  assert.equal(on.executeAttack('hero', 'enemy').success, true);
  assert.equal(on.executeAttack('hero', 'enemy').success, true, 'the second attack costs no action');
  assert.equal(on.executeAttack('hero', 'enemy').success, false, 'the action is spent');

  const off = duel(hybrid({ 'combat.extra_attack': false }), { attacksPerAction: 2 });
  assert.equal(off.executeAttack('hero', 'enemy').success, true);
  assert.equal(off.executeAttack('hero', 'enemy').success, false, 'one attack per action when Extra Attack is off');
});

test('two-weapon fighting: needs the Attack action first, costs the bonus action, adds no modifier', () => {
  const engine = duel(undefined, { offhandDamageFormula: '1d6+3' });
  const early = engine.executeOffhandAttack('hero', 'enemy');
  assert.equal(early.success, false);
  assert.match(String(early.errorReason), /Attack action/i);
  assert.equal(engine.executeAttack('hero', 'enemy').success, true);
  const offhand = engine.executeOffhandAttack('hero', 'enemy');
  assert.equal(offhand.success, true);
  assert.ok(offhand.damage >= 1 && offhand.damage <= 6, `off-hand damage ${offhand.damage} must not include the +3 modifier`);
  assert.equal(engine.getTurnResources('hero')?.bonusActionAvailable, false);
  assert.equal(engine.executeOffhandAttack('hero', 'enemy').success, false, 'the bonus action is spent');

  const off = duel(hybrid({ 'combat.two_weapon_fighting': false }), { offhandDamageFormula: '1d6+3' });
  off.executeAttack('hero', 'enemy');
  const refused = off.executeOffhandAttack('hero', 'enemy');
  assert.equal(refused.success, false);
  assert.match(String(refused.errorReason), /switched off/i);
});

test('critical extras: a critical doubles the dice only while the rule is on', () => {
  assert.equal((duel(undefined) as any).critDice(true), true);
  assert.equal((duel(hybrid({ 'combat.critical_extras': false })) as any).critDice(true), false);
  assert.equal((duel(hybrid({ 'combat.critical_extras': false })) as any).critDice(false), false);
});

test('massive damage: damage equal to the maximum beyond zero kills outright, unless the rule is off', () => {
  const kill = (profile?: ReturnType<typeof hybrid>) => {
    const engine = new TacticalCombatEngine(1337);
    if (profile) engine.setRulesProfile(profile);
    engine.addParticipant(actor({ id: 'pc', hpCurrent: 3, hpMax: 10, usesDeathSaves: true }));
    const pc = get(engine, 'pc');
    (engine as any).applyCombatDamage(pc, 13, 'slashing', false);
    return pc.isDead;
  };
  assert.equal(kill(), true, 'massive damage kills');
  assert.equal(kill(hybrid({ 'combat.massive_damage': false })), false, 'with the rule off the character drops and rolls death saves');
});

test('falling damage: 1d6 per 10 feet, prone on landing, refused when the rule is off', () => {
  const engine = duel(undefined);
  const result = engine.applyFallDamage('hero', 30);
  assert.equal(result.success, true);
  assert.ok(result.damage >= 3 && result.damage <= 18, `30 ft is 3d6, got ${result.damage}`);
  assert.ok(get(engine, 'hero').conditions.includes('Prone'));
  assert.equal(engine.applyFallDamage('enemy', 5).damage, 0, 'under 10 feet is harmless');
  const off = duel(hybrid({ 'combat.falling_damage': false }));
  assert.equal(off.applyFallDamage('hero', 30).success, false);
});

test('underwater: submerged attackers without a swim speed or a suitable weapon are at disadvantage', () => {
  const engine = duel(undefined);
  const check = (extra: Record<string, unknown>) => (engine as any).hasUnderwaterPenalty({ ...get(engine, 'hero'), underwater: true, ...extra }, 1);
  assert.equal(check({}), true);
  assert.equal(check({ weaponName: 'Trident' }), false);
  assert.equal(check({ hasSwimSpeed: true }), false);
  assert.equal((engine as any).hasUnderwaterPenalty({ ...get(engine, 'hero'), underwater: false }, 1), false);
  assert.equal((duel(hybrid({ 'combat.underwater': false })) as any).ruleIsOn('combat.underwater'), false);
});

test('action economy: with the rule off an actor may attack more than once per turn', () => {
  const on = duel(undefined);
  assert.equal(on.executeAttack('hero', 'enemy').success, true);
  assert.equal(on.executeAttack('hero', 'enemy').success, false);
  const off = duel(hybrid({ 'combat.action_economy': false }));
  assert.equal(off.executeAttack('hero', 'enemy').success, true);
  assert.equal(off.executeAttack('hero', 'enemy').success, true);
});

test('reactions: a reaction cannot be spent when the rule is off', () => {
  assert.equal(duel(undefined).consumeCombatAction('hero', 'REACTION').success, true);
  const off = duel(hybrid({ 'combat.reactions': false })).consumeCombatAction('hero', 'REACTION');
  assert.equal(off.success, false);
  assert.match(String(off.errorReason), /switched off/i);
});

test('initiative: turn order is enforced by default and ignored when the rule is off', () => {
  const attackOutOfTurn = (profile?: ReturnType<typeof hybrid>) => {
    const engine = duel(profile);
    return engine.executeAttack('enemy', 'hero');
  };
  const refused = attackOutOfTurn();
  assert.equal(refused.success, false);
  assert.match(String(refused.errorReason), /turn/i);
  assert.equal(attackOutOfTurn(hybrid({ 'combat.initiative': false })).success, true);
});

// ---------------------------------------------------------------- casting

function spyDice() {
  const real = new LocalDiceEngine(1337);
  const formulas: string[] = [];
  const spy: any = Object.create(real);
  spy.roll = (formula: string, modifier?: number) => {
    formulas.push(formula);
    return real.roll(formula, modifier);
  };
  return { spy, formulas };
}

function castFireBolt(name: string, casterLevel: number, profile?: ReturnType<typeof hybrid>) {
  spellRuntime.initializeSlots(name, { 1: { current: 2, max: 2 } });
  spellRuntime.getOrCreateActorState(name).casterLevel = casterLevel;
  const { spy, formulas } = spyDice();
  spellRuntime.castSpellAuthoritative({
    request: { casterId: name, spellId: 'fire_bolt', targetId: 'dummy', allowSyntheticTarget: true, rulesProfile: profile, diceEngine: spy } as any,
  });
  return formulas;
}

test('cantrip scaling: extra damage dice at levels 5, 11 and 17, none when the rule is off', () => {
  assert.ok(castFireBolt('enf_cantrip_5', 5).includes('2d10'));
  assert.ok(castFireBolt('enf_cantrip_11', 11).includes('3d10'));
  assert.ok(castFireBolt('enf_cantrip_17', 17).includes('4d10'));
  assert.ok(castFireBolt('enf_cantrip_1', 1).includes('1d10'));
  const off = castFireBolt('enf_cantrip_off', 11, hybrid({ 'casting.cantrip_scaling': false }));
  assert.ok(off.includes('1d10') && !off.includes('3d10'), 'no scaling with the rule off');
});

function castSpell(name: string, spellId: string, slotLevel: number, extra: Record<string, unknown> = {}, profile?: ReturnType<typeof hybrid>, participant?: any) {
  spellRuntime.initializeSlots(name, { 1: { current: 2, max: 2 }, 2: { current: 2, max: 2 }, 3: { current: 2, max: 2 } });
  spellRuntime.learnSpell(name, spellId);
  spellRuntime.prepareSpell(name, spellId);
  return spellRuntime.castSpellAuthoritative({
    request: { casterId: name, spellId, targetId: 'dummy', slotLevel, allowSyntheticTarget: true, rulesProfile: profile, ...extra } as any,
    casterParticipant: participant,
  });
}

test('components: a silenced caster cannot speak a verbal component; a missing material blocks the spell', () => {
  const silenced = actor({ id: 'enf_silenced', conditions: ['Silenced'] });
  const refused = castSpell('enf_silenced', 'magic_missile', 1, {}, undefined, silenced);
  assert.equal(refused.success, false);
  assert.equal(refused.errorCode, 'COMPONENTS_UNAVAILABLE');
  const allowed = castSpell('enf_silenced_off', 'magic_missile', 1, {}, hybrid({ 'casting.components': false }), actor({ id: 'enf_silenced_off', conditions: ['Silenced'] }));
  assert.equal(allowed.success, true, 'components are ignored when the rule is off');

  const noMaterial = castSpell('enf_material', 'hold_person', 2, { materialComponentsAvailable: false });
  assert.equal(noMaterial.success, false);
  assert.equal(noMaterial.errorCode, 'COMPONENTS_UNAVAILABLE');
  assert.equal(castSpell('enf_material_ok', 'hold_person', 2).success, true, 'a focus is assumed by default');

  const costly = castSpell('enf_costly', 'identify', 1, {});
  assert.equal(costly.errorCode, 'COMPONENTS_UNAVAILABLE', 'a costly component needs an explicit yes');
  assert.equal(castSpell('enf_costly_ok', 'identify', 1, { materialComponentsAvailable: true }).errorCode === 'COMPONENTS_UNAVAILABLE', false);
});

test('counterspell: spends a level 3 slot, counters spells of that level or lower, rolls for higher ones, refused when off', () => {
  const name = 'enf_counter';
  spellRuntime.initializeSlots(name, { 3: { current: 1, max: 1 } });
  const first = spellRuntime.counterspell({ counterCasterId: name, targetSpellLevel: 3 });
  assert.equal(first.success, true);
  assert.equal(first.countered, true);
  assert.equal(spellRuntime.getOrCreateActorState(name).spellSlots[3].current, 0, 'the slot was spent');
  assert.equal(spellRuntime.counterspell({ counterCasterId: name, targetSpellLevel: 3 }).success, false, 'no slot left');

  const higher = 'enf_counter_high';
  spellRuntime.initializeSlots(higher, { 3: { current: 1, max: 1 } });
  const roll = spellRuntime.counterspell({ counterCasterId: higher, targetSpellLevel: 5 });
  assert.equal(roll.checkDc, 15, 'a level 5 spell needs a check against DC 15');
  assert.equal(typeof roll.checkTotal, 'number');

  const off = spellRuntime.counterspell({ counterCasterId: name, targetSpellLevel: 1, rulesProfile: hybrid({ 'casting.counterspell_dispel': false }) });
  assert.equal(off.success, false);
  assert.match(String(off.errorReason), /switched off/i);
});

test('dispel magic: ends a concentration effect of the slot level or lower', () => {
  const dispeller = 'enf_dispeller';
  const target = 'enf_concentrator';
  spellRuntime.initializeSlots(dispeller, { 3: { current: 1, max: 1 } });
  spellRuntime.initializeSlots(target, { 2: { current: 1, max: 1 } });
  const state = spellRuntime.getOrCreateActorState(target);
  state.activeConcentration = {
    spellId: 'hold_person', spellName: 'Hold Person', slotLevel: 2, castAtRound: 1, castAtTurn: 0,
    durationRounds: 10, remainingRounds: 5, casterId: target, targetIds: [], appliedConditions: [],
  } as any;
  const result = spellRuntime.dispelMagic({ dispellerId: dispeller, targetCasterId: target });
  assert.equal(result.dispelled, true);
  assert.equal(spellRuntime.getOrCreateActorState(target).activeConcentration, null);

  const off = spellRuntime.dispelMagic({ dispellerId: dispeller, targetCasterId: target, rulesProfile: hybrid({ 'casting.counterspell_dispel': false }) });
  assert.equal(off.success, false);
});

test('spell level cap: with slots off the caster level still caps the highest spell level', () => {
  const noSlots = hybrid({ 'casting.spell_slots': false });
  const capped = castSpell('enf_cap', 'ice_storm', 4, {}, noSlots);
  assert.equal(capped.errorCode, 'SPELL_LEVEL_EXCEEDS_CAP', 'a level 5 caster has no level 4 slots');
  const uncapped = castSpell('enf_cap_off', 'ice_storm', 4, {}, hybrid({ 'casting.spell_slots': false, 'casting.max_spell_level': false }));
  assert.notEqual(uncapped.errorCode, 'SPELL_LEVEL_EXCEEDS_CAP');
});

// ---------------------------------------------------------------- rest

function seededRepo(storyId: string, ruleToggles: Record<string, boolean>) {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(storyId);
  const id = repo.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId;
  repo.getConditionEngine(storyId).seedActor(id, { healthCurrent: 12, healthMax: 30 });
  repo.saveStoryRun({
    storyId, id: storyId, worldId: 'world_solar_archive', characterName: 'Rest Hero', storyMode: 'PROTAGONIST',
    dndRulesMode: 'HYBRID_DND', rulesProfile: hybrid(ruleToggles), ruleset: 'HYBRID_DND', generationSeed: 'enforce-rest',
    currentHp: 12, maxHp: 30, characterCoreStats: { level: 4, constitution: 14, hitDice: '1d8', hpCurrent: 12, hpMax: 30 },
  } as any);
  return { repo, id };
}

test('one long rest per day: a second long rest within 24 hours is refused unless the rule is off', () => {
  const longRest = (repo: InMemoryWorldRepository, storyId: string, id: string) =>
    repo.getRestRecoveryEngine(storyId).execute({ storyId, actorId: id, action: 'PERFORM', restType: 'LONG_REST' });
  const limited = seededRepo('enf_rest_limited', {});
  assert.equal(longRest(limited.repo, 'enf_rest_limited', limited.id).success, true);
  const second = longRest(limited.repo, 'enf_rest_limited', limited.id);
  assert.equal(second.success, false);
  assert.match(String(second.errorReason), /one long rest/i);

  const free = seededRepo('enf_rest_free', { 'rest.once_per_day_limit': false });
  assert.equal(longRest(free.repo, 'enf_rest_free', free.id).success, true);
  assert.equal(longRest(free.repo, 'enf_rest_free', free.id).success, true);
});

// ---------------------------------------------------------------- class features

function fighterEngine() {
  const engine = new CharacterProgressionEngine();
  engine.registerModules(getDndClassFeatureModules() as any);
  engine.seedFromCharacter('hero', { identity: { name: 'Hero', species: 'Human' }, role: { profession: 'Fighter' }, coreStats: { level: 1 } as any, feats: [] });
  engine.selectModule('hero', 'CLASS', 'dnd_class_fighter', 'enf-select-fighter', rulesProfileEngine.createDefault('FULL_DND'));
  engine.levelUp('hero', 'enf-level-2');
  return engine;
}

test('class features: the library is tagged with catalogue rules and covers every class rule', () => {
  const catalogueIds = new Set(RULES_CATALOGUE.map((rule) => rule.id));
  const used = classFeatureRuleIds();
  for (const id of used) assert.ok(catalogueIds.has(id), `${id} is not in the catalogue`);
  for (const rule of RULES_CATALOGUE.filter((entry) => entry.group === 'CLASS')) {
    assert.ok(used.includes(rule.id), `no library feature uses ${rule.id}`);
  }
});

test('class features: Full D&D applies passive modifiers and charge-limited abilities', () => {
  const engine = fighterEngine();
  const profile = rulesProfileEngine.createDefault('FULL_DND');
  const names = engine.getUnlockedFeatures('hero', profile).map((feature) => feature.id);
  assert.ok(names.includes('dnd_fighter_second_wind'));
  assert.ok(names.includes('dnd_fighter_action_surge'));
  const armor = engine.resolveModifiers('hero', profile).modifiers.find((entry) => entry.target === 'coreStats.armorClass');
  assert.equal(armor?.value, 1, 'the Defense style adds +1 armor class');
  engine.consumeTriggeredAbility('hero', 'dnd_fighter_second_wind_use', 'enf-second-wind', profile);
  assert.throws(() => engine.consumeTriggeredAbility('hero', 'dnd_fighter_second_wind_use', 'enf-second-wind-2', profile), /no charges/i);
});

test('class features: switching a class rule off hides its features, modifiers and abilities', () => {
  const engine = fighterEngine();
  const off = hybrid({ 'class.fighter_features': false });
  assert.equal(engine.getUnlockedFeatures('hero', off).some((feature) => feature.ruleId === 'class.fighter_features'), false);
  assert.equal(engine.resolveModifiers('hero', off).modifiers.some((entry) => entry.target === 'coreStats.armorClass'), false);
  assert.throws(() => engine.consumeTriggeredAbility('hero', 'dnd_fighter_second_wind_use', 'enf-off', off), /not unlocked/i);
  const on = hybrid({});
  assert.ok(engine.getUnlockedFeatures('hero', on).some((feature) => feature.id === 'dnd_fighter_second_wind'));
});

test('catalogue: no toggleable rule is still marked as pending except spell DC and attack bonus', () => {
  const pending = RULES_CATALOGUE.filter((rule) => !['CORE', 'CONDITIONS', 'EQUIPMENT', 'EXPLORATION'].includes(rule.group) && rule.status === 'pending');
  assert.deepEqual(pending.map((rule) => rule.id), ['casting.save_dc_attack_bonus']);
});
