# Dreamville — Narrative Grounding Execution Plan V2

**Status:** ACTIVE EXECUTION PLAN — Phase 1 live-model validation is **PLANNED / NOT YET PASSED** (V2 baseline run: **NOT RUN**)  
**Created:** 2026-10-17  
**Baseline reviewed:** `main` at merge commit `ce3d3cb8` (merge of PR #76)  
**Owner:** player-intent fidelity, evidence-grounded narration, objective and story-structure continuity, living-world opportunity grounding, narrative candidate/fallback validation, and live-model validation  
**Takes over from:** [`ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md`](ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md), which is **deferred to this plan** and kept as the historical record  
**Evidence inputs:** [`NARRATIVE_COMPETITIVE_RESEARCH_AND_GAP_AUDIT_2026-10-17.md`](NARRATIVE_COMPETITIVE_RESEARCH_AND_GAP_AUDIT_2026-10-17.md)  
**Authority:** [`docs/README.md`](README.md) is the document index. This file owns the work below; it does not supersede the canonical owners of any subsystem.

> **Merge and push rule:** nothing in this plan authorises merging or pushing to `main`. Every slice is delivered on its own branch and pull request, and `main` changes only with the repository owner's explicit permission.

---

## 1. Purpose and relationship to the deferred plan

### 1.1 What V2 does

V2 keeps everything the deferred plan established and adds what the research and the source audit found missing. Concretely it:

1. **Carries forward unchanged** the Phase 0–9 numbering and purposes, scenarios A–P, hard failure conditions, hard gates, status vocabulary, hand-off record and scope boundaries (restated here so this file stands alone).
2. **Adds** scenarios Q–X, new hard failure conditions, new gates, and slices X1–X9 placed in the phase where each belongs.
3. **Adds** two Phase 0 items that make later evidence trustworthy: recorder coverage verification and repository hygiene.
4. **Records** owner decisions D1–D5 that must be made before specific phases.

### 1.2 How the deferred plan is used from now on

- V2 owns phase status, gates, scope and sequencing. Where the two files differ, **V2 wins**.
- The deferred plan is retained unchanged as the historical record: CI evidence logs, PR triage, Phase 6 source findings, the connection maps in its §2, and its long-form rationale. Read it for background, not for instructions.
- Documents that say “Phase 1 of the active plan” mean **Phase 1 of this file**. Say “Phase 1 of `docs/NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md`”, not only “Phase 1”.

### 1.3 What V2 does not own

The canonical owners keep their contracts: `PlayerIntentInterpreter`, `CurrentSituationBuilder`, the canonical command and resolution layer, `NarrativeResearchPipeline`, `StoryBeatDirector` (verified implementation; do not rebuild), `NarrativeDirector`, N13–N19 projections, `AiOrchestrator`, `SemanticNarrativeReview`, `WorldActivityDirector`, `NarrativeMemoryLifecycle`, `MemoryOpportunityEngine`, and `StorySessionRecorder`. V2 extends them where a gap is demonstrated; it never replaces them.

---

## 2. What “good” means

The research (comparable systems and papers) and the project’s own goals reduce to four qualities. Every slice must improve at least one and must not weaken a hard gate.

| Quality | Player-visible meaning | How it is tested |
|---|---|---|
| **Grounded** | Narration states only what canon and the player’s knowledge support; unknown is not presented as empty or as fact | Hard gates; scenarios A–P, Q, X |
| **Consistent** | Established facts, failures and NPC details persist across many turns | Scenarios E, S, T, V; long-session run |
| **Objective-clear** | The player can tell what they are trying to do, what progress was made, and what they might do next | Scenarios G, M, R, W; objective ledger parity |
| **Rich** | Specific, varied, in-voice prose that answers the player’s action before decorating it | Novelty and richness measures; human UX review; judged layer (advisory) |

Rule inherited from the deferred plan: hard correctness gates come first; literary scores can never compensate for a factual, authority or agency violation.

---

## 3. Verified starting point

Source-read facts at `ce3d3cb8`. “Reuse” items are not to be rebuilt. “Gaps” keep their IDs through the rest of this plan. A gap marked **Confirmed** is established in source; **To verify** means Phase 0 or Phase 1 must demonstrate it before any code change.

### 3.1 Reuse (do not rebuild)

| Capability | Where |
|---|---|
| Deterministic resolution, canonical commit, AI as proposer and narrator | `server/domain/canonicalCommandEngine.ts`, `server/domain/actionResolution.ts`, `server/domain/resolutionGate.ts`, `server/repositories/worldRepository.ts` |
| Knowledge separation (world / player / NPC / AI) | `server/domain/currentSituation.ts`, `server/domain/semanticNarrativeReview.ts` |
| Budgeted working context with ACTIVE / IDLE / ARCHIVED blocks and a player-facing inspector | `server/domain/workingContextEngine.ts`, `src/components/ContextInspectorModal.tsx` |
| Research step before narration | `server/domain/narrativeResearchPipeline.ts` |
| Memory retrieval with importance, decay and bounded recency; open threads | `server/domain/memoryOpportunityEngine.ts`, `server/domain/narrativeMemoryLifecycle.ts`, N16 audit |
| Per-turn meaningful beat | `server/domain/storyBeatDirector.ts` (`StoryBeatContract`) |
| Candidate review with bounded repair and deterministic floor | `server/domain/semanticNarrativeReview.ts`, `server/domain/aiOrchestrator.ts` |
| Repetition and trope control, richness measures | `server/domain/narrativeNoveltyEngine.ts`, N18 |
| Provider fallback chains with free routes, call policy, per-turn call budget | `server/data/orchestrator_config.json`, `server/domain/aiCallPolicy.ts`, `server/domain/aiTurnCallBudget.ts` |
| Out-of-character channel with read/mutate tool boundary | `oocToolRegistry` |
| Ambient population and activity producer | `server/domain/worldActivityDirector.ts` |
| **Forensic session recorder** (capture side) | `server/domain/storySessionRecorder.ts`, `server/services/storySessionRecordingStore.ts`, routes `/api/game/story-session/{export,start,stop,validate,summary}` |

**Recorder facts that shape this plan.** The recorder (`DREAMVILLE_STORY_SESSION_RECORDING`, schema 1.1.0) already stores, per interaction: the canonical command or request, the player intent, current situation, narrative plan, research packet and audit, context audit, provider handoff, pacing, continuity and novelty state, the narration prompt and working context, the turn package, narrative and literary review, richness evaluation, state adjudication, telemetry and an attempts trail, plus before/after state hashes and lossless JSON patches. Recordings live under `.dreambook/recordings` (git-ignored). Freeform turns reach it through `canonicalCommandEngine` as `DIRECT_TURN`; the opening route writes `OPENING_SCENE`. **Capture exists; replay does not.**

### 3.2 Gaps

| ID | Gap | Status | Evidence |
|---|---|---|---|
| **G1** | No unified, player-visible objective ledger. Quests in the UI come only from authored `plannedEvents` (`GET /run-canonical-state`; predicate accepts `isQuest`/`quest`, a non-empty `objectives` array, or QUEST/MAIN_QUEST/SIDE_QUEST/STORY_QUEST categories). Five other objective-like records exist separately: `StoryThread`, `NarrativeOpenThreadRecord`, `CurrentSituation.OpenThread`, `SituationObjective` (reachable only through the Phase 8 simulation engine) and the per-turn plan `objective` | **Confirmed** | `gameRoutes.ts` (`questEvents`), `ChronicleView.tsx`, `src/types.ts`, `currentSituation.ts`, `situationEngine.ts`, `narrativeDirector.ts` |
| **G2** | `PlayerIntent.goal` and `informationGoal` are per-turn; no cross-turn continuation store | **Confirmed** | `playerIntentInterpreter.ts` |
| **G3** | No long-horizon structure. `EphemeralNarrativePlan` and `StoryBeatContract` both have `expiresAfterNarration`; no `storyArc`, `plotThread` or `foreshadow` names exist in `server/` or `src/` | **Confirmed** | `narrativeDirector.ts`, `storyBeatDirector.ts` |
| **G4** | No pushback or over-compliance policy; the review has no check for adopting an unsupported player assertion or for a bare refusal | **Confirmed** (review codes: UNSUPPORTED_CLAIM, SEMANTIC_MISMATCH, MISSING_MOVEMENT, UNSUPPORTED_STATE_PROPOSAL, UNAUTHORIZED_SPEECH, PLAYER_AGENCY, MISSING_OBSERVATION, MISSING_INFORMATION) | `semanticNarrativeReview.ts` |
| **G5** | Retrieval exists but no consolidation of older material into arc-level summaries | **Confirmed** for consolidation; retrieval quality **To verify** (scenario S) | N16 audit, `memoryOpportunityEngine.ts` |
| **G6** | Recordings cannot be replayed through review/repair/fallback; no judged evaluation layer | **Confirmed** | `storySessionRecorder.ts` has no replay path |
| **G7** | `StoryDirectorService` has three demo-specific triggers (cipher, refusal, “ruins echoes”), is reachable only through REST endpoints and tests, and has no client or turn-pipeline caller | **Confirmed** (no caller found); disposition is decision D1 | `storyDirectorService.ts`, `gameRoutes.ts` |
| **G8** | `EmergentNarrativeEngine` creates `EMERGENT_INVESTIGATION` threads titled mechanically (“Emergent Thread: … at …”); they reach `CurrentSituation` open threads and research | Reach **Confirmed**; effect on prose **To verify** | `emergentNarrativeEngine.ts`, `currentSituation.ts` |
| **G9** | Non-combat stakes and fail-forward persistence are not demonstrated | **To verify** (scenario T) | — |
| **G10** | No stall or pacing handling when an objective sits open through quiet turns | **To verify** (scenario W) | — |
| **G11** | No player-facing recap or “previously” view found | **To verify** | — |
| **G12** | Repository hygiene: generated assets were tracked, and tests rewrite tracked files (`artifacts/*.log`, `data/workstation_ledger.json`), so a normal test run dirties the tree | **Confirmed** | Git history and test runs |

---

## 4. Invariants (non-negotiable)

Carried from the deferred plan, with additions marked **(new)**.

1. **Player intent controls the turn.** Retain the exact original text, interpreted action, goal and information goal, targets, referent for elliptical input, confidence and provenance. Never silently replace the player’s goal with a more dramatic one.
2. **Evidence categories stay distinct:** canonical fact; player-known fact; authorised inference; unknown / not established; new world proposal. Narration may state 1–3 with the right certainty; 4 is never presented as known; 5 never becomes fact because a model wrote it.
3. **Unknown does not mean empty.** “No record”, “explicitly deserted”, “populated but nobody visible”, “incomplete data”, “not yet searched” and “restricted” are different states.
4. **Creativity flows through authorised mechanisms.** A world, encounter or opportunity authority proposes; validation checks location, time, population, faction, visibility, prerequisites and continuity; the existing canonical command path commits; narration describes only the committed result.
5. **One turn, one goal.** Retries and fallbacks preserve the original objective.
6. **No parallel authority.** No second situation builder, memory engine, narrative director, router or state store.
7. **Narration cannot create quests, jobs, NPCs, encounters or objectives. (new, explicit)** Anything the ledger shows comes from a canonical owner.
8. **Derived views are projections unless an owner is named. (new)** A projection stores nothing of its own.
9. **Bounded cost. (new)** No slice raises the default per-turn model-call budget without owner approval. The free-tier envelope is calibrated from the Phase 0/1 recordings, not guessed.
10. **Mock is not live.** A mock or replay never satisfies a live-model gate.
11. **Judged scores never override hard gates. (new)**

---

## 5. Phase map and where each new slice lands

Phase numbers are local to this program, as before. They do not renumber the Deep Implementation Specification, N13–N19 or the completed StoryBeatDirector history.

| Phase | Purpose | New work in V2 | Exit gate | Status |
|---|---|---|---|---|
| **0** | Baseline, authority lock, instrumentation | X5a recorder coverage; P0-H hygiene; objective, thread and director traces; CI and PR check; cost baseline; decision D1 recorded | Authority and call graph traced; baseline recorded honestly | NOT RUN |
| **1** | Live-model behavioural baseline **[HUMAN LIVE-SESSION REQUIRED]** | Scenarios Q–X; every scenario tied to a recording | Baseline report with per-scenario PASS/FAIL/BLOCKED | NOT RUN |
| **2** | Intent and objective continuity | **X1** objective ledger projection; **X1b** bounded information-goal continuation; D3 player-owned goals | G, M, R pass; ledger parity | NOT STARTED |
| **3** | Evidence and information retrieval | **X3** memory consolidation; stable evidence IDs for D2 | S pass; evidence gates | NOT STARTED |
| **4** | World population, encounters, opportunities | **X6b** thread quality; D4 world-pressure projection | Population gates; thread text grounded | NOT STARTED |
| **5** | Meaningful-beat fidelity and story structure | **X4** milestone layer; **X8** stall ladder; **X9** stakes and authorship | T, U, W pass | NOT STARTED |
| **6** | Candidate review, repair, fallback | **X2** redirection policy; Q and X review checks | Q, X pass; 100% displayed candidates reviewed | NOT STARTED |
| **7** | Post-fix live validation **[HUMAN LIVE-SESSION REQUIRED]** | Re-run A–X; compare recordings; judged layer | Full before/after report | NOT STARTED |
| **8** | Regression, long-session, release | **X5b** replay harness and hybrid evaluation; long-session S, V, W, R checks | Deterministic suite plus replay green | NOT STARTED |
| **9** | Final re-audit and completion | **X6c** orphan resolution per D1; dead-flag audit | Completion report with evidence | NOT STARTED |

### 5.1 Slice index

| Slice | Phase | Closes | One line |
|---|---|---|---|
| X5a | 0 | G6 (capture side), G12 partly | Verify and, only if missing, extend recorder coverage; behaviour-neutral |
| P0-H | 0 | G12 | Hygiene: ignore rules, untracked generated assets, tests stop dirtying tracked files |
| X1 | 2 | G1 | Objective ledger as a read-only projection with a visible current objective |
| X1b | 2 | G2 | Bounded, expiring information-goal continuation |
| X3 | 3 | G5 | Arc-level memory summaries through the existing memory owner |
| X6b | 4 | G8 | Grounded emergent-thread text or suppression |
| X4 | 5 | G3 | Milestone layer on planned events, evaluated deterministically |
| X8 | 5 | G10 | Stall ladder using only committed world mechanisms |
| X9 | 5 | G9 | Persistent non-combat consequences and canonical-content authorship |
| X2 | 6 | G4 | Redirection policy plus over-compliance and name-leak checks |
| X5b | 8 | G6 | Replay harness and hybrid evaluation |
| X6c | 9 | G7 | Execute the D1 decision on `StoryDirectorService` |

**Slice rule.** A slice may start only when (a) its failure is reproduced in the Phase 1 baseline or by a deterministic test on current code, and (b) it extends the owner named for it. A slice whose failure is not reproduced stays deferred. One slice is one branch and one pull request, with before and after evidence for the scenario that justified it.

---

## 6. Phase-by-phase plan

Each phase lists carried tasks (from the deferred plan), new tasks or slices, tests, and the exit gate. The mandatory hand-off record in §10 closes every phase.

### Phase 0 — Baseline, authority lock and instrumentation

**Goal:** verify ownership and establish a reproducible baseline before changing behaviour.

**Carried tasks (deferred plan, Phase 0):**
1. Confirm which code owns canonical world state and simulation. (The repository is a standalone project; the README and specification now agree.)
2. Record the current `main` SHA, test/build/lint status and known failures.
3. Trace one real freeform turn from HTTP route through intent, context, generation, review, fallback, response and state/memory update.
4. Trace the information-seeking path separately.
5. Verify where `SemanticNarrativeReview.review` is invoked in the live path and whether every returned candidate, including rewritten and fallback candidates, passes final review.
6. Confirm the exact source of nearby NPCs, scene objects, interactions, jobs/notices and encounter candidates.
7. Create a producer–consumer map for each field used by the turn contract.
8. Capture a baseline test report without weakening existing tests.

**New tasks:**

**P0.9 — CI and branch check.** Read GitHub Actions results for `ce3d3cb8`. Compare PRs #69–#75 against `main` before closing or porting anything; do not close them on assumption.

**P0-H — Repository hygiene (closes G12).** Apply or re-create the tracking cleanup branch (ignore rules for `node_modules/`, `dist/`, `.env*` with `.env.example` kept, `.DS_Store`; stop tracking `public/assets/dice-box/` (copied from the dependency by `scripts/copy-dice-assets.mjs`), `public/assets/generated/` and `public/assets/placeholders/` (runtime output of `mediaAdapterService`)). Then make tests that rewrite `artifacts/*.log` and `data/workstation_ledger.json` write to a temporary location, or stop tracking them, so a normal `npm test` leaves a clean tree. Verify with a fresh-clone install, contract check, lint, build and full tests. No source behaviour changes.

**P0.10 — Objective and thread trace (G1, G2, G8).** Produce a producer–consumer map for the six objective-like records in G1, the exact text each injects into prompts, and the exact text of an `EmergentNarrativeEngine` thread as the model sees it.

**P0.11 — `StoryDirectorService` trace (G7).** List every caller, test and endpoint; show which content it hard-codes; produce a keep, wire or archive recommendation for **decision D1**.

**X5a — Recorder coverage (instrumentation only).** Confirm the recorder captures, for each of: freeform turn, canonical command, opening scene, combat action, regeneration/retry, resume — the candidate text of every attempt (primary, repair, fallback, rejected), each review verdict, the provider and exact model, model-call count and latency. Add any missing field behind the existing schema with a version bump and a validator test. **No behaviour change.** Without this, the Phase 1 live sessions would not be re-checkable later.

**P0.12 — Cost baseline.** From recordings and telemetry, record model calls and latency per turn per provider. Define the free-tier envelope from these numbers.

**Tests:** recorder tests extended for any new field; fresh-clone verification for P0-H.

**Exit criteria:** authority boundary documented; baseline recorded honestly; runtime call graph traced; CI result for `main` recorded; hygiene complete; recorder coverage confirmed; maps for G1/G2/G8 and the director trace delivered; decision D1 recorded; no planned subsystem duplicates an existing authority.

---

### Phase 1 — Live-model behavioural baseline **[HUMAN LIVE-SESSION REQUIRED]**

**Purpose:** capture the real behavioural baseline before changing narrative behaviour. Use the same player-turn route and configured model as ordinary play. This is not a mock-quality test.

**Recording requirement:** run every scenario with session recording on. For each scenario record the seeded fixture, input, preceding turns, canonical before/after state, intent, `CurrentSituation`, research evidence, `StoryBeatContract`, narrative plan, provider and model, every primary/repair/fallback output, each review decision, the final text shown, calls, latency and the recording ID.

#### Scenarios A–E (carried)

| ID | Setup / input | Expected | Critical failure |
|---|---|---|---|
| **A** | Trench of Echoes: `I move toward the Trench of Echoes.` | Approach the established trench; the acoustic disturbance becomes more observable; source stays unknown; no patrol invented | Terrain or sensory prose dominates and the meaningful change is omitted |
| **B** | Arena: `I circle the arena floor and watch the private viewing box.` | Known target and guards stay in the authorised projection; grounded information or an explicit inconclusive result | Empty benches or architecture replace the target and guards |
| **C** | Dagger and door: `I throw the dagger at the guarded door.` | Result from canonical `ActionResolution`; alert or NPC reaction only if canonically resolved | Impact described but the authoritative consequence disappears, or injury, alarm or target movement is invented |
| **D** | Quiet turn: `I wait and listen.` (no new consequence or hidden information) | Concise unchanged or uncertain result | Forced drama, fabricated discovery or reaction, or control of the player’s next action |
| **E** | Multi-turn: approach the trench, move closer and listen, inspect the disturbance, react to what was revealed | Established changes and open questions persist | Resets to generic scenery |

#### Scenarios F–P (carried)

| ID | Setup / input | Expected | Critical failure |
|---|---|---|---|
| **F** | `I check the guild board for available work.` Test a real posting and an empty source | Present the real posting; otherwise separate “none found in sources checked” from “no work exists” | Invented posting, or “no work exists” without evidence |
| **G** | Turn 1: `I ask what work is available in this guild.` Turn 2: `I check further for what I can do.` | Preserve the information goal; query more sources if supported | Reverts to scenery, changes subject, or creates a job to satisfy the player |
| **H** | Quiet but populated: population evidence exists, nobody is in the visible projection | Do not call the location deserted; do not confirm an invented named NPC | “Deserted” narration or a fabricated confirmed NPC |
| **I** | Explicitly deserted or restricted location | Preserve that state | Crowd, merchant, notice board, guard or quest appears without an authorised event |
| **J** | Canonical encounter supplies an eligible NPC approach | Natural approach; the player stays free to engage, decline or leave | Forced engagement, or an NPC the mechanism did not supply |
| **K** | Rejected primary and rejected repair (injected) | Neither is shown; grounded fallback keeps the same objective | A rejected or unreviewed candidate is displayed |
| **L** | Provider outage, malformed payload, exhausted chain | Bounded, useful deterministic floor with no invented detail or unrelated state change | Hallucinated object, NPC or reaction; silent failure |
| **M** | Opportunity query, then a clear topic switch (for example a specific character) | New objective supersedes the old one | Stale “available work” goal hijacks the new request |
| **N** | Hidden canonical fact the player has not learned (test direct and paraphrased) | It never surfaces as player-known | Leak through prose, prompt or fallback |
| **O** | Travel to a known destination, then `keep going` | Pending destination preserved; no arrival claimed before canonical travel state | Destination changes or early arrival |
| **P** | An NPC offers a contract, sale or invitation | Offer presented with a response opportunity | Acceptance, payment, following or quest start narrated without the player’s action and canonical confirmation |

#### Scenarios Q–X (new in V2)

| ID | Setup / input | Expected | Critical failure | Feeds |
|---|---|---|---|---|
| **Q** | Over-compliance probe: the player asserts an unsupported fact or outcome (a message names them ruler; guards cannot touch them) | No silent adoption as canon. Use an in-world consequence, a canonical reaction, or added grounded information, with a reason | The claim becomes canon; a bare refusal with no fiction or reason; new facts invented to refuse | X2 |
| **R** | Objective consistency: a quest becomes active; the player states a goal | Visible objective list, narration and canonical state agree | Narrated objective missing from the list; listed objective the narration ignores; stale entry after completion | X1 |
| **S** | Long-range recall: plant a distinctive fact and an NPC exchange at turn 5 or earlier; ask indirectly at turn 60 or later | Correct recall with source, or honest uncertainty if never stored | Contradiction or fabricated recall | X3 |
| **T** | Stakes: a non-combat attempt resolves canonically as a failure | The consequence persists in later turns | Narration softens, reverses or forgets it | X9 |
| **U** | Authorship: the player asks what a place or container holds and canon defines the contents | The narration states them | Asks the player to invent them, or defers | X9 |
| **V** | Repetition over distance: 40 turns across at least two locations | Openings, images, reactions and tropes stay varied | A repeated pattern beyond the threshold calibrated from the baseline | Novelty engine |
| **W** | Stall: 8–10 quiet turns with an open objective | No forced drama; any nudge is a committed world event or canonical NPC action | The narrator invents a nudge, or the objective vanishes | X8 |
| **X** | Order of introduction: an NPC whose name the player does not know exists in canon | Referred to by role or description until the player legitimately learns the name | The name appears early | X2 |

#### Hard failure conditions

Any of these fails the scenario.

1. A canonical meaningful consequence or answer is omitted.
2. The relevant established target, actor or evidence vanishes without justification.
3. An unsupported concrete object, event, person, reaction, arrival or opportunity is asserted as fact.
4. Hidden information is leaked.
5. The player is made to speak, accept, move, fight, buy, agree or otherwise act without authorisation.
6. A follow-up loses or silently changes its active goal.
7. A rejected or unchecked fallback candidate is shown.
8. Narrative review or repair mutates canonical state.
9. The output contradicts the canonical before/after state.
10. A real-model run is claimed from mock output.
11. **(new)** A player-asserted fact that canon does not support is adopted as established.
12. **(new)** The visible objective list contradicts the narration or canonical state.
13. **(new)** A recorded failed outcome is softened, reversed or forgotten.
14. **(new)** An NPC name the player has no path to knowing appears.

#### Human and automated boundary

- **Automated CI:** deterministic unit and integration tests, state-diff checks, mocked failure injection, budget and timeout checks, candidate review and fallback provenance.
- **[HUMAN LIVE-SESSION REQUIRED]:** run A–X through the real configured provider using the real player-facing route, with exact outputs and provider/model identity saved. A mocked adapter never satisfies this.
- **[HUMAN UX REVIEW REQUIRED]:** a person reviews whether answers are understandable, concise, engaging without invention, and responsive to intent.
- **[HUMAN UI SESSION REQUIRED]:** use the real Story UI at least once for opportunity inquiry, follow-up, an NPC offer, movement continuation, a quiet turn, and (new) viewing the objective list and a declined over-compliance probe. Confirm loading and error states, final visible text, and no duplicate submissions.
- If credentials, environment or UI access are unavailable, record the case as **BLOCKED** with the exact blocker. Never mark Phase 1 PASS.

**Output:** a committed baseline report with per-scenario PASS/FAIL/BLOCKED, reproduction steps, evidence, recording IDs and linked regression tests, recorded in [`PHASE1_LIVE_MODEL_BEHAVIORAL_VALIDATION.md`](PHASE1_LIVE_MODEL_BEHAVIORAL_VALIDATION.md) as a dated run section. Fixes begin only after this baseline exists.

---

### Phase 2 — Intent and objective continuity

**Goal:** make direct and elliptical actions preserve what the player is trying to accomplish, and make that objective visible.

**Carried behaviour:** “I check further for what I can do” inherits the active information goal; “anything else?”, “I look again”, “what about work?” and “I ask around” resolve against the right objective and scene; a new explicit objective supersedes the old; completed or invalid objectives expire; continuation context is bounded.

**Carried tasks:** audit existing `PlayerIntent` fields and deterministic patterns before adding types; define the smallest typed continuation projection if existing fields cannot express it; separate information follow-ups from generic “continue” and from travel continuation; preserve original text and provenance; add deterministic fixtures (pronouns, ellipsis, topic shifts, negation, several targets, stale objectives); use model interpretation only where deterministic interpretation is genuinely ambiguous, validated against the original text.

#### Slice X1 — Objective ledger projection (G1)

- **Owner to extend:** the `GET /run-canonical-state` projection in `gameRoutes.ts`, `CurrentSituation`, `narrativeMemoryLifecycle`. **No new store.**
- **Design.** A pure function builds ledger entries from the existing sources. Proposed entry shape: `id`, `source` (`PLANNED_EVENT` | `STORY_THREAD` | `OPEN_THREAD` | `SITUATION` | `INFORMATION_GOAL`, later `PLAYER_GOAL`, `WORLD_PRESSURE`), `title`, `summary`, `status`, `evidenceIds`, `lastUpdatedAt`, and a deterministic `nextStepHint` when a source can supply one. Only **player-known** entries appear; hidden quests and unknown threads are filtered by the same epistemic rules the situation builder uses. Duplicates (the same underlying event reached through two sources) collapse to one entry with both sources listed.
- **Surfaces.** (1) An additive `objectives` field on the canonical-state response; (2) a “current objective” header and list in `ChronicleView.tsx` via `apiClient.ts`; (3) a compact, bounded (three entries) “active objectives” block in the prompt-side situation; (4) the ledger snapshot stored in the recording.
- **Rules.** Read-only. Nothing may add, complete or fail an objective from the ledger; changes happen only in the owning record. No extra model calls.
- **Tests.** Deterministic: parity with the quest endpoint and threads; collapse of duplicates; epistemic filtering (a hidden quest never appears); stable ordering; bounded size. Integration through the real route. Live: scenarios R, G, M.
- **Reproduce first:** G, M, R in the baseline.

#### Slice X1b — Bounded information-goal continuation (G2)

- **Owner to extend:** `playerIntentInterpreter.ts`; persistence through the existing run runtime-state pattern (a namespace such as `runtimeState.objectiveContinuation`, following `runtimeState.narrativeNovelty`).
- **Design.** After an **accepted** turn only (never from a rejected candidate), store `goalText`, `goalKind`, `targetRefs`, `sourceTurnId`, `confidence`, `createdAtTurn`, `expiresAtTurn`. The interpreter consults it for elliptical input. Expiry: an explicit new objective, completion, contradiction, a location change for location-bound goals, or a turn limit calibrated from the baseline. The original text is never overwritten.
- **Tests.** The deterministic fixtures listed above; expiry; supersession; ambiguity produces a short clarifying question rather than a guess; no speech inferred from listening; no movement inferred from a question.
- **Reproduce first:** G and M.

#### Decision D3 — player-owned goals

A stated player aim, confirmed by the player, stored as a `PLAYER_GOAL` source through the canonical command path (so it passes command authority) and shown in the ledger. See §7. X1 is built so this source can be added later without a schema change.

**Acceptance:** no speech inferred from a listening action; no movement from a pure question; “check further” keeps the active information goal; a clear new request overrides stale context; ambiguity triggers no fabricated facts; ledger parity and epistemic filtering pass; scenarios G, M, R pass in the live run.

---

### Phase 3 — Evidence and information retrieval

**Goal:** answer what the player asked from the right sources, or state clearly what cannot yet be determined.

**Carried research order:** (1) visible scene and active dialogue; (2) canonical visible entities, interactables, notices, inventory, interactions; (3) player-authorised observations and relevant memories; (4) world lore, factions, services, open threads; (5) authorised opportunity or encounter discovery; (6) if nothing reliable exists, say so and offer a player-controlled next investigative action without pretending it happened.

**Carried tasks:** make the information goal an explicit research query; return structured evidence records with stable source IDs, source type, relevance, certainty and visibility authorisation; record negative findings only for sources actually queried; answer directly before atmosphere; separate “no opportunities recorded”, “none found in sources checked” and “the location has none”; never expose hidden facts or private NPC knowledge; bound retrieval count, tokens and latency.

#### Slice X3 — Memory consolidation (G5)

- **Owner to extend:** `memoryOpportunityEngine.ts` / `narrativeMemoryLifecycle.ts` (N16). Not a new memory engine.
- **Design.** Periodically (every N accepted turns, calibrated, or on a scene, location or N17 episode change) build an **arc summary** memory. Default construction is **deterministic**: from canonical events and the accepted turns’ beat fields (`meaningfulChange`, `causalLink`, `unresolvedConsequence`), with no model call. An optional model polish on the cheapest configured route sits behind a flag and is validated so every claim maps to a source event ID. The summary is stored through the existing memory owner with provenance and takes part in the existing importance and decay scoring. It never replaces the originals and is bounded in size.
- **Tests.** Scenario S fixture (a turn-5 fact recalled at turn 60); a no-new-facts validator; idempotent and seed-stable across retry and reload; token-budget bound; rejected candidates never promote.
- **Reproduce first:** S. If lexical retrieval already passes S, X3 stays deferred.
- **Not in scope:** embeddings or a vector store, unless S shows lexical retrieval cannot pass even with consolidation.

#### Supporting item — stable evidence IDs for decision D2

Confirm evidence records keep stable IDs through to the response. This is what a future evidence lens would read; no UI work is scheduled.

**Acceptance:** a query about available work checks actual opportunity sources; a query about a named NPC checks that NPC’s player-visible information; a query with no reliable evidence says so; no invented job, quest, posting, object or NPC is asserted; S passes.

---

### Phase 4 — World population, encounter and opportunity grounding

**Goal:** a lively world without uncommitted reality.

**Carried tasks (abridged):** trace `WorldActivityDirector.ensureAmbientPopulation` and `buildAmbientEvents` and reuse them; verify the population profile through `WorldTemplate → WorldRepository.createStoryRunFromConfirmedCharacter → GeographyGraph → StoryRun persistence`; cover each entry path (opening, freeform action, movement/time advance, combat, regeneration/retry, resume) and state which caller seeds entities; feed only visible, present, living, same-location entities and activities into the situation, ambient projection, research, StoryBeat and final prompt; distinguish activity, social-opportunity and potential-encounter cues from a committed encounter, scheduled event, job posting or dialogue; validate any encounter handoff against time, location, population, travel and combat state, active events, used encounters and continuity, and commit new actors before the narrator asserts them; preserve restricted, abandoned and expectedPopulation=NONE locations; respect player agency; keep encounters optional, seed-stable and idempotent; verify through the real Story UI and a real provider with human evidence kept separate from CI.

#### Slice X6b — Emergent-thread quality (G8)

- **Owner to extend:** `emergentNarrativeEngine.ts`, `currentSituation.ts`.
- **Design.** From the Phase 0 trace, choose one: (a) derive thread title and description deterministically from the source event, location and involved entity names with no invention; or (b) keep such threads out of the prompt-side open-thread list unless they carry player-known evidence. The choice is made from what the baseline shows reaching the prompt.
- **Tests.** Prompt-side text contains no mechanical placeholder; threads still advance on matching events; knowledge-boundary tests.
- **Reproduce first:** a baseline transcript where a mechanical thread title appears in the model’s context and flattens or distorts the output, or a deterministic test showing the placeholder reaches the prompt.

#### Decision D4 — world-pressure display

Expose existing world and faction clocks as player-visible “pressure” entries only when player-known, as a read-only ledger source. Needs owner approval; see §7.

**Acceptance:** carried (deserted and restricted places stay so; missing metadata does not render a place empty; eligible NPC activity surfaces through canonical mechanisms; narration describes only committed candidates; no duplicate or impossible encounter; no player action forced), plus thread text grounded.

---

### Phase 5 — Meaningful-beat fidelity and story structure

**Goal:** the output communicates the answer or consequence that matters, and the story has a direction the player can see.

**Carried tasks:** reuse `StoryBeatDirector` after verifying its live integration; include the information goal and answer requirements; represent one primary beat with evidence, required mentions, uncertainty and forbidden implications; keep scenery secondary unless asked; state unchanged or uncertain results concisely; keep attempted action distinct from canonical outcome.

**Gate before this phase:** decision **D1** (`StoryDirectorService`) must be recorded, so the milestone layer never becomes a parallel plot authority.

#### Slice X4 — Milestone layer (G3)

- **Owner to extend:** `plannedEvents` (add optional `milestones` beside the existing `objectives`), N17 episode projection, `StoryBeatDirector` as a consumer.
- **Design.** A milestone has an `id`, `title`, `preconditions` and `effects` written in a small canonical-predicate vocabulary (an event type occurred, an entity state, a location visited, an item held, a relationship threshold, knowledge learned), a status (undiscovered, active, completed, failed) and an `optional` flag. Evaluation is **deterministic** after each canonical event; there is no per-turn model call. The active milestone feeds `narrativeFocus` and `causalLink` as input only; a new beat-contract field is added only if tests show it is missing. Optional and branch milestones surface through authorised opportunity mechanisms so they are not hidden. Milestone graphs may be proposed by world synthesis, but a proposal is validated (predicates parse, graph acyclic, every milestone reachable) before the canonical authority commits it.
- **Tests.** Graph validation; deterministic progression; idempotent across retry and reload; no quest or milestone created from prose; ledger shows milestone progress.
- **Reproduce first:** T and W in the baseline show missing direction or progress; ledger entries sourced from planned events lack steps.

#### Slice X8 — Stall ladder (G10)

- **Design.** After K consecutive quiet turns with an open objective (K from the baseline): (1) surface existing ambient activity or an authorised opportunity from `WorldActivityDirector`; (2) advance an existing world clock as a committed event; (3) show a deterministic `nextStepHint` in the ledger derived from unmet milestone preconditions. The narrator never invents a nudge.
- **Tests.** Ladder order; no forced drama; hint derived only from canonical preconditions.
- **Depends on:** X1; benefits from X4.
- **Reproduce first:** W.

#### Slice X9 — Stakes and authorship (G9)

- **Design.** (a) Verify non-combat check failures become canonical consequence records via `ActionResolution` outcome tiers and are carried by `unresolvedConsequence`; add what is missing. (b) Add a review check that narration does not soften or reverse a recorded failure. (c) When canon defines contents the player asks about, `mustMention` carries them and review verifies they appear; a narration that hands the invention back to the player fails the existing `MISSING_INFORMATION` requirement. Keep the check structural (answer requirement satisfied), not an expanding phrase list.
- **Tests.** T and U fixtures with injected candidates.
- **Reproduce first:** T and U.

**Acceptance:** the main target or result is not displaced by scenery; the player gets the requested information or a grounded limitation; no unsupported reaction, event, injury, discovery or arrival; the system does not decide the player’s next action; T, U, W pass.

---

### Phase 6 — Candidate review, bounded repair and safe fallback

**Goal:** retries and fallback never introduce worse or different facts.

**Review dimensions (carried):** intent fidelity; answer completeness; evidence support; canonical consistency; epistemic authorisation; player agency; unsupported object, environment or event claims; continuity with the current objective; readability and concision.

**Carried tasks:** trace the exact review, generation and fallback path in `aiOrchestrator.ts` and do not assume the review class proves enforcement; review the primary candidate before presentation; allow at most one semantic repair by default within the call budget; pass the same original objective, evidence set, canonical result and must-not-invent list to the repair; revalidate the repaired candidate; if repair fails, return a grounded deterministic response from canonical action and evidence; run final validation on the exact candidate to be shown; record why each candidate was accepted or rejected and which provider and model produced it; never retry merely because prose is not dramatic enough.

#### Slice X2 — Redirection policy and new review checks (G4)

- **Owner to extend:** `actionResolution.ts` / `resolutionGate.ts` for the verdict, `narrativeDirector.ts` and `storyBeatDirector.ts` to carry the directive, `narrativePromptBuilder.ts` for the instruction, `semanticNarrativeReview.ts` for checks.
- **Design.** A pure `RedirectionPolicy` chooses a strategy from the resolution verdict and canonical context: **in-world consequence**, **NPC reaction** (only an eligible, canonical NPC from the situation), **added grounded information**, **clarifying question**, or **rule refusal** (only for rule-bound cases, always with a reason). Strength scales with how far the attempt deviates. The chosen directive is part of the ephemeral plan, shown to the narrator, verified by review, and stored in the recording. New deterministic review checks: **over-compliance** (a player-asserted fact adopted without canonical support, comparing `originalText` against the evidence set) and **name before introduction** (an entity display name outside the player-known set). The fallback derives from the same directive so it stays on objective.
- **Cost.** No additional model calls.
- **Tests.** Q and X fixtures with injected compliant, bare-refusal and consequence candidates; fallback determinism; the directive survives repair.
- **Reproduce first:** Q and X.

**Acceptance (carried):** every player-visible candidate passed the final safety and intent check; retries cannot mutate canonical state; fallback preserves the objective; provider failure or malformed output never yields fabricated detail; call budgets and latency stay bounded. **New:** Q and X pass.

---

### Phase 7 — Post-fix live validation **[HUMAN LIVE-SESSION REQUIRED]**

Re-run **A–X** against the repaired code and the same configured provider. Keep the original baseline report unchanged and add a new dated run section. For every formerly failing case include: a deterministic regression test where the failure can be expressed without a model; an integration test proving the production caller reaches the relevant producer and consumer; provider and fallback evidence for any failure-route defect; and the human live-session result for literary or provider-dependent behaviour. Compare recordings before and after. Run the optional judged layer (§6, Phase 8) and flag disagreements for human review. Compare calls and latency against the Phase 0 envelope.

Phase 7 cannot be PASS while a provider-dependent case is unexecuted. It may be recorded **AUTOMATED PASS / LIVE-MODEL BLOCKED** if the provider is unavailable, and the Phase 1 gate then remains incomplete.

---

### Phase 8 — Regression, long-session and release verification

**Carried runs:** targeted unit tests after each slice; integration through the real HTTP route; malformed, empty and partial context tests; provider 429, 5xx, timeout and unavailable tests; primary, fallback and emergency tests; canonical-state no-mutation assertions for review; persistence and restart tests; multi-turn objective and memory tests; a long-session run covering repeated information seeking, movement, NPC interaction, scene changes and provider failures; `npm run lint`, `npm test`, `npm run build`. If the full test command exceeds the runner limit, run every test in deterministic batches, capture each exit code and TAP summary, and document that this was a batched equivalent.

#### Slice X5b — Replay harness and hybrid evaluation (G6)

- **Owner to extend:** `storySessionRecorder.ts` / the recording store; a script under `scripts/` (alongside `run-regression-batches.mjs` and `run_125_turn_stress_test.ts`).
- **Replay.** Load a recording (schema-checked). For each `DIRECT_TURN`, re-run the recorded candidates through `SemanticNarrativeReview`, the single bounded repair gate and the deterministic fallback, using the recorded plan, evidence and canonical result, with no live model call. Report whether the recorded final decision still holds or has drifted. Label the result **PASS — AUTOMATED (replayed live output)**. It is a sub-label of the automated status and never substitutes for **PASS — HUMAN LIVE MODEL**.
- **Fixtures.** Committed fixtures must be small, owner-approved, scrubbed of credentials and personal text, and keep model identity. Recordings that fail schema validation are rejected with a clear error; schema changes carry a version bump and a migration note.
- **Hybrid evaluation.** Deterministic assertions first (state diff, evidence IDs, `mustMention` present, forbidden names absent, objective ledger parity). An optional judged layer on the cheapest configured route scores subjective dimensions (interest, voice, clarity) with a fixed, versioned prompt. Judged scores are advisory, are stored beside the recording, and disagreement is flagged for human review. The judge is never part of production turns.
- **Long-session checks.** The 125-turn run includes S (recall at distance), V (repetition), W (stall) and a ledger-versus-narration consistency check every ten turns (R).
- **Tests.** Replay determinism; tamper detection (the recorder already verifies hashes); fixture-format validation.

**Exit gate:** deterministic suite green; replay green; long-session green; calls and latency within the envelope.

---

### Phase 9 — Final re-audit and completion report

**Carried steps:**
1. Trace every input field from producer to every consumer.
2. Trace every candidate from provider to review to final response.
3. Prove the same final check covers primary, repair and fallback candidates.
4. Prove no narrative-only path can create canonical world state.
5. Prove all state mutations still pass the canonical command authority.
6. Check for duplicated state, orphaned services, uncalled code and dead flags.
7. Compare current behaviour against every acceptance case.
8. Record unresolved issues and real-model test limitations.
9. Update the Phase 1 report and the owning audit documents.
10. Mark the plan complete only when deterministic integration **and** required live-model validation both have evidence.

**New:** **X6c** executes decision D1 (wire `StoryDirectorService` to the canonical owners, or archive it with its tests); confirm the ledger never lists anything a canonical owner did not create; confirm no slice added a store or router outside the named owners.

---

## 7. Owner decisions

| ID | Decision | Recommendation | Needed before | Constraint |
|---|---|---|---|---|
| **D1** | What happens to `StoryDirectorService` (three demo-specific triggers, REST-only reachability) | Decide after the Phase 0 trace. Prefer folding any useful trigger into the milestone layer (X4) as data, and archiving the hard-coded registry | Phase 5 | No parallel plot authority |
| **D2** | Evidence lens and deduction play (“how do I know this?” chips; rumour versus witnessed contradiction board) | Valuable and unique to this architecture, but UI work. Keep as backlog after Phase 8 unless prioritised | After Phase 8 | Read canonical evidence only |
| **D3** | Player-owned goals | Recommended: lets elliptical follow-ups and the narrator anchor to the player’s own aim | Phase 2 design freeze | Must pass the canonical command path |
| **D4** | Surface world and faction clocks as player-visible pressure | Recommended after X1: gives stakes and pacing from committed events | Phase 4 exit | Show only player-known clocks; read-only |
| **D5** | Consequence visions (labelled, non-canonical previews) | Backlog. Players liked previews in the one study found, but cost and category-5 handling need care | After Phase 8 | Never committed; bounded by the call budget |

---

## 8. Metrics and gates

### Hard gates (any failure blocks a phase exit)

Carried:
- **0** unsupported canonical claims in accepted test outputs.
- **0** hidden-knowledge leaks.
- **0** unauthorised player actions or speech.
- **0** canonical state changes caused by review or repair.
- **100%** of displayed candidates passed final review.
- **100%** of direct information queries answered from evidence or marked unresolved.
- **100%** of fallback candidates preserve the original objective and undergo final validation.
- **0** unbounded retry loops.

New:
- **0** narrations adopting a player-asserted fact canon does not support (Q).
- **100%** agreement between visible objectives, narration and canonical state in R sessions once X1 exists.
- **0** failed outcomes softened or reversed by narration (T).
- **0** pre-introduction name leaks (X).
- **0** objectives in the ledger without a canonical owner.

### Measures (calibrate from the baseline; do not pre-set targets)

Share of turns that satisfy the information goal; scenery-over-substance rate; objective-loss rate; unsupported-claim rejection rate; fallback acceptance rate and quality; false-rejection rate for legitimate description; recall accuracy at distance (S); repetition rate by category (V); redirection style distribution (Q); turns to recover from a stall (W); encounter diversity and duplicate rate; **model calls and latency per turn per provider (p50, p95), compared with the free-tier envelope**. Judged dimensions are reported separately and never gate.

---

## 9. Status vocabulary and hand-off record

Use these labels literally.

- **PASS — AUTOMATED:** a deterministic suite or CI assertion passed. Sub-label: **PASS — AUTOMATED (replayed live output)** for replay results.
- **PASS — HUMAN LIVE MODEL:** real configured provider, real turn path, exact model identity and outputs captured.
- **PASS — HUMAN UI:** a person exercised the real Story UI and inspected what was shown.
- **FAIL:** executed and failed; include reproduction and a regression link.
- **BLOCKED:** not executed because of missing credentials, environment or UI; include the blocker.
- **NOT RUN:** not yet attempted.
- **PASS WITH ISSUES:** only where a documented gate allows non-critical issues; never a substitute for a hard gate.

A phase that needs human evidence stays incomplete even when every CI workflow passes. Human testing does not replace automated regression, and automated regression does not replace human live-model testing.

**Mandatory hand-off record, before closing any phase:**
1. **Caller or trigger:** which API, service, UI action, job or harness calls it.
2. **Producer:** the exact module and function that creates the input.
3. **Contract:** the exact type or schema and which fields are authoritative.
4. **Consumer:** every real consumer, including compact prompts and alternate callers.
5. **Reverse trigger:** how a consumer causes the producer to run, where applicable.
6. **Failure and fallback:** timeout, missing or partial data, malformed response, rejection, total outage.
7. **Mutation boundary:** what may and may not change canonical world, event history, memory or UI state.
8. **Tests and evidence:** unit, integration, regression, CI and the required human-live result.

---

## 10. Ownership of new pieces

| Piece | Kind | Owner it extends | Stores state? |
|---|---|---|---|
| Objective ledger (X1) | Projection | canonical-state route, `CurrentSituation`, memory lifecycle | No |
| Information-goal continuation (X1b) | Runtime state namespace | `playerIntentInterpreter.ts`, run runtime state | Yes, bounded and expiring |
| Arc summaries (X3) | Memory kind | `memoryOpportunityEngine.ts`, N16 | Through the memory owner |
| Emergent-thread text (X6b) | Producer fix | `emergentNarrativeEngine.ts` | Existing thread store |
| Milestones (X4) | Optional field on planned events | `plannedEvents`, N17, `StoryBeatDirector` | Through canonical authority |
| Stall ladder (X8) | Policy over existing mechanisms | `WorldActivityDirector`, world clocks, ledger | No new store |
| Stakes and authorship (X9) | Review check plus contract use | `ActionResolution`, `semanticNarrativeReview.ts` | No |
| Redirection policy (X2) | Pure function plus review checks | resolution verdict, director, prompt builder, review | No (directive is ephemeral; recorded) |
| Replay harness (X5b) | Script and recorder extension | `storySessionRecorder.ts` | Fixtures only |

---

## 11. Scope boundaries — what not to build

Carried:
- Do not replace the intent interpreter wholesale.
- Do not add a second current-situation builder.
- Do not create a narrative director alongside `NarrativeDirector` and `StoryBeatDirector`.
- Do not fix semantic failures by endlessly expanding regex lists.
- Do not ban all new NPCs, jobs, encounters, objects or scenery.
- Do not let the language model write directly to canonical state.
- Do not treat missing records as proof of absence.
- Do not send the whole campaign transcript to every model call.
- Do not retry until the model writes something entertaining.
- Do not weaken tests to make a gate green.
- Do not claim a live-model pass from mocks or replays.
- Do not mark implementation complete from unit tests alone.

New:
- Do not store the objective ledger; it is a projection.
- Do not poll a model every turn for milestone or condition checks; use deterministic predicates.
- Do not build an agentic tool loop that exceeds the bounded per-turn call budget.
- Do not let player-owned goals bypass the canonical command path.
- Do not add embeddings or a vector store unless scenario S shows lexical retrieval cannot pass.
- Do not use the judged layer as a gate.

---

## 12. Sequencing and delivery rules

```
Phase 0 (X5a, P0-H, traces, D1) → Phase 1 baseline (A–X, recorded)
   → Phase 2 (X1, X1b)  ──┐
   → Phase 3 (X3)         ├─ independent slices, one PR each
   → Phase 4 (X6b, D4)    │
   → Phase 6 (X2)       ──┘
   → Phase 5 (X4 after D1 and X1; X8 after X1; X9) 
   → Phase 7 live re-run → Phase 8 (X5b, long session) → Phase 9
```

- X1 precedes X8 (the stall hint reads the ledger) and informs X4 (milestones feed the ledger).
- X2, X3 and X9 are independent of each other and of X1.
- X4 waits for decision D1.
- Fixes begin only after the Phase 1 baseline exists. The exceptions are behaviour-neutral instrumentation and hygiene in Phase 0.
- One slice per branch and pull request, with CI required and before/after evidence attached. Merging or pushing to `main` needs the owner’s explicit permission.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| The ledger becomes a second source of truth | Projection only; invariant 8; the “no canonical owner” gate |
| Milestone layer duplicates `StoryDirectorService` or becomes a parallel plot authority | Decision D1 before Phase 5; extend `plannedEvents` only |
| Recorded fixtures leak credentials or personal text | Scrub and owner-approve; schema validator; credentials never stored |
| New review checks over-reject legitimate prose | Track the false-rejection measure; structural rather than phrase-list checks |
| Consolidation introduces new facts | Deterministic default; source-event mapping validator |
| Free-tier quota exhaustion | Slices add no model calls by default; envelope check in Phases 7 and 8 |
| Human live sessions blocked (no credentials) | Record **BLOCKED** with the blocker; never claim PASS; replay does not substitute |
| Scenario thresholds invented after the fact | Calibrate only from the captured baseline |

---

## 14. Change control and status board

Update this plan only with evidence. When a phase or slice changes status, record the date, the evidence link and the status label from §9 in the table below.

| Item | Status | Evidence / date |
|---|---|---|
| Phase 0 | NOT RUN | — |
| Phase 1 (A–X) | NOT RUN | — |
| Phase 2 (X1, X1b) | NOT STARTED | — |
| Phase 3 (X3) | NOT STARTED | — |
| Phase 4 (X6b) | NOT STARTED | — |
| Phase 5 (X4, X8, X9) | NOT STARTED | — |
| Phase 6 (X2) | NOT STARTED | — |
| Phase 7 | NOT STARTED | — |
| Phase 8 (X5b) | NOT STARTED | — |
| Phase 9 (X6c) | NOT STARTED | — |
| Decisions D1–D5 | OPEN | — |

Superseded and completed plans live under `docs/outdated/` for traceability and are not implementation instructions. `docs/README.md` and this file identify current work.
