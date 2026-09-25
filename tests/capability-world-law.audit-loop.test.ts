import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilitySimulationEngine } from '../server/domain/capabilitySimulationEngine';
import type { CapabilityDefinition } from '../server/domain/capabilityEngine';

const simulator = new CapabilitySimulationEngine();

const fireball: CapabilityDefinition = {
  id: 'cap_fireball_audit',
  name: 'Fireball',
  category: 'Magic',
  activationMode: 'immediate',
  powerTier: 'Moderate',
  baseEnergyCost: 10,
  baseStrainCost: 3,
  minVesselCapacityRequired: 0,
  description: 'A sphere of concentrated flame.',
  provenance: 'WORLD_CANON',
};

const bendingWorld = {
  id: 'avatar_audit_world',
  title: 'The Four Nations',
  description: 'An elemental bending world.',
  genreTags: ['Avatar'],
  worldRules: ['Elemental bending is canonical.'],
  dndRulesMode: 'FULL_DND',
};

const progression = {
  progressionAllowed: true,
  acquisitionAllowed: true,
  maxLevel: 10,
};

const rulesProfile = {
  mode: 'FULL_DND',
  enabledMechanics: ['character_progression'],
};

test('ten-pass world/character law loop never fabricates forbidden supernatural skills', () => {
  for (let pass = 1; pass <= 10; pass += 1) {
    const earthLightning = simulator.simulate(
      'I cast Lightning Bolt',
      {
        actorId: 'earth_' + pass,
        character: {
          role: { profession: 'Earthbender', archetype: 'Earthbender' },
          background: { history: 'A disciplined earthbender with no firebending or Avatar lineage.' },
        },
        world: bendingWorld,
        rulesProfile,
        progressionPolicy: progression,
        progressionState: { currentLevel: 1, maxCharacterLevel: 10, allowLevelUp: true },
        ownedCapabilities: [],
        allWorldCapabilities: [],
      },
    );

    assert.equal(earthLightning.worldAllowed, true);
    assert.equal(earthLightning.characterCompatible, false);
    assert.equal(earthLightning.creationAllowed, false);
    assert.notEqual(earthLightning.status, 'DEVELOPABLE');

    const teleport = simulator.simulate(
      'I teleport behind the guard',
      {
        actorId: 'earth_teleport_' + pass,
        character: {
          role: { profession: 'Earthbender', archetype: 'Earthbender' },
          background: { history: 'A disciplined earthbender.' },
        },
        world: {
          ...bendingWorld,
          worldRules: ['Only elemental bending techniques are canonical. Teleportation cannot exist in this world.'],
          ruleConstraints: ['Teleportation cannot exist in this world.'],
        },
        rulesProfile,
        progressionPolicy: progression,
        progressionState: { currentLevel: 1, maxCharacterLevel: 10, allowLevelUp: true },
        ownedCapabilities: [],
        allWorldCapabilities: [],
      },
    );

    assert.equal(teleport.worldAllowed, false);
    assert.equal(teleport.status, 'WORLD_FORBIDDEN');
    assert.equal(teleport.creationAllowed, false);
  }
});

test('wizard fire magic is developable but still not owned', () => {
  const simulation = simulator.simulate(
    'I cast Fireball',
    {
      actorId: 'wizard_1',
      character: {
        role: { profession: 'Wizard', archetype: 'Wizard' },
        background: { history: 'A trained spellcaster.' },
      },
      world: {
        title: 'Arcane Realm',
        description: 'Magic is a canonical part of reality.',
        magicSystems: ['spellcasting', 'mana'],
        dndRulesMode: 'FULL_DND',
      },
      rulesProfile,
      progressionPolicy: progression,
      progressionState: { currentLevel: 1, maxCharacterLevel: 10, allowLevelUp: true },
      ownedCapabilities: [],
      allWorldCapabilities: [],
    },
    fireball,
  );

  assert.equal(simulation.status, 'DEVELOPABLE');
  assert.equal(simulation.characterCompatible, true);
  assert.equal(simulation.creationAllowed, true);
  assert.equal(simulation.currentlyExecutable, false);
});

test('dark mage fire request needs an explicitly compatible alternate mechanism', () => {
  const simulation = simulator.simulate(
    'I cast Fireball',
    {
      actorId: 'dark_1',
      character: {
        role: { profession: 'Dark Mage', archetype: 'Dark Mage' },
        background: { history: 'A curse-bound shadow mage.' },
      },
      world: {
        title: 'Arcane Realm',
        description: 'Magic is canonical.',
        magicSystems: ['spellcasting', 'shadow magic'],
        dndRulesMode: 'FULL_DND',
      },
      rulesProfile,
      progressionPolicy: progression,
      progressionState: { currentLevel: 1, maxCharacterLevel: 10, allowLevelUp: true },
      ownedCapabilities: [],
      allWorldCapabilities: [],
    },
    fireball,
  );

  assert.equal(simulation.characterCompatible, false);
  assert.equal(simulation.creationAllowed, false);
  assert.notEqual(simulation.status, 'DEVELOPABLE');
});
