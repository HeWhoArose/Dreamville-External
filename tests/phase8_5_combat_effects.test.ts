import assert from 'node:assert/strict';
import test from 'node:test';

import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { combatEffectEngine } from '../server/domain/combatEffectEngine';
import { combatSimulationEngine } from '../server/domain/combatSimulationEngine';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';

function participant(overrides: Partial<Parameters<TacticalCombatEngine['addParticipant']>[0]> = {}) {
  return {
    id: 'hero', name: 'Hero', x: 0, y: 0, initiative: 100, team: 'player_allies' as const,
    hpCurrent: 100, hpMax: 100, armorClass: 12, speedCells: 6, attackBonus: 20, damageFormula: '1d8+3',
    conditions: [], isDead: false, ...overrides,
  };
}

function engineWithEnemy(enemyOverrides: Partial<Parameters<TacticalCombatEngine['addParticipant']>[0]> = {}) {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(participant());
  engine.addParticipant(participant({ id: 'enemy', name: 'Ogre', team: 'enemies', x: 1, y: 0, hpCurrent: 1000, hpMax: 1000, initiative: 0, armorClass: 12, ...enemyOverrides }));
  engine.rollInitiative();
  return engine;
}

test('Phase 8.5: five-beam multi-instance attack consumes one Action and resolves five independent instances', () => {
  const engine = engineWithEnemy();
  const before = engine.getTurnResources('hero');
  const result = engine.executeMultiAttack('hero', ['enemy'], {
    instanceCount: 5, attackFormula: '1d20', damageFormula: '1d8', damageType: 'radiant',
    definition: { id: 'finger_lasers', name: 'Finger Lasers', resolutionMode: 'MULTI_INSTANCE', scale: 'PERSON', actionCost: 'ACTION', targetingMode: 'ONE_TARGET', instanceCount: 5, attackFormula: '1d20', damageFormula: '1d8', damageType: 'radiant' },
  });

  assert.equal(result.success, true);
  assert.equal(result.actionConsumed, true);
  assert.equal(result.instances?.length, 5);
  assert.ok((result.instances || []).every((instance) => instance.roll));
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, false);
  assert.equal((engine.getCombatEffectEvents()).filter((event) => event.eventType === 'ATTACK_INSTANCE_RESOLVED').length, 5);
  assert.equal(before?.actionAvailable, true);
});

test('Phase 8.5: FULL_DND ignores authored non-d20 attack formulas while HYBRID_DND preserves them', () => {
  const full = engineWithEnemy();
  full.setRulesProfile(rulesProfileEngine.createDefault('FULL_DND'));
  const fullResult = combatEffectEngine.resolve(full, 'hero', ['enemy'], {
    id: 'full_mode_attack', name: 'Full D&D Attack', resolutionMode: 'SINGLE_ATTACK', scale: 'PERSON', attackFormula: '2d6', damageFormula: '1d4',
  });
  assert.equal(fullResult.success, true);
  assert.equal((fullResult.instances?.[0]?.roll as any)?.formula, '1d20+20');

  const hybrid = engineWithEnemy();
  hybrid.setRulesProfile(rulesProfileEngine.createDefault('HYBRID_DND'));
  const hybridResult = combatEffectEngine.resolve(hybrid, 'hero', ['enemy'], {
    id: 'hybrid_attack', name: 'Hybrid Attack', resolutionMode: 'SINGLE_ATTACK', scale: 'PERSON', attackFormula: '2d6', damageFormula: '1d4',
  });
  assert.equal(hybridResult.success, true);
  assert.equal((hybridResult.instances?.[0]?.roll as any)?.diceTerms?.[0]?.count, 2);
  assert.equal((hybridResult.instances?.[0]?.roll as any)?.diceTerms?.[0]?.sides, 6);
});

test('Phase 8.5: saving-throw effects consume one Action and route damage through canonical defenses', () => {
  const engine = engineWithEnemy({ saveModifiers: { DEX: 0 }, resistances: ['fire'] });
  engine.setRulesProfile(rulesProfileEngine.createDefault('FULL_DND'));
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'fire_burst', name: 'Fire Burst', resolutionMode: 'SAVE', scale: 'ENCOUNTER', actionCost: 'ACTION', targetingMode: 'ONE_TARGET',
    savingThrowAbility: 'DEX', difficultyClass: 99, damageFormula: '2d6', damageType: 'fire', halfDamageOnSave: false,
  });
  assert.equal(result.success, true);
  assert.ok((result.totalDamage || 0) >= 0);
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, false);
  const event = engine.getCombatEffectEvents().find((entry) => entry.eventType === 'SAVE_RESOLVED');
  assert.ok(event);
  assert.equal((event?.metadata as any)?.damageType, 'fire');
});

test('Phase 8.5: area automatic damage resolves independently per target through defense pipeline', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(participant());
  engine.addParticipant(participant({ id: 'enemy_a', name: 'A', team: 'enemies', x: 1, y: 0, hpCurrent: 100, hpMax: 100, initiative: 0, resistances: ['cold'] }));
  engine.addParticipant(participant({ id: 'enemy_b', name: 'B', team: 'enemies', x: 2, y: 0, hpCurrent: 100, hpMax: 100, initiative: 0 }));
  engine.rollInitiative();
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy_a', 'enemy_b'], {
    id: 'ice_burst', name: 'Ice Burst', resolutionMode: 'AREA', scale: 'ENCOUNTER', actionCost: 'ACTION', targetingMode: 'ALL_IN_AREA',
    damageFormula: '1d8', damageType: 'cold',
  });
  assert.equal(result.success, true);
  assert.equal(result.instances?.length, 2);
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, false);
  assert.equal(engine.getCombatEffectEvents().filter((event) => event.eventType === 'AREA_DAMAGE_RESOLVED').length, 2);
});

test('Phase 8.5: effect simulation does not mutate live combat state', () => {
  const engine = engineWithEnemy();
  const before = JSON.stringify(engine.exportState());
  const simulation = combatSimulationEngine.simulate({
    engine, actorId: 'hero', targetIds: ['enemy'], seed: 2024,
    definition: { id: 'sim_lasers', name: 'Simulated Lasers', resolutionMode: 'MULTI_INSTANCE', scale: 'PERSON', actionCost: 'ACTION', targetingMode: 'ONE_TARGET', instanceCount: 5, attackFormula: '1d20', damageFormula: '1d8' },
  });
  assert.equal(simulation.success, true);
  assert.equal(JSON.stringify(engine.exportState()), before);
});

test('Phase 8.5: sequence resolves child effects while consuming only the outer Action', () => {
  const engine = engineWithEnemy();
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'combo', name: 'Combo', resolutionMode: 'SEQUENCE', scale: 'PERSON', actionCost: 'ACTION', targetingMode: 'ONE_TARGET',
    sequence: [
      { id: 'combo_1', name: 'First Strike', resolutionMode: 'SINGLE_ATTACK', scale: 'PERSON', attackFormula: '1d20', damageFormula: '1d4' },
      { id: 'combo_2', name: 'Second Strike', resolutionMode: 'SINGLE_ATTACK', scale: 'PERSON', attackFormula: '1d20', damageFormula: '1d4' },
    ],
  });
  assert.equal(result.success, true);
  assert.equal(result.instances?.length, 2);
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, false);
});

test('Phase 8.5: semantic outcome definitions validate without pretending they are ordinary damage', () => {
  const validation = combatEffectEngine.validateDefinition({
    id: 'erase_mortal', name: 'Erase Mortal', resolutionMode: 'OUTCOME', scale: 'COSMIC', outcome: 'ERASE_FROM_WORLD', targetingMode: 'ONE_TARGET', actionCost: 'ACTION',
  }, 'CUSTOM_HOMEBREW_DND');
  assert.equal(validation.success, true);
});


test('Phase 8.5: invalid child effect rolls back the outer action and all prior child mutations', () => {
  const engine = engineWithEnemy();
  const before = JSON.stringify(engine.exportState());
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'broken_combo',
    name: 'Broken Combo',
    resolutionMode: 'SEQUENCE',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    sequence: [
      { id: 'valid_first', name: 'First', resolutionMode: 'SINGLE_ATTACK', scale: 'PERSON', attackFormula: '1d20', damageFormula: '1d4' },
      { id: 'broken_second', name: 'Broken', resolutionMode: 'SINGLE_ATTACK', scale: 'PERSON', attackFormula: 'banana', damageFormula: '1d4' },
    ],
  });
  assert.equal(result.success, false);
  assert.equal(JSON.stringify(engine.exportState()), before);
});

test('Phase 8.5: semantic OUTCOME erases a target through canonical combat outcome events', () => {
  const engine = engineWithEnemy();
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'erase_mortal',
    name: 'Erase Mortal',
    resolutionMode: 'OUTCOME',
    scale: 'COSMIC',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    outcome: 'ERASE_FROM_WORLD',
  });
  assert.equal(result.success, true);
  assert.equal(result.outcome, 'ERASE_FROM_WORLD');
  assert.equal(engine.getParticipant('enemy')?.isDead, true);
  assert.equal(engine.getCombatEffectEvents().some((event) => event.eventType === 'SEMANTIC_OUTCOME_RESOLVED'), true);
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, false);
});

test('Phase 8.5: chain targeting deterministically expands from the first target within jump range', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(participant());
  engine.addParticipant(participant({ id: 'enemy_a', name: 'A', team: 'enemies', x: 2, y: 0, hpCurrent: 100, hpMax: 100, initiative: 0 }));
  engine.addParticipant(participant({ id: 'enemy_b', name: 'B', team: 'enemies', x: 4, y: 0, hpCurrent: 100, hpMax: 100, initiative: 0 }));
  engine.addParticipant(participant({ id: 'enemy_c', name: 'C', team: 'enemies', x: 8, y: 0, hpCurrent: 100, hpMax: 100, initiative: 0 }));
  engine.rollInitiative();

  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy_a'], {
    id: 'chain_bolt',
    name: 'Chain Bolt',
    resolutionMode: 'CHAIN',
    scale: 'ENCOUNTER',
    actionCost: 'ACTION',
    targetingMode: 'CHAIN',
    instanceCount: 3,
    chainCount: 3,
    chainJumpRangeCells: 3,
    attackFormula: '1d20',
    damageFormula: '1d4',
  });
  assert.equal(result.success, true);
  assert.equal(result.instances?.length, 2);
  assert.deepEqual(result.instances?.map((instance) => instance.targetId), ['enemy_a', 'enemy_b']);
});

test('Phase 8.5: line-of-sight targeting rejects effects blocked by an impassable obstacle', () => {
  const engine = engineWithEnemy({ x: 4, y: 0 });
  engine.addObstacle({ x: 2, y: 0, isImpassable: true });
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'beam',
    name: 'Beam',
    resolutionMode: 'SINGLE_ATTACK',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    requiresLineOfSight: true,
    rangeCells: 10,
    attackFormula: '1d20',
    damageFormula: '1d4',
  });
  assert.equal(result.success, false);
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, true);
});

test('Phase 8.5: boss phase modifiers are persisted and participate in projected combat state', () => {
  const engine = engineWithEnemy();
  const set = engine.setBossPhaseState('enemy', {
    phaseId: 'enrage',
    modifiers: { 'combat.attackBonus': 5, 'coreStats.armorClass': 4 },
    abilities: ['boss_barrage'],
    targetPriority: 'LOWEST_HP',
    environmentEffects: ['burning_arena'],
  });
  assert.equal(set.success, true);
  assert.equal(engine.getBossPhaseState('enemy')?.phaseId, 'enrage');
  assert.equal(engine.getParticipants().find((p) => p.id === 'enemy')?.bossPhaseId, 'enrage');

  const exported = engine.exportState();
  const clone = new TacticalCombatEngine(1337);
  clone.importState(exported);
  assert.equal(clone.getBossPhaseState('enemy')?.phaseId, 'enrage');
});

test('Phase 8.5: sandbox diagnoses an extreme world effect as simulatable without requiring live-world mutation', () => {
  const engine = engineWithEnemy();
  const simulation = combatSimulationEngine.simulate({
    engine,
    actorId: 'hero',
    targetIds: [],
    seed: 7,
    definition: {
      id: 'citybreaker',
      name: 'Citybreaker',
      resolutionMode: 'WORLD_EFFECT',
      scale: 'CITY',
      actionCost: 'ACTION',
      targetingMode: 'ALL_IN_AREA',
      outcome: 'WORLD_STATE_CHANGED',
      outcomePayload: { destruction: 'CITY_DEVASTATED' },
    },
  });
  assert.equal(simulation.success, true);
  assert.equal(simulation.result?.worldEffectPreview?.abstraction, 'MACRO');
  assert.equal(JSON.stringify(engine.exportState()), JSON.stringify(simulation.before));
});


test('Phase 8.5: semantic resource outcome mutates only the target combat resource ledger', () => {
  const engine = engineWithEnemy();
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'mana_siphon',
    name: 'Mana Siphon',
    resolutionMode: 'OUTCOME',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    outcome: 'RESOURCE_GRANTED',
    outcomePayload: { resource: 'mana', amount: 12 },
  });
  assert.equal(result.success, true);
  assert.equal(engine.getParticipant('enemy')?.combatResources?.mana, 12);
  assert.equal(engine.getParticipant('hero')?.combatResources?.mana, undefined);
});

test('Phase 8.5: summon outcome creates a canonical combat participant without mutating existing targets', () => {
  const engine = engineWithEnemy();
  const result = combatEffectEngine.resolve(engine, 'hero', ['hero'], {
    id: 'summon_sprite',
    name: 'Summon Sprite',
    resolutionMode: 'OUTCOME',
    scale: 'GROUP',
    actionCost: 'ACTION',
    targetingMode: 'SELF',
    outcome: 'SUMMONED',
    outcomePayload: {
      participant: {
        id: 'sprite_1',
        name: 'Sprite',
        team: 'player_allies',
        x: 1,
        y: 1,
        hpMax: 8,
        hpCurrent: 8,
        armorClass: 13,
        speedCells: 5,
        attackBonus: 3,
        damageFormula: '1d4',
      },
    },
  });
  assert.equal(result.success, true);
  assert.equal(engine.getParticipant('sprite_1')?.name, 'Sprite');
  assert.equal(engine.getParticipant('enemy')?.isDead, false);
});

test('Phase 8.5: fallback animation generation never blocks combat semantics', () => {
  const engine = engineWithEnemy();
  const before = JSON.stringify(engine.exportState());
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'fallback_beam',
    name: 'Fallback Beam',
    resolutionMode: 'MULTI_INSTANCE',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    instanceCount: 2,
    attackFormula: '1d20',
    damageFormula: '1d4',
  });
  assert.equal(result.success, true);
  assert.notEqual(JSON.stringify(engine.exportState()), before);
  assert.equal(result.instances?.length, 2);
});
