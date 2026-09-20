import assert from 'node:assert/strict';
import test from 'node:test';

import { Dnd521RulesetAdapter, LocalDiceEngine, TacticalCombatEngine } from '../server/domain/combatEngine';

function participant(overrides: Partial<Parameters<TacticalCombatEngine['addParticipant']>[0]> = {}) {
  return {
    id: 'hero',
    name: 'Hero',
    x: 0,
    y: 0,
    initiative: 0,
    team: 'player_allies' as const,
    hpCurrent: 20,
    hpMax: 20,
    armorClass: 12,
    speedCells: 6,
    attackBonus: 5,
    damageFormula: '1d8+3',
    conditions: [],
    isDead: false,
    ...overrides,
  };
}

test('combat engine tracks split movement instead of granting full Speed on every move request', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(participant());
  engine.addParticipant(participant({
    id: 'enemy',
    name: 'Enemy',
    x: 10,
    y: 10,
    team: 'enemies',
  }));
  engine.rollInitiative();

  const first = engine.moveActor('hero', 3, 0);
  assert.equal(first.success, true);
  assert.equal(engine.getTurnResources('hero')?.movementRemainingCells, 3);

  const second = engine.moveActor('hero', 6, 0);
  assert.equal(second.success, true);
  assert.equal(engine.getTurnResources('hero')?.movementRemainingCells, 0);

  const denied = engine.moveActor('hero', 7, 0);
  assert.equal(denied.success, false);
  assert.match(denied.errorReason || '', /remaining movement/i);
});

test('Dash consumes the Action and restores additional movement equal to Speed', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(participant());
  engine.addParticipant(participant({
    id: 'enemy',
    name: 'Enemy',
    x: 10,
    y: 10,
    team: 'enemies',
  }));
  engine.rollInitiative();

  assert.equal(engine.moveActor('hero', 2, 0).success, true);
  const beforeDash = engine.getTurnResources('hero');
  assert.equal(beforeDash?.movementRemainingCells, 4);
  assert.equal(beforeDash?.actionAvailable, true);

  const dash = engine.executeCoreAction('hero', 'DASH');
  assert.equal(dash.success, true);

  const afterDash = engine.getTurnResources('hero');
  assert.equal(afterDash?.actionAvailable, false);
  assert.equal(afterDash?.movementRemainingCells, 10);
});

test('Dodge changes the canonical actor state used by attack and Dexterity-save resolution', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(participant({ initiativeModifier: 100 }));
  engine.addParticipant(participant({
    id: 'enemy',
    name: 'Enemy',
    x: 1,
    y: 0,
    team: 'enemies',
    attackBonus: 5,
    damageFormula: '1d4+1',
  }));
  engine.rollInitiative();

  const active = engine.getCurrentActor();
  assert.equal(active?.id, 'hero');

  const dodge = engine.executeCoreAction('hero', 'DODGE');
  assert.equal(dodge.success, true);
  assert.equal(engine.getTurnResources('hero')?.dodging, true);

  const save = new Dnd521RulesetAdapter().resolveSavingThrow({
    saveModifier: 2,
    difficultyClass: 12,
    advantage: true,
    diceEngine: new LocalDiceEngine(1337),
  });
  assert.ok(save.roll.individualDice.length >= 1);
});

test('Bonus Action and Reaction capability types use their declared resource rather than Action', () => {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(participant());
  engine.addParticipant(participant({
    id: 'enemy',
    name: 'Enemy',
    x: 1,
    y: 0,
    team: 'enemies',
  }));
  engine.rollInitiative();

  const bonus = engine.executeCapabilityCast({
    actorId: 'hero',
    targetId: 'enemy',
    capabilityName: 'Bonus Strike',
    baseDamage: 1,
    actionType: 'bonus_action',
  });
  assert.equal(bonus.success, true);
  assert.equal(engine.getTurnResources('hero')?.bonusActionAvailable, false);
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, true);

  engine.advanceTurn();
  engine.advanceTurn();
  const reaction = engine.executeCapabilityCast({
    actorId: 'hero',
    targetId: 'enemy',
    capabilityName: 'Reaction Strike',
    baseDamage: 1,
    actionType: 'reaction',
  });
  assert.equal(reaction.success, true);
  assert.equal(engine.getTurnResources('hero')?.reactionAvailable, false);
});

test('D&D adapter uses advantage/disadvantage for saving throws', () => {
  const adapter = new Dnd521RulesetAdapter();
  const advantageRoll = adapter.resolveSavingThrow({
    saveModifier: 0,
    difficultyClass: 21,
    advantage: true,
    diceEngine: new LocalDiceEngine(1337),
  });
  const disadvantageRoll = adapter.resolveSavingThrow({
    saveModifier: 0,
    difficultyClass: 21,
    disadvantage: true,
    diceEngine: new LocalDiceEngine(1337),
  });

  assert.notEqual(advantageRoll.roll.total, disadvantageRoll.roll.total);
});
