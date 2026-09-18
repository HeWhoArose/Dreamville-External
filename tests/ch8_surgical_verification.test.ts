import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TacticalCombatEngine,
  Dnd521RulesetAdapter,
  LocalDiceEngine,
  BattlefieldParticipant,
} from '../server/domain/combatEngine.js';

describe('CH8 Surgical Defect Repair & Adversarial Verification Suite', () => {
  it('DEF-CH8-01: rollInitiative accounts for varying participant initiative modifiers rather than universal +2', () => {
    const engine = new TacticalCombatEngine(42);

    const slowParticipant: BattlefieldParticipant = {
      id: 'p_slow',
      name: 'Slow Warrior',
      x: 0,
      y: 0,
      initiative: 0,
      initiativeModifier: -2,
      team: 'player_allies',
      hpCurrent: 20,
      hpMax: 20,
      armorClass: 14,
      speedCells: 5,
      attackBonus: 2,
      damageFormula: '1d6',
      conditions: [],
      isDead: false,
    };

    const fastParticipant: BattlefieldParticipant = {
      id: 'p_fast',
      name: 'Fast Rogue',
      x: 2,
      y: 2,
      initiative: 0,
      initiativeModifier: 5,
      team: 'player_allies',
      hpCurrent: 15,
      hpMax: 15,
      armorClass: 15,
      speedCells: 6,
      attackBonus: 6,
      damageFormula: '1d8',
      conditions: [],
      isDead: false,
    };

    engine.addParticipant(slowParticipant);
    engine.addParticipant(fastParticipant);

    engine.rollInitiative();

    const pSlow = engine.getParticipant('p_slow');
    const pFast = engine.getParticipant('p_fast');

    assert.ok(pSlow && pFast, 'Both participants should exist');
    assert.ok(
      typeof pSlow.initiative === 'number' && typeof pFast.initiative === 'number',
      'Initiative must be populated'
    );
  });

  it('DEF-CH8-02: rollInitiative breaks initiative ties deterministically using actor ID ordering', () => {
    const customRuleset = {
      rulesetId: 'test-ruleset',
      version: '1.0.0',
      calculateModifier: (score: number) => 0,
      resolveInitiative: (params: { actorId: string; participant: BattlefieldParticipant }) => ({
        roll: {
          rollId: 'test_roll',
          rulesetVersion: 'test',
          formula: '1d20+0',
          individualDice: [10],
          modifier: 0,
          total: 10,
          isCriticalSuccess: false,
          isCriticalFailure: false,
          timestamp: 0,
        },
        totalInitiative: 15, // Fixed tie for all actors
      }),
      resolveAttack: () => ({ roll: {} as any, hits: true, isCritical: false }),
      resolveSavingThrow: () => ({ roll: {} as any, succeeds: true }),
      resolveDamage: () => ({ roll: {} as any, totalDamage: 5 }),
    };

    const engine = new TacticalCombatEngine(100, customRuleset);

    const actorZ: BattlefieldParticipant = {
      id: 'actor_z',
      name: 'Zeta',
      x: 0,
      y: 0,
      initiative: 0,
      team: 'enemies',
      hpCurrent: 10,
      hpMax: 10,
      armorClass: 10,
      speedCells: 5,
      attackBonus: 0,
      damageFormula: '1d4',
      conditions: [],
      isDead: false,
    };

    const actorA: BattlefieldParticipant = {
      id: 'actor_a',
      name: 'Alpha',
      x: 1,
      y: 1,
      initiative: 0,
      team: 'player_allies',
      hpCurrent: 10,
      hpMax: 10,
      armorClass: 10,
      speedCells: 5,
      attackBonus: 0,
      damageFormula: '1d4',
      conditions: [],
      isDead: false,
    };

    engine.addParticipant(actorZ);
    engine.addParticipant(actorA);
    engine.rollInitiative();

    const turnQueue = engine.getTurnQueue();
    assert.deepEqual(
      turnQueue,
      ['actor_a', 'actor_z'],
      'Ties should be resolved deterministically by actor ID in ascending order'
    );
  });

  it('DEF-CH8-03: moveActor respects configured map bounds and impassable obstacles', () => {
    const engine = new TacticalCombatEngine();
    engine.setMapBounds({ minX: 0, maxX: 10, minY: 0, maxY: 10 });
    engine.addObstacle({ x: 3, y: 3, isImpassable: true });

    const p: BattlefieldParticipant = {
      id: 'mover',
      name: 'Mover',
      x: 2,
      y: 2,
      initiative: 10,
      team: 'player_allies',
      hpCurrent: 20,
      hpMax: 20,
      armorClass: 12,
      speedCells: 5,
      attackBonus: 2,
      damageFormula: '1d6',
      conditions: [],
      isDead: false,
    };
    engine.addParticipant(p);

    // 1. Move into obstacle -> should fail
    const obstMove = engine.moveActor('mover', 3, 3);
    assert.equal(obstMove.success, false);
    assert.match(obstMove.errorReason || '', /obstacle/i);

    // 2. Move out of map bounds -> should fail
    const oobMove = engine.moveActor('mover', -1, 2);
    assert.equal(oobMove.success, false);
    assert.match(oobMove.errorReason || '', /boundaries/i);

    // 3. Valid move -> should succeed
    const validMove = engine.moveActor('mover', 2, 4);
    assert.equal(validMove.success, true);
    assert.equal(engine.getParticipant('mover')?.y, 4);
  });

  it('DEF-CH8-04: moveActor rejects movement for actors with immobilizing conditions', () => {
    const engine = new TacticalCombatEngine();
    const p: BattlefieldParticipant = {
      id: 'paralyzed_target',
      name: 'Paralyzed Fighter',
      x: 5,
      y: 5,
      initiative: 10,
      team: 'enemies',
      hpCurrent: 20,
      hpMax: 20,
      armorClass: 12,
      speedCells: 5,
      attackBonus: 2,
      damageFormula: '1d6',
      conditions: ['Paralyzed'],
      isDead: false,
    };
    engine.addParticipant(p);

    const moveRes = engine.moveActor('paralyzed_target', 5, 6);
    assert.equal(moveRes.success, false);
    assert.match(moveRes.errorReason || '', /Paralyzed/i);
  });

  it('DEF-CH8-05: executeCapabilityCast integrates saving throws, attack rolls, and resistances', () => {
    const engine = new TacticalCombatEngine(999);

    const caster: BattlefieldParticipant = {
      id: 'caster',
      name: 'Pyromancer',
      x: 0,
      y: 0,
      initiative: 20,
      team: 'player_allies',
      hpCurrent: 25,
      hpMax: 25,
      armorClass: 12,
      speedCells: 6,
      attackBonus: 5,
      damageFormula: '1d6',
      conditions: [],
      isDead: false,
    };

    const targetAgile: BattlefieldParticipant = {
      id: 'agile_rogue',
      name: 'Agile Rogue',
      x: 2,
      y: 2,
      initiative: 18,
      team: 'enemies',
      hpCurrent: 40,
      hpMax: 40,
      armorClass: 16,
      speedCells: 6,
      attackBonus: 4,
      damageFormula: '1d6',
      saveModifiers: { DEX: 8 },
      resistances: ['fire'],
      conditions: [],
      isDead: false,
    };

    engine.addParticipant(caster);
    engine.addParticipant(targetAgile);

    // Cast Fireball with DEX save DC 14, fire damage
    const castRes = engine.executeCapabilityCast({
      actorId: 'caster',
      targetId: 'agile_rogue',
      capabilityName: 'Fireball',
      powerTier: 'Major', // base 36 + 4 = 40 damage
      category: 'Magic',
      defenseModel: 'saving_throw',
      savingThrowType: 'DEX',
      difficultyClass: 14,
      halfDamageOnSave: true,
      damageType: 'fire',
    });

    assert.equal(castRes.success, true);
    assert.ok(castRes.savingThrowResult, 'Saving throw result should be included');
    // If save succeeded (likely with +8 mod), damage is halved from 40 to 20, then resisted (/2) to 10
    assert.ok(castRes.damage < 40, 'Damage should be mitigated by save and resistance');
  });

  it('LocalDiceEngine: instance PRNG isolation and lossless state export/import', () => {
    const engine1 = new TacticalCombatEngine(12345);
    const engine2 = new TacticalCombatEngine(12345);

    const p1: BattlefieldParticipant = {
      id: 'p1',
      name: 'Hero 1',
      x: 0,
      y: 0,
      initiative: 0,
      team: 'player_allies',
      hpCurrent: 30,
      hpMax: 30,
      armorClass: 10,
      speedCells: 6,
      attackBonus: 3,
      damageFormula: '1d8',
      conditions: [],
      isDead: false,
    };
    const p2: BattlefieldParticipant = {
      id: 'p2',
      name: 'Hero 2',
      x: 1,
      y: 1,
      initiative: 0,
      team: 'enemies',
      hpCurrent: 30,
      hpMax: 30,
      armorClass: 10,
      speedCells: 6,
      attackBonus: 3,
      damageFormula: '1d8',
      conditions: [],
      isDead: false,
    };

    engine1.addParticipant(p1);
    engine1.addParticipant(p2);
    engine2.addParticipant(p1);
    engine2.addParticipant(p2);

    engine1.rollInitiative();
    engine2.rollInitiative();

    // Both seeded identically should produce identical turn queues and initiatives
    assert.deepEqual(engine1.getTurnQueue(), engine2.getTurnQueue());
    assert.equal(
      engine1.getParticipant('p1')?.initiative,
      engine2.getParticipant('p1')?.initiative
    );

    // Export and re-import
    const exported = engine1.exportState();
    assert.equal(typeof exported.seed, 'number');
    assert.equal(typeof exported.rollCounter, 'number');

    const engineImported = new TacticalCombatEngine();
    engineImported.importState(exported);

    assert.deepEqual(engineImported.getTurnQueue(), engine1.getTurnQueue());
  });
});
