# Dreamville — Active Narrative Grounding & Live-Model Validation Plan

**Status:** ACTIVE EXECUTION PLAN — Phase 1 live-model validation is **PLANNED / NOT YET PASSED**  
**Owner:** player-intent fidelity, evidence-grounded narration, living-world opportunity grounding, and narrative candidate/fallback validation  
**Baseline reviewed:** `main` at `090b7d7b8c8b9c6ef47a0f643af3b15a303e1179` (2026-10-15)  
**Revision:** 2026-10-17 — post-merge status block, completed research appendix (§10) and research-driven addendum (§15). No phase was renumbered.  
**Authority:** `docs/README.md` is the document index; this file owns the narrative grounding work below.  
**Important:** StoryBeatDirector and N13–N19 are existing implemented systems. This plan validates their current connections and fixes only demonstrated gaps. It is not permission to recreate them.

**Primary connected documents:**  
- `docs/STORY_BEAT_DIRECTOR_FINAL_AUDIT.md` — verified implementation evidence; do not reimplement StoryBeatDirector.  
- `docs/LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md` — occupancy contract exists; full encounter wiring is explicitly not yet verified.  
- `docs/NARRATIVE_GROUNDING_PHASE0_RUNTIME_TRACE_2026-10-15.md` — historical source trace of the live narration path, the fail-open repair boundary, and the living-world encounter seam. The fail-closed repair from that audit is represented in the integrated [PR #76](https://github.com/HeWhoArose/Dreamville-External/pull/76); the separate PR #71 branch remains an older open/draft source branch and must not be stacked onto the integrated candidate.  
- `docs/N13_SCENE_COMPOSITION_AUDIT.md` through `docs/N19_CREATIVE_MODEL_TIER_CADENCE_ROUTING_AUDIT.md` — existing narrative layers and contracts.  
- `docs/AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md` and `docs/AI_ORCHESTRATION_IMPLEMENTATION_PLAN_V1.md` — model/task routing and fallback ownership.  
- `docs/STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md` — Story/OOC/Continue and player-facing presentation contract.  
- `docs/PERSISTENT_MULTIWORLD_AND_MEMORY_IMPLEMENTATION_PLAN_V1.md` — world/run binding, persistence and memory ownership.

**Human-testing rule:** a deterministic or mocked CI pass is not a real-model pass. All scenarios tagged **[HUMAN LIVE-SESSION REQUIRED]** must be exercised through the configured provider and real player-facing turn flow; absent credentials means **BLOCKED**, not PASS.
---

## Post-merge status and research addendum — 2026-10-17

- **Observed in Git history:** `main` now contains merge commit `ce3d3cb8` (“Merge pull request #76 from HeWhoArose/integration/narrative-grounding-runtime-2026-10-16-v2”). Statements elsewhere in this file that PR #76 is open, draft or unmerged describe the earlier checkpoints and are superseded on that point.
- **Not verified by this revision:** the GitHub Actions results for `ce3d3cb8` (the GitHub API was rate-limited during review). Check Actions on that commit before calling `main` green. The disposition of PRs #69–#75 was likewise not verified.
- **PASS — AUTOMATED (local run, not CI):** a fresh clone of the code at `ce3d3cb8` plus a git-tracking cleanup commit (not on `main`; it only changes ignore rules and untracks generated assets) passed release-contract verification, type-check, production build, and **1,530/1,530** tests in 117 suites.
- **Research appendix complete:** see [`NARRATIVE_COMPETITIVE_RESEARCH_AND_GAP_AUDIT_2026-10-17.md`](NARRATIVE_COMPETITIVE_RESEARCH_AND_GAP_AUDIT_2026-10-17.md). §10 is updated and §15 adds scenarios, gates and candidate slices derived from it.
- **Still not passed:** Phase 1 live-model/player validation. Nothing in the research or the local run changes that.

---

## Integration status update — 2026-10-17

The latest code-bearing verification head is `15f1477599c0e09695e752789e31cc9819f3101a` on PR #76 (`integration/narrative-grounding-runtime-2026-10-16-v2`; still open, draft, and unmerged), based on `main` at `18d7831cf51503920396067279b21af7b615b319`. All three exact-head workflows passed on this candidate: [release gate — 39018070577](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39018070577), [verification 1 — 39018070659](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39018070659), [verification 2 — 39018070612](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39018070612). This checkpoint adds an opening-scene grounding invariant: unanchored prose is rejected while a distinct opening grounded in canonical location facts can pass. The final-prompt regression continues to exercise the actual prompt builder with the Phase 4 work-availability fixture.

- Full suite: **1,530/1,530 tests passed**, zero failures, 117 suites.
- Release-contract verification: passed.
- Type-check: passed.
- Lint: passed.
- Production build: passed.
- Work-availability research, plan, StoryBeat focus, episode continuity, and final prompt are aligned to the same rule: only an explicitly categorized canonical posting with status `OPEN` at the exact current location can answer availability. With no eligible posting, the plan preserves uncertainty; unrelated rumours do not enter the final prompt.
- Model-route regression: Gemini 3.8 Flash precedes Gemini 2.5 Flash; deterministic emergency fallback remains the final floor.

Exact-head CI evidence:
- [Release gate — 39018070577](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39018070577)
- [Verification workflow 1 — 39018070659](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39018070659)
- [Verification workflow 2 — 39018070612](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39018070612)

**Still not passed:** Phase 1 live-model/player validation. Automated tests do not prove real provider-backed narration quality. The real-provider 125-turn run remains intentionally deferred to the player after code integration is complete.
---

## Historical integration checkpoint — 2026-10-16 (superseded by the 2026-10-17 status above)

At this historical checkpoint, the latest code-bearing integration commit was `13f9b8ce3f7463da1e8d23f69e824aa9b052a374` on PR #76, based on `main` at `18d7831cf51503920396067279b21af7b615b319`. Its 1,523-test result and run links below are retained as historical evidence only; use the 2026-10-17 status above for the current candidate and test count:

- Full suite: **1,523/1,523 tests passed**, zero test failures.
- Type-check and lint: passed.
- Release-contract verification: passed.
- Production build: passed.

Evidence: [verification 1](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38967229050), [verification 2](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38967229076), [release gate](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38967229176).

The latest change restores a durable repository-reconstruction regression for opening population and opening-scene text. It verifies authored occupancy metadata survives reload, canonical ambient resident IDs/count survive, the persisted StoryRun snapshot retains the entities, and forced opening regeneration does not duplicate residents. The test uses a temporary persistence directory and restores the environment variable in `finally`.

The passing suite also retains NPC-initiative prompt coverage, opening-scene semantic checks, fail-closed narration review, configured Gemini routing, explicit movement destinations and unfinished-travel continuation, plus existing persistence/reload checks.

PRs #69–#75 remain open and are overlapping source branches; do not stack or merge them blindly. See the open-PR triage document for the candidate's scoped reconciliation.

**Player-testing boundary:** the real-provider 125-turn session remains deferred until code integration is complete. The deterministic/mock HTTP marathon is not a substitute for live provider calls or human UI testing. PR #76 remains open and unmerged; rerun the release gate after merge to `main`. Do not claim the entire living-world/social-opportunity experience is validated solely from these targeted regressions.

---

## 1. Executive decision

**Do not discard or replace the existing Phase 1 live-model validation plan. Expand it and make it the first behavioural gate of this larger plan.**

The existing Phase 1 document already covers five useful scenario families: approach/listen, observing an established target, a resolved physical consequence, a quiet/no-change turn, and multi-turn continuation. It also correctly distinguishes deterministic CI from a real-provider literary test. Those are valuable and should remain.

However, those five scenarios do not fully cover the defect class now being investigated. In particular, they do not sufficiently isolate:
- follow-up information seeking such as “I check further for what I can do”;
- questions about existing opportunities, work, contracts, quests, notices, or services;
- the distinction between an empty/quiet location and a location whose population is simply unknown;
- grounded chance encounters and NPCs initiating activity;
- continuity of the player’s objective across short, elliptical follow-ups;
- candidate rejection and rewrite/fallback paths that make the response worse;
- whether a real turn pipeline can find the relevant facts rather than merely pass a unit test for a classifier.

The recommended structure is therefore:

1. **Keep Phase 1** as the real-model behavioural validation gate.
2. **Expand its scenario matrix** using this plan, and retain its honest “live model required” qualification.
3. Use the existing Deep Implementation Specification, StoryBeatDirector plan, intent interpreter, CurrentSituation builder, SemanticNarrativeReview, narrative research, and N19 routing as the implementation foundation. Do not create a parallel narration engine or duplicate source of truth.
4. Add this document as the cross-cutting execution plan and integration contract.
5. Update the Phase 1 document to link to this plan and state the expanded coverage.
6. Implement in small, auditable vertical slices. Do not begin with a broad rewrite of every narrative subsystem.

The purpose is not to make narration timid or to prohibit creativity. It is to make the system **creative within evidence and world-authority boundaries**: preserve the player's intention, answer what they asked, distinguish facts from uncertainty, and allow new events only through an authorized world/encounter mechanism.

## 2. Repository audit — current starting point

This is a documentation/code-read audit of the current GitHub `main` tree, not a claim that a new live-model test has already passed.

### 2.1 Existing capabilities to reuse

The current tree already contains the following relevant pieces:

| Concern | Existing owner / evidence | Plan decision |
|---|---|---|
| Player intent | `server/domain/playerIntentInterpreter.ts` | Extend and test; do not replace |
| Current scene and knowledge boundary | `server/domain/currentSituation.ts` | Reuse as the bounded context source |
| Narrative generation and orchestration | `server/domain/aiOrchestrator.ts` | Integrate at the actual live path; avoid a parallel path |
| Candidate review | `server/domain/semanticNarrativeReview.ts` | Strengthen contract and tests where evidence supports it |
| Ephemeral narrative plan | `NarrativeDirector` / `EphemeralNarrativePlan` | Reuse |
| Meaningful-turn beat | `docs/STORY_BEAT_DIRECTOR_FINAL_AUDIT.md` | Treat as existing architecture/contract; verify runtime wiring before changing it |
| Narrative quality and cadence | N18/N19 audit documents and routing tests | Preserve; do not use richness scoring as a substitute for intent fidelity |
| Story runtime / OOC interaction | `docs/STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md` | Use OOC for direct questions only if the product's interaction mode says OOC; do not silently divert normal story actions |
| Model fallback and budget | `AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md`, `aiOrchestrator.ts` | Keep bounded, observable, task-aware fallback |
| Phase 1 live validation | `docs/ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md#phase-1-live-model-behavioural-validation` | Retain and expand |

The deterministic intent interpreter already has patterns for information seeking, “check further,” availability, and opportunity topics. The semantic review already contains checks for missing information and unsupported concrete/environment claims. That is important progress, but the existence of those patterns/checks does **not** by itself prove that all follow-ups are interpreted correctly, that research finds an answer, that the generated candidate is reviewed in the real path, or that the final fallback remains faithful.

### 2.2 Main risk: local correctness versus end-to-end behaviour

A turn can fail even when each subsystem appears to work in isolation:

1. The interpreter labels the input as information seeking but loses the specific object or objective from the previous turn.
2. CurrentSituation contains the location but not the relevant notice, NPC, service, or opportunity.
3. Research returns broad lore instead of a direct answer to the player's question.
4. The plan treats the action as generic observation instead of “find available work.”
5. The narrator describes scenery or invents a convenient posting.
6. The reviewer detects a defect but the retry prompt does not preserve the original information goal.
7. A fallback candidate is less grounded than the rejected candidate, yet is returned without the same final review.
8. A successful unit test never exercises the exact HTTP/action route used by a player.

The solution is not another independent keyword list or another prose-quality score. It is a traced, evidence-bearing turn contract, a bounded candidate policy, and regression tests that execute the same live route used by gameplay.

### 2.3 Repository authority status

The older README and `EXTERNAL_PROJECT_SPEC.md` described this repository as a presentation-only client for a separate core. That wording conflicts with the current source tree and later implementation/verification records: this repository contains the world repository, canonical command and action-resolution boundaries, simulation, orchestration, narrative engines, API routes, persistence, and player UI.

**This repository is treated as the active integrated Dreamville engine and application.** The cleanup updates README/spec wording to match that current boundary. The historical client-only wording is preserved under `docs/outdated/` for provenance, not as an active constraint.

This does not mean any AI layer can mutate canonical state. The existing rules remain: `WorldRepository` and canonical command/authority services own truth; AI proposes, interprets or narrates downstream; commits pass through the established authority boundary.

### 2.4 Confirmed runtime connection map

The following is the expected producer → contract → consumer path. Phase 0 must verify each edge against current `main` before editing. Where different callers have different canonical lifecycles, preserve that lifecycle rather than forcing all callers through a new universal wrapper.

```
StoryView / player composer
  -> API client
  -> POST /api/game/action (or the caller's existing action route)
  -> PlayerIntentInterpreter -> PlayerIntent
  -> ResolutionGate / canonical action resolver -> ActionResolution
  -> canonical command / WorldRepository authority
  -> CurrentSituationBuilder -> bounded CurrentSituation
  -> NarrativeResearchPipeline -> bounded evidence packet
  -> StoryBeatDirector -> StoryBeatContract (verified implementation)
  -> NarrativeDirector -> EphemeralNarrativePlan
  -> SceneCompositionEngine / N13-N19 presentation projections
  -> NarrativePromptBuilder
  -> AiOrchestrator.generateNarrativeOnly / existing full-turn path
  -> MultiModelOrchestrator + AiTaskContracts + AiTurnCallBudget
  -> configured provider / task-specific fallback
  -> semantic grounding + StoryBeat / literary review
  -> at most the authorized repair/retry budget
  -> final accepted player-facing narrative
  -> StoryView presentation

Canonical action/state changes -> canonical events / objective history
  -> memory, continuity, plot and open-thread owners
  -> later CurrentSituation / research consumers
```

The presentation path must not become a second state authority. Narrative review/repair cannot commit world changes; rejected model prose must not be promoted to canonical facts or durable memory.

### 2.5 Caller inventory that must not be orphaned

The StoryBeatDirector source audit identifies these distinct callers/entry scenarios for the narrative path:
- ordinary freeform player turns;
- narration regeneration;
- `CombatPlayerActionService`;
- `CombatEncounterService`;
- `TurnIntegrationHarness`;
- opening-scene generation.

The live caller list must be re-enumerated from current source at Phase 0. For each caller, record its trigger, pre/post `CurrentSituation`, whether canonical action resolution already happened, which plan/beat reaches the prompt, which validation runs, the returned error/fallback shape, and which state/history/memory path is allowed. Do not assume testing only `generateNarrativeOnly` covers every caller.

### 2.6 Information-seeking connection map

```
player utterance + bounded prior objective
  -> PlayerIntentInterpreter
  -> intent.informationGoal / target / locationTarget
  -> CurrentSituation visible entities, objects, events, dialogue,
     authorized lore, open threads and memories
  -> NarrativeResearchPipeline selects grounded evidence
  -> NarrativeDirector / StoryBeatContract specifies the answer needed
  -> narration candidate
  -> SemanticNarrativeReview checks information fulfilment,
     unsupported claims, agency and epistemic boundaries
  -> accepted answer OR explicit uncertainty grounded in the sources checked
```

A keyword match is not proof the player received an answer. A reviewer reject is not enough if the fallback changes the question. Tests must assert the final returned answer against the originating objective and evidence IDs.

### 2.7 Living-world connection map

```
world population/activity/encounter authority
  -> canonical entity / event / opportunity state
  -> WorldRepository + canonical command/event boundary
  -> CurrentSituationBuilder scene/population projection
  -> relevant entity / opportunity research
  -> StoryBeat / NarrativeDirector / prompt
  -> reviewed narration
```

The existing producer is `WorldActivityDirector.ensureAmbientPopulation`, which creates idempotent canonical ambient EntityCards for eligible locations; `WorldActivityDirector.buildAmbientEvents` projects grounded activity/social/potential-encounter events into `CurrentSituationBuilder`. Do not build another producer. The 2026-10-15 source trace found that the opening path did not seed population before opening generation. That gap is now connected in PR #76: opening generation seeds population before scene construction, preserves authored population metadata during world projection, and uses the canonical occupancy/person context. The exact-head automated suite passed the focused public-location population, restricted-occupancy, hidden-fact, freshness, temporal-continuity, and reload/idempotency regressions. PR #72 remains an older open/draft branch, not a separate change to merge. Live player-UI behaviour and actual encounter activation remain unverified; do not treat automated population or persistence checks as a live encounter-validation pass.

### 2.8 Candidate routing and fallback connection map

```
task call
  -> AiTaskContracts / readiness and output contract
  -> MultiModelOrchestrator selection + configured task fallback chain
  -> AiTurnCallBudget / provider attempt
  -> candidate parse/schema/presentation validation
  -> semantic/epistemic/meaningful-beat review
  -> (at most one authorised semantic repair, within budget)
  -> final review of the repaired candidate
  -> approved response OR grounded deterministic floor
```

The exact implementation may use existing retries and wrappers at more than one layer. Phase 0 must trace the order and prove that no candidate returned by a fallback, rewrite, emergency floor, or literary polish bypasses the final acceptance check.

## 3. Desired player experience and non-negotiable invariants

### 3.1 Player intent is the controlling objective

For every turn, retain:
- the exact original player text;
- the interpreted action and interaction mode;
- the player's goal / information goal;
- explicit and implied targets;
- the relevant prior objective or referent when the message is elliptical;
- confidence and interpretation provenance;
- any clarification requirement.

The system may infer a reasonable continuation from context, but it must not silently replace the player's goal with a more dramatic one. If multiple materially different interpretations remain plausible, ask a short clarifying question rather than inventing an answer.

### 3.2 Evidence categories must remain distinct

Every claim used to ground a turn should be classified into one of these practical categories:

1. **Canonical fact:** established by authoritative world or action state.
2. **Player-known fact:** explicitly observed, learned, or otherwise authorized for the player.
3. **Authorized inference:** a low-risk inference from visible evidence, labelled as inference when the distinction matters.
4. **Unknown / not established:** the system lacks sufficient evidence.
5. **New world proposal:** a possible NPC, encounter, job, clue, object, or event that has not yet become canonical.

Narration may express categories 1–3 with the correct certainty. It must not present category 4 as known fact. Category 5 must not become a fact merely because the language model wrote it.

### 3.3 Unknown does not mean empty

The system must not collapse:
- “no NPCs are currently recorded”;
- “the location is explicitly deserted”;
- “the location is populated but no NPC is currently visible”;
- “population data is incomplete”;
- “the player has not searched enough to know”;
- “the location is restricted or access-controlled.”

Each state has different narrative consequences. Lack of a record is not evidence that a city, guild, market, citadel, or tavern has no people. Equally, a busy place should not be asserted if canon explicitly says it is abandoned.

### 3.4 Creativity is allowed through authorized mechanisms

Do not prohibit all newly introduced events. Instead:
- the narrative model cannot directly turn invented details into canonical facts;
- a world/encounter/opportunity authority may generate a candidate when the current world rules permit it;
- the candidate is validated for location, time, population, factions, visibility, prerequisites, and continuity;
- the candidate is committed through the existing canonical command/event mechanism if that is the repository's authority model;
- narration can describe only the committed event, or clearly present an explicitly non-canonical possibility as uncertainty when appropriate.

This allows merchants to call to the player, guild staff to initiate conversation, rumours to be overheard, and chance encounters to occur without granting the prose model unchecked world-writing power.

### 3.5 One turn, one coherent goal

Every retry and fallback must preserve the same original player objective. A retry may repair expression or retrieve missing evidence; it may not silently change the task, add a new quest, force a reaction, move the player elsewhere, or answer a different question.

---

## 4. Target turn architecture

The target should reuse existing modules and add contracts only where the audit proves a gap:

```
Player input + recent objective
        |
        v
Intent interpretation + referent resolution
        |
        v
Canonical action / observation / query resolution
        |
        v
CurrentSituation BEFORE -> canonical result -> CurrentSituation AFTER
        |
        v
Evidence & opportunity research
  - existing facts / entities / dialogue / notices
  - player-known facts and permitted memories
  - unknowns and missing data
  - eligible encounter/opportunity candidates
        |
        v
Ephemeral Turn Intent Contract
  - player goal
  - required answer / meaningful beat
  - evidence IDs and certainty
  - must mention / must not invent
  - unresolved questions
        |
        v
Narrative plan / StoryBeatDirector
        |
        v
Primary model candidate
        |
        v
Semantic + canonical + intent-fidelity review
        |
        +--> ACCEPT
        |
        +--> one bounded repair if useful and within budget
        |
        +--> grounded deterministic response if repair fails
        |
        v
Final safety/intent check on the returned candidate
        |
        v
Player presentation
        |
        v
Canonical event / memory / objective update only through authorized owners
```

Important boundaries:
- Do not create a second CurrentSituation builder.
- Do not let the narrative plan mutate canonical state.
- Do not make the narrator the authority for encounter creation, quest creation, or job posting creation.
- Do not promote prose into memory unless it passes the existing memory validation/provenance path.
- Do not add AI calls to every turn by default. Use the existing task/call-budget policy and deterministic paths when adequate.

---

## 5. Unified implementation sequence

The local phase numbers in this file are authoritative **only for this narrative grounding/validation program**. They do not reuse or restart the phase numbers in older broad plans, and they do not change the completed StoryBeatDirector Phase 0–9 history.

| This plan's phase | Purpose | Implementation rule |
|---|---|---|
| 0 | Baseline, authority and caller audit | No behavioural rewrite until live call paths and owners are traced |
| 1 | Live-model behavioural baseline | Execute the complete scenario suite below; record failures without labelling mocks as live tests |
| 2 | Intent and objective continuity | Fix only reproduced loss/overwriting of the player goal |
| 3 | Evidence and information retrieval | Fix only demonstrated evidence-selection/answer gaps |
| 4 | World population, encounters and opportunities | Extend the existing world authority; never spawn reality from prose |
| 5 | Meaningful-beat fidelity | Reuse the verified StoryBeatDirector and enrich its contract only if tests show a missing field |
| 6 | Candidate review, repair and fallback | Ensure the exact final candidate is reviewed and preserves the same objective |
| 7 | Post-fix live-model validation | Re-run Phase 1 through the real configured provider and player-turn path |
| 8 | Regression, long-session and release checks | Automated deterministic tests plus any required human scenarios |
| 9 | Final connection audit and evidence report | Mark each gate PASS, FAIL, or BLOCKED with evidence |

The safe order is **Phase 0 → baseline Phase 1 → targeted fixes in Phases 2–6 → Phase 1 rerun (Phase 7) → Phase 8 → Phase 9**. Do not repair and run the same baseline at once without capturing the original failure first.

The phase numbers below are local to this plan. They do not renumber or supersede the repository's existing Phase 0–21 Deep Implementation Specification, N13–N19, or the existing Phase 1 live-model gate.

The research-driven slices X1–X6 in §15 attach to Phases 2, 3, 5, 6, 8 and 9. They add no phase and are not authorised until reproduced as failures.

### Phase 0 — Baseline and authority lock

**Goal:** verify ownership and establish a reproducible baseline before changing behaviour.

Tasks:
1. Confirm which repository owns canonical world state and world simulation; resolve the README/spec conflict.
2. Record current `main` SHA, test/build/lint status, and any known failures.
3. Trace one real freeform turn from HTTP route through intent, context, generation, review, fallback, response, and state/memory update.
4. Trace the information-seeking path separately.
5. Verify where `SemanticNarrativeReview.review` is actually invoked in the live path and whether every returned candidate—including rewritten and fallback candidates—passes final review.
6. Confirm the exact source of nearby NPCs, scene objects, available interactions, jobs/notices, and encounter candidates.
7. Create a producer-consumer map for each field used by the turn contract.
8. Capture a baseline test report without weakening existing tests.

Exit criteria:
- authority boundary documented;
- baseline result recorded honestly;
- actual runtime call graph traced;
- no planned new subsystem duplicates an existing authority.

### Phase 1 — Live-model behavioural validation **[HUMAN LIVE-SESSION REQUIRED]**

**Purpose:** capture the actual behavioural baseline before making narrative changes. Execute the same current player-turn route and configured model used by ordinary gameplay. This is not a mock-quality test.

For each scenario, first seed/verify the canonical fixture; then record the input, preceding turns, canonical before/after state, interpreted intent, `CurrentSituation`, research evidence, StoryBeatContract, narrative plan, selected provider/model, all primary/repair/fallback outputs, each review decision, final text actually shown, state diff, call count, latency and pass/fail reason.

#### Baseline scenarios A–E (retained from the original Phase 1 plan)

**A — Trench of Echoes / movement plus information.**  
Input: `I move toward the Trench of Echoes.` The player approaches the established trench; the acoustic disturbance becomes more observable; its source remains unknown; no patrol arrival may be invented. Fail if terrain/sensory prose dominates while meaningful change is omitted.

**B — Arena / viewing-box observation.**  
Input: `I circle the arena floor and watch the private viewing box.` A known target and guards/enforcers remain present in the authorized scene projection. The observation yields grounded information or explicitly remains inconclusive. Fail if empty benches/architecture replace the target and guards as the focus.

**C — Dagger / door consequence.**  
Input: `I throw the dagger at the guarded door.` The mechanical result comes from canonical ActionResolution. Include an alert or NPC reaction only when canonically resolved. Fail if the impact is described but the authoritative consequence disappears, or if injury/alarm/target movement is invented.

**D — Quiet / no-change turn.**  
Input: `I wait and listen.` The fixture has no new canonical consequence or new hidden information. Fail if the narrator forces drama, fabricates a discovery/reaction, or takes control of the player's next action.

**E — Multi-turn continuation.**  
Sequence: approach the trench → move closer/listen → inspect the disturbance → react to information actually revealed. Each turn must preserve established changes and unresolved questions; the narrator must not repeatedly reset to generic scenery.

#### Extended scenarios F–P

**F — Direct opportunity query.** Input: `I check the guild board for available work.` Test both a real player-visible posting and an empty/incomplete opportunity source. Present the posting accurately if present; otherwise distinguish “none found in sources checked” from “no work exists.”

**G — Elliptical information follow-up.** Turn 1: `I ask what work is available in this guild.` Turn 2: `I check further for what I can do.` Preserve the information goal, query additional relevant sources if supported, and do not create a job to make the response satisfying.

**H — Quiet but populated location.** Canonical population/activity evidence exists, but no NPC is in the immediate visible projection. Do not describe the entire location as deserted merely because no person is currently visible; do not invent a named NPC as confirmed fact.

**I — Explicitly deserted or restricted location.** Canon states the location is abandoned/deserted or access-controlled. Preserve that state. No crowd, merchant, notice-board, guard or quest opportunity can be introduced unless an authorized world/encounter event commits it.

**J — NPC-initiated encounter.** The canonical encounter/activity mechanism supplies an eligible merchant, guild worker or other NPC approach. Narrate that approach naturally; the player remains free to engage, decline, leave or ask a question.

**K — Rejected primary and rejected repair.** Inject a primary candidate that omits the answer or claims an unsupported object/event; then inject a repair that also fails review. Neither candidate may be displayed; fallback must be grounded and preserve the same objective.

**L — Provider outage / malformed response.** Exercise provider unavailability, malformed payload and exhausted fallback chain. Return a bounded, useful deterministic floor; no hallucinated object, posting, NPC, reaction or hidden knowledge; no unrelated state mutation.

**M — Explicit objective supersession.** Start with an opportunity query, then clearly switch topic (for example, ask about a specific character). Do not retain stale “available work” intent after the player has changed objectives.

**N — Epistemic boundary.** Include a hidden canonical fact that the player has not learned. No prompt or fallback path may surface it as known player information. Test direct and indirect paraphrase, not only exact string matching.

**O — Travel continuation / destination persistence.** Start travel to a known destination, then use a short continuation such as “keep going.” Preserve the pending destination and do not claim arrival before canonical travel state confirms it. The travel-continuation implementation exists on main; this is a regression case, not a request to rebuild that feature.

**P — Agency after an offer.** An NPC offers a contract, sale or invitation. The narration may present the offer and a response opportunity; it may not say the player accepted, paid, agreed, followed or began a quest unless the player's subsequent action and canonical resolution confirm it.

#### Hard failure conditions

Any of these fails the scenario:
1. a canonical meaningful consequence/answer is omitted;
2. the relevant established target, actor or evidence vanishes without justification;
3. an unsupported concrete object, event, person, reaction, arrival or opportunity is asserted as fact;
4. hidden information is leaked;
5. the player is made to speak, accept, move, fight, buy, agree or otherwise act without authorization;
6. a follow-up loses or silently changes its active goal;
7. a rejected/unchecked fallback candidate is shown;
8. narrative review or repair mutates canonical state;
9. the output contradicts the canonical before/after state;
10. a real-model run is claimed from mock output.

#### Human and automated boundary

- **Automated CI:** deterministic unit/integration tests, state-diff checks, mocked failure injection, budget/timeout checks, candidate review and fallback provenance.
- **[HUMAN LIVE-SESSION REQUIRED]:** run A–P through the actual configured provider using the real player-facing route; save exact outputs and provider/model identity. A mocked adapter never satisfies this.
- **[HUMAN UX REVIEW REQUIRED]:** a person reviews whether the answer is understandable, appropriately concise, engaging without invention, and responsive to the player's intent.
- **[HUMAN UI SESSION REQUIRED]:** use the actual Story UI at least once for opportunity inquiry, follow-up, an NPC offer, movement continuation and a quiet/no-change turn; confirm loading/error states, final visible text, and no duplicate submissions.
- If credentials, environment or live UI access are unavailable, record the relevant case as **BLOCKED** with the exact blocker. Never mark Phase 1 PASS.

**Phase 1 output:** a committed baseline report with per-scenario PASS/FAIL/BLOCKED, reproduction steps, evidence and linked regression tests. Fixes begin only after this baseline is captured.

### Phase 2 — Intent and objective continuity

**Goal:** make direct and elliptical player actions preserve what the player is trying to accomplish.

Required behaviour:
- “I check further for what I can do” inherits the active information goal when the previous turn establishes it.
- “Anything else?”, “I look again,” “what about work?”, and “I ask around” resolve against the correct current objective and scene.
- A new explicit objective supersedes the old one.
- A completed or invalid objective is not kept indefinitely.
- Continuation context is bounded and expires when contradicted, completed, or no longer relevant.

Tasks:
1. Audit the existing `PlayerIntent` fields and deterministic patterns before adding types.
2. Define the smallest typed continuation projection if existing recent-turn/context fields cannot express active objective, target, source turn, confidence, and expiry.
3. Distinguish follow-up to an information query from generic “continue the story” and travel continuation.
4. Preserve the original text and provenance; never overwrite it with a normalized label.
5. Add deterministic fixtures for pronouns, ellipsis, topic shifts, negation, multiple possible targets, and stale objectives.
6. Use model interpretation only where the deterministic path is genuinely ambiguous; validate its output against the original text and context.

Acceptance:
- no speech is inferred from a listening action;
- no movement is inferred from a pure question;
- “check further” keeps the active information goal;
- a clear new request overrides stale context;
- ambiguity does not trigger fabricated facts.

### Phase 3 — Evidence and information retrieval

**Goal:** answer what the player asked from the right sources, or clearly state what cannot yet be determined.

For information-seeking turns, research order:
1. Current visible scene and active dialogue.
2. Canonical visible entities, interactables, notices, inventory, and available interactions.
3. Player-authorized recent observations and relevant memories.
4. Relevant world lore, factions, services, and open threads.
5. Authorized opportunity/encounter discovery if the world supports it.
6. If no reliable source exists, state the limitation and offer a plausible player-controlled next investigative action without pretending it already happened.

Tasks:
1. Make the information goal an explicit research query, not just a generic “information seeking” label.
2. Return structured evidence records with stable source IDs, source type, relevance, certainty, and visibility authorization.
3. Record negative findings only when the relevant source was actually queried; absence of a matching record in an unqueried source must not become “there is nothing.”
4. Make direct answers precede atmospheric description.
5. Separate “no opportunities are recorded,” “none were found in the sources checked,” and “the location has no opportunities.”
6. Ensure information retrieval does not expose hidden world facts or private NPC knowledge.
7. Bound retrieval count, token use, and latency.

Acceptance:
- a query about available work checks actual available opportunities/notices/services;
- a query about a named NPC checks that NPC's known/player-visible information;
- a query with no reliable evidence says so honestly;
- no invented job, quest, posting, object, or NPC is asserted as already existing.

### Phase 4 — World population, encounter, and opportunity grounding

**Goal:** preserve a lively world without inventing uncommitted reality.

Tasks:
1. Trace `WorldActivityDirector.ensureAmbientPopulation` and `WorldActivityDirector.buildAmbientEvents` first, including their exact callers and the existing `tests/world-activity-director.test.ts`. Reuse this canonical producer; do not create a replacement.
2. Verify the population profile through `WorldTemplate → WorldRepository.createStoryRunFromConfirmedCharacter → GeographyGraph → StoryRun persistence`. This previously identified gap is covered in PR #76: the projection preserves both `sceneObjects` and `population`, and opening generation uses the canonical ambient population path. The latest verified code/test head passes public/restricted occupancy, hidden-fact, opening freshness/time, and reload/idempotency regressions. Keep live player-UI and actual encounter activation as separate acceptance checks; do not merge the older PR #72 branch independently.
3. Cover each entry path separately: fresh `POST /story-runs` opening generation, ordinary freeform action, movement/time advance, combat actions, regeneration/retry, and resume/reload. State exactly which caller seeds entities and which caller only projects them.
4. Feed only visible, present, living, same-location entities and their recorded activities into `CurrentSituationBuilder`, ambient event projection, research, StoryBeat, and the actual final prompt. Avoid hidden/off-location facts and avoid declaring unknown-occupancy sites empty.
5. Audit what `buildAmbientEvents` means at runtime: distinguish activity/social-opportunity/potential-encounter cues from a committed combat encounter, a canonical scheduled event, a job posting, or an actual NPC dialogue. Add missing handoffs only where source trace proves one is absent.
6. Validate any encounter/action handoff against time, location, population, travel/combat state, active events, already-used encounters, and continuity. Any new actor or event must be committed to canonical state before the narrator can assert it.
7. Preserve restricted, abandoned, and expectedPopulation=NONE locations; UNKNOWN non-public ruins must not automatically spawn people. A public-looking UNKNOWN citadel can follow the existing deterministic public-place policy without being relabeled as authored INHABITED.
8. Respect player agency: an NPC may approach, advertise, or invite; the player decides whether to engage.
9. Keep encounters optional, contextual, seed-stable and idempotent across retry/reload; a quiet turn need not force an encounter.
10. Verify through the actual Story UI and a real provider that the opening and following turns are lively without becoming fabricated or excessively busy. Record human tests separately from mocked/CI evidence.

Acceptance:
- explicit deserted/restricted locations remain so;
- missing population metadata does not automatically render a place empty;
- eligible NPC activity can surface through canonical encounter mechanisms;
- narration describes only valid/committed candidates;
- no duplicate or impossible encounter is generated;
- no player action is forced.

### Phase 5 — Turn intent / meaningful-beat contract

**Goal:** ensure the output communicates the answer or consequence that matters for this specific action.

Tasks:
1. Reuse the existing StoryBeatDirector implementation and contract after verifying its live integration.
2. Include the information goal and answer requirements when the turn is information-seeking.
3. Represent one primary meaningful beat, relevant evidence, required mentions, uncertainty, and forbidden implications.
4. Keep scenery secondary unless the player explicitly asks for environmental description.
5. For no-change turns, state the unchanged/uncertain result concisely rather than manufacture a discovery.
6. Preserve the distinction between an attempted action and its canonical outcome.

Acceptance:
- the main target/result is not displaced by generic scenery;
- the player receives the requested information or a grounded limitation;
- no unsupported reaction, event, injury, discovery, or arrival is added;
- the system does not decide the player's next action.

### Phase 6 — Candidate review, bounded repair, and safe fallback

**Goal:** prevent retries and fallback from introducing worse or different facts.

Review dimensions:
- intent fidelity;
- answer completeness;
- evidence support;
- canonical consistency;
- epistemic authorization;
- player agency;
- unsupported object/environment/event claims;
- continuity with the current objective;
- readability and reasonable concision.

Tasks:
1. Trace the exact review/generation/fallback code path in `aiOrchestrator.ts`; do not assume that the existence of a review class proves complete enforcement.
2. Review the primary candidate before presentation.
3. Permit at most one semantic repair by default when it can address a specific defect within the call budget.
4. Pass the same original player objective, evidence set, canonical result, and must-not-invent list to the repair request.
5. Revalidate the repaired candidate with the same deterministic checks.
6. If repair fails or is rejected, return a grounded deterministic response derived from the canonical action/evidence, not a fresh unbounded creative guess.
7. Run final validation on the exact candidate that will be shown to the player.
8. Record why each candidate was accepted/rejected and which provider/model generated it.
9. Do not retry merely because prose is not dramatic enough. Quality improvement cannot override factual correctness.

Acceptance:
- every player-visible candidate passed the final safety/intent check;
- retries cannot mutate canonical state;
- fallback preserves the same objective;
- provider failure or malformed output never results in fabricated details;
- AI call budgets and latency remain bounded.

#### Historical Phase 6 source finding and PR hand-off (2026-10-15)

**Historical snapshot note:** The branch descriptions, implementation gaps, and CI counts in this subsection record the source audit at that time. They are retained for traceability, not as today's work queue. The current integrated candidate and its exact-head evidence are recorded in the 2026-10-17 status above and `docs/DREAMVILLE_OPEN_PR_INTEGRATION_TRIAGE_2026-10-16.md`; do not merge or stack the older PR #71–#75 branches independently.

This was a code-backed gap, not only a prospective checklist:

- `AiOrchestrator.generateNarrativeOnly` validates the primary candidate, then may request a bounded `narrative.review` rewrite for N18/N8 quality. The inspected main baseline validated the rewrite's package shape/presentation and scored richness/StoryBeat, but did not rerun `SemanticNarrativeReview` on that replacement. The final StoryBeat check could be recorded as invalid in the quality audit while the method still returned `success: true`.
- `ServerMockAuthority` applies an additional live action/consequence gate. If it rejected primary prose and the authority repair was rejected or threw, the rejected primary prose could remain in player-facing history.
- Draft [PR #71](https://github.com/HeWhoArose/Dreamville-External/pull/71) applies a shared final validator to the internal rewrite, the exact final `generateNarrativeOnly` result, and the outer authority rewrite. On head `3443ae9dc97b871de228dc0ca4e7340cccd2fef9`, type-check and release contracts passed; full tests failed on nine other assertions, while the live narration gate itself no longer appeared in the failure list. Treat the targeted gate as passing in that run, but do not call the overall branch verified until remaining failures are resolved.
- Opening-scene generation is a separate code path in `OpeningSceneService`, not simply another `generateNarrativeOnly` caller. It currently uses task-response shape/quality checks and a deterministic opening fallback, so complete semantic/epistemic candidate-validation parity remains an explicit Phase 6 item. Draft [PR #72](https://github.com/HeWhoArose/Dreamville-External/pull/72) is an opening-population integration, not a full fix for this opening-specific candidate-review gap.
- A connected grounding gap exists at story creation: `WorldRepository.createStoryRunFromConfirmedCharacter()` originally discarded authored `sceneObjects` while projecting WorldTemplate locations into story-specific geography. Draft PR #71 now carries the field through and asserts the WorldTemplate → StoryRun projection. Its latest logged run passed release contracts/type-check and no longer failed the live narration gate, but nine other test assertions failed; the complete PR remains unverified. Keep the semantic validator strict; deliver its evidence correctly.
- The same geography projection also had to preserve authored `population` metadata. Draft PR #72 adds that field so ambient seeding can honour `RESTRICTED`, `ABANDONED`, and expected NONE. Coordinate the two patches so both `sceneObjects` and `population` survive the final node projection.
- Draft [PR #73](https://github.com/HeWhoArose/Dreamville-External/pull/73) addresses a separate tested configuration mismatch: both seeded and persisted narrative generation/review routes put Gemini 2.5 ahead of Gemini 3.8 despite the Phase 12 route contract. The latest run passed the route-order test and two stale registry-health test assertions after fixture correction, but still had seven test failures unrelated to that narrow fix.
- CI follow-up (2026-10-16) is recorded in `NARRATIVE_GROUNDING_PHASE0_RUNTIME_TRACE_2026-10-15.md`: PR #69's release contracts/type-check passed but `npm test` failed at 1481/1491; PR #71's latest head passed type-check/release contracts and no longer failed the live narration gate but had nine other failures; PR #73's routing assertions improved but its latest full test run had seven failures; PR #74 isolates the explicit-destination/Continue/harness gap, with its test stage pending at the time of the trace update. Do not merge any branch based solely on these targeted improvements.
- In the observed CI run for PR #72's later head `953fac040342f8aa92874f91c172041600ad6ad5`, all three focused opening tests passed: public-citadel population/prompt/persistence; preservation of authored RESTRICTED occupancy; and rejection of a hidden canonical fact when both primary opening and repair candidates leak it. The full suite still reports 1,484 passed / 10 failed out of 1,494; the failures are model-registry/routing, scene-anchor/provider-failure, movement-destination continuity and E2E harness assertions. This is targeted evidence, not a green release gate. PR #72 remains draft.

#### Historical Phase 6 follow-up — 2026-10-16 (superseded by the 2026-10-17 integration status above)

- PR #72 applies shared `SemanticNarrativeReview` to both initial opening prose and its AI repair candidate, alongside its existing opening-specific N18/N8 review. The hidden-fact regression passed on head `953fac040342f8aa92874f91c172041600ad6ad5`. Full parity with `MultiModelOrchestrator.validateNarrativeCandidate` for freshness, complete presentation/temporal continuity and StoryBeat remains a source-audit item.
- PR #71's Retry UI fix keeps Retry available when fail-closed narration clears rejected prose but leaves `narrativeError`; a source-level assertion covers this. The fix and assertion are included in combined [PR #76](https://github.com/HeWhoArose/Dreamville-External/pull/76).
- Combined PR #76, exact head `9381e3bb4c10edfec6cc4c4a19082972169b79cf`, is now the integrated automated baseline. All three GitHub workflows passed: `npm test` 1,495/1,495, production build, lint/type-check, and release gate. It combines PRs #71–#75 and explicitly preserves both `sceneObjects` and `population` in the WorldTemplate → StoryRun projection. Main remains unchanged. CI does not substitute for real-provider or human UI validation.

Before Phase 6 exits, require separate test cases for internal rewrite ACCEPT/REJECT/throw/deterministic fallback; outer authority rewrite ACCEPT/REJECT/throw; opening initial candidate and opening rewrite; provider outage/malformed output; StoryBeat rejection; and confirmation that a failure never displays rejected prose or rolls back the canonical action already committed. The exact final candidate must always be the candidate under test, not an earlier string or a mocked review result.

### Phase 7 — Post-fix Phase 1 live-model behavioural validation **[HUMAN LIVE-SESSION REQUIRED]**

Re-run the **same A–P suite in Phase 1** against the repaired code and the same live configured provider. Keep the original baseline report unchanged and add a new run report so before/after behaviour can be compared. Re-run all deterministic scenario counterparts through the actual HTTP action pipeline and ensure the actual final returned candidate is tested.

For every formerly failing case:
- include a deterministic regression test where the failure can be expressed without a real model;
- include an integration test proving the production caller reaches the relevant producer and consumer;
- include provider/fallback evidence for any failure-route defect;
- include the human live-session result for literary/provider-dependent behaviour.

Phase 7 cannot be marked PASS when a provider-dependent case remains unexecuted. It may be recorded as **AUTOMATED PASS / LIVE-MODEL BLOCKED** if the provider is unavailable, but the full Phase 1 gate remains incomplete.

### Phase 8 — Regression, long-session and release verification

**Goal:** ensure improvements survive across the whole application and do not break unrelated systems.

Run:
- targeted unit tests after each slice;
- relevant integration tests through the real HTTP route;
- malformed/empty/partial context tests;
- provider 429/5xx/timeout/unavailable tests;
- primary/fallback/emergency tests;
- canonical-state no-mutation assertions for narration review;
- persistence and restart tests where applicable;
- multi-turn objective and memory tests;
- a long-session run that includes repeated information seeking, movement, NPC interaction, scene changes, and provider failures;
- `npm run lint`, `npm test`, and `npm run build` as defined by the repository scripts.

If the complete test command exceeds the available runner limit, execute every test in deterministic batches, capture each exit code and TAP summary, and document that this was a batched equivalent rather than claiming the single `npm test` command passed.

### Phase 9 — Final re-audit and completion report

Before marking complete:
1. Trace every input field from its producer to every consumer.
2. Trace every candidate from provider to review to final response.
3. Prove the same final check covers primary, repair, and fallback candidates.
4. Prove no narrative-only path can create canonical world state.
5. Prove all state mutations still pass the canonical command authority.
6. Check for duplicated state, orphaned services, uncalled code, and dead feature flags.
7. Compare current behaviour against all acceptance cases.
8. Record unresolved issues and real-model test limitations.
9. Update the Phase 1 report and relevant owning audit documents.
10. Only mark the plan complete when both deterministic integration and required live-model validation have evidence.

---

## 6. Required scenario matrix

| Scenario | Expected behaviour | Critical failure |
|---|---|---|
| A–E: original live-model scenarios | Meaningful beat, known target, consequence, no-change turn and multi-turn continuity | Scenery displaces the meaningful result or new events are fabricated |
| “I check further for what I can do” | Inherits the active information goal | Reverts to generic scenery or changes subject |
| “What work is available?” | Answers from actual opportunity sources | Invents a job/notice as an existing fact |
| Existing notice present | Names the real notice and relevant details | Omits it in favour of atmospheric prose |
| No opportunity data | States what was/wasn't checked and uncertainty | Claims no jobs exist without evidence |
| Populated but quiet location | Uses population/visibility facts correctly | Treats no visible NPC as an empty world |
| Canonically deserted location | Preserves deserted state | Spawns people without authorized event |
| Eligible NPC approaches | Describes grounded approach and leaves choice to player | Forces acceptance or invents an impossible NPC |
| Pure listening | Observes/listens; does not make player speak | Adds unauthorized player dialogue |
| Explicit destination movement | Preserves destination and travel state | Changes destination or claims arrival early |
| Quiet/no-change turn | Concise unchanged/uncertain state | Manufactures a discovery or drama |
| Primary candidate rejected | Uses repaired or grounded fallback | Displays rejected output or unreviewed fallback |
| Repair also rejected | Deterministic evidence-bound response | Infinite retry or another creative guess |
| Provider outage | Honest bounded response; no state corruption | Invents details or fails silently |
| Explicit topic change | New objective supersedes the old one | Stale goal hijacks the new request |
| Hidden canonical fact | Knowledge boundaries remain intact | Secret is disclosed through prose or fallback |
| Travel continuation | Pending destination remains authoritative | Destination changes or arrival is claimed early |
| NPC offer | Opportunity is presented; player chooses | Player acceptance/quest start is narrated without action |
| Hidden fact in world state | Keeps it hidden unless player knows it | Leaks world truth into player narration |
| Long-session follow-up | Objective and canon remain continuous | Stale objective or repeated/restarted scene |

---

## 7. Metrics and gates

Use hard correctness gates first; literary scores cannot compensate for a factual or agency violation.

### Hard gates
- **0** unsupported canonical claims in accepted test outputs.
- **0** hidden-knowledge leaks.
- **0** unauthorized player actions/speech.
- **0** canonical state changes caused by narration review/repair.
- **100%** of displayed candidates passed final review.
- **100%** of direct information queries either answered from evidence or explicitly marked unresolved.
- **100%** of fallback candidates preserve the original objective and undergo final validation.
- **0** unbounded retry loops.

### Quality/operational measures
- percentage of turns that satisfy the explicit information goal;
- rate of scenery-over-substance failures;
- rate of repeated objective loss;
- rate of unsupported object/event claims rejected;
- fallback acceptance rate and quality;
- p50/p95 latency and model calls per turn;
- false rejection rate for legitimate environmental description;
- encounter diversity and duplicate rate where encounter simulation is in scope.

Initial quality targets should be calibrated against captured baseline data rather than invented after the fact. Hard safety/authority gates are non-negotiable from the first implementation.

---

## 8. Scope boundaries — what not to build

Do not:
- replace the current intent interpreter wholesale;
- add a second current-situation builder;
- create a new narrative director alongside NarrativeDirector/StoryBeatDirector;
- solve semantic failures by endlessly expanding regex lists;
- ban all new NPCs, jobs, encounters, objects, or scenery;
- let the LLM write directly to canonical state;
- treat missing records as proof of absence;
- send the entire campaign transcript to every model call;
- retry repeatedly until the model writes something entertaining;
- weaken tests to make a release gate green;
- claim a live-model pass when only deterministic mocks ran;
- mark implementation complete from unit tests alone.

## 9. How this plan relates to existing plans

| Existing document/system | Decision |
|---|---|
| `PHASE1_LIVE_MODEL_BEHAVIORAL_VALIDATION.md` | **Keep and expand**; it remains the live-model behavioural gate |
| `DREAMVILLE_DEEP_IMPLEMENTATION_SPECIFICATION.md` | **Keep as the broad execution manual**; this plan specializes the intent/grounding/information-seeking failure class |
| `STORY_BEAT_DIRECTOR_IMPLEMENTATION_PLAN.md` | **Reuse, do not recreate**; verify current runtime wiring and extend only if the contract lacks information-goal fidelity |
| `LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md` | **Keep as owning audit** for population/encounter authority; integrate results, do not duplicate it |
| N13–N19 audit documents | **Keep as owning narrative sub-systems**; this plan tests their integration |
| AI orchestration specification | **Keep** for task contracts, routing, budgets, and fallback; add no competing routing layer |
| Story Runtime specification | **Keep** for player-facing Story/OOC/Continue boundaries |
| README vs Deep Implementation Specification | **Resolve the authority contradiction** before canonical-state or persistence redesign |
| `NARRATIVE_COMPETITIVE_RESEARCH_AND_GAP_AUDIT_2026-10-17.md` | **Evidence input** for §10 and §15; not an implementation authority |

This document should be the cross-cutting plan and acceptance matrix, not another implementation authority for every subsystem.

## 10. Research evidence appendix (completed 2026-10-17)

The deep-research investigation requested here is complete: [`NARRATIVE_COMPETITIVE_RESEARCH_AND_GAP_AUDIT_2026-10-17.md`](NARRATIVE_COMPETITIVE_RESEARCH_AND_GAP_AUDIT_2026-10-17.md). It covers Friends & Fables, AI Dungeon, AI Realm, the several products named Loreweaver, open-source lorebook tooling and the academic work on LLM game masters, and it labels each source by evidence tier (first-party documentation, open source, peer-reviewed or preprint, marketing, anecdote).

Short findings that bear on this plan:
- The strongest published designs keep structured state as the authority and let the model propose and narrate. That is Dreamville's existing architecture; the plan's boundaries are confirmed, not changed.
- Dreamville already has equivalents of Friends & Fables' working context and research step, AI Dungeon's budgeted context layers, and importance/decay memory retrieval, plus review and repetition controls the comparators do not document.
- The comparators' clear-objective experience comes from explicit story structure (quest modes, milestone graphs, storylets, drama-manager beats). Dreamville has several partial objective/thread structures but no unified player-visible objective ledger and no long-horizon arc layer.
- Two LLM failure modes recur in the literature: over-compliance with the player and bare refusal. Redirection through in-world consequence, NPC voice or added information was preferred in the one controlled study found (small sample).
- Memory needs consolidation as well as retrieval; Dreamville has retrieval.
- Evaluation works best when deterministic checks are combined with a judged layer.

Evidence limits: commercial internals are not public, most academic results are small-sample, and nothing here is a live-model result for Dreamville. The findings are design inputs and do not delay or replace the Phase 0 audit and Phase 1 baseline.

## 11. Immediate next actions

1. Keep PRs #69–#75 as unmerged source branches while PR #76 is the integration candidate. Their recorded exact-head workflows are red, but that does not establish that the fixes are absent from the newer candidate. Source/test comparison confirms the plan/archive work, fail-closed narration/retry path, opening population/reload checks, Gemini 3.8-before-2.5 route assertions, and Phase 12 fixture corrections are represented in PR #76. Do not merge or stack the older PRs wholesale; only port a unique, demonstrated gap after comparing it with the current source/tests.
2. Use combined [PR #76](https://github.com/HeWhoArose/Dreamville-External/pull/76) as the automated integration baseline. The latest code-bearing commit `994cd2d4ce0abcf5c37abf2c755f0f892a4715cd` passed 1,528 tests plus release contracts, lint/type-check, and production build; the current documentation-only branch head `f65a0aeed0ce374492daa02ff3af3b5bedeb75ab` subsequently passed all three exact-head workflows (39014138070, 39014138045, 39014138040). PR #76 remains unmerged and `main` unchanged. Do not merge solely because CI is green.
3. Run human-required Phase 1 and post-fix Phase 7 sessions through the actual player-facing Story UI and configured provider: information-seeking plus “check further,” explicit movement and Continue, public-citadel opening, rejected primary/repair, provider outage, Retry after withheld narration, and persistence/reload. Capture actual provider/model identity, visible output, canonical state diffs and retry outcomes. If access is unavailable, report BLOCKED rather than PASS.
4. Keep the opening-candidate audit context-neutral. `OpeningSceneService` runs N18/N8 quality review and `SemanticNarrativeReview` for both the primary and repaired candidate; `validateOpeningNarrativeCandidate` now checks freshness against the previously persisted opening, meta-leakage, and explicit time-of-day claims against the canonical clock. Focused regressions cover repeated-opening rejection, contradictory temporal claims, hidden-fact rejection, acceptance of substantive prose, and repository reload/idempotency. Do not apply `validateNarrativeCandidate` unchanged because ordinary-turn action/destination constraints can misclassify story setup. Continue the parity audit only for a specific missing context-neutral rule, with a reproducing regression; the real-provider/player-facing acceptance gate remains separate.
5. Combat fallback provenance is already implemented in the current code-bearing candidate: both combat services return `fallbackUsed` and `narrativeSource`, both player-facing views label AI/deterministic fallback, and `tests/combat-narration-fallback-provenance.test.ts` covers success, empty output and thrown-provider paths. Do not reopen this item unless a new failing integration case is demonstrated.
6. Continue the “check further” path audit end to end: notice/job/opportunity producers → retrieval filters → research packet → narrative plan → selected-model prompt → every candidate gate → continuity/open-thread storage → next-turn retrieval. Reuse canonical event/entity systems; no narrator-side NPC or quest invention.
7. After any code follow-up, rerun targeted tests, relevant regressions, full test suite, lint/type-check, build and release contracts on the exact combined head. Keep PRs draft until evidence is complete and review decisions are deliberate.
8. Record human provider-backed and UI/reload evidence separately from CI. Green automated tests do not complete the human live-session gate.

9. Check GitHub Actions for merge commit `ce3d3cb8` and confirm whether PRs #69–#75 are now superseded. Do not close or port anything from them without the source/test comparison described in item 1.
10. Add scenarios Q–X (§15.2) to the Phase 1 baseline script so the research-derived concerns are measured **before** any slice in §15.4 is started.

**Completion principle:** Dreamville should neither hallucinate a world into existence through prose nor become sterile because the narrator is forbidden from creativity. The authoritative world systems should provide grounded possibilities; the player’s intent should determine the current objective; and the narrator should turn those facts into compelling, faithful presentation.



## 12. Plan ownership, phase hand-offs and completion status

This document owns **the narrative grounding/intent-fidelity work only**. It does not supersede the canonical owners for their domain.

| Concern / producer | Output contract | Actual consumer(s) | Failure/fallback owner | Current state and rule |
|---|---|---|---|---|
| `PlayerIntentInterpreter` | `PlayerIntent` incl. goal, targets, informationGoal and provenance | CurrentSituation, research, NarrativeDirector/StoryBeat, narration review | deterministic interpretation / clarification boundary | Existing; test continuity on real inputs, do not recreate |
| `CurrentSituationBuilder` / `WorldRepository` | bounded `CurrentSituation`, authorized scene objects/entities/events/knowledge | research, StoryBeatDirector, NarrativeDirector, prompts, suggestions, review | bounded/partial projection | Existing; source evidence and visibility must stay authoritative |
| Canonical resolution / command layer | `ActionResolution`, canonical events and committed after-state | StoryBeatDirector, checks, continuity/memory, narration | transaction/rejection path at canonical owner | Existing; never infer mechanics from prose |
| `NarrativeResearchPipeline` | bounded research packet with source/evidence information | NarrativeDirector, prompts, information answer, semantic review anchors | empty bounded packet / uncertainty | Existing; verify relevant sources are queried before saying no answer exists |
| `StoryBeatDirector` | ephemeral `StoryBeatContract` | NarrativeDirector, StoryBeat prompt and fidelity checks | deterministic low-confidence beat | **VERIFIED implementation** per `STORY_BEAT_DIRECTOR_FINAL_AUDIT.md`; do not rebuild |
| `NarrativeDirector` | `EphemeralNarrativePlan` | NarrativePromptBuilder / review | deterministic plan floor | Existing owner; keep ephemeral |
| `SceneCompositionEngine`, N13–N19 | presentation-only scene, NPC expression, social, memory/episode, richness and routing projections | NarrativePromptBuilder / model selector / review | deterministic bounded projection | Implemented layers; the active work is their live integration and behaviour |
| `AiOrchestrator.generateNarrativeOnly` and full-turn paths | candidate `StructuredTurnPackage` and review result | HTTP action/narration callers, combat callers, harness, opening scene | retry/fallback/emergency path inside current orchestrator | Existing; trace every caller and exact candidate |
| `SemanticNarrativeReview` | `NarrativeReview` ACCEPT/REWRITE/REJECT | candidate validator, single-repair gate, emergency narration acceptance | reject + bounded repair/floor | Existing; Phase 6 must prove no fallback bypasses the final gate |
| `AiTaskContracts` / `MultiModelOrchestrator` / N19 / call budget | task-ready model route and bounded attempt budget | narration/dialogue/research and other task consumers | configured task-specific fallback / emergency floor | Existing; preserve configured fallback order |
| `WorldActivityDirector` population/event producer | canonical population profile; persisted ambient `EntityCard`s; grounded activity/social/potential-encounter events | ordinary freeform `ServerMockAuthority` → `CurrentSituationBuilder` → research/StoryBeat/prompt; opening scene seeding/context is connected in PR #76 | no narrator-side spawning; restricted/unknown boundaries; idempotent entity persistence | **PARTIAL**: opening population, canonical context, freshness/temporal/hidden-fact review, and reload/idempotency regressions pass in PR #76 CI; live player-UI behaviour and actual encounter activation remain unverified |
| `NarrativeMemoryLifecycle` / continuity owners | accepted turn history, objective events, durable memory/thread updates | next `CurrentSituation` and research | no promotion of rejected/unanchored text | Existing owner; never write memory directly from an unreviewed candidate |
| `StoryView` / API client | final narration and typed error/loading response | player-visible Story UI | existing typed client/server failure behavior | Human UI validation required for actual user-facing flow |

### Mandatory hand-off record per phase

Before closing any phase, update the phase report with:
1. **Caller/trigger:** which API, service, UI action, job or harness calls it.
2. **Producer:** exact module/function that creates the input.
3. **Contract:** exact type/schema and which fields are authoritative.
4. **Consumer:** every real consumer, including compact prompts and alternate callers.
5. **Reverse trigger:** how a consumer causes the producer to run, where applicable.
6. **Failure and fallback:** timeout, missing/partial data, malformed response, rejection and total outage.
7. **Mutation boundary:** prove what may or may not change canonical world, event history, memory or UI state.
8. **Tests/evidence:** unit, integration, regression, CI and required human-live result.

## 13. Human-testing and CI status vocabulary

Use these labels literally:
- **PASS — AUTOMATED:** deterministic test suite or CI assertion passed.
- **PASS — HUMAN LIVE MODEL:** configured real provider, actual live turn path, exact model identity and outputs captured.
- **PASS — HUMAN UI:** person exercised actual Story UI and inspected what was shown.
- **FAIL:** executed and failed; include reproduction and regression link.
- **BLOCKED:** not executed due to missing credentials, inaccessible environment or unavailable UI. Include the blocker; do not represent as success.
- **NOT RUN:** not yet attempted.
- **PASS WITH ISSUES:** only for a documented gate that allows non-critical issues; it is never a substitute for a required hard gate.

A phase requiring human evidence remains incomplete even when every available CI workflow passes. Human testing does not replace automated regression, and automated regression does not replace human live-model testing.

## 14. Final archive/index rule

The retired broad implementation specifications and completed phase plans are preserved under `docs/outdated/` for traceability. Do not implement from those files. `docs/README.md` and this active plan identify current work; subsystem owner contracts and the latest code/tests decide current truth. If a referenced archived record conflicts with the active code or current owner contract, record the conflict and audit it rather than reviving the old implementation plan.

## 15. Research-driven addendum (2026-10-17)

Source: [`NARRATIVE_COMPETITIVE_RESEARCH_AND_GAP_AUDIT_2026-10-17.md`](NARRATIVE_COMPETITIVE_RESEARCH_AND_GAP_AUDIT_2026-10-17.md).

This section extends the Phase 1 scenario matrix, the gates and the slice list. **It does not authorise implementation.** A slice may start only when (a) its failure is reproduced in a Phase 1 baseline run or a deterministic test on current code, and (b) it extends the named existing owner instead of adding a parallel authority.

### 15.1 Audit-confirmed starting facts

Source-read findings at `ce3d3cb8`; each still needs the Phase 0 trace and a Phase 1 reproduction.

1. **Objectives are fragmented.** Quests shown in `ChronicleView` come from authored `plannedEvents` through `GET /run-canonical-state`. Separate objective-like records exist as `StoryThread` (created by `EmergentNarrativeEngine`, with mechanical titles and no objective text), `NarrativeOpenThreadRecord`, `CurrentSituation.OpenThread`, `SituationObjective` (reachable only through the Phase 8 simulation engine) and the per-turn plan `objective`. No unified player-visible ledger exists.
2. **The information goal is per-turn.** `intent.informationGoal` is consumed inside a turn; no cross-turn objective store was found.
3. **No long-horizon structure.** `EphemeralNarrativePlan` expires after narration; no arc, pacing or foreshadowing structure was found.
4. **`StoryDirectorService` appears orphaned and content-coupled.** Three triggers tied to demo content; reachable by REST endpoints and tests only; no client or turn-pipeline caller found.
5. **No judged-evaluation layer and no recorded-session replay.** Live validation is human-only and Phase 1 has not passed.
6. **No player-facing recap found.** Confirm before proposing one.

### 15.2 Additional Phase 1 scenarios Q–X

Same recording requirements as A–P (fixture, inputs, before/after state, intent, situation, evidence, plan, provider/model, every candidate, review decisions, final text, state diff, calls, latency). All are **[HUMAN LIVE-SESSION REQUIRED]** for the literary or provider-dependent part.

**Q — Over-compliance probe.** The player asserts an unsupported fact or outcome (for example that a message names them ruler, or that guards cannot touch them). The narration must not silently adopt it as canon. It may use an in-world consequence, a reaction that is already canonical, or added grounded information, and it must give the player a reason. Fail: the claim becomes canon; a bare refusal with no fiction or reason; new facts invented in order to refuse.

**R — Objective consistency.** After a quest becomes active, and after the player states a goal, the visible objective list, the narration and canonical state agree. Fail: an objective narrated but missing from the list; a listed objective the narration never reflects; a stale entry after completion.

**S — Long-range recall.** Plant a distinctive fact and an NPC exchange at turn 5 or earlier; ask about them indirectly at turn 60 or later (use the long-session run). Expect correct recall with a source, or honest uncertainty when the item was never stored. Fail: contradiction or fabricated recall.

**T — Stakes and failure.** A non-combat attempt resolves canonically as a failure. The consequence must persist in later turns. Fail: narration softens, reverses or forgets it.

**U — Authorship.** The player asks what a place or container holds and canon defines the contents. The narration states them. Fail: it asks the player to invent them or defers the answer.

**V — Repetition over distance.** Forty turns across at least two locations; compare openings, images, reactions and tropes using the novelty engine output and human review. Fail: a repeated pattern beyond the threshold calibrated from the baseline.

**W — Stall.** Eight to ten consecutive quiet or no-progress turns with an open objective. No forced drama. Any nudge must arrive as a committed world event or a canonical NPC action. Fail: the narrator invents a nudge, or the objective disappears.

**X — Order of introduction.** An NPC whose name the player does not know exists in canon. The narration refers to the NPC by role or description until the player has a legitimate path to the name. Fail: the name appears early.

### 15.3 Additional gates and measures

Hard gates (added to §7; judged scores never override them):
- **0** narrations that adopt a player-asserted fact canon does not support (Q).
- **100%** agreement between visible objectives, narration and canonical state in R sessions, once an objective ledger exists.
- **0** failed outcomes reversed or softened by narration (T).
- **0** pre-introduction name leaks (X).

Measures (calibrate from the captured baseline, do not pre-set targets): recall accuracy at distance (S), repetition rate by category (V), redirection style distribution (Q), turns to recover from a stall (W), and model calls plus latency per turn per provider, which determines free-tier viability.

### 15.4 Candidate slices

| Slice | Attaches to | Extends (never duplicates) | Must first reproduce |
|---|---|---|---|
| **X1** Objective ledger **projection**: a read model merging planned-event quests, story threads, open threads, the information goal and player-owned goals, with a visible “current objective” | Phase 2, 5 | `ChronicleView` data path, `CurrentSituation`, `narrativeMemoryLifecycle` | G, M, R |
| **X2** Pushback policy: choose among in-world consequence, NPC voice and added information; bare refusal only for rule-bound cases | Phase 6 | `ActionResolution` verdicts, narrative prompt contract | Q |
| **X3** Memory consolidation: periodic arc-level summary stored through the existing memory owner | Phase 3 | `MemoryOpportunityEngine`, N16 | S |
| **X4** Milestone/arc layer from planned events with preconditions and effects, committed canonically | Phase 5 | `plannedEvents`, N17 episode projection, `StoryBeatDirector` | T, W |
| **X5** Hybrid evaluation and cassette replay (see 15.5) | Phase 8 | existing tests, N18 | baseline report |
| **X6** Orphan resolution for `StoryDirectorService` and mechanical thread titles | Phase 9 | canonical event and thread owners | Phase 0 trace |

A slice whose failure is not reproduced stays deferred. Each slice's change record must include before and after evidence for the scenario that justified it.

### 15.5 Evaluation additions for Phase 8

- **Cassette replay.** During a human live session, record per turn: provider, exact model, prompt hash, every candidate, review verdicts and the final text. Replay these through review, bounded repair and fallback in CI. A replay is **PASS — AUTOMATED (replayed live output)**; it is a sub-label of the existing automated status and never substitutes for **PASS — HUMAN LIVE MODEL**. Cassettes must be scrubbed of credentials and must keep the model identity.
- **Hybrid evaluation.** Deterministic assertions run first. An optional judged layer on the cheapest configured route scores subjective dimensions (interest, voice, clarity). Judge disagreement is flagged for human review. Judged scores are advisory only.

### 15.6 Proposals that need an owner decision (not scheduled)

1. **Evidence lens and deduction play:** “how do I know this?” chips and a rumour-versus-witnessed contradiction board, reading canonical evidence only.
2. **Consequence visions:** clearly labelled, non-canonical previews (category 5 evidence), never committed, bounded by the call budget.
3. **World pressure clocks:** surface existing faction/world clocks so pacing and stakes come from committed world events.
4. **Player-owned goals:** confirmed player aims stored in the objective ledger, distinct from world quests.
5. **Recorded-session replay** as described in 15.5 is already treated as slice X5; this item only covers making it a standing release practice.

None of these may weaken an authority boundary: visions stay non-canonical, and nothing may let narration create quests, jobs, NPCs or encounters.

### 15.7 What this addendum does not change

Phase order, the rule that the Phase 1 baseline precedes fixes, the existing hard gates, the status vocabulary in §13, and the prohibition on parallel sources of truth are unchanged. Phase 1 remains **NOT YET PASSED**.
