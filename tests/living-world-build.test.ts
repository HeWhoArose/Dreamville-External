import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { WorldSynthesisService } from '../server/services/worldSynthesisService';
import { expandLocationStructure } from '../server/domain/locationArchetypes';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { SceneInteractionAuthority, resolveGroundedObservation } from '../server/domain/sceneInteractionAuthority';
import { WorldActivityDirector } from '../server/domain/worldActivityDirector';
import { WorldSimulationService } from '../server/simulation/worldSimulationService';
import { captureCanonicalStateSnapshot } from '../server/domain/canonicalSnapshot';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';
import { WorkingContextEngine, OPENING_CONTEXT_HARD_TOKEN_BUDGET } from '../server/domain/workingContextEngine';
import { SemanticNarrativeReview } from '../server/domain/semanticNarrativeReview';

const now = new Date().toISOString();

function parkNode(id = 'loc_park', overrides: any = {}) {
  const raw = {
    id,
    name: 'Greywater Park',
    regionId: 'Test District',
    description: 'A public park of gravel paths, trees, and a shallow pond.',
    coordinates: { x: 20, y: 20 },
    ambientSensory: 'Wind moves through the trees; water collects in the pond.',
    archetype: 'PARK',
    provenance: 'authored',
    ...overrides,
  };
  return {
    ...raw,
    ...expandLocationStructure(raw, { locationId: id, generateDefaults: true }),
  };
}

function worldFixture(nodes: any[], worldId = `world_living_${Date.now()}_${Math.random().toString(16).slice(2)}`) {
  return {
    worldId,
    worldManifestVersion: 1,
    title: 'Living World Fixture',
    summary: 'A structured test world.',
    description: 'A structured test world with canonical locations.',
    genreTags: ['Fantasy'],
    toneTags: ['Grounded'],
    mediumTags: ['Text Adventure'],
    canonMode: 'CANON_COMPLIANT',
    rulesetId: 'rules_living_world_test',
    dndRulesMode: 'LIGHT',
    visibility: 'private',
    creatorId: 'test',
    sourcePolicy: 'test fixtures',
    defaultEra: 'Cycle 42',
    versionHash: 'living-world-test-v1',
    canonicalCapabilities: [],
    capabilities: [],
    worldRules: [],
    ruleConstraints: [],
    worldFacts: [],
    createdAt: now,
    updatedAt: now,
    setting: 'Test Region',
    geography: { nodes, connections: [] },
    historyTimeline: [],
    canonKnowledge: [],
    startingHooks: [],
  };
}

function createStory(repository: InMemoryWorldRepository, world: any, locationId: string, suffix = '') {
  repository.saveWorldTemplate(world);
  const storyId = `story_living_${Date.now()}_${Math.random().toString(16).slice(2)}${suffix}`;
  repository.createStoryRunFromConfirmedCharacter({
    worldId: world.worldId,
    storyId,
    confirmedCharacter: {
      characterId: `char_${storyId}`,
      identity: { name: 'Tamsin Vey', species: 'Human' },
      role: { profession: 'Wanderer', archetype: 'Explorer' },
      background: { history: 'A traveller testing the world.' },
      appearance: { physicalDescription: 'Practical traveler.' },
      personality: { traits: ['observant'] },
      motivations: { goals: ['Understand the local situation.'] },
      condition: { injuries: [], activeEffects: [] },
      attributes: [],
      stats: [],
      traits: [],
      capabilities: [],
      generatedSkills: [],
      feats: [],
      titles: [],
      startingEquipment: { equipped: [], inventory: [], weapons: [], armor: [], tools: [], consumables: [] },
      startingLocation: { locationId, name: 'Greywater Park' },
      startingSituation: { summary: 'Arriving at the park.', hook: 'Find a way forward.' },
      startingLocationMode: 'CUSTOM',
      startingSituationMode: 'CUSTOM',
      startingState: {},
      provenance: {},
    } as any,
  });
  return storyId;
}

test('caller-provided geography keeps structured scene objects, environment, and occupancy through synthesis', async () => {
  const orchestrator = {
    async executeTaskGeneration() {
      return {
        source: 'DETERMINISTIC_FALLBACK',
        providerId: 'provider_deterministic_emergency',
        modelId: 'emergency-fallback-local',
        attempts: 1,
        text: '',
      };
    },
  };
  const service = new WorldSynthesisService(() => orchestrator as any);
  const authoredLocation = {
    id: 'loc_authored_sewer',
    name: 'Old Drain Underworks',
    description: 'A brick sewer with a channel and an access ladder.',
    coordinates: { x: 12, y: 8 },
    archetype: 'SEWER',
    sceneObjects: [
      { id: 'obj_authored_channel', name: 'brick drainage channel', kind: 'ENVIRONMENTAL_FEATURE', tags: ['channel', 'water'] },
      { id: 'obj_authored_ladder', name: 'rusted access ladder', kind: 'STRUCTURE', interactable: true, tags: ['ladder'] },
    ],
    environment: { terrain: 'Brick', lighting: 'DARK', features: ['brick drainage channel', 'rusted access ladder'], water: { present: true, drainage: true } },
    population: { status: 'UNKNOWN', expectedPopulation: 'VARIABLE', provenance: 'AUTHORED' },
  };

  const world = await service.synthesizeWorldFromPremise({
    naturalLanguagePremise: 'A rain-soaked city above an old sewer network.',
    geography: { locations: [authoredLocation] },
  });

  const projected = (world.geography.locations as any[]).find((location) => location.id === 'loc_authored_sewer');
  assert.ok(projected, 'authored location must survive synthesis');
  assert.equal(projected.archetype, 'SEWER');
  assert.deepEqual(projected.population, authoredLocation.population);
  assert.deepEqual(projected.environment, authoredLocation.environment);
  assert.deepEqual(projected.sceneObjects, authoredLocation.sceneObjects);

  const previewNode = (world.geography.nodes as any[]).find((node) => node.id === 'loc_authored_sewer');
  assert.ok(previewNode, 'preview geography must include the authored location');
  assert.deepEqual(previewNode.population, authoredLocation.population);
  assert.deepEqual(previewNode.sceneObjects, authoredLocation.sceneObjects);
  assert.deepEqual(previewNode.environment, authoredLocation.environment);
});

test('AI geography normalization preserves supplied scene objects and occupancy while expanding unspecified archetypes', () => {
  const service = new WorldSynthesisService(() => ({ executeTaskGeneration: async () => ({ text: '' }) } as any));
  const normalized = service.normalizeSynthesizedLocations([
    {
      id: 'loc_park_ai',
      name: 'Morrow Green',
      description: 'A public park.',
      archetype: 'PARK',
      sceneObjects: [{ id: 'authored_bench', name: 'carved stone bench', kind: 'STRUCTURE', interactable: true }],
      population: { status: 'ABANDONED', expectedPopulation: 'NONE', explanation: 'Evacuated after the collapse.', provenance: 'AUTHORED' },
      environment: { features: ['carved stone bench'], lighting: 'NATURAL' },
    },
    { id: 'loc_market_ai', name: 'Copper Row Market', description: 'A daily market.' },
  ], 'Test Region', 'seed');

  assert.equal(normalized.length, 2);
  const park = normalized[0];
  assert.deepEqual(park.sceneObjects.map((object: any) => object.name), ['carved stone bench'], 'authored objects must not be overwritten by archetype defaults');
  assert.equal(park.population.status, 'ABANDONED');
  assert.equal(park.population.explanation, 'Evacuated after the collapse.');

  const market = normalized[1];
  assert.equal(market.archetype, 'MARKET');
  assert.ok(market.sceneObjects.length >= 2, 'an unspecified generated market receives structured defaults');
  assert.equal(market.population.status, 'INHABITED');
});

test('deterministic fallback world generation produces structured locations', () => {
  const service = new WorldSynthesisService(() => ({ executeTaskGeneration: async () => ({ text: '' }) } as any));
  const candidate = service.buildDeterministicCandidate({
    naturalLanguagePremise: 'A fractured city of bronze and rain.',
  }, 'deterministic-test-seed');

  assert.ok(candidate.locations.length >= 3);
  for (const location of candidate.locations as any[]) {
    assert.ok(location.archetype, `${location.id} should declare an archetype`);
    assert.ok(location.population?.status, `${location.id} should declare occupancy`);
    assert.ok(Array.isArray(location.sceneObjects) && location.sceneObjects.length > 0, `${location.id} should have canonical scene objects`);
  }
});

test('StoryRun projection and canonical snapshot preserve structured location fields', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const park = parkNode();
  const world = worldFixture([park]);
  const storyId = createStory(repository, world, park.id);

  const projected = repository.getGeographyGraph(storyId).getNode(park.id) as any;
  assert.equal(projected.archetype, 'PARK');
  assert.deepEqual(projected.population, park.population);
  assert.deepEqual(projected.environment, park.environment);
  assert.ok(projected.sceneObjects.some((object: any) => object.name === 'fallen branch'));

  const snapshot = captureCanonicalStateSnapshot(storyId, repository);
  repository.restoreCanonicalStateSnapshot(snapshot);
  const restored = repository.getGeographyGraph(storyId).getNode(park.id) as any;
  assert.deepEqual(restored.sceneObjects, park.sceneObjects);
  assert.deepEqual(restored.environment, park.environment);
  assert.equal(restored.population.status, park.population.status);
});

test('search resolves against canonical scene objects without picking them up, and pickup persists', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const park = parkNode();
  const world = worldFixture([park]);
  const storyId = createStory(repository, world, park.id);
  const actorId = repository.getPlayerLifecycle(storyId)!.actorId;

  const search = SceneInteractionAuthority.resolve({
    repository,
    storyId,
    actorId,
    actionText: 'I search the park for a stick.',
    locationId: park.id,
  });
  assert.equal(search.kind, 'SEARCH');
  assert.equal(search.committed, false, 'searching must not pick up the object');
  assert.match(search.feedback || '', /fallen branch/);
  assert.equal(repository.getInventoryEngine(storyId).getActorInventory(actorId).length, 0);

  const pickup = SceneInteractionAuthority.resolve({
    repository,
    storyId,
    actorId,
    actionText: 'I pick up the fallen branch.',
    locationId: park.id,
  });
  assert.equal(pickup.kind, 'PICKUP');
  assert.equal(pickup.committed, true, pickup.errorReason);
  const inventory = repository.getInventoryEngine(storyId).getActorInventory(actorId);
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].name, 'fallen branch');
  assert.ok(!(repository.getGeographyGraph(storyId).getNode(park.id)!.sceneObjects || [])
    .some((object: any) => object.name === 'fallen branch'), 'picked up object must leave the canonical scene');

  const repeatSearch = SceneInteractionAuthority.resolve({
    repository,
    storyId,
    actorId,
    actionText: 'I search for another stick.',
    locationId: park.id,
  });
  assert.match(repeatSearch.feedback || '', /does not establish/);

  const snapshot = captureCanonicalStateSnapshot(storyId, repository);
  repository.restoreCanonicalStateSnapshot(snapshot);
  assert.ok(!(repository.getGeographyGraph(storyId).getNode(park.id)!.sceneObjects || [])
    .some((object: any) => object.name === 'fallen branch'), 'reload must not recreate the picked-up object');
  assert.equal(repository.getInventoryEngine(storyId).getActorInventory(actorId).length, 1);
});

test('search rejects absent and locked objects without inventing or taking them', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const site = parkNode('loc_restricted_store', {
    name: 'Sealed Records Office',
    description: 'A restricted records office.',
    archetype: 'RESTRICTED_SITE',
  });
  const world = worldFixture([site]);
  const storyId = createStory(repository, world, site.id);
  const actorId = repository.getPlayerLifecycle(storyId)!.actorId;

  const absent = SceneInteractionAuthority.resolve({
    repository, storyId, actorId,
    actionText: 'I search for a sword.',
    locationId: site.id,
  });
  assert.equal(absent.committed, false);
  assert.match(absent.feedback || '', /does not establish/);

  const locked = SceneInteractionAuthority.resolve({
    repository, storyId, actorId,
    actionText: 'I take the locked equipment cabinet.',
    locationId: site.id,
  });
  assert.equal(locked.committed, false);
  assert.match(locked.feedback || '', /locked/);
  assert.ok((repository.getGeographyGraph(storyId).getNode(site.id)!.sceneObjects || [])
    .some((object: any) => object.name === 'locked equipment cabinet'));
});

test('ambient population respects access control, uses location-specific generic identities, and is idempotent', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const streetA = parkNode('loc_street_a', {
    name: 'Alder Street',
    description: 'A residential street of doorways and lamps.',
    archetype: 'RESIDENTIAL_STREET',
  });
  const streetB = parkNode('loc_street_b', {
    name: 'Birch Street',
    description: 'Another residential street.',
    archetype: 'RESIDENTIAL_STREET',
  });
  const restricted = parkNode('loc_secure', {
    name: 'Sealed Ward',
    description: 'A restricted ward.',
    archetype: 'RESTRICTED_SITE',
  });
  const world = worldFixture([streetA, streetB, restricted]);
  const storyId = createStory(repository, world, streetA.id);

  const first = WorldActivityDirector.ensureAmbientPopulation(repository, storyId, streetA.id);
  const again = WorldActivityDirector.ensureAmbientPopulation(repository, storyId, streetA.id);
  const secondStreet = WorldActivityDirector.ensureAmbientPopulation(repository, storyId, streetB.id);
  assert.ok(first.length > 0);
  assert.equal(again.length, 0, 'repeated seeding must be idempotent');
  assert.ok(secondStreet.length > 0);
  assert.notDeepEqual(
    first.map((card: any) => card.name).sort(),
    secondStreet.map((card: any) => card.name).sort(),
    'unrelated locations should not reuse the same fixed roster',
  );

  const restrictedPeople = WorldActivityDirector.ensureAmbientPopulation(repository, storyId, restricted.id);
  assert.deepEqual(restrictedPeople, [], 'access-controlled locations must not receive ambient people');
});

test('advancing world time writes scheduled NPC movement into the scene projection', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const origin = parkNode('loc_sched_origin', { name: 'Guild Hall', description: 'A guild hall.', archetype: 'GUILD_HALL' });
  const destination = parkNode('loc_sched_destination', { name: 'Copper Market', description: 'A market.', archetype: 'MARKET' });
  const world = worldFixture([origin, destination]);
  const storyId = createStory(repository, world, origin.id);
  const service = new WorldSimulationService(repository);

  const clock = repository.getWorldClock(storyId);
  clock.importState({
    timestamp: { year: 42, month: 10, day: 14, hour: 8, minute: 0, second: 0, totalElapsedSeconds: 8 * 3600 },
    currentSeason: 'Autumn',
    currentDayPhase: 'Morning',
    timezoneOrRegion: 'Test',
  });
  repository.saveEntityCard(storyId, {
    id: 'npc_scheduled_runner',
    name: 'Alden Rook',
    kind: 'NPC',
    isTemplate: false,
    identity: { aliases: [] },
    classification: { role: 'courier' },
    personality: { traits: [], values: [], motivations: [], fears: [], desires: [] },
    behavior: {},
    social: { factionIds: [], reputation: {}, relationships: {} },
    worldState: { locationId: origin.id, currentActivity: 'idle', isAlive: true, presence: 'present' },
    traits: [],
    capabilities: [],
    feats: [],
    equipment: [],
    memoryRefs: [],
    provenance: { source: 'test', createdBy: 'SYSTEM' },
    lifecycle: { status: 'ACTIVE' },
    metadata: {},
  });
  repository.getLivingWorldSimulation(storyId).registerNpcSchedule({
    npcId: 'npc_scheduled_runner',
    name: 'Alden Rook',
    currentLocationId: origin.id,
    currentActivity: 'idle',
    fallbackActivity: 'idle',
    fallbackLocationId: origin.id,
    entries: [{
      id: 'workday',
      startHour: 9,
      endHour: 17,
      activity: 'working',
      targetLocationId: destination.id,
    }],
  });

  service.advanceTime(storyId, 2 * 3600);
  const card = repository.getEntityCard(storyId, 'npc_scheduled_runner') as any;
  assert.equal(card.worldState.locationId, destination.id, 'scheduled movement must reach the scene projection');
  assert.equal(card.worldState.currentActivity, 'working');
  assert.equal(card.worldState.presence, 'present');
});

test('grounded observation answers the crowded-place request from canonical occupancy and reports unknown occupancy honestly', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const market = parkNode('loc_crowd_market', {
    name: 'Lantern Market',
    description: 'A busy market square.',
    archetype: 'MARKET',
  });
  const unknown = parkNode('loc_unknown_room', {
    name: 'Sealed Antechamber',
    description: 'A chamber with no recorded occupancy.',
    archetype: 'GENERIC',
    population: { status: 'UNKNOWN', accessControlled: false, provenance: 'UNKNOWN' },
    sceneObjects: [],
    environment: { features: [] },
  });
  const world = worldFixture([market, unknown]);
  const storyId = createStory(repository, world, market.id);
  WorldActivityDirector.ensureAmbientPopulation(repository, storyId, market.id);

  const situation = CurrentSituationBuilder.build({ storyId, worldRepo: repository, playerAction: 'I look for a crowded place.' });
  assert.equal(situation.sceneEvidence.occupancy.status, 'INHABITED');
  assert.ok(situation.sceneEvidence.ambientActivity, 'inhabited occupancy must supply aggregate activity evidence');
  const observation = resolveGroundedObservation(situation, 'I look for a crowded place.');
  assert.equal(observation.relevant, true);
  assert.match(observation.text || '', /Canonical occupancy at Lantern Market: INHABITED/);
  assert.match(observation.text || '', /dense/i);
  assert.ok(observation.evidence.length > 0);

  const player = repository.getPlayerLifecycle(storyId)!;
  repository.updatePlayerLifecycle(storyId, player.copyWith({ locationId: unknown.id }));
  const unknownSituation = CurrentSituationBuilder.build({ storyId, worldRepo: repository, playerAction: 'I look around for a crowd.' });
  const unknownObservation = resolveGroundedObservation(unknownSituation, 'I look around for a crowd.');
  assert.match(unknownObservation.text || '', /UNKNOWN/);
  assert.match(unknownObservation.limitation || '', /does not establish a crowd/);
  assert.doesNotMatch(unknownObservation.text || '', /bustling|crowded with people/i);
});

test('investigating an established distress signal returns its known lead and an honest unknown-cause boundary', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const location = parkNode('loc_signal_perimeter', {
    name: 'Threshold of the Radiance',
    description: 'A broad stone threshold overlooks the outer approaches to Elysium Solar Citadel.',
    ambientSensory: 'The air carries the scent of native vegetation.',
    archetype: 'GENERIC',
  });
  const world = worldFixture([location]);
  const storyId = createStory(repository, world, location.id);
  const situation = CurrentSituationBuilder.build({
    storyId,
    worldRepo: repository,
    playerAction: 'I observe the perimeter trying to find for what reason why the beacon was lit.',
  });
  const observation = resolveGroundedObservation(
    situation,
    'I observe the perimeter trying to find for what reason why the beacon was lit.',
    ['A distress signal from a nearby settlement hints that the same void corruption has resurfaced.'],
  );

  assert.equal(observation.relevant, true);
  assert.match(observation.text || '', /distress signal from a nearby settlement/i);
  assert.match(observation.text || '', /void corruption has resurfaced/i);
  assert.match(observation.text || '', /cause remains unknown/i);
  assert.match(observation.limitation || '', /cause is not established/i);
  assert.doesNotMatch(observation.text || '', /the beacon was lit because/i);
});

test('unknown NPC names stay out of player-facing projections and prompts until identity is learned', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const market = parkNode('loc_identity_market', { name: 'Lantern Market', description: 'A market.', archetype: 'MARKET' });
  const world = worldFixture([market]);
  const storyId = createStory(repository, world, market.id);
  const actorId = repository.getPlayerLifecycle(storyId)!.actorId;
  repository.saveEntityCard(storyId, {
    id: 'npc_unknown_merchant',
    name: 'Mira Fen',
    kind: 'MERCHANT',
    isTemplate: false,
    identity: { aliases: [] },
    classification: { role: 'merchant' },
    personality: { traits: [], values: [], motivations: [], fears: [], desires: [] },
    behavior: {},
    social: { factionIds: [], reputation: {}, relationships: {} },
    worldState: { locationId: market.id, currentActivity: 'calling out wares', isAlive: true, presence: 'present' },
    traits: [],
    capabilities: [],
    feats: [],
    equipment: [],
    memoryRefs: [],
    provenance: { source: 'test', createdBy: 'SYSTEM' },
    lifecycle: { status: 'ACTIVE' },
    metadata: {},
  });

  const hidden = CurrentSituationBuilder.build({ storyId, worldRepo: repository });
  const hiddenEntity = hidden.nearbyEntities.find((entity) => entity.id === 'npc_unknown_merchant');
  assert.ok(hiddenEntity);
  assert.equal(hiddenEntity.identityKnown, false);
  assert.equal(hiddenEntity.name, 'Mira Fen');
  assert.equal(hiddenEntity.displayName, 'a merchant');
  assert.doesNotMatch(CurrentSituationBuilder.toPromptContext(hidden), /Mira Fen/);
  const safe = CurrentSituationBuilder.toPlayerSafeProjection(hidden);
  assert.doesNotMatch(JSON.stringify(safe.nearbyEntities), /Mira Fen/);

  repository.grantEntityIdentityKnowledge(storyId, actorId, 'npc_unknown_merchant', 'Mira Fen', 'told');
  const learned = CurrentSituationBuilder.build({ storyId, worldRepo: repository });
  const learnedEntity = learned.nearbyEntities.find((entity) => entity.id === 'npc_unknown_merchant');
  assert.equal(learnedEntity?.identityKnown, true);
  assert.equal(learnedEntity?.displayName, 'Mira Fen');
  assert.match(CurrentSituationBuilder.toPromptContext(learned), /Mira Fen/);
});

test('opening-scene evidence includes canonical scene objects and environment from the runtime geography', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const park = parkNode();
  const world = worldFixture([park]);
  const storyId = createStory(repository, world, park.id);
  const opening = WorkingContextEngine.assembleOpeningContext({
    storyId,
    worldRepo: repository,
    hardTokenBudget: OPENING_CONTEXT_HARD_TOKEN_BUDGET,
  });
  assert.ok(opening.rawOpeningFacts.location.sceneObjects?.some((object) => object.name === 'fallen branch'));
  assert.ok(opening.rawOpeningFacts.location.environment?.features.includes('gravel path'));
  assert.match(opening.assembledText, /STARTING_LOCATION_POPULATION_AND_VISIBLE_ACTIVITY/);
  assert.match(opening.assembledText, /fallen branch/);
  assert.match(opening.assembledText, /gravel path/);
});

test('malformed optional visual cues do not discard an otherwise valid turn package', () => {
  const orchestrator = new MultiModelOrchestrator(new InMemoryWorldRepository({ disablePersistence: true }));
  const validated = orchestrator.validateTurnPackage(JSON.stringify({
    narrative: ['The market answers with the ordinary movement of its traders.'],
    dialogue: [],
    events: [],
    stateChanges: [],
    memoryCandidates: [],
    audioCues: [null, { bad: true }, 'a bell rings'],
    visualCues: ['a crowded stall', { alt: 'no prompt' }, { prompt: 'a trader counting coins' }, 42],
  }));
  assert.equal(validated.valid, true, validated.errorReason);
  assert.deepEqual(validated.turnPackage?.visualCues, [
    'a crowded stall',
    { prompt: 'a trader counting coins' },
  ]);
  assert.deepEqual(validated.turnPackage?.audioCues, ['a bell rings']);
});

test('world geography and picked-up scene objects survive durable repository reload', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dreamville-living-world-'));
  const previous = process.env.DREAMBOOK_PERSISTENCE_PATH;
  process.env.DREAMBOOK_PERSISTENCE_PATH = join(root, 'data.json');
  try {
    const repository = new InMemoryWorldRepository();
    const park = parkNode();
    const world = worldFixture([park]);
    const storyId = createStory(repository, world, park.id);
    const actorId = repository.getPlayerLifecycle(storyId)!.actorId;
    const pickup = SceneInteractionAuthority.resolve({
      repository, storyId, actorId,
      actionText: 'I pick up the fallen branch.',
      locationId: park.id,
    });
    assert.equal(pickup.committed, true, pickup.errorReason);
    const run = repository.getStoryRun(storyId);
    assert.ok(run);
    repository.saveStoryRun(run);

    const reloaded = new InMemoryWorldRepository();
    const restoredNode = reloaded.getGeographyGraph(storyId).getNode(park.id) as any;
    assert.ok(restoredNode, 'story geography should restore');
    assert.equal(restoredNode.archetype, 'PARK');
    assert.ok(restoredNode.sceneObjects.some((object: any) => object.name === 'gravel path'));
    assert.ok(!restoredNode.sceneObjects.some((object: any) => object.name === 'fallen branch'), 'picked-up object must not reappear after reload');
    assert.equal(reloaded.getInventoryEngine(storyId).getActorInventory(actorId).length, 1);
  } finally {
    if (previous === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test('opening evidence and ordinary-turn evidence describe the same canonical scene', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const park = parkNode();
  const world = worldFixture([park]);
  const storyId = createStory(repository, world, park.id);

  const opening = WorkingContextEngine.assembleOpeningContext({
    storyId,
    worldRepo: repository,
    hardTokenBudget: OPENING_CONTEXT_HARD_TOKEN_BUDGET,
  });
  const situation = CurrentSituationBuilder.build({ storyId, worldRepo: repository });

  const openingObjectIds = (opening.rawOpeningFacts.location.sceneObjects || []).map((object) => object.id).sort();
  const turnObjectIds = situation.sceneObjects.filter((object) => object.visibleToPlayer).map((object) => object.id).sort();
  assert.deepEqual(openingObjectIds, turnObjectIds, 'the opening must see exactly the scene objects an ordinary turn sees');

  assert.deepEqual(
    opening.rawOpeningFacts.location.environment?.features || [],
    situation.sceneEvidence.environment?.features || [],
    'environment evidence must not diverge between the opening and ordinary turns',
  );
  assert.equal(
    opening.rawOpeningFacts.location.population?.status,
    situation.sceneEvidence.occupancy.status,
    'occupancy evidence must not diverge between the opening and ordinary turns',
  );
  assert.equal(
    opening.rawOpeningFacts.location.ambientActivity,
    situation.sceneEvidence.ambientActivity,
    'aggregate ambient activity must be identical in both projections',
  );
});

test('narration review and repair guidance never mutate canonical world state', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const park = parkNode();
  const world = worldFixture([park]);
  const storyId = createStory(repository, world, park.id);
  const actorId = repository.getPlayerLifecycle(storyId)!.actorId;

  const before = captureCanonicalStateSnapshot(storyId, repository);
  const situation = CurrentSituationBuilder.build({ storyId, worldRepo: repository, playerAction: 'I search the park for a stick.' });
  const intent = { action: 'I search the park for a stick.', interactionMode: 'OTHER' as const, speechIntent: false, movementIntent: false, observationIntent: true, explicitTargets: [], impliedTargets: [], confidence: 0.5, source: 'DETERMINISTIC' as const, originalText: 'I search the park for a stick.' };
  const plan = {
    turnId: 'turn-1',
    objective: 'Locate an object in the park.',
    immediateSteps: [],
    informationToReveal: [],
    entitiesToReact: [],
    continuityRequirements: [],
    forbiddenAssumptions: [],
    stateEffectsExpected: [],
    createdAt: new Date().toISOString(),
    expiresAfterNarration: true,
  } as any;
  const turnPackage = {
    narrative: ['The park offers gravel paths, water, and a fallen branch within reach.'],
    dialogue: [],
    events: [],
    stateChanges: [{ type: 'DELETE_PLAYER', targetId: actorId }],
    memoryCandidates: [],
    audioCues: [],
    visualCues: [],
  } as any;

  const review = SemanticNarrativeReview.review({ intent: intent as any, situation, plan, turnPackage });
  SemanticNarrativeReview.buildRewritePrompt({ intent: intent as any, situation, plan, turnPackage, review });
  resolveGroundedObservation(situation, 'I search the park for a stick.');
  const search = SceneInteractionAuthority.resolve({ repository, storyId, actorId, actionText: 'I search the park for a stick.', locationId: park.id });
  assert.equal(search.committed, false);

  const after = captureCanonicalStateSnapshot(storyId, repository);
  assert.deepEqual(
    JSON.parse(JSON.stringify(after)),
    JSON.parse(JSON.stringify(before)),
    'review, prompts, grounded observation and search must not change canonical state',
  );
});

test('a picked-up starter-world object stays gone across a full repository restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dreamville-starter-reload-'));
  const previous = process.env.DREAMBOOK_PERSISTENCE_PATH;
  process.env.DREAMBOOK_PERSISTENCE_PATH = join(root, 'data.json');
  try {
    const repository = new InMemoryWorldRepository();
    const storyId = 'default_story';
    const actorId = repository.getPlayerLifecycle(storyId)!.actorId;
    const before: any = repository.getGeographyGraph(storyId).getNode('loc_whispering_orrery');
    assert.ok(before.sceneObjects.some((object: any) => object.id === 'obj_orrery_brass_quadrant'));

    const pickup = SceneInteractionAuthority.resolve({
      repository,
      storyId,
      actorId,
      actionText: 'I pick up the brass quadrant.',
      locationId: 'loc_whispering_orrery',
    });
    assert.equal(pickup.committed, true, pickup.errorReason);
    const run = repository.getStoryRun(storyId);
    repository.saveStoryRun(run);

    // A real restart constructs a new repository over the same durable file.
    const restarted = new InMemoryWorldRepository();
    const after: any = restarted.getGeographyGraph(storyId).getNode('loc_whispering_orrery');
    assert.ok(
      !after.sceneObjects.some((object: any) => object.id === 'obj_orrery_brass_quadrant'),
      'restart must not restore a picked-up scene object from the authored starter topology',
    );
    assert.equal(
      restarted.getInventoryEngine(storyId).getActorInventory(actorId).filter((item) => item.name === 'brass quadrant').length,
      1,
      'the picked-up item must exist exactly once in the inventory after restart',
    );
    assert.ok(
      Array.isArray(after.sceneObjects) && after.sceneObjects.length > 0,
      'the rest of the authored scene must survive the restart',
    );
  } finally {
    if (previous === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = previous;
    rmSync(root, { recursive: true, force: true });
  }
});


test('current situation omits time-incompatible sensory claims without mutating authored location data', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const ambientSensory = 'Visual: First light over Elysium Solar Citadel. Sounds: Distant atmosphere. Scent: Native vegetation. Tactile: Firm earth.';
	const location = parkNode('loc_time_sensitive_threshold', {
		name: 'Threshold of the Radiance',
		description: 'A broad stone threshold overlooks the outer approaches to the citadel.',
		ambientSensory,
		archetype: 'GENERIC',
	});
	const world = worldFixture([location]);
	const storyId = createStory(repository, world, location.id, '_temporal_sensory');

	const clock = repository.getWorldClock(storyId);
	const afternoonState = clock.exportState();
	clock.importState({
		...afternoonState,
		timestamp: { ...afternoonState.timestamp, year: 42, month: 10, day: 14, hour: 17, minute: 42, second: 0 },
		currentDayPhase: 'Afternoon',
	});
	const afternoon = CurrentSituationBuilder.build({
		storyId,
		worldRepo: repository,
		playerAction: 'I rush towards the signal.',
	});
	const afternoonSensory = [
		afternoon.location.ambientSensory || '',
		...(afternoon.sceneEvidence.sensory || []),
	].join(' ');

	assert.doesNotMatch(afternoonSensory, /first light|daybreak|dawn|sunrise|morning/i);
	assert.doesNotMatch(afternoonSensory, /Visual:|Sounds:|Scent:|Tactile:/i);
	assert.match(afternoonSensory, /distant atmosphere/i);
	assert.match(afternoonSensory, /native vegetation/i);
	assert.match(afternoonSensory, /firm earth/i);
	assert.equal(repository.getGeographyGraph(storyId).getNode(location.id)?.ambientSensory, ambientSensory,
		'projection must not rewrite the canonical authored sensory field');

	const dawnState = clock.exportState();
	clock.importState({
		...dawnState,
		timestamp: { ...dawnState.timestamp, hour: 7, minute: 0, second: 0 },
		currentDayPhase: 'Dawn',
	});
	const dawn = CurrentSituationBuilder.build({
		storyId,
		worldRepo: repository,
		playerAction: 'I look across the threshold.',
	});
	assert.match(dawn.location.ambientSensory || '', /first light/i,
		'valid dawn imagery remains available when the canonical clock agrees');
});
