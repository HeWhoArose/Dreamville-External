import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository, InMemoryWorldRepository } from '../../server/repositories/worldRepository';
import { CurrentSituationBuilder, type CurrentSituation } from '../../server/domain/currentSituation';
import {
  SemanticNarrativeReview,
  evaluateObservationGrounding,
} from '../../server/domain/semanticNarrativeReview';
import { AffordancePlausibilityEngine } from '../../server/domain/affordancePlausibilityEngine';
import { SceneInteractionAuthority } from '../../server/domain/sceneInteractionAuthority';
import { CanonicalCommandEngine } from '../../server/domain/canonicalCommandEngine';
import { WorldDirectorPreparationService } from '../../server/services/worldDirectorPreparationService';
import { extractInvestigationSeedFromPremise } from '../../server/domain/worldDirectorPreparationContract';
import { seedE2eStory } from '../e2e-test-helper';
import type { LocationSceneObject } from '../../server/domain/types';
import type { PlayerIntent } from '../../server/domain/playerIntentInterpreter';

function createPlan(objective = 'Adversarial grounding test'): any {
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

function createIntent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
  return {
    action: 'observe',
    goal: 'observe',
    interactionMode: 'PASSIVE_OBSERVATION',
    speechIntent: false,
    movementIntent: false,
    observationIntent: true,
    informationGoal: undefined,
    explicitTargets: [],
    impliedTargets: [],
    confidence: 0.95,
    source: 'DETERMINISTIC',
    originalText: 'I look around the room.',
    ...overrides,
  };
}

function createPkg(narrative: string, stateChanges: any[] = []): any {
  return {
    narrative: [narrative],
    dialogue: [],
    events: [],
    stateChanges,
    memoryCandidates: [],
    audioCues: [],
  };
}

// ============================================================================
// SUITE 1: SEMANTIC REVIEW GROUNDING VS MUNDANE AFFORDANCES VS INVENTED PROPS
// ============================================================================

describe('Adversarial Suite 1: Semantic Grounding & Affordance Boundaries', () => {
  it('accepts archetype-matched mundane affordances in WORKPLACE without pre-authored props', () => {
    const storyId = 'adv_affordance_workplace_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const graph = worldRepository.getGeographyGraph(storyId);
    const locId = 'loc_office_' + Date.now();

    graph.addNode({
      id: locId,
      name: 'Private Detective Office',
      description: 'A quiet second-story detective office.',
      archetype: 'WORKPLACE' as any,
      sceneObjects: [], // Intentionally empty of props
    } as any);

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look around the office.',
      viewerActorId: player.actorId,
      locationIdOverride: locId,
      worldRepo: worldRepository,
    });

    const narration = 'You observe the quiet room. A sturdy wooden desk stands beside the window, and an office chair rests in the afternoon light.';
    const review = SemanticNarrativeReview.review({
      intent: createIntent(),
      situation,
      plan: createPlan(),
      turnPackage: createPkg(narration),
    });

    assert.equal(review.decision, 'ACCEPT', `Expected ACCEPT for workplace affordances but got ${review.decision}: ${JSON.stringify(review.violations)}`);
    assert.equal(review.unsupportedClaims.length, 0);
  });

  it('accepts archetype-matched mundane affordances in PARK without pre-authored props', () => {
    const storyId = 'adv_affordance_park_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const graph = worldRepository.getGeographyGraph(storyId);
    const locId = 'loc_park_' + Date.now();

    graph.addNode({
      id: locId,
      name: 'Municipal Park Gardens',
      description: 'An open municipal park with walking paths.',
      archetype: 'PARK' as any,
      sceneObjects: [],
    } as any);

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I scan the grounds.',
      viewerActorId: player.actorId,
      locationIdOverride: locId,
      worldRepo: worldRepository,
    });

    const narration = 'You look across the grounds. A weathered wooden bench sits beside the gravel path, and a dry fallen branch rests near the tree.';
    const review = SemanticNarrativeReview.review({
      intent: createIntent({ originalText: 'I scan the park grounds.' }),
      situation,
      plan: createPlan(),
      turnPackage: createPkg(narration),
    });

    assert.equal(review.decision, 'ACCEPT', `Expected ACCEPT for park affordances but got ${review.decision}: ${JSON.stringify(review.violations)}`);
  });

  it('accepts archetype-matched mundane affordances in URBAN_DISTRICT without pre-authored props', () => {
    const storyId = 'adv_affordance_street_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const graph = worldRepository.getGeographyGraph(storyId);
    const locId = 'loc_street_' + Date.now();

    graph.addNode({
      id: locId,
      name: 'Central Avenue',
      description: 'A bustling commercial thoroughfare.',
      archetype: 'URBAN_DISTRICT' as any,
      sceneObjects: [],
    } as any);

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I inspect the street.',
      viewerActorId: player.actorId,
      locationIdOverride: locId,
      worldRepo: worldRepository,
    });

    const narration = 'You observe the street. A yellow taxi waits beside the stone curb, and an iron street lamp stands near the pavement.';
    const review = SemanticNarrativeReview.review({
      intent: createIntent({ originalText: 'I inspect the street.' }),
      situation,
      plan: createPlan(),
      turnPackage: createPkg(narration),
    });

    assert.equal(review.decision, 'ACCEPT', `Expected ACCEPT for urban street affordances but got ${review.decision}: ${JSON.stringify(review.violations)}`);
  });

  it('strictly rejects plot-critical denylisted items in observation narration even in matching archetypes', () => {
    const storyId = 'adv_denylist_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const graph = worldRepository.getGeographyGraph(storyId);
    const locId = 'loc_office_deny_' + Date.now();

    graph.addNode({
      id: locId,
      name: 'Detective Office',
      description: 'An ordinary workplace office.',
      archetype: 'WORKPLACE' as any,
      sceneObjects: [],
    } as any);

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look around the desk.',
      viewerActorId: player.actorId,
      locationIdOverride: locId,
      worldRepo: worldRepository,
    });

    const denylistedNarrations = [
      { item: 'revolver', text: 'You observe the desk where a loaded revolver rests beside the papers.' },
      { item: 'brass key', text: 'You glance across the table where a brass key lies in plain sight.' },
      { item: 'dead body', text: 'You look toward the corner where a dead body lies on the floor.' },
      { item: 'locked safe', text: 'You inspect the wall where a locked safe sits within the alcove.' },
      { item: 'laser rifle', text: 'You look toward the cabinet where a high-tech laser rifle leans against the side.' },
      { item: 'ancient talisman', text: 'You look toward the hook where an ancient talisman hangs beside the window.' },
    ];

    for (const { item, text } of denylistedNarrations) {
      const review = SemanticNarrativeReview.review({
        intent: createIntent({ originalText: 'I look around.' }),
        situation,
        plan: createPlan(),
        turnPackage: createPkg(text),
      });

      assert.equal(review.decision, 'REJECT', `Expected REJECT for plot-critical item '${item}', but got ${review.decision}: ${JSON.stringify(review.violations)}`);
      assert.ok(
        review.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'),
        `Expected UNSUPPORTED_CLAIM for '${item}', violations: ${JSON.stringify(review.violations)}`,
      );
    }
  });

  it('strictly rejects archetype-mismatched mundane props in observation narration', () => {
    const storyId = 'adv_mismatch_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const graph = worldRepository.getGeographyGraph(storyId);
    const locId = 'loc_office_mismatch_' + Date.now();

    graph.addNode({
      id: locId,
      name: 'Detective Office',
      description: 'An ordinary workplace office.',
      archetype: 'WORKPLACE' as any,
      sceneObjects: [],
    } as any);

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look around.',
      viewerActorId: player.actorId,
      locationIdOverride: locId,
      worldRepo: worldRepository,
    });

    // Mooring bollard belongs to HARBOR, sacred altar belongs to SHRINE, neither belongs to WORKPLACE
    const mismatchedNarrations = [
      'You look across the office where a heavy cast-iron bollard stands bolted to the floor.',
      'You look toward the corner where a sacred stone altar stands draped in prayer cloths.',
    ];

    for (const text of mismatchedNarrations) {
      const review = SemanticNarrativeReview.review({
        intent: createIntent({ originalText: 'I look around.' }),
        situation,
        plan: createPlan(),
        turnPackage: createPkg(text),
      });

      assert.equal(review.decision, 'REJECT', `Expected REJECT for archetype-mismatched prop in narration: "${text}"`);
      assert.ok(review.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'));
    }
  });
});

// ============================================================================
// SUITE 2: EPISTEMIC MASKING & STRANGER IDENTITY INVARIANTS
// ============================================================================

describe('Adversarial Suite 2: Epistemic Masking & Identity Protection', () => {
  it('strictly rejects candidate narration that leaks an unintroduced composite name ("Kaelen Voss")', () => {
    const storyId = 'adv_epistemic_comp_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const locationId = player.locationId;

    worldRepository.saveEntityCard(storyId, {
      id: 'npc_kaelen_voss',
      name: 'Kaelen Voss',
      kind: 'character',
      classification: { role: 'informant' },
      worldState: { locationId, presence: 'present', isAlive: true },
      lifecycle: { status: 'ACTIVE' },
      metadata: { apparentIdentity: 'a hooded informant' },
    } as any);

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look at the stranger in the corner.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    // The stranger is not introduced, so identityKnown is false
    const leakedNarration = 'You observe the shadowy corner where Kaelen Voss watches you with a guarded expression.';
    const review = SemanticNarrativeReview.review({
      intent: createIntent({ originalText: 'I look at the stranger in the corner.' }),
      situation,
      plan: createPlan(),
      turnPackage: createPkg(leakedNarration),
    });

    assert.equal(review.decision, 'REJECT', `Expected REJECT for leaked unintroduced name "Kaelen Voss"`);
    assert.ok(
      review.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM' && v.message.includes('Kaelen Voss')),
      'Expected UNSUPPORTED_CLAIM violation mentioning Kaelen Voss',
    );
  });

  it('strictly rejects candidate narration that leaks a distinctive single token ("Voss")', () => {
    const storyId = 'adv_epistemic_tok_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const locationId = player.locationId;

    worldRepository.saveEntityCard(storyId, {
      id: 'npc_kaelen_voss_tok',
      name: 'Kaelen Voss',
      kind: 'character',
      classification: { role: 'informant' },
      worldState: { locationId, presence: 'present', isAlive: true },
      lifecycle: { status: 'ACTIVE' },
      metadata: { apparentIdentity: 'a hooded stranger' },
    } as any);

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I observe the room.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const leakedNarration = 'You glance across the room and notice that Voss is still standing near the back door.';
    const review = SemanticNarrativeReview.review({
      intent: createIntent(),
      situation,
      plan: createPlan(),
      turnPackage: createPkg(leakedNarration),
    });

    assert.equal(review.decision, 'REJECT', `Expected REJECT for leaked surname token "Voss"`);
    assert.ok(review.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'));
  });

  it('rejects dictionary token leak when accompanied by an honorific prefix ("Dr. Aris Thorne")', () => {
    const storyId = 'adv_epistemic_honorific_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const locationId = player.locationId;

    worldRepository.saveEntityCard(storyId, {
      id: 'npc_evelyn_hope',
      name: 'Evelyn Hope',
      kind: 'character',
      classification: { role: 'archivist' },
      worldState: { locationId, presence: 'present', isAlive: true },
      lifecycle: { status: 'ACTIVE' },
      metadata: { apparentIdentity: 'a quiet archivist' },
    } as any);

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look around the archive.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const leakedNarration = 'You look across the room and notice Ms. Hope organizing stacks of parchment.';
    const review = SemanticNarrativeReview.review({
      intent: createIntent(),
      situation,
      plan: createPlan(),
      turnPackage: createPkg(leakedNarration),
    });

    assert.equal(review.decision, 'REJECT', `Expected REJECT for honorific dictionary leak "Ms. Hope"`);
    assert.ok(review.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'));
  });

  it('does NOT falsely reject ordinary lowercase dictionary words ("a gray coat", "lost hope")', () => {
    const storyId = 'adv_epistemic_dict_safe_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const locationId = player.locationId;

    worldRepository.saveEntityCard(storyId, {
      id: 'npc_arthur_gray',
      name: 'Arthur Gray',
      kind: 'character',
      classification: { role: 'clerk' },
      worldState: { locationId, presence: 'present', isAlive: true },
      lifecycle: { status: 'ACTIVE' },
      metadata: { apparentIdentity: 'a middle-aged clerk' },
    } as any);

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look at the clerk.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    // Lowercase "gray coat" is ordinary English descriptive prose, not an identity leak
    const benignNarration = 'You observe the middle-aged clerk wearing a plain gray coat as he waits patiently behind the counter.';
    const review = SemanticNarrativeReview.review({
      intent: createIntent({ originalText: 'I look at the clerk.' }),
      situation,
      plan: createPlan(),
      turnPackage: createPkg(benignNarration),
    });

    // The review should NOT flag Arthur Gray as an unintroduced identity leak
    const leakViolation = review.violations.find((v) => v.message.includes('Arthur Gray'));
    assert.equal(leakViolation, undefined, 'Ordinary adjective "gray" must not be falsely flagged as Arthur Gray leak');
  });

  it('allows canonical name when NPC identity is legitimately known (identityKnown: true)', () => {
    const storyId = 'adv_epistemic_known_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const locationId = player.locationId;

    worldRepository.saveEntityCard(storyId, {
      id: 'npc_clara_known',
      name: 'Clara Oswald',
      kind: 'character',
      classification: { role: 'companion' },
      worldState: { locationId, presence: 'present', isAlive: true },
      lifecycle: { status: 'ACTIVE' },
    } as any);

    // Grant identity knowledge canonically
    worldRepository.grantEntityIdentityKnowledge(storyId, player.actorId, 'npc_clara_known', 'Clara Oswald');

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look at Clara.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    const knownEntity = situation.nearbyEntities.find((e) => e.id === 'npc_clara_known');
    assert.ok(knownEntity, 'Clara must be in nearbyEntities');
    assert.equal(knownEntity.identityKnown, true, 'Clara identity must be known after grant');

    const validNarration = 'You look toward Clara Oswald as she offers a nod of acknowledgement.';
    const review = SemanticNarrativeReview.review({
      intent: createIntent({ originalText: 'I look at Clara.' }),
      situation,
      plan: createPlan(),
      turnPackage: createPkg(validNarration),
    });

    assert.equal(review.decision, 'ACCEPT', `Expected ACCEPT for introduced character Clara Oswald but got ${review.decision}`);
  });

  it('CurrentSituationBuilder.toNarratorSafeProjection sanitizes unintroduced identities across all fields', () => {
    const storyId = 'adv_safe_proj_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const locationId = player.locationId;

    worldRepository.saveEntityCard(storyId, {
      id: 'npc_secret_agent',
      name: 'Victor Vance',
      kind: 'character',
      classification: { role: 'agent' },
      worldState: { locationId, presence: 'present', isAlive: true },
      lifecycle: { status: 'ACTIVE' },
      metadata: { apparentIdentity: 'a tall trench-coated stranger' },
    } as any);

    const rawSituation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I look around the station.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });

    rawSituation.availableInteractions = [
      {
        id: 'int_talk',
        label: 'Talk to Victor Vance',
        action: 'talk',
        targetId: 'npc_secret_agent',
        targetName: 'Victor Vance',
        enabled: true,
      },
    ];
    rawSituation.visibleEvents = [
      {
        id: 'evt_1',
        summary: 'Victor Vance looks over the timetable on the wall.',
      },
    ];
    rawSituation.activeDialogue = {
      speakerId: 'npc_secret_agent',
      speakerName: 'Victor Vance',
      text: 'The train is delayed.',
    };

    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(rawSituation);

    // 1. Check nearbyEntities: name replaced by displayName
    const safeEntity = safeSituation.nearbyEntities.find((e) => e.id === 'npc_secret_agent')!;
    assert.equal(safeEntity.name, 'a tall trench-coated stranger');

    // 2. Check availableInteractions: targetName and label sanitized
    const safeInteraction = safeSituation.availableInteractions[0];
    assert.equal(safeInteraction.targetName, 'a tall trench-coated stranger');
    assert.ok(!safeInteraction.label.includes('Victor Vance'), 'Interaction label must not contain Victor Vance');
    assert.ok(safeInteraction.label.includes('a tall trench-coated stranger'), 'Interaction label must contain apparent identity');

    // 3. Check visibleEvents: summary sanitized
    assert.ok(!safeSituation.visibleEvents[0].summary.includes('Victor Vance'));
    assert.ok(safeSituation.visibleEvents[0].summary.includes('a tall trench-coated stranger'));

    // 4. Check activeDialogue: speakerName sanitized
    assert.equal(safeSituation.activeDialogue?.speakerName, 'a tall trench-coated stranger');
  });
});

// ============================================================================
// SUITE 3: STRICT CORPSE NON-TAKEABLE INVARIANT (F12)
// ============================================================================

describe('Adversarial Suite 3: Corpse Non-Takeable Invariant (CANNOT_TAKE_CORPSE)', () => {
  it('strictly rejects pick up of victim corpse even if properties.takeable is maliciously set to true', () => {
    const storyId = 'adv_corpse_exploit_' + Date.now();
    worldRepository.seedStory(storyId);
    const graph = worldRepository.getGeographyGraph(storyId);
    const locId = 'loc_alley_crime_' + Date.now();
    const actorId = 'char_player_cop';

    const corruptedCorpse: LocationSceneObject = {
      id: 'obj_murdered_victim',
      name: 'corpse of Arthur Pendelton',
      kind: 'OTHER',
      description: 'The lifeless body of the victim.',
      visible: true,
      interactable: true,
      tags: ['corpse', 'victim', 'deceased'],
      properties: {
        worldDirectorRole: 'INVESTIGATION_BODY',
        slot: 'BODY',
        takeable: true, // Malicious exploit attempt
        discoverable: true,
      },
      provenance: 'WORLD_DIRECTOR',
    };

    graph.addNode({
      id: locId,
      name: 'Crime Alley',
      archetype: 'CRIME_SCENE' as any,
      sceneObjects: [corruptedCorpse],
    } as any);

    const result = SceneInteractionAuthority.resolve({
      repository: worldRepository,
      storyId,
      actorId,
      locationId: locId,
      actionText: 'I take the corpse of Arthur Pendelton and put it into my inventory.',
    });

    assert.equal(result.attempted, true);
    assert.equal(result.committed, false, 'Corpse pickup must NOT be committed');
    assert.equal(result.errorCode, 'CANNOT_TAKE_CORPSE', 'Must return error code CANNOT_TAKE_CORPSE');
    assert.equal(result.canonicalStateChanges.length, 0);

    const inv = worldRepository.getInventoryEngine(storyId).getActorInventory(actorId);
    assert.equal(inv.length, 0, 'Inventory must remain completely empty');
  });

  it('strictly rejects standard pickup verb variations targeting corpse', () => {
    const storyId = 'adv_corpse_verbs_' + Date.now();
    worldRepository.seedStory(storyId);
    const graph = worldRepository.getGeographyGraph(storyId);
    const locId = 'loc_morgue_' + Date.now();
    const actorId = 'char_player_morgue';

    const corpse: LocationSceneObject = {
      id: 'obj_cadaver_cold',
      name: 'cadaver',
      kind: 'OTHER',
      visible: true,
      interactable: true,
      tags: ['corpse', 'body'],
      properties: {
        worldDirectorRole: 'INVESTIGATION_BODY',
        takeable: false,
      },
    };

    graph.addNode({
      id: locId,
      name: 'City Morgue',
      archetype: 'CRIME_SCENE' as any,
      sceneObjects: [corpse],
    } as any);

    const actions = [
      'I pocket the cadaver.',
      'I grab the dead body.',
      'I take the corpse.',
      'I pick up the cadaver.',
      'I loot the corpse.',
    ];

    for (const actionText of actions) {
      const result = SceneInteractionAuthority.resolve({
        repository: worldRepository,
        storyId,
        actorId,
        locationId: locId,
        actionText,
      });

      assert.equal(result.committed, false, `Action "${actionText}" must not be committed`);
      assert.equal(result.errorCode, 'CANNOT_TAKE_CORPSE', `Action "${actionText}" must return CANNOT_TAKE_CORPSE`);
    }
  });
});

// ============================================================================
// SUITE 4: FREEFORM PREMISE MATERIALIZATION & STRESS BOUNDARIES (F09)
// ============================================================================

describe('Adversarial Suite 4: Freeform Premise Materialization Robustness', () => {
  it('safely handles empty, non-string, or non-investigation premise without throwing', async () => {
    const repo = new InMemoryWorldRepository({ disablePersistence: true });
    const storyId = 'adv_freeform_empty_' + Date.now();
    repo.seedStory(storyId);
    const player = repo.getPlayerLifecycle(storyId)!;

    const run = repo.getStoryRun(storyId)!;
    run.startingSituation = '' as any;
    repo.saveStoryRun(run);

    const resEmpty = await WorldDirectorPreparationService.prepareOpeningInvestigation(
      repo,
      storyId,
      player.locationId,
    );
    assert.equal(resEmpty.status, 'NOT_REQUESTED');

    // Test non-investigation narrative premise
    run.startingSituation = 'The explorer watches the sunset over the quiet mountain pass.' as any;
    repo.saveStoryRun(run);

    const resNonInv = await WorldDirectorPreparationService.prepareOpeningInvestigation(
      repo,
      storyId,
      player.locationId,
    );
    assert.equal(resNonInv.status, 'NOT_REQUESTED');
  });

  it('safely handles massive or adversarial premise strings (5000+ chars) without crashing', () => {
    const adversarialPremise = 'A murder occurred at midnight. ' + 'Suspicious shadows linger. '.repeat(200) + 'A victim was discovered with fatal wounds.';
    const seed = extractInvestigationSeedFromPremise(adversarialPremise, {
      characterId: 'char_investigator',
      storyId: 'story_adv_stress',
    });

    assert.ok(seed, 'Must successfully extract investigation seed from large premise');
    assert.equal(seed.profile, 'INVESTIGATION');
    assert.ok(seed.victim.name.length > 0);
    assert.ok(seed.body.name.length > 0);
    assert.ok(seed.evidence.length >= 1);
  });

  it('synthesizes investigation seed and materializes crime scene anchors into geography graph', async () => {
    const storyId = 'adv_freeform_mat_' + Date.now();
    seedE2eStory(storyId, worldRepository);
    const run = worldRepository.getStoryRun(storyId)!;
    run.startingSituation = 'Ren Takahashi arrives at the scene to investigate the murder of Frank Morgan at the office. A chalk outline marks the body, and perimeter tape blocks the door.';
    worldRepository.saveStoryRun(run);

    const res = await WorldDirectorPreparationService.prepareOpeningInvestigation(
      worldRepository,
      storyId,
      'loc_office',
    );

    assert.equal(res.status, 'PREPARED');
    assert.ok(res.canonicalChanges.length > 0);

    const graph = worldRepository.getGeographyGraph(storyId);
    const locNode = graph.getNode('loc_office')!;
    const bodyObj = locNode.sceneObjects.find((o) => o.name.toLowerCase().includes('frank morgan') || o.name.toLowerCase().includes('corpse'));
    assert.ok(bodyObj, 'Crime scene must contain materialized body scene object');
    assert.equal(bodyObj.properties?.worldDirectorRole, 'INVESTIGATION_BODY', 'Materialized body must have INVESTIGATION_BODY role');
    assert.ok(bodyObj.properties?.representsVictimRef, 'Materialized body must reference victim entity');

    // Attempting to pick up the materialized body must deterministically fail with CANNOT_TAKE_CORPSE
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const pickupResult = SceneInteractionAuthority.resolve({
      repository: worldRepository,
      storyId,
      actorId: player.actorId,
      locationId: 'loc_office',
      actionText: `I take the ${bodyObj.name}.`,
    });
    assert.equal(pickupResult.committed, false, 'Pickup of materialized body must not commit');
    assert.equal(pickupResult.errorCode, 'CANNOT_TAKE_CORPSE', 'Must return CANNOT_TAKE_CORPSE');
  });
});

// ============================================================================
// SUITE 5: STRUCTURED OBSERVATION GROUNDING EVALUATOR (F07)
// ============================================================================

describe('Adversarial Suite 5: Observation Grounding Evaluator', () => {
  it('rejects observation lacking active perception verbs or sensory nouns', () => {
    const situation = {
      location: { name: 'Study', description: 'A book-lined study.' },
      sceneObjects: [{ name: 'desk', visibleToPlayer: true }],
      nearbyEntities: [],
      visibleEvents: [],
    } as any;

    const intent = createIntent({
      originalText: 'I inspect the desk.',
      explicitTargets: [{ id: 'obj_desk', name: 'desk' }],
    });

    // Prosaic reflection with zero perceptual attending
    const result = evaluateObservationGrounding(
      'Tomorrow will be another long and dreary day in this forgotten city.',
      intent,
      situation,
    );

    assert.equal(result.hasPerceptionBeat, false);
    assert.equal(result.valid, false);
  });

  it('rejects observation that ignores the requested target completely', () => {
    const situation = {
      location: { name: 'Library', description: 'A vast repository of tomes.' },
      sceneObjects: [{ name: 'crystal pedestal', visibleToPlayer: true }],
      nearbyEntities: [],
      visibleEvents: [],
    } as any;

    const intent = createIntent({
      originalText: 'I examine the crystal pedestal.',
      explicitTargets: [{ id: 'obj_crystal_pedestal', name: 'crystal pedestal' }],
    });

    // Perceptual verb present, but completely detached from the crystal pedestal
    const result = evaluateObservationGrounding(
      'You look upward and watch a tiny spider crawling across the high ceiling beams.',
      intent,
      situation,
    );

    assert.equal(result.hasPerceptionBeat, true);
    assert.equal(result.hasAnchorGrounding, false);
    assert.equal(result.valid, false);
  });

  it('accepts grounded observation with clear perception verb and target engagement', () => {
    const situation = {
      location: { name: 'Library', description: 'A vast repository of tomes.' },
      sceneObjects: [{ name: 'crystal pedestal', visibleToPlayer: true }],
      nearbyEntities: [],
      visibleEvents: [],
    } as any;

    const intent = createIntent({
      originalText: 'I examine the crystal pedestal.',
      explicitTargets: [{ id: 'obj_crystal_pedestal', name: 'crystal pedestal' }],
    });

    const result = evaluateObservationGrounding(
      'You inspect the crystal pedestal closely, noting the fine hairline fractures running along its polished surface.',
      intent,
      situation,
    );

    assert.equal(result.hasPerceptionBeat, true);
    assert.equal(result.hasAnchorGrounding, true);
    assert.equal(result.valid, true);
  });
});

// ============================================================================
// SUITE 6: LIVE TURN NARRATION GATE & REWRITES WITH EPISTEMIC MASKING
// ============================================================================

describe('Adversarial Suite 6: Live Turn Narration Gate & Rewrite Handling', () => {
  it('triggers rewrite/reject when candidate narration leaks an unknown identity, and succeeds when rewrite uses apparent label', () => {
    const storyId = 'adv_gate_rewrite_' + Date.now();
    worldRepository.seedStory(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId)!;
    const locationId = player.locationId;

    worldRepository.saveEntityCard(storyId, {
      id: 'npc_shadow_broker',
      name: 'Julian Sterling',
      kind: 'character',
      classification: { role: 'broker' },
      worldState: { locationId, presence: 'present', isAlive: true },
      lifecycle: { status: 'ACTIVE' },
      metadata: { apparentIdentity: 'a shadowy broker' },
    } as any);

    const rawSituation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I observe the person sitting in the corner.',
      viewerActorId: player.actorId,
      worldRepo: worldRepository,
    });
    const safeSituation = CurrentSituationBuilder.toNarratorSafeProjection(rawSituation);

    // Candidate 1 leaks the unknown proper name
    const leakedCandidate = 'You observe the corner where Julian Sterling sips from a glass.';
    const reviewLeaked = SemanticNarrativeReview.review({
      intent: createIntent({ originalText: 'I observe the person sitting in the corner.' }),
      situation: safeSituation,
      plan: createPlan('Observe the broker in the corner.'),
      turnPackage: createPkg(leakedCandidate),
    });

    // Leaked candidate must NOT be accepted
    assert.notEqual(reviewLeaked.decision, 'ACCEPT', 'Leaked candidate must not be accepted');
    assert.ok(reviewLeaked.violations.length > 0, 'Leaked candidate must trigger violations');

    // Candidate 2 fixes the leak by using the apparent descriptor
    const safeCandidate = 'You observe the corner where a shadowy broker sips from a glass.';
    const reviewSafe = SemanticNarrativeReview.review({
      intent: createIntent({ originalText: 'I observe the person sitting in the corner.' }),
      situation: safeSituation,
      plan: createPlan('Observe the broker in the corner.'),
      turnPackage: createPkg(safeCandidate),
    });

    assert.equal(reviewSafe.decision, 'ACCEPT', 'Safe candidate with apparent identity must be accepted');
    assert.equal(reviewSafe.unsupportedClaims.length, 0);
  });
});
