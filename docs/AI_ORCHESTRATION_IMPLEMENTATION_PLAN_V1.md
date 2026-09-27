# DreamBook — AI Orchestration & Model Intelligence Implementation Plan
## Version 1.0 — Execution Contract

**Status:** IMPLEMENTATION BLUEPRINT / READY FOR PHASED EXECUTION  
**Companion specification:** `docs/AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md`  
**Repository:** `HeWhoArose/Dreamville-External`  
**Authority rule:** This document describes how the approved orchestration architecture is to be implemented. The companion specification defines the architectural contract; this document defines the execution order, concrete work products, gates, tests, migration rules, and completion criteria.

---

## 1. Purpose

When a future implementation session is instructed to implement the DreamBook AI orchestration expansion, the AI must read this document and the companion specification before modifying code.

The implementation must be incremental. Do not replace existing canonical authorities with parallel AI logic.

The governing pipeline is:

```
CANONICAL STATE
  ↓
AUTHORITY-OWNED CONTEXT
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
```

AI output is never canonical merely because it is plausible.

---

## 2. Existing Contract To Preserve

The implementation must integrate with the existing:

- WorldRepository
- canonical command engine
- deterministic rules engines
- MultiModelOrchestrator
- provider adapters
- model registry and runtime telemetry
- WorkingContextEngine
- Character Genesis
- CapabilityEngine
- ConditionEngine
- CharacterProgressionEngine
- TacticalCombatEngine
- CombatSimulationEngine
- CombatTargetingEngine
- CombatReactionEngine
- CombatMoraleEngine
- NpcTacticalDecisionPolicy
- SpellRuntime
- CombatEffectEngine
- CombatEnvironmentEngine
- WorldEffectEngine
- ResearchEvidencePipeline
- WorldSynthesisService
- Dynamic Character Agency
- epistemic projections
- persistence / replay
- SensoryEngine
- Developer Diagnostics

If an existing subsystem already owns a decision, the AI orchestration layer must consume that authority rather than recreate it.

---

# 3. Non-Negotiable Rules

The implementation must never allow an AI model to independently decide:

- attack success;
- damage;
- action legality;
- ability legality;
- range;
- line of sight;
- movement legality;
- terrain traversal;
- condition application;
- environmental spread;
- structure destruction;
- death;
- discovery;
- canon promotion;
- hidden-event occurrence;
- NPC knowledge.

AI may propose, interpret, classify, summarize, plan, or narrate.

Canonical systems validate and commit.

---

# 4. Execution Protocol

Every phase follows:

```
AUDIT
→ DESIGN CHECK
→ IMPLEMENT
→ CONNECT
→ VALIDATE
→ TEST
→ REGRESSION
→ PERFORMANCE CHECK
→ 10× AUDIT
→ ACCEPTANCE
```

A phase is not complete because code exists.

A phase is complete only when:

1. implementation exists;
2. integration exists;
3. tests exist;
4. regression checks pass;
5. diagnostics are updated where required;
6. the acceptance criteria pass;
7. no unrelated regression is introduced;
8. the repository state is verified.

---

# 5. Phase A — Fallback Reliability

### Objective

Make fallback behavior trustworthy before expanding model intelligence.

### Implement

- task-level semantic validation inside the fallback loop;
- structured-output validation;
- Character Genesis schema validation;
- malformed JSON handling;
- empty-output handling;
- timeout / 429 / 5xx handling;
- stale-chain recovery;
- attempts trail;
- eligible-model filtering;
- deterministic emergency fallback only after eligible AI candidates are exhausted.

### Required invariant

```
MODEL A
 ↓
response
 ↓
validator
 ├─ VALID → success
 └─ INVALID → record failure → MODEL B
```

A non-empty response is not automatically a successful response.

### Acceptance

- provider error advances fallback;
- timeout advances fallback;
- 429 advances fallback;
- malformed JSON advances fallback;
- schema-invalid output advances fallback;
- incomplete structured output advances fallback;
- valid output terminates fallback;
- deterministic fallback is reached only after eligible candidates are exhausted;
- attemptsTrail records contacted models accurately;
- skipped models are not falsely recorded as contacted.

---

# 6. Phase B — TaskContractRegistry

Create a canonical registry for AI tasks.

Each contract must define:

- taskId;
- category;
- input schema;
- output schema;
- validator;
- minimum context;
- estimated input tokens;
- expected output tokens;
- modalities;
- required capabilities;
- structured-output requirement;
- tools requirement;
- maximum latency;
- retry policy;
- fallback policy;
- epistemic requirements;
- downstream consumer.

Initial task families:

### Narration
- narrative.generate
- character.dialogue
- narrative.review
- narrative.rephrase

### Summary
- summary.scene
- summary.history
- summary.memory
- summary.context-compression
- summary.combat

### Research
- research.query
- research.extract
- research.compare
- research.qualify
- research.world-brief

### World
- world.generate
- world.expand
- world.location.generate
- world.faction.generate
- world.timeline.generate

### Character
- character.extract
- character.progression.infer
- character.progression.custom
- character.condition.propose
- character.capability.propose
- character.feat.propose
- character.skill.propose
- character.equipment.propose

### Rules
- rules.adjudicate
- rules.review
- rules.explain
- rules.resolve-check

### Combat
Use explicit tactical task IDs rather than routing combat through narration.

---

# 7. Phase C — Model Intelligence

Create task-specific readiness.

Readiness is represented as:

```
(model, task)
```

A model may be READY for one task and NOT_READY for another.

Required states:

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

Capability inspection must cover:

- input modalities;
- output modalities;
- structured JSON;
- tools;
- streaming;
- thinking;
- context window;
- maximum output;
- request limits;
- token limits;
- billing state;
- runtime health;
- quota;
- cooldown;
- latency;
- failure history.

Never infer free/paid status from a default boolean.

---

# 8. Phase D — Quota and Cost Intelligence

Represent quota independently from health.

Quota:

- HEALTHY
- LOW
- NEAR_EXHAUSTION
- EXHAUSTED
- UNKNOWN

Evidence:

- PROVIDER_EXACT
- PROVIDER_HEADER
- OBSERVED
- ESTIMATED
- UNKNOWN

Estimated headroom must never be presented as provider-confirmed exact usage.

Routing must support:

- free-only;
- prefer-free;
- paid allowed;
- request cost cap;
- daily cost cap.

Known exhausted models should be skipped before execution.

---

# 9. Phase E — Auto Arrange v2

Auto Arrange must:

1. discover models;
2. classify capabilities;
3. determine modalities;
4. determine structured-output support;
5. determine context/output limits;
6. determine billing state where available;
7. determine quota state where available;
8. run task-specific canaries;
9. measure latency;
10. create independent primary/fallback chains per task.

A generic ping is insufficient.

Use bounded concurrency.

---

# 10. Phase F — Cross-System Context Contracts

Implement typed connection contracts:

- ResearchBrief
- WorldGenerationContext
- CharacterGenerationContext
- RulesOutcomeContext
- CombatAIContext
- TacticalPlan
- TacticalReplanRequest
- NarrativeOutcomeContext

Every downstream system receives only the information it is permitted to consume.

---

# 11. Phase G — Research → World

Required flow:

```
PLAYER PREMISE
 ↓
RESEARCH QUERY
 ↓
EVIDENCE
 ↓
QUALIFICATION
 ↓
ResearchBrief
 ↓
WorldGenerationContext
 ↓
WORLD CANDIDATE
 ↓
VALIDATION
 ↓
WORLD AUTHORITY
```

Raw snippets and unverified model claims must never become canon directly.

---

# 12. Phase H — Rules → Narration

Required flow:

```
PLAYER INTENT
 ↓
RULES + SPATIAL + COMBAT + ENVIRONMENT
 ↓
CANONICAL OUTCOME
 ↓
NarrativeOutcomeContext
 ↓
NARRATION
```

Example:

A spell aimed through a wall must be resolved by spatial/rules authority first. Narration only describes the approved result.

---

# 13. Phase I — Combat AI Context

Combat AI receives a bounded projection containing:

### Character
- level;
- abilities;
- skills;
- progression;
- capabilities;
- spells;
- equipment;
- resistances;
- conditions;
- resources.

### Agency
- goals;
- motivation;
- fear;
- desires;
- relationships;
- current objective.

### Epistemics
- visible facts;
- known facts;
- unknown facts;
- legitimate inferences.

### Spatial
- position;
- distance;
- LOS;
- cover;
- obstacles;
- routes;
- elevation;
- terrain;
- chokepoints;
- escape routes.

### Environment
- fire;
- ice;
- water;
- smoke;
- weather;
- hazards;
- structural integrity;
- visibility modifiers.

### Combat
- HP;
- initiative;
- action economy;
- concentration;
- reactions;
- effects;
- target state;
- round.

Do not expose unrestricted canonical state.

---

# 14. Phase J — Tactical Intelligence Profile

Implement canonical tactical intelligence independently of model quality.

Fields:

- strategyRating;
- planningHorizon;
- adaptability;
- threatAssessment;
- spatialAwareness;
- teamCoordination;
- riskTolerance;
- reactionSpeed;
- resourceDiscipline;
- creativityLevel.

Tiers:

- T0 Instinctive
- T1 Competent
- T2 Trained
- T3 Expert
- T4 Mastermind

Model quality must not secretly change an NPC's in-world intelligence.

---

# 15. Phase K — Reactive Combat Intelligence

Use deterministic reaction infrastructure first.

Triggers include:

- ally critical HP;
- ally attacked;
- enemy enters reach;
- enemy begins visible cast;
- target exposed;
- hazard created;
- structure collapse;
- target loses cover.

The AI may be consulted when complexity warrants it, but deterministic reaction candidates remain the first layer.

---

# 16. Phase L — TacticalPlanEngine

A tactical plan contains:

- objective;
- target;
- assumptions;
- ordered steps;
- triggers;
- contingencies;
- abort conditions;
- priority;
- confidence;
- expected resource cost.

Plans are proposals.

Every step is revalidated before execution.

---

# 17. Phase M — Adaptive Replanning

After every significant canonical event:

```
EVENT
 ↓
STATE CHANGE
 ↓
RECHECK PLAN
 ↓
VALID?
 ├─ YES → continue
 └─ NO → replan
```

A stale plan may never force an illegal action.

Example:

If Chill fails, a Freeze-dependent branch becomes invalid immediately.

---

# 18. Phase N — Environment-Aware Tactics

Combat AI may reason over:

- fire;
- water;
- ice;
- smoke;
- cover;
- elevation;
- destructible structures;
- visibility;
- hazards.

The AI proposes.

The Environment Authority resolves.

The updated environment then feeds back into tactical planning.

---

# 19. Phase O — Diagnostics

Developer Diagnostics must expose:

### Routing
- selected model;
- skipped models;
- rejected models;
- reasons;
- quota state;
- compatibility;
- validation;
- latency.

### Tactical planning
- current plan;
- current step;
- assumptions;
- contingency;
- replan reason;
- rejected actions.

Required forensic questions:

- Why did the model fallback?
- Why was a model skipped?
- Why did the enemy choose this action?
- Why was a tactic abandoned?
- Why could the spell not pass the wall?
- Why did the fire spread?
- Why did narration describe this result?

---

# 20. Phase P — Persistence and Replay

Persist where relevant:

- task ID;
- provider/model;
- prompt version;
- context version;
- validated proposal;
- canonical result;
- tactical plan state;
- contingency state;
- environment changes;
- combat replay state;
- provenance.

Never persist secrets.

Canonical outcomes remain reproducible from events, seeds, and authoritative state transitions.

---

# 21. Performance Rules

Preferred hierarchy:

1. deterministic rules;
2. deterministic reaction candidates;
3. deterministic tactical utility;
4. AI strategic planning when complexity warrants it;
5. narration.

Do not invoke an LLM for every combat event.

Use:

- context budgets;
- small task-specific prompts;
- streaming;
- dead-model avoidance;
- limited retries;
- safe caching.

---

# 22. Security / Epistemics

Every AI context must declare:

- actor/viewer;
- visibility;
- authority;
- source;
- canonical/derived/proposed/uncertain status.

AI must not receive hidden world truth merely because another subsystem has it.

Narration must not leak hidden planner state.

---

# 23. Formal Implementation Order

The implementation order is locked:

```
A  Fallback repair
↓
B  Task contracts
↓
C  Task taxonomy
↓
D  Model capability/readiness/quota
↓
E  Auto Arrange v2
↓
F  Cross-system context contracts
↓
G  Tactical intelligence + combat capability context
↓
H  Tactical plans + replanning
↓
I  Expanded reactions
↓
J  Environment-aware tactics
↓
K  Spatial engine + Watabou adapter
↓
L  Canonical combat/environment/narration integration
↓
M  Full acceptance + stress verification
```

Do not skip ahead because a later feature appears attractive.

---

# 24. Final Acceptance Gate

The implementation is complete only when:

- all task contracts are registered;
- all task validators are active;
- fallback semantics pass;
- stale fallback recovery passes;
- model readiness is task-specific;
- quota state is separated from health;
- Auto Arrange uses task-specific canaries;
- Research → World works through ResearchBrief;
- Rules → Narration works through canonical outcomes;
- Combat AI uses bounded CombatAIContext;
- tactical intelligence is canonical;
- tactical plans can replan;
- environment changes invalidate stale plans;
- epistemic boundaries hold;
- diagnostics explain routing and tactical decisions;
- persistence/replay records required provenance;
- full test suite passes;
- lint passes;
- build passes;
- regression suite passes;
- stress tests pass;
- final 10× audit passes.

---

# 25. Instruction To Future Implementing AI

When asked to implement this architecture:

1. Read this document completely.
2. Read `docs/AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md`.
3. Audit the current repository against every phase.
4. Identify what is already implemented, partial, missing, or contradictory.
5. Do not claim completion from code presence alone.
6. Implement only the next uncompleted phase unless explicitly instructed otherwise.
7. Preserve existing canonical authorities.
8. Add tests before declaring the phase complete.
9. Run lint/build/tests where available.
10. Perform a regression audit.
11. Perform the required 10× audit.
12. Record exact results.
13. Update documentation only after the implementation has been verified.
14. Never silently weaken tests to obtain green status.

If this document conflicts with the companion specification, stop and reconcile the conflict before coding. Do not guess.

---

# 26. Completion / Retirement Rule

This document is an implementation contract, not permanent runtime data.

It may be archived or deleted only after:

- every phase is implemented;
- acceptance is complete;
- the final architecture is documented elsewhere;
- migration notes are preserved;
- no unfinished requirement depends on this document.

Until then, keep it in `docs/`.
