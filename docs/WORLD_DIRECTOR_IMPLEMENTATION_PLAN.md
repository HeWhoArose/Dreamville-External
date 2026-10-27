# DreamVille — World Director Implementation Plan

**Status:** ACTIVE — implementation proceeds in small, audited slices  
**Owner:** World preparation, scene readiness, canonical scene evidence, and narrator handoff  
**First target:** The reported isolated-shack murder investigation  
**Branch policy:** Work on a dedicated branch and commit each coherent slice. Do not merge to main without explicit approval.  
**Live testing:** Reserved for the player. Engineering work must provide a reproducible player-run checklist and must not mark live-model/UI acceptance as passed.

## 1. Purpose

World Director is the orchestration layer that makes sure a scene has the canonical facts needed to be played before asking the narrator to describe it. It coordinates existing authorities; it is not a new canonical database, a second campaign engine, or a replacement for the narrator.

DreamVille already has world synthesis, persistent geography, scene objects, entity cards, population and activity production, current-situation projection, evidence retrieval, narrative planning, canonical action resolution, semantic review, and fallback composition. The first task is therefore to close demonstrated integration gaps and not duplicate these owners.

The core rule is:

**Prepare the world first. Resolve the player's action through its authoritative system. Narrate the resolved, player-visible result. Review the narration.**

World truth, player-visible facts, player knowledge, NPC knowledge, unresolved questions, and AI proposals must remain distinct. Richness comes from providing grounded material to the narrator, not from weakening grounding restrictions or letting prose create world state.

## 2. Current Source Audit — Starting Findings

This is a source-level audit of current main inspected on 2026-10-26. It is not a live-session result, a fresh full test run, or proof of current CI status.

### 2.1 Existing paths to preserve

- WorldSynthesisService authors/normalizes the campaign's structured geography and scene-object data.
- WorldRepository creates StoryRun-specific canonical geography and persists world/run state. Its current projection preserves location sceneObjects, population, archetype, environment, and tags.
- GeographyGraph owns canonical location-level scene-object mutation, including add/remove methods.
- WorldActivityDirector supplies deterministic ambient population/activity for eligible locations and protects restricted, abandoned, and expectedPopulation=NONE locations.
- OpeningSceneService invokes ambient population preparation before opening-context assembly.
- WorkingContextEngine uses CurrentSituationBuilder to assemble an epistemically filtered starting-location projection and places occupancy, visible people/activity, scene objects, environment, and the starting situation into protected opening context.
- CurrentSituationBuilder projects canonical scene objects, entities, events, occupancy, environment, available interactions, and relevant state.
- NarrativeResearchPipeline retrieves bounded relevant context. Retrieval cannot create missing canonical facts.
- NarrativeDirector/StoryBeatDirector and N13–N19 are existing systems and must not be recreated.
- NarrativePromptBuilder provides structured scene and outcome context.
- SemanticNarrativeReview rejects unsupported concrete claims rather than treating descriptive prose as an object registry.
- ActionResolution, combat, spell, inventory, and spatial systems remain the owners of their respective mechanics/state changes.

### 2.2 Source-traced gap: premise is not prepared incident state

**Current feature-branch source trace (2026-10-27; source review only, not live runtime evidence):**

1. `CharacterGenesisService` builds `StartingSituationConfig` from extracted/user-edited summary, activity, situation type, hook, initial conditions, and why-here-now. It does not create a scenario-specific victim, incident, clue, or witness record as part of that construction.
2. `WorldRepository.createStoryRunFromConfirmedCharacter()` deep-copies the starting situation into the StoryRun and records bootstrap Chronicle evidence (`ev_genesis_<storyId>`) whose summary is the generic “Awakened in <location>” and whose details are the initial scene hook. That Chronicle record preserves the hook as historical text; it is not a victim/entity card, location scene object, investigation incident, or structured clue.
3. The same method clones world-authored `world.events` into `plannedEvents` with status `PLANNED`. Source inspection has not shown a bridge that interprets the character's starting-situation hook as one of those authored world events or commits an investigation incident from it.
4. `OpeningSceneService` calls `WorldActivityDirector.ensureAmbientPopulation()` before projection. That producer is for eligible ambient occupants/activity, not incident preparation.
5. `WorkingContextEngine.assembleOpeningContext()` delegates to `CurrentSituationBuilder.build()`. The latter projects location `sceneObjects`, ground inventory items, eligible entity cards/NPC lifecycles, and visible current-location events. It intentionally does not parse location prose or starting-situation text into discrete props/entities.
6. `WorldDirector.assessOpeningSceneReadiness()` diagnoses missing investigation anchors, but is read-only and cannot repair this missing producer-to-canonical-state handoff.

**Primary root-cause hypothesis now strongly supported by source:** the starting situation remains a narrative premise/history detail, while the canonical scene projection correctly requires concrete records from their owning authorities. There is no demonstrated scenario-specific preparation path connecting the premise to canonical incident/victim/evidence records. This explains why stricter anti-hallucination checks can be correct while the opening still lacks investigation substance.

**Still required before Phase 0 exit:** add a focused deterministic fixture reproducing this exact boundary; inspect the available canonical entity/evidence/chronicle authorities and their lifecycle/persistence contracts; verify no existing scene/incident producer is called indirectly by another entry path; then identify the smallest owner-respecting integration point. This finding is not yet a full test-proven root cause for every reported scene or every entry path.

**Additional concrete projection boundary found:**

7. The generic bootstrap Chronicle record is not automatically a visible scene event. `CurrentSituationBuilder` builds `visibleEvents` from active dialogue, ambient activity events, and the recent canonical command-event tail scoped to the location; it does not turn HistoricalChronicleEngine bootstrap evidence into a current-location event.
8. Entity visibility also has a corpse-representation constraint. NPC lifecycles marked dead project as `presence: 'absent'`; entity cards with `worldState.isAlive === false` or `presence === 'absent'` are discarded from `nearbyEntities`. Therefore a dead victim cannot safely be represented only as a dead NPC/entity card if the opening must visibly show a body. The scene needs a distinct canonical, player-visible physical representation (for example, an authored/committed body scene object linked to the victim record), or a carefully designed projection contract that preserves physical presence without treating the victim as alive. This must be tested before selecting the data model.
9. Existing location archetype defaults provide generic scene props, not murder-specific props. Those defaults must not be mistaken for a prepared incident, and should not be overwritten to force a clue into every location.
10. `WorldRepository.createStoryRunFromConfirmedCharacter()` does preserve authored location `sceneObjects`, `population`, `environment`, and `archetype` into the story GeographyGraph on this branch. The original authored-prop projection loss described in older grounding notes is therefore not the leading explanation for this branch's current target gap.

### 2.3 Fallback limitation

The deterministic opening composer can render the character's activity, location/time, supplied sensory context, visible people, and visible scene objects. When those inputs are absent, its current generic ambient sentence can stand in for missing world content. The fallback cannot safely invent a victim, clue, witness, or layout from nothing.

Fallback must remain factually grounded but should receive the same prepared scene facts as the primary narrator.

### 2.4 Other verified boundaries

- “No visible person is established in the projection” is not equivalent to canonical proof that nobody is present.
- Ambient population is not incident preparation. Ordinary public occupants must not be used as substitutes for a murder victim, witness, investigator, or adversary.
- Scene preparation does not imply revealing every canonical fact. Hidden evidence may exist but remain undiscovered.
- Existing tests cover many world-build, scene-projection, ambient-population, and opening behaviours, but a dedicated end-to-end murder-scene contract must be established.
- A structured ActionResolution is supplied to narration, but source inspection did not establish a universal guarantee that every resolved player-visible effect is represented. This is a related, separately owned narrative-fidelity slice, not a reason to move combat mechanics into World Director.

### 2.5 Current source map and authority boundaries

| Boundary | Current source evidence | Audit conclusion |
|---|---|---|
| Character setup | `server/services/characterGenesisService.ts` builds the starting-situation summary/activity/hook; `server/repositories/worldRepository.ts:createStoryRunFromConfirmedCharacter()` copies it to the StoryRun. | No scenario-specific incident materialization is present in this setup code. |
| Genesis Chronicle | `WorldRepository.createStoryRunFromConfirmedCharacter()` calls `HistoricalChronicleEngine.recordBootstrapEvidence()` for a generic genesis entry with the hook in `details`. | Historical bootstrap text is not a current-scene event or a structured clue. |
| Authored world events | The same method copies `world.events` into `run.plannedEvents` with status `PLANNED`. | Existing authored events must be reconciled by ID/location/status; a character hook is not proof that an event was created or executed. |
| Opening entry | `server/services/openingSceneService.ts` → `WorldActivityDirector.ensureAmbientPopulation()` → `WorkingContextEngine.assembleOpeningContext()` → `CurrentSituationBuilder.build()` → opening prompt and opening-candidate review. | Ambient population is prepared, but no investigation-specific producer is called on this path. |
| Normal freeform entry | `server/mockEngine/serverMockAuthority.ts` resolves the action and uses `WorldActivityDirector.ensureAmbientPopulation()`; `server/domain/aiOrchestrator.ts` assembles `CurrentSituation`, research, narrative planning, and provider candidates. | Reuse this path's authorities; do not make the projection layer create incident state. |
| Canonical scene objects | `WorldRepository.createStoryRunFromConfirmedCharacter()` copies authored location `sceneObjects`; `GeographyGraph.addSceneObject/patchSceneObject/removeSceneObject` own location-object mutations; `CurrentSituationBuilder` projects visible objects and ground inventory items. | Existing object projection is connected on this branch. The remaining gap is incident-specific object creation/linkage, not a reason to weaken semantic review. |
| Canonical entities | `WorldRepository.saveEntityCard()` delegates to `EntityRegistry.upsert()`; `saveStoryRun()` persists registry export under `runtimeState.entities`; `getEntityRegistry()` restores that snapshot. | Entity cards are an existing persistent authority for witnesses/NPCs/victims, but visibility/lifecycle semantics must be handled deliberately. |
| Victim/body visibility | `CurrentSituationBuilder` projects only alive/present entity cards into `nearbyEntities`; dead NPC lifecycles project absent. | A deceased person must not be treated as a living visible NPC. A physical body needs a distinct visible scene representation linked to the canonical victim where appropriate. |
| Current scene events | `CurrentSituationBuilder` projects active dialogue, generated ambient activity events, and recent canonical command events scoped to the current location. | Chronicle bootstrap evidence and `plannedEvents` are not automatically projected as current visible scene events. |
| Opening regeneration/reload | `OpeningSceneService` returns the saved opening unless forced; canonical entity registry is reloaded from StoryRun runtime state. | A future preparation call must be idempotent and must not regenerate/overwrite the incident on force-regeneration or reload. This behaviour still needs a dedicated investigation fixture. |

This map refreshes the critical opening/setup boundaries against the feature-branch source on 2026-10-27. It does **not** claim that every combat, movement/time-advance, or regeneration caller has been re-audited line-by-line in this slice. The older narrative-grounding trace and V2 execution plan remain supporting references for those shared paths; Phase 0 remains open until their relevant handoffs and a focused canonical investigation fixture are checked against this branch.

### 2.6 General-purpose design constraint — not a murder-scene patch

The isolated-shack murder is the **first regression fixture**, not the product scope. World Director must work for arbitrary scene purposes and genres by coordinating composable scene requirements over existing canonical authorities. Do not add a pile of premise-word regexes or a parallel scene database as the final architecture.

**Universal preparation contract (every scene):**

- **Purpose and player intent:** why this scene exists now, the protagonist's current goal/starting activity, and any authored inciting pressure. A hook is an intent signal, not proof that an event occurred.
- **Place and physical affordances:** canonical location identity, layout/connected areas where available, visible objects, usable affordances, environmental conditions, time/lighting/weather where supported, and travel/access constraints.
- **Actors and activity:** canonical present entities, their player-visible identities/roles, activities, relevant relationships, and permitted interaction opportunities. Do not seed occupants into restricted, abandoned, or explicitly empty locations.
- **Events and causal state:** distinguish authored/planned events from active/committed events, historical Chronicle entries from current visible events, and proposals from persisted outcomes.
- **Knowledge and visibility:** separate world truth from what the protagonist can perceive, what the protagonist knows, and what NPCs know. Hidden facts must not satisfy visible-scene requirements.
- **Playability and continuity:** ensure the scene has grounded details the player can observe or interact with, preserve unresolved questions and player agency, and keep preparation idempotent across opening regeneration, reload, and later turns.
- **Uncertainty and omissions:** report what is unknown or absent instead of silently inventing a fact. A repair must use the owning canonical authority and preserve provenance, time, location, visibility, and lifecycle rules.

**Composable scene profiles are policy, not separate world systems.** The universal contract is always checked; additional requirements are selected by structured starting-situation metadata, a committed event/action, or a conservative classifier when metadata is absent. Initial profiles should include:

| Profile | Example requirements (only when supported by the scene's purpose) |
|---|---|
| GENERAL / ARRIVAL | grounded place identity, immediate activity, useful observable affordances, clear player next-step opportunities |
| INVESTIGATION | relevant incident/target, physically present discoverable evidence, observation/knowledge boundaries, unresolved causal questions |
| SOCIAL / NEGOTIATION | present interlocutors, their public roles/stance/activity, interaction affordances, known relationship/context boundaries |
| TRAVEL / TRANSITION | origin/destination, route/access state, travel mode/progress, arrival conditions and relevant environmental change |
| EXPLORATION / DISCOVERY | accessible space, discoverable features, visibility/obstruction constraints, risk or uncertainty only where canon supports it |
| COMBAT / IMMEDIATE DANGER | canonical participants, positions/range/line of sight, active threat and authoritative combat state; never duplicate combat resolution |
| REST / WORK / ROUTINE | appropriate location affordances, available resources/tasks, time/activity context and existing schedule constraints |

These are illustrative, extensible policies, not a mandate to require every listed item in every scene. A profile must never manufacture a required fact just to turn readiness green. If its requirement cannot be grounded, report an explicit gap or uncertainty and let the owning system or player action resolve it.

**Architecture boundary:** World Director orchestrates preparation and validates readiness. WorldRepository/GeographyGraph own persistence and location objects; EntityRegistry owns entity cards; the event/action engines own committed events and outcomes; Chronicle owns history; CurrentSituationBuilder owns epistemically filtered projection; WorldActivityDirector owns eligible ambient population/activity; existing narrative planning/review owns narration quality and safety. World Director must call or coordinate these owners rather than replace them.

**Current implementation limitation:** `server/domain/worldDirector.ts` currently has a conservative `GENERAL` / `INVESTIGATION` diagnostic with murder/investigation vocabulary and two investigation anchors. That is acceptable as the first regression probe only. Before canonical preparation is implemented, refactor the interface around a universal scene contract plus composable profile requirements; keep text classification as a fallback selector, never the source of truth for incident existence.

### 2.7 Required cross-profile regression matrix before any preparation writes canonical state

The first test is deliberately a **negative/control test**: an investigation hook with no victim/clue must remain INCOMPLETE and must not cause the narrator to invent one. It is not sufficient evidence that a reusable World Director works. Before Phase 0 closes, record the following tests and their existing canonical owner for each row; use fixtures and services already in the repository where possible.

| Scenario | Expected World Director behavior | Must not do |
|---|---|---|
| Ordinary arrival / quiet room | Validate grounded place/activity/affordances; no investigation requirements | Add a victim, threat, clue, or random event just to enrich prose |
| Social visit / negotiation | Validate that the target interlocutor and interaction opportunity are present/authorized | Invent dialogue, relationship history, or NPC consent |
| Travel / arrival | Validate canonical route, journey progress, destination/access and time/arrival state | Teleport the player or claim arrival before movement commits |
| Exploration / hidden discovery | Validate discoverable features and perception/knowledge boundaries | Count hidden/off-location facts as visible or reveal a secret early |
| Combat / immediate danger | Consume canonical participants, positions, threat and committed combat state | Create a duplicate combat state or resolve actions in narration |
| Investigation / crime or non-criminal mystery | Validate a supported target/incident and discoverable physical evidence; distinguish body/object/event/history | Hard-code only murder terminology or force a corpse into unrelated mysteries |
| Work / rest / routine | Validate suitable canonical affordances/resources and relevant schedule/time | Create jobs/resources or alter schedules without their owning system |
| Sparse or intentionally empty scene | Return READY_WITH_UNCERTAINTY or an explicit incomplete report appropriate to policy | Treat absence of data as proof of abandonment, danger, or a hidden event |
| Retry / force regeneration / reload | Reuse the same committed preparation and preserve IDs, provenance, visibility and outcomes | Duplicate scene objects/entities/events or reroll an already committed incident |
| Provider failure / fallback | Give deterministic fallback the same grounded prepared facts and visibility limits | Use fallback as a back door for unsupported invention |

**Phase 0 exit rule:** no scene-preparation implementation that mutates canonical state begins until (a) this cross-profile contract is reviewed, (b) the isolated-shack integration test is executable and its result recorded, (c) owner/persistence contracts for scene objects, entities, events, Chronicle and knowledge have been checked, and (d) entry-path review states which callers prepare, which merely project, and which resolve actions. Live provider/UI acceptance remains a later player-run gate.



### 2.8 Canonical preparation ownership contract

The source review establishes the following boundaries. World Director may coordinate requirements and return a preparation report, but must not become a parallel persistence authority.

| Fact category | Canonical owner / supported mutation path | Preparation contract |
|---|---|---|
| Location, environment, discrete scene objects | `GeographyGraph`, reached through `WorldRepository.getGeographyGraph(storyId)`; scene-object mutation methods include `addSceneObject`, `patchSceneObject`, and `removeSceneObject`. | Reconcile the destination's existing objects before adding anything. Use stable IDs and explicit provenance. A prose description, sensory string, or starting-situation hook is not itself a discrete object. |
| NPC/entity identity, lifecycle, presence and location | `EntityRegistry` behind `WorldRepository` methods such as `saveEntityCard`, `instantiateEntityFromTemplate`, `cloneEntityCard`, and lifecycle methods; player/NPC lifecycle has its own repository methods. | Reuse existing canonical entities where identity matches. Keep presence, alive/dead state, location, and viewer visibility distinct. A dead/absent entity card alone is not proof that a physical body is a visible scene object. |
| Committed current-world event / action outcome | Existing canonical command/event path, including `CanonicalCommandEngine` and the StoryRun canonical event log. Simulation event paths already transact and record associated Chronicle evidence. | Do not write directly to an event log from a readiness checker. Incident creation must define a committed event identity and transaction semantics before a coordinator invokes it. |
| Historical evidence and chronicle | `HistoricalChronicleEngine` obtained from `WorldRepository`; runtime evidence is transactional, while `recordBootstrapEvidence` is explicitly bootstrap-only. | Historical recordkeeping must not be confused with a currently visible scene event. The generic story-genesis evidence is not a substitute for a prepared incident or visible body/clue. |
| Player knowledge and discovery | `WorldRepository.addKnowledgeFact`, authorized-knowledge projections, and existing discovery/interaction command paths. | Scene preparation may establish that a fact/object exists; it must not automatically grant the player knowledge of hidden evidence or conclusions. Existence, discoverability, discovery, and learned interpretation are separate states. |
| Player-visible scene projection | `CurrentSituationBuilder.build()` and its player-safe projection. | Read-only projection consumes canonical state and epistemic rules. It must not repair missing state or mutate canon while assembling a prompt. |
| Ambient population and activity | `WorldActivityDirector.ensureAmbientPopulation()` plus its activity/event projection. | Continue to reuse this owner. It is not an incident generator and must not satisfy scenario-specific victim/evidence requirements by inventing an ambient NPC. |
| Preparation coordination and diagnostics | World Director. | Select a conservative profile, reconcile required facts with canonical owners, report missing/uncertain requirements, and invoke existing mutation authorities only after a transaction/idempotency contract is approved. It must not own a shadow copy of objects, entities, events, or knowledge. |

#### Universal scene-preparation result

Every profile must use the same outer result contract; profile-specific requirements are policies, not separate competing world systems:

- `profile`: the selected scene intent/profile and selection confidence/provenance.
- `status`: `READY`, `READY_WITH_UNCERTAINTY`, `INCOMPLETE`, or `NOT_APPLICABLE`.
- `requirements`: requirement identifiers with status (`SATISFIED`, `MISSING`, `UNCERTAIN`, `NOT_REQUIRED`) and evidence references.
- `canonicalChanges`: stable references to records actually committed by their owners; empty for a read-only assessment or failed preparation.
- `issues`: actionable codes, not just prose, including whether the issue is safe to defer or requires stopping scene generation.
- `idempotencyKey` / preparation revision: enough to reconcile a repeated preparation request without duplicate entities, objects, incidents, events, or Chronicle records.
- `visibility` and `knowledge` are evaluated independently from existence. Hidden objects may satisfy an existence requirement without satisfying a visible-anchor requirement.

The outer contract does not imply every profile must create objects or events. A sparse room, quiet arrival, rest scene, or uncertain-occupancy scene may legitimately be ready with few/no entities. Profile policies must define positive requirements and negative cases so “more populated” is never treated as synonymous with “better prepared.”

#### Investigation-specific policy (first vertical slice only)

An investigation fixture may require a committed incident reference, a physical victim/body representation when the premise says a body is present, one or more canonical evidence anchors, and explicit visibility/discovery rules. It must distinguish established facts from hypotheses and unknowns. The coordinator may not invent a culprit, motive, cause of death, forensic result, or witness knowledge merely to satisfy readiness. The body is a scene object or other explicit physical-presence representation linked to the victim identity; the dead victim entity itself is not automatically projected as a living nearby entity.

#### Transaction and lifecycle rules still to prove before write implementation

1. Choose the established canonical command transaction boundary for multi-owner preparation and demonstrate rollback if any required mutation fails. Do not assume GeographyGraph, EntityRegistry, Chronicle and knowledge writes are automatically atomic merely because they are reachable from one repository.
2. Derive stable incident/object/entity/event IDs from the authored scenario identity or a persisted preparation key, following existing deterministic-ID conventions; retries must reconcile rather than reset player changes.
3. Persist a preparation marker/revision with canonical references, not a second copy of prepared facts. On reload, resolve references from their owners and verify that the prepared scene still exists.
4. Define lifecycle transitions for discovered, consumed, moved, destroyed, or otherwise changed scene objects. Re-preparation must preserve legitimate player/world changes and only repair missing requirements that remain justified.
5. Keep profile selection conservative. A text classifier can suggest a profile but cannot prove the facts implied by the premise exist. Ambiguous scenes should yield uncertainty or ask for authored clarification rather than inventing canon.

These are design gates, not implemented behavior. Phase 0 stays open until transaction ownership and the required persistence/idempotency tests are validated.

## 3. Scope and Non-Goals

### In scope

1. Audit and map all world-preparation and scene-entry paths.
2. Define a small, explicit scene-preparation/readiness contract.
3. Classify supported scene requirements based on scenario and authoritative context.
4. Retrieve and reconcile existing canonical objects/entities/events before proposing new records.
5. Add or connect scenario-specific canonical facts through existing authorities.
6. Validate visibility, presence, location, lifecycle, discoverability, and provenance.
7. Hand the same scene facts to opening narration, normal turns, research/context, and fallback.
8. Detect incomplete preparation with actionable diagnostics.
9. Add deterministic tests and regression coverage, then re-audit every changed integration.
10. Supply a player-run live-test checklist and stop short of claiming live acceptance.

### Explicitly out of scope

- Replacing WorldRepository or creating a parallel source of truth.
- Reimplementing WorldActivityDirector, CurrentSituationBuilder, NarrativeResearchPipeline, StoryBeatDirector, N13–N19, semantic review, or the action-resolution authorities.
- Converting every phrase in a premise/biography into a literal object or event.
- Unconditionally populating every location, adding forced crises, or guaranteeing a quest.
- Allowing a model to write directly to canonical state.
- Loosening evidence rules to hide context/projection defects.
- Re-running a canonical action or spell to fix prose.
- Running real-provider, real Story UI, or human UX testing on behalf of the player.

## 4. Target Architecture

World Director coordinates existing owners in this sequence:

1. **Request:** Receive story/location identity, entry reason, starting situation or active incident, world time, and relevant authored scenario data.
2. **Read:** Retrieve current canonical scene state, current entities/objects/events, location profile, rule constraints, and any existing scene preparation reference.
3. **Classify:** Select a supported requirement profile or return a bounded generic/uncertain classification.
4. **Reconcile:** Reuse valid existing records; propose only missing requirements supported by the premise, a scenario template, or validated model output.
5. **Validate:** Check IDs, location, lifecycle, visibility, provenance, rules, duplication, and prerequisite relationships.
6. **Commit:** Register approved changes through the appropriate canonical authority. No prose is a commit.
7. **Project:** Ask existing projection/context systems for player-authorized scene evidence.
8. **Readiness gate:** Return READY, READY_WITH_UNCERTAINTY, INCOMPLETE, BLOCKED, or RECOVERY_REQUIRED with explicit reasons.
9. **Handoff:** Give the existing narration path a stable scene reference/projection; primary and fallback narrators use the same factual inputs.
10. **Observe and learn:** Record diagnostics in existing session/telemetry infrastructure. Do not add a parallel recorder.

This is an architectural target, not permission to implement every layer in one large change. The first implementation should be the smallest vertical slice that closes a reproduced gap.

## 5. Scene Preparation Contract

The first implementation slice should formalize these conceptual fields. Reuse existing types where suitable; add fields only where the current contracts demonstrably cannot express a requirement.

### Request information

- storyId and worldId;
- locationId and, if available, stable scene/incident reference;
- entry reason: initial opening, incident start, location entry, revisit, recovery, or explicit scene refresh;
- current timestamp;
- starting situation/incident data;
- authored scenario type and constraints, when supplied;
- current canonical objects, entities, events, environment, occupancy and relevant rules;
- authorized viewer/actor identity.

### Result information

- scene/location reference;
- requirement profile and profile version;
- readiness status and reason codes;
- required facts satisfied and required facts missing;
- records found/reused, proposals accepted/rejected, and canonical changes made;
- hidden/unknown facts kept out of player-visible context;
- player-visible evidence references;
- provenance and diagnostics suitable for regression/session records.

### Readiness semantics

- **READY:** Required preparation conditions are satisfied.
- **READY_WITH_UNCERTAINTY:** The scene is playable; specific facts remain legitimately unknown.
- **INCOMPLETE:** A required record or projection is missing.
- **BLOCKED:** A world rule, authorization, validation failure, or unavailable authority prevents safe preparation.
- **RECOVERY_REQUIRED:** Stored state cannot be reconstructed with sufficient confidence.

Unknown is not automatically a failure. A murder scene can be ready while the culprit's identity remains unknown. Readiness is about the existence and consistency of the investigative scene, not revealing the answer.

## 6. Requirement Profiles

Begin with a limited profile set. Do not implement all possible scene types before the first one passes.

### Profile A — Investigation / crime scene (first vertical slice)

The fixture explicitly describes what must exist. Requirements may include:
- canonical incident reference or event;
- victim entity/identity state and a player-visible representation of the body where appropriate;
- location scene objects and relevant evidence records;
- evidence location, visibility, and discovery conditions;
- canonical known witnesses/other occupants, or a supported statement about absence;
- initial player knowledge versus facts that require investigation;
- supported examination/observation affordances.

Unknown facts (including culprit, motive, and cause of death) remain unknown unless the fixture/canon establishes them. Do not infer these from genre convention.

### Profile B — Ordinary environment

Require enough structured environment/location information for the chosen archetype. Objects must be canonical to be asserted as discrete props. Occupancy may be unknown without turning the site into an empty or abandoned place.

### Profile C — Public/social location

Reuse WorldActivityDirector. Verify that seeded occupants are local, alive, present, visible when appropriate, idempotent, and time/rule compatible. Keep ambient activity, social opportunity, actual encounter, quest/job, and committed dialogue as separate concepts.

### Later profiles

Combat, travel/arrival, restricted facilities, ruins, homes, workplaces, and custom scenarios are added only after their owner boundaries and requirement sets are audited. Existing combat/spell authorities continue to own mechanics and effects.

## 7. Required Data Boundaries

- **Canonical existence:** an authoritative record exists.
- **Physical/scene presence:** the record is in this location and present at this time.
- **Visibility:** the player can perceive the record from the current position.
- **Interactability:** the current action is legally/physically applicable.
- **Discoverability:** specific action/conditions permit revealing the clue/fact.
- **Player knowledge:** the player has learned or is authorized to know it.
- **NPC knowledge:** only the NPC's authorized knowledge may inform its behaviour/dialogue.
- **Unknown:** available evidence does not settle the fact.
- **Explicit absence:** canon positively establishes that the relevant entity/object is absent.
- **Proposed content:** AI or procedural logic has suggested content that is not canonical until validated and committed.

Do not collapse these into a single “visible” flag or translate unknown to false/empty.

## 8. Iterative Execution Protocol — Mandatory for Every Slice

Every slice follows this sequence; work stops and returns to audit if a check fails.

### A. AUDIT

- Fetch the current target-branch versions of every affected file before editing.
- Read the owning contracts, real callers, tests, and current integration map.
- State the exact failure hypothesis.
- Reproduce it in an existing test or add the smallest focused failing regression first.
- Confirm that the issue is not already fixed elsewhere and that the proposed owner is correct.

### B. IMPLEMENT

- Make the smallest coherent change that closes the reproduced gap.
- Reuse canonical authorities and existing types where possible.
- Keep the implementation scoped to one vertical slice.
- Do not silently expand scope or bundle unrelated cleanups.

### C. TEST

- Add/update deterministic unit or integration tests for the new behaviour.
- Cover negative cases and invariants: unauthorized visibility, unknown versus absent, idempotence, state persistence, restricted/abandoned locations, and no unsupported facts.
- Run the applicable automated tests/build/lint/type-check through available local/CI mechanisms. If they cannot be run, state that explicitly; do not imply they passed.

### D. REGRESSION

- Run the affected suite plus relevant cross-system regression coverage.
- Check the opening path and normal-turn path independently.
- Check fallback and recovery paths where touched.
- Ensure no test or code path bypasses canonical authority or changes player intent.
- Check for unintended changes to generated/tracked files.

### E. RE-AUDIT

- Re-fetch the changed files and inspect the final diff on the branch.
- Trace the exact data from producer to canonical owner to scene projection to final prompt.
- Confirm every changed caller sees the intended contract.
- Search for competing owners, stale projections, and newly orphaned components.
- Update the plan's progress ledger with evidence and remaining gaps.
- Only then start the next slice.

A failure at any stage creates a fix-and-repeat loop for the current slice. Do not mark a slice complete merely because implementation code exists.

## 9. Phases and Exit Gates

### Phase 0 — Current baseline and source trace

Tasks:
1. Map opening, freeform turn, movement/time advance, combat, regeneration/retry, resume/reload paths.
2. Trace starting-situation fields from confirmed character and StoryRun into WorkingContextEngine and OpeningSceneService.
3. Trace canonical sceneObjects from world template through story geography, GeographyGraph persistence, CurrentSituationBuilder, research/context, and prompt.
4. Trace entity creation/presence/visibility and scene-object discovery pathways.
5. Trace how an investigation's starting situation can create or reference canonical incident/victim/evidence records, if such a path exists.
6. Identify the earliest responsible boundary for any missing data.
7. Record actual current test and CI evidence separately from historical plan evidence.

**Exit gate:** A current source map, failing or missing regression, and one primary cause established without duplicating an owner.

### Phase 1 — Investigation-scene readiness contract

Tasks:
1. Define requirements for the first investigation fixture.
2. Define the readiness states and error/recovery behaviour.
3. Distinguish authored incident truth from generated proposals and unknown conclusions.
4. Define deterministic IDs/idempotence for prepared incident components using established project conventions.
5. Define how records are persisted and restored through existing authorities.
6. Write focused contract tests before integrating broad live paths.

**Exit gate:** Tests establish exactly what a prepared investigation scene must supply and what it must keep hidden.

### Phase 2 — First World Director vertical slice

Tasks:
1. Implement or extend the smallest coordinator/validator required by the audited design.
2. Reconcile the existing location, scene objects and entity cards before any creation.
3. Prepare only scenario requirements justified by the canonical starting situation and validated profile.
4. Commit through the existing scene-object, entity, event, or world authorities.
5. Add a stable reference or reliable idempotent lookup so preparation does not duplicate records.
6. Return readiness diagnostics instead of silently passing a missing required element.
7. Connect it to the opening path at the correct point; avoid mutating state inside a read-only projection helper.

**Exit gate:** The deterministic investigation fixture passes for first preparation, repeated preparation, opening projection, and persistence/reload.

### Phase 3 — Same prepared scene across opening and normal turns

Tasks:
1. Ensure opening and subsequent action contexts resolve to the same canonical incident/scene.
2. Compare their entities, objects, events, environment, occupancy and visibility sets.
3. Ensure observation targets are represented and meaningful interaction/observation uses existing authorities.
4. Preserve discovered/consumed/changed state on revisits.
5. Verify that opening regeneration cannot reset canon or duplicate the scene.

**Exit gate:** Opening, “observe victim,” “observe environment,” targeted examination, and revisit tests agree about scene identity and state.

### Phase 4 — Grounding, review, and fallback

Tasks:
1. Verify that review accepts supported prepared facts and rejects unsupported claims.
2. Test “no visible entity established,” unknown occupancy, and explicit absence as distinct cases.
3. Ensure fallback uses the same prepared scene evidence and does not silently replace it with generic empty-scene prose.
4. Improve deterministic prose only where the evidence is present but underused.
5. If evidence is absent, return readiness diagnostics rather than weakening semantic review.

**Exit gate:** Primary and fallback narration preserve the same required facts without hidden-information leakage.

### Phase 5 — Expand scene profiles

After the first vertical slice is stable, add and verify ordinary rooms, public/social spaces, restricted sites, abandoned locations, travel/arrival, exploration, and combat-context preparation. Reuse current owners and write separate profile-specific tests.

**Exit gate:** Each added profile has requirements, negative cases, idempotency/persistence tests, and a verified integration map.

### Phase 6 — Cross-system outcome completeness

Audit whether narration fully represents the authoritative player-visible consequences of canonical actions, including multi-effect spells. Extend the existing ActionResolution/narrative review path if tests demonstrate missing coverage. Do not relocate or duplicate effect resolution.

**Exit gate:** Deterministic tests prove that missing visible consequences are detected/repaired without rerunning or changing the canonical action.

### Phase 7 — Continuous regression and player-run live acceptance

Engineering tasks:
- Ensure relevant deterministic suites, build, lint/type-check, release contracts and CI run and are green for the exact branch head.
- Produce a compact report of changed contracts, tested scenarios, limitations, and known risks.
- Provide a player-run live-session checklist including the real provider/model, actual displayed opening and first observation turns, scene context inspection/recording, fallback route if available, and reload/revisit behaviour.

Player-owned tasks:
- Run the real Story UI with configured provider credentials.
- Capture the opening plus at least “I observe the victim” and “I observe the environment.”
- Verify prose quality, relevance, continuity, privacy/knowledge boundaries, and error/loading behaviour.
- Return session evidence for follow-up fixes.

**Gate:** Never mark live-model quality or UI acceptance as PASS without the player's live evidence. A player test failure reopens AUDIT → IMPLEMENT → TEST → REGRESSION → RE-AUDIT for the relevant slice.

## 10. Test Matrix

| Test | Required result |
|---|---|
| First preparation | All profile-required records exist or readiness explains the missing requirement. |
| Repeat preparation | No duplicate victim, clue, object, or incident; no reset of existing state. |
| Opening projection | Same canonical scene facts as the current scene authority. |
| Observe victim | Target-relevant visible facts; hidden diagnosis/culprit remains unknown unless established. |
| Observe environment | Relevant established objects/features; no invented layout or unsupported absence. |
| Examine clue | Discovery follows conditions and records knowledge through its proper authority. |
| Hidden clue | Exists canonically but is excluded until discoverable. |
| Uncertain occupancy | No unsupported “nobody is here” claim. |
| Explicitly abandoned/restricted | No ineligible ambient seeding or unauthorized disclosure. |
| Revisit/reload | Scene state and discovery persist; no duplicates. |
| Primary vs fallback | Same required scene facts, distinct prose quality allowed. |
| Multi-effect action | All required visible consequences represented once; state is not re-executed during repair. |

## 11. Operational and Repository Rules

- Work on this dedicated feature branch and keep commits small and descriptive.
- Fetch the latest affected file before each update; never replace a file from stale contents.
- After each change, re-fetch it and review the actual saved content.
- Never merge to main without explicit approval.
- Do not edit code if the failure has not been reproduced or the owning authority is unclear.
- Keep generated artefacts out of commits unless they are explicit project outputs.
- Preserve existing content in planning documents and update the documentation index when adding a new active plan.
- Record commit SHA, affected tests, test outcomes, and remaining gaps in the plan progress ledger.
- Live tests remain player-owned; automated results and live acceptance must be reported separately.

## 12. Current Progress Ledger

| Slice | Status | Evidence / next action |
|---|---|---|
| Main-source audit | GENERAL CONTRACT DOCUMENTED; REPRODUCER + EXACT-HEAD CI PASS; PHASE 0 OPEN | Source trace documents the premise-to-canonical-state gap and a general-purpose, composable scene contract (arrival, social, travel, exploration, combat, investigation, work/rest, empty scenes, retries/reload and fallback). Added a deterministic opening integration reproducer for missing investigation target/clue; exact-head CI explicitly reports 1,559 passed and 0 failed, including this test, with typecheck, production build, and release-contract verification green. Entry-path responsibilities are now source-traced for opening, ordinary turn, movement/time advance, combat, force regeneration, reload, and fallback. The universal result and canonical-owner boundaries are now documented. Remaining Phase 0 gates: extend transaction tests across EntityRegistry and player-knowledge owners; prove persistence/reload recovery for a prepared scene; settle incident identity and lifecycle rules; add World Director-specific idempotence, destination-arrival, hidden/discovered evidence, and fallback parity tests. No production canonical scene-preparation writes yet. |
| Plan and docs index | COMMITTED | `docs/WORLD_DIRECTOR_IMPLEMENTATION_PLAN.md` and `docs/README.md` index update committed on this feature branch; final content re-fetch verified. |
| Investigation scene contract | PARTIAL | `tests/world-director.test.ts` covers the diagnostic contract for missing victim/evidence anchors, visible versus hidden/absent anchors, and non-investigation openings. A canonical incident-preparation contract is still needed. |
| First implementation | IMPLEMENTED — DIAGNOSTIC SLICE | `server/domain/worldDirector.ts` assesses investigation-opening readiness; `OpeningSceneService` records the report in `runtimeState.openingNarrativeContext`. This does not yet create canonical victim/incident/evidence records or change player-facing narration. |
| Automated regression/CI | PASS — CODE FIX VERIFIED | Root cause: the HTTP action pipeline uses a 30,000 ms provider timeout, while `DeterministicMockAdapter` intentionally sleeps `timeoutMs + 20 ms`; measured response was 30,383 ms, contradicting the old `< 30000 ms` assertion. Updated `tests/chaos-failure-injection.test.ts` to require a real hang near the configured 30s timeout and a finite `< 35000 ms` ceiling for pipeline overhead. Fix commit: `ac678cdbaceb83bb00a2899c672706121ed23968`. Release gate `40467446884` passed 1,558/1,558 tests (0 failures); verification runs `40467447030` and `40467446912` both completed successfully. The subsequent branch-head commit `1e9a13907af5ec5f877365e653f7a1a2bf6027e9` changes only this progress ledger; no application/test code changed after the passing runs. World Director tests passed. No live provider/UI acceptance is claimed. |
| Player live test | DEFERRED TO PLAYER | Required after engineering provides the run checklist. |

## 13. Definition of Done

World Director is complete only when every supported scene profile can be validated against explicit requirements; the appropriate canonical records are prepared/reused and persisted; opening, action, research, and fallback paths see the same authorized facts; observations and interactions are meaningful and stateful; hidden facts remain hidden; repeated preparation is idempotent; automated regressions/CI pass; and the player has a clear live acceptance checklist.

**End state:** DreamVille's narrator receives a world that is genuinely prepared, rather than being instructed to make a compelling scene out of missing facts.


### 2.9 Entry-path audit and current automated validation (2026-10-27)

This audit records responsibilities observed in the current feature-branch source. “No World Director call found” means no call was present in the inspected path; it is not a claim that every indirect call in the application has been exhaustively ruled out.

| Entry path | Observed prepare / project / resolve responsibility | World Director status and remaining boundary |
|---|---|---|
| New opening | `OpeningSceneService.generateOpeningScene()` calls `WorldActivityDirector.ensureAmbientPopulation()`, assembles `WorkingContextEngine` context, then calls the read-only `WorldDirector.assessOpeningSceneReadiness()`; it saves the readiness report alongside opening narrative context. | Ambient occupancy is prepared; investigation incident/victim/clue state is not. The report diagnoses but does not block, repair, or mutate canon. |
| Ordinary freeform turn | `serverMockAuthority` calls `WorldActivityDirector.ensureAmbientPopulation()` for the current location before building the `CurrentSituationBuilder` projection; the builder includes eligible ambient activity events. | Population/activity preparation exists, but the inspected ordinary-turn path does not call World Director incident preparation. This must be integrated only after the universal preparation contract and canonical owners are approved. |
| Movement / time advance | The game route invokes the existing simulation/time-advance transaction; scene projection is built from the resulting current player/location and repository state. The inspected call sites did not show a World Director scene-preparation invocation at the destination. | Destination-scene preparation parity remains unimplemented/unverified. Do not infer that moving into a scene automatically materializes its scenario premise. |
| Combat | `CombatPlayerActionService` and `CombatEncounterService` resolve/record their mechanical outcome before their narration helpers request prose or use grounded fallbacks. | These are outcome-resolution/narration paths, not scene-preparation owners. No World Director call was found in the inspected combat service files; combat-context preparation remains a future profile integration. |
| Opening retry / force regeneration | `generateOpeningScene({ forceRegenerate: true })` bypasses the existing-opening early return, reruns ambient population preparation and readiness assessment, then persists a replacement opening and report. | The current diagnostic is recomputed on regeneration, but it does not prepare missing canon. Repeated generation must not become a route for duplicating or resetting future prepared state. |
| Resume / reload | StoryRun and `runtimeState` are repository-persisted; the current integration suite exercises repository reconstruction for ambient population, while opening presentation is projected from the persisted `openingScene`. | The newly added World Director missing-anchor reproducer does **not** itself reconstruct/reload the repository. Readiness-report reload persistence and future prepared-scene idempotence still need dedicated assertions. |
| Provider failure / deterministic fallback | Opening generation falls back to `OpeningSceneService.synthesizeDeterministicOpening()` using the same assembled `rawOpeningFacts`; the readiness assessment is computed before provider generation and retained in generation metadata/runtime context. | Fallback shares the current projection, but missing incident facts remain missing. The fallback must not invent them or silently treat a generic scene as a prepared incident. |

#### Exact-head CI evidence

For feature-branch head `023e2ddf09e53e5e101abb485f70b39545dd2305`, GitHub Actions reports successful completed runs:

- Dreamville Verification run `40469337866`: typecheck, test, and production build all succeeded.
- Dreamville Release Gate run `40469337889`: release-contract verification, type-check, tests, and production build all succeeded.
- Additional Dreamville Verification run `40469337714`: lint, test, and build all succeeded.
- Test logs for the verification and release-gate runs explicitly include the new test `World Director opening integration exposes an investigation premise with no canonical victim or clue as incomplete`; each reports **1,559 passed, 0 failed**.

This is automated CI evidence for the diagnostic slice at that head, not live-provider/UI acceptance and not proof that the scene-preparation feature is complete.

#### Phase 0 exit-gate disposition

- **Focused reproducible test:** PASS in CI (the missing investigation anchors are reported as incomplete, and an ambient NPC is not substituted as victim).
- **Broad regression/typecheck/build/release contracts:** PASS in the exact-head CI runs listed above.
- **Canonical persistence-owner review:** PARTIAL. Repository, GeographyGraph scene-object, entity-card, current-event projection, and Chronicle boundaries are source-mapped, but no scenario-specific incident-preparation owner/contract has been selected or implemented.
- **Entry-path responsibility map:** SOURCE-TRACED for opening, ordinary turn, movement/time advance, combat, force regeneration, reload, and deterministic fallback as tabulated above. Destination preparation parity and World Director-specific reload/idempotence are still unverified.
- **General-purpose profile contract:** DOCUMENTED; no profile-specific canonical writes have been made.
- **Phase 0 overall:** STILL OPEN. The universal result contract and canonical-owner map are documented, but transaction rollback, stable identity, lifecycle reconciliation, and persistence/idempotence tests remain open. Do not begin canonical preparation writes until these gates are demonstrated.


### 2.10 Canonical owner transaction contract tests (2026-10-27)

Two focused tests were added to `tests/world-director.test.ts` and committed as `542f0d1c332ffbaf314e69f51cbf05c067684854`:

- **Rejected preparation:** inside `canonicalCommandEngine.execute()`, the handler adds a GeographyGraph scene object and records Chronicle evidence, then rejects. The test requires the command to report rollback, the canonical snapshot to compare equal to its pre-state, and neither write to remain.
- **Committed preparation:** the handler adds a scene clue and records linked Chronicle evidence, then succeeds. The test requires both records to remain, the canonical snapshot to change, and exactly one canonical command event to be recorded.

The canonical command boundary is now verified by CI for the scene-object + Chronicle contract: corrected-head verification and release-gate workflows passed with 1,561 tests, 0 failures, and successful type-check, production build, lint, and release-contract checks. The follow-on EntityRegistry + shared KnowledgeFact transaction assertions were committed as `f341b70d81cc2023d48b5f82eeb184a6449b5b23`; later actor-scoped Phase 8, file-backed reload, and replay/idempotence gates are recorded with exact-head CI evidence in §2.11. Durable recovery after arbitrary process interruption and the production preparation lifecycle remain unproven. The production World Director remains read-only and no production canonical scene-preparation writes have been introduced.

Phase 0 remains open. Next gate: finish exact-head CI for the EntityRegistry + KnowledgeFact extension; then test actor-scoped Phase 8 knowledge rollback/commit and persistence/reload/idempotence. Establish stable incident identity and lifecycle reconciliation before any production preparation writes.

### 2.11 Actor knowledge, persistence/reload, and replay/idempotence gates (2026-10-27)

The follow-on reliability gates are now covered by exact-head GitHub Actions at commit `19b421f2d0da8edb20ac6f2e67e469d20dfa8173`:

- **Actor-scoped Phase 8 knowledge rollback/commit:** tests verify that acquired actor knowledge is restored on rejected canonical commands and retained on committed commands. The shared WorldRepository KnowledgeFact store does not implicitly grant another actor private Phase 8 knowledge.
- **File-backed persistence/reload:** a test uses a temporary persistence file, commits scene state through one canonical command, reconstructs a fresh repository, and verifies the scene object, EntityRegistry entity, shared world fact, actor-authorized acquired knowledge, absence of authorization for a different actor, and Chronicle evidence survive reload.
- **Command replay after reload:** the same committed command ID is replayed after constructing a fresh repository from the persistence file. The handler must not run again, canonical command-event count must not increase, and the stable scene-object and Chronicle evidence IDs must each occur once.
- **Stable scene-object duplicate rejection:** GeographyGraph must reject a conflicting duplicate stable scene-object ID without replacing or appending to the existing object.

Exact-head CI for commit `19b421f2d0da8edb20ac6f2e67e469d20dfa8173` completed successfully:
- Dreamville Verification run `40485948707`: **1,565 passed, 0 failed**, production build succeeded.
- Dreamville Release Gate run `40485948698`: **1,565 passed, 0 failed**, production build succeeded.
- Additional Dreamville Verification run `40485948699`: **1,565 passed, 0 failed**, production build succeeded.

These tests establish the tested canonical command transaction/replay behavior and repository persistence/reload behavior. They do **not** establish durable crash recovery at arbitrary interruption points, cross-process concurrency safety, production World Director preparation idempotence, incident identity/lifecycle reconciliation, or opening/movement/combat preparation parity.

#### Updated Phase 0 disposition

- Focused missing-investigation-anchor diagnostic regression: PASS in prior exact-head CI.
- Canonical transaction rollback/commit across GeographyGraph, EntityRegistry, shared KnowledgeFact, Chronicle, and actor-scoped Phase 8 knowledge: PASS in the current test suite.
- Actor-scoped knowledge isolation and file-backed persistence/reload: PASS in the current test suite.
- Same-command replay after reload and duplicate stable scene-object rejection: PASS in the current test suite.
- Typecheck, release contracts, lint where configured, and production build: PASS in the associated exact-head workflows.
- Durable crash recovery / interrupted-write behavior: OPEN.
- Stable incident identity and lifecycle reconciliation (create/update/remove/reconcile without overwriting unrelated canon): OPEN.
- Universal preparation contract, composable profile policies, and all-entry-path integration: OPEN.
- Phase 0 overall: **STILL OPEN**. Production World Director remains diagnostic-only/read-only; do not enable canonical scene-preparation writes until the remaining lifecycle and recovery gates are designed and tested.

### 2.12 Stable identity, lifecycle reconciliation, and crash-recovery design gate (2026-10-27)

Source review after the replay tests establishes these boundaries:

- `GeographyGraph.addSceneObject(locationId, object)` rejects a duplicate object ID **within that location** and leaves the existing object unchanged. `patchSceneObject` updates only its allow-listed presentation/interaction fields; `removeSceneObject` removes by location + object ID. This is useful owner behavior, but it does not by itself define an incident lifecycle.
- `CanonicalCommitLedger` is stored in a `WeakMap` scoped to a repository instance. Its comments explicitly assign cross-restart durability to canonical command-event replay checkpoints; the ledger itself is not a durable journal and cannot recover a PREPARED command after constructing a new process/repository.
- The command replay test proves replay of a **committed event** after repository reload. It does not simulate interruption between owner mutation, event append, and persistence flush, and it does not establish atomic durability across every owner.
- `WorldDirector.assessOpeningSceneReadiness` remains a read-only diagnostic. It infers a minimum investigation profile from premise text and checks visible projection anchors; it does not define scenario identity, mutate canon, or reconcile a previously prepared incident.

Before any production preparation write is introduced, the implementation design must define and test:

1. **Stable preparation key:** a caller-supplied or canonically authored scenario/incident identity scoped to a StoryRun. Do not use changing narration, generated prose, wall-clock time, or an unversioned list position as the sole identity.
2. **Stable child identities:** scene object, entity, world fact, Chronicle evidence, and event identities derived from the stable incident key plus a typed role/slot (for example, victim-body, primary-clue, or incident-established). Include the owning StoryRun/location scope where the owner’s uniqueness rules require it. Re-running the same preparation key must resolve to the same identities.
3. **Reconciliation, not blind insertion:** distinguish absent records, records already owned by this preparation, and pre-existing authored/unrelated records. A repeat run may no-op or apply an explicitly permitted patch to records it owns; it must not overwrite unrelated canon. Duplicate-ID conflicts must return a typed conflict/incomplete result rather than silently replacing the record.
4. **Lifecycle states:** explicitly model at least planned, prepared/active, resolved/closed, and cancelled/superseded states (final names to be agreed in the universal contract). Define which scene objects/entities/evidence remain after resolution, what becomes hidden/removed, and which historical Chronicle records remain immutable.
5. **Transaction/recovery contract:** either prove a single durable commit boundary covers all canonical owners, or define a recoverable intent/outbox protocol with durable preparation key, phase, and pre-state/compensation information. A repository-local in-memory ledger is not sufficient for process-restart recovery. Test interruption at each write/commit boundary and recovery after a fresh repository is constructed.
6. **Profile policy separation:** the universal preparation contract owns identity, transaction, lifecycle, and result semantics. Investigation-specific requirements (visible victim/body plus clue/evidence) are a composable policy, not the general-purpose scene contract itself.
7. **Entry-path parity:** once the owner contract exists, opening generation, ordinary turns, movement/time advance, and relevant combat/scene transitions must call the same idempotent preparation coordinator at appropriate canonical boundaries. Force regeneration and provider fallback must not duplicate or invent canon.

No production writes are authorized by this design note. Next implementation slice should be tests and contract types for stable preparation identity + owned-record reconciliation, while keeping the coordinator disabled/read-only until durable recovery and lifecycle gates pass.

### 2.13 Pure stable-identity and ownership contract prototype (2026-10-27)

Added `server/domain/worldDirectorPreparationContract.ts` as a **pure contract module**, deliberately not wired into production scene mutation paths:

- `buildWorldDirectorStableRecordId()` requires explicit StoryRun ID, preparation key, record kind, role, and scope. It produces a deterministic, delimiter-safe ID from all five inputs and rejects blank or overlong identity parts. It does not infer keys from narration or wall-clock time and does not use a short hash as the sole identity.
- `classifyWorldDirectorOwnership()` distinguishes `CREATE`, `RECONCILE_OWNED`, and `CONFLICT`. Only a record carrying the current contract version and matching preparation key + role is considered owned by that preparation. Unmarked/authored records, foreign preparation ownership, and older ownership-contract versions are conflicts requiring explicit handling.
- Added focused tests for repeatability, distinct preparation keys, location scope, role separation, invalid input, matching ownership, unrelated ownership, and version mismatch.

This is a contract prototype, not a preparation coordinator and not proof of the full lifecycle. The ID format and ownership-marker persistence must be reviewed against all canonical owners before production adoption. In particular, each owner needs an explicit place to store ownership metadata; the current test covers the pure decision rule, not storage adapters, entity/knowledge/Chronicle ownership persistence, reconciliation mutations, or crash recovery.

Commit `99a631d656ca2c646007d4b7fba4045a3b083f95` adds the pure contract module. Commit `fa26d08a589a1acfb98fbea95cfa0c9175681060` adds its focused tests. Exact-head CI for the test commit is pending verification.

Next gate: verify CI, then add owner-adapter contract tests proving that existing authored objects are never adopted or overwritten, records owned by the same preparation reconcile deterministically, and identity conflicts yield an incomplete/conflict result. Do not enable production writes or claim crash recovery until durable transaction recovery is designed and demonstrated.

### 2.14 Proposed preparation lifecycle policy prototype (2026-10-27)

Added `evaluateWorldDirectorLifecycleTransition()` to the pure `worldDirectorPreparationContract.ts` module and a focused transition-matrix test.

Proposed states:
- `PLANNED`: identity exists but canonical preparation is not active.
- `ACTIVE`: preparation is active for the scene/incident.
- `RESOLVED`: preparation has reached its resolved terminal state.
- `CANCELLED`: preparation was intentionally cancelled.
- `SUPERSEDED`: preparation was replaced by a distinct preparation identity.

The pure transition matrix currently permits `PLANNED -> ACTIVE/CANCELLED/SUPERSEDED` and `ACTIVE -> RESOLVED/CANCELLED/SUPERSEDED`. Repeating the same state is an idempotent no-op. Terminal states cannot be reopened under the same preparation identity; a new lifecycle must use an explicit new identity.

**This is a proposed policy contract, not an accepted product-level lifecycle or production coordinator.** It deliberately does not mutate canonical owners, remove/hide scene objects, revise entity state, revoke knowledge, or erase Chronicle history. Those per-owner retention and compensation semantics remain unresolved and must be agreed before implementation.

Commit `f61bcecf6d774886fefd1aa0ff4da6e722bc1581` adds the pure lifecycle policy; commit `c714f9d168b08784e52f1e914185d58ba77d8b4f` adds transition tests. Exact-head CI for the test commit is pending verification.

Next: verify CI, then design a typed owner-adapter result that distinguishes created, already-owned/reconcilable, and conflicting records without mutating unrelated canon. Keep production writes disabled until adapter reconciliation and durable interruption/recovery tests pass.

