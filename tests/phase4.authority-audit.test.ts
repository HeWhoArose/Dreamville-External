import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const gameRoutes = readFileSync(resolve(process.cwd(), 'server/api/gameRoutes.ts'), 'utf8');
const canonicalEngine = readFileSync(resolve(process.cwd(), 'server/domain/canonicalCommandEngine.ts'), 'utf8');

function routeBlock(route: string): string {
  const start = gameRoutes.indexOf(`gameRouter.post('${route}'`);
  assert.ok(start >= 0, `Route ${route} must exist.`);
  const next = gameRoutes.indexOf('gameRouter.', start + 1);
  return gameRoutes.slice(start, next >= 0 ? next : gameRoutes.length);
}

test('Phase 4 — canonical action handlers do not derive canonical evidence ids from wall-clock randomness', () => {
  const routes = [
    '/action',
    '/inventory/craft',
    '/inventory/transfer',
    '/capabilities/adjudicate',
    '/capabilities/interpret',
    '/combat/action',
    '/combat/attack',
    '/combat/cast',
    '/living-world/advance',
    '/orchestrator/turn',
    '/worlds/runs/:storyId/actions/execute',
  ];
  for (const route of routes) {
    const block = routeBlock(route);
    assert.doesNotMatch(block, /\b(?:eventId|sourceEventId|factId|threadId)\s*:\s*[^
]*(?:Date\.now|Math\.random)/, `Canonical route ${route} must not derive canonical identifiers from wall-clock/random entropy.`);
  }
});

test('Phase 4 — canonical command events use deterministic identity and canonical time', () => {
  assert.doesNotMatch(canonicalEngine, /eventId:\s*\`evt_cmd_\$\{command\.storyId\}_\$\{command\.commandId\}/);
  assert.doesNotMatch(canonicalEngine, /committedAt:\s*new Date\(/);
  assert.match(canonicalEngine, /deterministicId\('evt_cmd'/);
  assert.match(canonicalEngine, /committedAt:\s*\`canonical:/);
});

test('Phase 4 — Chronicle-producing routes are all behind canonical command resolution', () => {
  const routes = [
    '/action',
    '/inventory/craft',
    '/inventory/transfer',
    '/capabilities/adjudicate',
    '/capabilities/interpret',
    '/combat/action',
    '/combat/attack',
    '/combat/cast',
    '/living-world/advance',
    '/living-world/schedule-event',
    '/orchestrator/turn',
  ];
  for (const route of routes) {
    const block = routeBlock(route);
    assert.match(block, /canonicalCommandEngine\.execute/, `Route ${route} bypasses canonical transaction resolution.`);
  }
});
