import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { gameRouter } from '../server/api/gameRoutes';
import { worldRepository } from '../server/repositories/worldRepository';
import { worldSynthesisService } from '../server/services/worldSynthesisService';
import { emergentNarrativeEngine } from '../server/services/emergentNarrativeEngine';
import { abilityService } from '../server/services/abilityService';
import { storyDirectorService } from '../server/services/storyDirectorService';
import { dndSpellRulesEvaluator } from '../server/domain/dndSpellRulesModel';

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

test('CH16 End-to-End Behavioral Verification Suite', async () => {
  // 1. Premise-First World Creation & Structured Capabilities
  const premise = 'Only archmages can cast direct elemental spells, requiring a resonant focus crystal.';
  const world = await worldSynthesisService.synthesizeWorldFromPremise({
    naturalLanguagePremise: premise,
    genreTags: ['arcane', 'high-fantasy'],
  });

  assert.ok(world.worldId, 'World ID should be present');
  assert.ok(world.canonicalCapabilities.length > 0, 'Capabilities should be structured');
  assert.ok(world.capabilities.length > 0, 'Capabilities array should be present');
  assert.equal(world.capabilities[0].source, 'AI_PROPOSAL');

  const createdWorldId = world.worldId;
  worldRepository.saveWorldTemplate(world);

  // 2. World Run Initialization & Story Mode Selection
  const startRes = await fetch(`${baseUrl}/api/game/worlds/${createdWorldId}/start-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND',
      characterName: 'Archmage Vael',
    }),
  });

  assert.equal(startRes.status, 201);
  const run = await startRes.json();
  assert.ok(run.storyId);
  assert.equal(run.storyMode, 'PROTAGONIST');
  assert.equal(run.pinnedWorldVersion, 1);

  const activeStoryId = run.storyId;

  // 3. Real Gameplay Event Production & Emergent Narrative Threading
  const actionRes = await fetch(`${baseUrl}/api/game/worlds/runs/${activeStoryId}/actions/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actionType: 'INVESTIGATE_AREA',
      locationId: 'loc_whispering_orrery',
    }),
  });

  assert.equal(actionRes.status, 200);
  const actionBody = await actionRes.json();
  assert.ok(actionBody.gameplayEvent);
  assert.equal(actionBody.gameplayEvent.eventType, 'INVESTIGATE_AREA');
  assert.ok(actionBody.storyThreads.length > 0, 'Emergent narrative thread should be generated');

  // 4. State-Dependent Story Director & Trigger Evaluation
  const directorResult = storyDirectorService.stepDirector(activeStoryId);
  assert.equal(typeof directorResult.eventGenerated, 'boolean');

  const choiceRes = await fetch(`${baseUrl}/api/game/worlds/runs/${activeStoryId}/story-director/choice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      beatId: 'beat_orrery_investigation',
      optionId: 'opt_investigate_subterranean',
    }),
  });

  assert.equal(choiceRes.status, 200);
  const choiceBody = await choiceRes.json();
  assert.ok(choiceBody.success);
  assert.equal(choiceBody.recordedChoice.optionId, 'opt_investigate_subterranean');

  // 5. Protagonist Refusal Consequences
  const refusalRes = await fetch(`${baseUrl}/api/game/worlds/runs/${activeStoryId}/story-director/choice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      beatId: 'beat_call_to_adventure',
      optionId: 'refuse_quest',
    }),
  });

  assert.equal(refusalRes.status, 200);
  const refusalBody = await refusalRes.json();
  assert.ok(refusalBody.success);
  assert.ok(refusalBody.consequences.length > 0);

  // 6. Side Character Offscreen Simulation
  const offscreenRes = await fetch(`${baseUrl}/api/game/worlds/runs/${activeStoryId}/story-director/offscreen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(offscreenRes.status, 200);
  const offscreenBody = await offscreenRes.json();
  assert.ok(offscreenBody.success);
  assert.ok(offscreenBody.actionTaken);

  // 7. Authoritative Combat Integration & Dice Clash
  const clashRes = await fetch(`${baseUrl}/api/game/worlds/runs/${activeStoryId}/dice-clash/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerPool: { dice: [18, 14, 12] },
      enemyPool: { dice: [10, 15, 8] },
      attackerStats: { atk: 14 },
      defenderStats: { def: 8 },
    }),
  });

  assert.equal(clashRes.status, 200);
  const clashBody = await clashRes.json();
  assert.ok(clashBody.success);
  assert.equal(clashBody.beatResults.length, 3);

  // 8. Forged Ability Rejection & Ability Authorization
  const forgedRes = await fetch(`${baseUrl}/api/game/worlds/runs/${activeStoryId}/actions/apply-ability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      abilityId: 'ability_forged_godmode',
      targetId: 'char_maren',
    }),
  });

  assert.equal(forgedRes.status, 403);

  // Unlock valid ability on run
  const activeRun = worldRepository.getStoryRun(activeStoryId);
  activeRun.unlockedAbilities = ['ability_elemental_blast'];
  worldRepository.saveStoryRun(activeRun);

  const validRes = await fetch(`${baseUrl}/api/game/worlds/runs/${activeStoryId}/actions/apply-ability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      abilityId: 'ability_elemental_blast',
      targetId: 'char_maren',
    }),
  });

  assert.equal(validRes.status, 200);

  // 9. Active Effect Lifecycle & Damage Reflection
  worldRepository.saveActiveEffect({
    effectId: 'eff_fire_mantle',
    storyId: activeStoryId,
    name: 'Fire Mantle',
    damageReflection: 5,
    charges: 2,
  });

  const reflectionClashRes = await fetch(`${baseUrl}/api/game/worlds/runs/${activeStoryId}/dice-clash/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerPool: { dice: [5] },
      enemyPool: { dice: [15] },
      attackerStats: { atk: 10 },
      defenderStats: { def: 5 },
    }),
  });

  assert.equal(reflectionClashRes.status, 200);
  const reflectionBody = await reflectionClashRes.json();
  assert.equal(reflectionBody.activeEffectTriggered, true);

  // 10. D&D Mode Rule Evaluation
  const spellEvalRes = await fetch(`${baseUrl}/api/game/worlds/runs/${activeStoryId}/spells/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spellProposal: {
        spellName: 'Fireball',
        spellLevel: 3,
        casterLevel: 3,
      },
    }),
  });

  assert.equal(spellEvalRes.status, 200);
  const evalBody = await spellEvalRes.json();
  assert.equal(evalBody.approved, false);
  assert.equal(evalBody.maxAvailableLevel, 2);
  assert.ok(evalBody.downgradeRequirement);

  // 11. World Versioning & Behavioral Isolation
  const v1World = worldRepository.getWorldTemplate(createdWorldId);
  assert.ok(v1World);
  v1World.worldManifestVersion = 1;

  const v2World = {
    ...v1World,
    worldId: `${createdWorldId}_v2`,
    worldManifestVersion: 2,
    canonicalCapabilities: [...v1World.canonicalCapabilities, { capabilityId: 'cap_v2_exclusive' }],
  };
  worldRepository.saveWorldTemplate(v2World);

  const pinnedRun = worldRepository.getStoryRun(activeStoryId);
  assert.equal(pinnedRun.pinnedWorldVersion, 1);

  // 12. Archive Integration & Restoration Executability
  const archive = worldRepository.exportCampaignArchive(activeStoryId, 'CH16 Test Campaign');
  assert.ok(archive);

  const restoreResult = worldRepository.restoreCampaignArchive(archive, 'restored_ch16_story');
  assert.equal(restoreResult.success, true);

  const restoredRun = worldRepository.getStoryRun('restored_ch16_story');
  assert.ok(restoredRun);
});
