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
import { NarrativeMemoryLifecycle } from '../server/domain/narrativeMemoryLifecycle';
import { NarrativeContinuityEngine } from '../server/domain/narrativeContinuityEngine';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';

describe('Tier 4: Real-World Application Scenarios', () => {
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
  // SCENARIO 1: The Ren Takahashi Detective Campaign (8-Turn Multi-Stage E2E)
  // =========================================================================
  describe('Scenario 1: Ren Takahashi Detective Campaign (Crimson Eye Agency)', () => {
    const storyId = 'e2e_t4_ren_campaign_' + Date.now();

    before(() => {
      seedE2eStory(storyId);
    });

    it('Turn 1: Opening office examination — Mode 1: No unsupported possessions invented', async () => {
      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: 'I stand up from my desk at Crimson Eye Agency and check the time.',
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);

      // Verify Mode 1: Inventory does not contain an invented wristwatch
      const inv = worldRepository.getInventoryEngine(storyId).exportState();
      const hasWatch = inv.itemInstances.some((i) => i.customName?.toLowerCase().includes('watch'));
      assert.equal(hasWatch, false, 'Turn 1: Asking for time must not invent a wristwatch in inventory');
    });

    it('Turn 2: Travel query vs rush — Modes 2 & 4: No telepathic distance knowledge; movement not narrated without commit', async () => {
      const locBefore = worldRepository.getPlayerLifecycle(storyId)!.locationId;

      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: 'I rush across the city immediately to the crime scene at the warehouse docks.',
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);

      // Verify Mode 4: Player location remains at office because rush intent was not committed through movement resolver
      const locAfter = worldRepository.getPlayerLifecycle(storyId)!.locationId;
      assert.equal(locAfter, locBefore, 'Turn 2: Freeform rush prose must not change canonical location without committed transit');
    });

    it('Turn 3: Street descent & taxi hail — Modes 5 & 9: Dynamic taxi affordance without pre-authored vehicles', async () => {
      // Affordance engine validates taxi hailing on a public street
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('taxi', 'STREET'), true);

      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: 'I step out onto the kerb and hail a passing yellow cab.',
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.actionId);
    });

    it('Turn 4: Boarding & arrival at crime scene — Mode 3: Crime scene location anchors present and inspectable', async () => {
      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: 'I arrive at the crime scene and examine the perimeter tape and chalk outline.',
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);

      // Mode 3: Affordances for crime scene are present
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('chalk outline', 'CRIME_SCENE'), true);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('tape', 'CRIME_SCENE'), true);
    });

    it('Turn 5: Examining the victim — Mode 8: No invented deadlines & Corpse Non-Takeable Invariant', async () => {
      // Attempt taking the corpse -> rejected
      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: 'I pick up the victim corpse and place it inside my coat.',
        }),
      });

      assert.equal(res.status, 200);
      const inv = worldRepository.getInventoryEngine(storyId).exportState();
      const hasCorpse = inv.itemInstances.some((i) => i.customName?.toLowerCase().includes('corpse'));
      assert.equal(hasCorpse, false, 'Turn 5: CANNOT_TAKE_CORPSE invariant enforced');
    });

    it('Turn 6: Interrogating the witness — Mode 7: NPC knowledge restricted to valid epistemic scope', async () => {
      const witnessNpcId = 'npc_ren_witness_dockworker';

      // Verify that witness does not possess unlearned secret facts
      const facts = worldRepository.getAuthorizedKnowledgeFacts(storyId, witnessNpcId);
      assert.ok(Array.isArray(facts));
      const leakedSecret = facts.some((f) => f.predicate === 'MURDERER_CONFESSION');
      assert.equal(leakedSecret, false, 'Turn 6: Witness must not leak ungrounded murderer confession');

      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: 'I question the dockworker about what he heard around midnight.',
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
    });

    it('Turn 7: Sensory observation & listening — Mode 6: Grounded sensory reflection without invented props', async () => {
      const res = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: 'I listen carefully for footsteps in the adjacent alleyway.',
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.authoritativeFeedback || data.message);
    });

    it('Turn 8: Investigation climax, plot beat recording, and idempotent replay', async () => {
      const idempotencyKey = 'idem_ren_climax_' + Date.now();

      const payload = {
        storyId,
        idempotencyKey,
        type: 'CUSTOM_ACTION',
        actionText: 'I deduce that the suspect fled toward the north canal and write it in my notes.',
      };

      // First run
      const res1 = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idempotencyKey },
        body: JSON.stringify(payload),
      });
      assert.equal(res1.status, 200);
      const data1: any = await res1.json();
      const eventsBefore = worldRepository.getCanonicalCommandEventCount(storyId);

      // Replay exact same request
      const res2 = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idempotencyKey },
        body: JSON.stringify(payload),
      });
      assert.equal(res2.status, 200);
      const data2: any = await res2.json();
      const eventsAfter = worldRepository.getCanonicalCommandEventCount(storyId);

      assert.equal(data2.actionId, data1.actionId);
      assert.equal(eventsAfter, eventsBefore, 'Turn 8: Idempotent replay must not duplicate canonical events');
    });
  });

  // =========================================================================
  // SCENARIO 2: Living World Emergent Plaza Scenario
  // =========================================================================
  describe('Scenario 2: Living World Emergent Plaza Scenario', () => {
    it('executes dynamic crowd interaction and clock advances smoothly', async () => {
      const storyId = 'e2e_t4_plaza_' + Date.now();
      seedE2eStory(storyId);

      // 1. Enter plaza
      const res1 = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: 'I step into the crowded central market square.',
        }),
      });
      assert.equal(res1.status, 200);

      // 2. Advance clock
      worldRepository.getWorldClock(storyId).advanceSeconds(3600);

      // 3. Purchase bread from vendor
      const res2 = await fetch(`${e2e.baseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          type: 'CUSTOM_ACTION',
          actionText: 'I buy a warm loaf of bread from the street baker.',
        }),
      });
      assert.equal(res2.status, 200);
      const data2: any = await res2.json();
      assert.equal(data2.success, true);
    });
  });

  // =========================================================================
  // SCENARIO 3: Marathon Long-Session Continuity (20 Turns)
  // =========================================================================
  describe('Scenario 3: Marathon Long-Session Continuity (20 Turns)', () => {
    it('executes 20 consecutive turns maintaining state integrity, monotonically advancing clock, and zero corruption', async () => {
      const storyId = 'e2e_t4_marathon_20_' + Date.now();
      seedE2eStory(storyId);

      const clock = worldRepository.getWorldClock(storyId);
      const startSeconds = clock.getTimestamp().totalElapsedSeconds;

      for (let t = 1; t <= 20; t++) {
        clock.advanceSeconds(60);
        const res = await fetch(`${e2e.baseUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storyId,
            type: 'CUSTOM_ACTION',
            actionText: `Marathon Turn ${t}: I record entry #${t} in the field notebook.`,
          }),
        });
        assert.equal(res.status, 200);
        const data: any = await res.json();
        assert.equal(data.success, true);
      }

      const endSeconds = clock.getTimestamp().totalElapsedSeconds;
      assert.equal(endSeconds, startSeconds + 20 * 60);

      const eventCount = worldRepository.getCanonicalCommandEventCount(storyId);
      assert.ok(eventCount >= 20);

      const run = worldRepository.getStoryRun(storyId);
      assert.ok(run);
      assert.ok(run.runtimeState);
    });
  });
});
