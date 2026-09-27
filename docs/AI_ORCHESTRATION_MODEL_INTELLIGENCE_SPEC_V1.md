# DreamBook — AI Orchestration & Model Intelligence Specification
## Version 2.0 — Surgical Architecture Contract

**Status:** ACTIVE ARCHITECTURE SPECIFICATION
**Scope owner:** AI task orchestration, model intelligence, context contracts and AI authority boundaries.
**Does not own:** world persistence, spatial simulation, character capability rules, epistemic authority, or player UI.

## 1. Architectural law

Every AI operation follows:

CANONICAL STATE
  ↓
AUTHORITY-OWNED PROJECTION
  ↓
TASK CONTRACT
  ↓
MODEL INTELLIGENCE / ROUTER
  ↓
AI PROPOSAL OR TRANSFORMATION
  ↓
TASK VALIDATOR
  ↓
AUTHORITATIVE ADJUDICATION
  ↓
CANONICAL COMMIT
  ↓
DERIVED CONTEXT / NARRATION / UI

AI output is never canonical merely because it is plausible.

## 2. Existing authorities to preserve

- WorldRepository
- canonical command engine
- deterministic rules engines
- CapabilityEngine
- ConditionEngine
- CharacterProgressionEngine
- TacticalCombatEngine and its combat subsystems
- SpellRuntime
- WorldEffectEngine / CombatEffectEngine / CombatEnvironmentEngine
- Dynamic Character Agency
- epistemic projections
- MemoryOpportunityEngine and NarrativeContinuityEngine
- WorkingContextEngine
- persistence and replay
- Developer Diagnostics
- MultiModelOrchestrator and provider adapters

These systems remain authoritative. The AI layer connects them; it does not replace them.

## 3. AI must never independently decide

- attack success or damage;
- action legality;
- range or line of sight;
- movement legality;
- conditions or environmental spread;
- structure destruction or death;
- discovery or hidden-event occurrence;
- canon promotion;
- player/NPC knowledge;
- inventory, progression or relationship mutation.

AI may interpret, summarize, plan, propose, classify and narrate.

## 4. Task contract

Every task has:
- taskId;
- category;
- input schema;
- output schema;
- validator;
- required context;
- modality requirements;
- structured-output requirement;
- tool requirements;
- latency budget;
- retry policy;
- fallback policy;
- epistemic requirements;
- downstream consumer.

Initial task families are:
- narration and dialogue;
- summaries;
- research;
- world generation;
- character generation;
- rules explanation/adjudication proposals;
- tactical planning;
- OOC assistance.

Rules adjudication remains canonical even when an AI-assisted rules explanation exists.

## 5. Model intelligence

Readiness is evaluated per `(model, task)` pair, not globally.

States:
- DISCOVERED
- CLASSIFIED
- CAPABILITY_COMPATIBLE
- CONFIGURED
- QUOTA_AVAILABLE
- TASK_VERIFIED
- READY
- THROTTLED
- COOLDOWN
- UNAVAILABLE
- REJECTED
- UNKNOWN

Capability checks include input/output modalities, structured output, tools, streaming, thinking support, context/output limits, provider health, quota evidence, latency and failure history.

Provider-reported limits are authoritative only where actually exposed. Observed or estimated values must be labeled accordingly.

## 6. Fallback contract

MODEL A
 ↓
response
 ↓
task validator
 ├─ VALID → success
 └─ INVALID → record failure → eligible MODEL B

Provider errors, timeouts, 429s, malformed output and schema-invalid output must enter the same controlled fallback mechanism.

Emergency deterministic fallback is a final safety floor, not a normal success path.

## 7. Context contracts

The following contracts are shared interfaces, not new authorities:

- ResearchBrief
- WorldGenerationContext
- CharacterGenerationContext
- RulesOutcomeContext
- CombatAIContext
- TacticalPlan
- TacticalReplanRequest
- NarrativeOutcomeContext
- OocContext

Each contract is assembled from canonical projections and must respect the actor/viewer's epistemic scope.

## 8. Narration contract

Narration consumes approved outcomes.

Required input may include:
- current scene;
- current world time;
- active character state;
- relevant visible entities;
- current canonical outcome;
- immediate consequences;
- relevant authorized memories;
- relationships;
- unresolved story threads;
- world-local lore;
- universe-level continuity when relevant;
- narrative profile;
- rules profile;
- sensory facts.

Long-term context is retrieved by the memory/continuity systems. Narration is not told to 'remember everything'.

Narration must not invent a canonical outcome.

## 9. OOC contract

OOC is a player-facing AI interaction mode, not a second game engine.

OOC may:
- answer questions using authorized context;
- explain canonical state;
- retrieve memory/lore;
- propose supported actions;
- invoke explicitly registered canonical tools.

OOC mutation must never be implemented through keyword heuristics or direct repository mutation.

Correct flow:

OOC request
 ↓
task interpretation
 ↓
registered tool selection
 ↓
canonical command
 ↓
validation
 ↓
commit
 ↓
OOC response

## 10. Tactical AI contract

Combat AI receives a bounded CombatAIContext containing character capability, agency, epistemic, spatial, environmental and combat projections.

The AI selects among legal tactical options. It does not establish legality.

Tactical intelligence is canonical actor data; model quality must never secretly change an NPC's in-world intelligence.

## 11. Spatial boundary

Spatial truth belongs to the Spatial World Specification and its runtime authority.

AI may request controlled spatial projections such as visibility, route options, cover and hazards.

AI must never receive unrestricted map state merely because it is convenient.

## 12. Persistence boundary

Persistence belongs to the existing persistence/world repository architecture.

The AI layer records proposals, telemetry and derived context only where the canonical system explicitly permits it. It does not create a parallel AI persistence store for gameplay truth.

## 13. Verification

Every orchestration change must be audited for:
1. authority preservation;
2. epistemic filtering;
3. task/schema validation;
4. fallback correctness;
5. category isolation;
6. context relevance;
7. secret leakage;
8. canonical mutation boundaries;
9. regression coverage;
10. runtime test evidence.

Source audit is not runtime verification.

## 14. Document boundary

This specification no longer contains implementation phases for persistence, spatial simulation, capabilities, Operations UI or the Master Plan. Those requirements belong to their owning documents and are linked through the Surgical Architecture Registry.