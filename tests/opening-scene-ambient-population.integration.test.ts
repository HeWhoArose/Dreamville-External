import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { OpeningSceneService } from '../server/services/openingSceneService';

async function withDurablePersistence<T>(callback: () => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'dreamville-opening-population-'));
  const previous = process.env.DREAMBOOK_PERSISTENCE_PATH;
  process.env.DREAMBOOK_PERSISTENCE_PATH = join(root, 'data.json');
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = previous;
    rmSync(root, { recursive: true, force: true });
  }
}

function buildOpeningRig(storyId: string, locationName: string, population: any, disablePersistence = true) {
  const repository = new InMemoryWorldRepository({ disablePersistence });
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

test('World Director opening integration exposes an investigation premise with no canonical victim or clue as incomplete', async () => {
  const storyId = 'opening_investigation_missing_anchors_' + Date.now();
  const rig = buildOpeningRig(
    storyId,
    'Isolated Shack',
    { status: 'ABANDONED', expectedPopulation: 'NONE', explanation: 'An isolated shack with no established occupants.', provenance: 'AUTHORED' },
  );

  // The hook is narrative setup only. This fixture deliberately registers no
  // victim entity/body object, clue object, or current-location incident event.
  const run = rig.repository.getStoryRun(storyId);
  run.startingSituation = {
    summary: 'Kaelen Voss is investigating a fresh murder scene inside the isolated shack.',
    hook: 'A fresh murder has been reported at the shack.',
    activity: 'examining the scene',
    situationType: 'pressure_event',
  };
  rig.repository.saveStoryRun(run);

  await OpeningSceneService.generateOpeningScene({
    storyId,
    worldRepo: rig.repository,
    allowDeterministicFallback: true,
  });

  const persisted = rig.repository.getStoryRun(storyId);
  const readiness = persisted.runtimeState?.openingNarrativeContext?.sceneReadiness;
  assert.equal(readiness?.profile, 'INVESTIGATION');
  assert.equal(readiness?.status, 'INCOMPLETE');
  assert.deepEqual(
    readiness?.issues?.map((issue: any) => issue.code),
    ['INVESTIGATION_VICTIM_NOT_ESTABLISHED', 'INVESTIGATION_EVIDENCE_NOT_ESTABLISHED'],
    'opening integration must surface that the premise did not materialize canonical victim/clue anchors',
  );
  assert.deepEqual(
    rig.repository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card: any) =>
      card.worldState?.locationId === rig.locationId && card.worldState?.isAlive !== false
    ),
    [],
    'abandoned-location setup must not fabricate an ambient NPC as a substitute for a victim',
  );
});

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
  // Ambient residents are canonical but unidentified: the opening must carry them
  // by player-facing role label, never by a name the player has not learned.
  for (const person of people as any[]) {
    const role = String(person.classification.role);
    assert.ok(
      opening.narrativeText.toLowerCase().includes(role.toLowerCase()),
      `the final opening should carry the role label for a canonical resident (${role}), including on deterministic quality fallback`,
    );
    assert.ok(
      !opening.narrativeText.includes(person.name),
      `the opening must not expose the unlearned canonical name ${person.name}`,
    );
  }

  const generation = rig.prompts.find((call) => call.task === 'narrative.generate');
  assert.ok(generation, 'opening generation should have been called');
  assert.match(generation!.prompt, /STARTING_LOCATION_POPULATION_AND_VISIBLE_ACTIVITY/);
  for (const person of people as any[]) {
    assert.ok(
      generation!.prompt.toLowerCase().includes(String(person.classification.role).toLowerCase()),
      `opening prompt should carry visible entity role ${person.classification.role}`,
    );
    assert.ok(generation!.prompt.includes(person.worldState.currentActivity), `opening prompt should carry the canonical activity for ${person.name}`);
    assert.ok(
      !generation!.prompt.includes(person.name),
      `opening prompt must not expose the unlearned canonical name ${person.name}`,
    );
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
  ].join('\n\n');

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

test('opening presentation review rejects duplicate opening prose during regeneration', () => {
  const storyId = 'opening_freshness_review_' + Date.now();
  const rig = buildOpeningRig(
    storyId,
    'Elysium Solar Citadel',
    { status: 'UNKNOWN', expectedPopulation: 'VARIABLE', provenance: 'UNKNOWN' },
  );
  const priorOpening = [
    'The vaulted arcade of Elysium Solar Citadel carries soft footsteps across pale marble.',
    'Hero Vael pauses beside a bronze fountain, watching couriers sort sealed letters beneath carved pillars.',
    'A narrow stair disappears behind a tapestry while distant clerks resume their careful work.',
  ].join('\\n\\n');

  const run = rig.repository.getStoryRun(storyId);
  assert.ok(run, 'fixture StoryRun must exist before testing regeneration freshness');
  (run as any).openingScene = { narrativeText: priorOpening };
  rig.repository.saveStoryRun(run as any);

  const repeated = rig.orchestrator.validateOpeningNarrativeCandidate({
    storyId,
    repository: rig.repository,
    narration: priorOpening,
  });
  assert.equal(repeated.valid, false, 'an exact repeat of the persisted opening must be rejected');
  assert.match(repeated.errorReason || '', /freshness/i);

  const distinctOpening = [
    "Hero Vael stands in the citadel's western gallery, where ink-stained attendants arrange glass instruments on a long oak bench.",
    'A draft moves loose parchment beside a locked cabinet, and rain beads across the high windows.',
    'The traveler studies the objects within reach, leaving any investigation or conversation for the player to choose.',
  ].join('\\n\\n');
  const distinct = rig.orchestrator.validateOpeningNarrativeCandidate({
    storyId,
    repository: rig.repository,
    narration: distinctOpening,
  });
  assert.equal(distinct.valid, true, distinct.errorReason || 'a substantively different opening should remain eligible');
});

test('opening presentation review rejects prose with no canonical scene anchor', () => {
  const storyId = 'opening_scene_anchor_review_' + Date.now();
  const rig = buildOpeningRig(
    storyId,
    'Elysium Solar Citadel',
    { status: 'UNKNOWN', expectedPopulation: 'VARIABLE', provenance: 'UNKNOWN' },
  );

  const unrelatedScene = [
    'Three copper birds hover above a violet tower in a remote marsh.',
    'A silver bell rings while a traveler studies an unfamiliar map.',
    'The wind turns the page and carries a loose ribbon into the reeds.',
  ].join('\\n\\n');

  const rejected = rig.orchestrator.validateOpeningNarrativeCandidate({
    storyId,
    repository: rig.repository,
    narration: unrelatedScene,
  });
  assert.equal(rejected.valid, false, 'opening prose must stay anchored to the canonical location or visible scene entities');
  assert.match(rejected.errorReason || '', /canonical location|scene-continuity/i);

  const groundedScene = [
    "Hero Vael stands in Elysium Solar Citadel's western gallery as footsteps cross the pale stone corridors.",
    'The traveler pauses beside the broad public forecourt and listens to conversation moving through the arcade.',
  ].join('\\n\\n');
  const accepted = rig.orchestrator.validateOpeningNarrativeCandidate({
    storyId,
    repository: rig.repository,
    narration: groundedScene,
  });
  assert.equal(accepted.valid, true, accepted.errorReason || 'a distinct but canonically grounded opening should remain eligible');
});

test('opening presentation review rejects time-of-day claims that contradict the canonical world clock', () => {
  const storyId = 'opening_temporal_review_' + Date.now();
  const rig = buildOpeningRig(
    storyId,
    'Elysium Solar Citadel',
    { status: 'UNKNOWN', expectedPopulation: 'VARIABLE', provenance: 'UNKNOWN' },
  );
  const phase = rig.repository.getWorldClock(storyId).getState().currentDayPhase;
  const forbiddenByPhase: Record<string, string> = {
    Predawn: 'sunset',
    Dawn: 'midnight',
    Morning: 'dusk',
    Afternoon: 'sunrise',
    Dusk: 'midday',
    Night: 'sunrise',
  };
  const contradiction = forbiddenByPhase[phase];
  assert.ok(contradiction, 'fixture should use a canonical phase covered by the temporal validator');

  const result = rig.orchestrator.validateOpeningNarrativeCandidate({
    storyId,
    repository: rig.repository,
    narration: `Hero Vael surveys the pale stone arcade as footsteps echo along the corridor. The ${contradiction} light falls across the floor while the traveler considers the immediate scene.`,
  });
  assert.equal(result.valid, false);
  assert.match(result.errorReason || '', /temporal|canonical world time/i);
});

test('opening population and opening scene survive repository reload without duplicate residents on regeneration', async () => {
  await withDurablePersistence(async () => {
    const storyId = 'opening_population_reload_' + Date.now();
    const rig = buildOpeningRig(
      storyId,
      'Elysium Solar Citadel',
      { status: 'UNKNOWN', expectedPopulation: 'VARIABLE', provenance: 'UNKNOWN' },
      false,
    );

    const firstOpening = await OpeningSceneService.generateOpeningScene({
      storyId,
      worldRepo: rig.repository,
      allowDeterministicFallback: true,
    });
    const firstPeople = rig.repository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card: any) =>
      card.metadata?.ambientPopulation === true &&
      card.worldState?.locationId === rig.locationId
    );
    assert.equal(firstPeople.length, 2, 'the initial opening should create the existing population policy count');

    // Construct a new repository against the same isolated persistence file, matching
    // the process-restart/load path rather than checking only an in-memory runtime snapshot.
    const reloadedRepository = new InMemoryWorldRepository();
    const reloadedRun = reloadedRepository.getStoryRun(storyId);
    assert.ok(reloadedRun, 'StoryRun should exist after repository reconstruction');
    assert.equal(reloadedRun!.openingScene?.narrativeText, firstOpening.narrativeText, 'opening scene text should survive reload');

    const reloadedLocation = reloadedRepository.getGeographyGraph(storyId).getNode(rig.locationId) as any;
    assert.equal(reloadedLocation?.population?.status, 'UNKNOWN', 'authored occupancy should survive reload');
    assert.equal(reloadedLocation?.population?.expectedPopulation, 'VARIABLE');

    const reloadedPeople = reloadedRepository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card: any) =>
      card.metadata?.ambientPopulation === true &&
      card.worldState?.locationId === rig.locationId
    );
    assert.deepEqual(
      reloadedPeople.map((card: any) => card.id).sort(),
      firstPeople.map((card: any) => card.id).sort(),
      'canonical ambient entity IDs and count should survive repository reconstruction',
    );
    assert.ok(
      reloadedRun!.runtimeState?.entities?.cards?.some((card: any) =>
        card.metadata?.ambientPopulation === true && card.worldState?.locationId === rig.locationId
      ),
      'the durable StoryRun snapshot should retain canonical ambient entities',
    );

    const orchestrator = reloadedRepository.getAiOrchestrator();
    const originalExecute = orchestrator.executeTaskGeneration;
    (orchestrator as any).executeTaskGeneration = async (task: string, prompt: string, _system: string, options: any) => {
      const people = reloadedRepository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card: any) =>
        card.metadata?.ambientPopulation === true &&
        card.worldState?.locationId === rig.locationId &&
        card.worldState?.isAlive !== false &&
        card.worldState?.presence === 'present'
      );
      const peopleDescription = people.map((person: any) =>
        `${person.name} is ${person.worldState.currentActivity || person.behavior?.defaultBehavior || 'going about their work'}.`
      ).join(' ');
      const prose = [
        `At Cycle 42, Hero Vael stands within Elysium Solar Citadel, where footsteps and conversation carry through the pale stone arcade.`,
        `${peopleDescription} The recorded activity gives the traveler concrete details to observe without deciding whom Vael approaches.`,
        'Vael keeps the question of available work open, leaving the next consequential choice to the player.',
      ].join('\\n\\n');
      const text = JSON.stringify({
        narrativeText: prose,
        structuredEvents: [
          { type: 'location', text: 'Elysium Solar Citadel' },
          { type: 'normal', text: peopleDescription },
          { type: 'action', text: 'Hero Vael pauses to observe the activity already present.' },
          { type: 'normal', text: 'The question of available work remains unresolved.' },
        ],
      });
      const validation = typeof options?.validateResponse === 'function' ? options.validateResponse(text) : { valid: true };
      if (!validation?.valid) throw new Error(validation?.errorReason || 'Reload fixture output failed validation.');
      return { text, source: 'AI_PRIMARY', providerId: 'test-fixture', modelId: 'opening-reload-fixture', attempts: 1, attemptsTrail: [] };
    };

    try {
      const regenerated = await OpeningSceneService.generateOpeningScene({
        storyId,
        worldRepo: reloadedRepository,
        forceRegenerate: true,
        allowDeterministicFallback: true,
      });
      const peopleAfterRegeneration = reloadedRepository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card: any) =>
        card.metadata?.ambientPopulation === true &&
        card.worldState?.locationId === rig.locationId
      );
      assert.deepEqual(
        peopleAfterRegeneration.map((card: any) => card.id).sort(),
        firstPeople.map((card: any) => card.id).sort(),
        'forcing an opening regeneration must not create duplicate ambient residents',
      );
      assert.ok(
        firstPeople.every((person: any) =>
          regenerated.narrativeText.toLowerCase().includes(String(person.classification.role).toLowerCase()),
        ),
        'regenerated prose should use the reloaded canonical residents',
      );
      assert.ok(
        firstPeople.every((person: any) => !regenerated.narrativeText.includes(person.name)),
        'regenerated prose must not expose unlearned canonical names',
      );
    } finally {
      (orchestrator as any).executeTaskGeneration = originalExecute;
    }
  });
});
