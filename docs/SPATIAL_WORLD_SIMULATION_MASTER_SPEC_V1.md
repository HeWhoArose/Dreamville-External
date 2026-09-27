# DreamBook — Spatial World Simulation Specification
## Version 2.0 — Surgical Spatial Authority Contract

**Status:** VERIFIED — IMPLEMENTED / RUNTIME AUDITED 2026-09-27
**Scope owner:** spatial geometry, movement, navigation, line of sight, perception inputs, terrain, cover, elevation and environmental simulation.
**Does not own:** persistence/migration, AI routing, epistemic authority, capability ownership, narration or overall roadmap.

## 1. Objective

Create a persistent deterministic spatial layer in which physical facts are resolved by canonical simulation rather than AI invention.

AI is a consumer of spatial projections, not the spatial authority.

## 1A. Implemented connection points

The current implementation is connected through these canonical boundaries:

- `WorldRepository.getSpatialAuthority(storyId)` exposes the shared spatial query authority.
- `WorldSimulationService.startPlayerTravel()` consumes SpatialAuthority for macro route validation.
- `TacticalCombatEngine` consumes shared spatial line-of-sight, tactical grid path and tactical movement-cost helpers while retaining combat-resolution ownership.
- `canonicalSnapshot.ts` already persists and restores geography as canonical spatial state.
- `WorkingContextEngine` and player-facing projections continue to enforce epistemic filtering outside the spatial authority.

These adapters do not create a second persistence store, second world repository, or second combat authority.

## 2. Authority boundary

Spatial Authority owns:
- map geometry;
- coordinates;
- entity spatial position;
- collision/blocking;
- movement legality from a spatial perspective;
- navigation/path cost;
- line of sight;
- line of fire;
- cover;
- elevation;
- terrain state;
- spatial hazards;
- environmental spatial effects;
- structure/material spatial state where explicitly implemented.

Rules Authority owns mechanical interpretation.
Character/Capability Authority owns what an actor is capable of doing.
Combat Authority owns combat resolution.
Epistemic Authority owns who is allowed to know a spatial fact.
Persistence Authority stores the canonical spatial state.

## 3. Canonical pipeline

PLAYER/NPC INTENT
 ↓
ACTION VALIDATION
 ↓
Spatial query
 ↓
Rules + Character/Capability checks
 ↓
Canonical resolution
 ↓
Spatial state mutation
 ↓
Canonical event
 ↓
Chronicle / persistence / narration projections

## 4. Spatial data model

Minimum stable identifiers:
- worldId;
- mapId;
- regionId;
- locationId;
- structureId;
- roomId;
- spatialEntityId;
- terrainCellId where grid representation is used.

Representations must support both authored and procedurally generated layouts.

Coordinate representation must be chosen once and documented before implementation. No subsystem may invent its own coordinate convention.

## 5. Map generation adapters

External generators such as Watabou are input providers, not authorities.

Correct boundary:

Generator output
 ↓
Importer/normalizer
 ↓
DreamBook Spatial Model
 ↓
DreamBook Spatial Authority

Hand-authored maps and future generators must be able to use the same canonical model.

Any third-party source/license assumption must be verified before embedding source code. Generated output and generator source licensing are separate questions.

## 6. Movement

Movement resolves through:

movement request
 ↓
navigation
 ↓
terrain
 ↓
blocking/obstacles
 ↓
actor movement capability
 ↓
distance/cost
 ↓
world time
 ↓
canonical movement

Movement must produce a canonical event and must be replayable through the existing event/replay architecture.

## 7. Navigation

Navigation answers:
- can A reach B?
- what route is available?
- what is the route cost?
- what terrain is crossed?
- what obstacle blocks the route?
- what capability is required?

Movement modes may include walk, run, climb, swim, fly, burrow, teleport or pass-through only when supported by canonical capability/rules systems.

## 8. LOS and perception inputs

Authoritative queries include:
- canSee(A,B);
- canHear(A,B);
- hasLineOfFire(A,B);
- isHidden(A);
- isExposed(A).

These queries are reusable by combat, spells, stealth, perception, ambushes and NPC awareness.

The spatial system supplies physical facts; epistemic authority decides whether those facts enter an actor's knowledge projection.

## 9. Tactical geometry

Support machine-readable:
- cover;
- elevation;
- adjacency;
- behind/above/below relationships;
- flanking;
- surrounded state;
- corners;
- chokepoints;
- route exposure.

Do not build a separate tactical geometry engine inside combat.

## 10. Environment

Environmental simulation may cover:
- fire;
- water;
- ice;
- weather;
- smoke;
- temperature;
- wind;
- structural integrity;
- material interactions.

Environmental outcomes must be deterministic and expressed as canonical events.

Example:

Fire → wood structure → integrity decreases → collapse → navigation changes → LOS changes → cover changes.

## 11. Materials and destruction

Initial material categories may include wood, stone, metal, ice, earth and magical materials.

Properties may include:
- health;
- flammability;
- blast resistance;
- impact resistance;
- heat resistance;
- water interaction;
- collapse behavior.

Material rules must be implemented through the existing rules/effect architecture rather than a second rules engine.

## 12. Environmental interactions

Examples:
- fire + oil;
- fire + ice;
- water + electricity;
- water + fire;
- explosion + wall;
- weight + unstable ice;
- wind + fire;
- smoke + visibility.

These are deterministic rules. AI may describe or propose an interaction only where the rules system permits it.

## 13. AI spatial interface

AI receives controlled queries/projections such as:
- nearby entities;
- visible entities;
- line of sight;
- route options;
- movement options;
- cover options;
- hazards;
- area targets;
- escape routes;
- terrain around an actor;
- environmental state.

Do not send unrestricted raw map state merely because the model can accept it.

Example projection:

Target: Player
Distance: 14m
Direct route: blocked
North: clear
South: fire
East: river
West: ally

The AI reasons from the projection; spatial authority determines the actual result.

## 14. Combat integration

Combat may ask spatial authority for:
- range;
- LOS;
- cover;
- movement;
- target reachability;
- terrain modifiers;
- hazards;
- structure state.

Combat authority remains responsible for combat resolution.

## 15. Capability integration

Spatial authority may report a physical constraint, such as a blocked route or missing climb surface.

CapabilityEngine determines whether an actor possesses a capability such as flight, climbing or teleportation.

Do not duplicate capability ownership in spatial state.

## 16. NPC integration

Dynamic Character Agency remains the owner of goals, motivations, relationships and agency state.

Spatial authority contributes:
- where the NPC is;
- what it can physically perceive;
- where it can move;
- cover/hazards/routes.

Together they produce the inputs for NPC decision-making.

## 17. Epistemic integration

Keep separate:
- WORLD TRUTH;
- PLAYER KNOWLEDGE;
- NPC KNOWLEDGE;
- AI CONTEXT.

Spatial Authority does not decide who knows something.

## 18. Persistence boundary

Spatial state is persisted through the existing world/persistence architecture.

Persist stable spatial identifiers and canonical mutations, but do not create a SpatialPersistenceEngine or SpatialMigrationEngine.

Migration belongs to the existing migration registry.
Replay belongs to the existing canonical event/replay system.

## 19. Diagnostics boundary

Spatial diagnostics are projections of the existing Developer Diagnostics system.

Required questions:
- Why could the player not cross?
- Why could an NPC not see the player?
- Why did a route become unavailable?
- Why did a structure collapse?
- Why did a hazard spread?

Do not create a second diagnostics workstation.

## 20. Performance

Required mechanisms may include:
- chunking;
- lazy loading;
- spatial indexing;
- entity culling;
- simulation resolution tiers;
- event batching;
- navigation caching;
- LOS caching;
- environment tick throttling.

Long-range world simulation must not run every entity at tactical resolution.

## 21. Implementation order

SP-0 Architecture freeze
↓
SP-1 Canonical spatial model
↓
SP-2 Map importer/adapter
↓
SP-3 Rendering projection
↓
SP-4 Movement
↓
SP-5 Navigation
↓
SP-6 LOS/perception queries
↓
SP-7 Tactical geometry
↓
SP-8 Environment
↓
SP-9 Materials/destruction
↓
SP-10 AI spatial projections
↓
SP-11 Combat/NPC integration
↓
SP-12 Persistence/replay integration
↓
SP-13 Diagnostics
↓
SP-14 Performance/stress
↓
SP-15 Acceptance

## 22. Acceptance

Acceptance must prove:
- movement correctness;
- route correctness;
- LOS correctness;
- terrain/cover/elevation correctness;
- environment correctness;
- combat integration;
- NPC integration;
- epistemic filtering;
- persistence after restart;
- deterministic replay;
- performance under representative loads.

Runtime test evidence is required before VERIFIED status.

## 23. Document boundary

This document no longer contains separate roadmaps for AI orchestration, persistence, migration, epistemics, narration, diagnostics or the Master Plan. Those concerns are consumed through the existing authorities and the Surgical Architecture Registry.