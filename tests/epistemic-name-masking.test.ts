import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { SemanticNarrativeReview } from '../server/domain/semanticNarrativeReview';
import { EpistemicBoundaryEnforcer } from '../server/domain/epistemicBoundary';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';

test('F06: Epistemic masking & name-before-intro protection', () => {
  const storyId = 'epistemic_masking_test_' + Date.now();
  worldRepository.seedStory(storyId);

  const player = worldRepository.getPlayerLifecycle(storyId);
  assert.ok(player);
  const locationId = player.locationId;

  // 1. Seed an unintroduced NPC in the player's current location
  const npcId = 'npc_sylvia_crane';
  worldRepository.saveEntityCard(storyId, {
    id: npcId,
    name: 'Sylvia Crane',
    kind: 'character',
    classification: {
      role: 'receptionist',
      profession: 'receptionist',
    },
    social: {
      role: 'receptionist',
    },
    worldState: {
      locationId,
      presence: 'present',
      isAlive: true,
      currentActivity: 'typing at the front desk',
    },
    lifecycle: {
      status: 'ACTIVE',
    },
  } as any);

  try {
    // 2. Build situation before introduction
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I walk up to the counter and look around.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const nearbyNpc = situation.nearbyEntities.find((e) => e.id === npcId);
    assert.ok(nearbyNpc, 'NPC should be present in nearbyEntities');
    assert.equal(nearbyNpc.identityKnown, false, 'identityKnown must be false before introduction');
    assert.equal(nearbyNpc.displayName, 'the receptionist', 'unknownIdentityLabel must produce role descriptor');

    // 3. Test toNarratorSafeProjection
    situation.activeDialogue = {
      speakerId: npcId,
      speakerName: 'Sylvia Crane',
      text: 'May I help you?',
    };
    situation.availableInteractions = [
      {
        id: 'interact_talk',
        label: 'Talk to Sylvia Crane',
        action: 'speak',
        targetId: npcId,
        targetName: 'Sylvia Crane',
        enabled: true,
      },
    ];

    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(situation);
    const safeNpc = safeSituation.nearbyEntities.find((e) => e.id === npcId);
    assert.ok(safeNpc);
    assert.equal(safeNpc.name, 'the receptionist', 'toNarratorSafeProjection must overwrite name with displayName');
    assert.equal(safeSituation.activeDialogue?.speakerName, 'the receptionist', 'activeDialogue speakerName must be sanitized');
    assert.equal(safeSituation.availableInteractions[0].targetName, 'the receptionist', 'interaction targetName must be sanitized');

    // 4. Test buildNarrationPrompt sanitizes prompt context
    const promptResult = buildNarrationPrompt({
      situation,
      intent: {
        interactionMode: 'INTERACTION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: true,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I look at the receptionist.',
      },
      research: {
        blocks: [
          {
            id: 'block_lore_1',
            kind: 'lore',
            sourceType: 'world_canon',
            content: 'Sylvia Crane works as a receptionist at the front desk.',
            confidence: 1,
            estimatedTokens: 10,
          },
        ],
        promptContext: 'Sylvia Crane works as a receptionist.',
        totalTokens: 10,
        packet: {} as any,
      },
      plan: {
        turnId: 'turn_prompt_test',
        objective: 'Observe desk.',
        immediateSteps: [],
        informationToReveal: [],
        entitiesToReact: [],
        continuityRequirements: [],
        forbiddenAssumptions: [],
        stateEffectsExpected: [],
        createdAt: 'Day 1 • Afternoon',
        expiresAfterNarration: true,
      },
    });

    assert.ok(!promptResult.prompt.includes('Sylvia Crane'), 'Prompt text must not contain unintroduced NPC name');

    // 5. Test SemanticNarrativeReview rejects candidate mentioning unintroduced name
    const fakePlan = {
      turnId: 'turn_review_test',
      objective: 'Observe desk.',
      immediateSteps: [],
      informationToReveal: [],
      entitiesToReact: [],
      continuityRequirements: [],
      forbiddenAssumptions: [],
      stateEffectsExpected: [],
      createdAt: 'Day 1 • Afternoon',
      expiresAfterNarration: true,
    };

    const reviewLeaked = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'INTERACTION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I approach the counter.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['Sylvia Crane looks up from her typewriter and adjusts her glasses.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });

    assert.equal(reviewLeaked.decision, 'REJECT', 'Review must reject leaked name');
    assert.ok(
      reviewLeaked.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM' && v.message.includes('Sylvia Crane')),
      'Must emit UNSUPPORTED_CLAIM violation for unintroduced name'
    );

    // 6. Natural stranger description passes review
    const reviewSafe = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'INTERACTION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I approach the counter.',
      },
      situation,
      plan: fakePlan,
      turnPackage: {
        narrative: ['The receptionist looks up from her typewriter and adjusts her glasses.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });

    assert.equal(reviewSafe.decision, 'ACCEPT', 'Review must accept masked stranger label');

    // 7. Grant identity knowledge fact
    worldRepository.grantEntityIdentityKnowledge(
      storyId,
      player.actorId,
      npcId,
      'Sylvia Crane',
      'told'
    );

    // 8. Rebuild situation after introduction
    const situationAfter = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I speak with her.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const npcAfter = situationAfter.nearbyEntities.find((e) => e.id === npcId);
    assert.ok(npcAfter);
    assert.equal(npcAfter.identityKnown, true, 'identityKnown must now be true');
    assert.equal(npcAfter.displayName, 'Sylvia Crane', 'displayName must now be canonical name');

    // 9. Semantic review now permits canonical name
    const reviewPermitted = SemanticNarrativeReview.review({
      intent: {
        interactionMode: 'INTERACTION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I greet Sylvia.',
      },
      situation: situationAfter,
      plan: fakePlan,
      turnPackage: {
        narrative: ['Sylvia Crane offers a polite nod and sets her pen aside.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      },
    });

    assert.equal(reviewPermitted.decision, 'ACCEPT', 'Review must permit introduced NPC name');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

test('F06 Extension: Partial token name leaks on multi-word stranger names', () => {
  const storyId = 'f06_partial_token_verify_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  const npcId = 'npc_sylvia_crane';
  worldRepository.saveEntityCard(storyId, {
    id: npcId,
    name: 'Sylvia Crane',
    kind: 'character',
    classification: { role: 'receptionist', profession: 'receptionist' },
    social: { role: 'receptionist' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look around the lobby.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const fakePlan: any = {
      turnId: 'turn_token_test',
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

    // 1. First-name leak ("Sylvia") alone must REJECT
    const reviewFirst = SemanticNarrativeReview.review({
      intent: { interactionMode: 'PASSIVE_OBSERVATION', speechIntent: false, movementIntent: false, observationIntent: false, explicitTargets: [], impliedTargets: [], confidence: 1, source: 'DETERMINISTIC', originalText: 'I look around.' },
      situation,
      plan: fakePlan,
      turnPackage: { narrative: ['Sylvia smiles warmly from behind the reception desk.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] },
    });
    assert.equal(reviewFirst.decision, 'REJECT', 'Review must reject first-name leak "Sylvia"');
    assert.ok(reviewFirst.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM' && v.message.includes('Sylvia Crane')));

    // 2. Surname with title ("Ms. Crane") alone must REJECT
    const reviewSurnameTitle = SemanticNarrativeReview.review({
      intent: { interactionMode: 'PASSIVE_OBSERVATION', speechIntent: false, movementIntent: false, observationIntent: false, explicitTargets: [], impliedTargets: [], confidence: 1, source: 'DETERMINISTIC', originalText: 'I look around.' },
      situation,
      plan: fakePlan,
      turnPackage: { narrative: ['Ms. Crane looks up from her typewriter and adjusts her spectacles.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] },
    });
    assert.equal(reviewSurnameTitle.decision, 'REJECT', 'Review must reject surname leak "Ms. Crane"');

    // 3. Surname alone ("Crane") alone must REJECT
    const reviewSurnameBare = SemanticNarrativeReview.review({
      intent: { interactionMode: 'PASSIVE_OBSERVATION', speechIntent: false, movementIntent: false, observationIntent: false, explicitTargets: [], impliedTargets: [], confidence: 1, source: 'DETERMINISTIC', originalText: 'I look around.' },
      situation,
      plan: fakePlan,
      turnPackage: { narrative: ['Crane looks up from her typewriter and adjusts her spectacles.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] },
    });
    assert.equal(reviewSurnameBare.decision, 'REJECT', 'Review must reject bare surname leak "Crane"');

    // 4. Epistemic research sanitization on first-name token
    const research = EpistemicBoundaryEnforcer.sanitizeResearch(
      {
        blocks: [{ id: 'b1', kind: 'lore', sourceType: 'world_canon', content: 'Sylvia arrived early this morning.', confidence: 1, estimatedTokens: 10 }],
        promptContext: 'Sylvia arrived early.',
        totalTokens: 10,
        packet: {} as any,
      },
      situation
    );
    assert.equal(research.report.playerSafe, false, 'Research containing first-name token "Sylvia" must not be playerSafe');
    assert.equal(research.result.blocks.length, 0, 'Research block containing "Sylvia" must be removed');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

test('F06 Extension: Trailing period / abbreviation in names ("Dr. A. Watson Jr.")', () => {
  const storyId = 'f06_trailing_period_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  const npcId = 'npc_watson_jr';
  worldRepository.saveEntityCard(storyId, {
    id: npcId,
    name: 'Dr. A. Watson Jr.',
    kind: 'character',
    classification: { role: 'bartender', profession: 'bartender' },
    social: { role: 'bartender' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I sit at the bar.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    situation.availableInteractions = [
      { id: 'act_order', label: 'Order from Dr. A. Watson Jr.', action: 'talk', targetId: npcId, targetName: 'Dr. A. Watson Jr.', enabled: true },
    ];

    // Projection test
    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(situation);
    assert.ok(!safeSituation.availableInteractions[0].label.includes('Dr. A. Watson Jr.'), 'Interaction label must not leak Dr. A. Watson Jr.');
    assert.ok(safeSituation.availableInteractions[0].label.includes('the bartender'), 'Interaction label must use role descriptor');

    // Review test
    const fakePlan: any = { turnId: 'turn_watson', objective: 'Sit at bar.', immediateSteps: [], informationToReveal: [], entitiesToReact: [], continuityRequirements: [], forbiddenAssumptions: [], stateEffectsExpected: [], createdAt: 'Day 1 • Afternoon', expiresAfterNarration: true };
    const review = SemanticNarrativeReview.review({
      intent: { interactionMode: 'PASSIVE_OBSERVATION', speechIntent: false, movementIntent: false, observationIntent: false, explicitTargets: [], impliedTargets: [], confidence: 1, source: 'DETERMINISTIC', originalText: 'I sit at the bar.' },
      situation,
      plan: fakePlan,
      turnPackage: { narrative: ['Dr. A. Watson Jr. slides a glass across the mahogany bar.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] },
    });
    assert.equal(review.decision, 'REJECT', 'Review must reject unintroduced name Dr. A. Watson Jr.');
    assert.ok(review.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM' && v.message.includes('Dr. A. Watson Jr.')));
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});

test('F06 Extension: Common dictionary word collision boundary safeguards', () => {
  const storyId = 'f06_dict_boundary_' + Date.now();
  worldRepository.seedStory(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  const locationId = player.locationId;

  // Unintroduced stranger with dictionary-word surname "Alexander North"
  worldRepository.saveEntityCard(storyId, {
    id: 'npc_alexander_north',
    name: 'Alexander North',
    kind: 'character',
    classification: { role: 'sailor', profession: 'sailor' },
    social: { role: 'sailor' },
    worldState: { locationId, presence: 'present', isAlive: true },
    lifecycle: { status: 'ACTIVE' },
  } as any);

  try {
    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look around the harbor.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const fakePlan: any = { turnId: 'turn_north', objective: 'Look around.', immediateSteps: [], informationToReveal: [], entitiesToReact: [], continuityRequirements: [], forbiddenAssumptions: [], stateEffectsExpected: [], createdAt: 'Day 1 • Afternoon', expiresAfterNarration: true };

    // 1. Ordinary English dictionary usage of "north" must NOT be rejected
    const reviewDirection = SemanticNarrativeReview.review({
      intent: { interactionMode: 'PASSIVE_OBSERVATION', speechIntent: false, movementIntent: false, observationIntent: false, explicitTargets: [], impliedTargets: [], confidence: 1, source: 'DETERMINISTIC', originalText: 'I look around.' },
      situation,
      plan: fakePlan,
      turnPackage: { narrative: ['The cold wind blew in from the north across the darkened harbor waters.'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] },
    });
    assert.equal(reviewDirection.decision, 'ACCEPT', 'Ordinary directional usage of "north" must not trigger UNSUPPORTED_CLAIM');

    // 2. Substring safety: "across" containing "ross" must not be purged
    const sanitizedContext = EpistemicBoundaryEnforcer.sanitizeContext(
      'The detective stepped across the threshold and entered the hall.',
      situation
    );
    assert.equal(sanitizedContext.report.removedContextLineCount, 0, 'Substring "across" must not collide with anchor "ross"');
  } finally {
    worldRepository.deleteStoryRun(storyId);
  }
});
