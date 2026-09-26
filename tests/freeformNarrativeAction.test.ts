import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityEngine } from '../server/domain/capabilityEngine';

test('mundane freeform actions do not synthesize or execute phantom capabilities', () => {
  const engine = new CapabilityEngine();
  const actorId = 'test_actor';
  engine.seedStarterPowerStateForActor(actorId);

  const before = engine.getActorCapabilities(actorId).map((cap) => cap.id);
  const result = engine.interpretFreeformAction({
    actorId,
    actionText: 'I inhale, breathing in the fresh air.',
    executeIfValid: true,
  });
  const after = engine.getActorCapabilities(actorId).map((cap) => cap.id);

  assert.equal(result.interpretationType, 'UNSUPPORTED');
  assert.equal(result.validationSuccess, false);
  assert.deepEqual(after, before);
  assert.equal(result.adjudicationConsequence, undefined);
});


test('mundane movement toward a structure remains narrative intent and never becomes a novel capability', () => {
  const engine = new CapabilityEngine();
  const actorId = 'movement_test_actor';
  engine.seedStarterPowerStateForActor(actorId);

  const before = engine.getActorCapabilities(actorId).map((cap) => cap.id);
  const result = engine.interpretFreeformAction({
    actorId,
    actionText: 'I move towards the structure.',
    executeIfValid: true,
  });
  const after = engine.getActorCapabilities(actorId).map((cap) => cap.id);

  assert.equal(result.interpretationType, 'UNSUPPORTED');
  assert.match(result.narrativeInterpretation, /ordinary narrative action/i);
  assert.equal(result.proposedCapability, undefined);
  assert.deepEqual(after, before);
});
