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

function fightWithEnemyBeside(profile?: ReturnType<typeof hybrid>) {
  const engine = new TacticalCombatEngine(1337);
  if (profile) engine.setRulesProfile(profile);
  engine.addParticipant(actor());
  engine.addParticipant(actor({ id: 'enemy', name: 'Enemy', x: 0, y: 1, team: 'enemies', initiative: 10, attackBonus: 20 }));
  engine.rollInitiative();
  return engine;
}

test('opportunity attacks: on by default, gone when the rule is switched off', () => {
  const standard = fightWithEnemyBeside();
  assert.equal(standard.moveActor('hero', 3, 0).success, true);
  assert.equal(standard.getTurnResources('enemy')?.reactionAvailable, false, 'the enemy used its reaction');

  const off = fightWithEnemyBeside(hybrid({ 'combat.opportunity_attacks': false }));
  assert.equal(off.moveActor('hero', 3, 0).success, true);
  assert.equal(off.getTurnResources('enemy')?.reactionAvailable, true, 'no opportunity attack was provoked');
});

test('opportunity attacks stay on when only an unrelated rule is switched off', () => {
  const engine = fightWithEnemyBeside(hybrid({ 'combat.cover': false }));
  assert.equal(engine.moveActor('hero', 3, 0).success, true);
  assert.equal(engine.getTurnResources('enemy')?.reactionAvailable, false);
});

test('cover: half and three-quarters cover add to armor class unless the rule is off', () => {
  const covered = actor({ id: 'target', cover: 'THREE_QUARTERS' });
  const standard = fightWithEnemyBeside();
  assert.equal((standard as any).getCoverBonus(covered), 5);
  const off = fightWithEnemyBeside(hybrid({ 'combat.cover': false }));
  assert.equal((off as any).getCoverBonus(covered), 0);
  const cascaded = fightWithEnemyBeside(hybrid({ 'combat.tactical_combat': false }));
  assert.equal((cascaded as any).getCoverBonus(covered), 0, 'cover needs tactical combat');
});

function castMagicMissile(actorId: string, profile?: ReturnType<typeof hybrid>) {
  return spellRuntime.castSpellAuthoritative({
    request: { casterId: actorId, spellId: 'magic_missile', targetId: 'dummy', slotLevel: 1, allowSyntheticTarget: true, rulesProfile: profile } as any,
  });
}

test('spell slots: casting spends a slot by default and spends none when the rule is off', () => {
  const standardCaster = 'toggle_caster_standard';
  spellRuntime.initializeSlots(standardCaster, { 1: { current: 2, max: 2 } });
  spellRuntime.learnSpell(standardCaster, 'magic_missile');
  spellRuntime.prepareSpell(standardCaster, 'magic_missile');
  assert.equal(castMagicMissile(standardCaster).success, true);
  assert.equal(spellRuntime.getOrCreateActorState(standardCaster).spellSlots[1].current, 1);

  const freeCaster = 'toggle_caster_free';
  const profile = hybrid({ 'casting.spell_slots': false });
  spellRuntime.initializeSlots(freeCaster, { 1: { current: 0, max: 2 } });
  spellRuntime.learnSpell(freeCaster, 'magic_missile');
  spellRuntime.prepareSpell(freeCaster, 'magic_missile');
  const cast = castMagicMissile(freeCaster, profile);
  assert.equal(cast.success, true, 'a caster with no slots can still cast when slots are off');
  assert.equal(spellRuntime.getOrCreateActorState(freeCaster).spellSlots[1].current, 0, 'nothing was spent');

  const emptyCaster = 'toggle_caster_empty';
  spellRuntime.initializeSlots(emptyCaster, { 1: { current: 0, max: 2 } });
  spellRuntime.learnSpell(emptyCaster, 'magic_missile');
  spellRuntime.prepareSpell(emptyCaster, 'magic_missile');
  const refused = castMagicMissile(emptyCaster, hybrid({}));
  assert.equal(refused.success, false);
  assert.equal(refused.errorCode, 'INSUFFICIENT_SPELL_SLOTS', 'with slots on, an empty caster is still refused');
});

function seededRepo(storyId: string, ruleToggles: Record<string, boolean>) {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(storyId);
  const id = repo.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId;
  repo.getConditionEngine(storyId).seedActor(id, { healthCurrent: 12, healthMax: 30 });
  repo.saveStoryRun({
    storyId,
    id: storyId,
    worldId: 'world_solar_archive',
    characterName: 'Toggle Hero',
    storyMode: 'PROTAGONIST',
    dndRulesMode: 'HYBRID_DND',
    rulesProfile: hybrid(ruleToggles),
    ruleset: 'HYBRID_DND',
    generationSeed: 'toggle-tests',
    currentHp: 12,
    maxHp: 30,
    characterCoreStats: { level: 4, constitution: 14, hitDice: '1d8', hpCurrent: 12, hpMax: 30 },
  } as any);
  return { repo, id };
}

test('rest: a switched-off long rest is refused and a short rest still works', () => {
  const { repo, id } = seededRepo('toggle_rest_long', { 'rest.long_rest': false });
  const engine = repo.getRestRecoveryEngine('toggle_rest_long');
  const long = engine.execute({ storyId: 'toggle_rest_long', actorId: id, action: 'PERFORM', restType: 'LONG_REST' });
  assert.equal(long.success, false);
  assert.match(String(long.errorReason), /long rests are switched off/i);
  const short = engine.execute({ storyId: 'toggle_rest_long', actorId: id, action: 'PERFORM', restType: 'SHORT_REST', hitDiceToSpend: 1 });
  assert.equal(short.success, true);
});

test('rest: with slot recovery off a long rest heals but does not return spell slots', () => {
  const storyId = 'toggle_rest_slots';
  const { repo, id } = seededRepo(storyId, { 'rest.slot_recovery': false });
  const spells = repo.getCombatEngine(storyId).getSpellRuntime();
  spells.initializeSlots(id, { 1: { current: 0, max: 2 } });
  const result = repo.getRestRecoveryEngine(storyId).execute({ storyId, actorId: id, action: 'PERFORM', restType: 'LONG_REST' });
  assert.equal(result.success, true);
  assert.equal(repo.getConditionEngine(storyId).getActorState(id)?.healthCurrent, 30, 'hit points still return');
  assert.equal(spells.getActorState(id)?.spellSlots[1].current, 0, 'slots stay empty');
});

test('rest: with the gritty realism variant on, a long rest takes a week of world time', () => {
  const storyId = 'toggle_rest_gritty';
  const { repo, id } = seededRepo(storyId, { 'rest.gritty_realism': true });
  const before = repo.getWorldClock(storyId).getAbsoluteTime();
  const result = repo.getRestRecoveryEngine(storyId).execute({ storyId, actorId: id, action: 'PERFORM', restType: 'LONG_REST' });
  assert.equal(result.success, true);
  assert.equal(repo.getWorldClock(storyId).getAbsoluteTime(), before + 7 * 24 * 3600);
});

test('rest: Hybrid without switches rests exactly as Full D&D does', () => {
  const storyId = 'toggle_rest_default';
  const { repo, id } = seededRepo(storyId, {});
  const before = repo.getWorldClock(storyId).getAbsoluteTime();
  const result = repo.getRestRecoveryEngine(storyId).execute({ storyId, actorId: id, action: 'PERFORM', restType: 'LONG_REST' });
  assert.equal(result.success, true);
  assert.equal(repo.getWorldClock(storyId).getAbsoluteTime(), before + 8 * 3600);
});

test('Custom Homebrew keeps its explicit gates: a rule not switched off is not blocked by the catalogue', () => {
  const custom = rulesProfileEngine.resolve({ mode: 'CUSTOM_HOMEBREW_DND' }).profile;
  assert.equal(rulesProfileEngine.rulePermits(custom, 'rest.long_rest'), true);
  assert.equal(rulesProfileEngine.rulePermits(custom, 'casting.spell_slots'), true);
  const switchedOff = rulesProfileEngine.resolve({
    mode: 'CUSTOM_HOMEBREW_DND',
    rulesProfile: { mode: 'CUSTOM_HOMEBREW_DND', ruleToggles: { 'casting.spell_slots': false } } as any,
  }).profile;
  assert.equal(rulesProfileEngine.rulePermits(switchedOff, 'casting.spell_slots'), false);
  assert.equal(rulesProfileEngine.rulePermits(null, 'casting.spell_slots'), true, 'no profile: standard rules');
});
