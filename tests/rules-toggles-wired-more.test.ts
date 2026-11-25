import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { spellRuntime } from '../server/domain/spellRuntime';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function hybrid(ruleToggles: Record<string, boolean>) {
  return rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: { mode: 'HYBRID_DND', ruleToggles } as any,
  }).profile;
}

function custom(ruleToggles: Record<string, boolean>) {
  return rulesProfileEngine.resolve({
    mode: 'CUSTOM_HOMEBREW_DND',
    rulesProfile: { mode: 'CUSTOM_HOMEBREW_DND', ruleToggles } as any,
  }).profile;
}

function actor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hero',
    name: 'Hero',
    x: 0,
    y: 0,
    initiative: 20,
    team: 'player_allies' as const,
    hpCurrent: 30,
    hpMax: 30,
    armorClass: 12,
    speedCells: 6,
    attackBonus: 8,
    damageFormula: '1d6+2',
    conditions: [],
    saveModifiers: { STR: 2, DEX: 2 },
    isDead: false,
    ...overrides,
  } as any;
}

function flankingFight(profile: ReturnType<typeof hybrid> | undefined, allyAt: { x: number; y: number }) {
  const engine = new TacticalCombatEngine(1337);
  if (profile) engine.setRulesProfile(profile);
  engine.addParticipant(actor({ id: 'hero', x: 0, y: 1 }));
  engine.addParticipant(actor({ id: 'friend', name: 'Friend', x: allyAt.x, y: allyAt.y, initiative: 15 }));
  engine.addParticipant(actor({ id: 'enemy', name: 'Enemy', x: 1, y: 1, team: 'enemies', initiative: 10 }));
  return engine;
}

const get = (engine: TacticalCombatEngine, id: string) => (engine as any).participants.get(id);

test('flanking: an optional rule, off by default, advantage when an able ally stands opposite', () => {
  assert.equal((flankingFight(undefined, { x: 2, y: 1 }) as any).ruleIsOn('combat.flanking'), false, 'off in Full D&D');
  assert.equal((flankingFight(hybrid({}), { x: 2, y: 1 }) as any).ruleIsOn('combat.flanking'), false, 'off in Hybrid by default');

  const on = flankingFight(hybrid({ 'combat.flanking': true }), { x: 2, y: 1 });
  assert.equal((on as any).ruleIsOn('combat.flanking'), true);
  assert.equal((on as any).isFlanking(get(on, 'hero'), get(on, 'enemy'), 1), true, 'ally opposite flanks');

  const rightAngle = flankingFight(hybrid({ 'combat.flanking': true }), { x: 1, y: 0 });
  assert.equal((rightAngle as any).isFlanking(get(rightAngle, 'hero'), get(rightAngle, 'enemy'), 1), false, 'a right angle does not flank');

  const downed = flankingFight(hybrid({ 'combat.flanking': true }), { x: 2, y: 1 });
  get(downed, 'friend').conditions = ['Unconscious'];
  assert.equal((downed as any).isFlanking(get(downed, 'hero'), get(downed, 'enemy'), 1), false, 'an unconscious ally does not flank');
});

test('grapple and shove: refused when the rule is off', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.setRulesProfile(hybrid({ 'combat.grapple_shove': false }));
  engine.addParticipant(actor());
  engine.addParticipant(actor({ id: 'enemy', name: 'Enemy', x: 1, y: 0, team: 'enemies', initiative: 10 }));
  engine.rollInitiative();
  const result = engine.executeGrapple('hero', 'enemy');
  assert.equal(result.success, false);
  assert.match(String(result.errorReason), /switched off/i);
});

test('death saves: a combatant that would use them does not when the rule is off', () => {
  const on = new TacticalCombatEngine(1337);
  on.addParticipant(actor({ usesDeathSaves: true }));
  assert.ok(get(on, 'hero').deathSaveState, 'death save state exists by default');
  const off = new TacticalCombatEngine(1337);
  off.setRulesProfile(hybrid({ 'combat.death_saves': false }));
  off.addParticipant(actor({ usesDeathSaves: true }));
  assert.equal(get(off, 'hero').usesDeathSaves, false);
  assert.equal(get(off, 'hero').deathSaveState, undefined);
});

test('surprise: a surprised actor is ignored when the rule is off', () => {
  const makeFight = (profile?: ReturnType<typeof hybrid>) => {
    const engine = new TacticalCombatEngine(1337);
    if (profile) engine.setRulesProfile(profile);
    engine.addParticipant(actor());
    engine.addParticipant(actor({ id: 'enemy', name: 'Enemy', x: 3, y: 0, team: 'enemies', initiative: 10 }));
    engine.setSurprisedActors(['enemy']);
    return engine;
  };
  assert.deepEqual(makeFight().getSurprisedActorIds(), ['enemy']);
  assert.deepEqual(makeFight(hybrid({ 'combat.surprise': false })).getSurprisedActorIds(), []);
});

function castAt(name: string, slotLevel: number, profile?: ReturnType<typeof hybrid>, spellId = 'magic_missile') {
  return spellRuntime.castSpellAuthoritative({
    request: { casterId: name, spellId, targetId: 'dummy', slotLevel, allowSyntheticTarget: true, rulesProfile: profile } as any,
  });
}

function prepareCaster(name: string, slots: number) {
  spellRuntime.initializeSlots(name, { 1: { current: slots, max: slots }, 2: { current: slots, max: slots } });
  spellRuntime.learnSpell(name, 'magic_missile');
  spellRuntime.prepareSpell(name, 'magic_missile');
}

test('upcasting: success either way; extra dice are not added when upcasting is off', () => {
  prepareCaster('more_upcaster_on', 2);
  prepareCaster('more_upcaster_off', 2);
  const upcast = castAt('more_upcaster_on', 2);
  const flat = castAt('more_upcaster_off', 2, hybrid({ 'casting.upcasting': false }));
  assert.equal(upcast.success, true);
  assert.equal(flat.success, true);
  assert.equal(flat.slotLevelUsed, 2, 'the slot is still the one the player chose');
});

test('spells known and prepared: an unprepared spell can be cast when the limit is off', () => {
  const name = 'more_unprepared';
  spellRuntime.initializeSlots(name, { 1: { current: 2, max: 2 } });
  const state = spellRuntime.getOrCreateActorState(name);
  state.knownSpells = ['magic_missile'];
  state.preparedSpells = [];
  state.requiresPreparation = true;
  const refused = castAt(name, 1);
  assert.equal(refused.success, false);
  assert.equal(refused.errorCode, 'SPELL_NOT_PREPARED');
  assert.equal(castAt(name, 1, hybrid({ 'casting.prepared_known_limits': false })).success, true);
});

test('Custom Homebrew: ticking rules on enables them; unticked rules stay off', () => {
  const profile = custom({ 'casting.dnd_spell_rules': true, 'casting.spell_slots': true, 'combat.tactical_combat': true, 'rest.recovery': true });
  assert.equal(rulesProfileEngine.allowsStandardDndSpellRules(profile), true);
  assert.equal(rulesProfileEngine.allowsDndTacticalCombat(profile), true);
  assert.equal(rulesProfileEngine.allowsStandardRestRules(profile), true);
  assert.equal(profile.baseRuleset, 'NONE', 'Custom never silently adopts the D&D base ruleset');
  assert.equal(rulesProfileEngine.rulePermits(profile, 'casting.spell_slots'), true);
  assert.equal(rulesProfileEngine.rulePermits(profile, 'combat.cover'), false, 'unticked cover stays off');
  assert.equal(rulesProfileEngine.rulePermits(profile, 'casting.upcasting'), false, 'unticked upcasting stays off');
});

test('Custom Homebrew with spell slots ticked enforces slot spending', () => {
  const name = 'more_custom_slots';
  spellRuntime.initializeSlots(name, { 1: { current: 0, max: 2 } });
  spellRuntime.learnSpell(name, 'magic_missile');
  spellRuntime.prepareSpell(name, 'magic_missile');
  const refused = castAt(name, 1, custom({ 'casting.dnd_spell_rules': true, 'casting.spell_slots': true }));
  assert.equal(refused.success, false);
  assert.equal(refused.errorCode, 'INSUFFICIENT_SPELL_SLOTS');
});

function customRepo(toggles: Record<string, boolean>, storyId: string) {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(storyId);
  const id = repo.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId;
  repo.getConditionEngine(storyId).seedActor(id, { healthCurrent: 12, healthMax: 30 });
  repo.saveStoryRun({
    storyId,
    id: storyId,
    worldId: 'world_solar_archive',
    characterName: 'Custom Hero',
    storyMode: 'PROTAGONIST',
    dndRulesMode: 'CUSTOM_HOMEBREW_DND',
    rulesProfile: custom(toggles),
    ruleset: 'CUSTOM_HOMEBREW_DND',
    generationSeed: 'custom-rest',
    currentHp: 12,
    maxHp: 30,
    characterCoreStats: { level: 4, constitution: 14, hitDice: '1d8', hpCurrent: 12, hpMax: 30 },
  } as any);
  return { repo, id };
}

test('Custom Homebrew rest: ticking rest recovery makes rest available with the default policy', () => {
  const without = customRepo({}, 'more_custom_rest_none');
  const refused = without.repo.getRestRecoveryEngine('more_custom_rest_none').execute({ storyId: 'more_custom_rest_none', actorId: without.id, action: 'PERFORM', restType: 'LONG_REST' });
  assert.equal(refused.success, false);
  const ticked = customRepo({ 'rest.recovery': true, 'rest.short_rest': true, 'rest.long_rest': true }, 'more_custom_rest_ticked');
  const result = ticked.repo.getRestRecoveryEngine('more_custom_rest_ticked').execute({ storyId: 'more_custom_rest_ticked', actorId: ticked.id, action: 'PERFORM', restType: 'LONG_REST' });
  assert.equal(result.success, true);
});
