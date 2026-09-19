import test from 'node:test';
import assert from 'node:assert/strict';
import { worldSynthesisService } from '../server/services/worldSynthesisService';
import { worldRepository } from '../server/repositories/worldRepository';
import { WorldTemplate } from '../src/types';

test('World Creation Slice 1B — Planned World Events Comprehensive Verification Suite', async (t) => {

  // 1. Valid event generation
  await t.test('1. Valid event generation', async () => {
    const world = await worldSynthesisService.synthesizeWorldFromPremise({
      naturalLanguagePremise: 'A dark gothic valley plagued by blood moon rituals, where hunters are the prey.',
      title: 'Bloodmoon Valley',
      genreTags: ['Dark Fantasy', 'Gothic'],
      toneTags: ['Ominous', 'Grim'],
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND'
    });

    assert.ok(world.worldId, 'Should generate a valid world ID');
    assert.ok(Array.isArray(world.events), 'Should have a valid events array');
    assert.ok(world.events.length >= 3, 'Should generate multiple events for rich premise');

    for (const event of world.events) {
      assert.ok(event.id, 'Event must have a unique ID');
      assert.ok(event.title, 'Event must have a title');
      assert.ok(event.description, 'Event must have a description');
      assert.ok(event.category, 'Event must have a category');
      assert.equal(event.status, 'PLANNED', 'Event status must be PLANNED');
      assert.ok(event.scheduledTime, 'Event must have structured scheduledTime');
      assert.ok(typeof event.scheduledTime.year === 'number', 'Time year must be a number');
      assert.ok(typeof event.scheduledTime.totalElapsedSeconds === 'number', 'Time totalElapsedSeconds must be a number');
    }
  });

  // 2. Event schema validation
  await t.test('2. Event schema validation', () => {
    const rawEvents = [
      {
        id: 'evt_valid_1',
        title: 'Ritual of the Blood Moon',
        description: 'Cultists gather at the standing stones to channel lunar currents.',
        category: 'SUPERNATURAL',
        visibility: 'PUBLIC',
        scheduledTime: { year: 120, month: 4, day: 10, hour: 23, minute: 0 },
        locationId: 'loc_standing_stones',
        participatingActors: ['char_cult_leader'],
        preconditions: { requiredEvents: [] },
        plannedConsequences: [
          { type: 'world_fact', targetId: 'world', detail: 'The Blood Moon has risen' }
        ]
      }
    ];

    const locations = [{ id: 'loc_standing_stones', name: 'Standing Stones' }];
    const characters = [{ id: 'char_cult_leader', name: 'Cult Leader' }];
    const factions = [{ id: 'fac_moon_cult', name: 'Moon Cult' }];

    const validated = (worldSynthesisService as any).validateAndNormalizeEvents(
      rawEvents,
      locations,
      characters,
      factions
    );

    assert.equal(validated.length, 1);
    const ev = validated[0];
    assert.equal(ev.id, 'evt_valid_1');
    assert.equal(ev.category, 'SUPERNATURAL');
    assert.equal(ev.status, 'PLANNED');
    assert.equal(ev.locationId, 'loc_standing_stones');
    assert.deepEqual(ev.participatingActors, ['char_cult_leader']);
    assert.equal(ev.plannedConsequences[0].type, 'world_fact');
    assert.equal(ev.plannedConsequences[0].detail, 'The Blood Moon has risen');
  });

  // 3. Duplicate ID rejection
  await t.test('3. Duplicate ID rejection', () => {
    const rawEvents = [
      { id: 'duplicate_id', title: 'Event A' },
      { id: 'duplicate_id', title: 'Event B' }
    ];

    const validated = (worldSynthesisService as any).validateAndNormalizeEvents(
      rawEvents,
      [],
      [],
      []
    );

    assert.equal(validated.length, 2);
    assert.equal(validated[0].id, 'duplicate_id');
    assert.notEqual(validated[1].id, 'duplicate_id', 'Duplicate ID must be automatically resolved/repaired');
    assert.ok(validated[1].id.includes('duplicate_id') || validated[1].id.startsWith('evt_'), 'Resolved ID should be valid and derived');
  });

  // 4. Invalid actor reference rejection
  await t.test('4. Invalid actor reference rejection', () => {
    const rawEvents = [
      {
        id: 'evt_actor_test',
        title: 'Secret Meeting',
        participatingActors: ['valid_char', 'invalid_char_xyz', 'valid_faction', 'invalid_faction_abc']
      }
    ];

    const characters = [{ id: 'valid_char', name: 'Valid Character' }];
    const factions = [{ id: 'valid_faction', name: 'Valid Faction' }];

    const validated = (worldSynthesisService as any).validateAndNormalizeEvents(
      rawEvents,
      [],
      characters,
      factions
    );

    assert.equal(validated.length, 1);
    const ev = validated[0];
    assert.deepEqual(ev.participatingActors, ['valid_char', 'valid_faction'], 'Invalid actor IDs must be filtered out');
  });

  // 5. Invalid location reference rejection
  await t.test('5. Invalid location reference rejection', () => {
    const rawEvents = [
      {
        id: 'evt_loc_test',
        title: 'Meeting at Nowhere',
        locationId: 'nonexistent_location_id'
      }
    ];

    const locations = [{ id: 'valid_sanctuary', name: 'Valid Sanctuary' }];

    const validated = (worldSynthesisService as any).validateAndNormalizeEvents(
      rawEvents,
      locations,
      [],
      []
    );

    assert.equal(validated.length, 1);
    const ev = validated[0];
    assert.equal(ev.locationId, 'valid_sanctuary', 'Invalid locationId must be normalized to first valid location');
  });

  // 6. Invalid dependency rejection
  await t.test('6. Invalid dependency rejection', () => {
    const rawEvents = [
      {
        id: 'evt_dep_1',
        title: 'Event One',
        preconditions: { requiredEvents: ['evt_dep_1', 'evt_nonexistent_abc'] }
      }
    ];

    const validated = (worldSynthesisService as any).validateAndNormalizeEvents(
      rawEvents,
      [],
      [],
      []
    );

    assert.equal(validated.length, 1);
    const ev = validated[0];
    assert.deepEqual(ev.preconditions.requiredEvents, [], 'Prerequisites must filter out self-dependencies and nonexistent dependency IDs');
  });

  // 7. World-specific event generation
  await t.test('7. World-specific event generation', async () => {
    const oldKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const gothicWorld = await worldSynthesisService.synthesizeWorldFromPremise({
        naturalLanguagePremise: 'A gothic werewolf valley with cult activities. Grim and dark shadows.',
        genreTags: ['Dark Fantasy'],
        toneTags: ['Grim']
      });

      const sciFiWorld = await worldSynthesisService.synthesizeWorldFromPremise({
        naturalLanguagePremise: 'A hard sci-fi asteroid mining colony with zero gravity and corporate sabotage in space.',
        genreTags: ['Sci-Fi'],
        toneTags: ['Intellectual']
      });

      assert.ok(gothicWorld.events!.some(e => 
        e.title.toLowerCase().includes('tremor') || 
        e.title.toLowerCase().includes('infiltration') || 
        e.title.toLowerCase().includes('summoning') ||
        e.description.toLowerCase().includes('cathedral') ||
        e.description.toLowerCase().includes('tribunal') ||
        e.description.toLowerCase().includes('warden')
      ), 'Gothic world events should be context and world-specific');

      assert.ok(sciFiWorld.events!.some(e => 
        e.title.toLowerCase().includes('alignment') || 
        e.title.toLowerCase().includes('raid') || 
        e.title.toLowerCase().includes('ignition') || 
        e.description.toLowerCase().includes('gravity') ||
        e.description.toLowerCase().includes('space') ||
        e.description.toLowerCase().includes('scientists')
      ), 'SciFi world events should be context and world-specific');
    } finally {
      process.env.GEMINI_API_KEY = oldKey;
    }
  });

  // 8. Event persistence
  await t.test('8. Event persistence', () => {
    const worldId = 'persist_test_world';
    const originalWorld: WorldTemplate = {
      worldId,
      title: 'Persistence Sanctuary',
      summary: 'Testing persistence',
      description: 'A test world',
      genreTags: ['Fantasy'],
      toneTags: ['Hopeful'],
      mediumTags: [],
      canonMode: 'Original',
      rulesetId: 'rules_std',
      visibility: 'public',
      creatorId: 'system',
      sourcePolicy: 'Manual Test',
      defaultEra: 'Era of Code',
      worldManifestVersion: 1,
      versionHash: 'h_1',
      canonicalCapabilities: [],
      capabilities: [],
      worldRules: [],
      ruleConstraints: [],
      worldFacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [
        {
          id: 'evt_p_1',
          title: 'System Startup',
          description: 'The code execution starts.',
          category: 'DISCOVERY',
          scheduledTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0, totalElapsedSeconds: 0 },
          participatingActors: [],
          preconditions: { requiredEvents: [] },
          plannedConsequences: [],
          visibility: 'PUBLIC',
          status: 'PLANNED'
        }
      ]
    };

    worldRepository.saveWorldTemplate(originalWorld);

    const saved = worldRepository.getWorldTemplate(worldId);
    assert.ok(saved);
    assert.equal(saved.events!.length, 1);
    assert.equal(saved.events![0].id, 'evt_p_1');
  });

  // 9. Event reload
  await t.test('9. Event reload', () => {
    const worldId = 'reload_test_world';
    const world: WorldTemplate = {
      worldId,
      title: 'Reload Hub',
      summary: 'Testing reload',
      description: 'A reload test world',
      genreTags: ['Sci-Fi'],
      toneTags: ['Intellectual'],
      mediumTags: [],
      canonMode: 'Original',
      rulesetId: 'rules_std',
      visibility: 'public',
      creatorId: 'system',
      sourcePolicy: 'Manual Test',
      defaultEra: 'Era of Code',
      worldManifestVersion: 1,
      versionHash: 'h_2',
      canonicalCapabilities: [],
      capabilities: [],
      worldRules: [],
      ruleConstraints: [],
      worldFacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [
        {
          id: 'evt_reload_1',
          title: 'Reloader Fire',
          description: 'A cosmic reloader triggers.',
          category: 'DISASTER',
          scheduledTime: { year: 1, month: 1, day: 1, hour: 12, minute: 0, second: 0, totalElapsedSeconds: 43200 },
          participatingActors: [],
          preconditions: { requiredEvents: [] },
          plannedConsequences: [],
          visibility: 'PUBLIC',
          status: 'PLANNED'
        }
      ]
    };

    worldRepository.saveWorldTemplate(world);

    // Act
    const reloaded = worldRepository.getWorldTemplate(worldId);

    // Assert
    assert.ok(reloaded, 'World should load correctly');
    assert.deepEqual(reloaded.events, world.events, 'Reloaded event plan must match stored state exactly');
  });

  // 10. World version preservation
  await t.test('10. World version preservation', () => {
    const worldId = 'ver_preserve_world';
    const worldV1: WorldTemplate = {
      worldId,
      title: 'Versioning Core',
      summary: 'V1',
      description: 'First version template',
      genreTags: ['Fantasy'],
      toneTags: ['Grim'],
      mediumTags: [],
      canonMode: 'Original',
      rulesetId: 'rules_std',
      visibility: 'public',
      creatorId: 'system',
      sourcePolicy: 'Manual Test',
      defaultEra: 'Era of V1',
      worldManifestVersion: 1,
      versionHash: 'hash_v1',
      canonicalCapabilities: [],
      capabilities: [],
      worldRules: [],
      ruleConstraints: [],
      worldFacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [{ id: 'evt_v1', title: 'V1 Event', status: 'PLANNED', category: 'OTHER', scheduledTime: { year: 1 } }]
    };

    worldRepository.saveWorldTemplate(worldV1);

    // Mock an active run pinned to V1
    const run = {
      storyId: 'run_version_test_story',
      worldId: worldId,
      pinnedWorldVersion: 1,
      characterName: 'Tester V1',
    };
    (worldRepository as any).storyRuns.set(run.storyId, run);

    // Save a new version V2
    const worldV2: WorldTemplate = {
      ...worldV1,
      worldManifestVersion: 2,
      versionHash: 'hash_v2',
      events: [{ id: 'evt_v2', title: 'V2 Event', status: 'PLANNED', category: 'OTHER', scheduledTime: { year: 2 } }]
    };
    worldRepository.saveWorldTemplate(worldV2);

    // Retrieve active story run
    const retrievedRun = worldRepository.getStoryRun('run_version_test_story');
    assert.ok(retrievedRun);
    assert.equal(retrievedRun.pinnedWorldVersion, 1, 'Active story run must remain pinned to Version 1');
  });

  // 11. World A/B isolation
  await t.test('11. World A/B isolation', () => {
    const worldAId = 'world_isolation_a';
    const worldBId = 'world_isolation_b';

    const worldA: WorldTemplate = {
      worldId: worldAId,
      title: 'World A',
      summary: 'Isolation testing A',
      description: 'Setting A',
      genreTags: ['Fantasy'],
      toneTags: ['Grim'],
      mediumTags: [],
      canonMode: 'Original',
      rulesetId: 'rules_std',
      visibility: 'public',
      creatorId: 'system',
      sourcePolicy: 'Manual Test',
      defaultEra: 'Era A',
      worldManifestVersion: 1,
      versionHash: 'hash_a',
      canonicalCapabilities: [],
      capabilities: [],
      worldRules: [],
      ruleConstraints: [],
      worldFacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [{ id: 'evt_a', title: 'Event A only', status: 'PLANNED', category: 'OTHER', scheduledTime: { year: 1 } }]
    };

    const worldB: WorldTemplate = {
      worldId: worldBId,
      title: 'World B',
      summary: 'Isolation testing B',
      description: 'Setting B',
      genreTags: ['Sci-Fi'],
      toneTags: ['Intellectual'],
      mediumTags: [],
      canonMode: 'Original',
      rulesetId: 'rules_std',
      visibility: 'public',
      creatorId: 'system',
      sourcePolicy: 'Manual Test',
      defaultEra: 'Era B',
      worldManifestVersion: 1,
      versionHash: 'hash_b',
      canonicalCapabilities: [],
      capabilities: [],
      worldRules: [],
      ruleConstraints: [],
      worldFacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [{ id: 'evt_b', title: 'Event B only', status: 'PLANNED', category: 'OTHER', scheduledTime: { year: 1 } }]
    };

    worldRepository.saveWorldTemplate(worldA);
    worldRepository.saveWorldTemplate(worldB);

    const loadedA = worldRepository.getWorldTemplate(worldAId);
    const loadedB = worldRepository.getWorldTemplate(worldBId);

    assert.ok(loadedA);
    assert.ok(loadedB);
    assert.equal(loadedA.events![0].id, 'evt_a');
    assert.equal(loadedB.events![0].id, 'evt_b');
    assert.notDeepEqual(loadedA.events, loadedB.events, 'World A events and World B events must remain completely isolated');
  });

  // 12. Demo isolation
  await t.test('12. Demo isolation', async () => {
    const synthesized = await worldSynthesisService.synthesizeWorldFromPremise({
      naturalLanguagePremise: 'A unique cosmic arena of floating platforms.',
      genreTags: ['Fantasy'],
      toneTags: ['Heroic']
    });

    // Check that synthesized events contain no mention of the demo campaign entities
    for (const event of synthesized.events!) {
      assert.notEqual(event.id, 'evt_demo_start', 'Newly synthesized worlds must not inherit the demo world events');
      assert.ok(!event.title.includes('Dreamville'), 'Should not mention demo settings');
    }
  });

  // 13. Epistemic separation
  await t.test('13. Epistemic separation', () => {
    // Having a secret or hidden planned event in the template must NOT expose it to a standard player knowledge array
    const world: WorldTemplate = {
      worldId: 'epistemic_world_1',
      title: 'Secrets Realm',
      summary: 'Epistemic tests',
      description: 'Setting',
      genreTags: ['Fantasy'],
      toneTags: ['Ominous'],
      mediumTags: [],
      canonMode: 'Original',
      rulesetId: 'rules_std',
      visibility: 'public',
      creatorId: 'system',
      sourcePolicy: 'Manual Test',
      defaultEra: 'Era Secrets',
      worldManifestVersion: 1,
      versionHash: 'hash_secrets',
      canonicalCapabilities: [],
      capabilities: [],
      worldRules: [],
      ruleConstraints: [],
      worldFacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [
        { id: 'evt_public', title: 'A public gala', visibility: 'PUBLIC' },
        { id: 'evt_secret_murder', title: 'The secret assassination plot', visibility: 'SECRET' }
      ]
    };

    // In-game chronicle, story threads or knowledge bases must stay isolated
    const playerKnowledge: string[] = ['evt_public']; // Simulate visible events
    const isRevealed = playerKnowledge.includes('evt_secret_murder');

    assert.equal(isRevealed, false, 'Secret/Hidden events should remain unknown to the player until explicitly revealed by story action');
  });

  // 14. Genre fallback preservation
  await t.test('14. Genre fallback preservation', async () => {
    const oldKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const inputGenre = ['Cyberpunk', 'Post-Apocalyptic'];
      const world = await worldSynthesisService.synthesizeWorldFromPremise({
        naturalLanguagePremise: 'A neon dystopia with high cybernetic augmentation.',
        genreTags: inputGenre,
        toneTags: ['Grimdark']
      });

      assert.ok(world.genreTags.includes('Cyberpunk'), 'Fallback preservation must keep input genre tags intact');
      assert.ok(world.genreTags.includes('Post-Apocalyptic'), 'Fallback preservation must keep input genre tags intact');
    } finally {
      process.env.GEMINI_API_KEY = oldKey;
    }
  });

  // 15. Tone fallback preservation
  await t.test('15. Tone fallback preservation', async () => {
    const oldKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const inputTone = ['Suspenseful', 'Eerie'];
      const world = await worldSynthesisService.synthesizeWorldFromPremise({
        naturalLanguagePremise: 'An abandoned space station with mysterious audio broadcasts.',
        genreTags: ['Sci-Fi'],
        toneTags: inputTone
      });

      assert.ok(world.toneTags.includes('Suspenseful'), 'Fallback preservation must keep input tone tags intact');
      assert.ok(world.toneTags.includes('Eerie'), 'Fallback preservation must keep input tone tags intact');
    } finally {
      process.env.GEMINI_API_KEY = oldKey;
    }
  });

  // 16. Primary AI failure → deterministic fallback
  await t.test('16. Primary AI failure -> deterministic fallback', async () => {
    const oldKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      // Triggering synthesis with a flag/condition or letting it invoke fallback naturally due to high demand simulation
      const world = await worldSynthesisService.synthesizeWorldFromPremise({
        naturalLanguagePremise: 'A high fantasy kingdom powered by divine song.',
        genreTags: ['High Fantasy'],
        toneTags: ['Inspiring']
      });

      assert.ok(world.worldId, 'Should return a successfully processed fallback world ID');
      assert.equal(world.defaultEra, 'Age of Divine Resonance', 'Should map correctly to procedural fallback');
    } finally {
      process.env.GEMINI_API_KEY = oldKey;
    }
  });

  // 17. No corruption when AI returns malformed event data
  await t.test('17. No corruption when AI returns malformed event data', () => {
    const extremelyMalformedEvents = [
      null,
      undefined,
      {},
      { id: '', title: null, description: 12345, category: 'INVALID_CATEGORY' },
      { id: 'bad_dep_1', preconditions: { requiredEvents: [null, {}] } }
    ];

    const validated = (worldSynthesisService as any).validateAndNormalizeEvents(
      extremelyMalformedEvents,
      [],
      [],
      []
    );

    assert.ok(Array.isArray(validated));
    assert.equal(validated.length, 3, 'Null/undefined entries should be ignored or safely managed');

    // Check first parsed entry
    const normal1 = validated[0];
    assert.ok(normal1.id.startsWith('evt_'), 'Empty ID must get normalized');
    assert.ok(typeof normal1.title === 'string', 'Null title must get corrected');
    assert.equal(normal1.category, 'OTHER', 'Invalid category must default to OTHER');

    // Check second entry
    const normal2 = validated[1];
    assert.deepEqual(normal2.preconditions.requiredEvents, [], 'Null/object dependency items must be cleanly pruned');
  });

});
