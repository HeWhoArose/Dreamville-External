# Dreamville — Deep Implementation Specification
## Context-Driven Narrative, World State, AI Orchestration, UI, and End-to-End Integration

**Document status:** Implementation specification  
**Repository:** `HeWhoArose/Dreamville-External`  
**Branch:** `main`  
**Purpose:** This document is an execution manual. It is intentionally more detailed than a roadmap. An engineer or coding agent following it must be able to implement each phase without inventing a separate architecture, skipping integration work, or treating a locally completed subsystem as complete before its consumers and producers are connected.

---

# 0. Non-Negotiable Development Contract

This project must be implemented as a connected system, not as a collection of isolated features.

The required lifecycle for **every phase and every meaningful subtask** is:

1. **Audit the current implementation.**
2. **Record what already exists.**
3. **Identify the exact integration points.**
4. **Define the contracts before changing behavior.**
5. **Implement the smallest coherent slice.**
6. **Immediately compile/type-check.**
7. **Run focused regression tests.**
8. **Run the complete test suite.**
9. **Re-audit the implementation against the phase specification.**
10. **Trace every producer to every consumer and every consumer back to its producer.**
11. **Test primary AI, model fallback, deterministic fallback, malformed output, unavailable provider, and empty/partial data.**
12. **Only then mark the phase complete.**

A phase is **not complete** because its new file exists, its UI renders, or its unit tests pass.

A phase is complete only when:

- its public contract exists;
- its producer is connected;
- its consumers are connected;
- its state lifecycle is connected;
- its API is connected;
- its UI is connected where applicable;
- its telemetry/debug visibility is connected;
- its fallback path is connected;
- regression tests cover the connection;
- the complete test suite passes;
- `npm run lint` passes;
- `npm test` passes;
- `npm run build` passes;
- and a second architectural audit finds no orphaned path.

## 0.1 Repository boundary

The repository README states that the authoritative core engine is maintained separately and that the external client must not silently become an alternative source of canonical game truth.

Therefore:

- canonical world state remains authoritative;
- deterministic rules remain authoritative;
- AI output is a proposal/presentation layer unless an explicitly approved authoritative command path commits it;
- the client must never infer that plausible prose equals state;
- when a feature requires a core-engine contract, document and implement the integration boundary rather than duplicating authority in the client.

Current repository areas that are relevant include:

- `server/domain/aiOrchestrator.ts`
- `server/domain/workingContextEngine.ts`
- `server/domain/narrativeContinuityEngine.ts`
- `server/services/storyActionAdvisor.ts`
- `server/api/gameRoutes.ts`
- `server/api/sensoryRoutes.ts`
- `src/components/StoryView.tsx`
- `tests/`
- `package.json`

Do not move authority between these layers merely to make a feature easier to implement.

---

# 1. Architectural Target

The target turn pipeline is:

```
PLAYER INPUT
    |
    v
1. Intent Interpretation
    |
    v
2. Current Situation Assembly
    |
    +--> canonical state
    +--> current scene
    +--> nearby entities
    +--> recent turns
    +--> relevant memories
    +--> relevant lore
    +--> player knowledge
    +--> active plot/open threads
    +--> world time
    +--> active conditions
    |
    v
3. Narrative Research
    |
    v
4. Ephemeral Narrative Plan
    |
    v
5. Narration Generation
    |
    v
6. Semantic Narrative Review
    |
    +--> accept
    |
    +--> repair/rewrite
    |
    +--> deterministic emergency narration
    |
    v
7. Canonical State Adjudication / Commit
    |
    v
8. Plot + Memory + Open Thread Update
    |
    v
9. Presentation Event / UI
    |
    v
NEXT TURN
```

The central design principle is:

> **Understand → research → plan → generate → lightly review → commit → remember.**

Do not build the system around:

> generate → detect bad prose with increasingly large regex lists → retry.

Deterministic validation remains essential for canonical truth and catastrophic contradictions. It must not become the primary mechanism for teaching the narrator how to understand ordinary human language.

Friends & Fables' public documentation describes a similar separation of responsibilities: research and working context gather relevant information, current-scene context limits the information to what matters now, plot and plan provide a compact narrative direction, and different AI tasks can use different context and models. Their documentation also explicitly says that when narration is wrong, missing context is often the underlying problem. This plan adopts those principles without attempting to reproduce proprietary implementation details.

---

# 2. Phase 0 — Baseline Audit and Contract Lock

## Objective

Establish an exact baseline before architectural changes begin. No later phase may rely on assumptions about a module that has not been inspected.

## Audit instructions

Inspect:

- all files under `server/domain/`;
- all files under `server/services/`;
- all API routes under `server/api/`;
- `src/components/StoryView.tsx`;
- all existing tests;
- `package.json`;
- TypeScript configuration;
- build configuration;
- AI task contracts;
- provider/model registry;
- world repository;
- canonical command/state boundaries;
- narrative continuity logic;
- working context assembly;
- story action advisor;
- memory/plot facilities;
- dice/check facilities;
- speech/transcription facilities;
- image/scene-generation facilities.

For each subsystem record:

| Subsystem | Current owner | Input | Output | Current consumers | Current producer | Fallback | Tests | Orphan risk |
|---|---|---|---|---|---|---|---|---|

Create this inventory before modifying code.

## Required baseline commands

Run:

```bash
npm run lint
npm test
npm run build
```

Record the exact baseline result.

Do not begin migration while the baseline is failing unless the failure is explicitly documented as pre-existing and unrelated.

## Required dependency map

Create a dependency graph for:

- `WorldRepository`
- `WorkingContextEngine`
- `MultiModelOrchestrator`
- `narrativeContinuityEngine`
- `storyActionAdvisor`
- `gameRoutes`
- `StoryView`
- model/task contracts
- memory/plot systems
- state-update systems.

The graph must show arrows in both directions where appropriate:

```
producer -> contract -> consumer
consumer -> request -> producer
```

A feature with no consumer is incomplete.

## Completion gate

Do not proceed until:

- baseline passes;
- architecture map exists;
- every planned modification has a known owner;
- every new contract has a known consumer;
- no existing authoritative boundary is accidentally duplicated.

---

# 3. Phase 1 — Canonical Current Situation Model

## Objective

Create one authoritative, concise representation of what is happening **right now** in the story.

This is the most important architectural change.

The narrator must not receive scattered pieces of context and be expected to reconstruct the entire situation independently every turn.

## Required data contract

Create a dedicated domain contract, conceptually:

```ts
interface CurrentSituation {
  storyId: string;
  turnId: string;
  worldId: string;
  worldTime: string;
  location: CurrentLocationContext;
  nearbyEntities: NearbyEntityContext[];
  visibleEvents: VisibleEventContext[];
  activeDialogue?: ActiveDialogueContext;
  recentTurns: RecentTurnContext[];
  currentAction?: PlayerIntent;
  plot: PlotContext;
  openThreads: OpenThread[];
  relevantMemories: RelevantMemory[];
  relevantLore: RelevantLore[];
  playerKnowledge: KnowledgeBoundary;
  worldFacts: AuthoritativeFact[];
  activeConditions: ActiveCondition[];
  availableInteractions: InteractionContext[];
}
```

Use the repository's existing domain types wherever possible. Do not duplicate canonical types merely to avoid importing them.

## Location assembly

The situation model must resolve:

1. current world;
2. current region;
3. current location;
4. current POI/sub-location when available;
5. nearby connected locations;
6. accessible vs inaccessible routes;
7. discovered vs undiscovered locations;
8. current environmental description;
9. current time;
10. current environmental state.

Do not expose hidden locations merely because they exist in canonical state.

## Nearby-entity assembly

Resolve:

- player;
- nearby NPCs;
- NPC distance/importance;
- visible creatures;
- visible items;
- active interactables;
- active combatants;
- relevant factions;
- objects explicitly referenced by the player.

Entity context must include stable IDs.

Never identify an entity solely by display name when a canonical ID exists.

## Recent-turn assembly

Use a bounded recent history.

Do not pass the entire campaign transcript to every narration call.

At minimum distinguish:

- last player action;
- latest narration;
- active dialogue;
- immediate previous action;
- recent state changes;
- unresolved action consequences.

Do not confuse old prose with current canonical state.

## Knowledge boundary

Separate:

- world truth;
- player knowledge;
- NPC knowledge;
- AI working context.

The situation builder must never silently turn world truth into player knowledge.

## Integration

The Current Situation Model must be consumed by:

- intent interpretation;
- narrative research;
- narrative planning;
- narration generation;
- narrative review;
- story-action suggestions;
- scene/image prompt generation where applicable;
- debug/context inspection UI;
- tests.

## Tests

Add:

- current location test;
- nearby NPC test;
- hidden entity exclusion test;
- player-knowledge exclusion test;
- current dialogue test;
- recent-turn ordering test;
- stale opening-scene exclusion test;
- unresolved-thread preservation test;
- world-time propagation test.

## Audit loop

After implementation, trace:

```
WorldRepository
 -> SituationBuilder
 -> Intent
 -> Research
 -> Plan
 -> Narration
 -> Review
 -> State update
 -> Plot/memory
 -> next SituationBuilder
```

If any arrow cannot be followed to actual code, the phase fails.

---

# 4. Phase 2 — Semantic Player Intent Interpreter

## Objective

Interpret what the player is trying to accomplish before narration is generated.

The interpreter must describe the action semantically instead of attempting to predict prose.

## Required contract

Use a structure equivalent to:

```ts
interface PlayerIntent {
  action: string;
  goal?: string;
  target?: EntityReference;
  locationTarget?: LocationReference;
  interactionMode:
    | 'PASSIVE_OBSERVATION'
    | 'DIRECT_INTERACTION'
    | 'DIALOGUE'
    | 'MOVEMENT'
    | 'COMBAT'
    | 'MANIPULATION'
    | 'INFORMATION_SEEKING'
    | 'EXPLORATION'
    | 'OTHER';
  speechIntent: boolean;
  movementIntent: boolean;
  observationIntent: boolean;
  informationGoal?: string;
  explicitTargets: EntityReference[];
  impliedTargets: EntityReference[];
  confidence: number;
}
```

## Critical behavior

Examples:

"I move closer to hear the rumors"

must become approximately:

```
action = approach_and_listen
goal = gather_information
interactionMode = PASSIVE_OBSERVATION
speechIntent = false
movementIntent = true
observationIntent = true
```

It must **not** become:

```
ask_about_rumors
shout_to_get_attention
speak_to_crowd
```

"I ask the guard what happened"

must explicitly permit dialogue.

"I listen for anything about the missing caravan"

must not cause the protagonist to speak.

"Tell the merchant I want the map"

must produce a direct dialogue intent.

## Deterministic safety

Use deterministic parsing only for high-confidence mechanical distinctions:

- explicit movement;
- explicit attack;
- explicit item use;
- explicit dialogue;
- explicit dice/check request;
- explicit OOC;
- explicit system command.

Do not create hundreds of prose-specific regex rules.

## AI fallback

When the intent model is unavailable:

1. use deterministic interpretation for obvious actions;
2. preserve the original player text;
3. mark confidence as low;
4. allow narration to use the raw text;
5. never fabricate a more specific intent than the fallback can establish.

## Integration

The intent object must be passed into:

- Current Situation;
- Narrative Research;
- Narrative Director;
- Narration prompt;
- Narrative Review;
- state adjudication;
- action history;
- debugging.

The UI must not have a separate hidden interpretation that bypasses the server intent contract.

## Tests

Test:

- listen;
- overhear;
- observe;
- approach;
- ask;
- speak;
- shout;
- attack;
- inspect;
- move;
- use item;
- combine movement + observation;
- ambiguous intent;
- empty input;
- malformed AI output;
- model unavailable;
- deterministic fallback.

---

# 5. Phase 3 — Narrative Research Pipeline

## Objective

Research the exact information needed for the current turn before narration.

## Research order

For each turn:

1. read Current Situation;
2. identify explicit entities;
3. identify current location;
4. identify target of action;
5. identify information goal;
6. search relevant lore;
7. search relevant memories;
8. retrieve entity sheets;
9. retrieve relevant player knowledge;
10. retrieve active plot/open threads;
11. retrieve immediate unresolved consequences;
12. discard irrelevant context.

## Relevance rules

Prefer:

1. current scene;
2. explicit player target;
3. explicit player knowledge;
4. active thread;
5. recent turn;
6. location-linked memory;
7. character-linked memory;
8. relevant lore;
9. older background.

Do not include unrelated quest history merely because it exists.

## Context budget

Introduce explicit budgets for:

- scene;
- entities;
- memories;
- lore;
- plot;
- instructions.

Each block must have:

- source;
- priority;
- expiration;
- reason selected;
- stable identifier.

## Debugging

Expose a development-only context inspection endpoint or debug panel showing:

- what was retrieved;
- why it was retrieved;
- what was excluded;
- context priority;
- token estimate;
- active model;
- fallback model;
- research failures.

Never expose hidden world truth to ordinary players through this debug path.

## Tests

Add fixtures where:

- the relevant rumor is retrieved;
- unrelated lore is excluded;
- location-linked memory is selected;
- distant NPC information is deprioritized;
- hidden knowledge is excluded;
- explicit @/entity references increase relevance;
- research failure still produces a valid bounded context.

---

# 6. Phase 4 — Ephemeral Narrative Director and Plan

## Objective

Before prose generation, create a short-lived plan for the immediate turn.

The plan is not a quest. It is not long-term memory. It is not canonical state.

It exists only to tell the narrator what this turn needs to accomplish.

## Required contract

```ts
interface NarrativePlan {
  turnId: string;
  objective: string;
  immediateSteps: string[];
  informationToReveal: InformationReveal[];
  entitiesToReact: EntityReference[];
  unresolvedThread?: string;
  continuityRequirements: string[];
  forbiddenAssumptions: string[];
  stateEffectsExpected: ExpectedStateEffect[];
}
```

## Example

For:

"I move closer to hear the rumors"

the plan should contain:

1. move the protagonist physically closer to the rumor source;
2. keep the protagonist silent;
3. let the player overhear existing scene information;
4. reveal the established starlight-fissure rumor;
5. identify it as rumor/hearsay unless canon confirms it;
6. provide concrete information rather than generic atmosphere;
7. leave the next decision to the player;
8. do not invent unrelated trade delays;
9. do not write player dialogue.

## Plan lifetime

Create after player input and research.

Use for exactly one narration turn.

Discard after narration unless a specific part is promoted to canonical plot/state.

Do not store the full plan as memory.

## Integration

The plan must be passed to:

- narration model;
- narrative reviewer;
- state adjudicator as expected-effect guidance;
- telemetry.

## Tests

Verify:

- passive actions remain passive;
- movement remains movement;
- information goals remain anchored;
- unrelated story material is not injected;
- plan expires;
- plan does not become hidden permanent state;
- plan survives model fallback.

---

# 7. Phase 5 — Replace Guard-Driven Narration with Context-Driven Narration

## Objective

Refactor narration generation so that guards are a backstop rather than the main intelligence.

## Prompt structure

Narration input must be assembled in this order:

1. global narration instructions;
2. story style;
3. Current Situation;
4. Player Intent;
5. Research Results;
6. Narrative Plan;
7. canonical constraints;
8. output contract.

The prompt must explicitly state:

- player action has priority over decorative flourish;
- do not invent unsupported facts;
- do not control the player's character unnecessarily;
- do not turn listening into speaking;
- preserve uncertainty where canon is uncertain;
- do not reveal hidden information;
- continue naturally from the current scene;
- leave agency with the player.

## Player agency rule

The narrator may describe the immediate consequence of the player's action.

It must not decide major future player choices.

Bad:

"The protagonist decides to follow the stranger."

Good:

"The stranger slips through the side door, leaving you with the choice of whether to follow."

## Existing guard migration

Audit every current regex validator.

For each validator classify it:

- canonical safety;
- epistemic safety;
- output-format safety;
- catastrophic continuity safety;
- semantic interpretation.

Keep the first four where justified.

Replace broad semantic interpretation guards with:

- PlayerIntent;
- CurrentSituation;
- NarrativePlan;
- semantic review.

Do not delete a guard until its replacement path has tests.

---

# 8. Phase 6 — Semantic Narrative Review

## Objective

Add a lightweight reviewer that checks whether generated narration faithfully executed the current turn.

This is not a second narrator.

## Review contract

The reviewer receives:

- PlayerIntent;
- CurrentSituation;
- NarrativePlan;
- generated narration.

It returns:

```ts
interface NarrativeReview {
  decision: 'ACCEPT' | 'REWRITE' | 'REJECT';
  violations: NarrativeViolation[];
  missingRequirements: string[];
  unsupportedClaims: string[];
  playerAgencyViolation: boolean;
  semanticMismatch: boolean;
}
```

## Review questions

1. Did the narration perform the requested action?
2. Did it preserve interaction mode?
3. Did it preserve movement?
4. Did it preserve the information goal?
5. Did it remain within current scene facts?
6. Did it reveal unauthorized information?
7. Did it invent an unrelated major fact?
8. Did it speak for the player without permission?
9. Did it create an unsupported state change?
10. Did it accidentally skip the requested action?

## Rewrite policy

One rewrite maximum under normal conditions.

If rewrite fails:

1. try deterministic emergency narration where possible;
2. otherwise return the safest accepted bounded result;
3. record the failure;
4. never loop indefinitely through expensive AI calls.

This protects free/limited model quotas.

## Tests

Create explicit regression tests for:

- "I move closer to hear the rumors";
- "I listen quietly";
- "I ask what happened";
- "I inspect the door";
- "I attack the creature";
- "I walk toward the eastern gate";
- "I look for someone who knows about the fissures."

---

# 9. Phase 7 — Canonical State Adjudication and Commit

## Objective

Make the transition from narration to game state explicit.

Narration must not directly mutate canonical state.

## Pipeline

```
Narration
  |
  v
State proposal extraction
  |
  v
Canonical rule evaluation
  |
  +--> approved -> commit
  |
  +--> rejected -> no mutation
  |
  +--> ambiguous -> no mutation / safe fallback
```

## Required protections

Every state mutation must have:

- command ID;
- story ID;
- actor ID;
- source;
- transaction mode;
- validation result;
- rollback behavior;
- canonical event record.

## Narration/state separation

If the narrator says:

"You pick up the key"

that must not automatically add the key to inventory.

The canonical system must determine whether:

- the key exists;
- it is reachable;
- it is visible;
- the player can take it;
- it is already taken;
- the action succeeded.

The narration then reflects the authoritative result.

## Tests

Cover:

- successful state change;
- rejected state change;
- rollback;
- duplicate command;
- retry;
- provider failure;
- narration generated but state commit failed;
- state commit succeeds but presentation generation fails.

---

# 10. Phase 8 — Plot, Open Threads, and Memory Lifecycle

## Objective

Separate short-term narrative planning from durable story memory.

## Plot

Plot is the compact running summary of important current events.

It must include:

- recent consequential events;
- current major direction;
- important unresolved developments;
- relevant character relationships;
- major discovered information.

It must not become a transcript.

## Open threads

Track unresolved things such as:

- unanswered rumor;
- unresolved NPC request;
- discovered but unexplored location;
- unresolved threat;
- pending consequence;
- unfinished investigation.

Every thread needs:

- stable ID;
- source turn;
- related entities;
- related location;
- status;
- priority;
- last touched time.

## Memory

Store factual information rather than decorative prose.

Good:

"Archivist Nera believes the western fissure is becoming unstable."

Bad:

"The sunset painted the courtyard in glorious orange."

Memories should be linked to:

- character;
- location;
- event;
- plot thread;
- knowledge owner.

## Promotion rule

A plan item becomes memory only if it represents durable knowledge.

A narration sentence does not automatically become memory.

## Tests

Verify:

- memory retrieval;
- location attachment;
- character attachment;
- stale memory deprioritization;
- player knowledge boundary;
- plot rewrite;
- thread completion;
- thread persistence across turns.

---

# 11. Phase 9 — Entity and Scene Relevance Engine

## Objective

Make entity selection explicit and consistent across narration, dialogue, suggestions, and UI.

## Required relevance inputs

- player distance;
- current location;
- current POI;
- explicit mention;
- active dialogue;
- current action target;
- active quest/thread relation;
- recent interaction;
- entity importance.

## Required consumers

The same relevance result must feed:

- narration;
- dialogue;
- research;
- action suggestions;
- character UI;
- scene image generation;
- map/nearby entity display.

Do not create one relevance algorithm for narration and a different one for image generation.

## Tests

Verify nearby entities are preferred and distant unrelated entities are excluded.

---

# 12. Phase 10 — Epistemic and Knowledge Boundary Enforcement

## Objective

Prevent omniscient narration.

## Required distinction

```
WORLD TRUTH
PLAYER KNOWLEDGE
NPC KNOWLEDGE
NARRATOR WORKING CONTEXT
```

These are different sets.

## Rules

The narrator may know a fact internally for consistency but must not expose it unless:

- player knows it;
- player can perceive it;
- an NPC reveals it;
- the player successfully discovers it;
- the current action legitimately reveals it.

## Example

If the engine knows a villain is hiding under the city, the narrator cannot say:

"The villain beneath the city prepares..."

unless the narrative perspective explicitly permits that information.

## Tests

Create hidden-information fixtures and verify that unauthorized information never appears in generated context or UI.

---

# 13. Phase 11 — Story Action Suggestions

## Objective

Turn suggestions into a projection of the current situation, not generic game advice.

## Generation order

1. inspect CurrentSituation;
2. inspect PlayerIntent;
3. inspect unresolved threads;
4. inspect nearby entities;
5. inspect accessible routes;
6. generate deterministic candidates;
7. remove impossible candidates;
8. rank by immediate relevance;
9. use AI enrichment only when required;
10. cache the result for the current situation.

## Important quota rule

Suggestions must not call an AI model every time the UI rerenders.

The client should request suggestions only when:

- current turn changes;
- location changes;
- relevant entity changes;
- unresolved thread changes;
- player explicitly refreshes.

## Tests

Verify no repeated model call occurs from UI rerender.

---

# 14. Phase 12 — Model Routing, Quota Awareness, and Fallback Architecture

## Objective

Make model selection task-specific and prevent one exhausted model from destabilizing the entire story engine.

## Task separation

Maintain independent routing for:

- intent;
- research;
- narration;
- dialogue;
- narrative review;
- state proposal;
- memory extraction;
- plot update;
- summarization;
- tactical reasoning;
- image generation;
- transcription.

Do not use one global model for every category merely because it is currently available.

## Fallback order

Each task must define:

1. primary model;
2. alternate model;
3. alternate provider;
4. deterministic fallback where possible.

The fallback must preserve the task contract.

A narration fallback must return narration, not an unrelated generic answer.

## Cooldown

Respect provider cooldown.

Do not immediately retry an exhausted model repeatedly.

## Call budget

Add per-turn AI call accounting:

```
intent: 0-1
research: 0-1
plan: 0-1
narration: 1
review: 0-1
rewrite: 0-1
state proposal: 0-1
memory/plot: background or batched
```

These are target budgets, not hard-coded requirements. The architecture must make excessive calls visible.

## Failure policy

A provider failure must never cause:

- fake success;
- fake transcription;
- fabricated state;
- infinite retries;
- silent fallback without telemetry.

## Tests

Simulate:

- 429;
- 5xx;
- timeout;
- empty response;
- malformed response;
- invalid JSON;
- unavailable model;
- all AI unavailable;
- primary exhausted but fallback available;
- all models exhausted.

---

# 15. Phase 13 — UI Integration: Story Composer

## Objective

Ensure the UI exposes the new pipeline without becoming a second story engine.

## StoryView responsibilities

The UI should:

- collect player input;
- display pending state;
- display narration;
- display dialogue;
- display checks;
- display action suggestions;
- display model status only where appropriate;
- display errors;
- allow retry where safe.

The UI must not independently interpret canonical story state.

## Mobile composer

Use a multiline textarea.

Requirements:

- visible long text;
- touch-friendly send button;
- no horizontal overflow;
- responsive layout;
- keyboard-safe layout;
- microphone control;
- accessible labels;
- disabled state while request is pending;
- retry state;
- error state.

## Tests

Use component/regression tests for:

- long input;
- multiline input;
- mobile width;
- desktop width;
- pending state;
- error state;
- retry;
- microphone;
- dice menu.

---

# 16. Phase 14 — Real Speech Transcription

## Objective

Remove deterministic fake transcription behavior.

## Flow

```
Microphone permission
  |
  +--> browser SpeechRecognition if supported
  |
  +--> MediaRecorder fallback
          |
          v
       transcription API
          |
          v
       real transcript
```

No successful response may contain placeholder text such as "Transcribed text" unless that text was actually returned by the transcription provider.

## Failure cases

Handle:

- permission denied;
- no microphone;
- unsupported browser;
- empty recording;
- transcription provider unavailable;
- malformed provider response;
- timeout.

## Tests

Mock the transcription provider and verify that the UI only receives provider-returned text.

---

# 17. Phase 15 — Dice System and Menu Integration

## Objective

Ensure dice themes, dice modes, and checks are separate UI concepts and correctly connected to the canonical dice system.

## Requirements

Audit:

- dice theme registry;
- 2d dice themes;
- More menu;
- dice panel;
- world-specific settings;
- dice engine;
- check request;
- check result;
- narration consequence.

## UI

Each dice theme must have:

- stable ID;
- display name;
- description;
- asset path;
- supported dice types;
- availability state.

The More menu must not concatenate unrelated items.

Nested dice controls must have:

- clear grouping;
- touch spacing;
- keyboard navigation;
- selected state;
- disabled state;
- responsive layout.

## Backend

A UI dice selection must resolve to the same canonical dice configuration used by actual checks.

No display-only dice theme may be presented as active unless the backend accepts it.

## Tests

Verify:

- theme selection;
- theme persistence;
- 2d themes;
- world-specific themes;
- actual roll uses selected theme;
- roll result reaches narration;
- fallback roll remains deterministic and valid.

---

# 18. Phase 16 — Scene, Comic, and Visual Context Integration

## Objective

Ensure visual generation is downstream of the same current-turn truth as narration.

## Required source

Scene generation must consume:

- CurrentSituation;
- latest committed action;
- visual consequences;
- current location;
- visible characters;
- active dialogue;
- check result when relevant.

It must not independently use stale opening-scene text when a committed turn exists.

## Freshness rule

The most recent committed action is authoritative for the current visual moment.

Old narrative may be used only as supporting context.

## Tests

Verify:

- scene changes after player action;
- old opening scene is not reused;
- stale dialogue is not injected;
- visual state follows canonical result;
- failed action does not visually portray success.

---

# 19. Phase 17 — Cross-System Integration Matrix

Before final integration, create and maintain a matrix like:

| Producer | Contract | Consumer | Trigger | Fallback | Test |
|---|---|---|---|---|---|
| WorldRepository | CurrentSituation | Intent | player turn | bounded state | yes |
| IntentInterpreter | PlayerIntent | Director | player input | deterministic | yes |
| Research | ContextBlocks | Director | player turn | minimal context | yes |
| Director | NarrativePlan | Narrator | every turn | direct narration | yes |
| Narrator | Narrative | Reviewer | generated output | deterministic | yes |
| Reviewer | Review | Commit | generated output | accept safe result | yes |
| Commit | CanonicalEvent | Plot/Memory | successful action | no mutation | yes |
| Plot | PlotContext | Situation | next turn | previous plot | yes |
| Memory | RelevantMemory | Research | next turn | no memory | yes |
| Situation | SceneContext | Suggestions | turn/location | deterministic | yes |
| Situation | VisualContext | Image | scene generation | latest action | yes |
| UI | PlayerInput | Game API | submit | retry | yes |

The matrix must contain **every new subsystem**.

An empty consumer column means the subsystem is not complete.

---

# 20. Phase 18 — End-to-End Turn Test Harness

## Objective

Create a test harness that executes a full turn without requiring a live AI provider.

## Required simulated turn

Fixture:

- world;
- location;
- NPC crowd;
- existing rumor about unstable starlight fissures;
- player knowledge;
- unrelated trade information;
- current time;
- active thread.

Input:

"I move closer to hear the rumors."

Expected semantic result:

- movement occurs;
- protagonist does not speak;
- rumor source is used;
- starlight-fissure information may be revealed;
- trade-caravan information is not invented unless already relevant;
- player agency remains intact;
- no unauthorized hidden information is revealed;
- state changes are limited to authoritative effects;
- plot/thread can be updated if the action legitimately advances discovery;
- next turn sees the resulting canonical state.

Then execute:

1. intent;
2. situation;
3. research;
4. plan;
5. deterministic/mock narration;
6. review;
7. commit;
8. plot;
9. memory;
10. next situation.

This test must run as one connected operation.

## Additional scenarios

Create end-to-end tests for:

- passive listening;
- direct question;
- movement;
- inspection;
- combat;
- item use;
- failed skill check;
- successful skill check;
- unknown NPC;
- unknown location;
- hidden information;
- model outage;
- fallback model;
- all models unavailable;
- malformed narration;
- state commit failure;
- UI retry.

---

# 21. Phase 19 — Error-Proof Coding and Verification Discipline

This phase is mandatory throughout the entire project, not only at the end.

## Before editing a file

Read the relevant surrounding code.

Do not perform blind text replacement.

Do not insert code based on a remembered version of a file.

## After every edit

Run:

```bash
npm run lint
```

For larger changes run:

```bash
npm test
npm run build
```

## Syntax safety

Particular care must be taken with:

- template literals;
- regular expressions;
- nested JSON;
- TypeScript generics;
- object literals;
- escaped quotes;
- multiline prompts;
- JSX attributes;
- conditional expressions;
- import/export blocks.

A missing comma, quote, brace, or backtick must never be allowed to survive to a later phase.

## Incremental commits

Prefer commits shaped like:

```
phase-X: add contract
phase-X: connect producer
phase-X: connect consumers
phase-X: add fallback
phase-X: add regression tests
phase-X: integration verification
```

Do not combine unrelated fixes into one opaque change.

---

# 22. Phase 20 — Final Audit: Orphan and Connection Audit

This is the audit specifically designed to catch the failure mode where every subsystem exists but they are not actually connected.

## Producer audit

For every function/class/service introduced, answer:

1. Who calls it?
2. What triggers that call?
3. What data does it receive?
4. Where does that data originate?
5. Where does its output go?
6. Who consumes that output?
7. What happens when it fails?
8. What happens when it returns empty data?
9. What happens on retry?
10. Is the output persisted where required?

## Consumer audit

For every consumer:

1. Where does its input come from?
2. Is the input current?
3. Is the input canonical?
4. Is it authorized?
5. Is there a fallback?
6. Is stale data possible?
7. Is the contract tested?

## UI audit

For every UI control:

1. What state does it display?
2. Where does that state originate?
3. What backend/API does it call?
4. What canonical operation occurs?
5. What happens on failure?
6. What happens after reload?
7. Does mobile use the same backend contract?
8. Does desktop use the same backend contract?

## AI audit

For every AI task:

1. What triggers it?
2. What task contract does it use?
3. What context does it receive?
4. What model is selected?
5. What is the fallback model?
6. What is the deterministic fallback?
7. What validates the response?
8. What consumes the result?
9. Is it persisted?
10. Can it accidentally become canonical truth?

---

# 23. Phase 21 — Full Regression and Release Gate

The release gate is:

```bash
npm run lint
npm test
npm run build
```

All must pass.

Then execute manual end-to-end scenarios.

## Required manual scenarios

### Scenario A — Listening

"I move closer to hear the rumors."

Verify:

- protagonist approaches;
- protagonist remains silent;
- current rumor is used;
- unrelated lore is not invented;
- information is clearly identified as rumor if unverified;
- player remains in control.

### Scenario B — Speaking

"I ask the archivist about the fissures."

Verify:

- protagonist actually asks;
- archivist responds;
- response uses known information;
- unknown information remains uncertain.

### Scenario C — Movement

"I walk toward the eastern gate."

Verify:

- movement authority executes;
- location changes only if legal;
- narration describes the actual destination;
- scene context changes for the next turn.

### Scenario D — Failed check

Attempt an action requiring a check.

Verify:

- canonical dice engine rolls;
- result is authoritative;
- narration reflects the result;
- failed action is not narrated as success;
- visual generation does not depict success.

### Scenario E — Model exhaustion

Exhaust the primary narration model.

Verify:

- cooldown activates;
- fallback model is selected;
- no repeated calls hammer the exhausted model;
- narration still receives the same CurrentSituation and NarrativePlan;
- no fake success is emitted.

### Scenario F — Total AI outage

Disable all AI models.

Verify:

- deterministic emergency path activates;
- the game remains usable;
- no fake AI output is returned;
- canonical state remains authoritative.

### Scenario G — Mobile

On a narrow viewport:

- long input remains visible;
- textarea expands/scrolls correctly;
- send button remains accessible;
- More menu remains usable;
- dice menu remains separated;
- microphone control remains accessible.

---

# 24. Definition of Done for the Entire Program

Dreamville is not considered complete merely because all planned files exist.

The implementation is complete only when:

### Architecture

- CurrentSituation is canonical for the turn context.
- PlayerIntent is semantic and structured.
- Research selects relevant information.
- NarrativePlan directs the immediate turn.
- Narration consumes the complete turn package.
- Review is a backstop, not the primary interpreter.
- Canonical state remains authoritative.
- Plot, memory, and open threads have separate lifecycles.

### Integration

- Every producer has consumers.
- Every consumer has a known producer.
- Every API route has a caller.
- Every UI control has a backend contract.
- Every backend result has a UI or downstream consumer.
- Every fallback has the same contract as its primary path.
- No orphaned subsystem exists.

### AI

- Tasks are routed independently.
- Model exhaustion is handled.
- Fallbacks are bounded.
- AI call counts are visible.
- No fake AI responses exist.
- AI cannot silently become canonical truth.

### Narrative

- User intent survives intact.
- Listening does not become speaking.
- Observation does not become arbitrary action.
- Movement is reflected.
- Information seeking reaches relevant sources.
- Existing scene facts are preferred over invented details.
- Player agency is preserved.
- Uncertainty is preserved.
- Unrelated details are not injected merely to make prose sound dramatic.

### Memory

- Durable facts are stored.
- Decorative prose is not treated as durable memory.
- Memories are linked to locations/entities/events where appropriate.
- Player knowledge boundaries are preserved.

### UI

- Desktop and mobile flows use the same contracts.
- Long text input works.
- Dice controls are separated.
- Speech input is real.
- Errors are visible and recoverable.
- Loading states are correct.

### Code quality

- TypeScript compiles.
- Tests pass.
- Build passes.
- No accidental syntax corruption.
- No unused disconnected implementation.
- No duplicate source of truth introduced.

---

# 25. Implementation Order and Dependency Chain

The implementation order is intentionally strict:

```
PHASE 0
Baseline + architectural audit
    |
    v
PHASE 1
Current Situation
    |
    v
PHASE 2
Player Intent
    |
    v
PHASE 3
Research
    |
    v
PHASE 4
Narrative Plan
    |
    v
PHASE 5
Context-driven Narration
    |
    v
PHASE 6
Semantic Review
    |
    v
PHASE 7
Canonical State Commit
    |
    v
PHASE 8
Plot + Memory + Open Threads
    |
    v
PHASE 9
Entity/Scene Relevance
    |
    v
PHASE 10
Knowledge Boundaries
    |
    v
PHASE 11
Action Suggestions
    |
    v
PHASE 12
Model Routing + Quota/Fallback
    |
    v
PHASE 13
Story UI
    |
    v
PHASE 14
Speech
    |
    v
PHASE 15
Dice
    |
    v
PHASE 16
Visual Scene Integration
    |
    v
PHASE 17
Integration Matrix
    |
    v
PHASE 18
End-to-End Harness
    |
    v
PHASE 19
Code/Verification Discipline
    |
    v
PHASE 20
Orphan/Connection Audit
    |
    v
PHASE 21
Full Regression + Release Gate
```

A later phase may not create a parallel implementation of an earlier phase.

For example:

- Phase 11 must consume Phase 1 CurrentSituation.
- Phase 16 must consume Phase 1 CurrentSituation and Phase 7 canonical results.
- Phase 8 must consume Phase 7 canonical events.
- Phase 5 must consume Phase 2 Intent, Phase 3 Research, and Phase 4 Plan.
- Phase 6 must validate against Phase 1, 2, 3, and 4 rather than reinterpreting the player input independently.
- Phase 18 must exercise the whole chain rather than mocking each subsystem independently.

---

# 26. Required Agent Instruction for Future Coding Sessions

Any AI coding agent implementing this specification must follow these rules:

1. Read this document before changing architecture.
2. Read the current implementation before editing.
3. Do not assume a feature is absent because it is not where expected.
4. Reuse existing contracts where they are correct.
5. Do not create duplicate sources of truth.
6. Do not solve semantic problems with increasingly large regex lists.
7. Prefer structured intent, situation, research, and planning.
8. Do not silently move canonical authority into AI output.
9. Connect every new producer to its real consumers in the same implementation phase.
10. Connect every UI feature to the real backend contract.
11. Add regression tests at the same time as implementation.
12. Test primary and fallback paths.
13. Test empty and malformed responses.
14. Test model exhaustion.
15. Test deterministic emergency behavior.
16. Run `npm run lint` after meaningful edits.
17. Run `npm test` after completing each coherent slice.
18. Run `npm run build` before declaring a phase complete.
19. Re-read the changed files after automated edits to catch malformed syntax.
20. Perform a producer/consumer connection audit before moving to the next phase.
21. Never declare a phase complete merely because its local tests pass.
22. Never leave a TODO that represents an essential connection and still mark the phase complete.
23. If a required dependency belongs to the separate authoritative core engine, explicitly identify the contract required from that engine.
24. Do not fabricate a core-engine implementation inside the external client.
25. Preserve the user's agency: the system should interpret and continue the player's action, not decide the player's story for them.

---

# 27. Final Principle

The goal is not to make Dreamville contain more AI.

The goal is to make Dreamville contain **better orchestration between deterministic state, relevant context, semantic player intent, narrative planning, specialized AI tasks, canonical adjudication, memory, and presentation**.

A small model with the right situation can outperform a larger model with a badly assembled context.

A large prompt cannot compensate for missing canonical state.

A regex cannot compensate for missing intent interpretation.

A narration guard cannot compensate for a missing narrative plan.

A completed backend service is worthless if the real turn pipeline never calls it.

A beautiful UI is incomplete if it does not reach the authoritative operation.

A passing unit test is insufficient if the producer and consumer are not connected.

Therefore every phase must finish the **entire vertical slice** it introduces:

```
DATA
  -> CONTRACT
  -> PRODUCER
  -> ORCHESTRATION
  -> CONSUMER
  -> UI/API
  -> FALLBACK
  -> PERSISTENCE
  -> REGRESSION
  -> END-TO-END CONNECTION
```

That is the standard for this implementation.


# 28. Research Basis — Friends & Fables

The architectural direction in this specification is informed by publicly documented Friends & Fables material. These sources are used for architectural principles, not as claims about private implementation details.

- How Franz Works: https://fables.gg/blog/how-franz-works
  - Describes multi-request orchestration, working context, research before narration, and separation of state updates from narration.
- Franz 2.0 — Working Context, Lore, Improved Planning: https://fables.gg/patch-notes/franz-20-working-context-lore-improved-planning-and-more
  - Describes context blocks, research, scene context, plot, plan, priorities, budgets, expiration, and relevance.
- Plot and Plan: https://help.fables.gg/articles/4217496-plot-and-plan
  - Documents the short-lived per-turn plan and running plot distinction.
- Working Context Blocks: https://help.fables.gg/articles/8560008-working-context-blocks
  - Documents relevance-driven context selection and context budgets.
- Current Scene: https://help.fables.gg/articles/1999565-current-scene
  - Documents current-location and nearby-entity scene context.
- Memories: https://help.fables.gg/articles/2838157-memories
  - Documents location/character-linked memories and the importance of limiting context to relevant information.
- What Game State Can ACE See/Update?: https://fables.gg/en/help/articles/4035786-what-game-state-can-ace-see-update
  - Documents task-specific context and the principle that missing context is often a source of incorrect narration.
- ACE-1: https://fables.gg/blog/introducing-ace-1-the-engine-powering-the-best-ai-ttrpg-experiences
  - Describes the campaign-engine approach, state management, retrieval, memory, entity links, and separation of the AI GM from the underlying game engine.
- ACE 1.5: https://fables.gg/patch-notes/ace-15-bringing-pois-and-npcs-to-life-npc-conversations
  - Documents spatial POI context, NPC relevance, character context, and reduced player-character dialogue generation.
- February 2026 Development Log: https://fables.gg/patch-notes/development-log-2601
  - Important architectural signal: the team described older rigid narration architecture as increasingly limiting with newer models and planned a deeper narration/state-update rewrite.

These references reinforce the central implementation rule of this document:

**Context assembly and narrative direction should carry most of the semantic burden; deterministic validation should protect canonical truth and catastrophic contradictions rather than attempting to understand every possible player sentence through increasingly brittle pattern matching.**
