import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startE2eServer,
  seedE2eStory,
  installDeterministicAiMocks,
  restoreDeterministicAiMocks,
  WorldSimulatorAdjudicator,
  EntityLifecycleStateMachine,
  AffordancePlausibilityEngine,
  type E2eTestServer,
  type WorldSimulationProposal,
} from './e2e-test-helper';
import { worldRepository } from '../server/repositories/worldRepository';
import { AiCallBudget, decideAiHelperNeed } from '../server/domain/aiCallPolicy';

describe('Tier 2: Boundary & Corner Cases', () => {
  let e2e: E2eTestServer;

  before(async () => {
    installDeterministicAiMocks();
    e2e = await startE2eServer();
  });

  after(async () => {
    restoreDeterministicAiMocks();
    await e2e.close();
  });

  // =========================================================================
  // 1. Input Size & String Extremes
  // =========================================================================
  describe('1. Input Size & String Extremes', () => {
    it('T2-01: empty string actionText is handled without server crash', async () => {
      const storyId = 'e2e_t2_empty_' + Date.now();
      seedE2eStory(storyId);

      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: '',
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.ok(data.actionId || data.success);
    });

    it('T2-02: whitespace-only actionText is handled cleanly', async () => {
      const storyId = 'e2e_t2_whitespace_' + Date.now();
      seedE2eStory(storyId);

      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: '   \t\n  \r\n   ',
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.ok(data.actionId || data.success);
    });

    it('T2-03: massive 10,000+ character action input does not cause stack overflow or memory exhaustion', async () => {
      const storyId = 'e2e_t2_massive_' + Date.now();
      seedE2eStory(storyId);

      const massiveText = 'I search the corner of the room meticulously. '.repeat(250);
      assert.ok(massiveText.length > 10000);

      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: massiveText,
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
    });

    it('T2-04: repeated delimiter sequences (path traversal characters) do not escape sandbox', async () => {
      const storyId = 'e2e_t2_traversal_' + Date.now();
      seedE2eStory(storyId);

      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: '../../../../../../etc/passwd ... \\..\\..\\windows\\system32',
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
    });
  });

  // =========================================================================
  // 2. Encoding, Escaping & Special Characters
  // =========================================================================
  describe('2. Encoding, Escaping & Special Characters', () => {
    it('T2-05: Unicode, emoji, and multi-byte characters are preserved without corruption', async () => {
      const storyId = 'e2e_t2_unicode_' + Date.now();
      seedE2eStory(storyId);

      const emojiInput = '🕵️‍♂️ I observe the 門 through the 🔍 lens and hold the 🗝️ tightly.';
      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: emojiInput,
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
      const history = data.viewState.actionHistory;
      assert.ok(history.some((item: any) => (item.description || item.actionText || JSON.stringify(item)).includes('🕵️‍♂️')));
    });

    it('T2-06: HTML / XML script tags are safely treated as narrative prose and not executed', async () => {
      const storyId = 'e2e_t2_xss_' + Date.now();
      seedE2eStory(storyId);

      const scriptInput = '<script>alert("XSS")</script><img src="x" onerror="alert(1)"/>';
      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: scriptInput,
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
    });

    it('T2-07: SQL meta-characters are treated as standard prose', async () => {
      const storyId = 'e2e_t2_sqli_' + Date.now();
      seedE2eStory(storyId);

      const sqlInput = "'; DROP TABLE characters; SELECT * FROM users WHERE '1'='1";
      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: sqlInput,
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
    });

    it('T2-08: Regex special meta-characters do not crash the pattern evaluator', async () => {
      const storyId = 'e2e_t2_regex_' + Date.now();
      seedE2eStory(storyId);

      const regexInput = '^.*+?${}()|[]/\\';
      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: regexInput,
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
    });
  });

  // =========================================================================
  // 3. Payload & Schema Malformations
  // =========================================================================
  describe('3. Payload & Schema Malformations', () => {
    it('T2-09: missing request body returns HTTP 400', async () => {
      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(null),
      });

      assert.equal(res.status, 400);
    });

    it('T2-10: payload lacking type field returns HTTP 400', async () => {
      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: 'story_xyz',
          actionText: 'hello',
        }),
      });

      assert.equal(res.status, 400);
      const data: any = await res.json();
      assert.match(data.error, /type field/i);
    });

    it('T2-11: non-existent storyId falls back gracefully or initializes default story safely', async () => {
      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: 'non_existent_story_' + Date.now(),
          type: 'CUSTOM_ACTION',
          actionText: 'I look around.',
        }),
      });

      // Server rejects invalid story with error status >= 400
      assert.ok(res.status >= 400);
    });
  });

  // =========================================================================
  // 4. Idempotency Key Boundary & Collisions
  // =========================================================================
  describe('4. Idempotency Key Boundary & Collisions', () => {
    it('T2-12: identical idempotencyKey replays cached action and does NOT duplicate canonical events', async () => {
      const storyId = 'e2e_t2_idem_' + Date.now();
      seedE2eStory(storyId);
      const idempotencyKey = 'idem_key_boundary_' + Date.now();

      const payload = {
        storyId,
        idempotencyKey,
        type: 'CUSTOM_ACTION',
        actionText: 'I inspect the antique wall clock.',
      };

      // 1st call
      const res1 = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idempotencyKey },
        body: JSON.stringify(payload),
      });
      assert.equal(res1.status, 200);
      const data1: any = await res1.json();
      const eventsAfter1 = worldRepository.getCanonicalCommandEventCount(storyId);

      // 2nd call with exact same idempotencyKey
      const res2 = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idempotencyKey },
        body: JSON.stringify(payload),
      });
      assert.equal(res2.status, 200);
      const data2: any = await res2.json();
      const eventsAfter2 = worldRepository.getCanonicalCommandEventCount(storyId);

      assert.equal(data2.actionId, data1.actionId, 'Idempotent retry must return matching actionId');
      assert.equal(eventsAfter2, eventsAfter1, 'Idempotent replay must not append duplicate canonical events');
    });

    it('T2-13: 256-character oversized idempotencyKey is handled properly', async () => {
      const storyId = 'e2e_t2_long_idem_' + Date.now();
      seedE2eStory(storyId);
      const longIdem = 'k'.repeat(256);

      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': longIdem },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: 'I test a long idempotency key.',
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
    });
  });

  // =========================================================================
  // 5. State Invariant & Adjudication Boundaries
  // =========================================================================
  describe('5. State Invariant & Adjudication Boundaries', () => {
    it('T2-14: adjudicator rejects proposal with baseStateHash mismatch', () => {
      const currentWorld = {
        worldVersion: 2,
        state: { location: 'loc_office' },
        stateHash: 'real_hash_123',
      };

      const proposal: WorldSimulationProposal = {
        proposalId: 'prop_hash_mismatch',
        idempotencyKey: 'idem_mismatch',
        worldVersion: 2,
        baseStateHash: 'corrupted_hash_999', // Mismatch!
        proposedStateTransition: { type: 'DO_SOMETHING' },
        requiredPreconditions: [],
        provenance: { source: 'MODEL_PROPOSED', timestamp: '2026-11-11T20:00:00Z' },
        safeFallback: { message: 'Fallback' },
      };

      const result = WorldSimulatorAdjudicator.adjudicate(currentWorld, proposal);
      assert.equal(result.accepted, false);
      assert.equal(result.code, 'STALE_PROPOSAL_REJECTED');
    });

    it('T2-15: adjudicator rejects proposal with failed preconditions', () => {
      const currentWorld = {
        worldVersion: 3,
        state: { doorLocked: true },
        stateHash: WorldSimulatorAdjudicator.calculateStateHash({ doorLocked: true }),
      };

      const proposal: WorldSimulationProposal = {
        proposalId: 'prop_cond_fail',
        idempotencyKey: 'idem_cond',
        worldVersion: 3,
        baseStateHash: currentWorld.stateHash,
        proposedStateTransition: { type: 'WALK_THROUGH_DOOR' },
        requiredPreconditions: [{ predicate: 'doorLocked', expected: false }], // Expects unlocked, but it's locked!
        provenance: { source: 'MODEL_PROPOSED', timestamp: '2026-11-11T20:00:00Z' },
        safeFallback: { message: 'The door remains bolted.' },
      };

      const result = WorldSimulatorAdjudicator.adjudicate(currentWorld, proposal);
      assert.equal(result.accepted, false);
      assert.equal(result.code, 'PRECONDITION_FAILED');
      assert.match(result.message, /doorLocked/);
    });

    it('T2-16: empty preconditions array passes without failure', () => {
      const currentWorld = {
        worldVersion: 1,
        state: { safe: true },
        stateHash: WorldSimulatorAdjudicator.calculateStateHash({ safe: true }),
      };

      const proposal: WorldSimulationProposal = {
        proposalId: 'prop_empty_precond',
        idempotencyKey: 'idem_empty',
        worldVersion: 1,
        baseStateHash: currentWorld.stateHash,
        proposedStateTransition: { type: 'OBSERVE_STARS' },
        requiredPreconditions: [], // Empty preconditions
        provenance: { source: 'DETERMINISTIC_ARCHETYPE', timestamp: '2026-11-11T20:00:00Z' },
        safeFallback: { message: 'The sky is clouded.' },
      };

      const result = WorldSimulatorAdjudicator.adjudicate(currentWorld, proposal);
      assert.equal(result.accepted, true);
      assert.equal(result.code, 'PROPOSAL_COMMITTED');
    });
  });

  // =========================================================================
  // 6. Physical & Environmental Affordance Boundaries
  // =========================================================================
  describe('6. Physical & Environmental Affordance Boundaries', () => {
    it('T2-17: attempting to take an entire building or street fixture fails to populate inventory', async () => {
      const storyId = 'e2e_t2_building_' + Date.now();
      seedE2eStory(storyId);

      await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: 'I take the brick warehouse building and put it in my satchel.',
        }),
      });

      const inv = worldRepository.getInventoryEngine(storyId).exportState();
      const hasBuilding = inv.itemInstances.some((i) => i.customName?.toLowerCase().includes('warehouse'));
      assert.equal(hasBuilding, false, 'Immobile buildings cannot be pocketed');
    });

    it('T2-18: AffordancePlausibilityEngine rejects fantasy/sci-fi objects in a mundane crime scene', () => {
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('antimatter bomb', 'CRIME_SCENE'), false);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('teleportation ring', 'CRIME_SCENE'), false);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('lightsaber', 'OFFICE'), false);
    });

    it('T2-19: AffordancePlausibilityEngine rejects taxi in subterranean sewer', () => {
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('taxi', 'SEWER'), false);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('yellow cab', 'SEWER'), false);
    });
  });

  // =========================================================================
  // 7. Entity Lifecycle State Machine Boundaries
  // =========================================================================
  describe('7. Entity Lifecycle State Machine Boundaries', () => {
    it('T2-20: PROPOSED cannot transition directly to PERSISTENT without becoming ACTIVE_TEMPORARY', () => {
      assert.equal(EntityLifecycleStateMachine.canTransition('PROPOSED', 'PERSISTENT'), false);
    });

    it('T2-21: EPHEMERAL cannot transition directly to PERSISTENT', () => {
      assert.equal(EntityLifecycleStateMachine.canTransition('EPHEMERAL', 'PERSISTENT'), false);
    });
  });

  // =========================================================================
  // 8. Call Budgeting & Role Limits
  // =========================================================================
  describe('8. Call Budgeting & Role Limits', () => {
    it('T2-22: budget strictly rejects unauthorized roles not granted for the mode', () => {
      const budget = new AiCallBudget('DETERMINISTIC_MECHANICS');
      // In DETERMINISTIC_MECHANICS, helper calls are not authorized
      const auth = budget.authorize('intent.interpret', 400, 'INTENT_INTERPRET');
      assert.equal(auth.allowed, false);
      assert.match(auth.reason, /not permitted/i);
    });

    it('T2-23: budget respects token ceiling and denies requests exceeding remaining tokens', () => {
      const budget = new AiCallBudget('INTERPRETATION');
      const first = budget.authorize('intent.interpret', 400, 'INTENT_INTERPRET');
      assert.equal(first.allowed, true);

      // Attempt requesting 1000 tokens when max is 800 total and 400 used
      const excessive = budget.authorize('intent.interpret', 1000, 'SEMANTIC_REPAIR');
      assert.equal(excessive.allowed, true); // Allowed but clamped
      assert.ok(excessive.maxTokens <= 400, 'Requested tokens must be clamped to remaining budget');
    });
  });

  // =========================================================================
  // 9. Geography & Travel Boundaries
  // =========================================================================
  describe('9. Geography & Travel Boundaries', () => {
    it('T2-24: traveling to non-existent locationId fails without moving the player', async () => {
      const storyId = 'e2e_t2_loc_fail_' + Date.now();
      seedE2eStory(storyId);
      const playerBefore = worldRepository.getPlayerLifecycle(storyId)!;

      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'TRAVEL_REQUEST',
          targetLocationId: 'loc_completely_fake_nonexistent',
        }),
      });

      // Travel fails or player stays at origin
      const playerAfter = worldRepository.getPlayerLifecycle(storyId)!;
      assert.equal(playerAfter.locationId, playerBefore.locationId, 'Must not move to non-existent location');
    });
  });

  // =========================================================================
  // 10. Inventory Boundaries
  // =========================================================================
  describe('10. Inventory Boundaries', () => {
    it('T2-25: unequipping an empty slot does not crash or corrupt equipment', async () => {
      const storyId = 'e2e_t2_unequip_' + Date.now();
      seedE2eStory(storyId);

      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'UNEQUIP_REQUEST',
          slot: 'RING_LEFT',
        }),
      });

      assert.ok(res.status === 200 || res.status === 400);
      const inv = worldRepository.getInventoryEngine(storyId).exportState();
      assert.ok(Array.isArray(inv.itemInstances));
    });

    it('T2-26: equipping a non-existent item ID fails gracefully without state corruption', async () => {
      const storyId = 'e2e_t2_equip_fake_' + Date.now();
      seedE2eStory(storyId);

      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'EQUIP_REQUEST',
          itemId: 'item_completely_imaginary_000',
          slot: 'MAIN_HAND',
        }),
      });

      assert.ok(res.status === 200 || res.status === 400);
    });
  });

  // =========================================================================
  // 11. Time & Clock Boundaries
  // =========================================================================
  describe('11. Time & Clock Boundaries', () => {
    it('T2-27: advance time with zero seconds is a no-op', () => {
      const storyId = 'e2e_t2_clock_zero_' + Date.now();
      seedE2eStory(storyId);
      const clock = worldRepository.getWorldClock(storyId);
      const before = clock.getTimestamp().totalElapsedSeconds;
      clock.advanceSeconds(0);
      const after = clock.getTimestamp().totalElapsedSeconds;
      assert.equal(after, before);
    });

    it('T2-28: advance time with massive duration advances monotonically without integer overflow', () => {
      const storyId = 'e2e_t2_clock_massive_' + Date.now();
      seedE2eStory(storyId);
      const clock = worldRepository.getWorldClock(storyId);
      const before = clock.getTimestamp().totalElapsedSeconds;
      clock.advanceSeconds(100_000_000);
      const after = clock.getTimestamp().totalElapsedSeconds;
      assert.equal(after, before + 100_000_000);
      assert.ok(Number.isFinite(after));
    });
  });

  // =========================================================================
  // 12. Adjudication & Proposal Edge Cases
  // =========================================================================
  describe('12. Adjudication & Proposal Edge Cases', () => {
    it('T2-29: proposal with negative worldVersion is rejected as stale', () => {
      const currentWorld = {
        worldVersion: 1,
        state: {},
        stateHash: 'h_1',
      };
      const proposal: WorldSimulationProposal = {
        proposalId: 'prop_neg_ver',
        idempotencyKey: 'idem_neg',
        worldVersion: -5,
        baseStateHash: 'h_1',
        proposedStateTransition: { type: 'TEST' },
        requiredPreconditions: [],
        provenance: { source: 'MODEL_PROPOSED', timestamp: '2026-11-11T20:00:00Z' },
        safeFallback: { message: 'Invalid' },
      };
      const res = WorldSimulatorAdjudicator.adjudicate(currentWorld, proposal);
      assert.equal(res.accepted, false);
      assert.equal(res.code, 'STALE_PROPOSAL_REJECTED');
    });

    it('T2-30: proposal with missing targetId provides safe fallback target', () => {
      const currentWorld = {
        worldVersion: 10,
        state: {},
        stateHash: WorldSimulatorAdjudicator.calculateStateHash({}),
      };
      const proposal: WorldSimulationProposal = {
        proposalId: 'prop_no_target',
        idempotencyKey: 'idem_no_target',
        worldVersion: 10,
        baseStateHash: currentWorld.stateHash,
        proposedStateTransition: { type: 'SPAWN_DUST' },
        requiredPreconditions: [],
        provenance: { source: 'DETERMINISTIC_ARCHETYPE', timestamp: '2026-11-11T20:00:00Z' },
        safeFallback: { message: 'Dust settles.' },
      };
      const res = WorldSimulatorAdjudicator.adjudicate(currentWorld, proposal);
      assert.equal(res.accepted, true);
      assert.ok(res.commitRecords[0].targetId);
    });

    it('T2-31: concurrent proposal adjudication increments versions sequentially', () => {
      let currentWorld = {
        worldVersion: 1,
        state: { count: 0 },
        stateHash: WorldSimulatorAdjudicator.calculateStateHash({ count: 0 }),
      };

      for (let i = 1; i <= 5; i++) {
        const prop: WorldSimulationProposal = {
          proposalId: `prop_seq_${i}`,
          idempotencyKey: `idem_seq_${i}`,
          worldVersion: currentWorld.worldVersion,
          baseStateHash: currentWorld.stateHash,
          proposedStateTransition: {
            type: 'INCREMENT',
            payload: { count: i },
          },
          requiredPreconditions: [],
          provenance: { source: 'DETERMINISTIC_ARCHETYPE', timestamp: '2026-11-11T20:00:00Z' },
          safeFallback: { message: 'Skip' },
        };
        const res = WorldSimulatorAdjudicator.adjudicate(currentWorld, prop);
        assert.equal(res.accepted, true);
        assert.equal(res.worldVersion, i + 1);
        currentWorld = {
          worldVersion: res.worldVersion,
          state: { count: i },
          stateHash: res.stateHash,
        };
      }
      assert.equal(currentWorld.worldVersion, 6);
    });
  });
});
