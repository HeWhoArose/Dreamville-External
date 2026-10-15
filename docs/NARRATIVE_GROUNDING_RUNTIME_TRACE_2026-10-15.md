# Narrative Grounding Runtime Trace — 2026-10-15

**Branch:** `fix/narrative-travel-and-opening-population`  
**Baseline:** `main` at `090b7d7b8c8b9c6ef47a0f643af3b15a303e1179`  
**Purpose:** record source-traced runtime findings and prevent a documentation audit from being mistaken for live behavioural verification.

## Findings and evidence

### 1. Player intent and destination preservation

- `server/domain/playerIntentInterpreter.ts` resolves explicit location targets only from the current location and discovered connected locations.
- The previous implementation did not preserve a player-named destination when that name was not in the canonical connected-location projection. This loses useful intent even though it must not create a location or route.
- The continuation helper reads the most recent movement action. It now uses the same destination extractor as direct movement, avoiding two different parsing rules.
- `server/domain/semanticNarrativeReview.ts` already rejects movement narration that omits a recognized destination. `server/domain/turnIntegrationHarness.ts` previously generated deterministic movement prose without the target, causing the full turn harness to fail.

**Repair boundary:** keep the destination as an explicit intent reference without an invented canonical ID; only the canonical geography/spatial authority may validate a route or commit movement. When the destination cannot be resolved, narration must say the attempt is unresolved, not claim arrival.

### 2. Opening-scene population context

- `server/mockEngine/serverMockAuthority.ts` calls `WorldActivityDirector.ensureAmbientPopulation` after canonical action processing and before building the live narration situation. It also refreshes population after a time-advance action.
- `server/domain/currentSituation.ts` projects ambient activities from canonical entities, but is intentionally a read projection. It must not become a hidden world-mutation hook.
- `server/services/openingSceneService.ts` originally assembled the opening prompt without first ensuring ambient population.
- `server/domain/workingContextEngine.ts` opening context included the starting location and protagonist, but not a canonical visibility projection of present non-player actors. Therefore, even registered people could be omitted from the initial prompt.
- `server/domain/worldActivityDirector.ts` already contains deterministic, idempotent ambient archetypes for public places, including guilds, inns, markets, citadels, and alleys. Authored abandoned/restricted status and expected population NONE block population. Unknown occupancy by itself is not treated as proof of an abandoned place.

**Repair boundary:** initialize ambient population explicitly during opening-scene generation, then add visible people/activity to the opening context only through `CurrentSituationBuilder`'s canonical visibility projection. Never infer that a named person is visible merely because a registry card exists.

### 3. Encounter simulation and NPC schedules

- `WorldActivityDirector` can create ambient entity cards and derive activity/opportunity events from visible, alive, present entities.
- `LivingWorldSimulation` advances registered NPC schedules and scheduled world events when canonical time advances through `WorldSimulationService` (and rest-time advancement).
- Ambient entities created by `WorldActivityDirector` are not automatically registered with `LivingWorldSimulation.registerNpcSchedule`. Their presence/activity is refreshed by the population director's local clock-based rules when that director is called.
- `WorldActivityDirector.buildAmbientEvents` creates presentation/event projections; this alone is not proof of a canonical encounter event committed through `CanonicalCommandEngine`.
- `docs/LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md` already correctly marks end-to-end encounter generation as unverified.

**Status:** partial integration, not complete simulation-driven encounters. Do not claim all generated ambient NPCs have autonomous movement or that encounter events are canonically committed. A follow-up implementation must define one authoritative registration/encounter lifecycle, synchronize entity cards with schedules, and add idempotency/reload/quiet-turn tests before wiring more behavior.

### 4. Narrative model, review, and persistence boundaries

- `server/mockEngine/serverMockAuthority.ts` resolves canonical action mechanics before calling `MultiModelOrchestrator.generateNarrativeOnly`, then applies a live-turn quality gate and bounded rewrite.
- `server/domain/aiOrchestrator.ts` contains the richer narrative path: research, planning, beat/scene composition, provider routing, semantic review/rewrite, story-beat validation, richness/pacing review, and continuity recording.
- `server/domain/turnIntegrationHarness.ts` is a deterministic integration harness, not a live-provider or player-facing UI session.
- The existing `StoryBeatDirector`, N13–N19 and orchestration owners are reused; no duplicate director/router is introduced by this repair.

## Verification status

- Source inspection: completed for the paths above.
- Regression tests added/updated: explicit unknown destination preservation, continuation destination recovery, deterministic harness destination phrasing, and opening population in the actual opening prompt.
- Automated CI: pending on this branch until GitHub Actions completes.
- Real configured-provider session: **NOT RUN**.
- Player-facing Start Run / multi-turn / reload session: **NOT RUN**.
- End-to-end canonical encounter commit and autonomous schedule registration: **NOT VERIFIED**.

Do not mark live-model, UI, or end-to-end encounter gates PASS based on source inspection or mocked tests.
