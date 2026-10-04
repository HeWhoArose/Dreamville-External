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

## Legacy candidate (re-verified 2026-10-03, system-wide audit)

`server/domain/npcAutonomyEngine.ts` is classified as:

**PARTIALLY ACTIVE — ADVISORY / DORMANT. NOT A CANONICAL AUTHORITY. DO NOT ACTIVATE.**

Repository-wide source verification found exactly two production references:

1. `server/domain/combatTacticsService.ts` — **advisory only.** It builds a transient
   `NpcAgentState` from the canonical `DynamicCharacterAgencyEngine` (goals, beliefs,
   risk tolerance) and attaches the resulting utility ranking to the AI tactics prompt
   as `npcAutonomy` metadata. It never persists `NpcAgentState` and never issues a
   canonical NPC decision; the turn remains deterministic-proposal → AI-proposal →
   combat-engine validation.
2. `server/domain/phase8SimulationEngine.ts` — **dormant.** `resolveNpcDecision` reads
   `runtimeState.phase8.npcs`, which has no production writer, and its only trigger
   (`NPC_DECISION_REQUESTED`) is never emitted — the canonical command engine only
   forwards `CANONICAL_COMMAND` events. Both are exercised exclusively by tests
   (`phase8.6-8.12.integration`, `phase11.epistemic-authority`), which inject state
   manually.

Neither reference constitutes a second NPC truth system, so the live authority path
remains singular (`DynamicCharacterAgencyEngine → NpcPlanningSlice → NarrativeDirector`).

It is intentionally **not deleted**. Deletion should only be considered after the
regression guard remains green through the full release gate.

## Historical note on the original P0 guard

The original guard test passed vacuously: its file-scanner regex (`/\\.(ts|tsx)$/`)
matched no filenames, so zero production files were scanned and the assertion always
succeeded. The 2026-10-03 system-wide audit repaired the scanner, pinned the two
verified references behind a documented allowlist, and added guard-the-guard
assertions (minimum scanned-file count, phase8 dormancy checks).

## Regression guard

`tests/p0_npc_authority.test.ts` recursively scans production `server/` TypeScript sources and fails if any production file other than the legacy implementation itself begins referencing `NpcAutonomyEngine` / `npcAutonomyEngine`.

It also asserts that the intended `DynamicCharacterAgencyEngine → NpcPlanningSlice → NarrativeDirector` path remains connected.

## P0 implementation boundary

P0 does not create a new NPC system, migrate data, or mutate canonical NPC state.

Its purpose is to prevent accidental duplicate NPC authority before N13 Scene Composition is implemented.
