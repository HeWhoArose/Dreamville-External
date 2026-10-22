import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';

import { gameRouter } from '../server/api/gameRoutes';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { worldRepository } from '../server/repositories/worldRepository';
import { storyActionAdvisor } from '../server/services/storyActionAdvisor';

const storyId = 'narration_retry_idempotency_http';
const commandId = 'cmd_narration_retry_idempotency_http';
let server: Server;
let baseUrl = '';
let orchestrator: any;
let originalGenerateNarrativeOnly: any;
let originalExecuteTaskGeneration: any;
let originalAdvise: any;
let originalGetTipsForAction: any;
let generationCalls = 0;

function narrativeResult(text: string) {
  return {
    success: true,
    text: JSON.stringify({
      narrative: [text],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    }),
    turnPackage: {
      narrative: [text],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    },
    source: 'AI_PRIMARY',
    providerId: 'test_narration_retry',
    modelId: 'narration-retry-fixture',
    attempts: 1,
    attemptsTrail: [],
    researchPacket: null,
    contextAudit: null,
  };
}

before(async () => {
  worldRepository.seedStory(storyId);
  serverMockAuthority.setActiveStoryId(storyId);

  // Isolate narration retries from provider availability, timeouts, and API keys.
  orchestrator = worldRepository.getAiOrchestrator();
  originalGenerateNarrativeOnly = orchestrator.generateNarrativeOnly;
  originalExecuteTaskGeneration = orchestrator.executeTaskGeneration;
  originalAdvise = storyActionAdvisor.advise;
  originalGetTipsForAction = storyActionAdvisor.getTipsForAction;
  generationCalls = 0;

  orchestrator.generateNarrativeOnly = async () => {
    generationCalls += 1;
    if (generationCalls === 1) {
      // Environment-only prose must be rejected by the normal live-turn quality gate.
      return narrativeResult('A faint hum lingers over the threshold. The afternoon air is still, and pale clouds hang above the distant skyline.');
    }
    return narrativeResult(
      'Aelion Vane breaks into a run across the broad stone threshold, scattering loose grit with each hurried step. The path offers no marked destination or visible beacon to follow, so the source remains unlocated. The distress signal remains a lead; its cause and who activated it are still unknown.',
    );
  };
  orchestrator.executeTaskGeneration = async () => ({
    success: false,
    text: '',
    source: 'DETERMINISTIC_FALLBACK',
    providerId: 'provider_deterministic_emergency',
    modelId: 'emergency-fallback-local',
    fallbackReason: 'Integration fixture intentionally disables the quality-rewrite model.',
    attemptsTrail: [],
  });
  (storyActionAdvisor as any).advise = async (_story: string, actionText: string) => ({
    mode: 'NORMAL_ACTION',
    actionText,
    tips: [],
    canExecuteNow: true,
  });
  (storyActionAdvisor as any).getTipsForAction = async () => [];

  const app = express();
  app.use(express.json());
  app.use('/api/game', gameRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') baseUrl = 'http://127.0.0.1:' + address.port;
      resolve();
    });
  });
});

after(async () => {
  if (orchestrator) {
    orchestrator.generateNarrativeOnly = originalGenerateNarrativeOnly;
    orchestrator.executeTaskGeneration = originalExecuteTaskGeneration;
  }
  if (originalAdvise) (storyActionAdvisor as any).advise = originalAdvise;
  if (originalGetTipsForAction) (storyActionAdvisor as any).getTipsForAction = originalGetTipsForAction;
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('retrying rejected narration changes presentation only and never commits the action twice', async () => {
  const before = serverMockAuthority.getSanitizedViewState(storyId);
  const beforeIds = (before.actionHistory || []).map((entry: any) => entry.id);
  const startRun = worldRepository.getStoryRun(storyId);
  const startEventCount = startRun?.canonicalEvents?.length || 0;

  const actionResponse = await fetch(baseUrl + '/api/game/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'CUSTOM_ACTION',
      actionText: 'I rush towards the signal',
      storyId,
      commandId,
    }),
  });
  assert.equal(actionResponse.status, 200, 'the gameplay action should commit even when narration is rejected');
  const actionResult: any = await actionResponse.json();
  assert.ok(actionResult.actionId, 'the committed action must have a stable action ID');

  const committedState = serverMockAuthority.getSanitizedViewState(storyId);
  const committedIds = (committedState.actionHistory || []).map((entry: any) => entry.id);
  assert.equal(committedIds.length, beforeIds.length + 1, 'the initial request should add exactly one action');
  assert.equal(committedIds.filter((id: string) => id === actionResult.actionId).length, 1);
  const committedAction = (committedState.actionHistory || []).find((entry: any) => entry.id === actionResult.actionId);
  assert.equal(committedAction?.narrativeError?.code, 'NARRATION_FINAL_REVIEW_REJECTED');

  const runAfterCommit = worldRepository.getStoryRun(storyId);
  const eventsAfterCommit = runAfterCommit?.canonicalEvents?.length || 0;
  const timeAfterCommit = worldRepository.getWorldClock(storyId).getTimestamp().totalElapsedSeconds;
  const locationAfterCommit = worldRepository.getPlayerLifecycle(storyId)?.locationId;
  const inventoryAfterCommit = JSON.stringify(worldRepository.getInventoryEngine(storyId).exportState());

  const retryResponse = await fetch(
    baseUrl + '/api/game/action/narrate/regenerate?storyId=' + encodeURIComponent(storyId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId, actionId: actionResult.actionId }),
    },
  );
  assert.equal(retryResponse.status, 200, 'retry should regenerate the narration for the existing action');
  const retryResult: any = await retryResponse.json();
  assert.equal(retryResult.actionId, actionResult.actionId);

  const afterRetry = serverMockAuthority.getSanitizedViewState(storyId);
  const afterIds = (afterRetry.actionHistory || []).map((entry: any) => entry.id);
  assert.deepEqual(afterIds, committedIds, 'narration retry must not append, replace, or reorder committed action history');
  assert.equal(afterIds.filter((id: string) => id === actionResult.actionId).length, 1);
  assert.ok(retryResult.narrativeResponse, 'the fixture narrator should provide replacement prose');
  assert.equal(
    (afterRetry.actionHistory || []).find((entry: any) => entry.id === actionResult.actionId)?.narrativeResponse,
    retryResult.narrativeResponse,
  );

  assert.equal(worldRepository.getStoryRun(storyId)?.canonicalEvents?.length || 0, eventsAfterCommit, 'retry must not append a canonical event');
  assert.equal(worldRepository.getWorldClock(storyId).getTimestamp().totalElapsedSeconds, timeAfterCommit, 'retry must not advance world time');
  assert.equal(worldRepository.getPlayerLifecycle(storyId)?.locationId, locationAfterCommit, 'retry must not change location');
  assert.equal(JSON.stringify(worldRepository.getInventoryEngine(storyId).exportState()), inventoryAfterCommit, 'retry must not mutate inventory');
  assert.equal(generationCalls, 2, 'one initial narration and one presentation-only retry are expected');
});
