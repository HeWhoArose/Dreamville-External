# Dreamville Architecture Gap Closure — Phase 23

Date: 2026-10-01
Branch: audit-check-resolution-consequence

## Objective

Close the architecture gaps identified during the October 1 external comparison audit without turning the engine into a second monolithic rules interpreter.

The implementation follows:

PLAYER INPUT → INTENT → RESOLUTION GATE → CANONICAL ACTION RESOLUTION → CONSEQUENCE → COMMIT → OBJECTIVE EVENT → ACTOR MEMORY → NARRATION PROJECTION.

## Implemented closures

### 1. Typed canonical Action Resolution

A shared `ActionResolution` contract now carries player intent, attempted effect, target IDs, resolution method, outcome tier, canonical state changes, physical consequences, player-visible consequences, evidence, uncertainty, and provenance.

The narrator receives this object as authoritative mechanics context. The legacy `committedOutcome` string remains only for backward compatibility.

### 2. Resolution necessity gate

`ResolutionGate` distinguishes routine deterministic actions from materially uncertain techniques, hazardous traversal, authored challenges, capability-owned actions, and blocked inventory use.

The gate deliberately remains small and evidence-oriented rather than becoming a giant regex rules engine.

### 3. Outcome tiers

Story checks now expose explicit outcome tiers including clean success, success with cost, partial success, blocked, failure, failure with cost, and critical tiers.

Criticals are derived from the selected die so advantage/disadvantage does not silently inspect the discarded die.

### 4. Bounded intra-location spatial state

Player lifecycle state now stores coarse local proximity:

- SAME_AREA
- NEAR
- ADJACENT
- CONTACT

This is intentionally not a coordinate system. It is enough to make actions such as “move closer to Maren” persistent across turns without pretending the engine has a full 3D simulation.

The mutation is represented as `SPATIAL`, not `LOCATION`.

### 5. NPC-specific memory and planning boundary

A dedicated `NpcPlanningSlice` now isolates:

- actor identity and current activity,
- recent actor-specific memories,
- relationship state,
- authorized knowledge,
- immediate goal,
- an explicit knowledge boundary.

Private NPC planning is kept out of generic narration research. It is routed through the dedicated authorized NPC-context path.

### 6. Objective event vs subjective memory

Committed turns can now emit an immutable objective narrative-event projection.

Durable actor memories are labeled `SUBJECTIVE` and reference that objective event instead of using an arbitrary turn ID as their only provenance.

### 7. Canonical commit recovery

`CanonicalCommitLedger` records command preparation and owner phases in a repository-local operational journal.

Recovery is an explicit repository-local bootstrap/recovery operation. Interrupted entries are restored from their pre-state checkpoint and marked `ABORTED`; recovery is never silently inserted into the normal command path. The journal is deliberately excluded from `StoryRun.runtimeState`, so it cannot become a second persisted source of truth.

Cross-restart replay remains anchored by persisted `CanonicalCommandEvent.replay` checkpoints and canonical idempotency. Operational metadata is excluded from canonical replay hashes.

### 8. Working Context transparency and pins

The existing Context Inspector now exposes:
- token budget and actual usage,
- included / idle / archived sources,
- eviction metadata,
- protected sources,
- durable pins.

Pins are stored as operational metadata and cause matching context blocks to become protected without introducing a second context authority.

## Verification scope

Automated regression coverage includes:
- parkour vs ordinary movement checks,
- unsupported AI hints,
- saving-throw hazard gating,
- typed resolution prompt projection,
- local spatial persistence,
- durable recovery,
- objective/subjective memory linkage,
- NPC private-memory boundaries,
- protected working-context pins.

Full GitHub CI remains authoritative for lint, tests, build, and contract verification. Live third-party provider/model behavior and manual UI interaction are separate from source-level release verification.
