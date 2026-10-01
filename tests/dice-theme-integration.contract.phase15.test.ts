import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const authority = fs.readFileSync(path.join(root, 'server/domain/storyCheckAuthority.ts'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'server/domain/storyCheckEngine.ts'), 'utf8');
const sensory = fs.readFileSync(path.join(root, 'server/domain/sensoryEngine.ts'), 'utf8');
const animation = fs.readFileSync(path.join(root, 'src/components/common/DiceRollAnimation.tsx'), 'utf8');
const audio = fs.readFileSync(path.join(root, 'src/components/AudioHapticManager.tsx'), 'utf8');

test('Phase 15 authority reads canonical story-scoped theme before resolving checks', () => {
	assert.match(authority, /repository\.getSensoryEngine\(\)\.getDiceTheme\(request\.storyId\)/);
	assert.match(authority, /request\.resolutionHint,[\s\S]{0,120}diceThemeId,/);
});

test('Phase 15 StoryCheckEngine writes canonical theme into both standard and custom rolls', () => {
	assert.match(engine, /diceThemeId: canonicalDiceTheme\.id/);
	assert.match(engine, /resolveCustomD20\(storyId, challenge, diceThemeId\)/);
	assert.match(engine, /diceThemeId: getCanonicalDiceTheme\(diceThemeId\)\.id/);
});

test('Phase 15 SensoryEngine validates themes server-side and exposes the normalized value', () => {
	assert.match(sensory, /isCanonicalDiceTheme\(requestedDiceTheme\)/);
	assert.match(sensory, /getDiceTheme\(storyId: string\)/);
	assert.match(sensory, /DEFAULT_DICE_THEME/);
});

test('Phase 15 DiceRollAnimation prefers the authoritative roll theme over local settings', () => {
	assert.match(animation, /const activeDiceThemeId = roll\.diceThemeId \|\| settings\.diceTheme/);
});

test('Phase 15 AudioHapticManager uses the ApiClient boundary for story-scoped settings', () => {
	assert.match(audio, /apiClient\.updateSensorySettings\(newSettings, storyId\)/);
	assert.match(audio, /apiClient\.getSensoryState\(storyId\)/);
	assert.doesNotMatch(audio, /fetch\(['"]\/api\/game\/sensory\/settings/);
});
