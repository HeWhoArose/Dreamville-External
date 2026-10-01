import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const storyView = fs.readFileSync(path.join(root, 'src/components/StoryView.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');

test('Phase 13 StoryView exposes an explicit suggestion refresh boundary', () => {
	assert.match(storyView, /onRefreshSuggestions\?\:/);
	assert.match(storyView, /aria-controls="story-suggestions-panel"/);
	assert.match(storyView, /aria-label="Refresh story suggestions"/);
});

test('Phase 13 StoryView does not refresh suggestions merely by opening the menu', () => {
	const suggestionButton = storyView.match(
		/aria-controls="story-suggestions-panel"[\s\S]{0,900}?<\/button>/,
	);
	assert.ok(suggestionButton);
	assert.doesNotMatch(suggestionButton[0], /onRefreshSuggestions/);
});

test('Phase 13 StoryView has accessible multiline action input and safe retry surface', () => {
	assert.match(storyView, /id="story-action-composer"/);
	assert.match(storyView, /aria-multiline="true"/);
	assert.match(storyView, /onRetryLastAction\?/);
	assert.match(storyView, /role="alert"/);
});

test('Phase 13 App wires refresh and failed-action retry to the canonical StoryView', () => {
	assert.match(app, /apiClient\.getStoryActionTips\(activeStoryId, \{ refresh: force \}\)/);
	assert.match(app, /onRefreshSuggestions=\{\(\) => refreshStoryActionTips\(true\)\}/);
	assert.match(app, /onRetryLastAction=\{\(\) => \{/);
	assert.match(app, /failedStoryAction/);
});

test('Phase 13 App persists only CUSTOM_ACTION failures as replayable story actions', () => {
	assert.match(app, /\(action as any\)\.type === 'CUSTOM_ACTION'/);
	assert.match(app, /setFailedStoryAction\(actionText\)/);
});
