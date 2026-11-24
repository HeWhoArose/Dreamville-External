import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WorldSimulatorAdjudicator,
  type WorldSimulationProposal,
  type SimulationWorldState,
} from '../server/domain/worldSimulationProposal';

describe('Milestone 3: WorldSimulationProposal & Deterministic CAS Adjudication', () => {
  it('calculates deterministic 16-hex state hash using SHA-256', () => {
    const stateA = { weather: 'rain', streetAccess: true, lights: 'on' };
    const hashA1 = WorldSimulatorAdjudicator.calculateStateHash(stateA);
    const hashA2 = WorldSimulatorAdjudicator.calculateStateHash(stateA);

    assert.equal(typeof hashA1, 'string');
    assert.equal(hashA1.length, 16);
    assert.equal(hashA1, hashA2);

    // Hash changes when state changes
    const stateB = { weather: 'rain', streetAccess: true, lights: 'off' };
    const hashB = WorldSimulatorAdjudicator.calculateStateHash(stateB);
    assert.notEqual(hashA1, hashB);
  });

  it('successfully adjudicates and commits a valid proposal with CAS version increment', () => {
    const initialState = { streetAccess: true, trafficDensity: 'moderate' };
    const initialHash = WorldSimulatorAdjudicator.calculateStateHash(initialState);
    const currentWorld: SimulationWorldState = {
      worldVersion: 1,
      state: initialState,
      stateHash: initialHash,
    };

    const proposal: WorldSimulationProposal = {
      proposalId: 'prop_001',
      idempotencyKey: 'idemp_taxi_arrive_1',
      worldVersion: 1,
      baseStateHash: initialHash,
      entityType: 'PROPOSED',
      proposedStateTransition: {
        type: 'SPAWN_TEMPORARY_VEHICLE',
        targetId: 'taxi_cab_01',
        payload: {
          taxiPresent: true,
          taxiDriverStatus: 'waiting_for_fare',
        },
      },
      requiredPreconditions: [
        { predicate: 'streetAccess', expected: true },
        { predicate: 'trafficDensity', expected: 'moderate' },
      ],
      provenance: {
        source: 'DETERMINISTIC_ARCHETYPE',
        timestamp: '2026-11-12T11:00:00Z',
      },
      safeFallback: {
        message: 'No taxi arrives.',
      },
    };

    const result = WorldSimulatorAdjudicator.adjudicate(currentWorld, proposal);

    assert.equal(result.accepted, true);
    assert.equal(result.code, 'PROPOSAL_COMMITTED');
    assert.equal(result.worldVersion, 2);
    assert.notEqual(result.stateHash, initialHash);
    assert.equal(result.commitRecords.length, 1);
    assert.equal(result.commitRecords[0].kind, 'SPAWN_TEMPORARY_VEHICLE');
    assert.equal(result.commitRecords[0].targetId, 'taxi_cab_01');
    assert.equal(result.commitRecords[0].operation, 'CREATE');
    assert.equal(result.commitRecords[0].provenance, 'DETERMINISTIC_ARCHETYPE');
  });

  it('rejects stale proposals with mismatched worldVersion (STALE_PROPOSAL_REJECTED)', () => {
    const currentWorld: SimulationWorldState = {
      worldVersion: 5,
      state: { streetAccess: true },
      stateHash: WorldSimulatorAdjudicator.calculateStateHash({ streetAccess: true }),
    };

    // Obsolete proposal with worldVersion = 4
    const staleProposal: WorldSimulationProposal = {
      proposalId: 'prop_stale_1',
      idempotencyKey: 'idemp_stale_1',
      worldVersion: 4,
      baseStateHash: currentWorld.stateHash,
      proposedStateTransition: {
        type: 'WEATHER_CHANGE',
        payload: { rainIntensity: 'heavy' },
      },
      requiredPreconditions: [],
      provenance: {
        source: 'MODEL_PROPOSED',
        timestamp: '2026-11-12T11:00:00Z',
      },
      safeFallback: { message: 'Weather remains unchanged.' },
    };

    const result = WorldSimulatorAdjudicator.adjudicate(currentWorld, staleProposal);

    assert.equal(result.accepted, false);
    assert.equal(result.code, 'STALE_PROPOSAL_REJECTED');
    assert.equal(result.worldVersion, 5);
    assert.equal(result.stateHash, currentWorld.stateHash);
    assert.deepEqual(result.commitRecords, []);
    assert.match(result.message, /Stale proposal rejected/);
  });

  it('rejects negative or future world versions (STALE_PROPOSAL_REJECTED)', () => {
    const currentWorld: SimulationWorldState = {
      worldVersion: 2,
      state: { streetAccess: true },
      stateHash: WorldSimulatorAdjudicator.calculateStateHash({ streetAccess: true }),
    };

    const negativeProposal: WorldSimulationProposal = {
      proposalId: 'prop_negative',
      idempotencyKey: 'idemp_neg',
      worldVersion: -1,
      baseStateHash: currentWorld.stateHash,
      proposedStateTransition: { type: 'NOOP' },
      requiredPreconditions: [],
      provenance: { source: 'AUTHORED', timestamp: '2026-11-12T11:00:00Z' },
      safeFallback: { message: 'Fallback' },
    };

    const result = WorldSimulatorAdjudicator.adjudicate(currentWorld, negativeProposal);
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'STALE_PROPOSAL_REJECTED');
  });

  it('rejects proposals with baseStateHash mismatch even if worldVersion matches (STALE_PROPOSAL_REJECTED)', () => {
    const currentWorld: SimulationWorldState = {
      worldVersion: 3,
      state: { streetAccess: true, timeOfDay: 'night' },
      stateHash: WorldSimulatorAdjudicator.calculateStateHash({ streetAccess: true, timeOfDay: 'night' }),
    };

    const hashMismatchProposal: WorldSimulationProposal = {
      proposalId: 'prop_diverged',
      idempotencyKey: 'idemp_diverged',
      worldVersion: 3,
      baseStateHash: '0000000000000000', // Mismatched hash
      proposedStateTransition: {
        type: 'MUTATE_STATE',
        payload: { light: 'on' },
      },
      requiredPreconditions: [],
      provenance: { source: 'MODEL_PROPOSED', timestamp: '2026-11-12T11:00:00Z' },
      safeFallback: { message: 'Fallback' },
    };

    const result = WorldSimulatorAdjudicator.adjudicate(currentWorld, hashMismatchProposal);
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'STALE_PROPOSAL_REJECTED');
    assert.match(result.message, /base hash mismatch/);
  });

  it('rejects proposals with empty baseStateHash under strict CAS (STALE_PROPOSAL_REJECTED)', () => {
    const currentWorld: SimulationWorldState = {
      worldVersion: 3,
      state: { streetAccess: true, timeOfDay: 'night' },
      stateHash: WorldSimulatorAdjudicator.calculateStateHash({ streetAccess: true, timeOfDay: 'night' }),
    };

    const emptyHashProposal: WorldSimulationProposal = {
      proposalId: 'prop_empty_hash',
      idempotencyKey: 'idemp_empty_hash',
      worldVersion: 3,
      baseStateHash: '', // Empty string must not bypass verification
      proposedStateTransition: {
        type: 'MUTATE_STATE',
        payload: { light: 'on' },
      },
      requiredPreconditions: [],
      provenance: { source: 'MODEL_PROPOSED', timestamp: '2026-11-12T11:00:00Z' },
      safeFallback: { message: 'Fallback' },
    };

    const result = WorldSimulatorAdjudicator.adjudicate(currentWorld, emptyHashProposal);
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'STALE_PROPOSAL_REJECTED');
    assert.match(result.message, /base hash mismatch/);
  });

  it('rejects proposals when preconditions fail (PRECONDITION_FAILED)', () => {
    const currentWorld: SimulationWorldState = {
      worldVersion: 1,
      state: { streetAccess: false, indoorArea: true },
      stateHash: WorldSimulatorAdjudicator.calculateStateHash({ streetAccess: false, indoorArea: true }),
    };

    const proposal: WorldSimulationProposal = {
      proposalId: 'prop_precond_fail',
      idempotencyKey: 'idemp_precond_1',
      worldVersion: 1,
      baseStateHash: currentWorld.stateHash,
      proposedStateTransition: {
        type: 'SPAWN_TAXI',
        payload: { taxiPresent: true },
      },
      requiredPreconditions: [
        { predicate: 'streetAccess', expected: true }, // Fails! Actual is false
      ],
      provenance: { source: 'MODEL_PROPOSED', timestamp: '2026-11-12T11:00:00Z' },
      safeFallback: { message: 'Cannot spawn taxi without street access.' },
    };

    const result = WorldSimulatorAdjudicator.adjudicate(currentWorld, proposal);
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'PRECONDITION_FAILED');
    assert.match(result.message, /Precondition failed for streetAccess/);
  });

  it('rejects forbidden canon mutations (FORBIDDEN_MUTATION_REJECTED)', () => {
    const currentWorld: SimulationWorldState = {
      worldVersion: 1,
      state: { currentRoom: 'crime_scene' },
      stateHash: WorldSimulatorAdjudicator.calculateStateHash({ currentRoom: 'crime_scene' }),
    };

    // 1. Explicit forbidden flag
    const explicitForbidden: WorldSimulationProposal = {
      proposalId: 'prop_forbid_1',
      idempotencyKey: 'idemp_forbid_1',
      worldVersion: 1,
      baseStateHash: currentWorld.stateHash,
      proposedStateTransition: {
        type: 'ALTER_CANON',
        payload: { forbiddenCanonMutation: true },
      },
      requiredPreconditions: [],
      provenance: { source: 'MODEL_PROPOSED', timestamp: '2026-11-12T11:00:00Z' },
      safeFallback: { message: 'Rejected' },
    };
    const result1 = WorldSimulatorAdjudicator.adjudicate(currentWorld, explicitForbidden);
    assert.equal(result1.accepted, false);
    assert.equal(result1.code, 'FORBIDDEN_MUTATION_REJECTED');

    // 2. Inventing quest item / plot-critical target
    const inventKeyProposal: WorldSimulationProposal = {
      proposalId: 'prop_forbid_2',
      idempotencyKey: 'idemp_forbid_2',
      worldVersion: 1,
      baseStateHash: currentWorld.stateHash,
      proposedStateTransition: {
        type: 'INVENT_QUEST_ITEM',
        targetId: 'master_key_to_safe',
        payload: { isKey: true },
      },
      requiredPreconditions: [],
      provenance: { source: 'MODEL_PROPOSED', timestamp: '2026-11-12T11:00:00Z' },
      safeFallback: { message: 'Rejected' },
    };
    const result2 = WorldSimulatorAdjudicator.adjudicate(currentWorld, inventKeyProposal);
    assert.equal(result2.accepted, false);
    assert.equal(result2.code, 'FORBIDDEN_MUTATION_REJECTED');
  });
});
