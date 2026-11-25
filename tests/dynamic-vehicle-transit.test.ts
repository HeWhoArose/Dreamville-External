import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { VehicleInteractionAuthority } from '../server/domain/vehicleInteractionAuthority';
import { worldRepository } from '../server/repositories/worldRepository';
import { worldSimulationService } from '../server/simulation/worldSimulationService';
import { PlayerLifecycleState } from '../server/domain/playerLifecycleState';

describe('Milestone 3: Dynamic Vehicle & Street Interaction (Taxi Hail)', () => {
  const storyId = 'test_story_vehicle_transit';
  let originStreetId: string;
  let destinationStreetId: string;

  beforeEach(() => {
    // 1. Initialize story run
    worldRepository.seedStory(storyId);
    originStreetId = 'loc_elysium_boulevard';
    destinationStreetId = 'loc_harbor_wharf';

    const run = worldRepository.getStoryRun(storyId);
    if (run) {
      if (!run.runtimeState) run.runtimeState = {} as any;
      run.runtimeState.player = { locationId: originStreetId } as any;
      (run.runtimeState as any).inVehicle = false;
      (run.runtimeState as any).boardedVehicleId = undefined;
    }

    // 2. Set up geography graph with street and interior nodes
    const graph = worldRepository.getGeographyGraph(storyId);

    // Origin street node
    graph.addNode({
      id: originStreetId,
      name: 'Elysium Boulevard',
      regionId: 'reg_city',
      description: 'A bustling city street with steady taxi traffic.',
      coordinates: { x: 100, y: 100 },
      accessible: true,
      discovered: true,
      ambientSensory: 'Sounds of traffic and passing vehicles.',
      archetype: 'URBAN_DISTRICT' as any,
      tags: ['street', 'road', 'urban'],
      sceneObjects: [],
      provenance: 'authored',
    });

    // Destination street node
    graph.addNode({
      id: destinationStreetId,
      name: 'Harbor Wharf',
      regionId: 'reg_city',
      description: 'The city docks where cabs drop off passengers.',
      coordinates: { x: 105, y: 100 },
      accessible: true,
      discovered: true,
      ambientSensory: 'Smell of salt water and creaking piers.',
      archetype: 'URBAN_DISTRICT' as any,
      tags: ['street', 'road', 'docks'],
      sceneObjects: [],
      provenance: 'authored',
    });

    // Road edge connecting origin to destination
    graph.addEdge({
      id: 'edge_boulevard_to_wharf',
      fromLocationId: originStreetId,
      toLocationId: destinationStreetId,
      distanceKm: 2.0,
      terrain: 'Road',
      allowedModes: ['Foot', 'Coach', 'Horse'],
      hazardRisk: 0,
      isBlocked: false,
      provenance: 'authored',
    });

    // Add interior office node without street access
    graph.addNode({
      id: 'loc_interior_office',
      name: 'Third Floor Office',
      regionId: 'reg_city',
      description: 'A third-floor office with no street access.',
      coordinates: { x: 100, y: 100, elevation: 3 },
      accessible: true,
      discovered: true,
      ambientSensory: 'Quiet office.',
      archetype: 'WORKPLACE' as any,
      tags: ['office', 'room', 'interior'],
      sceneObjects: [],
      provenance: 'authored',
    });

    // Add sewer node without street access
    graph.addNode({
      id: 'loc_underground_sewer',
      name: 'Underground Sewer',
      regionId: 'reg_city',
      description: 'A damp sewer below the street.',
      coordinates: { x: 100, y: 100, elevation: -2 },
      accessible: true,
      discovered: true,
      ambientSensory: 'Dripping water.',
      archetype: 'SEWER' as any,
      tags: ['sewer', 'underground'],
      sceneObjects: [],
      provenance: 'authored',
    });

    // 3. Initialize canonical PlayerLifecycleState at origin
    const playerLifecycle = new PlayerLifecycleState({
      actorId: 'actor_ren',
      name: 'Detective Ren',
      locationId: originStreetId,
      lastUpdatedTime: 0,
      discoveredLocationIds: [originStreetId, destinationStreetId],
    });
    worldRepository.updatePlayerLifecycle(storyId, playerLifecycle);
  });

  describe('Street Affordance Gating', () => {
    it('recognizes street locations and rejects non-street indoor/underground locations', () => {
      assert.equal(VehicleInteractionAuthority.isStreetLocation(worldRepository, storyId, originStreetId), true);
      assert.equal(VehicleInteractionAuthority.isStreetLocation(worldRepository, storyId, 'loc_interior_office'), false);
      assert.equal(VehicleInteractionAuthority.isStreetLocation(worldRepository, storyId, 'loc_underground_sewer'), false);
    });

    it('rejects vehicle hailing in interior office without street access', () => {
      const result = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: 'loc_interior_office',
      });

      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'CANNOT_HAIL_VEHICLE_WITHOUT_STREET_ACCESS');

      // Crucial: No vehicle entity is added to the scene!
      const graph = worldRepository.getGeographyGraph(storyId);
      const officeNode = graph.getNode('loc_interior_office');
      const vehicles = (officeNode?.sceneObjects || []).filter((obj) => obj.tags?.includes('vehicle'));
      assert.equal(vehicles.length, 0);
    });

    it('rejects vehicle hailing in sewer without street access', () => {
      const result = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: 'loc_underground_sewer',
      });

      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'CANNOT_HAIL_VEHICLE_WITHOUT_STREET_ACCESS');
    });
  });

  describe('Dynamic Vehicle Materialization via 4-Stage Lifecycle', () => {
    it('materializes ACTIVE_TEMPORARY taxi on street without pre-authored vehicle entity', () => {
      const graph = worldRepository.getGeographyGraph(storyId);
      const initialVehicles = (graph.getNode(originStreetId)?.sceneObjects || []).filter((obj) =>
        obj.tags?.includes('vehicle')
      );
      assert.equal(initialVehicles.length, 0);

      const hailResult = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: originStreetId,
      });

      assert.equal(hailResult.success, true);
      assert.equal(hailResult.stage, 'ACTIVE_TEMPORARY');
      assert.ok(hailResult.vehicle);
      assert.equal(hailResult.vehicle.name, 'Yellow Cab');
      assert.equal(hailResult.vehicle.lifecycleStage, 'ACTIVE_TEMPORARY');

      // Check vehicle exists in GeographyGraph sceneObjects
      const streetNode = graph.getNode(originStreetId);
      const sceneVehicles = (streetNode?.sceneObjects || []).filter((obj) => obj.tags?.includes('vehicle'));
      assert.equal(sceneVehicles.length, 1);
      assert.equal(sceneVehicles[0].id, hailResult.vehicle.id);
    });

    it('reuses existing waiting taxi on subsequent hail without spawning duplicates', () => {
      const firstHail = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: originStreetId,
      });
      assert.equal(firstHail.success, true);

      const secondHail = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: originStreetId,
      });
      assert.equal(secondHail.success, true);
      assert.equal(secondHail.vehicle?.id, firstHail.vehicle?.id);

      const graph = worldRepository.getGeographyGraph(storyId);
      const sceneVehicles = (graph.getNode(originStreetId)?.sceneObjects || []).filter((obj) =>
        obj.tags?.includes('vehicle')
      );
      assert.equal(sceneVehicles.length, 1);
    });
  });

  describe('Boarding Gate', () => {
    it('rejects boarding when no vehicle is present at the location', () => {
      const boardResult = VehicleInteractionAuthority.boardVehicle({
        repository: worldRepository,
        storyId,
        locationId: originStreetId,
      });

      assert.equal(boardResult.success, false);
      assert.equal(boardResult.errorCode, 'NO_VEHICLE_PRESENT');
    });

    it('successfully boards waiting vehicle and updates active dependencies', () => {
      const hailResult = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: originStreetId,
      });
      assert.equal(hailResult.success, true);

      const boardResult = VehicleInteractionAuthority.boardVehicle({
        repository: worldRepository,
        storyId,
        locationId: originStreetId,
        actorId: 'actor_ren',
      });

      assert.equal(boardResult.success, true);
      assert.match(boardResult.message, /board/i);

      // Verify active dependency 'player_boarded' is assigned to protect from GC
      assert.ok(boardResult.vehicle?.activeDependencies?.includes('player_boarded'));

      // Verify player runtime state
      const run = worldRepository.getStoryRun(storyId);
      assert.equal((run?.runtimeState as any)?.inVehicle, true);
      assert.equal((run?.runtimeState as any)?.boardedVehicleId, hailResult.vehicle?.id);
    });
  });

  describe('Transit Gate & Invariant 6 Preservation', () => {
    it('rejects vehicle transit if player has not boarded (NOT_IN_VEHICLE)', () => {
      // Vehicle hailed but not boarded
      VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: originStreetId,
      });

      const transitResult = VehicleInteractionAuthority.transitVehicle({
        repository: worldRepository,
        storyId,
        destinationLocationId: destinationStreetId,
      });

      assert.equal(transitResult.success, false);
      assert.equal(transitResult.errorCode, 'NOT_IN_VEHICLE');
    });

    it('initiates vehicle transit and strictly preserves Invariant 6 (locationId remains origin during travel)', () => {
      // 1. Hail
      const hail = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: originStreetId,
      });
      assert.equal(hail.success, true);

      // 2. Board
      const board = VehicleInteractionAuthority.boardVehicle({
        repository: worldRepository,
        storyId,
        locationId: originStreetId,
        actorId: 'actor_ren',
      });
      assert.equal(board.success, true);

      // 3. Transit
      const transit = VehicleInteractionAuthority.transitVehicle({
        repository: worldRepository,
        storyId,
        destinationLocationId: destinationStreetId,
      });
      assert.equal(transit.success, true);

      // 4. Invariant 6: locationId remains originLocationId while travel is in progress!
      const playerAfterTransit = worldRepository.getPlayerLifecycle(storyId);
      assert.equal(playerAfterTransit?.locationId, originStreetId);
      assert.equal(playerAfterTransit?.isTraveling, true);
      assert.equal(playerAfterTransit?.activeJourney?.destinationLocationId, destinationStreetId);
    });

    it('completes journey on arrival, disembarks player, and evicts temporary vehicle without store pollution', () => {
      // Hail, Board, and Transit
      VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: originStreetId,
      });
      VehicleInteractionAuthority.boardVehicle({
        repository: worldRepository,
        storyId,
        locationId: originStreetId,
      });
      VehicleInteractionAuthority.transitVehicle({
        repository: worldRepository,
        storyId,
        destinationLocationId: destinationStreetId,
      });

      // Advance time to complete journey arrival
      const advanceResult = worldSimulationService.advanceTime(storyId, 3600);
      assert.ok(advanceResult.completedArrivals.includes(destinationStreetId));

      const playerArrived = worldRepository.getPlayerLifecycle(storyId);
      assert.equal(playerArrived?.locationId, destinationStreetId);

      // Complete vehicle journey / disembark
      const completeResult = VehicleInteractionAuthority.completeVehicleJourney({
        repository: worldRepository,
        storyId,
        locationId: destinationStreetId,
      });

      assert.equal(completeResult.success, true);
      assert.equal(completeResult.stage, 'EPHEMERAL');

      // Verify player is no longer in vehicle
      const run = worldRepository.getStoryRun(storyId);
      assert.equal((run?.runtimeState as any)?.inVehicle, false);

      // Verify vehicle is completely evicted from GeographyGraph (zero store pollution)
      const graph = worldRepository.getGeographyGraph(storyId);
      for (const node of graph.getAllNodes()) {
        const vehicles = (node.sceneObjects || []).filter((obj) => obj.tags?.includes('vehicle'));
        assert.equal(vehicles.length, 0, `No vehicle should remain in node ${node.id}`);
      }
    });
  });
});
