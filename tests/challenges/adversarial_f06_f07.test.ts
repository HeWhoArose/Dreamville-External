import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository } from '../../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../../server/domain/currentSituation';
import {
  SemanticNarrativeReview,
  evaluateObservationGrounding,
} from '../../server/domain/semanticNarrativeReview';
import { MultiModelOrchestrator } from '../../server/domain/aiOrchestrator';

// ============================================================================
// SUITE 1: EPISTEMIC STRANGER MASKING (F06) - PUNCTUATION & FUZZING
// ============================================================================

test('F06 Fuzz 1A: Trailing period / abbreviation in names ("Dr. A. Watson Jr.") - Projection Leak', () => {
  const storyId = 'f06_fuzz_dots_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  worldRepository.saveEntityCard(storyId, {
    id: 'npc_dots',
    name: 'Dr. A. Watson Jr.',
    kind: 'character',
    classification: { role: 'bartender', profession: 'bartender' },
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
        id: 'act_order',
        label: 'Order from Dr. A. Watson Jr.',
        action: 'order',
        targetId: 'npc_dots',
        targetName: 'Dr. A. Watson Jr.',
        enabled: true,
      },
    ];

    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(situation);
    const sanitizedLabel = safeSituation.availableInteractions[0].label;

    console.log('[F06 Fuzz 1A] Resulting interaction label:', sanitizedLabel);
    // Observe whether \\b${name}\\b fails to redact when name ends with non-word character '.'
    const leaked = sanitizedLabel.includes('Dr. A. Watson Jr.');
    console.log('[F06 Fuzz 1A] Did interaction label leak Dr. A. Watson Jr.?:', leaked);
    assert.equal(leaked, false, 'Interaction label must not leak Dr. A. Watson Jr.');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

test('F06 Fuzz 1B: Trailing period / abbreviation in names ("Dr. A. Watson Jr.") - Semantic Review Leak', () => {
  const storyId = 'f06_fuzz_dots_review_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  worldRepository.saveEntityCard(storyId, {
    id: 'npc_dots',
    name: 'Dr. A. Watson Jr.',
    kind: 'character',
    classification: { role: 'bartender', profession: 'bartender' },
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

    const fakePlan: any = {
      turnId: 'turn_dots_review',
      objective: 'Look around.',
      immediateSteps: [],
      informationToReveal: [],
      entitiesToReact: [],
      continuityRequirements: [],
      forbiddenAssumptions: [],
      stateEffectsExpected: [],
      createdAt: 'Day 1 • Afternoon',
      expiresAfterNarration: true,
    };

    const reviewDots = SemanticNarrativeReview.review({
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
      plan: fakePlan,
      turnPackage: {
        narrative: ['Dr. A. Watson Jr. slides a glass across the mahogany bar.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });

    console.log('[F06 Fuzz 1B] Decision for "Dr. A. Watson Jr. slides a glass":', reviewDots.decision);
    console.log('[F06 Fuzz 1B] Violations:', reviewDots.violations.map((v) => `${v.code}: ${v.message}`));
    assert.equal(reviewDots.decision, 'REJECT', 'Review must reject unintroduced name Dr. A. Watson Jr.');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

test('F06 Fuzz 2: Hyphenated and apostrophe names ("Sylvia-Jane O\'Connor") in Projection and Review', () => {
  const storyId = 'f06_fuzz_hyphen_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  worldRepository.saveEntityCard(storyId, {
    id: 'npc_hyphen',
    name: "Sylvia-Jane O'Connor",
    kind: 'character',
    classification: { role: 'desk sergeant', profession: 'desk sergeant' },
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
        id: 'act_talk',
        label: "Question Sylvia-Jane O'Connor",
        action: 'talk',
        targetId: 'npc_hyphen',
        targetName: "Sylvia-Jane O'Connor",
        enabled: true,
      },
    ];

    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(situation);
    assert.ok(
      !safeSituation.availableInteractions[0].label.includes("Sylvia-Jane O'Connor"),
      "Label must not contain Sylvia-Jane O'Connor"
    );

    const fakePlan: any = {
      turnId: 'turn_hyphen_review',
      objective: 'Look around.',
      immediateSteps: [],
      informationToReveal: [],
      entitiesToReact: [],
      continuityRequirements: [],
      forbiddenAssumptions: [],
      stateEffectsExpected: [],
      createdAt: 'Day 1 • Afternoon',
      expiresAfterNarration: true,
    };

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
        originalText: 'I look around.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ["Sylvia-Jane O'Connor taps her foot with impatient annoyance."],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(review.decision, 'REJECT', "Review must reject unintroduced name Sylvia-Jane O'Connor");
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

test('F06 Fuzz 3: Mixed case names ("von Bismarck-McKENZIE") in Projection and Review', () => {
  const storyId = 'f06_fuzz_mixed_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  worldRepository.saveEntityCard(storyId, {
    id: 'npc_mixed',
    name: 'von Bismarck-McKENZIE',
    kind: 'character',
    classification: { role: 'curator', profession: 'curator' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look around.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    situation.availableInteractions = [
      {
        id: 'act_app',
        label: 'Approach von Bismarck-McKENZIE',
        action: 'approach',
        targetId: 'npc_mixed',
        targetName: 'von Bismarck-McKENZIE',
        enabled: true,
      },
    ];

    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(situation);
    assert.ok(
      !safeSituation.availableInteractions[0].label.includes('von Bismarck-McKENZIE'),
      'Label must not contain von Bismarck-McKENZIE'
    );

    const fakePlan: any = {
      turnId: 'turn_mixed_review',
      objective: 'Look around.',
      immediateSteps: [],
      informationToReveal: [],
      entitiesToReact: [],
      continuityRequirements: [],
      forbiddenAssumptions: [],
      stateEffectsExpected: [],
      createdAt: 'Day 1 • Afternoon',
      expiresAfterNarration: true,
    };

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
        originalText: 'I look around.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['von Bismarck-McKENZIE adjusts his spectacles beside the display case.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(review.decision, 'REJECT', 'Review must reject unintroduced name von Bismarck-McKENZIE');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

test('F06 Fuzz 4: Partial token overlap - Does mentioning "Sylvia" or "Crane" leak when canonical is "Sylvia Crane"?', () => {
  const storyId = 'f06_partial_token_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  // Stranger with canonical name "Sylvia Crane", no explicit aliases
  worldRepository.saveEntityCard(storyId, {
    id: 'npc_sylvia_crane',
    name: 'Sylvia Crane',
    kind: 'character',
    classification: { role: 'receptionist', profession: 'receptionist' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look at the desk.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const fakePlan: any = {
      turnId: 'turn_partial_review',
      objective: 'Look at desk.',
      immediateSteps: [],
      informationToReveal: [],
      entitiesToReact: [],
      continuityRequirements: [],
      forbiddenAssumptions: [],
      stateEffectsExpected: [],
      createdAt: 'Day 1 • Afternoon',
      expiresAfterNarration: true,
    };

    // Candidate 1: Mentioning first name only ("Sylvia")
    const reviewFirstName = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I look at the desk.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['Sylvia smiles warmly from behind the reception desk.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });

    console.log('[F06 Fuzz 4] Decision for first-name leak ("Sylvia"):', reviewFirstName.decision);
    console.log('[F06 Fuzz 4] First-name violations:', reviewFirstName.violations.map((v) => `${v.code}: ${v.message}`));

    // Candidate 2: Mentioning surname only ("Crane")
    const reviewSurname = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I look at the desk.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['Ms. Crane looks up from her typewriter and adjusts her spectacles.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });

    console.log('[F06 Fuzz 4] Decision for surname leak ("Crane"):', reviewSurname.decision);
    console.log('[F06 Fuzz 4] Surname violations:', reviewSurname.violations.map((v) => `${v.code}: ${v.message}`));
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

test('F06 Stress: Multi-stranger simultaneous scene (5 unintroduced strangers) & strict single unmasking', () => {
  const storyId = 'f06_multi_5_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  const strangers = [
    { id: 'npc_1', name: 'Althea Finch', role: 'receptionist', expectedLabel: 'the receptionist' },
    { id: 'npc_2', name: 'Barnaby Brooks', role: 'bartender', expectedLabel: 'the bartender' },
    { id: 'npc_3', name: 'Corvin Gray', role: 'librarian', expectedLabel: 'the librarian' },
    { id: 'npc_4', name: 'Dennis Hopper', role: 'doorman', expectedLabel: 'the doorman' },
    { id: 'npc_5', name: 'Evangeline Ross', role: 'concierge', expectedLabel: 'the concierge' },
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
    // 1. All 5 must be masked initially
    let sit = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I enter the grand hall.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    for (const s of strangers) {
      const e = sit.nearbyEntities.find((ent) => ent.id === s.id);
      assert.ok(e, `Entity ${s.id} must be in nearbyEntities`);
      assert.equal(e.identityKnown, false, `${s.name} must be identityKnown: false`);
      assert.equal(e.displayName, s.expectedLabel, `${s.name} displayName must be ${s.expectedLabel}`);
    }

    // 2. Unmask exactly ONE stranger (Corvin Gray)
    worldRepository.grantEntityIdentityKnowledge(storyId, player.actorId, 'npc_3', 'Corvin Gray', 'told');

    sit = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I greet Corvin.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    // 3. Verify Corvin Gray is unmasked, all other 4 remain strictly masked
    const c3 = sit.nearbyEntities.find((ent) => ent.id === 'npc_3')!;
    assert.equal(c3.identityKnown, true, 'Corvin Gray must now be identityKnown: true');
    assert.equal(c3.displayName, 'Corvin Gray');

    for (const s of strangers.filter((x) => x.id !== 'npc_3')) {
      const other = sit.nearbyEntities.find((ent) => ent.id === s.id)!;
      assert.equal(other.identityKnown, false, `${s.name} must remain masked`);
      assert.equal(other.displayName, s.expectedLabel);
    }
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 2: STRUCTURED OBSERVATION GROUNDING (F07) - ADVERSARIAL PHRASING
// ============================================================================

test('F07 Stress 1: Metaphorical sensory verbs with broad observation intent ("I looked upon my past mistakes")', () => {
  const storyId = 'f07_broad_obs_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;

  const situation = CurrentSituationBuilder.build({
    storyId,
    playerAction: 'I look around.',
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
    originalText: 'I look around.',
  };

  try {
    const metaphoricalProse = 'I looked upon my past mistakes with regret and sorrow as memories filled my mind.';
    const obsEval = evaluateObservationGrounding(metaphoricalProse, broadIntent, situation);
    console.log('[F07 Stress 1] Broad observation eval for metaphorical prose:');
    console.log('  valid:', obsEval.valid);
    console.log('  hasPerceptionBeat:', obsEval.hasPerceptionBeat);
    console.log('  hasAnchorGrounding:', obsEval.hasAnchorGrounding);
    console.log('  hasOutcomeOrLimitation:', obsEval.hasOutcomeOrLimitation);
    console.log('  reasons:', obsEval.reasons);

    const fakePlan: any = {
      turnId: 'turn_obs_broad_meta',
      objective: 'Look around.',
      immediateSteps: [],
      informationToReveal: [],
      entitiesToReact: [],
      continuityRequirements: [],
      forbiddenAssumptions: [],
      stateEffectsExpected: [],
      createdAt: 'Day 1 • Afternoon',
      expiresAfterNarration: true,
    };

    const review = SemanticNarrativeReview.review({
      intent: broadIntent,
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: [metaphoricalProse],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });

    console.log('[F07 Stress 1] Review decision for broad metaphorical prose:', review.decision);
    console.log('[F07 Stress 1] Review violations:', review.violations.map((v) => `${v.code}: ${v.message}`));
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 3: UNCOMMITTED MOVEMENT GUARD (F07) - ADVERSARIAL PHRASING
// ============================================================================

test('F07 Stress 2: Uncommitted movement with alternative arrival phrasings', () => {
  const storyId = 'f07_alt_move_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;

  const situation = CurrentSituationBuilder.build({
    storyId,
    playerAction: 'I sprint furiously toward the harbor warehouse across the river.',
    viewerActorId: player.actorId,
    worldRepo: worldRepository,
  });

  const movementIntent = {
    interactionMode: 'NAVIGATION' as const,
    speechIntent: false,
    movementIntent: true,
    observationIntent: false,
    locationTarget: {
      id: 'loc_harbor_warehouse',
      name: 'harbor warehouse across the river',
      source: 'EXPLICIT' as const,
    },
    explicitTargets: [],
    impliedTargets: [],
    confidence: 1,
    source: 'DETERMINISTIC' as const,
    originalText: 'I sprint furiously toward the harbor warehouse across the river.',
  };

  const fakePlan: any = {
    turnId: 'turn_move_alt',
    objective: 'Movement attempt.',
    immediateSteps: ['Begin sprint.'],
    informationToReveal: [],
    entitiesToReact: [],
    continuityRequirements: [],
    forbiddenAssumptions: ['Do not claim arrival.'],
    stateEffectsExpected: [],
    createdAt: 'Day 1 • Afternoon',
    expiresAfterNarration: true,
  };

  const uncommittedResolution = {
    resolutionId: 'res_failed_movement',
    resolutionMethod: 'DETERMINISTIC_RULES',
    outcomeTier: 'PARTIAL_SUCCESS',
    actualEffect: 'You run toward the harbor.',
    physicalConsequences: [],
    playerVisibleConsequences: ['You sprint along the river bank.'],
    canonicalStateChanges: [], // Uncommitted
  } as any;

  try {
    const testPhrases = [
      { name: 'Standard "arrive at"', prose: 'You arrive at the harbor warehouse across the river.' },
      { name: 'Standard "reach"', prose: 'You reach the harbor warehouse across the river.' },
      { name: 'Standard "step into"', prose: 'You step into the harbor warehouse across the river.' },
      { name: 'Alternative "slip into"', prose: 'You slip into the harbor warehouse across the river through the back gate.' },
      { name: 'Alternative "find yourself inside"', prose: 'You find yourself inside the harbor warehouse across the river.' },
      { name: 'Alternative "make it to"', prose: 'You make it to the harbor warehouse across the river exhausted.' },
    ];

    for (const tp of testPhrases) {
      const rev = SemanticNarrativeReview.review({
        intent: movementIntent,
        situation,
        plan: fakePlan,
        turnPackage: {
          narrative: [tp.prose],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
        actionResolution: uncommittedResolution,
      });

      const hasUnsupportedStateProposal = rev.violations.some((v) => v.code === 'UNSUPPORTED_STATE_PROPOSAL');
      console.log(`[F07 Stress 2] ${tp.name} -> Decision: ${rev.decision}, UNSUPPORTED_STATE_PROPOSAL: ${hasUnsupportedStateProposal}`);
    }
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 4: CONTRACTION STRESS IN TEMPORAL CONTINUITY (F07)
// ============================================================================

test('F07 Stress 3: Heavy contraction density in temporal continuity validation', () => {
  const storyId = 'f07_contractions_' + Date.now();
  worldRepository.seedStory(storyId);
  const orchestrator = new MultiModelOrchestrator(worldRepository);
  const clock = worldRepository.getWorldClock(storyId);

  clock.importState({
    ...clock.exportState(),
    currentDayPhase: 'Afternoon',
    timestamp: { day: 1, hour: 14, minute: 30 },
  });

  try {
    const heavyContractions =
      "It's what couldn't, didn't, haven't, wasn't, shouldn't, wouldn't have been said if they'd known we're here, you're ready, and I'm listening to what isn't there.";
    const result1 = (orchestrator as any).validateNarrativeTemporalContinuity(
      heavyContractions,
      worldRepository,
      storyId
    );
    console.log('[F07 Stress 3] Heavy contractions valid:', result1.valid);
    assert.equal(result1.valid, true);

    const contractionWithContradiction =
      "It's true that he didn't believe it, but sunrise broke across the sky nonetheless.";
    const result2 = (orchestrator as any).validateNarrativeTemporalContinuity(
      contractionWithContradiction,
      worldRepository,
      storyId
    );
    console.log('[F07 Stress 3] Contradiction caught with contractions:', !result2.valid);
    assert.equal(result2.valid, false);
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});
