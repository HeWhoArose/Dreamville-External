import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { PlayerLifecycleState } from '../server/domain/playerLifecycleState';

test('Adaptive RPG HUD & Character Drawer (Slice 8) Comprehensive Verification Suite', async (t) => {

  await t.test('1. Current Character & State Projection', async () => {
    const repo = new InMemoryWorldRepository();
    const world = repo.getWorldTemplate('world_solar_archive');
    const confirmedChar = {
      characterId: 'char_slice8_1',
      worldId: world.worldId,
      identity: { name: 'Kaelen', species: 'Human' },
      role: { profession: 'Chronicle Warden' },
      startingLocation: { locationId: 'loc_whispering_orrery', name: 'Whispering Orrery' },
      startingSituation: { summary: 'Awakening in the Orrery.' },
    };

    const { storyId } = repo.createStoryRunFromConfirmedCharacter({
      worldId: world.worldId,
      confirmedCharacter: confirmedChar,
      storyId: 'run_slice8_1',
      storyMode: 'PROTAGONIST',
    });

    const player = repo.getPlayerLifecycle(storyId);
    assert.equal(player.name, 'Kaelen');
  });

  await t.test('2. Current Equipment & Inventory Projection', async () => {
    const repo = new InMemoryWorldRepository();
    const world = repo.getWorldTemplate('world_solar_archive');
    const { storyId } = repo.createStoryRunFromConfirmedCharacter({
      worldId: world.worldId,
      confirmedCharacter: {
        characterId: 'char_slice8_inv',
        worldId: world.worldId,
        identity: { name: 'Valerius' },
        startingLocation: { locationId: 'loc_whispering_orrery' },
      },
      storyId: 'run_slice8_inv',
    });

    const invEngine = repo.getInventoryEngine(storyId);
    const items = invEngine.getInventoryItems('char_slice8_inv');
    assert.ok(Array.isArray(items), 'Inventory items must be an array');
  });

  await t.test('3. Capability vs Technique Distinction & Lineage', async () => {
    const repo = new InMemoryWorldRepository();
    const world = repo.getWorldTemplate('world_solar_archive');
    const { storyId } = repo.createStoryRunFromConfirmedCharacter({
      worldId: world.worldId,
      confirmedCharacter: {
        characterId: 'char_slice8_cap',
        worldId: world.worldId,
        identity: { name: 'Mage' },
        startingLocation: { locationId: 'loc_whispering_orrery' },
      },
      storyId: 'run_slice8_cap',
    });

    const capEngine = repo.getCapabilityEngine(storyId);
    const coreCaps = capEngine.getAllCapabilities();
    const techniques = capEngine.getActorSkillInstances('char_slice8_cap');

    assert.ok(Array.isArray(coreCaps), 'Core capabilities list must exist');
    assert.ok(Array.isArray(techniques), 'Actor technique list must exist');
  });

  await t.test('4. StoryId Scoping & Multi-Run Isolation', async () => {
    const repo = new InMemoryWorldRepository();
    const world = repo.getWorldTemplate('world_solar_archive');

    const runA = repo.createStoryRunFromConfirmedCharacter({
      worldId: world.worldId,
      confirmedCharacter: { characterId: 'char_a', worldId: world.worldId, identity: { name: 'Hero A' }, startingLocation: { locationId: 'loc_whispering_orrery' } },
      storyId: 'run_scoping_a',
    });

    const runB = repo.createStoryRunFromConfirmedCharacter({
      worldId: world.worldId,
      confirmedCharacter: { characterId: 'char_b', worldId: world.worldId, identity: { name: 'Hero B' }, startingLocation: { locationId: 'loc_whispering_orrery' } },
      storyId: 'run_scoping_b',
    });

    const playerA = repo.getPlayerLifecycle(runA.storyId);
    const playerB = repo.getPlayerLifecycle(runB.storyId);

    assert.equal(playerA.name, 'Hero A');
    assert.equal(playerB.name, 'Hero B');
    assert.notEqual(playerA.actorId, playerB.actorId);
  });

  await t.test('5. Mutation -> Updated HUD State', async () => {
    const repo = new InMemoryWorldRepository();
    const world = repo.getWorldTemplate('world_solar_archive');
    const { storyId } = repo.createStoryRunFromConfirmedCharacter({
      worldId: world.worldId,
      confirmedCharacter: {
        characterId: 'char_slice8_mut',
        worldId: world.worldId,
        identity: { name: 'Mutator' },
        startingLocation: { locationId: 'loc_whispering_orrery' },
      },
      storyId: 'run_slice8_mut',
    });

    const player = repo.getPlayerLifecycle(storyId);
    const updatedPlayer = new PlayerLifecycleState({
      actorId: player.actorId,
      name: player.name,
      locationId: player.locationId,
      lastUpdatedTime: Date.now(),
      injuries: [{ id: 'inj_1', name: 'Minor Laceration', severity: 'minor', description: 'Scratch on arm' }],
    });
    repo.updatePlayerLifecycle(storyId, updatedPlayer);

    const fetchedPlayer = repo.getPlayerLifecycle(storyId);
    assert.equal(fetchedPlayer.injuries.length, 1, 'Player injury mutation must be reflected');
  });

});
