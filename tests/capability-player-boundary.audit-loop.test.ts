import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectPlayerCapabilities,
  projectPlayerSkillbook,
} from '../server/api/playerCapabilityProjection';
import type {
  CapabilityDefinition,
  EffectiveCapability,
  SkillInstance,
} from '../server/domain/capabilityEngine';

const capability = (id: string, name: string): CapabilityDefinition => ({
  id,
  name,
  category: 'Magic',
  activationMode: 'immediate',
  powerTier: 'Minor',
  baseEnergyCost: 5,
  baseStrainCost: 1,
  minVesselCapacityRequired: 0,
  description: name,
  provenance: 'WORLD_CANON',
});

const skillInstance = (capabilityId: string): SkillInstance => ({
  instanceId: 'inst_' + capabilityId,
  actorId: 'actor_1',
  capabilityId,
  currentLevel: 1,
  currentXp: 0,
  xpToNextLevel: 100,
  evolutionPoints: 0,
  evolutionLineage: [capabilityId],
  progressionHistory: [],
  unlockedAtSeconds: 0,
});

test('Skillbook never promotes a global definition without actor ownership', () => {
  const owned = capability('cap_owned', 'Owned Technique');
  const registryOnly = capability('cap_registry_only', 'Venomous Bite');

  for (let pass = 1; pass <= 10; pass += 1) {
    const result = projectPlayerSkillbook(
      [owned, registryOnly],
      [skillInstance('cap_owned')],
    );

    assert.deepEqual(
      result.learnedCapabilities.map((entry) => entry.id),
      ['cap_owned'],
      'pass ' + pass + ': registry-only capability leaked into Skillbook',
    );
    assert.deepEqual(
      result.skillInstances.map((entry) => entry.capabilityId),
      ['cap_owned'],
      'pass ' + pass + ': Skillbook contains an unowned SkillInstance',
    );
  }
});

test('equipment-granted capability stays effective but is not a learned Skillbook entry', () => {
  const learned = capability('cap_shadow_step', 'Shadow Step');
  const equipmentOnly = capability('cap_relic_light', 'Relic Light');
  const effectiveLearned: EffectiveCapability = {
    ...learned,
    sources: [{ type: 'LEARNED' }],
    isEquippedItemGrant: false,
    isLearned: true,
    skillInstance: skillInstance(learned.id),
  };
  const effectiveEquipment: EffectiveCapability = {
    ...equipmentOnly,
    sources: [{ type: 'EQUIPMENT', itemDefId: 'item_relic' }],
    isEquippedItemGrant: true,
    isLearned: false,
  };

  for (let pass = 1; pass <= 10; pass += 1) {
    const result = projectPlayerCapabilities({
      effectiveCapabilities: [effectiveLearned, effectiveEquipment],
      learnedCapabilities: [learned, equipmentOnly],
      skillInstances: [skillInstance(learned.id)],
    });

    assert.deepEqual(
      result.learnedCapabilities.map((entry) => entry.id),
      ['cap_shadow_step'],
      'pass ' + pass + ': equipment grant became a learned Skillbook skill',
    );
    assert.deepEqual(
      result.capabilities.map((entry) => entry.id).sort(),
      ['cap_relic_light', 'cap_shadow_step'],
      'pass ' + pass + ': actor-effective capability was lost',
    );
  }
});

test('player projection has no capability graph or simulation authoring surface', () => {
  const result = projectPlayerCapabilities({
    effectiveCapabilities: [],
    learnedCapabilities: [capability('cap_owned', 'Owned Technique')],
    skillInstances: [skillInstance('cap_owned')],
  });

  for (let pass = 1; pass <= 10; pass += 1) {
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /Capability DAG|Adjudication Outcome|generatedTechniques|graphNode|simulationTrace/i);
    assert.doesNotMatch(serialized, /cap_world_darkness.*derivedSkills|derivedSkills.*cap_world_darkness/i);
  }
});
