import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';

import { worldRepository } from '../server/repositories/worldRepository';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { gameRouter } from '../server/api/gameRoutes';

test('F08: /api/game/action/narrate/regenerate maintains exact mechanical parity and durably persists narration', async () => {
  const storyId = 'regeneration_parity_' + Date.now();
  worldRepository.seedStory(storyId);

  const orchestrator = worldRepository.getAiOrchestrator();
  const originalGenerate = orchestrator.generateNarrativeOnly;

  let narrationCounter = 0;
  (orchestrator as any).generateNarrativeOnly = async (params: any) => {
    narrationCounter++;
    const isRegen = narrationCounter > 1;
    return {
      success: true,
      turnPackage: {
        narrative: [
          isRegen
            ? 'Regenerated narration: The smell of cold ash fills the room as you search the desk with sharp precision.'
            : 'Initial narration: You search the wooden desk, running your fingers along the carved drawers.',
        ],
        dialogue: [],
        events: ['DESK_SEARCHED'],
        stateChanges: [],
        memoryCandidates: ['A desk was examined in the room.'],
        audioCues: [],
        visualCues: [],
      },
      providerId: 'fixture-provider',
      modelId: isRegen ? 'fixture-regen-model' : 'fixture-primary',
      source: 'AI_PRIMARY',
      narrativePlan: {
        turnId: 'turn_regen_fixture',
        objective: 'Resolve desk search.',
        immediateSteps: ['Search desk.'],
        informationToReveal: [],
        entitiesToReact: [],
        continuityRequirements: [],
        forbiddenAssumptions: [],
        stateEffectsExpected: [],
        createdAt: 'Day 1 • Afternoon',
        expiresAfterNarration: true,
      },
    };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/game', gameRouter);

  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Initial Action
    const actionRes = await fetch(`${baseUrl}/api/game/action`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-story-id': storyId,
      },
      body: JSON.stringify({
        type: 'CUSTOM_ACTION',
        storyId,
        actionText: 'I examine the drawers of the desk carefully.',
      }),
    });

    assert.equal(actionRes.status, 200);
    const actionBody = await actionRes.json();
    assert.equal(actionBody.success, true);
    const actionId = actionBody.actionId;
    assert.ok(actionId);

    // 2. Snapshot state before regeneration
    const clockBefore = worldRepository.getWorldClock(storyId).getTimestamp();
    const playerLifecycleBefore = worldRepository.getPlayerLifecycle(storyId);
    const conditionStateBefore = worldRepository.getConditionEngine(storyId).getActorState(actionBody.viewState.protagonist?.actorId || playerLifecycleBefore?.actorId || 'player');
    const savedRunBefore = worldRepository.getStoryRun(storyId);
    const plotBeatsBefore = JSON.stringify(savedRunBefore?.runtimeState?.plot?.beats || []);
    const actionInHistoryBefore = actionBody.viewState.actionHistory.find((a: any) => a.id === actionId);

    assert.ok(actionInHistoryBefore);
    assert.ok(actionInHistoryBefore.actionResolution, 'actionResolution must be stored in history');
    assert.ok(actionInHistoryBefore.stateAdjudication, 'stateAdjudication must be stored in history');

    // 3. Request Narration Regeneration
    const regenRes = await fetch(`${baseUrl}/api/game/action/narrate/regenerate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-story-id': storyId,
      },
      body: JSON.stringify({
        storyId,
        actionId,
        editInstruction: 'Focus on the smell of cold ash and precision.',
      }),
    });

    assert.equal(regenRes.status, 200);
    const regenBody = await regenRes.json();
    assert.equal(regenBody.success, true);
    assert.match(regenBody.narrativeResponse, /smell of cold ash/i);
    assert.equal(regenBody.narrativeGeneration?.regenerated, true);

    // 4. Assert mechanical state parity
    const clockAfter = worldRepository.getWorldClock(storyId).getTimestamp();
    assert.deepEqual(clockAfter, clockBefore, 'world clock must not advance during presentation regeneration');

    const conditionStateAfter = worldRepository.getConditionEngine(storyId).getActorState(actionBody.viewState.protagonist?.actorId || playerLifecycleBefore?.actorId || 'player');
    assert.equal(conditionStateAfter?.healthCurrent, conditionStateBefore?.healthCurrent, 'HP must remain identical');

    const playerLifecycleAfter = worldRepository.getPlayerLifecycle(storyId);
    assert.equal(playerLifecycleAfter?.locationId, playerLifecycleBefore?.locationId, 'location must remain identical');

    // 5. Assert plot beats and canonical adjudication parity
    const savedRunAfter = worldRepository.getStoryRun(storyId);
    const plotBeatsAfter = JSON.stringify(savedRunAfter?.runtimeState?.plot?.beats || []);
    assert.equal(plotBeatsAfter, plotBeatsBefore, 'plot beats must not be duplicated or altered during regeneration');

    const dynamicState = serverMockAuthority.getDynamicStoryState(storyId);
    const actionInHistoryAfter = dynamicState.actionHistory.find((a: any) => a.id === actionId);
    assert.ok(actionInHistoryAfter);
    assert.equal(actionInHistoryAfter.narrativeGeneration?.regenerated, true);
    assert.deepEqual(JSON.parse(JSON.stringify(actionInHistoryAfter.actionResolution)), JSON.parse(JSON.stringify(actionInHistoryBefore.actionResolution)), 'actionResolution must remain identical');
    assert.deepEqual(JSON.parse(JSON.stringify(actionInHistoryAfter.stateAdjudication)), JSON.parse(JSON.stringify(actionInHistoryBefore.stateAdjudication)), 'stateAdjudication must remain identical');

    // 6. Assert durable actionHistory persistence in StoryRun
    const durableHistory = savedRunAfter?.runtimeState?.actionHistory || [];
    const durableAction = durableHistory.find((a: any) => a.id === actionId);
    assert.ok(durableAction, 'action must be persisted in savedRun.runtimeState.actionHistory');
    assert.match(durableAction.narrativeResponse, /cold ash/i);

    // 7. Error case: when provider fails during regeneration, returns 503 with actionCommitted: true
    (orchestrator as any).generateNarrativeOnly = async () => {
      return {
        success: false,
        error: 'Simulated upstream model timeout',
        fallbackReason: 'Simulated provider error',
        attemptsTrail: [],
      };
    };

    const failRes = await fetch(`${baseUrl}/api/game/action/narrate/regenerate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-story-id': storyId,
      },
      body: JSON.stringify({
        storyId,
        actionId,
      }),
    });

    assert.equal(failRes.status, 503);
    const failBody = await failRes.json();
    assert.equal(failBody.success, false);
    assert.equal(failBody.actionCommitted, true, 'actionCommitted must remain true even on failure');
  } finally {
    (orchestrator as any).generateNarrativeOnly = originalGenerate;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    worldRepository.deleteStoryRun(storyId);
  }
});
