import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository } from '../../server/repositories/worldRepository';
import { serverMockAuthority } from '../../server/mockEngine/serverMockAuthority';
import { narrativeContinuityEngine } from '../../server/domain/narrativeContinuityEngine';
import { NarrativeStateAdjudicator } from '../../server/domain/narrativeStateAdjudicator';

test('CHALLENGE: F03 & F04 rapid multi-turn sequences, state adjudication provenance, and plot beat persistence', async () => {
  const storyId = 'challenge_multi_turn_' + Date.now();
  worldRepository.seedStory(storyId);

  const orchestrator = worldRepository.getAiOrchestrator();
  const originalGenerate = orchestrator.generateNarrativeOnly;

  // Provide realistic narrative generation for all turns
  let turnNumber = 0;
  (orchestrator as any).generateNarrativeOnly = async (params: any) => {
    turnNumber++;
    return {
      success: true,
      turnPackage: {
        narrative: [
          `Turn ${turnNumber}: In the Whispering Orrery, you resolve the action smoothly without disrupting canonical facts.`
        ],
        dialogue: [],
        events: [`DECORATIVE_AI_EVENT_${turnNumber}`, 'FICTIONAL_EXPLOSION_CLAIM'],
        stateChanges: [], // Stripped by presentation layer
        memoryCandidates: [`Event for turn ${turnNumber}`],
        audioCues: [],
        visualCues: [],
      },
      providerId: 'fixture-provider',
      modelId: 'fixture-primary',
      source: 'AI_PRIMARY',
      narrativePlan: {
        turnId: `turn_multi_${turnNumber}`,
        objective: `Turn ${turnNumber} presentation`,
        immediateSteps: ['Narrate result'],
        informationToReveal: [],
        entitiesToReact: [],
        continuityRequirements: [],
        forbiddenAssumptions: [],
        stateEffectsExpected: [],
        createdAt: 'Day 1',
        expiresAfterNarration: true,
      },
    };
  };

  try {
    const actionsToExecute = [
      // Turn 1: Zero physical state change (pure perceptual / observational action)
      'I look closely at the inscriptions engraved on the central pillar.',
      // Turn 2: Spatial movement within the current location
      'I step closer toward the bronze apparatus beside the central pillar.',
      // Turn 3: Interaction with scene object
      'I examine the iron lever on the wall carefully.',
      // Turn 4: Skill check / challenge attempt
      'I attempt to decipher the celestial dial symbols on the bronze mechanism.',
      // Turn 5: Zero physical state change social / query action
      'I call out quietly to see if any scholar answers within the chamber.',
    ];

    const turnIds: string[] = [];
    const expectedPlotSummaries: string[] = [];

    for (let i = 0; i < actionsToExecute.length; i++) {
      const actionText = actionsToExecute[i];
      const res = await serverMockAuthority.processCustomAction({
        type: 'CUSTOM_ACTION',
        storyId,
        actionText,
      });

      assert.equal(res.success, true, `Turn ${i + 1} must succeed`);
      assert.ok(res.actionId, `Turn ${i + 1} must return actionId`);
      turnIds.push(res.actionId);

      // 1. Verify stateAdjudication contract on ActionResult
      assert.ok(res.stateAdjudication, `Turn ${i + 1} must include stateAdjudication`);
      assert.equal(res.stateAdjudication.allApproved, true, `Turn ${i + 1} adjudication must be approved`);
      assert.ok(
        res.stateAdjudication.commitRecords.length > 0,
        `Turn ${i + 1} adjudication must have at least one commit record`
      );

      // 2. Verify provenance
      const provenanceValid = res.stateAdjudication.commitRecords.every(
        (rec: any) => rec.source === 'CANONICAL_ENGINE' || rec.source === 'CANONICAL_ACTION'
      );
      assert.ok(provenanceValid, `Turn ${i + 1} commitRecords must all have canonical provenance`);

      // 3. Verify StoryRun plot.beats persistence
      const savedRun = worldRepository.getStoryRun(storyId);
      assert.ok(savedRun, 'Story run must exist');
      const beats = savedRun?.runtimeState?.plot?.beats || [];
      assert.equal(beats.length, i + 1, `Turn ${i + 1} must result in exactly ${i + 1} plot beats`);

      const latestBeat = beats.at(-1);
      assert.ok(latestBeat, `Turn ${i + 1} must have latest beat`);
      assert.equal(latestBeat.turnId, res.actionId, `Beat turnId must match actionId on turn ${i + 1}`);
      assert.ok(latestBeat.text, `Beat text must not be empty on turn ${i + 1}`);
      assert.ok(
        !latestBeat.text.includes('undefined mutated by undefined'),
        `Beat text must not contain unformatted template literals on turn ${i + 1}`
      );
      expectedPlotSummaries.push(latestBeat.text);

      // 4. Verify narrativeContinuityEngine matches savedRun plot beats
      const continuityState = narrativeContinuityEngine.getState(worldRepository, storyId);
      assert.equal(continuityState.plot.beats.length, i + 1);
      assert.equal(continuityState.plot.beats.at(-1)?.id, latestBeat.id);
      assert.equal(continuityState.plot.beats.at(-1)?.turnId, res.actionId);

      // 5. Assert decorative AI events are STRICTLY ISOLATED and never become plot beats
      assert.ok(
        !beats.some((b: any) =>
          b.text.includes('DECORATIVE_AI_EVENT') || b.text.includes('FICTIONAL_EXPLOSION_CLAIM')
        ),
        'AI decorative events must never contaminate plot beats'
      );
    }

    // Verify monotonic beat sequence and chronological turnId alignment
    const finalRun = worldRepository.getStoryRun(storyId);
    const finalBeats = finalRun?.runtimeState?.plot?.beats || [];
    assert.equal(finalBeats.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(finalBeats[i].turnId, turnIds[i]);
      assert.equal(finalBeats[i].text, expectedPlotSummaries[i]);
    }

    // -------------------------------------------------------------------------
    // ADVERSARIAL STRESS TEST: adjudicateCanonicalAction under edge cases
    // -------------------------------------------------------------------------
    // Edge Case A: Zero physical state changes with null check
    const zeroStateAdj = NarrativeStateAdjudicator.adjudicateCanonicalAction({
      actionResolution: {
        resolutionId: 'res_zero_stress',
        storyId,
        turnId: 'turn_zero_stress',
        playerAction: 'I observe the ceiling.',
        playerIntent: {} as any,
        attemptedEffect: 'look at ceiling',
        targetEntityIds: [],
        resolutionMethod: 'DETERMINISTIC',
        outcomeTier: 'SUCCESS',
        actualEffect: 'You observe the carved constellation charts on the ceiling.',
        canonicalStateChanges: [],
        physicalConsequences: [],
        playerVisibleConsequences: ['Constellations are visible.'],
        evidenceIds: [],
        uncertainty: [],
        provenance: { source: 'CANONICAL_ENGINE' },
      },
      storyId,
      turnId: 'turn_zero_stress',
      actorId: 'player_stress',
    });

    assert.equal(zeroStateAdj.allApproved, true);
    assert.equal(zeroStateAdj.commitRecords.length, 1);
    assert.equal(zeroStateAdj.commitRecords[0].kind, 'ACTION_SUCCESS');
    assert.equal(zeroStateAdj.commitRecords[0].source, 'CANONICAL_ACTION');
    assert.equal(zeroStateAdj.commitRecords[0].summary, 'You observe the carved constellation charts on the ceiling.');

    // Edge Case B: Action with complex canonical state changes (health, inventory, spatial)
    const complexStateAdj = NarrativeStateAdjudicator.adjudicateCanonicalAction({
      actionResolution: {
        resolutionId: 'res_complex_stress',
        storyId,
        turnId: 'turn_complex_stress',
        playerAction: 'I drink the healing elixir and equip the lantern.',
        playerIntent: {} as any,
        attemptedEffect: 'heal and equip',
        targetEntityIds: ['potion_1', 'lantern_1'],
        resolutionMethod: 'ITEM_USE',
        outcomeTier: 'CLEAN_SUCCESS',
        actualEffect: 'Healing elixir was consumed restoring 15 health.',
        canonicalStateChanges: [
          {
            kind: 'HEALTH',
            targetId: 'player_stress',
            value: { restored: 15 },
            metadata: { source: 'CanonicalConditionEngine', summary: 'Restored 15 health' },
          },
          {
            kind: 'INVENTORY',
            targetId: 'player_stress',
            value: { itemId: 'potion_1', consumed: true },
            metadata: { source: 'CanonicalInventoryEngine', summary: 'Healing potion consumed' },
          },
          {
            kind: 'SPATIAL',
            targetId: 'player_stress',
            value: { proximityBand: 'ADJACENT' },
            metadata: { source: 'CanonicalMovementEngine', summary: 'Moved adjacent to table' },
          },
        ],
        physicalConsequences: ['Health restored', 'Potion consumed'],
        playerVisibleConsequences: ['Health improved', 'Holding lantern'],
        evidenceIds: [],
        uncertainty: [],
        provenance: { source: 'CANONICAL_ENGINE' },
      },
      storyId,
      turnId: 'turn_complex_stress',
      actorId: 'player_stress',
    });

    assert.equal(complexStateAdj.allApproved, true);
    assert.equal(complexStateAdj.commitRecords.length, 3);
    assert.equal(complexStateAdj.commitRecords[0].kind, 'HEALTH');
    assert.equal(complexStateAdj.commitRecords[0].summary, 'Restored 15 health');
    assert.equal(complexStateAdj.commitRecords[1].kind, 'INVENTORY');
    assert.equal(complexStateAdj.commitRecords[1].summary, 'Healing potion consumed');
    assert.equal(complexStateAdj.commitRecords[2].kind, 'SPATIAL');
    assert.equal(complexStateAdj.commitRecords[2].summary, 'Moved adjacent to table');

    // Edge Case C: Adversarial malformed actionResolution (null/undefined fields)
    const malformedAdj = NarrativeStateAdjudicator.adjudicateCanonicalAction({
      actionResolution: {
        resolutionId: 'res_malformed',
        storyId,
        turnId: 'turn_malformed',
        playerAction: '',
        playerIntent: {} as any,
        attemptedEffect: '',
        targetEntityIds: [],
        resolutionMethod: undefined as any,
        outcomeTier: undefined as any,
        actualEffect: '',
        canonicalStateChanges: undefined as any,
        physicalConsequences: undefined as any,
        playerVisibleConsequences: undefined as any,
        evidenceIds: [],
        uncertainty: [],
        provenance: undefined as any,
      },
      storyId,
      turnId: 'turn_malformed',
      actorId: 'player_stress',
    });

    assert.equal(malformedAdj.allApproved, true);
    assert.ok(malformedAdj.commitRecords.length >= 1, 'Must fallback to ACTION_RESOLVED record');
    assert.equal(malformedAdj.commitRecords[0].kind, 'ACTION_RESOLVED');
    assert.equal(malformedAdj.commitRecords[0].summary, 'Canonical action resolved.');

  } finally {
    (orchestrator as any).generateNarrativeOnly = originalGenerate;
    worldRepository.deleteStoryRun(storyId);
  }
});
