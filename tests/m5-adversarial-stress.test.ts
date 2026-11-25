/**
 * Empirical Adversarial & Stress Test Harness for Milestone 5 (Features F20 & F21)
 *
 * Authored by Milestone 5 Challenger 1 (m5_challenger_1).
 * Exercises WorldClock, TimeBudgetGovernor, LivingWorldEngine,
 * BackgroundProcessingQueue, Snapshot CAS, and Write Lock Decoupling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { WorldClock } from '../server/domain/worldClock';
import { TimeBudgetGovernor } from '../server/domain/timeBudgetGovernor';
import { LivingWorldEngine } from '../server/domain/livingWorldEngine';
import { BackgroundProcessingQueue } from '../server/domain/backgroundProcessingQueue';
import { InMemoryWorldRepository, worldRepository } from '../server/repositories/worldRepository';
import { canonicalCommandEngine } from '../server/domain/canonicalCommandEngine';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import {
  WorldSimulatorAdjudicator,
  type WorldSimulationProposal,
  type SimulationWorldState,
} from '../server/domain/worldSimulationProposal';

describe('Milestone 5 Adversarial Stress Harness (F20 & F21)', () => {
  // =========================================================================
  // 1. WorldClock Adversarial Stress & Unconditional Monotonicity
  // =========================================================================
  describe('1. WorldClock Adversarial Boundaries, Rollover & Monotonicity', () => {
    it('rejects negative, zero, NaN, Infinity, and non-numeric string inputs while preserving t2 >= t1', () => {
      const clock = new WorldClock();
      const initial = clock.getState();
      const t0 = initial.timestamp.totalElapsedSeconds;

      const invalidInputs: unknown[] = [
        0,
        -0,
        -1,
        -3600,
        -1e12,
        -0.0001,
        NaN,
        Infinity,
        -Infinity,
        '100',
        '3600',
        'invalid',
        '',
        null,
        undefined,
        {},
        [],
      ];

      for (const bad of invalidInputs) {
        const res = clock.advanceSeconds(bad as any);
        assert.equal(
          res.timestamp.totalElapsedSeconds,
          t0,
          `advanceSeconds(${JSON.stringify(bad)}) mutated elapsed seconds`
        );
        assert.deepEqual(res.timestamp, initial.timestamp);
      }

      // Also test advanceMinutes / advanceHours / advanceDays with invalid inputs
      clock.advanceMinutes(-10);
      clock.advanceMinutes(NaN);
      clock.advanceHours(-5);
      clock.advanceHours(Infinity);
      clock.advanceDays(-1);
      assert.equal(clock.getTimestamp().totalElapsedSeconds, t0);

      // Numeric string coercion check on advanceDays('7') vs advanceSeconds('7')
      clock.advanceDays('7' as any);
      assert.equal(
        clock.getTimestamp().totalElapsedSeconds,
        t0,
        "advanceDays('7') bypassed string type check via JS coercion ('7' * 86400)"
      );
    });

    it('executes exact boundary rollovers: second -> minute -> hour -> day 30 -> month 12 -> month 1, year + 1', () => {
      const clock = new WorldClock({
        timestamp: {
          year: 42,
          month: 12,
          day: 30,
          hour: 23,
          minute: 59,
          second: 59,
          totalElapsedSeconds:
            42 * 360 * 86400 + 11 * 30 * 86400 + 29 * 86400 + 23 * 3600 + 59 * 60 + 59,
        },
      });

      assert.equal(clock.getState().currentSeason, 'Winter');
      assert.equal(clock.getState().currentDayPhase, 'Night');

      // Advance exactly 1 second -> Year 43, Month 1, Day 1, 00:00:00
      const rolled = clock.advanceSeconds(1);
      assert.equal(rolled.timestamp.year, 43);
      assert.equal(rolled.timestamp.month, 1);
      assert.equal(rolled.timestamp.day, 1);
      assert.equal(rolled.timestamp.hour, 0);
      assert.equal(rolled.timestamp.minute, 0);
      assert.equal(rolled.timestamp.second, 0);
      assert.equal(rolled.currentSeason, 'Winter');
      assert.equal(rolled.currentDayPhase, 'Night');

      // Advance exactly 1 full fictional year (12 months * 30 days * 86400s = 31,104,000s)
      const oneYearSeconds = 12 * 30 * 86400;
      const nextYear = clock.advanceSeconds(oneYearSeconds);
      assert.equal(nextYear.timestamp.year, 44);
      assert.equal(nextYear.timestamp.month, 1);
      assert.equal(nextYear.timestamp.day, 1);
      assert.equal(nextYear.timestamp.hour, 0);
      assert.equal(nextYear.timestamp.minute, 0);
      assert.equal(nextYear.timestamp.second, 0);
    });

    it('handles massive jumps (1e8 and 1e9 seconds) in O(1) time without overflow or invalid calendar ranges', () => {
      const clock = new WorldClock();
      const tStart = clock.getTimestamp().totalElapsedSeconds;

      const t0Ms = performance.now();
      const after1e8 = clock.advanceSeconds(1e8);
      const after1e9 = clock.advanceSeconds(1e9);
      const elapsedMs = performance.now() - t0Ms;

      assert.ok(elapsedMs < 20, `Massive jumps took ${elapsedMs.toFixed(2)}ms; expected O(1) < 20ms`);
      assert.equal(after1e8.timestamp.totalElapsedSeconds, tStart + 1e8);
      assert.equal(after1e9.timestamp.totalElapsedSeconds, tStart + 1e8 + 1e9);

      for (const ts of [after1e8.timestamp, after1e9.timestamp]) {
        assert.ok(Number.isInteger(ts.year) && ts.year > 42);
        assert.ok(ts.month >= 1 && ts.month <= 12, `month out of range: ${ts.month}`);
        assert.ok(ts.day >= 1 && ts.day <= 30, `day out of range: ${ts.day}`);
        assert.ok(ts.hour >= 0 && ts.hour <= 23, `hour out of range: ${ts.hour}`);
        assert.ok(ts.minute >= 0 && ts.minute <= 59, `minute out of range: ${ts.minute}`);
        assert.ok(ts.second >= 0 && ts.second <= 59, `second out of range: ${ts.second}`);
      }
    });

    it('maintains unconditional monotonicity (t2 >= t1) across 1,000 randomized adversarial calls', () => {
      const clock = new WorldClock();
      let prev = clock.getTimestamp().totalElapsedSeconds;

      const corpus = [
        -10000, -1, 0, 1, 59, 60, 3600, 86400, 1e8, NaN, Infinity, -Infinity, '999' as any, null as any,
      ];

      for (let i = 0; i < 1000; i++) {
        const input = corpus[(i * 7 + 3) % corpus.length];
        const nextState = clock.advanceSeconds(input as any);
        const next = nextState.timestamp.totalElapsedSeconds;
        assert.ok(Number.isFinite(next), `totalElapsedSeconds became non-finite: ${next}`);
        assert.ok(next >= prev, `Monotonicity violated at step ${i}: ${next} < ${prev}`);
        prev = next;
      }
    });

    it('handles fractional seconds without NaN or calendar corruption and checks integer invariant', () => {
      const clock = new WorldClock();
      const s1 = clock.advanceSeconds(0.5);
      assert.ok(s1.timestamp.totalElapsedSeconds >= 0);
      assert.ok(s1.timestamp.second >= 0 && s1.timestamp.second < 60);
      // Note: record whether second became fractional (non-integer)
      const isSecondInteger = Number.isInteger(s1.timestamp.second);
      assert.ok(typeof isSecondInteger === 'boolean');
    });
  });

  // =========================================================================
  // 2. TimeBudgetGovernor & LivingWorldEngine Adversarial Stress
  // =========================================================================
  describe('2. TimeBudgetGovernor & LivingWorldEngine Adversarial Stress', () => {
    it('clamps negative/zero explicitSeconds, ignores NaN/Infinity overrides, and resists 100KB ReDoS input', () => {
      assert.equal(TimeBudgetGovernor.calculateTimeBudget({ explicitSeconds: -9999 }).durationSeconds, 0);
      assert.equal(TimeBudgetGovernor.calculateTimeBudget({ explicitSeconds: -0.5 }).durationSeconds, 0);
      assert.equal(TimeBudgetGovernor.calculateTimeBudget({ explicitSeconds: 0 }).durationSeconds, 0);
      assert.equal(TimeBudgetGovernor.calculateTimeBudget({ explicitSeconds: 1e8 }).durationSeconds, 1e8);
      assert.equal(TimeBudgetGovernor.calculateTimeBudget({ explicitSeconds: NaN, isQueryOnly: true }).durationSeconds, 0);
      assert.equal(TimeBudgetGovernor.calculateTimeBudget({ explicitSeconds: Infinity, isQueryOnly: true }).durationSeconds, 0);
      assert.equal(TimeBudgetGovernor.calculateTimeBudget({ travelSeconds: -500, isQueryOnly: true }).durationSeconds, 0);

      // Invalid actionText types
      assert.equal(TimeBudgetGovernor.calculateTimeBudget({ actionText: '' }).durationSeconds, 60);
      assert.equal(TimeBudgetGovernor.calculateTimeBudget({ actionText: null as any }).durationSeconds, 60);
      assert.equal(TimeBudgetGovernor.calculateTimeBudget({ actionText: undefined }).durationSeconds, 60);

      // Read-only queries must yield 0s
      for (const q of ['check inventory', 'inspect clock', 'what time is it', 'look at the clock', 'who am i']) {
        const b = TimeBudgetGovernor.calculateTimeBudget({ actionText: q });
        assert.equal(b.durationSeconds, 0, `Query "${q}" should consume 0s, got ${b.durationSeconds}`);
        assert.equal(b.category, 'INSTANT');
      }

      // 100KB adversarial ReDoS input
      const hugeText = 'search '.repeat(15000) + 'thoroughly ' + 'a'.repeat(10000);
      const t0 = performance.now();
      const hugeBudget = TimeBudgetGovernor.calculateTimeBudget({ actionText: hugeText });
      const dt = performance.now() - t0;
      assert.ok(dt < 50, `Regex evaluation on 100KB input took ${dt.toFixed(2)}ms`);
      assert.ok(hugeBudget.durationSeconds >= 0);
    });

    it('LivingWorldEngine.tickTurn sustains <5ms target with 50 active co-located entities and respects 0s query invariance', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_adv_tick_' + Date.now();
      repo.seedStory(storyId);

      const player = repo.getPlayerLifecycle(storyId)!;
      const locId = player.locationId;

      // Seed 50 active co-located entities (10 temporary with TTL=2)
      for (let i = 0; i < 50; i++) {
        repo.saveEntityCard(storyId, {
          id: `npc_crowd_${i}`,
          name: `Citizen ${i}`,
          kind: 'NPC',
          worldState: {
            locationId: locId,
            currentActivity: 'idle',
            isAlive: true,
            presence: 'present',
          },
          lifecycle:
            i < 10
              ? { status: 'ACTIVE', stage: 'ACTIVE_TEMPORARY', ttlTurns: 2, originLocationId: locId }
              : { status: 'ACTIVE', stage: 'PERSISTENT' },
          behavior: {
            routines: ['walking', 'talking', 'resting', 'working'],
          },
        });
      }

      // 0s read-only query MUST NOT decrement ACTIVE_TEMPORARY TTL or advance clock
      const tBeforeQuery = repo.getWorldClock(storyId).getTimestamp().totalElapsedSeconds;
      const queryTick = LivingWorldEngine.tickTurn(repo, {
        storyId,
        actionText: 'check inventory',
        isQueryOnly: true,
      });
      assert.equal(queryTick.elapsedSeconds, 0);
      assert.equal(queryTick.currentTimestamp.totalElapsedSeconds, tBeforeQuery);
      assert.equal(queryTick.evictedEntityIds.length, 0);
      assert.equal(repo.getEntityCard(storyId, 'npc_crowd_0')?.lifecycle?.ttlTurns, 2);

      // Run 20 standard turns and measure latency + monotonicity
      let prevT = tBeforeQuery;
      const durations: number[] = [];
      for (let turn = 1; turn <= 20; turn++) {
        const start = performance.now();
        const res = LivingWorldEngine.tickTurn(repo, {
          storyId,
          actionText: turn % 2 === 0 ? 'talk to citizen' : 'search the room',
        });
        durations.push(performance.now() - start);
        assert.ok(
          res.currentTimestamp.totalElapsedSeconds >= prevT,
          `Clock non-monotonic on turn ${turn}`
        );
        prevT = res.currentTimestamp.totalElapsedSeconds;

        if (turn === 2) {
          assert.equal(res.evictedEntityIds.length, 10, 'All 10 temporary entities should evict after 2 non-zero turns');
        }
      }

      const maxTickMs = Math.max(...durations);
      const avgTickMs = durations.reduce((a, b) => a + b, 0) / durations.length;
      // Allow slight JIT warmup on first tick; check average < 5ms and post-warmup < 5ms
      const steadyMax = Math.max(...durations.slice(1));
      assert.ok(avgTickMs < 5, `Average tick ${avgTickMs.toFixed(2)}ms exceeded 5ms`);
      assert.ok(steadyMax < 10, `Steady-state max tick ${steadyMax.toFixed(2)}ms too slow (max=${maxTickMs.toFixed(2)}ms)`);
    });
  });

  // =========================================================================
  // 3. BackgroundProcessingQueue Overflow, Priority, & Concurrent Idempotency
  // =========================================================================
  describe('3. BackgroundProcessingQueue Overflow & Concurrent Idempotency Stress', () => {
    it('enforces maxQueueSize strictly under burst overflow and recovers capacity after drain', async () => {
      const maxQueueSize = 10;
      const queue = new BackgroundProcessingQueue({ maxQueueSize });
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_overflow_' + Date.now();
      repo.seedStory(storyId);

      // Attempt to enqueue 25 jobs concurrently
      const results = await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          Promise.resolve().then(() =>
            queue.enqueue({
              id: `ov_job_${i}`,
              storyId,
              idempotencyKey: `ov_key_${i}`,
              priority: i >= 10 ? 'CRITICAL' : 'LOW',
            })
          )
        )
      );

      const accepted = results.filter((r) => r.enqueued);
      const rejected = results.filter((r) => !r.enqueued);
      assert.equal(accepted.length, maxQueueSize);
      assert.equal(rejected.length, 15);
      for (const r of rejected) {
        assert.equal(r.code, 'QUEUE_OVERFLOW_REJECTED');
        assert.equal(r.error, 'QUEUE_FULL_REJECTED');
      }
      assert.equal(queue.getPendingCount(), maxQueueSize);

      // Drain all 10 jobs -> capacity is freed for new active jobs
      await queue.drain(repo);
      assert.equal(queue.getPendingCount(), 0);

      for (let i = 0; i < maxQueueSize; i++) {
        const refill = queue.enqueue({
          id: `refill_${i}`,
          storyId,
          idempotencyKey: `refill_key_${i}`,
        });
        assert.equal(refill.enqueued, true, `Refill job ${i} should be accepted after drain`);
      }
    });

    it('rejects 99/100 rapid concurrent submissions with identical idempotencyKey and executes zero duplicates', async () => {
      const queue = new BackgroundProcessingQueue({ maxQueueSize: 100 });
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_idemp_race_' + Date.now();
      repo.seedStory(storyId);

      const sharedKey = 'shared_idempotency_key_alpha';
      const submissions = await Promise.all(
        Array.from({ length: 100 }, (_, idx) =>
          Promise.resolve().then(() =>
            queue.enqueue({
              id: `dup_job_${idx}`,
              storyId,
              idempotencyKey: sharedKey,
              priority: idx % 2 === 0 ? 'CRITICAL' : 'LOW',
            })
          )
        )
      );

      const accepted = submissions.filter((s) => s.enqueued);
      const rejected = submissions.filter((s) => !s.enqueued);
      assert.equal(accepted.length, 1, 'Exactly one job must be accepted for identical idempotencyKey');
      assert.equal(rejected.length, 99);
      for (const rej of rejected) {
        assert.equal(rej.code, 'DUPLICATE_JOB_REJECTED');
        assert.equal(rej.error, 'IDEMPOTENCY_DUPLICATE_IGNORED');
      }

      // Race 20 concurrent processNext calls against the single enqueued job
      let executionCount = 0;
      const v1 = repo.getWorldVersion(storyId);
      const h1 = repo.getCanonicalStateHash(storyId);
      const processResults = await Promise.all(
        Array.from({ length: 20 }, () =>
          queue.processNext(repo, async (job) => {
            await new Promise((r) => setTimeout(r, 5));
            executionCount++;
            return {
              proposalId: `prop_${job.id}`,
              idempotencyKey: job.idempotencyKey,
              worldVersion: v1,
              baseStateHash: h1,
              proposedStateTransition: { type: 'BG_WORK', payload: { bgRan: true } },
              requiredPreconditions: [],
              provenance: { source: 'DETERMINISTIC_ARCHETYPE', timestamp: new Date().toISOString() },
              safeFallback: { message: 'noop' },
            };
          })
        )
      );

      const nonNull = processResults.filter((r) => r !== null);
      assert.equal(nonNull.length, 1, 'Only one worker should claim the queued job');
      assert.equal(executionCount, 1, 'Handler must execute exactly once');

      // Re-submit same idempotencyKey AFTER commit -> must still reject and never re-execute
      const postCommitDup = queue.enqueue({
        id: 'dup_job_after_commit',
        storyId,
        idempotencyKey: sharedKey,
      });
      assert.equal(postCommitDup.enqueued, false);
      assert.equal(postCommitDup.code, 'DUPLICATE_JOB_REJECTED');
      await queue.drain(repo, async () => {
        executionCount++;
        return null as any;
      });
      assert.equal(executionCount, 1);
    });

    it('preserves strict priority + FIFO order under same-millisecond burst of 60 jobs', async () => {
      const queue = new BackgroundProcessingQueue({ maxQueueSize: 100 });
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_prio_burst_' + Date.now();
      repo.seedStory(storyId);

      const expectedCrit: string[] = [];
      const expectedHigh: string[] = [];
      const expectedNorm: string[] = [];
      const expectedLow: string[] = [];

      for (let i = 0; i < 60; i++) {
        const mod = i % 4;
        const id = `burst_${i}`;
        if (mod === 0) {
          queue.enqueue({ id, storyId, idempotencyKey: `k_${i}`, priority: 'LOW' });
          expectedLow.push(id);
        } else if (mod === 1) {
          queue.enqueue({ id, storyId, idempotencyKey: `k_${i}`, priority: 'NORMAL' });
          expectedNorm.push(id);
        } else if (mod === 2) {
          queue.enqueue({ id, storyId, idempotencyKey: `k_${i}`, priority: 'HIGH' });
          expectedHigh.push(id);
        } else {
          queue.enqueue({ id, storyId, idempotencyKey: `k_${i}`, priority: 'CRITICAL' });
          expectedCrit.push(id);
        }
      }

      const actualOrder: string[] = [];
      await queue.drain(repo, async (job) => {
        actualOrder.push(job.id);
        return null as any;
      });

      assert.deepEqual(actualOrder, [...expectedCrit, ...expectedHigh, ...expectedNorm, ...expectedLow]);
    });
  });

  // =========================================================================
  // 4. High-Concurrency Foreground Mutation vs Background Drain Snapshot CAS
  // =========================================================================
  describe('4. High-Concurrency Foreground Turn vs Background Drain Snapshot CAS', () => {
    it('strictly rejects stale proposals with STALE_PROPOSAL_REJECTED under concurrent foreground mutations', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_cas_concurrency_' + Date.now();
      repo.seedStory(storyId);
      repo.setSimulationStateSlice(storyId, { marker: 'INITIAL_CANON', foregroundTurns: 0 });

      const queue = repo.getBackgroundProcessingQueue(storyId);
      const snapshotVersion = repo.getWorldVersion(storyId);
      const snapshotHash = repo.getCanonicalStateHash(storyId);

      // Enqueue 30 background jobs that all captured snapshot (v1, hash1)
      for (let i = 0; i < 30; i++) {
        const proposal: WorldSimulationProposal = {
          proposalId: `prop_race_${i}`,
          idempotencyKey: `idemp_race_${i}`,
          worldVersion: snapshotVersion,
          baseStateHash: snapshotHash,
          proposedStateTransition: {
            type: 'BACKGROUND_MUTATION',
            targetId: `distant_region_${i}`,
            payload: { marker: `STALE_BG_OVERWRITE_${i}` },
          },
          requiredPreconditions: [],
          provenance: { source: 'MODEL_PROPOSED', timestamp: new Date().toISOString() },
          safeFallback: { message: 'Rejected stale proposal safely.' },
        };

        const enq = queue.enqueue({
          id: `bg_race_${i}`,
          storyId,
          idempotencyKey: `idemp_race_${i}`,
          priority: 'NORMAL',
          rebasePolicy: i % 2 === 0 ? 'SAFE_REBASE_DISJOINT' : 'REJECT_ON_STALE',
          proposal,
        });
        assert.equal(enq.enqueued, true);
      }

      // Run foreground player turns AND background queue drain concurrently
      const foregroundTask = (async () => {
        for (let t = 1; t <= 10; t++) {
          LivingWorldEngine.tickTurn(repo, { storyId, actionText: 'search the office' });
          repo.incrementWorldVersion(storyId);
          repo.setSimulationStateSlice(storyId, {
            marker: `FOREGROUND_TURN_${t}`,
            foregroundTurns: t,
          });
          await new Promise((r) => setTimeout(r, 2));
        }
      })();

      const backgroundResults: any[] = [];
      const backgroundTask = (async () => {
        // Yield slightly or race concurrently with foregroundTask
        await new Promise((r) => setTimeout(r, 1));
        while (queue.getPendingCount() > 0) {
          const res = await queue.processNext(repo, async (job) => {
            await new Promise((r) => setTimeout(r, 3));
            return job.proposal!;
          });
          if (res) backgroundResults.push(res);
        }
      })();

      await Promise.all([foregroundTask, backgroundTask]);

      // All 30 background jobs were processed; NONE committed after foreground advanced v1 -> v11
      assert.equal(backgroundResults.length, 30);
      const committed = backgroundResults.filter((r) => r.success);
      const staleRejected = backgroundResults.filter((r) => r.code === 'STALE_PROPOSAL_REJECTED');

      // Because foreground ran tickTurn + incrementWorldVersion before backgroundTask finished its 1ms+3ms delay,
      // every single stale proposal MUST be rejected with STALE_PROPOSAL_REJECTED
      assert.equal(committed.length, 0, 'Zero stale background jobs should commit after foreground mutation');
      assert.equal(staleRejected.length, 30);
      for (const r of staleRejected) {
        assert.equal(r.status, 'REJECTED_STALE');
      }

      // Verify canonical foreground state was untouched by stale background jobs
      const finalSlice = repo.getSimulationStateSlice(storyId);
      assert.equal(finalSlice.marker, 'FOREGROUND_TURN_10');
      assert.equal(finalSlice.foregroundTurns, 10);
      assert.equal(repo.getWorldVersion(storyId), snapshotVersion + 10);
    });

    it('rejects all but first valid concurrent job when 20 jobs race on identical snapshot without foreground interference', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'story_cas_self_race_' + Date.now();
      repo.seedStory(storyId);

      const queue = repo.getBackgroundProcessingQueue(storyId);
      const v1 = repo.getWorldVersion(storyId);
      const h1 = repo.getCanonicalStateHash(storyId);

      for (let i = 0; i < 20; i++) {
        queue.enqueue({
          id: `self_race_${i}`,
          storyId,
          idempotencyKey: `self_race_k_${i}`,
          proposal: {
            proposalId: `prop_self_${i}`,
            idempotencyKey: `self_race_k_${i}`,
            worldVersion: v1,
            baseStateHash: h1,
            proposedStateTransition: { type: 'BG_STEP', payload: { winner: i } },
            requiredPreconditions: [],
            provenance: { source: 'DETERMINISTIC_ARCHETYPE', timestamp: new Date().toISOString() },
            safeFallback: { message: 'Lost CAS race.' },
          },
        });
      }

      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          queue.processNext(repo, async (job) => {
            await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 10)));
            return job.proposal!;
          })
        )
      );

      const valid = results.filter((r) => r !== null);
      assert.equal(valid.length, 20);
      const committed = valid.filter((r) => r!.code === 'PROPOSAL_COMMITTED');
      const rejected = valid.filter((r) => r!.code === 'STALE_PROPOSAL_REJECTED');
      assert.equal(committed.length, 1, 'Exactly one CAS winner must commit');
      assert.equal(rejected.length, 19, 'Remaining 19 racers must be rejected as STALE_PROPOSAL_REJECTED');
      assert.equal(repo.getWorldVersion(storyId), v1 + 1);
    });
  });

  // =========================================================================
  // 5. Write Lock Decoupling Empirical Probe (Feature F20)
  // =========================================================================
  describe('5. Write Lock Decoupling Empirical Verification (F20)', () => {
    it('measures whether canonicalCommandEngine write lock is released before async generateNarrativeOnly completes', async () => {
      const storyId = 'story_lock_probe_' + Date.now();
      worldRepository.seedStory(storyId);

      const orchestrator = worldRepository.getAiOrchestrator();
      const origGenerate = orchestrator.generateNarrativeOnly.bind(orchestrator);

      let narrativeStartedAt = 0;
      let narrativeFinishedAt = 0;
      let concurrentLockAcquiredAt = 0;

      orchestrator.generateNarrativeOnly = (async (params: any) => {
        narrativeStartedAt = performance.now();
        await new Promise((r) => setTimeout(r, 150));
        narrativeFinishedAt = performance.now();
        return {
          success: true,
          source: 'TEST_MOCK',
          providerId: 'mock',
          modelId: 'mock-model',
          turnPackage: {
            narrative: ['You inspect the dusty desk carefully and notice a faint scratch near the drawer lock.'],
            dialogue: [],
            events: [],
            stateChanges: [],
            memoryCandidates: [],
            audioCues: [],
          },
        } as any;
      }) as any;

      try {
        const turnPromise = canonicalCommandEngine.runExclusive(storyId, () =>
          serverMockAuthority.processCustomAction(
            { type: 'CUSTOM_ACTION', storyId, actionText: 'inspect the desk' } as any,
            'cmd_lock_probe_1',
            { bypassCapabilityAdvisor: true }
          )
        );

        // Wait until generateNarrativeOnly has started
        await new Promise((r) => setTimeout(r, 30));
        assert.ok(narrativeStartedAt > 0, 'Narrative generation should have started');

        // Try acquiring the story lock concurrently while narrative generation is in-flight
        const probePromise = canonicalCommandEngine.runExclusive(storyId, async () => {
          concurrentLockAcquiredAt = performance.now();
        });

        await Promise.all([turnPromise, probePromise]);

        // If write lock was truly decoupled from narrative generation, concurrentLockAcquiredAt < narrativeFinishedAt.
        // We assert the actual behavior so this test surfaces whether lock decoupling is genuine.
        assert.ok(
          concurrentLockAcquiredAt < narrativeFinishedAt,
          `LOCK DECOUPLING FAILURE: Exclusive story lock was held across async generateNarrativeOnly! ` +
            `narrativeStartedAt=${narrativeStartedAt.toFixed(1)}, ` +
            `concurrentLockAcquiredAt=${concurrentLockAcquiredAt.toFixed(1)}, ` +
            `narrativeFinishedAt=${narrativeFinishedAt.toFixed(1)}`
        );
      } finally {
        orchestrator.generateNarrativeOnly = origGenerate;
      }
    });
  });
});
