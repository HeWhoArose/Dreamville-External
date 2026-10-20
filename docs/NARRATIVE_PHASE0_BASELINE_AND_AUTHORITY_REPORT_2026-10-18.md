# Dreamville — Phase 0 Baseline, Authority Lock and Instrumentation Report

**Plan:** [`NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md`](NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md), Phase 0  
**Date:** 2026-10-18  
**Base:** `main` at merge commit `ce3d3cb8` plus the six-patch documentation and hygiene series (standalone README, UI rebrand, in-world dialogue line, tracking cleanup, research audit, V2 plan)  
**Result:** **PASS — AUTOMATED**, with one **BLOCKED** item: the live-provider cost and latency baseline needs credentials. Phase 1 is **NOT RUN**.

**Method.** Source audit plus executable probes that drive real turns through `POST /api/game/action` with mock providers. No provider credentials were available, so nothing here is a live-model result. Every code change is a separate commit with its own regression test and a rollback line (§4).

---

## 1. Task results

| Task | Result | Evidence |
|---|---|---|
| Carried 1 — authority boundary | **Done** | The repository is a standalone project; README, specification and docs index agree |
| Carried 2 — record SHA, test, build, lint | **PASS — AUTOMATED** | Full suite **1,536 / 1,536** (118 suites) on the Phase 0 branch; contracts, lint and build pass (§2.7) |
| Carried 3 — trace one freeform turn | **Verified for the live path** | §2.2 |
| Carried 4, 6, 7 — information-seeking trace, scene/NPC source trace, field maps | **Carried, not re-verified** | The 2026-10-15 runtime trace stands; only the validation path was re-checked. Full re-verification is part of the Phase 2 design |
| Carried 5 — every displayed candidate reaches final review | **Verified at source** | §2.2 |
| Carried 8 — baseline test report | **Done** | §2.7 |
| P0.9 — CI and branch check | **Partly verified** | §2.1 |
| P0-H — repository hygiene | **Done** | §2.7 |
| P0.10 — objective and thread trace | **Done** | §2.4 |
| P0.11 — `StoryDirectorService` trace, decision D1 | **Done — D1 decided** | §2.5 |
| X5a — recorder coverage | **Done for freeform turns; one gap left** | §2.3 |
| P0.12 — cost baseline | **Static envelope done; live baseline BLOCKED** | §2.6 |

---

## 2. Findings

### 2.1 CI and branches (P0.9)

- Earlier in this review the GitHub API returned **three workflow runs, all successful**, for the `main` merge commit `ce3d3cb8`. The API rate limit has since been exhausted, so run names and links were not captured. Confirm in the Actions tab before treating that as recorded evidence.
- Pull requests #68–#75 are **not ancestors of `main`**. A patch-id comparison finds no commit from them present in equivalent form on `main`. That is expected: `docs/DREAMVILLE_OPEN_PR_INTEGRATION_TRIAGE_2026-10-16.md` records that their content was consolidated into #76 by re-application, which changes patch IDs. Spot checks confirm the consolidated tests and behaviour exist on `main`. **No PR was closed or ported.** Closing them is the owner's call.

### 2.2 Live turn path and candidate validation

The freeform turn path is `POST /api/game/action` → `CanonicalCommandEngine` → `ServerMockAuthority` → `MultiModelOrchestrator.generateNarrativeOnly`. At `ce3d3cb8` the fail-open behaviour recorded in the 2026-10-15 trace is gone:

- The orchestrator validates the final candidate before returning it (`validateNarrativeCandidate`).
- The authority's own rewrite path is fail-closed (`NARRATION_FINAL_REVIEW_REJECTED`, `NARRATION_AI_UNAVAILABLE`), and the text "retaining original provider result" no longer exists in the source.
- Probe confirmation: a candidate with no distinctive anchor for the canonical location was rejected by the continuity guard; near-duplicate prose was rejected by the freshness guard; a candidate that omitted an observable result for a listening action was rejected by semantic review; one that introduced an unsupported detail ("floor") was rejected. In every rejection the deterministic emergency text was withheld and the player received a retryable error.

This verifies carried task 5 at source and by behaviour for the paths exercised. The persisted narration route lists the Gemini 3.5 variants first, with Gemini 3.8 ahead of Gemini 2.5 as documented, two free-tagged routes, and the deterministic floor last.

### 2.3 Recorder coverage (X5a)

A probe ran real turns and exported the recording. It found two defects and one remaining gap.

**Defect 1 — freeform turns were recorded without forensics.** `DIRECT_TURN` interactions from `POST /api/game/action` held the request, result and state patches but no `turn` payload: no intent, situation, plan, research, prompt, turn package or attempts. The recorder only attached a payload when the response carried telemetry. *Fixed* (§4): a recorder-only side channel fills the payload for success and failure turns. The client response is unchanged, verified by a key-for-key shape assertion and a check that no forensic strings appear in it.

**Defect 2 — export failed integrity validation after a failed-narration turn.** A successful turn followed by a failed one returned HTTP 500 (“State patch integrity failure”). The cause: the integrity hash used `JSON.stringify`, which depends on object key order, and the positional array diff rebuilt an action-log entry with identical data in a different key order. *Fixed* by a key-order-independent hash in schema 1.2.0; schemas 1.0.0 and 1.1.0 keep the legacy hash and still validate and extend as before. The regression test fails on the previous code. Cost: about 1.2 ms more per append on a 75 KB snapshot (7.2 ms against 6.0 ms).

**Remaining gap — rejected candidate text is not recorded.** Attempts record provider, model, status, latency and the rejection reason, but not the rejected text. Replay (slice X5b) needs it, and any recorder-only channel must keep it out of the client-facing `narrativeError`, because a rejected candidate can contain material that must not reach the player. Tracked as **G13**.

Not verified: that combat actions and regeneration/retry paths record the same payload. The opening scene records as `OPENING_SCENE`.

### 2.4 Objective and thread trace (P0.10)

A trace seeded the demo world, ran a successful turn, injected an emergent-thread event, ran a second turn and read what the narrator received.

| Representation | Producer | Reaches the narrator? | Visible to the player? |
|---|---|---|---|
| Quest events | authored `plannedEvents` with quest flags or objectives | No quest data appeared in the situation (it has no quest or objective keys) | Only through the quest list, which was **empty** in the seeded world |
| Authored story thread (“Starlight fissure rumors”, HIGH priority) | world seed | Yes: open threads, research THREAD blocks, and the story beat’s continuity anchor | **No** — it is not a quest, so the quest list never shows it |
| Emergent story thread | `EmergentNarrativeEngine` | Yes, same routes | No |
| `NarrativeOpenThreadRecord` | memory lifecycle | Not exercised by this trace | Not traced; do it in the Phase 2 design |
| `SituationObjective` | Phase 8 simulation engine only | Not in the live turn | No |
| Per-turn plan objective | narrative director | Yes, as a plan field, e.g. `observe_current_scene: observe` | No |

Findings:

1. **G1 confirmed in practice.** The seeded world has a high-priority authored thread, yet the quest list is empty and no objective appears anywhere the player can see.
2. **G8 confirmed, and worse than assumed.** An emergent thread has the title `Emergent Thread: ACOUSTIC ANOMALY OBSERVED at loc_whispering_orrery` and the description “Investigative thread generated by server resolution of event ‘ACOUSTIC_ANOMALY_OBSERVED’”. That raw event type and an **internal location ID** reached the narrator prompt verbatim as the story beat’s continuity anchor (“STORY BEAT: OBSERVATION Continuity anchor: Starlight fissure rumors | Emergent Thread: …”). Whether it degrades prose is a Phase 1 question; that an internal ID reaches the model is established.
3. **G3 confirmed.** The plan objective is per-turn; nothing carries a goal forward.
4. Also observed: the client response already includes the player’s interpreted intent inside the action resolution. That predates this work and is the player’s own input.

### 2.5 `StoryDirectorService` trace and decision D1 (P0.11)

- **Callers:** the three endpoints `POST /worlds/runs/:storyId/story-director/{step,choice,offscreen}`, and three test files (`ch16_behavioral_verification`, `phase3.canonical-command`, `phase3.command-routing-audit`). `livingBible.ts` mentions it in documentation text only. **No client or turn-pipeline caller exists.**
- **Authority:** the endpoints execute through the canonical command engine (`cmd_route` command IDs with event counts), and `recordChoice` writes facts inside that handler, so it does not bypass command authority.
- **Content coupling:** triggers are `trig_coded_cipher`, `trig_refusal_consequence` and `trig_ruins_echoes`. The ruins trigger requires `loc_ancient_ruins` and the offscreen simulation hard-codes `loc_lantern_vault`. **No seeded world data defines `loc_ancient_ruins` or the cipher**, so these triggers cannot fire in any seeded world.
- **Decision D1 — option 1, fold and archive (decided 2026-10-18).** Nothing needs porting: the trigger content is unreachable demo data. In Phase 5 the three trigger ideas are re-expressed as milestone fixtures if useful; in Phase 9 (X6c) the registry, its three endpoints and its tests are archived. Archiving must update `phase3.command-routing-audit` (it enumerates routes) and `ch16_behavioral_verification`. Phase 5 may proceed on this basis.

### 2.6 Cost baseline (P0.12)

**Static envelope (configuration, not observation):**

- Default limit: **one logical call per task per turn** (`aiTurnCallBudget`): intent, research query, narrative generate, narrative review, dialogue, memory extract and so on.
- Call-policy modes allow 0 helper calls (narration only and deterministic mechanics), up to 2 (interpretation, 800 output tokens each) and up to 4 (novel capability, 3,000 tokens).
- Fallback chains hold 6–9 models per task with 1–3 free-tagged routes and the deterministic floor last, so one logical call can use up to nine provider attempts. A freeform narration turn therefore costs at least one logical call and, on the gated path, up to one more for the quality rewrite.

**Observed offline** (mock providers): a clean turn made one narration call; a failing primary plus a failing fallback made one call each, and the turn returned the retryable error.

**BLOCKED:** per-turn calls, latency and tokens against a real provider, and the free-tier envelope derived from them. Needs the owner’s provider key and the Phase 1 live sessions.

### 2.7 Hygiene and baseline test run (P0-H)

Verified in a fresh clone earlier, and re-verified here on the Phase 0 branch:

- The tracking cleanup (ignore rules, generated assets untracked) is part of the series.
- Routine test runs used to rewrite `artifacts/chaos-progress.log`, `artifacts/marathon-progress.log` and `data/workstation_ledger.json`. Now the living-bible ledger goes to a per-process temp file under a test run, and the two progress logs go to a temp directory unless `DREAMVILLE_ARTIFACT_DIR=artifacts` is set. The tracked evidence files remain and are still cited by `SYSTEM_WIDE_AUDIT_FINAL_REPORT.md`.
- **Full suite: 1,536 / 1,536 passed (118 suites, 0 failures), and the working tree was clean afterwards.** The only untracked file is a locally generated `package-lock.json`, which was left alone. The repository tracks `bun.lock` while CI runs `npm install`; choosing one lockfile is an open owner decision.
- The 125-turn marathon passes alone in about 97 seconds.

---

## 3. New and updated gaps

| ID | Change |
|---|---|
| **G1** | Confirmed in practice (§2.4) |
| **G6** | Capture defects found and fixed; replay and a judged layer still absent |
| **G8** | Confirmed: the raw emergent-thread title and an internal location ID reach the narrator prompt |
| **G12** | **Closed** |
| **G13** (new) | Rejected candidate text is not recorded; needed for replay; must stay out of client responses |

---

## 4. Changes made and rollback

Each change is one commit on `phase0/baseline-audit-and-instrumentation`. Revert any one without the others.

| Commit | Change | Test | Rollback |
|---|---|---|---|
| `fix(recorder): key-order independent integrity hash (schema 1.2.0)` | Export no longer fails after a failed-narration turn | Three new recorder tests; the main one fails on the old code | `git revert` that commit |
| `feat(recorder): capture forensic payload for freeform narration turns` | Freeform turns record intent, situation, plan, research, prompt, package, attempts | New integration test, fails without the change; response shape unchanged | `git revert` that commit |
| `perf(recorder): cheaper canonical hashing and fewer redundant hashes` | About 1.2 ms per append | Existing tamper, order and legacy tests | `git revert` that commit |
| `test: stop routine test runs from rewriting tracked files (P0-H)` | Ledger and progress logs go to temp | Full suite plus a clean-tree check | `git revert` that commit |

**Fallback behaviour.** Staging and recording are observability only and are wrapped so a failure never affects gameplay. Legacy 1.0.0 and 1.1.0 recordings keep validating and extending with their original hash.

---

## 5. Limits of this phase

- Nothing here is a live-model result; Phase 1 remains **NOT RUN**.
- Carried tasks 4, 6 and 7 rely on the 2026-10-15 trace.
- CI evidence for `main` was observed once and not captured with run links.
- Combat and regeneration recording paths were not exercised.
- The probes were throwaway tests and are not committed; their findings are recorded above.
- **One test-harness flake was observed and not fully explained.** On a single-core sandbox, the 125-turn marathon failed in two consecutive runs in a freshly patched clone with `TypeError: fetch failed` raised by the test's own loopback HTTP call (not by narration logic; the "AI narration unavailable" lines in that log also appear in the untouched control as normal degradation-injection output). Those runs overlapped with processes left over from test runs I had timed out. The same code then passed the marathon three more times (alone, and twice concurrently), every other test file passed (1,536 of 1,536 tests across runs), and the untouched `main` clone passed it too. The failure was not reproduced on the control, which was not subjected to the same overload, so "load-induced harness flake" is the most likely cause but is unproven. CI has more cores than this sandbox.

## 6. Exit criteria

| Criterion | Status |
|---|---|
| Authority boundary documented | Met |
| Baseline recorded honestly | Met (automated); live cost baseline BLOCKED |
| Runtime call graph traced | Met for the live narration path; carried for the rest |
| CI result for `main` recorded | Partly met (observed once, not captured) |
| Hygiene complete | Met |
| Recorder coverage confirmed | Met for freeform turns; G13 open |
| Maps for objectives, threads and the director delivered | Met |
| Decision D1 recorded | Met — option 1 |
| No planned subsystem duplicates an existing authority | Met |
