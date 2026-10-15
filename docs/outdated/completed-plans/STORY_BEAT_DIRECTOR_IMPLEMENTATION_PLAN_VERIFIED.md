# StoryBeatDirector — Detailed Implementation Plan

## Status

**Status:** VERIFIED — RUNTIME TESTED  
**Owner:** Narrative presentation architecture  
**Target branch:** `main` after implementation branch verification  
**Depends on:** N13 Scene Composition, N14 NPC Expressive Identity, N15 Social Attention Topology, N16 Memory Retrieval, N17 Narrative Episode Projection, N18 Narrative Richness Evaluation, N19 Creative Model Tier/Cadence Routing, current live narration fidelity gates, `5343e74`.

---

## 1. Executive Summary

Dreamville currently has strong canonical simulation, intent interpretation, bounded current-situation projection, narrative research, episode projection, scene composition, narrative quality evaluation, and live narration repair.

The remaining defect is deeper than prose quality:

> The system can detect that narration is too descriptive, but it does not have one explicit presentation contract that answers **what is meaningful about the resolved turn** before the prose model writes it.

This creates a recurring failure mode:

1. The player performs a meaningful action.
2. Canonical systems resolve the action.
3. The narrative pipeline receives the action and surrounding situation.
4. The narrator correctly describes movement, scenery, sound, or physical details.
5. The prose can pass lexical/action/richness checks.
6. The turn still fails to communicate what changed, what was learned, who reacted, or why the action mattered.

Examples:

- Moving toward a disturbance becomes a description of boots, stone, wind, and distance.
- Throwing a dagger becomes a description of the impact sound without the reaction or consequence.
- Approaching a guarded target becomes a description of the arena rather than the target, guards, tactical change, or newly observable information.

The proposed solution is a new ephemeral **StoryBeatDirector**.

It is not another canonical authority and it does not replace the existing NarrativeDirector.

Its responsibility is:

> **Given the player's interpreted intent, the canonical resolution, the bounded situation before/after the action, and authorized evidence, determine the meaningful narrative beat that the current turn should communicate.**

The existing `NarrativeDirector` then remains responsible for staging/presentation planning.

The narrator remains responsible for literary expression.

N18/N8/fidelity gates remain responsible for verifying the resulting presentation.

---

# 2. Architectural Principle

Dreamville's governing authority rule remains unchanged:

> **Simulation determines what happened. Narration describes what happened. AI proposes or transforms information but does not become canonical authority.**

StoryBeatDirector must therefore be:

- deterministic where possible;
- ephemeral;
- evidence-bound;
- presentation-only;
- non-persistent;
- non-canonical;
- unable to create world state;
- unable to create plot state;
- unable to create memories;
- unable to close threads;
- unable to change NPC state;
- unable to invent future events;
- unable to choose a consequential player action;
- unable to reveal hidden information;
- unable to override epistemic boundaries.

It is a **semantic presentation projection**, not a simulation system.

---

# 3. Why Existing Systems Are Not Enough

## 3.1 Current strengths

Dreamville already has:

- `PlayerIntentInterpreter`
- canonical action resolution
- `ResolutionGate`
- `CurrentSituationBuilder`
- `NarrativeResearchPipeline`
- `NarrativeDirector`
- `SceneCompositionEngine`
- `NarrativeEpisodeProjectionEngine`
- `NarrativeRichnessEvaluator`
- `NarrativePacingEngine`
- semantic narrative review
- literary review
- live action-fidelity validation
- environment-excess detection
- bounded `narrative.review` rewriting
- provider fallback and call budgets

These systems must remain.

## 3.2 The missing semantic responsibility

The current pipeline effectively has:

`Reality -> Situation/Intent -> Presentation Plan -> Prose`

The missing explicit step is:

`Reality -> Meaningful Beat -> Presentation Plan -> Prose`

The system needs to distinguish:

### Action representation

> “The player moved toward the trench.”

from:

### Meaningful beat

> “The player moved close enough that the disturbance became clearly directional and the nearby hounds reacted.”

The first is an action description.

The second is narrative substance.

## 3.3 Why N18 cannot be the solution

N18 evaluates presentation richness.

It can identify:

- weak specificity;
- weak progression;
- weak reaction;
- weak tension;
- weak closure;
- repetitive or flat prose;
- insufficient agency.

The new `5343e74` live gate correctly makes environment-heavy narration actionable by allowing one bounded rewrite.

However, a short and fluent response can still evade an environment-volume detector:

> “You step away from the threshold, boots striking stone as the wind sweeps across the crag.”

This contains action, sensory detail, and location grounding.

It may still fail the actual story because it does not communicate the meaningful consequence of the approach.

N18 should remain a quality evaluator. It should not become a substitute for a semantic beat authority.

---

# 4. Target Architecture

The intended live path becomes:

```
Player Input
    |
    v
PlayerIntentInterpreter
    |
    v
Canonical Resolution
    |
    +---- ResolutionGate
    |
    v
Situation BEFORE
    |
    v
Canonical Action / Simulation
    |
    v
Situation AFTER
    |
    v
StoryBeatDirector
    |
    |  StoryBeatContract
    v
NarrativeDirector
    |
    |  EphemeralNarrativePlan
    v
SceneCompositionEngine
    |
    v
NarrativeEpisodeProjection / N13-N17 projections
    |
    v
NarrativePromptBuilder
    |
    v
Narrative Provider
    |
    v
Semantic / Literary / N18 / Pacing / Fidelity Validation
    |
    +---- bounded narrative.review when authorized
    |
    v
Accepted Presentation
    |
    v
StorySessionRecorder / memory / continuity consumers
```

Important:

**StoryBeatDirector does not replace NarrativeDirector.**

The two have different questions:

| System | Question |
|---|---|
| Canonical simulation | What actually happened? |
| StoryBeatDirector | What is meaningful about what happened? |
| NarrativeDirector | How should that moment be staged? |
| SceneCompositionEngine | What presentation structure should the scene use? |
| Narrator | How should it be expressed? |
| N18/N8/fidelity | Did the expression remain good and faithful? |

---

# 5. StoryBeatContract

The first implementation artifact should be a typed contract.

Suggested location:

`server/domain/storyBeatDirector.ts`

Suggested supporting type:

`server/domain/storyBeatContract.ts`

If the project convention strongly favors one-file domain modules, these may remain together.

## 5.1 Proposed contract

Conceptually:

```ts
interface StoryBeatContract {
  beatType: StoryBeatType;

  primaryAction: string;

  meaningfulChange: string;

  playerVisibleChange: string[];

  newInformation: string[];

  affectedEntityIds: string[];

  reactionOpportunities: string[];

  narrativeFocus: string[];

  causalLink: string;

  unresolvedConsequence?: string;

  continuityAnchors: string[];

  mustMention: string[];

  mustNotInvent: string[];

  evidenceIds: string[];

  confidence: number;

  fallbackReason?: string;
}
```

The exact shape must be refined against existing domain types before implementation.

## 5.2 Beat types

Do not create dozens of types.

Start with a conservative finite set:

- `APPROACH`
- `DEPARTURE`
- `DISCOVERY`
- `OBSERVATION`
- `INTERACTION`
- `DIALOGUE`
- `REACTION`
- `CONFRONTATION`
- `ATTEMPT`
- `CONSEQUENCE`
- `ESCALATION`
- `RESOLUTION`
- `TRANSITION`
- `AFTERMATH`
- `PAUSED`

The engine must prefer the smallest defensible classification.

It must not manufacture escalation simply because escalation is narratively interesting.

---

# 6. Inputs

StoryBeatDirector should consume existing authorized projections.

## Required inputs

### Player intent

From `PlayerIntentInterpreter`.

Must include enough semantic information to understand:

- action;
- action mode;
- target;
- location target;
- observation intent;
- speech intent;
- information goal;
- explicit entities;
- normalized intent;
- confidence.

The Director must never reinterpret raw player text when an authoritative interpreted intent exists.

### Canonical action resolution

The resolved action is the strongest source for:

- what actually happened;
- success/failure;
- actual effects;
- movement;
- checks;
- reactions;
- state changes;
- affected entities;
- consequences.

The Director must not infer a consequence that the canonical resolution does not support.

### Situation BEFORE

The system must retain or construct the pre-resolution projection where available.

This allows the Director to answer:

> What was true before the action?

### Situation AFTER

The Director must consume a post-resolution bounded projection.

This is essential.

The Director should not attempt to calculate canonical state itself.

### Narrative research

Only selected, authorized narrative research blocks may be consumed.

Research remains bounded by the existing research/security architecture.

### Existing narrative continuity

Consume:

- recent accepted turns;
- active thread projections;
- current episode projection;
- continuity anchors;
- novelty information where useful.

These remain owned by their existing systems.

---

# 7. BEFORE → AFTER Delta

This is one of the most important implementation requirements.

StoryBeatDirector should receive an explicit presentation-safe delta.

Conceptually:

```ts
interface StoryBeatDelta {
  changedFields: string[];

  positionChanged: boolean;
  distanceChanged?: {
    targetId: string;
    before?: string;
    after?: string;
  };

  newlyVisibleEntities: string[];
  noLongerVisibleEntities: string[];

  newlyAvailableInformation: string[];
  removedInformation: string[];

  entityReactionChanges: string[];
  environmentalChanges: string[];

  actionOutcome: string;
  success: boolean;
}
```

This is a **projection**, not a second simulation engine.

Where canonical systems already expose equivalent information, reuse those projections rather than creating duplicate calculations.

The audit phase must identify the authoritative source for each field before any implementation begins.

---

# 8. Core StoryBeatDirector Algorithm

The first implementation should be deterministic.

### Step 1 — Validate inputs

If canonical resolution is missing or invalid:

- do not invent a meaningful change;
- produce a low-confidence fallback beat;
- identify the player's explicit action as the minimum safe focus.

### Step 2 — Determine actual change

Compare authorized BEFORE and AFTER projections.

Priority:

1. canonical state/effect;
2. canonical entity reaction;
3. player-visible information change;
4. spatial/proximity change;
5. episode/continuity change;
6. action itself if no meaningful consequence exists.

### Step 3 — Determine player-visible consequence

Not every canonical change belongs in narration.

Filter through:

- epistemic boundary;
- visibility;
- player knowledge;
- current situation;
- authorized narrative research.

### Step 4 — Identify primary beat

Choose exactly one primary beat whenever possible.

Example:

```
Movement + new sound information + NPC reaction
```

Primary beat:

```
APPROACH / DISCOVERY
```

Secondary details:

- hound reaction;
- terrain;
- atmosphere.

### Step 5 — Identify reaction

Use canonical reactions where available.

Never create an NPC reaction merely because the story would benefit from one.

### Step 6 — Identify information gain

Ask:

> What can the player now know/notice that they could not reasonably know before this action?

If nothing changed, the Director must say so rather than fabricate discovery.

### Step 7 — Identify narrative focus

Rank:

1. meaningful change;
2. player action/result;
3. affected entity/reaction;
4. newly available information;
5. active thread pressure;
6. sensory environment.

This ordering is specifically intended to stop scenery from becoming the subject of the turn.

### Step 8 — Establish anti-invention constraints

The Director explicitly records what it must not imply.

Examples:

- patrol arrival not confirmed;
- source of disturbance unknown;
- target's internal thoughts unavailable;
- hidden guard orders unavailable;
- future combat not resolved.

### Step 9 — Produce contract

Return the bounded `StoryBeatContract`.

No persistence.

---

# 9. Example: Trench of Echoes

## Before

```
Location: Solitary Spire
Player: Kellan Vane
Disturbance: strange acoustic disturbance
Distance: FAR
Hounds: present
Patrol: nearby
```

## Player action

> I move towards the trenches.

## Canonical resolution

```
movement: success
destination: toward Trench of Echoes
distance: FAR -> NEAR
no combat
no patrol arrival
no confirmed source
```

## StoryBeatDirector output

```
BEAT:
APPROACH / DISCOVERY

PRIMARY ACTION:
Player approaches Trench of Echoes.

MEANINGFUL CHANGE:
Distance to the disturbance decreases.

PLAYER-VISIBLE CHANGE:
The disturbance becomes more distinct/directional.

REACTION:
Nearby hounds may become visibly more alert if that reaction is present
in canonical state.

NEW INFORMATION:
The sound is coming from deeper within the trench.

FOCUS:
Disturbance and immediate reaction.

SUPPORTING DETAIL:
Terrain, wind, stone.

MUST NOT:
Invent the source.
Invent patrol arrival.
Choose the player's next action.
Reveal hidden information.
```

The narrator can then write beautifully, but it has a **job**.

---

# 10. Example: Dagger Impact

## Player action

> I throw the dagger at the door.

## Canonical resolution

Suppose canonical state says:

```
dagger: hit door
door: damaged
guard: alerted
target: still alive
```

The StoryBeatContract should become:

```
BEAT:
CONSEQUENCE

MEANINGFUL CHANGE:
The thrown dagger damages the door and draws guard attention.

PLAYER-VISIBLE CHANGE:
The impact changes the door and causes the guard to react.

REACTION:
Guard attention shifts toward the impact.

FOCUS:
Door damage + guard reaction.

MUST NOT:
Invent the door breaking unless canon says it broke.
Invent an attack by the guard.
Decide what the player does next.
```

The narrator must therefore communicate the **impact on the situation**, not merely:

> “The dagger clangs against the door.”

---

# 11. Integration With Existing NarrativeDirector

The existing NarrativeDirector remains.

Its input should gain:

```ts
storyBeat?: StoryBeatContract
```

Its job remains:

- presentation objective;
- focus;
- beat staging;
- emotional/physical beat;
- dialogue act;
- subtext;
- reveal/withhold;
- reaction priority;
- tension;
- pacing;
- closing beat;
- optional hook;
- fallback metadata.

The NarrativeDirector should **not recompute meaningful change** if StoryBeatDirector already supplied it.

This prevents semantic duplication.

---

# 12. Integration With SceneComposition

N13 should consume the StoryBeatContract.

Mapping:

| StoryBeat | Scene Composition |
|---|---|
| meaningfulChange | primary beat |
| playerVisibleChange | physical/event beat |
| affected entities | reaction priority |
| newInformation | reveal |
| mustNotInvent | forbidden assumptions |
| unresolvedConsequence | closing tension |
| narrativeFocus | focal entity/topic |
| beatType | beat type |
| continuityAnchors | continuity constraints |

N13 remains presentation-only.

---

# 13. Integration With N17

N17 remains the episode-shape authority.

StoryBeatDirector should not create a new episode.

Instead:

```
N17 = "Where is this episode going?"
StoryBeat = "What meaningful thing happened in this turn?"
```

N17 can provide context to StoryBeatDirector.

StoryBeatDirector can provide the current beat to NarrativeDirector/N17 consumers.

Neither should mutate the other.

---

# 14. Integration With N18

N18 remains the quality evaluator.

Add a new richness dimension or targeted sub-check only if the audit proves it is necessary:

### Meaningful Beat Fidelity

The evaluator should eventually be able to determine:

> Does the final narration communicate the accepted StoryBeatContract?

This must be more semantic than simple keyword matching.

Initial implementation should use deterministic evidence where possible.

Examples:

- required entity mention;
- required visible change;
- action-result relation;
- canonical reaction mention;
- information anchor;
- forbidden invention check.

Do not require every field to appear literally.

A good narrative can express the same beat naturally.

---

# 15. Integration With the Existing CH19 / 5343e74 Gate

The current `5343e74` patch remains active.

Its environment-excess detector and bounded rewrite should not be removed.

Instead, its rewrite trigger becomes one of several presentation-quality signals.

Eventually:

```
StoryBeatContract
      |
      v
Narrative generation
      |
      v
Beat fidelity check
      +
N18
      +
N8
      +
semantic safety
      +
environment excess
      |
      v
Accept / bounded review / fallback
```

The existing one-call `narrative.review` budget remains.

Do not introduce an unlimited rewrite loop.

---

# 16. Critical Acceptance Rule

A narration should not be considered substantively successful merely because it:

- mentions the player;
- contains a movement verb;
- names the target;
- contains sensory detail;
- contains a consequence verb;
- passes a richness score.

It must communicate the **accepted meaningful beat** to an appropriate degree.

Example:

### Reject

> You walk toward the trench, boots grinding against the black stone while cold wind crosses the ridge.

Why:

- movement acknowledged;
- atmosphere present;
- no meaningful result.

### Accept

> You descend toward the Trench of Echoes. With each step, the strange vibration sharpens from a diffuse hum into a directional pulse rising from somewhere below.

Why:

- action;
- changed perception;
- causal connection;
- new information;
- no invented resolution.

---

# 17. Failure Handling

StoryBeatDirector must never become a single point of failure.

## If StoryBeatDirector fails

Fallback hierarchy:

1. valid StoryBeatContract;
2. conservative action-based beat;
3. existing NarrativeDirector behavior;
4. deterministic narration fallback if generation fails.

Never:

- fail the canonical turn;
- mutate state;
- invent a consequence.

## If BEFORE/AFTER delta is incomplete

Use only the authorized information available.

Mark:

```
confidence: LOW
fallbackReason: "post-resolution delta incomplete"
```

Do not infer hidden state.

## If the beat conflicts with canonical resolution

Canonical resolution wins.

The StoryBeatContract is discarded/rebuilt.

---

# 18. Testing Strategy

Implementation must be test-first at the contract boundaries.

## 18.1 Unit tests

Cover:

- successful movement;
- failed movement;
- movement with no meaningful new information;
- movement with newly visible information;
- approach + NPC reaction;
- observation + information gain;
- observation with no information gain;
- successful interaction;
- failed interaction;
- attack with reaction;
- attack without reaction;
- item acquisition;
- item examination;
- dialogue;
- passive listening;
- environmental change;
- consequence/aftermath;
- no-op actions.

## 18.2 Anti-invention tests

Verify StoryBeatDirector never:

- creates an NPC reaction;
- creates a future event;
- resolves an unresolved thread;
- invents hidden information;
- changes canonical state;
- chooses a player action;
- reveals inaccessible knowledge.

## 18.3 Regression tests for the actual reported defect

At minimum:

### Case A — movement filler

Input:

> I move toward the trench.

Bad narration:

> boots + stone + wind + distance

Expected:

- beat identifies approach;
- meaningful change is represented if canonical state provides one;
- scenery cannot become the primary beat.

### Case B — target observation

Input:

> I watch the viewing box.

Expected:

- target/guards remain focal;
- environment does not displace the target.

### Case C — dagger impact

Input:

> I throw the dagger.

Expected:

- canonical impact is represented;
- reaction/consequence appears when canonical state supports it.

### Case D — genuine quiet turn

Input:

> I wait.

If canonically nothing meaningful changes:

- the system must not invent a reaction;
- quiet narration is allowed;
- the beat can explicitly be `PAUSED` or `TRANSITION`.

This is critical. The system must not turn every turn into artificial drama.

---

# 19. Integration Tests

Add a dedicated suite:

`tests/story-beat-director.integration.test.ts`

Verify:

```
PlayerIntent
  ->
Canonical Resolution
  ->
Before/After
  ->
StoryBeatDirector
  ->
NarrativeDirector
  ->
PromptBuilder
  ->
Narrator
  ->
Validation
```

Test both:

- deterministic/mock providers;
- failure/fallback paths.

The integration suite must prove that the StoryBeatContract actually reaches the final prompt.

A contract that is generated but never serialized is considered a failed implementation.

---

# 20. Prompt Integration

NarrativePromptBuilder remains the **sole prompt serializer**.

Add a dedicated section:

```
## CURRENT STORY BEAT

What meaningfully changed this turn:
...

What the player can perceive:
...

Who/what reacted:
...

What information became available:
...

Narrative focus:
...

Do not invent:
...
```

The prompt must explicitly state:

> This is a presentation contract derived from canonical resolution. Do not treat it as permission to create additional events.

Compact prompt paths must preserve the essential beat fields under the hard token budget.

---

# 21. Provider-Agnostic Behavior

The StoryBeatContract must be provider-independent.

Gemini, Groq, OpenRouter, local models, emergency fallback, and future models should receive the same semantic beat contract.

Model quality should affect:

- prose quality;
- dialogue quality;
- literary style;
- richness.

It must not affect canonical interpretation of the beat.

---

# 22. AI Call Budget

The StoryBeatDirector should initially be **deterministic**.

Do not spend an additional AI call merely to determine the beat.

This is intentional.

The architecture should remain:

```
Canonical systems determine reality.
Deterministic projection determines narrative meaning.
AI expresses it.
AI review repairs presentation.
```

If a future research phase demonstrates that deterministic beat extraction is insufficient for a specific class of narrative reasoning, an AI-assisted advisory layer can be evaluated separately. It must never become canonical authority.

---

# 23. Memory and Persistence Boundary

StoryBeatContract is ephemeral.

It should normally not be persisted.

The accepted turn's actual narrative consequences can flow into existing:

- NarrativeMemoryLifecycle;
- StorySessionRecorder;
- plot/thread systems;
- continuity systems.

Those systems remain owners of persistence.

Do not create:

`StoryBeatStore`

unless a later audit proves a genuine forensic requirement.

For debugging, the existing StorySessionRecorder/narrative quality audit can capture the beat as derived metadata if useful.

---

# 24. Observability

Add read-only audit information.

Suggested:

```ts
storyBeatAudit?: {
  beatType;
  meaningfulChange;
  primaryFocus;
  confidence;
  sourceEvidenceIds;
  fallbackUsed;
  beatFidelity?: {
    decision;
    missingElements;
    forbiddenElements;
  };
}
```

This should be presentation telemetry.

It must not be used as a canonical mutation pathway.

The existing `narrativeQualityAudit` from `5343e74` remains separate but can reference the StoryBeat audit.

---

# 25. Migration Plan

## Phase 0 — Audit

Before writing production code:

1. Identify the authoritative BEFORE situation.
2. Identify the authoritative AFTER situation.
3. Identify canonical action-result/effect fields.
4. Identify canonical reaction projections.
5. Identify current target/coreference behavior.
6. Identify all current NarrativeDirector callers.
7. Identify all live continuation paths.
8. Identify compact prompt paths.
9. Identify all existing consequence/fidelity gates.
10. Identify tests that currently assert narrative content.
11. Verify no duplicate authority already exists under another name.

**Exit condition:** exact producer/consumer map documented.

---

## Phase 1 — Contract

Create:

`StoryBeatContract`

and beat-type definitions.

Add unit tests for serialization, fallback, and authority boundaries.

**Exit condition:** contract is stable and has no canonical mutation capability.

---

## Phase 2 — Deterministic Director

Implement:

`StoryBeatDirector.resolve()`

Responsibilities:

- derive BEFORE/AFTER delta;
- select meaningful change;
- select primary beat;
- identify visible information gain;
- identify canonical reactions;
- establish focus;
- establish anti-invention constraints;
- return confidence/fallback metadata.

**Exit condition:** all deterministic beat tests pass.

---

## Phase 3 — Post-Resolution Situation

Ensure live continuation has a bounded post-resolution situation.

Do not create another CurrentSituation authority.

Extend the existing situation projection or add a presentation-safe after-resolution projection if necessary.

**Exit condition:** StoryBeatDirector receives reliable BEFORE/AFTER evidence.

---

## Phase 4 — NarrativeDirector Integration

Pass:

`storyBeat`

into the existing NarrativeDirector.

Remove any duplicate meaningful-change inference found during integration.

**Exit condition:** NarrativeDirector consumes the beat rather than recreating it.

---

## Phase 5 — Prompt Integration

Update NarrativePromptBuilder.

Add:

- full StoryBeat section;
- compact StoryBeat section;
- anti-invention boundaries.

**Exit condition:** integration test proves the beat reaches the provider prompt.

---

## Phase 6 — Quality Verification

Add beat fidelity evaluation.

Integrate with:

- N18;
- N8;
- semantic review;
- live action-fidelity;
- CH19 environment-excess gate.

Do not remove the existing CH19 behavior.

**Exit condition:** scenery-only and action-without-consequence failures are distinguishable and repaired correctly.

---

## Phase 7 — Real Regression Matrix

Run:

- movement;
- approach;
- observation;
- dialogue;
- combat;
- item use;
- travel;
- social interaction;
- failed actions;
- no-op actions;
- quiet scenes;
- NPC reaction scenes;
- hidden-information boundaries.

**Exit condition:** no regression in canonical state or player agency.

---

## Phase 8 — Long-Session Verification

Run:

- persistent multi-turn story;
- 50-turn narrative continuity;
- 125-turn marathon;
- chaos/failure injection;
- provider outage;
- malformed response;
- timeout;
- retry-budget exhaustion;
- deterministic fallback.

Measure:

- beat continuity;
- hallucination rate;
- scenery dominance;
- action fidelity;
- rewrite frequency;
- token cost;
- latency.

**Exit condition:** no significant regression from the current long-session baseline.

---

## Phase 9 — Re-Audit

Perform a full surgical audit.

Specifically search for:

- duplicate beat authorities;
- canonical mutations;
- prompt bypasses;
- live paths bypassing StoryBeatDirector;
- compact paths losing the beat;
- stale BEFORE/AFTER data;
- provider-specific behavior;
- fallback divergence;
- hidden-information leaks.

**Exit condition:** architecture audit passes.

---

# 26. Acceptance Criteria

The implementation is not complete merely because tests pass.

It must satisfy all of the following.

### Semantic

- Every consequential live turn has a defensible primary beat.
- The beat is derived from canonical resolution and authorized projections.
- Meaningful changes are distinguished from mere action descriptions.
- Quiet turns remain allowed when canonically justified.

### Narrative

- The narrator receives a clear substance-first contract.
- Movement does not automatically become scenery exposition.
- Consequences/reactions are surfaced when canonically present.
- New information is surfaced when canonically available.
- Environment supports the beat instead of replacing it.

### Authority

- No canonical mutation.
- No hidden-information leaks.
- No invented NPC reactions.
- No forced future events.
- No player-action takeover.

### Performance

- No mandatory extra AI call for beat generation.
- Existing rewrite budget remains bounded.
- Compact prompts retain essential beat information.
- Long-session latency remains within acceptable limits.

### Reliability

- Deterministic fallback exists.
- Provider failure does not corrupt state.
- Beat failure cannot prevent canonical turn completion.
- Existing `5343e74` rewrite behavior remains intact.

---

# 27. Definition of Done

StoryBeatDirector is considered complete only when:

- [ ] Architecture audit is complete.
- [ ] Existing authority map has no conflict.
- [ ] BEFORE/AFTER projection is identified and tested.
- [ ] StoryBeatContract is implemented.
- [ ] Deterministic StoryBeatDirector is implemented.
- [ ] Unit tests pass.
- [ ] NarrativeDirector consumes the contract.
- [ ] SceneComposition consumes the appropriate beat fields.
- [ ] NarrativePromptBuilder serializes the beat.
- [ ] Compact prompt path preserves the beat.
- [ ] Beat-fidelity validation is implemented.
- [ ] N18/CH19 integration is verified.
- [ ] Existing action-fidelity gates still pass.
- [ ] No canonical state mutation occurs.
- [ ] No epistemic boundary regression occurs.
- [ ] No player-agency regression occurs.
- [ ] Provider fallback paths pass.
- [ ] Retry/call-budget tests pass.
- [ ] Real reported movement/scenery regression passes.
- [ ] Dagger/consequence regression passes.
- [ ] Quiet/no-op regression passes.
- [ ] Long-session marathon passes.
- [ ] Chaos/failure injection passes.
- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Production build passes.
- [ ] Relevant test suite passes.
- [ ] Full regression is run within available verification constraints.
- [ ] Final surgical architecture audit passes.
- [ ] Documentation is updated with final implementation status.

---

# 28. Explicit Non-Goals

This project does **not** intend to create:

- a second world simulator;
- a second NPC agency system;
- a second plot engine;
- a second memory system;
- a second epistemic system;
- a second context engine;
- a second AI router;
- a persistent StoryBeat database;
- an AI-controlled canonical authority;
- an automatic dramatic-event generator.

The StoryBeatDirector exists solely to bridge:

```
CANONICAL REALITY
        ↓
MEANINGFUL PRESENTATION BEAT
        ↓
NARRATIVE STAGING
        ↓
LITERARY EXPRESSION
```

---

# 29. Final Target

The desired behavior is not:

> “Make the narrator less descriptive.”

It is:

> **Make every narrative turn understand what happened, what changed, what matters now, and what the player can perceive — before asking a language model to turn that moment into prose.**

That is the architectural purpose of StoryBeatDirector.

The final system should make the narrator behave less like a camera describing a beautiful room and more like a GM who understands why the player's latest decision matters — while remaining strictly subordinate to canonical simulation.

---

## 30. References

- `docs/SURGICAL_ARCHITECTURE_REGISTRY_V1.md`
- `docs/N17_NARRATIVE_EPISODE_PROJECTION_AUDIT.md`
- `docs/N18_NARRATIVE_RICHNESS_EVALUATION_AUDIT.md`
- `docs/N19_CREATIVE_MODEL_TIER_CADENCE_ROUTING_AUDIT.md`
- `docs/N13_SCENE_COMPOSITION_AUDIT.md`
- `docs/N14_NPC_EXPRESSIVE_IDENTITY_AUDIT.md`
- `docs/N15_SOCIAL_ATTENTION_TOPOLOGY_AUDIT.md`
- `docs/N16_SEMANTIC_EPISODIC_MEMORY_AUDIT.md`
- `docs/DREAMVILLE_DEEP_IMPLEMENTATION_SPECIFICATION.md`
- Commit `5343e74e49b1cf1af681951a052ad472079492fb` — live N18 presentation-quality gate.
- Commit `3e553f69f901aaa2327e7b4e5149639fd97504a6` — live action/situation/consequence fidelity gate.

---

**Important:** This plan has now been implemented and runtime-verified on `main`. Phase 0 confirmed that existing ActionResolution + CurrentSituation projections provide the required evidence without creating a duplicate simulation authority.
