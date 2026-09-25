import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CapabilityDefinition,
  EffectiveCapability,
  SkillInstance,
} from '../server/domain/capabilityEngine';
import { projectPlayerCapabilities } from '../server/api/playerCapabilityProjection';

const makeCapability = (overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition => ({
  id: 'cap_test',
  name: 'Test Technique',
  category: 'Magic',
  activationMode: 'immediate',
  powerTier: 'Minor',
  baseEnergyCost: 1,
  baseStrainCost: 0,
  minVesselCapacityRequired: 1,
  description: 'A test technique.',
  provenance: 'TEST',
  ...overrides,
});

const makeEffective = (
  capability: CapabilityDefinition,
  overrides: Partial<EffectiveCapability> = {},
): EffectiveCapability => ({
  ...capability,
  sources: [],
  isEquippedItemGrant: false,
  isLearned: true,
  ...overrides,
});

const makeInstance = (capabilityId: string): SkillInstance => ({
  instanceId: `inst_player_${capabilityId}`,
  actorId: 'player',
  capabilityId,
  currentLevel: 1,
  currentXp: 0,
  xpToNextLevel: 100,
  evolutionPoints: 0,
  evolutionLineage: [capabilityId],
  progressionHistory: [],
  unlockedAtSeconds: 0,
});

test('player projection exposes only actor-owned learned capabilities', () => {
  const learned = makeCapability({ id: 'cap_shadow_step', name: 'Shadow Step' });
  const globalRegistryOnly = makeCapability({
    id: 'cap_venomous_bite',
    name: 'Venomous Bite',
    provenance: 'starter_trait',
  });

  const result = projectPlayerCapabilities({
    effectiveCapabilities: [
      makeEffective(learned),
    ],
    learnedCapabilities: [learned, globalRegistryOnly],
    skillInstances: [makeInstance(learned.id)],
  });

  assert.deepEqual(
    result.learnedCapabilities.map((capability) => capability.id),
    ['cap_shadow_step'],
  );
  assert.deepEqual(
    result.skillInstances.map((instance) => instance.capabilityId),
    ['cap_shadow_step'],
  );
  assert.equal(
    result.capabilities.some((capability) => capability.id === 'cap_venomous_bite'),
    false,
  );
});

test('active equipment grants may appear in effective capabilities without becoming learned skills', () => {
  const learned = makeCapability({ id: 'cap_shadow_step', name: 'Shadow Step' });
  const equipmentGrant = makeCapability({
    id: 'cap_boot_flight',
    name: 'Aerial Flight',
    provenance: 'equipment:def_flying_shoes',
  });

  const result = projectPlayerCapabilities({
    effectiveCapabilities: [
      makeEffective(learned),
      makeEffective(equipmentGrant, {
        isLearned: false,
        isEquippedItemGrant: true,
      }),
    ],
    learnedCapabilities: [learned],
    skillInstances: [makeInstance(learned.id)],
  });

  assert.deepEqual(
    result.capabilities.map((capability) => capability.id),
    ['cap_shadow_step', 'cap_boot_flight'],
  );
  assert.deepEqual(
    result.learnedCapabilities.map((capability) => capability.id),
    ['cap_shadow_step'],
  );
});

test('projection ignores an unbacked learned capability even if upstream data contains it', () => {
  const learned = makeCapability({ id: 'cap_shadow_step', name: 'Shadow Step' });
  const unbacked = makeCapability({ id: 'cap_unbacked', name: 'Unbacked Technique' });

  const result = projectPlayerCapabilities({
    effectiveCapabilities: [makeEffective(learned)],
    learnedCapabilities: [learned, unbacked],
    skillInstances: [makeInstance(learned.id)],
  });

  assert.equal(
    result.learnedCapabilities.some((capability) => capability.id === unbacked.id),
    false,
  );
});

test('projection contains no internal DAG or simulation fields', () => {
  const learned = makeCapability({ id: 'cap_shadow_step', name: 'Shadow Step' });

  const result = projectPlayerCapabilities({
    effectiveCapabilities: [makeEffective(learned)],
    learnedCapabilities: [learned],
    skillInstances: [makeInstance(learned.id)],
  });

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /Capability DAG|Adjudication Outcome|simulation|internalOnly/i);
});
