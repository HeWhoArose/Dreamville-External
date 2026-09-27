# DreamBook — Spatial World & Simulation Master Specification
## Version 1.0 — Pre-Implementation Architecture Contract

**Status:** DESIGN / PRE-IMPLEMENTATION  
**Source basis:** Spatial World & Simulation plan supplied for DreamBook implementation.  
**Execution rule:** No spatial implementation begins until the Phase 0 design gate passes.

---

# 1. Objective

DreamBook must eventually provide a persistent, deterministic spatial world in which:

- movement;
- visibility;
- combat;
- terrain;
- environmental effects;
- NPC behavior;
- destruction;
- world changes;

are governed by canonical simulation rather than AI invention.

The AI is a participant and planner, not the authority over physical reality.

---

# 2. Canonical Spatial Architecture

```
PLAYER
 ↓
Intent / Action Request
 ↓
Narrative / AI Interpretation
 ↓
Action Validator
 ↓
┌──────────────┬──────────────┬─────────────────┐
Spatial        Rules          Character
Authority      Authority      Authority
└──────────────┴──────────────┴─────────────────┘
 ↓
World Simulation
 ↓
Environment + Combat + Agency
 ↓
Canonical Event
 ├── Persistence
 └── AI Context → Narration / UI
```

No subsystem may create a second authority for the same fact.

---

# 3. Phase 0 — Architectural Freeze

Before spatial implementation, freeze:

## 3.1 Authority map

Ownership must be explicit for:

- world truth;
- map geometry;
- entity position;
- movement;
- collision;
- line of sight;
- navigation;
- terrain;
- environmental state;
- combat;
- damage;
- destruction;
- character knowledge;
- NPC intent;
- persistence;
- replay;
- narration.

Example:

```
LLM: "The player crosses the wall."
Spatial Authority: NO.
```

## 3.2 State transitions

Every meaningful state transition should retain:

- eventId;
- actorId;
- cause;
- source;
- before;
- after;
- world timestamp/tick;
- evidence.

## 3.3 Coordinate model

Freeze:

- world coordinates;
- local coordinates;
- map coordinates;
- screen coordinates;
- tactical coordinates;
- elevation.

Prefer one unified world-space model with projections rather than incompatible coordinate systems.

## 3.4 Units

Freeze:

- distance;
- movement;
- speed;
- range;
- area-of-effect radius;
- height;
- elevation;
- time;
- simulation tick.

---

# 4. Phase 1 — Canonical Spatial Model

A map is data, not merely an image.

Required conceptual structure:

```
WorldMap
 ├── MapId
 ├── CoordinateSystem
 ├── Bounds
 ├── Chunks
 ├── TerrainLayers
 ├── Features
 ├── Structures
 ├── WaterBodies
 ├── NavigationData
 ├── EnvironmentState
 └── SpatialEntities
```

Terrain properties may include:

- walkability;
- movementCost;
- cover;
- opacity;
- flammability;
- wetness;
- temperature;
- traction;
- elevation;
- soundModifier;
- visibilityModifier.

Spatial features may include:

- wall;
- door;
- bridge;
- tree;
- rock;
- building;
- fire;
- ice;
- river;
- cliff;
- fence;
- debris.

A wall must have machine-readable properties such as:

- position;
- geometry;
- material;
- movementBlock;
- visionBlock;
- durability;
- destructibility;
- cover.

---

# 5. Phase 2 — Watabou Adapter

Watabou is an input/generation source, not DreamBook's canonical world authority.

Architecture:

```
Watabou Output
 ↓
WatabouAdapter
 ↓
Parser
 ↓
Validator
 ↓
Normalizer
 ↓
DreamBook Spatial Schema
 ↓
Navigation / Collision / LOS Data
 ↓
Stable IDs
 ↓
Canonical Persistence
```

Support only actual export capabilities of the chosen generator.

The generated image is a rendering of canonical spatial data, not the canonical source itself.

DreamBook should remain generator-agnostic so future adapters can support:

- Watabou;
- other procedural generators;
- hand-authored maps;
- future map tools;
- AI-assisted generation.

Licensing must be reviewed before embedding or redistributing third-party source code.

---

# 6. Phase 3 — Map Rendering

Separate:

```
Canonical Map
 ↓
Renderer
 ↓
Visual Layers
```

Visual layers:

- terrain;
- water;
- roads;
- structures;
- objects;
- entities;
- effects;
- fog of war;
- selection;
- movement preview;
- combat overlays.

Rendering must never mutate canonical simulation merely because something is drawn differently.

---

# 7. Phase 4 — Exploration

Exploration actions include:

- walking;
- following roads;
- approaching buildings;
- crossing bridges;
- entering settlements;
- leaving settlements;
- discovering locations.

Movement must resolve through:

```
movement request
 ↓
navigation
 ↓
terrain
 ↓
obstacles
 ↓
distance
 ↓
travel speed
 ↓
world time
 ↓
canonical movement
```

Narration must describe the result rather than inventing travel legality.

---

# 8. Phase 5 — Navigation Authority

Navigation answers:

- Can A reach B?
- What route is possible?
- What is the route cost?
- Which terrain is crossed?
- Which obstacles block the route?

Movement capabilities may include:

- walk;
- run;
- climb;
- swim;
- fly;
- burrow;
- teleport;
- pass-through.

The result depends on canonical actor capabilities.

---

# 9. Phase 6 — LOS and Perception

Provide authoritative queries:

- canSee(A,B);
- canHear(A,B);
- hasLineOfFire(A,B);
- isHidden(A);
- isExposed(A).

The same authority should support:

- ranged attacks;
- spells;
- stealth;
- perception;
- ambushes;
- fog of war;
- NPC awareness.

One spatial authority, many consumers.

---

# 10. Phase 7 — Tactical Combat Integration

Combat actions include:

- move;
- attack;
- cast;
- defend;
- dash;
- flee;
- hide;
- interact;
- push;
- pull;
- grapple;
- destroy.

Resolution:

```
Can I do it?
 ↓
Can I reach the location?
 ↓
Do I have LOS?
 ↓
Is target in range?
 ↓
Does terrain modify it?
 ↓
Do rules allow it?
 ↓
Resolve
```

AI tactical planning may select among legal actions but cannot bypass these checks.

---

# 11. Phase 8 — Tactical Geometry

Implement machine-readable:

### Cover
- none;
- partial;
- half;
- full.

### Elevation
- ground;
- hill;
- platform;
- tower;
- rooftop;
- cliff.

### Position relationships
- adjacent;
- behind;
- above;
- below;
- flanking;
- surrounded;
- corner;
- chokepoint.

These become facts available to rules, combat, perception and tactical AI.

---

# 12. Phase 9 — Environmental Authority

Environment is simulation, not decoration.

## Fire

- ignition;
- fuel;
- spread;
- intensity;
- temperature;
- smoke;
- burn damage;
- structural damage;
- extinguishing.

## Water

- depth;
- current;
- swimming;
- drowning;
- wetness;
- flow;
- flooding.

## Ice

- thickness;
- stability;
- temperature;
- load;
- cracks;
- breakage;
- melting.

## Weather

- rain;
- wind;
- snow;
- storm;
- fog;
- temperature.

## Smoke

- visibility;
- breathing hazard;
- fire propagation.

---

# 13. Phase 10 — Materials and Destruction

Initial material categories may include:

- wood;
- stone;
- metal;
- ice;
- earth;
- magical.

Material properties may include:

- health;
- flammability;
- blastResistance;
- impactResistance;
- heatResistance;
- waterInteraction;
- collapseBehavior.

Example:

```
Fire
 ↓
Wood wall
 ↓
Structural integrity decreases
 ↓
Wall collapses
 ↓
Navigation changes
 ↓
LOS changes
 ↓
Cover changes
 ↓
Debris appears
```

All downstream changes must be canonical events.

---

# 14. Phase 11 — Environmental Interactions

Rule-driven interactions include examples such as:

- Fire + Oil → intensified fire;
- Fire + Ice → melting;
- Water + Electricity → conductive hazard;
- Water + Fire → extinguishing;
- Explosion + Wall → destruction;
- Heavy creature + Ice → structural stress;
- Wind + Fire → changed spread;
- Smoke + Character → reduced visibility.

These interactions must be represented as deterministic rules, not model inventions.

---

# 15. Phase 12 — Spatial AI Interface

Do not send a giant raw map to the LLM.

Expose controlled queries such as:

- getNearbyEntities();
- getVisibleEntities();
- checkLineOfSight();
- findPath();
- getMovementOptions();
- getCoverOptions();
- getNearbyHazards();
- getAreaTargets();
- getEscapeRoutes();
- getTerrainAround();
- getEnvironmentalState().

Example projection:

```
Target: Player
Distance: 14m
Direct path: blocked
North route: clear
South route: fire
West: ally present
East: river
Available preferred route: north
```

The AI reasons from facts; canonical systems decide what is physically possible.

---

# 16. Phase 13 — Epistemic Integration

Keep separate:

- WORLD TRUTH;
- PLAYER KNOWLEDGE;
- NPC KNOWLEDGE;
- AI CONTEXT.

Example:

```
Secret tunnel exists:
World = TRUE
Player = UNKNOWN
Bandit leader = KNOWN
```

The player must not receive hidden information simply because the model received it.

---

# 17. Phase 14 — Spatial NPC Agency

Existing Dynamic Character Agency should be extended, not replaced.

NPC decision inputs:

```
Personality
+
Motivation
+
Goal
+
Relationship
+
Beliefs
+
Knowledge
+
Agency State
+
Spatial State
+
Threat
=
NPC Intent
```

Examples:

- protect friend;
- find cover;
- escape fire;
- intercept player;
- guard entrance;
- ambush;
- retreat;
- pursue;
- investigate noise.

---

# 18. Phase 15 — Autonomous Encounters

Introduce a World/Encounter Director only after spatial authority exists.

Examples:

```
Bandits spot player
 ↓
Evaluate terrain
 ↓
Find ambush positions
 ↓
Hide
 ↓
Wait
 ↓
Perception
 ↓
Encounter
```

Or:

```
Storm
 ↓
River rises
 ↓
Bridge becomes unsafe
 ↓
Travel route changes
```

The Director may schedule or propose events but must obey canonical simulation.

---

# 19. Phase 16 — Multi-Scale World

Use:

```
CONTINENT
 ↓
REGION
 ↓
KINGDOM
 ↓
SETTLEMENT
 ↓
DISTRICT
 ↓
BUILDING
 ↓
ROOM
 ↓
TACTICAL SPACE
```

Use simulation resolution tiers:

- far away → abstract;
- nearby → moderate;
- active scene → detailed;
- active combat → maximum tactical resolution.

Never simulate an entire continent at combat resolution.

---

# 20. Phase 17 — Persistence

Spatial changes must survive reload.

Example:

```
Player burns tavern
 ↓
Canonical mutation
 ↓
Save
 ↓
Logout
 ↓
Reload
 ↓
Tavern remains burned
```

Persist stable IDs for:

- maps;
- regions;
- structures;
- terrain features;
- objects;
- doors;
- NPC positions;
- environmental effects.

Generated geometry plus canonical mutations must reconstruct the same world.

---

# 21. Phase 18 — Deterministic Replay

Record canonical spatial events such as:

- player position changed;
- NPC perception resolved;
- ambush triggered;
- attack resolved;
- fire created;
- wall damaged;
- wall destroyed;
- navigation graph updated.

A diagnostic question such as "Why did the bridge collapse?" must be answerable from evidence rather than an AI explanation.

---

# 22. Phase 19 — AI Narration

Only after simulation decides the outcome:

```
Canonical Result
 ↓
NarrativeOutcomeContext
 ↓
Narration
```

Example canonical result:

- fireball impact;
- wall damage;
- wall destroyed;
- guard exposed;
- smoke increased;
- player visibility reduced.

Narration converts those facts into prose.

---

# 23. Phase 20 — Spatial UX

Provide:

### Exploration
- map;
- player;
- nearby POIs;
- discovered locations;
- route.

### Tactical
- positions/grid;
- movement preview;
- range;
- LOS;
- cover;
- targets;
- environment.

### Inspection
- walls;
- doors;
- fire;
- rivers;
- NPCs;
- buildings;
- terrain.

### Map intelligence
- known locations;
- rumors;
- discovered paths;
- quest markers;
- faction territory.

Every display respects epistemic visibility.

---

# 24. Phase 21 — Performance

Required mechanisms:

- chunking;
- lazy loading;
- spatial indexing;
- entity culling;
- simulation levels;
- event batching;
- navigation caching;
- LOS caching;
- environment tick throttling.

Avoid frame-by-frame simulation of every entity and environmental effect.

---

# 25. Phase 22 — Diagnostics

Developer Diagnostics should eventually inspect:

- current map;
- spatial chunk;
- entity position;
- navigation;
- LOS;
- environment;
- active hazards;
- combat;
- NPC knowledge;
- NPC intent;
- world events;
- simulation tick.

Required questions:

- Why couldn't the player cross?
- Why couldn't NPC see the player?
- Why did the fire spread?
- Why did the bridge collapse?
- Why did NPC flee?
- Why couldn't the spell hit?
- Why did the route become unavailable?

---

# 26. Phase 23 — Testing

## Unit tests

Cover:

- LOS;
- pathfinding;
- movement;
- terrain;
- fire;
- ice;
- water;
- damage;
- destruction;
- cover;
- elevation;
- perception.

## Integration tests

Cover:

- movement + terrain;
- combat + LOS;
- spell + wall;
- fire + structure;
- ice + weight;
- water + movement;
- NPC + perception;
- NPC + navigation;
- environment + persistence.

## Cross-system acceptance

Example:

```
Player enters forest
 ↓
Enemy ambush
 ↓
Perception determines detection
 ↓
Combat
 ↓
Wall blocks attack
 ↓
Fire spreads
 ↓
Enemy retreats
 ↓
World persists
 ↓
Reload
 ↓
Same state
```

---

# 27. Phase 24 — Stress Testing

Deliberately test:

- 500 entities;
- 1,000 entities;
- large maps;
- many environmental effects;
- large fires;
- many NPCs;
- simultaneous combats;
- mass destruction;
- repeated pathfinding;
- long sessions.

Measure:

- CPU;
- memory;
- latency;
- simulation ticks;
- network payload;
- render cost;
- save size.

Mobile/low-end constraints remain a design requirement.

---

# 28. Phase 25 — Security / AI Containment

Verify:

- AI cannot directly mutate canonical state;
- AI cannot access hidden information without authorization;
- AI cannot move entities illegally;
- AI cannot bypass rules;
- AI cannot invent map geometry;
- AI cannot claim events occurred without canonical evidence.

---

# 29. Phase 26 — Persistence Migration

Every future spatial schema change requires:

- version;
- migration;
- validation;
- fallback.

Example:

```
SpatialState v1
 ↓
SpatialState v2
 ↓
Migration
 ↓
Validation
```

Existing campaigns must remain recoverable.

---

# 30. Phase 27 — Final Polish

Only after simulation is verified:

- map art;
- animations;
- effects;
- fire;
- smoke;
- water;
- ice;
- movement previews;
- selection;
- combat indicators;
- camera;
- zoom;
- mobile controls.

Presentation must not be allowed to drive canonical architecture.

---

# 31. Dependency Chain

```
0  Architecture freeze
↓
1  Canonical spatial model
↓
2  Watabou adapter
↓
3  Renderer
↓
4  Exploration
↓
5  Navigation
↓
6  LOS / perception
↓
7  Tactical combat
↓
8  Cover / elevation
↓
9  Environment
↓
10 Materials / destruction
↓
11 Environmental interaction
↓
12 AI spatial tools
↓
13 Epistemic integration
↓
14 NPC spatial agency
↓
15 Autonomous encounters
↓
16 Multi-scale world
↓
17 Persistence
↓
18 Replay
↓
19 Narration
↓
20 UX
↓
21 Performance
↓
22 Diagnostics
↓
23 Tests
↓
24 Stress
↓
25 Security
↓
26 Migration
↓
27 Final polish
↓
FINAL ACCEPTANCE
```

---

# 32. Pre-Implementation Gate

No spatial implementation begins until:

- requirements are complete;
- authority boundaries are complete;
- schemas are complete;
- Watabou integration strategy is settled;
- coordinate system is settled;
- navigation model is settled;
- LOS model is settled;
- environment rules are settled;
- combat integration is settled;
- NPC/agency integration is settled;
- epistemic model is settled;
- persistence model is settled;
- replay model is settled;
- performance targets are settled;
- UI contract is settled;
- test matrix is settled;
- licensing assumptions are reviewed;
- no unresolved architectural blocker remains.

---

# 33. Implementation Protocol

Every spatial phase follows:

```
AUDIT
→ IMPLEMENT
→ CONNECT
→ FALLBACK
→ TEST
→ REGRESSION
→ PERFORMANCE
→ 10× AUDIT
→ ACCEPTANCE
```

No phase is considered complete from source inspection alone.

---

# 34. Completion / Retirement Rule

Keep this document in `docs/` until the spatial system is completely implemented and accepted.

It may be archived or deleted only after:

- all phases pass;
- final architecture is documented elsewhere;
- migration notes are preserved;
- no unfinished requirement depends on it.
