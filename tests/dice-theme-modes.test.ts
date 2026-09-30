import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_DICE_THEME, DICE_THEME_PRESETS, getDiceThemePreset } from '../src/components/common/diceThemes';

test('dice theme registry exposes balanced 3D and 2D theme families', () => {
	assert.equal(DICE_THEME_PRESETS.length, 16);
	assert.equal(DICE_THEME_PRESETS.filter((theme) => theme.mode === '3D').length, 10);
	assert.equal(DICE_THEME_PRESETS.filter((theme) => theme.mode === '2D').length, 6);
	assert.equal(new Set(DICE_THEME_PRESETS.map((theme) => theme.id)).size, 16);
	assert.equal(getDiceThemePreset('2D_ARCANE').mode, '2D');
	assert.equal(getDiceThemePreset('2D_ARCANE').label, '2D Arcane Ink');
	assert.equal(getDiceThemePreset('not-a-real-theme').id, DEFAULT_DICE_THEME);
});

test('2D dice themes are selectable from the Story More menu', () => {
	const source = readFileSync(join(process.cwd(), 'src/components/StoryView.tsx'), 'utf8');
	assert.match(source, /aria-label="Open More story tools"/);
	assert.match(source, /<span className="text-xs font-semibold">More<\/span>/);
	assert.match(source, /2D Illustrated/);
	assert.match(source, /theme\.mode === mode/);
	assert.match(source, /DICE_THEME_PRESETS\.filter\(\(theme\) => theme\.mode === mode\)/);
});

test('2D dice presentation bypasses the 3D dice-box engine while preserving authoritative values', () => {
	const source = readFileSync(join(process.cwd(), 'src/components/common/DiceRollAnimation.tsx'), 'utf8');
	assert.match(source, /function get2DDiceClipPath/);
	assert.match(source, /const TwoDDicePresentation/);
	assert.match(source, /if \(diceTheme\.mode === '2D'\)/);
	assert.match(source, /const box = diceTheme\.mode === '2D' \? null : await initializeDiceBox\(\)/);
	assert.match(source, /roll\.individualDice\[index\]/);
	assert.match(source, /@3d-dice\/dice-box-threejs/);
});
