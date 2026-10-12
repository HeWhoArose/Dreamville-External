# Dreamville Narration — Industry Cross-Comparison Audit + Remediation Plan (2026-10-12)

Companion to `NARRATION_ARCHITECTURE_AUDIT_2026-10-11.md` (defect-level audit, all FIND-1..6 fixed).
This report benchmarks our narration architecture against published systems, lists remaining
gaps/problems, and gives a phased plan. Code inspected at working-tree HEAD (working tree holds
FIND-1..6 fixes + audit additions).

## 1. What the reference systems do (evidence-backed)

| System | Key mechanism | Source |
|---|---|---|
| AI Dungeon | Fixed context assembly order (Instructions → Plot Essentials → Story Cards → Story Summary → Memory Bank → History → Author's Note → Last Action); auto-summary every ~6 actions, big summary every ~15; embedding **Memory Bank** retrieval vs. most-recent action; eviction rules when over budget | help.aidungeon.com/faq/what-goes-into-the-context-sent-to-the-ai; /faq/the-memory-system |
| NovelAI | Memory (top) vs Author's Note (near generation point) placement; **Lorebook** keyword-triggered entries with per-entry token budgets/insertion position; Context Viewer shows what was included/trimmed | docs.novelai.net Lorebook / Advanced Settings |
| AI Realm | Player-editable campaign records: auto campaign summary (~every 8 msgs), GM Guides, **NPC Cards**; enable/disable records to manage context | airealm.com/home/v2Guide |
| Character.AI | Facts + Story Memories + message history; Lorebook with keyword activation linked across Characters; "important info first" because Definition truncates | blog.character.ai/memory; book.character.ai |
| Generative Agents (Smallville) | Memory stream retrieved by **relevance + recency + importance**; **reflections** synthesize higher-level conclusions; reported failures: missed memories, fabricated embellishments | arxiv 2304.03442 |
| PANGeA | Separate **narrative-alignment validator**; ablation: validity 28%→98% (small model), 71%→99% (GPT-4) | ojs.aaai.org AIIDE 31876 |
| Labyrinth function-calling GM | Dice/state changes behind explicit tool functions; failure modes documented: dice deadlock, premature state updates | arxiv 2409.06949 |
| Hidden Door | Authored story beats + world "laws", phrase dictionary, narrative playbooks; "fractal memory", open threads | hiddendoor.co blog/FAQ |
| Friends & Fables ACE-1 | Separate campaign engine (state, memory retrieval, relationships, pacing modes); atomic→event memories linked to entities/places | fables.gg blog + patch notes |
| Evaluation research | MT-Bench: LLM-judges strong but position/self-preference biased; rubric-based human eval of Consistency/Reliability/Interest in the GM study | arxiv 2306.05685, 2406.07791, 2409.06949 |

## 2. Where Dreamville already matches or exceeds the field

Verified against code (file:line):

1. **Validator-before-authority (strongest-area).** Chain `intent → situation → research → plan →
   prompt → validation (validateTurnPackage + pacing + continuity + intent-safety + information/temporal)
   → SemanticNarrativeReview (aiOrchestrator.ts:7569, single bounded rewrite) → LiteraryNarrativeReview
   → RichnessEvaluator → adjudicate → commit → remember`. This *exceeds* AI Dungeon
   (no published output validator) and is exactly the PANGeA pattern whose ablation is the
   strongest published evidence for validators. Our FIND-6/ FIND-1 saga = validator layer working as designed
   once the floor bug was fixed.
2. **AI proposals never self-authorize** (narrativeStateAdjudicator; canonical rules engines). Matches
   the Labyrinth "state changes behind functions" pattern and beats Character.AI (no such guarantee).
3. **Epistemic visibility filtering** on memory retrieval (memoryOpportunityEngine.ts:424-490: viewerActorId,
   PUBLIC/SHARED/PRIVATE, persistent-critical floor 75) — none of the consumer systems publish this.
4. **Token budgeting with priority bands** (workingContextEngine.ts: B1..B5, hard budget 400-600,
   eviction reasons recorded) — analogous to AI Dungeon's allocation, better instrumented.
5. **Novelty/repetition ledger** (narrativeNoveltyEngine, threshold-2 warnings in prompt) — like
   NovelAI's phrase penalties but semantic, not token-level.
6. **Open-thread tracking** (runtime.openNarrativeThreads, priority threads in prompt) — matches
   Hidden Door's open-thread concept.
7. **NPC planning slices** (npcPlanningSlice.ts: recent NPC memories + relationship + authorized
   knowledge + knowledge boundary) — richer per-NPC grounding than published AI Realm NPs.
8. **Quality-tiered model routing** (aiQualityRouting) — a capability we didn't see in any consumer product.

## 3. Problems / gaps found (this pass)

| ID | Sev | Evidence (code) | Comparison | Problem |
|---|---|---|---|---|
| GAP-1 | High | serverMockAuthority.ts:1284 `.slice(-2).reverse()` recentTurns; currentSituation maxRecentTurns=8; aiOrchestrator:7719 | AI Dungeon ~6-action chunk summaries + 15-action summary; our plot summary is **only committed canonical stateChanges** (narrativeMemoryLifecycle.ts:235: canonicalBeatFacts) | **No narrative-layer summarization pipeline.** 'summary.scene' task exists but has **zero production callers** (only settings UI/errors paths). Plot summary degenerates to "X committed for Y; Z committed for W" after turn ~40; narrativeContextHistory caps at 40 entries then hard-truncates. Long sessions lose plot prose entirely — AI Dungeon's documented two-tier summary is the fix pattern. |
| GAP-2 | Medium | memoryOpportunityEngine.ts:466 relevance = literal `content.includes(keyword)` (+25) | Generative Agents relevance+recency+importance; AI Dungeon embedding Memory Bank | Retrieval is **substring matching only** — synonym/paraphrase misses ("sword" won't match "blade" memory). Game already has `research.query` + embeddings-capable models; no embedding index exists. |
| GAP-3 | Medium | npcPlanningSlice.ts:47 `.sort(importance).slice(0, 20)`, no recency weighting; no NPC reflection concept | Generative Agents reflection loop | NPC memories are importance-ranked only; a 40-turn-old high-importance memory crowds out last-turn's dialogue. No mechanism for NPCs to consolidate beliefs ("they stole the key") from event streams — the single biggest believability lever in the Smallville ablations. |
| GAP-4 | Medium | narrativePromptBuilder compose(): 20+ sections, budget shedding strips research→working-context last | NovelAI: crucial info near generation point; C.AI: "most important first" | Prompt is **contract-dump ordered**, not salience-ordered; when maxPromptTokens tight (≤1500), quality context collapses to a one-liner (narrativePromptBuilder.ts:233) and workingContext (containing memories) gets truncated to 350 chars mid-sentence (slice()) — could orphan the last memory the model most needs. |
| GAP-5 | Low | narrativeMemoryLifecycle.ts:287-299: threads keyed by regex on candidate text (;/\b(?:unresolved|pending|...)/) | Hidden Door authored beats | Thread detection is **vocabulary-gated**: a thread phrased as "The mirror shard pulses" never becomes OPEN. Also threads auto-RESOLVE only via explicit works; STALE threshold unclear. |
| GAP-6 | Low | plot.beats `.slice(-40)`; openThreads `.slice(-24)`; contextHistory `.slice(-40)` | AI Dungeon discards by relevance, not recency alone | All history stores are **fixed-size sliding windows**: a 100-turn story keeps only the last 40 of everything durable; older beats vanish even if plot-critical. |
| GAP-7 | Info | no LLM-judge usage anywhere (grep n/a) | Research: judges usable with order-swap + rubric anchoring | Fully human evaluation only; no automated narrative-quality regression gate between releases (the incident's social-question case would've been caught earlier by a judge-style eval on golden dialogues). |
| GAP-8 | Info | attempts-trail stores error strings only (audit follow-up, already known) | — | Rejected-model-response shapes aren't captured; debugging needs grep+repro. Suggested in prior audit; still open. |

## 4. Suggestions (mapped to gaps, ordered by ROI)

S-1 (GAP-1): Implement the AI-Dungeon-style two-tier summary: every 6 turns compress
narrativeContextHistory turn-prose via the existing `summary.scene` task contract (already routing-
wired, quality-tier STANDARD, cadence PERIODIC) into a "chunk memory" pushed to memoryEngine
(memoryClass PLOT_CHUNK, persistent-ish, importance 70); refresh plot.summary from the *last N
chunks + 15-turn big* summary. Prompt-side: in WorkingContextEngine plot/continuity chunk,
prefer plot.beats list **plus** the latest 1-2 chunk summaries over the machine "kind committed for"
sentence. This is the single highest-value change for long sessions.

S-2 (GAP-2): Add an embedding index behind the memoryEngine retrieval — only when a provider
with `embedding` capability is registered; keep keyword+recency as minimum baseline and *fall back*,
so behavior is unchanged for free-tier deployments (this project leans on free/cheap chains).
Score = 0.45*cosine + 0.25*recency + 0.20*importance + 0.10*epistemic-fit. Deterministic cache key
(storyId, memoryId, modelKey) so tests stay reproducible.

S-3 (GAP-3): Recency-weight NPC slice retrieval (reuse memoryEngine's recencyBonus rather than plain
importance sort) + add lightweight NPC reflection: when an NPC accumulates ≥5 related durable
memories about the same viewer/event, synthesize one relationship-conclusion sentence into
dynamicCharacterAgency.getRelationship, tagged `reflection` + `confidence<1` so the adjudicator
treats it as an inference, not canon (explicitly separating Smallville-lesson: reflections ≠ witnessed facts).

S-4 (GAP-4): Reorder prompt so canonical scene + intent + action-resolution sit nearest the end
(generation point) — mirror of NovelAI Author's-Note placement; keep contracts in the middle;
drop the truncation-to-350-chars of working context in favor of band-priority chunk eviction
(never mid-sentence); when budget ≤1500, keep a preserved "session essence" line (location+goal+
top open thread) instead of the terse one-liner.

S-5 (GAP-5): Lower thread-detection to also accept event-candidates containing a noun an NPC
"pursue/seek/await/verify" attitude targets, and replace artificial vocabulary gate with:
`durable memory candidate + explicit thread-flag from stateChanges` OR `NPC planning slice
immediateGoal`; shrink the vocabulary list to modifier-only use.

S-6 (GAP-6): Retire flat `slice(-N)` windows in favor of the S-1 summary pipeline:
beats older than 40 rolls into plot summary; OPEN thread count cap stays (24) but threads are
ranked by priority *and* lastTouchedAt so genuinely 40-turn-old promises survive via plot summary.

S-7 (GAP-7): Golden-set LLM-as-judge regression: 15-25 canonical turn fixtures (real incident
phrasings included); rubric items anchored to our validators (Consistency/Reliability/Interest +
Canon-fidelity); judge via REVIEW-pool model already routed in aiQualityRouting; record judge
scores in release-gate script as non-blocking warnings until calibrated against a human pass.

S-8 (GAP-8): Implement the already-recommended attempts-trail capture: store
{provider, modelId, validationErrorReason, normalized vs rejected shape marker} per candidate
in the response trail, size-capped (5 per turn, 2KB each).

## 5. Phased plan

**Phase A — Summarization & long-session memory (GAP-1/6) — the big one**
A1. Wire `summary.scene` generation pipeline hooked into `NarrativeMemoryLifecycle.processTurn`
    every 6 accepted turns (per-turn budget already 1 call, aiTurnCallBudget.ts:20).
A2. Store chunk summaries as durable PLOT_CHUNK memories (importance 70, isPersistentCritical false,
    source='summary.scene').
A3. In WorkingContextEngine continuity chunk (workingContextEngine.ts:858-872), include latest
    2 chunk summaries + beats last-8; prompt plot-summary line from SummaryLifecycle.
A4. Tests: long-session harness (existing marathon driver) extended: assert plot.summary remains
    entity-anchored and ≥1 PLOT_CHUNK retrieved at turn 60, 100.
Risk: provider cost/latency per 6 turns — mitigate with the budget's CONDITIONAL gating and
deterministic fallback (concat last-6 beats into chunk when no model available).

**Phase B — Retrieval quality (GAP-2/4)**
B1. Embedding-capable provider detection; add `MemoryIndex` (in-memory Map + persisted JSON) with
    graceful no-op when 0 embedding models.
B2. Retrieval score fusion in memoryOpportunityEngine.retrieveMemories (keep old score as baseline label).
B3. Prompt reordering per S-4 with new tests asserting order under budget pressure.

**Phase C — NPC believability (GAP-3/5)**
C1. Recency-weighted NPC slice; C2. Reflection synthesis gated by ≥5 co-related memories,
    stored as reflection-tagged relationship notes; C3. Widen thread detection per S-5.

**Phase D — Observability & quality gate (GAP-7/8)**
D1. Attempts-trail shape capture (S-8) + doc.
D2. Golden-set judge eval script (`scripts/narrative-judge-eval.mjs`) printed in release-gate as
    non-blocking until Phase D3.
D3. After one human calibration pass on ≥20 turns, promote to blocking with thresholds.

**Phase E — Documentation & live verification**
E1. Ship docs (this file) + update 10-11 audit cross-references.
E2. Live turn-in-browser pass for dialogue visuals + provider gameplay (requires user/human test,
    consistent with prior audit LIVE-1).

Sequencing: A → D1 → B → C → D2/D3 → E. A and D1 are cheap; B is the only one touching retrieval
hot paths (needs phase12 suite green + new tests); C is self-contained; D2/D3 need the user.

---

## Phase A — COMPLETED (2026-10-12)

Implemented, re-audited, and regression-locked. Scope: GAP-1/GAP-6 (long-session summarization).

### What shipped
- **`server/domain/narrativeSummaryLifecycle.ts`** (new). Emits a durable, entity-anchored
  scene-summary chunk every `SCENE_SUMMARY_CADENCE_TURNS` (6) accepted turns.
  - AI path: `summary.scene` via `MultiModelOrchestrator.executeTaskGeneration(...,
    { allowDeterministicFallback: false, validateResponse })`. Output is parsed from raw prose,
    fenced blocks, or a JSON turn package; it is accepted only if it is 40–1400 chars, is not the
    canned emergency-floor placeholder, and retains ≥1 anchored entity/place name.
  - Deterministic fallback: de-duplicated concatenation of the recent accepted turns (never
    blocks or fails a turn). No AI provider ⇒ still a usable chunk.
  - Persistence: chunk appended to `runtime.plot.chunkSummaries` (last 20) **and** stored as a
    durable `EPISODIC` memory (`provenance: 'summary.scene'`, `importance: 70`,
    `isPersistentCritical: false`, `triggerConditionTags` include `PLOT_CHUNK`).
- **Prompt surfacing (A3)**: `plot.chunkSummaries` → `PlotContext.recentSceneSummaries`
  (`currentSituation.ts`) → `Recent scene summaries` line in the narration prompt
  (`narrativePromptBuilder.ts`, CURRENT SITUATION section) and `Recent scene summary` in the
  research PLOT block (`narrativeResearchPipeline.ts`). The continuity chunk
  (`workingContextEngine.ts`) also carries the latest 2 summaries + last 8 beats.
- **Hook (A1)**: post-commit in the authoritative route (`gameRoutes.ts` `/action` and
  `/action/accept-advice`), using the same never-throwing `onAcceptedTurn` wrapper.

### Audit findings fixed during this phase
1. **A-FIND-1 (High) — the hook was dead in production.** The first implementation hooked the
   summary inside `ServerMockAuthority.processCustomAction`, which `/api/game/action` always runs
   inside `canonicalCommandEngine.execute(..., transactionMode: 'ROLLBACK')`. During that
   transaction `isCanonicalCommandTransactionActive()` is `true`, so the hook's guard skipped it
   forever. The initial direct-call e2e test missed this because it bypassed the transaction.
   *Fix:* emit post-commit at the route level (mirrors `UniverseRuntimeService.captureAction`).
   *Lock-in:* `tests/phaseA.summary-e2e.test.ts` now drives the canonical-command wrapper and
   asserts the negative case too (in-transaction handling must NOT emit summaries).
2. **A-FIND-2 (Medium) — duplicated summary prose.** Each accepted turn is persisted twice into
   `narrativeContextHistory` (lifecycle writer + authority writer), so the raw window repeated
   prose and halved its span. *Fix:* `collectRecentTurns` de-duplicates by
   `playerAction::narration[:160]` before slicing the cadence window.

### Verification
- `tsc --noEmit` clean · `npm run build` OK · `npm run verify:contracts` PASS.
- New tests: `tests/phaseA.narrative-summarization.test.ts` (9) + `tests/phaseA.summary-e2e.test.ts`
  (2) — cadence gating, AI accept/reject, emergency-placeholder rejection, deterministic fallback,
  durable memory, situation + research-prompt surfacing, empty-story safety, post-commit wiring.
- Regression: 188 tests green across the narration/memory/continuity suites plus the prior
  incident/phase12/ch13/broadSubsystems suites (0 failures).
- **Live HTTP proof**: 6 real `POST /api/game/action` turns on `audit_longsession_story` produced
  `summaryLifecycle.chunkCount: 1` + `plot.chunkSummaries: [1]` with an entity-anchored
  deterministic chunk; the next turn's `research.promptContext` contained `Recent scene summary`;
  a second cadence produced 5 segments with **0 duplicates** after the de-dup fix. (State lives in
  gitignored `.dreambook/`.)

### Deliberate boundaries / follow-ups
- The summary runs post-commit and is awaited after the response is sent, so it does not add
  player-visible latency; it still runs within the route's persistence-batching scope so its save
  is flushed.
- Turning the summary into a *blocking* release gate, and Phase B (embedding retrieval), C (NPC
  reflections), D (golden-set judge), E (live browser pass) remain open as planned.

---

## Phase B — COMPLETED (2026-10-12)

Implemented, re-audited, and regression-locked. Scope: GAP-2 (retrieval) and GAP-4 (prompt salience).

### What shipped
**B1 — provider-gated embedding index** (`server/domain/memoryVectorIndex.ts`, new)
- `detectEmbeddingProvider(orchestrator)` scans BOTH the generative registry and the raw
  discovery catalog (embedding models are deliberately excluded from the generative registry),
  matching `embed` in the id/name or an embedding capability/action.
- `MemoryVectorIndex`: in-memory `Map` of `{vector, modelKey, contentHash}`, deterministic
  cache key (`storyId::memoryId::modelKey` + FNV-1a content hash), cosine similarity mapped to
  0..1, batch `indexMemories`, `search`, `prepareEmbeddingContext`, and `toJSON`/`importJSON`
  plus an optional file store. `createGeminiEmbeddingProvider` +
  `initializeMemoryVectorIndex` are the explicit bootstrap hooks.
- **Graceful no-op**: with no provider connected every entry point is inert —
  `prepareEmbeddingContext` returns `{}` and keyword retrieval is byte-identical.

**B2 — score fusion** (`memoryOpportunityEngine.ts`)
- New `retrieveMemoriesWithEvidence` splits the legacy keyword score (`baselineScore`,
  preserved as the evidence label) from the final `score`. When embedding similarities are
  supplied, candidates are re-ranked with
  `0.45*similarity + 0.25*recency + 0.20*importance + 0.10*epistemic-fit`; with none, the order
  and values are exactly the baseline.
- `MemoryRetrievalParams.embeddingSimilarities` threaded through `WorkingContextEngine.assembleTurnContext`;
  `aiOrchestrator.generateNarrativeOnly` calls `memoryVectorIndex.prepareEmbeddingContext(...)`
  before assembling context (returns `{}` with no embedding model).

**B3 — prompt salience** (`narrativePromptBuilder.ts`)
- Reordered `compose` so the authoritative `CURRENT SITUATION → PLAYER INTENT → ACTION
  RESOLUTION` sit at the generation point (immediately before the output contract); contracts
  and research stay in the middle; a new `SESSION ESSENCE` line (location + goal + top open
  thread) is always preserved. Applied to the default, compact, and micro branches.
- Working-context shedding is now band-priority and **boundary-aware**
  (`truncateWorkingContextAtBoundary`) — never mid-sentence.
- Added a best-effort hard-budget reduction (`enforceHardPromptBudget`) that shortens the
  largest expendable bodies largest-first, then drops only low-priority sections, never the
  scene/intent/resolution/research/session-essence/output contract.

### Audit findings fixed during this phase
1. **B-FIND-1 (High) — boundary truncation silently dropped context.** Applying
   boundary-aware truncation to *all* compact sections cut up to 40% early and lost required
   content (the Phase 3-5 integration suite's `"starlight fissures"`). *Fix:* scope
   boundary-aware truncation to the working/research context (what S-4 actually asks for) and
   restrict it to a 48-char window so content loss is ≤ ~48 chars.
2. **B-FIND-2 (Medium) — the compact/mid budget branches could exceed the hard budget**
   (1200 → 1513 tokens). *Fix:* the best-effort reduction, which never removes authoritative
   content; residual overshoot for unrealistically small budgets is documented below.
3. **B-FIND-3 — the budget reducer initially shed `SESSION ESSENCE`**, the one line S-4 says to
   preserve. *Fix:* removed it from the drop order.

### Verification
- `tsc --noEmit` clean · `npm run build` OK · `npm run verify:contracts` PASS.
- New tests: `tests/phaseB.memory-retrieval.test.ts` (6 — detection, cosine, no-op parity,
  index/serialization, baseline preservation, fusion ordering) and
  `tests/phaseB.prompt-salience.test.ts` (3 — authoritative tail, session essence under budget,
  boundary-safe shedding).
- Updated to the deliberate new order: `narrative-prompt-phase5` and
  `narrative-orchestration-phase3-5.integration` ordering assertions.
- Regression: **329 tests green** across the Phase A/B suites, all N-series narration suites,
  Phase 3-5 integration, broadSubsystems, phase12, ch13, incident repro, and the surgical
  ch1/2/5 suites (0 failures).
- **Live HTTP smoke**: server boots; `POST /api/game/action` still returns a committed turn with
  narration after the prompt reorder.

### Boundaries / follow-ups
- No embedding model is configured in this environment, so the embedding path is verified by
  injection and the live path exercises the documented no-op. Attaching a real Gemini embedding
  provider is a one-line bootstrap (`initializeMemoryVectorIndex({ orchestrator, client })`).
- The hard-budget reduction is best-effort: with an unrealistically small budget (≈1200 tokens)
  the authoritative scene + research + contracts can still exceed it, because dropping them would
  remove content the model genuinely needs. This pre-existing tension is documented rather than
  resolved by deleting required context.
- Phases C (NPC reflections), D (judge eval) and E (live browser pass) remain open.

---

## Budget follow-up — COMPLETED (2026-10-12) — the hard budget *was* the bottleneck

The Phase B boundary note ("authoritative content cannot fit an unrealistically small budget")
was correct but incomplete: the real cause was that the **live narration path hard-coded a
700-token prompt budget** (`serverMockAuthority.ts`) while every routable narration model has a
context window of 16k–1M+ tokens (`aiOrchestrator.ts` registry). The model was never the limit.

What shipped:
- `resolveNarrativePromptBudget({ requested, contextWindow, cap, envCap })` in `aiOrchestrator.ts`.
  `budget = max(requested, min(0.25 * contextWindow, cap))`; cap defaults to 3000 and is overridable
  with `DREAMVILLE_NARRATIVE_PROMPT_BUDGET`. Unknown context window ⇒ caller's request, unchanged.
- `MultiModelOrchestrator.resolveTaskContextWindow(task, forceModelId)` resolves the serving model's
  context window offline (forced model → configured fallback route → largest registered model). It
  deliberately performs no provider network refresh, so it is safe on the prompt hot path.
- `generateNarrativeOnly` now derives its budget this way. Only the narration path changed;
  `executeTurn`/`generateTurnPackage` still honour an explicit caller budget.

Effect on the live path: 700 → 3000 tokens (the cap), so the documented tension is resolved for the
scene + research + contracts, at ~4x the input cost rather than an unbounded increase. Tests that
pin a small budget (e.g. 300–500 tokens) still exercise the shed-under-pressure paths unchanged.

## Embedding configuration — COMPLETED (2026-10-12)

Phase B's "one-line bootstrap" was never actually wired, so the embedding path was a permanent
no-op in production. It is now a real, opt-in configuration:

```
GEMINI_API_KEY=<key>                  # already read by the existing provider adapters
DREAMVILLE_MEMORY_EMBEDDINGS=1        # opt in (default: off)
DREAMVILLE_EMBEDDING_MODEL=<model id> # optional; overrides the discovered model
```

- `MultiModelOrchestrator.initializeMemoryEmbeddings()` runs in the constructor and again *after*
  `discoverAndRegisterModels()` (embedding models only appear in the discovery catalog, not the
  generative registry). It attaches a `GoogleGenAI`-backed provider, a file cache at
  `.dreambook/memory-vectors.json` (gitignored) and loads any existing cache.
- `getMemoryEmbeddingStatus()` reports `{available, providerId, modelId, reason}` for diagnostics.
- Default off is deliberate: a per-turn query embed plus memory indexing costs quota and latency on
  the free/cheap chains this project favours. With no flag (or no key) retrieval is byte-identical
  to the keyword baseline.
- Symmetric embeddings (no `taskType`) — `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY` asymmetry is a
  non-blocking follow-up.

## Phase C — COMPLETED (2026-10-12)

Scope: GAP-3 (NPC believability) and GAP-5/GAP-6 (thread detection & retention).

### What shipped
- **C1 — recency-weighted NPC slice** (`npcPlanningSlice.ts`). The slice previously sorted NPC
  memories purely by `importance`, so a 40-turn-old high-importance memory crowded out last turn's
  dialogue. It now fuses `0.45*recency + 0.35*importance + 0.20*confidence` (40-turn recency horizon,
  mirroring the memory engine) with a protected floor for `isPersistentCritical` memories, and
  exposes `salienceScore`/`lastRecalledTurn` so consumers can see why a memory ranked.
- **C2 — NPC reflection synthesis** (`npcReflectionEngine.ts`, new). Once an NPC has ≥5 durable
  memories concerning the same viewer, it consolidates them into **one** tagged inference
  (`tags: ['reflection','NPC_REFLECTION','inference','confidence<1']`, `confidence` 0.5–0.85,
  evidence memory ids recorded, de-duplicated by evidence set). Stored on the relationship via
  `DynamicCharacterAgencyEngine.addRelationshipReflection`, persisted through the existing agency
  mutation listener, and surfaced into the prompt as `[reflection inference conf=…]`. Synthesis is
  deterministic and offline — no provider call, no added latency.
- **C3 — widened thread detection** (`narrativeMemoryLifecycle.ts`). The vocabulary gate is now a
  *modifier* signal: a candidate also qualifies when it carries an NPC attitude verb
  (pursue/seek/await/verify/protect/vow/… ) **and** a canonical anchor, or when the turn committed an
  explicit `THREAD|PROMISE|QUEST|GOAL|OBLIGATION|CONTRACT` kind *and* the candidate is durable.
  Threads are now filtered to OPEN **before** ranking and capping (previously a descending sort was
  followed by `slice(-40)`, which re-selected the lowest-priority tail and let RESOLVED threads
  crowd OPEN ones out of the cap).

### Audit findings fixed during this phase
1. **C-FIND-1 (Medium, Phase B regression)** — `MemoryVectorIndex.saveToFile()` had **no callers**,
   so the "persisted JSON index" advertised in Phase B never persisted; every process start
   re-embedded the whole memory set. `indexMemories` now saves when the vector set changed.
2. **C-FIND-2 (Medium)** — the explicit-commit thread flag was applied to *every* memory candidate of
   that turn, so one `PROMISE` commit could turn incidental observations into threads. It is now
   gated on `isDurableCandidate`.
3. **C-FIND-3 (Perf)** — reflection synthesis filtered the entire memory store once per candidate NPC
   (O(memories × npcs) on every accepted turn). It now groups in a single pass.

### Verification
- `tsc --noEmit` clean · `npm run build` OK · `verify:contracts` PASS.
- 19 new tests (`tests/phaseC.npc-believability.test.ts`, `tests/phaseC.budget-and-embeddings.test.ts`)
  covering recency ordering and the persistent floor, the reflection evidence gate/dedupe/persistence/
  round-trip/prompt surfacing, the attitude-verb and explicit-commit thread paths plus the negative
  case and OPEN-thread ranking, the budget derivation (including env override), the embedding opt-in
  states, and the index file-store round-trip.

### Boundaries / follow-ups
- Reflections are **deterministic, not LLM-authored**. An AI consolidation (via an existing task
  contract) is a non-blocking enhancement; the deterministic path keeps cost and latency at zero and
  is what the tests lock in.
- Reflection count is capped at 8 per relationship and 3 surfaced per NPC prompt slice.
- Embedding retrieval remains off by default, so the semantic path is verified by injection while the
  live path exercises the documented no-op.
- Phase D (judge eval) and Phase E (live browser pass) remain open.

## Phase D — Observability & quality gate (GAP-7/8) — COMPLETED (2026-10-12)

### D1 — attempts-trail response-shape capture (S-8)

`server/domain/providerAttemptTrail.ts` (new) adds a compact, size-capped shape descriptor to
*rejected* provider attempts. The trail previously carried only `status`/`latencyMs`/`error`, so a
rejected response could not be triaged without a grep + repro.

- `ProviderAttemptTrailEntry` is now the single shared trail type (the nine duplicated inline types in
  `aiOrchestrator.ts` were consolidated onto it).
- `RejectedResponseShape` records `{ kind, marker, normalized, validationErrorReason, rawLength,
  sample, sampleTruncated }`.
  - `kind`: `EMPTY | JSON_PARSED | MALFORMED_JSON | TRUNCATED_JSON | PLAIN_TEXT | OTHER`.
  - `marker`: **`NORMALIZED`** when the response matched the expected structured envelope but failed a
    later (schema/semantic) check; **`REJECTED`** when it did not. This is the "normalized vs rejected
    shape marker" the prior audit asked for — it separates "the provider can't follow the format" from
    "the provider followed the format but produced a bad turn".
- `captureRejectedAttempt(trail, entry, rawText)` attaches the descriptor subject to the caps
  **5 descriptors per turn** and **2048 characters of raw sample each**
  (`MAX_REJECTED_SHAPE_ENTRIES_PER_TURN`, `MAX_REJECTED_SHAPE_SAMPLE_CHARS`). Excess attempts still
  record their `error`; they simply carry no sample.
- Wired into the three rejection sites: `executeTurn` (the main narrated path), `executeTaskGeneration`
  (the generic per-task path) and the `speech.transcribe` fallback chain.

### D2 — golden-set judge eval (S-7)

`server/domain/narrativeJudgeEval.ts` (new) + `scripts/narrative-judge-eval.mjs` (new CLI) score a
golden set against a four-item rubric that is **anchored to the project's own validators**:

| Rubric item     | Anchor                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Reliability     | structured turn-package contract (`validateTurnPackage`)               |
| Consistency     | player-agency / epistemic boundaries (`NarrativeGoldenRegressionEngine`)|
| CanonFidelity   | golden scenario anchors + forbidden canon patterns                     |
| Interest        | prose richness signals (`NarrativeRichnessEvaluator`)                  |

- `NARRATIVE_JUDGE_FIXTURES` holds **20** canonical turns (within S-7's 15-25 band), including the
  incident's direct-social-question phrasing (`F20_INCIDENT_SOCIAL`), information-seeking uncertainty
  (`F07_INFORMATION_BAD` over-claims certainty), player-agency violations, malformed/plain/empty
  responses and canon/state-mutation boundary cases. Each fixture carries a human `expect: PASS|FAIL`
  label.
- The deterministic scorer is offline and dependency-free. Anchoring is *verified*:
  `tests/phaseD.judge-eval.test.ts` asserts `structuralTurnPackageCheck(raw)` agrees with the real
  `MultiModelOrchestrator.validateTurnPackage(raw)` for **every** fixture, so the rubric cannot drift
  from the validator.
- The report records per-dimension scores, `agreementRate` against the human labels, and the mismatch
  list. A REVIEW-pool model judge can be layered on via `buildJudgePrompt` / `parseJudgeResponse` /
  `liveJudgeEnabled` (opt-in, `DREAMVILLE_JUDGE_LIVE=1`); it is unused by default.

### D2 → gate wiring and D3

- `npm run verify:judge` runs the eval. `scripts/verify-release-contract.mjs` spawns it and prints the
  report as a **non-blocking warning** (a runner failure is printed and swallowed).
- `JUDGE_BLOCKING_THRESHOLDS = { overall 3.5, Reliability 4, Consistency 3.5, CanonFidelity 3.5,
  Interest 2.5, agreementRate 1 }`. Setting `DREAMVILLE_JUDGE_BLOCKING=1` promotes the gate to
  blocking today; **D3** — whether to do so permanently — requires one human calibration pass over
  >=20 real turns, which is not possible in this environment.

### Verification

- `tsc --noEmit` clean · `npm run build` OK · `verify:contracts` PASS (with the judge report printed).
- 12 new tests: `tests/phaseD.attempts-trail-shape.test.ts` (5) and `tests/phaseD.judge-eval.test.ts` (7).

### Boundaries / follow-ups

- The live REVIEW-pool judge is unexercised (no provider key here); only the deterministic offline
  scorer is verified end-to-end. The deterministic judge is a heuristic rubric, not a model judgement.
- D3 (promote to blocking) and Phase E (live browser pass) remain open.

## Phase A–D system audit — cross-phase seam findings (2026-10-12)

Each phase's own suite passed, but auditing the phases *together* — the composed
pipeline summary → retrieval → prompt → NPC → trail → judge — surfaced five seam defects
that per-phase tests could not see (two were masked by test fixtures that used shapes the
production writers never produce). All five are fixed with regression locks in
`tests/phaseABCD.system-audit.test.ts` (plus one case added to the Phase C suite).

### Findings & fixes

1. **A-FIND-2 (Medium) — lost update in the async summary writer.**
   `maybeGenerateSummary` snapped `run.runtimeState` at the top, then awaited a provider
   call for up to 8s, then assigned the *stale* snapshot back. A turn that committed during
   the await had its canonical state (plot beats, top-level keys) silently clobbered.
   Fixed with `persistSummaryState`, which re-reads the current runtime state and merges
   only the keys the summary owns (`summaryLifecycle`; `plot.chunkSummaries`, appended to
   the *current* list).

2. **B-FIND-1 (Medium) — keyword-baseline retrieval parity was broken.**
   B2 added `a.memory.id.localeCompare(b.memory.id)` as a tie-break to the sort, which
   changed the order of *equal-scoring* memories even when embeddings are off — directly
   contradicting the documented "with no embedding similarities the returned order is
   identical to the baseline". The B2 parity test only compared two views of the same new
   comparator, so it could not catch this. Fixed: the id tie-break now applies only when
   embeddings are active; the baseline keeps stable insertion order.

3. **C-FIND-4 (High) — reflection synthesis was inert in production.**
   `synthesizeNpcReflections` grouped memories by `subjectEntityId`, but every production
   memory writer stores `subjectEntityId = playerActorId` and records NPC involvement in
   `relatedEntityIds` (see `NarrativeMemoryLifecycle.relatedEntities`). With no
   NPC-subjected memories ever written, the GAP-3 reflection engine could never fire live;
   the Phase C test only passed because it seeded `subjectEntityId = npcId` directly.
   Fixed: an NPC is now a subject when it is the memory subject **or** a referenced
   participant. A guard was added so unrelated PUBLIC world-event memories (event subject,
   NPC witness) cannot seed beliefs about the viewer.

4. **C-FIND-5 (Medium) — the S-5 "explicit commit" thread path was dead.**
   `THREAD_COMMIT_KIND_PATTERN` matched THREAD/PROMISE/QUEST/GOAL/OBLIGATION/CONTRACT, but
   `NarrativeStateAdjudicator.commitRecords[].kind` is always one of the eight canonical
   `StateChangeProposal` kinds (INVENTORY/CAPABILITY/LOCATION/COMBAT/CHRONICLE/PHYSIOLOGY/
   HEALTH/ALIGNMENT) — none of which the pattern matched, so the branch never fired. Fixed:
   `CHRONICLE` (the one committed kind denoting a recorded narrative commitment) now
   qualifies; the narrative-only kinds are retained for forward compatibility. The
   `durable` gate still bounds over-triggering.

5. **C-FIND-3 (Low) — misleading/dead API + typo.**
   `MemoryVectorIndex.configureFromOrchestrator` was named as if it attached a provider but
   could not (it only returned a descriptor) and had no callers; removed. The
   `mmemoryRelatedToViewer` typo was corrected.

### Verification
- `tsc --noEmit` clean · build OK · release gate (with judge report) PASS.
- New `tests/phaseABCD.system-audit.test.ts` (5 tests) + one Phase C case; all Phase A–D
  suites and the subsystem suites that consume these modules remain green.

### Not fixed (documented, pre-existing / out of scope)
- Resolved narrative threads are not retained across turns (`openNarrativeThreads` stores
  OPEN only), so a resolved thread could in principle re-open. Pre-existing, unchanged by
  Phase C; changing the persistence shape is a larger follow-up.
- The `attemptsTrail` records a `SUCCESS` entry before validation and a `FAILED` entry
  after, for the same attempt. Pre-existing; Phase D only attaches the shape to the FAILED
  entry.

## Phase A–D system audit — round 2 (2026-10-12)

With the round-1 fixes in place the full suite (>=1,500 tests) was green, so round 2
audited *behaviour* the tests did not assert. Two further defects were found by probing
the assembled prompt directly.

### Findings & fixes

6. **B-FIND-2 (High) — the hard-budget fallback deleted the authoritative sections.**
   In the ultra-compact branch (`maxPromptTokens < 600`), when the prompt still exceeded
   budget the builder did `prompt = prompt.slice(0, budgetChars)` — a blind *character*
   slice from the end. S-4 had just moved `CURRENT SITUATION` / `PLAYER INTENT` /
   `ACTION RESOLUTION — AUTHORITATIVE` / `OUTPUT CONTRACT` to the end of the prompt, so
   the budget fallback deleted exactly the content the budget is meant to protect.
   Verified: at budget 300 the prompt contained none of those four sections. Replaced the
   blind slice with `enforceHardPromptBudget` (header-aware, protected-section preserving),
   and removed `CURRENT STORY BEAT` from the shed order so the meaningful-turn contract is
   never dropped. Trade-off: at extremely small budgets the prompt is now best-effort
   (~356 tokens at a 300-token request) rather than strictly capped, matching the already
   documented "protected sections are never removed" guarantee.

7. **ESC-FIND (Medium) — double-escaped newlines joined prompt sections with literal `\n`.**
   A repo-wide escaping corruption stored `'\\n'` (escaped backslash + n = a literal
   backslash-n) where a newline was intended, in several string joins:
   `narrativePromptBuilder.ts` (micro-branch `sections.join` + header labels),
   `workingContextEngine.ts`, `aiOrchestrator.ts`, `serverMockAuthority.ts` and
   `gameRoutes.ts`; plus one genuine regex-literal bug in `aiOrchestrator.ts`
   (`[^:\\n]` / `\\s*` instead of `[^:\n]` / `\s*`). The affected sections were therefore
   joined by the text "\n" instead of line breaks. Fixed all of them (the legitimate
   string→`new RegExp` cases, e.g. `'\\b…'`, were left intact). Locks: a behavioural prompt
   test, a dialogue-parse test, and a source-scan test over the phase-touched files.

### Verification
- `tsc --noEmit` clean · build OK · release gate PASS.
- Full suite re-run in four bounded batches: **1,531 tests, 0 failures** (the only suites
  excluded are `marathon-125-turn.integration` and `chaos-failure-injection`, which stall
  at the pre-existing checkpoint independent of this work).
- `tests/phaseABCD.system-audit.test.ts` now holds 9 tests (round-1 findings 4, round-2
  findings 4, plus a regression lock in the Phase C suite).
