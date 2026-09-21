import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const gameRoutes = readFileSync(resolve(process.cwd(), 'server/api/gameRoutes.ts'), 'utf8');
const canonicalEngine = readFileSync(resolve(process.cwd(), 'server/domain/canonicalCommandEngine.ts'), 'utf8');
const worldRepository = readFileSync(resolve(process.cwd(), 'server/repositories/worldRepository.ts'), 'utf8');
const mockAuthority = readFileSync(resolve(process.cwd(), 'server/mockEngine/serverMockAuthority.ts'), 'utf8');
const deterministicRng = readFileSync(resolve(process.cwd(), 'server/domain/deterministicRng.ts'), 'utf8');
const aiOrchestrator = readFileSync(resolve(process.cwd(), 'server/domain/aiOrchestrator.ts'), 'utf8');

function routeBlock(route: string): string {
  const start = gameRoutes.indexOf(`gameRouter.post('${route}'`);
  assert.ok(start >= 0, `Route ${route} must exist.`);
  const next = gameRoutes.indexOf('gameRouter.', start + 1);
  return gameRoutes.slice(start, next >= 0 ? next : gameRoutes.length);
}

test('Phase 4 — repository Chronicle engines are transactional, with explicit bootstrap-only writes', () => {
	assert.doesNotMatch(worldRepository, /new HistoricalChronicleEngine\(\);/, 'Repository-owned Chronicle engines must never fall back to DIRECT write mode.');
	assert.match(worldRepository, /new HistoricalChronicleEngine\(\{\s*writeMode: 'TRANSACTIONAL',/);
	assert.match(worldRepository, /recordBootstrapEvidence\(/);
});
test('Phase 4 — canonical repository identifiers do not depend on wall-clock or Math.random entropy', () => {
	assert.doesNotMatch(
		worldRepository,
		/const storyId = params\.storyId \|\| .*Date\.now|const storyId = params\.storyId \|\| .*Math\.random/,
		'StoryRun identifiers must be deterministic when the caller does not supply one.'
	);
	assert.doesNotMatch(
		worldRepository,
		/const capId = cap\.id \|\| .*Date\.now|const capId = cap\.id \|\| .*Math\.random/,
		'Canonical capability identifiers must be deterministic when the source lacks an explicit id.'
	);
	assert.doesNotMatch(
		worldRepository,
		/sessionId:\s*.*Date\.now\(/,
		'Canonical adaptation session identifiers must not use wall-clock entropy.'
	);
	assert.match(worldRepository, /deterministicId\('cap'/);
	assert.match(worldRepository, /deterministicId\('draft'/);
	assert.match(worldRepository, /deterministicId\('char'/);
	assert.match(deterministicRng, /export function stableStringify/);
});

test('Phase 4 — legacy Story Run creation does not use wall-clock or Math.random entropy', () => {
	const startRoute = "gameRouter.post('/worlds/:worldId/start-run'";
	const start = gameRoutes.indexOf(startRoute);
	assert.ok(start >= 0, 'Legacy start-run route must exist.');
	const next = gameRoutes.indexOf('gameRouter.', start + 1);
	const startRun = gameRoutes.slice(start, next >= 0 ? next : gameRoutes.length);
	assert.doesNotMatch(startRun, /storyId\s*=\s*.*Date\.now\(\)/);
	assert.doesNotMatch(startRun, /Math\.random\(\)/);
	assert.match(startRun, /deterministicId\(\s*['"]run_legacy['"]/);
});
test('Phase 4 — legacy mock action identifiers are deterministic', () => {
	assert.doesNotMatch(mockAuthority, /const actionId = .*Date\.now|const actionId = .*Math\.random/);
	assert.match(mockAuthority, /deterministicId\(\s*['"]act_srv['"]/);
});
test('Phase 4 — command, turn, and checkpoint identities are not wall-clock generated', () => {
	assert.doesNotMatch(gameRoutes, /Date\.now\(\)|Math\.random\(\)/);
	assert.doesNotMatch(aiOrchestrator, /`turn_\$\{Date\.now/);
	assert.doesNotMatch(aiOrchestrator, /`cp_\$\{Date\.now/);
	assert.doesNotMatch(aiOrchestrator, /cp_restored_\$\{Date\.now/);
	assert.match(aiOrchestrator, /deterministicId\('turn'/);
	assert.match(aiOrchestrator, /deterministicId\('cp'/);
});
test('Phase 4 — canonical action handlers do not derive canonical evidence ids from wall-clock randomness', () => {
  const routes = [
    '/action',
    '/inventory/craft',
    '/inventory/transfer',
    '/capabilities/adjudicate',
    '/capabilities/interpret',
    '/capabilities/synthesize',
    '/combat/action',
    '/combat/attack',
    '/combat/cast',
    '/living-world/advance',
    '/orchestrator/turn',
    '/worlds/runs/:storyId/actions/execute',
  ];
  for (const route of routes) {
    const block = routeBlock(route);
    assert.doesNotMatch(block, /\b(?:eventId|sourceEventId|factId|threadId|activationId|actionId)\s*:\s*[^\r\n]*(?:Date\.now|Math\.random)/, `Canonical route ${route} must not derive canonical identifiers from wall-clock/random entropy.`);
  }
});

test('Phase 4 — canonical command events use deterministic identity and canonical time', () => {
  assert.doesNotMatch(canonicalEngine, /eventId:\s*\`evt_cmd_\$\{command\.storyId\}_\$\{command\.commandId\}/);
  assert.doesNotMatch(canonicalEngine, /committedAt:\s*new Date\(/);
  assert.match(canonicalEngine, /deterministicId\('evt_cmd'/);
  assert.match(canonicalEngine, /formatCanonicalTimestamp\(after\.worldClock\.timestamp\)/);
});

test('Phase 4 — Chronicle-producing routes are all behind canonical command resolution', () => {
  const routes = [
    '/action',
    '/inventory/craft',
    '/inventory/transfer',
    '/capabilities/adjudicate',
    '/capabilities/interpret',
    '/capabilities/synthesize',
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

test('Phase 4 — every game route that writes Historical Chronicle evidence is canonical-command bound', () => {
  const blocks: Array<{ route: string; block: string }> = [];
  const routePattern = /gameRouter\.post\('([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = routePattern.exec(gameRoutes)) !== null) {
    const start = match.index;
    const next = gameRoutes.indexOf('gameRouter.', start + 1);
    blocks.push({
      route: match[1],
      block: gameRoutes.slice(start, next >= 0 ? next : gameRoutes.length),
    });
  }

  for (const candidate of blocks.filter(({ block }) => block.includes('chronicle.recordEvidence('))) {
    assert.match(
      candidate.block,
      /canonicalCommandEngine\.execute/,
      `Chronicle-writing route ${candidate.route} bypasses canonical command authority.`
    );
  }
});
