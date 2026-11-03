# Dreamville: Unified Audit Reconciliation & Architecture Decision Report

> **ACTIVE FOCUS — CURRENT WORKING PLAN**
> This document is the **single authoritative implementation plan** for this repository.
> It **supersedes all other plan documents** (including `WORLD_DIRECTOR_IMPLEMENTATION_PLAN.md`,
> `NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md`, the phase checklists, and every other roadmap in `docs/`
> except `docs/README.md`, which indexes contracts).
> When guidance conflicts, this document wins. Work is executed phase-by-phase starting at **Phase 1A**.

- **Architecture Reconciliation**
- **Date:** 31 October 2026
- **Document type:** Architecture decision and implementation-planning baseline
- **Status:** Consolidated recommendation — implementation not yet authorised (except where phases are verified complete via audit)
- **Scope:** Narration pipeline, canonical state, dynamic world simulation, environmental affordances, memory, NPC autonomy, knowledge boundaries, and open-source architectural patterns

---

## Executive decision

Do not replace Dreamville's deterministic gameplay foundation or rebuild its narration architecture from scratch. Do not continue adding isolated systems to the current architecture either.

The two audits point to a more precise direction:

1. **Retain the authoritative gameplay foundation:** CanonicalCommandEngine, ActionResolution, ResolutionGate, geography, entity registry, player state, and the four-way knowledge separation.
2. **Repair the live execution path:** unify the production narration/validation flow, remove duplicate repair work, connect capabilities that currently appear to exist only on a legacy or test path, and make failures observable through live-route tests.
3. **Fix scene establishment and ordinary interactions:** convert premise-defining facts into structured world anchors, and allow safe, environment-appropriate ordinary objects to be materialised when a player interacts with them.
4. **Add a real hybrid World Simulation subsystem:** let an LLM propose plausible temporary entities, environmental activity, and social/world reactions, while deterministic rules validate and commit consequential outcomes.
5. **Repair and connect existing memory and NPC systems before building duplicates.** Add knowledge-graph behaviour only where it provides demonstrable value; do not introduce a graph database by default.
6. **Separate foreground and background processing**, and test the player-facing live route, ensuring background work cannot overwrite newer canonical state.

The intended design is neither a rigid pre-authored world nor an unrestricted AI story generator. It is a world whose ordinary details can emerge dynamically, while consequential facts remain consistent, traceable, and authoritative.

**Decision principle:** The LLM may propose what could plausibly happen. Dreamville's rules and state owners determine what actually happens. The Narrator describes the accepted result; it does not create the result by writing it.

This report reconciles two prior assessments. It does not claim that the current Git repository has been independently inspected or that the reported defects have been reproduced in this session. It is an architecture decision baseline that must be checked against the current repository before implementation.

---

## 1. Purpose and audit inputs

### 1.1 Audit 1 — chat-pasted assessment and prior open-source review

The first assessment was based on historical project context and prior examination of Dreamville's narrative-domain files. It described a sophisticated intended architecture, including:

- Four separated knowledge layers: WORLD TRUTH, PLAYER KNOWLEDGE, NPC KNOWLEDGE, and AI CONTEXT.
- A multi-stage narrative review and quality system.
- Narrative continuity state, relationship trajectories, voice profiles, beat selection, micro-turn handling, and novelty controls.
- A 12-dimension richness score (as listed in that assessment).
- Potential patterns from Openovel, AiChatTrpg, Narrative Engine, Project Lunar, and story-generation research.

Its principal recommendation was to enhance rather than replace Dreamville, while remaining open to replacing parts of the narration orchestration if source evidence justified it.

**Evidence limitation:** Audit 1 was not a fresh, complete, line-by-line inspection of the current live repository. Its descriptions of existing capability are useful historical evidence, but they do not prove that each component is active in the current production path.

### 1.2 Audit 2 — AI Studio uploaded code audit

The second assessment is the uploaded **DREAMVILLE — PHASE 1: SYSTEM-WIDE ARCHITECTURE AUDIT** report. It describes a read-only inspection of a mounted source snapshot and traces the reported live route from `POST /api/game/action` through action resolution, context assembly, narration, validation, memory, and commit.

It identifies, among other things:

- `generateNarrativeOnly()` as the reported live narration path, contrasted with `executeTurn()`.
- Duplicate post-generation review/repair paths.
- Strict object-claim checks that reject ordinary nouns not pre-registered in the scene.
- Existing memory, NPC, and graph-related modules that are partly disconnected from live gameplay.
- A mismatch between a freeform opening premise and the structured scene objects needed for inspection and narration.
- A synchronous request/locking path that can include multiple provider calls.

The audit also states that its mounted workspace did not contain `.git` metadata. It could cross-reference a documented baseline (main at `18d7831cf51503920396067279b21af7b615b319` and PR #76 head `15f1477599c0e09695e752789e31cc9819f3101a`), but could not directly establish the current branch, current HEAD, or branch divergence. It did not benchmark live provider latency under production load.

**Evidence limitation:** The code-path findings are detailed and actionable, but they remain findings reported by the AI Studio audit until checked against the current Git checkout and reproduced with tests.

### 1.3 How this report treats evidence

| Evidence class | Meaning in this report | How to use it |
| --- | --- | --- |
| Reported source trace | AI Studio says it inspected a particular file, symbol, and execution path | High-priority verification target; not independently reproduced here |
| Historical architecture | Audit 1 or prior project context describes the component or design | Useful context; verify it still exists and is active |
| Current upstream project information | Public repository README/license information checked during this reconciliation | Use as pattern/licensing guidance; inspect exact code and dependencies before copying |
| Architecture decision | Recommendation made by this report | Proposed target; not a claim that implementation already exists |
| Open question | Decision or fact not settled by either audit | Must be resolved before the affected implementation phase |

---

## 2. Consolidated findings

### 2.1 What Dreamville should preserve

The AI Studio audit reports a substantial deterministic foundation. The following should be presumed valuable and retained unless current-source verification shows a specific defect:

- CanonicalCommandEngine transaction and per-world command coordination.
- ActionResolution as the structured account of what the action resolver decided.
- ResolutionGate and deterministic consequence handling for rules-based actions.
- Geography and location structures, including GeographyGraph.
- EntityRegistry / EntityCard as the existing character and entity substrate.
- CurrentSituationBuilder, WorkingContextEngine, and EpistemicBoundaryEnforcer for constructing restricted, prioritised narrator context.
- The existing narrative direction, beat, pacing, voice, novelty, continuity, and richness systems, after checking which are active on the live path.
- The current hierarchical memory lifecycle, after fixing its reported live-path defect.

The important distinction is **preserve the valuable responsibilities, not necessarily every current implementation boundary**. Duplicate orchestrators and overlapping validation gates may need consolidation.

### 2.2 What appears disconnected or defective

The AI Studio report identifies these as live-path issues:

| Reported finding | Reported code area | Consolidated decision |
| --- | --- | --- |
| Live play uses `generateNarrativeOnly()` while some review/adjudication features are in `executeTurn()` | `aiOrchestrator.ts` | Make the production route the single integration target; move required responsibilities into one live pipeline |
| A second quality gate can trigger another repair call after the orchestrator has already validated/repaired | `serverMockAuthority.ts`, `aiOrchestrator.ts` | Merge diagnostics and use one final validation/repair policy |
| `plot.beats` receives no live commitRecords through the ordinary freeform turn route | `narrativeMemoryLifecycle.ts`, live turn caller | Derive plot-beat candidates from canonical ActionResolution and persist them through the actual route |
| Living-world simulation runs on travel/rest rather than all appropriate clock advances | `livingWorldSimulation.ts`, `worldSimulationService.ts` | Establish one simulation-tick contract and a single authoritative NPC state source |
| NPC schedule/location information is spread across multiple stores | `EntityCard`, `npcProfiles`, `npcLifecycles` | Choose one authoritative NPC state owner and migrate or project the other representations |
| NPC autonomy, knowledge, and causal graph modules reportedly have no live callers | `npcAutonomyEngine.ts`, `knowledgeEngine.ts`, `causalProvenanceGraph.ts` | Integrate selectively after defining responsibilities and tests; do not wire in stubs just to make them appear active |
| Dynamic character agency reads NPC state but relationship/knowledge changes are not persisted on the live path | `dynamicCharacterAgency.ts`, live caller | Add explicit, validated post-action persistence for witnessed facts and relationship deltas |
| Review regexes reject some legitimate environmental and observation prose | `semanticNarrativeReview.ts`, temporal guard in `aiOrchestrator.ts` | Replace brittle lexical assumptions with structured context-aware checks and regression cases |
| Freeform starting premise may describe a victim/body/clue without creating corresponding structured world anchors | `worldDirectorPreparationService.ts`, opening flow | Materialise premise-defining facts before Turn 1, with provenance and strict handling of plot-critical objects |

These are the most urgent items because they can explain why sophisticated modules do not translate into a coherent player-facing experience.

### 2.3 The environmental grounding problem is a closed-world assumption trap

The AI Studio audit reports that the semantic reviewer blocks ordinary physical objects unless they already appear in `sceneObjects` or environmental features. The interaction authority then refuses to create a missing object merely because the player searches for it.

This policy protects important canon from hallucination, but it is too broad when applied to mundane details. A chair in an office, a pebble in a park, or a drain in a sewer should not require an author to have anticipated the player's exact wording.

**Resolution:** Keep strict grounding for plot-critical and mechanically consequential facts, but add a **bounded environmental affordance system** for ordinary props. Separately add an **LLM World Simulator** for context-sensitive social and world activity. These are complementary systems, not interchangeable ones.

### 2.4 Memory is present; lifecycle integration is the gap

Audit 1 proposed adding a SHORT → MEDIUM → LONG → MEMORY hierarchy on top of `narrativeContinuityState.ts`. Audit 2 reports that Dreamville already has NarrativeMemoryLifecycle tiers named `working`, `episodic`, `semantic`, and `plot`.

These names are related but are not exact one-to-one equivalents:

- `working` is the closest match to immediate/short-term turn memory.
- `episodic` stores event-shaped memories and may cover both recent and longer-lived experiences depending on retention and salience.
- `semantic` stores distilled facts.
- `plot` tracks campaign beats and open/resolved threads; it is a narrative-arc structure, not simply a generic longest-term memory bucket.
- `narrativeContinuityState` (tension, emotional temperature, scene momentum, motifs, response shapes, etc.) is a different concern from a durable memory hierarchy. Do not place a second memory pyramid inside it.

**Resolution:** Repair the existing NarrativeMemoryLifecycle; clarify its retention and promotion semantics; preserve the continuity state for active scene dynamics; only add new memory structures if a tested gap remains.

### 2.5 The NPC architecture needs one state owner and real persistence

The audits support retaining independent NPC cognition as a goal. Audit 2 reports that EntityCard already stores identity, motivations, secrets, relationships, knowledge, schedule, and world-state information. It also reports cognition slices and agency decisions are assembled for the narrator, but some deltas do not persist.

**Resolution:** Use a single authoritative NPC record/state owner. NPC minds should track goals, beliefs, feelings, opinions of the player, private plans, knowledge, relationships, and recent experiences. Their private cognition must remain separate from player knowledge and from narrator output. Witnessing and relationship changes must be committed as structured events, not inferred from prose alone.

---

## 3. Conflicts between the audits and how they are resolved

| Topic | Audit 1 position | Audit 2 finding | Decision in this report |
| --- | --- | --- | --- |
| Replace or retain narration foundation | Consider narration architecture replaceable if evidence favours it; later lean toward enhancement | Core deterministic and narration components are substantial, but live paths are split | Retain the core responsibilities; refactor orchestration and validation integration. Replace individual modules only after tests demonstrate they are unsuitable |
| Add a four-tier memory pyramid | Proposed to layer one over continuity state | Four memory tiers already exist in NarrativeMemoryLifecycle | Do not create a duplicate hierarchy. Fix existing lifecycle and distinguish it from scene-continuity state |
| Add knowledge graph | Proposed graph patterns to strengthen knowledge boundaries | Graph/knowledge modules reportedly exist but are disconnected | Integrate a lightweight entity-relation-event/provenance layer only where retrieval or knowledge provenance needs it. No graph database by default |
| Add NPC minds | Proposed feeling/goal/opinion/private-plan fields | EntityCard and cognition slices already contain many of these concepts; persistence/autonomy incomplete | Extend and connect existing NPC records and autonomy; avoid parallel NPC profiles |
| Add background agent team | Openovel dual-loop pattern considered useful | Foreground latency and lock contention are already concerns | Adopt foreground/background separation, but do not run multiple LLM agents serially on every player turn |
| Dynamic world | Audit 1 did not fully diagnose the object/world interaction failure | Audit 2 identifies rigid pre-registration and disconnected world simulation | Add two layers: deterministic affordance materialisation for ordinary props, plus an LLM World Simulator for complex temporary activity and reactions |
| Quality dimensions | 12 richness dimensions listed | Audit 2 says 13 weighted dimensions | Treat the count as unresolved; inspect enum/schema, evaluator, reports, and tests before documenting the official count |

**Specific discrepancy: 12 versus 13 richness dimensions**

Audit 1 listed: `actionSubstance`, `specificity`, `dialogueIndividuality`, `subtext`, `emotionalProgression`, `sensoryVariety`, `beatProgression`, `dramaticTension`, `meaningfulReaction`, `freshness`, `setupPayoff`, and `playerAgency` — twelve names.

Audit 2 reports thirteen weighted dimensions but does not provide the full list in the supplied report extract. The official dimension count must be taken from the current evaluator's source and test fixtures, not from either summary.

---

## 4. Target architecture: a hybrid living world with canonical authority

### 4.1 Core design rule

Dreamville should not force developers to pre-register every ordinary thing a player could encounter. The world should dynamically provide plausible everyday entities and interactions. But dynamic generation must not let a model rewrite established history, invent plot-critical evidence, grant items, move the player, or complete travel without adjudication.

The recommended division is:

- **LLM World Simulator:** proposes plausible context-sensitive activity, temporary entities, reactions, and outcomes for interactions that require world reasoning.
- **Deterministic rules and state owners:** validate preconditions, resolve consequences, and commit accepted state changes.
- **Narrative Director and Narrator:** decide how to frame and describe the accepted event, without authoring canonical changes.

### 4.2 Three state classes — plus a critical distinction

**A. Persistent canonical state**

Long-lived authoritative facts that must survive reloads and matter to future gameplay. Examples: player location, inventory, money, health, quest status, permanent environmental changes, established relationships, discovered clues, confirmed evidence, and campaign events.

**B. Bounded dynamic simulation state**

Temporary but authoritative facts while they are active. Examples: a specific taxi currently stopped at the kerb, a temporary pedestrian who is speaking to the player, a shopkeeper currently serving a customer, a crowd reacting to an event, or a vehicle occupying a scene.

This state is not permanent canon, but it is not merely decorative text either. Once an interaction depends on it, Dreamville must track it consistently for the relevant duration. The state needs provenance, scope, creation/expiry rules, and promotion rules.

**C. Ephemeral scene context**

Short-lived presentation details that do not affect interaction or future outcomes. Examples: distant traffic noise, a passer-by glancing at a shop window, rain tapping a surface, or a vague sense of a busy street. These details do not need individual canonical records unless the player makes one relevant.

**Important:** "Temporary" does not mean "unvalidated." Temporary simulation facts still need deterministic validation once they affect an action or consequence.

### 4.3 Entity lifecycle

Recommended lifecycle:

```
EPHEMERAL DETAIL → PROPOSED ENTITY → ACTIVE TEMPORARY ENTITY → PERSISTENT CANONICAL ENTITY
```

Not every detail must progress through every stage.

- An ambient detail can remain ephemeral and disappear without storage.
- A taxi that becomes available for boarding is materialised as an active temporary entity.
- Once boarded, the taxi and journey become authoritative dynamic state for the duration of travel.
- A recurring named taxi driver, important witness, quest character, acquired object, or consequential location change can be promoted to persistent canonical state.

Promotion should be triggered by significance and ongoing dependencies, not simply by a fixed turn counter.

### 4.4 Taxi example: the behaviour we want

Player input: "I hail a taxi."

1. **Interpret intent:** classify this as a request for transport, not as permission to move the player.
2. **Inspect context:** resolve the player's current location, street/road access, local environment, time, weather, traffic and any established restrictions.
3. **Check affordances:** establish that hailing a taxi is a plausible action at this location. The player should not need a pre-authored taxi NPC or vehicle just to attempt it.
4. **Propose a world response:** a deterministic availability rule or the LLM World Simulator proposes a bounded result such as a taxi approaching, no taxi responding, a taxi being occupied, or no safe stopping point.
5. **Adjudicate:** verify plausibility and action preconditions. The model cannot declare a successful boarding or destination arrival by itself.
6. **Commit if appropriate:** if the taxi stops and the player boards, record the active temporary taxi, travel mode, journey state, destination if selected, fare/time rules, and player position. If the taxi does not stop, the player remains where they are.
7. **Narrate:** describe only the accepted outcome.

The same principle applies to shopkeepers, pedestrians, witnesses, vendors, crowds, and other everyday interactions.

### 4.5 The World Simulator should not be a renamed Narrator

The World Simulator must return structured proposals, not freeform prose. A proposal should contain, at minimum:

- `proposalId` and idempotency/correlation key.
- `worldVersion` or base-state version used to create the proposal.
- `triggeringAction` and intended interaction.
- Entity type/archetype and temporary/persistent suggestion.
- Location/scope and relevant time window.
- Plausibility evidence or matched affordances.
- Proposed state transition and required preconditions.
- Consequence tier (flavour, reversible local change, consequential/persistent change).
- Knowledge visibility: who can observe or know the event.
- Provenance: authored, deterministic archetype, or model-proposed.
- Expiry/promotion conditions.
- Confidence/uncertainty and safe fallback.

Dreamville then validates the proposal against canon, capability, geography, world rules, and action constraints. Rejected proposals must not mutate the world.

### 4.6 Use LLM simulation selectively, not for every pebble

A robust design should use different resolution methods according to the action:

| Situation | Preferred mechanism | Why |
| --- | --- | --- |
| Common objects in known environment archetypes | Deterministic AffordancePlausibilityEngine | Cheap, predictable, no extra model call |
| Ordinary ambient crowd population | Existing deterministic population/archetype generation, repaired and unified | Avoid unnecessary model calls for generic ambience |
| Context-sensitive social response or uncertain local event | LLM World Simulator proposal plus deterministic adjudication | Benefits from flexible reasoning |
| Player movement, money, inventory, combat, quest completion | Existing deterministic authority | Must have exact, testable consequences |
| Off-screen regional events and NPC long-term planning | Bounded background simulation/LLM jobs with versioned commits | Not required to block the immediate player response |
| Sensory prose and scene description | Narrator using accepted scene context | Presentation, not state authority |

This still gives Dreamville an LLM-driven world. It avoids making an expensive, slow model call for every mundane object or every single background pedestrian.

---

## 5. Component-level architecture decisions

| Component | Existing condition reported by audits | Decision | Required outcome |
| --- | --- | --- | --- |
| Canonical command/runtime | Substantial transactional deterministic runtime | Retain and strengthen | Keep state ownership and deterministic consequences; verify transaction boundaries and failure handling |
| Live turn orchestration | Split between `generateNarrativeOnly()` and `executeTurn()` | Unify/refactor | One production turn contract; no required capability may live only in a legacy harness |
| Narration quality/repair | Multiple overlapping quality gates and possible repeated repair calls | Consolidate | One merged diagnostic set, one bounded repair policy, then deterministic fallback |
| Semantic grounding | Strong on plot/secret facts but too rigid on mundane nouns and some observation phrasing | Calibrate | Strict for plot-critical facts; context-aware and archetype-permissive for mundane details |
| Opening premise setup | Structured investigation seeds reportedly work; freeform premises can remain prose-only | Extend | Convert premise-defining elements into structured scene/entity anchors before Turn 1 |
| Environmental affordances | Existing scene interaction requires pre-existing objects | Add bounded deterministic materialiser | Create only plausible mundane props/fixtures on interaction; never silently invent quest-critical items, evidence, weapons, keys or bodies |
| World simulation | Ambient population active; living simulation is only partially invoked | Unify and extend | One authoritative simulation tick and a separate LLM proposal subsystem for complex dynamic activity |
| NPC state | EntityCard rich but duplicated across NPC schedule/lifecycle stores | Unify state ownership | One authoritative NPC state; schedules, location, activity, needs, goals and knowledge remain consistent |
| NPC cognition/autonomy | Cognition slices exist; autonomy and persistence are incomplete/disconnected | Integrate selectively | Persist witnessed facts and relationship outcomes; implement safe goal progression and off-screen actions |
| Memory lifecycle | Working/episodic/semantic/plot tiers reported; live plot recording defective | Repair and extend | Record canonical beats on live turns; define promotion, decay, retrieval and compaction |
| Continuity state | Tracks active scene/emotional/narrative dynamics | Retain | Keep distinct from durable memory; do not duplicate the memory hierarchy inside it |
| Knowledge/provenance graph | Graph-related modules reportedly exist but are disconnected | Integrate only after contracts/tests | Start with existing structures and event provenance; no graph database unless proven necessary |
| Background work | No general post-turn queue reported | Add bounded worker model | Async memory consolidation, NPC planning and distant simulation with safe versioned commits |
| Evaluation | Many tests exist, but some narrative tests use non-production path | Rebuild around live-route evidence | Exercise real `/api/game/action`, provider failures, multi-turn continuity and UI-visible results |

---

## 6. Open-source patterns to borrow — not copy blindly

The goal is to borrow proven architectural patterns while keeping Dreamville's deterministic gameplay model and TypeScript/Node runtime. Current public repository descriptions and licence information were checked during this reconciliation; this is not a full code or dependency audit.

### 6.1 Openovel — foreground narrator and background story maintenance

**Pattern to adopt:** the dual-loop runtime. One latency-sensitive foreground narration path streams the immediate beat; asynchronous background agents maintain story state, memory, context cards, and world notes. Its current README describes a resident Showrunner team and plain Markdown/JSON story state, and identifies the application as beta/demo with macOS better tested than Windows/Linux. It states Apache-2.0 licensing.

**Dreamville adaptation:** keep the foreground to the minimum required calls and move non-critical memory/NPC/world maintenance to bounded background tasks. Do not copy Openovel's file-native storage model wholesale; Dreamville already has structured world state and persistence.

Repository: https://github.com/Feed-Scription/openovel

### 6.2 AiChatTrpg — role separation and deterministic adjudication

**Pattern to adopt:** structured separation between intent/DM, rules adjudication, NPC cognition, and world keeping; use explicit context scopes and deterministic game-rule resolution rather than allowing narrative output to decide mechanics.

**Dreamville adaptation:** retain its own ActionResolution and deterministic runtime. Use per-NPC knowledge slices and structured world proposals. Do not add several sequential LLM agent calls to every foreground turn.

**Licence/dependency note:** the repository README states Apache-2.0, but warns that its default PyMuPDF dependency is AGPL-3.0 and may be unsuitable for some closed-source commercial distribution plans. Check actual dependency use and replace the parser if relevant before reusing code.

Repository: https://github.com/Leehow/AiChatTrpg

### 6.3 Narrative Engine — NPC and world-management patterns

**Pattern to study:** persistent multi-session campaigns, NPC profiles/goals/relationships, world-state tracking, rewind, extension points, and model-provider abstraction. Its current public repository identifies itself as Narrative Engine 2.0.0 and uses an MIT licence.

**Dreamville adaptation:** study the NPC/world/event abstractions and extension boundaries, but retain deterministic authority for consequential game state. Verify whether any LLM-inferred state/tag approach is compatible with Dreamville's stronger state guarantees before borrowing it.

Repository: https://github.com/Sagesheep/NarrativeEngine-P

### 6.4 Project Lunar — multi-tier memory and independent NPC minds

**Pattern to study:** persistent memory, independent NPC minds, reactive world patterns, and scenario-driven authoring. Its current README states MIT licensing; the earlier audit could not locate a licence file at the time, so this is an updated public-repository finding. Verify the actual files, commit, dependencies, assets, and notices before copying code.

**Dreamville adaptation:** use it as a reference for NPC inner-state and memory lifecycle design, not as a reason to add a second memory stack or replace the existing entity model.

Repository: https://github.com/horizonfps/project-lunar

### 6.5 Awesome Story Generation Papers

Use the repository as a research index for long-horizon consistency, interactive narrative, narrative world models, evaluation, and co-creation. The current README reports 199 papers and a taxonomy updated in September 2026. It is a reading/evaluation source, not an engine to integrate.

Repository: https://github.com/yingpengma/Awesome-Story-Generation

### 6.6 Reuse and licensing policy

- Prefer adapting ideas and writing Dreamville-native implementations when the architecture differs.
- Before copying code, pin the exact upstream commit and record its licence, copyright notices, and dependency licences.
- Review models, sample content, images, sounds, fonts, and other assets separately; repository code licensing does not automatically clear every asset.
- Project Lunar's current README says MIT, but dependency and asset review remains required.
- Do not import a database or framework merely because an upstream project uses it. Introduce Neo4j, vector storage, or another service only when a measured capability requires it.

---

## 7. Live failure analysis: Ren Takahashi / Crimson Eye Agency

The AI Studio audit maps the player-facing failures to several reported technical causes. The combined response should address them as follows:

| Observed player-facing problem | Reported technical explanation | Required correction |
| --- | --- | --- |
| Opening scene invents specifics or falls back to boilerplate/character-sheet prose | Opening fallback and premise setup do not always establish structured scene anchors; fallback text reportedly repeated hooks and exposed internal grounding caveats in an earlier path | Ensure opening premise produces canonical scene/entity anchors; make fallback prose derived from current scene and never expose internal validation notes |
| Player says "rush to the crime scene" but remains at the office | Freeform premise can mention a destination without a structured, resolvable location/route or completed action | Validate destination resolution and geography; never narrate movement unless ActionResolution confirms it; return a useful blocker when route data is missing |
| Asking for time/travel estimate causes invented watch/window details | Narrator may embellish beyond CurrentSituation and available capabilities; query intent may not be cleanly separated from action | Treat time/distance questions as information queries; only use known clock, location graph, and available travel data; do not invent possessions or route observations |
| Hailing a taxi causes invented stairwell/alley movement, then "no taxi destination" | Strict pre-registered interaction model; no transport affordance/world-simulation proposal for an ordinary taxi interaction | Add transport affordance and temporary vehicle simulation; boarding and travel must be resolved before changing location |
| Player remains at office despite narrated movement | Narration claims are not canonical state; validation did not reliably prevent unsupported action claims or the action resolver lacked an applicable travel transition | Add explicit movement/outcome completeness tests; narrator describes only ActionResolution |
| Observation/listening rejected despite atmospheric prose | Lexical patterns require particular verbs or phrases instead of checking whether a grounded sensory result was conveyed | Validate observation semantics against available senses/context; include literary sensory phrasing regression cases |
| Legitimate prose rejected by "dawn" at 17:42 | Temporal guard reportedly matches the word regardless of idiomatic meaning | Distinguish time-of-day use from idiom/proper noun; use context-aware checks and tests |

The report's root-cause mapping is specific, but it still needs confirmation through the current repository and targeted reproductions. The audit also describes some opening-scene improvements already present in its inspected snapshot; these must not be assumed present in the current branch until verified.

---

## 8. Recommended implementation roadmap

The roadmap is ordered by dependency and risk. It is not an instruction to start implementation immediately.

### Phase 0 — Repository and audit-baseline reconciliation

**Goal:** Establish the exact source version to which all findings apply.

- Clone/pull or open the authoritative Git repository and inspect the actual `.git` history.
- Record current branch, HEAD, working-tree status, main HEAD, open PR heads, and unmerged commits.
- Compare the current source tree against the AI Studio audit's stated baseline and PR #76 head.
- Identify whether the inspected source snapshot contains changes not in main or changes newer than the audit baseline.
- Re-run targeted read-only traces and tests for each high-priority finding.

**Gate:** No implementation until all source findings are mapped to exact current files/commits and the working tree is understood. Do not discard or overwrite existing work.

### Phase 1A — Stabilise the live narration and validation contract

**Goal:** Make the actual production route execute one coherent plan/generate/validate/repair flow.

- Reconcile `generateNarrativeOnly()` and `executeTurn()` responsibilities.
- Ensure every required validator and state/memory update is invoked on the production route, not only in harnesses.
- Consolidate duplicate validation and repair logic into one diagnostic contract.
- Permit at most one targeted LLM repair pass after initial generation; use a deterministic fallback if both fail.
- Align word/beat targets so one stage does not reject another stage's valid output due to conflicting synthetic plans.
- Calibrate observation and temporal guards with context-aware regression tests.
- Decide whether LiteraryNarrativeReview is folded into the unified validator, invoked as a deterministic stage, or deliberately retired; do not silently bypass it.
- Ensure a provider timeout does not leave the player with a misleadingly narrated but uncommitted action.

**Additional architecture decision:** Separate authoritative game resolution from presentation availability. If a valid action has been resolved, a narration-provider failure should not automatically erase the gameplay outcome. The preferred design is to commit the accepted deterministic outcome and use a safe deterministic fallback message if the narrator and repair both fail. This must be tested with idempotency and retry handling before adoption.

**Gate:** Live `/api/game/action` tests prove a single production path, no third repair call, consistent state/narration, and safe provider-failure behaviour.

### Phase 1B — Premise materialisation and ordinary environmental affordances

**Goal:** Make the world respond naturally to ordinary interactions without weakening protection around important facts.

- Define structured scene anchors for opening premises and investigations.
- Ensure freeform starting premises that establish a body, clue, location fixture, or incident are converted into structured world elements before Turn 1.
- Build a bounded AffordancePlausibilityEngine keyed by location archetype and interaction type.
- Allow mundane props/fixtures to be materialised on demand with explicit provenance.
- Keep plot-critical items, weapons, keys, bodies, currency, and quest objects under strict creation rules.
- Add temporary-state metadata (origin, scope, created-at, expiry/promotion policy) where the schema requires it.

**Gate:** Ren's crime-scene premise is inspectable; mundane objects such as an office chair, park pebble, and sewer drain can be interacted with; unestablished weapons/quest objects remain unavailable.

### Phase 1C — Hybrid World Simulator MVP

**Goal:** Resolve plausible dynamic entities and events without requiring every entity to be authored ahead of time.

Build a small, typed World Simulator interface. Start with a narrow set of scenarios:

- Hailing and boarding a taxi.
- Asking a passer-by for directions.
- Approaching a street vendor/shopkeeper.
- A witness reacting to a nearby event.
- A crowd responding to a disturbance.

The MVP must include:

- Structured proposals, never direct freeform state mutation.
- Archetype/context plausibility checks.
- Temporary entity creation and continuity while active.
- Deterministic resolution of success/failure and consequential state.
- Explicit player location, time, cost, inventory, and knowledge consequences.
- Event provenance and idempotency.
- Promotion conditions for recurring or consequential entities.
- Expiry rules that account for active interactions and journeys.
- Model routing, timeout budgets, and deterministic fallback behaviour.

**Gate:** In the Ren scenario, "I hail a taxi" can generate a plausible taxi interaction without pre-registering the vehicle, but the player only boards/moves when the action resolver confirms it.

### Phase 1D — Repair memory and NPC minds

**Goal:** Make existing memory and character-intelligence modules persistent and live-path correct.

- Record plot beats from canonical ActionResolution on live turns.
- Ensure significant discoveries, decisions, combat transitions, and relationship changes produce structured events.
- Persist witnessed facts only to NPCs who could plausibly observe or learn them.
- Persist relationship deltas through the authoritative NPC record.
- Unify location/schedule/activity/availability state ownership.
- Connect NPC autonomy for bounded goal progression and off-screen movement.
- Maintain private NPC beliefs/secrets separately from player knowledge and narrator-visible knowledge.
- Define memory promotion/decay and what each tier means; retain the current lifecycle where it already meets the requirement.
- Integrate causal provenance edges only after defining stable event/entity IDs and useful retrieval queries.

**Gate:** Witness knowledge and relationship changes survive reload; absent NPCs do not learn events they could not know; plot beats update on live play; long-session retrieval remains coherent.

### Phase 1E — Unified world ticks and background processing

**Goal:** Simulate the living world without blocking every player action on every background activity.

- Establish one deterministic world simulation tick for relevant clock advances.
- Use EntityCard (or another explicitly selected authoritative store) as the NPC state owner.
- Decide which active/nearby updates must be synchronous and which distant/background updates may be asynchronous.
- Add a bounded post-turn job queue for memory compaction, NPC planning, and distant world momentum.
- Use snapshot versions, event ordering, idempotency keys, and compare-and-commit/rebase rules so stale jobs cannot overwrite newer player actions.
- Reduce the time the per-world mutex is held across provider/network waits where safe. Do not simply release the lock and commit stale results.

**Gate:** Background work can be delayed, duplicated, or fail without corrupting canonical state; concurrent player commands remain correct; the foreground experience remains responsive.

### Phase 1F — Full long-session evaluation and regression

**Goal:** Verify the user-facing experience, not just module-level correctness.

- Run 30–50 turn campaigns and include long gaps between recalled events.
- Include the original Ren Takahashi scenario as a permanent regression fixture.
- Test at least two providers/model tiers plus provider timeout/failure paths.
- Compare model-generated world proposals against deterministic fallback outcomes.
- Track latency, tokens, repair rate, failed-turn rate, and state consistency.
- Human-play the actual UI; automated tests alone cannot establish narrative quality.

**Gate:** All acceptance criteria in Section 9 pass, with the evidence separated into automated, mocked-model, live-provider, and human UI results.

---

## 9. Acceptance criteria

### 9.1 Core correctness

- A player movement narration cannot claim a destination change unless the authoritative movement resolver has committed it.
- A failed action leaves location, inventory, money, and other state unchanged except for explicitly permitted costs/time consequences.
- A successful action's consequences remain recorded even if a later narration provider fails; the player receives a truthful fallback.
- One live turn follows one coherent validation policy and at most one targeted repair pass after initial generation.
- Retrying the same request cannot duplicate a taxi, purchase, quest completion, or other consequential event.

### 9.2 Dynamic world and temporary entities

- A player can hail a taxi in a plausible street without a pre-authored taxi record.
- A taxi that stops becomes a tracked temporary entity while the interaction/journey is active.
- A taxi that does not stop does not move the player.
- A temporary entity remains consistent while referenced by an active scene, interaction, or journey.
- Temporary entities expire only when their expiry conditions are satisfied and no active dependency requires them.
- A temporary NPC can be promoted to persistent canonical status when it becomes a recurring character, witness, quest participant, or otherwise consequential entity.
- The LLM cannot directly create an unearned key, weapon, body, secret clue, currency, quest objective, or permanent state change.

### 9.3 Environmental affordances

- Archetype-plausible mundane interactions work in offices, parks, streets, sewers, markets, taverns, and other supported location types.
- Affordance materialisation has provenance and can be inspected/debugged.
- The semantic reviewer accepts grounded environment descriptions without requiring every ordinary noun to be individually authored.
- Strict checks remain for plot-critical facts, hidden clues, secrets, combat capabilities, and inventory.

### 9.4 Memory and NPC knowledge

- Significant live actions create plot/event records.
- An NPC present for a perceivable event can acquire an appropriate witnessed fact.
- An absent or occluded NPC does not acquire that fact without a valid information-transfer event.
- Relationship changes persist across turns and reloads.
- The NPC's private goals/secrets do not leak into player-facing text unless discovered through a legitimate route.
- Background NPC updates cannot overwrite newer authoritative state.

### 9.5 Narrative quality and long-session play

- Opening scenes do not invent unsupported crime-scene evidence or expose internal system diagnostics.
- Observation/listening actions return a grounded result or an honest limitation.
- Temporal checks distinguish time references from ordinary idioms/proper nouns.
- Character voice and continuity remain stable across providers and long sessions.
- Tests cover 30–50 turn sessions, model failures, malformed model output, fallback, replay, and reload.

### 9.6 Required evidence categories

Every milestone report must distinguish:

1. Unit tests.
2. Live-route integration tests.
3. Mocked-model tests.
4. Real-provider tests.
5. Manual player-facing UI tests.
6. Performance and cost measurements.

A passing unit test is not proof that the live player experience works.

---

## 10. Risks and safeguards

| Risk | Why it matters | Safeguard |
| --- | --- | --- |
| LLM world proposals invent important facts | Could corrupt mysteries, inventory, quests, or player agency | Typed proposal schema, strict canonical validation, allowlisted dynamic entity classes, provenance, and rejection path |
| Too many model calls | Latency and cost grow; current audit reports provider timeouts | Use deterministic affordances for mundane interactions; invoke world simulation only where flexible reasoning materially helps; one foreground repair maximum |
| Stale background updates | NPC/world state may revert or contradict player actions | Versioned snapshots, append-only events, idempotency, compare-and-commit and rebase/reject stale jobs |
| Temporary entities expire too early | Active taxi journey or witness conversation may break | Expiry based on dependencies and event lifecycle, not a universal short turn limit |
| Temporary entities never expire | World state accumulates unbounded transient objects | Scope, TTL, cleanup policies, promotion rules, and observability |
| Knowledge leakage | NPC secrets or world truth may appear to the player prematurely | Separate access projections; per-NPC knowledge views; outbound validation |
| Dual authority for NPCs | Schedules and location can drift | One authoritative NPC state owner; derived views only |
| Narrative failure rolls back gameplay | Player action appears not to happen when only prose generation failed | Separate gameplay outcome from narration presentation; deterministic fallback and idempotent commit |
| Open-source licence/dependency issues | Reuse may impose obligations or incompatible terms | Pin commits; review code, dependencies, assets, notices, and distribution model before copying |
| Overengineering | More agents and databases can increase complexity without improving play | Small scenario-based MVP; only add infrastructure after a measured requirement |

---

## 11. Unresolved decisions and recommended defaults

| Decision | Recommended default | Why / what still needs confirmation |
| --- | --- | --- |
| Can the LLM propose temporary entities? | Yes, through structured proposals only | This is central to the agreed dynamic-world direction; proposal is not an accepted state change |
| Should every mundane object require an LLM call? | No | Use deterministic archetype affordances for common props; use the LLM for situational activity and social/world responses |
| What becomes persistent? | Entities/events become persistent when they are consequential, recurring, player-owned, discovered evidence, or required by an active dependency | Avoid storing every passer-by while retaining everything that matters |
| How should temporary entities expire? | By lifecycle conditions, world time, scope, and active references; no universal 10-turn deletion rule | A fixed turn count could remove something still used in a journey or interaction |
| Should background agents run after every turn? | Only bounded, relevant jobs; use triggers and budgets | Prevent unnecessary cost and avoid stale-state churn |
| Should Dreamville add Neo4j? | No, not initially | First connect and measure the existing provenance/knowledge structures; add a graph store only if query needs justify it |
| Should all NPCs use separate LLM calls? | No | Use structured NPC cognition slices in the foreground; schedule costly independent planning selectively in background |
| Should narration failure undo resolved gameplay? | Prefer no; use a deterministic fallback while preserving an accepted action | Requires explicit transaction and idempotency tests before implementation |
| Which richness-dimension count is official? | Undetermined | Read current source, schema, evaluator, and tests; reconcile the 12/13 discrepancy |
| Which source baseline is authoritative? | Current Git repository HEAD after a fresh reconciliation | The AI Studio audit lacked `.git` metadata in its mounted snapshot |

---

## 12. First implementation gate and working protocol

Before the first code change, the implementation agent must:

1. Reconcile current Git state and preserve all existing work.
2. Confirm which AI Studio audit findings still apply to the current branch.
3. Produce a short verified baseline: current branch/commit, affected files, live execution path, tests that reproduce each issue, and dependencies.
4. Implement only the explicitly authorised phase and acceptance criteria.
5. Work on a separate branch; do not merge to main or push/merge a PR without explicit approval.
6. Follow AUDIT → IMPLEMENT → TEST → REGRESSION → RE-AUDIT.
7. Report beginner-friendly explanations alongside technical evidence.
8. Include complete test commands/results and distinguish mocked from real-provider and manual UI testing.

This document does not authorise implementation. It establishes the reconciled target architecture and proposed order. Implementation begins only after the current Git baseline has been verified and the user explicitly authorises the first phase.

**Recommended first coding milestone**

Once authorised, begin with **Phase 1A: live narration and validation stabilisation** after Phase 0 confirms the current repository. Build the World Simulator only after the production action/narration path reliably resolves, validates, and reports actions.

---

## 13. Source register

### Internal audit inputs

- **Audit 1:** Chat-pasted architecture assessment and prior open-source comparison from the conversation. Its claims about existing Dreamville components are historical/contextual and were not freshly verified against the current Git checkout in this reconciliation.
- **Audit 2:** Uploaded `Pasted text(20261031-131834).txt`, titled **DREAMVILLE — PHASE 1: SYSTEM-WIDE ARCHITECTURE AUDIT**. Key sections: execution flow (§3), component status (§4), canonical state (§5), dynamic simulation (§6), environmental affordances (§7), memory (§8), NPC independence (§9), foreground/background (§10), comparative research (§11), Ren failure analysis (§12), tests (§13), roadmap (§16–17), acceptance criteria (§18), and limitations (§19).

### Public project references checked for this reconciliation

- **Openovel** repository and README (dual-loop design, current beta status, file-native story state, Apache-2.0): https://github.com/Feed-Scription/openovel
- **AiChatTrpg** README (role separation, local-first project description, Apache-2.0, dependency licensing note): https://github.com/Leehow/AiChatTrpg
- **Narrative Engine** repository and MIT licence: https://github.com/Sagesheep/NarrativeEngine-P
- **Project Lunar** repository and README (memory/NPC/world patterns, README states MIT): https://github.com/horizonfps/project-lunar
- **Awesome Story Generation** papers index (current README describes a taxonomy and 199 papers): https://github.com/yingpengma/Awesome-Story-Generation

Upstream information is subject to change. Before any code reuse, verify the exact commit, licence file, dependencies, assets, and notices in the version being considered.

---

## Final architecture decision

Dreamville should evolve into a hybrid living-world RPG. Keep deterministic authority for consequential facts; make ordinary environmental affordances dynamic; add an LLM World Simulator that proposes temporary entities and context-sensitive activity; validate and reconcile all proposals before they affect the world; repair the existing memory and NPC systems; and use asynchronous background maintenance with safe versioned commits.

The target is not "more AI calls" or "more agents." The target is a world that responds naturally to player intent without losing causality, continuity, player agency, or canonical truth.
