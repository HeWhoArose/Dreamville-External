import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { combatEffectEngine } from '../server/domain/combatEffectEngine';
import { BossPhaseEngine, type BossPhaseDefinition } from '../server/domain/bossPhaseEngine';

function person(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hero', name: 'Hero', x: 0, y: 0, initiative: 100, initiativeModifier: 100, team: 'player_allies' as const,
    hpCurrent: 300, hpMax: 300, armorClass: 12, speedCells: 8, attackBonus: 30, damageFormula: '1d8+3',
    conditions: [], isDead: false, ...overrides,
  } as any;
}

function bossFight(bossHp: number) {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(person());
  engine.addParticipant(person({ id: 'dragon', name: 'Ashmaw', team: 'enemies', x: 2, y: 0, hpCurrent: bossHp, hpMax: 100, initiative: 0, initiativeModifier: 0 }));
  engine.rollInitiative();
  const effects: any[] = [];
  const facts: any[] = [];
  const repository: any = {
    getCombatEngine: () => engine,
    getEntityCard: () => ({ metadata: { combat: {} } }),
    getActiveEffects: () => effects,
    saveActiveEffect: (effect: any) => { effects.splice(0, effects.length, effect); },
    saveWorldFact: (_story: string, fact: any) => { facts.push(fact); },
    getWorldClock: () => ({ getTimestamp: () => ({}) }),
  };
  return { engine, repository, effects, facts };
}

const enraged: BossPhaseDefinition = {
  id: 'enraged',
  name: 'Enraged',
  minHpPercent: 0,
  maxHpPercent: 0.5,
  abilities: ['fire_breath'],
  abilityDefinitions: [{
    id: 'fire_breath', name: 'Fire Breath', resolutionMode: 'AREA', scale: 'GROUP', actionCost: 'ACTION',
    targetingMode: 'ALL_IN_AREA', damageFormula: '4d6', damageType: 'fire', areaShape: 'CONE', areaRadiusCells: 4,
    resourceCost: { name: 'legendary_charges', amount: 1 },
  }],
  summons: [{ id: 'whelp', name: 'Fire Whelp', hpMax: 12, armorClass: 11, attackBonus: 4, damageFormula: '1d6', x: 3, y: 1 }],
  resources: { legendary_charges: 3, rage: 0 },
  modifiers: { 'combat.attackBonus': 2 },
};

test('boss phase: entering a phase summons reinforcements and sets the boss resource pools as canonical state', () => {
  const { engine, repository } = bossFight(40);
  const result = new BossPhaseEngine().evaluateAndPersist({ repository, storyId: 'story', bossId: 'dragon', phases: [enraged] });
  assert.equal(result.success, true);
  assert.equal(result.changed, true);

  const whelp = engine.getParticipants().find((entry) => entry.id.startsWith('whelp_enraged'));
  assert.ok(whelp, 'a reinforcement joined the fight');
  assert.equal(whelp?.team, 'enemies', 'it fights on the boss\'s side');
  assert.ok(engine.getTurnQueue().includes(whelp!.id), 'and it takes turns');
  assert.equal(engine.getParticipants().find((entry) => entry.id === 'dragon')?.combatResources?.legendary_charges, 3);
  assert.ok(engine.getCombatEffectEvents().some((event) => event.eventType === 'BOSS_PHASE_TRANSITION'), 'the transition is a canonical event');
});

test('boss phase: a phase does not summon again while it is steady', () => {
  const { engine, repository } = bossFight(40);
  const phases = new BossPhaseEngine();
  phases.evaluateAndPersist({ repository, storyId: 'story', bossId: 'dragon', phases: [enraged] });
  const count = engine.getParticipants().length;
  const again = phases.evaluateAndPersist({ repository, storyId: 'story', bossId: 'dragon', phases: [enraged] });
  assert.equal(again.changed, false);
  assert.equal(engine.getParticipants().length, count, 'no second wave');
});

test('boss phase: abilities carry full effect definitions, not empty stubs', () => {
  const effects = new BossPhaseEngine().buildPhaseEffect(enraged);
  const breath = effects.find((effect) => effect.id === 'fire_breath');
  assert.equal(breath?.damageFormula, '4d6');
  assert.equal(breath?.resolutionMode, 'AREA');
  assert.equal(breath?.provenance, undefined);
  const stub = new BossPhaseEngine().buildPhaseEffect({ id: 'x', name: 'X', abilities: ['bare'] })[0];
  assert.equal(stub.provenance, 'boss_phase_stub', 'an ability with no definition is marked as a stub');
});

test('boss phase: the phase ability spends the boss resource through the unified effect pipeline', () => {
  const { engine, repository } = bossFight(40);
  new BossPhaseEngine().evaluateAndPersist({ repository, storyId: 'story', bossId: 'dragon', phases: [enraged] });
  const breath = new BossPhaseEngine().buildPhaseEffect(enraged).find((effect) => effect.id === 'fire_breath')!;
  engine.advanceTurn();
  assert.equal(engine.getCurrentActor()?.id, 'dragon', "it is the dragon's turn");
  const result = combatEffectEngine.resolve(engine, 'dragon', ['hero'], breath);
  assert.equal(result.success, true);
  assert.ok((result.totalDamage || 0) >= 4);
  assert.equal(engine.getParticipants().find((entry) => entry.id === 'dragon')?.combatResources?.legendary_charges, 2);
});

test('boss phase: only valid authored ability definitions are kept', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(person({ id: 'dragon', team: 'enemies' }));
  const repository: any = {
    getEntityCard: () => ({
      metadata: { combat: { bossPhases: [{
        id: 'p1', name: 'Phase One',
        abilityDefinitions: [
          { id: 'ok', name: 'Fine', resolutionMode: 'AREA', scale: 'GROUP', damageFormula: '2d6' },
          { id: 'bad', name: 'Unsafe', resolutionMode: 'AREA', scale: 'GROUP', damageFormula: '9999d9999' },
        ],
        resources: { rage: 5, bogus: -2, other: 'x' },
      }] } },
    }),
  };
  const [phase] = new BossPhaseEngine().getAuthoredPhases(repository, 'story', 'dragon');
  assert.deepEqual((phase.abilityDefinitions || []).map((definition) => definition.id), ['ok']);
  assert.deepEqual(phase.resources, { rage: 5 });
});
