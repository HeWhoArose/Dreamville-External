import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

import { InMemoryWorldRepository, worldRepository } from '../../server/repositories/worldRepository';
import { LivingWorldEngine } from '../../server/domain/livingWorldEngine';
import { TimeBudgetGovernor } from '../../server/domain/timeBudgetGovernor';
import { BackgroundProcessingQueue } from '../../server/domain/backgroundProcessingQueue';
import {
  WorldSimulatorAdjudicator,
  type WorldSimulationProposal,
} from '../../server/domain/worldSimulationProposal';
import { gameRouter } from '../../server/api/gameRoutes';
import { serverMockAuthority } from '../../server/mockEngine/serverMockAuthority';
import { canonicalCommandEngine } from '../../server/domain/canonicalCommandEngine';
import { storyActionAdvisor } from '../../server/services/storyActionAdvisor';

describe('M5 Challenger 2 Empirical Adversarial Verification', () => {
  // =========================================================================
  // 1. LivingWorldEngine.tickTurn Performance & Boundary Stability
  // =========================================================================
  describe('1. LivingWorldEngine.tickTurn Performance & Eviction', () => {
    it('1A: tickTurn latency under 20 active co-located entities + 30 distant entities + 10 events meets <5ms target', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'chal_perf_' + Date.now();
      repo.seedStory(storyId);

      const player = repo.getPlayerLifecycle(storyId)!;
      const locId = player.locationId;
      const sim = repo.getLivingWorldSimulation(storyId);

      // 20 active co-located entities with schedules & routines
      for (let i = 0; i < 20; i++) {
        const npcId = `npc_active_${i}`;
        sim.registerNpcSchedule({
          npcId,
          name: `Active NPC ${i}`,
          currentLocationId: locId,
          currentActivity: 'patrolling',
          entries: [
            {
              id: `sched_${i}_1`,
              startHour: 0,
              endHour: 12,
              activity: 'morning_duty',
              targetLocationId: locId,
              fallbackActivity: 'idle',
            },
            {
              id: `sched_${i}_2`,
              startHour: 12,
              endHour: 24,
              activity: 'evening_watch',
              targetLocationId: locId,
              fallbackActivity: 'idle',
            },
          ],
          fallbackActivity: 'resting',
          fallbackLocationId: locId,
        });
        repo.saveEntityCard(storyId, {
          id: npcId,
          name: `Active NPC ${i}`,
          kind: 'NPC',
          worldState: {
            locationId: locId,
            currentActivity: 'patrolling',
            isAlive: true,
            presence: 'present',
          },
          lifecycle: { status: 'ACTIVE' },
          behavior: { routines: ['patrolling', 'inspecting', 'conversing'] },
        });
      }

      // 30 distant entities
      for (let i = 0; i < 30; i++) {
        repo.saveEntityCard(storyId, {
          id: `npc_distant_${i}`,
          name: `Distant NPC ${i}`,
          kind: 'NPC',
          worldState: {
            locationId: `loc_distant_${i % 5}`,
            currentActivity: 'working',
            isAlive: true,
            presence: 'present',
          },
          lifecycle: { status: 'ACTIVE' },
        });
      }

      // 10 scheduled events
      const baseSec = repo.getWorldClock(storyId).getTimestamp().totalElapsedSeconds;
      for (let i = 0; i < 10; i++) {
        sim.scheduleEvent({
          id: `evt_perf_${i}`,
          kind: 'MARKET_DAY',
          name: `Scheduled Event ${i}`,
          locationId: locId,
          triggerTimestamp: { year: 1, month: 1, day: 1, hour: 12, minute: 0, second: 0, totalElapsedSeconds: baseSec + 10000 + i * 60 },
          deadlineTimestamp: { year: 1, month: 1, day: 1, hour: 18, minute: 0, second: 0, totalElapsedSeconds: baseSec + 50000 + i * 60 },
          isResolved: false,
          status: 'pending',
        });
      }

      // Warmup
      for (let w = 0; w < 5; w++) {
        LivingWorldEngine.tickTurn(repo, { storyId, actionText: 'look around' });
      }

      const samples: number[] = [];
      for (let t = 0; t < 50; t++) {
        const start = performance.now();
        LivingWorldEngine.tickTurn(repo, { storyId, actionText: 'search the desk' });
        samples.push(performance.now() - start);
      }

      samples.sort((a, b) => a - b);
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const p50 = samples[Math.floor(samples.length * 0.5)];
      const p95 = samples[Math.floor(samples.length * 0.95)];
      const max = samples[samples.length - 1];
      console.log(`[PERF] LivingWorldEngine.tickTurn (50 runs, 20 active + 30 distant): mean=${mean.toFixed(3)}ms, p50=${p50.toFixed(3)}ms, p95=${p95.toFixed(3)}ms, max=${max.toFixed(3)}ms`);

      assert.ok(p95 < 5, `p95 latency ${p95.toFixed(3)}ms exceeded <5ms target`);
    });

    it('1B: ACTIVE_TEMPORARY entity TTL decrements across multiple turns and evicts when TTL reaches 0', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'chal_ttl_' + Date.now();
      repo.seedStory(storyId);

      const player = repo.getPlayerLifecycle(storyId)!;
      const tempId = 'temp_taxi_ttl3';
      repo.saveEntityCard(storyId, {
        id: tempId,
        name: 'Yellow Cab #42',
        kind: 'OTHER',
        worldState: {
          locationId: player.locationId,
          currentActivity: 'idling at curb',
          isAlive: true,
          presence: 'present',
        },
        lifecycle: {
          stage: 'ACTIVE_TEMPORARY',
          status: 'ACTIVE',
          ttlTurns: 3,
          activeDependencies: [],
        },
      });

      // Turn 1: TTL 3 -> 2 (not evicted yet)
      const t1 = LivingWorldEngine.tickTurn(repo, { storyId, explicitSeconds: 60 });
      assert.equal(t1.evictedEntityIds.includes(tempId), false, 'Should not evict at TTL 2');
      const cardAfter1 = repo.getEntityCard(storyId, tempId)!;
      console.log(`[TTL] After Turn 1: ttlTurns=${cardAfter1.lifecycle.ttlTurns}, stage=${cardAfter1.lifecycle.stage}, status=${cardAfter1.lifecycle.status}`);
      assert.equal(cardAfter1.lifecycle.ttlTurns, 2, 'TTL must persist as 2 after Turn 1');

      // Turn 2: TTL 2 -> 1 (not evicted yet)
      const t2 = LivingWorldEngine.tickTurn(repo, { storyId, explicitSeconds: 60 });
      assert.equal(t2.evictedEntityIds.includes(tempId), false, 'Should not evict at TTL 1');
      const cardAfter2 = repo.getEntityCard(storyId, tempId)!;
      console.log(`[TTL] After Turn 2: ttlTurns=${cardAfter2.lifecycle.ttlTurns}, stage=${cardAfter2.lifecycle.stage}, status=${cardAfter2.lifecycle.status}`);
      assert.equal(cardAfter2.lifecycle.ttlTurns, 1, 'TTL must persist as 1 after Turn 2');

      // Turn 3: TTL 1 -> 0 (MUST EVICT!)
      const t3 = LivingWorldEngine.tickTurn(repo, { storyId, explicitSeconds: 60 });
      const cardAfter3 = repo.getEntityCard(storyId, tempId)!;
      console.log(`[TTL] After Turn 3: evicted=${t3.evictedEntityIds.includes(tempId)}, ttlTurns=${cardAfter3.lifecycle.ttlTurns}, stage=${cardAfter3.lifecycle.stage}, status=${cardAfter3.lifecycle.status}`);
      assert.equal(t3.evictedEntityIds.includes(tempId), true, 'Must evict ACTIVE_TEMPORARY entity when TTL reaches 0');
      assert.equal(cardAfter3.lifecycle.stage, 'EPHEMERAL');
      assert.equal(cardAfter3.lifecycle.status, 'DORMANT');
    });

    it('1C: ACTIVE_TEMPORARY entity without activeDependencies is evicted when player relocates', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'chal_reloc_' + Date.now();
      repo.seedStory(storyId);

      const player = repo.getPlayerLifecycle(storyId)!;
      const originLoc = player.locationId;
      const tempId = 'temp_bystander_reloc';

      repo.saveEntityCard(storyId, {
        id: tempId,
        name: 'Street Sweeper',
        kind: 'NPC',
        worldState: {
          locationId: originLoc,
          currentActivity: 'sweeping',
          isAlive: true,
          presence: 'present',
        },
        lifecycle: {
          stage: 'ACTIVE_TEMPORARY',
          status: 'ACTIVE',
          ttlTurns: 5,
          activeDependencies: [],
        },
      });

      // Player relocates to another location
      const movedLocation = originLoc === 'loc_street' ? 'loc_office' : 'loc_street_away';
      repo.updatePlayerLifecycle(storyId, player.copyWith({ locationId: movedLocation }));

      const tick = LivingWorldEngine.tickTurn(repo, { storyId, explicitSeconds: 60 });
      const card = repo.getEntityCard(storyId, tempId)!;
      console.log(`[RELOC] evicted=${tick.evictedEntityIds.includes(tempId)}, stage=${card.lifecycle.stage}, status=${card.lifecycle.status}`);
      assert.equal(tick.evictedEntityIds.includes(tempId), true, 'Temporary entity at old location must be evicted when player relocates');
      assert.equal(card.lifecycle.stage, 'EPHEMERAL');
    });

    it('1D: Protected ACTIVE_TEMPORARY entity (with activeDependencies) is NOT evicted at TTL 0 or on relocation', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'chal_prot_' + Date.now();
      repo.seedStory(storyId);

      const player = repo.getPlayerLifecycle(storyId)!;
      const tempId = 'temp_protected_taxi';
      repo.saveEntityCard(storyId, {
        id: tempId,
        name: 'Boarded Taxi',
        kind: 'OTHER',
        worldState: {
          locationId: player.locationId,
          currentActivity: 'driving passenger',
          isAlive: true,
          presence: 'present',
        },
        lifecycle: {
          stage: 'ACTIVE_TEMPORARY',
          status: 'ACTIVE',
          ttlTurns: 1,
          activeDependencies: ['player_boarded'],
        },
      });

      // Tick down to 0 and relocate
      repo.updatePlayerLifecycle(storyId, player.copyWith({ locationId: 'loc_somewhere_else' }));
      const tick1 = LivingWorldEngine.tickTurn(repo, { storyId, explicitSeconds: 60 });
      const tick2 = LivingWorldEngine.tickTurn(repo, { storyId, explicitSeconds: 60 });

      const card = repo.getEntityCard(storyId, tempId)!;
      assert.equal(tick1.evictedEntityIds.includes(tempId), false);
      assert.equal(tick2.evictedEntityIds.includes(tempId), false);
      assert.equal(card.lifecycle.stage, 'ACTIVE_TEMPORARY');
      assert.equal(card.lifecycle.status, 'ACTIVE');
    });
  });

  // =========================================================================
  // 2. Background Queue CAS, ABA Prevention & Disjoint Rebase
  // =========================================================================
  describe('2. Background Queue CAS & Disjoint Rebase', () => {
    it('2A: ABA hazard prevention - worldVersion matches but baseStateHash differs -> rejected', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'chal_aba_' + Date.now();
      repo.seedStory(storyId);

      const v1 = repo.getWorldVersion(storyId);
      const hash1 = repo.getCanonicalStateHash(storyId);

      // Simulate A -> B -> A on worldVersion while canonical state actually changed
      repo.setSimulationStateSlice(storyId, { playerMood: 'alert' });
      const hash2 = repo.getCanonicalStateHash(storyId);
      assert.notEqual(hash2, hash1);

      const queue = repo.getBackgroundProcessingQueue(storyId);
      const proposal: WorldSimulationProposal = {
        proposalId: 'prop_aba',
        idempotencyKey: 'idemp_aba',
        worldVersion: v1, // version still matches!
        baseStateHash: hash1, // stale hash!
        proposedStateTransition: {
          type: 'BACKGROUND_NPC_MOVE',
          payload: { distantNpc: 'moved' },
        },
        requiredPreconditions: [],
        provenance: { source: 'MODEL_PROPOSED', timestamp: new Date().toISOString() },
        safeFallback: { message: 'Aborted ABA.' },
      };

      queue.enqueue({ id: 'job_aba', storyId, idempotencyKey: 'idemp_aba', proposal });
      const res = await queue.processNext(repo);
      assert.ok(res);
      assert.equal(res.success, false);
      assert.equal(res.code, 'STALE_PROPOSAL_REJECTED');
    });

    it('2B: Disjoint rebase (SAFE_REBASE_DISJOINT) - non-conflicting background mutation commits safely despite foreground version advance', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'chal_rebase_ok_' + Date.now();
      repo.seedStory(storyId);

      repo.setSimulationStateSlice(storyId, {
        localSceneLight: 'dim',
        distantWeather: 'clear',
      });

      const v1 = repo.getWorldVersion(storyId);
      const hash1 = repo.getCanonicalStateHash(storyId);

      const queue = repo.getBackgroundProcessingQueue(storyId);
      const disjointProposal: WorldSimulationProposal = {
        proposalId: 'prop_disjoint_ok',
        idempotencyKey: 'idemp_disjoint_ok',
        worldVersion: v1,
        baseStateHash: hash1,
        proposedStateTransition: {
          type: 'DISTANT_WEATHER_SHIFT',
          targetId: 'loc_distant_harbor',
          payload: { distantWeather: 'stormy' },
        },
        requiredPreconditions: [],
        provenance: { source: 'MODEL_PROPOSED', timestamp: new Date().toISOString() },
        safeFallback: { message: 'Weather remains clear.' },
      };

      queue.enqueue({
        id: 'job_disjoint_ok',
        storyId,
        idempotencyKey: 'idemp_disjoint_ok',
        proposal: disjointProposal,
        rebasePolicy: 'SAFE_REBASE_DISJOINT',
        targetDomain: 'distant_world',
      });

      // Foreground mutates a DISJOINT slice ('localSceneLight') and advances worldVersion
      repo.applySimulationStateTransition(storyId, {
        type: 'LOCAL_LIGHT_TOGGLE',
        targetId: 'loc_office',
        payload: { localSceneLight: 'bright' },
      });
      repo.incrementWorldVersion(storyId);

      const res = await queue.processNext(repo);
      console.log('[REBASE_OK] result:', res);
      assert.ok(res);
      assert.equal(res.success, true, `Expected disjoint rebase to succeed, got ${res.code}: ${res.message}`);
      assert.equal(res.code, 'PROPOSAL_COMMITTED');
      const slice = repo.getSimulationStateSlice(storyId);
      assert.equal(slice.localSceneLight, 'bright', 'Foreground mutation must be preserved');
      assert.equal(slice.distantWeather, 'stormy', 'Disjoint background mutation must be applied');
    });

    it('2C: Conflicting mutation with SAFE_REBASE_DISJOINT fails closed (REJECTED_STALE)', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = 'chal_rebase_conflict_' + Date.now();
      repo.seedStory(storyId);

      repo.setSimulationStateSlice(storyId, {
        distantWeather: 'clear',
      });

      const v1 = repo.getWorldVersion(storyId);
      const hash1 = repo.getCanonicalStateHash(storyId);

      const queue = repo.getBackgroundProcessingQueue(storyId);
      const conflictingProposal: WorldSimulationProposal = {
        proposalId: 'prop_conflict',
        idempotencyKey: 'idemp_conflict',
        worldVersion: v1,
        baseStateHash: hash1,
        proposedStateTransition: {
          type: 'DISTANT_WEATHER_SHIFT',
          targetId: 'loc_distant_harbor',
          payload: { distantWeather: 'stormy' },
        },
        requiredPreconditions: [],
        provenance: { source: 'MODEL_PROPOSED', timestamp: new Date().toISOString() },
        safeFallback: { message: 'Weather remains unchanged.' },
      };

      queue.enqueue({
        id: 'job_conflict',
        storyId,
        idempotencyKey: 'idemp_conflict',
        proposal: conflictingProposal,
        rebasePolicy: 'SAFE_REBASE_DISJOINT',
        targetDomain: 'distant_world',
      });

      // Foreground ALSO mutates the SAME key 'distantWeather'
      repo.applySimulationStateTransition(storyId, {
        type: 'WEATHER_OVERRIDE',
        payload: { distantWeather: 'foggy' },
      });
      repo.incrementWorldVersion(storyId);

      const res = await queue.processNext(repo);
      console.log('[REBASE_CONFLICT] result:', res);
      assert.ok(res);
      assert.equal(res.success, false, 'Conflicting mutation must fail closed');
      assert.equal(res.code, 'STALE_PROPOSAL_REJECTED');
      assert.equal(repo.getSimulationStateSlice(storyId).distantWeather, 'foggy');
    });
  });

  // =========================================================================
  // 3. Lock Decoupling Verification
  // =========================================================================
  describe('3. Lock Decoupling Verification', () => {
    it('3A & 3B: Concurrent GET query and read-only action do NOT block on 500ms narrative generation', async () => {
      const storyId = 'chal_lock_' + Date.now();
      worldRepository.seedStory(storyId);

      const orchestrator = worldRepository.getAiOrchestrator();
      const origGenerate = orchestrator.generateNarrativeOnly.bind(orchestrator);
      const origAdvise = storyActionAdvisor.advise.bind(storyActionAdvisor);
      const origSemanticReview = (orchestrator as any).reviewNarrative?.bind?.(orchestrator);

      (storyActionAdvisor as any).advise = async () => ({
        mode: 'NORMAL_ACTION',
        confidence: 1,
        reasoning: 'fast stub',
      });

      let resolveGenStarted!: () => void;
      const genStarted = new Promise<void>((r) => { resolveGenStarted = r; });
      let genStartedAt = 0;
      let genFinishedAt = 0;

      // Stub generateNarrativeOnly to take 600ms and signal exact entry
      (orchestrator as any).generateNarrativeOnly = async () => {
        genStartedAt = performance.now();
        resolveGenStarted();
        await new Promise((r) => setTimeout(r, 600));
        genFinishedAt = performance.now();
        return {
          success: true,
          source: 'MOCK_SLOW',
          providerId: 'mock',
          modelId: 'mock-slow',
          turnPackage: {
            narrative: ['You look around the quiet office.'],
            dialogue: [],
            visualCues: [],
          },
        };
      };

      const app = express();
      app.use(express.json());
      app.use('/api/game', gameRouter);

      const server = await new Promise<http.Server>((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });

      try {
        const addr = server.address() as any;
        const baseUrl = `http://127.0.0.1:${addr.port}/api/game`;

        // Start Turn 1 (slow 600ms narration)
        const turn1Start = performance.now();
        const turn1Promise = fetch(`${baseUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'CUSTOM_ACTION',
            storyId,
            customText: 'look at the desk',
          }),
        }).then(async (r) => ({ status: r.status, body: await r.json(), elapsed: performance.now() - turn1Start }));

        // Wait until Turn 1 has actually entered generateNarrativeOnly
        await genStarted;

        // Fire concurrent GET /state while generateNarrativeOnly is sleeping
        const getStart = performance.now();
        const getRes = await fetch(`${baseUrl}/state?storyId=${encodeURIComponent(storyId)}`);
        const getElapsed = performance.now() - getStart;
        assert.equal(getRes.status, 200);

        // Fire concurrent read-only query via POST /action ("check inventory") while generateNarrativeOnly is sleeping
        const queryStart = performance.now();
        const queryRes = await fetch(`${baseUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'CUSTOM_ACTION',
            storyId,
            customText: 'check inventory',
          }),
        });
        const queryDoneAt = performance.now();
        const queryElapsed = queryDoneAt - queryStart;
        assert.equal(queryRes.status, 200);

        const turn1Result = await turn1Promise;
        console.log(
          `[LOCK] Turn1=${turn1Result.elapsed.toFixed(1)}ms, ` +
          `GET /state=${getElapsed.toFixed(1)}ms, ` +
          `Concurrent POST query=${queryElapsed.toFixed(1)}ms, ` +
          `queryFinishedBeforeNarration=${queryDoneAt < genFinishedAt} (delta=${(queryDoneAt - genFinishedAt).toFixed(1)}ms)`
        );

        assert.ok(getElapsed < 150, `GET /state blocked for ${getElapsed.toFixed(1)}ms`);
        assert.ok(
          queryElapsed < 150 && queryDoneAt < genFinishedAt,
          `Concurrent read-only POST /action ('check inventory') blocked for ${queryElapsed.toFixed(1)}ms waiting on Turn 1's 600ms narrative generation (finished ${(queryDoneAt - genFinishedAt).toFixed(1)}ms after narration ended)! Write lock was NOT decoupled from narrative generation.`
        );
      } finally {
        (orchestrator as any).generateNarrativeOnly = origGenerate;
        (storyActionAdvisor as any).advise = origAdvise;
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
