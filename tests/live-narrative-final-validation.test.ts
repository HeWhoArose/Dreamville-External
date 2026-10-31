import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';

import { worldRepository } from '../server/repositories/worldRepository';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { gameRouter } from '../server/api/gameRoutes';

test('live-turn final review never returns the original narration after both candidates fail', async () => {
  const storyId = 'live_narration_final_gate_' + Date.now();
  worldRepository.seedStory(storyId);

  const orchestrator = worldRepository.getAiOrchestrator();
  const originalGenerate = orchestrator.generateNarrativeOnly;
  const originalExecute = orchestrator.executeTaskGeneration;
  const originalProcessAction = serverMockAuthority.processAction;
  let canonicalActionCalls = 0;
  let repairCalls = 0;
  let resolutionSnapshot: string | undefined;
  let resolutionReference: any;
  let canonicalActionCallsAtNarrationStart = 0;

  const sceneryOnly = 'Tall stone columns cast long shadows across the silent plaza. Dust drifts through the pale light, and the air carries the stillness of an empty hall.';
  const fakePlan = {
    turnId: 'turn_final_gate_fixture',
    objective: 'Narrate the immediate result of the player action.',
    immediateSteps: ['Answer the action directly.', 'Show an observable consequence.'],
    informationToReveal: [],
    entitiesToReact: [],
    continuityRequirements: [],
    forbiddenAssumptions: ['Do not invent hidden facts or uncommitted outcomes.'],
    stateEffectsExpected: [],
    createdAt: 'Cycle 42 • Month 10 • Day 14 • Afternoon',
    expiresAfterNarration: true,
  } as any;

  (orchestrator as any).generateNarrativeOnly = async (params: any) => {
    resolutionReference = params?.actionResolution;
    canonicalActionCallsAtNarrationStart = canonicalActionCalls;
    resolutionSnapshot = JSON.stringify(params?.actionResolution);
    return {
    success: true,
    turnPackage: {
      narrative: [sceneryOnly],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
      visualCues: [],
    },
    providerId: 'fixture-provider',
    modelId: 'fixture-primary',
    source: 'AI_PRIMARY',
    narrativePlan: fakePlan,
    storyBeat: undefined,
    };
  };
  (orchestrator as any).executeTaskGeneration = async (taskType: string) => {
    if (taskType === 'narrative.review') repairCalls += 1;
    return {
    text: JSON.stringify({ narrativeText: sceneryOnly, structuredEvents: [] }),
    providerId: 'fixture-provider',
    modelId: 'fixture-review',
    source: 'AI_PRIMARY',
    fallbackReason: undefined,
    };
  };
  (serverMockAuthority as any).processAction = function (...args: any[]) {
    canonicalActionCalls += 1;
    return originalProcessAction.apply(this, args as any);
  };

  try {
    const result = await serverMockAuthority.processCustomAction(
      {
        type: 'CUSTOM_ACTION',
        storyId,
        actionText: 'I knock twice on the iron gate to test whether it moves.',
      } as any,
      undefined,
      { bypassCapabilityAdvisor: true },
    );

    assert.equal(result.success, true, 'the canonical action remains committed even if its narration is rejected');
    assert.ok(canonicalActionCallsAtNarrationStart >= 1, 'the canonical action must resolve before narration starts');
    assert.equal(canonicalActionCalls, canonicalActionCallsAtNarrationStart, 'narration repair must not re-run the canonical action after the first narration begins');
    assert.equal(repairCalls, 1, 'the bounded authority repair should run once');
    assert.equal(JSON.stringify(resolutionReference), resolutionSnapshot, 'the committed ActionResolution must remain unchanged during repair');
    assert.equal(result.narrativeResponse, undefined, 'rejected narration must not be returned to the player');
    assert.equal(result.narrativeError?.code, 'NARRATION_FINAL_REVIEW_REJECTED');
    assert.ok((result.narrativeError as any)?.deterministicFallbackMessage, 'a safe deterministic fallback message must be attached when narration is rejected');

    const loggedAction = result.viewState.actionHistory.find((entry: any) => entry.id === result.actionId);
    assert.ok(loggedAction, 'the committed action must remain in the player-visible action history');
    assert.equal(loggedAction.narrativeResponse, undefined, 'the rejected primary narration must not be persisted');
    assert.equal(loggedAction.narrativeError?.code, 'NARRATION_FINAL_REVIEW_REJECTED');
    assert.match(String(loggedAction.narrativeError?.fallbackReason || ''), /action|consequence|continuity|review/i);
  } finally {
    (orchestrator as any).generateNarrativeOnly = originalGenerate;
    (orchestrator as any).executeTaskGeneration = originalExecute;
    (serverMockAuthority as any).processAction = originalProcessAction;
    worldRepository.deleteStoryRun(storyId);
  }
});

test('Phase 1A live /api/game/action gate: unified production path makes at most one repair call (never a third LLM call), commits deterministic outcome on provider failure, and handles idempotent retries safely', async () => {
  const storyId = 'live_phase1a_gate_' + Date.now();
  worldRepository.seedStory(storyId);

  const app = express();
  app.use(express.json());
  app.use('/api/game', gameRouter);
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/api/game`;

  const orchestrator = worldRepository.getAiOrchestrator();
  const originalExecuteTaskGeneration = orchestrator.executeTaskGeneration.bind(orchestrator);
  const taskCalls: string[] = [];

  try {
    // 1. Both initial generation and single repair fail quality/consequence checks -> exactly 2 calls (1 generate + 1 review), never a 3rd call.
    const { CurrentSituationBuilder } = await import('../server/domain/currentSituation');
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I strike the iron gate with my shoulder to test the lock.',
      worldRepo: worldRepository,
    });
    const locationName = situation.location.name || 'the courtyard';
    const weakCandidate = JSON.stringify({
      narrative: [
        `In ${locationName}, tall stone columns cast long shadows across the silent ground. Dust drifts through the air, and the stones remain still in the afternoon hush.`,
      ],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    });

    (orchestrator as any).executeTaskGeneration = async (taskType: string) => {
      taskCalls.push(taskType);
      return {
        text: weakCandidate,
        providerId: 'phase1a-provider',
        modelId: taskType === 'narrative.generate' ? 'phase1a-primary' : 'phase1a-review',
        source: 'AI_PRIMARY',
        attemptsTrail: [{ providerId: 'phase1a-provider', modelId: 'phase1a-model', status: 'SUCCESS', latencyMs: 12 }],
      };
    };

    const dualFailRes = await fetch(`${baseUrl}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyId,
        type: 'CUSTOM_ACTION',
        actionText: 'I strike the iron gate with my shoulder to test the lock.',
      }),
    });
    assert.equal(dualFailRes.status, 200);
    const dualFailData: any = await dualFailRes.json();

    assert.equal(dualFailData.success, true, 'authoritative game resolution remains committed');
    assert.deepEqual(
      taskCalls.filter((task) => task.startsWith('narrative.')),
      ['narrative.generate', 'narrative.review'],
      'must execute at most 1 initial generation + 1 repair pass and never a 3rd narrative LLM call',
    );
    assert.equal(dualFailData.narrativeResponse, undefined, 'rejected AI prose must not be returned');
    assert.equal(dualFailData.narrativeError?.code, 'NARRATION_FINAL_REVIEW_REJECTED');
    assert.equal((dualFailData.narrativeError as any)?.fallbackUsed, true);
    assert.ok(
      typeof dualFailData.message === 'string' && dualFailData.message.trim().length > 0,
      'safe deterministic fallback message must be returned in result.message',
    );
    assert.equal(dualFailData.message, (dualFailData.narrativeError as any)?.deterministicFallbackMessage);

    // 2. Provider timeout / unavailability + idempotent retry handling -> commits deterministic outcome once and replays safely on retry.
    taskCalls.length = 0;
    let processCustomActionCalls = 0;
    const originalProcessCustomAction = serverMockAuthority.processCustomAction.bind(serverMockAuthority);
    (serverMockAuthority as any).processCustomAction = async (...args: any[]) => {
      processCustomActionCalls += 1;
      return originalProcessCustomAction(...args);
    };
    (orchestrator as any).executeTaskGeneration = async (taskType: string) => {
      taskCalls.push(taskType);
      const timeoutErr: any = new Error('Provider timed out after 30000ms');
      timeoutErr.code = 'PROVIDER_TIMEOUT';
      timeoutErr.attemptsTrail = [{ providerId: 'phase1a-provider', modelId: 'phase1a-primary', status: 'FAILED', latencyMs: 30000, error: 'Timeout' }];
      throw timeoutErr;
    };

    const idempotencyKey = 'idem_phase1a_timeout_retry_' + Date.now();
    const timeoutRes1 = await fetch(`${baseUrl}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idempotencyKey },
      body: JSON.stringify({
        storyId,
        idempotencyKey,
        type: 'CUSTOM_ACTION',
        actionText: 'I inspect the heavy iron latch on the gate.',
      }),
    });
    assert.equal(timeoutRes1.status, 200);
    const timeoutData1: any = await timeoutRes1.json();
    assert.equal(timeoutData1.success, true, 'provider timeout must not erase the resolved gameplay action');
    assert.equal(timeoutData1.narrativeResponse, undefined);
    assert.equal(timeoutData1.narrativeError?.code, 'NARRATION_AI_UNAVAILABLE');
    assert.equal((timeoutData1.narrativeError as any)?.fallbackUsed, true);
    assert.ok(timeoutData1.message && timeoutData1.message.length > 0, 'deterministic fallback message is provided');
    assert.equal(processCustomActionCalls, 1);

    const eventCountAfterFirst = worldRepository.getCanonicalCommandEventCount(storyId);
    const historyLengthAfterFirst = timeoutData1.viewState.actionHistory.length;

    // Retry the exact same request with the same idempotencyKey: must not re-run canonical resolution or duplicate history.
    const timeoutRes2 = await fetch(`${baseUrl}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idempotencyKey },
      body: JSON.stringify({
        storyId,
        idempotencyKey,
        type: 'CUSTOM_ACTION',
        actionText: 'I inspect the heavy iron latch on the gate.',
      }),
    });
    assert.equal(timeoutRes2.status, 200);
    const timeoutData2: any = await timeoutRes2.json();
    assert.equal(processCustomActionCalls, 1, 'idempotent retry must not re-execute processCustomAction');
    assert.equal(worldRepository.getCanonicalCommandEventCount(storyId), eventCountAfterFirst, 'idempotent retry must not append a duplicate canonical event');
    assert.equal(timeoutData2.actionId, timeoutData1.actionId, 'idempotent retry must return the same committed actionId');
    assert.equal(timeoutData2.viewState.actionHistory.length, historyLengthAfterFirst);

    (serverMockAuthority as any).processCustomAction = originalProcessCustomAction;
  } finally {
    (orchestrator as any).executeTaskGeneration = originalExecuteTaskGeneration;
    server.close();
    worldRepository.deleteStoryRun(storyId);
  }
});

