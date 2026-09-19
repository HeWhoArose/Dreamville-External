import test from 'node:test';
import assert from 'node:assert/strict';
import { worldRepository } from '../server/repositories/worldRepository';
import { WorldTemplate, ConfirmedCharacter } from '../src/types';

test('StoryRun Creation Slice 3 — Confirmed Character to Isolated StoryRun Verification', async (t) => {
  // Setup canonical test world template
  const worldId = 'world_slice3_test';
  const testWorld: WorldTemplate = {
    worldId,
    worldManifestVersion: 3,
    title: 'Caelum: Realm of Floating Isles',
    description: 'An archipelago of floating sky-islands hovering above an eternal tempest.',
    genreTags: ['High Fantasy', 'Sky Odyssey'],
    toneTags: ['Epic', 'Mysterious'],
    mediumTags: ['Cinematic'],
    defaultEra: 'Era of the Stormbreak',
    setting: 'Floating Isles',
    canonMode: 'CANON_COMPLIANT',
    rulesetId: 'rules_caelum_v3',
    capabilities: [
      {
        id: 'cap_gale_surge',
        name: 'Gale Surge',
        category: 'Magic',
        activationMode: 'instant',
        powerTier: 'Moderate',
        baseEnergyCost: 15,
        baseStrainCost: 5,
        description: 'Unleashes a concentrated blast of pressurized wind.',
        provenance: 'WORLD_CANON',
      },
    ],
    geography: {
      nodes: [
        {
          id: 'loc_windward_haven',
          name: 'Windward Haven',
          region: 'Northern Spire',
          description: 'A bustling skyship port perched on the edge of a cloud cliff.',
          coordinates: { x: 50, y: 100 },
        },
        {
          id: 'loc_sunken_tempest',
          name: 'Sunken Tempest',
          region: 'The Veil Below',
          description: 'A perpetual storm vortex churning beneath the floating crags.',
          coordinates: { x: 200, y: 350 },
        },
      ],
      connections: [
        {
          fromId: 'loc_windward_haven',
          toId: 'loc_sunken_tempest',
          travelMode: 'AIRSHIP',
          dangerLevel: 4,
          distance: 120,
        },
      ],
    },
    worldRules: [
      {
        ruleId: 'rule_aether_buoyancy',
        category: 'PHYSICS',
        description: 'Islands remain aloft through resonant aether stones.',
        isHardConstraint: true,
      },
    ],
    events: [
      {
        eventId: 'evt_celestial_eclipse',
        name: 'The Great Celestial Eclipse',
        description: 'A dark moon aligns with the sun, silencing aether stones for one hour.',
        scheduledTurn: 50,
        triggerType: 'ABSOLUTE_TIME',
        consequences: ['Loss of altitude across all peripheral islands.'],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  worldRepository.saveWorldTemplate(testWorld);

  // Setup canonical Confirmed Character
  const confirmedCharacter: ConfirmedCharacter = {
    characterId: 'char_valerius_001',
    worldId: testWorld.worldId,
    worldVersion: testWorld.worldManifestVersion, // Pinned to version 3
    confirmedAt: new Date().toISOString(),
    identity: {
      name: 'Valerius Stormcaller',
      aliases: ['The Cloudstrider'],
      species: 'Human',
      gender: 'Male',
      age: '29',
    },
    role: {
      archetype: 'Spellblade',
      profession: 'Skyship Vanguard',
      role: 'PROTAGONIST',
    },
    background: {
      history: 'Born amidst the high spires, trained to guard the aether-rigging of sky cruisers.',
      socialOrigin: 'Sailor Guild of the Upper Reaches',
      notableEvents: ['Survived the Shattering of the Zephyr Fleet'],
    },
    appearance: {
      physicalDescription: 'Lean and wind-burned with silver streaks through raven hair.',
      distinguishingTraits: ['Scar across left brow', 'Gilded aether feather in lapel'],
    },
    personality: {
      traits: ['Alert', 'Decisive', 'Pragmatic'],
      quirks: ['Always tests the wind with a wet fingertip before entering a room'],
      speechStyle: 'Direct and crisp',
    },
    motivations: {
      goals: ['Reclaim the lost logbook of the Zephyr'],
      fears: ['Falling into the abyssal gloom beneath the clouds'],
      desires: ['Discover what lies beneath the endless tempest'],
    },
    relationships: {
      allies: ['Captain Corvus of the Gale Finch'],
      rivals: ['Ensign Vane of the Iron Corsairs'],
      family: ['Sister Mara, celestial cartographer'],
      factions: ['Skyship Cartographers Guild'],
    },
    condition: {
      injuries: [],
      curses: [],
      forms: [],
      specialStates: ['Resonant with wind aether'],
    },
    capabilities: [
      {
        id: 'cap_gale_surge',
        name: 'Gale Surge',
        category: 'Magic',
        activationMode: 'instant',
        powerTier: 'Moderate',
        baseEnergyCost: 15,
        baseStrainCost: 5,
        description: 'Unleashes a concentrated blast of pressurized wind.',
        provenance: 'CONFIRMED_CHARACTER',
      },
    ],
    generatedSkills: [
      {
        id: 'skill_aether_parry',
        name: 'Aether Parry',
        domain: 'Combat',
        type: 'TECHNIQUE',
        description: 'Deflects incoming energy projectiles using an aether-infused blade.',
        provenance: 'GENERATED_RULESET',
      },
    ],
    startingEquipment: {
      equipped: [
        {
          id: 'item_aether_saber',
          name: 'Aether Saber',
          category: 'WEAPON',
          slot: 'mainHand',
          rarity: 'Uncommon',
          description: 'A slender rapier vibrating with atmospheric kinetic energy.',
          quantity: 1,
        },
        {
          id: 'item_vanguard_coat',
          name: 'Vanguard Flight Coat',
          category: 'ARMOR',
          slot: 'chest',
          rarity: 'Common',
          description: 'Reinforced leather coat insulated against high-altitude chill.',
          quantity: 1,
        },
      ],
      inventory: [
        {
          id: 'item_grappling_cable',
          name: 'Pneumatic Grappling Cable',
          category: 'TOOL',
          rarity: 'Common',
          description: 'High-tensile cord with spring-loaded anchor claw.',
          quantity: 1,
        },
        {
          id: 'item_wind_elixir',
          name: 'Draft of Swift Wind',
          category: 'CONSUMABLE',
          rarity: 'Common',
          description: 'Restores 25 energy points upon ingestion.',
          quantity: 2,
        },
      ],
      weapons: ['Aether Saber'],
      armor: ['Vanguard Flight Coat'],
      tools: ['Pneumatic Grappling Cable'],
      consumables: ['Draft of Swift Wind (x2)'],
    },
    startingLocation: {
      locationId: 'loc_windward_haven',
      name: 'Windward Haven',
      region: 'Northern Spire',
      description: 'A bustling skyship port perched on the edge of a cloud cliff.',
    },
    startingSituation: {
      summary: 'Preparing to disembark at Windward Haven amidst gathering gale winds.',
      hook: 'An urgent dispatch awaits at the dockmaster office regarding the Zephyr logbook.',
      initialConditions: 'Vigilant and prepared for high-altitude weather.',
      whyHereNow: 'Following an anonymous lead on the missing fleet archives.',
    },
    portraitAsset: {
      emoji: '🌪️',
      promptFallback: 'Portrait of Valerius Stormcaller, skyship vanguard in a flight coat',
      isFallback: true,
      status: 'ready',
    },
    provenance: {
      source: 'SCRATCH',
      characterConceptSummary: 'A skilled skyship vanguard seeking a lost logbook',
    },
  };

  // Register confirmed character
  worldRepository.saveConfirmedCharacter(testWorld.worldId, confirmedCharacter);

  // 1. ATOMIC STORYRUN CREATION & VERSION PINNING
  let createdStoryId = '';
  await t.test('1. Atomic creation pins world version and binds starting state', () => {
    const result = worldRepository.createStoryRunFromConfirmedCharacter({
      worldId: testWorld.worldId,
      confirmedCharacter,
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND',
    });

    assert.ok(result, 'Creation result must exist');
    assert.ok(result.storyId, 'Must generate unique storyId');
    assert.ok(result.run, 'Must return StoryRun object');
    createdStoryId = result.storyId;

    const run = result.run;
    assert.equal(run.id, result.storyId, 'Run id must match storyId');
    assert.equal(run.worldId, testWorld.worldId, 'Run must record worldId');
    // Pinning verification
    assert.equal(run.worldVersion, testWorld.worldManifestVersion, 'World version must be pinned to manifest version');
    assert.equal(run.worldVersion, 3, 'Must match exact pinned integer version 3');
    assert.equal(run.characterName, 'Valerius Stormcaller', 'Character name must match');
    assert.equal(run.characterRole, 'Skyship Vanguard', 'Character role must match');
    assert.equal(run.currentLocationId, 'loc_windward_haven', 'Starting location must be bound');
    assert.equal(run.storyMode, 'PROTAGONIST', 'Story mode must be bound');
    assert.equal(run.activeCharacterId, confirmedCharacter.characterId, 'Must record active characterId');
  });

  // 2. PLAYER LIFECYCLE STATE BINDING
  await t.test('2. PlayerLifecycle reflects confirmed character state with no default fallback', () => {
    const player = worldRepository.getPlayerLifecycle(createdStoryId);
    assert.ok(player, 'Player lifecycle must exist for the new story run');
    assert.equal(player.name, 'Valerius Stormcaller', 'Player name matches confirmed character');
    assert.equal(player.locationId, 'loc_windward_haven', 'Location is bound to starting location');
    assert.deepEqual(Array.from(player.discoveredLocationIds), ['loc_windward_haven'], 'Epistemic boundary starts strictly at starting location');

    // Run-level metadata holds the rich confirmed character details
    const run = worldRepository.getStoryRun(createdStoryId);
    assert.equal(run?.characterRole, 'Skyship Vanguard', 'Run records confirmed character role');
    assert.ok(run?.characterBackground.includes('Zephyr Fleet'), 'Background history is preserved on run');
    assert.ok(run?.startingSituation.initialConditions.includes('Vigilant'), 'Initial situation condition is bound');
    assert.equal(run?.characterPortraitEmoji, '🌪️', 'Portrait emoji is preserved on run');
  });

  // 3. GEOGRAPHY GRAPH & KNOWLEDGE BOUNDARY INITIALIZATION
  await t.test('3. Geography and knowledge boundary initialized from world definition', () => {
    const geo = worldRepository.getGeography(createdStoryId);
    assert.ok(geo, 'GeographyGraph must be instantiated for the run');
    const startNode = geo.getNode('loc_windward_haven');
    assert.ok(startNode, 'Starting node must exist in geography');
    assert.equal(startNode?.name, 'Windward Haven', 'Node name must match');

    const secondNode = geo.getNode('loc_sunken_tempest');
    assert.ok(secondNode, 'Secondary node must exist in geography');

    const currentLocationId = worldRepository.getCurrentLocation(createdStoryId);
    assert.equal(currentLocationId, 'loc_windward_haven', 'Canonical current location is the starting location');
  });

  // 4. RUN CHRONOLOGY & INAUGURAL HISTORICAL CHRONICLE (NO UNPLANNED WORLD EVENTS)
  await t.test('4. Run chronology initialized without executing planned world events', () => {
    const clock = worldRepository.getWorldClock(createdStoryId);
    assert.ok(clock, 'WorldClock must be initialized for run');
    assert.ok(clock.getAbsoluteTime() >= 0, 'Clock must have initial time');

    const chronicle = worldRepository.getHistoricalChronicleEngine(createdStoryId);
    assert.ok(chronicle, 'HistoricalChronicleEngine must be instantiated');
    const entries = chronicle.getTimeline();
    assert.ok(entries.length >= 1, 'Inaugural genesis chronicle entry must be recorded');

    // Verify inaugural event is creation / arrival, NOT planned world events
    const inaugural = entries[0];
    assert.ok(
      inaugural.headline.includes('Awakened in') || inaugural.historicalAccount?.includes('Windward Haven') || inaugural.headline.includes('Genesis'),
      'First chronicle event records character arrival/launch'
    );

    // Verify that future planned world event (evt_celestial_eclipse scheduledTurn 50) is NOT executed
    const hasExecutedEclipse = entries.some((e: any) => e.headline?.includes('Celestial Eclipse') || e.historicalAccount?.includes('Celestial Eclipse'));
    assert.equal(hasExecutedEclipse, false, 'Planned world events must NOT be executed at genesis');
  });

  // 5. INVENTORY ENGINE & EQUIPMENT INITIALIZATION
  await t.test('5. Inventory and equipment state faithfully mapped from starting equipment', () => {
    const inv = worldRepository.getInventoryEngine(createdStoryId);
    assert.ok(inv, 'InventoryItemEngine must be initialized');

    // Check equipped items
    const equipped = inv.getEquippedItems();
    assert.ok(equipped.length >= 1, 'Must have equipped items');
    const weapon = equipped.find((i: any) => i.slot === 'mainHand' || i.name === 'Aether Saber');
    assert.ok(weapon, 'Aether Saber must be equipped in mainHand slot');

    // Check backpack items
    const inventoryItems = inv.getInventoryItems();
    assert.ok(inventoryItems.length >= 1, 'Must have items in backpack');
    const cable = inventoryItems.find((i: any) => i.name.includes('Grappling Cable'));
    assert.ok(cable, 'Grappling cable must be in inventory');
  });

  // 6. CAPABILITY ENGINE REGISTRATION
  await t.test('6. CapabilityEngine registered with confirmed capabilities and techniques', () => {
    const capEngine = worldRepository.getCapabilityEngine(createdStoryId);
    assert.ok(capEngine, 'CapabilityEngine must be initialized');

    const gale = capEngine.getCapability('cap_gale_surge');
    assert.ok(gale, 'Gale Surge capability must be registered');
    assert.equal(gale?.activationMode, 'instant', 'Activation mode must match');
    assert.equal(gale?.powerTier, 'Moderate', 'Power tier must match');
  });

  // 7. STRICT STATE ISOLATION (RUN A DOES NOT POLLUTE RUN B OR DEFAULT_STORY)
  await t.test('7. Strict state isolation between independent StoryRuns and default_story', () => {
    // Create a second StoryRun with a different character in the same world
    const charTwo: ConfirmedCharacter = {
      ...confirmedCharacter,
      characterId: 'char_second_002',
      identity: {
        name: 'Lyra Moonshade',
        species: 'Elf',
        gender: 'Female',
        age: '140',
      },
      role: {
        archetype: 'Shadow Adept',
        profession: 'Night Infiltrator',
        role: 'PROTAGONIST',
      },
    };

    const runTwoResult = worldRepository.createStoryRunFromConfirmedCharacter({
      worldId: testWorld.worldId,
      confirmedCharacter: charTwo,
      storyMode: 'PROTAGONIST',
    });

    const storyTwoId = runTwoResult.storyId;
    assert.notEqual(createdStoryId, storyTwoId, 'Story IDs must be distinct');

    // Advance clock on Run 1
    const clock1 = worldRepository.getWorldClock(createdStoryId);
    const clock2 = worldRepository.getWorldClock(storyTwoId);
    const clockDefault = worldRepository.getWorldClock('default_story');

    const t1Initial = clock1.getAbsoluteTime();
    const t2Initial = clock2.getAbsoluteTime();
    const tDefInitial = clockDefault.getAbsoluteTime();

    clock1.advanceSeconds(3600); // Advance 1 hour in Run 1

    assert.equal(clock1.getAbsoluteTime(), t1Initial + 3600, 'Clock 1 advanced by 3600s');
    assert.equal(clock2.getAbsoluteTime(), t2Initial, 'Clock 2 was NOT mutated by Clock 1');
    assert.equal(clockDefault.getAbsoluteTime(), tDefInitial, 'Default story clock was NOT mutated by Clock 1');

    // Modify player lifecycle in Run 1
    const player1 = worldRepository.getPlayerLifecycle(createdStoryId);
    const player2 = worldRepository.getPlayerLifecycle(storyTwoId);
    assert.equal(player1?.name, 'Valerius Stormcaller');
    assert.equal(player2?.name, 'Lyra Moonshade');

    // Verify non-existent storyId does not fall back to default_story
    const nonExistent = worldRepository.getPlayerLifecycle('ghost_run_non_existent');
    assert.equal(nonExistent, null, 'Non-existent run must return null, not fall back to default_story');
  });

  // 8. ATOMIC ROLLBACK ON INITIALIZATION FAILURE
  await t.test('8. Atomic rollback on corrupted or invalid starting configuration', () => {
    const invalidChar: ConfirmedCharacter = {
      ...confirmedCharacter,
      characterId: 'char_corrupted_003',
      startingLocation: {
        locationId: 'loc_abyssal_void_does_not_exist',
        name: 'Void',
        region: 'Nowhere',
        description: 'Broken',
      },
    };

    const initialRunCount = worldRepository.getAllStoryRuns().length;

    assert.throws(
      () => {
        worldRepository.createStoryRunFromConfirmedCharacter({
          worldId: testWorld.worldId,
          confirmedCharacter: invalidChar,
        });
      },
      /Starting location.*does not exist in world.*geography/,
      'Must throw descriptive error on invalid starting location'
    );

    const postRunCount = worldRepository.getAllStoryRuns().length;
    assert.equal(postRunCount, initialRunCount, 'Corrupted run must be rolled back atomically');
  });

  // 9. PERSISTENCE & RETRIEVAL
  await t.test('9. StoryRun is retrievable by ID with full metadata intact', () => {
    const retrieved = worldRepository.getStoryRun(createdStoryId);
    assert.ok(retrieved, 'Must be able to retrieve StoryRun');
    assert.equal(retrieved?.id, createdStoryId);
    assert.equal(retrieved?.worldVersion, 3, 'Pinned version is persisted');
    assert.equal(retrieved?.characterName, 'Valerius Stormcaller');
    assert.equal(retrieved?.activeCharacterId, confirmedCharacter.characterId);
  });
});
