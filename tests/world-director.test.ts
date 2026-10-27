import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldDirector } from '../server/domain/worldDirector';

test('World Director does not apply investigation requirements to an ordinary opening', () => {
  const report = WorldDirector.assessOpeningSceneReadiness({
    startingSituation: 'Arriving at the park to watch the sunset.',
  });
  assert.equal(report.profile, 'GENERAL');
  assert.equal(report.status, 'NOT_APPLICABLE');
  assert.deepEqual(report.issues, []);
});

test('World Director flags an investigation premise when victim and evidence anchors are absent', () => {
  const report = WorldDirector.assessOpeningSceneReadiness({
    startingSituation: 'Kaelen is investigating a fresh murder scene inside an isolated shack.',
    sceneObjects: [],
    visibleEntities: [],
    visibleEvents: [],
  });
  assert.equal(report.profile, 'INVESTIGATION');
  assert.equal(report.status, 'INCOMPLETE');
  assert.deepEqual(report.issues.map((issue) => issue.code), [
    'INVESTIGATION_VICTIM_NOT_ESTABLISHED',
    'INVESTIGATION_EVIDENCE_NOT_ESTABLISHED',
  ]);
});

test('World Director accepts a visible body and evidence while ignoring hidden objects', () => {
  const report = WorldDirector.assessOpeningSceneReadiness({
    startingSituation: 'Investigating a fresh murder scene.',
    sceneObjects: [
      { id: 'body', name: 'Victim body', kind: 'ENVIRONMENTAL_FEATURE', visible: true },
      { id: 'knife-hidden', name: 'Bloodied knife', tags: ['evidence'], visible: false },
      { id: 'blood-trail', name: 'Bloodstain near the threshold', tags: ['evidence', 'blood'], visible: true },
    ],
  });
  assert.equal(report.status, 'READY');
  assert.deepEqual(report.issues, []);
  assert.equal(report.evidenceCounts.visibleSceneObjects, 2);
});

test('World Director does not count hidden or absent entities as a victim anchor', () => {
  const report = WorldDirector.assessOpeningSceneReadiness({
    startingSituation: 'A detective investigates a homicide.',
    visibleEntities: [
      { id: 'hidden-victim', name: 'Victim', visibleToPlayer: false, presence: 'present' },
      { id: 'absent-victim', name: 'Deceased victim', presence: 'absent' },
    ],
    sceneObjects: [{ id: 'chair', name: 'Wooden chair', visible: true }],
  });
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.issues.some((issue) => issue.code === 'INVESTIGATION_VICTIM_NOT_ESTABLISHED'));
});

test('World Director canonical-owner contract rolls back scene-object and Chronicle writes together', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');
  const { captureCanonicalStateSnapshot, compareCanonicalSnapshots } = await import('../server/domain/canonicalSnapshot');

  const storyId = 'world_director_cross_owner_rollback';
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  repository.seedStory(storyId);
  const before = captureCanonicalStateSnapshot(storyId, repository);
  const location = repository.getGeographyGraph(storyId).getAllNodes()[0];
  assert.ok(location, 'fixture needs a canonical location');
  const actorId = repository.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;

  const result = await canonicalCommandEngine.execute(
    repository,
    {
      commandId: 'world_director_cross_owner_rollback_001',
      storyId,
      actorId,
      type: 'INTERACT',
      payload: { action: 'PREPARE_SCENE_THEN_REJECT' },
      source: 'SYSTEM',
    },
    async (_command, context) => {
      const graph = context.repository.getGeographyGraph(storyId);
      const objectResult = graph.addSceneObject(location.id, {
        id: 'wd_rollback_test_body',
        name: 'Test body representation',
        kind: 'ENVIRONMENTAL_FEATURE',
        visible: true,
        interactable: false,
        provenance: 'world_director_contract_test',
      });
      assert.equal(objectResult.success, true);

      context.repository.getEntityRegistry(storyId).upsert({
        id: 'wd_rollback_test_entity',
        name: 'Temporary scene witness',
        kind: 'NPC',
        worldState: { locationId: location.id, isAlive: true, presence: 'present' },
      });
      context.repository.addKnowledgeFact(storyId, {
        id: 'wd_rollback_test_knowledge',
        subjectEntityId: actorId,
        predicate: 'observed_scene_clue',
        objectValue: 'Temporary clue that must be rolled back',
        sourceType: 'document',
        acquiredAtTimestamp: context.repository.getWorldClock(storyId).getTimestamp(),
        confidence: 1,
        secretLevel: 'public',
        scope: 'exact',
        provenanceSummary: 'world_director_contract_test',
      });

      context.repository.getHistoricalChronicleEngine(storyId).recordEvidence({
        id: 'wd_rollback_test_evidence',
        category: 'WORLD_ANOMALY',
        timestamp: context.repository.getWorldClock(storyId).getTimestamp(),
        primarySubjectId: actorId,
        locationId: location.id,
        summary: 'Temporary evidence for a rejected scene preparation.',
        details: 'This evidence must be rolled back with the scene object.',
        sourceEventId: 'wd_rollback_test_event',
        provenance: 'world_director_contract_test',
        visibility: 'PUBLIC',
      });

      return { success: false, errorReason: 'Intentional rejection after two canonical-owner writes.' };
    },
  );

  assert.equal(result.success, false);
  assert.equal(result.rolledBack, true);
  assert.equal(
    compareCanonicalSnapshots(before, captureCanonicalStateSnapshot(storyId, repository)).identical,
    true,
    'rejected preparation must restore both GeographyGraph and Chronicle to their pre-transaction state',
  );
  assert.equal(
    Boolean(repository.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.some((object) => object.id === 'wd_rollback_test_body')),
    false,
  );
  assert.equal(
    repository.getHistoricalChronicleEngine(storyId).exportState().evidenceStore?.some((item: any) => item.id === 'wd_rollback_test_evidence'),
    false,
  );
  assert.equal(repository.getEntityRegistry(storyId).get('wd_rollback_test_entity'), undefined);
  assert.equal(repository.getKnowledgeFacts(storyId).some((fact) => fact.id === 'wd_rollback_test_knowledge'), false);
});

test('World Director canonical-owner contract commits scene-object and Chronicle writes in one command', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');
  const { captureCanonicalStateSnapshot, compareCanonicalSnapshots } = await import('../server/domain/canonicalSnapshot');

  const storyId = 'world_director_cross_owner_commit';
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  repository.seedStory(storyId);
  const before = captureCanonicalStateSnapshot(storyId, repository);
  const location = repository.getGeographyGraph(storyId).getAllNodes()[0];
  assert.ok(location, 'fixture needs a canonical location');
  const actorId = repository.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;

  const result = await canonicalCommandEngine.execute(
    repository,
    {
      commandId: 'world_director_cross_owner_commit_001',
      storyId,
      actorId,
      type: 'INTERACT',
      payload: { action: 'PREPARE_SCENE_COMMIT' },
      source: 'SYSTEM',
    },
    async (_command, context) => {
      const graph = context.repository.getGeographyGraph(storyId);
      const objectResult = graph.addSceneObject(location.id, {
        id: 'wd_commit_test_clue',
        name: 'Test scene clue',
        kind: 'ITEM',
        description: 'A fixture clue committed by the scene-preparation contract test.',
        visible: true,
        interactable: true,
        tags: ['world-director-contract-test'],
        provenance: 'world_director_contract_test',
      });
      assert.equal(objectResult.success, true);

      context.repository.getEntityRegistry(storyId).upsert({
        id: 'wd_commit_test_entity',
        name: 'Committed scene witness',
        kind: 'NPC',
        worldState: { locationId: location.id, isAlive: true, presence: 'present' },
      });
      context.repository.addKnowledgeFact(storyId, {
        id: 'wd_commit_test_knowledge',
        subjectEntityId: actorId,
        predicate: 'observed_scene_clue',
        objectValue: 'Committed test clue',
        sourceType: 'document',
        acquiredAtTimestamp: context.repository.getWorldClock(storyId).getTimestamp(),
        confidence: 1,
        secretLevel: 'public',
        scope: 'exact',
        provenanceSummary: 'world_director_contract_test',
      });

      context.repository.getHistoricalChronicleEngine(storyId).recordEvidence({
        id: 'wd_commit_test_evidence',
        category: 'WORLD_ANOMALY',
        timestamp: context.repository.getWorldClock(storyId).getTimestamp(),
        primarySubjectId: actorId,
        locationId: location.id,
        summary: 'Scene preparation committed a test clue.',
        details: 'The clue and evidence record are part of the same canonical command.',
        sourceEventId: 'wd_commit_test_event',
        provenance: 'world_director_contract_test',
        visibility: 'PUBLIC',
      });

      return { success: true, data: { sceneObjectId: 'wd_commit_test_clue', evidenceId: 'wd_commit_test_evidence' }, summary: 'Scene preparation test committed.' };
    },
  );

  assert.equal(result.success, true);
  assert.equal(result.rolledBack, false);
  assert.equal(Boolean(repository.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.some((object) => object.id === 'wd_commit_test_clue')), true);
  assert.equal(
    repository.getHistoricalChronicleEngine(storyId).exportState().evidenceStore?.some((item: any) => item.id === 'wd_commit_test_evidence'),
    true,
  );
  assert.equal(repository.getEntityRegistry(storyId).get('wd_commit_test_entity')?.name, 'Committed scene witness');
  assert.equal(repository.getKnowledgeFacts(storyId).some((fact) => fact.id === 'wd_commit_test_knowledge'), true);
  assert.equal(compareCanonicalSnapshots(before, captureCanonicalStateSnapshot(storyId, repository)).identical, false);
  assert.equal(repository.getCanonicalCommandEvents(storyId).length, 1);
});

