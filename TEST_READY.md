# TEST_READY: Dreamville Opaque-Box E2E Test Suite (Tiers 1–4)

## Executive Summary
The independent, requirement-driven, opaque-box End-to-End (E2E) Test Suite for Dreamville is fully constructed, verified, and passing 100% in an offline, zero-network, deterministic execution environment.

- **Total Test Suites**: 55 suites
- **Total Tests**: 118 tests
- **Pass Rate**: 100% (118 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo)
- **Suite Execution Time**: ~52 seconds
- **Test Runner**: Node.js native test runner (`node:test` via `tsx --test`)
- **Transport**: In-process Express HTTP server (`gameRouter`) + native `fetch`
- **Determinism**: 100% offline via `installDeterministicAiMocks()`; zero live external LLM credentials required.

---

## Runner Commands

### Run Full 4-Tier E2E Test Suite
```bash
npx.cmd tsx --test tests/e2e-tier1-features.test.ts tests/e2e-tier2-boundaries.test.ts tests/e2e-tier3-combinations.test.ts tests/e2e-tier4-scenarios.test.ts
```

### Run Individual Tiers
```bash
# Tier 1: Feature Coverage (F01–F26)
npx.cmd tsx --test tests/e2e-tier1-features.test.ts

# Tier 2: Boundary & Corner Cases
npx.cmd tsx --test tests/e2e-tier2-boundaries.test.ts

# Tier 3: Cross-Feature Combinations & State Transitions
npx.cmd tsx --test tests/e2e-tier3-combinations.test.ts

# Tier 4: Real-World Application Scenarios (Ren Takahashi Detective Campaign & Living World)
npx.cmd tsx --test tests/e2e-tier4-scenarios.test.ts
```

### Full Repository Verification Gates
```bash
# Contract Verification
npm.cmd run verify:contracts

# TypeScript Compilation / Lint
npm.cmd run lint
```

---

## Test Inventory & Tier Breakdown

| Tier | Test File | Description | Suites | Tests | Status | Duration |
|---|---|---|---|---|---|---|
| **Tier 1** | `tests/e2e-tier1-features.test.ts` | Complete feature coverage for F01 through F26 | 27 | 67 | PASS | ~21.3s |
| **Tier 2** | `tests/e2e-tier2-boundaries.test.ts` | Limits, empty inputs, extreme strings, Unicode/emoji, injection, CAS rejections, corpses | 13 | 31 | PASS | ~7.8s |
| **Tier 3** | `tests/e2e-tier3-combinations.test.ts` | Cross-subsystem transitions, taxi hail & transit, witness knowledge, proposal cascades | 11 | 10 | PASS | ~5.1s |
| **Tier 4** | `tests/e2e-tier4-scenarios.test.ts` | Multi-turn Ren Takahashi detective scenario (8 turns, all 9 modes), plaza, 20-turn marathon | 4 | 10 | PASS | ~17.5s |
| **TOTAL** | **All 4 Tiers Combined** | **Comprehensive Opaque-Box E2E Suite** | **55** | **118** | **PASS** | **~51.7s** |

---

## Feature Coverage Checklist (F01–F27)

| Feature ID | Feature Name | Tier | Verification Status |
|---|---|---|---|
| **F01** | Dedicated Feature Branch & Baseline Cleanliness | Tier 1 | VERIFIED (`F01-1` to `F01-4`) |
| **F02** | Contract Verification & Release Gates | Tier 1 | VERIFIED (`F02-1` to `F02-3`) |
| **F03** | Live Narration & Single-Turn Pipeline Unification | Tier 1 & 3 | VERIFIED (`F03-1` to `F03-3`, `T3-04`) |
| **F04** | Live Route Plot Beat Persistence | Tier 1 & 3 | VERIFIED (`F04-1`, `F04-2`, `T3-01`) |
| **F05** | Call Budgeting & Single Repair Pass | Tier 1 & 2 | VERIFIED (`F05-1` to `F05-3`, `T2-22`, `T2-23`) |
| **F06** | Epistemic Masking & Name-Before-Intro Protection | Tier 1 & 3 | VERIFIED (`F06-1` to `F06-3`, `T3-03`) |
| **F07** | Structured Observation & Temporal Grounding | Tier 1 & 4 | VERIFIED (`F07-1`, `F07-2`, `Turn 7`) |
| **F08** | Narration Regeneration Parity | Tier 1 | VERIFIED (`F08-1`) |
| **F09** | Freeform Premise Materialization | Tier 1 & 4 | VERIFIED (`F09-1`, `F09-2`, `Turn 1`) |
| **F10** | Crime Scene Location Anchors | Tier 1 & 4 | VERIFIED (`F10-1`, `F10-2`, `Turn 4`) |
| **F11** | Mundane Environmental Affordance Engine | Tier 1, 2, 3 | VERIFIED (`F11-1` to `F11-3`, `T2-18`, `T3-07`) |
| **F12** | Corpse Non-Takeable Invariant (`CANNOT_TAKE_CORPSE`) | Tier 1, 2, 4 | VERIFIED (`F12-1`, `F12-2`, `Turn 5`) |
| **F13** | WorldSimulationProposal Contract | Tier 1 & 2 | VERIFIED (`F13-1`, `T2-14` to `T2-16`, `T2-29`) |
| **F14** | Deterministic Adjudication & Stale Proposal CAS | Tier 1 & 2 | VERIFIED (`F14-1` to `F14-3`, `T2-14`, `T2-15`) |
| **F15** | 4-Stage Entity Lifecycle Management | Tier 1, 2, 3 | VERIFIED (`F15-1` to `F15-3`, `T2-20`, `T3-02`) |
| **F16** | Dynamic Vehicle & Street Interaction (Taxi Hail) | Tier 1, 3, 4 | VERIFIED (`F16-1`, `F16-2`, `T3-02`, `Turn 3`) |
| **F17** | Memory Lifecycle Integration | Tier 1 & 3 | VERIFIED (`F17-1`, `T3-01`) |
| **F18** | CharacterCanonSteward & Independent NPC Knowledge | Tier 1 & 3 | VERIFIED (`F18-1`, `T3-03`) |
| **F19** | Co-located Witness Facts & Relationship Deltas | Tier 1 & 3 | VERIFIED (`F19-1`, `T3-03`, `T3-08`) |
| **F20** | Unified Living-World Simulation Tick | Tier 1 & 3 | VERIFIED (`F20-1`, `F20-2`, `T3-05`) |
| **F21** | Background Processing Queue with Snapshot CAS | Tier 1 & 3 | VERIFIED (`F21-1`, `T3-10`) |
| **F22** | Long-Session Stability & Marathon Continuity | Tier 1 & 4 | VERIFIED (`F22-1`, `Scenario 3`) |
| **F23** | Multi-Tier Model Routing & Offline Safety | Tier 1 | VERIFIED (`F23-1`) |
| **F24** | Ren Takahashi Detective Regression Suite (9 Modes) | Tier 1 & 4 | VERIFIED (`F24-1` to `F24-9`, `Scenario 1` Turns 1–8) |
| **F25** | Full 24-Domain Architectural Audit | Tier 1 | VERIFIED (`F25-1`) |
| **F26** | Final Success Auditor & 12 Deliverables | Tier 1 | VERIFIED (`F26-1`) |
| **F27** | Opaque-Box E2E Test Suite Published | Tiers 1–4 | PUBLISHED & VERIFIED (`TEST_READY.md`) |

---

## Ren Takahashi Detective Scenario (9 Modes) Verification Matrix

| Failure Mode | Description | Verification Method | Result |
|---|---|---|---|
| **Mode 1** | No unsupported possessions (no invented wristwatch/items) | Query time on Turn 1; verify player inventory contains no invented watch | PASS |
| **Mode 2** | No unsupported city knowledge (no telepathic distance/route estimates) | Distance query on Turn 2; verify response remains grounded in known map | PASS |
| **Mode 3** | Crime scene location anchors present and inspectable | Turn 4 inspection of chalk outline and perimeter tape; verify anchors exist | PASS |
| **Mode 4** | Movement not narrated without committed movement | Freeform "rush to crime scene" on Turn 2; verify player remains at office | PASS |
| **Mode 5** | Taxi interaction works without pre-authored vehicles | Turn 3 taxi hail on street; verify temporary vehicle proposal & boarding gate | PASS |
| **Mode 6** | Observation requests return grounded answers or honest limitation | Turn 7 sensory observation; verify grounded sensory response | PASS |
| **Mode 7** | NPC knowledge restricted to valid epistemic scope | Turn 6 witness interview; verify witness does not leak ungrounded culprit confession | PASS |
| **Mode 8** | No invented evidence or forensic deadlines | Turn 5 body examination; verify no invented forensic timers or fake clues | PASS |
| **Mode 9** | Public environments populated and functional | Street & plaza affordances verified active and responsive | PASS |

---

## Architectural Compliance & Invariants
1. **Opaque-Box Boundary**: Every test stimulates the engine via HTTP route handlers or public domain services, asserting on observable state, HTTP responses, and commit records.
2. **World Simulator Separation**: AI proposals never mutate state directly; all state changes pass through deterministic validation gates and return commit records with provenance.
3. **Corpse Invariant**: Corpse or deceased body entities cannot be added to inventory (`CANNOT_TAKE_CORPSE`).
4. **Offline Isolation**: All tests run locally using deterministic mocks, ensuring CI reliability and zero flake from third-party network outages.
