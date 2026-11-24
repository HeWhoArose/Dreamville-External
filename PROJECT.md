# Project: Dreamville Unified Audit Reconciliation & Architecture Decision Programme

## Architecture
Dreamville is a living-world narrative engine that combines deterministic state simulation with LLM narrative generation.
Core architectural invariants:
1. **World Simulator Boundary**: The LLM may propose what could plausibly happen (`WorldSimulationProposal`), but Dreamville's rules and state owners determine what actually happens. The Narrator describes the accepted result; it does not create the result by writing it. No AI proposal directly mutates canonical state.
2. **Deterministic Adjudication**: All state mutations pass through deterministic precondition checks, forbidden canon checks, version/hash CAS checks (`STALE_PROPOSAL_REJECTED`), and commit records with provenance.
3. **4-Stage Entity Lifecycle**: `EPHEMERAL DETAIL -> PROPOSED ENTITY -> ACTIVE TEMPORARY ENTITY -> PERSISTENT CANONICAL ENTITY`. Transient entities (e.g. hailed taxis, pedestrians) remain tracked for the exact duration of the interaction without premature disappearance or permanent store pollution.
4. **Unified Turn Execution**: Production HTTP action route (`POST /api/game/action`) and orchestrator turn route (`POST /api/game/orchestrator/turn`) share the authoritative state adjudication pipeline, ensuring `plot.beats`, witness facts, and memory lifecycle are updated deterministically on every live turn.
5. **Dual Track**: Implementation Track (Phases 1A through 1F + final system audit) runs alongside an independent E2E Testing Track (Tiers 1–4) which publishes `TEST_READY.md`.

## Code Layout
- `server/api/gameRoutes.ts`: HTTP API route definitions (`/action`, `/orchestrator/turn`, etc.)
- `server/domain/aiOrchestrator.ts`: Core AI narrative orchestration, turn budgeting, temporal guards, repair passes
- `server/domain/narrativeMemoryLifecycle.ts`: Memory lifecycle, plot beats recording, entity card memory updates
- `server/domain/narrativeContinuityEngine.ts`: Turn recording, continuity tracking, state adjudication propagation
- `server/domain/semanticNarrativeReview.ts`: Hallucination detection, observation review, unsupported claim checking
- `server/domain/sceneInteractionAuthority.ts`: Physical interaction validation, target resolution, affordances
- `server/domain/narrativeRichnessEvaluation.ts`: 13-dimension narrative richness evaluation
- `server/services/worldDirectorPreparationService.ts`: Investigation premise materialization, opening anchors
- `server/services/characterCanonSteward.ts` (or equivalent): NPC independent knowledge, witness facts, relationship tracking
- `server/services/worldSimulator.ts` (or equivalent): Proposal adjudication, entity lifecycle management, simulation ticks
- `server/mockEngine/serverMockAuthority.ts`: Authority adapters, turn processing
- `tests/`: Test suites executed via `node:test` (`tsx --test tests/*.test.ts`)
- `.agents/teamwork/`: Agent coordination metadata, plans, reports (never code or tests)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | Dedicated Feature Branch & Baseline Cleanliness | Feature branch `feat/unified-audit-reconciliation-programme` isolated at `d3d0fff227f9837d4dd8fbde11c1309bc153ecb6`, clean working tree | M0 | Survey |
| F02 | Contract Verification & Release Gates | `npm.cmd run verify:contracts`, `npm.cmd run lint`, `npx.cmd tsc --noEmit`, `npm.cmd run build` clean exit 0 | M0 | Survey |
| F03 | Live Narration & Single-Turn Pipeline Unification | Parity between `POST /api/game/action` (`processCustomAction`) and `executeTurn()`, ensuring canonical state adjudication is computed and passed | M1 | Survey (Phase 1A) |
| F04 | Live Route Plot Beat Persistence | Feed `stateAdjudication.commitRecords` into `narrativeContinuityEngine.recordTurn()` so `plot.beats` is populated on live turns | M1 | Survey (Phase 1A) |
| F05 | Call Budgeting & Single Repair Pass | Strict single-budget enforcement (`narrative.generate: 1`, `narrative.review: 1`, max 1 repair pass) across all live turn paths | M1 | Survey (Phase 1A) |
| F06 | Epistemic Masking & Name-Before-Intro Protection | Mask stranger names before introduction in scene narration and entity references | M1 | Survey (Phase 1A) |
| F07 | Structured Observation & Temporal Grounding | Enhance observation keyword matching with structured scene grounding, removing fragile regex rejects while preventing uncommitted movement narration | M1 | Survey (Phase 1A) |
| F08 | Narration Regeneration Parity | Ensure regenerated narration maintains identical canonical state adjudication and does not re-mutate or diverge state | M1 | Survey (Phase 1A) |
| F09 | Freeform Premise Materialization | Automatically extract and instantiate investigation premise anchors (victim, crime scene, clues) from freeform starting situations | M2 | Survey (Phase 1B) |
| F10 | Crime Scene Location Anchors | Ensure initial crime scene is populated with inspectable location anchors and physical evidence | M2 | Survey (Phase 1B) |
| F11 | Mundane Environmental Affordance Engine | Allow plausible unauthored props (chairs, tables, doors) without `UNSUPPORTED_CLAIM` rejections | M2 | Survey (Phase 1B) |
| F12 | Corpse Non-Takeable Invariant | Enforce strict rule that corpses/heavy bodies cannot be added to inventory (`CANNOT_TAKE_CORPSE`) | M2 | Survey (Phase 1B) |
| F13 | WorldSimulationProposal Contract | Define strongly-typed `WorldSimulationProposal` with provenance, preconditions, idempotency key, and safe fallbacks | M3 | Survey (Phase 1C) |
| F14 | Deterministic Adjudication & Stale Proposal CAS | Adjudicate proposals deterministically against canon, rejecting stale world versions (`STALE_PROPOSAL_REJECTED`) or forbidden mutations | M3 | Survey (Phase 1C) |
| F15 | 4-Stage Entity Lifecycle Management | Transition entities across `EPHEMERAL -> PROPOSED -> ACTIVE_TEMPORARY -> PERSISTENT` with explicit TTL and promotion policies | M3 | Survey (Phase 1C) |
| F16 | Dynamic Vehicle & Street Interaction (Taxi Hail) | Support on-demand vehicle hailing and street encounters without requiring pre-authored static entities | M3 | Survey (Phase 1C) |
| F17 | Memory Lifecycle Integration | Unify fragmented memory representations (episodic, working, entity card) into a coherent lifecycle | M4 | Survey (Phase 1D) |
| F18 | CharacterCanonSteward & Independent NPC Knowledge | Restrict NPC knowledge to co-located or plausibly transmitted facts; prevent clue/secret leaks | M4 | Survey (Phase 1D) |
| F19 | Co-located Witness Facts & Relationship Deltas | Record witness observations and update bidirectional character relationships on relevant turn actions | M4 | Survey (Phase 1D) |
| F20 | Unified Living-World Simulation Tick | Unify background simulation clock and world ticks decoupled from synchronous player action locks | M5 | Survey (Phase 1E) |
| F21 | Background Processing Queue with Snapshot CAS | Asynchronous background world event queue using snapshot CAS and idempotency protection | M5 | Survey (Phase 1E) |
| F22 | Long-Session Stability & 125-Turn Marathon | Verify memory growth, leak resistance, and narrative continuity over 125 turns without state corruption | M6 | Survey (Phase 1F) |
| F23 | Multi-Tier Model Routing & Offline Safety | Safe model routing fallbacks, test environment mock guarantees, and provider error handling | M6 | Survey (Phase 1F) |
| F24 | Ren Takahashi Detective Regression Suite (9 Modes) | Dedicated executable regression test suite (`tests/ren-takahashi-regression.test.ts`) covering all 9 failure modes | M6 | Survey (Phase 1F) |
| F25 | Full 24-Domain Architectural Audit | Comprehensive audit and verification of all 24 domains (D01-D24) with documented evidence | M7 | Survey (Audit) |
| F26 | Final Success Auditor & 12 Deliverables | Independent verification across all deliverables and standard status classifications | M7 | Survey (Final) |
| F27 | Opaque-Box E2E Test Suite (Tiers 1-4) | Comprehensive independent requirement-driven test suite with >= 11*N tests and `TEST_READY.md` | M-TEST | Survey (Testing Track) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Branch & Baseline Verification | Feature branch isolation, clean tree, verification commands exit 0 | none | DONE |
| M1 | Phase 1A: Live Narration & Validation Stabilisation | Single turn pipeline, plot beat persistence, budgeting, epistemic masking, observation grounding | M0 | DONE |
| M2 | Phase 1B: Premise Materialisation & Environmental Affordances | Freeform premise materialisation, crime scene anchors, mundane affordance engine, corpse non-takeable rule | M1 | DONE |
| M3 | Phase 1C: Hybrid World Simulator & Entity Lifecycle | WorldSimulationProposal contract, deterministic adjudication, 4-stage lifecycle, taxi hail scenario | M2 | DONE |
| M4 | Phase 1D: Memory & NPC Intelligence | Memory lifecycle integration, CharacterCanonSteward, co-located witness facts, bidirectional relationships | M3 | DONE |
| M5 | Phase 1E: Living world & Background Processing | Unified simulation tick, lock decoupling, background queue with snapshot CAS, idempotency | M4 | DONE |
| M6 | Phase 1F: Long-Session Integration & Ren Takahashi Regression | 125-turn marathon, multi-tier routing, 9 Ren Takahashi failure mode regression test suite | M5 | DONE |
| M7 | Final System-Wide 24-Domain Audit & 12 Deliverables | 24-domain audit, status classification, final Success Auditor verification | M6 | DONE |
| M-TEST | E2E Testing Track | Independent opaque-box test suite (Tiers 1-4) published via TEST_READY.md | M0 | DONE |

## Interface Contracts
### AI Orchestrator ↔ State Adjudicator ↔ Narrative Continuity
- In `serverMockAuthority.processCustomAction`: Must invoke or compute `stateAdjudication` (with `commitRecords` and provenance) and pass it into `narrativeContinuityEngine.recordTurn({ storyId, turnId, stateAdjudication, ... })`.
- `narrativeMemoryLifecycle.processTurn`: Accepts `stateAdjudication`, derives `plot.beats` from `commitRecords`, ensuring deterministic beat persistence.

### Premise Materialization ↔ World Director
- `worldDirectorPreparationService.prepareOpeningInvestigation`: If `run.startingSituation` is a string (freeform premise), parse premise using semantic/keyword anchor extraction, generating default crime scene location anchors, victim entity card, and initial clue entities before Turn 1.

### Scene Interaction Authority ↔ Affordance Plausibility Engine
- If an examined or interacted object is not in `situation.sceneObjects`, check `AffordancePlausibilityEngine.isPlausibleAffordance(noun, locationType)`. If plausible and mundane (e.g. chair in office, lamp in room), materialize as `ACTIVE_TEMPORARY` entity or valid affordance instead of throwing `UNSUPPORTED_CLAIM`.
- Corpse rule: If target has tag or trait `corpse` or `deceased_body`, action `TAKE` or `PICK_UP` must fail deterministically with error code `CANNOT_TAKE_CORPSE`.

### World Simulator ↔ Canonical Store
- Input: `WorldSimulationProposal` { proposalId, idempotencyKey, worldVersion, baseStateHash, entityType, proposedStateTransition, requiredPreconditions, provenance }.
- Validator checks: current worldVersion === proposal.worldVersion, hash === baseStateHash, preconditions satisfied, no forbidden canon mutation.
- Commit: atomic transition commit with provenance; returns `AdjudicationResult` with `commitRecords`.
