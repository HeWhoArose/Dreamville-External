# Phase 8.5 — Audit Pass 3: Authority, State, Targeting, Presentation

Commit audited: ae6fb9e197e637d5c96999e0b590ddeb95291557

## Audit method

This pass was performed against the current main branch before the next implementation cluster. Each requirement is classified as:

- EXISTING_CONNECTED — system exists and is connected to the correct authority.
- EXISTING_NEEDS_COMPLETION — core exists but required semantics are incomplete.
- EXISTING_NEEDS_REWORK — current implementation can cause incorrect authority, duplication, or divergence.
- EXISTING_NEEDS_EFFICIENCY — implementation works but needs performance/cache hardening.
- MISSING_NEEDS_CREATION — no adequate canonical implementation exists.

No new subsystem is created where an existing authoritative subsystem can be extended.

## Current classification

| Area | Classification | Finding |
|---|---|---|
| Combat effect schema | EXISTING_CONNECTED | CombatEffectDefinition and result/event types exist in src/types.ts. |
| Single attack | EXISTING_NEEDS_REWORK | Shared attack-instance resolver exists, but some legacy capability paths still bypass it. |
| Multi-instance | EXISTING_CONNECTED | executeMultiAttack resolves independent instances and consumes one action. |
| Explicit per-instance targeting | EXISTING_CONNECTED | instanceTargetIds is now carried from effect definition through targeting validation and execution. |
| Damage defenses | EXISTING_CONNECTED | ConditionEngine/applyCombatDamage is authoritative for resistance/immunity/vulnerability. |
| Death-save damage | EXISTING_NEEDS_COMPLETION | Defense handling at zero HP was corrected in this cluster; regression coverage is still required. |
| Conditions | EXISTING_NEEDS_COMPLETION | ConditionEngine is authoritative, but blocksActions is not yet centrally enforced by combat action validation. |
| Condition triggers | EXISTING_NEEDS_COMPLETION | ON_ACTION/ON_REST/ON_TICK exist; complete combat-event trigger lifecycle is not yet wired. |
| Action economy | EXISTING_CONNECTED | CombatActionEconomy is reused; structured effect routing now calls it once. |
| Capability authority | EXISTING_CONNECTED | CapabilityEngine.adjudicate is now inside canonical structured combat execution. |
| World/outcome effects | EXISTING_NEEDS_COMPLETION | WorldEffectEngine exists, but resource outcomes currently persist metadata rather than changing the authoritative resource state. |
| Semantic erase/death | EXISTING_NEEDS_COMPLETION | EntityCard lifecycle changes exist; ConditionEngine/death-save state must remain synchronized. |
| Macro world effects | EXISTING_NEEDS_COMPLETION | Macro consequence records exist; changed scopes should include explicit requested world nodes. |
| Targeting | EXISTING_NEEDS_REWORK | Range currently validates the origin or target depending on mode; area effects need per-target range validation. |
| LOS | EXISTING_CONNECTED / NEEDS REGRESSION | LOS exists but requires regression tests across point/area/chain cases. |
| Boss phases | EXISTING_CONNECTED / NEEDS COMPLETION | Phase state, persistence, modifiers, hazards exist. String environment effect IDs still need canonical catalog resolution. |
| Environment | EXISTING_CONNECTED | CombatEnvironmentEngine is authoritative for hazard creation/removal. |
| Canonical events | EXISTING_CONNECTED | Structured combat events are persisted in TacticalCombatStateExport. |
| Replay/rollback | EXISTING_NEEDS_REWORK | Combat export/import now preserves raw participants and condition state; further end-to-end rollback/replay tests required. |
| Animation planning | EXISTING_CONNECTED | Deterministic fallback + optional AI plan exists and is presentation-only. |
| Animation sequencing | EXISTING_CONNECTED | CombatAnimationLayer sequences canonical instances without live AI. |
| Asset generation | EXISTING_CONNECTED / NEEDS EFFICIENCY | Generation/cache exists; cache identity should include visual identity rather than effect ID alone. |
| Simulation sandbox | EXISTING_CONNECTED | Simulation clones combat state and does not mutate live state. |
| Tactical AI | EXISTING_CONNECTED / NEEDS EXPANSION | Tactical policy exists; structured effect legality remains server-authoritative. |
| Combat UI | EXISTING_CONNECTED / NEEDS POLISH | TacticalCombatView routes canonical structured effects; advanced sandbox is collapsible. |
| Genesis → combat effects | EXISTING_CONNECTED | Normal extracted capabilities now receive CombatEffectDefinition. |
| Entity → combat | EXISTING_CONNECTED | EntityCard is the identity/progression boundary; generic creatures are not forced into D&D classes. |
| AI runtime dependency | EXISTING_CONNECTED | Combat itself does not require live AI; animation/asset generation has deterministic fallback. |

## Duplication risks explicitly rejected

1. Do not create a second damage resolver. Continue using TacticalCombatEngine.applyCombatDamage + ConditionEngine.
2. Do not create a second action ledger. Continue using CombatActionEconomy.
3. Do not create a second condition authority. Continue using ConditionEngine.
4. Do not make AnimationPlan canonical combat state.
5. Do not make AI-generated numbers mechanical truth.
6. Do not force EntityCard creatures into CharacterProgressionEngine unless their entity is actually authored with progression.
7. Do not implement city/planet destruction as arbitrary enormous HP damage.

## Next implementation cluster

The next cluster must complete, in order:

1. Central condition-based action blocking.
2. Authoritative semantic resource outcomes.
3. Semantic erase/death synchronization.
4. Boss environment-effect ID resolution.
5. Per-target range/LOS validation for area and multi-target effects.
6. Asset cache identity hardening.
7. Regression tests for the above before moving to optional/presentation polish.

## Required verification loop

After this cluster:

- unit tests;
- targeted integration tests;
- regression tests;
- fallback tests;
- re-audit;
- lint;
- production build;
- GitHub Actions verification.

This is Audit Pass 3 and is not the final Phase 8.5 audit.
