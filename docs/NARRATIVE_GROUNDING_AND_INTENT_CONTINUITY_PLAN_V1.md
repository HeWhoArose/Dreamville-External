# Dreamville — Narrative Grounding, Intent Continuity & Opportunity Integrity Plan
## Research-to-Codebase Crosswalk and Phase-1 Extension
**Version:** 1.0  
**Status:** Proposed implementation plan — documentation draft  
**Reviewed baseline:** `main` at `090b7d7b8c8b9c6ef47a0f643af3b15a303e1179` (2026-10-15)  
**Repository:** `HeWhoArose/Dreamville-External`

---

## 1. Executive decision

**Do not restart Dreamville's architecture, replace the existing Phase-1 plan, or introduce a second narrative/memory/world engine.** The research identifies useful patterns, but this repository already implements much of the architecture that the broad comparative report recommended.

The correct action is to **extend the active Live Model Behavioral Validation work** with additional cases for information-seeking continuity, authoritative opportunity lookup, rejected candidates, and fallback behavior. Fix only gaps reproduced by those tests, within the existing owning modules. This document is the research-to-codebase crosswalk and the implementation sequence; it is not a new parallel runtime architecture.

### Decision at a glance

| Research recommendation | Decision for Dreamville | Reason |
|---|---|---|
| Separate canonical mechanics/state from generated prose | **Keep and verify** | The repository has a canonical `WorldRepository`, action/state systems, typed current-situation context, and separate narration/review stages. |
| Add a canonical current-situation model | **Do not rebuild** | `CurrentSituationBuilder` and `CurrentSituation` already exist and are consumed by intent, research and narration paths. Verify coverage and integration instead. |
| Add intent classification and follow-up handling | **Extend the existing interpreter** | `PlayerIntentInterpreter` already covers information-seeking, job/contract inquiries, and “check further”; existing tests do not yet prove that a vague follow-up inherits the *same previous objective*. |
| Add authoritative job/contract lookup | **Targeted gap to investigate and likely implement** | `PlayerStateQueryResolver` currently handles currency and inventory summary, while job/contract intent currently relies on broader scene/context/research pathways. Confirm the canonical opportunity source before adding a small resolver/projection. |
| Add semantic grounding/review | **Keep and test the existing gates** | `SemanticNarrativeReview` is called in the live narrative-only provider-candidate validator and in full-turn narrative review. The need is to verify every terminal/rewrite path and information result against authoritative evidence. |
| Add model fallback/retry | **Do not add a new fallback framework** | Task-scoped routing, provider fallback, call budgets and deterministic emergency handling already exist. Prove that rejected output is never returned and that fallback provenance is accurate. |
| Add a persistent SQL/vector database for narrative facts | **Not justified by this evidence** | `WorldRepository`, continuity/memory components, and persistence/long-session tests already exist. Do not add a second store without a demonstrated retrieval or durability failure. |
| Add a multi-agent or graph-memory architecture | **Defer / not needed for this fix** | It adds synchronization and operational complexity without addressing the immediate regression more directly than the existing modules. |
| Make the world more lively | **Use existing world-activity/simulation owners** | `WorldActivityDirector` and `LivingWorldSimulation` already exist. Verify their events are canonically grounded and consumed; do not let narration improvise permanent people, jobs or encounters. |

## 2. Review of the current plans

The repository has several plan/specification documents with overlapping language. They should be treated as related contracts with distinct ownership, not as one sequential list of unfinished features.

### 2.1 Active execution plan: `docs/PHASE1_LIVE_MODEL_BEHAVIORAL_VALIDATION.md`

**Keep this plan as the immediate workstream and extend it. Do not replace it.**

It currently tests five useful behavior families:
- approach a known disturbance without inventing its source or patrol arrival;
- observe a target and guards without losing them behind scenic prose;
- narrate a canonical impact/consequence accurately;
- preserve a quiet/no-change turn without manufacturing drama;
- preserve continuity across a multi-turn sequence.

It already defines meaningful pass/fail criteria and captures provider/model, fallbacks, StoryBeat, N18 decision, rewrites, latency, token budget and fallback provenance. Those are good foundations.

**What is missing for the research problem:** there is no dedicated scenario for carrying the previous information goal forward through a vague follow-up; no fully connected case proving that questions about jobs/contracts resolve against a canonical opportunity source; and no explicit end-to-end assertion that rejected primary and fallback candidates cannot leak to the player. Add these scenarios to the current plan and execute them in the same active validation workstream.

### 2.2 Broad execution specification: `docs/DREAMVILLE_DEEP_IMPLEMENTATION_SPECIFICATION.md`

**Do not blindly restart its Phase 0–21 sequence. Audit and reuse its contracts.**

The specification's conceptual Phase 1 is “Canonical Current Situation Model” and Phase 2 is “Semantic Player Intent Interpreter.” In the current repository, `CurrentSituationBuilder`, `PlayerIntentInterpreter`, and downstream consumers already exist. Those phase descriptions therefore serve as design/acceptance contracts to compare against current code, not proof that their implementation is absent.

The separate `PHASE1_LIVE_MODEL_BEHAVIORAL_VALIDATION.md` also uses “Phase 1,” but means live-model behavior validation. This duplicate numbering is ambiguous. Preserve existing filenames/links for now, but label the live-model document as the **active behavioral-validation phase** in future edits. Do not reorder the full master specification just to resolve this local naming issue.

### 2.3 Implemented narrative focus layer: `docs/STORY_BEAT_DIRECTOR_IMPLEMENTATION_PLAN.md`

The document says StoryBeatDirector is implemented and runtime-verified on main. Keep it. Its explicit non-goals—no second world simulator, NPC agency system, plot engine, memory system, epistemic system, context engine, AI router, or persistent StoryBeat database—are directly relevant to this plan.

The new work must consume StoryBeat and the existing situation/research/continuity projections. It must not create another “meaningful beat” or narrative planning subsystem.

### 2.4 Existing orchestration, memory and integration contracts

Keep their ownership boundaries:
- `docs/AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md` and `docs/AI_ORCHESTRATION_IMPLEMENTATION_PLAN_V1.md`: task routing, provider selection, fallback, budgets and task contracts.
- `docs/PERSISTENT_MULTIWORLD_AND_MEMORY_IMPLEMENTATION_PLAN_V1.md`: durable world/run state and memory lifecycle.
- `docs/STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md`: player-facing Story/OOC/Continue interaction.
- `docs/DREAMVILLE_STORY_CAPABILITY_INTEGRATION_ROADMAP.md`: cross-system integration boundaries.
- `docs/LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md` and the existing world activity/simulation modules: population, ambient activity and encounter opportunities.
- `docs/SYSTEM_WIDE_AUDIT_FINAL_REPORT.md`: prior controlled mock evidence, including a 125-turn persistent-world marathon and failure-injection work. Its baseline predates the current main head, so use it as prior evidence—not as proof the latest commit passed the same complete verification.

### 2.5 Documentation conflict to resolve deliberately

The root `README.md` still describes this repository as an external UI/client whose core lives in a separate repository. `DREAMVILLE_DEEP_IMPLEMENTATION_SPECIFICATION.md` explicitly treats that boundary as historical and says this repository is the active standalone core for its implementation program. The current tree contains substantial server/domain, repository, simulation, orchestration and test code.

This plan follows the **current code and the implementation specification's stated working assumption**, but the project owner should eventually reconcile the README and specification so future agents do not apply conflicting ownership rules. That cleanup is documentation-only and should not block the behavior fixes below.

## 3. Current implementation assessment (main baseline above)

Classifications mean **implemented in code** versus **proven behavior across the complete live path**; they are not interchangeable.

| Concern | Current evidence | Assessment | Action |
|---|---|---|---|
| Current scene / visible entities / knowledge boundary | `server/domain/currentSituation.ts`, `CurrentSituationBuilder`, `WorldRepository` | **Implemented; coverage must be verified for opportunity queries** | Reuse these projections and canonical IDs. Do not construct a duplicate scene model. |
| Intent recognition | `server/domain/playerIntentInterpreter.ts` has `INFORMATION_SEEKING`, `informationGoal`, opportunity-topic patterns, and a deterministic path for “check further.” | **Implemented, but objective inheritance is incomplete/unproven** | Add a multi-turn test that asserts a prior job-search objective remains a job-search objective, not merely that the follow-up is classified as information-seeking. |
| Test for the user's example | `tests/player-intent-interpreter.test.ts` has “follow-up request to check further remains information-seeking”; it asserts the generic goal “learn what can be discovered…” | **Partial** | Preserve the original objective/source across follow-ups using existing turn/continuity context. Do not add a broad new memory subsystem. |
| Canonical opportunity answer | `server/domain/playerStateQueryResolver.ts` currently declares `CURRENCY_BALANCE` and `INVENTORY_SUMMARY`; it does not declare a job/contract query kind. `NarrativeResearchPipeline` can use `informationGoal`. | **Gap to close after identifying the authoritative source** | Locate the canonical source for active postings/contracts/quests. If there is one, expose a bounded query/projection with evidence IDs. If there is none, report that the system cannot verify postings rather than having the narrator fabricate them. |
| Invented object/job rejection | `server/domain/semanticNarrativeReview.ts` checks physical object/environment claims, information-seeking, epistemic boundaries and unsupported state proposals. `tests/semantic-narrative-review.phase6.test.ts` rejects an invented dockside notice board/job postings and atmospheric answers to information-seeking. | **Implemented at review level; end-to-end proof still required** | Keep unit tests and add a live-pipeline provider-candidate/fallback integration case. |
| Pre-output candidate gate | `server/domain/aiOrchestrator.ts`, `generateNarrativeOnly` passes each provider candidate through continuity checks and `SemanticNarrativeReview.review`; a non-`ACCEPT` decision returns `valid: false` to candidate selection. | **Implemented in the inspected path** | Prove primary rejection → next provider/repair behavior → final output; verify terminal output cannot bypass final review. |
| Bounded repair in orchestrated turns | `reviewAndRepairNarrative` performs a semantic review, permits one rewrite when authorized, then requires the rewritten package to pass semantic review. Full-turn flow also applies semantic/literary/richness checks. | **Implemented; must test failure cases** | Keep bounded. If a rewrite fails review, fail over or return a safe failure—never accept the rejected text for convenience. |
| Provider exhaustion / deterministic fallback | The narrative-only path calls provider generation with `allowDeterministicFallback: false` and returns `success: false` on total provider failure or a deterministic-fallback marker. Other orchestration paths have a deterministic emergency floor and review checks. | **Path-dependent and explicit** | Do not force a generic fallback into every route. Test each route's contract and verify that fallback source/reason is visible in diagnostics. |
| World life and chance encounters | `server/domain/worldActivityDirector.ts` defines ambient activity, social opportunities, potential encounters and NPC-initiated interaction; `server/domain/livingWorldSimulation.ts` holds scheduled activities/events and simulation tiers. | **Subsystems exist; runtime grounding/integration must be tested** | Reuse these owners. Make sure candidate events become authorized, visible, canonical facts before the narrator describes them as present. |
| Durable state and memory | `WorldRepository`, `narrativeContinuityEngine.ts`, `memoryOpportunityEngine.ts`, `narrativeMemoryLifecycle.ts`, and persistence plans/tests exist. | **Implemented architecture; exact deployment durability is a separate verification concern** | No new SQL/vector DB for this issue unless a reproducible retrieval/durability test proves a missing capability. |
| Test quality | Unit tests cover intent patterns and semantic review. Prior audit describes a 125-turn mock marathon and chaos tests, but not real-model prose behavior. | **Strong base; specific end-to-end gaps remain** | Add narrow tests, then run the complete existing gates. Real-model acceptance must be truthfully labelled and run with actual provider credentials. |

## 4. Behavioral contract to implement

For every action, Dreamville should preserve this chain:

**Player words → interpreted intent/objective → authoritative data/research → canonical consequence or evidence-bound non-answer → candidate narration → semantic/epistemic gate → accepted presentation.**

The model may express what is established, distinguish rumor from fact, and add descriptive prose supported by scene evidence. It must not create an actual contract, job, person, prop, discovery, state change or NPC reaction solely because that would make the turn more satisfying.

At the same time, **grounding must not make the world sterile**. NPCs can approach, merchants can call out, guild clerks can advertise real postings, and chance encounters can happen—but the owning world activity/event system must create and authorize the event first. The narrator's role is to present such events, not silently instantiate them as facts.

### 4.1 Three different information outcomes

An opportunity lookup must distinguish:

1. **FOUND** — one or more canonical, currently available opportunities were retrieved. Return only those opportunities, their valid source/location and their supported status.
2. **CONFIRMED_EMPTY** — the authoritative source is known to be complete for the requested scope and contains no matching active opportunities. The response may say no matching postings are currently listed.
3. **UNKNOWN / NOT_MODELED / UNAVAILABLE** — the data source is missing, incomplete or unavailable. Do not turn this into “there are no jobs,” and do not fabricate postings. Explain the limitation in player-facing language or provide a grounded next step.

“Not in the prompt” does not mean “does not exist.” “Not found in an incomplete registry” does not mean “confirmed empty.”

### 4.2 Information-goal continuity

If the player asks about jobs/contracts and then says “I check further for what I can do,” the follow-up should keep the active inquiry unless the player clearly changes topic. The system should:
- resolve the current phrase against the last relevant information-seeking objective and source;
- preserve the distinction between the objective and the most recent prose;
- reuse current canonical/research evidence, then refresh it if world state may have changed;
- avoid repeating the same result as if newly discovered;
- permit the player to redirect or abandon the inquiry explicitly;
- record which prior turn/objective was inherited for debugging and tests.

Use recent turns, current intent, active threads and existing continuity data first. Add only the smallest missing typed continuation field or bounded projection if those are insufficient; do not build general-purpose semantic memory for this.

## 5. Prioritized implementation sequence

The phases below are **work packages within the existing plan**, not a replacement for Dreamville's global phase numbering.

### Work package 0 — Freeze the evidence baseline

**Owner:** current Phase-1 validation workstream  
**Code change:** none initially

1. Confirm current branch/head before each implementation PR.
2. Run the focused intent and semantic-review suites.
3. Run `npm run lint`, `npm test` and `npm run build`; capture exact outcomes. If a single-process full test run is constrained by the environment, use the repository's documented complete batched-equivalent procedure and capture all batch exit codes.
4. Inspect how current story records expose quests, contracts, notices, interactions and activity events. Trace the canonical producer, repository storage, current-situation projection, research consumer and player-visible route.
5. Record which source is authoritative and whether the source can establish `CONFIRMED_EMPTY`.

**Exit:** a short evidence table with the exact producer, data shape, authority, consumer, tests and any orphan path. Do not add a new data store before this exists.

### Work package 1 — Extend the current Phase-1 behavioral matrix

**Owner:** `docs/PHASE1_LIVE_MODEL_BEHAVIORAL_VALIDATION.md`  
**Code change:** tests/harness first; production change only when a test reproduces a defect

Keep current scenarios A–E. Add the following.

#### F — Canonical job/contract inquiry

1. Create a scene whose authoritative records contain two available opportunities.
2. Ask where opportunities are listed, then ask to check/read the postings.
3. Ask about available jobs/contracts.

**Pass:** results identify only the canonical active entries; unavailable/completed entries are excluded; no invented notice board, job title, NPC, reward, urgency or location is presented as fact.

#### G — Vague follow-up preserves the active information objective

1. Ask for available jobs/contracts.
2. Have the system return grounded results.
3. Player says: “I check further for what I can do.”
4. Repeat with “What else?”, “Look further,” and “Anything else available?”

**Pass:** the interpreted goal remains the same active opportunity inquiry unless the player clearly redirects. The result must come from a refreshed/known canonical source or an explicit evidence-bound non-answer. The follow-up must not degrade into generic scene description or invent another job.

#### H — Empty versus unknown opportunity data

Run three fixtures: active postings exist; the authoritative posting source is complete but empty; posting data is unavailable or not modeled.

**Pass:** the response distinguishes FOUND, CONFIRMED_EMPTY and UNKNOWN/UNAVAILABLE. It never fabricates a posting and never calls an incomplete source proof that none exists.

#### I — Rejected candidate and fallback integrity

Feed the live candidate-validation path:
- a primary model response inventing a notice board and a contract;
- a fallback model response that repeats or adds the unsupported claims;
- a valid later candidate;
- and a case where all candidates fail.

**Pass:** rejected candidates are not player-visible; the system accepts only a grounded candidate or returns the route's safe failure/floor according to its contract. A less-grounded fallback may never win simply because the primary model failed. Attempt trail and fallback provenance are preserved.

#### J — Populated, quiet, restricted and genuinely empty scenes

Use canonical fixtures for (a) scheduled NPC activity; (b) a quiet but populated place; (c) a restricted place with a guard/entry rule; and (d) a location genuinely authored as deserted.

**Pass:** the narrator respects the supplied population/activity/visibility evidence. Absence from a truncated context is not treated as proof of abandonment. No NPC must be injected into every scene. A new chance encounter is acceptable only if the existing event/activity pipeline has created an authorized event that the player can perceive.

#### K — Real-model behavioral check

Run A–J where the configured model credentials are available. Keep deterministic fixtures/integration checks in CI; do not describe mocks as live-model passes.

**Pass:** the actual selected model/fallback path and final accepted output are captured. The report identifies any provider failures and separates literary quality from deterministic authority checks.

### Work package 2 — Close the objective-continuity gap

**Primary owner:** `server/domain/playerIntentInterpreter.ts`  
**Consumers to inspect:** `CurrentSituationBuilder`, `NarrativeResearchPipeline`, `NarrativeDirector`, `NarrativeContinuityEngine`, `aiOrchestrator.generateNarrativeOnly`

1. Start from the existing deterministic intent and its current follow-up tests.
2. Add a multi-turn regression whose previous `informationGoal` is “find available work, jobs, contracts, tasks, or notices” and whose next action is “I check further for what I can do.”
3. Assert both intent classification **and inherited objective/source**, not merely `interactionMode === INFORMATION_SEEKING`.
4. Use a current relevant turn/objective from existing context or continuity data; do not infer the objective from the narrator's own unsupported prose.
5. Add an expiry/redirect rule so unrelated later actions do not inherit stale intent indefinitely.
6. Ensure the AI intent fallback cannot remove the deterministic inherited objective or inject unrelated targets.

**Acceptance:** generic follow-up wording retains the specific prior objective and its canonical source. Clear topic changes work. The original player text remains available for audit. No new persistent memory subsystem is created.

### Work package 3 — Add a minimal authoritative opportunity projection

**Owner:** first the verified canonical source; then the narrow query/projection module that owns its access  
**Potential integration points:** `WorldRepository`, `CurrentSituationBuilder`, `NarrativeResearchPipeline`; do not assume any existing quest/contract list is authoritative until verified.

1. Identify whether jobs, commissions, quests, bounty boards, merchant offers or contracts are already represented as canonical records/events.
2. If they are, expose a bounded query for relevant active opportunities using stable IDs, active/available status, scope/location, source and provenance.
3. If the only current source is world activity or scene prose, determine whether that subsystem creates an actual canonical opportunity or merely descriptive ambient activity. Do not treat the phrase “sorting posted contracts” as proof a specific contract record exists.
4. Include the bounded result as protected, source-labelled context for information-seeking turns.
5. Return explicit status: FOUND, CONFIRMED_EMPTY, or UNKNOWN/UNAVAILABLE.
6. Keep the query read-only. Accepting a contract/quest must remain a separate canonical mutation and validation path.
7. Prefer extending the existing domain/repository contract over adding a parallel opportunity database. Add a dedicated small resolver only if the ownership boundary warrants it.

**Acceptance:** every displayed opportunity traces to a canonical record/event or explicit authored fact; confirmed-empty is emitted only when completeness is known; read/query does not mutate the world.

### Work package 4 — Verify candidate gate and fallback as one connected path

**Owner:** `server/domain/aiOrchestrator.ts`, `server/domain/semanticNarrativeReview.ts` and existing task-routing contracts

1. Keep `SemanticNarrativeReview` as the deterministic semantic/epistemic gate; do not replace it with a second reviewer agent.
2. Prove every ordinary narrative provider candidate goes through the existing `validateResponse` path and fails closed when the semantic review decision is not ACCEPT.
3. Prove repaired candidates are revalidated after structured-package/presentation checks and semantic review.
4. Prove all terminal paths are safe: accepted provider; primary rejected then fallback accepted; rewrite rejected; all providers unavailable; malformed response; timeout; call-budget exhaustion; deterministic emergency narration where that route permits it.
5. Maintain the route-specific rule: the inspected `generateNarrativeOnly` path explicitly disables deterministic fallback and returns a failure when generation is exhausted, while other orchestration paths have a deterministic emergency floor. Do not change these contracts globally without a demonstrated product need.
6. Ensure a failure does not mutate world state, add memory, create an event, advance time or expose the raw rejected text.
7. Keep fallback/model/source/reason and rejected-candidate diagnostics in telemetry, without leaking internal diagnostics to the player.

**Acceptance:** no unreviewed narrative candidate reaches the player; no fallback bypasses semantic, epistemic, temporal, scene and action-continuity checks appropriate to its path. Retries are bounded by the existing per-turn call budget.

### Work package 5 — Preserve world liveliness without narrator fabrication

**Owners:** `server/domain/worldActivityDirector.ts`, `server/domain/livingWorldSimulation.ts`, relevant world repository/simulation and encounter tests

This work package is **conditional on Work package 1 identifying a real integration defect**; it is not permission to bolt a new event generator onto narration.

1. Trace when a `WorldActivityEvent` is generated, when the related NPC/event becomes canonical, how it is scoped to location/time, and how `CurrentSituationBuilder` projects it to the player.
2. Verify schedule/time and lifecycle constraints; an off-duty or absent NPC must not be narrated as present merely because a generic social pattern exists.
3. Verify potential encounters and NPC-initiated interactions are delivered through authorized actions/events before narration treats them as occurred.
4. Verify a merchant can call out wares, a guild clerk can mention an actually active contract, and an NPC can approach/initiate conversation when existing world systems select those events.
5. Keep “chance encounter possible” distinct from “this encounter has happened.” An uncommitted candidate can be used to resolve a world event but must not be narrated as established fact.
6. Model absence carefully: a known deserted place may be described as deserted; a quiet observation or missing context must not automatically rewrite the location as abandoned.

**Acceptance:** world activity remains capable of producing encounters and social opportunities, while every concrete present-tense claim has canonical or explicit authored backing.

### Work package 6 — Regression, long-session and live acceptance

Run after any implementation slice that changes behavior.

1. Focused tests for intent continuity and opportunity query.
2. Focused semantic narrative review tests.
3. Provider-candidate/fallback integration tests with deterministic adapters and explicit failure injection.
4. Existing `npm run lint`, `npm test`, `npm run build` gates.
5. Existing cross-system and long-session/marathon/chaos tests where applicable; do not weaken tests or silently skip failures.
6. Live-model scenarios A–K with actual credentials after automated tests pass.
7. Repeat the architecture audit: producers → contracts → consumers; consumers → producers; state mutation, memory, UI/API and fallback paths.
8. Commit the final evidence: baseline commit, selected models/providers, attempts, outputs, review decisions, test results and remaining limits.

A human/live-model run may be postponed if the required credentials or live environment are unavailable, but must be marked **NOT RUN**, never counted as passed. All code-verifiable work should continue while live access is unavailable.

## 6. Test and instrumentation requirements

Every scenario should capture, where applicable:
- original player action and interpreted intent;
- inherited objective/source-turn identity;
- current-situation ID/turn and evidence IDs;
- queried opportunity records and status (FOUND / CONFIRMED_EMPTY / UNKNOWN);
- candidate provider/model and attempts trail;
- semantic-review decision, violations and missing requirements;
- rewrite attempts and result;
- final accepted source/provenance;
- world state/memory/event counts before and after;
- token budget, call count and latency;
- whether the check was deterministic, mock-integrated, or live-model.

Metrics should answer “which authority or evidence was missing?” rather than merely record that a model sounded bad. Do not log secrets or expose hidden world facts to the player.

## 7. Definition of done

The work is complete only when all are true:

- [ ] Current Phase-1 scenarios A–E remain green.
- [ ] Scenarios F–J pass deterministic/integration tests.
- [ ] Scenario K has either a truthful live-model result or is explicitly marked NOT RUN with the blocker.
- [ ] “I check further for what I can do” preserves the active objective when context says it is a continuation.
- [ ] Available opportunities come from canonical evidence; no invented board/posting/NPC/reward appears as fact.
- [ ] Empty and unknown data states are not conflated.
- [ ] Every provider/rewrite/emergency path follows its own validation contract.
- [ ] Rejected candidates never reach player-visible output.
- [ ] World activity/encounter creation remains in its current owner, and a narrator cannot silently make an event canonical.
- [ ] No duplicate world store, context engine, memory subsystem, semantic reviewer or event generator is introduced.
- [ ] Full tests, lint, build, and the relevant regression/long-session gates pass.
- [ ] A final re-audit identifies no orphaned producer/consumer connection.
- [ ] The current plan and status evidence are updated truthfully.

## 8. Explicit non-goals

For this issue, do **not**:
- rewrite all global phases or restart CurrentSituation/intent implementation from zero;
- adopt a vector DB solely because a competitor uses retrieval;
- import a competitor's multi-agent architecture wholesale;
- add increasingly large regex lists as the primary semantic solution;
- have an LLM invent fallback job postings when its source data is empty;
- equate “quiet” with “abandoned” or equate missing data with confirmed absence;
- remove chance encounters to prevent hallucination;
- accept a poor candidate because it came from a fallback model;
- treat a mock test as real-model behavioral proof.

**Guiding principle:** the world simulation determines which opportunities and encounters exist; intent interpretation preserves what the player is trying to learn; retrieval selects authorized evidence; narration makes that evidence vivid; validation prevents unsupported claims from becoming player-visible fact.
