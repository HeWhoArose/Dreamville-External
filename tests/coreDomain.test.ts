import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WorldClock } from '../server/domain/worldClock';
import { GeographyGraph, TERRAIN_TIME_MODIFIERS, DEFAULT_SPEED_KM_PER_HOUR } from '../server/domain/geographyGraph';
import { livingBibleRegistry } from '../server/domain/livingBible';

describe('WorldClock Domain Simulation', () => {
  it('initializes with canonical default timestamp and derives day phase and season', () => {
    const clock = new WorldClock();
    const state = clock.getState();

    assert.strictEqual(state.timestamp.year, 42);
    assert.strictEqual(state.timestamp.month, 10);
    assert.strictEqual(state.timestamp.day, 14);
    assert.strictEqual(state.timestamp.hour, 17);
    assert.strictEqual(state.timestamp.minute, 42);
    assert.strictEqual(state.currentDayPhase, 'Afternoon');
    assert.strictEqual(state.currentSeason, 'Autumn');
  });

  it('correctly maps hour and minute to DayPhase', () => {
    assert.strictEqual(WorldClock.deriveDayPhase(5, 0), 'Predawn');
    assert.strictEqual(WorldClock.deriveDayPhase(6, 30), 'Dawn');
    assert.strictEqual(WorldClock.deriveDayPhase(9, 15), 'Morning');
    assert.strictEqual(WorldClock.deriveDayPhase(14, 0), 'Afternoon');
    assert.strictEqual(WorldClock.deriveDayPhase(19, 30), 'Dusk');
    assert.strictEqual(WorldClock.deriveDayPhase(23, 0), 'Night');
  });

  it('advances world time deterministically by seconds, minutes, hours, and days', () => {
    const clock = new WorldClock();
    const initialElapsed = clock.getTimestamp().totalElapsedSeconds;

    clock.advanceMinutes(30); // 17:42 -> 18:12 (Dusk)
    assert.strictEqual(clock.getTimestamp().hour, 18);
    assert.strictEqual(clock.getTimestamp().minute, 12);
    assert.strictEqual(clock.getState().currentDayPhase, 'Dusk');
    assert.strictEqual(clock.getTimestamp().totalElapsedSeconds, initialElapsed + 1800);

    clock.advanceDays(2); // 14 -> 16
    assert.strictEqual(clock.getTimestamp().day, 16);
    assert.strictEqual(clock.getTimestamp().month, 10);
  });

  it('computes deterministic countdowns from canonical timestamps (DreamBook §336)', () => {
    const clock = new WorldClock();
    const now = clock.getTimestamp();

    // Target is 3 days, 2 hours ahead
    const targetTimestamp = {
      ...now,
      day: now.day + 3,
      hour: now.hour + 2,
      totalElapsedSeconds: now.totalElapsedSeconds + (3 * 86400) + (2 * 3600),
    };

    const countdown = clock.computeCountdown(targetTimestamp);
    assert.strictEqual(countdown.expired, false);
    assert.strictEqual(countdown.remainingSeconds, 3 * 86400 + 2 * 3600);
    assert.ok(countdown.formatted.includes('3d 2h'));
  });
});

describe('GeographyGraph Spatial Topology & Routing', () => {
  it('contains seeded Dreamville canonical locations and traversable routes', () => {
    const graph = new GeographyGraph();
    const orrery = graph.getNode('loc_whispering_orrery');
    const vault = graph.getNode('loc_lantern_vault');

    assert.ok(orrery);
    assert.strictEqual(orrery.name, 'The Whispering Orrery');
    assert.ok(vault);
    assert.strictEqual(vault.name, 'The Lantern Vault');
  });

  it('calculates deterministic travel duration based on distance, terrain, and mode (DreamBook §338)', () => {
    const graph = new GeographyGraph();
    const outgoing = graph.getOutgoingEdges('loc_whispering_orrery');
    const edgeToVault = outgoing.find((e) => e.toLocationId === 'loc_lantern_vault')!;

    assert.ok(edgeToVault);
    assert.strictEqual(edgeToVault.distanceKm, 8.5);
    assert.strictEqual(edgeToVault.terrain, 'Trail');

    // Trail modifier = 1.2, Foot speed = 4.5 km/h
    // durationHours = (8.5 / 4.5) * 1.2 = 2.2667 hours = 8160 seconds
    const durationSeconds = graph.calculateEdgeDurationSeconds(edgeToVault, 'Foot');
    assert.strictEqual(durationSeconds, Math.round((8.5 / 4.5) * 1.2 * 3600));

    // Horse travel is faster
    const horseDurationSeconds = graph.calculateEdgeDurationSeconds(edgeToVault, 'Horse');
    assert.ok(horseDurationSeconds < durationSeconds);
  });

  it('finds valid path between connected locations and rejects blocked paths', () => {
    const graph = new GeographyGraph();

    // Valid path between Orrery and Vault
    const path = graph.findPath('loc_whispering_orrery', 'loc_lantern_vault', 'Foot');
    assert.strictEqual(path.found, true);
    assert.deepStrictEqual(path.routeLocationIds, ['loc_whispering_orrery', 'loc_lantern_vault']);
    assert.ok(path.totalDistanceKm > 0);

    // Blocked path (Glasswood Verge is blocked by Chancery Border Edict)
    const blockedPath = graph.findPath('loc_whispering_orrery', 'loc_glasswood_verge', 'Foot');
    assert.strictEqual(blockedPath.found, false);
  });
});

describe('Living Bible Operational Registry', () => {
  it('exposes all Core DreamBook challenges with verification evidence', () => {
    const all = livingBibleRegistry.getAllRequirements();
    assert.ok(all.length >= 12);

    const ch1Authority = livingBibleRegistry.getRequirement('CH1.AUTHORITY');
    assert.ok(ch1Authority);
    assert.strictEqual(ch1Authority.status, 'VERIFIED');

    const workstation = livingBibleRegistry.getWorkstationState();
    assert.ok(workstation.counts.verified >= 4);
    assert.ok(workstation.iterationHistory.length >= 2);
  });
});
