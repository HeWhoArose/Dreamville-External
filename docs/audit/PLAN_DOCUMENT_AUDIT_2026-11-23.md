# Plan Document Audit: what is needed, what is done, what is redundant

- **Date:** 2026-11-23
- **Scope:** every top-level file in `docs/` (49 files, about 8,000 lines) plus the 43-file `docs/outdated/` archive layout.
- **Method:** read `docs/README.md` in full, each plan's own status header, and the phase and slice sections of the two plans that matter (`UNIFIED_AUDIT_RECONCILIATION.md`, `NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md`). Grepped the code for each V2 slice's named artefacts.
- **Not done:** I did not read every document line by line. Classifications for the N13–N19 audits, the owner specs and the historical audits rest on their own status lines and on the index, not on re-checking them against code.

## 1. The two plans that matter

### Where 1A–1F come from
`UNIFIED_AUDIT_RECONCILIATION.md` (612 lines). It reconciles two outside audits and defines the roadmap in section 8 (Phase 0, 1A to 1F), acceptance criteria in section 9, risks, and a licensing policy for open-source reuse. Its own header and `docs/README.md` section 0 declare it the **single active focus plan** that supersedes every other plan as a work queue. 1A to 1F plus the final audit are implemented and verified offline (see `FINAL_24_DOMAIN_AUDIT_AND_DELIVERABLES.md`).

### What "Phase 2" is
There is no Phase 2 in the Unified plan. The only Phase 2 is in `NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md` (604 lines, "ACTIVE EXECUTION PLAN", Phase 0 passed automatically on 2026-10-18).

| V2 phase | Content | Status in V2 | Real state today |
| --- | --- | --- | --- |
| 0 Baseline and instrumentation | Authority lock, recorder coverage, hygiene | PASS (automated); live cost baseline BLOCKED | Done |
| 1 Live behavioural baseline, scenarios A–X | Human live sessions | NOT RUN | Still not run. Partial live evidence now exists from the OpenRouter free run (ledger 12.1a), which is not the scenario suite |
| **2 Intent and objective continuity** | X1 objective ledger, X1b "bounded information-goal continuation", decision D3 (player goals). Goal: "anything else?" and "I look again" keep the player's aim; objectives visible | NOT STARTED | **No code exists** (no ledger, no continuation state) |
| 3 Evidence and information retrieval | Research order, evidence records with stable IDs, X3 memory consolidation | NOT STARTED | Partly pre-existing (research packet, memory lifecycle); X3 arc summaries not built |
| 4 Population, encounter, opportunity grounding | Reuse `ensureAmbientPopulation`; X6b thread quality; D4 world pressure | NOT STARTED | Population grounding largely overlaps 1B; X6b and D4 not built |
| 5 Beat fidelity and story structure | X4 milestones, X8 stall ladder, X9 stakes | NOT STARTED | **No code exists** |
| 6 Candidate review, bounded repair, safe fallback | One repair, revalidation, fallback never invents; X2 redirection policy | NOT STARTED | Mostly delivered by 1A and confirmed live (single repair, `NARRATION_AI_UNAVAILABLE` instead of invented prose); **X2 not built** |
| 7 Post-fix live validation A–X | Human | NOT STARTED | Blocked on Phase 1 |
| 8 Regression, long session, X5b replay harness | Replay recordings through the review gates | NOT STARTED | 125-turn marathon done (1F); **replay harness not built** |
| 9 Final re-audit | | NOT STARTED | |

Grep evidence (no matches in `server/`, `src/`, `scripts/`): `ObjectiveLedger`, `objectiveContinuation`, `RedirectionPolicy`, `StallLadder`, milestone layer, arc summary, replay harness, `worldPressure`. So V2's new slices X1, X1b, X2, X3, X4, X5b, X6b, X8, X9 are real, unbuilt work.

### Overlap between V2 and 1A–1F
The two plans were written separately and address different failures. Overlap exists only in V2 Phases 4 and 6 (population, bounded repair and fallback), which 1A and 1B largely delivered. The V2 gaps G1–G10 (objectives, redirection, milestones, stall handling, replay) are **not** in the Unified roadmap at all. So V2 is not redundant wholesale: it is partly superseded and partly the only place some real gaps are written down.

### Important catch about Phase 2 itself
V2 Phase 2 says "reproduce first: scenarios G, M, R in the baseline". Those come from V2 Phase 1, which needs a human live session and has not run. Building X1/X1b now would mean building to a failure nobody has reproduced. V2's own risk table also warns that new review checks can over-reject legitimate prose, which is the failure the live run just showed.

## 2. Classification of every top-level document

**NEEDED (active contracts; keep):**
`UNIFIED_AUDIT_RECONCILIATION.md`, `README.md` (needs fixes, see 3), `SURGICAL_ARCHITECTURE_REGISTRY_V1.md`, `AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md`, `AI_ORCHESTRATION_IMPLEMENTATION_PLAN_V1.md`, `DREAMVILLE_CAPABILITY_AND_STORY_IMPLEMENTATION_PLAN.md`, `DREAMVILLE_STORY_CAPABILITY_INTEGRATION_ROADMAP.md`, `PERSISTENT_MULTIWORLD_AND_MEMORY_IMPLEMENTATION_PLAN_V1.md`, `STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md`, `OPERATIONS_MENU_AUDIT_V1.md`, `SPATIAL_WORLD_SIMULATION_MASTER_SPEC_V1.md`.

**NEEDED, but as a backlog, not a queue:** `NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md` (source of the unbuilt X-slices and scenarios A–X), `NARRATIVE_PHASE1_LIVE_RUN_SHEET.md` (the human live-test procedure), `NARRATIVE_PHASE0_BASELINE_AND_AUTHORITY_REPORT_2026-10-18.md`.

**NEEDED for its remaining human gate only:** `WORLD_DIRECTOR_IMPLEMENTATION_PLAN.md` (1003 lines; phases 0–5 complete, 6 CI-verified, 7 player acceptance not run) and `WORLD_DIRECTOR_PHASE7_PLAYER_ACCEPTANCE_CHECKLIST.md`. The long implementation history inside it is largely done.

**KEEP AS EVIDENCE (do not treat as work):** `UNIFIED_PLAN_PHASE1A_AUDIT_2026-11-03.md`, `NARRATIVE_COMPETITIVE_RESEARCH_AND_GAP_AUDIT_2026-10-17.md`, `NARRATIVE_GROUNDING_PHASE0_BASELINE_AUDIT_2026-10-15.md`, `NARRATIVE_GROUNDING_PHASE0_RUNTIME_TRACE_2026-10-15.md`, `N13`–`N19` audits, `STORY_BEAT_DIRECTOR_FINAL_AUDIT.md`, `LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md` (still marked PARTIAL), `SYSTEM_WIDE_AUDIT_FINAL_REPORT.md` (the final ledger cites its section 6), `P0_NPC_AUTHORITY_AUDIT.md` (a test file cites it).

**REDUNDANT (archive candidates), as first written, CORRECTED below:**
- `ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md` (920 lines): deferred to V2 on 2026-10-17 and "kept unchanged"; V2 wins wherever they differ. The name still says ACTIVE.
- `DREAMVILLE_OPEN_PR_INTEGRATION_TRIAGE_2026-10-16.md`, `DREAMVILLE_LIVE_PROVIDER_125_TURN_AUDIT.md`, `DREAMVILLE_RELEASE_GATE_PHASE21.md`: all describe PR #76 at head `15f1477`, which is now old.
- `DREAMVILLE_ORPHAN_CONNECTION_AUDIT_PHASE20.md` and `DREAMVILLE_RELEASE_GATE_PHASE21.md`: each already has a `_HISTORICAL` copy in `docs/outdated/phase-17-to-24/` (versions differ in length, 90 vs 75 and 85 vs 71 lines; I did not diff them).
- `DREAMVILLE_VERIFICATION_DISCIPLINE_PHASE19.md`, `DAMAGE_CONTROL_AUDIT_2026-09-27.md`, `CAPABILITY_SKILLS_CHECKS_SURGICAL_AUDIT_2026-09-27.md`, `STORY_RUNTIME_AND_PLAYER_INTERACTION_AUDIT_2026-09-27.md`: dated historical audits, unindexed.
- Five 7-line "compatibility pointer only" stubs (`DREAMVILLE_DEEP_IMPLEMENTATION_SPECIFICATION`, `…INTEGRATION_MATRIX_PHASE17`, `…RELEASE_STABILIZATION_PHASE22`, `…SYSTEM_WIDE_PHASE_AUDIT_PHASE24`, `PHASE1_LIVE_MODEL_BEHAVIORAL_VALIDATION`): harmless, but only useful if something still links to them.

## 3. Defects in the document system itself

1. **`docs/README.md` contradicts itself.** Section 0 says the Unified plan supersedes V2 as a work queue. Section 2 still calls V2 "the complete, active owner plan". Section 1 ("Source-of-truth order") appears twice.
2. **The index is stale.** It is "reviewed against" `main` at `18d7831` and PR #76 at `15f1477` (2026-10-17), 1,530 tests. Today: 1,986 tests, feature branch from `d3d0fff`.
3. **16 top-level documents are not mentioned in the index at all**, including `UNIFIED_PLAN_PHASE1A_AUDIT_2026-11-03.md`.
4. **The index does not mention** `PROJECT.md`, `TEST_READY.md`, `TEST_INFRA.md`, or `docs/audit/` (the 24-domain ledger, the fix-vs-replace assessment, this file).
5. **1A–1F completion is not recorded in the index.** A new reader would not learn the roadmap is done.
6. **Repo-root clutter, not docs but relevant:** 46 tracked scratch scripts (`fix_*.cjs`, `patch*.cjs`, `live_*`, `test_*`, `check_*`) sit at the repository root.

## 4. Recommendation for "Phase 2"

The Unified roadmap is complete, so the next work is not "Phase 2 of V2" by default. The honest sequence:

1. **Clean the document system first (small, safe, one session):** fix the README contradiction and staleness, index the missing files, archive the redundant list above into `docs/outdated/`, record 1A–1F as complete. This stops the next person starting from the wrong plan.
2. **Then run the V2 Phase 1 live baseline** (human or key-driven): it is the prerequisite that makes V2 Phase 2 reproducible, and it measures narration yield, which the plans never measured.
3. **Then choose from V2 by measured failure.** If the baseline shows follow-ups losing the objective, build X1/X1b. If it shows over-rejection, build the soft/hard review split and X2 first.



## 5. Correction and cleanup performed (2026-11-23, same day)

**My first redundant list was too broad.** Before moving anything I checked inbound references and found that several of those documents are pinned by tests or by the release-contract script, so moving them would have broken the release gate:

- `DREAMVILLE_VERIFICATION_DISCIPLINE_PHASE19.md`, `DREAMVILLE_ORPHAN_CONNECTION_AUDIT_PHASE20.md` and `DREAMVILLE_RELEASE_GATE_PHASE21.md` are read by `tests/verification-discipline.phase19.test.ts`, `tests/orphan-connection-audit.phase20.test.ts` and `tests/release-gate.phase21.test.ts`. Their `_HISTORICAL` twins in `docs/outdated/phase-17-to-24/` are pinned separately by `tests/system-wide-phase-audit.phase24.test.ts`. The "duplicates" are deliberate. **Keep both.**
- The five 7-line pointer stubs are linked from archived documents, and `scripts/verify-release-contract.mjs` requires the archived `_HISTORICAL` files. **Keep.**
- `DREAMVILLE_LIVE_PROVIDER_125_TURN_AUDIT.md` is linked from the (test-pinned) Phase 21 record. **Keep.**
- `CAPABILITY_SKILLS_CHECKS_SURGICAL_AUDIT` and `STORY_RUNTIME_AND_PLAYER_INTERACTION_AUDIT` are verified audits with no inbound links. Left in place and indexed as evidence.

**Archived (the only three that were safe):** `ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md`, `DREAMVILLE_OPEN_PR_INTEGRATION_TRIAGE_2026-10-16.md` and `DAMAGE_CONTROL_AUDIT_2026-09-27.md`, moved under `docs/outdated/` with a `_HISTORICAL` suffix. Every relative link, including links inside the moved files, was recomputed. Link check over all 91 Markdown files: 1 broken link before, the same 1 after (pre-existing, in an archived plan).

**README fixes:** removed the duplicated "Source-of-truth order" block (keeping its "do not use `docs/outdated/`" sentence), resolved the Unified-versus-V2 contradiction, relabelled the 2026-10-17 checkpoint as historical and added a current one, recorded that 1A–1F is complete, indexed the 16 previously unindexed documents (with what pins each), and linked `PROJECT.md`, `TEST_READY.md`, `TEST_INFRA.md` and `docs/audit/`.

**Not done:** the 46 tracked scratch scripts at the repository root were not touched (they are not documents, and I did not check what imports them); the two broader owner specs and the N13–N19 audits were not re-verified against code.
