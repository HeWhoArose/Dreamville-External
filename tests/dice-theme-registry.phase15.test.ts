import test from 'node:test';
import assert from 'node:assert/strict';
import { CANONICAL_DICE_THEMES, DEFAULT_DICE_THEME, getCanonicalDiceTheme, isCanonicalDiceTheme } from '../src/data/diceThemes';

test('Phase 15 canonical dice theme registry has unique ids and complete dice coverage', () => {
	const ids = CANONICAL_DICE_THEMES.map((theme) => theme.id);
	assert.equal(new Set(ids).size, ids.length);
	for (const theme of CANONICAL_DICE_THEMES) {
		assert.ok(theme.label);
		assert.ok(Array.isArray(theme.supportedDiceTypes));
		for (const diceType of ['D4', 'D6', 'D8', 'D10', 'D12', 'D20', 'D100']) {
			assert.ok(theme.supportedDiceTypes.includes(diceType as any), theme.id + ' missing ' + diceType);
		}
		assert.equal(theme.id.startsWith('2D_'), theme.mode === '2D');
	}
});

test('Phase 15 theme lookup deterministically falls back to Classic', () => {
	assert.equal(getCanonicalDiceTheme('NOT_A_THEME').id, DEFAULT_DICE_THEME);
	assert.equal(isCanonicalDiceTheme('CLASSIC'), true);
	assert.equal(isCanonicalDiceTheme('NOT_A_THEME'), false);
});

test('Phase 15 2D themes are presentation-complete and do not require 3D assets', () => {
	for (const theme of CANONICAL_DICE_THEMES.filter((entry) => entry.mode === '2D')) {
		assert.equal(theme.assetPath, '');
		assert.equal(theme.availability, 'AVAILABLE');
	}
});
