import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository } from '../../server/repositories/worldRepository';
import { serverMockAuthority } from '../../server/mockEngine/serverMockAuthority';
import { MultiModelOrchestrator } from '../../server/domain/aiOrchestrator';

test('CHALLENGE: F05 call budgeting & single repair pass enforces strictly <= 2 LLM calls and deterministic fallback', async () => {
  const storyId = 'challenge_budget_' + Date.now();
  worldRepository.seedStory(storyId);

  const orchestrator = worldRepository.getAiOrchestrator();
  const originalExecute = (orchestrator as any).executeTaskGeneration;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Clean Primary Generation -> Exactly 1 LLM call, 0 rewrites
    // -------------------------------------------------------------------------
    let calls: Array<{ task: string; prompt: string }> = [];
    (orchestrator as any).executeTaskGeneration = async (task: string, prompt: string, instruction: any, opts: any) => {
      calls.push({ task, prompt });
      return {
        text: JSON.stringify({
          narrative: ['You notice the leather-bound ledger, uncovered beneath the dust in the archives.'],
          dialogue: [],
          events: ['LEDGER_FOUND'],
          stateChanges: [],
          memoryCandidates: ['Found the ledger.'],
          audioCues: [],
          visualCues: [],
        }),
        modelId: 'fixture-primary',
        providerId: 'fixture-provider',
        source: 'AI_PRIMARY',
      };
    };

    calls = [];
    const cleanResult = await orchestrator.generateNarrativeOnly({
      storyId,
      playerAction: 'I search the archives for the ledger.',
      actionResolution: {
        resolutionId: 'res_clean_1',
        storyId,
        turnId: 'turn_clean_1',
        playerAction: 'I search the archives for the ledger.',
        playerIntent: {},
        attemptedEffect: 'find the ledger',
        targetEntityIds: [],
        resolutionMethod: 'DETERMINISTIC',
        outcomeTier: 'SUCCESS',
        actualEffect: 'You locate the leather-bound ledger in the archives.',
        canonicalStateChanges: [],
        physicalConsequences: ['The ledger is uncovered.'],
        playerVisibleConsequences: ['You notice the leather-bound ledger.'],
        evidenceIds: [],
        uncertainty: [],
        provenance: { source: 'CANONICAL_ENGINE' },
      },
    });

    if (!cleanResult.success) {
      console.log('cleanResult failed:', {
        error: cleanResult.error,
        fallbackReason: cleanResult.fallbackReason,
        validationRejected: cleanResult.validationRejected,
        actionFidelity: cleanResult.actionFidelity,
        narrativeQualityAudit: cleanResult.narrativeQualityAudit,
        callsCount: calls.length,
      });
    }
    assert.equal(cleanResult.success, true);
    assert.equal(calls.length, 1, 'Clean generation must make exactly 1 LLM call');
    assert.equal(calls[0].task, 'narrative.generate');
    assert.equal(cleanResult.narrativeQualityAudit?.rewriteAttempted, false);

    // -------------------------------------------------------------------------
    // TEST 2: Defective Primary (Missing Visible Consequence) Repaired Successfully -> Exactly 2 LLM calls
    // -------------------------------------------------------------------------
    calls = [];
    (orchestrator as any).executeTaskGeneration = async (task: string, prompt: string, instruction: any, opts: any) => {
      calls.push({ task, prompt });
      if (task === 'narrative.generate') {
        // Passes scene continuity (anchors to Whispering Orrery), but omits the required consequence
        return {
          text: JSON.stringify({
            narrative: ['The brass gears of the Whispering Orrery turn quietly above, while the rain falls against the glass dome.'],
            dialogue: [],
            events: [],
            stateChanges: [],
            memoryCandidates: [],
            audioCues: [],
            visualCues: [],
          }),
          modelId: 'fixture-primary',
          providerId: 'fixture-provider',
          source: 'AI_PRIMARY',
        };
      } else if (task === 'narrative.review') {
        // Repair provides the required consequence
        return {
          text: JSON.stringify({
            narrative: ['Under the brass rings of the Whispering Orrery, you spot the hidden ledger, uncovered beneath old parchment.'],
            dialogue: [],
            events: ['LEDGER_FOUND'],
            stateChanges: [],
            memoryCandidates: ['The hidden ledger was uncovered.'],
            audioCues: [],
            visualCues: [],
          }),
          modelId: 'fixture-review',
          providerId: 'fixture-provider',
          source: 'AI_PRIMARY',
        };
      }
      throw new Error(`Unexpected task: ${task}`);
    };

    const repairedResult = await orchestrator.generateNarrativeOnly({
      storyId,
      playerAction: 'I search the archives for the ledger.',
      actionResolution: {
        resolutionId: 'res_repair_1',
        storyId,
        turnId: 'turn_repair_1',
        playerAction: 'I search the archives for the ledger.',
        playerIntent: {},
        attemptedEffect: 'find the ledger',
        targetEntityIds: [],
        resolutionMethod: 'DETERMINISTIC',
        outcomeTier: 'SUCCESS',
        actualEffect: 'You locate the leather-bound ledger.',
        canonicalStateChanges: [],
        physicalConsequences: ['The hidden ledger is uncovered.'],
        playerVisibleConsequences: ['You spot the hidden ledger.'],
        evidenceIds: [],
        uncertainty: [],
        provenance: { source: 'CANONICAL_ENGINE' },
      },
    });

    if (!repairedResult.success) {
      console.log('repairedResult failed:', {
        error: repairedResult.error,
        fallbackReason: repairedResult.fallbackReason,
        validationRejected: repairedResult.validationRejected,
        actionFidelity: repairedResult.actionFidelity,
        narrativeQualityAudit: repairedResult.narrativeQualityAudit,
        callsCount: calls.length,
      });
    }
    assert.equal(repairedResult.success, true);
    assert.equal(calls.length, 2, 'Repaired generation must make exactly 2 LLM calls (1 primary + 1 review)');
    assert.equal(calls[0].task, 'narrative.generate');
    assert.equal(calls[1].task, 'narrative.review');
    assert.equal(repairedResult.narrativeQualityAudit?.rewriteAttempted, true);
    assert.equal(repairedResult.narrativeQualityAudit?.rewriteSucceeded, true);

    // -------------------------------------------------------------------------
    // TEST 3: Persistent Validation Failure (Repair Fails Too) -> Strictly <= 2 LLM calls, deterministic fallback
    // -------------------------------------------------------------------------
    calls = [];
    (orchestrator as any).executeTaskGeneration = async (task: string, prompt: string, instruction: any, opts: any) => {
      calls.push({ task, prompt });
      if (task === 'narrative.generate') {
        return {
          text: JSON.stringify({
            narrative: ['The brass gears of the Whispering Orrery turn quietly above, while rain falls against the glass.'],
            dialogue: [],
            events: [],
            stateChanges: [],
            memoryCandidates: [],
            audioCues: [],
            visualCues: [],
          }),
          modelId: 'fixture-persistent-fail-primary',
          providerId: 'fixture-provider',
          source: 'AI_PRIMARY',
        };
      } else {
        return {
          text: JSON.stringify({
            narrative: ['The bronze armillaries of the Whispering Orrery continue spinning slowly in the dim light.'],
            dialogue: [],
            events: [],
            stateChanges: [],
            memoryCandidates: [],
            audioCues: [],
            visualCues: [],
          }),
          modelId: 'fixture-persistent-fail-review',
          providerId: 'fixture-provider',
          source: 'AI_PRIMARY',
        };
      }
    };

    const failedResult = await orchestrator.generateNarrativeOnly({
      storyId,
      playerAction: 'I search the archives for the ledger.',
      actionResolution: {
        resolutionId: 'res_fail_1',
        storyId,
        turnId: 'turn_fail_1',
        playerAction: 'I search the archives for the ledger.',
        playerIntent: {},
        attemptedEffect: 'find the ledger',
        targetEntityIds: [],
        resolutionMethod: 'DETERMINISTIC',
        outcomeTier: 'SUCCESS',
        actualEffect: 'You locate the leather-bound ledger.',
        canonicalStateChanges: [],
        physicalConsequences: ['The hidden ledger is uncovered.'],
        playerVisibleConsequences: ['You spot the hidden ledger.'],
        evidenceIds: [],
        uncertainty: [],
        provenance: { source: 'CANONICAL_ENGINE' },
      },
    });

    assert.equal(failedResult.success, false, 'Persistent failure must return success: false');
    assert.equal(calls.length, 2, 'Persistent failure must strictly stop after at most 2 LLM calls');
    assert.equal(calls[0].task, 'narrative.generate');
    assert.equal(calls[1].task, 'narrative.review');
    assert.equal(failedResult.validationRejected, true);

    // -------------------------------------------------------------------------
    // TEST 4: Zero Retries Configured (maxRetries: 0) -> Strictly 1 LLM call
    // -------------------------------------------------------------------------
    calls = [];
    const zeroRetryResult = await orchestrator.generateNarrativeOnly({
      storyId,
      playerAction: 'I search the archives for the ledger.',
      maxRetries: 0,
      actionResolution: {
        resolutionId: 'res_zero_1',
        storyId,
        turnId: 'turn_zero_1',
        playerAction: 'I search the archives for the ledger.',
        playerIntent: {},
        attemptedEffect: 'find the ledger',
        targetEntityIds: [],
        resolutionMethod: 'DETERMINISTIC',
        outcomeTier: 'SUCCESS',
        actualEffect: 'You locate the leather-bound ledger.',
        canonicalStateChanges: [],
        physicalConsequences: ['The hidden ledger is uncovered.'],
        playerVisibleConsequences: ['You spot the hidden ledger.'],
        evidenceIds: [],
        uncertainty: [],
        provenance: { source: 'CANONICAL_ENGINE' },
      },
    });

    assert.equal(zeroRetryResult.success, false);
    assert.equal(calls.length, 1, 'When maxRetries: 0 is specified, strictly 1 LLM call must occur');
    assert.match(zeroRetryResult.narrativeQualityAudit?.rewriteSkippedReason || '', /retry budget is zero/i);

    // -------------------------------------------------------------------------
    // TEST 5: Live processCustomAction with Persistent Validation Failure
    // Verify: Strictly <= 2 calls, action committed, deterministic fallback exposed, no bad prose leaked.
    // -------------------------------------------------------------------------
    calls = [];
    const liveActionRes = await serverMockAuthority.processCustomAction({
      type: 'CUSTOM_ACTION',
      storyId,
      actionText: 'I search the archives for the ledger.',
    });

    const narrativeCalls = calls.filter((c) => c.task.startsWith('narrative.'));
    assert.ok(liveActionRes.actionId, 'Action must be committed with actionId');
    assert.equal(narrativeCalls.length, 2, 'Live processCustomAction must strictly make <= 2 narrative LLM calls on validation failure');
    assert.equal(narrativeCalls[0].task, 'narrative.generate');
    assert.equal(narrativeCalls[1].task, 'narrative.review');
    // Verify player is not given the rejected prose
    assert.ok(!liveActionRes.narrativeResponse, 'Rejected prose must NOT be player-visible');
    // Verify narrativeError is flagged
    assert.ok(liveActionRes.narrativeError, 'narrativeError must be set on failure');
    assert.equal(liveActionRes.narrativeError.code, 'NARRATION_FINAL_REVIEW_REJECTED');
    // Verify deterministicFallbackMessage is attached
    assert.ok(
      (liveActionRes.narrativeError as any).deterministicFallbackMessage,
      'deterministicFallbackMessage must be present for the player'
    );
    // Verify presentationFeedback in actionLog uses deterministicFallbackMessage
    const state = serverMockAuthority.getDynamicStoryState(storyId);
    const log = state.actionHistory.find((a: any) => a.id === liveActionRes.actionId);
    assert.ok(log);
    assert.equal(log.presentationFeedback, (liveActionRes.narrativeError as any).deterministicFallbackMessage);
    assert.equal(log.stateAdjudication?.allApproved, true);
    assert.ok(log.stateAdjudication?.commitRecords?.length > 0);

  } finally {
    (orchestrator as any).executeTaskGeneration = originalExecute;
    worldRepository.deleteStoryRun(storyId);
  }
});
