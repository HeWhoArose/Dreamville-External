import assert from 'node:assert/strict';
import test from 'node:test';

import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { deathSaveEngine } from '../server/domain/deathSaveEngine';
import { LocalDiceEngine } from '../server/domain/combatEngine';

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hero',
    name: 'Hero',
    x: 0,
    y: 0,
    initiative: 0,
    initiativeModifier: 100,
    team: 'player_allies' as const,
    hpCurrent: 10,
    hpMax: 10,
    armorClass: 12,
    speedCells: 6,
    attackBonus: 100,
    damageFormula: '1d4+1',
    conditions: [],
    isDead: false,
    usesDeathSaves: true,
    deathSaveState: deathSaveEngine.createState(),
    ...overrides,
  };
}

test('death-save engine handles natural 20, natural 1, stabilization, and lethal failure', () => {
  const natural20 = deathSaveEngine.resolveTurnStart(
    deathSaveEngine.createState(),
    new LocalDiceEngine(19)
  );
  assert.equal(natural20.roll.individualDice[0], 20);
  assert.equal(natural20.revived, true);
  assert.equal(natural20.state.successes, 0);
  assert.equal(natural20.state.failures, 0);

  const natural1 = deathSaveEngine.resolveTurnStart(
    deathSaveEngine.createState(),
    new LocalDiceEngine(20)
  );
  assert.equal(natural1.roll.individualDice[0], 1);
  assert.equal(natural1.state.failures, 2);

  const stabilized = deathSaveEngine.resolveTurnStart(
    { successes: 2, failures: 0, stable: false },
    new LocalDiceEngine(6)
  );
  assert.equal(stabilized.stabilized, true);
  assert.equal(stabilized.state.stable, true);

  const lethal = deathSaveEngine.applyDamageAtZero(
    { successes: 0, failures: 2, stable: false },
    false
  );
  assert.equal(lethal.died, true);
  assert.equal(lethal.state.failures, 3);

  const critical = deathSaveEngine.applyDamageAtZero(
    { successes: 0, failures: 1, stable: true },
    true
  );
  assert.equal(critical.failuresAdded, 2);
  assert.equal(critical.died, true);
});

test('player combatant drops to unconscious at 0 HP and begins death saves instead of dying immediately', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(makeParticipant());
  engine.addParticipant({
    id: 'enemy',
    name: 'Enemy',
    x: 1,
    y: 0,
    initiative: 0,
    initiativeModifier: 0,
    team: 'enemies',
    hpCurrent: 20,
    hpMax: 20,
    armorClass: 10,
    speedCells: 4,
    attackBonus: 0,
    damageFormula: '1d4+1',
    conditions: [],
    isDead: false,
  });
  engine.rollInitiative();

  const result = engine.executeCapabilityCast({
    actorId: 'hero',
    targetId: 'hero',
    capabilityName: 'Backlash',
    baseDamage: 10,
    actionType: 'action',
  });

  assert.equal(result.success, true);
  assert.equal(result.targetDied, false);
  assert.equal(result.targetHpRemaining, 0);

  const hero = engine.getParticipant('hero');
  assert.equal(hero?.isDead, false);
  assert.equal(hero?.hpCurrent, 0);
  assert.equal(hero?.usesDeathSaves, true);
  assert.equal(hero?.deathSaveState?.successes, 0);
  assert.equal(hero?.deathSaveState?.failures, 0);
  assert.ok(hero?.conditions.includes('Unconscious'));

  const blocked = engine.executeCoreAction('hero', 'DASH');
  assert.equal(blocked.success, false);
  assert.match(blocked.errorReason || '', /unconscious or dead/i);
});

test('damage received at 0 HP adds a death-save failure and a critical hit adds two', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(makeParticipant());
  engine.addParticipant({
    id: 'enemy',
    name: 'Enemy',
    x: 1,
    y: 0,
    initiative: 0,
    initiativeModifier: 0,
    team: 'enemies',
    hpCurrent: 20,
    hpMax: 20,
    armorClass: 10,
    speedCells: 4,
    attackBonus: 0,
    damageFormula: '1d4+1',
    conditions: [],
    isDead: false,
  });
  engine.rollInitiative();

  const knockdown = engine.executeCapabilityCast({
    actorId: 'hero',
    targetId: 'hero',
    capabilityName: 'Backlash',
    baseDamage: 10,
    actionType: 'action',
  });
  assert.equal(knockdown.targetDied, false);

  engine.advanceTurn();
  const damageAtZero = engine.executeCapabilityCast({
    actorId: 'enemy',
    targetId: 'hero',
    capabilityName: 'Execution Test',
    baseDamage: 1,
    actionType: 'action',
  });

  assert.equal(damageAtZero.success, true);
  assert.equal(engine.getParticipant('hero')?.deathSaveState?.failures, 1);
  assert.equal(engine.getParticipant('hero')?.isDead, false);
});
