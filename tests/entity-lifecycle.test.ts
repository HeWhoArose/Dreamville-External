import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  EntityLifecycleStateMachine,
  type EntityLifecycleStage,
} from '../server/domain/entityLifecycle';
import { worldRepository } from '../server/repositories/worldRepository';
import type { LocationSceneObject } from '../server/domain/types';

describe('Milestone 3: 4-Stage Entity Lifecycle State Machine', () => {
  const ALL_STAGES: EntityLifecycleStage[] = [
    'EPHEMERAL',
    'PROPOSED',
    'ACTIVE_TEMPORARY',
    'PERSISTENT',
  ];

  it('validates all legal transitions across the 4 stages', () => {
    // EPHEMERAL
    assert.equal(EntityLifecycleStateMachine.canTransition('EPHEMERAL', 'PROPOSED'), true);
    assert.equal(EntityLifecycleStateMachine.canTransition('EPHEMERAL', 'ACTIVE_TEMPORARY'), true);
    assert.equal(EntityLifecycleStateMachine.canTransition('EPHEMERAL', 'PERSISTENT'), false);
    assert.equal(EntityLifecycleStateMachine.canTransition('EPHEMERAL', 'EPHEMERAL'), false);

    // PROPOSED
    assert.equal(EntityLifecycleStateMachine.canTransition('PROPOSED', 'ACTIVE_TEMPORARY'), true);
    assert.equal(EntityLifecycleStateMachine.canTransition('PROPOSED', 'EPHEMERAL'), true);
    assert.equal(EntityLifecycleStateMachine.canTransition('PROPOSED', 'PERSISTENT'), false);
    assert.equal(EntityLifecycleStateMachine.canTransition('PROPOSED', 'PROPOSED'), false);

    // ACTIVE_TEMPORARY
    assert.equal(EntityLifecycleStateMachine.canTransition('ACTIVE_TEMPORARY', 'PERSISTENT'), true);
    assert.equal(EntityLifecycleStateMachine.canTransition('ACTIVE_TEMPORARY', 'EPHEMERAL'), true);
    assert.equal(EntityLifecycleStateMachine.canTransition('ACTIVE_TEMPORARY', 'PROPOSED'), false);
    assert.equal(EntityLifecycleStateMachine.canTransition('ACTIVE_TEMPORARY', 'ACTIVE_TEMPORARY'), false);

    // PERSISTENT (Terminal canonical state)
    for (const target of ALL_STAGES) {
      assert.equal(
        EntityLifecycleStateMachine.canTransition('PERSISTENT', target),
        false,
        `PERSISTENT must not transition to ${target}`
      );
    }
  });

  it('transition() method returns success and target stage on valid transitions', () => {
    const res1 = EntityLifecycleStateMachine.transition('EPHEMERAL', 'PROPOSED');
    assert.equal(res1.success, true);
    assert.equal(res1.stage, 'PROPOSED');

    const res2 = EntityLifecycleStateMachine.transition('PROPOSED', 'ACTIVE_TEMPORARY');
    assert.equal(res2.success, true);
    assert.equal(res2.stage, 'ACTIVE_TEMPORARY');

    const res3 = EntityLifecycleStateMachine.transition('ACTIVE_TEMPORARY', 'PERSISTENT');
    assert.equal(res3.success, true);
    assert.equal(res3.stage, 'PERSISTENT');
  });

  it('transition() method fails closed on illegal transitions', () => {
    const res1 = EntityLifecycleStateMachine.transition('EPHEMERAL', 'PERSISTENT');
    assert.equal(res1.success, false);
    assert.equal(res1.stage, 'EPHEMERAL');
    assert.match(res1.errorReason || '', /Invalid entity lifecycle transition/);

    const res2 = EntityLifecycleStateMachine.transition('PERSISTENT', 'EPHEMERAL');
    assert.equal(res2.success, false);
    assert.equal(res2.stage, 'PERSISTENT');
  });

  it('enforces dependency protection against eviction', () => {
    const protectedVehicle = {
      stage: 'ACTIVE_TEMPORARY' as EntityLifecycleStage,
      ttlTurns: 0,
      activeDependencies: ['player_boarded'],
      locationId: 'loc_street',
    };

    assert.equal(EntityLifecycleStateMachine.isProtectedFromEviction(protectedVehicle), true);
    assert.equal(EntityLifecycleStateMachine.shouldEvict(protectedVehicle, 'loc_street'), false);

    // Once dependency is cleared, eviction proceeds when ttl <= 0
    protectedVehicle.activeDependencies = [];
    assert.equal(EntityLifecycleStateMachine.isProtectedFromEviction(protectedVehicle), false);
    assert.equal(EntityLifecycleStateMachine.shouldEvict(protectedVehicle, 'loc_street'), true);
  });

  it('evaluates eviction on player location departure', () => {
    const temporaryProp = {
      stage: 'ACTIVE_TEMPORARY' as EntityLifecycleStage,
      ttlTurns: 3,
      activeDependencies: [],
      locationId: 'loc_office',
    };

    // While player is present, entity is not evicted
    assert.equal(EntityLifecycleStateMachine.shouldEvict(temporaryProp, 'loc_office'), false);

    // When player leaves to another location, entity is evicted
    assert.equal(EntityLifecycleStateMachine.shouldEvict(temporaryProp, 'loc_street'), true);
  });

  describe('Repository Garbage Collection', () => {
    const testStoryId = 'test_story_gc_lifecycle';

    beforeEach(() => {
      // Seed test story in worldRepository
      worldRepository.seedStory(testStoryId);
      const run = worldRepository.getStoryRun(testStoryId);
      if (run) {
        if (!run.runtimeState) run.runtimeState = {} as any;
        run.runtimeState.player = { locationId: 'loc_office' } as any;
      }
    });

    it('garbageCollectTemporaryEntities evicts expired objects and retains protected ones', () => {
      const graph = worldRepository.getGeographyGraph(testStoryId);

      // Add temporary scene objects
      const expiredObj: LocationSceneObject = {
        id: 'temp_chair_1',
        name: 'Temporary Chair',
        kind: 'STRUCTURE',
        lifecycleStage: 'ACTIVE_TEMPORARY',
        ttlTurns: 1, // Will decrement to 0 and evict
        activeDependencies: [],
      };
      const protectedTaxi: LocationSceneObject = {
        id: 'temp_taxi_1',
        name: 'Protected Taxi',
        kind: 'STRUCTURE',
        lifecycleStage: 'ACTIVE_TEMPORARY',
        ttlTurns: 1,
        activeDependencies: ['player_boarded'], // Protected!
      };
      const persistentFixture: LocationSceneObject = {
        id: 'perm_door_1',
        name: 'Heavy Oak Door',
        kind: 'STRUCTURE',
        lifecycleStage: 'PERSISTENT',
      };

      const originNode = graph.getAllNodes()[0];
      graph.addSceneObject(originNode.id, expiredObj);
      graph.addSceneObject(originNode.id, protectedTaxi);
      graph.addSceneObject(originNode.id, persistentFixture);

      // Add temporary entity card
      worldRepository.saveEntityCard(testStoryId, {
        id: 'card_temp_pedestrian',
        name: 'Passing Pedestrian',
        kind: 'NPC',
        lifecycle: {
          stage: 'ACTIVE_TEMPORARY',
          status: 'ACTIVE',
          ttlTurns: 1,
          activeDependencies: [],
        },
      });

      // Run GC
      const gcResult = worldRepository.garbageCollectTemporaryEntities(testStoryId);

      assert.ok(gcResult.evictedSceneObjects.includes('temp_chair_1'));
      assert.ok(!gcResult.evictedSceneObjects.includes('temp_taxi_1'));
      assert.ok(!gcResult.evictedSceneObjects.includes('perm_door_1'));
      assert.ok(gcResult.evictedEntityCards.includes('card_temp_pedestrian'));

      // Check card is actually removed
      const removedCard = worldRepository.getEntityCard(testStoryId, 'card_temp_pedestrian');
      assert.equal(removedCard, null);

      // Check scene object is physically removed from GeographyGraph
      const nodeAfterGC = graph.getNode(originNode.id);
      const remainingSceneObjectIds = (nodeAfterGC?.sceneObjects || []).map((o) => o.id);
      assert.ok(!remainingSceneObjectIds.includes('temp_chair_1'), 'Evicted scene object must be removed from graph');
      assert.ok(remainingSceneObjectIds.includes('temp_taxi_1'), 'Protected scene object must remain in graph');
      assert.ok(remainingSceneObjectIds.includes('perm_door_1'), 'Persistent scene object must remain in graph');
    });

    it('removes entity cards cleanly via removeEntityCard()', () => {
      worldRepository.saveEntityCard(testStoryId, {
        id: 'card_to_remove',
        name: 'Temporary Witness',
        kind: 'NPC',
      });

      assert.notEqual(worldRepository.getEntityCard(testStoryId, 'card_to_remove'), null);
      const removed = worldRepository.removeEntityCard(testStoryId, 'card_to_remove');
      assert.equal(removed, true);
      assert.equal(worldRepository.getEntityCard(testStoryId, 'card_to_remove'), null);
    });
  });
});
