import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { applyWorldPack, loadWorldPack } from '../server/domain/worldPack';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';

const PACK = 'data/worlds/ashen_cup.pack.json';

function hybrid(ruleToggles: Record<string, boolean>) {
  return rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: { mode: 'HYBRID_DND', ruleToggles } as any,
  }).profile;
}

function fighter(overrides: Record<string, unknown>) {
  return {
    id: 'corvin',
    name: 'Corvin Hale',
    x: 0,
    y: 0,
    initiative: 20,
    initiativeModifier: 100,
    team: 'player_allies' as const,
    hpCurrent: 40,
    hpMax: 40,
    armorClass: 14,
    speedCells: 6,
    attackBonus: 6,
    damageFormula: '1d8+3',
    conditions: [],
    saveModifiers: { STR: 3, DEX: 1 },
    isDead: false,
    ...overrides,
  } as any;
}

async function arenaStory(storyId: string, toggles: Record<string, boolean>) {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  await applyWorldPack(repo, storyId, loadWorldPack(PACK));
  const run = repo.getStoryRun(storyId) as any;
  repo.saveStoryRun({ ...run, dndRulesMode: 'HYBRID_DND', ruleset: 'HYBRID_DND', rulesProfile: hybrid(toggles) });
  return repo;
}

test('the Ashen Cup arena story carries a Hybrid rules profile down to its combat engine', async () => {
  const storyId = 'arena_rules_flow';
  const repo = await arenaStory(storyId, { 'combat.flanking': true, 'combat.opportunity_attacks': false });
  const profile = repo.getRulesProfile(storyId)!;
  assert.equal(profile.mode, 'HYBRID_DND');
  const engine = repo.getCombatEngine(storyId) as any;
  assert.equal(engine.ruleIsOn('combat.flanking'), true, 'flanking was switched on for this arena');
  assert.equal(engine.ruleIsOn('combat.opportunity_attacks'), false);
  assert.equal(engine.ruleIsOn('combat.cover'), true, 'unlisted rules keep their defaults');
});

test('in the arena with opportunity attacks off, stepping away from Gravus Thorne provokes nothing', async () => {
  const withRule = await arenaStory('arena_oa_on', {});
  const without = await arenaStory('arena_oa_off', { 'combat.opportunity_attacks': false });
  const run = (repo: InMemoryWorldRepository, storyId: string) => {
    const engine = repo.getCombatEngine(storyId);
    engine.addParticipant(fighter({}));
    engine.addParticipant(fighter({ id: 'gravus', name: 'Gravus Thorne', x: 0, y: 1, team: 'enemies', initiative: 1, initiativeModifier: 0, hpCurrent: 80, hpMax: 80 }));
    engine.rollInitiative();
    assert.equal(engine.moveActor('corvin', 3, 0).success, true);
    return engine.getTurnResources('gravus')?.reactionAvailable;
  };
  assert.equal(run(withRule, 'arena_oa_on'), false, 'Gravus takes his free swing as Corvin retreats');
  assert.equal(run(without, 'arena_oa_off'), true, 'with the rule off he keeps his reaction');
});

test('the arena duel with Extra Attack on gives a veteran two swings per action; off it gives one', async () => {
  const swings = async (toggles: Record<string, boolean>, storyId: string) => {
    const repo = await arenaStory(storyId, toggles);
    const engine = repo.getCombatEngine(storyId);
    engine.addParticipant(fighter({ attacksPerAction: 2 }));
    engine.addParticipant(fighter({ id: 'gravus', name: 'Gravus Thorne', x: 1, y: 0, team: 'enemies', initiative: 1, initiativeModifier: 0, hpCurrent: 500, hpMax: 500 }));
    engine.rollInitiative();
    let count = 0;
    while (count < 5 && engine.executeAttack('corvin', 'gravus').success) count += 1;
    return count;
  };
  assert.equal(await swings({}, 'arena_swings_on'), 2);
  assert.equal(await swings({ 'combat.extra_attack': false }, 'arena_swings_off'), 1);
});
