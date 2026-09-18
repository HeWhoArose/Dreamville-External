import { describe, it, beforeEach } from 'node:test';
import * as assert from 'assert';
import { GeographyGraph } from '../server/domain/geographyGraph';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { WorldClock } from '../server/domain/worldClock';
import { worldRepository } from '../server/repositories/worldRepository';
import { WorldSimulationService } from '../server/simulation/worldSimulationService';

describe('CH1 SURGICAL REPAIR REGRESSION', () => {
  beforeEach(() => {
    serverMockAuthority.resetToCanonicalState('default_story');
  });

  describe('DEF-CH1-01: Geography Authority Disconnect', () => {
    it('should derive UI projection from canonical GeographyGraph, without a duplicate mock location dictionary controlling the result', () => {
      const graph = worldRepository.getGeographyGraph();
      // Add a test node
      graph.addNode({
        id: 'loc_test_node',
        name: 'Test Node',
        regionId: 'reg_test',
        description: 'A test node.',
        coordinates: { x: 0, y: 0 },
        accessible: true,
        ambientSensory: 'Quiet',
        discovered: true,
        provenance: 'authored',
      });
      const player = worldRepository.getPlayerLifecycle('default_story');
      if (player) {
        worldRepository.updatePlayerLifecycle('default_story', player.copyWith({
          discoveredLocationIds: [...(player.discoveredLocationIds || []), 'loc_test_node']
        }));
      }
      
      const viewState = serverMockAuthority.getSanitizedViewState();
      assert.ok(viewState.locations['loc_test_node'], 'Projection should include the dynamically added canonical node');
      assert.strictEqual(viewState.locations['loc_test_node'].name, 'Test Node');
      
      // Ensure hidden/undiscovered locations remain filtered
      graph.addNode({
        id: 'loc_hidden_node',
        name: 'Hidden Node',
        regionId: 'reg_test',
        description: 'A hidden node.',
        coordinates: { x: 0, y: 0 },
        accessible: true,
        ambientSensory: 'Quiet',
        discovered: false,
        provenance: 'authored',
      });
      const viewState2 = serverMockAuthority.getSanitizedViewState();
      assert.ok(!viewState2.locations['loc_hidden_node'], 'Projection should hide undiscovered canonical node');
    });

    it('DISCOVER_LOCATION changes canonical discovery state', () => {
      const result = serverMockAuthority.processAction({ type: 'DISCOVER_LOCATION', targetLocationId: 'loc_sunken_scriptorium' } as any);
      assert.strictEqual(result.success, true);
      
      const player = worldRepository.getPlayerLifecycle('default_story');
      assert.ok(player?.discoveredLocationIds.includes('loc_sunken_scriptorium'), 'Player lifecycle state should record discovery');
      
      const viewState = serverMockAuthority.getSanitizedViewState();
      assert.ok(viewState.locations['loc_sunken_scriptorium'], 'Location should be visible in view state after discovery');
    });
  });

  describe('DEF-CH1-02: Travel Interruptions', () => {
    it('should deterministically interrupt a journey, preserve elapsed time and location rules', () => {
      const simSvc = new WorldSimulationService(worldRepository);
      const res = simSvc.startPlayerTravel('default_story', 'loc_lantern_vault', 'Foot');
      assert.strictEqual(res.success, true);
      
      const player = worldRepository.getPlayerLifecycle('default_story');
      assert.ok(player?.isTraveling);
      
      // Advance by 1 hour (3600 seconds)
      simSvc.advanceTime('default_story', 3600);
      
      // Interrupt travel
      const interrupted = simSvc.interruptPlayerTravel('default_story', 'Ambush');
      assert.strictEqual(interrupted, true);
      
      const updatedPlayer = worldRepository.getPlayerLifecycle('default_story');
      assert.strictEqual(updatedPlayer?.activeJourney?.status, 'interrupted');
      assert.strictEqual(updatedPlayer?.currentActivity, 'idle');
      
      // Still anchored at origin
      assert.strictEqual(updatedPlayer?.locationId, 'loc_whispering_orrery');
      
      // Distance traveled should be updated
      const distanceTraveled = updatedPlayer?.activeJourney?.traveledDistanceKm;
      assert.ok(distanceTraveled && distanceTraveled > 0);
    });
  });

  describe('DEF-CH1-03: Simulation Time Scale Semantics', () => {
    it('advanceSeconds() strictly adds literal canonical simulation seconds, irrespective of timeScale', () => {
      const clock = new WorldClock();
      clock.getState().timeScale = 5.0; // Simulate an active UI fast-forward
      
      const initialTotal = clock.getTimestamp().totalElapsedSeconds;
      clock.advanceSeconds(3600); // Advance 1 simulation hour
      
      const newTotal = clock.getTimestamp().totalElapsedSeconds;
      assert.strictEqual(newTotal - initialTotal, 3600, 'advanceSeconds must add literal seconds exactly, not multiply by timeScale');
    });
  });

  describe('DEF-CH1-04: Geography Provenance', () => {
    it('Canonical geography nodes and edges have structured provenance', () => {
      const graph = worldRepository.getGeographyGraph();
      const nodes = graph.getAllNodes();
      assert.ok(nodes.length > 0);
      for (const node of nodes) {
        assert.ok(node.provenance === 'authored' || node.provenance === 'source/reference' || node.provenance === 'generated' || node.provenance === 'hybrid' || node.provenance === 'imported');
      }
      
      const edges = graph.getAllEdges();
      assert.ok(edges.length > 0);
      for (const edge of edges) {
        assert.ok(edge.provenance === 'authored' || edge.provenance === 'source/reference' || edge.provenance === 'generated' || edge.provenance === 'hybrid' || edge.provenance === 'imported');
      }
    });
  });
});
