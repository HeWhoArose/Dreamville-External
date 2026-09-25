import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilitySimulationEngine } from '../server/domain/capabilitySimulationEngine';
import type { CapabilityDefinition, PowerState } from '../server/domain/capabilityEngine';

const simulator = new CapabilitySimulationEngine();

const basePower: PowerState = {
  originId: 'dark-knight',
  originTier: 'Heroic',
  currentFormId: 'base',
  vesselType: 'mortal_human',
  vesselCapacity: 40,
  sealState: 'dormant',
  sealStrength: 0,
  powerAccessLevel: 1,
  trueFormAccess: false,
  healthCurrent: 100,
  healthMax: 100,
  fatigue: 0,
  stress: 0,
  magicalEnergy: 100,
  physicalStrain: 0,
  activeConditions: [],
};

const makeCapability = (overrides: Partial<CapabilityDefinition>): CapabilityDefinition => ({
  id: 'cap_test',
  name: 'Test Technique',
  category: 'Magic',
  activationMode: 'immediate',
  powerTier: 'Moderate',
  baseEnergyCost: 10,
  baseStrainCost: 5,
  minVesselCapacityRequired: 10,
  description: 'A test technique.',
  provenance: 'TEST',
  ...overrides,
});

test('unowned capability simulation is pure and never mutates the owned skill set', () => {
  const owned = [
    makeCapability({
      id: 'cap_shadow',
      name: 'Shadow Step',
      category: 'Movement',
      description: 'Move through established shadow pathways.',
    }),
  ];
  const before = JSON.stringify(owned);

  const result = simulator.simulate(
    'I teleport across the city',
    {
      actorId: 'player',
      character: { name: 'Unknown Dark Knight', title: 'Dark Knight' },
      world: {
        title: 'Bending World',
        description: 'An elemental bending world with no spellcasting or teleportation.',
        genreTags: ['Avatar-inspired'],
        worldRules: ['Only elemental bending techniques are canonical.'],
      },
      ownedCapabilities: owned,
      skillInstances: [],
      allWorldCapabilities: owned,
      powerState: basePower,
    }
  );

  assert.equal(result.status, 'WORLD_FORBIDDEN');
  assert.equal(result.worldAllowed, false);
  assert.deepEqual(JSON.stringify(owned), before);
  assert.equal(result.internalOnly, true);
});

test('an earthbender cannot have lightning or teleport synthesized in a bending-only world', () => {
  const context = {
    actorId: 'earth',
    character: {
      name: 'Stone Adept',
      role: 'Earthbender',
      background: { summary: 'A disciplined earthbender.' },
    },
    world: {
      title: 'The Four Nations',
      description: 'An Avatar-style bending world. Only elemental bending is practiced.',
      genreTags: ['Avatar'],
      worldRules: ['Teleportation and general spellcasting do not exist.'],
    },
    ownedCapabilities: [],
    skillInstances: [],
    allWorldCapabilities: [],
    powerState: basePower,
  };

  const lightning = simulator.simulate('I cast Lightning Bolt', context);
  assert.notEqual(lightning.status, 'DEVELOPABLE');
  assert.equal(lightning.characterCompatible, false);
  assert.match(lightning.explanation, /lightning|firebending|Avatar/i);

  const teleport = simulator.simulate('I teleport behind the guard', context);
  assert.equal(teleport.status, 'WORLD_FORBIDDEN');
  assert.equal(teleport.worldAllowed, false);
});

test('a compatible but unlearned technique becomes a development proposal, not immediate execution', () => {
  const candidate = makeCapability({
    id: 'cap_fireball',
    name: 'Fireball',
    category: 'Magic',
    powerTier: 'Moderate',
    baseEnergyCost: 12,
    minVesselCapacityRequired: 15,
    restrictions: ['fire'],
  });

  const result = simulator.simulate(
    'I cast Fireball',
    {
      actorId: 'mage',
      character: {
        name: 'Ember Mage',
        role: 'Mage',
        traits: ['fire affinity'],
      },
      world: {
        title: 'Arcane Realm',
        description: 'A world with established magic and elemental spellcasting.',
        genreTags: ['Fantasy'],
        magicSystems: ['Arcane spellcasting'],
      },
      ownedCapabilities: [],
      skillInstances: [],
      allWorldCapabilities: [candidate],
      powerState: basePower,
    },
    candidate
  );

  assert.equal(result.worldAllowed, true);
  assert.equal(result.characterCompatible, true);
  assert.equal(result.currentlyExecutable, false);
  assert.equal(result.progressionPossible, true);
  assert.equal(result.status, 'DEVELOPABLE');
  assert.equal(result.candidateCapability?.provenance, 'TEST');
});

test('an already-owned skill resolves to canonical execution rather than simulation acquisition', () => {
  const owned = makeCapability({
    id: 'cap_shadow_step',
    name: 'Shadow Step',
    category: 'Movement',
    description: 'Teleport-like movement through a canonical shadow corridor.',
  });

  const result = simulator.simulate(
    'Use Shadow Step',
    {
      actorId: 'dark-knight',
      character: { name: 'Unknown Dark Knight' },
      world: {
        title: 'Shadow Realm',
        description: 'Shadow pathways exist.',
      },
      ownedCapabilities: [owned],
      skillInstances: [{ capabilityId: owned.id, currentLevel: 1 }],
      allWorldCapabilities: [owned],
      powerState: basePower,
    },
    owned
  );

  assert.equal(result.status, 'ALREADY_OWNED');
  assert.equal(result.currentlyExecutable, true);
  assert.equal(result.acquisitionAllowed, false);
});


test('simulation respects progression ceilings without mutating the actor', () => {
  const result = simulator.simulate(
    'I split the world in two',
    {
      actorId: 'maxed',
      character: { name: 'Unknown Dark Knight', role: 'Dark Knight' },
      world: {
        title: 'Primordial Realm',
        description: 'A world with metaphysical techniques, rituals, artifacts, and ascension paths.',
        metaphysics: ['World-scale severance is a valid metaphysical effect.'],
      },
      ownedCapabilities: [],
      skillInstances: [],
      allWorldCapabilities: [],
      progressionPolicy: {
        progressionAllowed: true,
        acquisitionAllowed: true,
        maxLevel: 20,
      },
      progressionState: {
        currentLevel: 20,
        maxCharacterLevel: 20,
        allowLevelUp: false,
      },
      powerState: {
        ...basePower,
        vesselCapacity: 20,
        magicalEnergy: 10,
      },
    }
  );

  assert.equal(result.progressionPossible, false);
  assert.equal(result.status, 'CURRENTLY_BLOCKED');
  assert.match(result.blockers.join(' '), /progression ceiling/i);
});


test('structured worlds reject supernatural domains that have no authored mechanism', () => {
  const result = simulator.simulate(
    'I cast Teleport',
    {
      actorId: 'earth',
      character: { name: 'Traveler', role: 'Swordfighter' },
      world: {
        title: 'Bending World',
        description: 'A structured world governed by elemental bending.',
        genreTags: ['Avatar'],
        worldRules: ['Only bending techniques are canonical.'],
        ruleConstraints: ['Teleportation cannot exist in this world.'],
        forbiddenContradictions: ['No spellcasting or dimensional magic.'],
      },
      ownedCapabilities: [],
      skillInstances: [],
      allWorldCapabilities: [],
      powerState: basePower,
    }
  );

  assert.equal(result.status, 'WORLD_FORBIDDEN');
  assert.equal(result.worldAllowed, false);
  assert.equal(result.creationAllowed, false);
  assert.match(result.explanation, /cannot be created|no canonical mechanism/i);
});

test('an incompatible character cannot synthesize a new supernatural mechanism just because resources are sufficient', () => {
  const result = simulator.simulate(
    'I cast Lightning Bolt',
    {
      actorId: 'fighter',
      character: { name: 'Knight', role: 'Knight', background: { summary: 'A mundane swordsman.' } },
      world: {
        title: 'Arcane Realm',
        description: 'Magic exists, but lightning is not part of the knight\'s established path.',
        magicSystems: ['Arcane spellcasting'],
        worldRules: ['Abilities must arise from established character mechanisms.'],
      },
      ownedCapabilities: [],
      skillInstances: [],
      allWorldCapabilities: [],
      powerState: { ...basePower, magicalEnergy: 10000, vesselCapacity: 10000 },
    }
  );

  assert.notEqual(result.status, 'DEVELOPABLE');
  assert.equal(result.characterCompatible, false);
  assert.equal(result.creationAllowed, false);
});
