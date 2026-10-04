# Dreamville Master System-Wide Audit — Final Report

**Date:** 2026-10-04 · **HEAD:** `91eeaf8` (N19 — Creative Model Tier & Cadence Routing)
**Verdict: PASS-WITH-ISSUES** (see §6)

**Run class: CONTROLLED DETERMINISTIC/MOCK.** No external AI credentials exist in the audit
environment, so every integration result below derives from deterministic mock adapters driven
through the real application pipeline (HTTP `POST /api/game/action`). Canonical correctness,
transaction boundaries, budgets, failure handling, persistence and idempotency are fully
exercised; real-model literary prose quality is **not** claimed.

---

## 1. Scope and method

| Stage | Method |
|---|---|
| AUDIT / VERIFY | Workspace state, HEAD-identical behavior probes, canonical-travel contract (`tests/liveRuntimeProof.test.ts` scenarios B–G) |
| FIX | Server root-cause fixes only (see §3); no test weakening to mask failures |
| 125-TURN MARATHON | `tests/marathon-125-turn.integration.test.ts` — one action per turn, 6 TAP segments, kill-surviving progress log |
| CHAOS | `tests/chaos-failure-injection.test.ts` — all five `DeterministicMockAdapter` failure modes + total outage, injected through the live HTTP pipeline |
| REGRESSION | All 189 test files in 8 batches (`tsx --test`, exit status captured) |
| Typecheck | `npx tsc --noEmit` after every change — clean throughout |

`npm test` as a single process exceeds the audit environment's 180 s execution window
(1-CPU), hence the batched equivalent. Every batch's exit code was captured and its TAP
summary inspected; nothing was skipped or filtered.

## 2. Marathon — 125 turns, one persistent world

**PASS** — 6/6 segments, exit 0 (`artifacts/marathon-125-run7.log`).

| Metric | Value | Bound |
|---|---|---|
| Turns executed | 125 (exactly one action each) | == 125 |
| Total runtime | 58.7 s | < 180 s window |
| Max AI calls in a single turn | 2 | ≤ 12 |
| Avg / p95 turn latency | 429 ms / 813 ms | p95 < 3000 ms |
| Unique narratives | 67 | ≥ min(40, ½n) |
| narrativeContextHistory | bounded | ≤ 40 |
| novelty items / plot beats | bounded | ≤ 120 / ≤ 40 |
| Persistence checkpoints | turn 110, 118, 125, final — archive/restore parity verified | required |
| F8 boundary secret sweep | server-held secret absent from all 125 narratives + denial metadata | required |
| F9 idempotency probe (turn 120) | duplicate command mutated state exactly once | required |
| Leak probe (turn 51) | 409-or-200 deny-or-narrate; no unlawful state change | required |
| Canonical travel (turns 71–77) | journey semantics held: origin while `isTraveling`, arrival after ADVANCE_TIME, both directions | Invariant 6 |

**Accounting correction (root cause of every prior marathon failure):** the original harness
executed 4–5 pipeline actions per numbered turn (~470 actions mislabeled as turns) and needed
280–350 s — physically impossible in the execution window. The marathon had never completed
before this audit. The rewritten harness executes exactly one action per turn (58.7 s total).
Failure evidence from earlier runs is preserved (`marathon-125-run4/5/6.log`).

## 3. Server fixes verified this audit (all in final tree)

1. **F4 — checkpoint journal pruning** (`canonicalCommandEngine.ts`): `buildReplayCheckpoint`
   prunes top-level and `runtimeState` journals (`REPLAY_JOURNAL_KEYS`) — bounded replay
   checkpoints across 125 turns.
2. **F4 — persistence batching**: `runWithPersistenceBatching<T>` on `InMemoryWorldRepository`
   (async-safe flush via promise re-wrap) wraps the `/action` route; enabled unless
   `isRunningUnderTests()`.
3. **F4 — canonical event accessors**: O(1) `getCanonicalCommandEventCount`;
   `getRecentCanonicalCommandEvents` deep-clones the tail slice and strips `replay` keys;
   full `getCanonicalCommandEvents` retained for cold paths (history editing,
   developer diagnostics).
4. **FIX-1 — NPC authority guard** (`gameRoutes.ts` transfer/equip paths): proximity and
   lifecycle authority validated server-side.
5. **NEW — partial persisted-state hardening** (`narrativeContinuityEngine.ts`):
   `synthesizeFreeformActionFallback` crashed with 400 `Cannot read properties of undefined
   (reading 'at')` when persisted `runtimeState.plot`/`continuityPlan` had partial shapes
   (`continuity.plot.beats.at(-1)` etc.). Added `normalizePlot`/`normalizePlan` coercion at
   the `getState` contract boundary, merging defaults and enforcing field types — protects
   **all** continuity consumers, not just the synthesizer. Transaction boundary had held
   (`rolledBack:true`, no corruption); the fix removes the 400 entirely.

## 4. Chaos pass — failure injection through the real pipeline

**PASS** — 8/8 segments, exit 0 (`artifacts/chaos.log`, `chaos-progress.log`).

| Mode | Delivered to | Result |
|---|---|---|
| 429 burst | primary + fallback (1 call each) | failover hop; location/inventory unchanged |
| 500 errors | primary + fallback | failover hop; canonical state unchanged |
| malformed_json | primary + fallback | corrupt `<<corrupt>>` payload rejected; never player-visible |
| timeout | primary + fallback | **real hang verified** (14.2 s ≈ two sequential ~7 s per-attempt budgets); bounded recovery; turn succeeds |
| illegal_state_change | primary + fallback | hostile `DELETE_PLAYER` proposal rejected by `validateTurnPackage` allowedKinds; hostile text never narrated; player lifecycle/location/inventory intact |
| total outage | neither (0 registered calls) | deterministic emergency floor narrates (200, non-empty) |
| recovery | primary + fallback | registered adapters serving again; event ledger progressing |

Rig integrity (so no segment can pass vacuously): injections armed on **both** adapters —
provider failures trip lingering selection degradation, so single-adapter injection can be
silently skipped; every segment asserts delivery via adapter `callHistory`; the timeout
segment asserts a ≥5 s real hang. Cooldown-aware recovery between segments: transient
failures deliberately set exponential cooldowns (5 s→60 s cap) that outlive
`updateModelHealth('Healthy')`; the rig waits them out and requires a registered-adapter
warm-up turn before the next injection.

## 5. Full regression — 189 files, 8 batches

**PASS** — 1419 tests, 0 failures, 0 cancelled. Batches 1, 2 and 4 were re-run after the
config-hygiene fix (below) so every batch reflects the final tree. Logs:
`artifacts/regression-batch{1..8}.log`.

| Batch | Files | Tests | Fail |
|---|---|---|---|
| 1 | 27 | 238 | 0 |
| 2 | 27 | 230 | 0 |
| 3 | 27 | 126 | 0 |
| 4 | 27 | 132 | 0 |
| 5 | 27 | 238 | 0 |
| 6 | 27 | 263 | 0 |
| 7 | 25 | 133 | 0 |
| 8 (liveRuntimeProof + marathon) | 2 | 59 | 0 |

Investigated and resolved during batching:

- **Prod-config contamination (process finding, HIGH):** a diagnostic probe run *outside*
  the test runtime persisted its mock-model pin into `server/data/orchestrator_config.json`
  (the production config), breaking 3 assertions in `current-free-model-routing-policy.test.ts`.
  Config restored to HEAD; the probe script deleted. Key learning: any script constructing
  `MultiModelOrchestrator` outside `node:test` writes to the prod config — the marathon/chaos
  rigs are safe because `node:test` selects the test-config path.
- **Tracked-fixture deletion (test-hygiene bug, HIGH, pre-existing at HEAD):**
  `broadSubsystems.test.ts` and `modelRoutingIntegration.test.ts` unconditionally
  `unlinkSync`'d the tracked `orchestrator_config_test.json` in `beforeEach`/`afterEach`,
  deleting a repo file on every run (this is how the fixture was found missing at audit
  start). Replaced with snapshot/restore: the suites keep clean-slate isolation and the
  tracked fixture now survives full runs (`git status server/data/` clean).
- **Assertion modernization (not a weakening):** `phase4.authority-audit.test.ts` pinned the
  historical O(n) `getCanonicalCommandEvents(...).length + 1` source form; the F4 fix
  replaced it with the equivalent O(1) count accessor. The regex now accepts both
  ledger-derived forms; the actual guard (no process-global `++totalTurnsExecuted`) is
  unchanged.

## 6. Documented findings (not changed) — why PASS-WITH-ISSUES

**CLASSIFIER-FP (MEDIUM, product behavior; identical at HEAD `91eeaf8` — not a regression).**
`server/services/unifiedAiActionOrchestrator.ts:95-100` classifies item use with
`/\b(use|consume|drink|eat|apply|read|activate)\b/i`; the verb `read` matches inside the
benign word "Re-read". With no inventory-item name in the text this sets
`unknownUseTarget:true` → `NOVEL_CAPABILITY` strategy (`aiCallPolicy.ts:139-145`) → the
emergency synthesizer invents a capability (e.g. "Adaptive Talent") → `CHARACTER_INCOMPATIBLE`
→ **409 CAPABILITY_SIMULATION_BLOCKED on benign text**.

- **Decision:** documented, not changed. Weakening server assertions to make harness probes
  pass was rejected; probe texts were reworded instead, and the marathon leak-probe contract
  already accepts 409-or-200 (deny-or-narrate).
- **Recommended fix:** require an inventory-item name (or possessive context) before setting
  `unknownUseTarget`, or drop `read` from the capability-suggesting verb list when no readable
  item exists.

No other open issues. No test was skipped, filtered or weakened to reach this verdict.

## 7. Workspace integrity

- `data/workstation_ledger.json` — pre-existing user change, untouched throughout.
- `server/data/orchestrator_config.json` and `orchestrator_config_test.json` — restored to
  HEAD and verified unchanged after the full regression (zero mock-model references).
- Full evidence: `artifacts/audit-evidence.json`, `artifacts/marathon-125-run7.log`,
  `artifacts/chaos.log`, `artifacts/regression-batch{1..8}.log`,
  `artifacts/marathon-progress.log`, `artifacts/chaos-progress.log`.

## 8. Verdict

**PASS-WITH-ISSUES** — all deliverables complete: F4/FIX-1/partial-state fixes verified,
125-turn marathon completed (first time ever) with all bounds held, chaos pass green across
all failure modes with non-vacuous delivery assertions, 1419/1419 regression tests passing,
typecheck clean. The single documented issue (CLASSIFIER-FP) is a benign-text classifier
false positive present identically at HEAD, with a concrete recommended fix for a follow-up.
