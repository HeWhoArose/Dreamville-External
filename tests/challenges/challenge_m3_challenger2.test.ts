import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  WorldSimulatorAdjudicator,
  type WorldSimulationProposal,
  type SimulationWorldState,
  type EntityLifecycleStage,
} from '../../server/domain/worldSimulationProposal';
import {
  EntityLifecycleStateMachine,
} from '../../server/domain/entityLifecycle';
import { VehicleInteractionAuthority } from '../../server/domain/vehicleInteractionAuthority';
import { worldRepository } from '../../server/repositories/worldRepository';
import { worldSimulationService } from '../../server/simulation/worldSimulationService';
import { PlayerLifecycleState } from '../../server/domain/playerLifecycleState';
import type { LocationSceneObject } from '../../server/domain/types';

describe('Milestone 3 Challenger 2: Adversarial Stress Suite', () => {

  // =========================================================================
  // 1. CONCURRENCY AND RACE CONDITIONS
  // =========================================================================
  describe('1. Concurrency and Race Conditions', () => {
    it('1.1 Rapid sequential proposals competing for the same worldVersion & baseStateHash', () => {
      const initialState = { streetAccess: true, weather: 'fog', lights: 'dim' };
      const baseHash = WorldSimulatorAdjudicator.calculateStateHash(initialState);
      const currentWorld: SimulationWorldState = {
        worldVersion: 10,
        state: { ...initialState },
        stateHash: baseHash,
      };

      // 50 concurrent / rapid sequential proposals all targeting worldVersion: 10 with baseHash
      const proposals: WorldSimulationProposal[] = Array.from({ length: 50 }, (_, i) => ({
        proposalId: `rapid_prop_${i}`,
        idempotencyKey: `idemp_rapid_${i}`,
        worldVersion: 10,
        baseStateHash: baseHash,
        entityType: 'PROPOSED',
        proposedStateTransition: {
          type: 'SPAWN_STREET_PROP',
          targetId: `prop_target_${i}`,
          payload: { propId: `prop_${i}`, value: i },
        },
        requiredPreconditions: [
          { predicate: 'streetAccess', expected: true },
        ],
        provenance: {
          source: 'MODEL_PROPOSED',
          timestamp: new Date().toISOString(),
        },
        safeFallback: { message: 'Proposal rejected' },
      }));

      // Adjudicate first proposal: MUST SUCCEED
      const firstResult = WorldSimulatorAdjudicator.adjudicate(currentWorld, proposals[0]);
      assert.equal(firstResult.accepted, true, 'First proposal must be accepted');
      assert.equal(firstResult.code, 'PROPOSAL_COMMITTED');
      assert.equal(firstResult.worldVersion, 11, 'worldVersion must increment to 11');
      assert.notEqual(firstResult.stateHash, baseHash, 'stateHash must be updated');

      // Update currentWorld state as authoritative commit
      currentWorld.worldVersion = firstResult.worldVersion;
      currentWorld.stateHash = firstResult.stateHash;
      currentWorld.state = {
        ...currentWorld.state,
        ...(proposals[0].proposedStateTransition.payload || {}),
      };

      // Adjudicate all remaining 49 proposals against the updated world state:
      // ALL 49 MUST BE REJECTED with STALE_PROPOSAL_REJECTED
      let staleRejections = 0;
      for (let i = 1; i < proposals.length; i++) {
        const result = WorldSimulatorAdjudicator.adjudicate(currentWorld, proposals[i]);
        assert.equal(result.accepted, false, `Proposal ${i} must be rejected`);
        assert.equal(result.code, 'STALE_PROPOSAL_REJECTED', `Proposal ${i} must have code STALE_PROPOSAL_REJECTED`);
        assert.equal(result.worldVersion, 11, 'World version in result must reflect current canon version');
        assert.equal(result.stateHash, currentWorld.stateHash, 'State hash must remain canon hash');
        assert.deepEqual(result.commitRecords, [], 'No commit records should be returned on rejection');
        staleRejections++;
      }

      assert.equal(staleRejections, 49, 'All 49 competing stale proposals must be cleanly rejected');
      assert.equal(currentWorld.worldVersion, 11, 'Canon version must remain exactly 11');
    });

    it('1.2 CAS state consistency under repeated proposal application and rollback cycles', () => {
      const state0 = { streetAccess: true, time: 'morning' };
      const hash0 = WorldSimulatorAdjudicator.calculateStateHash(state0);
      let worldState: SimulationWorldState = {
        worldVersion: 1,
        state: { ...state0 },
        stateHash: hash0,
      };

      // Step A: Apply proposal 1
      const prop1: WorldSimulationProposal = {
        proposalId: 'prop_step_1',
        idempotencyKey: 'idemp_step_1',
        worldVersion: 1,
        baseStateHash: hash0,
        proposedStateTransition: {
          type: 'TIME_ADVANCE',
          payload: { time: 'noon' },
        },
        requiredPreconditions: [],
        provenance: { source: 'DETERMINISTIC_ARCHETYPE', timestamp: '2026-11-12T12:00:00Z' },
        safeFallback: { message: 'Fallback' },
      };

      const res1 = WorldSimulatorAdjudicator.adjudicate(worldState, prop1);
      assert.equal(res1.accepted, true);
      assert.equal(res1.worldVersion, 2);

      // Advance world state
      worldState = {
        worldVersion: res1.worldVersion,
        state: { ...worldState.state, time: 'noon' },
        stateHash: res1.stateHash,
      };

      // Step B: Apply proposal 2
      const prop2: WorldSimulationProposal = {
        proposalId: 'prop_step_2',
        idempotencyKey: 'idemp_step_2',
        worldVersion: 2,
        baseStateHash: res1.stateHash,
        proposedStateTransition: {
          type: 'TIME_ADVANCE',
          payload: { time: 'evening' },
        },
        requiredPreconditions: [],
        provenance: { source: 'DETERMINISTIC_ARCHETYPE', timestamp: '2026-11-12T18:00:00Z' },
        safeFallback: { message: 'Fallback' },
      };

      const res2 = WorldSimulatorAdjudicator.adjudicate(worldState, prop2);
      assert.equal(res2.accepted, true);
      assert.equal(res2.worldVersion, 3);

      // Step C: Rollback simulation state back to state0 (e.g. branch discard or rewind)
      worldState = {
        worldVersion: 1,
        state: { ...state0 },
        stateHash: hash0,
      };

      // Verify that after rollback, a proposal based on version 2 or 3 is rejected
      const staleAfterRollback = WorldSimulatorAdjudicator.adjudicate(worldState, prop2);
      assert.equal(staleAfterRollback.accepted, false);
      assert.equal(staleAfterRollback.code, 'STALE_PROPOSAL_REJECTED');

      // Verify that a fresh proposal based on restored version 1 applies cleanly
      const prop3Restored: WorldSimulationProposal = {
        proposalId: 'prop_step_3_alt',
        idempotencyKey: 'idemp_step_3_alt',
        worldVersion: 1,
        baseStateHash: hash0,
        proposedStateTransition: {
          type: 'WEATHER_RAIN',
          payload: { weather: 'storm' },
        },
        requiredPreconditions: [],
        provenance: { source: 'DETERMINISTIC_ARCHETYPE', timestamp: '2026-11-12T12:00:00Z' },
        safeFallback: { message: 'Fallback' },
      };

      const res3 = WorldSimulatorAdjudicator.adjudicate(worldState, prop3Restored);
      assert.equal(res3.accepted, true);
      assert.equal(res3.worldVersion, 2);
      assert.notEqual(res3.stateHash, res1.stateHash, 'Alternative branch produces distinct state hash');
    });

    it('1.3 Out-of-order, future, negative, and mismatched hash proposals fail closed', () => {
      const canonState = { streetAccess: true, district: 'central' };
      const canonHash = WorldSimulatorAdjudicator.calculateStateHash(canonState);
      const world: SimulationWorldState = {
        worldVersion: 5,
        state: canonState,
        stateHash: canonHash,
      };

      // Future version (e.g. proposal skipped ahead to 6 or 100)
      const futureProp: WorldSimulationProposal = {
        proposalId: 'prop_future',
        idempotencyKey: 'idemp_future',
        worldVersion: 6,
        baseStateHash: canonHash,
        proposedStateTransition: { type: 'TEST' },
        requiredPreconditions: [],
        provenance: { source: 'AUTHORED', timestamp: '2026-11-12T12:00:00Z' },
        safeFallback: { message: 'Fallback' },
      };
      const resFuture = WorldSimulatorAdjudicator.adjudicate(world, futureProp);
      assert.equal(resFuture.accepted, false);
      assert.equal(resFuture.code, 'STALE_PROPOSAL_REJECTED');

      // Negative version
      const negProp: WorldSimulationProposal = {
        ...futureProp,
        proposalId: 'prop_neg',
        worldVersion: -5,
      };
      const resNeg = WorldSimulatorAdjudicator.adjudicate(world, negProp);
      assert.equal(resNeg.accepted, false);
      assert.equal(resNeg.code, 'STALE_PROPOSAL_REJECTED');

      // Mismatched baseStateHash despite correct version
      const mismatchProp: WorldSimulationProposal = {
        ...futureProp,
        proposalId: 'prop_mismatch',
        worldVersion: 5,
        baseStateHash: 'deadbeef12345678',
      };
      const resMismatch = WorldSimulatorAdjudicator.adjudicate(world, mismatchProp);
      assert.equal(resMismatch.accepted, false);
      assert.equal(resMismatch.code, 'STALE_PROPOSAL_REJECTED');
    });
  });

  // =========================================================================
  // 2. COMPLEX PRECONDITIONS
  // =========================================================================
  describe('2. Complex Preconditions', () => {
    let testWorld: SimulationWorldState;

    beforeEach(() => {
      const state = {
        isRaining: false,
        isActive: true,
        temperature: 0,
        windSpeed: 14.5,
        negativeVal: -42,
        cityName: 'Dreamville',
        emptyLabel: '',
        nullProperty: null,
        undefinedProperty: undefined,
        nestedConfig: { securityLevel: 'HIGH', alarms: [1, 2, 3] },
      };
      testWorld = {
        worldVersion: 1,
        state,
        stateHash: WorldSimulatorAdjudicator.calculateStateHash(state),
      };
    });

    const createProposalWithConditions = (conditions: Array<{ predicate: string; expected: unknown }>): WorldSimulationProposal => ({
      proposalId: 'prop_precond_test',
      idempotencyKey: 'idemp_precond_test',
      worldVersion: testWorld.worldVersion,
      baseStateHash: testWorld.stateHash,
      proposedStateTransition: {
        type: 'MUTATE_PARAM',
        payload: { updated: true },
      },
      requiredPreconditions: conditions,
      provenance: { source: 'MODEL_PROPOSED', timestamp: '2026-11-12T12:00:00Z' },
      safeFallback: { message: 'Precondition check failed' },
    });

    it('2.1 Boolean predicate equality with strict type checks', () => {
      // isRaining is false -> expecting false passes
      const p1 = createProposalWithConditions([{ predicate: 'isRaining', expected: false }]);
      const r1 = WorldSimulatorAdjudicator.adjudicate(testWorld, p1);
      assert.equal(r1.accepted, true);

      // isRaining is false -> expecting true fails
      const p2 = createProposalWithConditions([{ predicate: 'isRaining', expected: true }]);
      const r2 = WorldSimulatorAdjudicator.adjudicate(testWorld, p2);
      assert.equal(r2.accepted, false);
      assert.equal(r2.code, 'PRECONDITION_FAILED');

      // Strict type check: isActive is true, expecting truthy number 1 fails
      const p3 = createProposalWithConditions([{ predicate: 'isActive', expected: 1 }]);
      const r3 = WorldSimulatorAdjudicator.adjudicate(testWorld, p3);
      assert.equal(r3.accepted, false);
      assert.equal(r3.code, 'PRECONDITION_FAILED');

      // Strict type check: isRaining is false, expecting falsy 0 fails
      const p4 = createProposalWithConditions([{ predicate: 'isRaining', expected: 0 }]);
      const r4 = WorldSimulatorAdjudicator.adjudicate(testWorld, p4);
      assert.equal(r4.accepted, false);
      assert.equal(r4.code, 'PRECONDITION_FAILED');
    });

    it('2.2 Numeric predicate equality: zero, negatives, floats, boundary values', () => {
      // Zero equality: temperature is 0
      const pZero = createProposalWithConditions([{ predicate: 'temperature', expected: 0 }]);
      assert.equal(WorldSimulatorAdjudicator.adjudicate(testWorld, pZero).accepted, true);

      // Temperature is 0, expecting false fails
      const pZeroVsFalse = createProposalWithConditions([{ predicate: 'temperature', expected: false }]);
      assert.equal(WorldSimulatorAdjudicator.adjudicate(testWorld, pZeroVsFalse).code, 'PRECONDITION_FAILED');

      // Negative equality: negativeVal is -42
      const pNeg = createProposalWithConditions([{ predicate: 'negativeVal', expected: -42 }]);
      assert.equal(WorldSimulatorAdjudicator.adjudicate(testWorld, pNeg).accepted, true);

      // Float equality: windSpeed is 14.5
      const pFloat = createProposalWithConditions([{ predicate: 'windSpeed', expected: 14.5 }]);
      assert.equal(WorldSimulatorAdjudicator.adjudicate(testWorld, pFloat).accepted, true);

      // Mismatched number: windSpeed expecting 14.6 fails
      const pFloatMismatch = createProposalWithConditions([{ predicate: 'windSpeed', expected: 14.6 }]);
      assert.equal(WorldSimulatorAdjudicator.adjudicate(testWorld, pFloatMismatch).code, 'PRECONDITION_FAILED');
    });

    it('2.3 String predicate equality: empty strings, case-sensitivity, whitespace', () => {
      // Empty string: emptyLabel is ""
      const pEmpty = createProposalWithConditions([{ predicate: 'emptyLabel', expected: '' }]);
      assert.equal(WorldSimulatorAdjudicator.adjudicate(testWorld, pEmpty).accepted, true);

      // Case-sensitivity: cityName is "Dreamville", expecting "dreamville" fails
      const pCase = createProposalWithConditions([{ predicate: 'cityName', expected: 'dreamville' }]);
      assert.equal(WorldSimulatorAdjudicator.adjudicate(testWorld, pCase).code, 'PRECONDITION_FAILED');

      // Whitespace sensitivity: cityName is "Dreamville", expecting " Dreamville " fails
      const pSpace = createProposalWithConditions([{ predicate: 'cityName', expected: ' Dreamville ' }]);
      assert.equal(WorldSimulatorAdjudicator.adjudicate(testWorld, pSpace).code, 'PRECONDITION_FAILED');
    });

    it('2.4 Null, undefined, and missing predicates fail closed', () => {
      // Explicit nullProperty is null -> expecting null passes
      const pNull = createProposalWithConditions([{ predicate: 'nullProperty', expected: null }]);
      assert.equal(WorldSimulatorAdjudicator.adjudicate(testWorld, pNull).accepted, true);

      // nullProperty is null -> expecting undefined fails
      const pNullVsUndef = createProposalWithConditions([{ predicate: 'nullProperty', expected: undefined }]);
      assert.equal(WorldSimulatorAdjudicator.adjudicate(testWorld, pNullVsUndef).code, 'PRECONDITION_FAILED');

      // Missing predicate completely absent from state: expecting 'value' fails
      const pMissing = createProposalWithConditions([{ predicate: 'completelyNonExistentField', expected: 'value' }]);
      const rMissing = WorldSimulatorAdjudicator.adjudicate(testWorld, pMissing);
      assert.equal(rMissing.accepted, false);
      assert.equal(rMissing.code, 'PRECONDITION_FAILED');
      assert.match(rMissing.message, /completelyNonExistentField/);

      // Missing predicate expecting null fails (actual is undefined)
      const pMissingNull = createProposalWithConditions([{ predicate: 'completelyNonExistentField', expected: null }]);
      assert.equal(WorldSimulatorAdjudicator.adjudicate(testWorld, pMissingNull).code, 'PRECONDITION_FAILED');
    });

    it('2.5 Multi-precondition evaluation: failure isolation and atomic fail-closed', () => {
      // 4 passing conditions, 1 failing condition at index 3
      const multiConditions = [
        { predicate: 'isActive', expected: true },
        { predicate: 'temperature', expected: 0 },
        { predicate: 'cityName', expected: 'Dreamville' },
        { predicate: 'windSpeed', expected: 999.9 }, // FAILS
        { predicate: 'isRaining', expected: false },
      ];

      const proposal = createProposalWithConditions(multiConditions);
      const result = WorldSimulatorAdjudicator.adjudicate(testWorld, proposal);

      assert.equal(result.accepted, false);
      assert.equal(result.code, 'PRECONDITION_FAILED');
      assert.match(result.message, /windSpeed/);
      assert.equal(result.worldVersion, testWorld.worldVersion, 'World version must not advance');
      assert.deepEqual(result.commitRecords, [], 'No commit records emitted');
    });
  });

  // =========================================================================
  // 3. ENTITY LIFECYCLE & DUAL-STORE CONSISTENCY
  // =========================================================================
  describe('3. Entity Lifecycle & Dual-Store Consistency', () => {
    it('3.1 Validates full 4-stage progression and rejects backward/illegal jumps', () => {
      // Step 1: EPHEMERAL -> PROPOSED
      assert.equal(EntityLifecycleStateMachine.canTransition('EPHEMERAL', 'PROPOSED'), true);
      const t1 = EntityLifecycleStateMachine.transition('EPHEMERAL', 'PROPOSED');
      assert.equal(t1.success, true);
      assert.equal(t1.stage, 'PROPOSED');

      // Step 2: PROPOSED -> ACTIVE_TEMPORARY
      assert.equal(EntityLifecycleStateMachine.canTransition('PROPOSED', 'ACTIVE_TEMPORARY'), true);
      const t2 = EntityLifecycleStateMachine.transition('PROPOSED', 'ACTIVE_TEMPORARY');
      assert.equal(t2.success, true);
      assert.equal(t2.stage, 'ACTIVE_TEMPORARY');

      // Step 3: ACTIVE_TEMPORARY -> PERSISTENT
      assert.equal(EntityLifecycleStateMachine.canTransition('ACTIVE_TEMPORARY', 'PERSISTENT'), true);
      const t3 = EntityLifecycleStateMachine.transition('ACTIVE_TEMPORARY', 'PERSISTENT');
      assert.equal(t3.success, true);
      assert.equal(t3.stage, 'PERSISTENT');

      // Step 4: PERSISTENT is terminal: all transitions from PERSISTENT must fail
      const allStages: EntityLifecycleStage[] = ['EPHEMERAL', 'PROPOSED', 'ACTIVE_TEMPORARY', 'PERSISTENT'];
      for (const target of allStages) {
        assert.equal(
          EntityLifecycleStateMachine.canTransition('PERSISTENT', target),
          false,
          `PERSISTENT cannot transition to ${target}`
        );
        const res = EntityLifecycleStateMachine.transition('PERSISTENT', target);
        assert.equal(res.success, false);
        assert.equal(res.stage, 'PERSISTENT');
      }

      // Step 5: Direct illegal skips
      assert.equal(EntityLifecycleStateMachine.canTransition('EPHEMERAL', 'PERSISTENT'), false);
      assert.equal(EntityLifecycleStateMachine.canTransition('PROPOSED', 'PERSISTENT'), false);
      assert.equal(EntityLifecycleStateMachine.canTransition('ACTIVE_TEMPORARY', 'PROPOSED'), false);
    });

    it('3.2 Alternative lifecycle paths: Rejection and Eviction', () => {
      // PROPOSED -> EPHEMERAL (rejected proposal discarded)
      assert.equal(EntityLifecycleStateMachine.canTransition('PROPOSED', 'EPHEMERAL'), true);
      const rej = EntityLifecycleStateMachine.transition('PROPOSED', 'EPHEMERAL');
      assert.equal(rej.success, true);
      assert.equal(rej.stage, 'EPHEMERAL');

      // ACTIVE_TEMPORARY -> EPHEMERAL (eviction when TTL drops and player departs)
      assert.equal(EntityLifecycleStateMachine.canTransition('ACTIVE_TEMPORARY', 'EPHEMERAL'), true);
      const evict = EntityLifecycleStateMachine.transition('ACTIVE_TEMPORARY', 'EPHEMERAL');
      assert.equal(evict.success, true);
      assert.equal(evict.stage, 'EPHEMERAL');
    });

    it('3.3 Eviction protection guards temporary entities with active dependency tokens', () => {
      const entity = {
        stage: 'ACTIVE_TEMPORARY' as EntityLifecycleStage,
        ttlTurns: 0,
        activeDependencies: ['player_boarded', 'transit'],
        locationId: 'loc_street',
      };

      // Despite ttl <= 0 and player departure to loc_other, eviction is blocked
      assert.equal(EntityLifecycleStateMachine.isProtectedFromEviction(entity), true);
      assert.equal(EntityLifecycleStateMachine.shouldEvict(entity, 'loc_other'), false);

      // Remove transit token: still protected by player_boarded
      entity.activeDependencies = ['player_boarded'];
      assert.equal(EntityLifecycleStateMachine.isProtectedFromEviction(entity), true);
      assert.equal(EntityLifecycleStateMachine.shouldEvict(entity, 'loc_other'), false);

      // Remove all tokens: eviction now proceeds
      entity.activeDependencies = [];
      assert.equal(EntityLifecycleStateMachine.isProtectedFromEviction(entity), false);
      assert.equal(EntityLifecycleStateMachine.shouldEvict(entity, 'loc_other'), true);
    });

    it('3.4 Dual-store consistency: Promoted entity (PERSISTENT) is retained permanently in both stores', () => {
      const storyId = 'story_dual_store_promoted';
      worldRepository.seedStory(storyId);
      const graph = worldRepository.getGeographyGraph(storyId);
      const originNode = graph.getAllNodes()[0];

      // Add PERSISTENT scene object to GeographyGraph
      const promotedObject: LocationSceneObject = {
        id: 'evidence_weapon_promoted',
        name: 'Murder Weapon (Revolver)',
        kind: 'STRUCTURE',
        lifecycleStage: 'PERSISTENT',
        tags: ['clue', 'weapon', 'persistent'],
      };
      graph.addSceneObject(originNode.id, promotedObject);

      // Add PERSISTENT entity card to EntityRegistry
      worldRepository.saveEntityCard(storyId, {
        id: 'card_promoted_witness',
        name: 'Chief Witness Elena',
        kind: 'NPC',
        lifecycle: {
          stage: 'PERSISTENT',
          status: 'ACTIVE',
        },
      });

      // Run garbage collection multiple times
      worldRepository.garbageCollectTemporaryEntities(storyId);
      worldRepository.garbageCollectTemporaryEntities(storyId);

      // Verify both stores retain the persistent entities
      const nodeAfter = graph.getNode(originNode.id);
      const foundObj = (nodeAfter?.sceneObjects || []).find((o) => o.id === 'evidence_weapon_promoted');
      assert.ok(foundObj, 'PERSISTENT scene object must not be removed by GC');

      const foundCard = worldRepository.getEntityCard(storyId, 'card_promoted_witness');
      assert.ok(foundCard, 'PERSISTENT entity card must not be removed by GC');
    });

    it('3.5 Dual-store eviction behavior: EntityCard is removed cleanly from EntityRegistry', () => {
      const storyId = 'story_dual_store_gc';
      worldRepository.seedStory(storyId);
      const run = worldRepository.getStoryRun(storyId);
      if (run) {
        if (!run.runtimeState) run.runtimeState = {} as any;
        run.runtimeState.player = { locationId: 'loc_office' } as any;
      }

      // Add temporary entity card to EntityRegistry with ttl: 1
      worldRepository.saveEntityCard(storyId, {
        id: 'temp_card_informant',
        name: 'Temporary Street Informant',
        kind: 'NPC',
        lifecycle: {
          stage: 'ACTIVE_TEMPORARY',
          status: 'ACTIVE',
          ttlTurns: 1,
          activeDependencies: [],
        },
      });

      assert.notEqual(worldRepository.getEntityCard(storyId, 'temp_card_informant'), null);

      // Run GC
      const gcRes = worldRepository.garbageCollectTemporaryEntities(storyId);
      assert.ok(gcRes.evictedEntityCards.includes('temp_card_informant'));

      // Check EntityRegistry
      const cardAfter = worldRepository.getEntityCard(storyId, 'temp_card_informant');
      assert.equal(cardAfter, null, 'Expired temporary entity card must be cleanly evicted from EntityRegistry');
    });

    it('3.6 Dual-store GC: LocationSceneObject eviction from GeographyGraph sceneObjects', () => {
      const storyId = 'story_scene_gc_check';
      worldRepository.seedStory(storyId);
      const graph = worldRepository.getGeographyGraph(storyId);
      const originNode = graph.getAllNodes()[0];

      const tempSceneObj: LocationSceneObject = {
        id: 'temp_street_crate_01',
        name: 'Discarded Wooden Crate',
        kind: 'STRUCTURE',
        lifecycleStage: 'ACTIVE_TEMPORARY',
        ttlTurns: 1,
        activeDependencies: [],
      };
      graph.addSceneObject(originNode.id, tempSceneObj);

      // Verify it is present before GC
      const nodeBefore = graph.getNode(originNode.id);
      assert.ok(nodeBefore?.sceneObjects?.some((o) => o.id === 'temp_street_crate_01'));

      // Run GC
      const gcRes = worldRepository.garbageCollectTemporaryEntities(storyId);
      assert.ok(gcRes.evictedSceneObjects.includes('temp_street_crate_01'), 'GC must report temp_street_crate_01 as evicted');

      // Check whether it is actually removed from GeographyGraph
      const nodeAfter = graph.getNode(originNode.id);
      const foundInGraph = nodeAfter?.sceneObjects?.some((o) => o.id === 'temp_street_crate_01');
      assert.equal(foundInGraph, false, 'Expired temporary LocationSceneObject must be physically removed from GeographyGraph');
    });
  });

  // =========================================================================
  // 4. DYNAMIC VEHICLE SIMULATION
  // =========================================================================
  describe('4. Dynamic Vehicle Simulation', () => {
    const storyId = 'story_dynamic_vehicle_adv';
    const locA = 'loc_adv_street_a';
    const locB = 'loc_adv_street_b';
    const locC = 'loc_adv_street_c';
    const locIndoor = 'loc_adv_basement';

    beforeEach(() => {
      worldRepository.seedStory(storyId);
      const run = worldRepository.getStoryRun(storyId);
      if (run) {
        if (!run.runtimeState) run.runtimeState = {} as any;
        run.runtimeState.player = { locationId: locA } as any;
        (run.runtimeState as any).inVehicle = false;
        (run.runtimeState as any).boardedVehicleId = undefined;
      }

      const graph = worldRepository.getGeographyGraph(storyId);

      // Street Node A
      graph.addNode({
        id: locA,
        name: 'West End Avenue',
        regionId: 'reg_urban',
        description: 'Bustling commercial avenue.',
        coordinates: { x: 10, y: 10 },
        accessible: true,
        discovered: true,
        ambientSensory: 'City sounds.',
        archetype: 'AVENUE' as any,
        tags: ['street', 'road'],
        sceneObjects: [],
        provenance: 'authored',
      });

      // Street Node B
      graph.addNode({
        id: locB,
        name: 'Central Plaza Boulevard',
        regionId: 'reg_urban',
        description: 'Midway transit hub.',
        coordinates: { x: 15, y: 10 },
        accessible: true,
        discovered: true,
        ambientSensory: 'Traffic.',
        archetype: 'BOULEVARD' as any,
        tags: ['street', 'road'],
        sceneObjects: [],
        provenance: 'authored',
      });

      // Street Node C
      graph.addNode({
        id: locC,
        name: 'Harbor Docks Street',
        regionId: 'reg_urban',
        description: 'Destination wharf with street access.',
        coordinates: { x: 20, y: 10 },
        accessible: true,
        discovered: true,
        ambientSensory: 'Sea breeze.',
        archetype: 'DOCKS' as any,
        tags: ['street', 'road', 'docks'],
        sceneObjects: [],
        provenance: 'authored',
      });

      // Non-street indoor node
      graph.addNode({
        id: locIndoor,
        name: 'Sub-Basement Archive',
        regionId: 'reg_urban',
        description: 'Deep subterranean archive room.',
        coordinates: { x: 10, y: 10, elevation: -3 },
        accessible: true,
        discovered: true,
        ambientSensory: 'Hum of damp air.',
        archetype: 'BASEMENT' as any,
        tags: ['basement', 'room'],
        sceneObjects: [],
        provenance: 'authored',
      });

      // Road edge A -> B
      graph.addEdge({
        id: 'edge_a_to_b',
        fromLocationId: locA,
        toLocationId: locB,
        distanceKm: 2.0,
        terrain: 'Road',
        allowedModes: ['Coach', 'Foot'],
        hazardRisk: 0,
        isBlocked: false,
        provenance: 'authored',
      });

      // Road edge B -> C
      graph.addEdge({
        id: 'edge_b_to_c',
        fromLocationId: locB,
        toLocationId: locC,
        distanceKm: 3.0,
        terrain: 'Road',
        allowedModes: ['Coach', 'Foot'],
        hazardRisk: 0,
        isBlocked: false,
        provenance: 'authored',
      });

      // Initialize PlayerLifecycleState at Node A
      const player = new PlayerLifecycleState({
        actorId: 'player_adversarial',
        name: 'Detective Ren',
        locationId: locA,
        lastUpdatedTime: 0,
        discoveredLocationIds: [locA, locB, locC, locIndoor],
      });
      worldRepository.updatePlayerLifecycle(storyId, player);
    });

    it('4.1 Chained multi-stop travel journeys preserving Invariant 6 across intermediate nodes', () => {
      // 1. Hail and Board at Origin Node A
      const hailA = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: locA,
      });
      assert.equal(hailA.success, true);
      assert.equal(hailA.stage, 'ACTIVE_TEMPORARY');

      const boardA = VehicleInteractionAuthority.boardVehicle({
        repository: worldRepository,
        storyId,
        locationId: locA,
      });
      assert.equal(boardA.success, true);

      // 2. First transit: Leg 1 (A -> B)
      const transitLeg1 = VehicleInteractionAuthority.transitVehicle({
        repository: worldRepository,
        storyId,
        destinationLocationId: locB,
        mode: 'Coach',
      });
      assert.equal(transitLeg1.success, true);

      // Invariant 6 check during Leg 1: player locationId MUST remain locA while traveling!
      const playerDuringLeg1 = worldRepository.getPlayerLifecycle(storyId);
      assert.equal(playerDuringLeg1?.locationId, locA, 'Invariant 6: player locationId must remain origin (locA) during transit');
      assert.equal(playerDuringLeg1?.isTraveling, true);
      assert.equal(playerDuringLeg1?.activeJourney?.destinationLocationId, locB);

      // Advance time to arrive at Node B
      const arrivalLeg1 = worldSimulationService.advanceTime(storyId, 3600);
      assert.ok(arrivalLeg1.completedArrivals.includes(locB));

      // After arrival at Node B: player locationId is now locB
      const playerAtNodeB = worldRepository.getPlayerLifecycle(storyId);
      assert.equal(playerAtNodeB?.locationId, locB);
      assert.equal(playerAtNodeB?.isTraveling, false);

      // 3. Second transit: Leg 2 (B -> C) chained from Node B
      // Player remains inVehicle, now transiting to destination locC
      const transitLeg2 = VehicleInteractionAuthority.transitVehicle({
        repository: worldRepository,
        storyId,
        destinationLocationId: locC,
        mode: 'Coach',
      });
      assert.equal(transitLeg2.success, true);

      // Invariant 6 check during Leg 2: player locationId MUST remain locB while traveling!
      const playerDuringLeg2 = worldRepository.getPlayerLifecycle(storyId);
      assert.equal(playerDuringLeg2?.locationId, locB, 'Invariant 6: player locationId must remain leg-origin (locB) during transit');
      assert.equal(playerDuringLeg2?.isTraveling, true);
      assert.equal(playerDuringLeg2?.activeJourney?.destinationLocationId, locC);

      // Advance time to arrive at Destination Node C
      const arrivalLeg2 = worldSimulationService.advanceTime(storyId, 3600);
      assert.ok(arrivalLeg2.completedArrivals.includes(locC));

      const playerAtNodeC = worldRepository.getPlayerLifecycle(storyId);
      assert.equal(playerAtNodeC?.locationId, locC);
      assert.equal(playerAtNodeC?.isTraveling, false);

      // 4. Complete journey at final destination C: disembark passenger
      const completeRes = VehicleInteractionAuthority.completeVehicleJourney({
        repository: worldRepository,
        storyId,
        locationId: locC,
      });
      assert.equal(completeRes.success, true);
      assert.equal(completeRes.stage, 'EPHEMERAL');

      // Player runtime state reflects disembarked
      const run = worldRepository.getStoryRun(storyId);
      assert.equal((run?.runtimeState as any)?.inVehicle, false);
      assert.equal((run?.runtimeState as any)?.boardedVehicleId, undefined);

      // 5. Zero Store Pollution: Verify NO temporary vehicle remains in ANY node of GeographyGraph
      const graph = worldRepository.getGeographyGraph(storyId);
      for (const node of graph.getAllNodes()) {
        const vehicles = (node.sceneObjects || []).filter((o) => o.tags?.includes('vehicle'));
        assert.equal(vehicles.length, 0, `Node ${node.id} must not contain any leaked vehicle objects`);
      }
    });

    it('4.2 Non-street affordance gate prevents taxi hailing in interior basement', () => {
      const hailFail = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: locIndoor,
      });

      assert.equal(hailFail.success, false);
      assert.equal(hailFail.errorCode, 'CANNOT_HAIL_VEHICLE_WITHOUT_STREET_ACCESS');

      // Verify no vehicle was materialized in basement
      const graph = worldRepository.getGeographyGraph(storyId);
      const indoorNode = graph.getNode(locIndoor);
      const vehicles = (indoorNode?.sceneObjects || []).filter((o) => o.tags?.includes('vehicle'));
      assert.equal(vehicles.length, 0, 'No vehicle entity may be spawned in non-street location');
    });

    it('4.3 Enforces strict Boarding Gate before Transit (NOT_IN_VEHICLE)', () => {
      // Vehicle hailed but player NOT boarded
      VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: locA,
      });

      const transitWithoutBoarding = VehicleInteractionAuthority.transitVehicle({
        repository: worldRepository,
        storyId,
        destinationLocationId: locB,
      });

      assert.equal(transitWithoutBoarding.success, false);
      assert.equal(transitWithoutBoarding.errorCode, 'NOT_IN_VEHICLE');
    });

    it('4.4 Enforces Vehicle Presence check before Boarding (NO_VEHICLE_PRESENT)', () => {
      // Attempting to board when no vehicle has been hailed
      const boardWithoutVehicle = VehicleInteractionAuthority.boardVehicle({
        repository: worldRepository,
        storyId,
        locationId: locA,
      });

      assert.equal(boardWithoutVehicle.success, false);
      assert.equal(boardWithoutVehicle.errorCode, 'NO_VEHICLE_PRESENT');
    });

    it('4.5 Evicted vehicles do not leak into permanent save states or serialized graph', () => {
      // Hail, board, transit, arrive, complete
      VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: locA,
      });
      VehicleInteractionAuthority.boardVehicle({
        repository: worldRepository,
        storyId,
        locationId: locA,
      });
      VehicleInteractionAuthority.transitVehicle({
        repository: worldRepository,
        storyId,
        destinationLocationId: locB,
      });
      worldSimulationService.advanceTime(storyId, 3600);
      VehicleInteractionAuthority.completeVehicleJourney({
        repository: worldRepository,
        storyId,
        locationId: locB,
      });

      // Export geography graph state (simulating persistence/save)
      const graph = worldRepository.getGeographyGraph(storyId);
      const exported = graph.exportState();

      // Check all exported nodes
      for (const node of exported.nodes) {
        const vehicles = (node.sceneObjects || []).filter((o) => o.tags?.includes('vehicle'));
        assert.equal(vehicles.length, 0, `Exported save state for node ${node.id} must not contain temporary vehicles`);
      }
    });

    it('4.6 Abandoned temporary vehicle GC leak: player departs without boarding, GC must evict vehicle from GeographyGraph', () => {
      // 1. Hail vehicle at locA (player does NOT board)
      const hail = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: locA,
      });
      assert.equal(hail.success, true);
      const vehicleId = hail.vehicle?.id;
      assert.ok(vehicleId);

      // Verify vehicle is in locA
      const graph = worldRepository.getGeographyGraph(storyId);
      assert.ok(graph.getNode(locA)?.sceneObjects?.some((o) => o.id === vehicleId));

      // 2. Player moves/departs to locB on foot without boarding vehicle
      const run = worldRepository.getStoryRun(storyId);
      if (run?.runtimeState?.player) {
        run.runtimeState.player.locationId = locB;
      }
      const player = worldRepository.getPlayerLifecycle(storyId);
      if (player) {
        worldRepository.updatePlayerLifecycle(storyId, player.copyWith({ locationId: locB }));
      }

      // 3. Trigger GC: Since player departed locA and vehicle has no dependencies, it must be evicted
      const gcRes = worldRepository.garbageCollectTemporaryEntities(storyId);
      assert.ok(gcRes.evictedSceneObjects.includes(vehicleId), 'GC must mark abandoned vehicle as evicted');

      // 4. Verify vehicle is actually removed from GeographyGraph
      const nodeAAfterGC = graph.getNode(locA);
      const vehicleStillPresent = nodeAAfterGC?.sceneObjects?.some((o) => o.id === vehicleId);
      assert.equal(vehicleStillPresent, false, 'Abandoned temporary vehicle must be physically removed from GeographyGraph by GC');
    });
  });
});
