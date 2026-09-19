import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { gameRouter } from '../server/api/gameRoutes';
import { worldRepository } from '../server/repositories/worldRepository';
import { WorldSynthesisInput } from '../src/types';

const app = express();
app.use(express.json());
app.use('/api/game', gameRouter);

let server: http.Server;
let baseUrl: string;

test.before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('CH16 20-Step Live World/Run UI Workflow & Isolation Sequence', async () => {
  // Step 1: Open World Library
  const res1 = await fetch(`${baseUrl}/api/game/worlds`);
  assert.equal(res1.status, 200);
  const worlds1 = await res1.json();
  assert.ok(Array.isArray(worlds1));

  // Step 2: Confirm world cards are rendered
  assert.ok(worlds1.length > 0, 'World cards must exist in library');
  const sampleWorld = worlds1[0];
  assert.ok(sampleWorld.title);
  assert.ok(sampleWorld.worldManifestVersion);

  // Step 3: Search/filter using newly supported discovery dimensions (setting, source, playstyle)
  const res3Setting = await fetch(`${baseUrl}/api/game/worlds?setting=Citadel`);
  assert.equal(res3Setting.status, 200);
  const worldsBySetting = await res3Setting.json();
  assert.ok(Array.isArray(worldsBySetting));

  const res3Source = await fetch(`${baseUrl}/api/game/worlds?source=ORIGINAL_CANON`);
  assert.equal(res3Source.status, 200);

  const res3Playstyle = await fetch(`${baseUrl}/api/game/worlds?playstyle=Tactical`);
  assert.equal(res3Playstyle.status, 200);

  // Step 4: Open a World Preview
  const previewTargetId = sampleWorld.worldId;
  const res4 = await fetch(`${baseUrl}/api/game/worlds/${previewTargetId}`);
  assert.equal(res4.status, 200);
  const previewWorld = await res4.json();

  // Step 5: Confirm preview metadata is rendered
  assert.equal(previewWorld.worldId, previewTargetId);
  assert.ok(previewWorld.title);
  assert.ok(Array.isArray(previewWorld.capabilities) || Array.isArray(previewWorld.canonicalCapabilities));

  // Step 6: Create a World from premise
  const synthesisInput: WorldSynthesisInput = {
    naturalLanguagePremise: 'Floating celestial spires linked by arcane magnetic bridges, shrouded in perpetual dawn.',
    title: 'Aethelgard Dawn Spires',
    genreTags: ['High Fantasy', 'Solarpunk'],
    toneTags: ['Heroic'],
    defaultEra: 'Era of Ascension',
    setting: 'Floating Dawn Citadel',
    sourcePolicy: 'ORIGINAL_CANON',
    dndRulesMode: 'FULL_DND',
  };

  const res6 = await fetch(`${baseUrl}/api/game/worlds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(synthesisInput),
  });
  assert.equal(res6.status, 201);
  const createdWorld = await res6.json();
  assert.ok(createdWorld.worldId);
  assert.equal(createdWorld.title, 'Aethelgard Dawn Spires');
  const worldId = createdWorld.worldId;

  // Step 7: Open/create a Story Run from that World
  // Step 8: Select PROTAGONIST
  const res8 = await fetch(`${baseUrl}/api/game/worlds/${worldId}/start-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND',
      characterName: 'Archon Vael',
    }),
  });
  assert.equal(res8.status, 201);
  const runProtagonist = await res8.json();
  assert.equal(runProtagonist.storyMode, 'PROTAGONIST');

  // Step 9: Select SIDE_CHARACTER
  const res9 = await fetch(`${baseUrl}/api/game/worlds/${worldId}/start-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyMode: 'SIDE_CHARACTER',
      dndRulesMode: 'FULL_DND',
      characterName: 'Companion Maren',
    }),
  });
  assert.equal(res9.status, 201);
  const runSide = await res9.json();
  assert.equal(runSide.storyMode, 'SIDE_CHARACTER');

  // Step 10: Select FREE_ROAM
  const res10 = await fetch(`${baseUrl}/api/game/worlds/${worldId}/start-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyMode: 'FREE_ROAM',
      dndRulesMode: 'HYBRID_DND',
      characterName: 'Nomad Kael',
    }),
  });
  assert.equal(res10.status, 201);
  const runFree = await res10.json();
  assert.equal(runFree.storyMode, 'FREE_ROAM');

  // Step 11: Select available combat/rules mode(s) (HYBRID_DND, FULL_DND)
  assert.equal(runFree.dndRulesMode, 'HYBRID_DND');

  // Step 12: Start Run A
  const res12 = await fetch(`${baseUrl}/api/game/worlds/${worldId}/start-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND',
      characterName: 'Hero Alpha',
    }),
  });
  assert.equal(res12.status, 201);
  const runA = await res12.json();

  // Step 13: Confirm Run A becomes active
  assert.ok(runA.storyId);
  const storyIdA = runA.storyId;

  // Step 14: Resume Run A
  const res14 = await fetch(`${baseUrl}/api/game/worlds/runs/${storyIdA}`);
  assert.equal(res14.status, 200);
  const resumedRunA = await res14.json();
  assert.equal(resumedRunA.storyId, storyIdA);
  assert.equal(resumedRunA.characterName, 'Hero Alpha');

  // Step 15: Create Run B from the same World
  const res15 = await fetch(`${baseUrl}/api/game/worlds/${worldId}/start-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND',
      characterName: 'Hero Beta',
    }),
  });
  assert.equal(res15.status, 201);
  const runB = await res15.json();
  const storyIdB = runB.storyId;
  assert.notEqual(storyIdA, storyIdB);

  // Step 16: Mutate Run A through an actual gameplay action
  const res16 = await fetch(`${baseUrl}/api/game/worlds/runs/${storyIdA}/actions/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actionType: 'REST_AND_RECOVER',
      locationId: 'loc_dawn_spire',
    }),
  });
  assert.equal(res16.status, 200);
  const actionA = await res16.json();
  assert.ok(actionA.gameplayEvent);

  // Also apply direct state change on Run A player
  const playerA = worldRepository.getPlayerLifecycle(storyIdA)!;
  const mutatedPlayerA = playerA.copyWith({
    name: 'Hero Alpha the Conquered',
    currentActivity: 'Recovering from deep wounds',
  });
  worldRepository.updatePlayerLifecycle(storyIdA, mutatedPlayerA);

  // Step 17: Inspect Run B
  const res17 = await fetch(`${baseUrl}/api/game/worlds/runs/${storyIdB}`);
  assert.equal(res17.status, 200);
  const inspectedRunB = await res17.json();

  // Step 18: Confirm Run B remains unchanged
  assert.equal(inspectedRunB.storyId, storyIdB);
  assert.equal(inspectedRunB.characterName, 'Hero Beta');
  const playerB = worldRepository.getPlayerLifecycle(storyIdB);
  assert.equal(playerB?.name, 'Hero Beta');
  assert.notEqual(playerB?.name, 'Hero Alpha the Conquered');

  // Step 19: Inspect the base World
  const res19 = await fetch(`${baseUrl}/api/game/worlds/${worldId}`);
  assert.equal(res19.status, 200);
  const inspectedBaseWorld = await res19.json();

  // Step 20: Confirm the base World remains unchanged
  assert.equal(inspectedBaseWorld.worldId, worldId);
  assert.equal(inspectedBaseWorld.title, 'Aethelgard Dawn Spires');
  assert.equal(inspectedBaseWorld.worldManifestVersion, 1);
});
