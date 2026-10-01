# Dreamville Architecture Closure — Phase 23

Date: 2026-10-01

## Objective

Close the architectural gaps identified by the 2026-10-01 external architecture audit without replacing Dreamville's canonical state authority with a second narrative interpreter.

The closure principle is:

PLAYER INPUT → INTENT → RESOLUTION GATE → CANONICAL ACTION RESOLUTION → RESEARCH / PLAN → NARRATION → REVIEW → CANONICAL COMMIT → OBJECTIVE EVENT → ACTOR MEMORY / CONTEXT

## Implemented closures

| Gap | Closure |
|---|---|
| Narrator received a flat committed-outcome string | Added typed `ActionResolution` contract with intent, attempted effect, targets, method, outcome tier, actual effect, canonical state changes, physical/player-visible consequences, evidence, uncertainty, provenance, and optional check data. |
| Check necessity was too lexical | Added `ResolutionGate`; routine safe actions remain deterministic, environmental hazards can trigger saves, explicit techniques can trigger checks, and force actions require explicit scene resistance unless an authored challenge applies. |
| Outcome was mostly binary | Added explicit outcome tiers and authored tier overrides: clean success, cost, partial, blocked, failure, and critical tiers. |
| Intra-location movement was narrative-only | Added bounded `LocalSpatialState` with coarse proximity bands and focus target; no fake 3D coordinates are introduced. |
| Addressed NPC memory/planning was mixed into general world research | Added actor-specific `NpcPlanningSlice` containing addressed-NPC memories, authorized knowledge, relationship, current activity, and immediate-goal boundary. |
| Objective and subjective memory were conflated | Added immutable objective canonical narrative event records and marked durable narrative memories as `SUBJECTIVE`, with `sourceEventId` pointing to the objective event record. |
| Canonical transaction recovery was not explicit | Added a repository-local `CanonicalCommitLedger` with owner phases, pre-state checkpoint, recovery policy, and interrupted-command restoration. It is deliberately excluded from persisted StoryRun state to prevent concurrent runtime journals from becoming a second shared source of truth; canonical replay checkpoints remain the durable cross-restart mechanism. |
| Working context was opaque | Exposed included/idle/archived/evicted context blocks, token budget, provenance, and durable player pins through a safe projection and API endpoints. |
| Context was at risk of becoming a second source of truth | Pins only modify context protection metadata; canonical world state remains owned by `WorldRepository` and canonical command systems. |

## Producer → contract → consumer audit

### Action resolution

Producer: `ServerMockAuthority.processCustomAction`

Contract: `ActionResolution`

Consumers:
- `MultiModelOrchestrator.generateNarrativeOnly`
- `NarrativePromptBuilder`
- action history / continuity projection

The narrator receives the structured resolution as authoritative mechanics. The legacy string outcome remains only as backward-compatible context.

### Spatial state

Producer: canonical freeform action resolution

Contract: `PlayerLifecycleState.localSpatialState`

Consumers:
- `CurrentSituationBuilder`
- narration context
- external player-safe state

Location changes still require canonical location commands. Proximity changes use a separate `SPATIAL` state-change kind.

### NPC planning

Producer: addressed-entity detection in `NarrativeContinuityEngine`

Contract: `NpcPlanningSlice`

Consumers:
- `NarrativeResearchPipeline`
- narrative context

The slice cannot substitute player knowledge for NPC knowledge.

### Memory provenance

Producer: canonical command event

Contract: `CanonicalNarrativeEventRecord`

Consumer:
- `NarrativeMemoryLifecycle`

Subjective memories reference the objective event identity instead of treating the turn text itself as objective world evidence.

### Recovery ledger

Producer: `CanonicalCommandEngine`

Contract: `CanonicalCommitLedgerEntry`

Recovery owner phases:
1. handler
2. custom rules
3. canonical state
4. canonical event

An interrupted entry in the same repository runtime is restored from its pre-state checkpoint and marked ABORTED rather than silently resumed from a partially mutated world. Cross-restart canonical replay remains anchored by the persisted canonical event replay checkpoint.

## Regression coverage

Phase 23 tests cover:

- no check for ordinary safe movement;
- no check for ordinary push without resistance;
- check candidate for parkour/technique;
- check candidate for physical force against explicit resistance;
- authored partial-success outcome tier;
- bounded local spatial persistence without changing location;
- addressed-NPC actor-scoped memory slice;
- interrupted canonical command recovery;
- structured ActionResolution reaching the narration prompt.

Existing Phase 18 integration coverage continues to verify that check justification and bounded consequences reach narration.

## Verification gate

The Phase 23 changes do not alter the test runner's established file-level isolation model; the release suite remains the existing `npm test` contract.


Required before merge to `main`:

- `npm run verify:contracts`
- `npm run lint`
- `npm test`
- `npm run build`
- branch-level release gate green
- main post-merge release gate green
- manual live provider/UI scenarios tracked separately from automated source/CI verification

## Residual boundary

This phase deliberately does not add:
- full intra-location 3D simulation;
- arbitrary autonomous NPC goal generation;
- a second large regex-based semantic interpreter;
- direct mutation from narration;
- a new memory database separate from canonical repository state.

Those would weaken the architecture rather than close a real authority gap.

## Audit conclusion

The new systems are additive authority boundaries:

- ResolutionGate decides whether mechanics are necessary.
- StoryCheckEngine resolves mechanics.
- ActionResolution freezes the authoritative result.
- Narration projects the frozen result.
- Canonical commands own durable state.
- Objective event records own world history.
- Actor memories remain perspective-bound.
- Working context remains a derived, budgeted projection.

No narrative model is authorized to invent a roll, mechanic, canonical state mutation, hidden fact, relocation, or actor knowledge merely because prose makes it sound plausible.
