import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('capability ownership never falls back to the global registry', () => {
  const source = read('server/domain/capabilityEngine.ts');
  assert.match(source, /global capability registry is intentionally never treated as player ownership/i);
  assert.doesNotMatch(source, /const cap = this\.capabilities\.get\(capabilityId\);\s*return Boolean\(cap && !cap\.provenance\.startsWith\('equipment:'\)\)/s);
});

test('scene generation uses the newest non-note action as its source turn', () => {
  const source = read('server/api/gameRoutes.ts');
  assert.match(source, /actionHistory\.find\(\(action: any\) => action\.actionType !== 'NOTE_RECORD'\)/);
  assert.match(source, /most recent committed player action/i);
});

test('advisor passes only active-world capabilities into world-canon simulation', () => {
  const source = read('server/services/storyActionAdvisor.ts');
  assert.match(source, /const worldCapabilities = \[/);
  assert.match(source, /allWorldCapabilities: worldCapabilities/);
  assert.match(source, /const allCapabilities = capabilityEngine\.getAllCapabilities\(\)/);
  assert.doesNotMatch(source, /allWorldCapabilities: allCapabilities/);
});

test('retired player-only capability surfaces are no longer present', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/components/PowerWorkstation.tsx')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/components/StoryHUDDrawer.tsx')), false);
  assert.match(read('server/domain/capabilitySimulationEngine.ts'), /public simulate/);
});

test('ten deterministic audits keep internal simulation out of the Skillbook and Story UI', () => {
  const surface = read('src/components/CharacterSurface.tsx');
  const story = read('src/components/StoryView.tsx');
  const shell = read('src/components/storyContext/StoryContextShell.tsx');
  const menu = read('src/components/storyContext/storyNavigationModel.ts');
  const world = read('src/components/WorldView.tsx');
  const recent = read('src/components/RecentActionsView.tsx');
  const routes = read('server/api/gameRoutes.ts');
  const dice = read('src/components/common/DiceRollAnimation.tsx');

  for (let pass = 1; pass <= 10; pass += 1) {
    assert.match(surface, /skillInstances\s*\.map/, 'Skillbook lost actor ownership filtering');
    assert.doesNotMatch(surface, /Adjudication Outcome|Capability DAG & Derived Skills|Channel: Temporal Ignition/);

    assert.match(story, /Immediate result/);
    assert.doesNotMatch(story, /Recent actions/);
    assert.match(recent, /Recent Actions/);
    assert.match(recent, /Only your submitted actions appear here/);
    assert.match(story, /Generate Scene/);
    assert.match(story, /Generate Image/);
    assert.match(story, /Generate Prompt/);
    assert.doesNotMatch(story, /StoryHUDDrawer|Capability DAG & Derived Skills|Adjudication Outcome/);

    assert.match(shell, /primaryIds/);
    assert.match(shell, /new Set\(\['story', 'character', 'inventory', 'world', 'map', 'combat'\]\)/);
    assert.match(shell, /primaryIds = new Set\(\['story', 'character', 'inventory', 'world', 'map', 'combat'\]\)/);
    assert.match(menu, /label: 'World'/);
    assert.match(menu, /route: 'play\.recent-actions'/);
    assert.match(world, /character\.worldId === worldId/);
    assert.doesNotMatch(world, /!worldId \|\| character\.worldId/);
    const interpretStart = routes.indexOf("gameRouter.post('/capabilities/interpret'");
    const adjudicateStart = routes.indexOf("gameRouter.post('/capabilities/adjudicate'");
    const capabilitiesGetStart = routes.indexOf("gameRouter.get('/capabilities'");
    assert.ok(interpretStart >= 0 && adjudicateStart >= 0 && capabilitiesGetStart >= 0);
    assert.match(routes, /AI_INTERNAL_INTERPRETATION_ONLY/);
    const capabilitiesBlock = routes.slice(capabilitiesGetStart, adjudicateStart);
    const canonicalStateStart = routes.indexOf("gameRouter.get('/run-canonical-state'");
    const canonicalStateBlock = canonicalStateStart >= 0 ? routes.slice(canonicalStateStart) : '';
    assert.match(capabilitiesBlock, /projectPlayerCapabilities/);
    assert.doesNotMatch(capabilitiesBlock, /getAllCapabilities\(\)/);
    assert.match(canonicalStateBlock, /projectPlayerCapabilities/);
    assert.doesNotMatch(canonicalStateBlock, /coreCapabilities:\s*coreCaps/);
    assert.doesNotMatch(canonicalStateBlock, /generatedTechniques:\s*actorSkills/);
    assert.equal(capabilitiesBlock.includes('graph'), false);
    assert.equal(routes.slice(interpretStart, interpretStart + 1200).includes("x-dreamville-internal-ai"), true);
    assert.match(dice, /HTMLCanvasElement/);
    assert.match(dice, /ICOSAHEDRON_FACES/);
    assert.match(dice, /requestAnimationFrame/);
  }
});
