import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PlayerLifecycleState } from '../server/domain/playerLifecycleState';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { WorldSimulationService } from '../server/simulation/worldSimulationService';
import { HistoricalChronicleEngine } from '../server/domain/historicalChronicleEngine';

HistoricalChronicleEngine.bypassTransactionCheck = true;

describe('PlayerLifecycleState Model (Decision 1)', () => {
  it('instantiates with deterministic actorId and value immutability', () => {
    const player = new PlayerLifecycleState({
      actorId: 'player_actor_test',
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      lastUpdatedTime: 1000,
      currentActivity: 'idle',
    });

    assert.strictEqual(player.actorId, 'player_actor_test');
    assert.strictEqual(player.name, 'Scribe Vael');
    assert.strictEqual(player.locationId, 'loc_whispering_orrery');
    assert.strictEqual(player.isTraveling, false);
    assert.strictEqual(player.isDead, false);
    assert.strictEqual(player.isTransformed, false);
    assert.strictEqual(player.isPossessed, false);
    assert.ok(Object.isFrozen(player));
  });

  it('supports copyWith without mutating original instance', () => {
    const original = new PlayerLifecycleState({
      actorId: 'player_actor_test',
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      lastUpdatedTime: 1000,
      currentActivity: 'idle',
    });

    const updated = original.copyWith({
      currentActivity: 'inspecting_astrolabe',
      lastUpdatedTime: 1050,
    });

    assert.strictEqual(original.currentActivity, 'idle');
    assert.strictEqual(original.lastUpdatedTime, 1000);
    assert.strictEqual(updated.currentActivity, 'inspecting_astrolabe');
    assert.strictEqual(updated.lastUpdatedTime, 1050);
    assert.strictEqual(updated.actorId, original.actorId);
  });

  it('serializes and deserializes deterministically to/from JSON', () => {
    const player = new PlayerLifecycleState({
      actorId: 'player_actor_test',
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      lastUpdatedTime: 1000,
      currentActivity: 'idle',
      injuries: [
        {
          id: 'inj_01',
          type: 'Strain',
          severity: 'Minor',
          location: 'Right wrist',
          description: 'Slight mechanical torque strain',
          acquiredAtTimestamp: {
            year: 42,
            month: 10,
            day: 14,
            hour: 17,
            minute: 42,
            second: 0,
            totalElapsedSeconds: 1000,
          },
          healed: false,
        },
      ],
    });

    const json = player.toJSON();
    const restored = PlayerLifecycleState.fromJSON(json);

    assert.ok(player.equals(restored));
    assert.strictEqual(restored.injuries.length, 1);
    assert.strictEqual(restored.injuries[0].location, 'Right wrist');
  });
});

describe('World Repository Authority & Travel Semantics', () => {
  it('guarantees getCurrentLocation reads directly from PlayerLifecycleState (Single Authority)', () => {
    const repo = new InMemoryWorldRepository();
    const storyId = 'story_single_authority_test';

    const player = new PlayerLifecycleState({
      actorId: `player_actor_${storyId}`,
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      lastUpdatedTime: 100,
    });
    repo.updatePlayerLifecycle(storyId, player);

    // Initial check
    assert.strictEqual(repo.getCurrentLocation(storyId), 'loc_whispering_orrery');

    // Update player lifecycle directly
    const movedPlayer = player.copyWith({ locationId: 'loc_lantern_vault' });
    repo.updatePlayerLifecycle(storyId, movedPlayer);

    // Immediate reflection without a second authority
    assert.strictEqual(repo.getCurrentLocation(storyId), 'loc_lantern_vault');
  });

  it('strictly enforces Travel Origin Anchoring (Decision 1 Invariants 6 & 7)', () => {
    const repo = new InMemoryWorldRepository();
    const simService = new WorldSimulationService(repo);
    const storyId = 'story_travel_invariants';

    const graph = repo.getGeographyGraph(storyId);
    graph.addNode({ id: 'loc_whispering_orrery', name: 'Orrery', description: '', coordinates: { x: 0, y: 0 }, accessible: true });
    graph.addNode({ id: 'loc_lantern_vault', name: 'Vault', description: '', coordinates: { x: 10, y: 10 }, accessible: true });
    graph.addEdge({
      id: 'edge_orrery_vault_1',
      fromLocationId: 'loc_whispering_orrery',
      toLocationId: 'loc_lantern_vault',
      distanceKm: 5,
      allowedModes: ['Foot'],
      terrain: 'Trail',
      trailQuality: 'Maintained',
      steepness: 'Flat',
      perceivedDanger: 'Safe',
      isBlocked: false,
    });

    const startPlayer = new PlayerLifecycleState({
      actorId: `player_actor_${storyId}`,
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      discoveredLocationIds: ['loc_whispering_orrery', 'loc_lantern_vault'],
      lastUpdatedTime: repo.getWorldClock(storyId).getTimestamp().totalElapsedSeconds,
    });
    repo.updatePlayerLifecycle(storyId, startPlayer);

    // 1. Start Travel from Orrery to Vault
    const travelResult = simService.startPlayerTravel(storyId, 'loc_lantern_vault', 'Foot');
    assert.strictEqual(travelResult.success, true);
    assert.ok(travelResult.journey);

    // INVARIANT 6: While traveling, locationId MUST REMAIN THE ORIGIN
    const travelingPlayer = repo.getPlayerLifecycle(storyId)!;
    assert.strictEqual(travelingPlayer.isTraveling, true);
    assert.strictEqual(travelingPlayer.locationId, 'loc_whispering_orrery');
    assert.strictEqual(repo.getCurrentLocation(storyId), 'loc_whispering_orrery');
    assert.strictEqual(travelingPlayer.activeJourney?.status, 'in_progress');

    // 2. Advance time partially (e.g. 1 hour = 3600 seconds)
    simService.advanceTime(storyId, 3600);
    const midTravelPlayer = repo.getPlayerLifecycle(storyId)!;
    assert.strictEqual(midTravelPlayer.isTraveling, true);
    // Still anchored to origin!
    assert.strictEqual(midTravelPlayer.locationId, 'loc_whispering_orrery');
    assert.ok(midTravelPlayer.activeJourney!.traveledDistanceKm > 0);
    assert.ok(midTravelPlayer.activeJourney!.traveledDistanceKm < midTravelPlayer.activeJourney!.totalDistanceKm);

    // 3. Advance time to complete journey (another 2 hours = 7200 seconds)
    const completionResult = simService.advanceTime(storyId, 7200);
    assert.ok(completionResult.completedArrivals.includes('loc_lantern_vault'));

    // INVARIANT 7: Destination replaces locationId ONLY when JourneyStatus.completed
    const arrivedPlayer = repo.getPlayerLifecycle(storyId)!;
    assert.strictEqual(arrivedPlayer.isTraveling, false);
    assert.strictEqual(arrivedPlayer.locationId, 'loc_lantern_vault');
    assert.strictEqual(repo.getCurrentLocation(storyId), 'loc_lantern_vault');
    assert.strictEqual(arrivedPlayer.activeJourney, null);
    assert.strictEqual(arrivedPlayer.currentActivity, 'idle');
  });

  it('leaves player anchored at origin when travel is cancelled', () => {
    const repo = new InMemoryWorldRepository();
    const simService = new WorldSimulationService(repo);
    const storyId = 'story_cancel_travel';

    const graph = repo.getGeographyGraph(storyId);
    graph.addNode({ id: 'loc_whispering_orrery', name: 'Orrery', description: '', coordinates: { x: 0, y: 0 }, accessible: true });
    graph.addNode({ id: 'loc_lantern_vault', name: 'Vault', description: '', coordinates: { x: 10, y: 10 }, accessible: true });
    graph.addEdge({
      id: 'edge_orrery_vault_2',
      fromLocationId: 'loc_whispering_orrery',
      toLocationId: 'loc_lantern_vault',
      distanceKm: 5,
      allowedModes: ['Foot'],
      terrain: 'Trail',
      trailQuality: 'Maintained',
      steepness: 'Flat',
      perceivedDanger: 'Safe',
      isBlocked: false,
    });

    const player = new PlayerLifecycleState({
      actorId: `player_actor_${storyId}`,
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      discoveredLocationIds: ['loc_whispering_orrery', 'loc_lantern_vault'],
      lastUpdatedTime: repo.getWorldClock(storyId).getTimestamp().totalElapsedSeconds,
    });
    repo.updatePlayerLifecycle(storyId, player);

    simService.startPlayerTravel(storyId, 'loc_lantern_vault', 'Foot');
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.isTraveling, true);

    const cancelled = simService.cancelPlayerTravel(storyId);
    assert.strictEqual(cancelled, true);

    const afterCancel = repo.getPlayerLifecycle(storyId)!;
    assert.strictEqual(afterCancel.isTraveling, false);
    assert.strictEqual(afterCancel.locationId, 'loc_whispering_orrery');
  });

  it('manages player injuries deterministically (CH3 Embodied Lifecycle)', () => {
    const repo = new InMemoryWorldRepository();
    const simService = new WorldSimulationService(repo);
    const storyId = 'story_injury_lifecycle';

    const player = new PlayerLifecycleState({
      actorId: `player_actor_${storyId}`,
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      lastUpdatedTime: repo.getWorldClock(storyId).getTimestamp().totalElapsedSeconds,
    });
    repo.updatePlayerLifecycle(storyId, player);

    // Apply injury
    const applyRes = simService.applyPlayerInjury(storyId, {
      id: 'inj_test_1',
      type: 'Laceration',
      severity: 'Moderate',
      location: 'Left arm',
      description: 'Cut from glass lens fragment',
    });
    assert.strictEqual(applyRes.success, true);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.injuries.length, 1);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.injuries[0].location, 'Left arm');

    // Heal injury
    const healRes = simService.healPlayerInjury(storyId, 'inj_test_1');
    assert.strictEqual(healRes.success, true);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.injuries.length, 0);
  });

  it('manages player transformations deterministically (CH3 Embodied Lifecycle)', () => {
    const repo = new InMemoryWorldRepository();
    const simService = new WorldSimulationService(repo);
    const storyId = 'story_transform_lifecycle';

    const player = new PlayerLifecycleState({
      actorId: `player_actor_${storyId}`,
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      lastUpdatedTime: repo.getWorldClock(storyId).getTimestamp().totalElapsedSeconds,
    });
    repo.updatePlayerLifecycle(storyId, player);

    // Apply transformation
    const transRes = simService.applyPlayerTransformation(storyId, {
      id: 'trans_astral',
      formName: 'Astral Projection',
      vesselType: 'Aetherial',
    });
    assert.strictEqual(transRes.success, true);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.isTransformed, true);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.transformationRecord?.formName, 'Astral Projection');

    // Revert transformation
    const revertRes = simService.revertPlayerTransformation(storyId);
    assert.strictEqual(revertRes.success, true);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.isTransformed, false);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.transformationRecord, null);
  });

  it('manages player mortality and revival deterministically (CH3 Embodied Lifecycle)', () => {
    const repo = new InMemoryWorldRepository();
    const simService = new WorldSimulationService(repo);
    const storyId = 'story_death_lifecycle';

    const player = new PlayerLifecycleState({
      actorId: `player_actor_${storyId}`,
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      lastUpdatedTime: repo.getWorldClock(storyId).getTimestamp().totalElapsedSeconds,
    });
    repo.updatePlayerLifecycle(storyId, player);

    // Record death
    const deathRes = simService.recordPlayerDeath(storyId, 'Resonance overload', true);
    assert.strictEqual(deathRes.success, true);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.isDead, true);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.currentActivity, 'deceased');

    // Revive
    const reviveRes = simService.revivePlayer(storyId);
    assert.strictEqual(reviveRes.success, true);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.isDead, false);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.currentActivity, 'idle');
  });

  it('manages player possession deterministically (CH3 Embodied Lifecycle)', () => {
    const repo = new InMemoryWorldRepository();
    const simService = new WorldSimulationService(repo);
    const storyId = 'story_possession_lifecycle';

    const player = new PlayerLifecycleState({
      actorId: `player_actor_${storyId}`,
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      lastUpdatedTime: repo.getWorldClock(storyId).getTimestamp().totalElapsedSeconds,
    });
    repo.updatePlayerLifecycle(storyId, player);

    // Record possession
    const possRes = simService.recordPlayerPossession(storyId, 'Ancient Astrolabe Spirit');
    assert.strictEqual(possRes.success, true);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.isPossessed, true);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.possessionRecord?.entityName, 'Ancient Astrolabe Spirit');

    // Release possession
    const relRes = simService.releasePlayerPossession(storyId);
    assert.strictEqual(relRes.success, true);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.isPossessed, false);
    assert.strictEqual(repo.getPlayerLifecycle(storyId)!.possessionRecord, null);
  });
});
