# Phase 8.5 Audit Pass 1 — Reconciliation Before Full Implementation

Date: 2026-09-22

## Baseline
Audited main after the existing Phase 8.5 commits. The repository already contained substantial Phase 8.5 work; this pass intentionally classified each area before adding another implementation.

## Findings

| System | Classification | Existing authority | Required action |
|---|---|---|---|
| Shared Genesis/character types | **BROKEN / REGRESSION** | `src/types.ts` | Restore existing `CapabilityDefinition`, `CharacterSkill`, `GeneratedTechnique`; preserve Phase 8.5 formula fields. |
| Capability authority | **EXISTS / MISSING CONNECTION** | `server/domain/capabilityEngine.ts` | Add authoritative `checkFormula`, `damageFormula`, `effectDefinition` fields instead of creating another capability schema. |
| Genesis custom capability | **PARTIAL / BROKEN CONNECTION** | `server/services/characterGenesisService.ts` | Normalize and attach the generated `CombatEffectDefinition` to the existing capability instead of creating a detached effect. |
| Combat action economy | **EXISTS** | `server/domain/combatActionEconomy.ts` | Reuse it. Add a thin combat-engine mapping for ACTION/BONUS_ACTION/REACTION/FREE. No duplicate ledger. |
| Single attack | **EXISTS / NEEDS REFACTOR** | `combatEngine.ts` | Preserve existing attack resolver; use effect engine as orchestrator. |
| Multi-instance | **EXISTS / PARTIAL** | `combatEngine.executeMultiAttack` | Connect action cost and event/presentation layers; extend tests. |
| Damage/defense | **EXISTS** | `combatEngine.applyCombatDamage` + `ConditionEngine` | Reuse existing defense authority; audit duplicate paths. |
| Saving throws | **EXISTS / PARTIAL** | `executeSavingThrowEffect` | Reuse; route effect action cost once. |
| Targeting | **PARTIAL** | `combatTargetingEngine.ts` | Extend geometry and deterministic random-target semantics. |
| Reactions / Ready / OA | **EXISTS / PARTIAL** | `CombatReactionEngine` + `CombatActionEconomy` + combat movement | Reuse and extend only missing generic paths. |
| Environment | **EXISTS / PARTIAL** | `combatEnvironmentEngine.ts` + combat hazards | Connect effect metadata and presentation. |
| Semantic/world effects | **PARTIAL** | `worldEffectEngine.ts` + `applySemanticOutcome` | Extend outcomes and macro-scale consequence representation. |
| Boss phases | **EXISTS / PARTIAL** | `bossPhaseEngine.ts` | Apply stored phase abilities/modifiers to combat authority; persist/replay state. |
| Combat events/replay | **EXISTS / PARTIAL** | combat effect events + combat export/import + Chronicle command layer | Expand event semantics and test replay. |
| Animation planning | **EXISTS / PARTIAL** | `combatAnimationService.ts` | Add caching and runtime presentation component; AI remains optional/fallback. |
| Visual assets | **EXISTS / PARTIAL** | `combatAssetService.ts` + MediaAdapter | Persist/reuse presentation metadata; no gameplay dependency. |
| Simulation sandbox | **EXISTS / PARTIAL** | `combatSimulationEngine.ts` | Add scenario matrix, semantic-world preview and authority diagnostics. |
| Tactical AI | **EXISTS** | `tacticalDecisionPolicy.ts` | Connect capability effect definitions and legality; no new AI combat authority. |
| Tactical Combat UI | **EXISTS / PARTIAL** | `TacticalCombatView.tsx` | Modularize advanced-effect panel, add animation layer and presentation modes. |
| Ability authoring | **EXISTS / PARTIAL** | Genesis capability authoring + service | Persist combat semantics and validate before activation. |
| Persistence | **EXISTS / PARTIAL** | combat export/import + repository snapshots | Add missing Phase 8.5 presentation/effect state only where canonical. |
| Performance | **PARTIAL** | existing pooling/limits | Bound event logs, cache animation plans/assets, avoid per-hit AI. |
| Accessibility/fast modes | **MISSING** | — | Add presentation mode selector and text/log fallback. |

## Critical regression detected
The current Phase 8.5 edits had removed several shared type declarations from `src/types.ts`. The declarations were present in the pre-Phase-8 baseline. They were restored before further integration work to avoid a repeat of the feat/type regression.

## Reconciliation rule
No new parallel authority may be created for:
- progression;
- feats;
- capability ownership;
- action economy;
- damage resistance/immunity/vulnerability;
- conditions;
- spell runtime;
- entity persistence.

Phase 8.5 must extend or connect those authorities.

## Next pass
Implement Critical authority/connectivity corrections first, then re-audit before presentation/sandbox work.
