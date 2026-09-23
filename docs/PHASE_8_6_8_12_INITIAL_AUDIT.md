# Phase 8.6–8.12 Initial Audit — 2026-09-23

## Audit rule

Before implementing any phase, classify the required system as:
EXISTS / CONNECTED / PARTIAL / BROKEN / INEFFICIENT / DUPLICATED / MISSING.

No duplicate authority is created where an existing canonical subsystem can own the state.

## Current checkpoint

### Phase 8.5
Major combat/effects/collision/animation/sandbox work is already implemented on main. Forced movement, collision, secondary impact damage, replay, animation and sandbox connectors exist in repository history. Runtime verification of the current post-8.6 HEAD is still external.

### Phase 8.6 — Universal Custom Rules & World Laws
- Contracts: EXISTS.
- CustomRuleEngine: EXISTS and CONNECTED to canonical commands.
- Deterministic trigger/priority/condition evaluation: EXISTS.
- Transaction rollback: EXISTS.
- Persistent rule state: EXISTS.
- Ruleset compatibility context: PARTIAL.
- Relationship / knowledge / item / location / time condition sources: MISSING.
- Universal effect vocabulary (missions, knowledge, relationships, entities, movement, resource changes, evidence, scheduling): PARTIAL.
- Event bridge for domain-specific triggers: PARTIAL.
- Dedicated authoring/inspection UI: MISSING.
Classification: PARTIAL; continue from current implementation.

### Phase 8.7 — World / Location / Facility Simulation
- GeographyGraph: EXISTS.
- Hidden/discovered location projection: EXISTS.
- LivingWorldSimulation: EXISTS.
- Sensory system: EXISTS.
- Facility/room/security/power/camera/sensor/lock/trap/alarm authority: MISSING.
Classification: FOUNDATION EXISTS; new facility simulation authority required.

### Phase 8.8 — NPC Goals / Intent / Deception
- EntityCard/personality/progression: EXISTS.
- MemoryOpportunityEngine: EXISTS.
- Tactical Decision Policy: EXISTS for combat.
- Autonomous persistent goals/private motives/beliefs/plans/deception: MISSING.
Classification: MISSING core agent-authority layer.

### Phase 8.9 — Dynamic Mission / Situation
- StoryDirectorService: EXISTS but scripted-trigger/beat oriented.
- StoryThread: EXISTS.
- Planned timeline events: EXISTS.
- General situation state, objectives, hidden objectives, prerequisites, dynamic outcomes, branching/continuation: MISSING.
Classification: PARTIAL foundation; requires dedicated situation authority.

### Phase 8.10 — Knowledge / Investigation / Epistemic
- Epistemic layers and sanitized projection: EXISTS.
- HistoricalEvidence visibility: EXISTS.
- Durable memories/opportunity retrieval: EXISTS.
- First-class per-actor knowledge claims, acquisition, belief state, attribution and investigation resolution: MISSING.
Classification: PARTIAL foundation; requires dedicated knowledge authority.

### Phase 8.11 — Causal History / Provenance Graph
- HistoricalEvidence, Chronicle, Dossiers and provenance strings: EXISTS.
- Rebuildable Chronicle from evidence: EXISTS.
- First-class causal nodes/edges, chain-of-custody, copies/derivations, attribution graph: MISSING.
Classification: PARTIAL foundation; requires dedicated causal graph authority.

### Phase 8.12 — Persistent Consequences / Dossiers / Relationships
- NpcDossier and CharacterDossier UI: EXISTS.
- Historical significance promotion: EXISTS.
- Persistent relationship graph, reputation mutations, evidence-driven belief/goal changes, causal consequence engine: MISSING.
Classification: PARTIAL foundation; requires dedicated relationship/consequence authority.

## Cross-phase connector rule

All new engines must persist in StoryRun.runtimeState or existing canonical stores, be snapshot-compatible, operate behind CanonicalCommandEngine transactions, and never become a second source of truth for Chronicle, Geography, Combat, Progression, or Conditions.

## Implementation order

8.6 completion → 8.7 facility → 8.8 NPC autonomy → 8.9 situations → 8.10 knowledge → 8.11 causal graph → 8.12 consequences/relationships.

Every phase receives repeated audit, regression, fallback, authority and connector review before moving to the next phase. Runtime npm execution is intentionally deferred to the external AI Studio verification pass.


## Implementation checkpoint — 2026-09-23

The initial PARTIAL/MISSING classifications above have now been advanced through the first implementation pass without replacing existing canonical authorities.

### Implemented connectors
- 8.6: universal condition/effect vocabulary expanded; relationship, knowledge, item, location-state, time and domain condition sources connected to Phase 8 runtime state; ruleset compatibility context added.
- 8.7: facility authority added for rooms, corridors, entrances/exits/vents/elevators/hidden areas, cameras, sensors, locks/doors/traps/terminals, security zones, power and communications; hidden-device search preserves canonical existence on failure.
- 8.8: persistent NPC goal/belief/plan/deception state and deterministic decision selection added.
- 8.9: dynamic Situation authority added with public/hidden objectives, participants, preconditions, outcomes, transformation and continuation history.
- 8.10: per-actor knowledge authority added with explicit acquisition success/failure, confidence and evidence linkage.
- 8.11: causal graph added with custody/copy/derivation/use/cause/discovery/attribution relations and forward/backward tracing.
- 8.12: relationship/consequence authority added with bounded relationship deltas and evidence linkage; relationship mutations are also recorded into the existing HistoricalChronicleEngine evidence layer.
- Cross-phase runtime state is persisted under StoryRun.runtimeState.phase8 and consumed from CanonicalCommandEngine's canonical event path.
- Universal rule effects for missions, evidence, relationships, knowledge, movement/entity metadata and scheduling are routed through the Phase 8 coordinator. World-fact mutation is routed through WorldRepository. Damage/resource effects are routed to the existing CombatEngine authority and reject when no active combat participant exists rather than silently mutating unrelated state.
- Regression/fallback integration tests were added for hidden-state preservation, failed knowledge acquisition, dynamic mission transformation, causal copies, relationship bounds and cross-system persistence.

### Repeated audit result
Ten post-implementation audit passes were performed over source connectivity, authority boundaries, rollback hooks, rule vocabulary, fallback/regression coverage, persistence, chronicle connection and combat/resource routing. The audit checks passed after correcting one condition-switch syntax defect and one target-resolution defect during the loop.

### Verification boundary
The repository test runner and npm test were intentionally not executed, per the requested external AI Studio verification workflow. Therefore runtime/build/test execution remains an external verification step; source-level audit results must not be represented as test-run results.
