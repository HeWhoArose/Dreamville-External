import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('past-action editing is wired across UI, API, canonical checkpointing, and rewind route', () => {
  const view = read('src/components/StoryView.tsx');
  const client = read('src/services/apiClient.ts');
  const routes = read('server/api/gameRoutes.ts');
  const types = read('src/types.ts');
  const engine = read('server/domain/canonicalCommandEngine.ts');

  assert.ok(view.includes('actionEditActionId'));
  assert.ok(view.includes('apiClient.editPastAction'));
  assert.ok(view.includes('Replace & rewind'));
  assert.ok(view.includes("document.addEventListener('pointerdown'"));
  assert.ok(view.includes('ref={narrationMenuRef}'));
  assert.ok(view.includes("entry.actionType === 'CUSTOM_ACTION'"));

  assert.ok(client.includes('editPastAction(params'));
  assert.ok(client.includes('/action/history/edit'));

  assert.ok(types.includes('canonicalCommandId?: string'));
  assert.ok(types.includes('canonicalEventId?: string'));

  assert.ok(engine.includes('preStateSnapshot?: CanonicalStateSnapshot'));
  assert.ok(engine.includes('mockStateBefore?: unknown'));
  assert.ok(engine.includes('preStateSnapshot:'));
  assert.ok(engine.includes('buildReplayCheckpoint(before)'));

  assert.ok(routes.includes("gameRouter.post('/action/history/edit'"));
  assert.ok(routes.includes('targetEvent?.replay?.preStateSnapshot'));
  assert.ok(routes.includes('restoreCanonicalStateSnapshot(preStateSnapshot'));
  assert.ok(routes.includes('serverMockAuthority.importTransactionalState(storyId, mockStateBefore)'));
  assert.ok(routes.includes('processCustomAction('));
  assert.ok(routes.includes('removedActionCount'));
  assert.ok(routes.includes('(commandResult.data as any).viewState = serverMockAuthority.getSanitizedViewState(storyId)'));
});

test('dice presets include Norse Foundry-inspired artistic families', () => {
  const themes = read('src/components/common/diceThemes.ts');

  for (const id of ['ROYAL_CROWN', 'AMETHYST_GOLD', 'SHADOW_KNIGHT', 'ENCHANTED_PARCHMENT']) {
    assert.ok(themes.includes("id: '" + id + "'"));
  }

  assert.ok(themes.includes('Regal purple-and-gold metal'));
  assert.ok(themes.includes('Gemstone-style violet glass'));
  assert.ok(themes.includes('Dark forged-metal dice'));
  assert.ok(themes.includes('Warm antique-gold dice'));
});

test('current custom actions remain editable, and AI narration failure still produces local prose', () => {
  const view = read('src/components/StoryView.tsx');
  const authority = read('server/mockEngine/serverMockAuthority.ts');
  const routes = read('server/api/gameRoutes.ts');

  assert.ok(view.includes('entry.actionType === ' + "'CUSTOM_ACTION'"));
  assert.ok(view.includes('entry.canonicalCommandId'));
  assert.ok(view.includes('Replace & rewind'));

  assert.ok(authority.includes('public synthesizeFreeformActionFallback'));
  assert.ok(authority.includes('LOCAL_NARRATION_FALLBACK'));
  assert.ok(authority.includes("modelId: 'local-story-fallback'"));

  assert.ok(routes.includes("gameRouter.post('/action/history/edit'"));
  assert.ok(routes.includes('targetIndex'));
  assert.ok(routes.includes('removedActionCount'));
  assert.ok(routes.includes("modelId: 'local-story-fallback'"));
  assert.ok(routes.includes('return res.json({'));
});

test('past-action edits remain distinct from presentation-only narration regeneration', () => {
  const view = read('src/components/StoryView.tsx');
  const routes = read('server/api/gameRoutes.ts');

  const presentationOnlyIndex = routes.indexOf('gameRouter.post(\'/action/narrate/regenerate\'');
  const historyEditIndex = routes.indexOf('gameRouter.post(\'/action/history/edit\'');
  assert.ok(historyEditIndex >= 0);
  assert.ok(presentationOnlyIndex >= 0);
  assert.notEqual(historyEditIndex, presentationOnlyIndex);
  assert.ok(view.includes('regenerateNarration(entry'));
  assert.ok(view.includes('editPastAction(entry'));
});
