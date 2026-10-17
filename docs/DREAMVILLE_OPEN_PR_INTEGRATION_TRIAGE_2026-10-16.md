# DreamVille Open-PR Integration Triage — 2026-10-16

**Purpose:** prevent duplicate/obsolete pull requests from being merged blindly while the narrative-grounding integration is being completed.

**Latest verified code-bearing integration commit (2026-10-17):** `adf3059a583f0aedb51aa61a81dbbbfde51533ae`  
**Current working candidate:** PR #76 on `integration/narrative-grounding-runtime-2026-10-16-v2`.  
**Current main base:** `18d7831cf51503920396067279b21af7b615b319`  
**Status:** PR #76 remains open and unmerged. All three exact-head workflows passed on `adf3059a`: **1,527/1,527 tests**, zero failures; release-contract verification, lint, type-check, and production build passed.

Exact-head evidence:
- [Release gate — 39012240902](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39012240902)
- [Verification workflow 1 — 39012240903](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39012240903)
- [Verification workflow 2 — 39012240888](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39012240888)

**Latest runtime grounding regression coverage:** the candidate now verifies work-availability questions against canonical opportunity postings only. A result is treated as an available local opportunity only when it is an explicitly categorized posting, has canonical status `OPEN`, and is attached to the player's exact current location. Remote postings and closed contracts cannot be presented as locally available work; when no eligible posting exists, the plan preserves uncertainty. StoryBeat focus and unresolved-thread selection use the same eligible evidence for these questions. Two focused Phase 4 integration tests cover both the no-eligible-posting and valid-local-posting cases.

**Regression that was fixed:** commit `603bdc69` added opening-scene presentation validation but the Slice 4 test stub replaced the real orchestrator with an object exposing only `executeTaskGeneration`. The new validator therefore could not run in the mocked opening path, causing two valid-opening acceptance assertions to fail. Commit `84dcec5f` preserved the real orchestrator methods and mocked only provider generation. A subsequent regression-test import failure was fixed in `adf3059a`; the full suite and all three exact-head workflows now pass.

**Live-provider boundary:** these green CI results do not certify the separate 125-turn real-Gemini acceptance run. That run remains deferred to player execution after integrations are complete. Do not merge PR #76 without the expected review/merge decision.

**Previous checkpoint:** `13f9b8ce3f7463da1e8d23f69e824aa9b052a374` passed the then-current 1,523-test suite on 2026-10-16; it has been superseded by the exact-head verification above.

## 1. Consolidated into the current integration candidate

PRs #69–#75 were separate branches based on the same earlier main commit. Their relevant runtime fixes and regression coverage were consolidated into PR #76. Do not merge these PRs independently on top of #76 without comparing their exact diffs; doing so risks duplicate or conflicting edits.

| PR | Concern | Triage |
|---|---|---|
| #69 | Authoritative plan index and outdated-plan archive | The documentation index and historical/outdated archive changes are represented in the integrated candidate; use the current docs index and triage file as authority. |
| #70 | Movement intent, opening population, scene context | Relevant changes are represented in the integrated candidate; use current source/tests as authority. |
| #71 | Fail-closed narration repair and UI error/retry behavior | Final candidate validation and fail-closed regressions are present in the integrated candidate. |
| #72 | Canonical ambient population and opening-scene persistence/idempotency | Population integration tests are present in the integrated candidate. |
| #73 | Gemini narration route order | The configured route in the integrated candidate retains the emergency floor and places Gemini 3.8 before Gemini 2.5. |
| #74 | Preserve explicit destination and Continue travel intent | Movement helper and continuation regressions are present in the integrated candidate. |
| #75 | Phase 12 fixture/assertion alignment | Relevant test adjustments are included in the integrated candidate. |

PR #63 is an older fail-closed narration branch with an outdated base. Source inspection at `13f9b8ce3f7463da1e8d23f69e824aa9b052a374` confirms that its important protections are already present: exhausted AI candidates fail visibly without deterministic emergency narration, attempts remain available for diagnostics, question-only wording is not accepted as an answer, and late-afternoon prose may naturally mention approaching dusk. The current configured narration routes also retain the emergency floor and the current Gemini/OpenRouter ordering. Do not merge PR #63 wholesale; only revisit a concrete missing regression if one is demonstrated.

## 2. Older branches that require separate, scoped review

### PR #60 — story-session recording isolation and action-substance gate

The current integration candidate already contains the unique runtime capabilities that were missing in the earlier audit snapshot:

- recording schema 1.1 with `runSessionId`;
- recording storage partitioned by story ID and run-session ID;
- repository loading that rejects a recording from a different run session;
- the N18 `ACTION_SUBSTANCE` dimension, its final presentation-gate use, and focused regression tests;
- immutable initial-state and append-time state-before hash validation;
- a repository boundary that keeps forensic recording failures from failing canonical gameplay.

Source evidence is present in `server/domain/storySessionRecorder.ts`, `server/services/storySessionRecordingStore.ts`, `server/repositories/worldRepository.ts`, `server/domain/narrativeRichnessEvaluation.ts`, and their tests.

**Recorder mismatch follow-up resolved at the current candidate:** CI for `13f9b8ce3f7463da1e8d23f69e824aa9b052a374` no longer reports state-before mismatch warnings for `default_story`, `run_legacy`, or the 125-turn marathon. The sole remaining mismatch log is the deliberately invalid `story_recorder_boundary` negative test. The fix records observed state changes between recorder boundaries as explicit `AUXILIARY` transitions, rather than silently attributing them to the next command. Full snapshot hashes still include `runtimeState`, and a new regression confirms a tampered runtime-state patch fails integrity validation.

PR #60 should not be merged wholesale: its older branch has conflicting version/type assumptions and overlapping edits. PRs #58 and #59 are older recording branches; their distinct behaviour is already substantially represented in the current candidate. Port only a specifically reproduced gap, with a focused test, rather than stacking those branches.

- [PR #60](https://github.com/HeWhoArose/Dreamville-External/pull/60)
- [PR #59](https://github.com/HeWhoArose/Dreamville-External/pull/59)
- [PR #58](https://github.com/HeWhoArose/Dreamville-External/pull/58)

### PRs #50–#52 — earlier long-session audits

These branches contain earlier 100/120-turn tests and changes to the orchestration path, but their historical CI runs failed and their branch bases predate the current integrated candidate. The current candidate already has:
- `tests/narrative-long-session-n11.test.ts`;
- `tests/narrative-final-audit-n12.test.ts`;
- the deterministic/mock HTTP pipeline test `tests/marathon-125-turn.integration.test.ts`;
- the Phase 24 system-wide architecture audit.

Do not merge their orchestration edits or add duplicate marathon tests by default. First compare any unique assertion against the current tests, then port only missing coverage with a focused regression. The real-provider 125-turn session is deliberately a **player-run acceptance test after integration**, not a CI gate.

### PR #33 — N7 novelty engine

The current candidate already contains the novelty engine and its focused N7 test. Treat PR #33 as historical/overlapping unless a source comparison proves a unique, still-required change is missing. Do not merge its old branch solely because the PR remains open.

### PR #68 — grounding-plan document

PR #68 is a documentation-only plan on an older base. The current candidate has the active owner plan, baseline/source-trace evidence, current docs index, and the player-run acceptance checklist. Compare content before adopting anything; do not let the older draft override current status.

## 3. Release and player acceptance boundary

**Combat narration provenance follow-up: resolved in the integrated code.** `CombatPlayerActionService` and `CombatEncounterService` return `fallbackUsed` and `narrativeSource`; `TacticalCombatView` and `StoryView` distinguish backup-AI and deterministic narration. Focused regression tests cover primary/backup, empty and thrown provider responses. This is no longer an outstanding implementation item.

Automated gates remain:
1. release-contract verification;
2. TypeScript check;
3. full deterministic/mock test suite;
4. production build.

The player-run 125-turn test and manual UI/model scenarios are performed after code integration. Historical real-provider telemetry is a warning to review, not a current result and not grounds for repeated token-consuming CI runs.

The latest code-bearing candidate is PR #76 at `13f9b8ce3f7463da1e8d23f69e824aa9b052a374`: all three exact-head workflows passed 1,523/1,523 tests plus release contracts, lint/type-check and production build. A docs-only reconciliation can advance the branch head; confirm the actual head and its new workflow runs before release. The NPC initiative HTTP prompt regression now passes, and the opening-population, Gemini route-order, movement destination/Continue, fail-closed narration and persistence/reload test cases are green in that same run. PR #76 is still not merged into `main`. Once the scoped outstanding items are either implemented and verified or explicitly accepted as deferred, review PR #76 and run the final merged-main gate. Do not mark the live-provider/player acceptance step passed before the player actually performs it.
