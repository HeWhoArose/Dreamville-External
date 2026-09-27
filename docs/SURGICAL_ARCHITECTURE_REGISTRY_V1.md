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
Finish the capability and skill boundary first because Story UI, narration and OOC must consume canonical character data.

### S2 — Story runtime and player interaction
Repair resume-run routing, world/run deletion, confirmation, dice presentation, player portrait, Story/OOC/Continue interaction, and canonical skill-check presentation.

### S3 — Narration context and OOC architecture
Connect the existing WorkingContext, continuity, knowledge and canonical tools without creating a second AI authority.

### S4 — AI orchestration consolidation
Merge model routing, task contracts, context contracts and fallback rules into one active implementation path.

### S5 — Persistent multi-world
Harden universe/world/run identity, cross-world continuity, dormant-world catch-up and long-term memory.

### S6 — Spatial world
Only after the above contracts are stable, implement spatial authority, navigation, LOS, environment and tactical geometry.

### S7 — Final integration
Cross-system acceptance, regression, performance, persistence and deployment verification.

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