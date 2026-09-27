# S3 — Narration Context & OOC Surgical Audit
**Date:** 2026-09-27  
**Repository:** `HeWhoArose/Dreamville-External`  
**Branch:** `main`

## 1. Scope

S3 hardens the existing narration/context and OOC path without creating a second AI authority or a second narration-context engine.

The canonical ownership remains:

```text
Canonical WorldRepository state
        ↓
NarrativeContinuityEngine
        ↓
WorkingContextEngine
        ↓
AI Orchestrator / task contract
        ↓
Narration presentation OR OOC response
        ↓
Canonical OOC Tool Registry (only when a supported mutation is explicitly requested)
        ↓
Canonical Command / Universe authority
```

Simulation and canonical command systems remain authoritative. AI remains a proposer/presenter. The WorkingContextEngine remains the single context-assembly authority.

## 2. Defects found

### 2.1 OOC caller identity was not enforced at the registry boundary
The route derived the active actor, but the registry itself accepted a caller-supplied actor ID without independently verifying that it matched the canonical active player.

**Risk:** another caller could attempt to use the registry with a different actor identity.

**Fix:** `OocToolRegistry.execute()` now resolves the canonical active player actor and rejects calls whose actor ID does not match.

### 2.2 OOC tool contracts were descriptive but not sufficiently validated
Tool metadata listed inputs, but required arguments were not represented or checked consistently.

**Fix:** canonical tool definitions now support `requiredInput`, and the registry rejects missing required arguments before mutation routing.

### 2.3 Raw canonical combat state was exposed through OOC
The OOC `get_combat_state` tool previously returned the raw combat engine export.

**Fix:** it now returns `projectCombatForActor()` using the repository's canonical combat-perception boundary.

### 2.4 Raw narrative research was too broad for a player-facing OOC consumer
The internal NarrativeContinuityEngine research packet includes planner state, world momentum, research evidence, causal provenance and raw relationship internals intended for the narration/GM pipeline.

**Fix:** OOC `research_context` now returns a player-authorized projection containing only:
- authorized knowledge facts
- viewer-scoped memories
- story threads
- player-facing relationship guidance
- plot summary
- explicit epistemic binding to the active actor

Internal planner/evidence/causal structures are not exposed by this OOC tool.

### 2.5 OOC tool definitions were not injected into the model context
The OOC endpoint instructed the model to use canonical tools but did not provide the registry manifest in the prompt context.

**Fix:** the endpoint now injects the exact registry manifest as a protected B1 context chunk and explicitly forbids invented tool names or schemas.

Mutation instructions are also explicit: MUTATE tools are for explicit player-requested supported state changes, not for answering questions, hypotheticals, explanations or suggestions.

### 2.6 Working context bypassed the canonical epistemic world-knowledge projection
The WorkingContextEngine directly copied detailed WorldTemplate character, faction, timeline, magic-rule and terminology structures into context.

**Fix:** detailed world lore now enters through the canonical authorized knowledge projection. The context retains only basic public world identity metadata plus authorized world facts.

## 3. Ownership and call boundaries

### WorkingContextEngine
Owns context assembly and token budgeting.

It may read canonical repository projections and NarrativeContinuityEngine research. It does not own game state, mutations, model routing or narration state.

### NarrativeContinuityEngine
Owns continuity research and plot/plan continuity.

Its internal research packet remains suitable for the narration pipeline. Player-facing consumers must use an authorized projection rather than the raw packet.

### OocToolRegistry
Owns the canonical registry of OOC-readable and OOC-mutable tool entry points.

It may:
- read player-authorized projections
- call canonical command authority for supported mutations
- invoke the existing multi-world travel authority

It may not:
- invent capabilities
- bypass canonical commands
- become an alternative persistence engine
- expose raw hidden relationship or planner state

### AI Orchestrator
Owns model selection/provider execution for the `ooc.respond` and `narrative.generate` task contracts.

It does not become canonical game authority.

## 4. Explicit non-duplication result

S3 did **not** introduce:
- a new narration context engine
- a new AI router
- a new persistence engine
- a new epistemic authority
- a new OOC state store
- a second relationship authority
- a second combat projection authority

Existing owners were reused.

## 5. Verification

A dedicated S3 audit file was added:

`tests/s3.narration-context-ooc.audit-loop.test.ts`

It performs repeated source and runtime checks for:
- active-player enforcement
- malformed OOC tool rejection
- unknown tool rejection
- player-facing relationship projection
- actor-scoped combat projection
- authorized world-lore context
- single WorkingContext/NarrativeContinuity ownership
- absence of a duplicate narration context engine

The final verification workflow for commit `b2d3ea6d2bbbf245d7b02091a636fdfc6c505138` reported:

- **Typecheck:** PASS
- **Tests:** **1002 / 1002 PASS**
- **Production build:** PASS
- **Verification workflow:** PASS
- **Second verification workflow:** PASS

## 6. Result

S3 is complete at the source and runtime level.

The architecture now has a clean distinction between:

```text
Internal narration research
        ≠
Player-facing OOC research
```

and both continue to consume the same canonical underlying systems rather than creating parallel authorities.
