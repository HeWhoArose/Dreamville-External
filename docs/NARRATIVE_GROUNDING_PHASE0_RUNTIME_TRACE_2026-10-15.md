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

**Required fix (separate runtime PR, not this docs PR):**

- Re-run the orchestrator’s full shared presentation + semantic + story-beat validation on the authority-rewrite candidate, using the already-built current situation, player intent, narrative plan and StoryBeat contract.
- Keep the rewritten candidate only when both the full candidate validation and the live action/consequence gate accept it.
- If the rewrite is unavailable, malformed, rejected, or throws, clear player-facing prose and visual cues and attach a retryable `narrativeError`. Do not undo the already-committed canonical action; keep the action log and canonical outcome intact.
- Test accepted rewrite, semantically rejected rewrite, action/consequence rejection, malformed/empty rewrite, deterministic fallback from the review call, and provider exception. Assert rejected text is not persisted or shown and the canonical action remains committed.

This must be delivered separately from PR #69 so the archive/documentation PR does not mix unrelated runtime behavior.

## 3. Other live narration paths

| Path | Current source/connection | Audit result |
|---|---|---|
| Regenerate narration for a committed action | `server/api/gameRoutes.ts` calls `generateNarrativeOnly`; on failure returns a 503 with `actionCommitted: true`, null narration and retryable error state | The main generation validators are reused. Verify UI retry handling in a real session. |
| Combat-player action | `server/domain/combatPlayerActionService.ts` calls `generateNarrativeOnly` after combat resolution | Caller found; inspect its error and final-display handling before changing it. |
| Combat encounter service | `server/domain/combatEncounterService.ts` calls `generateNarrativeOnly` after encounter resolution | Caller found; inspect its error and final-display handling before changing it. |
| Opening scene | `server/services/openingSceneService.ts` builds opening context and research, then has an N18 richness/N8 pacing rewrite; if still rejected, it downgrades to a deterministic canonical opening | A separate policy/path. It does not establish that live turns or opening rewrites receive identical semantic review. |
| Deterministic `TurnIntegrationHarness` | `server/domain/turnIntegrationHarness.ts` | Deterministic test evidence only; not real provider or UI evidence. |

## 4. Living-world population and encounter seam

Source checked:

- `LocationPopulationProfile` exists on canonical location metadata. Missing occupancy must be `UNKNOWN`, never “abandoned.”
- `CurrentSituationBuilder` projects canonical current-location information and `sceneEvidence`; it does not create occupants.
- `WorldSynthesisService` requests population profiles and encounter-profile metadata during world generation. That is world synthesis, not evidence of turn-by-turn encounter selection.
- `LivingWorldSimulation` registers and advances **already registered** NPC schedules/physiology and scheduled world events. Its inspected `advanceSimulation` path moves registered NPCs and activates/misses scheduled events; no ambient encounter candidate/selection or NPC-creation operation was found in that simulation class.
- The living-world API’s state and scheduling routes read/project simulation state or schedule a supplied event through the canonical command boundary. They do not by themselves prove chance-encounter creation.
- `CurrentSituationBuilder` consumes registered canonical NPC/entity state. It does not turn an empty query into evidence that a location is abandoned.

Reference: [living-world source audit](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c8b9c6ef47a0f643af3b15a303e1179/docs/LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md), [LivingWorldSimulation](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c8b9c6ef47a0f643af3b15a303e1179/server/domain/livingWorldSimulation.ts), [location population contract](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c8b9c6ef47a0f643af3b15a303e1179/server/domain/types.ts), [world synthesis population requirements](https://github.com/HeWhoArose/Dreamville-External/blob/090b7d7b8c9c6ef47a0f643af3b15a303e1179/server/services/worldSynthesisService.ts).

**Conclusion:** population *metadata* and simulation of registered actors/events are present. In the inspected paths, the following producer chain remains unproven: location/time/population eligibility → deterministic encounter proposal → canonical NPC/event creation and persistence → perceptible situation/evidence → story beat/research → reviewed narration → reload-safe, idempotent next turn. Treat it as **END-TO-END UNVERIFIED**, not as a missing subsystem to design immediately; continue repository-wide call search and write an integration test that exercises the actual producer once its owner is identified.

## 5. Next ordered work

1. Fix the authority rewrite fail-open path in a runtime-only branch and add targeted regression tests.
2. Audit remaining callers (`combatPlayerActionService`, `combatEncounterService`, opening generation and the regeneration route) for error/fallback acceptance and candidate final-validation parity.
3. Finish identifying the canonical world-activity/encounter producer; do not introduce a second simulation or narrator-owned spawning.
4. Run targeted + regression + full CI and compare failures with the documented main baseline. No green status is claimed here.
5. Run human live-model and player-facing UI/UX sessions for Phase 1 and repeat after the fix. If provider or UI access is unavailable, record BLOCKED rather than PASS.
