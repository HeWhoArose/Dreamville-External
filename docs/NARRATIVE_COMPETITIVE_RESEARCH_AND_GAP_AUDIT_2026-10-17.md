# Dreamville — Narrative Competitive Research & Gap Audit

**Status:** CURRENT RESEARCH EVIDENCE — design input, not an implementation instruction  
**Date:** 2026-10-17  
**Owner plan:** [`NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md`](NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md) (the deferred `ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md` §10 and §15 also cite this document)  
**Code reviewed:** `main` at merge commit `ce3d3cb8` (merge of PR #76). Source-read audit only; nothing here is a live-model result.

**Rule that still applies:** every proposal below must pass Phase 0 of the active plan and must be reproduced as a demonstrated gap before code changes. Do not create a parallel memory, plot, router or state authority. Extend the owners named in `docs/README.md`.

---

## 1. Scope and evidence discipline

The question: how do comparable AI game-master and interactive-fiction systems keep narration **rich**, **consistent**, and **objective-driven**, and what does that say about Dreamville?

Evidence tiers used throughout (the active plan asks us to separate verifiable detail from marketing):

| Tier | Meaning |
|---|---|
| **A** | First-party documentation, patch notes or help-center pages from the product |
| **B** | Open-source code or documentation |
| **C** | Peer-reviewed paper, preprint or thesis |
| **D** | Product marketing or third-party directory text (internals not verifiable) |
| **E** | Anecdotal user reports and hackathon self-descriptions |

Sample sizes in the academic work are small (for example 12 participants for the ChatRPG study). Treat results as directional.

---

## 2. Systems reviewed

### 2.1 Friends & Fables (tiers A, E)

Sources: [How Franz works](https://fables.gg/blog/how-franz-works) · [Franz 2.0 notes](https://fables.gg/patch-notes/franz-20-working-context-lore-improved-planning-and-more) · [Worlds help page](https://help.fables.gg/articles/5283283-worlds) · [ACE-1.5 notes](https://fables.gg/patch-notes/ace-15-bringing-pois-and-npcs-to-life-npc-conversations) · [OOC mode notes](https://fables.gg/patch-notes/narration-112-ooc-mode) · [legacy quest guide](https://help.legacy.fables.gg/guides/quests)

What they say they do:
- **Working Context.** The model's next turn sees a bounded bundle built from *context blocks* (memories and lore, each active, idle or archived and self-managing), a *Plot & Plan* component, and an automatically built *scene context*. The player can see and edit it.
- **Research step before narration.** The system searches long-term memories, lore and entities for the player's message, and pulls the relevant items into working context. Their stated reason: more irrelevant context produces worse output.
- **Worlds as a foundation.** Pre-authored lore, characters and places exist so the model has material to expand and does not loop or lose direction.
- **Distance and importance weighting.** Character context depends on proximity and importance; aliases resolve alternate names; they worked to stop the narrator from writing player dialogue.
- **Quests as explicit modes.** Looking for a quest, in a quest, or quests off. An accepted quest is stored and kept in memory until completed; quest steps are waypoints, not single actions.
- **OOC channel with tools** for searching memory, reading sheets, and creating or updating records.

Reported weaknesses (tier E, one public feedback post, anecdotal): the game master bends toward giving the player what they want, so stakes feel absent; it asks the player what they find instead of deciding; it forgets character details; it introduces improvised monsters. Treat these as hypotheses to test, not facts.

### 2.2 AI Dungeon (tier A)

Sources: [Memory system](https://latitudegames.notion.site/39c9c77873304481b0f1ea0491703539) · [What goes into the context](https://latitudegames.notion.site/What-goes-into-the-Context-sent-to-the-AI-7e5881352de6427da9c92b04149e8e50)

- Context is assembled from fixed layers: instructions, small always-on *Plot Essentials*, an *Author's Note*, a rolling *Story Summary* (auto-summarized every few actions), keyword-triggered *Story Cards*, a *Memory Bank* of condensed memories chosen by relevance, and recent history.
- Required layers are protected; dynamic layers share the remaining token budget in documented proportions.
- The authors say the model appears to "forget" because older text falls out of the window; their answer is summaries plus selective retrieval, not a bigger window.

### 2.3 AI Realm / AIRealm (tier D)

Sources: [site](https://airealm.com/) · [roadmap](https://airealm.com/home/roadmap)

Marketing claims automatic quest tracking, persistent world memory, character notes and a choice of eight models. No technical description of how consistency is achieved is public. The roadmap lists "memory improvements" in more than one time bucket, which suggests memory is still an open problem there. Nothing further can be verified.

### 2.4 "Loreweaver" — three unrelated things (tiers D, E)

1. A Discord game-master bot (marketing text only): [listing](https://www.g2.com/products/loreweaver/discuss).
2. A Gemini 3 hackathon text RPG: [Devpost write-up](https://devpost.com/software/project-1h7b09w26ci8). Self-reported design: an agentic loop where the model chooses among 19 tools, up to 24 calls per turn; an after-the-fact enforcement layer checks each turn against inferred player intent; NPCs have tiered memory with a long-term graph and spreading-activation retrieval; a world-extraction pipeline turns lorebook files into a knowledge graph. The author reports three rewrites (hard-coded engine, synchronous LLM pipeline, agentic loop) and says each failure shaped the next design.
3. A fine-tuned roleplay language model (not a game system).

Relevant to Dreamville: item 2 uses the same provider family and a similar "validate against intent" idea, but chooses an unbounded-ish tool loop. Dreamville's bounded call policy is the opposite and better suited to free-tier quotas.

### 2.5 Open-source and academic systems

| System | Tier | What it contributes |
|---|---|---|
| **ChatRPG v3 / SENNA** ([paper](https://projekter.aau.dk/projekter/files/784680954/Narrative_Adherence_in_LLM_driven_Games.pdf), open source) | B, C | A *Narrative Graph*: a DAG of milestones with undiscovered/ongoing/completed status and yes-no edge conditions. Five agents: Scribe (builds graph), Examiner (allowed / conditionally allowed / disallowed verdict), Navigator (advances graph), Narrator, Archivist (world consistency). Earlier versions over-complied with player input. |
| **Redirection study inside ChatRPG v3** | C (n=12) | Players and expert GMs preferred in-world consequences, NPC influence and extra information over hard denial. Hard denial was rated worst; no participant preferred it. Players wanted a reason, not just a refusal, and wanted drama scaled to the deviation. |
| **Drama Llama** ([arXiv](https://arxiv.org/html/2501.09099v1)) | C | Combines storylets with an LLM. Names two LLM failure modes: *narrative structurelessness* (events with no direction) and *lack of pushback*. |
| **Dramamancer** ([arXiv 2601.18785](https://www.alphaxiv.org/overview/2601.18785)) | C | Author writes a story schema; a monitor checks semantic conditions in the playthrough after every player input. |
| **Façade** ([paper](https://users.soe.ucsc.edu/~michaelm/tenurereview/publications/mateas-tidse2003.pdf)) | C | Classic drama manager: author-annotated beats with preconditions and effects, sequenced against story state. |
| **Generative Agents** ([arXiv 2304.03442](https://arxiv.org/abs/2304.03442)) | C | Memory stream scored by recency, importance and relevance; periodic *reflection* creates higher-level memories. |
| **RPGBench** ([arXiv 2502.00595](https://arxiv.org/abs/2502.00595)) | C | Models write engaging stories but struggle to apply mechanics consistently in long scenarios. Uses deterministic (LLM-free) checks plus an LLM judge. |
| **PAYADOR** ([arXiv 2504.07304](https://arxiv.org/abs/2504.07304)) and a **neuro-symbolic dual-LLM paper** ([ICCC 2026](https://computationalcreativity.net/iccc26/papers/ICCC26_paper_47.pdf)) | C | Model predicts structured world-state transformations, which are validated before being applied; a separate narrative step describes the updated state. |
| **Graph-grounded narration** ([arXiv 2301.05746](https://arxiv.org/abs/2301.05746)) | C | Training on graph state improved consistency of action narration in a text adventure. |
| **CALYPSO** ([AIIDE 2023](https://doi.org/10.1609/aiide.v19i1.27534)) | C | LLM as a game master's assistant that distils context into short prose. |
| **LLMs as RPG game masters** ([thesis](https://thesis.dial.uclouvain.be/entities/masterthesis/98a98b9c-319d-4a51-abf8-5eae1a4a09e6)) | C | Rich narratives but logical inconsistencies, memory problems and susceptibility to player influence. |
| **SillyTavern World Info / DeepLore** ([pipeline docs](https://github.com/pixelnull/sillytavern-DeepLore/wiki/Pipeline)) | B | Keyword scan with depth, recursion, cooldown and token budget, optionally followed by an AI-selection stage (two-stage retrieval). |

Not found with reliable detail: the internals of AI Realm and the Discord Loreweaver bot. "Dungeon AI" is ambiguous; this review treats it as AI Dungeon.

---

## 3. What the strongest systems have in common

1. **A structured world state is the authority; the model proposes.** Validate proposed changes, then narrate the validated state (PAYADOR, the dual-LLM paper, ChatRPG's Examiner/Archivist split). This is the pattern Dreamville already follows.
2. **Context is engineered, budgeted and inspectable**, not a growing transcript (Friends & Fables, AI Dungeon, SillyTavern).
3. **Explicit story structure** is what produces clear objectives. Pure LLM play drifts (Drama Llama, Façade, ChatRPG's milestone graph).
4. **Pushback is designed.** Avoid both sycophancy and bare refusal; use consequences, NPC voices and information.
5. **Memory beyond the window needs two moves**: retrieval *and* consolidation (summaries or reflection).
6. **Evaluation combines deterministic checks with a judged layer** (RPGBench).
7. **Players need visible progress**: ChatRPG's study measured goal clarity and progress feedback explicitly.
8. **Unbounded agent loops cost a lot.** The Loreweaver hackathon design spends up to 24 calls a turn; a free-tier project needs bounded calls and a deterministic floor.

---

## 4. Dreamville audit against those findings

Evidence references are to the source tree at `ce3d3cb8`. "Verify" means the behaviour must still be demonstrated in the Phase 1 live sessions.

### 4.1 Already in place (equal to or ahead of what the comparators document)

| Capability | Where | Note |
|---|---|---|
| Deterministic resolution, canonical commit, AI as proposer/narrator | `aiOrchestrator.ts`, `canonicalCommandEngine.ts`, `worldRepository.ts` | Matches the strongest research direction |
| World / player / NPC / AI knowledge separation | `currentSituation.ts`, `semanticNarrativeReview.ts` | None of the commercial systems document this |
| Budgeted working context with priority bands and ACTIVE / IDLE / ARCHIVED blocks, plus a player-facing inspector | `workingContextEngine.ts`, `ContextInspectorModal.tsx` | Equivalent to Friends & Fables' Working Context |
| Research step before narration | `narrativeResearchPipeline.ts` | Equivalent to their research step |
| Memory retrieval with importance, decay and bounded recency | `memoryOpportunityEngine.ts`, N16 audit | Already close to the Generative Agents scoring idea; deliberately not embeddings |
| Candidate review, one bounded repair, deterministic floor | `semanticNarrativeReview.ts`, `aiOrchestrator.ts` | Not described by any comparator |
| Repetition and trope control with a prompt-side avoid list | `narrativeNoveltyEngine.ts`, N18 richness | Not described by any comparator |
| Provider fallback chains including free routes, call policy and call budget | `server/data/orchestrator_config.json`, `aiCallPolicy.ts` | Cost-aware by design |
| Forensic session recorder (capture): intent, situation, plan, prompts, attempts, review verdicts, provider provenance, state hashes and patches | `storySessionRecorder.ts`, `storySessionRecordingStore.ts` | Capture side of the evaluation story; replay is missing (F5) |
| OOC channel with read/mutate tool boundary | `oocToolRegistry.ts` | Equivalent to the Franz OOC mode |
| Per-turn meaningful-beat contract | `storyBeatDirector.ts` | Verified owner; do not rebuild |

### 4.2 Partial — the main findings

**F1. Objectives are fragmented and mostly authored-only.**
The quest log UI (`ChronicleView.tsx`) is fed by the `GET /run-canonical-state` route, which derives quests only from the run's authored `plannedEvents` (`gameRoutes.ts`, the `questEvents` projection). Other objective-like structures exist separately:
- `StoryThread` records created by `EmergentNarrativeEngine` (they do reach `CurrentSituation` open threads and research, but their titles are mechanical, such as "Emergent Thread: <event type> at <location>", and carry no objective text or resolution condition);
- `NarrativeOpenThreadRecord` in `narrativeMemoryLifecycle.ts`;
- `OpenThread` inside `CurrentSituation`;
- `SituationObjective` in `situationEngine.ts`, which is only reachable through the Phase 8 simulation engine;
- the per-turn `objective` string in `EphemeralNarrativePlan`.
There is no single player-visible ledger that merges them, and no way for a player-stated aim ("I want to get into the guild") to become a tracked objective. This directly relates to the active plan's concern about follow-ups losing the player's goal.

**F2. The information goal does not persist.**
`intent.informationGoal` is read inside the turn (orchestrator, semantic review, research) but no cross-turn objective store was found. "I check further" therefore depends on whatever recent-turn context happens to carry. Verify in Phase 1 scenario G.

**F3. No long-horizon story structure.**
`EphemeralNarrativePlan` is explicitly `expiresAfterNarration`. No act, arc, pacing or foreshadowing structure was found (no `storyArc`, `plotThread` or `foreshadow` names anywhere in `server/` or `src/`). The drama-management literature and ChatRPG's milestone graph are the closest references. Dreamville has the raw material: planned events, StoryBeat contracts, N17 episode projection, living-world clocks.

**F4. `StoryDirectorService` looks orphaned and content-coupled.**
It defines three trigger rules tied to specific demo content (a cipher, a refusal, "ruins echoes"). It is reachable through three REST endpoints and is exercised by tests, but no client code and no turn-pipeline caller was found. Phase 9's orphan audit should either wire it to the canonical owners or archive it.

**F5. Evaluation is deterministic and advisory only; recordings cannot be replayed; live validation is human-only and not yet passed.**
Richness and novelty checks are heuristic. `StorySessionRecorder` already captures each turn (intent, situation, plan, prompts, attempts, review verdicts, provider provenance, state hashes), but no replay path and no LLM-judge layer were found. Because live-model runs need credentials and a person, real model outputs cannot currently be re-run through the validators in CI.

**F6. No player-facing recap found.**
Search found recap handling only in unrelated code. Verify whether a "previously" view exists elsewhere before proposing one.

### 4.3 Gaps (not found in the source)

| Gap | Evidence | Why it matters |
|---|---|---|
| **Consolidation of long-run memory** (arc-level summaries or reflection) | N16 retrieval exists; no consolidation step found | Both AI Dungeon (auto-summary) and Generative Agents (reflection) rely on it for long sessions |
| **Explicit pushback / redirection policy** | No redirection concept in code; prompts forbid turning attempts into outcomes but do not say *how* to decline or steer | Sycophancy and bare refusal are the two failure modes named in the literature |
| **Pacing and stall detection** | None found | Drama Llama's "structurelessness" |
| **Player-owned goals** | None found | Friends & Fables handles custom quests only through conversation |
| **Narrative stakes and fail-forward rules** | Combat has real stakes; non-combat stakes unverified | The Friends & Fables feedback post complains about no risk |

### 4.4 Risks to check, not conclusions

- Mechanical emergent-thread titles can enter prompts as "open threads" and may flatten narration. Check in Phase 1.
- Demo-specific content inside engine services (see F4) makes new worlds inherit story-specific triggers.
- A narrator that asks the player to invent discoveries ("what do you find?") is a documented failure elsewhere; Dreamville's player-agency rules cover forcing player actions but should be tested for *abdication of authorship*.

---

## 5. Proposed additions beyond the research findings

These use Dreamville's own strengths (canonical provenance, epistemic categories, seed-stable simulation). Each is a **proposal for an owner decision**, not scheduled work.

1. **Evidence lens and deduction play.** Because every claim already has a category (canonical, player-known, inferred, unknown), the Story UI could offer "how do I know this?" chips and a contradiction board for rumours versus witnessed facts, with informant reliability. This turns the epistemic system into gameplay and makes grounding visible to players.
2. **Replay of recorded sessions.** The recorder already captures what is needed; add a replay path that re-runs recorded candidates through the review, repair and fallback pipeline in CI. This converts a one-off human result into a regression asset and addresses the BLOCKED problem without pretending mocks are live.
3. **Consequence visions.** The ChatRPG study found previews of what *would* happen were well liked. Dreamville can offer this as a clearly labelled, non-canonical "vision" (category 5), never committed, always bounded by the call budget.
4. **World pressure clocks.** Surface faction or world clocks driven by the existing living-world simulation ("the guild's patience: 3/6") so stakes and pacing come from committed world events rather than narrator invention.
5. **Player-owned goals.** Capture an aim the player states, confirm it with them, and store it in the objective ledger as distinct from world quests, so elliptical follow-ups and the narrator both anchor to it.

---

## 6. Recommended slices (refined into X1–X9 in the V2 plan)

The V2 plan splits and renames these (X1, X1b, X2, X3, X4, X5a/X5b, X6b/X6c, X8, X9) and fixes each one's phase. Use V2 for scheduling; this table records the original grouping.

| Slice | Attaches to | Extends (do not duplicate) | Reproduce first |
|---|---|---|---|
| X1 Objective ledger **projection** (read model merging planned-event quests, story threads, open threads, information goal, player-owned goals) with a player-visible "current objective" | Phase 2 and Phase 5 | `ChronicleView` data path, `CurrentSituation`, `narrativeMemoryLifecycle` | Scenarios G, M, R |
| X2 Pushback policy: choose among consequence, NPC influence, information; bare refusal only for rule-bound cases | Phase 6 | Existing `ActionResolution` verdicts and prompt contract | Scenario Q |
| X3 Memory consolidation: periodic arc-level summary stored through the existing memory owner | Phase 3 | `MemoryOpportunityEngine`, N16 | Scenario S |
| X4 Milestone/arc layer built from planned events with preconditions and effects, committed canonically | Phase 5 | `plannedEvents`, N17, StoryBeatDirector | Scenarios T, W |
| X5 Hybrid evaluation: deterministic assertions plus optional judged dimensions; replay of recorded sessions (capture already exists) | Phase 0 (coverage check), Phase 8 (replay) | `StorySessionRecorder`, existing tests, N18 | Baseline report |
| X6 Orphan resolution for `StoryDirectorService` and mechanical thread titles | Phase 9 | Canonical event/thread owners | Phase 0 trace |

---

## 7. Limits of this research

- Commercial internals beyond what each vendor publishes are unknown. Anything tier D is marketing.
- Most academic results come from small studies and short sessions.
- Nothing here establishes that Dreamville's live narration is good or bad. Phase 1 of the active plan remains **not passed**.
