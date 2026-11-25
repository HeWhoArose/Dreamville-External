# Dreamville Documentation Index — Read This Before Planning or Coding

**Index status:** CURRENT — re-reviewed 2026-11-23 (see section 0 and "Current integration status"). The 2026-10-17 checkpoint further down is historical.  
**Originally reviewed against (2026-10-17, historical):** current `main` at `18d7831cf51503920396067279b21af7b615b319` and PR #76 code/test head `15f1477599c0e09695e752789e31cc9819f3101a` (2026-10-17). Earlier code/test checkpoints are superseded; earlier `090b7d7…` source traces remain explicitly baseline snapshots.  
**Purpose:** tell future developers/AI agents which documents are authoritative, what is complete, what is still planned, and which files must not be used as implementation instructions.

## 0. CURRENT FOCUS PLAN (2026-11-03)

**[UNIFIED_AUDIT_RECONCILIATION.md](UNIFIED_AUDIT_RECONCILIATION.md) is now the single active focus plan for this repository.**

- All new work follows its roadmap phase-by-phase, starting at **Phase 1A (stabilise the live narration and validation contract)** after Phase 0 baseline reconciliation.
- It **supersedes every other plan document in `docs/`** as a work queue — including `WORLD_DIRECTOR_IMPLEMENTATION_PLAN.md`, `NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md`, the phase checklists and all other roadmaps. Do not start new work from those; they remain only as contracts/traceability for their respective subsystems.
- `docs/README.md` (this index) and the per-subsystem owner contracts it lists are not superseded for their own narrow topics; everywhere else, when documents conflict, UNIFIED_AUDIT_RECONCILIATION.md wins.

**Roadmap status (2026-11-23):** Phase 0 and Phases 1A–1F are implemented and verified offline on branch `feat/unified-audit-reconciliation-programme` (not yet committed or merged). The plan contains **no phase after 1F**. Real-provider testing is only partly done and human UI testing is BLOCKED. Evidence: [FINAL_24_DOMAIN_AUDIT_AND_DELIVERABLES.md](audit/FINAL_24_DOMAIN_AUDIT_AND_DELIVERABLES.md). What to do next, and which plan documents are needed, redundant or test-pinned: [PLAN_DOCUMENT_AUDIT_2026-11-23.md](audit/PLAN_DOCUMENT_AUDIT_2026-11-23.md).

**Relationship to V2:** the Unified plan was written separately from `NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md` (from two outside audits, not from V2) and declares V2 superseded as a work queue without absorbing V2's unbuilt slices (X1–X9). Treat V2 as a backlog and a source of live-test scenarios (section 2), not as the repository work queue.

## 1. Source-of-truth order

When documents disagree, use this order:

1. Current code and tests on the target branch, plus the most recent verified CI result.
2. This index and the current project identity/authority boundary in the root `README.md`.
3. The active focus plan `UNIFIED_AUDIT_RECONCILIATION.md` (Section 0) for roadmap/phase priority.
4. The active owner specification for the subsystem being changed.
5. The cross-system plan `NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md` for the narrative-grounding work covered there.
6. A current verification report for the exact code/commit being discussed.
7. Historical audit records only as evidence of what was found at their recorded commit.

**Do not use documents inside `docs/outdated/` as implementation instructions.** They are kept for traceability and to explain previous decisions, not as a queue of unfinished work.

## Current integration status — 2026-11-23

- **Automated gates (re-run 2026-11-23):** full suite 1,986/1,986 pass (250 suites), opaque-box E2E tiers 118/118, `npm run verify:contracts`, `tsc --noEmit` (`npm run lint`) and `npm run build` exit 0.
- **Branch state:** work is on `feat/unified-audit-reconciliation-programme`, whose `HEAD` is still the baseline `d3d0fff`; the programme is **uncommitted** in the working tree, so there is no final commit SHA yet.
- **Real provider:** one limited live run on OpenRouter free models (partial, see audit ledger section 12.1a). Scenarios A–X and the human UI playtest are not run.
- **Records:** [audit ledger](audit/FINAL_24_DOMAIN_AUDIT_AND_DELIVERABLES.md), [narration fix-vs-replace assessment](audit/NARRATION_FIX_VS_REPLACE_ASSESSMENT.md), [plan document audit](audit/PLAN_DOCUMENT_AUDIT_2026-11-23.md), [plan status audit](audit/PLAN_STATUS_AUDIT_2026-11-23.md), root `PROJECT.md` (milestones), `TEST_READY.md` and `TEST_INFRA.md` (E2E suite).

## Historical integration checkpoint — 2026-10-17 (superseded by the status above)

The latest verified code/test head is `15f1477599c0e09695e752789e31cc9819f3101a` on PR #76, based on `main` at `18d7831cf51503920396067279b21af7b615b319`. All three exact-head workflows passed: **1,530/1,530 tests across 117 suites**, zero failures; release contracts, lint, type-check, and production build passed. This checkpoint also verifies that opening prose must contain a canonical scene anchor while distinct, canonically grounded opening prose remains eligible.

Exact-head evidence:
- [Release gate — 39018070577](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39018070577)
- [Verification workflow 1 — 39018070659](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39018070659)
- [Verification workflow 2 — 39018070612](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39018070612)

The availability-query regression now verifies the final prompt, not only intermediate research and planning: eligible canonical OPEN postings at the current location can reach the model prompt; unsupported or unrelated rumours cannot. The model-routing regression also asserts Gemini 3.8 Flash before Gemini 2.5 Flash with the deterministic emergency floor last.
The real-provider 125-turn player acceptance test remains deferred and is not covered by these mocked/automated checks. Always check CI for the actual current PR #76 head before release.


### `NARRATIVE_GROUNDING_PHASE0_RUNTIME_TRACE_2026-10-15.md`

Current-main source trace for the live freeform narration pipeline, candidate rewrite/final-review seam, other narration callers, and living-world encounter boundary. Records a confirmed fail-open rejected-rewrite path and the follow-on runtime-only fix; this source trace is not a claim of passing tests or live-model validation.

## 2. Narrative grounding plan (V2): backlog and live-test scenarios, not the work queue

### `NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md`

This is the owner plan for the narrative-grounding backlog. It is **not** the repository work queue (section 0 makes the Unified plan that); its slices X1–X9 are real but unbuilt (no objective ledger, redirection policy, milestone layer, stall ladder or replay harness exists in code as of 2026-11-23). It carries forward every phase of the earlier plan (same Phase 0–9 numbering) and adds the research-driven slices. It covers:
- the retained **Phase 1 live-model behavioural validation**, now scenarios A–X;
- preserving the player's information goal across follow-ups and showing a unified objective ledger;
- finding real evidence for questions about work, contracts, quests, notices and other opportunities;
- avoiding both invented populations and artificially empty worlds;
- connecting eligible NPC encounters through canonical world systems;
- story structure (milestones, stall handling, stakes), pushback policy, and memory consolidation;
- semantic candidate review, bounded repair and safe fallback;
- replay of recorded sessions, live-model, long-session, regression and final integration gates;
- producer/consumer maps, owner decisions D1–D5 and human testing requirements.

**Phase 1 is not passed.** The plan specifies required scenarios, not completed results. Mock tests and replays cannot satisfy the real-provider requirement.

### `ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md` (deferred, archived 2026-11-23)

Now at [outdated/superseded-plans/ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN_HISTORICAL.md](outdated/superseded-plans/ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN_HISTORICAL.md). Deferred to V2 on 2026-10-17 and kept unchanged as the historical record (CI evidence, PR triage, Phase 6 source findings, connection maps). Where it differs from V2, V2 wins. Do not start new work from it.

### Exact wording for Phase 1

Say “Phase 1 of `docs/NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md`” when referring to the live-model test gate. Do not say only “Phase 1”: older historical documents use that label for different work (CurrentSituation, StoryBeat contract, Master Plan phase work and other systems).

## 3b. Phase 0 report (2026-10-18)

Read [Phase 0 Baseline, Authority Lock and Instrumentation Report](NARRATIVE_PHASE0_BASELINE_AND_AUTHORITY_REPORT_2026-10-18.md) for the Phase 0 results of the V2 plan: what was verified, what was fixed in the session recorder and test hygiene, the objective/thread trace, the `StoryDirectorService` decision (D1), and what remains blocked. Phase 1 is still not run.

## 3c. Phase 1 live run sheet (2026-10-19)

Follow [Phase 1 Live Run Sheet](NARRATIVE_PHASE1_LIVE_RUN_SHEET.md) to run the human live-model sessions: setup, the key, each scenario in order, what to send back, and how results are judged. Phase 1 is still not run.

## 3a. Narrative research and gap audit (2026-10-17)

Read [Narrative Competitive Research & Gap Audit](NARRATIVE_COMPETITIVE_RESEARCH_AND_GAP_AUDIT_2026-10-17.md) for how comparable AI game-master systems keep narration consistent and objective-driven, an evidence-tiered review of Dreamville against them, and the proposals that feed the V2 plan. It is an evidence input, not an implementation authority; every proposal still needs a reproduced failure first.

## 3. Latest baseline audit (2026-10-15)

Read [Narrative Grounding Phase 0 Baseline Audit](NARRATIVE_GROUNDING_PHASE0_BASELINE_AUDIT_2026-10-15.md) before implementing the active narrative plan. It records which systems already exist, which integrations remain unverified, the current main-branch CI baseline, and the required human gates. It is a dated snapshot; inspect current code and CI before relying on its status.

## 4. Current owner specifications and work plans

| Document | Ownership | How to use it |
|---|---|---|
| `AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md` | AI task contracts, model routing, fallback, context and AI authority boundaries | Active architecture contract; do not create a second router |
| `AI_ORCHESTRATION_IMPLEMENTATION_PLAN_V1.md` | Remaining scoped orchestration consolidation and verification | Active plan; inspect current implementation and already-verified N19 code before doing any item |
| `DREAMVILLE_CAPABILITY_AND_STORY_IMPLEMENTATION_PLAN.md` | Capability ownership, Skillbook projection, acquisition, world-law and skill checks | Active scoped plan; do not duplicate capability/check authority |
| `DREAMVILLE_STORY_CAPABILITY_INTEGRATION_ROADMAP.md` | Cross-system Story/capability connections | Active integration map, not a second capability owner |
| `PERSISTENT_MULTIWORLD_AND_MEMORY_IMPLEMENTATION_PLAN_V1.md` | World/run bindings, portable vs local state, persistence and memory continuity | Active boundary/acceptance contract; S5 implementation evidence is historical, not permission to rebuild persistence |
| `SPATIAL_WORLD_SIMULATION_MASTER_SPEC_V1.md` | Deterministic spatial geometry, movement, visibility, terrain and environment | Verified owner specification; spatial facts are not narrator-authoritative |
| `STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md` | Story/OOC/Continue, dice/check display, resume/delete and player presentation | Active UI contract; the UI must not recalculate canonical results |
| `OPERATIONS_MENU_AUDIT_V1.md` | Import/export/archive, Dream Book workstation and debug/context tools | Active scoped operations contract |
| `SURGICAL_ARCHITECTURE_REGISTRY_V1.md` | Cross-system owner/authority boundaries | Current architecture map; use this document plus this index to locate subsystem owners |
| `LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md` | Occupancy metadata, population grounding and encounter/activity wiring | **PARTIAL**: population context exists; end-to-end encounter generation is not yet verified |
| `WORLD_DIRECTOR_IMPLEMENTATION_PLAN.md` | Scene readiness, scenario-specific canonical preparation, opening/turn/fallback integration, and Phase 6 narration gate | **PHASES 0–5 COMPLETE; PHASE 6 NARRATION GATE CI-VERIFIED; broader local combat-effect producer projection requires source reconciliation; PHASE 7 PLAYER ACCEPTANCE PENDING**; use `WORLD_DIRECTOR_PHASE7_PLAYER_ACCEPTANCE_CHECKLIST.md` for the real Story UI/provider run |

“Active” means the contract or remaining work is still relevant. It does **not** mean every bullet is absent from code. Always audit the current implementation before adding anything.

## 5. Verified implementation evidence — do not reimplement by default

| Document(s) | Current documented state | Required behaviour before a change |
|---|---|---|
| `STORY_BEAT_DIRECTOR_FINAL_AUDIT.md` | StoryBeatDirector implementation was runtime-verified at the recorded commit, with fallback/regression and release checks | Recheck current head if needed; extend only for a reproduced missing contract/connection |
| `N13_SCENE_COMPOSITION_AUDIT.md` | N13 scene composition implementation complete / release-gate verified | Treat as existing presentation owner |
| `N14_NPC_EXPRESSIVE_IDENTITY_AUDIT.md` | N14 implementation complete / release-gate verified | Treat as existing expressive projection |
| `N15_SOCIAL_ATTENTION_TOPOLOGY_AUDIT.md` | N15 social topology contract and prompt integration documented | Audit latest tests and runtime call path before changes |
| `N16_SEMANTIC_EPISODIC_MEMORY_AUDIT.md` | N16 memory retrieval contract uses existing memory/continuity owners | Do not build another memory engine |
| `N17_NARRATIVE_EPISODE_PROJECTION_AUDIT.md` | N17 episode projection is wired into narrative prompt paths | Do not build a parallel plot/thread authority |
| `N18_NARRATIVE_RICHNESS_EVALUATION_AUDIT.md` | N18 deterministic, advisory richness evaluation is implemented | Do not replace semantic truth checks with richness scores |
| `N19_CREATIVE_MODEL_TIER_CADENCE_ROUTING_AUDIT.md` | N19 routing projection extends existing orchestration | Do not add a second router or reorder explicit configured fallback routes |

These records are verification snapshots, not permission to assume the latest `main` still passes. For any new change, record the exact tested commit and current CI status.

### Historical and test-pinned records (not work queues)

**Do not move or edit these without updating the tests that read them.** The release gate pins several by path or content.

| Document | Status | Pinned by |
|---|---|---|
| `DREAMVILLE_VERIFICATION_DISCIPLINE_PHASE19.md` | Historical | `tests/verification-discipline.phase19.test.ts`, `tests/system-wide-phase-audit.phase24.test.ts` |
| `DREAMVILLE_ORPHAN_CONNECTION_AUDIT_PHASE20.md` | Historical | `tests/orphan-connection-audit.phase20.test.ts` |
| `DREAMVILLE_RELEASE_GATE_PHASE21.md` | Historical (PR #76 era) | `tests/release-gate.phase21.test.ts` |
| `docs/outdated/phase-17-to-24/*_HISTORICAL.md` (Phase 17, 20–24) | Archived but **required** | `scripts/verify-release-contract.mjs`, `tests/integration-matrix.phase17.test.ts`, `tests/system-wide-phase-audit.phase24.test.ts` |
| `DREAMVILLE_DEEP_IMPLEMENTATION_SPECIFICATION.md`, `DREAMVILLE_INTEGRATION_MATRIX_PHASE17.md`, `DREAMVILLE_RELEASE_STABILIZATION_PHASE22.md`, `DREAMVILLE_SYSTEM_WIDE_PHASE_AUDIT_PHASE24.md`, `PHASE1_LIVE_MODEL_BEHAVIORAL_VALIDATION.md` | 7-line compatibility pointers | linked from archived documents |
| `SYSTEM_WIDE_AUDIT_FINAL_REPORT.md` | Evidence (2026-10-04, mock run) | cited by the audit ledger |
| `P0_NPC_AUTHORITY_AUDIT.md` | Evidence (2026-10-02) | cited by `tests/p0_npc_authority.test.ts` |
| `DREAMVILLE_LIVE_PROVIDER_125_TURN_AUDIT.md` | Evidence (PR #76 head `15f1477`) | linked from the Phase 21 record |
| `CAPABILITY_SKILLS_CHECKS_SURGICAL_AUDIT_2026-09-27.md`, `STORY_RUNTIME_AND_PLAYER_INTERACTION_AUDIT_2026-09-27.md` | Verified audits of earlier work | none |
| `UNIFIED_PLAN_PHASE1A_AUDIT_2026-11-03.md` | Evidence for Phase 1A | none |

Archived on 2026-11-23: `ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN`, `DREAMVILLE_OPEN_PR_INTEGRATION_TRIAGE_2026-10-16` and `DAMAGE_CONTROL_AUDIT_2026-09-27` (now under `docs/outdated/`, with a `_HISTORICAL` suffix).

## 6. Required human/live validation

The following work cannot be marked complete from source inspection or mock-only tests:
- actual configured-model narration quality and semantic fidelity;
- whether a follow-up keeps its information objective in a real conversation;
- real-model behaviour for opportunity questions, quiet/populated/deserted locations, NPC-initiated activity, and fallback after rejected candidates;
- human review of whether the final narration answers the question clearly without invented facts;
- real Story UI flow, including final displayed text, loading/error states and no duplicate action submissions.

These are explicitly tagged **[HUMAN LIVE-SESSION REQUIRED]**, **[HUMAN UX REVIEW REQUIRED]**, or **[HUMAN UI SESSION REQUIRED]** in the active narrative plan. When credentials or access are unavailable, report **BLOCKED**, not PASS.

## 7. Archive policy

`docs/outdated/README.md` explains the archive and lists its categories. The archive contains old broad plans, completed plans, duplicate/superseded specs, legacy phase reports and forensic snapshots.

- Historical records may still contain valid evidence for the commit they describe.
- “Outdated” means **not authoritative as a current work queue**, not that every sentence in every report was false.
- Do not resume an old phase from an archived report. Find the current owner in this index, inspect code and tests, then implement only a gap reproduced on the current target branch.
- Some old paths remain as short deprecation pointers for link compatibility. A pointer is not the original plan and must not be expanded into a new implementation.

## 8. Repository authority boundary

This repository is the active integrated Dreamville engine and application: `server/` contains canonical runtime/simulation/authority services as well as AI orchestration; `src/` contains the user-facing application. Historical “external client only” wording has been archived. This does not weaken the internal boundary: canonical commands/repositories own world truth; AI output is not canonical without authorization and validation.
