import test from 'node:test';
import assert from 'node:assert/strict';
import type { LocationSceneObject } from '../server/domain/types';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('World Director canonical transaction rolls back actor-scoped Phase 8 knowledge on rejection', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');

  const storyId = 'world_director_phase8_knowledge_rollback';
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  repository.seedStory(storyId);
  const actorId = repository.getPlayerLifecycle(storyId)!.actorId;
  const factId = 'wd_phase8_rollback_fact';
  const timestamp = repository.getWorldClock(storyId).getTimestamp();

  const result = await canonicalCommandEngine.execute(
    repository,
    {
      commandId: 'world_director_phase8_knowledge_rollback_001',
      storyId,
      actorId,
      type: 'INTERACT',
      payload: { action: 'PREPARE_SCENE_THEN_REJECT_PHASE8_KNOWLEDGE' },
      source: 'SYSTEM',
    },
    async (_command, context) => {
      const fact = {
        id: factId,
        subjectEntityId: actorId,
        predicate: 'observed_scene_clue',
        objectValue: 'The player learned the test clue',
        sourceType: 'document' as const,
        acquiredAtTimestamp: timestamp,
        confidence: 1,
        secretLevel: 'private' as const,
        scope: 'exact' as const,
        provenanceSummary: 'world_director_phase8_transaction_test',
      };
      context.repository.addKnowledgeFact(storyId, fact);

      assert.equal(
        context.repository.getAuthorizedKnowledgeFacts(storyId, actorId).some((entry) => entry.id === factId),
        false,
        'storing world truth must not itself grant actor-scoped knowledge',
      );

      context.repository.getPhase8SimulationEngine(storyId).processCanonicalEvent(context.repository, storyId, {
        eventId: 'wd_phase8_rollback_acquire_event',
        type: 'FACT_CHANGED',
        actorId,
        timestampSeconds: timestamp.totalElapsedSeconds,
        payload: {
          factId,
          evidenceId: 'wd_phase8_rollback_evidence',
          knowledgeAcquisitionSuccess: true,
          subjectEntityId: actorId,
          predicate: fact.predicate,
          objectValue: fact.objectValue,
          confidence: fact.confidence,
          method: 'SEARCH',
        },
      });

      assert.equal(
        context.repository.getAuthorizedKnowledgeFacts(storyId, actorId).some((entry) => entry.id === factId),
        true,
        'successful Phase 8 acquisition should grant knowledge inside the transaction',
      );
      return { success: false, errorReason: 'Intentional rollback after Phase 8 acquisition.' };
    },
  );

  assert.equal(result.success, false);
  assert.equal(result.rolledBack, true);
  assert.equal(repository.getKnowledgeFacts(storyId).some((fact) => fact.id === factId), false);
  assert.equal(
    repository.getAuthorizedKnowledgeFacts(storyId, actorId).some((fact) => fact.id === factId),
    false,
    'rejected preparation must not leave actor-scoped knowledge behind',
  );
  const phase8State = repository.getStoryRun(storyId)?.runtimeState?.phase8 as any;
  assert.equal(phase8State?.knowledge?.[actorId]?.facts?.[factId], undefined);
});

test('World Director canonical transaction commits actor-scoped Phase 8 knowledge on success', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');

  const storyId = 'world_director_phase8_knowledge_commit';
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  repository.seedStory(storyId);
  const actorId = repository.getPlayerLifecycle(storyId)!.actorId;
  const factId = 'wd_phase8_commit_fact';
  const timestamp = repository.getWorldClock(storyId).getTimestamp();

  const result = await canonicalCommandEngine.execute(
    repository,
    {
      commandId: 'world_director_phase8_knowledge_commit_001',
      storyId,
      actorId,
      type: 'INTERACT',
      payload: { action: 'PREPARE_SCENE_COMMIT_PHASE8_KNOWLEDGE' },
      source: 'SYSTEM',
    },
    async (_command, context) => {
      const fact = {
        id: factId,
        subjectEntityId: actorId,
        predicate: 'observed_scene_clue',
        objectValue: 'The player learned the committed test clue',
        sourceType: 'document' as const,
        acquiredAtTimestamp: timestamp,
        confidence: 1,
        secretLevel: 'private' as const,
        scope: 'exact' as const,
        provenanceSummary: 'world_director_phase8_transaction_test',
      };
      context.repository.addKnowledgeFact(storyId, fact);

      assert.equal(
        context.repository.getAuthorizedKnowledgeFacts(storyId, actorId).some((entry) => entry.id === factId),
        false,
        'the canonical fact store alone must not authorize actor knowledge',
      );

      context.repository.getPhase8SimulationEngine(storyId).processCanonicalEvent(context.repository, storyId, {
        eventId: 'wd_phase8_commit_acquire_event',
        type: 'FACT_CHANGED',
        actorId,
        timestampSeconds: timestamp.totalElapsedSeconds,
        payload: {
          factId,
          evidenceId: 'wd_phase8_commit_evidence',
          knowledgeAcquisitionSuccess: true,
          subjectEntityId: actorId,
          predicate: fact.predicate,
          objectValue: fact.objectValue,
          confidence: fact.confidence,
          method: 'SEARCH',
        },
      });

      return { success: true, data: { factId }, summary: 'Committed actor knowledge test.' };
    },
  );

  assert.equal(result.success, true);
  assert.equal(result.rolledBack, false);
  assert.equal(repository.getKnowledgeFacts(storyId).some((fact) => fact.id === factId), true);
  assert.equal(
    repository.getAuthorizedKnowledgeFacts(storyId, actorId).some((fact) => fact.id === factId),
    true,
    'committed Phase 8 acquisition should remain authorized for this actor',
  );
  const phase8State = repository.getStoryRun(storyId)?.runtimeState?.phase8 as any;
  assert.equal(phase8State?.knowledge?.[actorId]?.facts?.[factId]?.status, 'KNOWN');
});


test('World Director canonical scene state and actor knowledge survive a file-backed repository reload', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');

  const originalPersistencePath = process.env.DREAMBOOK_PERSISTENCE_PATH;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'dreamville-world-director-reload-'));
  const persistencePath = join(tempDirectory, 'dreambook.json');
  const storyId = 'world_director_file_reload_contract';
  const privateFactId = 'wd_reload_private_fact';
  const sceneObjectId = 'wd_reload_scene_clue';
  const entityId = 'wd_reload_scene_entity';
  const evidenceId = 'wd_reload_chronicle_evidence';

  try {
    process.env.DREAMBOOK_PERSISTENCE_PATH = persistencePath;
    const repository = new InMemoryWorldRepository();
    repository.seedStory(storyId);
    const run = repository.getStoryRun(storyId);
    assert.ok(run, 'fixture must create a persisted story run');
    const actorId = repository.getPlayerLifecycle(storyId)!.actorId;
    const otherActorId = 'wd_reload_other_actor';
    const location = repository.getGeographyGraph(storyId).getAllNodes()[0];
    assert.ok(location, 'fixture needs a canonical location');
    const timestamp = repository.getWorldClock(storyId).getTimestamp();

    const result = await canonicalCommandEngine.execute(
      repository,
      {
        commandId: 'wd_reload_scene_prepare_001',
        storyId,
        actorId,
        type: 'INTERACT',
        payload: { action: 'PREPARE_RELOAD_TEST_SCENE' },
        source: 'SYSTEM',
      },
      async (_command, context) => {
        const sceneObjectResult = context.repository.getGeographyGraph(storyId).addSceneObject(location.id, {
          id: sceneObjectId,
          name: 'Reload-persistent clue',
          kind: 'ITEM',
          description: 'A clue that must survive a repository reconstruction.',
          visible: true,
          interactable: true,
          tags: ['world-director-reload-test'],
          provenance: 'world_director_reload_contract_test',
        });
        assert.equal(sceneObjectResult.success, true);

        context.repository.getEntityRegistry(storyId).upsert({
          id: entityId,
          name: 'Reload-persistent scene witness',
          kind: 'NPC',
          worldState: { locationId: location.id, isAlive: true, presence: 'present' },
        });

        const fact = {
          id: privateFactId,
          subjectEntityId: actorId,
          predicate: 'observed_scene_clue',
          objectValue: 'The actor acquired the private clue before reload.',
          sourceType: 'document' as const,
          acquiredAtTimestamp: timestamp,
          confidence: 1,
          secretLevel: 'private' as const,
          scope: 'exact' as const,
          provenanceSummary: 'world_director_reload_contract_test',
        };
        context.repository.addKnowledgeFact(storyId, fact);

        context.repository.getPhase8SimulationEngine(storyId).processCanonicalEvent(context.repository, storyId, {
          eventId: 'wd_reload_private_fact_acquired',
          type: 'FACT_CHANGED',
          actorId,
          timestampSeconds: timestamp.totalElapsedSeconds,
          payload: {
            factId: privateFactId,
            evidenceId,
            knowledgeAcquisitionSuccess: true,
            subjectEntityId: actorId,
            predicate: fact.predicate,
            objectValue: fact.objectValue,
            confidence: fact.confidence,
            method: 'SEARCH',
          },
        });

        context.repository.getHistoricalChronicleEngine(storyId).recordEvidence({
          id: evidenceId,
          category: 'WORLD_ANOMALY',
          timestamp,
          primarySubjectId: actorId,
          locationId: location.id,
          summary: 'Reload persistence test evidence.',
          details: 'The evidence record should survive repository reconstruction.',
          sourceEventId: 'wd_reload_private_fact_acquired',
          provenance: 'world_director_reload_contract_test',
          visibility: 'PUBLIC',
        });

        return {
          success: true,
          data: { sceneObjectId, entityId, privateFactId, evidenceId },
          summary: 'Committed the canonical reload test scene.',
        };
      },
    );

    assert.equal(result.success, true);
    repository.saveStoryRun(repository.getStoryRun(storyId));

    const reloadedRepository = new InMemoryWorldRepository();
    const reloadedRun = reloadedRepository.getStoryRun(storyId);
    assert.ok(reloadedRun, 'story run should load from the file-backed store');
    assert.equal(
      reloadedRepository.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.some((object) => object.id === sceneObjectId),
      true,
      'canonical scene object must survive reload',
    );
    assert.equal(
      reloadedRepository.getEntityRegistry(storyId).get(entityId)?.name,
      'Reload-persistent scene witness',
      'entity registry state must survive reload',
    );
    assert.equal(
      reloadedRepository.getKnowledgeFacts(storyId).some((fact) => fact.id === privateFactId),
      true,
      'canonical world fact must survive reload',
    );
    assert.equal(
      reloadedRepository.getAuthorizedKnowledgeFacts(storyId, actorId).some((fact) => fact.id === privateFactId),
      true,
      'actor-acquired knowledge must remain authorized after reload',
    );
    assert.equal(
      reloadedRepository.getAuthorizedKnowledgeFacts(storyId, otherActorId).some((fact) => fact.id === privateFactId),
      false,
      'reloading one actor knowledge state must not authorize another actor',
    );
    assert.equal(
      reloadedRepository.getHistoricalChronicleEngine(storyId).exportState().evidenceStore?.some((item: any) => item.id === evidenceId),
      true,
      'Chronicle evidence must survive reload',
    );
  } finally {
    if (originalPersistencePath === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = originalPersistencePath;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});


test('World Director canonical command replay after repository reload does not rerun preparation or duplicate scene records', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');

  const originalPersistencePath = process.env.DREAMBOOK_PERSISTENCE_PATH;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'dreamville-world-director-replay-'));
  const persistencePath = join(tempDirectory, 'dreambook.json');
  const storyId = 'world_director_replay_after_reload';
  const actorId = 'wd_replay_actor';
  const commandId = 'wd_replay_prepare_scene_001';
  const sceneObjectId = 'wd_replay_stable_clue';
  const evidenceId = 'wd_replay_stable_evidence';

  try {
    process.env.DREAMBOOK_PERSISTENCE_PATH = persistencePath;
    const repository = new InMemoryWorldRepository();
    repository.seedStory(storyId);
    const location = repository.getGeographyGraph(storyId).getAllNodes()[0];
    assert.ok(location, 'fixture needs a canonical location');
    const timestamp = repository.getWorldClock(storyId).getTimestamp();

    const command = {
      commandId,
      storyId,
      actorId,
      type: 'INTERACT' as const,
      payload: { action: 'PREPARE_IDEMPOTENT_SCENE', sceneKey: 'fixture:replay-after-reload' },
      source: 'SYSTEM' as const,
    };

    let firstHandlerCalls = 0;
    const firstResult = await canonicalCommandEngine.execute(repository, command, async (_command, context) => {
      firstHandlerCalls += 1;
      const added = context.repository.getGeographyGraph(storyId).addSceneObject(location.id, {
        id: sceneObjectId,
        name: 'Stable replay fixture clue',
        kind: 'ITEM',
        visible: true,
        interactable: true,
        tags: ['world-director-replay-test'],
        provenance: 'world_director_replay_contract_test',
      });
      assert.equal(added.success, true);
      context.repository.getHistoricalChronicleEngine(storyId).recordEvidence({
        id: evidenceId,
        category: 'WORLD_ANOMALY',
        timestamp,
        primarySubjectId: actorId,
        locationId: location.id,
        summary: 'Stable replay fixture evidence.',
        details: 'This must be created once only.',
        sourceEventId: 'wd_replay_source_event',
        provenance: 'world_director_replay_contract_test',
        visibility: 'PUBLIC',
      });
      return { success: true, data: { sceneObjectId, evidenceId }, summary: 'Prepared replay fixture scene.' };
    });

    assert.equal(firstResult.success, true);
    assert.equal(firstHandlerCalls, 1);
    repository.saveStoryRun(repository.getStoryRun(storyId));

    const reloadedRepository = new InMemoryWorldRepository();
    assert.ok(reloadedRepository.getStoryRun(storyId), 'story must be reconstructed from file-backed persistence');
    const eventCountBeforeReplay = reloadedRepository.getCanonicalCommandEvents(storyId).length;
    let replayHandlerCalls = 0;

    const replayResult = await canonicalCommandEngine.execute(reloadedRepository, command, async () => {
      replayHandlerCalls += 1;
      return { success: true, data: { sceneObjectId, evidenceId }, summary: 'This handler must not run on replay.' };
    });

    assert.equal(replayResult.success, true, 'replaying a committed command after reload should return success');
    assert.equal(replayHandlerCalls, 0, 'the committed command handler must not execute again after reload');
    assert.equal(reloadedRepository.getCanonicalCommandEvents(storyId).length, eventCountBeforeReplay, 'replay must not append another canonical command event');
    assert.equal(
      reloadedRepository.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.filter((object) => object.id === sceneObjectId).length,
      1,
      'the stable scene-object ID must occur exactly once',
    );
    assert.equal(
      reloadedRepository.getHistoricalChronicleEngine(storyId).exportState().evidenceStore?.filter((item: any) => item.id === evidenceId).length,
      1,
      'the stable Chronicle evidence ID must occur exactly once',
    );

    const duplicateObjectResult = reloadedRepository.getGeographyGraph(storyId).addSceneObject(location.id, {
      id: sceneObjectId,
      name: 'Conflicting duplicate clue',
      kind: 'ITEM',
      visible: true,
      provenance: 'world_director_replay_contract_test',
    });
    assert.equal(duplicateObjectResult.success, false, 'GeographyGraph must reject a duplicate stable scene-object ID');
    assert.equal(
      reloadedRepository.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.filter((object) => object.id === sceneObjectId).length,
      1,
      'a rejected duplicate must not replace or append to the existing canonical scene object',
    );
  } finally {
    if (originalPersistencePath === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = originalPersistencePath;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('World Director stable preparation identities are deterministic and explicitly scoped', async () => {
  const { buildWorldDirectorStableRecordId } = await import('../server/domain/worldDirectorPreparationContract');
  const input = {
    storyId: 'wd_identity_story',
    preparationKey: 'incident:shack-murder:cycle-42',
    recordKind: 'SCENE_OBJECT' as const,
    role: 'victim-body',
    scopeId: 'isolated-shack',
  };

  const first = buildWorldDirectorStableRecordId(input);
  assert.equal(buildWorldDirectorStableRecordId({ ...input }), first, 'same canonical identity inputs must produce the same record ID');
  assert.notEqual(
    buildWorldDirectorStableRecordId({ ...input, preparationKey: 'incident:shack-murder:cycle-43' }),
    first,
    'a distinct preparation key must not alias the original incident record',
  );
  assert.notEqual(
    buildWorldDirectorStableRecordId({ ...input, scopeId: 'solar-citadel-outskirts' }),
    first,
    'location-scoped records must differ across owning locations',
  );
  assert.notEqual(
    buildWorldDirectorStableRecordId({ ...input, role: 'primary-clue' }),
    first,
    'distinct record roles must receive distinct stable identities',
  );
  assert.throws(
    () => buildWorldDirectorStableRecordId({ ...input, preparationKey: '   ' }),
    /preparationKey/,
    'the preparation key must be explicit and non-empty rather than inferred from narration',
  );
  assert.throws(
    () => buildWorldDirectorStableRecordId({ ...input, storyId: 's'.repeat(241) }),
    /exceeds 240 characters/,
    'identity inputs must be bounded to prevent unbounded canonical IDs',
  );
});

test('World Director ownership reconciliation never claims unmarked or foreign canonical records', async () => {
  const { classifyWorldDirectorOwnership, WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION } = await import('../server/domain/worldDirectorPreparationContract');
  const expected = { preparationKey: 'incident:shack-murder:cycle-42', role: 'primary-clue' };

  assert.equal(classifyWorldDirectorOwnership(undefined, expected), 'CREATE', 'missing record may be created');
  assert.equal(
    classifyWorldDirectorOwnership({
      contractVersion: WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION,
      preparationKey: expected.preparationKey,
      role: expected.role,
    }, expected),
    'RECONCILE_OWNED',
    'only a record explicitly owned by this preparation and role may be reconciled',
  );
  assert.equal(
    classifyWorldDirectorOwnership({
      contractVersion: WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION,
      preparationKey: 'authored:unrelated-clue',
      role: expected.role,
    }, expected),
    'CONFLICT',
    'an unrelated or authored record must never be overwritten',
  );
  assert.equal(
    classifyWorldDirectorOwnership({
      contractVersion: WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION - 1,
      preparationKey: expected.preparationKey,
      role: expected.role,
    }, expected),
    'CONFLICT',
    'older ownership contracts require explicit migration rather than implicit mutation',
  );
});

test('World Director ownership markers survive canonical owner export/import without replacing authored metadata', async () => {
  const { GeographyGraph } = await import('../server/domain/geographyGraph');
  const { EntityRegistry } = await import('../server/domain/entityCard');
  const { HistoricalChronicleEngine } = await import('../server/domain/historicalChronicleEngine');
  const { WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION } = await import('../server/domain/worldDirectorPreparationContract');

  const marker = {
    contractVersion: WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION,
    preparationKey: 'incident:shack-murder:cycle-42',
    role: 'primary-clue',
  };

  const graph = new GeographyGraph();
  const location = graph.getAllNodes()[0];
  assert.ok(location, 'fixture needs a canonical location');
  const authoredProperties = { authoredNote: 'keep this author-supplied detail' };
  const addResult = graph.addSceneObject(location.id, {
    id: 'wd_owner_marker_scene_object',
    name: 'Owner marker round-trip fixture',
    kind: 'ITEM',
    properties: { ...authoredProperties, worldDirectorOwnership: marker },
    provenance: 'authored',
  });
  assert.equal(addResult.success, true);
  const restoredGraph = new GeographyGraph(false);
  restoredGraph.importState(graph.exportState());
  const restoredObject = restoredGraph.getNode(location.id)?.sceneObjects?.find((object) => object.id === 'wd_owner_marker_scene_object');
  assert.deepEqual(restoredObject?.properties?.worldDirectorOwnership, marker);
  assert.equal(restoredObject?.properties?.authoredNote, authoredProperties.authoredNote, 'scene-object marker must coexist with authored properties');

  const entities = new EntityRegistry('wd_owner_marker_story');
  entities.upsert({
    id: 'wd_owner_marker_entity',
    storyId: 'wd_owner_marker_story',
    name: 'Owner marker entity fixture',
    kind: 'NPC',
    metadata: { authoredNote: 'preserve entity metadata', worldDirectorOwnership: marker },
  });
  const restoredEntities = new EntityRegistry('wd_owner_marker_story');
  restoredEntities.importState(entities.exportState());
  const restoredEntity = restoredEntities.get('wd_owner_marker_entity');
  assert.deepEqual(restoredEntity?.metadata.worldDirectorOwnership, marker);
  assert.equal(restoredEntity?.metadata.authoredNote, 'preserve entity metadata', 'entity ownership metadata must not erase unrelated metadata');

  const chronicle = new HistoricalChronicleEngine();
  chronicle.recordEvidence({
    id: 'wd_owner_marker_evidence',
    category: 'WORLD_ANOMALY',
    timestamp: { year: 42, month: 10, day: 14, hour: 17, minute: 42, second: 0, totalElapsedSeconds: 0 },
    primarySubjectId: 'wd_owner_marker_actor',
    locationId: location.id,
    summary: 'Owner marker round-trip evidence fixture.',
    details: 'Test-only evidence used to verify structured ownership metadata persistence.',
    sourceEventId: 'wd_owner_marker_source_event',
    provenance: 'world_director_owner_adapter_test',
    visibility: 'PUBLIC',
    metadata: { authoredNote: 'preserve evidence metadata', worldDirectorOwnership: marker },
  });
  const restoredChronicle = new HistoricalChronicleEngine();
  restoredChronicle.importState(chronicle.exportState());
  const evidence = restoredChronicle.exportState().evidenceStore?.find((item: any) => item.id === 'wd_owner_marker_evidence');
  assert.deepEqual(evidence?.metadata?.worldDirectorOwnership, marker);
  assert.equal(evidence?.metadata?.authoredNote, 'preserve evidence metadata', 'evidence ownership metadata must not erase unrelated metadata');
});

test('World Director preparation lifecycle allows only explicit forward transitions and idempotent repeats', async () => {
  const { evaluateWorldDirectorLifecycleTransition } = await import('../server/domain/worldDirectorPreparationContract');

  const transitions: Array<[string, string, boolean]> = [
    ['PLANNED', 'ACTIVE', true],
    ['PLANNED', 'CANCELLED', true],
    ['PLANNED', 'SUPERSEDED', true],
    ['ACTIVE', 'RESOLVED', true],
    ['ACTIVE', 'CANCELLED', true],
    ['ACTIVE', 'SUPERSEDED', true],
    ['PLANNED', 'RESOLVED', false],
    ['ACTIVE', 'PLANNED', false],
    ['RESOLVED', 'ACTIVE', false],
    ['CANCELLED', 'ACTIVE', false],
    ['SUPERSEDED', 'ACTIVE', false],
  ];

  for (const [from, to, expectedAllowed] of transitions) {
    const result = evaluateWorldDirectorLifecycleTransition(from as any, to as any);
    assert.equal(result.allowed, expectedAllowed, `transition ${from} -> ${to}`);
    assert.equal(result.idempotent, false, `different states are not idempotent: ${from} -> ${to}`);
  }

  for (const state of ['PLANNED', 'ACTIVE', 'RESOLVED', 'CANCELLED', 'SUPERSEDED']) {
    const result = evaluateWorldDirectorLifecycleTransition(state as any, state as any);
    assert.equal(result.allowed, true, `same-state repeat should be accepted for ${state}`);
    assert.equal(result.idempotent, true, `same-state repeat should be a no-op for ${state}`);
  }
});

test('World Director staged scene preparation persists canonical state and its command event in one save', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');
  const { PersistentGameStore } = await import('../server/services/persistentGameStore');

  const previousPersistencePath = process.env.DREAMBOOK_PERSISTENCE_PATH;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'dreamville-world-director-atomic-'));
  const persistencePath = join(tempDirectory, 'dreambook.json');
  const originalSave = PersistentGameStore.prototype.save;
  let saveCount = 0;

  try {
    process.env.DREAMBOOK_PERSISTENCE_PATH = persistencePath;
    PersistentGameStore.prototype.save = function (data) {
      if (this.getPath() === persistencePath) saveCount += 1;
      return originalSave.call(this, data);
    };

    const repository = new InMemoryWorldRepository();
    const storyId = 'wd_atomic_scene_commit';
    const actorId = 'wd_atomic_scene_actor';
    repository.seedStory(storyId);
    const location = repository.getGeographyGraph(storyId).getAllNodes()[0];
    assert.ok(location, 'fixture needs a canonical location');
    saveCount = 0;

    const command = {
      commandId: 'wd_atomic_scene_commit_001',
      storyId,
      actorId,
      type: 'INTERACT' as const,
      payload: { action: 'PREPARE_ATOMIC_SCENE_COMMIT', preparationKey: 'fixture:atomic-scene-commit' },
      source: 'SYSTEM' as const,
      transactionMode: 'STAGED' as const,
    };

    const result = await canonicalCommandEngine.execute(repository, command, async (_command, context) => {
      const added = context.repository.getGeographyGraph(storyId).addSceneObject(location.id, {
        id: 'wd_atomic_scene_commit_clue',
        name: 'Atomic commit clue fixture',
        kind: 'ITEM',
        visible: true,
        properties: {
          worldDirectorFixture: true,
          worldDirectorOwnership: {
            contractVersion: 1,
            preparationKey: 'fixture:atomic-scene-commit',
            role: 'primary-clue',
          },
        },
        provenance: 'world_director_atomic_commit_test',
      });
      assert.equal(added.success, true);
      context.repository.saveEntityCard(storyId, {
        id: 'wd_atomic_scene_commit_witness',
        name: 'Atomic commit witness fixture',
        kind: 'NPC',
        metadata: {
          authoredNote: 'preserve entity metadata',
          worldDirectorOwnership: {
            contractVersion: 1,
            preparationKey: 'fixture:atomic-scene-commit',
            role: 'witness',
          },
        },
      });
      context.repository.addKnowledgeFact(storyId, {
        id: 'wd_atomic_scene_commit_fact',
        subjectEntityId: actorId,
        predicate: 'scene_has_primary_clue',
        objectValue: 'wd_atomic_scene_commit_clue',
        sourceType: 'system_grant',
        acquiredAtTimestamp: context.repository.getWorldClock(storyId).getTimestamp(),
        confidence: 1,
        secretLevel: 'public',
        scope: 'exact',
        provenanceSummary: 'World Director atomic commit fixture fact.',
        metadata: {
          authoredNote: 'preserve fact metadata',
          worldDirectorOwnership: {
            contractVersion: 1,
            preparationKey: 'fixture:atomic-scene-commit',
            role: 'scene-fact',
          },
        },
      });
      return { success: true, data: { sceneObjectId: 'wd_atomic_scene_commit_clue' }, summary: 'Prepared atomic commit fixture.' };
    });

    assert.equal(result.success, true);
    assert.equal(saveCount, 1, 'the staged canonical state and its matching command event must flush in one persistence save');

    const reloaded = new InMemoryWorldRepository();
    const reloadedLocation = reloaded.getGeographyGraph(storyId).getNode(location.id);
    assert.equal(
      reloadedLocation?.sceneObjects?.filter((object) => object.id === 'wd_atomic_scene_commit_clue').length,
      1,
      'the committed scene object must survive reload',
    );
    assert.ok(
      reloaded.getCanonicalCommandEvents(storyId).some((event: any) => event.commandId === command.commandId),
      'the matching canonical command event must survive in the same durable commit',
    );
    const persistedFact = reloaded.getKnowledgeFacts(storyId).find((fact) => fact.id === 'wd_atomic_scene_commit_fact');
    assert.deepEqual(persistedFact?.metadata?.worldDirectorOwnership, {
      contractVersion: 1,
      preparationKey: 'fixture:atomic-scene-commit',
      role: 'scene-fact',
    }, 'structured ownership metadata on shared knowledge facts must survive the same atomic commit');
    assert.equal(persistedFact?.metadata?.authoredNote, 'preserve fact metadata');
    const persistedEntity = reloaded.getEntityCard(storyId, 'wd_atomic_scene_commit_witness');
    assert.deepEqual(persistedEntity?.metadata.worldDirectorOwnership, {
      contractVersion: 1,
      preparationKey: 'fixture:atomic-scene-commit',
      role: 'witness',
    }, 'entity ownership metadata must survive the same staged commit and reload');
    assert.equal(persistedEntity?.metadata.authoredNote, 'preserve entity metadata');
  } finally {
    PersistentGameStore.prototype.save = originalSave;
    if (previousPersistencePath === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = previousPersistencePath;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('World Director owner adapter decisions distinguish absent, owned, and conflicting records without deletion', async () => {
  const {
    evaluateWorldDirectorOwnerRecord,
    WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION,
  } = await import('../server/domain/worldDirectorPreparationContract');

  const expected = {
    recordId: 'wdp:v1:story|incident%3Ashack-murder%3Acycle-42|SCENE_OBJECT|primary-clue|isolated-shack',
    preparationKey: 'incident:shack-murder:cycle-42',
    role: 'primary-clue',
  };
  const marker = {
    contractVersion: WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION,
    preparationKey: expected.preparationKey,
    role: expected.role,
  };

  const absent = evaluateWorldDirectorOwnerRecord(undefined, expected);
  assert.equal(absent.disposition, 'CREATE');
  assert.equal(absent.reason, 'RECORD_ABSENT');
  assert.equal(absent.mayCreate, true);
  assert.equal(absent.mayUpdate, false);
  assert.equal(absent.mayDelete, false);

  const authored = evaluateWorldDirectorOwnerRecord({ id: expected.recordId }, expected);
  assert.equal(authored.disposition, 'CONFLICT');
  assert.equal(authored.reason, 'EXISTING_RECORD_UNOWNED');
  assert.equal(authored.mayCreate, false);
  assert.equal(authored.mayUpdate, false);
  assert.equal(authored.mayDelete, false);

  const owned = evaluateWorldDirectorOwnerRecord({ id: expected.recordId, ownershipMarker: marker }, expected);
  assert.equal(owned.disposition, 'RECONCILE_OWNED');
  assert.equal(owned.reason, 'OWNED_RECORD_MATCH');
  assert.equal(owned.mayCreate, false);
  assert.equal(owned.mayUpdate, true);
  assert.equal(owned.mayDelete, false);

  const foreignPreparation = evaluateWorldDirectorOwnerRecord({
    id: expected.recordId,
    ownershipMarker: { ...marker, preparationKey: 'authored:unrelated-record' },
  }, expected);
  assert.equal(foreignPreparation.disposition, 'CONFLICT');
  assert.equal(foreignPreparation.reason, 'PREPARATION_KEY_MISMATCH');

  const foreignRole = evaluateWorldDirectorOwnerRecord({
    id: expected.recordId,
    ownershipMarker: { ...marker, role: 'victim-body' },
  }, expected);
  assert.equal(foreignRole.disposition, 'CONFLICT');
  assert.equal(foreignRole.reason, 'ROLE_MISMATCH');

  const oldContract = evaluateWorldDirectorOwnerRecord({
    id: expected.recordId,
    ownershipMarker: { ...marker, contractVersion: WORLD_DIRECTOR_PREPARATION_CONTRACT_VERSION - 1 },
  }, expected);
  assert.equal(oldContract.disposition, 'CONFLICT');
  assert.equal(oldContract.reason, 'CONTRACT_VERSION_MISMATCH');

  const differentId = evaluateWorldDirectorOwnerRecord({
    id: 'authored:some-other-object',
    ownershipMarker: marker,
  }, expected);
  assert.equal(differentId.disposition, 'CONFLICT');
  assert.equal(differentId.reason, 'RECORD_ID_MISMATCH');
});

test('World Director ownership adapters preserve owner metadata and refuse conflicting marker replacement', async () => {
  const { worldDirectorOwnershipAdapters } = await import('../server/domain/worldDirectorPreparationContract');
  const { EntityRegistry } = await import('../server/domain/entityCard');

  const marker = {
    contractVersion: 1,
    preparationKey: 'incident:shack-murder:cycle-42',
    role: 'primary-clue',
  };
  const foreignMarker = { ...marker, preparationKey: 'authored:foreign-preparation' };

  const sceneObject = {
    id: 'wd_adapter_scene_object',
    name: 'Adapter fixture clue',
    kind: 'ITEM' as const,
    properties: { authoredNote: 'preserve scene note' },
  };
  const markedSceneObject = worldDirectorOwnershipAdapters.sceneObject.withMarker(sceneObject, marker);
  assert.deepEqual(worldDirectorOwnershipAdapters.sceneObject.read(markedSceneObject), marker);
  assert.equal(markedSceneObject.properties?.authoredNote, 'preserve scene note');
  assert.equal((sceneObject.properties as Record<string, unknown>).worldDirectorOwnership, undefined, 'adapter must not mutate the input record');
  assert.throws(
    () => worldDirectorOwnershipAdapters.sceneObject.withMarker(markedSceneObject, foreignMarker),
    /refuses to replace a conflicting ownership marker/,
  );

  const registry = new EntityRegistry('wd_adapter_story');
  const entity = registry.upsert({
    id: 'wd_adapter_entity',
    storyId: 'wd_adapter_story',
    name: 'Adapter fixture entity',
    kind: 'NPC',
    metadata: { authoredNote: 'preserve entity note' },
  });
  const markedEntity = worldDirectorOwnershipAdapters.entityCard.withMarker(entity, marker);
  assert.deepEqual(worldDirectorOwnershipAdapters.entityCard.read(markedEntity), marker);
  assert.equal(markedEntity.metadata.authoredNote, 'preserve entity note');

  const timestamp = { year: 42, month: 10, day: 14, hour: 17, minute: 42, second: 0, totalElapsedSeconds: 0 };
  const evidence = {
    id: 'wd_adapter_evidence',
    category: 'WORLD_ANOMALY' as const,
    timestamp,
    primarySubjectId: 'wd_adapter_actor',
    locationId: 'isolated-shack',
    summary: 'Adapter fixture evidence.',
    details: 'Test-only.',
    sourceEventId: 'wd_adapter_event',
    provenance: 'world_director_owner_adapter_test',
    visibility: 'PUBLIC' as const,
    metadata: { authoredNote: 'preserve evidence note' },
  };
  const markedEvidence = worldDirectorOwnershipAdapters.historicalEvidence.withMarker(evidence, marker);
  assert.deepEqual(worldDirectorOwnershipAdapters.historicalEvidence.read(markedEvidence), marker);
  assert.equal(markedEvidence.metadata?.authoredNote, 'preserve evidence note');

  const fact = {
    id: 'wd_adapter_fact',
    subjectEntityId: 'wd_adapter_actor',
    predicate: 'observed_clue',
    objectValue: 'wd_adapter_scene_object',
    sourceType: 'system_grant' as const,
    acquiredAtTimestamp: timestamp,
    confidence: 1,
    secretLevel: 'public' as const,
    scope: 'exact' as const,
    provenanceSummary: 'Adapter fixture fact.',
    metadata: { authoredNote: 'preserve fact note' },
  };
  const markedFact = worldDirectorOwnershipAdapters.knowledgeFact.withMarker(fact, marker);
  assert.deepEqual(worldDirectorOwnershipAdapters.knowledgeFact.read(markedFact), marker);
  assert.equal(markedFact.metadata?.authoredNote, 'preserve fact note');
  assert.throws(
    () => worldDirectorOwnershipAdapters.knowledgeFact.withMarker(markedFact, foreignMarker),
    /refuses to replace a conflicting ownership marker/,
  );
});

test('World Director owner planning is idempotent for owned records and leaves conflicts unchanged', async () => {
  const {
    buildWorldDirectorStableRecordId,
    planWorldDirectorOwnedRecord,
    worldDirectorOwnershipAdapters,
  } = await import('../server/domain/worldDirectorPreparationContract');

  const expected = {
    recordId: buildWorldDirectorStableRecordId({
      storyId: 'wd_plan_story',
      preparationKey: 'incident:shack-murder:cycle-42',
      recordKind: 'SCENE_OBJECT',
      role: 'primary-clue',
      scopeId: 'isolated-shack',
    }),
    preparationKey: 'incident:shack-murder:cycle-42',
    role: 'primary-clue',
  };
  const desired: LocationSceneObject = {
    id: expected.recordId,
    name: 'Primary clue',
    kind: 'ITEM' as const,
    description: 'A clue prepared by World Director.',
    properties: { worldDirectorGenerated: true },
  };
  const mergeOwned = (existing: LocationSceneObject, next: LocationSceneObject): LocationSceneObject => ({
    ...existing,
    ...next,
    properties: { ...(existing.properties || {}), ...(next.properties || {}) },
  });

  const create = planWorldDirectorOwnedRecord(
    undefined,
    desired,
    expected,
    worldDirectorOwnershipAdapters.sceneObject,
    mergeOwned,
  );
  assert.equal(create.decision.disposition, 'CREATE');
  assert.equal(create.changed, true);
  assert.ok(create.record);
  const createdRecord = create.record!;
  assert.deepEqual(worldDirectorOwnershipAdapters.sceneObject.read(createdRecord), {
    contractVersion: 1,
    preparationKey: expected.preparationKey,
    role: expected.role,
  });

  const repeated = planWorldDirectorOwnedRecord(
    createdRecord,
    desired,
    expected,
    worldDirectorOwnershipAdapters.sceneObject,
    mergeOwned,
  );
  assert.equal(repeated.decision.disposition, 'RECONCILE_OWNED');
  assert.equal(repeated.changed, false, 'repeating the same preparation should be an idempotent no-op');
  assert.deepEqual(repeated.record, createdRecord);

  const revisedDesired = { ...desired, description: 'A more precise description of the same clue.' };
  const reconciled = planWorldDirectorOwnedRecord(
    createdRecord,
    revisedDesired,
    expected,
    worldDirectorOwnershipAdapters.sceneObject,
    mergeOwned,
  );
  assert.equal(reconciled.decision.disposition, 'RECONCILE_OWNED');
  assert.equal(reconciled.changed, true);
  assert.equal(reconciled.record?.description, revisedDesired.description);
  assert.equal(reconciled.record?.properties?.worldDirectorOwnership !== undefined, true);
  assert.equal(reconciled.record?.properties?.authoredNote, undefined);

  const authoredRecord = {
    ...desired,
    properties: { authoredNote: 'must never be adopted', worldDirectorGenerated: false },
  };
  const authoredBefore = JSON.parse(JSON.stringify(authoredRecord));
  const authoredConflict = planWorldDirectorOwnedRecord(
    authoredRecord,
    desired,
    expected,
    worldDirectorOwnershipAdapters.sceneObject,
    mergeOwned,
  );
  assert.equal(authoredConflict.decision.disposition, 'CONFLICT');
  assert.equal(authoredConflict.decision.reason, 'EXISTING_RECORD_UNOWNED');
  assert.equal(authoredConflict.changed, false);
  assert.deepEqual(authoredConflict.record, authoredBefore, 'conflict must leave the authored record untouched');

  const foreignOwned = worldDirectorOwnershipAdapters.sceneObject.withMarker(desired, {
    contractVersion: 1,
    preparationKey: 'authored:foreign-preparation',
    role: expected.role,
  });
  const foreignConflict = planWorldDirectorOwnedRecord(
    foreignOwned,
    desired,
    expected,
    worldDirectorOwnershipAdapters.sceneObject,
    mergeOwned,
  );
  assert.equal(foreignConflict.decision.disposition, 'CONFLICT');
  assert.equal(foreignConflict.decision.reason, 'PREPARATION_KEY_MISMATCH');
  assert.deepEqual(foreignConflict.record, foreignOwned);
});



test('World Director ownership plan reconciles through GeographyGraph inside a staged command', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');
  const {
    buildWorldDirectorStableRecordId,
    planWorldDirectorOwnedRecord,
    worldDirectorOwnershipAdapters,
  } = await import('../server/domain/worldDirectorPreparationContract');

  const previousPersistencePath = process.env.DREAMBOOK_PERSISTENCE_PATH;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'dreamville-world-director-owner-graph-'));
  process.env.DREAMBOOK_PERSISTENCE_PATH = join(tempDirectory, 'dreambook.json');
  try {
    const repository = new InMemoryWorldRepository();
    const storyId = 'wd_owner_graph_integration';
    const actorId = 'wd_owner_graph_integration_actor';
    const preparationKey = 'fixture:geography-owner-integration';
    repository.seedStory(storyId);
    const location = repository.getGeographyGraph(storyId).getAllNodes()[0];
    assert.ok(location, 'fixture needs a canonical location');

    const recordId = buildWorldDirectorStableRecordId({
      storyId,
      preparationKey,
      recordKind: 'SCENE_OBJECT',
      role: 'primary-clue',
      scopeId: location.id,
    });
    const expected = { recordId, preparationKey, role: 'primary-clue' };
    const desired: LocationSceneObject = {
      id: recordId,
      name: 'Preparation fixture clue',
      kind: 'ITEM',
      visible: true,
      interactable: true,
      description: 'Initial fixture description.',
      properties: { worldDirectorGenerated: true },
    };

    const executePreparation = (commandId: string, nextDesired: LocationSceneObject) =>
      canonicalCommandEngine.execute<Record<string, unknown>, { recordId: string; disposition: string; changed: boolean }>(repository, {
        commandId,
        storyId,
        actorId,
        type: 'INTERACT',
        payload: { action: 'PREPARE_SCENE_OBJECT', preparationKey, recordId },
        source: 'SYSTEM',
        transactionMode: 'STAGED',
      }, async (_command, context) => {
        const graph = context.repository.getGeographyGraph(storyId);
        const existing = graph.getNode(location.id)?.sceneObjects?.find((object) => object.id === recordId);
        const plan = planWorldDirectorOwnedRecord(
          existing,
          nextDesired,
          expected,
          worldDirectorOwnershipAdapters.sceneObject,
          (owned, next) => ({
            ...owned,
            ...next,
            properties: { ...(owned.properties || {}), ...(next.properties || {}) },
          }),
        );
        if (plan.decision.disposition === 'CONFLICT' || !plan.record) {
          return { success: false, errorReason: `Scene-object preparation conflict: ${plan.decision.reason}.` };
        }
        if (plan.changed) {
          const mutation = existing
            ? graph.patchSceneObject(location.id, recordId, {
                name: plan.record.name,
                description: plan.record.description,
                visible: plan.record.visible,
                interactable: plan.record.interactable,
                properties: plan.record.properties,
                tags: plan.record.tags,
              })
            : graph.addSceneObject(location.id, plan.record);
          if (!mutation.success) return { success: false, errorReason: mutation.errorReason };
        }
        return {
          success: true,
          data: { recordId, disposition: plan.decision.disposition, changed: plan.changed },
          summary: `Scene-object preparation ${plan.decision.disposition.toLowerCase()}.`,
        };
      });

    const first = await executePreparation('wd_owner_graph_integration_001', desired);
    assert.equal(first.success, true);
    assert.equal(first.data?.changed, true);
    assert.equal(
      repository.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.filter((object) => object.id === recordId).length,
      1,
      'first preparation creates one canonical scene object',
    );

    const repeated = await executePreparation('wd_owner_graph_integration_002', desired);
    assert.equal(repeated.success, true);
    assert.equal(repeated.data?.disposition, 'RECONCILE_OWNED');
    assert.equal(repeated.data?.changed, false);
    assert.equal(
      repository.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.filter((object) => object.id === recordId).length,
      1,
      'repeat preparation must not duplicate the object',
    );

    const revised = { ...desired, description: 'Reconciled description from the same preparation.' };
    const reconciled = await executePreparation('wd_owner_graph_integration_003', revised);
    assert.equal(reconciled.success, true);
    assert.equal(reconciled.data?.changed, true);
    const reconciledRecord = repository.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.find((object) => object.id === recordId);
    assert.equal(reconciledRecord?.description, revised.description);
    assert.deepEqual(worldDirectorOwnershipAdapters.sceneObject.read(reconciledRecord!), {
      contractVersion: 1,
      preparationKey,
      role: 'primary-clue',
    });

    const authoredRole = 'authored-conflict';
    const authoredId = buildWorldDirectorStableRecordId({
      storyId,
      preparationKey,
      recordKind: 'SCENE_OBJECT',
      role: authoredRole,
      scopeId: location.id,
    });
    const authored = {
      ...desired,
      id: authoredId,
      name: 'Pre-existing authored object',
      description: 'Must remain untouched by preparation.',
      properties: { authoredMarker: 'preserve-me' },
    };
    assert.equal(repository.getGeographyGraph(storyId).addSceneObject(location.id, authored).success, true);
    repository.saveStoryRun(repository.getStoryRun(storyId));
    const authoredBefore = repository.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.find((object) => object.id === authoredId);
    const eventCountBeforeConflict = repository.getCanonicalCommandEvents(storyId).length;

    const conflict = await canonicalCommandEngine.execute(repository, {
      commandId: 'wd_owner_graph_integration_004',
      storyId,
      actorId,
      type: 'INTERACT',
      payload: { action: 'PREPARE_SCENE_OBJECT', preparationKey, recordId: authoredId },
      source: 'SYSTEM',
      transactionMode: 'STAGED',
    }, async (_command, context) => {
      const graph = context.repository.getGeographyGraph(storyId);
      const existing = graph.getNode(location.id)?.sceneObjects?.find((object) => object.id === authoredId);
      const conflictPlan = planWorldDirectorOwnedRecord(
        existing,
        { ...authored, description: 'Attempted overwrite.' },
        { recordId: authoredId, preparationKey, role: authoredRole },
        worldDirectorOwnershipAdapters.sceneObject,
        (owned, next) => ({ ...owned, ...next, properties: { ...(owned.properties || {}), ...(next.properties || {}) } }),
      );
      return conflictPlan.decision.disposition === 'CONFLICT'
        ? { success: false, errorReason: `Scene-object preparation conflict: ${conflictPlan.decision.reason}.` }
        : { success: false, errorReason: 'Fixture expected an unowned authored record conflict.' };
    });
    assert.equal(conflict.success, false, 'an existing unowned record must fail closed');
    assert.equal(repository.getCanonicalCommandEvents(storyId).length, eventCountBeforeConflict);
    const authoredAfter = repository.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.find((object) => object.id === authoredId);
    assert.deepEqual(authoredAfter, authoredBefore, 'conflicts leave authored canonical state unchanged');
  } finally {
    if (previousPersistencePath === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = previousPersistencePath;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});


test('World Director owner planning persists EntityRegistry, KnowledgeFact, and Chronicle records', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { EntityRegistry } = await import('../server/domain/entityCard');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');
  const {
    buildWorldDirectorStableRecordId,
    planWorldDirectorOwnedRecord,
    worldDirectorOwnershipAdapters,
  } = await import('../server/domain/worldDirectorPreparationContract');

  const previousPersistencePath = process.env.DREAMBOOK_PERSISTENCE_PATH;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'dreamville-world-director-owner-records-'));
  process.env.DREAMBOOK_PERSISTENCE_PATH = join(tempDirectory, 'dreambook.json');
  try {
    const repository = new InMemoryWorldRepository();
    const storyId = 'wd_owner_records_reload';
    const actorId = 'wd_owner_records_actor';
    const preparationKey = 'fixture:owner-records-reload';
    repository.seedStory(storyId);
    const location = repository.getGeographyGraph(storyId).getAllNodes()[0];
    assert.ok(location, 'fixture needs a canonical location');
    const timestamp = repository.getWorldClock(storyId).getTimestamp();

    const makeId = (recordKind: 'ENTITY' | 'WORLD_FACT' | 'CHRONICLE_EVIDENCE', role: string) =>
      buildWorldDirectorStableRecordId({ storyId, preparationKey, recordKind, role, scopeId: location.id });
    const entityId = makeId('ENTITY', 'witness');
    const factId = makeId('WORLD_FACT', 'private-observation');
    const evidenceId = makeId('CHRONICLE_EVIDENCE', 'witness-evidence');
    const entityExpected = { recordId: entityId, preparationKey, role: 'witness' };
    const factExpected = { recordId: factId, preparationKey, role: 'private-observation' };
    const evidenceExpected = { recordId: evidenceId, preparationKey, role: 'witness-evidence' };

    const entityDesired = new EntityRegistry(storyId).upsert({
      id: entityId,
      storyId,
      name: 'Prepared witness',
      kind: 'NPC',
      worldState: { locationId: location.id, isAlive: true, presence: 'present' },
      metadata: { authoredNote: 'retain entity note' },
    });
    const factDesired = {
      id: factId,
      subjectEntityId: actorId,
      predicate: 'witness_present',
      objectValue: 'The witness is present in the scene.',
      sourceType: 'system_grant' as const,
      acquiredAtTimestamp: timestamp,
      confidence: 1,
      secretLevel: 'private' as const,
      scope: 'exact' as const,
      provenanceSummary: 'World Director owner adapter fixture.',
      metadata: { authoredNote: 'retain fact note' },
    };
    const evidenceDesired = {
      id: evidenceId,
      category: 'WORLD_ANOMALY' as const,
      timestamp,
      primarySubjectId: actorId,
      locationId: location.id,
      summary: 'Prepared witness evidence.',
      details: 'Append-only Chronicle evidence for owner adapter coverage.',
      sourceEventId: 'wd_owner_records_command_001',
      provenance: 'world_director_owner_record_integration_test',
      visibility: 'PUBLIC' as const,
      metadata: { authoredNote: 'retain evidence note' },
    };

    const commandResult = await canonicalCommandEngine.execute(repository, {
      commandId: 'wd_owner_records_command_001',
      storyId,
      actorId,
      type: 'INTERACT',
      payload: { action: 'PREPARE_OWNED_CANONICAL_RECORDS', preparationKey },
      source: 'SYSTEM',
      transactionMode: 'STAGED',
    }, async (_command, context) => {
      const entityPlan = planWorldDirectorOwnedRecord(
        undefined,
        entityDesired,
        entityExpected,
        worldDirectorOwnershipAdapters.entityCard,
        (existing, desired) => ({
          ...existing,
          ...desired,
          metadata: { ...existing.metadata, ...desired.metadata },
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        }),
      );
      const factPlan = planWorldDirectorOwnedRecord(
        undefined,
        factDesired,
        factExpected,
        worldDirectorOwnershipAdapters.knowledgeFact,
        (existing, desired) => ({ ...existing, ...desired, metadata: { ...existing.metadata, ...desired.metadata } }),
      );
      const evidencePlan = planWorldDirectorOwnedRecord(
        undefined,
        evidenceDesired,
        evidenceExpected,
        worldDirectorOwnershipAdapters.historicalEvidence,
        (existing, desired) => ({ ...existing, ...desired, metadata: { ...existing.metadata, ...desired.metadata } }),
      );
      assert.equal(entityPlan.decision.disposition, 'CREATE');
      assert.equal(factPlan.decision.disposition, 'CREATE');
      assert.equal(evidencePlan.decision.disposition, 'CREATE');
      context.repository.saveEntityCard(storyId, entityPlan.record!);
      context.repository.addKnowledgeFact(storyId, factPlan.record!);
      context.repository.getHistoricalChronicleEngine(storyId).recordEvidence(evidencePlan.record!);
      return { success: true, data: { entityId, factId, evidenceId }, summary: 'Committed owned-record integration fixture.' };
    });
    assert.equal(commandResult.success, true);

    const reloaded = new InMemoryWorldRepository();
    const entity = reloaded.getEntityCard(storyId, entityId);
    const fact = reloaded.getKnowledgeFacts(storyId).find((record) => record.id === factId);
    const evidence = reloaded.getHistoricalChronicleEngine(storyId).exportState().evidenceStore?.find((record: any) => record.id === evidenceId);
    assert.deepEqual(worldDirectorOwnershipAdapters.entityCard.read(entity!), { contractVersion: 1, preparationKey, role: 'witness' });
    assert.deepEqual(worldDirectorOwnershipAdapters.knowledgeFact.read(fact!), { contractVersion: 1, preparationKey, role: 'private-observation' });
    assert.deepEqual(worldDirectorOwnershipAdapters.historicalEvidence.read(evidence!), { contractVersion: 1, preparationKey, role: 'witness-evidence' });
    assert.equal(entity?.metadata.authoredNote, 'retain entity note');
    assert.equal(fact?.metadata?.authoredNote, 'retain fact note');
    assert.equal(evidence?.metadata?.authoredNote, 'retain evidence note');
    assert.equal(reloaded.getAuthorizedKnowledgeFacts(storyId, actorId).some((record) => record.id === factId), false,
      'ownership metadata must not grant actor-scoped knowledge');

    const repeatedEntity = planWorldDirectorOwnedRecord(
      entity,
      entityDesired,
      entityExpected,
      worldDirectorOwnershipAdapters.entityCard,
      (existing, desired) => ({
        ...existing,
        ...desired,
        metadata: { ...existing.metadata, ...desired.metadata },
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      }),
    );
    const repeatedFact = planWorldDirectorOwnedRecord(
      fact,
      factDesired,
      factExpected,
      worldDirectorOwnershipAdapters.knowledgeFact,
      (existing, desired) => ({ ...existing, ...desired, metadata: { ...existing.metadata, ...desired.metadata } }),
    );
    const repeatedEvidence = planWorldDirectorOwnedRecord(
      evidence,
      evidenceDesired,
      evidenceExpected,
      worldDirectorOwnershipAdapters.historicalEvidence,
      (existing, desired) => ({ ...existing, ...desired, metadata: { ...existing.metadata, ...desired.metadata } }),
    );
    assert.equal(repeatedEntity.decision.disposition, 'RECONCILE_OWNED');
    assert.equal(repeatedEntity.changed, false);
    assert.equal(repeatedFact.decision.disposition, 'RECONCILE_OWNED');
    assert.equal(repeatedFact.changed, false);
    assert.equal(repeatedEvidence.decision.disposition, 'RECONCILE_OWNED');
    assert.equal(repeatedEvidence.changed, false);

    const changedEntity = planWorldDirectorOwnedRecord(
      entity,
      { ...entityDesired, name: 'Reconciled witness' },
      entityExpected,
      worldDirectorOwnershipAdapters.entityCard,
      (existing, desired) => ({ ...existing, ...desired, metadata: { ...existing.metadata, ...desired.metadata }, updatedAt: existing.updatedAt }),
    );
    assert.equal(changedEntity.decision.disposition, 'RECONCILE_OWNED');
    assert.equal(changedEntity.changed, true);
    const changedFact = planWorldDirectorOwnedRecord(
      fact,
      { ...factDesired, objectValue: 'A revised shared fact.' },
      factExpected,
      worldDirectorOwnershipAdapters.knowledgeFact,
      (existing, desired) => ({ ...existing, ...desired, metadata: { ...existing.metadata, ...desired.metadata } }),
    );
    const changedEvidence = planWorldDirectorOwnedRecord(
      evidence,
      { ...evidenceDesired, summary: 'Revised historical evidence.' },
      evidenceExpected,
      worldDirectorOwnershipAdapters.historicalEvidence,
      (existing, desired) => ({ ...existing, ...desired, metadata: { ...existing.metadata, ...desired.metadata } }),
    );
    assert.equal(changedFact.decision.reason, 'OWNER_APPEND_ONLY');
    assert.deepEqual(changedFact.record, fact);
    assert.equal(changedEvidence.decision.reason, 'OWNER_APPEND_ONLY');
    assert.deepEqual(changedEvidence.record, evidence);
  } finally {
    if (previousPersistencePath === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = previousPersistencePath;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});


test('World Director rejects command-ID reuse with a different payload after repository reload', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');

  const originalPersistencePath = process.env.DREAMBOOK_PERSISTENCE_PATH;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'dreamville-world-director-command-conflict-'));
  const persistencePath = join(tempDirectory, 'dreambook.json');
  const storyId = 'world_director_command_conflict_after_reload';
  const commandId = 'wd_conflict_prepare_scene_001';
  const sceneObjectId = 'wd_conflict_original_clue';

  try {
    process.env.DREAMBOOK_PERSISTENCE_PATH = persistencePath;
    const repository = new InMemoryWorldRepository();
    repository.seedStory(storyId);
    const location = repository.getGeographyGraph(storyId).getAllNodes()[0];
    assert.ok(location, 'fixture needs a canonical location');
    const command = {
      commandId,
      storyId,
      actorId: 'wd_conflict_actor',
      type: 'INTERACT' as const,
      payload: { action: 'PREPARE_SCENE', sceneKey: 'fixture:original-scene' },
      source: 'SYSTEM' as const,
    };

    const firstResult = await canonicalCommandEngine.execute(repository, command, async (_command, context) => {
      const added = context.repository.getGeographyGraph(storyId).addSceneObject(location.id, {
        id: sceneObjectId,
        name: 'Original canonical clue',
        kind: 'ITEM',
        visible: true,
        interactable: true,
        provenance: 'world_director_command_conflict_test',
      });
      assert.equal(added.success, true);
      return { success: true, data: { sceneObjectId }, summary: 'Committed original scene preparation.' };
    });
    assert.equal(firstResult.success, true);
    repository.saveStoryRun(repository.getStoryRun(storyId));

    const reloaded = new InMemoryWorldRepository();
    const eventCountBeforeConflict = reloaded.getCanonicalCommandEvents(storyId).length;
    const changedCommand = {
      ...command,
      payload: { action: 'PREPARE_SCENE', sceneKey: 'fixture:DIFFERENT-scene' },
    };
    let conflictingHandlerCalls = 0;

    const conflictResult = await canonicalCommandEngine.execute(reloaded, changedCommand, async () => {
      conflictingHandlerCalls += 1;
      return { success: true, data: { sceneObjectId: 'wd_conflict_replacement_clue' }, summary: 'Must not execute.' };
    });

    assert.equal(conflictResult.success, false, 'same command ID with a different fingerprint must fail closed');
    assert.match(conflictResult.errorReason || '', /different payload/i);
    assert.equal(conflictingHandlerCalls, 0, 'a conflicting replay must never execute the handler');
    assert.equal(reloaded.getCanonicalCommandEvents(storyId).length, eventCountBeforeConflict, 'conflict must not append a command event');
    const sceneObjects = reloaded.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects || [];
    assert.equal(sceneObjects.filter((object) => object.id === sceneObjectId).length, 1);
    assert.equal(sceneObjects.some((object) => object.id === 'wd_conflict_replacement_clue'), false);
    assert.equal(sceneObjects.find((object) => object.id === sceneObjectId)?.name, 'Original canonical clue');
  } finally {
    if (originalPersistencePath === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = originalPersistencePath;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('World Director staged commit save failure rolls back and leaves batching usable for the next command', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');
  const { PersistentGameStore } = await import('../server/services/persistentGameStore');

  const previousPersistencePath = process.env.DREAMBOOK_PERSISTENCE_PATH;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'dreamville-world-director-failed-commit-'));
  const persistencePath = join(tempDirectory, 'dreambook.json');
  const originalSave = PersistentGameStore.prototype.save;
  let saveCount = 0;
  let failNextSave = false;

  try {
    process.env.DREAMBOOK_PERSISTENCE_PATH = persistencePath;
    PersistentGameStore.prototype.save = function (data) {
      if (this.getPath() === persistencePath) {
        saveCount += 1;
        if (failNextSave) {
          failNextSave = false;
          throw new Error('injected staged commit persistence failure');
        }
      }
      return originalSave.call(this, data);
    };

    const repository = new InMemoryWorldRepository();
    const storyId = 'wd_atomic_commit_failure';
    const actorId = 'wd_atomic_commit_failure_actor';
    repository.seedStory(storyId);
    const location = repository.getGeographyGraph(storyId).getAllNodes()[0];
    assert.ok(location, 'fixture needs a canonical location');
    saveCount = 0;
    failNextSave = true;

    const failedCommand = {
      commandId: 'wd_atomic_commit_failure_001',
      storyId,
      actorId,
      type: 'INTERACT' as const,
      payload: { action: 'PREPARE_FAILING_SCENE', preparationKey: 'fixture:failed-commit' },
      source: 'SYSTEM' as const,
      transactionMode: 'STAGED' as const,
    };
    const failedResult = await canonicalCommandEngine.execute(repository, failedCommand, async (_command, context) => {
      const added = context.repository.getGeographyGraph(storyId).addSceneObject(location.id, {
        id: 'wd_atomic_commit_failure_clue',
        name: 'Must not survive failed commit',
        kind: 'ITEM',
        visible: true,
        provenance: 'world_director_failed_commit_test',
      });
      assert.equal(added.success, true);
      return { success: true, data: { sceneObjectId: 'wd_atomic_commit_failure_clue' }, summary: 'Attempted a commit that will fail at persistence.' };
    });

    assert.equal(failedResult.success, false, 'a failed durable flush must fail the staged command');
    assert.match(failedResult.errorReason || '', /injected staged commit persistence failure/);
    assert.ok(saveCount >= 2, 'the failed flush must be followed by cleanup and a durable pre-state restore');

    const afterFailure = new InMemoryWorldRepository();
    assert.equal(
      afterFailure.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.some((object) => object.id === 'wd_atomic_commit_failure_clue'),
      false,
      'a scene object from a failed staged commit must not survive repository reload',
    );
    assert.equal(
      afterFailure.getCanonicalCommandEvents(storyId).some((event: any) => event.commandId === failedCommand.commandId),
      false,
      'a failed staged commit must not leave a committed command event',
    );

    // Corrupt the primary file to verify snapshot recovery cannot resurrect the
    // failed staged scene or its command event.
    const { readFileSync, writeFileSync } = await import('node:fs');
    writeFileSync(persistencePath, '{ invalid json', 'utf8');
    const recoveredFromSnapshot = new InMemoryWorldRepository();
    const repairedPrimary = JSON.parse(readFileSync(persistencePath, 'utf8'));
    assert.ok(repairedPrimary, 'snapshot recovery must atomically repair the primary file');
    assert.equal(
      recoveredFromSnapshot.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.some((object) => object.id === 'wd_atomic_commit_failure_clue'),
      false,
      'snapshot recovery after a failed commit must not resurrect its scene object',
    );
    assert.equal(
      recoveredFromSnapshot.getCanonicalCommandEvents(storyId).some((event: any) => event.commandId === failedCommand.commandId),
      false,
      'snapshot recovery after a failed commit must not resurrect its command event',
    );

    saveCount = 0;
    const recoveryCommand = {
      commandId: 'wd_atomic_commit_failure_002',
      storyId,
      actorId,
      type: 'INTERACT' as const,
      payload: { action: 'PREPARE_RECOVERY_SCENE', preparationKey: 'fixture:recovery-commit' },
      source: 'SYSTEM' as const,
      transactionMode: 'STAGED' as const,
    };
    const recoveryResult = await canonicalCommandEngine.execute(repository, recoveryCommand, async (_command, context) => {
      const added = context.repository.getGeographyGraph(storyId).addSceneObject(location.id, {
        id: 'wd_atomic_commit_recovery_clue',
        name: 'Recovery commit clue',
        kind: 'ITEM',
        visible: true,
        provenance: 'world_director_failed_commit_test',
      });
      assert.equal(added.success, true);
      return { success: true, data: { sceneObjectId: 'wd_atomic_commit_recovery_clue' }, summary: 'Committed after recovering from a failed flush.' };
    });

    assert.equal(recoveryResult.success, true, 'a subsequent staged command must still commit after the prior save failure');
    assert.equal(saveCount, 1, 'the subsequent command must flush exactly once, proving the batch depth recovered');
    const afterRecovery = new InMemoryWorldRepository();
    assert.equal(
      afterRecovery.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.some((object) => object.id === 'wd_atomic_commit_recovery_clue'),
      true,
    );
    assert.ok(afterRecovery.getCanonicalCommandEvents(storyId).some((event: any) => event.commandId === recoveryCommand.commandId));
  } finally {
    PersistentGameStore.prototype.save = originalSave;
    if (previousPersistencePath === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = previousPersistencePath;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('World Director staged commit remains committed when post-rename snapshot pruning fails', async () => {
  const { InMemoryWorldRepository } = await import('../server/repositories/worldRepository');
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');
  const { PersistentGameStore } = await import('../server/services/persistentGameStore');

  const previousPersistencePath = process.env.DREAMBOOK_PERSISTENCE_PATH;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'dreamville-world-director-prune-failure-'));
  const persistencePath = join(tempDirectory, 'dreambook.json');
  const originalSave = PersistentGameStore.prototype.save;
  const originalPrune = (PersistentGameStore.prototype as any).pruneSnapshots;
  let saveCount = 0;
  let failPruneOnce = false;

  try {
    process.env.DREAMBOOK_PERSISTENCE_PATH = persistencePath;
    PersistentGameStore.prototype.save = function (data) {
      if (this.getPath() === persistencePath) saveCount += 1;
      return originalSave.call(this, data);
    };
    (PersistentGameStore.prototype as any).pruneSnapshots = function () {
      if (this.getPath() === persistencePath && failPruneOnce) {
        failPruneOnce = false;
        throw new Error('injected post-rename snapshot pruning failure');
      }
      return originalPrune.call(this);
    };

    const repository = new InMemoryWorldRepository();
    const storyId = 'wd_post_rename_prune_failure';
    const actorId = 'wd_post_rename_prune_actor';
    repository.seedStory(storyId);
    const location = repository.getGeographyGraph(storyId).getAllNodes()[0];
    assert.ok(location, 'fixture needs a canonical location');
    saveCount = 0;
    failPruneOnce = true;

    const command = {
      commandId: 'wd_post_rename_prune_failure_001',
      storyId,
      actorId,
      type: 'INTERACT' as const,
      payload: { action: 'PREPARE_POST_RENAME_SCENE', preparationKey: 'fixture:post-rename-prune' },
      source: 'SYSTEM' as const,
      transactionMode: 'STAGED' as const,
    };
    const result = await canonicalCommandEngine.execute(repository, command, async (_command, context) => {
      const added = context.repository.getGeographyGraph(storyId).addSceneObject(location.id, {
        id: 'wd_post_rename_prune_clue',
        name: 'Committed despite snapshot maintenance failure',
        kind: 'ITEM',
        visible: true,
        provenance: 'world_director_post_rename_prune_test',
      });
      assert.equal(added.success, true);
      return { success: true, data: { sceneObjectId: 'wd_post_rename_prune_clue' }, summary: 'Committed a scene before snapshot pruning failed.' };
    });

    assert.equal(failPruneOnce, false, 'the injected maintenance failure must have occurred after rename');
    assert.equal(result.success, true, 'post-rename snapshot maintenance failure must not roll back an already committed store');
    assert.equal(saveCount, 1, 'the canonical commit must still use one store save');
    const reloaded = new InMemoryWorldRepository();
    assert.equal(
      reloaded.getGeographyGraph(storyId).getNode(location.id)?.sceneObjects?.some((object) => object.id === 'wd_post_rename_prune_clue'),
      true,
      'the renamed primary store must contain the committed scene object',
    );
    assert.ok(
      reloaded.getCanonicalCommandEvents(storyId).some((event: any) => event.commandId === command.commandId),
      'the renamed primary store must contain the matching command event',
    );
  } finally {
    PersistentGameStore.prototype.save = originalSave;
    (PersistentGameStore.prototype as any).pruneSnapshots = originalPrune;
    if (previousPersistencePath === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = previousPersistencePath;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

