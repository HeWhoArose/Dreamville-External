# DreamBook — AI Orchestration & Model Intelligence Implementation Plan
## Version 2.0 — Surgical Execution Contract

**Status:** ACTIVE
**Companion:** AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md
**Prerequisite:** Master Plan v3 is complete; this plan implements only the remaining orchestration consolidation.

## 1. Implementation law

Do not replace existing authorities.
Do not create parallel memory, persistence, spatial, capability or epistemic engines.
Every change follows:

AUDIT → DESIGN CHECK → IMPLEMENT → CONNECT → VALIDATE → TEST → REGRESSION → 10× AUDIT → ACCEPTANCE

## 2. Current starting point

The repository already contains provider routing, runtime telemetry, WorkingContextEngine, epistemic filtering, canonical command execution, narrative continuity, capability authority and tactical combat foundations.

Therefore the first implementation task is consolidation and verification, not greenfield orchestration.

## 3. Workstream A — TaskContractRegistry

Create one canonical registry for AI tasks.

Initial contracts:
- narrative.generate
- character.dialogue
- summary.scene
- summary.history
- summary.memory
- research.query
- research.extract
- research.qualify
- research.world-brief
- world.generate
- world.expand
- character.extract
- character.progression.infer
- rules.explain
- tactical.plan
- tactical.replan
- ooc.respond

Each task must declare schema, validator, context requirements, tools, retry and fallback policy.

## 4. Workstream B — Context adapters

Build adapters over existing authorities:
- ResearchBrief adapter;
- WorldGenerationContext adapter;
- CharacterGenerationContext adapter;
- RulesOutcomeContext adapter;
- CombatAIContext adapter;
- NarrativeOutcomeContext adapter;
- OocContext adapter.

Adapters are projections. They do not store a second copy of canonical state.

## 5. Workstream C — Narration consolidation

Narration must consume the existing WorkingContextEngine plus relevant NarrativeContinuityEngine results.

Required context categories:
- current scene;
- player state;
- active NPC/speaker;
- authorized world knowledge;
- relevant memories;
- world bible/lore;
- plot and unresolved threads;
- current plan/opportunity data where appropriate;
- recent canonical outcomes;
- relationships;
- sensory state;
- narrative/rules profile.

Relevance filtering must occur before prompt assembly. Do not blindly append every memory or world field.

## 6. Workstream D — OOC tool architecture

Replace any ad-hoc OOC mutation heuristic with a formal registry.

Tool classes may include:
- read character state;
- read character sheet;
- read inventory;
- search memory;
- read authorized lore;
- read world state;
- read combat state;
- read quests/threads;
- research context;
- canonical inventory/equipment actions;
- rest;
- time advancement;
- world travel;
- other explicitly authorized commands.

Every mutating tool must execute through CanonicalCommandEngine or the existing authoritative command path.

Never parse arbitrary natural language with regexes and mutate state directly.

## 7. Workstream E — Model intelligence

Implement `(model, task)` readiness and fallback eligibility.

Required verification:
- malformed output;
- schema-invalid output;
- timeout;
- 429;
- 5xx;
- cooldown;
- exhausted quota;
- unsupported modality;
- insufficient context;
- fallback exhaustion.

Telemetry must distinguish provider-authoritative values from observed/estimated values.

## 8. Workstream F — Tactical AI

Expose a bounded CombatAIContext from existing combat, character, agency, epistemic, spatial and environment authorities.

Implement tactical proposal and replan contracts only after the deterministic tactical systems are verified.

The AI chooses among legal options; canonical systems resolve them.

## 9. Workstream G — Acceptance

Minimum acceptance matrix:
- category isolation;
- provider fallback;
- secret filtering;
- character capability context;
- world/living-world context;
- narrative continuity retrieval;
- NPC-specific memory retrieval;
- canonical tool mutation;
- stale proposal rejection;
- no direct AI state mutation;
- runtime telemetry correctness.

## 10. Completion gate

A workstream is VERIFIED only when actual runtime evidence exists for the relevant tests.

Required final commands:
- npm test
- npm run lint
- npm run build

Plus targeted regression suites and live HTTP/UI checks where applicable.

## 11. Explicitly moved out of this document

The following are owned elsewhere:
- spatial simulation → SPATIAL_WORLD_SIMULATION_MASTER_SPEC_V1.md;
- multi-world persistence/memory → PERSISTENT_MULTIWORLD_AND_MEMORY_IMPLEMENTATION_PLAN_V1.md;
- capability/Skillbook → DREAMVILLE_CAPABILITY_AND_STORY_IMPLEMENTATION_PLAN.md;
- player interaction/UI → STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md;
- Operations workstation → OPERATIONS_MENU_AUDIT_V1.md;
- overall roadmap → Master Plan v3.

This prevents one implementation document from silently becoming a second master plan.