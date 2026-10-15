# Narrative Grounding Phase 0 — Runtime Call-Path Trace (2026-10-15)

**Status:** SOURCE TRACE COMPLETE FOR THE PATHS BELOW; behavioural validation remains incomplete.  
**Code baseline inspected:** `main` at `090b7d7b8c8b9c6ef47a0f643af3b15a303e1179`.  
**Scope:** The ordinary freeform player turn, narration regeneration, opening scenes, and the population/simulation seam. This is not a claim that every caller in the repository has been exhaustively traced.

## 1. Main live freeform-turn path

The inspected order is:

`server/mockEngine/serverMockAuthority.ts` resolves the canonical freeform action and builds an `ActionResolution`  
→ calls `MultiModelOrchestrator.generateNarrativeOnly`  
→ `server/domain/aiOrchestrator.ts` rebuilds `CurrentSituation`, interprets player intent, re-builds the situation, runs `NarrativeResearchPipeline.research`, sanitizes research with `EpistemicBoundaryEnforcer`, resolves `StoryBeatDirector`, creates `NarrativeDirector` plan and prompt  
→ `executeTaskGeneration('narrative.generate')` validates each provider response (turn-package shape, freshness, pacing, scene/action/action-mode continuity, intent safety, information-topic/information continuity, time continuity and `SemanticNarrativeReview`)  
→ a bounded richness / story-beat quality path may use `narrative.review`  
→ successful output returns presentation-only with state changes stripped  
→ authority-level live quality review → persisted action-history/continuity record → UI view state.

Key source references at the audited baseline:

- [Freeform action → narrative-only call](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c8b9c6ef47a0f643af3b15a303e1179/server/mockEngine/serverMockAuthority.ts#L1248-L1295)
- [Per-provider candidate validation in the narrative-only path](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c8b9c6ef47a0f643af3b15a303e1179/server/domain/aiOrchestrator.ts#L8120-L8220)
- [Bounded semantic review / repair helper](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c8b9c6ef47a0f643af3b15a303e1179/server/domain/aiOrchestrator.ts#L7571-L7668)
- [Authority-level post-generation quality gate](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c9c6ef47a0f643af3b15a303e1179/server/mockEngine/serverMockAuthority.ts#L1378-L1465)

The integration harness at `server/domain/turnIntegrationHarness.ts` is a deterministic/mock harness: it builds intent, situation and bounded research, then runs the director, semantic review and state adjudicator. It is useful for reproducible integration checks but does not prove real-provider narration quality or the actual Story UI flow.

## 2. Confirmed candidate-validation gap

**Finding: the extra authority-level rewrite path is fail-open when its rewrite does not pass.**

At the audited baseline, the original result from `generateNarrativeOnly` has already passed that orchestrator’s validators. The authority then runs `evaluateLiveNarrativeQuality`, which requires richness/pacing and a concrete action-consequence/reaction beat. If it rejects the original, the authority asks `executeTaskGeneration('narrative.review')` for JSON containing `narrativeText`.

That second candidate currently receives only:
1. a JSON/prose-shape parse check in the task’s `validateResponse`;
2. the narrower authority-level richness/pacing/action-fidelity check after generation.

It does **not** rerun the same semantic/epistemic and presentation-continuity checks that protected the original `generateNarrativeOnly` candidate.

Worse, when this rewrite is parsed but `postReview.accepted === false`, code adds `LIVE_NARRATION_REVIEW_REJECTED` to package events but leaves the original (already rejected by the authority gate) `narrativeResponse` in place. When the rewrite call throws, the catch explicitly logs that it is “retaining original provider result.” Thus a rejected candidate can still be persisted and shown to the player.

Relevant immutable-baseline lines: [authority-level final review and fail-open branches](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c8b9c6ef47a0f643af3b15a303e1179/server/mockEngine/serverMockAuthority.ts#L1382-L1462).

**Second confirmed gap: the internal N18 rewrite was only partially validated.** In `server/domain/aiOrchestrator.ts`, primary `narrative.generate` candidates pass presentation continuity and `SemanticNarrativeReview`. The bounded `narrative.review` rewrite originally checked package shape and `validateNarrativePresentation`, then richness/environment/StoryBeat-score improvement, but did not rerun `SemanticNarrativeReview` on the replacement. If the rewrite was rejected or unusable, the original primary narration could be preserved; the method also set `storyBeatFidelity.valid=false` in its audit but still returned `success: true`.

Draft PR #71 has now been expanded to share `validateNarrativeCandidate` across both repair layers, pass the active `WorldRepository` explicitly, validate the internal rewrite before it can replace the primary, and perform a final complete candidate check before `generateNarrativeOnly` returns success. A failed final check now returns a typed generation failure for callers to handle rather than returning text with a failed final gate. These code changes are **not yet CI-verified** at the latest PR #71 head; do not treat them as shipped.

**Runtime fix is isolated in draft [PR #71](https://github.com/HeWhoArose/Dreamville-External/pull/71); this documentation report and PR #69 remain docs-only.**

The current PR #71 implementation adds a shared final candidate validator and changes the authority repair path to withhold rejected text. Its CI is still running at the time of this note; do not mark the fix verified until the new regression and full workflow results are inspected.

**Required fix:**

- Re-run the orchestrator’s full shared freshness/presentation/semantic/epistemic/StoryBeat validation on the authority-level rewrite candidate, using the already-built current situation, player intent, narrative plan and StoryBeat contract.
- Apply that same shared validation to the **internal** `narrative.review` rewrite inside `generateNarrativeOnly`; richness improvement alone must never authorize replacement prose.
- Before returning `success: true`, validate the exact final turn package. A failed final check returns a typed failure; it cannot merely be logged in `narrativeQualityAudit`.
- Keep rewritten prose only when both the complete candidate validation and the applicable live action/consequence/richness gate accept it.
- If the authority repair is unavailable, malformed, rejected, or throws, clear player-facing prose and visual cues and attach a retryable `narrativeError`. Do not undo the already-committed canonical action; keep the action log and canonical outcome intact.
- Test accepted rewrite, semantically/epistemically rejected internal and authority rewrites, invalid StoryBeat, action/consequence rejection, malformed/empty rewrite, deterministic fallback from the review call, and provider exception. Assert rejected text is not persisted or shown and canonical mechanics remain committed.

The runtime changes are isolated in draft [PR #71](https://github.com/HeWhoArose/Dreamville-External/pull/71) so the archive/documentation PR does not mix unrelated runtime behavior.

## 3. Other live narration paths

| Path | Current source/connection | Audit result |
|---|---|---|
| Regenerate narration for a committed action | `server/api/gameRoutes.ts` calls `generateNarrativeOnly`; on failure clears prose/cues and returns 503 with `actionCommitted: true`, null narration and retryable error state | Base validators are reused; route-specific N18 action/consequence parity is not present. Recheck after PR #71 and test retry through actual UI. |
| Combat-player action | `server/domain/combatPlayerActionService.ts` calls `generateNarrativeOnly` after canonical combat resolution; on generation failure it returns a deterministic `mechanicalSummary + target HP` string | Mechanics remain committed; model prose uses orchestrator validation. The mechanical fallback is grounded but currently string-only and not tagged as a typed narration error. UI presentation and fallback provenance need live verification. |
| Combat encounter service | `server/domain/combatEncounterService.ts` calls `generateNarrativeOnly`; failed narration falls back to the already-resolved mechanical summary + target HP + initiative instruction | This is an explicit grounded combat fallback, not the authority fail-open bug. Verify UI distinguishes fallback from AI prose and does not re-resolve combat. |
| Opening scene | `server/services/openingSceneService.ts` calls `executeTaskGeneration('narrative.generate')` with a prose-length check, then applies its separate N18/N8 quality rewrite; persistent rejection/repair failure downgrades to deterministic opening | Separate from `generateNarrativeOnly`: the initial/rewrite acceptance is quality/shape-focused, not the same full `SemanticNarrativeReview` candidate gate. PR #72 fixes population projection, but opening semantic/epistemic parity remains an explicit Phase 6 audit item. |
| Deterministic `TurnIntegrationHarness` | `server/domain/turnIntegrationHarness.ts` | Deterministic test evidence only; not real provider or UI evidence. |

## 4. Living-world population and encounter seam

### Existing producer and ordinary-turn call path

- `LocationPopulationProfile` exists on canonical location metadata. Missing occupancy must be `UNKNOWN`, never “abandoned.”
- `WorldActivityDirector.ensureAmbientPopulation(repository, storyId, locationId)` is an existing deterministic canonical producer. It checks explicit `INHABITED` metadata or public-place location context; does not seed an ordinary unknown-occupancy ruin; respects `ABANDONED`, `RESTRICTED`, and `expectedPopulation=NONE`; creates canonical `EntityCard`s with location/activity/provenance metadata; saves the existing StoryRun snapshot; and is idempotent.
- The ordinary freeform path in `server/mockEngine/serverMockAuthority.ts` calls `WorldActivityDirector.ensureAmbientPopulation` before `CurrentSituationBuilder.build`. `CurrentSituationBuilder` then projects only visible, present, living, same-location entities and calls `WorldActivityDirector.buildAmbientEvents` to expose grounded ambient activity, social opportunities, potential encounter events, and occasional NPC-initiated interactions through `visibleEvents`/`sceneEvidence`.
- `tests/world-activity-director.test.ts` already covers deterministic population, no population at abandoned/restricted/unknown non-public locations, the unknown-public-citadel exception, ambient activity projection, hidden/off-location/dead filtering, NPC-initiated events, idempotence, schedule refresh, and persistence. Reuse this owner and test coverage; do not build a second population or encounter subsystem.
- `LivingWorldSimulation` has a separate responsibility: it advances already registered NPC schedules/physiology and scheduled events. Its `advanceSimulation` method not creating ambient NPCs is not evidence that DreamVille lacks a population producer.
- `WorldRepository.createStoryRunFromConfirmedCharacter` previously copied geography nodes without preserving the optional `population` contract. That could turn authored restricted/abandoned metadata into UNKNOWN before a producer checked it. Draft PR #72 preserves the field on the StoryRun GeographyGraph.

### Concrete missing integration: opening-scene startup

`POST /story-runs` calls `OpeningSceneService.generateOpeningScene` immediately for a new StoryRun, before the normal freeform action path has a chance to seed ambient population. Before draft [PR #72](https://github.com/HeWhoArose/Dreamville-External/pull/72), `OpeningSceneService` did not call `ensureAmbientPopulation`, `WorkingContextEngine.assembleOpeningContext` did not include a canonical visible-population/activity chunk, and the opening quality-review `CurrentSituation` contained only the player and UNKNOWN occupancy. A public place such as Elysium Solar Citadel could therefore receive an empty-feeling opening even though its first live action would seed people.

PR #72 proposes to close that opening boundary by calling the existing idempotent producer before context assembly, projecting canonical visible entities/events/occupancy into the opening context and review, preserving the location population profile during StoryRun geography conversion, and making deterministic opening fallback carry visible canonical occupants. CI is running; do not call this integration verified until its targeted and full workflows pass.

### Remaining end-to-end proof

The system exists, and the ordinary freeform seed → canonical entity cards → scene projection/activity-event path is source-verified. The broader route-level chain remains **PARTIAL / END-TO-END UNVERIFIED** until there is passing integration evidence for fresh opening, subsequent player turns, relevant encounter/social opportunity delivery, reload/resume, no duplicate entities, authored restricted/abandoned/unknown locations, and a real player-facing session. Use draft PR #72 as the opening-path candidate fix; do not begin a parallel encounter generator.

References: [WorldActivityDirector](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c8b9c6ef47a0f643af3b15a303e1179/server/domain/worldActivityDirector.ts), [WorldActivityDirector tests](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c8b9c6ef47a0f643af3b15a303e1179/tests/world-activity-director.test.ts), [CurrentSituationBuilder](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c8b9c6ef47a0f643af3b15a303e1179/server/domain/currentSituation.ts), [LivingWorldSimulation](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c8b9c6ef47a0f643af3b15a303e1179/server/domain/livingWorldSimulation.ts), [population contract audit](LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md).
## 5. Next ordered work

1. Keep draft [PR #71](https://github.com/HeWhoArose/Dreamville-External/pull/71) isolated for the live narration fail-open defect. Its targeted rejected-primary/rejected-repair regression passed in the observed GitHub test jobs, but the full workflows remained red on the same ten runtime assertions reported on the main baseline. Do not claim the release gate is green or merge while unresolved failures remain.
2. Verify draft [PR #72](https://github.com/HeWhoArose/Dreamville-External/pull/72): new-opening ambient population integration, preservation of authored occupancy metadata, prompt/review grounding, deterministic fallback, and no population in a restricted location. Inspect the targeted test and all CI jobs.
3. Audit remaining callers (`combatPlayerActionService`, `combatEncounterService`, opening generation and the narration-regeneration route) for error/fallback behavior and candidate final-validation parity. Record combat's grounded mechanical-summary fallback separately from the authority fail-open bug.
4. Run targeted + regression + full CI and compare failures with the documented main baseline. No green status is claimed here.
5. Run human live-model and player-facing UI/UX sessions for Phase 1 and repeat after each relevant fix. If provider or UI access is unavailable, record BLOCKED rather than PASS.


## 6. Additional source finding — authored scene-object projection (2026-10-16)

A live review regression exposed a second, narrower producer-consumer defect in the same grounding path. The reviewer was rejecting the phrase *private viewing box* even when the test's `WorldTemplate.geography.nodes[*].sceneObjects` defined that object as visible and authored.

### Exact contract and root cause

1. **Producer:** `WorldTemplate.geography.nodes[*].sceneObjects` declares authored, potentially visible props.
2. **Projection boundary:** `WorldRepository.createStoryRunFromConfirmedCharacter()` constructs a new story-specific `GeographyGraph` node. Its previous `locNode` projection copied identity, description, coordinates, accessibility, ambient sensory text, and provenance, but omitted `sceneObjects`.
3. **Consumer:** `CurrentSituationBuilder.build()` only projects props it receives from the story-specific canonical location into `CurrentSituation.sceneObjects` and `sceneEvidence.objects/structures`.
4. **Validator:** `SemanticNarrativeReview.isConcreteClaimSupported()` deliberately authorizes concrete prop claims from visible scene objects/structures or visible entities, not from loose prose overlap. That is the correct safety boundary.
5. **Observed result:** the valid authored object did not reach the review evidence set, so the review correctly treated the model's mention of the box as unsupported. Weakening semantic review would conceal the projection loss and permit hallucinated props.

### Candidate fix and required validation

Draft [PR #71](https://github.com/HeWhoArose/Dreamville-External/pull/71), latest observed branch head `94abd5d0760dd4f353c1827dd54bb4e2f5024e6f`, now preserves a deep copy of `sceneObjects` when constructing story geography and adds an assertion that the private viewing box survives WorldTemplate → StoryRun geography projection. The repaired prose also includes explicit movement and observation verbs required by the current intent review contract.

**Latest observed status (head `3443ae9dc97b871de228dc0ca4e7340cccd2fef9`):** TypeScript type-check and release contracts passed; `npm test` failed with nine assertions, but `Story Experience Slice 4 — live narration turn gate blocks environment-only prose` was not among the failures. The latest log still shows unrelated model routing, scene-anchor/provider-failure, movement-intent, and Phase 18 harness failures. This means the target test passed in that workflow, not that PR #71 or the full release gate passed. Production build was skipped after test failure. Keep the PR draft until the remaining baseline defects are resolved and all required gates pass.

This field is separate from the authored `population` profile that draft PR #72 preserves at the same projection boundary. When reconciling either change, preserve **both** fields; neither patch may overwrite the other's contract.

## 7. Configuration audit finding — narration route priority (2026-10-16)

The existing Phase 12 regression requires `google_gemini::gemini-3.8-flash` ahead of `google_gemini::gemini-2.5-flash` for `narrative.generate`. The seeded `MultiModelOrchestrator.seedDefaultPins()` route and persisted `server/data/orchestrator_config.json` disagreed with that declared policy: Gemini 2.5 was earlier than Gemini 3.8. The same ordering issue existed for `narrative.review`.

Draft [PR #73](https://github.com/HeWhoArose/Dreamville-External/pull/73) aligns those two chains and extends the regression to check persisted configuration as well as the in-memory seeded chain. Its route-order test passed in the observed workflow, but the full suite still failed on separate routing-registry, scene-anchor, movement-continuity, and turn-harness assertions. Keep the PR draft; do not describe the full release gate as green.


## 8. CI follow-up — test evidence and fixture correction (2026-10-16)

### PR #69 documentation cleanup gate

The release-contract check and TypeScript type-check passed on the current documented branch head `bed5834b5af0cff6f8c74af7570630fbfffe94b6`. Its release-gate `npm test` step failed with **1491 tests: 1481 passed, 10 failed**. The failures surfaced in live narration repair, model routing/config expectations, canonical scene-anchor/fallback behavior, movement destination continuity, and the Phase 18 integration harness. The workflow log contained no missing-archive-path assertion among the failures. This is not a pass and not proof that every failure predates this branch; classify by comparing the exact failing assertions on `main` before merge.

### PR #71 semantic fixture correction

At head `c296376e0680026acd720c72fe07745be29aa725`, the original “private viewing box” unsupported-claim failure was resolved by carrying `sceneObjects` through story-geography projection, but strict semantic review then rejected “caste enforcers.” The test fixture had described the guard detail only in `startingSituation` and canonical event summaries; those are not substitutes for visible canonical `EntityCard`s.

The newest draft head `3443ae9dc97b871de228dc0ca4e7340cccd2fef9` therefore adds explicit visible entity cards for the high-level target and Caste Enforcers, while retaining the authored private viewing box in the location's `sceneObjects`. The rewritten narration also cites canonical ambient sensory evidence and keeps the observation unresolved. This is the correct boundary: **strict review should reject unsupported actors; canonical scene setup must provide those actors as visible entities.** The latest head's workflows were in progress when this note was authored; keep PR #71 draft until the live target test and all CI runs finish.

### PR #73 routing regression cleanup

PR #73's initial head `41cd7ef683dea71279fbb016bf35b42038ebddcb` passed the specific configured-order regression but the suite remained red. Two additional routing failures were traced to test assumptions inconsistent with the seeded registry:

- `tests/ch26_model_routing_slice1g.test.ts` said both configured models were unusable but left Gemini 2.5 Flash in its actual seeded `Healthy` state. The test now marks both configured entries `Unavailable` explicitly before asserting emergency-floor selection; that makes the safety test independent of future default seed health.
- `tests/modelRoutingIntegration.test.ts` expected Gemini 2.5 Flash `Throttled`, while `seedDefaultModels()` currently sets `Healthy`, `quota: Healthy`, and `accessStatus: accessible`. The test was aligned with that code-backed seed contract, rather than changing the production model health to satisfy an obsolete assertion.

The updated PR #73 head is `46c87b5f90ce6900e3ff015113008973e13f8952`. CI completed with seven failed assertions; the configured route-order assertion and two corrected health/route test assertions passed. Remaining failures were the live narration gate (expected on its main-based branch without PR #71), scene-anchor/provider-failure cases, movement continuity, and Phase 18 harness. Production build did not run after tests failed.


## 9. Movement destination continuity audit (2026-10-16)

Draft [PR #74](https://github.com/HeWhoArose/Dreamville-External/pull/74), branch `fix/movement-destination-continuity`, head `6b9b921d80b82845ebd924ce113599260c13bb6c`, addresses three failures observed in the main-based release run:

1. `PlayerIntentInterpreter.explicitLocation()` only returns a location target when its name matches the current location or the immediate connected-location list. An explicitly named destination outside that list was dropped from the intent, so later narration review could not insist that the intended destination remain visible.
2. A one-word `Continue` following unfinished movement was recognized as `action: continue_travel`, but the subsequent generic movement branch overwrote its goal with `change_position_or_approach_target` instead of `continue_travel_toward_destination`.
3. `TurnIntegrationHarness.buildDeterministicNarration()` narrated all movement as moving closer to a generic source. `SemanticNarrativeReview` correctly rejected this when the established target was `The Lantern Vault`.

### Scope and safety boundary

PR #74 retains a name-only explicit destination when a player names a place with `toward(s)` or `into` but it is not found in current situation links. It does not invent a location ID, create a location, commit a movement, or claim arrival. Canonical world resolution must still verify the destination and reachability. It also gives continuation its own goal and makes the deterministic harness mention the intended destination while explicitly not claiming arrival.

**Latest observed CI status (head 6b9b921d80b82845ebd924ce113599260c13bb6c):** the named-destination intent test, the Continue-preserves-travel-goal test, and the Phase 18 movement/inspection/combat/item-manipulation chain test no longer appear among failures. The release gate reported 1491 tests: 1484 passed, 7 failed; release-contract and type-check steps passed, but the production build was skipped. Remaining failures were the live narration gate, stale routing tests on this main-based branch, and Phase 12 scene-anchor/provider-failure checks. This is evidence that PR #74 fixes the targeted movement regressions in that run—not that the full branch is green. Keep the PR draft.

## 10. Movement CI outcome and cross-PR merge dependencies (2026-10-16)

PR #74 head 6b9b921d80b82845ebd924ce113599260c13bb6c produced a completed release-gate run with 1484 passed / 7 failed of 1491. The three intended movement tests were absent from the failure list:

- movement phrasing preserves the named destination in make-my-way actions — passes on this head;
- Continue inherits an unfinished travel destination from the immediately previous movement turn — passes on this head;
- Phase 18 covers movement, inspection, combat, and item manipulation through the same chain — no longer fails in that run.

The remaining seven failures block the release gate. PR #74's main-based branch does not include the PR #71 candidate-review fix or PR #73 routing test corrections, so some known failures remain until branches are integrated. Re-run on a combined integration branch after resolving the projection overlap.

### Safe integration sequence (proposal, not a merge record)

1. Keep PR #69 as the documentation/archive owner; rerun it on the integrated code baseline before merging, because its own full suite is red.
2. Reconcile PR #71 and #72's WorldRepository projection changes. Final node mapping must preserve both authored sceneObjects and authored population; ensure neither patch overwrites the other.
3. Integrate PR #73 routing/config correction and explicit-health test fixes. Check configured in-memory and persisted route order together.
4. Integrate PR #74 destination/goal changes and harness-only destination presentation, ensuring name-only targets receive no synthetic ID or direct canonical mutation.
5. Run targeted suites, full suite, lint, type-check, production build, and release contracts on one combined branch. Compare exact failures against the same main baseline; do not call every failure preexisting without evidence.
6. After code CI is green, run provider-backed Phase 1 sessions through the actual player-facing UI and persistence/reload tests. Those human tests remain BLOCKED until actually executed.

No merge is recorded by this audit.