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
