# Phase 8.5 — Audit Pass 5: Post-Integration Reconciliation

Date: 2026-09-22

## Purpose

This audit was performed after the Phase 8.5 clusters that added:
- canonical combat replay;
- hit-location/body-region hooks;
- destructible environment state;
- morale/flee/surrender;
- AI animation asset delivery;
- cinematic animation tracks;
- capability-bound simulation requests.

The audit deliberately re-classifies the current repository before declaring Phase 8.5 complete. It follows the required rule:

**inspect → classify → implement/connect → test → regression → fallback → re-audit → lint/build → runtime verification**

No new subsystem is created when an existing authority already owns the responsibility.

## Current classifications

| Requirement | Classification | Finding / next action |
|---|---|---|
| CombatEffect schema | EXISTING_CONNECTED | Canonical shared schema exists and is consumed by effect resolution. |
| Single attack | EXISTING_CONNECTED | Structured capability execution is routed through the canonical effect path; legacy cast remains only for capabilities without an effect definition. |
| Multi-instance attack | EXISTING_CONNECTED | Independent instances and one outer action are canonical. |
| Per-instance targeting | EXISTING_CONNECTED | Explicit duplicate target assignments are preserved. |
| Saving throws | EXISTING_CONNECTED | D&D automatic-failure semantics were corrected and regression-tested. |
| Area / geometry | EXISTING_CONNECTED | Normalized shapes and targeting are canonical. |
| Range | EXISTING_CONNECTED | AUTO/ORIGIN/EACH_TARGET/BOTH semantics are explicit and tested. |
| LOS | EXISTING_CONNECTED / REGRESSION REQUIRED | Canonical obstacle-based LOS exists; broader matrix testing remains required. |
| Damage defenses | EXISTING_CONNECTED | Combat damage delegates to ConditionEngine-backed defense profiles. |
| Conditions/action blocking | EXISTING_CONNECTED | ConditionEngine is the authority and action legality consults it. |
| Combat condition triggers | EXISTING_CONNECTED / REGRESSION REQUIRED | Combat event trigger path exists; broad event matrix still needs repeated verification. |
| Action economy | EXISTING_CONNECTED | CombatActionEconomy remains the single ledger. |
| Reactions/Ready/OA | EXISTING_CONNECTED / REGRESSION REQUIRED | Existing authority is reused; matrix coverage remains required. |
| Environment hazards | EXISTING_CONNECTED | CombatEnvironmentEngine remains canonical. |
| Boss phases | EXISTING_CONNECTED | Phase state, modifiers, AI priority, environment IDs and persistence are connected. |
| World/semantic outcomes | EXISTING_CONNECTED / NEEDS TRANSACTION REGRESSION | Live route uses WorldEffectEngine inside staged canonical command execution. Direct service callers still need explicit regression coverage proving rollback semantics. |
| Resource/summon outcomes | EXISTING_CONNECTED | Canonical participant/resource/entity state is mutated through the effect path. |
| Semantic erase/death | EXISTING_CONNECTED | Participant and ConditionEngine death state are synchronized. |
| Macro world effects | EXISTING_NEEDS_EXTENSION | Geography node scopes are canonical; generic consequence hooks for factions/settlements remain a future connector within the same world authority. |
| Replay | EXISTING_CONNECTED / NEEDS WORLD-EFFECT COVERAGE | Dedicated replay records, persistence and API exist for combat effects. Macro world-effect replay must be explicitly regression-tested as a non-live mutation replay. |
| Hit location | EXISTING_CONNECTED | Deterministic/explicit body-region resolution is connected to damage. |
| Dismemberment/body-region destruction | EXISTING_CONNECTED | Destruction outcomes are represented in canonical attack results. |
| Destructible environment | EXISTING_CONNECTED | Destructible object state/damage is canonical and persisted. |
| Morale/flee/surrender | EXISTING_CONNECTED | Morale state is canonical, persisted and connected to deterministic tactical policy. |
| Animation planning | EXISTING_CONNECTED | AI planning is optional; deterministic fallback exists. |
| Animation sequencing | EXISTING_CONNECTED | Runtime consumes canonical instance results. |
| Cinematic composition | EXISTING_CONNECTED / NEEDS REGRESSION | Reusable bounded animation tracks now exist; runtime sequencing must be regression-tested with empty/missing/extra tracks. |
| Visual asset generation/cache | EXISTING_CONNECTED / NEEDS EFFICIENCY | Generation, provenance and cached URLs are connected; identity reuse should be tested across equivalent visual definitions. |
| Simulation sandbox | EXISTING_CONNECTED | Clone-based simulation does not mutate live combat. |
| Sandbox capability authority | EXISTING_CONNECTED / EXTENDED | API now accepts capability identity and resolves the canonical effect instead of trusting a forged client definition. Draft simulations remain possible when no capability identity is supplied. |
| Tactical AI | EXISTING_CONNECTED | Tactical policy consumes canonical effect metadata and morale state without mutating combat directly. |
| Combat UI | EXISTING_CONNECTED / NEEDS REGRESSION | Structured effects, animation tracks, sandbox and presentation modes are connected. |
| Genesis → combat | EXISTING_CONNECTED | Generated capabilities carry canonical effect definitions. |
| Entity → combat | EXISTING_CONNECTED | EntityCard remains the identity boundary; progression is not forced onto generic creatures. |
| Performance | EXISTING_NEEDS_EFFICIENCY | Replay is bounded; effect/event presentation and animation/asset queues still require explicit stress tests and bounded UI projection. |
| Accessibility | EXISTING_CONNECTED | FULL/FAST/TEXT/LOG modes consume the same canonical event stream. |

## Corrective changes made during this pass

1. Corrected the combat instance result type typo from `rill` to `roll`.
2. Added a bounded reusable `CombatAnimationTrack` schema for event-driven cinematic compositions.
3. Connected deterministic and AI-generated animation plans to bounded tracks.
4. Connected runtime animation sequencing to track timing/visual selection.
5. Added capability identity to sandbox API requests.
6. Added server-side canonical capability lookup for bound simulations so a forged client definition cannot silently replace the authoritative effect.
7. Added regression tests covering animation tracks, canonical simulation identity, and presentation-only behavior.

## Remaining verification clusters

### Cluster R1 — canonical world-effect rollback
Prove that every world/outcome failure after any partial mutation is rolled back by the canonical command transaction, including:
- environment damage;
- resource changes;
- entity lifecycle changes;
- world facts;
- active effects.

### Cluster R2 — replay matrix
Verify replay for:
- single attack;
- five-instance attack;
- save;
- area;
- chain;
- sequence;
- semantic outcome;
- world-effect preview/non-live replay.

### Cluster R3 — targeting matrix
Verify:
- origin range;
- each-target range;
- both;
- LOS;
- chain jumps;
- per-instance targets;
- empty target world effects.

### Cluster R4 — presentation fallback
Verify:
- AI unavailable;
- malformed AI plan;
- missing asset;
- invalid asset URL;
- empty tracks;
- extra tracks;
- FULL/FAST/TEXT/LOG.

### Cluster R5 — stress/performance
Verify bounded behavior for:
- 50-instance attacks;
- 100+ combat events;
- 100 replay records;
- repeated animation plan requests;
- repeated asset lookup;
- large combat logs on mobile viewport.

## Completion rule

Pass 5 is **not** the final completion declaration. The remaining clusters must be implemented/tested and followed by independent audit passes. A green static audit does not substitute for lint, build, full test execution, CI, and live runtime proof.
