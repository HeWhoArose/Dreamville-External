# Dreamville E2E Test Infrastructure Specification

## 1. Test Philosophy: Opaque-Box & Requirement-Driven

Dreamville is a living-world hybrid narrative engine that unifies deterministic gameplay simulation with LLM narrative generation. The E2E test suite adheres to strict **opaque-box, requirement-driven testing** principles:

1. **Requirement-Driven & Specification-First**: Every test is derived from authoritative requirements specified in `PROJECT.md` (Features F01–F27), `ORIGINAL_REQUEST.md`, and `docs/UNIFIED_AUDIT_RECONCILIATION.md`, rather than matching transient implementation details.
2. **Opaque-Box Verification**: The system is treated as a black or grey box. Tests stimulate the system through its public API contracts (`POST /api/game/action`, `GET /api/game/state`, etc.) and canonical domain service boundaries (`ServerMockAuthority`, `CanonicalCommandEngine`, `WorldDirectorPreparationService`, `WorldSimulationProposal`, `NarrativeContinuityEngine`), asserting only observable behavior, state invariants, HTTP responses, and commit records.
3. **World Simulator Boundary Invariant**: The LLM may propose plausible outcomes (`WorldSimulationProposal`), but canonical state rules and deterministic state owners decide actual outcomes. The narrator only describes accepted, committed outcomes. AI proposals never directly mutate canonical game state.
4. **Deterministic & Isolated Execution**: All tests execute cleanly in offline environments using deterministic mock adapters and in-memory repository instances without requiring live third-party AI provider credentials.
5. **No Facades**: Every test exercises real logic, real validation gates, and real state transitions with deep invariant assertions.

---

## 2. Feature Inventory Mapping (F01 – F27)

| Feature ID | Feature Name | Test Tier | Primary Test File | Coverage Focus |
|---|---|---|---|---|
| **F01** | Dedicated Feature Branch & Baseline Cleanliness | Tier 1 | `tests/e2e-tier1-features.test.ts` | Branch isolation, git status cleanliness, tree safety |
| **F02** | Contract Verification & Release Gates | Tier 1 | `tests/e2e-tier1-features.test.ts` | `npm run verify:contracts`, `npm run lint`, `tsc --noEmit` exit code 0 |
| **F03** | Live Narration & Single-Turn Pipeline Unification | Tier 1 & 3 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier3-combinations.test.ts` | Production route `/api/game/action` parity with `executeTurn()`, state adjudication pipeline |
| **F04** | Live Route Plot Beat Persistence | Tier 1 & 3 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier3-combinations.test.ts` | Adjudication commitRecords feed `narrativeContinuityEngine.recordTurn()`, populating `plot.beats` |
| **F05** | Call Budgeting & Single Repair Pass | Tier 1 | `tests/e2e-tier1-features.test.ts` | At most 1 generate + 1 repair call on live turn; never a 3rd LLM call |
| **F06** | Epistemic Masking & Name-Before-Intro Protection | Tier 1 | `tests/e2e-tier1-features.test.ts` | Stranger names masked before introduction in scene narration & entity cards |
| **F07** | Structured Observation & Temporal Grounding | Tier 1 | `tests/e2e-tier1-features.test.ts` | Structured sensory grounding, temporal guard calibration (no idiom false-positives), no uncommitted movement |
| **F08** | Narration Regeneration Parity | Tier 1 | `tests/e2e-tier1-features.test.ts` | Regeneration keeps identical state adjudication; does not re-mutate or diverge canon |
| **F09** | Freeform Premise Materialization | Tier 1 & 4 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier4-scenarios.test.ts` | Automatic extraction of investigation anchors (victim, scene, clues) from starting situations |
| **F10** | Crime Scene Location Anchors | Tier 1 & 4 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier4-scenarios.test.ts` | Initial crime scene populated with inspectable location anchors and physical evidence |
| **F11** | Mundane Environmental Affordance Engine | Tier 1 & 2 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier2-boundaries.test.ts` | Plausible unauthored props (chairs, doors, lamps) allowed without `UNSUPPORTED_CLAIM` |
| **F12** | Corpse Non-Takeable Invariant | Tier 1 & 2 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier2-boundaries.test.ts` | Corpses/heavy bodies rejected on TAKE/PICK_UP with error `CANNOT_TAKE_CORPSE` |
| **F13** | WorldSimulationProposal Contract | Tier 1 | `tests/e2e-tier1-features.test.ts` | Strongly-typed proposal schema: provenance, preconditions, idempotency, safe fallback |
| **F14** | Deterministic Adjudication & Stale Proposal CAS | Tier 1 & 2 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier2-boundaries.test.ts` | Rejection of stale world versions (`STALE_PROPOSAL_REJECTED`) and forbidden mutations |
| **F15** | 4-Stage Entity Lifecycle Management | Tier 1 & 3 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier3-combinations.test.ts` | Transitions: `EPHEMERAL -> PROPOSED -> ACTIVE_TEMPORARY -> PERSISTENT` with TTL & promotion |
| **F16** | Dynamic Vehicle & Street Interaction (Taxi Hail) | Tier 1, 3, 4 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier4-scenarios.test.ts` | On-demand taxi hailing without pre-authored vehicles; boarding required before travel |
| **F17** | Memory Lifecycle Integration | Tier 1 & 3 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier3-combinations.test.ts` | Coherent lifecycle across episodic, working, semantic, and plot memory |
| **F18** | CharacterCanonSteward & Independent NPC Knowledge | Tier 1 & 4 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier4-scenarios.test.ts` | Restricts NPC knowledge to co-located or transmitted facts; prevents clue leaks |
| **F19** | Co-located Witness Facts & Relationship Deltas | Tier 1 & 3 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier3-combinations.test.ts` | Witness observations and bidirectional relationship score updates on actions |
| **F20** | Unified Living-World Simulation Tick | Tier 1 & 3 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier3-combinations.test.ts` | Clock advances trigger unified world ticks decoupled from synchronous action lock |
| **F21** | Background Processing Queue with Snapshot CAS | Tier 1 & 2 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier2-boundaries.test.ts` | Async background job queue with snapshot CAS, idempotency, and rebase/rejection |
| **F22** | Long-Session Stability & Marathon Continuity | Tier 1 & 4 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier4-scenarios.test.ts` | Memory leak resistance, monotonic clock, and state integrity across multi-turn sessions |
| **F23** | Multi-Tier Model Routing & Offline Safety | Tier 1 | `tests/e2e-tier1-features.test.ts` | Model tier fallbacks, deterministic mock guarantees, and provider timeout safety |
| **F24** | Ren Takahashi Detective Regression Suite (9 Modes) | Tier 1 & 4 | `tests/e2e-tier1-features.test.ts`, `tests/e2e-tier4-scenarios.test.ts` | All 9 failure modes verified: possessions, city knowledge, anchors, movement, taxi, observation, scope, deadlines, public scenes |
| **F25** | Full 24-Domain Architectural Audit | Tier 1 | `tests/e2e-tier1-features.test.ts` | Verification of all 24 architectural and subsystem domains |
| **F26** | Final Success Auditor & 12 Deliverables | Tier 1 | `tests/e2e-tier1-features.test.ts` | Classification of deliverables under standard status categories |
| **F27** | Opaque-Box E2E Test Suite (Tiers 1–4) | Tiers 1–4 | `tests/e2e-tier*.test.ts` | Full suite execution, >= 11*N tests, published `TEST_READY.md` |

---

## 3. Test Architecture

The testing framework leverages Node.js native testing infrastructure:
- **Test Runner**: Node native `node:test` executed via `tsx --test`
- **Assertion Library**: Node native `node:assert/strict`
- **Transport Layer**: Real in-process HTTP servers powered by Express (`app.use('/api/game', gameRouter); app.listen(0)`) and standard `fetch` API.
- **State Layer**: `InMemoryWorldRepository`, `ServerMockAuthority`, `CanonicalCommandEngine`.
- **Mocking**: `DeterministicMockAdapter`, `MultiModelOrchestrator` deterministic test stubs. No network requests are made to live external LLM providers.

### Execution Command
```bash
npx.cmd tsx --test tests/e2e-tier1-features.test.ts tests/e2e-tier2-boundaries.test.ts tests/e2e-tier3-combinations.test.ts tests/e2e-tier4-scenarios.test.ts
```

---

## 4. 4-Tier Test Strategy

### Tier 1: Feature Coverage (F01–F26)
- Comprehensive verification of each feature in isolation with representative inputs.
- Validates that contracts, preconditions, and postconditions meet specification.
- Ensures all architectural invariants (e.g. World Simulator boundary, state adjudication, call budgets) hold true.

### Tier 2: Boundary & Corner Cases
- Robustness against adversarial, malformed, and extreme inputs:
  - Empty, whitespace, and massive character payloads (>10KB).
  - Special characters, unicode, emoji, control sequences, SQL/JSON escaping.
  - Invalid story IDs, unknown action types, missing properties.
  - Concurrent action contention, lock serialization, and race prevention.
  - Stale version proposal CAS rejections (`STALE_PROPOSAL_REJECTED`).
  - Attempting to take non-takeable items (corpses, heavy furniture, background fixtures).
  - Replaying identical idempotency keys vs mismatched payloads.

### Tier 3: Cross-Feature Combinations & State Transitions
- Interactions between multiple subsystems across turn sequences:
  - Premise materialization -> crime scene anchors -> observation -> memory recording.
  - Dynamic taxi hail -> vehicle lifecycle promotion -> journey travel -> inventory fare deduction.
  - NPC co-location -> witnessed fact creation -> relationship delta update -> private knowledge isolation.
  - Action execution -> narration generation -> provider failure -> deterministic fallback -> safe rollback.
  - Background simulation clock advance -> living-world queue processing -> snapshot CAS consistency.

### Tier 4: Real-World Application Scenarios
- End-to-end, multi-turn narrative scenarios that simulate complete player experiences:
  - **The Ren Takahashi Detective Campaign**: A comprehensive 8-turn investigation exercising the Crimson Eye Agency premise, taxi transport, crime scene examination, autopsy observation, witness interrogation, and clue synthesis, strictly verifying all 9 regression failure modes.
  - **Living World Emergent Social Scenario**: Dynamic urban plaza interaction with ambient citizens, shopkeepers, emergent events, and schedule updates.
  - **Marathon Continuity Session**: Extended multi-turn session asserting zero state corruption, memory stability, and monotonic timeline advancement.
