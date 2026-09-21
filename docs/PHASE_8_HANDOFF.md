# Phase 8 — Class / Subclass / Species / Feat Runtime Handoff

## Scope

Phase 8 implements canonical modular character progression for:

- Classes
- Subclasses
- Species / ancestry
- Feats
- Passive modifiers
- Triggered progression abilities
- Deterministic level progression
- Rules-profile-aware enablement
- Canonical command/event authority
- Snapshot/archive persistence
- Genesis/runtime divergence detection

## Authoritative runtime

New runtime authority:

- `server/domain/characterProgressionEngine.ts`

The engine owns module registration, actor progression state, module selection, level-up, feat acquisition, module enable/disable, triggered-ability charges/cooldowns, deterministic modifier resolution, source tracing, Genesis fingerprints, snapshot serialization, and import validation.

Runtime mutation through repository-backed engines is bound to the canonical transaction scope. Genesis/bootstrap initialization and snapshot import use explicit internal paths so rollback/restore cannot be mistaken for gameplay mutation.

## Canonical command path

New canonical command type:

- `PROGRESSION`

Supported operations include module selection, feat acquisition, level-up, module enable/disable, triggered abilities, custom module registration, and legacy capability progression mutations.

Mutation-path auditing now recognizes `progression` in canonical snapshots and event mutation tracing.

## Rules profiles

Phase 8 adds:

- `character_progression`

Full D&D enables progression.
Hybrid D&D enables progression and permits explicit overrides.
Custom Homebrew disables progression by default and requires explicit enablement; custom module authority is separately gated.

Malformed progression overrides fail closed for recognized boolean, numeric, and module-list fields.

## Persistence

Progression is persisted in:

- `runtimeState.progression`
- canonical snapshots
- campaign archives via optional `canonical/progression.json`

Older archives remain loadable because the new partition is optional. Progression imports validate module, class, subclass, species, feat, and feature references before state commit.

## Runtime integration

Resolved progression modifiers are applied to authoritative combat/spell participant projections for supported targets such as:

- ability scores
- HP maximum
- AC
- movement speed
- attack bonus
- spell attack bonus
- spell save DC

The modifier resolver produces deterministic source traces and precedence/stacking results.

## Authority hardening

Ability application now requires canonical command scope, uses deterministic effect IDs/timestamps, and no longer treats every registered capability as automatically owned.

Legacy capability mutation endpoints now delegate through the canonical `PROGRESSION` transaction path.

Player progression routes reject attempts to mutate a different actor.

Custom feat IDs are deterministic and no longer use wall-clock/random identity generation.

## Tests added

New suite:

- `tests/phase8.progression.test.ts`

Coverage includes Genesis seeding, subclass prerequisites, feat module identity, modifier stacking/precedence, triggered-ability charges, Full/Hybrid/Custom rules, malformed overrides, canonical staged level-up, idempotency, rollback, snapshot restore, archive restore, direct-mutation authority rejection, module singularity, ability authority, and Genesis/runtime divergence.

## Ten audit loops completed before full-suite handoff

1. Static source scan and rollback/import authority audit.
2. Direct mutation route audit.
3. Deterministic identity and Genesis mapping audit.
4. Rules-profile and malformed-override audit.
5. Modifier stacking and singular module-selection audit.
6. Combat/spell runtime integration and NPC fallback audit.
7. Ability ownership, canonical-scope, and deterministic-effect audit.
8. Acceptance/test-gap audit with additional authority coverage.
9. Snapshot/archive integrity and restore-reference audit.
10. Final cross-system actor-authority, restore-safety, and static consistency audit.

The ten loops explicitly checked regression risk against Phases 5–7 and canonical fallback/rollback behavior. No full `npm test` was run by the implementation pass.

## Final Gemini gate

Run the complete repository test suite and classify every failure:

```
npm test
```

Also run the normal repository verification commands used for the project (lint/typecheck/build and the Phase 5/6/7 targeted suites/liveRuntimeProof).

For each failure classify it as:

- NEW Phase 8 regression
- PRE-EXISTING baseline failure
- TEST DEFECT
- ENVIRONMENT / TOOLING FAILURE

Phase 8 is not complete until all Phase 8 targeted coverage is green, Phase 5/6/7 gates remain green, liveRuntimeProof remains green, and every full-suite failure is explicitly reconciled against the pre-Phase-8 baseline.
