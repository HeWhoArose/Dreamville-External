import assert from 'node:assert/strict';
import test from 'node:test';

import { CombatActionEconomy } from '../server/domain/combatActionEconomy';

test('combat action economy tracks one Action, Bonus Action, Reaction, and split movement per turn', () => {
  const economy = new CombatActionEconomy();
  economy.registerActor('hero', 6, 1);

  assert.equal(economy.get('hero')?.actionAvailable, true);
  assert.equal(economy.get('hero')?.bonusActionAvailable, true);
  assert.equal(economy.get('hero')?.reactionAvailable, true);
  assert.equal(economy.get('hero')?.movementRemainingCells, 6);

  assert.equal(economy.consumeMovement('hero', 2).success, true);
  assert.equal(economy.get('hero')?.movementRemainingCells, 4);

  assert.equal(economy.consumeMovement('hero', 3).success, true);
  assert.equal(economy.get('hero')?.movementRemainingCells, 1);

  const deniedMovement = economy.consumeMovement('hero', 2);
  assert.equal(deniedMovement.success, false);
  assert.match(deniedMovement.errorReason || '', /remaining movement/i);

  assert.equal(economy.consume('hero', 'ACTION').success, true);
  assert.equal(economy.consume('hero', 'ACTION').success, false);

  assert.equal(economy.consume('hero', 'BONUS_ACTION').success, true);
  assert.equal(economy.consume('hero', 'BONUS_ACTION').success, false);

  assert.equal(economy.consumeReaction('hero').success, true);
  assert.equal(economy.consumeReaction('hero').success, false);
});

test('Dash consumes the Action and adds another Speed-sized movement allowance', () => {
  const economy = new CombatActionEconomy();
  economy.registerActor('hero', 5, 1);

  assert.equal(economy.consumeMovement('hero', 2).success, true);

  const dash = economy.grantDash('hero');
  assert.equal(dash.success, true);

  const state = economy.get('hero');
  assert.equal(state?.actionAvailable, false);
  assert.equal(state?.dashMovementBonusCells, 5);
  assert.equal(state?.movementRemainingCells, 8);

  assert.equal(economy.grantDash('hero').success, false);
});

test('beginTurn resets turn resources and reaction while preserving the actor identity', () => {
  const economy = new CombatActionEconomy();
  economy.registerActor('hero', 4, 1);

  economy.consume('hero', 'ACTION');
  economy.consume('hero', 'BONUS_ACTION');
  economy.consume('hero', 'REACTION');
  economy.consumeMovement('hero', 4);

  const ready = economy.setReadyAction('hero', 'Attack', 'When the door opens');
  assert.equal(ready.success, false, 'Ready should require the Action and therefore fail after it was spent.');

  const next = economy.beginTurn('hero', 4, 2);
  assert.equal(next.actorId, 'hero');
  assert.equal(next.round, 2);
  assert.equal(next.actionAvailable, true);
  assert.equal(next.bonusActionAvailable, true);
  assert.equal(next.reactionAvailable, true);
  assert.equal(next.movementRemainingCells, 4);
  assert.equal(next.dashMovementBonusCells, 0);
  assert.equal(next.readyAction, undefined);
});

test('action-economy state round-trips through persistence snapshots', () => {
  const source = new CombatActionEconomy();
  source.registerActor('hero', 6, 3);
  source.consume('hero', 'ACTION');
  source.consumeMovement('hero', 2);

  const restored = new CombatActionEconomy();
  restored.importState(source.exportState());

  assert.deepEqual(restored.get('hero'), source.get('hero'));
});
