# DreamBook — AI Orchestration & Model Intelligence Specification
## Version 1.0 — Pre-Implementation Architecture Contract

Status: DESIGN / PRE-IMPLEMENTATION
Purpose: Define the complete AI orchestration layer, model intelligence system, task routing, cross-system data flow, and tactical-combat intelligence contract before the next implementation phase.

---

# 1. Executive Objective

DreamBook must not become a collection of AI features that merely coexist.

Every AI-capable subsystem must have:

1. a defined task;
2. a defined authority boundary;
3. a canonical input contract;
4. a canonical output contract;
5. a validator;
6. a routing category;
7. a primary model policy;
8. a fallback policy;
9. a downstream consumer;
10. an explicit failure and fallback behavior.

The central architectural flow is:

CANONICAL STATE
  ↓
AUTHORITY-OWNED CONTEXT
  ↓
TASK CONTRACT
  ↓
MODEL ROUTER
  ↓
AI PROPOSAL / TRANSFORMATION
  ↓
TASK VALIDATION
  ↓
AUTHORITATIVE ADJUDICATION
  ↓
CANONICAL COMMIT
  ↓
DERIVED CONTEXT / NARRATION / UI

AI never becomes canonical merely because it produced plausible text.

The orchestration layer therefore has two responsibilities:

A. Model Intelligence — determine which models can genuinely perform a task right now.
B. System Orchestration — make sure information produced by one subsystem reaches the correct downstream subsystem and is not stranded.

---

# 2. Existing Architecture This Specification Preserves

The repository already contains substantial authorities that should be connected rather than replaced.

Relevant existing components include:

- WorldRepository
- WorkingContextEngine
- MultiModelOrchestrator
- provider adapters
- model registry and runtime telemetry
- canonical command engine
- deterministic rules engines
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
- historical evidence / chronicle systems
- Dynamic Character Agency
- epistemic projections
- persistence and replay systems
- SensoryEngine

The implementation must extend these authorities through contracts instead of creating parallel authorities.

---

# 3. Non-Negotiable Authority Rules

AI must never independently decide:

- whether an attack hits;
- how much damage occurred;
- whether an action is legal;
- whether a character can use an ability;
- whether a target is in range;
- whether line of sight exists;
- whether a wall blocks an attack;
- whether a character can move through terrain;
- whether a condition is applied;
- whether fire spreads;
- whether a structure is destroyed;
- whether a character died;
- whether a player discovered something;
- whether a research claim became canon;
- whether a hidden event occurred;
- whether an NPC knows something.

AI may propose, interpret, plan, summarize, classify, or narrate.

The canonical systems validate and commit.

---

# 4. Complete AI Task Graph

The intended information graph is:

PLAYER / WORLD EVENT
  ↓
RESEARCH, CHARACTER, WORLD, RULES, COMBAT or NARRATION TASK
  ↓
TASK-SPECIFIC VALIDATOR
  ↓
AUTHORITATIVE DOMAIN SYSTEM
  ↓
CANONICAL EVENT / DERIVED READ MODEL

Cross-system examples:

Research
  ↓
Qualified Research Evidence
  ↓
Research Brief / World Facts
  ↓
World Generation
  ↓
World Authority

World Authority
  ↓
Character / Faction / Location / Environment State
  ↓
Combat + Rules + Spatial Authority

Rules + Combat + Environment + Agency
  ↓
NarrativeOutcomeContext
  ↓
Narration / Dialogue

Character Authority + Knowledge + Spatial State + Combat State
  ↓
CombatAIContext
  ↓
Tactical Planning
  ↓
Combat Authority

No major AI task is allowed to become an isolated feature.

---

# 5. Canonical Task Taxonomy

## 5.1 Narration

Tasks:
- narrative.generate
- character.dialogue
- narrative.review
- narrative.rephrase

Purpose:
- transform approved outcomes into player-facing language;
- produce character-appropriate dialogue;
- preserve epistemic boundaries;
- preserve tone and style;
- never create an unapproved game outcome.

Narration consumes validated facts. It does not adjudicate rules.

---

## 5.2 Summarization

Tasks:
- summary.scene
- summary.history
- summary.memory
- summary.context-compression
- summary.combat

Purpose:
- compress existing canonical information;
- retain causality and important identities;
- preserve uncertainty;
- never introduce facts absent from its source context.

Summarization must be an independent routing category from narration.
A model may serve both roles, but the chains are independent.

---

## 5.3 Research

Tasks:
- research.query
- research.extract
- research.compare
- research.qualify
- research.world-brief

Purpose:
- investigate subjects described by the user;
- gather evidence;
- structure source claims;
- separate verified, disputed and unknown information;
- produce a research brief consumable by downstream systems.

Research does not directly mutate canonical world state.

---

## 5.4 World Generation

Tasks:
- world.generate
- world.expand
- world.location.generate
- world.faction.generate
- world.timeline.generate

Inputs may include:
- player premise;
- authored constraints;
- rules profile;
- narrative profile;
- existing canon;
- qualified research brief;
- map constraints;
- world-generation seeds.

Output is a structured world candidate.

Before commit:

AI World Candidate
  ↓
Schema Validator
  ↓
Reference / Integrity Validator
  ↓
Rules Compatibility
  ↓
Epistemic / Canon Validation
  ↓
World Authority

---

## 5.5 Character Genesis

Tasks:
- character.extract
- character.progression.infer
- character.progression.custom
- character.condition.propose
- character.capability.propose
- character.feat.propose
- character.skill.propose
- character.equipment.propose

Character extraction must no longer rely on the generic narration task as its architectural contract.

Every structured character task must define an explicit schema validator.

---

## 5.6 Rules

Tasks:
- rules.adjudicate
- rules.review
- rules.explain
- rules.resolve-check

Rules consumes canonical character, capability, equipment, condition, progression, spatial and environmental state.

Rules produces facts such as:
- action legality;
- roll requirements;
- attack result;
- range;
- line of sight result;
- save requirements;
- damage;
- condition changes;
- resource consumption;
- movement cost;
- environment interaction.

Rules never writes narrative prose as canonical truth.

---

# 6. Research → World Generation Connection

This is a required connection, not an optional feature.

Example:

Player:
Create a world inspired by a historical trade culture.

Flow:

Player premise
  ↓
Research query planner
  ↓
Research provider
  ↓
Research evidence
  ↓
Qualification / adjudication
  ↓
Validated Research Brief
  ↓
World Generation task
  ↓
World candidate
  ↓
World Authority

Raw snippets, unverified claims and arbitrary AI statements cannot become world canon directly.

The existing ResearchEvidencePipeline already establishes this separation: only qualified research can be promoted into canonical facts.

The future ResearchBrief contract should contain:

- query;
- scope;
- selected claims;
- source references;
- qualification status;
- confidence;
- disputed points;
- unknowns;
- semantic guidance for world generation;
- canonical promotion eligibility.

---

# 7. Rules → Narration Connection

Required flow:

Player Intent
  ↓
Rules + Spatial + Combat + Environment
  ↓
Canonical Outcome
  ↓
NarrativeOutcomeContext
  ↓
Narration

Example:

Player attempts a ranged spell at an enemy behind a stone wall.

Spatial Authority:
LOS = BLOCKED

Rules:
spell cannot target through the wall under the active rules profile.

Canonical outcome:
spell blocked.

Narration:
describes the spell failing against the obstruction.

Narration must never invent a successful hit merely because the player asked for one.

---

# 8. Combat Is a Dedicated AI Domain

Combat must not be implemented as a narration prompt such as:
what should the enemy do next?

The repository already has a strong deterministic tactical base:

- TacticalCombatEngine
- CombatSimulationEngine
- CombatTargetingEngine
- CombatReactionEngine
- CombatMoraleEngine
- NpcTacticalDecisionPolicy
- CombatEffectEngine
- SpellRuntime
- CombatEnvironmentEngine
- CapabilityEngine
- ConditionEngine

The new AI layer sits above these authorities.

Target architecture:

Combat State
  ↓
CombatAIContext
  ↓
Tactical Observation
  ↓
Immediate Reaction OR Strategic Plan
  ↓
Tactical Proposal
  ↓
Rules + Spatial + Capability + Environment Validation
  ↓
Combat Execution
  ↓
Canonical Events
  ↓
Narration

---

# 9. What Feeds Combat AI?

CombatAIContext is assembled from:

Character Authority:
- level;
- ability scores;
- skills;
- progression;
- capabilities;
- spells;
- equipment;
- resistances;
- immunities;
- vulnerabilities;
- active conditions;
- resources;
- cooldowns.

Character Agency:
- goals;
- motivations;
- fears;
- desires;
- relationships;
- current objective.

Epistemic Authority:
- what the actor can currently perceive;
- what it believes;
- what it knows;
- what it does not know;
- what it has inferred legitimately.

Spatial Authority:
- position;
- distance;
- line of sight;
- cover;
- obstacles;
- movement routes;
- elevation;
- terrain;
- chokepoints;
- escape routes.

Environment Authority:
- fire;
- ice;
- water;
- smoke;
- weather;
- hazards;
- structural integrity;
- movement modifiers;
- visibility effects.

Combat Authority:
- HP;
- initiative;
- action economy;
- concentration;
- current effects;
- reactions;
- target state;
- current round;
- pending activations.

The AI must receive a projection of these facts, not unrestricted canonical state.

---

# 10. How Combat Knows What a Character Can Do

Combat must consume a canonical CombatCapabilityProfile.

Required fields:

- actorId;
- team;
- tactical role;
- attack options;
- spell options;
- reaction options;
- movement options;
- defensive options;
- capability IDs;
- effect definitions;
- resource costs;
- cooldowns;
- action economy;
- equipment-derived modifiers;
- active conditions;
- current resource availability.

CapabilityEngine remains authoritative for capability legality.

Combat AI may choose among legal options but cannot invent new powers during combat.

---

# 11. How Combat Knows How Smart a Character Is

Intelligence must be an explicit canonical tactical profile, not a side effect of which LLM happens to answer.

Define a TacticalIntelligenceProfile with:

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

For important characters, this may be authored directly.

For ordinary characters, values may be derived deterministically from authored stats, skills, combat training, progression, faction doctrine, personality and other canonical data.

Model quality must never secretly increase an NPC's in-world intelligence.

---

# 12. Tactical Intelligence Tiers

T0 — Instinctive:
- immediate threat reaction;
- basic attacks;
- basic fleeing.

T1 — Competent:
- sensible target selection;
- basic cover;
- basic ally protection;
- obvious hazard avoidance.

T2 — Trained:
- ability combinations;
- action-economy awareness;
- role coordination;
- simple anticipation;
- resource discipline.

T3 — Expert:
- multi-step plans;
- baiting;
- counterplay;
- deliberate positioning;
- contingency selection.

T4 — Mastermind:
- complex multi-step tactics;
- deceptive positioning;
- conditional branches;
- team coordination;
- strategic resource control;
- adaptive replanning.

The planning horizon and number of candidate branches are constrained by the actor's tactical profile.

---

# 13. Reactive Combat Intelligence

The existing CombatReactionEngine should become the fast deterministic reaction layer.

Required reaction concepts include:

- ally low health;
- ally attacked;
- ally preparing a long action;
- enemy enters reach;
- enemy begins a visible cast;
- enemy becomes exposed;
- hazard created nearby;
- structure collapses;
- target loses cover;
- target becomes vulnerable.

Example:

Ally HP = 18%
Enemy melee threat = adjacent
Support has shield capability
Reaction available

Flow:

Reactive trigger
  ↓
Candidate generation
  ↓
CombatReactionEngine
  ↓
Rules / Capability validation
  ↓
Shield / Interpose / Heal / Guard

---

# 14. Strategic Tactical Planning

A TacticalPlanEngine should handle multi-step tactics beyond immediate reactions.

Plan structure:

- objective;
- target;
- assumptions;
- steps;
- triggers;
- contingencies;
- abort conditions;
- priority;
- confidence;
- expected resource cost.

Example:

Objective: disable the player.

Step 1:
Create ice terrain around the player.

Step 2:
If the player becomes Chilled, use water interaction.

Step 3:
If the player becomes Frozen, cast the high-damage spell.

Step 4:
If Chill does not occur, abandon the freeze branch.

Step 5:
Heat the ice to create steam if that capability is legal.

Step 6:
If steam obscures the player's vision and the enemy has a clear ranged shot, use ranged attack.

This is a plan proposal, not an execution script.

---

# 15. Tactical Replanning

After every significant canonical combat/environment event:

EVENT
  ↓
STATE CHANGE
  ↓
RECHECK CURRENT PLAN
  ↓
PLAN STILL VALID?
  ├─ YES → continue
  └─ NO → replan

Examples:

Player avoids Chill:
Freeze branch becomes invalid.

Player dispels the ice:
Ice-dependent branch becomes invalid.

Player moves behind a wall:
LOS-based ranged action becomes invalid.

Fire creates smoke:
Visibility and targeting must be recomputed.

Enemy loses the required resource:
the corresponding step becomes unavailable.

Tactical AI must adapt to the new canonical state rather than continue following a stale script.

---

# 16. Detailed Adaptive Tactics Example

Initial state:

Player is preparing a large attack.
Enemy mage sees the preparation.
Enemy has ice, water, fire and ranged capabilities.

Plan:

1. Create ice terrain to restrict movement.
2. Try to induce Chill.
3. If Chill succeeds, use water interaction to attempt Freeze.
4. If Freeze succeeds, use the large spell.

Player avoids Chill.

Canonical result:
Chill was not applied.

Planner response:
Do not execute the Freeze branch.

Replan:

1. Heat the ice with Fireball.
2. Environment converts the ice/water interaction into steam where valid.
3. Steam reduces visibility.
4. Recompute line of sight.
5. If a legal ranged attack remains, fire through the available opening.

Every stage is revalidated by canonical systems.

The AI may propose the tactic. It may not declare that the player became Chilled, Frozen or obscured unless the authoritative systems say so.

---

# 17. Personality and Agency → Tactics

The same tactical state can produce different plans because NPCs have different canonical motives.

Protective ally:
- protect the player;
- intercept threats;
- heal or shield;
- sacrifice position for ally survival.

Cowardly enemy:
- create distance;
- avoid high-risk attacks;
- flee earlier;
- conserve resources.

Vengeful enemy:
- prioritize a particular target even when it is not locally optimal.

Disciplined soldier:
- hold formation;
- protect commander;
- focus fire;
- retreat according to doctrine.

Strategic mage:
- control terrain;
- preserve high-value resources;
- use conditional spell chains.

These differences come from canonical character and agency data.

---

# 18. Knowledge and Epistemic Constraints on Combat

Combat AI never receives unrestricted world truth.

Instead:

World Truth
  ↓
Actor Knowledge Projection
  ↓
CombatAIContext

Therefore an enemy cannot plan around:

- a hidden player;
- an undiscovered trap;
- an unseen ally;
- a secret route;
- an unobserved spell preparation;

unless the actor legitimately knows those facts.

This preserves the existing epistemic architecture.

---

# 19. Rules ↔ Combat

Rules answers:
- Can this action happen?
- What roll or save is required?
- What is the range?
- What damage occurs?
- What conditions change?
- What resources are consumed?
- Does the environment modify the result?

Combat AI answers:
- Which legal action is tactically preferable?

The separation is permanent.

---

# 20. Environment ↔ Combat

Environment is a tactical system, not decoration.

Combat may query:
- slow terrain;
- cover;
- fire;
- ice;
- water;
- smoke;
- high ground;
- chokepoints;
- destructible structures;
- escape routes;
- visibility breaks.

Combat may create environment events through canonical capabilities.

Environment then returns the actual state change.

Example:

Spell
  ↓
Environment
  ↓
Ice zone created
  ↓
Movement rules change
  ↓
Tactical planner reevaluates

---

# 21. Combat → Narration

Combat publishes canonical events:

- ATTACK_RESOLVED
- SPELL_CAST
- CONDITION_APPLIED
- REACTION_TRIGGERED
- MOVEMENT
- HAZARD_CREATED
- HAZARD_REMOVED
- STRUCTURE_DAMAGED
- STRUCTURE_DESTROYED
- CHARACTER_DOWNED
- CHARACTER_KILLED
- TACTICAL_PLAN_STARTED
- TACTICAL_PLAN_ABORTED
- TACTICAL_PLAN_REPLANNED

Narration consumes these events through NarrativeOutcomeContext.

---

# 22. NarrativeOutcomeContext

Narration receives only approved information needed to tell the scene.

Fields include:

- scene;
- time;
- location;
- visible actors;
- approved action;
- rules outcome;
- combat outcome;
- environment changes;
- character reactions;
- relationship changes;
- knowledge changes;
- sensory cues;
- canonical consequences.

Hidden planner details are not automatically exposed to the player.

---

# 23. Task Contract Registry

The orchestrator requires a formal TaskContractRegistry.

Each task contract defines:

- task ID;
- category;
- input schema;
- output schema;
- validator;
- minimum context;
- estimated input tokens;
- expected output tokens;
- required modalities;
- required capabilities;
- structured output requirement;
- tools requirement;
- maximum latency;
- retry policy;
- fallback policy;
- epistemic requirements;
- downstream consumer.

Example: character.extract

Input:
concept + world context + existing draft + locked fields.

Output:
CharacterGenesisDraft schema.

Validator:
parse + structural shape + semantic required-field validation.

Fallback:
next eligible model, not immediate deterministic fallback.

---

# 24. Model Intelligence

Model selection must answer:
Which model can actually perform this exact task now?

Selection pipeline:

TASK REQUEST
  ↓
TASK CONTRACT
  ↓
CATEGORY
  ↓
INPUT REQUIREMENTS
  ↓
OUTPUT REQUIREMENTS
  ↓
MODEL CAPABILITY FILTER
  ↓
CONTEXT / TOKEN FIT
  ↓
ACCOUNT / QUOTA FIT
  ↓
COST POLICY
  ↓
TASK-SPECIFIC CANARY
  ↓
READINESS
  ↓
PRIMARY + FALLBACK CHAIN

---

# 25. Model Readiness

Readiness must be represented per pair:

(model, task)

A model can be:
- READY for narration;
- READY for summary;
- NOT_READY for character extraction;
- READY for research;
- NOT_READY for structured rules.

Global model health is insufficient.

Readiness states:

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

---

# 26. Capability Model

Model capability profile must distinguish:

Input:
- text;
- image;
- audio;
- video;
- files.

Output:
- text;
- JSON;
- image;
- audio.

Generation:
- streaming;
- structured output;
- tools;
- thinking;
- function calling.

Limits:
- context window;
- maximum output;
- request limits;
- token limits.

Billing:
- FREE;
- PAID;
- ACCOUNT_DEPENDENT;
- UNKNOWN.

Runtime:
- health;
- quota;
- cooldown;
- latency;
- failure history.

---

# 27. Quota Intelligence

Quota states:
- HEALTHY
- LOW
- NEAR_EXHAUSTION
- EXHAUSTED
- UNKNOWN

Quota evidence source:
- PROVIDER_EXACT
- PROVIDER_HEADER
- OBSERVED
- ESTIMATED
- UNKNOWN

Estimated information must never be presented as exact provider truth.

Known exhausted models should eventually be skipped before network execution.

---

# 28. Cost / Free Model Policy

Model price, account balance and rate limits are distinct concepts.

Routing policy should support:

- free models only;
- prefer free models;
- allow paid models;
- request-level cost cap;
- daily cost cap.

Free status must come from provider/model metadata or verified policy, never from an assumption such as isPaidModel=false.

---

# 29. Auto Arrange v2

The future Auto Arrange operation must perform:

1. Discover models.
2. Classify capabilities.
3. Determine modality support.
4. Determine structured-output support.
5. Determine context and output limits.
6. Determine pricing/billing state where available.
7. Determine quota state where available.
8. Run task-specific canary generation.
9. Measure latency.
10. Build an independent primary/fallback chain for each task.

A simple ping is not sufficient.

Auto Arrange should use bounded concurrency rather than testing every model serially.

---

# 30. Fallback Semantics

A fallback must occur when any task-level execution fails:

- provider error;
- timeout;
- 429;
- 5XX;
- empty output;
- invalid JSON;
- schema failure;
- task-contract validation failure;
- incompatible output;
- other provider execution failures.

The critical sequence is:

MODEL A
  ↓
response
  ↓
task validator
  ├─ VALID → success
  └─ INVALID
       ↓
record failure
       ↓
MODEL B

The fallback engine must not stop merely because a provider returned non-empty text.

---

# 31. Stale Fallback Recovery

Persisted chains can become stale when:
- models disappear;
- providers are disabled;
- credentials disappear;
- quotas become exhausted;
- model capabilities change;
- discovery refreshes the registry.

Runtime selection must be able to recover currently eligible models from the live registry while preserving the configured priority order.

The deterministic emergency floor remains the last AI-external safety layer.

---

# 32. Narration Performance

Latency reduction should come from:

- fast task-specific models;
- smaller targeted prompts;
- context budgeting;
- provider streaming;
- avoiding known-dead models;
- independent summary models;
- limited retries;
- caching derived repeated presentation where safe.

Canonical state does not wait on optional presentation work when architecture permits streaming/async presentation.

---

# 33. Cross-System Context Contracts

The main typed contracts should include:

- ResearchBrief;
- WorldGenerationContext;
- CharacterGenerationContext;
- RulesOutcomeContext;
- CombatAIContext;
- TacticalPlan;
- TacticalReplanRequest;
- NarrativeOutcomeContext.

These contracts are the connection points between systems.

Every downstream task gets only the information it is supposed to consume.

---

# 34. Persistence and Replay

Persist when relevant:

- task ID;
- selected model/provider;
- prompt version;
- context version;
- validated proposal;
- canonical result;
- tactical plan state;
- active tactical contingency;
- environment changes;
- combat replay state;
- decision provenance.

Do not persist secrets.

AI model selection may be dynamic, but canonical game outcomes remain reproducible from recorded events, seeds and authoritative state transitions.

---

# 35. Diagnostics

Developer Diagnostics must eventually expose:

Model Routing:
- selected model;
- skipped models;
- rejected models;
- reason;
- quota state;
- task compatibility;
- validation result;
- latency.

Tactical Planning:
- current plan;
- current step;
- plan assumptions;
- contingency selected;
- reason for replan;
- rejected tactical actions.

Cross-system cause tracing should answer questions such as:

Why did the enemy protect the player?
Why did the enemy abandon Freeze?
Why did the fire spread?
Why could the spell not pass the wall?
Why did narration describe a failed attack?
Why did the model fallback?
Why was a model skipped?

---

# 36. Immediate Implementation Phase

Phase A is the fallback repair.

Required behavior:

- semantic/schema validation occurs inside the fallback execution loop;
- Character Genesis validates its output before accepting the model as successful;
- invalid Character Genesis output proceeds to the next eligible model;
- stale one-model chains can recover another eligible AI model before deterministic emergency;
- regression tests cover schema failure and stale-chain recovery.

This is the minimum required state before model intelligence can be meaningfully tested.

---

# 37. Formal Orchestration Implementation Phases

Phase A — Immediate fallback repair.

Phase B — TaskContractRegistry and task-specific validators.

Phase C — Correct task taxonomy and explicit task IDs.

Phase D — ModelCapabilityInspector, TaskReadinessEngine, QuotaIntelligence and BillingPolicy.

Phase E — Auto Arrange v2 with task-specific preflight.

Phase F — ResearchBrief, WorldGenerationContext, RulesOutcomeContext, CombatAIContext and NarrativeOutcomeContext.

Phase G — TacticalIntelligenceProfile, CombatCapabilityProfile and TacticalObservation.

Phase H — TacticalPlanEngine and adaptive replanning.

Phase I — Expanded combat reactions.

Phase J — Environment-aware tactical planning.

Phase K — Multi-scale spatial world engine and Watabou map adapter.

Phase L — Canonical combat/environment/narrative integration.

Phase M — Full acceptance and stress verification.

---

# 38. Acceptance Matrix — Fallback

The following must all pass:

- provider error advances fallback;
- timeout advances fallback;
- 429 advances fallback;
- malformed JSON advances fallback;
- schema-invalid response advances fallback;
- incomplete structured output advances fallback;
- valid output ends fallback immediately;
- deterministic emergency is reached only when eligible AI candidates are exhausted;
- attemptsTrail accurately records every contacted model;
- skipped models are not falsely reported as contacted.

---

# 39. Acceptance Matrix — Research / World

Scenario:
User asks for a world based on a research subject.

Expected:
research query → evidence → qualification → ResearchBrief → WorldGenerationContext → world candidate → validation → canonical world.

Forbidden:
raw unverified research → canonical world fact.

---

# 40. Acceptance Matrix — Rules / Narration

Scenario:
Player attacks a target behind a wall.

Expected:
intent → targeting → line-of-sight → rules → canonical blocked outcome → narration.

Forbidden:
narration deciding that the attack hit.

---

# 41. Acceptance Matrix — Combat Tactics

Scenario A:
Player ally reaches critical HP while threatened.

Expected:
ally awareness → reaction candidate → shield/interpose/heal decision → canonical validation → execution → narration.

Scenario B:
Enemy executes a multi-step freeze/steam tactic.

Expected:
- plan created;
- ice is legally created;
- Chill is checked canonically;
- water branch executes only if Chill succeeds and the action is legal;
- Freeze is checked canonically;
- large spell executes only if the prerequisite state exists;
- if Chill fails, plan branch is invalidated;
- replanning can select fire/steam or another legal tactic;
- smoke/visibility is resolved by environment;
- ranged attack checks updated LOS/range/cover;
- narration describes only canonical results.

---

# 42. Acceptance Matrix — Intelligence

Two NPCs with identical equipment but different tactical intelligence profiles must be able to produce different legal tactical proposals.

The difference must come from canonical tactical profile, personality, goals, knowledge, morale and capabilities — not arbitrary model behavior.

---

# 43. Performance Policy

Not every combat event should require an LLM call.

Preferred hierarchy:

1. deterministic rules;
2. deterministic reaction candidates;
3. tactical utility evaluation;
4. AI strategic planning only when complexity warrants it;
5. narration for player-facing presentation.

This minimizes latency and cost while preserving intelligent behavior.

---

# 44. Security / Epistemic Policy

AI must not receive unrestricted hidden world state.

Every context contract must declare:

- viewer/actor;
- visibility;
- authority;
- source;
- whether the fact is canonical, derived, proposed or uncertain.

Hidden planner state must not leak through narration.

---

# 45. Pre-Implementation Gate

Full implementation cannot begin until these decisions are frozen:

- task taxonomy;
- TaskContractRegistry shape;
- capability profile;
- readiness model;
- quota semantics;
- cost semantics;
- research → world contract;
- world → character contract;
- character → combat contract;
- rules → combat contract;
- spatial → combat contract;
- environment → combat contract;
- combat → narration contract;
- agency → tactical contract;
- knowledge → tactical contract;
- TacticalPlan schema;
- TacticalReplan schema;
- reaction trigger matrix;
- persistence requirements;
- replay requirements;
- diagnostics requirements;
- acceptance matrix;
- performance budgets.

---

# 46. Final Architectural Principle

The goal is not:

Give every system an AI.

The goal is:

Give each system the correct intelligence contract and connect it to the other authorities through explicit typed context.

The intended long-term chain is:

RESEARCH
  ↓
QUALIFIED KNOWLEDGE
  ↓
WORLD GENERATION
  ↓
WORLD AUTHORITY
  ↓
CHARACTER / FACTION / SPATIAL / ENVIRONMENT STATE
  ↓
RULES + COMBAT + TACTICAL INTELLIGENCE
  ↓
CANONICAL EVENTS
  ↓
NARRATION / DIALOGUE / SENSORY PRESENTATION

Every arrow is an implementation contract.

No arrow may be replaced with the assumption that an AI model will simply know what another system needs.

---

# 47. Status

This is a pre-implementation architecture contract.

It intentionally distinguishes current repository capabilities from the target connected architecture.

The fallback repair is the first prerequisite.

The remaining orchestration, model-intelligence and tactical-planning layers must be implemented only after this specification is audited and accepted.