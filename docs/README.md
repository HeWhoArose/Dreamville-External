# Dreamville Documentation Index — Read This Before Planning or Coding

**Index status:** CURRENT  
**Reviewed against:** current `main` at `18d7831cf51503920396067279b21af7b615b319` and current integration candidate `8a121e433bc461bef281e3dadffff841333cf6b7` (2026-10-17). Earlier 090b7d7… source traces remain explicitly baseline snapshots.  
**Purpose:** tell future developers/AI agents which documents are authoritative, what is complete, what is still planned, and which files must not be used as implementation instructions.

## Current integration status — 2026-10-17

The latest code-bearing runtime integration candidate is commit `8a121e433bc461bef281e3dadffff841333cf6b7` on PR #76, based on `main` at `18d7831cf51503920396067279b21af7b615b319`. The exact-head release gate and one verification workflow passed: **1,528/1,528 tests** across 117 suites, zero failures; release-contract verification, lint/type-check, and production build passed. A second verification workflow for this SHA was still in progress at the last check.

Exact-head evidence:
- [Release gate](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39013470597)
- [Verification workflow](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39013470624)

The real-provider 125-turn player acceptance test remains deferred and is not covered by these mocked/automated checks. Always check CI for the actual current PR #76 head before release.


## 1. Source-of-truth order

When documents disagree, use this order:

1. Current code and tests on the target branch, plus the most recent verified CI result.
2. This index and the current project identity/authority boundary in the root `README.md`.
3. The active owner specification for the subsystem being changed.
4. The active cross-system plan `ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md` for the narrative-grounding work covered there.
5. A current verification report for the exact code/commit being discussed.
6. Historical audit records only as evidence of what was found at their recorded commit.

**Do not use documents inside `docs/outdated/` as implementation instructions.** They are kept for traceability and to explain previous decisions, not as a queue of unfinished work.

### `NARRATIVE_GROUNDING_PHASE0_RUNTIME_TRACE_2026-10-15.md`

Current-main source trace for the live freeform narration pipeline, candidate rewrite/final-review seam, other narration callers, and living-world encounter boundary. Records a confirmed fail-open rejected-rewrite path and the follow-on runtime-only fix; this source trace is not a claim of passing tests or live-model validation.

## 2. Current active plan for narrative grounding

### `ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md`

This is the complete, active owner plan for:
- the retained **Phase 1 live-model behavioural validation**;
- preserving the player's information goal across follow-ups;
- finding real evidence for questions about work, contracts, quests, notices and other opportunities;
- avoiding both invented populations and artificially empty worlds;
- connecting eligible NPC encounters through canonical world systems;
- semantic candidate review, bounded repair and safe fallback;
- live-model, long-session, regression and final integration gates;
- producer/consumer maps and human testing requirements.

**Phase 1 is not passed.** The plan specifies required scenarios, not completed results. Mock tests cannot satisfy the real-provider requirement.

### Exact wording for Phase 1

Say “Phase 1 of `docs/ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md`” when referring to the live-model test gate. Do not say only “Phase 1”: older historical documents use that label for different work (CurrentSituation, StoryBeat contract, Master Plan phase work and other systems).

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
