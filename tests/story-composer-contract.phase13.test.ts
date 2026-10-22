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


test('Narration retry after an already-committed action uses its action ID instead of replaying gameplay', () => {
	assert.match(app, /failedStoryNarrationActionId/);
	assert.match(app, /err\?\.data\?\.actionCommitted === true/);
	assert.match(app, /setFailedStoryNarrationActionId\(err\.data\.actionId\)/);
	assert.match(app, /apiClient\.regenerateNarration\(\{[\s\S]{0,220}actionId: failedStoryNarrationActionId/);
	assert.match(app, /else if \(failedStoryAction\)[\s\S]{0,180}handleCustomAction\(failedStoryAction, failedStoryCommandId \|\| undefined\)/);
});

test('Committed-action narration retry remains separate from canonical gameplay execution', () => {
	const routes = fs.readFileSync(path.join(root, 'server/api/gameRoutes.ts'), 'utf8');
	const start = routes.indexOf("gameRouter.post('/action/narrate/regenerate'");
	assert.ok(start >= 0, 'presentation-only regeneration endpoint exists');
	const nextRoute = routes.indexOf('\ngameRouter.', start + 1);
	const route = routes.slice(start, nextRoute > start ? nextRoute : undefined);
	assert.match(route, /state\.actionHistory\.find\(\(entry: any\) => entry\.id === actionId\)/);
	assert.match(route, /generateNarrativeOnly\(/);
	assert.match(route, /actionCommitted: true/);
	assert.doesNotMatch(route, /canonicalCommandEngine\.execute\(|serverMockAuthority\.processAction\(|processCustomAction\(/);
	assert.doesNotMatch(route, /actionHistory\.push\(|getWorldClock\([^)]*\)\.advance\(/);
});

test('Retry controls attached to a narration card regenerate that same action, not a new turn', () => {
	const regenerateStart = storyView.indexOf('const regenerateNarration = async (entry: ActionLog');
	assert.ok(regenerateStart >= 0);
	const regenerateEnd = storyView.indexOf('const requestScenePrompt', regenerateStart);
	const regenerate = storyView.slice(regenerateStart, regenerateEnd);
	assert.match(regenerate, /actionId: entry\.id/);
	assert.match(regenerate, /apiClient\.regenerateNarration\(/);
	assert.doesNotMatch(regenerate, /onCustomAction\?\.\(/);
	assert.match(storyView, /onClick=\{\(\) => regenerateNarration\(entry\)\}/);
});
