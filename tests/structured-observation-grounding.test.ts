import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { SemanticNarrativeReview, evaluateObservationGrounding } from '../server/domain/semanticNarrativeReview';

test('F07: Structured observation grounding replaces fragile regex with perceptual & anchor validation', () => {
  const storyId = 'structured_obs_test_' + Date.now();
  worldRepository.seedStory(storyId);

  const player = worldRepository.getPlayerLifecycle(storyId);
  assert.ok(player);

  const situation = CurrentSituationBuilder.build({
    storyId,
    playerAction: 'I observe the courtyard.',
    viewerActorId: player.actorId,
    worldRepo: worldRepository,
  });

  const fakePlan = {
    turnId: 'turn_obs_fixture',
    objective: 'Observe scene.',
    immediateSteps: [],
    informationToReveal: [],
    entitiesToReact: [],
    continuityRequirements: [],
    forbiddenAssumptions: [],
    stateEffectsExpected: [],
    createdAt: 'Day 1 • Afternoon',
    expiresAfterNarration: true,
  };

  try {
    // 1. Natural observational prose without the exact old regex keywords passes cleanly
    const naturalProse = 'You survey the courtyard; not a single person remains in the square.';
    const broadIntent = {
      interactionMode: 'PASSIVE_OBSERVATION' as const,
      speechIntent: false,
      movementIntent: false,
      observationIntent: true,
      explicitTargets: [],
      impliedTargets: [],
      confidence: 1,
      source: 'DETERMINISTIC' as const,
      originalText: 'I survey the courtyard.',
    };

    const evalNatural = evaluateObservationGrounding(naturalProse, broadIntent, situation);
    assert.equal(evalNatural.valid, true, 'Natural observation prose should be valid');
    assert.equal(evalNatural.hasPerceptionBeat, true);
    assert.equal(evalNatural.hasOutcomeOrLimitation, true);

    const reviewNatural = SemanticNarrativeReview.review({
      intent: broadIntent,
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: [naturalProse],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.notEqual(reviewNatural.decision, 'REJECT');
    assert.ok(!reviewNatural.violations.some((v) => v.code === 'MISSING_OBSERVATION'));

    // 2. Targeted observation where the target is omitted fails grounding
    const targetedIntent = {
      interactionMode: 'PASSIVE_OBSERVATION' as const,
      speechIntent: false,
      movementIntent: false,
      observationIntent: true,
      target: {
        id: 'obj_carved_desk',
        name: 'carved desk',
        source: 'EXPLICIT' as const,
      },
      explicitTargets: [{ id: 'obj_carved_desk', name: 'carved desk', source: 'EXPLICIT' as const }],
      impliedTargets: [],
      confidence: 1,
      source: 'DETERMINISTIC' as const,
      originalText: 'I inspect the carved desk.',
    };

    const omittedTargetProse = 'You gaze across the room at the high ceiling beams, watching shadows shift along the stone rafters.';
    const evalOmitted = evaluateObservationGrounding(omittedTargetProse, targetedIntent, situation);
    assert.equal(evalOmitted.valid, false, 'Observation omitting targeted subject must fail');
    assert.equal(evalOmitted.hasAnchorGrounding, false, 'hasAnchorGrounding must be false');
    assert.ok(evalOmitted.reasons.some((r) => r.includes('carved desk')));

    const reviewOmitted = SemanticNarrativeReview.review({
      intent: targetedIntent,
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: [omittedTargetProse],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.ok(reviewOmitted.violations.some((v) => v.code === 'MISSING_OBSERVATION'));

    // 3. Targeted observation that includes the target and a perception beat passes
    const validTargetedProse = 'You examine the carved desk closely; its surface reveals fine scratch marks around the drawer lock.';
    const evalValid = evaluateObservationGrounding(validTargetedProse, targetedIntent, situation);
    assert.equal(evalValid.valid, true);
    assert.equal(evalValid.hasAnchorGrounding, true);
    assert.equal(evalValid.hasPerceptionBeat, true);

    // 4. Honest limitation without perception verb passes
    const limitationProse = 'The drawer yields nothing but dust and empty partitions.';
    const evalLimitation = evaluateObservationGrounding(limitationProse, targetedIntent, situation, {
      actualEffect: 'Searched the drawer.',
      outcomeTier: 'SUCCESS',
      physicalConsequences: [],
      playerVisibleConsequences: ['Nothing of note was found.'],
    } as any);
    assert.equal(evalLimitation.valid, true);
    assert.equal(evalLimitation.hasOutcomeOrLimitation, true);
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});
