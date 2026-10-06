import test from 'node:test';
import assert from 'node:assert/strict';
import { worldRepository } from '../server/repositories/worldRepository';
import { OpeningSceneService } from '../server/services/openingSceneService';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { WorldTemplate, ConfirmedCharacter } from '../src/types';

test('Story Experience Slice 4 — Dynamic Opening Scene Verification', async (t) => {
  // =========================================================================
  // SETUP: World A (Dark Fantasy Werewolf Scholar)
  // User Prompt Context:
  // "Dark fantasy world where I am the only werewolf. Werewolves are considered a myth,
  // and I have hidden my condition for years. Young scholar who discovered that I am the
  // world's only werewolf. I hide my condition because I fear what society would do if it
  // discovered me. I want to discover where the curse came from."
  // =========================================================================
  const worldIdA = 'world_werewolf_scholar';
  const worldTemplateA: WorldTemplate = {
    worldId: worldIdA,
    worldManifestVersion: 4,
    title: 'Gothic Gloom: Realm of Oakhaven',
    description: 'A fog-shrouded dark fantasy realm of high spires, cobbles, and forgotten folklore.',
    genreTags: ['Dark Fantasy', 'Mystery'],
    toneTags: ['Gloom', 'Scholarly', 'Tense'],
    mediumTags: ['Text Adventure'],
    defaultEra: 'Age of Shadows',
    setting: 'Gothic Realm',
    canonMode: 'CANON_COMPLIANT',
    rulesetId: 'rules_oakhaven_v1',
    capabilities: [],
    geography: {
      nodes: [
        {
          id: 'loc_raven_archives',
          name: 'Ravenwood Atheneum',
          region: 'The Spire Ward',
          description: 'A vaulted library of rotting parchment, dim tallow candles, and silent dust.',
          coordinates: { x: 20, y: 30 },
          ambientSensory: 'The smell of tallow smoke and dry paper, cold rain pattering against high leaded glass.',
        },
      ],
      connections: [],
    },
    historyTimeline: [],
    canonKnowledge: [],
    startingHooks: [],
  };
  worldRepository.saveWorldTemplate(worldTemplateA);

  const charA: ConfirmedCharacter = {
    characterId: 'char_werewolf_scholar',
    identity: { name: 'Elias Thorne', species: 'Human' },
    role: { profession: 'Archival Scholar', archetype: 'Scholar' },
    background: { history: 'Discovered he is the only living werewolf; kept it concealed for years in terror of society.' },
    appearance: { physicalDescription: 'Pale, bookish young scholar in ink-stained wool coat with watchful amber eyes.' },
    personality: { traits: ['Methodical', 'Hyper-vigilant', 'Guarded'] },
    motivations: { goals: ['Discover the true origin of the lycanthropic curse while evading detection.'] },
    condition: { injuries: [], activeEffects: ['Hidden Lycanthropy'] },
    capabilities: [],
    generatedSkills: [],
    startingEquipment: {
      equipped: [],
      inventory: [
        { name: 'Ciphers of the Eclipse', category: 'Book', description: 'Ancient research folio.' },
        { name: 'Silver Needle', category: 'Tool', description: 'A testing implement held in secret.' },
      ],
      weapons: [],
      armor: [],
      tools: [],
      consumables: [],
    },
    portraitAsset: { emoji: '🐺' },
    startingLocation: { locationId: 'loc_raven_archives', name: 'Ravenwood Atheneum' },
    startingSituation: { summary: 'Hiding a monstrous condition while sifting through forbidden archives for origins.' },
  };

  const { storyId: storyIdA } = worldRepository.createStoryRunFromConfirmedCharacter({
    worldId: worldIdA,
    confirmedCharacter: charA,
  });

  // =========================================================================
  // SETUP: World B (Sci-Fi Void Station)
  // =========================================================================
  const worldIdB = 'world_void_drifter';
  const worldTemplateB: WorldTemplate = {
    worldId: worldIdB,
    worldManifestVersion: 4,
    title: 'Astra Void: Deep Space Outpost',
    description: 'A high-tech frontier station orbiting a dormant singularity in the Outer Rift.',
    genreTags: ['Sci-Fi', 'Exploration'],
    toneTags: ['Clinical', 'Vast', 'Technical'],
    mediumTags: ['Text Adventure'],
    defaultEra: 'Stardate 2480',
    setting: 'Deep Space',
    canonMode: 'CANON_COMPLIANT',
    rulesetId: 'rules_void_v1',
    capabilities: [],
    geography: {
      nodes: [
        {
          id: 'loc_telemetry_dock',
          name: 'Docking Arm Alpha',
          region: 'Sector 9 Orbital Ring',
          description: 'A pressurized airlock bay humming with magnetic clamps and argon venting.',
          coordinates: { x: 100, y: 150 },
          ambientSensory: 'The rhythmic vibration of fusion conduits and cold recycled nitrogen.',
        },
      ],
      connections: [],
    },
    historyTimeline: [],
    canonKnowledge: [],
    startingHooks: [],
  };
  worldRepository.saveWorldTemplate(worldTemplateB);

  const charB: ConfirmedCharacter = {
    characterId: 'char_commander_chen',
    identity: { name: 'Sarah Chen', species: 'Human' },
    role: { profession: 'Flight Specialist', archetype: 'Pilot' },
    background: { history: 'Stationed on the remote perimeter after telemetry flagged anomalous radiation pulses.' },
    appearance: { physicalDescription: 'Flight harness over pressurized void suit, calm and collected demeanor.' },
    personality: { traits: ['Disciplined', 'Analytic'] },
    motivations: { goals: ['Map the perimeter rift and verify anomalous sensor signatures.'] },
    condition: { injuries: [] },
    capabilities: [],
    generatedSkills: [],
    startingEquipment: {
      equipped: [],
      inventory: [
        { name: 'Telemetry Datapad', category: 'Tool', description: 'Real-time orbital scanner.' },
      ],
      weapons: [],
      armor: [],
      tools: [],
      consumables: [],
    },
    portraitAsset: { emoji: '🚀' },
    startingLocation: { locationId: 'loc_telemetry_dock', name: 'Docking Arm Alpha' },
    startingSituation: { summary: 'Preparing voidcraft for perimeter sensor calibration.' },
  };

  const { storyId: storyIdB } = worldRepository.createStoryRunFromConfirmedCharacter({
    worldId: worldIdB,
    confirmedCharacter: charB,
  });

  // -------------------------------------------------------------------------
  // TEST 1: Two-World Test (Acceptance Criteria 1)
  // -------------------------------------------------------------------------
  await t.test('Two-World Test: Generates completely distinct, world-bound opening scenes with no context leakage', async () => {
    // Generate opening scene for StoryRun A
    const openingA = await OpeningSceneService.generateOpeningScene({ storyId: storyIdA });
    assert.ok(openingA, 'Opening scene A should be successfully created');
    assert.equal(openingA.storyId, storyIdA);
    assert.equal(openingA.worldId, worldIdA);
    assert.equal(openingA.startingLocationName, 'Ravenwood Atheneum');
    assert.equal(openingA.characterName, 'Elias Thorne');

    // Generate opening scene for StoryRun B
    const openingB = await OpeningSceneService.generateOpeningScene({ storyId: storyIdB });
    assert.ok(openingB, 'Opening scene B should be successfully created');
    assert.equal(openingB.storyId, storyIdB);
    assert.equal(openingB.worldId, worldIdB);
    assert.equal(openingB.startingLocationName, 'Docking Arm Alpha');
    assert.equal(openingB.characterName, 'Sarah Chen');

    // Verify narratives are completely different
    assert.notEqual(
      openingA.narrativeText,
      openingB.narrativeText,
      'Opening scenes from different worlds must have completely different narratives'
    );

    // Verify Scene A refers strictly to World A, character, and condition
    assert.ok(
      openingA.narrativeText.includes('Ravenwood Atheneum') || openingA.startingLocationName === 'Ravenwood Atheneum',
      'Scene A must reference Ravenwood Atheneum'
    );
    assert.ok(
      openingA.narrativeText.includes('Elias Thorne') || openingA.characterName === 'Elias Thorne',
      'Scene A must reference Elias Thorne'
    );
    assert.ok(
      openingA.narrativeText.toLowerCase().includes('werewolf') ||
      openingA.narrativeText.toLowerCase().includes('scholar') ||
      openingA.narrativeText.toLowerCase().includes('curse'),
      'Scene A must capture the scholar werewolf condition'
    );

    // Verify Scene B refers strictly to World B, character, and setting
    assert.ok(
      openingB.narrativeText.includes('Docking Arm Alpha') || openingB.startingLocationName === 'Docking Arm Alpha',
      'Scene B must reference Docking Arm Alpha'
    );
    assert.ok(
      openingB.narrativeText.includes('Sarah Chen') || openingB.characterName === 'Sarah Chen',
      'Scene B must reference Sarah Chen'
    );

    // Verify strict mutual isolation: No cross-world leakage
    assert.ok(
      !openingA.narrativeText.includes('Sarah Chen') && !openingA.narrativeText.includes('Docking Arm Alpha'),
      'Scene A must not leak Scene B character or location'
    );
    assert.ok(
      !openingB.narrativeText.includes('Elias Thorne') && !openingB.narrativeText.includes('Ravenwood Atheneum'),
      'Scene B must not leak Scene A character or location'
    );

    // Verify strict anti-contamination: No demo fixture leaks
    const forbiddenFixtures = ['Whispering Orrery', 'Scribe Vael', 'Maren', 'Astral Prism', 'The End', 'Master Elian'];
    for (const fixture of forbiddenFixtures) {
      assert.ok(
        !openingA.narrativeText.includes(fixture),
        `Scene A must not contain demo fixture "${fixture}"`
      );
      assert.ok(
        !openingB.narrativeText.includes(fixture),
        `Scene B must not contain demo fixture "${fixture}"`
      );
    }

    // Verify Structured Events conformance
    assert.ok(
      Array.isArray(openingA.structuredEvents) && openingA.structuredEvents.length >= 4,
      'Scene A must include at least 4 structured narrative events'
    );
    assert.ok(
      openingA.structuredEvents.some((e) => e.type === 'location'),
      'Scene A must include a location event'
    );
    assert.ok(
      openingA.structuredEvents.some((e) => e.type === 'normal'),
      'Scene A must include normal descriptive narrative events'
    );

    // Verify dynamic state projection to external view state
    const viewStateA = serverMockAuthority.getSanitizedViewState(storyIdA);
    assert.ok(viewStateA.openingScene, 'ViewState A must include the projected openingScene');
    assert.equal(viewStateA.openingScene.startingLocationName, 'Ravenwood Atheneum');
    assert.equal(viewStateA.activeLocationId, 'loc_raven_archives');

    const viewStateB = serverMockAuthority.getSanitizedViewState(storyIdB);
    assert.ok(viewStateB.openingScene, 'ViewState B must include the projected openingScene');
    assert.equal(viewStateB.openingScene.startingLocationName, 'Docking Arm Alpha');
    assert.equal(viewStateB.activeLocationId, 'loc_telemetry_dock');
  });

  // -------------------------------------------------------------------------
  // TEST 2: Reload & Idempotency Test (Acceptance Criteria 2)
  // -------------------------------------------------------------------------
  await t.test('Reload Test: Re-querying an existing StoryRun returns exact same opening narrative without drift', async () => {
    // 1. Fetch opening scene via getOpeningScene
    const existingOpening = OpeningSceneService.getOpeningScene(storyIdA);
    assert.ok(existingOpening, 'Existing opening scene should be found');

    // 2. Call generateOpeningScene without forceRegenerate
    const reloadedOpening = await OpeningSceneService.generateOpeningScene({
      storyId: storyIdA,
      forceRegenerate: false,
    });

    // Verify identical values
    assert.equal(
      reloadedOpening.narrativeText,
      existingOpening.narrativeText,
      'Reloading must return the exact same narrativeText'
    );
    assert.equal(
      reloadedOpening.idempotencyKey,
      existingOpening.idempotencyKey,
      'Reloading must preserve the exact idempotencyKey'
    );
    assert.equal(
      reloadedOpening.generatedAt,
      existingOpening.generatedAt,
      'Reloading must not change generatedAt timestamp'
    );
    assert.equal(
      reloadedOpening.structuredEvents.length,
      existingOpening.structuredEvents.length,
      'Reloading must return the exact same structuredEvents'
    );

    // 3. Verify it does not disappear from StoryRun or ViewState
    const runA = worldRepository.getStoryRun(storyIdA);
    assert.ok(runA.openingScene, 'StoryRun must persistently retain openingScene');
    assert.equal(runA.openingScene.narrativeText, existingOpening.narrativeText);

    const viewState = serverMockAuthority.getSanitizedViewState(storyIdA);
    assert.ok(viewState.openingScene, 'Sanitized view state must continuously provide openingScene');
    assert.equal(viewState.openingScene.narrativeText, existingOpening.narrativeText);
  });

  // -------------------------------------------------------------------------
  // TEST 3: Negative & Isolation Test (Acceptance Criteria 3)
  // -------------------------------------------------------------------------
  await t.test('Negative Test: Invalid storyId rejects without default_story fallback, and errors are recoverable without data loss', async () => {
    // 1. Invalid storyId must reject with error
    const nonExistentId = 'story_invalid_non_existent_404';
    await assert.rejects(
      async () => {
        await OpeningSceneService.generateOpeningScene({ storyId: nonExistentId });
      },
      (err: any) => {
        assert.ok(/not found|does not exist/i.test(err.message), 'Must throw clear missing StoryRun error');
        return true;
      }
    );

    // 2. Missing storyId must reject
    await assert.rejects(
      async () => {
        await OpeningSceneService.generateOpeningScene({ storyId: '' });
      },
      (err: any) => {
        assert.ok(err.message.includes('storyId is required'), 'Must throw missing storyId error');
        return true;
      }
    );

    // 3. Verify WorkingContextEngine does NOT fall back to default_story
    assert.throws(() => {
      WorkingContextEngine.assembleOpeningContext({ storyId: nonExistentId });
    }, /not found|does not exist/i);

    // 4. Test error recovery without data loss
    // Create a new StoryRun C
    const worldIdC = 'world_error_recovery_test';
    worldRepository.saveWorldTemplate({
      ...worldTemplateA,
      worldId: worldIdC,
      title: 'Recovery Test World',
    });

    const { storyId: storyIdC } = worldRepository.createStoryRunFromConfirmedCharacter({
      worldId: worldIdC,
      confirmedCharacter: {
        ...charA,
        characterId: 'char_recovery_test',
        identity: { name: 'Kaelen Gray', species: 'Human' },
      },
    });

    // Simulate generation failure
    await assert.rejects(
      async () => {
        await OpeningSceneService.generateOpeningScene({
          storyId: storyIdC,
          simulateFailure: true,
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('Simulated narrative generation service failure'));
        return true;
      }
    );

    // Verify StoryRun, character, and location STILL exist and were not deleted!
    const preservedRun = worldRepository.getStoryRun(storyIdC);
    assert.ok(preservedRun, 'StoryRun must NOT be deleted when narrative generation fails');
    assert.equal(preservedRun.protagonist.identity.name, 'Kaelen Gray', 'Character identity must remain intact');
    assert.equal(preservedRun.startingLocation.locationId, 'loc_raven_archives', 'Location must remain intact');

    // Now retry without failure simulation — generation should succeed cleanly!
    const recoveredOpening = await OpeningSceneService.generateOpeningScene({
      storyId: storyIdC,
      simulateFailure: false,
    });
    assert.ok(recoveredOpening, 'Subsequent retry must succeed cleanly');
    assert.equal(recoveredOpening.storyId, storyIdC);
    assert.equal(recoveredOpening.characterName, 'Kaelen Gray');
  });

  // -------------------------------------------------------------------------
  // TEST 4: Opening-scene presentation-quality gate (N18 richness + N8 pacing)
  // -------------------------------------------------------------------------
  await t.test('Quality Gate: deterministic evaluators reject environment-heavy, substance-light narration but accept valid quiet openings', async () => {
    const facts = WorkingContextEngine.assembleOpeningContext({ storyId: storyIdA, worldRepo: worldRepository }).rawOpeningFacts;

    // Environment-heavy / substance-light: decorative scenery with no situation,
    // character behavior, tension, or forward beat. Must be detected.
    const envHeavySentence = 'The chamber is vast and dark, its stone walls stretching into the distance where torches cast flickering shadows across the vaulted ceiling.';
    const envHeavy = [envHeavySentence, envHeavySentence, envHeavySentence].join('\n\n');
    const envReview = OpeningSceneService.evaluateOpeningQuality(envHeavy, facts, storyIdA);
    assert.equal(envReview.decision, 'REWRITE', 'Environment-heavy narration must fail the opening quality review');
    assert.ok(envReview.richness.issues.length > 0, 'Detection must be attributable to concrete quality issues');
    assert.ok(
      envReview.richness.issues.some((issue) =>
        ['BEAT_PROGRESSION', 'EMOTIONAL_PROGRESSION', 'PLAYER_AGENCY', 'SUBTEXT', 'SETUP_PAYOFF'].includes(issue.dimension)
      ),
      'Environment-heavy detection must cite substance dimensions, not just sensory variety'
    );

    // Valid quiet/mystery opening: no dialogue, no combat, but real substance.
    const quiet = [
      'Elias Thorne stands mid-step within Ravenwood Atheneum, the silver needle already palmed in his right hand while his eyes track the reading desk he abandoned an hour ago.',
      'Someone has been through his papers. The Ciphers of the Eclipse folio sits two finger-widths out of alignment, and a thin ring of damp marks the wood where a stranger set down something cold and metallic while he was in the archive stacks.',
      'His chest tightens as he weighs the search of a stranger against the years of careful silence that keep him free. He crosses to the desk in three quick strides and turns the folio toward the candlelight. The clasp sits wrong. It has been re-strung with a thread that does not match his own waxed cord, and beneath the desk edge, a folded note waits where anyone passing might see it.',
    ].join('\n\n');
    const quietReview = OpeningSceneService.evaluateOpeningQuality(quiet, facts, storyIdA);
    assert.equal(quietReview.decision, 'ACCEPT', 'A valid quiet mystery opening with real substance must pass');
    assert.ok(quietReview.richness.overallScore >= 0.68, 'Quiet opening must clear the richness threshold');
    assert.ok(!quietReview.pacingReason, 'Quiet opening must satisfy N8 pacing ceilings');

    // Character-actorship requirement: passive scenery-only narration that merely
    // names environment details also fails, even with varied sentences.
    const passive = [
      'Dust hangs in the air above long wooden tables near the tall arched windows of the old archive.',
      'Rain patters against the leaded glass while candle flames gutter in their brass holders along the stone walls.',
      'Shadows pool between the towering shelves where the lamplight fails to reach, and the floor stones gleam faintly where they have been worn smooth.',
    ].join('\n\n');
    const passiveReview = OpeningSceneService.evaluateOpeningQuality(passive, facts, storyIdA);
    assert.equal(passiveReview.decision, 'REWRITE', 'Passive scenery-only narration must also fail the review');

    // Player agency: narration that decides a consequential action for the player
    // must be rejected by the shared evaluator even when the prose is detailed.
    const takeover = [
      'You decide to abandon the chamber without another glance and set out at once toward the distant tower.',
      'The stone walls stretch into the distance where torches cast flickering shadows across the vaulted ceiling, and dust hangs in the still air.',
      'Somewhere behind you a door closes, and the floor stones gleam faintly where they have been worn smooth by generations of passing feet.',
    ].join('\n\n');
    const takeoverReview = OpeningSceneService.evaluateOpeningQuality(takeover, facts, storyIdA);
    assert.equal(takeoverReview.decision, 'REWRITE', 'Narration that decides a consequential player action must fail review');
    assert.ok(
      takeoverReview.richness.issues.some((issue) => issue.dimension === 'PLAYER_AGENCY'),
      'Agency takeover must be cited as a review issue'
    );
  });

  // -------------------------------------------------------------------------
  // TEST 5: Quality gate end-to-end on the opening path
  // -------------------------------------------------------------------------
  await t.test('Quality Gate: environment-heavy AI opening is rewritten or safely downgraded, with canonical safety intact', async () => {
    const worldIdQ = 'world_quality_gate_test';
    worldRepository.saveWorldTemplate({ ...worldTemplateA, worldId: worldIdQ, title: 'Quality Gate Test World' });
    const { storyId: storyIdQ } = worldRepository.createStoryRunFromConfirmedCharacter({
      worldId: worldIdQ,
      confirmedCharacter: {
        ...charA,
        characterId: 'char_quality_gate_test',
        identity: { name: 'Kaelen Gray', species: 'Human' },
      },
    });
    const envHeavyPayload = environmentHeavyOpeningPayload();

    // Case 1: model returns the same poor prose for both generate and rewrite.
    const restore1 = mockOrchestrator(() => aiResponse(envHeavyPayload));
    try {
      const opening = await OpeningSceneService.generateOpeningScene({ storyId: storyIdQ });
      const audit = readAudit(opening);
      assert.ok(audit, 'Generation metadata must carry the quality audit');
      assert.equal(audit.firstDecision, 'REWRITE', 'Environment-heavy opening must be detected by the quality gate');
      assert.equal(audit.rewriteAttempted, true, 'Gate must attempt the bounded rewrite');
      assert.equal(audit.rewriteSucceeded, false, 'Rewrite of identical poor prose must not be accepted');
      assert.equal(audit.finalDecision, 'REWRITE', 'Final decision must remain REWRITE after failed rewrite');
      assert.match(opening.narrativeText, /stands within/, 'Opening must be downgraded to the canonical deterministic fallback');
      assert.ok(opening.structuredEvents.length >= 4, 'Fallback events must remain structurally valid');
      assert.ok(opening.structuredEvents.some((e) => e.type === 'location'), 'Location event must remain present');
      assert.ok(opening.structuredEvents.some((e) => e.type === 'normal'), 'Normal event must remain present');
      // Canonical facts are untouched by the quality layer.
      assert.equal(opening.startingLocationId, 'loc_raven_archives');
      assert.equal(opening.characterName, 'Kaelen Gray');
    } finally {
      restore1();
    }

    // Case 2: rewrite succeeds and must preserve canonical facts.
    const rewritePayload = substantiveKaelenOpeningPayload();
    const taskCalls: string[] = [];
    const restore2 = mockOrchestrator((task: string) => {
      taskCalls.push(task);
      if (task === 'narrative.review') {
        return aiResponse(rewritePayload);
      }
      return aiResponse(envHeavyPayload);
    });
    try {
      const opening = await OpeningSceneService.generateOpeningScene({ storyId: storyIdQ, forceRegenerate: true });
      const audit = readAudit(opening);
      assert.ok(audit, 'Generation metadata must carry the quality audit');
      assert.equal(audit.firstDecision, 'REWRITE', 'Environment-heavy first draft must be detected');
      assert.equal(audit.rewriteSucceeded, true, 'Successful substance-first rewrite must be accepted');
      assert.equal(audit.finalDecision, 'ACCEPT', 'Final decision must be ACCEPT after successful rewrite');
      assert.equal(taskCalls.filter((task) => task === 'narrative.review').length, 1, 'At most one bounded rewrite provider call is permitted');
      assert.equal(taskCalls.filter((task) => task === 'narrative.generate').length, 1, 'The rewrite must not trigger an unbounded generation loop');
      assert.match(opening.narrativeText, /Kaelen Gray/, 'Rewritten opening must preserve canonical character identity');
      assert.match(opening.narrativeText, /Ravenwood Atheneum/, 'Rewritten opening must preserve canonical location');
      assert.ok(
        !/Sarah Chen|Docking Arm Alpha|Elias Thorne/.test(opening.narrativeText),
        'Rewritten opening must not import facts from other stories'
      );
      assert.ok(opening.structuredEvents.length >= 4, 'Rewrite must keep at least 4 structured events');
      assert.ok(opening.structuredEvents.some((e) => e.type === 'location'), 'Rewrite must keep a location event');
      assert.ok(opening.structuredEvents.some((e) => e.type === 'normal'), 'Rewrite must keep a normal event');
      assert.ok(opening.narrativeText.length >= 220, 'Accepted rewritten prose must remain substantial');
    } finally {
      restore2();
    }
  });

  // -------------------------------------------------------------------------
  // TEST 6: Quality review failure must not damage state; retry and idempotency hold
  // -------------------------------------------------------------------------
  await t.test('Quality Gate: safe behavior across malformed rewrite, failed generation, retry, and idempotent reload', async () => {
    const worldIdR = 'world_quality_gate_safety_test';
    worldRepository.saveWorldTemplate({ ...worldTemplateA, worldId: worldIdR, title: 'Quality Gate Safety World' });
    const { storyId: storyIdR } = worldRepository.createStoryRunFromConfirmedCharacter({
      worldId: worldIdR,
      confirmedCharacter: {
        ...charA,
        characterId: 'char_quality_gate_safety',
        identity: { name: 'Kaelen Gray', species: 'Human' },
      },
    });
    const envHeavyPayload = environmentHeavyOpeningPayload();

    // 1. Rewrite that returns malformed output downgrades to the deterministic fallback.
    const restore1 = mockOrchestrator((task: string) => {
      if (task === 'narrative.review') {
        return aiResponse('This is not valid JSON from the model <<corrupt>>');
      }
      return aiResponse(envHeavyPayload);
    });
    try {
      const opening = await OpeningSceneService.generateOpeningScene({ storyId: storyIdR });
      const audit = readAudit(opening);
      assert.equal(audit.firstDecision, 'REWRITE', 'Environment-heavy draft must be detected');
      assert.equal(audit.rewriteAttempted, true, 'Malformed rewrite is still attempted once');
      assert.equal(audit.rewriteSucceeded, false, 'Malformed rewrite output must not be accepted');
      assert.match(opening.narrativeText, /stands within/, 'Deterministic fallback must be used after malformed rewrite');
    } finally {
      restore1();
    }

    // 2. Generation failure still preserves safe state.
    await assert.rejects(
      async () => {
        await OpeningSceneService.generateOpeningScene({ storyId: storyIdR, forceRegenerate: true, simulateFailure: true });
      },
      (err: any) => {
        assert.ok(err.message.includes('Simulated narrative generation service failure'));
        return true;
      }
    );
    const preservedRun = worldRepository.getStoryRun(storyIdR);
    assert.ok(preservedRun, 'StoryRun must survive a failed generation attempt');
    assert.equal(preservedRun.protagonist.identity.name, 'Kaelen Gray', 'Character identity must survive a failed generation attempt');
    assert.ok(preservedRun.openingScene, 'Previously persisted opening must survive a failed regeneration attempt');

    // 3. Retry with a substantive AI opening succeeds and persists.
    const restore2 = mockOrchestrator(() => aiResponse(substantiveKaelenOpeningPayload()));
    let retryText = '';
    try {
      const opening = await OpeningSceneService.generateOpeningScene({ storyId: storyIdR, forceRegenerate: true });
      const audit = readAudit(opening);
      assert.equal(audit.firstDecision, 'ACCEPT', 'Substantive opening must pass the quality gate without rewrite');
      assert.equal(audit.rewriteAttempted, false, 'No rewrite may be attempted for an accepted opening');
      assert.ok(audit.finalScore >= 0.68, 'Accepted opening must clear the richness threshold');
      assert.match(opening.narrativeText, /Kaelen Gray/, 'Retry must keep canonical character identity');
      assert.match(opening.narrativeText, /Ravenwood Atheneum/, 'Retry must keep canonical location');
      assert.ok(
        !/Sarah Chen|Docking Arm Alpha|Elias Thorne/.test(opening.narrativeText),
        'Retry must not import facts from other stories'
      );
      retryText = opening.narrativeText;
    } finally {
      restore2();
    }

    // 4. Idempotent reload returns the exact same scene without invoking AI again.
    const before = worldRepository.getStoryRun(storyIdR)?.openingScene?.narrativeText;
    const reloaded = await OpeningSceneService.generateOpeningScene({ storyId: storyIdR });
    assert.equal(reloaded.narrativeText, before, 'Idempotent reload must return the identical narrative');
    assert.equal(reloaded.narrativeText, retryText, 'Reload must match the persisted retry result');
    const runAfter = worldRepository.getStoryRun(storyIdR);
    assert.ok(runAfter.openingScene, 'StoryRun persistence must hold after reload');
    const viewState = serverMockAuthority.getSanitizedViewState(storyIdR);
    assert.ok(viewState.openingScene, 'ViewState projection must hold after reload');
    assert.equal(viewState.openingScene.narrativeText, retryText, 'ViewState must project the persisted opening');
    assert.equal(viewState.activeLocationId, 'loc_raven_archives', 'ViewState location must remain canonical');
  });
});

function aiResponse(text: string) {
  return { text, source: 'AI_PRIMARY', providerId: 'google_gemini', modelId: 'gemini-3.5-flash', attempts: 1 };
}

function mockOrchestrator(handler: (task: string, prompt: string) => any) {
  const originalGetAiOrchestrator = worldRepository.getAiOrchestrator;
  worldRepository.getAiOrchestrator = (() => ({
    executeTaskGeneration: async (task: string, prompt: string, systemInstruction?: string, options?: any) => handler(task, prompt),
  })) as any;
  return () => {
    worldRepository.getAiOrchestrator = originalGetAiOrchestrator;
  };
}

function environmentHeavyOpeningPayload(): string {
  const sentence = 'The chamber is vast and dark, its stone walls stretching into the distance where torches cast flickering shadows across the vaulted ceiling.';
  return JSON.stringify({
    narrativeText: [sentence, sentence, sentence].join('\n\n'),
    structuredEvents: [
      { type: 'location', text: 'Ravenwood Atheneum — The Spire Ward' },
      { type: 'normal', text: sentence },
      { type: 'normal', text: sentence },
      { type: 'normal', text: sentence },
    ],
  });
}

function substantiveKaelenOpeningPayload(): string {
  return JSON.stringify({
    narrativeText: [
      'Kaelen Gray stands mid-step within Ravenwood Atheneum, one hand pressed flat against a reading desk where the candle flame has burned low.',
      'A folio he does not remember opening lies splayed across the desk, its pages still holding the pressed shape of something removed. His fingers close around the cold brass of the desk lamp as he leans closer, and the fine dust on the shelf above shows the clean sweep of a hand that passed through recently.',
      'He lifts the folio and turns its spine toward the candlelight, breath held. A thread of grey wax clings to the clasp that his own black wax never left, and somewhere behind the archive stacks, a door eases shut without a sound.',
    ].join('\n\n'),
    structuredEvents: [
      { type: 'location', text: 'Ravenwood Atheneum — The Spire Ward' },
      { type: 'normal', text: 'Kaelen Gray finds a folio he does not remember opening and dust recently swept from the shelf above.' },
      { type: 'action', text: 'He lifts the folio to the candlelight and finds grey wax on the clasp that his own black wax never left.' },
      { type: 'normal', text: 'A door eases shut behind the archive stacks while he stands holding the tampered folio.' },
    ],
  });
}

function readAudit(opening: any): any {
  const run = worldRepository.getStoryRun(opening.storyId);
  return run?.runtimeState?.openingNarrativeContext?.generation?.qualityAudit;
}
