# DreamVille — World Director Implementation Plan

**Status:** ACTIVE — implementation proceeds in small, audited slices  
**Owner:** World preparation, scene readiness, canonical scene evidence, and narrator handoff  
**First target:** The reported isolated-shack murder investigation  
**Branch policy:** Work on a dedicated branch and commit each coherent slice. Do not merge to main without explicit approval.  
**Live testing:** Reserved for the player. Engineering work must provide a reproducible player-run checklist and must not mark live-model/UI acceptance as passed.

## 1. Purpose

World Director is the orchestration layer that makes sure a scene has the canonical facts needed to be played before asking the narrator to describe it. It coordinates existing authorities; it is not a new canonical database, a second campaign engine, or a replacement for the narrator.

DreamVille already has world synthesis, persistent geography, scene objects, entity cards, population and activity production, current-situation projection, evidence retrieval, narrative planning, canonical action resolution, semantic review, and fallback composition. The first task is therefore to close demonstrated integration gaps and not duplicate these owners.

The core rule is:

**Prepare the world first. Resolve the player's action through its authoritative system. Narrate the resolved, player-visible result. Review the narration.**

World truth, player-visible facts, player knowledge, NPC knowledge, unresolved questions, and AI proposals must remain distinct. Richness comes from providing grounded material to the narrator, not from weakening grounding restrictions or letting prose create world state.

## 2. Current Source Audit — Starting Findings

This is a source-level audit of current main inspected on 2026-10-26. It is not a live-session result, a fresh full test run, or proof of current CI status.

### 2.1 Existing paths to preserve

- WorldSynthesisService authors/normalizes the campaign's structured geography and scene-object data.
- WorldRepository creates StoryRun-specific canonical geography and persists world/run state. Its current projection preserves location sceneObjects, population, archetype, environment, and tags.
- GeographyGraph owns canonical location-level scene-object mutation, including add/remove methods.
- WorldActivityDirector supplies deterministic ambient population/activity for eligible locations and protects restricted, abandoned, and expectedPopulation=NONE locations.
- OpeningSceneService invokes ambient population preparation before opening-context assembly.
- WorkingContextEngine uses CurrentSituationBuilder to assemble an epistemically filtered starting-location projection and places occupancy, visible people/activity, scene objects, environment, and the starting situation into protected opening context.
- CurrentSituationBuilder projects canonical scene objects, entities, events, occupancy, environment, available interactions, and relevant state.
- NarrativeResearchPipeline retrieves bounded relevant context. Retrieval cannot create missing canonical facts.
- NarrativeDirector/StoryBeatDirector and N13–N19 are existing systems and must not be recreated.
- NarrativePromptBuilder provides structured scene and outcome context.
- SemanticNarrativeReview rejects unsupported concrete claims rather than treating descriptive prose as an object registry.
- ActionResolution, combat, spell, inventory, and spatial systems remain the owners of their respective mechanics/state changes.

### 2.2 Main demonstrated design gap

The starting situation is supplied to opening context as a hook/summary/activity, while the canonical scene projection obtains discrete environmental objects and visible entities from their own records. A premise such as “investigating a fresh murder scene” therefore does not itself guarantee a victim record, incident/evidence records, scene layout, or observation-specific information are present.

This is the central gap the World Director must close. Do not infer that all current scenes are missing these records: reproduce the defect with a focused fixture and report exactly which records are present, absent, or dropped.

### 2.3 Fallback limitation

The deterministic opening composer can render the character's activity, location/time, supplied sensory context, visible people, and visible scene objects. When those inputs are absent, its current generic ambient sentence can stand in for missing world content. The fallback cannot safely invent a victim, clue, witness, or layout from nothing.

Fallback must remain factually grounded but should receive the same prepared scene facts as the primary narrator.

### 2.4 Other verified boundaries

- “No visible person is established in the projection” is not equivalent to canonical proof that nobody is present.
- Ambient population is not incident preparation. Ordinary public occupants must not be used as substitutes for a murder victim, witness, investigator, or adversary.
- Scene preparation does not imply revealing every canonical fact. Hidden evidence may exist but remain undiscovered.
- Existing tests cover many world-build, scene-projection, ambient-population, and opening behaviours, but a dedicated end-to-end murder-scene contract must be established.
- A structured ActionResolution is supplied to narration, but source inspection did not establish a universal guarantee that every resolved player-visible effect is represented. This is a related, separately owned narrative-fidelity slice, not a reason to move combat mechanics into World Director.

## 3. Scope and Non-Goals

### In scope

1. Audit and map all world-preparation and scene-entry paths.
2. Define a small, explicit scene-preparation/readiness contract.
3. Classify supported scene requirements based on scenario and authoritative context.
4. Retrieve and reconcile existing canonical objects/entities/events before proposing new records.
5. Add or connect scenario-specific canonical facts through existing authorities.
6. Validate visibility, presence, location, lifecycle, discoverability, and provenance.
7. Hand the same scene facts to opening narration, normal turns, research/context, and fallback.
8. Detect incomplete preparation with actionable diagnostics.
9. Add deterministic tests and regression coverage, then re-audit every changed integration.
10. Supply a player-run live-test checklist and stop short of claiming live acceptance.

### Explicitly out of scope

- Replacing WorldRepository or creating a parallel source of truth.
- Reimplementing WorldActivityDirector, CurrentSituationBuilder, NarrativeResearchPipeline, StoryBeatDirector, N13–N19, semantic review, or the action-resolution authorities.
- Converting every phrase in a premise/biography into a literal object or event.
- Unconditionally populating every location, adding forced crises, or guaranteeing a quest.
- Allowing a model to write directly to canonical state.
- Loosening evidence rules to hide context/projection defects.
- Re-running a canonical action or spell to fix prose.
- Running real-provider, real Story UI, or human UX testing on behalf of the player.

## 4. Target Architecture

World Director coordinates existing owners in this sequence:

1. **Request:** Receive story/location identity, entry reason, starting situation or active incident, world time, and relevant authored scenario data.
2. **Read:** Retrieve current canonical scene state, current entities/objects/events, location profile, rule constraints, and any existing scene preparation reference.
3. **Classify:** Select a supported requirement profile or return a bounded generic/uncertain classification.
4. **Reconcile:** Reuse valid existing records; propose only missing requirements supported by the premise, a scenario template, or validated model output.
5. **Validate:** Check IDs, location, lifecycle, visibility, provenance, rules, duplication, and prerequisite relationships.
6. **Commit:** Register approved changes through the appropriate canonical authority. No prose is a commit.
7. **Project:** Ask existing projection/context systems for player-authorized scene evidence.
8. **Readiness gate:** Return READY, READY_WITH_UNCERTAINTY, INCOMPLETE, BLOCKED, or RECOVERY_REQUIRED with explicit reasons.
9. **Handoff:** Give the existing narration path a stable scene reference/projection; primary and fallback narrators use the same factual inputs.
10. **Observe and learn:** Record diagnostics in existing session/telemetry infrastructure. Do not add a parallel recorder.

This is an architectural target, not permission to implement every layer in one large change. The first implementation should be the smallest vertical slice that closes a reproduced gap.

## 5. Scene Preparation Contract

The first implementation slice should formalize these conceptual fields. Reuse existing types where suitable; add fields only where the current contracts demonstrably cannot express a requirement.

### Request information

- storyId and worldId;
- locationId and, if available, stable scene/incident reference;
- entry reason: initial opening, incident start, location entry, revisit, recovery, or explicit scene refresh;
- current timestamp;
- starting situation/incident data;
- authored scenario type and constraints, when supplied;
- current canonical objects, entities, events, environment, occupancy and relevant rules;
- authorized viewer/actor identity.

### Result information

- scene/location reference;
- requirement profile and profile version;
- readiness status and reason codes;
- required facts satisfied and required facts missing;
- records found/reused, proposals accepted/rejected, and canonical changes made;
- hidden/unknown facts kept out of player-visible context;
- player-visible evidence references;
- provenance and diagnostics suitable for regression/session records.

### Readiness semantics

- **READY:** Required preparation conditions are satisfied.
- **READY_WITH_UNCERTAINTY:** The scene is playable; specific facts remain legitimately unknown.
- **INCOMPLETE:** A required record or projection is missing.
- **BLOCKED:** A world rule, authorization, validation failure, or unavailable authority prevents safe preparation.
- **RECOVERY_REQUIRED:** Stored state cannot be reconstructed with sufficient confidence.

Unknown is not automatically a failure. A murder scene can be ready while the culprit's identity remains unknown. Readiness is about the existence and consistency of the investigative scene, not revealing the answer.

## 6. Requirement Profiles

Begin with a limited profile set. Do not implement all possible scene types before the first one passes.

### Profile A — Investigation / crime scene (first vertical slice)

The fixture explicitly describes what must exist. Requirements may include:
- canonical incident reference or event;
- victim entity/identity state and a player-visible representation of the body where appropriate;
- location scene objects and relevant evidence records;
- evidence location, visibility, and discovery conditions;
- canonical known witnesses/other occupants, or a supported statement about absence;
- initial player knowledge versus facts that require investigation;
- supported examination/observation affordances.

Unknown facts (including culprit, motive, and cause of death) remain unknown unless the fixture/canon establishes them. Do not infer these from genre convention.

### Profile B — Ordinary environment

Require enough structured environment/location information for the chosen archetype. Objects must be canonical to be asserted as discrete props. Occupancy may be unknown without turning the site into an empty or abandoned place.

### Profile C — Public/social location

Reuse WorldActivityDirector. Verify that seeded occupants are local, alive, present, visible when appropriate, idempotent, and time/rule compatible. Keep ambient activity, social opportunity, actual encounter, quest/job, and committed dialogue as separate concepts.

### Later profiles

Combat, travel/arrival, restricted facilities, ruins, homes, workplaces, and custom scenarios are added only after their owner boundaries and requirement sets are audited. Existing combat/spell authorities continue to own mechanics and effects.

## 7. Required Data Boundaries

- **Canonical existence:** an authoritative record exists.
- **Physical/scene presence:** the record is in this location and present at this time.
- **Visibility:** the player can perceive the record from the current position.
- **Interactability:** the current action is legally/physically applicable.
- **Discoverability:** specific action/conditions permit revealing the clue/fact.
- **Player knowledge:** the player has learned or is authorized to know it.
- **NPC knowledge:** only the NPC's authorized knowledge may inform its behaviour/dialogue.
- **Unknown:** available evidence does not settle the fact.
- **Explicit absence:** canon positively establishes that the relevant entity/object is absent.
- **Proposed content:** AI or procedural logic has suggested content that is not canonical until validated and committed.

Do not collapse these into a single “visible” flag or translate unknown to false/empty.

## 8. Iterative Execution Protocol — Mandatory for Every Slice

Every slice follows this sequence; work stops and returns to audit if a check fails.

### A. AUDIT

- Fetch the current target-branch versions of every affected file before editing.
- Read the owning contracts, real callers, tests, and current integration map.
- State the exact failure hypothesis.
- Reproduce it in an existing test or add the smallest focused failing regression first.
- Confirm that the issue is not already fixed elsewhere and that the proposed owner is correct.

### B. IMPLEMENT

- Make the smallest coherent change that closes the reproduced gap.
- Reuse canonical authorities and existing types where possible.
- Keep the implementation scoped to one vertical slice.
- Do not silently expand scope or bundle unrelated cleanups.

### C. TEST

- Add/update deterministic unit or integration tests for the new behaviour.
- Cover negative cases and invariants: unauthorized visibility, unknown versus absent, idempotence, state persistence, restricted/abandoned locations, and no unsupported facts.
- Run the applicable automated tests/build/lint/type-check through available local/CI mechanisms. If they cannot be run, state that explicitly; do not imply they passed.

### D. REGRESSION

- Run the affected suite plus relevant cross-system regression coverage.
- Check the opening path and normal-turn path independently.
- Check fallback and recovery paths where touched.
- Ensure no test or code path bypasses canonical authority or changes player intent.
- Check for unintended changes to generated/tracked files.

### E. RE-AUDIT

- Re-fetch the changed files and inspect the final diff on the branch.
- Trace the exact data from producer to canonical owner to scene projection to final prompt.
- Confirm every changed caller sees the intended contract.
- Search for competing owners, stale projections, and newly orphaned components.
- Update the plan's progress ledger with evidence and remaining gaps.
- Only then start the next slice.

A failure at any stage creates a fix-and-repeat loop for the current slice. Do not mark a slice complete merely because implementation code exists.

## 9. Phases and Exit Gates

### Phase 0 — Current baseline and source trace

Tasks:
1. Map opening, freeform turn, movement/time advance, combat, regeneration/retry, resume/reload paths.
2. Trace starting-situation fields from confirmed character and StoryRun into WorkingContextEngine and OpeningSceneService.
3. Trace canonical sceneObjects from world template through story geography, GeographyGraph persistence, CurrentSituationBuilder, research/context, and prompt.
4. Trace entity creation/presence/visibility and scene-object discovery pathways.
5. Trace how an investigation's starting situation can create or reference canonical incident/victim/evidence records, if such a path exists.
6. Identify the earliest responsible boundary for any missing data.
7. Record actual current test and CI evidence separately from historical plan evidence.

**Exit gate:** A current source map, failing or missing regression, and one primary cause established without duplicating an owner.

### Phase 1 — Investigation-scene readiness contract

Tasks:
1. Define requirements for the first investigation fixture.
2. Define the readiness states and error/recovery behaviour.
3. Distinguish authored incident truth from generated proposals and unknown conclusions.
4. Define deterministic IDs/idempotence for prepared incident components using established project conventions.
5. Define how records are persisted and restored through existing authorities.
6. Write focused contract tests before integrating broad live paths.

**Exit gate:** Tests establish exactly what a prepared investigation scene must supply and what it must keep hidden.

### Phase 2 — First World Director vertical slice

Tasks:
1. Implement or extend the smallest coordinator/validator required by the audited design.
2. Reconcile the existing location, scene objects and entity cards before any creation.
3. Prepare only scenario requirements justified by the canonical starting situation and validated profile.
4. Commit through the existing scene-object, entity, event, or world authorities.
5. Add a stable reference or reliable idempotent lookup so preparation does not duplicate records.
6. Return readiness diagnostics instead of silently passing a missing required element.
7. Connect it to the opening path at the correct point; avoid mutating state inside a read-only projection helper.

**Exit gate:** The deterministic investigation fixture passes for first preparation, repeated preparation, opening projection, and persistence/reload.

### Phase 3 — Same prepared scene across opening and normal turns

Tasks:
1. Ensure opening and subsequent action contexts resolve to the same canonical incident/scene.
2. Compare their entities, objects, events, environment, occupancy and visibility sets.
3. Ensure observation targets are represented and meaningful interaction/observation uses existing authorities.
4. Preserve discovered/consumed/changed state on revisits.
5. Verify that opening regeneration cannot reset canon or duplicate the scene.

**Exit gate:** Opening, “observe victim,” “observe environment,” targeted examination, and revisit tests agree about scene identity and state.

### Phase 4 — Grounding, review, and fallback

Tasks:
1. Verify that review accepts supported prepared facts and rejects unsupported claims.
2. Test “no visible entity established,” unknown occupancy, and explicit absence as distinct cases.
3. Ensure fallback uses the same prepared scene evidence and does not silently replace it with generic empty-scene prose.
4. Improve deterministic prose only where the evidence is present but underused.
5. If evidence is absent, return readiness diagnostics rather than weakening semantic review.

**Exit gate:** Primary and fallback narration preserve the same required facts without hidden-information leakage.

### Phase 5 — Expand scene profiles

After the first vertical slice is stable, add and verify ordinary rooms, public/social spaces, restricted sites, abandoned locations, travel/arrival, exploration, and combat-context preparation. Reuse current owners and write separate profile-specific tests.

**Exit gate:** Each added profile has requirements, negative cases, idempotency/persistence tests, and a verified integration map.

### Phase 6 — Cross-system outcome completeness

Audit whether narration fully represents the authoritative player-visible consequences of canonical actions, including multi-effect spells. Extend the existing ActionResolution/narrative review path if tests demonstrate missing coverage. Do not relocate or duplicate effect resolution.

**Exit gate:** Deterministic tests prove that missing visible consequences are detected/repaired without rerunning or changing the canonical action.

### Phase 7 — Continuous regression and player-run live acceptance

Engineering tasks:
- Ensure relevant deterministic suites, build, lint/type-check, release contracts and CI run and are green for the exact branch head.
- Produce a compact report of changed contracts, tested scenarios, limitations, and known risks.
- Provide a player-run live-session checklist including the real provider/model, actual displayed opening and first observation turns, scene context inspection/recording, fallback route if available, and reload/revisit behaviour.

Player-owned tasks:
- Run the real Story UI with configured provider credentials.
- Capture the opening plus at least “I observe the victim” and “I observe the environment.”
- Verify prose quality, relevance, continuity, privacy/knowledge boundaries, and error/loading behaviour.
- Return session evidence for follow-up fixes.

**Gate:** Never mark live-model quality or UI acceptance as PASS without the player's live evidence. A player test failure reopens AUDIT → IMPLEMENT → TEST → REGRESSION → RE-AUDIT for the relevant slice.

## 10. Test Matrix

| Test | Required result |
|---|---|
| First preparation | All profile-required records exist or readiness explains the missing requirement. |
| Repeat preparation | No duplicate victim, clue, object, or incident; no reset of existing state. |
| Opening projection | Same canonical scene facts as the current scene authority. |
| Observe victim | Target-relevant visible facts; hidden diagnosis/culprit remains unknown unless established. |
| Observe environment | Relevant established objects/features; no invented layout or unsupported absence. |
| Examine clue | Discovery follows conditions and records knowledge through its proper authority. |
| Hidden clue | Exists canonically but is excluded until discoverable. |
| Uncertain occupancy | No unsupported “nobody is here” claim. |
| Explicitly abandoned/restricted | No ineligible ambient seeding or unauthorized disclosure. |
| Revisit/reload | Scene state and discovery persist; no duplicates. |
| Primary vs fallback | Same required scene facts, distinct prose quality allowed. |
| Multi-effect action | All required visible consequences represented once; state is not re-executed during repair. |

## 11. Operational and Repository Rules

- Work on this dedicated feature branch and keep commits small and descriptive.
- Fetch the latest affected file before each update; never replace a file from stale contents.
- After each change, re-fetch it and review the actual saved content.
- Never merge to main without explicit approval.
- Do not edit code if the failure has not been reproduced or the owning authority is unclear.
- Keep generated artefacts out of commits unless they are explicit project outputs.
- Preserve existing content in planning documents and update the documentation index when adding a new active plan.
- Record commit SHA, affected tests, test outcomes, and remaining gaps in the plan progress ledger.
- Live tests remain player-owned; automated results and live acceptance must be reported separately.

## 12. Current Progress Ledger

| Slice | Status | Evidence / next action |
|---|---|---|
| Main-source audit | IN PROGRESS | Confirmed existing owners and the gap between a starting-situation hook and required canonical incident/evidence records. Next: audit how incident/evidence records can be represented and committed without a parallel authority. |
| Plan and docs index | COMMITTED | `docs/WORLD_DIRECTOR_IMPLEMENTATION_PLAN.md` and `docs/README.md` index update committed on this feature branch; final content re-fetch verified. |
| Investigation scene contract | PARTIAL | `tests/world-director.test.ts` covers the diagnostic contract for missing victim/evidence anchors, visible versus hidden/absent anchors, and non-investigation openings. A canonical incident-preparation contract is still needed. |
| First implementation | IMPLEMENTED — DIAGNOSTIC SLICE | `server/domain/worldDirector.ts` assesses investigation-opening readiness; `OpeningSceneService` records the report in `runtimeState.openingNarrativeContext`. This does not yet create canonical victim/incident/evidence records or change player-facing narration. |
| Automated regression/CI | PASS — CODE FIX VERIFIED | Root cause: the HTTP action pipeline uses a 30,000 ms provider timeout, while `DeterministicMockAdapter` intentionally sleeps `timeoutMs + 20 ms`; measured response was 30,383 ms, contradicting the old `< 30000 ms` assertion. Updated `tests/chaos-failure-injection.test.ts` to require a real hang near the configured 30s timeout and a finite `< 35000 ms` ceiling for pipeline overhead. Fix commit: `ac678cdbaceb83bb00a2899c672706121ed23968`. Release gate `40467446884` passed 1,558/1,558 tests (0 failures); verification runs `40467447030` and `40467446912` both completed successfully. The subsequent branch-head commit `1e9a13907af5ec5f877365e653f7a1a2bf6027e9` changes only this progress ledger; no application/test code changed after the passing runs. World Director tests passed. No live provider/UI acceptance is claimed. |
| Player live test | DEFERRED TO PLAYER | Required after engineering provides the run checklist. |

## 13. Definition of Done

World Director is complete only when every supported scene profile can be validated against explicit requirements; the appropriate canonical records are prepared/reused and persisted; opening, action, research, and fallback paths see the same authorized facts; observations and interactions are meaningful and stateful; hidden facts remain hidden; repeated preparation is idempotent; automated regressions/CI pass; and the player has a clear live acceptance checklist.

**End state:** DreamVille's narrator receives a world that is genuinely prepared, rather than being instructed to make a compelling scene out of missing facts.
