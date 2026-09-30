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

  assert.match(view, /actionEditActionId/);
  assert.match(view, /apiClient\\.editPastAction/);
  assert.match(view, /Replace & rewind/);
  assert.match(view, /document\\.addEventListener\\('pointerdown'/);
  assert.match(view, /ref=\\{narrationMenuRef\\}/);
  assert.match(view, /entry\\.actionType === 'CUSTOM_ACTION'/);

  assert.match(client, /editPastAction\\(params/);
  assert.match(client, /\\/action\\/history\\/edit/);

  assert.match(types, /canonicalCommandId\\?: string/);
  assert.match(types, /canonicalEventId\\?: string/);

  assert.match(engine, /preStateSnapshot\\?: CanonicalStateSnapshot/);
  assert.match(engine, /mockStateBefore\\?: unknown/);
  assert.match(engine, /preStateSnapshot: clone\\(before\\)/);

  assert.match(routes, /POST \\/api\\/game\\/action\\/history\\/edit/);
  assert.match(routes, /targetEvent\\?\\.replay\\?\\.preStateSnapshot/);
  assert.match(routes, /restoreCanonicalStateSnapshot\\(preStateSnapshot/);
  assert.match(routes, /serverMockAuthority\\.importTransactionalState\\(storyId, mockStateBefore\\)/);
  assert.match(routes, /processCustomAction\\(/);
  assert.match(routes, /removedActionCount/);
});

test('dice presets include Norse Foundry-inspired artistic families', () => {
  const themes = read('src/components/common/diceThemes.ts');

  for (const id of ['ROYAL_CROWN', 'AMETHYST_GOLD', 'SHADOW_KNIGHT', 'ENCHANTED_PARCHMENT']) {
    assert.ok(themes.includes("id: '" + id + "'"));
  }

  assert.match(themes, /Regal purple-and-gold metal/);
  assert.match(themes, /Gemstone-style violet glass/);
  assert.match(themes, /Dark forged-metal dice/);
  assert.match(themes, /Warm antique-gold dice/);
});

test('past-action edits remain distinct from presentation-only narration regeneration', () => {
  const view = read('src/components/StoryView.tsx');
  const routes = read('server/api/gameRoutes.ts');

  const presentationOnlyIndex = routes.indexOf('POST /api/game/action/narrate/regenerate');
  const historyEditIndex = routes.indexOf('POST /api/game/action/history/edit');
  assert.ok(historyEditIndex >= 0);
  assert.ok(presentationOnlyIndex >= 0);
  assert.notEqual(historyEditIndex, presentationOnlyIndex);
  assert.match(view, /regenerateNarration\\(entry/);
  assert.match(view, /editPastAction\\(entry/);
});
