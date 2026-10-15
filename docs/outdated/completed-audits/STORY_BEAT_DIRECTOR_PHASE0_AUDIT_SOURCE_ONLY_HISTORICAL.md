# StoryBeatDirector Phase 0 — Surgical Architecture Audit

## Status

**Phase:** 0 — Audit  
**Status:** IMPLEMENTED — SOURCE AUDITED  
**Audit baseline:** `main` @ `b8b1d1ca495559ccf8615ca0b2e4d8b63a2dd11b`  
**Prior live quality gate:** `5343e74e49b1cf1af681951a052ad472079492fb`

This document records the source-level architecture audit performed before StoryBeatDirector implementation.

Runtime verification is intentionally not claimed here. Runtime verification will occur after implementation and again after every corrective pass.

---

# 1. Audit Objective

Determine exactly:

1. where canonical reality is resolved;
2. what structured resolution data is available to narration;
3. what current situation projection is available at narration time;
4. what NarrativeDirector already owns;
5. what SceneComposition owns;
6. where N18/CH19 quality gates run;
7. every live caller of `generateNarrativeOnly`;
8. every prompt path that must receive the new beat;
9. every fallback path that must preserve it;
10. whether a BEFORE/AFTER simulation authority is actually missing.

The implementation must not introduce duplicate authority.

---

# 2. Existing Canonical Resolution Authority

## 2.1 ActionResolution already exists

`src/types.ts` defines a structured `ActionResolution` containing:

- `resolutionId`
- `storyId`
- `turnId`
- `playerAction`
- normalized player-intent fields
- `attemptedEffect`
- `targetEntityIds`
- `resolutionMethod`
- `outcomeTier`
- `actualEffect`
- `canonicalStateChanges`
- `physicalConsequences`
- `playerVisibleConsequences`
- `evidenceIds`
- `uncertainty`
- canonical provenance
- optional structured check/consequence guidance

Therefore, the proposed beat layer must **consume** ActionResolution rather than create another mechanics/result authority.

## 2.2 ActionResolution is projected into narration

`server/domain/actionResolution.ts` already serializes the structured resolution through:

`buildActionResolutionPromptContext()`

`server/domain/narrativePromptBuilder.ts` includes it under:

**ACTION RESOLUTION — AUTHORITATIVE**

This is the correct authority boundary.

---

# 3. Live Freeform Turn Call Graph

The audited main-path flow is:

```
Player action
    ↓
serverMockAuthority.processCustomAction
    ↓
CurrentSituationBuilder
    ↓
PlayerIntentInterpreter
    ↓
ResolutionGate / capability / item / check authorities
    ↓
Canonical command/mutation paths
    ↓
ActionResolution assembly
    ↓
local spatial state / conditions / item consequences
    ↓
MultiModelOrchestrator.generateNarrativeOnly
    ↓
CurrentSituationBuilder (post-resolution view)
    ↓
PlayerIntent interpretation
    ↓
NarrativeResearchPipeline
    ↓
EpistemicBoundaryEnforcer
    ↓
NarrativeDirector
    ↓
WorkingContextEngine
    ↓
NarrativePromptBuilder
    ↓
N1/N2/N4/N7/N8/N9 + N13/N15/N17
    ↓
narrative.generate
    ↓
turn package validation
    ↓
semantic/action/situation/information/temporal/pacing/presentation checks
    ↓
N18 quality evaluation
    ↓
bounded narrative.review (when authorized)
    ↓
accepted narration / deterministic fallback
```

This means the correct insertion point is **inside the presentation boundary after canonical resolution and before NarrativeDirector/prompt composition**.

---

# 4. Current Situation Authority

`server/domain/currentSituation.ts` remains the sole bounded current-turn situation projection.

It already exposes:

- canonical world/time;
- player lifecycle state;
- local spatial state;
- current location;
- nearby entities;
- visible events;
- active dialogue;
- recent turns;
- plot;
- open threads;
- relevant memory;
- relevant lore;
- player knowledge boundary;
- world facts;
- active conditions;
- available interactions.

### Important finding

The live `generateNarrativeOnly` call occurs **after canonical action processing** in the main freeform path.

Therefore the `CurrentSituationBuilder` invocation inside `generateNarrativeOnly` is already an **after-resolution bounded view** for live turns.

A second simulation or post-resolution world-state engine is unnecessary.

---

# 5. BEFORE/AFTER Delta Audit

## Finding

The proposed StoryBeatDirector does not require a new simulation-owned BEFORE/AFTER engine for the initial implementation.

The combination of:

- typed `ActionResolution`;
- `canonicalStateChanges`;
- `physicalConsequences`;
- `playerVisibleConsequences`;
- `actualEffect`;
- post-resolution `CurrentSituation`;
- current player intent;
- bounded research;

already supplies the essential evidence needed to construct a presentation-safe meaningful beat.

### Example

The canonical freeform resolution path explicitly records local movement as:

- a spatial canonical state change;
- a physical consequence describing the resulting proximity;
- updated local spatial state in the player lifecycle.

This is enough for StoryBeatDirector to derive:

> “The player moved closer to the focal target within the current location.”

It should **not** invent:

> “The sound became louder.”

unless that change is explicitly supported by authoritative evidence.

### Architectural decision

Do **not** create:

- `BeforeSituationEngine`;
- `AfterSituationEngine`;
- second spatial simulator;
- duplicate action resolver.

If a future audit finds a canonical outcome that cannot expose a required presentation delta, fix that owning canonical projection rather than building a shadow simulator.

---

# 6. NarrativeDirector Audit

`server/domain/narrativeDirector.ts` already owns:

- ephemeral turn objective;
- immediate narrative steps;
- information reveals;
- entity reaction participants;
- NPC cognition contract;
- social topology;
- N17 episode projection;
- continuity requirements;
- forbidden assumptions;
- expected state-effect descriptions;
- SceneComposition attachment.

### Gap

NarrativeDirector currently derives `immediateSteps` directly from intent and broad context.

It does not own an explicit structured answer to:

> “What meaningfully changed because of this resolved action?”

That is the exact missing responsibility.

### Decision

StoryBeatDirector must be upstream of NarrativeDirector.

NarrativeDirector should consume the StoryBeatContract and continue owning presentation direction.

It must not duplicate beat inference once the contract exists.

---

# 7. SceneComposition Audit

`server/domain/sceneComposition.ts` currently derives:

- beat type;
- narrative focus;
- focal entity;
- emotional movement;
- physical beat;
- sensory anchor;
- dialogue act;
- subtext;
- reveal/withhold;
- reaction priority;
- tension;
- pacing;
- closing beat.

### Gap

Its beat type is currently inferred mainly from player intent.

For example, movement tends to become `TRANSITION`.

That is not enough to distinguish:

- meaningless travel prose;
- meaningful approach;
- approach that reveals something;
- approach that triggers a reaction.

### Decision

N13 should consume the StoryBeatContract.

StoryBeatDirector owns **meaning**.

SceneComposition owns **presentation staging**.

---

# 8. N17 Audit

N17 remains the episode-shape authority.

It answers:

> “What is the shape/trajectory of the current episode?”

StoryBeatDirector answers:

> “What meaningful thing happened in this particular turn?”

These are complementary, not competing.

No N17 replacement is required.

---

# 9. N18 / CH19 Audit

Commit `5343e74` added the live presentation-quality gate.

Current behavior correctly detects and repairs:

- scenery-dominated narration;
- flat/repetitive presentation;
- N18 improvement;
- invalid action-mode continuity.

It supports one bounded rewrite through `narrative.review`.

### Remaining gap

A fluent narration can satisfy lexical scenery/action heuristics while still failing to communicate the actual consequence.

Example:

> “You step away from the threshold, boots striking the dark stone as the wind crosses the crag.”

This acknowledges movement and sensory detail but still may not communicate why the movement mattered.

### Decision

Keep 5343e74.

Add StoryBeat fidelity as a distinct semantic presentation check rather than making N18 itself the semantic beat authority.

---

# 10. Every Current `generateNarrativeOnly` Caller

The source audit identified these caller classes:

### A. Main freeform turn

`server/mockEngine/serverMockAuthority.ts`

Already passes the typed `ActionResolution`.

**Status:** correctly connected at the resolution boundary.

### B. Narration regeneration

`server/api/gameRoutes.ts`

Already retrieves:

`action.actionResolution`

and passes it to `generateNarrativeOnly`.

**Status:** correctly connected.

### C. CombatPlayerActionService

`server/domain/combatPlayerActionService.ts`

Currently supplies:

- player action;
- mechanical summary;
- target name/HP;

but calls `generateNarrativeOnly` **before constructing the final CombatNarrativeResolution** and does not pass a typed `ActionResolution`.

**Status:** connection gap.

### D. CombatEncounterService

`server/domain/combatEncounterService.ts`

Has the same structural gap in its pre-combat narration path.

**Status:** connection gap.

### E. TurnIntegrationHarness

`server/domain/turnIntegrationHarness.ts`

Directly constructs NarrativeDirector for the deterministic test path and does not exercise the future StoryBeatDirector.

**Status:** test/integration connection gap.

### F. Opening scene generation

`server/services/openingSceneService.ts`

Opening scenes are not player-action turn resolutions.

**Decision:** do not force StoryBeatDirector into opening generation. N18 opening quality gates remain authoritative for that path.

---

# 11. Combat Resolution Connection Decision

Combat already has a canonical `CombatNarrativeResolution`.

The implementation must add an **adapter into ActionResolution**, not create a second beat-specific combat authority.

Preferred ownership:

```
Combat canonical resolution
    ↓
ActionResolution adapter
    ↓
StoryBeatDirector
    ↓
NarrativeDirector
```

This preserves the architecture:

- combat remains combat authority;
- ActionResolution remains the canonical narration envelope;
- StoryBeatDirector remains presentation meaning authority.

---

# 12. Player Intent / Coreference Finding

`PlayerIntentInterpreter.deterministic()` currently extracts explicit targets from the action text and does not contain a general pronoun/salience resolver for references such as:

> “I push towards it.”

Therefore StoryBeatDirector must **not** guess what “it” means.

This is a separate intent/coreference concern.

### Decision

During this implementation:

- consume resolved targets when available;
- consume canonical focus/local spatial state;
- never infer an unresolved pronoun as canonical target;
- add regression coverage ensuring StoryBeatDirector does not invent a target.

A separate coreference/salience phase may be addressed later if required.

---

# 13. StoryBeatDirector Authority Boundary

The Director will be:

- presentation-only;
- ephemeral;
- deterministic initially;
- evidence-bound;
- provider-independent.

It will not:

- write the repository;
- mutate canonical state;
- resolve combat;
- resolve checks;
- update NPC agency;
- update relationships;
- create plot beats;
- create durable memories;
- close threads;
- reveal hidden facts;
- choose future player actions;
- invent NPC reactions.

---

# 14. Producer → Contract → Consumer Matrix

| Producer | Contract | Consumer |
|---|---|---|
| ActionResolution | StoryBeatDirector input | StoryBeatDirector |
| CurrentSituation | StoryBeatDirector input | StoryBeatDirector |
| PlayerIntent | StoryBeatDirector input | StoryBeatDirector |
| bounded research | StoryBeatDirector input | StoryBeatDirector |
| StoryBeatDirector | StoryBeatContract | NarrativeDirector |
| StoryBeatContract | plan projection | SceneComposition |
| StoryBeatContract | prompt section | NarrativePromptBuilder |
| StoryBeatContract | semantic fidelity check | AI Orchestrator |
| accepted beat metadata | telemetry only | StorySessionRecorder / quality audit |

No producer or consumer should bypass these boundaries.

---

# 15. Required Implementation Connection Map

The implementation must establish all of these edges:

```
ActionResolution
        ↓
StoryBeatDirector.resolve()
        ↓
NarrativeDirector.create(...storyBeat)
        ↓
EphemeralNarrativePlan.storyBeat
        ↓
SceneCompositionEngine.resolve(...storyBeat)
        ↓
NarrativePromptBuilder
        ↓
full prompt
compact prompt
micro prompt
        ↓
narrative.generate
        ↓
StoryBeat fidelity validation
        ↓
existing N18/CH19 + semantic/pacing/action gates
        ↓
bounded narrative.review when authorized
        ↓
accepted presentation / deterministic fallback
```

In addition:

```
Combat canonical result
        ↓
ActionResolution adapter
        ↓
generateNarrativeOnly
        ↓
same StoryBeat pipeline
```

and:

```
Narration regeneration
        ↓
stored ActionResolution
        ↓
same StoryBeat pipeline
```

---

# 16. Phase 0 Decision

### Approved implementation shape

Create:

- `server/domain/storyBeatDirector.ts`
- `StoryBeatContract` in the same module initially unless type ownership requires separation.

Modify:

- `server/domain/narrativeDirector.ts`
- `server/domain/sceneComposition.ts`
- `server/domain/narrativePromptBuilder.ts`
- `server/domain/aiOrchestrator.ts`
- combat narration callers
- test/integration harness
- regression suites
- architecture audit documentation

Potentially extend:

- `server/domain/actionResolution.ts` with a canonical combat adapter.

### Explicitly rejected

Do not create:

- a second simulation layer;
- a second situation engine;
- a beat persistence engine;
- an AI beat-authority call;
- another NarrativeDirector.

---

# 17. Initial Regression Matrix

The implementation must reproduce and prevent:

1. scenery-only movement prose;
2. movement + no meaningful change when canonical state provides only movement;
3. observation that ignores the actual focal target;
4. attack/impact narration that omits a canonical reaction/consequence;
5. information-seeking prose that gives only atmosphere;
6. failed action being narrated as success;
7. blocked action being narrated as completed;
8. quiet/no-op action being artificially dramatized;
9. hidden reaction/information being invented;
10. passive listening becoming player speech;
11. canonical target being replaced with an unrelated scene target;
12. compact prompts losing the StoryBeatContract;
13. deterministic fallback bypassing the beat;
14. combat narration bypassing ActionResolution;
15. regeneration bypassing the beat;
16. one bounded rewrite remaining the maximum presentation repair call.

---

# 18. Audit Conclusion

The architecture already contains almost every required ingredient.

The missing piece is a **single explicit semantic presentation contract between canonical resolution and narrative staging**.

The correct solution is therefore a thin, evidence-bound `StoryBeatDirector` that:

```
does not simulate reality
does not own narrative persistence
does not replace NarrativeDirector
does not call an AI model
does not invent consequences

but does answer:

“What meaningful thing happened in this turn,
what can the player perceive about it,
and what must the narrator communicate?”
```

**Phase 0 exit condition is satisfied at source-audit level.**

Next phase: implement the contract and wire every producer/consumer edge listed above before attempting literary tuning.
