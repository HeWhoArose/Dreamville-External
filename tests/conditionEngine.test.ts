import test from 'node:test';
import assert from 'node:assert/strict';
import { ConditionEngine } from '../server/domain/conditionEngine';

function seeded(engine: ConditionEngine, actorId = 'actor_test') {
  return engine.seedActor(actorId, {
    healthCurrent: 100,
    healthMax: 100,
    damageProfile: {
      damageImmunities: [],
      damageResistances: [],
      damageVulnerabilities: [],
    },
    conditionProfile: {
      conditionImmunities: [],
      conditionResistances: [],
      conditionVulnerabilities: [],
    },
  });
}

test('damage immunity, resistance and vulnerability resolve canonically', () => {
  const immunityEngine = new ConditionEngine();
  seeded(immunityEngine);
  immunityEngine.setProfiles('actor_test', {
    damageProfile: { damageImmunities: ['fire'], damageResistances: [], damageVulnerabilities: [] },
  });
  const immune = immunityEngine.resolveDamage('actor_test', 20, 'fire');
  assert.equal(immune.finalAmount, 0);
  assert.equal(immune.immune, true);

  const resistanceEngine = new ConditionEngine();
  seeded(resistanceEngine);
  resistanceEngine.setProfiles('actor_test', {
    damageProfile: { damageImmunities: [], damageResistances: ['fire'], damageVulnerabilities: [] },
  });
  const resisted = resistanceEngine.resolveDamage('actor_test', 20, 'fire');
  assert.equal(resisted.finalAmount, 10);
  assert.equal(resisted.resisted, true);

  const vulnerabilityEngine = new ConditionEngine();
  seeded(vulnerabilityEngine);
  vulnerabilityEngine.setProfiles('actor_test', {
    damageProfile: { damageImmunities: [], damageResistances: [], damageVulnerabilities: ['fire'] },
  });
  const vulnerable = vulnerabilityEngine.resolveDamage('actor_test', 20, 'fire');
  assert.equal(vulnerable.finalAmount, 40);
  assert.equal(vulnerable.vulnerable, true);
});

test('condition immunity prevents condition application', () => {
  const engine = new ConditionEngine();
  seeded(engine);
  engine.setProfiles('actor_test', {
    conditionProfile: {
      conditionImmunities: ['Poisoned'],
      conditionResistances: [],
      conditionVulnerabilities: [],
    },
  });

  const result = engine.applyCondition('actor_test', {
    definitionIdOrName: 'Poisoned',
    nowSeconds: 0,
  });

  assert.equal(result.applied, false);
  assert.equal(result.immune, true);
  assert.equal(engine.getActorState('actor_test')?.instances.length, 0);
});

test('Living Flame can intensify, self-damage and reach terminal heart destruction', () => {
  const engine = new ConditionEngine();
  seeded(engine);

  const applied = engine.applyCondition('actor_test', {
    definitionIdOrName: 'Living Flame',
    nowSeconds: 0,
  });
  assert.equal(applied.applied, true);

  let state = engine.getActorState('actor_test')!;
  assert.equal(state.instances[0]?.intensity, 1);
  assert.equal(state.healthCurrent, 100);

  engine.processAction('actor_test', 'I ignite my hand again.', 1);
  state = engine.getActorState('actor_test')!;
  assert.equal(state.instances.find((item) => item.definitionId === 'living_flame')?.intensity, 2);

  engine.processAction('actor_test', 'I ignite my body again.', 2);
  engine.processAction('actor_test', 'I ignite my body again.', 3);
  engine.processAction('actor_test', 'I ignite my body again.', 4);
  state = engine.getActorState('actor_test')!;
  assert.equal(state.instances.find((item) => item.definitionId === 'living_flame')?.intensity, 5);

  engine.processAction('actor_test', 'I ignite my heart.', 5);
  state = engine.getActorState('actor_test')!;
  assert.equal(state.dead, true);
  assert.equal(state.healthCurrent, 0);
  assert.equal(state.bodyRegions.find((region) => region.id === 'HEART')?.destroyed, true);
});

test('stopping Living Flame starts regeneration and recovery ticks heal', () => {
  const engine = new ConditionEngine();
  seeded(engine);

  engine.applyCondition('actor_test', {
    definitionIdOrName: 'Living Flame',
    nowSeconds: 0,
  });
  engine.resolveDamage('actor_test', 20, 'fire');

  const beforeStop = engine.getActorState('actor_test')!.healthCurrent;
  engine.processAction('actor_test', 'I stop and rest.', 10);

  const stopped = engine.getActorState('actor_test')!;
  assert.equal(stopped.instances.some((item) => item.definitionId === 'regenerating'), true);

  engine.tickActor('actor_test', 'MINUTE', 70);
  const afterRecovery = engine.getActorState('actor_test')!.healthCurrent;
  assert.equal(afterRecovery > beforeStop, true);
});

test('elapsed WORLD_TIME advances all missed condition ticks', () => {
  const engine = new ConditionEngine();
  seeded(engine);
  engine.registerDefinition({
    id: 'timed_poison',
    name: 'Timed Poison',
    description: 'Test condition with canonical world-time ticks.',
    category: 'TEST',
    alignment: 'HARMFUL',
    defaultSeverity: 1,
    defaultIntensity: 1,
    tickUnit: 'WORLD_TIME',
    tickEvery: 60,
    damagePerTick: 1,
    damageType: 'poison',
  });

  engine.applyCondition('actor_test', {
    definitionIdOrName: 'Timed Poison',
    nowSeconds: 0,
  });

  const events = engine.tickActor('actor_test', 'WORLD_TIME', 180);
  const state = engine.getActorState('actor_test')!;

  assert.equal(events.length, 1);
  assert.equal(state.healthCurrent, 97);
  assert.equal(events[0].notes.some((note) => note.includes('ticks')), true);
});
