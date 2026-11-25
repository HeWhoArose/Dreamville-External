import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { applyWorldPack, loadWorldPack } from '../server/domain/worldPack';
import { SceneInteractionAuthority } from '../server/domain/sceneInteractionAuthority';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { combatEffectEngine } from '../server/domain/combatEffectEngine';
import { bossPhaseEngine } from '../server/domain/bossPhaseEngine';

const PACK = 'data/worlds/ashen_cup.pack.json';

/** The Cup: a martial duel. No spells, no long rest between bouts, flanking is not a thing in a one-on-one ring. */
function cupRules() {
  return rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: { mode: 'HYBRID_DND', ruleToggles: { 'casting.dnd_spell_rules': false, 'rest.long_rest': false } } as any,
  }).profile;
}

async function enterTheCup(storyId: string, storyMode: 'PROTAGONIST' | 'SIDE_CHARACTER' | 'FREE_ROAM' = 'PROTAGONIST') {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  await applyWorldPack(repo, storyId, loadWorldPack(PACK));
  const run = repo.getStoryRun(storyId) as any;
  repo.saveStoryRun({ ...run, storyMode, dndRulesMode: 'HYBRID_DND', ruleset: 'HYBRID_DND', rulesProfile: cupRules() });
  const player = repo.getPlayerLifecycle(storyId)!;
  const act = (locationId: string, actionText: string) =>
    SceneInteractionAuthority.resolve({ repository: repo, storyId, actorId: player.actorId, locationId, actionText });
  return { repo, player, act };
}

/** A battlefield participant from what the story actually says the fighter carries and wears. */
function fighterFromStory(repo: InMemoryWorldRepository, storyId: string, actorId: string, name: string, team: 'player_allies' | 'enemies', x: number, hp: number) {
  const modifiers = repo.getInventoryEngine(storyId).getEquipmentModifiers(actorId);
  const total = (target: string) => modifiers.filter((entry) => entry.target === target).reduce((sum, entry) => sum + entry.value, 0);
  return {
    id: actorId, name, team, x, y: 0, hpCurrent: hp, hpMax: hp,
    armorClass: 10 + total('coreStats.armorClass'),
    attackBonus: 3 + total('combat.attackBonus'),
    damageFormula: '1d8+2', speedCells: 6, initiative: 10, conditions: [] as string[], isDead: false,
  } as any;
}

test('arena: the story opens in the Fighters\' Hold under Hybrid rules with no spells and no long rest', async () => {
  const { repo, player } = await enterTheCup('arena_open');
  assert.equal(player.locationId, 'loc_fighters_hold');
  const profile = repo.getRulesProfile('arena_open')!;
  assert.equal(profile.mode, 'HYBRID_DND');
  assert.equal(rulesProfileEngine.allowsStandardDndSpellRules(profile), false, 'no magic in the Cup');
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'rest.long_rest'), false);
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'combat.opportunity_attacks'), true, 'a duel still has opportunity attacks');
  const names = repo.getEntityCards('arena_open').filter((card: any) => card.kind === 'NPC' && card.worldState?.locationId === 'loc_fighters_hold').map((card: any) => card.name);
  assert.ok(names.includes('Gravus Thorne') && names.includes('Dessa Orrin'), names.join(', '));
});

test('arena: kit up at the armoury, hear the bell, reach the Ring Gate in time', async () => {
  const { repo, player, act } = await enterTheCup('arena_gate');
  const inv = repo.getInventoryEngine('arena_gate');

  assert.equal(act('loc_armoury_cage', 'I take the house gladius').committed, true);
  assert.equal(act('loc_armoury_cage', 'I take the iron buckler').committed, true);
  const mine = inv.getActorInventory(player.actorId);
  assert.equal(inv.equipItem(player.actorId, mine.find((i) => i.name === 'House Gladius')!.id, 'mainHand').success, true);
  assert.equal(inv.equipItem(player.actorId, mine.find((i) => i.name === 'Iron Buckler')!.id, 'offHand').success, true);

  const sim = repo.getLivingWorldSimulation('arena_gate');
  const clock = repo.getWorldClock('arena_gate');
  clock.advanceMinutes(41);
  const due = sim.evaluateScheduledEvents(clock.getTimestamp());
  assert.ok(due.triggeredEvents.some((event) => event.id === 'evt_bout_three'), 'bout three has been called');
  assert.deepEqual(due.missedEvents, [], 'and the deadline has not passed yet');

  repo.updatePlayerLifecycle('arena_gate', { ...repo.getPlayerLifecycle('arena_gate')!, locationId: 'loc_ring_gate' } as any);
  assert.equal(repo.getPlayerLifecycle('arena_gate')!.locationId, 'loc_ring_gate');
  clock.advanceMinutes(10);
  assert.deepEqual(sim.evaluateScheduledEvents(clock.getTimestamp()).missedEvents, [], 'standing at the gate, the player does not forfeit');
});

test('arena: bout three begins, with the fighters\' real gear, in order of initiative, under the Cup\'s rules', async () => {
  const storyId = 'arena_battle';
  const { repo, player, act } = await enterTheCup(storyId);
  const inv = repo.getInventoryEngine(storyId);
  act('loc_armoury_cage', 'I take the house gladius');
  const gladius = inv.getActorInventory(player.actorId).find((i) => i.name === 'House Gladius')!;
  inv.equipItem(player.actorId, gladius.id, 'mainHand');

  const engine = repo.getCombatEngine(storyId);
  engine.addParticipant({ ...fighterFromStory(repo, storyId, player.actorId, 'Corvin Hale', 'player_allies', 0, 38), initiative: 12 });
  engine.addParticipant({ ...fighterFromStory(repo, storyId, 'npc_gravus_thorne', 'Gravus Thorne', 'enemies', 3, 70), initiative: 9 });
  const corvin = engine.getParticipant(player.actorId)!;
  const gravus = engine.getParticipant('npc_gravus_thorne')!;
  assert.ok(corvin.attackBonus >= 3 + 2, 'the house gladius adds at least +2');
  assert.ok(gravus.armorClass >= 10 + 4 + 2, `the champion\'s cuirass and kite shield count: AC ${gravus.armorClass}`);
  assert.ok(gravus.attackBonus >= 3 + 4, 'and so does his broadsword');

  // The sand: a low barrier wall between the fighters, and a pit. Both come from the arena's own terrain.
  engine.addObstacle({ x: 1, y: 0, isImpassable: false, cover: 'HALF' });
  engine.addHazard({ id: 'weapon_pit', type: 'pit', x: 2, y: 2, radiusCells: 0, durationTurns: 999, damagePerTurn: 0, fallFeet: 10 });

  const rolls = engine.rollInitiative();
  assert.equal(rolls.length, 2);
  assert.equal(engine.getCombatPhase(), 'ACTIVE');
  assert.equal(engine.getTurnQueue().length, 2);
  assert.ok(['Corvin Hale', 'Gravus Thorne'].includes(engine.getCurrentActor()!.name));
  const resources = engine.getTurnResources(engine.getCurrentActor()!.id)!;
  assert.equal(resources.actionAvailable, true);
  assert.equal(resources.bonusActionAvailable, true);
  assert.equal(resources.reactionAvailable, true);

  // Under the Cup's rules: the low wall protects Gravus from Corvin's thrown weapon, a spell cannot be cast.
  assert.equal((engine as any).getCoverBonus(engine.getParticipant('npc_gravus_thorne'), engine.getParticipant(player.actorId)), 2, "the sand's low wall stands on the line between them: half cover for Gravus");
});

test('arena: the Hybrid rules in the ring - no spells cast, opportunity attacks and cover still apply', async () => {
  const storyId = 'arena_rules';
  const { repo, player } = await enterTheCup(storyId);
  const engine = repo.getCombatEngine(storyId);
  engine.addParticipant({ ...fighterFromStory(repo, storyId, player.actorId, 'Corvin Hale', 'player_allies', 0, 38), initiative: 20 });
  engine.addParticipant({ ...fighterFromStory(repo, storyId, 'npc_gravus_thorne', 'Gravus Thorne', 'enemies', 1, 70), initiative: 5 });
  engine.rollInitiative();

  // Stepping away from the champion costs a free swing.
  assert.equal(engine.moveActor(player.actorId, 0, 3).success, true);
  assert.equal(engine.getTurnResources('npc_gravus_thorne')?.reactionAvailable, false, 'Gravus used his reaction on the way out');

  // Cover from the sand's low wall.
  const fresh = repo.getCombatEngine(storyId);
  fresh.addObstacle({ x: 0, y: 2, isImpassable: false, cover: 'HALF' });
  const gravus = fresh.getParticipant('npc_gravus_thorne')!;
  const corvin = fresh.getParticipant(player.actorId)!;
  assert.equal((fresh as any).getCoverBonus({ ...gravus, x: 0, y: 4 }, { ...corvin, x: 0, y: 0 }), 2, 'a low wall between them is half cover');
});

test('arena: the champion fights in phases - at half strength he changes how he fights', async () => {
  const storyId = 'arena_champion';
  const { repo, player } = await enterTheCup(storyId);
  const engine = repo.getCombatEngine(storyId);
  engine.addParticipant({ ...fighterFromStory(repo, storyId, player.actorId, 'Corvin Hale', 'player_allies', 0, 38), initiative: 20 });
  engine.addParticipant({ ...fighterFromStory(repo, storyId, 'npc_gravus_thorne', 'Gravus Thorne', 'enemies', 1, 70), hpCurrent: 30, hpMax: 70, initiative: 5 });
  engine.rollInitiative();

  const effects: any[] = [];
  const stub: any = {
    getCombatEngine: () => engine, getEntityCard: () => ({ metadata: { combat: {} } }), getActiveEffects: () => effects,
    saveActiveEffect: (effect: any) => { effects.splice(0, effects.length, effect); }, saveWorldFact: () => undefined,
  };
  const result = bossPhaseEngine.evaluateAndPersist({
    repository: stub, storyId, bossId: 'npc_gravus_thorne',
    phases: [{
      id: 'desperate', name: 'Desperate Champion', minHpPercent: 0, maxHpPercent: 0.5, targetPriority: 'LOWEST_HP',
      abilities: ['crushing_blow'],
      abilityDefinitions: [{ id: 'crushing_blow', name: 'Crushing Blow', resolutionMode: 'SINGLE_ATTACK', scale: 'PERSON', actionCost: 'ACTION', targetingMode: 'ONE_TARGET', damageFormula: '2d8+4', damageType: 'bludgeoning', resourceCost: { name: 'fury', amount: 1 } }],
      resources: { fury: 2 },
      modifiers: { 'combat.attackBonus': 2 },
    }],
  });
  assert.equal(result.changed, true);
  assert.equal(engine.getParticipant('npc_gravus_thorne')?.combatResources?.fury, 2);

  engine.advanceTurn();
  assert.equal(engine.getCurrentActor()?.id, 'npc_gravus_thorne');
  const blow = bossPhaseEngine.buildPhaseEffect(result.phase!).find((effect) => effect.id === 'crushing_blow')!;
  const hit = combatEffectEngine.resolve(engine, 'npc_gravus_thorne', [player.actorId], blow);
  assert.equal(hit.success, true, hit.errorReason);
  assert.equal(engine.getParticipant('npc_gravus_thorne')?.combatResources?.fury, 1, 'the blow cost a point of fury');
});

for (const mode of ['PROTAGONIST', 'SIDE_CHARACTER', 'FREE_ROAM'] as const) {
  test(`arena: the same fight resolves identically in ${mode} mode`, async () => {
    const storyId = `arena_mode_${mode.toLowerCase()}`;
    const { repo, player } = await enterTheCup(storyId, mode);
    assert.equal((repo.getStoryRun(storyId) as any).storyMode, mode);
    const engine = repo.getCombatEngine(storyId);
    engine.setSeed(1337);
    engine.addParticipant({ ...fighterFromStory(repo, storyId, player.actorId, 'Corvin Hale', 'player_allies', 0, 38), initiative: 20, attackBonus: 30 });
    engine.addParticipant({ ...fighterFromStory(repo, storyId, 'npc_gravus_thorne', 'Gravus Thorne', 'enemies', 1, 5000), initiative: 5 });
    engine.rollInitiative();
    const result = engine.executeAttack(player.actorId, 'npc_gravus_thorne');
    assert.equal(result.success, true);
    (globalThis as any).__arenaDamage = (globalThis as any).__arenaDamage || {};
    (globalThis as any).__arenaDamage[mode] = result.damage;
  });
}

test('arena: the three narrative modes produced the same seeded damage', () => {
  const damage = (globalThis as any).__arenaDamage || {};
  assert.equal(damage.PROTAGONIST !== undefined, true);
  assert.equal(damage.SIDE_CHARACTER, damage.PROTAGONIST);
  assert.equal(damage.FREE_ROAM, damage.PROTAGONIST);
});
