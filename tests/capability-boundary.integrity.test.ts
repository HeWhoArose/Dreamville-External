import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('player skill boundary never projects the global capability registry as learned skills', () => {
  const routes = read('server/api/gameRoutes.ts');
  const surface = read('src/components/CharacterSurface.tsx');
  const authority = read('server/mockEngine/serverMockAuthority.ts');

  const canonicalIndex = routes.indexOf("gameRouter.get('/run-canonical-state'");
  assert.ok(canonicalIndex >= 0);

  const canonicalSection = routes.slice(canonicalIndex);
  assert.equal(canonicalSection.includes('coreCapabilities: actorCaps'), true);
  assert.equal(canonicalSection.includes('coreCapabilities: coreCaps'), false);

  assert.match(surface, /capabilities.filter/);
  assert.match(surface, /skillInstances.some/);
  assert.doesNotMatch(surface, /Capability DAG & Derived Skills|Adjudication Outcome/);

  assert.doesNotMatch(authority, /AUTO_LEARN_AND_EXECUTE.*acquireSkill/s);
});

test('capability engine defaults to zero implicit starter skills', () => {
  const engine = read('server/domain/capabilityEngine.ts');
  assert.match(engine, /starterCapabilities) ?? []/);
  assert.doesNotMatch(engine, /starterCaps = options?\.starterCapabilities \|\| \[/);
  assert.match(engine, /World capability definitions are never implicitly learned/);
});

test('simulation results remain internal metadata rather than DAG/adjudication player UI', () => {
  const simulation = read('server/domain/capabilitySimulationEngine.ts');
  const story = read('src/components/StoryView.tsx');
  assert.match(simulation, /internalOnly: true/);
  assert.match(story, /pendingActionAdvice?.simulation/);
  assert.doesNotMatch(story, /Capability DAG & Derived Skills/);
  assert.doesNotMatch(story, /Adjudication Outcome/);
});


test('freeform player actions remain the only content in Recent Actions history', () => {
  const authority = read('server/mockEngine/serverMockAuthority.ts');
  const recent = read('src/components/RecentActionsView.tsx');
  assert.match(authority, /actionType: 'CUSTOM_ACTION'/);
  assert.match(recent, /action\.actionType !== 'NOTE_RECORD'/);
  assert.match(recent, /action\.description/);
  assert.doesNotMatch(recent, /action\.narrativeResponse|action\.checkResult|action\.authoritativeFeedback/);
});

test('capability advisor bypass is server-internal only', () => {
  const routes = read('server/api/gameRoutes.ts');
  const authority = read('server/mockEngine/serverMockAuthority.ts');
  assert.match(authority, /options\?: \{ bypassCapabilityAdvisor\?: boolean \}/);
  assert.match(authority, /options\?\.bypassCapabilityAdvisor/);
  assert.doesNotMatch(authority, /Boolean\(\(request as any\)\.bypassCapabilityAdvisor\)/);
  assert.match(routes, /delete \(actionRequest as any\)\.bypassCapabilityAdvisor/);
  assert.match(routes, /bypassCapabilityAdvisor: true/);
});
