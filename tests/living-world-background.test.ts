/**
 * Dedicated Milestone 5 Test Suite: Living World Simulation & Background Processing
 *
 * Verifies Feature F20 (Unified Simulation Tick & Lock Decoupling) and
 * Feature F21 (Background Processing Queue with Snapshot CAS & Idempotency)
 * conforming to UNIFIED_AUDIT_RECONCILIATION.md Phase 1E and DreamBook §333, §334, §343, §355.
 *
 * 14 offline, deterministic test cases across 4 suites.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { WorldClock } from '../server/domain/worldClock';
import { TimeBudgetGovernor } from '../server/domain/timeBudgetGovernor';
import { LivingWorldEngine } from '../server/domain/livingWorldEngine';
import {
  LivingWorldSimulation,
  type DailyScheduleEntry,
  type NpcScheduleProfile,
  type ScheduledWorldEvent,
} from '../server/domain/livingWorldSimulation';
import { GeographyGraph } from '../server/domain/geographyGraph';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { BackgroundProcessingQueue } from '../server/domain/backgroundProcessingQueue';
import {
  WorldSimulatorAdjudicator,
  type WorldSimulationProposal,
  type SimulationWorldState,
} from '../server/domain/worldSimulationProposal';

describe('Milestone 5: Living World & Background Processing (F20 & F21)', () => {

  // =========================================================================
  // Suite 1: World Clock Monotonicity & Time Arithmetic Boundaries (F20)
  // =========================================================================
  describe('Suite 1: World Clock Monotonicity & Time Arithmetic Boundaries (F20)', () => {
    it('Case 1: Advance time by 0 seconds is a strict no-op with identical timestamp and day phase', () => {
      const clock = new WorldClock();
      const before = clock.getState();

      const after = clock.advanceSeconds(0);

      assert.equal(after.timestamp.totalElapsedSeconds, before.timestamp.totalElapsedSeconds);
      assert.equal(after.timestamp.year, before.timestamp.year);
      assert.equal(after.timestamp.month, before.timestamp.month);
      assert.equal(after.timestamp.day, before.timestamp.day);
      assert.equal(after.timestamp.hour, before.timestamp.hour);
      assert.equal(after.timestamp.minute, before.timestamp.minute);
      assert.equal(after.timestamp.second, before.timestamp.second);
      assert.equal(after.currentDayPhase, before.currentDayPhase);
      assert.equal(after.currentSeason, before.currentSeason);
    });

    it('Case 2: Advance time with negative or invalid seconds is clamped/rejected, enforcing strict monotonicity (t2 >= t1)', () => {
      const clock = new WorldClock();
      const t1 = clock.getTimestamp().totalElapsedSeconds;

      // Negative seconds
      clock.advanceSeconds(-3600);
      assert.equal(clock.getTimestamp().totalElapsedSeconds, t1);

      // NaN
      clock.advanceSeconds(NaN);
      assert.equal(clock.getTimestamp().totalElapsedSeconds, t1);

      // Infinity
      clock.advanceSeconds(Infinity);
      assert.equal(clock.getTimestamp().totalElapsedSeconds, t1);

      // Positive seconds advances monotonically
      clock.advanceSeconds(120);
      const t2 = clock.getTimestamp().totalElapsedSeconds;
      assert.ok(t2 >= t1, `t2 (${t2}) must be >= t1 (${t1})`);
      assert.equal(t2, t1 + 120);
    });

    it('Case 3: Multi-day massive time jump (100,000,000s) calculates month/year rollover correctly without overflow or hang', () => {
      const clock = new WorldClock();
      const initialTimestamp = clock.getTimestamp();
      const startMs = Date.now();

      // Advance by 100 million seconds (~1157 days / ~3.2 years)
      const secondsToAdvance = 100_000_000;
      const updated = clock.advanceSeconds(secondsToAdvance);
      const elapsedMs = Date.now() - startMs;

      // Ensure execution is virtually instantaneous (O(1) arithmetic, no linear loops)
      assert.ok(elapsedMs < 50, `Massive time jump took ${elapsedMs}ms, must be < 50ms`);

      assert.equal(
        updated.timestamp.totalElapsedSeconds,
        initialTimestamp.totalElapsedSeconds + secondsToAdvance
      );
      assert.ok(updated.timestamp.day >= 1 && updated.timestamp.day <= 30);
      assert.ok(updated.timestamp.month >= 1 && updated.timestamp.month <= 12);
      assert.ok(updated.timestamp.year > initialTimestamp.year);
      assert.ok(updated.timestamp.hour >= 0 && updated.timestamp.hour <= 23);
      assert.ok(updated.timestamp.minute >= 0 && updated.timestamp.minute <= 59);
      assert.ok(updated.timestamp.second >= 0 && updated.timestamp.second <= 59);
    });

    it('Case 4: Clock advance updates day phase deterministically based on hour/minute', () => {
      // Calendar day phases:
      // Predawn: 04:00 - 05:59
      // Dawn: 06:00 - 07:59
      // Morning: 08:00 - 11:59
      // Afternoon: 12:00 - 17:59
      // Dusk: 18:00 - 20:59
      // Night: 21:00 - 03:59
      const clock = new WorldClock({
        timestamp: {
          year: 42,
          month: 1,
          day: 1,
          hour: 4,
          minute: 30,
          second: 0,
          totalElapsedSeconds: (42 * 360 * 24 * 3600) + (4 * 3600) + (30 * 60),
        },
      });

      assert.equal(clock.getState().currentDayPhase, 'Predawn');

      // +2 hours -> 06:30 (Dawn)
      clock.advanceHours(2);
      assert.equal(clock.getState().currentDayPhase, 'Dawn');

      // +3 hours -> 09:30 (Morning)
      clock.advanceHours(3);
      assert.equal(clock.getState().currentDayPhase, 'Morning');

      // +4 hours -> 13:30 (Afternoon)
      clock.advanceHours(4);
      assert.equal(clock.getState().currentDayPhase, 'Afternoon');

      // +5.5 hours -> 19:00 (Dusk)
      clock.advanceMinutes(330);
      assert.equal(clock.getState().currentDayPhase, 'Dusk');

      // +3 hours -> 22:00 (Night)
      clock.advanceHours(3);
      assert.equal(clock.getState().currentDayPhase, 'Night');
    });
  });

  // =========================================================================
  // Suite 2: Unified Simulation Tick & EntityCard Authoritative State (F20)
  // =========================================================================
  describe('Suite 2: Unified Simulation Tick & EntityCard Authoritative State (F20)', () => {
    it('Case 5: Unified simulation tick executes NPC daily schedule transitions across time windows, updating EntityCard location and activity', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_sim_schedule_' + Date.now();
      repo.seedStory(storyId);

      const livingSim = repo.getLivingWorldSimulation(storyId);
      const scheduleEntries: DailyScheduleEntry[] = [
        {
          id: 'sched_morning_work',
          startHour: 8,
          endHour: 17,
          activity: 'working',
          targetLocationId: 'loc_market',
          fallbackActivity: 'idle',
        },
        {
          id: 'sched_evening_relax',
          startHour: 17,
          endHour: 22,
          activity: 'relaxing',
          targetLocationId: 'loc_tavern',
          fallbackActivity: 'sleeping',
        },
      ];

      const profile: NpcScheduleProfile = {
        npcId: 'npc_baker_01',
        name: 'Gareth the Baker',
        currentLocationId: 'loc_market',
        currentActivity: 'working',
        entries: scheduleEntries,
        fallbackActivity: 'sleeping',
        fallbackLocationId: 'loc_bakery',
      };
      livingSim.registerNpcSchedule(profile);

      // Create authoritative EntityCard co-located with player
      repo.saveEntityCard(storyId, {
        id: 'npc_baker_01',
        name: 'Gareth the Baker',
        kind: 'NPC',
        worldState: {
          locationId: 'loc_market',
          currentActivity: 'working',
          isAlive: true,
          presence: 'present',
        },
        lifecycle: {
          status: 'ACTIVE',
        },
      });

      // Set player location to loc_market
      const player = repo.getPlayerLifecycle(storyId);
      if (player) {
        const movedPlayer = player.copyWith({ locationId: 'loc_market' });
        repo.updatePlayerLifecycle(storyId, movedPlayer);
      }

      // Set clock to 16:55 (still within working window 8-17)
      const clock = repo.getWorldClock(storyId);
      clock.importState({
        calendarSystemId: 'astral_standard',
        timestamp: {
          year: 42,
          month: 10,
          day: 14,
          hour: 16,
          minute: 55,
          second: 0,
          totalElapsedSeconds: 1000000,
        },
        timeScale: 1.0,
        currentSeason: 'Autumn',
        currentDayPhase: 'Afternoon',
        timezoneOrRegion: 'Upper Spire',
      });

      // Tick turn with 10 minutes (600s), crossing into 17:05 (relaxing window)
      const tickResult = LivingWorldEngine.tickTurn(repo, {
        storyId,
        explicitSeconds: 600,
      });

      assert.equal(tickResult.success, true);
      assert.equal(tickResult.elapsedSeconds, 600);
      assert.equal(tickResult.currentTimestamp.hour, 17);
      assert.equal(tickResult.currentTimestamp.minute, 5);

      // Verify EntityCard updated authoritatively
      const updatedCard = repo.getEntityCard(storyId, 'npc_baker_01');
      assert.ok(updatedCard);
      assert.equal(updatedCard.worldState.currentActivity, 'relaxing');

      // Verify commit records emitted
      const activityCommit = tickResult.commitRecords.find((r) => r.kind === 'ENTITY_ACTIVITY_UPDATE');
      assert.ok(activityCommit);
      assert.equal(activityCommit.targetId, 'npc_baker_01');
    });

    it('Case 6: Simulation tier partitioning distinguishes ACTIVE, NEARBY, DISTANT, and OFF_SCREEN', () => {
      const geo = new GeographyGraph();
      geo.addNode({ id: 'loc_office', name: 'Office', isDiscovered: true });
      geo.addNode({ id: 'loc_street', name: 'Street', isDiscovered: true });
      geo.addNode({ id: 'loc_docks', name: 'Docks', isDiscovered: true });
      geo.addNode({ id: 'loc_hidden_island', name: 'Hidden Island', isDiscovered: true });

      // Connect office <-> street (direct edge)
      geo.addEdge({
        id: 'e_off_str',
        fromLocationId: 'loc_office',
        toLocationId: 'loc_street',
        distanceKm: 0.5,
        terrain: 'URBAN_PAVED',
        allowedModes: ['Foot'],
        hazardRisk: 0,
        isBlocked: false,
        provenance: 'AUTHORED',
      });
      // Connect street <-> docks (multi-hop from office)
      geo.addEdge({
        id: 'e_str_doc',
        fromLocationId: 'loc_street',
        toLocationId: 'loc_docks',
        distanceKm: 2.0,
        terrain: 'URBAN_PAVED',
        allowedModes: ['Foot'],
        hazardRisk: 0,
        isBlocked: false,
        provenance: 'AUTHORED',
      });
      // loc_hidden_island has no edges (disconnected)

      const sim = new LivingWorldSimulation();

      // 1. ACTIVE: co-located with player
      assert.equal(sim.evaluateSimulationTier('loc_office', 'loc_office', geo), 'ACTIVE');

      // 2. NEARBY: 1-hop direct unblocked route edge
      assert.equal(sim.evaluateSimulationTier('loc_street', 'loc_office', geo), 'NEARBY');

      // 3. DISTANT: multi-hop reachable path
      assert.equal(sim.evaluateSimulationTier('loc_docks', 'loc_office', geo), 'DISTANT');

      // 4. OFF_SCREEN: disconnected or unreachable
      assert.equal(sim.evaluateSimulationTier('loc_hidden_island', 'loc_office', geo), 'OFF_SCREEN');
    });

    it('Case 7: Scheduled world event triggers when clock reaches trigger timestamp; expires to missed with consequence summary when deadline passes', () => {
      const sim = new LivingWorldSimulation();
      const baseSeconds = 10000;

      const eventA: ScheduledWorldEvent = {
        id: 'evt_festival',
        kind: 'MARKET_DAY',
        name: 'Solstice Market Festival',
        locationId: 'loc_plaza',
        triggerTimestamp: { year: 42, month: 1, day: 1, hour: 10, minute: 0, second: 0, totalElapsedSeconds: baseSeconds + 500 },
        deadlineTimestamp: { year: 42, month: 1, day: 1, hour: 18, minute: 0, second: 0, totalElapsedSeconds: baseSeconds + 2000 },
        isResolved: false,
        status: 'pending',
      };

      const eventB: ScheduledWorldEvent = {
        id: 'evt_eclipse',
        kind: 'ASTRONOMICAL_SUNRISE',
        name: 'Brief Eclipse Window',
        locationId: 'loc_spire',
        triggerTimestamp: { year: 42, month: 1, day: 1, hour: 10, minute: 0, second: 0, totalElapsedSeconds: baseSeconds + 500 },
        deadlineTimestamp: { year: 42, month: 1, day: 1, hour: 11, minute: 0, second: 0, totalElapsedSeconds: baseSeconds + 800 },
        isResolved: false,
        status: 'pending',
      };

      sim.scheduleEvent(eventA);
      sim.scheduleEvent(eventB);

      // Phase 1: At baseSeconds + 600, both trigger to 'active'
      const clockPhase1 = { year: 42, month: 1, day: 1, hour: 10, minute: 10, second: 0, totalElapsedSeconds: baseSeconds + 600 };
      const res1 = sim.evaluateScheduledEvents(clockPhase1);
      assert.equal(res1.triggeredEvents.length, 2);
      assert.equal(res1.missedEvents.length, 0);

      // Phase 2: At baseSeconds + 1000, eventB has passed deadline (+800), eventA still within deadline (+2000)
      const clockPhase2 = { year: 42, month: 1, day: 1, hour: 11, minute: 30, second: 0, totalElapsedSeconds: baseSeconds + 1000 };
      const res2 = sim.evaluateScheduledEvents(clockPhase2);
      assert.equal(res2.missedEvents.length, 1);
      assert.equal(res2.missedEvents[0].id, 'evt_eclipse');
      assert.equal(res2.missedEvents[0].status, 'missed');
      assert.equal(res2.missedEvents[0].isResolved, true);
      assert.ok(res2.missedEvents[0].consequenceSummary?.includes('deadline passed'));

      const allEvents = sim.getScheduledEvents();
      const updatedA = allEvents.find((e) => e.id === 'evt_festival');
      assert.equal(updatedA?.status, 'active');
      assert.equal(updatedA?.isResolved, false);
    });
  });

  // =========================================================================
  // Suite 3: Background Processing Queue Contract & Idempotency (F21)
  // =========================================================================
  describe('Suite 3: Background Processing Queue Contract & Idempotency (F21)', () => {
    it('Case 8: Background job queue processes tasks in priority and FIFO order with asynchronous execution', async () => {
      const queue = new BackgroundProcessingQueue({ maxQueueSize: 20 });
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_queue_prio_' + Date.now();
      repo.seedStory(storyId);

      // Enqueue with varying priorities and timestamps
      queue.enqueue({ id: 'job_low', storyId, idempotencyKey: 'k_low', priority: 'LOW' });
      queue.enqueue({ id: 'job_crit_1', storyId, idempotencyKey: 'k_crit_1', priority: 'CRITICAL' });
      queue.enqueue({ id: 'job_norm', storyId, idempotencyKey: 'k_norm', priority: 'NORMAL' });
      queue.enqueue({ id: 'job_high', storyId, idempotencyKey: 'k_high', priority: 'HIGH' });
      queue.enqueue({ id: 'job_crit_2', storyId, idempotencyKey: 'k_crit_2', priority: 'CRITICAL' });

      assert.equal(queue.getPendingCount(), 5);

      const processedOrder: string[] = [];
      const drainResults = await queue.drain(repo, async (job) => {
        processedOrder.push(job.id);
        return null as any;
      });

      // Priority ordering: CRITICAL (1st), CRITICAL (2nd), HIGH, NORMAL, LOW
      assert.deepEqual(processedOrder, ['job_crit_1', 'job_crit_2', 'job_high', 'job_norm', 'job_low']);
      assert.equal(drainResults.length, 5);
      assert.equal(queue.getPendingCount(), 0);
    });

    it('Case 9: Idempotency key deduplication rejects duplicate background job submission (DUPLICATE_JOB_REJECTED) without duplicate side effects', () => {
      const queue = new BackgroundProcessingQueue();
      const idempotencyKey = 'idemp_unique_task_99';

      const firstRes = queue.enqueue({
        id: 'job_original',
        storyId: 'story_idemp',
        idempotencyKey,
        priority: 'NORMAL',
      });
      assert.equal(firstRes.enqueued, true);
      assert.equal(firstRes.success, true);
      assert.equal(queue.size(), 1);

      // Duplicate submission with identical idempotencyKey
      const dupRes = queue.enqueue({
        id: 'job_duplicate',
        storyId: 'story_idemp',
        idempotencyKey,
        priority: 'HIGH',
      });
      assert.equal(dupRes.enqueued, false);
      assert.equal(dupRes.success, false);
      assert.equal(dupRes.code, 'DUPLICATE_JOB_REJECTED');
      assert.equal(dupRes.error, 'IDEMPOTENCY_DUPLICATE_IGNORED');

      // Queue length remains 1; duplicate was rejected without side effects
      assert.equal(queue.size(), 1);
      assert.equal(queue.getJob('job_original')?.priority, 'NORMAL');
    });

    it('Case 10: Bounded queue capacity enforces upper limit and rejects enqueue when full (QUEUE_OVERFLOW_REJECTED)', () => {
      const maxQueueSize = 3;
      const queue = new BackgroundProcessingQueue({ maxQueueSize });

      for (let i = 1; i <= maxQueueSize; i++) {
        const res = queue.enqueue({
          id: `job_${i}`,
          storyId: 'story_bounded',
          idempotencyKey: `k_bound_${i}`,
          priority: 'NORMAL',
        });
        assert.equal(res.enqueued, true);
      }
      assert.equal(queue.getPendingCount(), 3);

      // Attempting to enqueue beyond upper limit
      const overflowRes = queue.enqueue({
        id: 'job_overflow',
        storyId: 'story_bounded',
        idempotencyKey: 'k_bound_overflow',
        priority: 'CRITICAL',
      });

      assert.equal(overflowRes.enqueued, false);
      assert.equal(overflowRes.success, false);
      assert.equal(overflowRes.code, 'QUEUE_OVERFLOW_REJECTED');
      assert.equal(queue.getPendingCount(), 3);
    });
  });

  // =========================================================================
  // Suite 4: Snapshot CAS & Concurrency Isolation (F21)
  // =========================================================================
  describe('Suite 4: Snapshot CAS & Concurrency Isolation (F21)', () => {
    it('Case 11: Background job proposal with stale snapshot (worldVersion mismatch) is rejected with STALE_PROPOSAL_REJECTED', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_cas_stale_' + Date.now();
      repo.seedStory(storyId);

      // Set worldVersion to 5
      repo.saveStoryRun({ id: storyId, storyId, worldVersion: 5 });
      assert.equal(repo.getWorldVersion(storyId), 5);

      const queue = repo.getBackgroundProcessingQueue(storyId);
      const currentHash = repo.getCanonicalStateHash(storyId);

      // Proposal prepared against obsolete worldVersion 4
      const staleProposal: WorldSimulationProposal = {
        proposalId: 'prop_stale_11',
        idempotencyKey: 'idemp_stale_11',
        worldVersion: 4,
        baseStateHash: currentHash,
        proposedStateTransition: {
          type: 'DISTANT_WEATHER_SHIFT',
          payload: { rain: true },
        },
        requiredPreconditions: [],
        provenance: { source: 'MODEL_PROPOSED', timestamp: new Date().toISOString() },
        safeFallback: { message: 'Weather remains unchanged.' },
      };

      queue.enqueue({
        id: 'job_stale_11',
        storyId,
        idempotencyKey: 'idemp_stale_11',
        proposal: staleProposal,
      });

      const res = await queue.processNext(repo);
      assert.ok(res);
      assert.equal(res.success, false);
      assert.equal(res.code, 'STALE_PROPOSAL_REJECTED');
      assert.equal(res.status, 'REJECTED_STALE');

      // Canonical worldVersion must remain intact at 5
      assert.equal(repo.getWorldVersion(storyId), 5);
    });

    it('Case 12: Base state hash divergence is rejected even if worldVersion superficially matches, preventing ABA hazards', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_aba_hazard_' + Date.now();
      repo.seedStory(storyId);

      repo.saveStoryRun({ id: storyId, storyId, worldVersion: 3 });
      const queue = repo.getBackgroundProcessingQueue(storyId);

      // Proposal has matching version (3), but mismatched stateHash (e.g. from altered state slice)
      const divergedProposal: WorldSimulationProposal = {
        proposalId: 'prop_diverged_hash_12',
        idempotencyKey: 'idemp_diverged_hash_12',
        worldVersion: 3,
        baseStateHash: 'f00d_dead_diverged_hash',
        proposedStateTransition: {
          type: 'MOMENTUM_ADVANCE',
          payload: { momentum: 50 },
        },
        requiredPreconditions: [],
        provenance: { source: 'MODEL_PROPOSED', timestamp: new Date().toISOString() },
        safeFallback: { message: 'Momentum advance rejected due to state hash divergence.' },
      };

      queue.enqueue({
        id: 'job_diverged_12',
        storyId,
        idempotencyKey: 'idemp_diverged_hash_12',
        proposal: divergedProposal,
      });

      const res = await queue.processNext(repo);
      assert.ok(res);
      assert.equal(res.success, false);
      assert.equal(res.code, 'STALE_PROPOSAL_REJECTED');
      assert.ok(res.message.includes('base hash mismatch'));
    });

    it('Case 13: Concurrent execution: Foreground player mutation and background job commit race safely via CAS, preserving canonical state integrity', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_race_cas_' + Date.now();
      repo.seedStory(storyId);

      const queue = repo.getBackgroundProcessingQueue(storyId);
      const v1 = repo.getWorldVersion(storyId);
      const hash1 = repo.getCanonicalStateHash(storyId);

      // Background worker captures snapshot at v1 and begins async computation
      const backgroundProposal: WorldSimulationProposal = {
        proposalId: 'prop_bg_race',
        idempotencyKey: 'idemp_bg_race',
        worldVersion: v1,
        baseStateHash: hash1,
        proposedStateTransition: {
          type: 'DISTANT_SIMULATION',
          payload: { distantNpcRepositioned: true, locationId: 'loc_docks' },
        },
        requiredPreconditions: [],
        provenance: { source: 'MODEL_PROPOSED', timestamp: new Date().toISOString() },
        safeFallback: { message: 'Distant NPC remains in prior location.' },
      };

      queue.enqueue({
        id: 'job_race_13',
        storyId,
        idempotencyKey: 'idemp_bg_race',
        proposal: backgroundProposal,
      });

      // While background job was computing, foreground player action commits:
      // Player travels, advances time, and mutates inventory -> worldVersion advances to v2!
      repo.incrementWorldVersion(storyId);
      const v2 = repo.getWorldVersion(storyId);
      assert.equal(v2, v1 + 1);

      // Now background worker attempts to commit its v1 proposal
      const raceResult = await queue.processNext(repo);
      assert.ok(raceResult);
      assert.equal(raceResult.success, false);
      assert.equal(raceResult.code, 'STALE_PROPOSAL_REJECTED');

      // Canonical state is preserved at v2; stale background proposal was safely rejected
      assert.equal(repo.getWorldVersion(storyId), v2);
    });

    it('Case 14: Stale proposal triggers deterministic safe fallback without mutating canonical store or crashing worker', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_safe_fallback_' + Date.now();
      repo.seedStory(storyId);

      const queue = repo.getBackgroundProcessingQueue(storyId);
      repo.setSimulationStateSlice(storyId, { canonicalFlag: 'UNTOUCHED_ORIGINAL' });

      const staleProposal: WorldSimulationProposal = {
        proposalId: 'prop_fallback_14',
        idempotencyKey: 'idemp_fallback_14',
        worldVersion: 999, // Intentional mismatch
        baseStateHash: 'invalid_hash',
        proposedStateTransition: {
          type: 'DESTRUCTIVE_OVERWRITE',
          payload: { canonicalFlag: 'CORRUPTED_OVERWRITE' },
        },
        requiredPreconditions: [],
        provenance: { source: 'MODEL_PROPOSED', timestamp: new Date().toISOString() },
        safeFallback: {
          message: 'Safe deterministic fallback: proposal rejected, retaining canonical state.',
        },
      };

      queue.enqueue({
        id: 'job_fallback_14',
        storyId,
        idempotencyKey: 'idemp_fallback_14',
        proposal: staleProposal,
      });

      const res = await queue.processNext(repo);
      assert.ok(res);
      assert.equal(res.success, false);
      assert.equal(res.code, 'STALE_PROPOSAL_REJECTED');

      // Verify canonical state was NOT mutated
      const slice = repo.getSimulationStateSlice(storyId);
      assert.equal(slice.canonicalFlag, 'UNTOUCHED_ORIGINAL');

      // Verify subsequent valid proposal matching current state commits cleanly
      const currentVersion = repo.getWorldVersion(storyId);
      const currentHash = repo.getCanonicalStateHash(storyId);
      const validProposal: WorldSimulationProposal = {
        proposalId: 'prop_valid_subsequent_14',
        idempotencyKey: 'idemp_valid_14',
        worldVersion: currentVersion,
        baseStateHash: currentHash,
        proposedStateTransition: {
          type: 'VALID_MOMENTUM_COMMIT',
          payload: { canonicalFlag: 'AUTHORITATIVE_UPDATE' },
        },
        requiredPreconditions: [],
        provenance: { source: 'DETERMINISTIC_ARCHETYPE', timestamp: new Date().toISOString() },
        safeFallback: { message: 'Fallback.' },
      };

      queue.enqueue({
        id: 'job_valid_14',
        storyId,
        idempotencyKey: 'idemp_valid_14',
        proposal: validProposal,
      });

      const validRes = await queue.processNext(repo);
      assert.ok(validRes);
      assert.equal(validRes.success, true);
      assert.equal(validRes.code, 'PROPOSAL_COMMITTED');

      // Canonical state reflects the valid commit
      const updatedSlice = repo.getSimulationStateSlice(storyId);
      assert.equal(updatedSlice.canonicalFlag, 'AUTHORITATIVE_UPDATE');
      assert.equal(repo.getWorldVersion(storyId), currentVersion + 1);
    });
  });
});
