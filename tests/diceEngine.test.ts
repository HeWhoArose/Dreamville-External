import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalDiceEngine, Dnd521RulesetAdapter } from '../server/domain/combatEngine';
import { getDieVisualType } from '../src/components/common/DiceRollAnimation';

test('dice engine resolves arbitrary dice formulas', () => {
  const engine = new LocalDiceEngine(1234);
  const roll = engine.roll('4d8+3');

  assert.equal(roll.diceTerms.length, 1);
  assert.equal(roll.diceTerms[0].count, 4);
  assert.equal(roll.diceTerms[0].sides, 8);
  assert.equal(roll.individualDice.length, 4);
  assert.equal(roll.modifier, 3);
  assert.equal(roll.total, roll.individualDice.reduce((sum, value) => sum + value, 0) + 3);
  assert.equal(roll.formula, '4d8+3');
});

test('dice engine resolves mixed dice formulas', () => {
  const engine = new LocalDiceEngine(5678);
  const roll = engine.roll('2d6+1d4+2');

  assert.deepEqual(roll.diceTerms, [
    { count: 2, sides: 6 },
    { count: 1, sides: 4 },
  ]);
  assert.equal(roll.individualDice.length, 3);
  assert.equal(roll.modifier, 2);
  assert.match(roll.formula, /^2d6\+1d4\+2$/);
});

test('critical damage doubles dice but not the flat modifier', () => {
  const adapter = new Dnd521RulesetAdapter();
  const engine = new LocalDiceEngine(42);
  const normal = adapter.resolveDamage('1d8+3', false, engine);

  const critEngine = new LocalDiceEngine(42);
  const critical = adapter.resolveDamage('1d8+3', true, critEngine);

  assert.equal(normal.roll.individualDice.length, 1);
  assert.equal(critical.roll.individualDice.length, 2);

  const diceSum = critical.roll.individualDice.reduce((sum, value) => sum + value, 0);
  assert.equal(critical.totalDamage, diceSum + 3);
});


test('dice UI maps common dice sizes to unmistakable physical die silhouettes', () => {
	assert.equal(getDieVisualType(4), 'D4');
	assert.equal(getDieVisualType(6), 'D6');
	assert.equal(getDieVisualType(8), 'D8');
	assert.equal(getDieVisualType(10), 'D10');
	assert.equal(getDieVisualType(12), 'D12');
	assert.equal(getDieVisualType(20), 'D20');
	assert.equal(getDieVisualType(100), 'D100');
	assert.equal(getDieVisualType(7), 'GENERIC');
});

test('mixed dice rolls retain one visual die per authoritative die term', () => {
	const engine = new LocalDiceEngine(2468);
	const roll = engine.roll('1d20+2d6+1d4');
	const visualSides = roll.diceTerms.flatMap((term) => Array.from({ length: term.count }, () => term.sides));
	assert.deepEqual(visualSides, [20, 6, 6, 4]);
	assert.deepEqual(visualSides.map(getDieVisualType), ['D20', 'D6', 'D6', 'D4']);
});
