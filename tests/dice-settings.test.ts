import test from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULT_DICE_THEME,
	DICE_THEME_PRESETS,
	getDiceThemePreset,
} from '../src/components/common/diceThemes';
import { resolveDiceRevealState } from '../src/components/common/DiceRollAnimation';

test('dice theme presets are stable, unique, and renderable', () => {
	assert.ok(DICE_THEME_PRESETS.length >= 5);
	assert.equal(new Set(DICE_THEME_PRESETS.map((theme) => theme.id)).size, DICE_THEME_PRESETS.length);

	for (const theme of DICE_THEME_PRESETS) {
		assert.ok(theme.label);
		assert.ok(theme.description);
		assert.ok(theme.customColorset.background);
		assert.ok(theme.customColorset.foreground);
		assert.equal(typeof theme.spotlight, 'number');
	}
});

test('invalid dice theme preferences fall back to the default theme', () => {
	assert.equal(getDiceThemePreset(undefined).id, DEFAULT_DICE_THEME);
	assert.equal(getDiceThemePreset('NOT_A_REAL_THEME').id, DEFAULT_DICE_THEME);
});

test('a persisted reveal override keeps an already-resolved roll revealed', () => {
	assert.equal(resolveDiceRevealState(true, false), true);
	assert.equal(resolveDiceRevealState(false, true), true);
	assert.equal(resolveDiceRevealState(undefined, false), false);
});
