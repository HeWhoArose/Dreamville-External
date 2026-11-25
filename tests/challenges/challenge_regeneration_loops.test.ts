import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';

import { worldRepository } from '../../server/repositories/worldRepository';
import { serverMockAuthority } from '../../server/mockEngine/serverMockAuthority';
import { gameRouter } from '../../server/api/gameRoutes';

test('CHALLENGE: F08 regeneration loops verify zero state drift, monotonic timestamp/run integrity, and identical stateAdjudication', async () => {
  const storyId = 'challenge_regen_loop_' + Date.now();
  worldRepository.seedStory(storyId);

  const orchestrator = worldRepository.getAiOrchestrator();
  const originalGenerate = orchestrator.generateNarrativeOnly;

  let regenCounter = 0;
  const regenTexts = [
    'Initial presentation: You carefully inspect the ancient mechanism on the wall of the Whispering Orrery.',
    'Regen 1: The sharp smell of rusted copper and age fills your lungs as you inspect the wall mechanism in the Whispering Orrery.',
    'Regen 2: A faint, rhythmic clicking of inner gears resonates through the wall mechanism in the Whispering Orrery.',
    'Regen 3: Your fingertips trace cold brass plates and grooved cogs on the mechanism within the Whispering Orrery.',
    'Regen 4: Flickering light dances across the tarnished gears of the ancient mechanism in the Whispering Orrery.',
    'Regen 5: Intricate astronomical engravings reveal themselves across the mechanism housing in the Whispering Orrery.',
  ];

  (orchestrator as any).generateNarrativeOnly = async (params: any) => {
    const text = regenTexts[regenCounter] || `Regen ${regenCounter}: The mechanism stands quietly in the Whispering Orrery.`;
    regenCounter++;
    return {
      success: true,
      turnPackage: {
        narrative: [text],
        dialogue: [],
        events: ['MECHANISM_INSPECTED'],
        stateChanges: [],
        memoryCandidates: ['The wall mechanism was inspected.'],
        audioCues: [],
        visualCues: [],
      },
      providerId: 'fixture-provider',
      modelId: regenCounter > 1 ? `fixture-regen-model-${regenCounter}` : 'fixture-primary',
      source: 'AI_PRIMARY',
      narrativePlan: {
        turnId: 'turn_regen_fixture',
        objective: 'Resolve mechanism inspection.',
        immediateSteps: ['Inspect mechanism.'],
        informationToReveal: [],
        entitiesToReact: [],
        continuityRequirements: [],
        forbiddenAssumptions: [],
        stateEffectsExpected: [],
        createdAt: 'Cycle 1 • Month 1 • Day 1 • 12:00',
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
    // -------------------------------------------------------------------------
    // 1. Initial Action via POST /api/game/action
    // -------------------------------------------------------------------------
    const actionRes = await fetch(`${baseUrl}/api/game/action`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-story-id': storyId,
      },
      body: JSON.stringify({
        type: 'CUSTOM_ACTION',
        storyId,
        actionText: 'I carefully inspect the ancient mechanism on the wall.',
      }),
    });

    assert.equal(actionRes.status, 200);
    const actionBody = await actionRes.json();
    assert.equal(actionBody.success, true);
    const actionId = actionBody.actionId;
    assert.ok(actionId, 'Initial action must return actionId');

    // -------------------------------------------------------------------------
    // 2. Capture baseline snapshots before loop
    // -------------------------------------------------------------------------
    const clock = worldRepository.getWorldClock(storyId);
    const baselineClock = JSON.parse(JSON.stringify(clock.getTimestamp()));
    const baselineAbsolute = clock.getAbsoluteTime();

    const baselinePlayer = JSON.parse(JSON.stringify(worldRepository.getPlayerLifecycle(storyId)));
    const actorId = baselinePlayer?.actorId || 'player';
    const baselineCondition = JSON.parse(JSON.stringify(worldRepository.getConditionEngine(storyId).getActorState(actorId)));

    const baselineSavedRun = worldRepository.getStoryRun(storyId);
    const baselinePlotBeatsJson = JSON.stringify(baselineSavedRun?.runtimeState?.plot?.beats || []);
    assert.ok(
      (baselineSavedRun?.runtimeState?.plot?.beats || []).length > 0,
      'Initial turn must establish plot beat'
    );

    const baselineDynamicState = serverMockAuthority.getDynamicStoryState(storyId);
    const baselineHistoryLength = baselineDynamicState.actionHistory.length;
    const baselineAction = baselineDynamicState.actionHistory.find((a: any) => a.id === actionId);
    assert.ok(baselineAction);
    const baselineResolutionJson = JSON.stringify(baselineAction.actionResolution);
    const baselineAdjudicationJson = JSON.stringify(baselineAction.stateAdjudication);
    assert.ok(baselineAction.stateAdjudication, 'Initial action must have certified stateAdjudication');

    // -------------------------------------------------------------------------
    // 3. Consecutive Regeneration Loop (5 consecutive regenerations)
    // -------------------------------------------------------------------------
    const editInstructions = [
      'Focus on the smell of rusted copper and dust.',
      'Emphasize the clicking of inner gears.',
      'Describe the cold metal beneath the fingers.',
      'Highlight the flickering torchlight reflections.',
      'Bring out the intricate engravings on the casing.',
    ];

    for (let i = 0; i < editInstructions.length; i++) {
      const editInstruction = editInstructions[i];
      const regenRes = await fetch(`${baseUrl}/api/game/action/narrate/regenerate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-story-id': storyId,
        },
        body: JSON.stringify({
          storyId,
          actionId,
          editInstruction,
        }),
      });

      assert.equal(regenRes.status, 200, `Regeneration loop iteration ${i + 1} must return HTTP 200`);
      const regenBody = await regenRes.json();
      assert.equal(regenBody.success, true);
      assert.equal(regenBody.narrativeGeneration?.regenerated, true);
      assert.equal(regenBody.narrativeResponse, regenTexts[i + 1]);

      // INVARIANT A: Zero Mechanical State Drift
      const currentClock = clock.getTimestamp();
      assert.deepEqual(currentClock, baselineClock, `World clock must not drift on iteration ${i + 1}`);
      assert.equal(clock.getAbsoluteTime(), baselineAbsolute);

      const currentPlayer = worldRepository.getPlayerLifecycle(storyId);
      assert.equal(currentPlayer?.locationId, baselinePlayer.locationId);
      assert.deepEqual(JSON.parse(JSON.stringify(currentPlayer?.localSpatialState || {})), baselinePlayer.localSpatialState);

      const currentCondition = worldRepository.getConditionEngine(storyId).getActorState(actorId);
      assert.equal(currentCondition?.healthCurrent, baselineCondition.healthCurrent);
      assert.deepEqual(currentCondition?.activeConditions, baselineCondition.activeConditions);

      // INVARIANT B: Action History & Parity
      const currentDynamic = serverMockAuthority.getDynamicStoryState(storyId);
      assert.equal(currentDynamic.actionHistory.length, baselineHistoryLength, 'Action history length must remain constant');
      const currentAction = currentDynamic.actionHistory.find((a: any) => a.id === actionId);
      assert.ok(currentAction);
      assert.equal(currentAction.narrativeResponse, regenTexts[i + 1]);
      assert.equal(JSON.stringify(currentAction.actionResolution), baselineResolutionJson, 'actionResolution must remain identical');
      assert.equal(JSON.stringify(currentAction.stateAdjudication), baselineAdjudicationJson, 'stateAdjudication must remain identical');

      // INVARIANT C: Durable Persistence in StoryRun
      const currentSavedRun = worldRepository.getStoryRun(storyId);
      const durableHistory = currentSavedRun?.runtimeState?.actionHistory || [];
      assert.equal(durableHistory.length, baselineHistoryLength);
      const durableAction = durableHistory.find((a: any) => a.id === actionId);
      assert.ok(durableAction);
      assert.equal(durableAction.narrativeResponse, regenTexts[i + 1]);
      assert.equal(JSON.stringify(durableAction.stateAdjudication), baselineAdjudicationJson);

      // INVARIANT D: Zero Plot Drift
      const currentPlotBeatsJson = JSON.stringify(currentSavedRun?.runtimeState?.plot?.beats || []);
      assert.equal(currentPlotBeatsJson, baselinePlotBeatsJson, 'Plot beats must remain strictly unmodified');
    }

    // -------------------------------------------------------------------------
    // 4. Verify Monotonic Run & Session Recorder Integrity
    // -------------------------------------------------------------------------
    const session = worldRepository.getStorySessionRecording(storyId);
    const runInteractions = session?.interactions || [];
    const regenInteractions = runInteractions.filter((int: any) => int.source === 'NARRATION_REGENERATION');
    assert.equal(regenInteractions.length, 5, 'Exactly 5 regeneration interactions must be captured');

    let previousCompletedAt = 0;
    for (let i = 0; i < regenInteractions.length; i++) {
      const int = regenInteractions[i];
      assert.equal(int.success, true);
      assert.equal(int.kind, 'AUXILIARY');
      assert.equal(int.request?.actionId, actionId);
      const started = new Date(int.startedAt).getTime();
      const completed = new Date(int.completedAt).getTime();
      assert.ok(started > 0 && completed >= started, `Interaction ${i} timestamps must be valid and non-regressing`);
      assert.ok(started >= previousCompletedAt, `Interaction ${i} startedAt (${started}) must be >= previous completedAt (${previousCompletedAt})`);
      previousCompletedAt = completed;
    }

    // -------------------------------------------------------------------------
    // 5. Adversarial Edge Cases: Not Found, Invalid Inputs, Provider Failure
    // -------------------------------------------------------------------------
    // 5a. Action not found
    const notFoundRes = await fetch(`${baseUrl}/api/game/action/narrate/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-story-id': storyId },
      body: JSON.stringify({ storyId, actionId: 'non_existent_action_id' }),
    });
    assert.equal(notFoundRes.status, 404);
    const notFoundBody = await notFoundRes.json();
    assert.equal(notFoundBody.code, 'ACTION_NOT_FOUND');

    // 5b. Missing actionId
    const missingActionRes = await fetch(`${baseUrl}/api/game/action/narrate/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-story-id': storyId },
      body: JSON.stringify({ storyId }),
    });
    assert.equal(missingActionRes.status, 400);

    // 5c. Provider failure during regeneration: returns 503, preserves canonical commit
    (orchestrator as any).generateNarrativeOnly = async () => {
      return {
        success: false,
        error: 'Simulated downstream model timeout',
        fallbackReason: 'Simulated timeout',
        attemptsTrail: [],
      };
    };

    const failRes = await fetch(`${baseUrl}/api/game/action/narrate/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-story-id': storyId },
      body: JSON.stringify({ storyId, actionId }),
    });
    assert.equal(failRes.status, 503);
    const failBody = await failRes.json();
    assert.equal(failBody.success, false);
    assert.equal(failBody.actionCommitted, true, 'actionCommitted must remain true on provider failure');

  } finally {
    (orchestrator as any).generateNarrativeOnly = originalGenerate;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    worldRepository.deleteStoryRun(storyId);
  }
});
