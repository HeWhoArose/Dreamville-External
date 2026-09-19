import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { WorldSimulationService } from '../server/simulation/worldSimulationService';
import { ServerMockAuthority } from '../server/mockEngine/serverMockAuthority';

test('Slice 9: Dynamic World Map + Epistemic Exploration + Travel Verification Suite', async (t) => {
  const worldRepo = new InMemoryWorldRepository();
  const worldSim = new WorldSimulationService(worldRepo);
  const authority = new ServerMockAuthority();

  const world = worldRepo.getWorldTemplate('world_solar_archive');
  const confirmedChar = {
    characterId: 'char_map_1',
    worldId: world.worldId,
    identity: { name: 'Astraea', species: 'Human' },
    role: { profession: 'Wayfinder' },
    startingLocation: { locationId: 'loc_whispering_orrery', name: 'Whispering Orrery' },
    startingSituation: { summary: 'Standing before the Orrery.' },
  };

  const { storyId } = worldRepo.createStoryRunFromConfirmedCharacter({
    worldId: world.worldId,
    confirmedCharacter: confirmedChar,
    storyId: 'story_map_test_999',
    storyMode: 'PROTAGONIST',
  });

  await t.test('1. World Geography & storyId scoping', async () => {
    const graph = worldRepo.getGeographyGraph(storyId);
    assert.ok(graph);
    const nodes = graph.getAllNodes();
    assert.ok(nodes.length > 0);

    const player = worldRepo.getPlayerLifecycle(storyId);
    assert.ok(player);
    assert.equal(player.name, 'Astraea');
  });

  await t.test('2. Epistemic travel validation and boundary checks', async () => {
    const player = worldRepo.getPlayerLifecycle(storyId);
    assert.ok(player);

    // Try traveling to unknown location
    const invalidTravel = worldSim.startPlayerTravel(storyId, 'loc_unknown_dest_xyz', 'Foot');
    assert.equal(invalidTravel.success, false);

    // Discover a valid adjacent location
    const graph = worldRepo.getGeographyGraph(storyId);
    const nodes = graph.getAllNodes();
    const adjacentNode = nodes.find(n => n.id !== player.locationId && n.accessible);

    if (adjacentNode) {
      const updatedPlayer = player.copyWith({
        discoveredLocationIds: Array.from(new Set([...(player.discoveredLocationIds || []), adjacentNode.id])),
      });
      worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);

      const validTravel = worldSim.startPlayerTravel(storyId, adjacentNode.id, 'Foot');
      assert.equal(validTravel.success, true);
      assert.ok(validTravel.journey);
      assert.equal(validTravel.journey?.destinationLocationId, adjacentNode.id);
    }
  });

  await t.test('3. ServerMockAuthority TRAVEL_REQUEST with route edges and viewState projection', async () => {
    const testStoryId = 'story_authority_map_777';
    const viewState = authority.getSanitizedViewState(testStoryId);
    assert.ok(viewState.locations);
    assert.ok(viewState.routeEdges);
    assert.equal(Array.isArray(viewState.routeEdges), true);

    const activeLocId = viewState.activeLocationId;
    const reachableEdge = viewState.routeEdges?.find(e => e.fromLocationId === activeLocId || e.toLocationId === activeLocId);

    if (reachableEdge) {
      const targetId = reachableEdge.fromLocationId === activeLocId ? reachableEdge.toLocationId : reachableEdge.fromLocationId;
      const player = worldRepo.getPlayerLifecycle(testStoryId);
      if (player) {
        worldRepo.updatePlayerLifecycle(testStoryId, player.copyWith({
          discoveredLocationIds: Array.from(new Set([...(player.discoveredLocationIds || []), targetId]))
        }));
      }

      const actionResult = authority.processAction({
        type: 'TRAVEL_REQUEST',
        targetLocationId: targetId,
        storyId: testStoryId,
        mode: 'Foot'
      } as any);

      assert.equal(actionResult.success, true);
      assert.equal(actionResult.viewState?.isTraveling, true);
    }
  });
});
