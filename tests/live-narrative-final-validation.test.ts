import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository } from '../server/repositories/worldRepository';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';

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
