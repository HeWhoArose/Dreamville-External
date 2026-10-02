# P0 — NPC Authority / Orphan Audit

Date: 2026-10-02
Branch: `audit/p0-npc-authority-hardening`
Scope: establish the authoritative NPC decision/context path before adding N13–N19 narrative presentation layers.

## Audit result

### Confirmed active authority

The current production NPC presentation/cognition path is:

```
WorldRepository
  ↓
DynamicCharacterAgencyEngine
  ↓
NpcPlanningSlice
  ↓
NarrativeDirector
  ↓
NarrativePromptBuilder / narration
```

`DynamicCharacterAgencyEngine` is the persisted canonical agency authority used by `WorldRepository`. `NpcPlanningSlice` projects addressed-NPC memories, authorized knowledge, relationship, current activity, and immediate-goal context. `NarrativeDirector` consumes the agency/profile and planning slice when constructing the ephemeral narration plan.

## Legacy candidate

`server/domain/npcAutonomyEngine.ts` exists in the repository, but this audit found no evidence in the inspected live production path that it is an active authority.

The GitHub code-search index for this repository is currently unavailable/unindexed, so repository-wide absence of references cannot be certified from the search API alone.

Therefore the engine is classified as:

**LEGACY / ORPHAN CANDIDATE — DO NOT ACTIVATE**

It is intentionally **not deleted in P0**. Deletion should only be considered after the new regression guard remains green through the full release gate and after any future repository-wide source audit confirms no historical/runtime dependency.

## Regression guard

`tests/p0_npc_authority.test.ts` recursively scans production `server/` TypeScript sources and fails if any production file other than the legacy implementation itself begins referencing `NpcAutonomyEngine` / `npcAutonomyEngine`.

It also asserts that the intended `DynamicCharacterAgencyEngine → NpcPlanningSlice → NarrativeDirector` path remains connected.

## P0 implementation boundary

P0 does not create a new NPC system, migrate data, or mutate canonical NPC state.

Its purpose is to prevent accidental duplicate NPC authority before N13 Scene Composition is implemented.
