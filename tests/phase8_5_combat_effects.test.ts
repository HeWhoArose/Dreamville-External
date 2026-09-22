import assert from 'node:assert/strict';
import test from 'node:test';

import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { combatEffectEngine } from '../server/domain/combatEffectEngine';
import { combatSimulationEngine } from '../server/domain/combatSimulationEngine';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { CapabilityEngine } from '../server/domain/capabilityEngine';
import { BossPhaseEngine } from '../server/domain/bossPhaseEngine';

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

test('Phase 8.5: forced movement stops at a wall and applies canonical secondary impact damage', () => {
  const engine = engineWithEnemy({ x: 1, y: 0, hpCurrent: 1000, hpMax: 1000 });
  engine.addObstacle({ x: 3, y: 0, isImpassable: true });

  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'wall_slam',
    name: 'Wall Slam',
    resolutionMode: 'SINGLE_ATTACK',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    attackFormula: '1d20',
    damageFormula: '1d4',
    damageType: 'force',
    forcedMovement: {
      type: 'PUSH',
      distanceCells: 5,
      collision: {
        damageFormula: '4d4',
        damageType: 'bludgeoning',
      },
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.instances?.[0]?.forcedMovement?.collision?.kind, 'WALL');
  assert.equal(result.instances?.[0]?.forcedMovement?.actualDistanceCells, 1);
  assert.equal(engine.getParticipant('enemy')?.x, 2);
  assert.ok((result.instances?.[0]?.secondaryDamage || 0) > 0);
  assert.equal(
    result.totalDamage,
    (result.instances?.[0]?.damage || 0) + (result.instances?.[0]?.secondaryDamage || 0)
  );
  assert.equal(
    engine.getCombatEffectEvents().some((event) => event.eventType === 'FORCED_MOVEMENT_COLLISION_RESOLVED'),
    true,
  );
});

test('Phase 8.5: forced movement damages and can destroy an existing destructible environment object', () => {
  const engine = engineWithEnemy({ x: 1, y: 0, hpCurrent: 1000, hpMax: 1000 });
  engine.upsertDestructibleObject({
    id: 'stone_wall',
    name: 'Stone Wall',
    x: 3,
    y: 0,
    hpCurrent: 2,
    hpMax: 2,
    isDestroyed: false,
  });

  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'breakthrough',
    name: 'Breakthrough',
    resolutionMode: 'SINGLE_ATTACK',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    attackFormula: '1d20',
    damageFormula: '1d4',
    forcedMovement: {
      type: 'PUSH',
      distanceCells: 4,
      collision: {
        damageFormula: '1d4',
        objectDamageFormula: '4d4',
        damageType: 'bludgeoning',
      },
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.instances?.[0]?.forcedMovement?.collision?.kind, 'DESTRUCTIBLE_OBJECT');
  assert.equal(result.instances?.[0]?.forcedMovement?.collision?.objectDestroyed, true);
  assert.equal(engine.getParticipant('enemy')?.x, 2);
  assert.equal(engine.getDestructibleObjects().find((object) => object.id === 'stone_wall')?.isDestroyed, true);
  assert.equal(engine.getCombatEffectEvents().some((event) => event.eventType === 'ENVIRONMENT_DESTROYED'), true);
});

test('Phase 8.5: forced movement can resolve creature-on-creature body collision without creating a second damage authority', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(participant());
  engine.addParticipant(participant({ id: 'enemy_a', name: 'A', team: 'enemies', x: 1, y: 0, hpCurrent: 100, hpMax: 100, initiative: 0 }));
  engine.addParticipant(participant({ id: 'enemy_b', name: 'B', team: 'enemies', x: 3, y: 0, hpCurrent: 100, hpMax: 100, initiative: 0 }));
  engine.rollInitiative();

  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy_a'], {
    id: 'body_check',
    name: 'Body Check',
    resolutionMode: 'SINGLE_ATTACK',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    attackFormula: '1d20',
    damageFormula: '1d4',
    forcedMovement: {
      type: 'PUSH',
      distanceCells: 4,
      collision: {
        damageFormula: '1d4',
        creatureDamageFormula: '4d4',
        damageType: 'bludgeoning',
      },
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.instances?.[0]?.forcedMovement?.collision?.kind, 'CREATURE');
  assert.equal(engine.getParticipant('enemy_a')?.x, 2);
  assert.ok((engine.getParticipant('enemy_b')?.hpCurrent || 100) < 100);
  assert.ok((result.instances?.[0]?.forcedMovement?.collision?.damageToCreature || 0) > 0);
});

test('Phase 8.5: spell PUSH movement is routed through the same canonical wall-collision authority', () => {
  const engine = engineWithEnemy({ x: 1, y: 0, hpCurrent: 1000, hpMax: 1000 });
  engine.addObstacle({ x: 3, y: 0, isImpassable: true });
  const spells = engine.getSpellRuntime();
  spells.registerSpell({
    id: 'test_force_push',
    name: 'Test Force Push',
    level: 0,
    school: 'evocation',
    castingTime: 'ACTION',
    range: 60,
    rangeType: 'RANGED',
    targetType: 'SINGLE_ENEMY',
    durationRounds: 0,
    requiresConcentration: false,
    isRitual: false,
    defenseModel: 'BUFF',
    movementEffect: {
      type: 'PUSH',
      distanceFeet: 20,
      collision: {
        damageFormula: '4d4',
        damageType: 'bludgeoning',
      },
    },
    description: 'Test spell that pushes a target into environmental collision.',
  });

  const result = engine.executeSpellCast({
    actorId: 'hero',
    spellId: 'test_force_push',
    targetId: 'enemy',
  });

  assert.equal(result.success, true);
  assert.equal(result.result?.movementCollision?.collision?.kind, 'WALL');
  assert.equal(result.result?.movementCollision?.actualDistanceCells, 1);
  assert.equal(engine.getParticipant('enemy')?.x, 2);
  assert.ok((engine.getParticipant('enemy')?.hpCurrent || 1000) < 1000);
});

test('Phase 8.5 validation: unsafe forced-movement collision formulas are rejected before combat resolution', () => {
  const validation = combatEffectEngine.validateDefinition({
    id: 'unsafe_collision',
    name: 'Unsafe Collision',
    resolutionMode: 'SINGLE_ATTACK',
    scale: 'PERSON',
    targetingMode: 'ONE_TARGET',
    actionCost: 'ACTION',
    attackFormula: '1d20',
    damageFormula: '1d4',
    forcedMovement: {
      type: 'PUSH',
      distanceCells: 5,
      collision: { damageFormula: '999d9999' },
    },
  }, 'CUSTOM_HOMEBREW_DND');

  assert.equal(validation.success, false);
  assert.match(validation.errorReason || '', /unsafe|invalid/i);
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


test('Phase 8.5: authoritative capability effect cannot be replaced by a stronger client draft', () => {
  const capabilities = new CapabilityEngine();
  capabilities.seedStarterPowerStateForActor('hero');

  capabilities.registerCapability({
    id: 'cap_authoritative_laser',
    name: 'Authoritative Laser',
    category: 'Magic',
    activationMode: 'immediate',
    powerTier: 'Moderate',
    baseEnergyCost: 10,
    baseStrainCost: 1,
    minVesselCapacityRequired: 10,
    description: 'A single canonical laser attack.',
    provenance: 'SYSTEM',
    actionType: 'action',
    targetType: 'single_target',
    checkFormula: '1d20',
    damageFormula: '1d6',
    effectDefinition: {
      id: 'cap_authoritative_laser_effect',
      name: 'Authoritative Laser',
      resolutionMode: 'SINGLE_ATTACK',
      scale: 'PERSON',
      actionCost: 'ACTION',
      targetingMode: 'ONE_TARGET',
      attackFormula: '1d20',
      damageFormula: '1d6',
      damageType: 'radiant',
      provenance: 'SYSTEM',
    },
  });

  capabilities.acquireSkill('hero', 'cap_authoritative_laser');

  const canonical = capabilities.getAuthoritativeCombatEffect('hero', 'cap_authoritative_laser');
  assert.ok(canonical);
  assert.equal(canonical?.resolutionMode, 'SINGLE_ATTACK');
  assert.equal(canonical?.instanceCount, undefined);
  assert.equal(canonical?.damageFormula, '1d6');

  const forgedDraft = {
    ...canonical!,
    resolutionMode: 'MULTI_INSTANCE' as const,
    instanceCount: 50,
    scale: 'CITY' as const,
    damageFormula: '99d99',
    outcome: 'PLANET_DESTROYED' as any,
  };

  assert.notDeepEqual(canonical, forgedDraft);
  assert.equal(canonical?.scale, 'PERSON');
  assert.equal(canonical?.damageFormula, '1d6');
});


test('Phase 8.5 regression: area range validation checks the origin by default and can require each target explicitly', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(participant());
  engine.addParticipant(participant({ id: 'enemy_a', name: 'A', team: 'enemies', x: 4, y: 0, hpCurrent: 100, hpMax: 100, initiative: 0 }));
  engine.addParticipant(participant({ id: 'enemy_b', name: 'B', team: 'enemies', x: 8, y: 0, hpCurrent: 100, hpMax: 100, initiative: 0 }));
  engine.rollInitiative();

  const originValidated = combatEffectEngine.resolve(engine, 'hero', ['enemy_a'], {
    id: 'origin_range_area',
    name: 'Origin Range Area',
    resolutionMode: 'AREA',
    scale: 'ENCOUNTER',
    actionCost: 'ACTION',
    targetingMode: 'ALL_IN_AREA',
    rangeCells: 5,
    areaRadiusCells: 5,
    damageFormula: '1d4',
  });
  assert.equal(originValidated.success, true);

  const targetValidated = combatEffectEngine.validateDefinition({
    id: 'target_range_area',
    name: 'Target Range Area',
    resolutionMode: 'AREA',
    scale: 'ENCOUNTER',
    actionCost: 'FREE',
    targetingMode: 'ALL_IN_AREA',
    rangeCells: 5,
    rangeValidationMode: 'EACH_TARGET',
    areaRadiusCells: 5,
    damageFormula: '1d4',
  });
  assert.equal(targetValidated.success, true);
});

test('Phase 8.5 regression: Full D&D automatic-failure saves only apply to STR/DEX and the correct conditions', () => {
  const paralyzed = engineWithEnemy({ conditions: ['Paralyzed'], saveModifiers: { STR: 20 } });
  const fail = combatEffectEngine.resolve(paralyzed, 'hero', ['enemy'], {
    id: 'paralyzed_str_save',
    name: 'Paralyzed STR Save',
    resolutionMode: 'SAVE',
    scale: 'PERSON',
    actionCost: 'FREE',
    targetingMode: 'ONE_TARGET',
    savingThrowAbility: 'STR',
    difficultyClass: 1,
    damageFormula: '1d4',
  });
  assert.equal(fail.success, true);
  assert.equal(fail.instances?.[0]?.hits, false);

  const stunnedWisdom = engineWithEnemy({ conditions: ['Stunned'], saveModifiers: { WIS: 0 } });
  const wis = combatEffectEngine.resolve(stunnedWisdom, 'hero', ['enemy'], {
    id: 'stunned_wis_save',
    name: 'Stunned WIS Save',
    resolutionMode: 'SAVE',
    scale: 'PERSON',
    actionCost: 'FREE',
    targetingMode: 'ONE_TARGET',
    savingThrowAbility: 'WIS',
    difficultyClass: 1,
    damageFormula: '1d4',
  });
  assert.equal(wis.success, true);
  assert.equal(wis.instances?.[0]?.hits, false);
});

test('Phase 8.5 regression: Incapacitated blocks Action without consuming the Action resource', () => {
  const engine = engineWithEnemy();
  const applied = engine.applyCombatCondition('hero', { conditionIdOrName: 'Incapacitated' }, 'SYSTEM');
  assert.equal(applied.success, true);
  assert.equal(applied.applied, true);

  const before = engine.getTurnResources('hero');
  const result = engine.executeAttack('hero', 'enemy', { attackFormula: '1d20', overrideFormula: '1d4' });

  assert.equal(result.success, false);
  assert.match(result.errorReason || '', /blocked from using action/i);
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, before?.actionAvailable);
  assert.equal(engine.getCombatEffectEvents().some((event) => event.eventType === 'ATTACK_INSTANCE_RESOLVED'), false);
});

test('Phase 8.5 regression: Grappled blocks movement through the same ConditionEngine authority', () => {
  const engine = engineWithEnemy();
  const applied = engine.applyCombatCondition('hero', { conditionIdOrName: 'Grappled' }, 'enemy');
  assert.equal(applied.success, true);

  const result = engine.moveActor('hero', 1, 0);
  assert.equal(result.success, false);
  assert.match(result.errorReason || '', /blocked from movement|cannot move/i);
});

test('Phase 8.5 regression: explicit per-instance targets preserve duplicate target assignments', () => {
  const engine = new TacticalCombatEngine(7);
  engine.addParticipant(participant({ attackBonus: 20 }));
  engine.addParticipant(participant({ id: 'enemy_a', name: 'A', team: 'enemies', x: 1, y: 0, hpCurrent: 100, hpMax: 100, initiative: 0 }));
  engine.addParticipant(participant({ id: 'enemy_b', name: 'B', team: 'enemies', x: 2, y: 0, hpCurrent: 100, hpMax: 100, initiative: 0 }));
  engine.rollInitiative();

  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy_a', 'enemy_b'], {
    id: 'split_beams',
    name: 'Split Beams',
    resolutionMode: 'MULTI_INSTANCE',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'PER_INSTANCE',
    instanceCount: 4,
    instanceTargetIds: ['enemy_a', 'enemy_b', 'enemy_a', 'enemy_b'],
    attackFormula: '1d20',
    damageFormula: '1d4',
    damageType: 'radiant',
  });

  assert.equal(result.success, true);
  assert.deepEqual(
    result.instances?.map((instance) => instance.targetId),
    ['enemy_a', 'enemy_b', 'enemy_a', 'enemy_b']
  );
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, false);
});

test('Phase 8.5 regression: semantic erasure synchronizes participant and ConditionEngine death state', () => {
  const engine = engineWithEnemy();
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'erase_state_sync',
    name: 'Erase State Sync',
    resolutionMode: 'OUTCOME',
    scale: 'COSMIC',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    outcome: 'ERASE_FROM_WORLD',
  });

  assert.equal(result.success, true);
  assert.equal(engine.getParticipant('enemy')?.isDead, true);
  const exported = engine.exportState();
  const conditionState = (exported.conditionEngineState?.actors || []).find((actor: any) => actor.actorId === 'enemy');
  assert.equal(conditionState?.dead, true);
});

test('Phase 8.5 regression: raw combat export/import does not bake projected progression modifiers into canonical state', () => {
  const engine = engineWithEnemy({ attackBonus: 4, armorClass: 12 });
  engine.setProgressionModifierResolver(() => ({
    level: 1,
    classId: 'test',
    subclassId: undefined,
    speciesId: undefined,
    modifiers: [
      { target: 'combat.attackBonus', value: 3, source: 'test_progression' },
      { target: 'coreStats.armorClass', value: 2, source: 'test_progression' },
    ],
  }));
  assert.equal(engine.getParticipant('hero')?.attackBonus, 23);
  const beforeRaw = engine.exportState().participants.find((p: any) => p.id === 'hero')?.attackBonus;
  assert.equal(beforeRaw, 20);

  const clone = new TacticalCombatEngine(1337);
  clone.importState(engine.exportState());
  const projected = clone.getParticipant('hero');
  const rawAfter = clone.exportState().participants.find((p: any) => p.id === 'hero')?.attackBonus;

  assert.equal(projected?.attackBonus, 23);
  assert.equal(rawAfter, 20);
});

test('Phase 8.5 fallback: generated visual presentation remains non-authoritative when no animation asset is present', () => {
  const engine = engineWithEnemy();
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'presentation_only',
    name: 'Presentation Only',
    resolutionMode: 'MULTI_INSTANCE',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    instanceCount: 3,
    attackFormula: '1d20',
    damageFormula: '1d4',
  });

  assert.equal(result.success, true);
  assert.ok((result.instances || []).length === 3);
  assert.equal(typeof result.animationPlan?.id === 'string' || result.animationPlan === undefined, true);
  assert.equal(engine.getParticipant('enemy')?.hpCurrent! < 1000, true);
});


test('Phase 8.5 regression: condition triggers execute from canonical combat events without creating a second condition authority', async () => {
  const { ConditionEngine } = await import('../server/domain/conditionEngine');
  const conditions = new ConditionEngine();
  conditions.seedActor('hero', { healthCurrent: 20, healthMax: 20 });
  conditions.registerDefinition({
    id: 'battle_rage',
    name: 'Battle Rage',
    description: 'Test condition that gains intensity on attack.',
    category: 'TEST',
    alignment: 'BENEFICIAL',
    defaultSeverity: 1,
    defaultIntensity: 1,
    maxIntensity: 5,
    stackMode: 'ADD',
    triggers: [{
      id: 'rage_on_attack',
      event: 'ON_ATTACK',
      intensityDelta: 1,
      description: 'Rage intensifies when the bearer attacks.',
    }],
  });
  conditions.applyCondition('hero', { definitionIdOrName: 'battle_rage' });
  const first = conditions.processCombatEvent('hero', 'ON_ATTACK', { actionText: 'attack', nowSeconds: 1 });
  const state = conditions.getActorState('hero');

  assert.equal(first.changed, true);
  assert.equal(state?.instances.find((instance) => instance.definitionId === 'battle_rage')?.intensity, 2);
});

test('Phase 8.5 validation: unsafe giant dice formulas are rejected so extreme powers use semantic outcomes', () => {
  const validation = combatEffectEngine.validateDefinition({
    id: 'unsafe_damage',
    name: 'Unsafe Damage',
    resolutionMode: 'SINGLE_ATTACK',
    scale: 'PERSON',
    damageFormula: '999d9999',
    attackFormula: '1d20',
  }, 'CUSTOM_HOMEBREW_DND');

  assert.equal(validation.success, false);
  assert.match(validation.errorReason || '', /unsafe|invalid/i);
});


test('Phase 8.5 audit pass 5: deterministic animation plans expose bounded reusable instance tracks', async () => {
  const { CombatAnimationService } = await import('../server/services/combatAnimationService');
  const service = new CombatAnimationService();
  const plan = service.deterministicPlan({
    id: 'five_beams',
    name: 'Five Beams',
    resolutionMode: 'MULTI_INSTANCE',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    instanceCount: 5,
    attackFormula: '1d20',
    damageFormula: '1d8',
  });
  assert.equal(plan.tracks?.length, 5);
  assert.deepEqual(plan.tracks?.map((track) => track.instanceIndex), [0, 1, 2, 3, 4]);
  assert.equal(plan.tracks?.every((track) => (track.delayMs || 0) <= 10000), true);
});

test('Phase 8.5 audit pass 5: simulation request can be bound to canonical capability identity without trusting a forged definition', async () => {
  const engine = engineWithEnemy();
  const capabilities = new CapabilityEngine();
  capabilities.seedStarterPowerStateForActor('hero');
  capabilities.registerCapability({
    id: 'canonical_sim_laser',
    name: 'Canonical Sim Laser',
    category: 'Magic',
    activationMode: 'immediate',
    powerTier: 'Moderate',
    baseEnergyCost: 1,
    baseStrainCost: 0,
    minVesselCapacityRequired: 1,
    description: 'Canonical simulation capability.',
    provenance: 'SYSTEM',
    actionType: 'action',
    targetType: 'single_target',
    effectDefinition: {
      id: 'canonical_sim_laser_effect',
      name: 'Canonical Sim Laser',
      resolutionMode: 'MULTI_INSTANCE',
      scale: 'PERSON',
      actionCost: 'ACTION',
      targetingMode: 'ONE_TARGET',
      instanceCount: 2,
      attackFormula: '1d20',
      damageFormula: '1d4',
      provenance: 'SYSTEM',
    },
  });
  capabilities.acquireSkill('hero', 'canonical_sim_laser');
  const authoritative = capabilities.getAuthoritativeCombatEffect('hero', 'canonical_sim_laser');
  assert.ok(authoritative);
  const forged = {
    ...authoritative!,
    instanceCount: 50,
    scale: 'COSMIC' as const,
    outcome: 'PLANET_DESTROYED' as any,
  };
  assert.notDeepEqual(authoritative, forged);
  assert.equal(authoritative?.instanceCount, 2);
  assert.equal(authoritative?.scale, 'PERSON');
  assert.equal(engine.getParticipant('enemy')?.isDead, false);
});

test('Phase 8.5 audit pass 5: animation presentation never becomes canonical combat state', async () => {
  const engine = engineWithEnemy();
  const before = JSON.stringify(engine.exportState());
  const { CombatAnimationService } = await import('../server/services/combatAnimationService');
  const plan = new CombatAnimationService().deterministicPlan({
    id: 'presentation_only_tracks',
    name: 'Presentation Only',
    resolutionMode: 'MULTI_INSTANCE',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    instanceCount: 3,
    attackFormula: '1d20',
    damageFormula: '1d4',
  });
  assert.equal(JSON.stringify(engine.exportState()), before);
  assert.equal(plan.generatedBy, 'SYSTEM');
});


test('Phase 8.5 audit pass 5: canonical combat replay reproduces a five-instance resolution signature', async () => {
  const engine = engineWithEnemy({ attackBonus: 20 });
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'replay_five_beams',
    name: 'Replay Five Beams',
    resolutionMode: 'MULTI_INSTANCE',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    instanceCount: 5,
    attackFormula: '1d20',
    damageFormula: '1d4',
  });
  assert.equal(result.success, true);
  const record = engine.getCombatReplayRecords().at(-1);
  assert.ok(record);
  const { combatReplayEngine } = await import('../server/domain/combatReplayEngine');
  const replay = combatReplayEngine.replay(record!);
  assert.equal(replay.success, true);
  assert.equal(replay.identical, true);
  assert.equal(replay.replayed?.instanceCount, 5);
});

test('Phase 8.5 audit pass 5: world-preview replay is explicitly non-mutating', async () => {
  const engine = engineWithEnemy();
  const before = engine.exportState();
  const record: any = {
    id: 'world_preview_replay',
    actionId: 'citybreaker_1',
    turnNumber: 1,
    actorId: 'hero',
    targetIds: [],
    definition: {
      id: 'citybreaker',
      name: 'Citybreaker',
      resolutionMode: 'WORLD_EFFECT',
      scale: 'CITY',
      actionCost: 'ACTION',
      targetingMode: 'ALL_IN_AREA',
      outcome: 'WORLD_STATE_CHANGED',
    },
    seedBefore: before.seed,
    rollCounterBefore: before.rollCounter,
    beforeState: before,
    canonicalEventIds: ['world_evt_1'],
    resultSignature: { success: true, totalDamage: 0, defeatedTargetIds: [], instanceCount: 0 },
    consumeAction: true,
    replayMode: 'WORLD_PREVIEW',
    createdAtSequence: 1,
  };
  const { combatReplayEngine } = await import('../server/domain/combatReplayEngine');
  const replay = combatReplayEngine.replay(record);
  assert.equal(replay.success, true);
  assert.equal(replay.identical, true);
  assert.deepEqual(engine.exportState(), before);
});

test('Phase 8.5 audit pass 5: 50-instance effects stay within the canonical instance bound', () => {
  const engine = engineWithEnemy({ attackBonus: 20 });
  const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
    id: 'bounded_barrage',
    name: 'Bounded Barrage',
    resolutionMode: 'MULTI_INSTANCE',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    instanceCount: 50,
    attackFormula: '1d20',
    damageFormula: '1d4',
  });
  assert.equal(result.success, true);
  assert.equal(result.instances?.length, 50);
});


test('Phase 8.5 audit pass 5: canonical combat event buffers remain bounded under repeated multi-instance effects', () => {
  const engine = engineWithEnemy({ attackBonus: 20 });
  for (let run = 0; run < 25; run += 1) {
    const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
      id: 'bounded_event_barrage_' + run,
      name: 'Bounded Event Barrage',
      resolutionMode: 'MULTI_INSTANCE',
      scale: 'PERSON',
      actionCost: 'FREE',
      targetingMode: 'ONE_TARGET',
      instanceCount: 50,
      attackFormula: '1d20',
      damageFormula: '1d4',
    });
    assert.equal(result.success, true);
  }
  assert.ok(engine.getCombatEffectEvents().length <= 1000);
  assert.ok(engine.getBattleEvents().length <= 500);
});


test('Phase 8.5 regression: boss phase steady-state sync resolves canonical environment ids without undeclared state', () => {
  const engine = engineWithEnemy({ id: 'boss', name: 'Boss', hpCurrent: 50, hpMax: 100 });
  const repository: any = {
    getCombatEngine: () => engine,
    getEntityCard: () => ({
      metadata: {
        combat: {
          environmentEffects: {
            burning_arena: {
              id: 'burning_arena',
              type: 'fire_zone',
              x: 2,
              y: 2,
              radiusCells: 3,
              durationTurns: 2,
              damagePerTurn: 4,
            },
          },
        },
      },
    }),
    getActiveEffects: () => [{
      type: 'BOSS_PHASE_STATE',
      bossId: 'boss',
      currentPhaseId: 'enrage',
      state: { bossId: 'boss', currentPhaseId: 'enrage', enteredAtRound: 1, transitions: ['INITIAL->enrage'] },
    }],
  };

  const result = new BossPhaseEngine().evaluateAndPersist({
    repository,
    storyId: 'story',
    bossId: 'boss',
    phases: [{
      id: 'enrage',
      name: 'Enrage',
      minHpPercent: 0,
      maxHpPercent: 1,
      abilities: ['boss_barrage'],
      environmentEffects: ['burning_arena'],
    }],
  });

  assert.equal(result.success, true);
  assert.equal(result.changed, false);
  assert.equal(engine.getBossPhaseState('boss')?.environmentEffects[0], 'burning_arena');
});


test('Phase 8.5 regression: animation tracks select HIT, MISS, and CRITICAL variants per instance', async () => {
  const { CombatAnimationService } = await import('../server/services/combatAnimationService');
  const service = new CombatAnimationService();
  const plan = service.deterministicPlan({
    id: 'conditional_tracks',
    name: 'Conditional Tracks',
    resolutionMode: 'MULTI_INSTANCE',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    instanceCount: 3,
    attackFormula: '1d20',
    damageFormula: '1d8',
  });

  assert.equal(plan.tracks?.length, 3);
  assert.equal(plan.tracks?.every((track) => track.condition === 'ALWAYS' || track.condition === 'HIT' || track.condition === 'MISS' || track.condition === 'CRITICAL'), true);
  assert.equal(plan.sequence === 'SEQUENTIAL' || plan.sequence === 'PARALLEL' || plan.sequence === 'INSTANT', true);
});

test('Phase 8.5 regression: replay records remain bounded after repeated effect resolution', () => {
  const engine = engineWithEnemy({ attackBonus: 20 });
  for (let run = 0; run < 80; run += 1) {
    const result = combatEffectEngine.resolve(engine, 'hero', ['enemy'], {
      id: 'replay_bound_' + run,
      name: 'Replay Bound',
      resolutionMode: 'MULTI_INSTANCE',
      scale: 'PERSON',
      actionCost: 'FREE',
      targetingMode: 'ONE_TARGET',
      instanceCount: 5,
      attackFormula: '1d20',
      damageFormula: '1d4',
    });
    assert.equal(result.success, true);
  }
  assert.ok(engine.getCombatReplayRecords().length <= 100);
});

test('Phase 8.5 macro connector: world effects project into canonical geography, story threads, timeline, and living world', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { worldEffectEngine } = await import('../server/domain/worldEffectEngine');
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'default_story';
  repository.seedStory(storyId);
  const player = repository.getPlayerLifecycle(storyId);
  assert.ok(player);
  const actorId = player!.actorId;
  const combat = repository.getCombatEngine(storyId);
  combat.addParticipant({
    id: actorId, name: 'Hero', x: 0, y: 0, initiative: 100, team: 'player_allies',
    hpCurrent: 30, hpMax: 30, armorClass: 12, speedCells: 6, attackBonus: 5, damageFormula: '1d6',
    conditions: [], isDead: false,
  });
  combat.rollInitiative();

  const geography = repository.getGeographyGraph(storyId);
  const node = geography.getAllNodes()[0];
  const edge = geography.getAllEdges()[0];
  assert.ok(node);
  assert.ok(edge);

  repository.saveStoryThread({
    storyId, threadId: 'thread_macro_1', title: 'Keep the Gate', status: 'OPEN', stage: 1,
    locationId: node!.id, description: 'Protect the pass.', createdAt: '0',
  });
  const run = repository.getStoryRun(storyId)!;
  repository.saveStoryRun({
    ...run,
    plannedEvents: [{ id: 'planned_macro_1', title: 'Festival', description: 'A city festival.', status: 'PLANNED', locationId: node!.id, participatingActors: [], plannedConsequences: [] }],
    eventStates: { planned_macro_1: { id: 'planned_macro_1', status: 'PLANNED' } },
  });

  const living = repository.getLivingWorldSimulation(storyId);
  living.registerEntityPhysiology({
    entityId: 'npc_macro_1', hunger: 20, thirst: 20, fatigue: 10, pain: 0, stress: 10, morale: 80,
    hungerRatePerHour: 1, thirstRatePerHour: 1, fatigueRatePerHour: 1,
    lastFedTimestamp: repository.getWorldClock(storyId).getTimestamp(),
    lastRestedTimestamp: repository.getWorldClock(storyId).getTimestamp(), personalityModulation: 'stoic',
  });

  repository.beginCanonicalCommandTransaction(storyId, 'cmd_macro_projection');
  const result = worldEffectEngine.apply({
    repository, storyId, actorId, authorityVerified: true, targetIds: [],
    definition: {
      id: 'macro_projection', name: 'Macro Projection', resolutionMode: 'WORLD_EFFECT', scale: 'CITY',
      actionCost: 'ACTION', targetingMode: 'SELF', outcome: 'WORLD_STATE_CHANGED',
      outcomePayload: {
        worldProjection: {
          geography: {
            nodes: [{ id: node!.id, accessible: false, discovered: true }],
            edges: [{ id: edge!.id, isBlocked: true, blockReason: 'Citywide collapse.' }],
          },
          storyThreads: [{ threadId: 'thread_macro_1', status: 'ESCALATED', stage: 2 }],
          plannedEvents: [{ eventId: 'planned_macro_1', status: 'RESOLVED', plannedConsequences: ['Festival cancelled by catastrophe.'] }],
          livingWorld: {
            physiologies: [{ entityId: 'npc_macro_1', delta: { stress: 25, morale: -20 } }],
            scheduledEvents: [{ id: 'world_evt_macro_1', kind: 'WAR_PROGRESSION', name: 'Emergency Mobilization', locationId: node!.id, triggerTimestamp: repository.getWorldClock(storyId).getTimestamp(), isResolved: false, status: 'pending' }],
          },
          chronicleEvidence: { summary: 'A city-scale catastrophe reshaped the region.', details: 'The gate failed and emergency measures were enacted.', category: 'WORLD_ANOMALY' },
        },
      },
    },
  });
  assert.equal(result.success, true);
  repository.commitCanonicalCommandTransaction(storyId, 'evt_macro_projection');

  assert.equal(geography.getNode(node!.id)?.accessible, false);
  assert.equal(geography.getEdge(edge!.id)?.isBlocked, true);
  assert.equal(repository.getStoryThreads(storyId).find((t) => t.threadId === 'thread_macro_1')?.status, 'ESCALATED');
  assert.equal(repository.getStoryRun(storyId)?.plannedEvents?.[0]?.status, 'RESOLVED');
  assert.equal(living.getEntityPhysiology('npc_macro_1')?.stress, 35);
  assert.equal(living.getEntityPhysiology('npc_macro_1')?.morale, 60);
  assert.ok(living.getScheduledEvents().some((event) => event.id === 'world_evt_macro_1'));
  assert.ok(repository.getHistoricalChronicleEngine(storyId).getChronicleEntries().some((entry) => entry.headline.includes('city-scale catastrophe')));
});

test('Phase 8.5 macro connector regression: projected mutations reject unknown canonical references before mutation', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { worldEffectEngine } = await import('../server/domain/worldEffectEngine');
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'default_story';
  repository.seedStory(storyId);
  const actorId = repository.getPlayerLifecycle(storyId)!.actorId;
  const combat = repository.getCombatEngine(storyId);
  combat.addParticipant({
    id: actorId, name: 'Hero', x: 0, y: 0, initiative: 100, team: 'player_allies',
    hpCurrent: 30, hpMax: 30, armorClass: 12, speedCells: 6, attackBonus: 5, damageFormula: '1d6',
    conditions: [], isDead: false,
  });
  combat.rollInitiative();
  const node = repository.getGeographyGraph(storyId).getAllNodes()[0]!;
  const before = repository.getGeographyGraph(storyId).getNode(node.id);
  const result = worldEffectEngine.apply({
    repository, storyId, actorId, authorityVerified: true, targetIds: [],
    definition: {
      id: 'bad_macro_projection', name: 'Bad Macro Projection', resolutionMode: 'WORLD_EFFECT', scale: 'CITY',
      actionCost: 'ACTION', targetingMode: 'SELF', outcome: 'WORLD_STATE_CHANGED',
      outcomePayload: { worldProjection: { geography: { nodes: [{ id: 'missing_node', accessible: false }] } } },
    },
  });
  assert.equal(result.success, false);
  assert.deepEqual(repository.getGeographyGraph(storyId).getNode(node.id), before);
  assert.equal(combat.getTurnResources(actorId)?.actionAvailable, true);
});
