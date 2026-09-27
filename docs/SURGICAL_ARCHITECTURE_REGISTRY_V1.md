# DreamBook — Surgical Architecture Registry
## Version 1.0 — 2026-09-27

**Status:** ACTIVE ARCHITECTURE INDEX
**Master Plan:** DreamBook_Master_Implementation_Plan_v3.pdf — **COMPLETE / FROZEN**
**Operating mode:** SURGICAL FIXING

## 1. Purpose

The Master Implementation Plan is no longer the active work queue. It remains the master architectural baseline and must not be rewritten by the surgical documents.

The supporting documents indexed here each own a distinct concern. If two documents describe the same state, the owner listed here wins.

The governing rule remains:
> Simulation determines what happened. Narration describes what happened. AI proposes or transforms information but does not become canonical authority.

## 2. Canonical ownership map

| Concern | Owning document/system | Other documents may do |
|---|---|---|
| Overall product architecture and completed phases | Master Plan v3 | Reference only |
| AI task contracts, routing, model intelligence | AI Orchestration Model Intelligence Spec | Consume domain contracts |
| AI implementation order and verification | AI Orchestration Implementation Plan | Implement the spec |
| Player/world/cross-world persistence and memory | Persistent Multi-World & Memory Plan | Consume persistence contracts |
| Spatial geometry, navigation, LOS, environment | Spatial World Simulation Spec | Consume spatial queries |
| Skills/capabilities/world-law/progression | Capability & Story Implementation Plan | Consume capability results |
| Story UI, dice presentation, OOC/Continue, portraits, resume/delete UX | Story Runtime & Player Interaction Spec | Consume canonical state |
| Operations workbench | Operations Menu Audit | Inspect; never own gameplay state |
| Epistemic authority | Phase 11 implementation record + existing authority | Other systems consume projections |
| Provider runtime/narration routing | Phase 12 implementation record + AI Orchestration docs | Other systems consume routing services |
| 8.6–8.12 implementation evidence | Phase 8.6–8.12 audit record | Historical evidence only |

## 3. What must NOT be duplicated

Do not create a second:
- persistence engine
- migration registry
- replay engine
- epistemic authority
- chronology/chronicle authority
- AI router
- narration context engine
- NPC authority
- capability registry
- dice authority
- world repository
- diagnostics system

A supporting specification may define an adapter, projection, validator, or consumer contract, but canonical ownership remains unchanged.

## 4. Implementation order after Master Plan completion

### S0 — Damage-control baseline
1. Verify accidental changes.
2. Revert incomplete or duplicate changes.
3. Run tests, lint and build.
4. Record the clean baseline.

### S1 — Capability / Skill / Check integrity
**Status:** VERIFIED — runtime tested 2026-09-27
- 18-skill canonical registry established.
- StoryCheckAuthority established as the server-side check boundary.
- 10 source audit passes completed, plus post-regression audit pass 11.
- Full verification: 995/995 tests passed; lint/typecheck passed; production build passed.

### S2 — Story runtime and player interaction
**Status:** VERIFIED — RUNTIME TESTED 2026-09-27
- Mixed-dice 3D presentation grouping repaired without replacing the existing dice authority.
- Story/OOC/Continue, player portrait, exact Story Run resume, and destructive deletion boundaries audited.
- World-deletion active-run fallback repaired to use freshly fetched remaining Story Runs.
- 11-pass S2 audit added.
- Live API workflow verifies exact-title deletion rejection/acceptance and cascade cleanup.
- Full verification on commit `6176b9c2dd26ca79999dd24825f5419b90fa65f2`: lint, test, build, and both verification workflows passed.
- Browser-only WebGL visual inspection of the 3D dice renderer remains a client-side manual check; it is not claimed as automated.

### S3 — Narration context and OOC architecture
**Status:** VERIFIED — RUNTIME TESTED 2026-09-27
- Existing WorkingContextEngine remains the single context-assembly authority.
- NarrativeContinuityEngine research remains the internal continuity source for narration.
- Player-facing OOC research now uses an explicit authorized projection instead of raw planner/evidence/relationship internals.
- OOC tool execution enforces the canonical active-player actor and validates required arguments.
- OOC combat reads use the canonical actor-scoped combat projection.
- The OOC route injects the canonical tool registry into model context and explicitly distinguishes READ from MUTATE tool intent.
- Detailed world-bible lore is no longer copied directly into working context; it is projected through authorized world knowledge.
- Dedicated 11-pass S3 audit added.
- Final verification on commit `b2d3ea6d2bbbf245d7b02091a636fdfc6c505138`: 1002/1002 tests passed, lint/typecheck passed, production build passed, both verification workflows passed.
- Full surgical record: `docs/S3_NARRATION_CONTEXT_OOC_SURGICAL_AUDIT_2026-09-27.md`.

### S4 — AI orchestration consolidation
**Status:** VERIFIED — RUNTIME TESTED 2026-09-27

Merge model routing, task contracts, context contracts and fallback rules into one active implementation path.

- Central task-contract metadata remains owned by server/domain/aiTaskContracts.ts.
- Model/task readiness is centralized through evaluateAiTaskReadiness().
- Provider response validation and bounded fallback are enforced by MultiModelOrchestrator.
- Typed AI context adapters compose existing canonical projections; they do not replace WorkingContextEngine or NarrativeContinuityEngine.
- Full surgical record: docs/S4_AI_ORCHESTRATION_CONSOLIDATION_AUDIT_2026-09-27.md.

### S5 — Persistent multi-world
**Status:** VERIFIED — RUNTIME TESTED 2026-09-27

Harden universe/world/run identity, cross-world continuity, dormant-world catch-up and long-term memory.

- Universe bindings are normalized at the universe/repository boundary.
- Story/world deletion detaches stale universe bindings.
- Travel has a failure-safe archive rollback path.
- Existing WorldSimulationService remains the dormant-world catch-up authority.
- Full surgical record: docs/S5_PERSISTENT_MULTIWORLD_SURGICAL_AUDIT_2026-09-27.md.

### S6 — Spatial world
**Status:** VERIFIED — RUNTIME TESTED 2026-09-27

- Canonical `SpatialAuthority` added as the shared spatial-query boundary.
- Repository exposes `getSpatialAuthority(storyId)` without introducing a second repository or persistence store.
- Macro travel now consumes SpatialAuthority for route validation while WorldSimulationService remains the journey/time authority.
- Tactical combat now consumes shared spatial LOS and tactical grid movement/cost helpers.
- Geography remains part of canonical snapshots and restoration.
- Ten-pass S6 runtime audit added in `tests/spatial-world-surgical.audit-loop.test.ts`.
- Spatial ownership remains separate from rules, capability, combat resolution, epistemic authority and persistence.
- Full verification is recorded in `docs/FINAL_S1_S7_SURGICAL_10_PASS_AUDIT_2026-09-27.md`.

### S7 — Final integration
**Status:** VERIFIED — RUNTIME TESTED 2026-09-27

- Ten consecutive S1–S7 architecture passes added in `tests/final.s1-s7.surgical.audit-loop.test.ts`.
- The audit covers canonical ownership, caller boundaries, cross-system connectivity and forbidden duplicate authority paths.
- Intermediate CI failures caused by the tactical refactor were diagnosed and surgically repaired before final verification.
- The Master Plan remains unchanged and frozen.
- Final audit record: `docs/FINAL_S1_S7_SURGICAL_10_PASS_AUDIT_2026-09-27.md`.

## 5. Status vocabulary

Use only:
- PLANNED
- PARTIAL
- IMPLEMENTED — SOURCE AUDITED
- VERIFIED — RUNTIME TESTED
- FROZEN — HISTORICAL RECORD

Never turn source inspection into a runtime verification claim.

## 6. Conflict-resolution rule

When two documents disagree:
1. Prefer the canonical authority map above.
2. Prefer the document whose scope explicitly owns the disputed concern.
3. Preserve existing implemented behavior unless an audit demonstrates a defect.
4. Move duplicated requirements into the owning document.
5. Replace duplicate text with a cross-reference.
6. Do not solve documentation conflict by creating another subsystem.

## 7. Master Plan rule

The Master Plan remains unchanged.

**MASTER ROADMAP COMPLETE.**

The surgical documents describe remaining fixes, consolidation and extensions rather than redefining Master Phases 0–15.