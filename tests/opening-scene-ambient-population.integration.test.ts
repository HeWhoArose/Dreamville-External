import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { OpeningSceneService } from '../server/services/openingSceneService';

function buildOpeningRig(storyId: string, locationName: string, population: any) {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const locationId = 'loc_opening_population_' + storyId;
  const worldId = 'world_opening_population_' + storyId;
  const now = new Date().toISOString();

  repository.saveWorldTemplate({
    worldId,
    worldManifestVersion: 1,
    title: 'Elysium Test World',
    summary: 'A city world for opening-scene population integration tests.',
    description: 'A lived-in realm with public citadels and controlled archives.',
    genreTags: ['Fantasy'],
    toneTags: ['Grounded'],
    mediumTags: ['Text Adventure'],
    canonMode: 'CANON_COMPLIANT',
    rulesetId: 'rules_opening_population_test',
    dndRulesMode: 'LIGHT',
    visibility: 'private',
    creatorId: 'test',
    sourcePolicy: 'test fixtures',
    defaultEra: 'Cycle 42',
    versionHash: 'opening-population-test-v1',
    canonicalCapabilities: [],
    capabilities: [],
    worldRules: [],
    ruleConstraints: [],
    worldFacts: [],
    createdAt: now,
    updatedAt: now,
    setting: 'Elysium',
    geography: {
      nodes: [{
        id: locationId,
        name: locationName,
        region: 'Elysium',
        description: 'Pale stone corridors and a broad public forecourt.',
        coordinates: { x: 50, y: 50 },
        ambientSensory: 'Footsteps and conversation carry through the pale stone arcade.',
        population,
      }],
      connections: [],
    },
    historyTimeline: [],
    canonKnowledge: [],
    startingHooks: [],
  } as any);

  const confirmedCharacter = {
    characterId: 'char_' + storyId,
    draftId: 'draft_' + storyId,
    worldId,
    storyMode: 'PROTAGONIST',
    worldVersion: 1,
    confirmedAt: now,
    sourceDescription: 'Opening population integration fixture.',
    identity: { name: 'Hero Vael', species: 'Human' },
    appearance: { physicalDescription: 'A traveler in practical clothes.' },
    personality: { traits: ['observant', 'patient'] },
    background: { history: 'A traveler arriving in Elysium.' },
    role: { profession: 'Adventurer', archetype: 'Adventurer' },
    motivations: { goals: ['Understand what work is available in the citadel.'] },
    relationships: {},
    condition: { injuries: [], activeEffects: [] },
    attributes: [],
    stats: [],
    traits: [],
    capabilities: [],
    generatedSkills: [],
    feats: [],
    titles: [],
    startingEquipment: { equipped: [], inventory: [], weapons: [], armor: [], tools: [], consumables: [] },
    startingLocation: { locationId, name: locationName, region: 'Elysium', description: 'Pale stone public corridors.' },
    startingSituation: {
      summary: 'Arriving to find out what work or duties are available inside the citadel.',
      hook: 'The traveler needs a grounded lead on available work.',
      objective: 'Find out what work or duties are available.',
    },
    startingLocationMode: 'CUSTOM',
    startingSituationMode: 'CUSTOM',
    startingState: {},
    provenance: {},
  };

  repository.createStoryRunFromConfirmedCharacter({ worldId, confirmedCharacter: confirmedCharacter as any, storyId });
  const orchestrator = repository.getAiOrchestrator();
  const prompts: Array<{ task: string; prompt: string }> = [];

  (orchestrator as any).executeTaskGeneration = async (task: string, prompt: string, _system: string, options: any) => {
    prompts.push({ task, prompt });
    const people = repository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card: any) =>
      card.metadata?.ambientPopulation === true &&
      card.worldState?.locationId === locationId &&
      card.worldState?.isAlive !== false &&
      card.worldState?.presence === 'present'
    );
    const peopleDescription = people.length
      ? people.map((person: any) => `${person.name} is ${person.worldState.currentActivity || person.behavior?.defaultBehavior || 'going about their work'}.`).join(' ')
      : 'No visible occupants are established by the canonical scene projection; unknown occupancy is not proof of abandonment.';
    const prose = [
      `At Cycle 42, Hero Vael stands within ${locationName}, where footsteps and conversation carry through the pale stone arcade. The broad forecourt connects the public walkways, and the traveler pauses long enough to take in who is actually present.`,
      `${peopleDescription} These people and their recorded activities make the setting more than a painted backdrop; each remains occupied with the work or purpose already projected for this location.`,
      'Vael keeps the immediate question in view: what work or duties are available here. The living activity offers concrete details to ask about or observe, but it does not decide whom Vael approaches or what the traveler chooses to do next.',
    ].join('\n\n');
    const text = JSON.stringify({
      narrativeText: prose,
      structuredEvents: [
        { type: 'location', text: locationName },
        { type: 'normal', text: peopleDescription },
        { type: 'action', text: 'Hero Vael pauses to observe the activity already present in the citadel.' },
        { type: 'normal', text: 'The question of available work remains unresolved.' },
      ],
    });
    const validation = typeof options?.validateResponse === 'function' ? options.validateResponse(text) : { valid: true };
    if (!validation?.valid) throw new Error(validation?.errorReason || 'Fixture output failed the task validator.');
    return {
      text,
      source: 'AI_PRIMARY',
      providerId: 'test-fixture',
      modelId: 'opening-population-fixture',
      attempts: 1,
      attemptsTrail: [],
    };
  };

  return { repository, locationId, worldId, orchestrator, prompts };
}

test('opening scene seeds and projects canonical ambient people before generating a public citadel opening', async () => {
  const storyId = 'opening_population_public_' + Date.now();
  const rig = buildOpeningRig(
    storyId,
    'Elysium Solar Citadel',
    { status: 'UNKNOWN', expectedPopulation: 'VARIABLE', provenance: 'UNKNOWN' },
  );

  const opening = await OpeningSceneService.generateOpeningScene({
    storyId,
    worldRepo: rig.repository,
    allowDeterministicFallback: true,
  });

  const people = rig.repository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card: any) =>
    card.metadata?.ambientPopulation === true && card.worldState?.locationId === rig.locationId
  );
  assert.equal(people.length, 2, 'a public citadel with unknown occupancy should use the existing deterministic population policy');
  const totalCanonicalPeople = rig.repository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card: any) =>
    ['NPC', 'MERCHANT', 'CHARACTER', 'FACTION_MEMBER'].includes(card.kind) &&
    card.worldState?.locationId === rig.locationId &&
    card.worldState?.isAlive !== false &&
    card.worldState?.presence === 'present' &&
    card.kind !== 'PLAYER'
  );
  assert.ok(totalCanonicalPeople.length >= 2, 'the location should expose at least two canonical non-player occupants rather than counting the protagonist as local population');
  assert.ok(people.every((person: any) => person.worldState.presence === 'present' && person.worldState.isAlive));
  assert.ok(people.every((person: any) => opening.narrativeText.includes(person.name)), 'the final opening should carry actual visible occupants, including on deterministic quality fallback');

  const generation = rig.prompts.find((call) => call.task === 'narrative.generate');
  assert.ok(generation, 'opening generation should have been called');
  assert.match(generation!.prompt, /STARTING_LOCATION_POPULATION_AND_VISIBLE_ACTIVITY/);
  for (const person of people as any[]) {
    assert.ok(generation!.prompt.includes(person.name), `opening prompt should carry visible entity ${person.name}`);
    assert.ok(generation!.prompt.includes(person.worldState.currentActivity), `opening prompt should carry the canonical activity for ${person.name}`);
  }

  const persistedRun = rig.repository.getStoryRun(storyId);
  assert.ok(persistedRun.runtimeState?.entities?.cards?.some((card: any) =>
    card.metadata?.ambientPopulation === true && card.worldState?.locationId === rig.locationId
  ), 'ambient population must remain in the StoryRun persistence snapshot');
  assert.equal(opening.startingLocationName, 'Elysium Solar Citadel');
});

test('opening population preserves authored RESTRICTED occupancy and never seeds people there', async () => {
  const storyId = 'opening_population_restricted_' + Date.now();
  const rig = buildOpeningRig(
    storyId,
    'Elysium Solar Citadel Archive',
    { status: 'RESTRICTED', expectedPopulation: 'NONE', accessControlled: true, explanation: 'Closed to public access.', provenance: 'AUTHORED' },
  );

  const opening = await OpeningSceneService.generateOpeningScene({
    storyId,
    worldRepo: rig.repository,
    allowDeterministicFallback: true,
  });

  const location = rig.repository.getGeographyGraph(storyId).getNode(rig.locationId) as any;
  const ambientPeople = rig.repository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card: any) =>
    card.metadata?.ambientPopulation === true && card.worldState?.locationId === rig.locationId
  );
  assert.equal(location.population?.status, 'RESTRICTED', 'WorldTemplate occupancy rules must survive projection into StoryRun geography');
  assert.deepEqual(ambientPeople, [], 'the opening path must not populate an authored restricted location');
  const generation = rig.prompts.find((call) => call.task === 'narrative.generate');
  assert.ok(generation);
  assert.match(generation!.prompt, /status=RESTRICTED/);
  assert.match(generation!.prompt, /Closed to public access/);
  assert.equal(opening.startingLocationName, 'Elysium Solar Citadel Archive');
});


test('opening semantic review rejects hidden canonical facts from both primary and repair candidates', async () => {
  const storyId = 'opening_semantic_hidden_fact_' + Date.now();
  const rig = buildOpeningRig(
    storyId,
    'Elysium Solar Citadel',
    { status: 'UNKNOWN', expectedPopulation: 'VARIABLE', provenance: 'UNKNOWN' },
  );
  const secretPhrase = 'a sealed alien engine beneath the citadel';
  rig.repository.saveWorldFact(storyId, {
    id: 'fact_hidden_engine_' + storyId,
    subjectEntityId: 'Elysium Council',
    predicate: 'conceals',
    objectValue: secretPhrase,
    secretLevel: 'secret',
    provenance: 'AUTHORED_HIDDEN_CANON',
  });

  const originalExecute = rig.orchestrator.executeTaskGeneration;
  const hiddenFactNarrative = [
    'At Cycle 42, Hero Vael stands within Elysium Solar Citadel. Footsteps cross the pale stone arcade while people carry out their recorded routines.',
    'Unknown to Vael, a sealed alien engine beneath the citadel remains active. The council has kept the sealed alien engine beneath the citadel hidden from ordinary visitors.',
    'The traveler remains focused on the immediate situation, with the wider mystery unresolved and the next decision left to the player.',
  ].join('\\n\\n');

  (rig.orchestrator as any).executeTaskGeneration = async (task: string, prompt: string, _system: string, options: any) => {
    const text = JSON.stringify({
      narrativeText: hiddenFactNarrative,
      structuredEvents: [
        { type: 'location', text: 'Elysium Solar Citadel' },
        { type: 'normal', text: 'People carry out their recorded routines.' },
        { type: 'action', text: 'Hero Vael surveys the public arcade.' },
        { type: 'normal', text: 'The wider mystery remains unresolved.' },
      ],
    });
    const validation = typeof options?.validateResponse === 'function' ? options.validateResponse(text) : { valid: true };
    if (!validation?.valid) throw new Error(validation.errorReason || 'Hidden-fact fixture failed shape validation.');
    return {
      text,
      source: 'AI_PRIMARY',
      providerId: 'test-fixture',
      modelId: task === 'narrative.review' ? 'opening-review-hidden-fact-fixture' : 'opening-primary-hidden-fact-fixture',
      attempts: 1,
      attemptsTrail: [],
    };
  };

  try {
    const opening = await OpeningSceneService.generateOpeningScene({
      storyId,
      worldRepo: rig.repository,
      allowDeterministicFallback: true,
    });
    const run = rig.repository.getStoryRun(storyId);
    const generation = run.runtimeState?.openingNarrativeContext?.generation;

    assert.doesNotMatch(opening.narrativeText.toLowerCase(), /sealed alien engine beneath the citadel/);
    assert.doesNotMatch(JSON.stringify(opening.structuredEvents).toLowerCase(), /sealed alien engine beneath the citadel/);
    assert.equal(generation?.source, 'DETERMINISTIC_FALLBACK', 'metadata must identify the deterministic text actually delivered');
    assert.equal(generation?.qualityAudit?.firstDecision, 'REWRITE');
    assert.equal(generation?.qualityAudit?.rewriteAttempted, true);
    assert.equal(generation?.qualityAudit?.rewriteSucceeded, false);
    assert.ok(generation?.qualityAudit?.issues.some((issue: string) => /semantic|epistemic|unsupported|hidden/i.test(issue)));
  } finally {
    (rig.orchestrator as any).executeTaskGeneration = originalExecute;
  }
});
