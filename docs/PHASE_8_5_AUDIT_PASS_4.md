# Phase 8.5 — Audit Pass 4: Current-State Reconciliation Before Further Implementation

Audited commit: fb538e869e68d8d863fc5ef81f2c6b606fedf72f

## Audit rule

Every Phase 8.5 requirement is classified before modification:

- EXISTING_CONNECTED — already exists and is connected to the correct authority.
- EXISTING_NEEDS_COMPLETION — authoritative core exists but required semantics are incomplete.
- EXISTING_NEEDS_REWORK — code exists but can still diverge, duplicate, or bypass canonical authority.
- EXISTING_NEEDS_EFFICIENCY — functional, but cache/performance/scale hardening remains.
- MISSING_NEEDS_CREATION — no adequate implementation exists.

No duplicate subsystem should be created where an existing authoritative system can be extended.

## Current classification

| Requirement | Classification | Current finding |
|---|---|---|
| CombatEffect schema | EXISTING_CONNECTED | CombatEffectDefinition/result/event infrastructure exists. |
| Single attack | EXISTING_NEEDS_REWORK | Shared resolveAttackInstanceInternal exists, but legacy executeCapabilityCast remains a compatibility execution path that can bypass structured effect definitions. |
| Multi-instance attack | EXISTING_CONNECTED | executeMultiAttack resolves independent instances and consumes the outer action once. |
| Per-instance target assignment | EXISTING_CONNECTED | instanceTargetIds preserve duplicate target assignments through targeting and resolution. |
| Saving throw resolution | EXISTING_NEEDS_REWORK | Core resolver exists, but automatic-failure condition detection is too dependent on the first condition entry and needs robust condition-set semantics. |
| Area / geometry | EXISTING_CONNECTED | Area shapes and normalized geometry exist. |
| Target range | EXISTING_NEEDS_REWORK | Area-origin validation does not fully enforce per-target range semantics when an area origin exists. |
| Target LOS | EXISTING_CONNECTED / NEEDS REGRESSION | LOS exists and is canonical, but requires matrix regression coverage across single, area, chain, and per-instance cases. |
| Damage defense pipeline | EXISTING_CONNECTED | applyCombatDamage + ConditionEngine are authoritative. |
| Conditions / action blocking | EXISTING_CONNECTED | ConditionEngine contains blocksActions and canonical checks now route through legality. |
| Condition combat triggers | EXISTING_CONNECTED / NEEDS REGRESSION | Generic processCombatEvent path now exists and is connected to action/attack/save/move/reaction paths. |
| Action economy | EXISTING_CONNECTED | CombatActionEconomy is the action ledger. |
| Reactions / OA / Ready | EXISTING_CONNECTED / NEEDS REGRESSION | Core reaction and Ready/OA paths exist. |
| Environmental hazards | EXISTING_CONNECTED | CombatEnvironmentEngine is canonical. |
| Boss phases | EXISTING_CONNECTED | Phase state, persistence, deterministic AI priority and canonical hazard ID resolution exist. |
| World / semantic outcomes | EXISTING_NEEDS_REWORK | Canonical world effect path exists, but all live outcome resolution must consistently remain inside the transactional path and never fall back to preview semantics. |
| Semantic resource outcomes | EXISTING_CONNECTED | Participant combat resource ledger is mutated and persisted through canonical outcome path. |
| Semantic erase/death | EXISTING_CONNECTED / NEEDS REGRESSION | Participant and ConditionEngine synchronization exists. |
| Macro world effects | EXISTING_CONNECTED / NEEDS EXTENSION | Macro consequences and affected world-node IDs exist, but a general-purpose canonical consequence hook is still needed for non-geography systems such as factions/settlements/environmental destruction. |
| Replay | EXISTING_NEEDS_CREATION | Deterministic seeds/export state exist, but there is no dedicated canonical replay record/service that can replay a committed combat command/event stream end-to-end. |
| Animation planning | EXISTING_CONNECTED | Deterministic fallback + optional AI plan exists and remains presentation-only. |
| Animation sequencing | EXISTING_CONNECTED | Tactical UI consumes event results and sequences instances. |
| Visual asset generation/cache | EXISTING_CONNECTED / NEEDS EFFICIENCY | AI generation, persisted presentation references and deterministic fallback exist; cross-effect visual identity/provenance still needs explicit reusable identity semantics. |
| Simulation sandbox | EXISTING_CONNECTED | Clone-based simulation and authority diagnostics exist. |
| Sandbox source authority | EXISTING_NEEDS_COMPLETION | Sandbox validates actor availability and effect schema but does not independently prove ownership/authority of a specific capability definition when used outside capability adjudication. |
| Tactical AI | EXISTING_CONNECTED / NEEDS EXTENSION | Tactical policy is connected to canonical structured effects and boss priority; tactical option enumeration needs broader effect metadata coverage. |
| Combat UI | EXISTING_CONNECTED / NEEDS POLISH | Structured authoring, simulation, animation and event presentation are connected. |
| Genesis → combat | EXISTING_CONNECTED | Generated capabilities carry CombatEffectDefinition into runtime. |
| Entity → combat | EXISTING_CONNECTED | EntityCard is the identity boundary; generic creatures are not forced through character progression. |
| Hit-location hooks | MISSING_NEEDS_CREATION | Body regions exist in ConditionEngine, but attacks do not have a generic deterministic hit-location/effect hook. |
| Dismemberment hooks | MISSING_NEEDS_CREATION | No canonical combat outcome pipeline for body-region destruction/dismemberment exists. |
| Destructible-environment hooks | MISSING_NEEDS_CREATION | Obstacles/hazards exist, but there is no generic canonical destructible-object damage/state model. |
| Morale / flee / surrender hooks | MISSING_NEEDS_CREATION | No canonical morale state/trigger system found. |
| Cinematic combat composition | EXISTING_NEEDS_EXTENSION | Animation planning and sequencing exist, but advanced cinematic multi-stage compositions need a reusable event-driven composition schema. |
| Fast/Text/Log presentation | EXISTING_CONNECTED | CombatAnimationLayer has FULL/FAST/TEXT/LOG modes. |
| Performance safeguards | EXISTING_NEEDS_EFFICIENCY | Multi-instance limits and deterministic fallback exist; animation/event/asset pressure needs explicit bounded queues and cache policies. |

## Duplication risks for the next cluster

1. Do not add another damage resolver.
2. Do not add another condition authority.
3. Do not add another action ledger.
4. Do not add a second animation state that becomes canonical.
5. Do not make replay state separate from canonical combat event data.
6. Do not force body-region mechanics into CharacterProgressionEngine.
7. Do not treat hit-location or morale as hidden AI prose.

## Required implementation order after this audit

1. Fix per-target range semantics.
2. Fix saving-throw condition-set semantics.
3. Reconcile legacy executeCapabilityCast with structured CombatEffectDefinition authority.
4. Extend world-effect consequence contracts without duplicating WorldRepository authority.
5. Create canonical replay service using existing deterministic combat state/events.
6. Create deterministic hit-location/body-region hook.
7. Create canonical dismemberment/body-region outcome hook.
8. Create destructible environment object state using existing environment authority.
9. Create morale/flee/surrender state using existing condition/event architecture.
10. Extend cinematic animation composition using existing CombatAnimationService + CombatAnimationLayer.
11. Harden sandbox source authority and performance limits.
12. Add cross-system regression/fallback suites.

## Verification policy

Each implementation cluster must complete:

- targeted unit tests;
- regression tests for unchanged systems;
- fallback tests for AI/media failure;
- re-audit;
- lint;
- production build;
- GitHub Actions verification.

Then repeat the cycle for the next cluster.

This is Audit Pass 4. It is not a completion audit.
