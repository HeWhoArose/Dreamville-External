import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository } from '../../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../../server/domain/currentSituation';
import { SemanticNarrativeReview } from '../../server/domain/semanticNarrativeReview';
import {
  EpistemicBoundaryEnforcer,
  extractEntityNameTokens,
  NON_DISTINCTIVE_NAME_TOKENS,
  COMMON_DICTIONARY_NAME_WORDS,
} from '../../server/domain/epistemicBoundary';

// ============================================================================
// SUITE 1: STRANGER NAMES WITH MULTIPLE DOTS & ABBREVIATIONS ("J.R.R. Tolkien")
// ============================================================================

test('CHALLENGE EDGE 1: Multi-dot abbreviation ("J.R.R. Tolkien") in Projection and Review', () => {
  const storyId = 'chall_dots_tolkien_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  worldRepository.saveEntityCard(storyId, {
    id: 'npc_tolkien',
    name: 'J.R.R. Tolkien',
    kind: 'character',
    classification: { role: 'scholar', profession: 'scholar' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look around the study.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    situation.availableInteractions = [
      {
        id: 'act_1',
        label: 'Inquire with J.R.R. Tolkien about the translation',
        action: 'talk',
        targetId: 'npc_tolkien',
        targetName: 'J.R.R. Tolkien',
        enabled: true,
      },
      {
        id: 'act_2',
        label: "Examine J.R.R. Tolkien's manuscript on the desk",
        action: 'inspect',
        targetId: 'npc_tolkien',
        targetName: 'J.R.R. Tolkien',
        enabled: true,
      },
      {
        id: 'act_3',
        label: 'Greet J.R.R. Tolkien, then sit down',
        action: 'greet',
        targetId: 'npc_tolkien',
        targetName: 'J.R.R. Tolkien',
        enabled: true,
      },
    ];

    situation.visibleEvents = [
      {
        id: 'ev_1',
        summary: 'J.R.R. Tolkien arranges his notes carefully.',
        type: 'observation',
      },
      {
        id: 'ev_2',
        summary: "The scholar (J.R.R. Tolkien) clears his throat.",
        type: 'observation',
      },
    ];

    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(situation);

    // Verify projection masking
    for (const act of safeSituation.availableInteractions) {
      assert.equal(
        act.label.includes('J.R.R. Tolkien'),
        false,
        `Interaction label must not leak J.R.R. Tolkien: "${act.label}"`
      );
      assert.equal(
        act.targetName,
        'a scholar',
        `Target name must be a scholar, got: "${act.targetName}"`
      );
    }

    // Check possessive masking in label
    assert.ok(
      safeSituation.availableInteractions[1].label.includes("a scholar's manuscript"),
      `Expected possessive label to be masked to "a scholar's manuscript", got "${safeSituation.availableInteractions[1].label}"`
    );

    // Check visibleEvents masking
    for (const ev of safeSituation.visibleEvents) {
      assert.equal(
        ev.summary.includes('J.R.R. Tolkien'),
        false,
        `Visible event summary must not leak J.R.R. Tolkien: "${ev.summary}"`
      );
    }

    const fakePlan: any = {
      turnId: 'turn_tolkien_review',
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

    // Review test: Full name leak
    const reviewFull = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I look around.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['J.R.R. Tolkien looks up from his translation.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewFull.decision, 'REJECT', 'Review must reject full name J.R.R. Tolkien');

    // Review test: Possessive leak
    const reviewPossessive = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I look around.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ["J.R.R. Tolkien's pipe rests on a stack of manuscripts."],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewPossessive.decision, 'REJECT', "Review must reject possessive J.R.R. Tolkien's");

    // Review test: Surname distinctive token leak ("Tolkien")
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
        originalText: 'I look around.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['Tolkien smiles thoughtfully and gestures toward the chair.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewSurname.decision, 'REJECT', 'Review must reject distinctive token Tolkien');

    // Review test: Name preceded and followed by punctuation / commas
    const reviewPunctuation = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I look around.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['"Good evening, J.R.R. Tolkien," came a soft greeting from the doorway.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewPunctuation.decision, 'REJECT', 'Review must reject name enclosed in quotes and commas');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 2: STRANGER NAMES WITH TRAILING COMMAS & POSSESSIVES ("Dr. A. Watson Jr.'s")
// ============================================================================

test('CHALLENGE EDGE 2: Trailing period + possessive ("Dr. A. Watson Jr.\'s") in Projection and Review', () => {
  const storyId = 'chall_watson_pos_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  worldRepository.saveEntityCard(storyId, {
    id: 'npc_watson_jr',
    name: 'Dr. A. Watson Jr.',
    kind: 'character',
    classification: { role: 'physician', profession: 'physician' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I check the medical cabinet.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    situation.availableInteractions = [
      {
        id: 'act_w1',
        label: "Borrow Dr. A. Watson Jr.'s stethoscope from the table",
        action: 'borrow',
        targetId: 'npc_watson_jr',
        targetName: 'Dr. A. Watson Jr.',
        enabled: true,
      },
      {
        id: 'act_w2',
        label: 'Dr. A. Watson Jr., please assist with this patient',
        action: 'request',
        targetId: 'npc_watson_jr',
        targetName: 'Dr. A. Watson Jr.',
        enabled: true,
      },
    ];

    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(situation);

    // Verify possessive label redaction
    assert.equal(
      safeSituation.availableInteractions[0].label.includes('Dr. A. Watson Jr.'),
      false,
      `Label must not leak Dr. A. Watson Jr.: "${safeSituation.availableInteractions[0].label}"`
    );
    assert.ok(
      safeSituation.availableInteractions[0].label.includes("a physician's stethoscope"),
      `Expected possessive label to redact cleanly to "a physician's stethoscope", got "${safeSituation.availableInteractions[0].label}"`
    );

    // Verify trailing comma label redaction
    assert.equal(
      safeSituation.availableInteractions[1].label.includes('Dr. A. Watson Jr.'),
      false,
      `Label must not leak Dr. A. Watson Jr.: "${safeSituation.availableInteractions[1].label}"`
    );
    assert.ok(
      safeSituation.availableInteractions[1].label.startsWith('a physician,'),
      `Expected label to start with "a physician,", got "${safeSituation.availableInteractions[1].label}"`
    );

    const fakePlan: any = {
      turnId: 'turn_watson_pos_review',
      objective: 'Check cabinet.',
      immediateSteps: [],
      informationToReveal: [],
      entitiesToReact: [],
      continuityRequirements: [],
      forbiddenAssumptions: [],
      stateEffectsExpected: [],
      createdAt: 'Day 1 • Afternoon',
      expiresAfterNarration: true,
    };

    // Review: possessive with trailing period
    const reviewPossessive = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I check the medical cabinet.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ["Dr. A. Watson Jr.'s clinical notes lie open beside the stethoscope."],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewPossessive.decision, 'REJECT', "Review must reject Dr. A. Watson Jr.'s");

    // Review: trailing comma after period
    const reviewComma = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I check the medical cabinet.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['Turning toward Dr. A. Watson Jr., the inspector asked for the ledger.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewComma.decision, 'REJECT', 'Review must reject Dr. A. Watson Jr., before comma');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 3: MULTI-WORD NAMES COMPOSED OF COMMON WORDS ("Summer Rose")
// ============================================================================

test('CHALLENGE EDGE 3: Multi-word common dictionary name ("Summer Rose") - False Positive vs Real Leak', () => {
  const storyId = 'chall_summer_rose_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  // Entity: Summer Rose (florist)
  worldRepository.saveEntityCard(storyId, {
    id: 'npc_summer_rose',
    name: 'Summer Rose',
    kind: 'character',
    classification: { role: 'florist', profession: 'florist' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I admire the garden boutique.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const tokens = extractEntityNameTokens(situation.nearbyEntities.find((e) => e.id === 'npc_summer_rose')!);
    assert.ok(tokens.compositeNames.includes('Summer Rose'), 'compositeNames must include Summer Rose');
    assert.ok(tokens.dictionaryTokens.includes('Summer'), 'dictionaryTokens must include Summer');
    assert.ok(tokens.dictionaryTokens.includes('Rose'), 'dictionaryTokens must include Rose');
    assert.equal(tokens.distinctiveTokens.length, 0, 'distinctiveTokens must be empty for Summer Rose');

    const fakePlan: any = {
      turnId: 'turn_sr_plan',
      objective: 'Admire flowers.',
      immediateSteps: [],
      informationToReveal: [],
      entitiesToReact: [],
      continuityRequirements: [],
      forbiddenAssumptions: [],
      stateEffectsExpected: [],
      createdAt: 'Day 1 • Afternoon',
      expiresAfterNarration: true,
    };

    // Subtest 3A: Ordinary prose with common words MUST NOT be falsely flagged
    const ordinaryProseCases = [
      'The flowers bloom in summer under the warm morning sun.',
      'A delicate wild rose caught your eye along the mossy stone path.',
      'The scent of summer blossoms filled the room with delicate rose petals.',
      'During early summer, petals scatter across the courtyard pavement.',
      'He held a deep red rose in his left hand while examining the vase.',
    ];

    for (const prose of ordinaryProseCases) {
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
          originalText: 'I admire the flowers.',
        },
        situation,
        plan: fakePlan,
        turnPackage: {
          narrative: [prose],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
      });

      const leakedViolations = review.violations.filter((v) =>
        v.message.includes('Summer Rose') || v.message.includes('the florist')
      );
      assert.equal(
        leakedViolations.length,
        0,
        `Prose "${prose}" must NOT trigger identity leak violations, but got: ${JSON.stringify(leakedViolations)}`
      );
      assert.equal(
        review.decision,
        'ACCEPT',
        `Prose "${prose}" must be accepted, but got: ${review.decision}`
      );
    }

    // Subtest 3B: Genuine identity leaks MUST be caught and rejected
    const leakCases = [
      {
        name: 'Full composite name leak',
        prose: 'Summer Rose stood silently behind the counter arranging lilies.',
      },
      {
        name: 'First name mid-sentence proper noun leak',
        prose: 'You decided to speak with Summer about the rare orchids.',
      },
      {
        name: 'Surname mid-sentence proper noun leak',
        prose: 'You handed the payment directly to Rose with a polite smile.',
      },
      {
        name: 'First name sentence-initial with animate action verb',
        prose: 'Summer smiles warmly and offers a sprig of lavender.',
      },
      {
        name: 'Surname with honorific title prefix',
        prose: 'Ms. Rose gestured toward the glass cabinet near the window.',
      },
    ];

    for (const { name, prose } of leakCases) {
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
          originalText: 'I admire the boutique.',
        },
        situation,
        plan: fakePlan,
        turnPackage: {
          narrative: [prose],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
      });

      assert.equal(
        review.decision,
        'REJECT',
        `Identity leak case "${name}" ("${prose}") must be REJECTED, but got: ${review.decision}`
      );
      assert.ok(
        review.violations.some((v) => v.message.includes('Summer Rose') && v.code === 'UNSUPPORTED_CLAIM'),
        `Identity leak case "${name}" must contain UNSUPPORTED_CLAIM violation mentioning Summer Rose`
      );
    }

    // Subtest 3C: Observe behavior on contiguous lowercase homograph phrase ("the scent of summer rose gently")
    const contiguousHomographReview = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I admire the boutique.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['The sweet scent of summer rose gently into the quiet night air.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    // Document that compositeNames regex is case-insensitive ('i' flag), matching contiguous "summer rose"
    assert.equal(contiguousHomographReview.decision, 'REJECT');
    assert.ok(
      contiguousHomographReview.violations.some((v) => v.message.includes('Summer Rose')),
      'Contiguous lowercase "summer rose" matches compositeNames regex due to case-insensitivity'
    );
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 4: MULTI-WORD NAMES COMPOSED OF COMMON WORDS ("Faith White")
// ============================================================================

test('CHALLENGE EDGE 4: Multi-word common dictionary name ("Faith White") - False Positive vs Real Leak', () => {
  const storyId = 'chall_faith_white_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  // Entity: Faith White (sister / archivist)
  worldRepository.saveEntityCard(storyId, {
    id: 'npc_faith_white',
    name: 'Faith White',
    kind: 'character',
    classification: { role: 'archivist', profession: 'archivist' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I inspect the chapel archives.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const fakePlan: any = {
      turnId: 'turn_fw_plan',
      objective: 'Inspect archives.',
      immediateSteps: [],
      informationToReveal: [],
      entitiesToReact: [],
      continuityRequirements: [],
      forbiddenAssumptions: [],
      stateEffectsExpected: [],
      createdAt: 'Day 1 • Afternoon',
      expiresAfterNarration: true,
    };

    // Subtest 4A: Ordinary prose with "faith" and "white" MUST NOT be flagged
    const ordinaryProseCases = [
      'He had great faith in humanity despite the tragic circumstances.',
      'A pristine white sheet covered the marble altar in the sanctuary.',
      'Faith alone could not solve the complex cipher carved into the desk.',
      'The investigator wore a white collar beneath his dark wool overcoat.',
      'She acted in good faith during all negotiations with the parish.',
    ];

    for (const prose of ordinaryProseCases) {
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
          originalText: 'I inspect the chapel archives.',
        },
        situation,
        plan: fakePlan,
        turnPackage: {
          narrative: [prose],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
      });

      const leakedViolations = review.violations.filter((v) =>
        v.message.includes('Faith White') || v.message.includes('the archivist')
      );
      assert.equal(
        leakedViolations.length,
        0,
        `Prose "${prose}" must NOT trigger identity leak violations, but got: ${JSON.stringify(leakedViolations)}`
      );
      assert.equal(
        review.decision,
        'ACCEPT',
        `Prose "${prose}" must be accepted, but got: ${review.decision}`
      );
    }

    // Subtest 4B: Genuine leaks MUST be caught
    const leakCases = [
      {
        name: 'Full name leak',
        prose: 'Faith White closed the illuminated manuscript with a gentle click.',
      },
      {
        name: 'First name sentence-initial animate verb',
        prose: 'Faith whispered quietly as she pointed toward the shelf.',
      },
      {
        name: 'First name mid-sentence proper noun',
        prose: 'You asked Faith for permission to examine the ancient register.',
      },
      {
        name: 'Surname mid-sentence proper noun',
        prose: 'You stepped past White and reached for the ledger on the shelf.',
      },
      {
        name: 'Honorific prefix with surname',
        prose: 'Sister White nodded with solemn grace.',
      },
    ];

    for (const { name, prose } of leakCases) {
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
          originalText: 'I inspect the chapel archives.',
        },
        situation,
        plan: fakePlan,
        turnPackage: {
          narrative: [prose],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
      });

      assert.equal(
        review.decision,
        'REJECT',
        `Identity leak case "${name}" ("${prose}") must be REJECTED, but got: ${review.decision}`
      );
      assert.ok(
        review.violations.some((v) => v.message.includes('Faith White') && v.code === 'UNSUPPORTED_CLAIM'),
        `Identity leak case "${name}" must contain UNSUPPORTED_CLAIM violation mentioning Faith White`
      );
    }
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 5: MIXED DISTINCTIVE + COMMON TOKENS ("Jack Hunter")
// ============================================================================

test('CHALLENGE EDGE 5: Distinctive first name + common dictionary surname ("Jack Hunter")', () => {
  const storyId = 'chall_jack_hunter_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  // Entity: Jack Hunter (guide)
  worldRepository.saveEntityCard(storyId, {
    id: 'npc_jack_hunter',
    name: 'Jack Hunter',
    kind: 'character',
    classification: { role: 'guide', profession: 'guide' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I check our provisions.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const tokens = extractEntityNameTokens(situation.nearbyEntities.find((e) => e.id === 'npc_jack_hunter')!);
    assert.ok(tokens.distinctiveTokens.includes('Jack'), 'Jack should be a distinctive token');
    assert.ok(tokens.dictionaryTokens.includes('Hunter'), 'Hunter should be a dictionary token');

    const fakePlan: any = {
      turnId: 'turn_jh_plan',
      objective: 'Check provisions.',
      immediateSteps: [],
      informationToReveal: [],
      entitiesToReact: [],
      continuityRequirements: [],
      forbiddenAssumptions: [],
      stateEffectsExpected: [],
      createdAt: 'Day 1 • Afternoon',
      expiresAfterNarration: true,
    };

    // Subtest 5A: Ordinary prose with common noun "hunter" MUST NOT be flagged
    const ordinaryProseCases = [
      'The lone hunter tracked the deer through the dense mountain forest.',
      'A skilled hunter always checks the wind direction before advancing.',
      'Old tales speak of a hunter who vanished into the misty pass.',
    ];

    for (const prose of ordinaryProseCases) {
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
          originalText: 'I check provisions.',
        },
        situation,
        plan: fakePlan,
        turnPackage: {
          narrative: [prose],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
      });

      const leakedViolations = review.violations.filter((v) =>
        v.message.includes('Jack Hunter') || v.message.includes('the guide')
      );
      assert.equal(
        leakedViolations.length,
        0,
        `Prose "${prose}" must NOT trigger identity leak violations, but got: ${JSON.stringify(leakedViolations)}`
      );
      assert.equal(review.decision, 'ACCEPT');
    }

    // Subtest 5B: Distinctive token "Jack" leak MUST be caught
    const reviewJack = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I check provisions.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['Jack checked the strap on the leather saddle.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewJack.decision, 'REJECT', 'Review must reject distinctive token Jack');

    // Subtest 5C: Common token "Hunter" leak with honorific MUST be caught
    const reviewHunterHonorific = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I check provisions.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['Mr. Hunter checked the map and nodded slowly.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });
    assert.equal(reviewHunterHonorific.decision, 'REJECT', 'Review must reject Mr. Hunter');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 6: SUBSTRING ANCHOR COLLISION RESISTANCE ("ross" vs "across", "jack" vs "jacket")
// ============================================================================

test('CHALLENGE EDGE 6: Epistemic boundary research sanitization avoids false-positive substring matches', () => {
  const storyId = 'chall_anchor_collision_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  // Stranger with distinctive name tokens: "Evangeline Ross" and "Jack Vance"
  worldRepository.saveEntityCard(storyId, {
    id: 'npc_ross',
    name: 'Evangeline Ross',
    kind: 'character',
    classification: { role: 'concierge', profession: 'concierge' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  worldRepository.saveEntityCard(storyId, {
    id: 'npc_vance',
    name: 'Jack Vance',
    kind: 'character',
    classification: { role: 'author', profession: 'author' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I investigate the lobby.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    // Research result containing legitimate words that have "ross" or "jack" as substrings:
    // "across", "jacket", "blackjack", "hijack"
    const researchResult: any = {
      query: 'lobby history',
      blocks: [
        {
          id: 'block_across',
          content: 'A velvet runner stretches across the polished hardwood floor.',
          kind: 'scene_detail',
          estimatedTokens: 12,
        },
        {
          id: 'block_jacket',
          content: 'An old leather jacket hangs on the coat rack near the entrance.',
          kind: 'scene_detail',
          estimatedTokens: 14,
        },
        {
          id: 'block_genuine_leak_ross',
          content: 'Evangeline Ross was seen entering the office at 3:00 PM.',
          kind: 'confidential_witness',
          estimatedTokens: 15,
        },
        {
          id: 'block_genuine_leak_jack',
          content: 'Jack Vance left his signature in the guestbook.',
          kind: 'confidential_witness',
          estimatedTokens: 12,
        },
      ],
      promptContext: '',
      totalTokens: 53,
    };

    const sanitized = EpistemicBoundaryEnforcer.sanitizeResearch(researchResult, situation);

    // Blocks 1 and 2 must be preserved (no false positive from "across" or "jacket")
    const preservedIds = sanitized.result.blocks.map((b) => b.id);
    assert.ok(
      preservedIds.includes('block_across'),
      '"across" must not collide with anchor "ross"'
    );
    assert.ok(
      preservedIds.includes('block_jacket'),
      '"jacket" must not collide with anchor "jack"'
    );

    // Blocks 3 and 4 must be stripped (genuine leaks)
    assert.ok(
      !preservedIds.includes('block_genuine_leak_ross'),
      'Block with "Evangeline Ross" must be stripped'
    );
    assert.ok(
      !preservedIds.includes('block_genuine_leak_jack'),
      'Block with "Jack Vance" must be stripped'
    );

    assert.equal(sanitized.result.blocks.length, 2, 'Exactly 2 safe blocks must remain');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

// ============================================================================
// SUITE 7: ACCENTED AND SPECIAL PUNCTUATION NAMES ("René François-Descartes")
// ============================================================================

test('CHALLENGE EDGE 7: Accented characters & complex hyphens in projection and review', () => {
  const storyId = 'chall_accented_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  worldRepository.saveEntityCard(storyId, {
    id: 'npc_descartes',
    name: 'René François-Descartes',
    kind: 'character',
    classification: { role: 'philosopher', profession: 'philosopher' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I observe the lecture hall.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    situation.availableInteractions = [
      {
        id: 'act_rene',
        label: 'Debate René François-Descartes regarding the treatise',
        action: 'debate',
        targetId: 'npc_descartes',
        targetName: 'René François-Descartes',
        enabled: true,
      },
    ];

    const safe = CurrentSituationBuilder.toNarratorSafeProjection(situation);
    assert.equal(
      safe.availableInteractions[0].label.includes('René François-Descartes'),
      false,
      `Label must not leak René François-Descartes: "${safe.availableInteractions[0].label}"`
    );
    assert.ok(
      safe.availableInteractions[0].label.includes('a philosopher'),
      `Label must redact to "a philosopher", got: "${safe.availableInteractions[0].label}"`
    );

    const fakePlan: any = {
      turnId: 'turn_rene_plan',
      objective: 'Observe.',
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
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I observe the lecture hall.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['René François-Descartes adjusts his quill and ponders the premise.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });

    assert.equal(review.decision, 'REJECT', 'Review must reject unintroduced accented name');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});
