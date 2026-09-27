# DreamBook — Persistent Multi-World & Long-Term Memory Implementation Plan
## Version 2.0 — Surgical Persistence Contract

**Status:** ACTIVE
**Scope owner:** universe identity, world/run binding, cross-world travel, portable player state, world-local state and durable memory continuity.
**Does not own:** AI routing, spatial simulation, capability rules, or player UI.

## 1. Canonical model

UNIVERSE
  ├─ persistent player identity
  ├─ portable progression/capabilities
  ├─ portable inventory
  ├─ universe memories
  └─ WORLD BINDINGS
       ├─ World A → Story Run A
       ├─ World B → Story Run B
       └─ World C → Story Run C

WorldRepository remains authoritative for world-local state.
UniverseRuntimeService owns cross-world identity and travel coordination only.

## 2. Portable state

Portable:
- player identity;
- universe actor identity;
- progression that is explicitly portable;
- learned capabilities that are explicitly portable;
- portable inventory;
- persistent player memories;
- travel history.

World-local:
- geography;
- NPC population and state;
- local relationships;
- quests and story threads;
- local chronology;
- local environmental state;
- local factions/economy;
- world-local memories;
- world-specific rules and state.

Portable state must never replace world-local state.

## 3. Existing-world return

Return flow:

Travel request
 ↓
save current canonical world
 ↓
UniverseRuntimeService resolves destination binding
 ↓
reuse existing Story Run
 ↓
restore world-local state
 ↓
apply only permitted portable player state
 ↓
activate destination run
 ↓
retrieve relevant continuity

A return to World A must not synthesize World A again.

## 4. New-world creation

New worlds continue to use the existing WorldTemplate/WorldRun and WorldSynthesis architecture.

Flow:

premise
 ↓
world synthesis
 ↓
WorldTemplate
 ↓
persistent world binding
 ↓
Story Run

This document does not redefine WorldTemplate or WorldRun schemas owned by the existing world repository.

## 5. Memory architecture

Use the existing MemoryOpportunityEngine and NarrativeContinuityEngine.

Memory layers:
- world-local durable memory;
- actor-scoped knowledge;
- universe-level player memory;
- causal/provenance evidence where required.

Memory is retrieved through relevance and epistemic authorization. The narrator is never responsible for manually remembering everything.

AI may propose a memory candidate only through the existing validation boundary:

AI candidate
 ↓
memory validation
 ↓
durable memory
 ↓
future retrieval

## 6. Narration connection

Narration consumes retrieved continuity through WorkingContextEngine and NarrativeContinuityEngine.

This document defines what must remain available; the AI Orchestration specification defines how that context is packaged for a model.

Do not duplicate the narration context builder here.

## 7. Dormant-world simulation

The current architecture supports catch-up simulation when returning to a world.

Required behavior:
1. record the last simulated universe/world time;
2. calculate elapsed time while inactive;
3. restore the existing Story Run;
4. advance dormant simulation through the existing WorldSimulationService;
5. persist resulting state;
6. apply portable player state;
7. return the player to the restored world.

This is catch-up simulation, not a continuously running off-screen server.

## 8. Future multi-scale simulation

Future resolution tiers may include:
- ACTIVE;
- NEARBY;
- DISTANT;
- OFF_SCREEN/HISTORICAL.

The spatial document owns spatial resolution. This document only defines the persistence and world-binding requirement.

## 9. Restart and persistence requirements

After process restart, the system must restore:
- universe identity;
- current world binding;
- Story Run binding;
- player identity;
- portable state;
- world-local canonical state;
- durable memories;
- relevant relationship/chronicle state.

Local container files are acceptable for development/test where already supported. Production durability remains a deployment concern and must use the project's durable persistence target.

## 10. Acceptance scenarios

### Item continuity
Acquire item → leave world → restart → return → item remains in canonical inventory.

### NPC continuity
Change relationship → leave world → spend time elsewhere → return → same NPC/world state is restored.

### Cross-world continuity
World A → World B → World A must reuse World A's existing Story Run.

### New world
Premise → WorldTemplate → Story Run → travel into world while retaining universe identity.

### Long absence
Leave World A → advance time elsewhere → return → dormant catch-up occurs without generating a new world.

## 11. Completion gate

VERIFY only after runtime tests prove:
- world binding reuse;
- player identity stability;
- portable inventory/progression correctness;
- world-local NPC continuity;
- memory persistence after restart;
- cross-world travel;
- dormant-world catch-up;
- failure-safe restoration.

Spatial, AI and capability tests remain in their owning documents.

## 12. Document boundary

This document replaces the previous broad multi-world plan as the active implementation contract. Duplicate AI orchestration, spatial simulation, capability and UI roadmaps have been removed from its scope.