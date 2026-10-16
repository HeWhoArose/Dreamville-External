# DreamVille Open-PR Integration Triage — 2026-10-16

**Purpose:** prevent duplicate/obsolete pull requests from being merged blindly while the narrative-grounding integration is being completed.

**Current integration candidate:** PR #76, commit `50061df2565a7d1d37ce013cf524228aae8ba8a8`  
**Current main base:** `18d7831cf51503920396067279b21af7b615b319`  
**Status:** PR #76 is open and unmerged. Its exact-head release gate and both verification workflows passed; the release gate reported 1,503/1,503 tests, zero failures, and successful build.

Evidence:
- [Release gate — 50061df](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38891307064)
- [Verification workflow 1](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38891307058)
- [Verification workflow 2](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38891307061)

## 1. Consolidated into the current integration candidate

PRs #70–#75 were separate branches based on the same earlier main commit. Their relevant runtime fixes and regression coverage were consolidated into PR #76. Do not merge these PRs independently on top of #76 without comparing their exact diffs; doing so risks duplicate or conflicting edits.

| PR | Concern | Triage |
|---|---|---|
| #70 | Movement intent, opening population, scene context | Relevant changes are represented in the integrated candidate; use current source/tests as authority. |
| #71 | Fail-closed narration repair and UI error/retry behavior | Final candidate validation and fail-closed regressions are present in the integrated candidate. |
| #72 | Canonical ambient population and opening-scene persistence/idempotency | Population integration tests are present in the integrated candidate. |
| #73 | Gemini narration route order | The configured route in the integrated candidate retains the emergency floor and places Gemini 3.8 before Gemini 2.5. |
| #74 | Preserve explicit destination and Continue travel intent | Movement helper and continuation regressions are present in the integrated candidate. |
| #75 | Phase 12 fixture/assertion alignment | Relevant test adjustments are included in the integrated candidate. |

PR #63 is an older, non-draft fail-closed narration branch with an outdated base. Its central protections are already represented in the current candidate: narration generation fails visibly when AI candidates are exhausted rather than silently returning deterministic emergency prose; attempts are preserved for diagnostics; question-only output is not treated as an answer. One narrow temporal-validation adjustment from that PR is not present: the rule that avoids rejecting a natural reference to approaching dusk at a late-afternoon clock time. Revisit this only with a focused regression test; do not merge PR #63 wholesale.

## 2. Older branches that require separate, scoped review

### PR #60 — story-session recording isolation and action-substance gate

The following improvements from PR #60 are **not** present in the current integration candidate at the time of this audit:

- per-run `runSessionId` isolation when a story ID is reused;
- recording schema 1.1 and persistence partitioning by run session;
- append-time rejection when the recorded `stateBefore` does not match the previous state hash;
- the `ACTION_SUBSTANCE` richness dimension and its dedicated test cases.

One proposed PR #60 fix — preserving the exact pre-mutation initial state — appears to be functionally covered already: the current `recordStorySessionInteraction` passes `params.stateBefore` into recording initialization, and `StorySessionRecorder.append` resets `initialState` to that same pre-interaction state when the recording has no interactions. The dedicated regression assertion is still worth adding, but do not duplicate the implementation without first proving a failing case.

The missing run-session isolation and append-time state-before hash check are concrete recording-integrity candidates. The action-substance dimension is an unmerged enhancement, not proof that the current quality path is absent: current narration already has an N18 richness evaluation and a live environment-excess detector/rewrite path. Review whether the existing final-candidate path can still accept an environment-heavy original after a skipped/failed rewrite before porting the extra dimension.

PR #60 must not be merged as-is. Its last recorded release-gate run failed TypeScript checks, including undefined narrative-plan values and inconsistent 1.0.0/1.1.0 recorder version types. Port and test individual changes on the current candidate only after a focused regression establishes the gap.

- [PR #60](https://github.com/HeWhoArose/Dreamville-External/pull/60)
- [Failed historical release gate](https://github.com/HeWhoArose/Dreamville-External/actions/runs/37386761068)

PRs #58 and #59 are earlier overlapping story-session-recording branches on older bases. Audit their unique changes only if they are not superseded by the scoped PR #60 improvements; do not stack them blindly.

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

Automated gates remain:
1. release-contract verification;
2. TypeScript check;
3. full deterministic/mock test suite;
4. production build.

The player-run 125-turn test and manual UI/model scenarios are performed after code integration. Historical real-provider telemetry is a warning to review, not a current result and not grounds for repeated token-consuming CI runs.

The current candidate is not merged into `main`. Once the scoped outstanding items are either implemented and verified or explicitly accepted as deferred, review PR #76 and run the final merged-main gate. Do not mark the live-provider/player acceptance step passed before the player actually performs it.
