# Dreamville — Narrative Grounding, Player-Intent Fidelity & Living-World Plan

**Status:** PROPOSED — documentation and implementation plan; not yet runtime-verified  
**Owner:** Story-turn orchestration, player-intent continuity, evidence-grounded narration, information seeking, and living-world opportunity discovery  
**Target branch:** `plan/narrative-grounding-phase1`  
**Baseline reviewed:** `main` at `090b7d7b8c8b9c6ef47a0f643af3b15a303e1179` (2026-10-15)  
**Related active documents:**
- `docs/PHASE1_LIVE_MODEL_BEHAVIORAL_VALIDATION.md`
- `docs/DREAMVILLE_DEEP_IMPLEMENTATION_SPECIFICATION.md`
- `docs/STORY_BEAT_DIRECTOR_IMPLEMENTATION_PLAN.md`
- `docs/LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md`
- `docs/N13_SCENE_COMPOSITION_AUDIT.md` through `docs/N19_CREATIVE_MODEL_TIER_CADENCE_ROUTING_AUDIT.md`
- `docs/AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md`
- `docs/STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md`

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
| Meaningful-turn beat | `docs/STORY_BEAT_DIRECTOR_IMPLEMENTATION_PLAN.md` | Treat as existing architecture/contract; verify runtime wiring before changing it |
| Narrative quality and cadence | N18/N19 audit documents and routing tests | Preserve; do not use richness scoring as a substitute for intent fidelity |
| Story runtime / OOC interaction | `docs/STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md` | Use OOC for direct questions only if the product's interaction mode says OOC; do not silently divert normal story actions |
| Model fallback and budget | `AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md`, `aiOrchestrator.ts` | Keep bounded, observable, task-aware fallback |
| Phase 1 live validation | `docs/PHASE1_LIVE_MODEL_BEHAVIORAL_VALIDATION.md` | Retain and expand |

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

### 2.3 Documentation inconsistency that must be resolved separately

The README describes this repository as an external client whose canonical core is maintained in another repository. The Deep Implementation Specification explicitly overrides that historical description and treats this repository as the active standalone core. That is a significant architectural disagreement.

This plan does **not** silently decide which repository owns canonical truth. Before any implementation that changes state authority, world simulation, or persistence, Phase 0 must confirm the intended repository boundary with the current project owner and align the README and implementation specification. Until resolved:
- this plan may safely improve intent, evidence packaging, narration validation, and tests in this repository;
- it must not create a second canonical world-state authority;
- it must not duplicate world population or encounter simulation in the presentation layer;
- any new encounter/opportunity proposal must go through the currently authoritative world/command boundary.

---

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

## 5. Implementation phases

The phase numbers below are local to this plan. They do not renumber or supersede the repository's existing Phase 0–21 Deep Implementation Specification, N13–N19, or the existing Phase 1 live-model gate.

### Phase A — Baseline and authority lock

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

### Phase B — Intent and objective continuity

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

### Phase C — Evidence and information retrieval

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

### Phase D — World population, encounter, and opportunity grounding

**Goal:** preserve a lively world without inventing uncommitted reality.

Tasks:
1. Audit `docs/LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md` and the actual current population/encounter producers.
2. Distinguish canonical population data from scene-local visibility and from incomplete/uninitialized data.
3. Define location population states only if existing types cannot express them: e.g. populated, sparse, deserted-by-canon, restricted, unknown/incomplete.
4. Audit current encounter eligibility, scheduling, cooldown, location rules, faction state, and chance weights before implementing any new generator.
5. Generate candidate encounters/opportunities only through the existing authoritative world/encounter service; do not let narration invent them.
6. Validate candidates against time, location, population, travel/combat state, active events, already-used encounters, and continuity.
7. Provide varied but bounded opportunity sources: NPC-initiated dialogue, merchants advertising wares, guild requests, posted contracts, rumours, ambient activity, and chance encounters.
8. Respect player agency: an NPC may approach or invite; the player decides whether to engage.
9. Keep chance encounters optional and contextual, not mandatory every turn.
10. Avoid both extremes: fabricated busy scenes and sterile worlds caused by requiring every background person to be pre-authored.

Acceptance:
- explicit deserted/restricted locations remain so;
- missing population metadata does not automatically render a place empty;
- eligible NPC activity can surface through canonical encounter mechanisms;
- narration describes only valid/committed candidates;
- no duplicate or impossible encounter is generated;
- no player action is forced.

### Phase E — Turn intent / meaningful-beat contract

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

### Phase F — Candidate review, bounded repair, and safe fallback

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

### Phase G — Expanded Phase 1 live-model behavioural validation

**Goal:** validate actual player-facing behaviour using the configured model and the same live freeform-turn path.

Keep the original five scenarios and add:
6. **Opportunity inquiry:** “I check the guild board for available work.” Existing records should be surfaced; absent/incomplete records must not become invented postings.
7. **Elliptical follow-up:** establish an information goal, then say “I check further for what I can do.” The goal must persist.
8. **Quiet but populated location:** do not claim the location is deserted merely because no NPC is immediately in the visible projection; use population/visibility authority.
9. **Explicitly deserted/restricted location:** do not populate it without a valid world event or state change.
10. **NPC-initiated opportunity:** where the world simulation supplies an eligible merchant/guild worker/NPC encounter, narration can surface the approach without making the player accept.
11. **Uncertain source:** preserve uncertainty rather than reveal an unestablished source or hidden cause.
12. **Bad primary candidate / good fallback:** demonstrate that the rejected candidate is not shown and the fallback does not add unsupported facts.
13. **Bad repair candidate:** reject the repair and use a grounded fallback.
14. **Total provider outage / malformed response:** show an honest deterministic result without corrupting state.
15. **Multi-turn objective continuity:** inquiry → follow-up → new explicit topic; prove the first objective is retained only until superseded.

For each live scenario record:
- exact input and preceding turns;
- canonical before/after state and authorized evidence;
- interpreted intent and continuation reference;
- plan/beat contract;
- provider/model and every fallback attempt;
- all candidate texts and review decisions;
- final visible narration;
- canonical state diff;
- call count, latency, token use;
- pass/fail reason.

**Important:** mock integration and live-provider literary validation are separate result classes. Never report mock output as a live-model pass. If provider credentials are unavailable, mark live scenarios BLOCKED and continue deterministic tests.

### Phase H — Regression, long-session and release verification

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

### Phase I — Final re-audit and completion report

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

This document should be the cross-cutting plan and acceptance matrix, not another implementation authority for every subsystem.

## 10. Research follow-up

A separate deep-research investigation is being conducted into commercial and open-source AI RPG systems, including Friends & Fables and related projects. Its findings should be added as a short evidence appendix only after the report is available. The research must distinguish public, verifiable implementation details from product marketing and speculation. It must not delay the safe first step: audit the actual Dreamville runtime path and expand the existing Phase 1 test matrix.

## 11. Immediate next actions

1. Resolve repository/core authority wording.
2. Capture current CI status for the current `main` SHA.
3. Trace `SemanticNarrativeReview` through the exact live action route, including all candidate and fallback paths.
4. Add tests for the specific “check further” objective continuation and opportunity-source retrieval.
5. Expand the Phase 1 scenario matrix without labelling unrun scenarios as passed.
6. Implement only the smallest confirmed gap; run targeted, integration, full regression, lint, and build.
7. Re-audit and only then proceed to population/encounter integration and live-model validation.

**Completion principle:** Dreamville should neither hallucinate a world into existence through prose nor become sterile because the narrator is forbidden from creativity. The authoritative world systems should provide grounded possibilities; the player’s intent should determine the current objective; and the narrator should turn those facts into compelling, faithful presentation.
