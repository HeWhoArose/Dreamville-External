import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository } from '../../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../../server/domain/currentSituation';
import {
  SemanticNarrativeReview,
  evaluateObservationGrounding,
} from '../../server/domain/semanticNarrativeReview';

function createFakePlan(objective = 'Test objective'): any {
  return {
    turnId: 'turn_' + Date.now(),
    objective,
    immediateSteps: [],
    informationToReveal: [],
    entitiesToReact: [],
    continuityRequirements: [],
    forbiddenAssumptions: [],
    stateEffectsExpected: [],
    createdAt: 'Day 1 • Afternoon',
    expiresAfterNarration: true,
  };
}

// ============================================================================
// SUITE 1: ADVERSARIAL VARIATIONS OF UNINTRODUCED STRANGER NAMES
// ============================================================================

test('Adversarial 1A: Honorifics with dots and initials ("Prof. H. Higgins")', () => {
  const storyId = 'adv_stranger_prof_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  worldRepository.saveEntityCard(storyId, {
    id: 'npc_prof_higgins',
    name: 'Prof. H. Higgins',
    kind: 'character',
    classification: { role: 'professor', profession: 'professor' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look around the room.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    situation.availableInteractions = [
      {
        id: 'act_consult',
        label: 'Consult with Prof. H. Higgins',
        action: 'consult',
        targetId: 'npc_prof_higgins',
        targetName: 'Prof. H. Higgins',
        enabled: true,
      },
    ];

    // 1. Check Narrator Safe Projection
    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(situation);
    const sanitizedLabel = safeSituation.availableInteractions[0].label;
    assert.equal(
      sanitizedLabel.includes('Prof. H. Higgins'),
      false,
      'Projection label must not contain "Prof. H. Higgins"'
    );
    assert.equal(
      sanitizedLabel.includes('Higgins'),
      false,
      'Projection label must not contain "Higgins"'
    );
    assert.ok(
      sanitizedLabel.toLowerCase().includes('professor'),
      'Projection label must contain role "professor"'
    );

    // 2. Check Semantic Narrative Review with full name
    const reviewFullName = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: true,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I look around.',
      },
      situation,
      plan: createFakePlan('Look around.'),
      turnPackage: {
        narrative: ['Prof. H. Higgins adjusts his spectacles beside the chalkboard.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewFullName.decision, 'REJECT');
    assert.ok(
      reviewFullName.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM' && v.message.includes('Prof. H. Higgins')),
      'Review must reject full name Prof. H. Higgins'
    );

    // 3. Check Semantic Narrative Review with surname token only
    const reviewSurnameOnly = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: true,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I look around.',
      },
      situation,
      plan: createFakePlan('Look around.'),
      turnPackage: {
        narrative: ['Higgins clears his throat impatiently from across the desk.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewSurnameOnly.decision, 'REJECT');
    assert.ok(
      reviewSurnameOnly.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'),
      'Review must reject surname token Higgins'
    );
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

test('Adversarial 1B: Single-word nickname ("Bones")', () => {
  const storyId = 'adv_stranger_bones_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  worldRepository.saveEntityCard(storyId, {
    id: 'npc_bones',
    name: 'Bones',
    kind: 'character',
    classification: { role: 'informant', profession: 'informant' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I observe the room.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    situation.availableInteractions = [
      {
        id: 'act_question',
        label: 'Question Bones about the docks',
        action: 'question',
        targetId: 'npc_bones',
        targetName: 'Bones',
        enabled: true,
      },
    ];

    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(situation);
    const sanitizedLabel = safeSituation.availableInteractions[0].label;
    assert.equal(sanitizedLabel.includes('Bones'), false);
    assert.ok(sanitizedLabel.toLowerCase().includes('informant'));

    const review = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: true,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I observe the room.',
      },
      situation,
      plan: createFakePlan(),
      turnPackage: {
        narrative: ['Bones glances sideways nervously while shuffling a pack of cards.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(review.decision, 'REJECT');
    assert.ok(
      review.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM' && v.message.includes('Bones')),
      'Review must reject single-word nickname Bones'
    );
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

test('Adversarial 1C: Hyphenated first name ("Mary-Anne")', () => {
  const storyId = 'adv_stranger_hyphen_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  worldRepository.saveEntityCard(storyId, {
    id: 'npc_mary_anne',
    name: 'Mary-Anne',
    kind: 'character',
    classification: { role: 'witness', profession: 'witness' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look at the witness.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    situation.availableInteractions = [
      {
        id: 'act_speak',
        label: 'Speak to Mary-Anne',
        action: 'talk',
        targetId: 'npc_mary_anne',
        targetName: 'Mary-Anne',
        enabled: true,
      },
    ];

    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(situation);
    assert.equal(safeSituation.availableInteractions[0].label.includes('Mary-Anne'), false);
    assert.ok(safeSituation.availableInteractions[0].label.toLowerCase().includes('witness'));

    // Review with full hyphenated name
    const reviewFull = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: true,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I look at the witness.',
      },
      situation,
      plan: createFakePlan(),
      turnPackage: {
        narrative: ['Mary-Anne wipes a tear from her cheek and turns away.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewFull.decision, 'REJECT');
    assert.ok(reviewFull.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'));

    // Review with sub-token ("Anne")
    const reviewSubToken = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: true,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I look at the witness.',
      },
      situation,
      plan: createFakePlan(),
      turnPackage: {
        narrative: ['Anne stares out the rain-streaked window in silence.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewSubToken.decision, 'REJECT');
    assert.ok(reviewSubToken.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'));
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 2: BROAD OBSERVATION REQUESTS WITH POETIC/INTROSPECTIVE PROSE
// ============================================================================

test('Adversarial 2: Broad observation requests with poetic/introspective prose must be rejected with MISSING_OBSERVATION', () => {
  const storyId = 'adv_obs_poetic_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;

  const situation = CurrentSituationBuilder.build({
    storyId,
    playerAction: 'I look around the room.',
    viewerActorId: player.actorId,
    worldRepo: worldRepository,
  });

  const broadIntent = {
    interactionMode: 'PASSIVE_OBSERVATION' as const,
    speechIntent: false,
    movementIntent: false,
    observationIntent: true,
    explicitTargets: [],
    impliedTargets: [],
    confidence: 1,
    source: 'DETERMINISTIC' as const,
    originalText: 'I look around the room.',
  };

  const poeticSamples = [
    {
      name: 'Regret and memories',
      prose: 'I looked upon my past mistakes with regret and sorrow as memories filled my mind.',
    },
    {
      name: 'Soul melancholy',
      prose: 'A profound melancholy settles in the soul as the weight of bygone years crushes the spirit.',
    },
    {
      name: 'Abstract longing',
      prose: 'My eyes dwell upon the abstract longing of forgotten dreams and distant youth.',
    },
    {
      name: 'Conscience listening',
      prose: 'You listen closely to the whispers of your conscience, seeking answers within your own beating heart.',
    },
  ];

  try {
    for (const sample of poeticSamples) {
      const obsEval = evaluateObservationGrounding(sample.prose, broadIntent, situation);
      assert.equal(
        obsEval.valid,
        false,
        `evaluateObservationGrounding must mark "${sample.name}" as invalid`
      );

      const review = SemanticNarrativeReview.review({
        intent: broadIntent,
        situation,
        plan: createFakePlan('Look around.'),
        turnPackage: {
          narrative: [sample.prose],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
      });

      const missingObs = review.violations.some((v) => v.code === 'MISSING_OBSERVATION');
      assert.ok(
        missingObs,
        `Review must generate MISSING_OBSERVATION for "${sample.name}". Violations: ${review.violations.map((v) => v.code).join(', ')}`
      );
      assert.notEqual(review.decision, 'ACCEPT', `Review decision for "${sample.name}" must not be ACCEPT`);
    }

    // Grounded broad observation SHOULD pass observation evaluation
    const groundedObservation = 'You survey the whispering orrery, taking in the instrument bench and bronze armature resting in the silence.';
    const validObsEval = evaluateObservationGrounding(groundedObservation, broadIntent, situation);
    assert.equal(validObsEval.valid, true, 'Grounded broad observation must pass evaluation');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 3: UNCOMMITTED MOVEMENT ARRIVAL PHRASES
// ============================================================================

test('Adversarial 3: Uncommitted movement arrival phrases must trigger UNSUPPORTED_STATE_PROPOSAL', () => {
  const storyId = 'adv_uncommitted_arrival_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;

  const situation = CurrentSituationBuilder.build({
    storyId,
    playerAction: 'I run towards the docks district.',
    viewerActorId: player.actorId,
    worldRepo: worldRepository,
  });

  const movementIntent = {
    interactionMode: 'NAVIGATION' as const,
    speechIntent: false,
    movementIntent: true,
    observationIntent: false,
    locationTarget: {
      id: 'loc_docks',
      name: 'docks district',
      source: 'EXPLICIT' as const,
    },
    explicitTargets: [],
    impliedTargets: [],
    confidence: 1,
    source: 'DETERMINISTIC' as const,
    originalText: 'I run towards the docks district.',
  };

  const fakePlan = createFakePlan('Run towards docks');

  // Simulation resolution has NO canonical movement committed
  const uncommittedResolution = {
    resolutionId: 'res_uncommitted_run',
    resolutionMethod: 'DETERMINISTIC_RULES',
    outcomeTier: 'PARTIAL_SUCCESS',
    actualEffect: 'You start running toward the docks district.',
    physicalConsequences: [],
    playerVisibleConsequences: ['You sprint through the misty alleys.'],
    canonicalStateChanges: [], // Empty!
  } as any;

  const arrivalPhrases = [
    { label: 'slip into', prose: 'You slip into the docks district quietly through a back alley.' },
    { label: 'find yourself inside', prose: 'You find yourself inside the docks district surrounded by salt air.' },
    { label: 'make it to', prose: 'You make it to the docks district after a grueling sprint.' },
    { label: 'step inside', prose: 'You step inside the docks district before the rain intensifies.' },
    { label: 'settle in', prose: 'You settle in the docks district under a rusted corrugated awning.' },
  ];

  try {
    for (const phrase of arrivalPhrases) {
      const rev = SemanticNarrativeReview.review({
        intent: movementIntent,
        situation,
        plan: fakePlan,
        turnPackage: {
          narrative: [phrase.prose],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
        actionResolution: uncommittedResolution,
      });

      const hasViolation = rev.violations.some((v) => v.code === 'UNSUPPORTED_STATE_PROPOSAL');
      assert.ok(
        hasViolation,
        `Phrase "${phrase.label}" must trigger UNSUPPORTED_STATE_PROPOSAL. Decision: ${rev.decision}`
      );
      assert.equal(rev.decision, 'REJECT');
    }

    // Non-arrival traveling prose should NOT trigger UNSUPPORTED_STATE_PROPOSAL
    const validTravelingProse = 'You begin running towards the docks district, your boots splashing through street puddles.';
    const validRev = SemanticNarrativeReview.review({
      intent: movementIntent,
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: [validTravelingProse],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
      actionResolution: uncommittedResolution,
    });
    const falsePositive = validRev.violations.some((v) => v.code === 'UNSUPPORTED_STATE_PROPOSAL');
    assert.equal(
      falsePositive,
      false,
      'Valid traveling prose without arrival claim must NOT trigger UNSUPPORTED_STATE_PROPOSAL'
    );
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 4: ORDINARY DICTIONARY WORDS DO NOT CAUSE FALSE POSITIVES
// ============================================================================

test('Adversarial 4: Ordinary dictionary words in descriptive text do NOT cause false positive rejections', () => {
  const storyId = 'adv_dict_words_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  // Seed multiple strangers whose names contain common dictionary words
  const strangers = [
    { id: 'npc_north', name: 'Oliver North', role: 'guard', expectedLabel: 'the guard' },
    { id: 'npc_faith', name: 'Faith Miller', role: 'clerk', expectedLabel: 'the clerk' },
    { id: 'npc_gray', name: 'Corvin Gray', role: 'librarian', expectedLabel: 'the librarian' },
    { id: 'npc_hope', name: 'Rose Hope', role: 'nurse', expectedLabel: 'the nurse' },
  ];

  for (const s of strangers) {
    worldRepository.saveEntityCard(storyId, {
      id: s.id,
      name: s.name,
      kind: 'character',
      classification: { role: s.role, profession: s.role },
      worldState: { locationId, presence: 'present', isAlive: true },
      lifecycle: { status: 'ACTIVE' },
    } as any);
  }

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I observe the surroundings.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const fakePlan = createFakePlan();

    // 1. Ordinary English sentences with lowercase dictionary words
    const ordinarySentences = [
      { word: 'north', text: 'The cold north wind howled down the street outside the window.' },
      { word: 'faith', text: "Ren had lost faith in the department's promises long ago." },
      { word: 'gray', text: 'A gray overcast sky threatened heavy rain over the office.' },
      { word: 'hope', text: 'There was little hope left as the minutes ticked away quietly.' },
      { word: 'rose', text: 'A delicate rose petal drifted onto the damp windowsill.' },
      { word: 'gray (initial non-action)', text: 'Gray clouds covered the sky from east to west.' },
      { word: 'faith (initial non-action)', text: 'Faith was hard to come by in these dark times.' },
    ];

    for (const item of ordinarySentences) {
      const review = SemanticNarrativeReview.review({
        intent: {
          interactionMode: 'PASSIVE_OBSERVATION',
          speechIntent: false,
          movementIntent: false,
          observationIntent: false,
          explicitTargets: [],
          impliedTargets: [],
          confidence: 1,
          source: 'DETERMINISTIC',
          originalText: 'I observe the surroundings.',
        },
        situation,
        plan: fakePlan,
        turnPackage: {
          narrative: [item.text],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
      });

      const leakedClaims = review.violations.filter((v) => v.code === 'UNSUPPORTED_CLAIM');
      assert.equal(
        leakedClaims.length,
        0,
        `Ordinary usage of "${item.word}" in "${item.text}" must NOT trigger UNSUPPORTED_CLAIM. Violations: ${leakedClaims.map((v) => v.message).join('; ')}`
      );
    }

    // 2. TRUE POSITIVE DETECTION: Proper noun usage or animate actions MUST be rejected
    const truePositiveCases = [
      { name: 'Officer North', text: 'Officer North stood firmly blocking the doorway.' },
      { name: 'Faith (mid-sentence capitalized)', text: 'I spoke with Faith at length about the incident.' },
      { name: 'Gray (initial animate action)', text: 'Gray smiled faintly from behind the counter.' },
      { name: 'Hope (initial animate action)', text: 'Hope nodded in agreement and adjusted her cap.' },
    ];

    for (const tc of truePositiveCases) {
      const review = SemanticNarrativeReview.review({
        intent: {
          interactionMode: 'PASSIVE_OBSERVATION',
          speechIntent: false,
          movementIntent: false,
          observationIntent: false,
          explicitTargets: [],
          impliedTargets: [],
          confidence: 1,
          source: 'DETERMINISTIC',
          originalText: 'I observe the surroundings.',
        },
        situation,
        plan: fakePlan,
        turnPackage: {
          narrative: [tc.text],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
      });

      const leakedClaims = review.violations.filter((v) => v.code === 'UNSUPPORTED_CLAIM');
      assert.ok(
        leakedClaims.length > 0,
        `Proper noun usage in "${tc.text}" MUST trigger UNSUPPORTED_CLAIM for unintroduced NPC.`
      );
      assert.equal(review.decision, 'REJECT');
    }
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});
