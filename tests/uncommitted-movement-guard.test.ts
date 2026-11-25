import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { SemanticNarrativeReview } from '../server/domain/semanticNarrativeReview';

test('F07 & Mode 4: Uncommitted movement arrival guard prevents narrating arrival when movement was not committed', () => {
  const storyId = 'uncommitted_movement_guard_test_' + Date.now();
  worldRepository.seedStory(storyId);

  const player = worldRepository.getPlayerLifecycle(storyId);
  assert.ok(player);

  const situation = CurrentSituationBuilder.build({
    storyId,
    playerAction: 'I rush to the abandoned warehouse across town.',
    viewerActorId: player.actorId,
    worldRepo: worldRepository,
  });

  const movementIntent = {
    interactionMode: 'NAVIGATION' as const,
    speechIntent: false,
    movementIntent: true,
    observationIntent: false,
    locationTarget: {
      id: 'loc_warehouse',
      name: 'abandoned warehouse',
      source: 'EXPLICIT' as const,
    },
    explicitTargets: [],
    impliedTargets: [],
    confidence: 1,
    source: 'DETERMINISTIC' as const,
    originalText: 'I rush to the abandoned warehouse across town.',
  };

  const fakePlan = {
    turnId: 'turn_movement_fixture',
    objective: 'Narrate travel attempt.',
    immediateSteps: ['Depict journey start.'],
    informationToReveal: [],
    entitiesToReact: [],
    continuityRequirements: [],
    forbiddenAssumptions: ['Do not claim arrival.'],
    stateEffectsExpected: [],
    createdAt: 'Day 1 • Afternoon',
    expiresAfterNarration: true,
  };

  try {
    // 1. Uncommitted ActionResolution (no canonical location change committed)
    const uncommittedResolution = {
      resolutionId: 'res_uncommitted_1',
      resolutionMethod: 'DETERMINISTIC_RULES',
      outcomeTier: 'SUCCESS',
      actualEffect: 'You begin moving toward the destination.',
      physicalConsequences: [],
      playerVisibleConsequences: ['You head toward the warehouse.'],
      canonicalStateChanges: [], // No LOCATION or MOVEMENT changes
    } as any;

    // A candidate that hallucinates arrival must be REJECTED
    const hallucinatedArrivalCandidate = {
      narrative: ['You rush across town and arrive at the abandoned warehouse. Stepping inside through the rusted iron doors, you look around.'],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    };

    const reviewHallucination = SemanticNarrativeReview.review({
      intent: movementIntent,
      situation,
      plan: fakePlan,
      turnPackage: hallucinatedArrivalCandidate,
      actionResolution: uncommittedResolution,
    });

    assert.equal(reviewHallucination.decision, 'REJECT', 'Uncommitted arrival must be rejected');
    assert.ok(
      reviewHallucination.violations.some((v) => v.code === 'UNSUPPORTED_STATE_PROPOSAL' && v.severity === 'HIGH'),
      'Must emit UNSUPPORTED_STATE_PROPOSAL violation with HIGH severity'
    );

    // 2. A candidate that depicts the approach/travel without claiming arrival must be ACCEPTED
    const validApproachCandidate = {
      narrative: ['You step out into the rain toward the abandoned warehouse, heading down the cobblestone road as thunder rumbles in the distance.'],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    };

    const reviewApproach = SemanticNarrativeReview.review({
      intent: movementIntent,
      situation,
      plan: fakePlan,
      turnPackage: validApproachCandidate,
      actionResolution: uncommittedResolution,
    });

    assert.equal(reviewApproach.decision, 'ACCEPT', 'Depicting departure/approach without arrival must be accepted');

    // 3. When movement IS committed by the canonical engine, arrival narration is PERMITTED
    const committedResolution = {
      resolutionId: 'res_committed_1',
      resolutionMethod: 'DETERMINISTIC_RULES',
      outcomeTier: 'SUCCESS',
      actualEffect: 'Relocated to the abandoned warehouse.',
      physicalConsequences: [],
      playerVisibleConsequences: ['Arrived at the abandoned warehouse.'],
      canonicalStateChanges: [
        {
          kind: 'LOCATION',
          targetId: player.actorId,
          value: 'loc_warehouse',
          metadata: { source: 'GeographyGraph' },
        },
      ],
    } as any;

    const reviewCommitted = SemanticNarrativeReview.review({
      intent: movementIntent,
      situation,
      plan: fakePlan,
      turnPackage: hallucinatedArrivalCandidate,
      actionResolution: committedResolution,
    });

    assert.equal(reviewCommitted.decision, 'ACCEPT', 'Arrival narration must be accepted when movement was canonically committed');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});
