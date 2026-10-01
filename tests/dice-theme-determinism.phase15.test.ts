import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalDiceEngine } from '../server/domain/combatEngine';
import { DEFAULT_DICE_THEME, type DiceThemeId } from '../src/data/diceThemes';

test('Phase 15 changing dice theme metadata cannot alter deterministic roll values', () => {
	const engineA = new LocalDiceEngine(1337);
	const engineB = new LocalDiceEngine(1337);
	const rawA = engineA.roll('1d20', 4);
	const rawB = engineB.roll('1d20', 4);
	const rollA = { ...rawA, diceThemeId: 'CLASSIC' as DiceThemeId };
	const rollB = { ...rawB, diceThemeId: '2D_PARCHMENT' as DiceThemeId };

	assert.deepEqual(
		{ individualDice: rollA.individualDice, total: rollA.total, formula: rollA.formula },
		{ individualDice: rollB.individualDice, total: rollB.total, formula: rollB.formula },
	);
	assert.notEqual(rollA.diceThemeId, rollB.diceThemeId);
	assert.equal(DEFAULT_DICE_THEME, 'CLASSIC');
});

test('Phase 15 canonical RollRecord theme metadata is optional for legacy rolls', () => {
	const legacy = new LocalDiceEngine(9).roll('1d20', 0);
	assert.equal(legacy.diceThemeId, undefined);
});
