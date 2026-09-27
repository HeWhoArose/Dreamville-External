# DreamBook — Persistent Multi-World & Long-Term Memory Implementation Plan
## Version 1.0 — ACTIVE

Status: **IMPLEMENTATION IN PROGRESS**

Purpose: establish the permanent architecture for a DreamBook campaign that can span multiple independent worlds/planets while preserving one player identity, durable memories, inventory/progression, world-local NPCs, world-local history, and return continuity across long absences.

## 1. Target experience

A player may exist as a universe-level traveler.

Example:

1. Arrive on World A.
2. Spend hundreds of turns there.
3. Build friendships, enemies, quests, inventory, reputation and memories.
4. Leave for World B.
5. Spend hundreds more turns there.
6. Later return to World A.
7. DreamBook restores World A's own Story Run and world-local state rather than generating a new copy.
8. NPCs and factions can react based on their persisted relationship/history.
9. The player does not need to tell the AI to save an item, relationship, event, or travel memory.

The canonical rule is:

**Game systems save state automatically. AI reads authorized saved state. AI does not act as the database.**

## 2. Architecture

```
UNIVERSE
  |
  +-- Player Identity
  |     +-- persistent character identity
  |     +-- portable progression/capabilities
  |     +-- portable inventory
  |     +-- universe memories
  |
  +-- World A
  |     +-- Story Run A
  |     +-- world-local NPCs
  |     +-- relationships
  |     +-- quests
  |     +-- chronology
  |     +-- memories
  |
  +-- World B
  |     +-- Story Run B
  |     +-- world-local state
  |
  +-- World C
        +-- Story Run C
```

WorldRepository remains authoritative for each world. UniverseRuntimeService owns only cross-world identity, travel, portable player state, and universe-level continuity.

## 3. Implemented now

### 3.1 Universe persistence

A new `UniverseCampaignState` stores:

- universeId
- title
- persistent player identity
- current world/story
- world bindings
- travel history
- universe memories
- portable player state

Universe data is included in the persistent root without requiring a persistence version bump because the persistence migration contract preserves unknown root fields.

### 3.2 Lazy universe activation

Every normal gameplay action now ensures that the active Story Run belongs to a Universe.

This is idempotent.

### 3.3 Automatic continuity capture

After a successful canonical action, DreamBook automatically records cross-world continuity information.

The player does not need to say:

- save this item;
- remember this event;
- remember that I helped this person.

The capture layer currently records:

- significant action attempts/outcomes;
- item gains;
- inventory losses;
- world travel.

Inventory changes are detected by comparing the authoritative inventory before and after the command.

### 3.4 Memory survives process restart

The Story Run persistence payload now contains the serialized MemoryOpportunityEngine state.

At startup, the repository restores those memories before normal memory retrieval begins.

This is required because a memory that only exists in process memory is not sufficient for a long-running campaign.

### 3.5 Working context

WorkingContextEngine now combines:

- current-world memories;
- universe-level player memories.

The model therefore receives the relevant memory regardless of whether it originated in the current world or another world.

### 3.6 Narrative research

NarrativeContinuityEngine research now merges:

- world-local durable memories;
- universe-level durable memories.

This means narration/research is not restricted to the current world's recent turns.

### 3.7 Cross-world travel

Canonical `WORLD_TRAVEL_REQUEST` has been added.

API and runtime support:

```
current Story Run
   |
UniverseRuntimeService.travel()
   |
save portable player state
   |
resolve existing world OR synthesize a new world
   |
reuse existing Story Run OR create one
   |
restore portable player state
   |
activate destination Story Run
```

A world can therefore be referenced by existing `worldId` or generated from a natural-language premise.

### 3.8 OOC tool access

The OOC tool registry now exposes:

`travel_to_world`

The tool may:

- travel to an existing world;
- create a new world from a premise;
- return the resulting universe/world/story information.

## 4. Portable versus world-local state

This distinction is mandatory.

### Universe-level / portable

- player identity
- persistent universe actor identity
- player inventory snapshot
- player capabilities/learned skill instances
- player progression state
- persistent player memories
- travel history

### World-local

- world geography
- NPC population
- NPC memory
- local relationships
- local faction state
- quests/threads
- world events
- local economy
- local chronology
- local environmental state
- world-specific rules

The implementation must not replace a world with the player's portable snapshot.

## 5. Long-term NPC memory

NPC continuity is split into two layers:

### NPC/world memory

The active Story Run owns NPC memories and relationships.

These are retrieved through:

- MemoryOpportunityEngine
- DynamicCharacterAgencyEngine
- NarrativeContinuityEngine
- WorkingContextEngine

### Universe memory

The player retains important cross-world memories, such as:

- people helped;
- major discoveries;
- important items;
- places visited;
- world travel;
- significant causal events.

This prevents universe travel from destroying the player's personal history.

## 6. Automatic state ownership

The canonical systems remain authoritative.

```
PLAYER ACTION
   |
Canonical Command Engine
   |
Canonical state mutation
   |
+-------------------------+
| Inventory               |
| Character               |
| Capability              |
| Progression             |
| Relationships            |
| World / NPC state       |
| Chronicle / events      |
+-------------------------+
   |
Automatic continuity capture
   |
Memory / narrative projections
   |
AI working context
   |
Narration
```

The AI must not be responsible for deciding that an item was acquired merely because it narrated receiving one.

## 7. Memory priority

Persistent memories use the existing MemoryOpportunityEngine model.

Important memory classes include:

- PERSISTENT_IDENTITY
- EPISODIC
- ATOMIC_FACT
- CAUSAL
- CAPABILITY
- SOURCE_CANON

Persistent-critical memories are protected from ordinary decay.

Universe memories currently have a bounded campaign store and should be promoted to persistent-critical only when they represent facts the player must reliably retain.

## 8. Existing-world return

When the player revisits a world:

1. UniverseRuntimeService finds the world binding.
2. The previously created Story Run is reused.
3. The world-local Story Run is restored.
4. Portable player state is applied.
5. Universe history remains available.
6. Working context retrieves relevant memories.
7. NPC/relationship state is read from the restored world.

The system therefore does not intentionally generate a fresh world copy each time.

## 9. New-world generation

A new world may be created from:

- a direct worldId;
- a natural-language premise.

The world synthesis pipeline remains authoritative for world generation. The generated world is saved as a persistent WorldTemplate and receives a persistent Story Run when the player enters it.

## 10. Remaining implementation phases

### Phase A — Cross-world action UX
Provide player-facing world travel UI, destination picker, generated-world confirmation, and seamless active-story switching.

### Phase B — Autonomous dormant-world simulation

**Initial catch-up implementation: ACTIVE**

UniverseRuntimeService now maintains a universe-level elapsed-time counter and records the last simulated universe time for each world binding.

When the player returns to an existing world:

1. DreamBook calculates how much universe time elapsed while that world was inactive.
2. The existing Story Run is restored.
3. WorldSimulationService advances the dormant world by that elapsed duration.
4. The resulting world state is persisted.
5. Portable player state is then rehydrated.

This establishes the core return-after-long-absence behavior without regenerating the world.

```
World A active
   |
leave
   |
World B advances
   |
universe elapsed time increases
   |
return World A
   |
elapsed gap calculated
   |
WorldSimulationService catches World A up
   |
same Story Run continues
```

The current implementation is a **catch-up simulation**, not yet a continuously running off-screen universe server.

### Phase C — Long absence / multi-scale simulation

Use:

- ACTIVE simulation near the player;
- NEARBY simulation;
- DISTANT strategic simulation;
- OFF_SCREEN / historical simulation.

Do not simulate every NPC every frame.

### Phase D — Generational simulation

For literal decades/generations:

- aging;
- births;
- deaths;
- succession;
- family trees;
- faction leadership changes;
- settlement evolution;
- inheritance;
- historical eras.

This is **not yet complete** and must not be claimed as implemented merely because persistence and time exist.

### Phase E — Production durable storage

The current repository persists to the existing PersistentGameStore.

For production-scale campaigns, the final deployment should move canonical campaign/universe state to durable external storage rather than relying exclusively on container-local files.

## 11. Narration contract

Narration must receive authoritative continuity context.

The AI should be able to retrieve:

- current scene;
- current world time;
- character state;
- inventory;
- relationships;
- relevant local memory;
- relevant universe memory;
- quests;
- unresolved threads;
- world momentum;
- canonical consequences.

The AI should not be told to "remember everything."

The memory/query systems should decide what relevant saved information to provide.

## 12. Required acceptance scenarios

### Scenario 1 — Item persistence

```
Player finds ancient ring
 ↓
Canonical inventory receives ring
 ↓
Automatic continuity capture records acquisition
 ↓
Narration describes acquisition
 ↓
No player instruction to save is required
 ↓
Restart
 ↓
Ring remains in canonical inventory
```

### Scenario 2 — NPC return

```
Player meets Sarah on World A
 ↓
Relationship changes
 ↓
Important memory is stored
 ↓
Leave World A
 ↓
Spend hundreds of turns elsewhere
 ↓
Return to World A
 ↓
Same Story Run
 ↓
Sarah's canonical relationship/memory state is retrieved
 ↓
Narration can reference the prior relationship when relevant
```

### Scenario 3 — New world

```
Player requests a new world
 ↓
UniverseRuntimeService
 ↓
World synthesis
 ↓
WorldTemplate persisted
 ↓
Story Run created
 ↓
Player enters new world
 ↓
Universe identity retained
```

### Scenario 4 — Return to old world

```
World A → World B → World A
 ↓
World A Story Run ID is reused
 ↓
World B has its own Story Run
 ↓
Player portable state is restored
 ↓
World A history remains intact
```

## 13. Acceptance rule

The multi-world system is not final until:

- world travel works;
- generated worlds persist;
- existing worlds reuse their Story Run;
- player identity remains stable;
- inventory remains correct;
- skills/progression remain correct;
- world-local NPC memory remains correct;
- universe memory survives restart;
- WorkingContext retrieves old relevant memories;
- Narration can use retrieved continuity;
- dormant-world simulation works;
- long-absence stress tests pass;
- production durable storage is validated.

## 14. Architectural rule for future AI sessions

Before modifying this system:

1. Read this document.
2. Read `docs/AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md`.
3. Read `docs/AI_ORCHESTRATION_IMPLEMENTATION_PLAN_V1.md`.
4. Read `docs/SPATIAL_WORLD_SIMULATION_MASTER_SPEC_V1.md`.
5. Audit current UniverseRuntimeService, WorldRepository, MemoryOpportunityEngine, WorkingContextEngine and NarrativeContinuityEngine.
6. Never replace canonical world state with AI-generated prose.
7. Never require the player to manually instruct the system to save canonical consequences.
8. Preserve world-local state when the player travels away.
9. Preserve universe-level player identity across worlds.
10. Do not call the architecture complete until long-absence and restart tests pass.
