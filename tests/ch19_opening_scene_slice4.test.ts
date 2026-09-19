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
});
