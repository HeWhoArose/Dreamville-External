import test from 'node:test';
import assert from 'node:assert/strict';
import { worldSynthesisService } from '../server/services/worldSynthesisService';
import { WorldSynthesisInput } from '../src/types';

test('World Synthesis Repair 2: Comprehensive Architecture Verification Suite', async (t) => {
  // Test 1: Seed reproducibility
  await t.test('1. Same premise + same seed produces reproducible deterministic candidate', async () => {
    const inputA: WorldSynthesisInput = {
      naturalLanguagePremise: 'A submerged coral kingdom with bioluminescent tides and ancient siren councils.',
      generationSeed: 'seed_repro_12345',
      genreTags: ['Fantasy'],
      toneTags: ['Mysterious']
    };

    const inputB: WorldSynthesisInput = {
      naturalLanguagePremise: 'A submerged coral kingdom with bioluminescent tides and ancient siren councils.',
      generationSeed: 'seed_repro_12345',
      genreTags: ['Fantasy'],
      toneTags: ['Mysterious']
    };

    const worldA = await worldSynthesisService.synthesizeWorldFromPremise(inputA);
    const worldB = await worldSynthesisService.synthesizeWorldFromPremise(inputB);

    assert.equal(worldA.title, worldB.title, 'Titles should be identical for identical seed');
    assert.equal(worldA.setting, worldB.setting, 'Settings should be identical for identical seed');
    assert.deepEqual(worldA.geography.locations.map(l => l.name), worldB.geography.locations.map(l => l.name), 'Locations should be identical');
    assert.deepEqual(worldA.factions.map(f => f.name), worldB.factions.map(f => f.name), 'Factions should be identical');
    assert.equal(worldA.events?.length, worldB.events?.length, 'Event counts should match');
  });

  // Test 2: Seed-driven variation
  await t.test('2. Same premise + different seed produces varied candidate structures', async () => {
    const inputA: WorldSynthesisInput = {
      naturalLanguagePremise: 'An iron wasteland ruled by rival clockwork warlords battling for geothermal springs.',
      generationSeed: 'seed_alpha_111',
      genreTags: ['Steampunk'],
      toneTags: ['Gritty']
    };

    const inputB: WorldSynthesisInput = {
      naturalLanguagePremise: 'An iron wasteland ruled by rival clockwork warlords battling for geothermal springs.',
      generationSeed: 'seed_beta_999',
      genreTags: ['Steampunk'],
      toneTags: ['Gritty']
    };

    const worldA = await worldSynthesisService.synthesizeWorldFromPremise(inputA);
    const worldB = await worldSynthesisService.synthesizeWorldFromPremise(inputB);

    assert.notEqual(worldA.title, worldB.title, 'Different seeds should vary title or flavor');
    assert.notDeepEqual(worldA.geography.locations.map(l => l.name), worldB.geography.locations.map(l => l.name), 'Different seeds should vary location names');
  });

  // Test 3: Complete removal of legacy fixture fallbacks
  await t.test('3. Complete removal of legacy hardcoded fixture fallbacks across varied premises', async () => {
    const premises = [
      'A world made entirely of blown glass and crystal harmonics.',
      'A world engulfed in dense jungle vines and colossal primordial trees.',
      'A nocturnal city wrapped in perpetual shadow and spectral fog.',
      'A spaceborne orbital shipyard maintaining interstellar warp relays.',
      'A celestial temple orchestra where sound weaves physical matter.'
    ];

    const bannedLegacyNames = [
      'Glassbound Horizon',
      'Obsidian Glass Spire',
      'Verdant Reclamation',
      'World Root',
      'Gloomspire',
      'Obsidian Cathedral',
      'Vanguard Star-Terraces',
      'Sacred Chord'
    ];

    for (let i = 0; i < premises.length; i++) {
      const world = await worldSynthesisService.synthesizeWorldFromPremise({
        naturalLanguagePremise: premises[i],
        generationSeed: `test_fixture_ban_${i}`
      });

      const serialized = JSON.stringify(world);
      for (const banned of bannedLegacyNames) {
        assert.ok(
          !serialized.includes(banned),
          `Synthesized world for "${premises[i]}" must not contain legacy fixture string "${banned}"`
        );
      }
    }
  });

  // Test 4: Event quantity enforcement (5–10 events)
  await t.test('4. Event quantity is strictly bounded between 5 and 10 events with causal integrity', async () => {
    const world = await worldSynthesisService.synthesizeWorldFromPremise({
      naturalLanguagePremise: 'A desert planet where wandering dunes reveal forgotten robotic relics.',
      generationSeed: 'seed_desert_events_55'
    });

    assert.ok(world.events, 'Events must exist');
    assert.ok(world.events.length >= 5, `Event count must be >= 5, got ${world.events.length}`);
    assert.ok(world.events.length <= 10, `Event count must be <= 10, got ${world.events.length}`);

    // Verify scheduled times >= Day 14
    for (const evt of world.events) {
      assert.ok(evt.id, 'Event must have ID');
      assert.ok(evt.title, 'Event must have title');
      assert.ok(evt.locationId, 'Event must have locationId');
      assert.ok(evt.scheduledTime.day >= 14, 'Scheduled time must start on or after Day 14');
      assert.ok(['PUBLIC', 'SECRET', 'HIDDEN'].includes(evt.visibility), 'Visibility must be valid');
      assert.ok(Array.isArray(evt.plannedConsequences) && evt.plannedConsequences.length > 0, 'Must have planned consequences');
    }
  });

  // Test 5: Provenance and generation metadata
  await t.test('5. WorldTemplate provenance records generationSeed and execution metadata', async () => {
    const seed = 'seed_provenance_check_42';
    const world = await worldSynthesisService.synthesizeWorldFromPremise({
      naturalLanguagePremise: 'A floating archipelago above an endless storm.',
      generationSeed: seed
    });

    assert.ok(world.provenance, 'Provenance must be recorded');
    assert.equal(world.provenance.generationSeed, seed, 'Generation seed must match in provenance');
    assert.ok(world.provenance.generationSource, 'generationSource must be defined');
    assert.ok(world.provenance.providerId, 'providerId must be defined');
    assert.ok(world.provenance.modelId, 'modelId must be defined');
  });
});
