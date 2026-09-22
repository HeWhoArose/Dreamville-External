# Phase 8.5 — Audit Pass 10: Macro-World Authority Connector Pass

Date: 2026-09-22
HEAD: 6c6867291bed5c2c8199b18e6ad8a4fa18bad172

## Scope

This pass re-audited the macro/world-scale gap from Pass 9. The goal was to connect WorldEffectEngine to authorities that are already present in the repository, without inventing settlement, faction, or economy engines that were not verified.

## Implemented connectors

### GeographyGraph
Added canonical patch hooks for existing geography nodes and route edges.

Supported world-effect projections can now explicitly change:
- location accessibility;
- discovered state;
- location description / ambient sensory state;
- route blocked/unblocked state and block reason.

The topology remains owned by GeographyGraph.

### StoryThread registry
World effects can update an existing canonical StoryThread by threadId, including status, stage, location, description, and evidence fields. Unknown threads are rejected during preflight.

This uses the existing StoryThread registry as the available quest/narrative-thread authority rather than creating a second quest engine.

### Planned story events
World effects can update existing planned timeline events stored by the canonical StoryRun, including status, description, location, participating actors, and planned consequences. Unknown events are rejected during preflight.

### LivingWorldSimulation
Added a canonical physiology patch hook supporting bounded set/delta mutations to hunger, thirst, fatigue, pain, stress, and morale for already registered entities.

World effects can also schedule existing LivingWorldSimulation world-event kinds such as WAR_PROGRESSION, MARKET_DAY, TOURNAMENT, and ASTRONOMICAL_SUNRISE, subject to schema validation.

### HistoricalChronicleEngine
World effects can optionally emit canonical historical evidence. Chronicle projection requires an active canonical command transaction, preserving the existing transactional Chronicle authority.

## Preflight / safety

All macro references are validated before Action/Bonus Action/Reaction consumption:
- geography nodes and edges must exist;
- story threads must exist;
- planned events must exist;
- living-world physiology records must exist;
- Chronicle evidence requires an active canonical command transaction.

This prevents malformed macro projections from consuming combat resources before rejection.

The existing canonical command snapshot/rollback machinery remains responsible for restoring state when a later staged operation fails.

## Regression coverage added

`tests/phase8_5_combat_effects.test.ts` now verifies:
- a CITY-scale world effect can project into geography, story threads, the planned timeline, living-world physiology, scheduled world events, and the Chronicle;
- unknown geography references reject before state/resource mutation.

## Deliberately not created

No new runtime authority was created for factions, settlements, populations-as-a-domain, or an economy system. Static inspection verified that these domain-specific mutation authorities were not established as reusable canonical interfaces in the examined repository surface. Their absence is therefore treated as a remaining connector gap rather than a reason to invent duplicate systems.

## Verification state

Static implementation/audit: PASS for this connector cluster.

GitHub combined status for the current HEAD: no status entries returned.
GitHub workflow lookup for the current HEAD: no workflow runs returned.

Therefore `npm test`, lint, build, and live runtime verification remain unverified on this exact HEAD.
