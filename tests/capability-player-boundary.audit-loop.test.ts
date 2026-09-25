import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  projectPlayerCapabilities,
  projectPlayerSkillbook,
} from '../server/api/playerCapabilityProjection';
import type {
  CapabilityDefinition,
  EffectiveCapability,
  SkillInstance,
} from '../server/domain/capabilityEngine';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

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

test('legacy canonical-state projection is player-safe and global capability synthesis is AI-only', () => {
  const routes = read('server/api/gameRoutes.ts');
  const canonicalStateStart = routes.indexOf("gameRouter.get('/run-canonical-state'");
  assert.ok(canonicalStateStart >= 0, 'run-canonical-state route must remain present');
  const canonicalState = routes.slice(canonicalStateStart);

  for (let pass = 1; pass <= 10; pass += 1) {
    assert.match(canonicalState, /projectPlayerCapabilities/);
    assert.doesNotMatch(canonicalState, /coreCapabilities\s*:\s*capEngine\.getAllCapabilities\(\)/);
    assert.doesNotMatch(canonicalState, /generatedTechniques\s*:\s*capEngine\.getActorSkillInstances/);
  }

  const synthesisStart = routes.indexOf("gameRouter.post('/capabilities/synthesize'");
  assert.ok(synthesisStart >= 0, 'internal synthesis route must remain explicit');
  const synthesisSection = routes.slice(synthesisStart, routes.indexOf("gameRouter.post('/capabilities/interpret'", synthesisStart));

  for (let pass = 1; pass <= 10; pass += 1) {
    assert.match(synthesisSection, /x-dreamville-internal-ai/);
    assert.match(synthesisSection, /AI_INTERNAL_SYNTHESIS_ONLY/);
  }

  const interpretationStart = routes.indexOf("gameRouter.post('/capabilities/interpret'");
  assert.ok(interpretationStart >= 0, 'internal interpretation route must remain explicit');
  const interpretationSection = routes.slice(interpretationStart);

  for (let pass = 1; pass <= 10; pass += 1) {
    assert.match(interpretationSection, /x-dreamville-internal-ai/);
    assert.match(interpretationSection, /AI_INTERNAL_INTERPRETATION_ONLY/);
  }
});
