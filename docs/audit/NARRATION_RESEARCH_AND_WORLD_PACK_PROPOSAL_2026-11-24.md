# Narration research and the "authored world pack" proposal

- **Date:** 2026-11-24
- **Question:** How do other AI story systems handle narration, and would complete, authored community-style worlds (plus a guide for generating new content under world rules) fix Dreamville's narration problem better than tuning the narrator?
- **Evidence grade:** Secondary. Friends & Fables, Talemate and Waidrin were read through their public docs and READMEs by fetch agents. Nothing was run. Marketing claims are marked (M); documented mechanics (D).

## 1. What other systems actually do

| System | World content | How lore reaches the model | How consistency is protected | Model needs |
| --- | --- | --- | --- | --- |
| Friends & Fables (closed, hosted) | World Builder: lore, characters, POIs, maps (D); "hand-made quests" (M). Free tier: 20 worlds | A "research step" builds Context Blocks. Narration sees world/theme info, the last 5-8 messages, a campaign summary, and character/location data chosen by relationships, location and @mentions (D). No vector retrieval is described | Rules enforcement mechanism **not documented**. Says conflicting lore "confuses the LLM", so keep descriptions concise (D) | "10+ requests" per turn across several models; 128k+ contexts (D) |
| Talemate (AGPL-3.0) | World editor, character cards, pins, templates, scene files | Long-term memory via embeddings (ChromaDB), layered summaries, tracked state reinforcement kept in context | Character knowledge scoping (a character only knows what they witnessed). Editor agent is optional and "experimental" (repetition, markup). **No post-hoc consistency checker** | Docs say: a current reasoning model, reliable JSON, 16k+ context. Basic narration works on small models; director, knowledge and perspectives features fail |
| Waidrin (AGPL-3.0-or-later) | None authored. The model generates world, protagonist, start location and 5 characters | Context trimmed to ~16k; older content summarised | Typed state, JSON-schema generation. **Only prompt instructions** guard against invention. No item model | Local Mistral Small class recommended |
| ChatRPG (paper, N=8 and N=12) | Short player-written storyline | Narrator + background Archivist agents keep state in a database | State changes go through typed tools (heal, wound, battle). Agentic version beat single-prompt on coherence, mastery, immersion (small samples, p about 0.04) | Hosted GPT-class |
| PAYADOR (paper) | Items, locations, characters with short descriptions and a few attributes | Only components reachable from the current location go in the prompt | **State-diff check:** a predicted change the state cannot support (a bazooka the player does not hold) is rejected | Gemini |
| SillyTavern / NovelAI lorebooks | Free-form entries | Keyword-triggered insertion; default scan of the last 2 messages; lorebook gets about 25% of context | None; brittle (keyword collisions) | Any |

## 2. What this says about Dreamville

1. **Dreamville's guards are stricter than anything surveyed.** Typed canonical state, CAS adjudication, epistemic masking and a semantic review exist. Of the surveyed systems only PAYADOR has a comparable state-diff check. That is why a weak model fails the gate often: the gate asks more of the prose than any competitor does.
2. **5-7 calls per turn is normal for this class.** Friends & Fables documents 10+ requests per turn. The difference is that they run paid models on large budgets.
3. **Weak models are an acknowledged limit elsewhere.** Talemate says its full feature set needs a current reasoning model with 16k+ context and that smaller models fail structured tasks.
4. **The AGPL point.** Talemate and Waidrin are AGPL. Copying their code into Dreamville carries a network-use source-disclosure obligation. Borrowing ideas is fine; copying code needs a licensing decision.
5. **Nobody surveyed automatically reviews prose against canon.** The pattern across the field is context discipline (give the model less, more relevant text) rather than post-hoc rejection.

## 3. The authored-world idea against the repo

What already exists:
- `WorldTemplate` (`src/types.ts:1936`) already has `worldFacts`, `characters`, `factions`, `geography`, `timeline`, `magicRules`, `economy`, `forbiddenContradictions`, `startingStarts`, `terminology`, `knowledgeBoundaries`, `customRules`, `events`, `hazards`.
- `worldSynthesisService` generates a world from a premise with an LLM, falling back to a deterministic candidate.
- `spellRuntime.evaluateCustomSpellProposal` already implements "player proposes a spell that is not in the library; the rules profile approves, downgrades or rejects it" (`server/domain/spellRuntime.ts:847`).

What is missing:
- **No authored world pack ships.** `data/` holds no world content. Every world is synthesised at creation time by whatever model is available, with a deterministic fallback.
- The Ren test world was three hand-set locations, no NPCs, and one premise sentence. Turn 4 of the live run ("what have the police said?") was rejected because the information-seeking turn "has no grounded answer or bounded lack of answer". The canonical world had nothing to answer with. That is consistent with the user's suspicion that a thin world is part of the narration problem. It is **not proven** by one run on one small model.
- The same proposal-then-adjudicate pattern exists only for spells. Items, skills, NPCs and locations have no equivalent generation guide.

## 4. Proposal (smallest test of the idea)

1. **One hand-authored flagship pack**: the Crimson Eye noir world. About 10 locations, about 12 NPCs each with what they know and refuse to say, the case facts with who-knows-what, a scripted opening scene, a starter kit that suits the premise, and items. Format: the existing `WorldTemplate` fields, plus a completeness checklist test so a pack cannot ship with an empty `knowledgeBoundaries` or NPCs without knowledge.
2. **Re-run the same six live turns** (or equivalent) against the pack. If acceptance rises sharply on the same small model, thin worlds were a main cause. If not, the model or the review is the limit.
3. **Only then** generalise: a world-authoring guide for the LLM (schema, completeness checklist, per-type validators) and the proposal-adjudicate loop for items, skills and NPCs, with a documented override flag for characters whose canon powers may bend a rule.

Constraints from the research: keep each entry short (F&F's own guidance), select context by location and entities rather than injecting the whole bible, and avoid copying AGPL code.

## 5. Open items

- Not read: F&F Context Blocks, Spells and Encounters pages; Talemate editor Revisions and layered history pages; the PAYADOR repository licence.
- The ChatRPG figures came from a truncated page plus a model summary; check the PDF before quoting them.
- The F&F import question (can players bring outside content?) was not answered by the pages read.

## 6. Result of the Ren pack test (2026-11-24, same day)

Built: `data/worlds/ren_crimson_eye.pack.json` (9 locations, 7 NPCs with knowledge and refusals, 17 facts, 4 clues, noir kit), `server/domain/worldPack.ts` (loader, completeness checks, apply), `tests/world-pack-ren.test.ts`. Offline checks pass.

Found while inspecting the prompt (general defects, fixed):
- Every non-demo story inherited the Orrery demo: the "Starlight fissure rumors" fact and thread and the Vael avatar memories appeared in Ren's prompt. They are now seeded for `default_story` only.
- A weak model returning a scalar `audioCues`, `visualCues` or `memoryCandidates` had a valid narrative discarded ("audioCues must be an array"). Optional presentation metadata is now coerced; `stateChanges` stays strict.

Live result (nemotron-nano-omni, free, 3 passes, 14 chat calls in total): one turn accepted (a bland office scan); the information-seeking turns ("Who found the body?", "What have the police said?") were rejected by the action-substance gate in every pass. The prompt did contain "Silas Okafor found_body_at -> just after midnight", and the model's prose ignored it ("no sign of a corpse"). So for this model, a grounded world was not enough: the hypothesis that a thin world was the main cause is **not supported** for a model this small. It is not refuted for stronger models.

Not done: lore is rendered to the model as raw triples ("subject predicate -> object") rather than the authored sentence; trying the sentence form is cheap but could not be tested live (free quota exhausted). The pack's opening scene text is not wired into the opening-scene service.

## 7. Result on a stronger model (Gemini 3.1 Flash Lite, same day, 10 chat calls)

gemini-3.5-flash and 3.8-flash returned HTTP 503 (high demand) during the probe, so 3.1-flash-lite was used. Eight scripted turns on the Ren pack: **2 accepted, 3 unavailable after a schema/guard rejection or provider 503, 1 rejected by final review, 3 had no attempt because the only model went into cooldown.**

Findings:
1. **Canon contradiction passed review.** Turn 3 ("Where exactly was he found?") was accepted with Mei saying he was found "in the maintenance access tunnel beneath the Neon Ward transit hub". The pack and the prompt say Pier 4 (`fact_victim`, shown in the prompt as authorized lore). Authoritative facts reach the model as context but are not enforced as constraints on the prose. This is the most important gap found so far.
2. **Single-model chains lose the turn on one bad candidate.** Turn 2 failed schema validation ("Micro beat is too long") and turn 4 failed the information-continuity guard; each had one attempt on the only model, so the turn became NARRATION_AI_UNAVAILABLE.
3. **A single 503 followed by failures cooled the only model**, so turns 6 to 8 made no calls.
4. The world-pack hypothesis is still open: facts were present and the model contradicted them, which the review should have caught.

Harness note: disabling other models by provider id also disabled an alias record (`provider_google_gemini::<same model>`) that shares the breaker key, tripping the pinned model; the script now exempts by model id.

## 8. Fixes made after the Gemini run, and what the live re-runs showed (same day)

Changes (all general, none Ren-specific; suite 2,007/2,007, `tsc` clean, `verify:contracts` PASS):
1. **Canon enforcement** (`findIgnoredKnownFacts`, `semanticNarrativeReview.ts`): an information-seeking turn whose narration does not use the player's authorized fact that answers it (and does not bound its uncertainty) is a HIGH `UNSUPPORTED_CLAIM`. Tests: `tests/canon-fact-enforcement.test.ts`.
2. **Corrective retry** (`executeTaskGeneration`): when the last real candidate fails task validation it gets one retry whose prompt names the rejection; turn-budgeted callers also get one retry after a transient transport failure (timeout, 5xx, dropped connection). A configured next model is still tried first. Tests: `tests/validation-retry.test.ts`.
3. **Breaker scope**: two consecutive 503/429/timeouts no longer open the permanent circuit breaker (the time-bounded cooldown handles them); only auth failures and "model gone" do.
4. **Lore wording**: authorized facts are rendered to the model as their authored sentence ("KNOWN: ...") instead of a raw triple. Not shown to help yet.

Live (gemini-3.1-flash-lite, 8 scripted turns each): before the fixes 2/8 accepted with one accepted answer contradicting canon; after, 2/8, 2/8 and 0/8 across three passes. Unavailable turns fell from 3 to 0-2. The canon rule rejected a real contradiction. Most remaining rejections are the pre-existing "environment outweighs action" and "no grounded answer" gates: the lite model writes scenery instead of answering. Sample sizes are tiny and the runs vary, so yield is **not shown to have improved**.

## 9. Why narration still failed: root causes found by instrumenting the real prompt (2026-11-24)

**Control.** The same facts and the same four questions, sent to Gemini 3.5 Flash Lite with a ~250-token minimal prompt, were all answered correctly and in character (known facts used, uncertainty bounded). So the model is not the limit; our pipeline was starving it.

**What the model actually received.** Captured request bodies showed "Okafor", "Pier 4" and "midnight" appearing **zero** times in the prompt for the questions that needed them. Four independent defects, in order of discovery:
1. `serverMockAuthority` capped the live narration prompt at 700 tokens, so the situation (and its lore) was clipped to ~520 characters. Now `LIVE_NARRATION_PROMPT_TOKEN_BUDGET = 4500`.
2. `epistemicBoundary.forbiddenAnchors` and `semanticNarrativeReview.buildForbiddenKnowledgeSet` treated a hidden fact's bare object (for example "Arthur Pendelton" in "Victor Lang killed Arthur Pendelton") as a secret, which redacted or rejected every public fact and every narration that mentioned the victim. Anchors the player already knows are now exempt.
3. The research pipeline ranked question-matching facts below merely entity-related ones, and the prompt builder shed research from the tail, so the answering fact was the first thing cut. Relevance now outranks entity association, shedding keeps the most question-relevant segments, and authorized-fact segments are boosted.
4. New stories inherited the Orrery demo's knowledge facts (`fact_orrery_halt`, `fact_prism_fracture`), which competed for the lore budget. They are now seeded for `default_story` only.

**Result.** With a stubbed provider, each question's prompt now carries the fact that answers it (turn "who found" has all of them, "where found" has Pier 4 and Okafor, "bullet casing" has .38). Suite: 2,008 tests; the two failures seen in one full run were timing tests that passed when re-run alone (load from concurrent processes).

**Live yield is still unproven.** On the final real run (Gemini 3.5 Flash Lite, 8 turns) 1 turn was accepted, and 8 of 24 provider calls returned HTTP 503 (provider demand). The leak check that rejected turn 3 was the same bare-name defect (fixed afterwards, not re-run live). A clean live re-measure needs a stable provider window.

## 10. Re-run after the prompt fixes (2026-11-24, same day)

Run 7 (before the answer-gate change): the model now **used the facts** ("Night watchman Silas Okafor found the body shortly after midnight." in 5 consecutive attempts) but every one was rejected by the action-substance gate ("no grounded answer"), because `scoreActionSubstance` counted an information response only if the text contained a speech verb (said, told, explained, ...) or the word "nothing/unknown". Fixed: a narration that states the known fact answering the question (`knownFactUse.analyzeKnownFactUse`, shared with the canon check) counts as an information response.

Also added: a turn-budgeted call waits out a short (<=20 s) cooldown on a one-model route; the `typeof this.selectBestModel` type query was replaced to keep `tsc` clean.

Run 8 (after those fixes): 1 of 8 accepted, but **the provider dominated the outcome**: 9 of 15 chat calls were HTTP 503, two turns timed out at 30 s, and the last two turns found the only model still cooling down. Where the model did answer an information turn, the answer was either correct (Okafor) or a non-answer from the lite model ("pausing to answer the query"). Live yield therefore cannot be judged until the provider is stable or a second provider is in the route.

Suite 2,010/2,011-2,013 (two load-sensitive micro-benchmarks fail only when other processes run; both pass alone); `verify:contracts` PASS; `tsc` clean.

## 11. Cross-provider route (Gemini 3.5 Flash Lite, then Groq qwen3.8-27b), same day

Accepted 3 of 8 turns (previously 0 to 1 on a single overloaded Gemini model). Failover across providers works in both directions: Gemini timeout or 503 -> Groq answered; Groq rate limit -> Gemini answered. One turn was still lost when both returned errors in a row.

**Acceptance is not the same as quality.** The accepted turns were: a desk scan (fine); "the scattered case notes do not detail the precise recovery point" for *Where exactly was he found?* although the player knows Pier 4; a scenery-only reply to *What did the police say?*; and an evasive "the focus is not on who called it in, but on what was found" for *Who found the body?*. The review accepted all of them: the bounded-uncertainty exemption in the canon check lets a false claim of ignorance through, and the lexical information gate accepted a reply containing no answer. Rejected-before-fix correct answers (section 10) and accepted-now evasions are two faces of the same problem: the gates judge vocabulary, not whether the known fact was used.

Next change to consider: for information-seeking turns where a player-known fact answers the question, require the fact to appear unless the answering NPC is flagged guarded/secret for it; do not treat "the notes don't say" as bounded when the player's own knowledge says otherwise.

## 12. Strict known-fact requirement (built and trialled, same day)

Changes: `knownFactUse` now separates a visible **refusal** (allowed) from a claim of **ignorance** (rejected when the player already holds a fact that answers the question). The semantic review and the information-substance gate both require the known fact (or a refusal) for such questions, ignoring speech verbs. Both action-fidelity checks (`serverMockAuthority.evaluateLiveNarrativeQuality`, `aiOrchestrator.evaluateActionConsequenceFidelity`) accept a fact-bearing answer without a separate "reaction beat". NPC knowledge authored in the pack is reconciled with the premise's restricted investigation facts (`grantRestrictedFactsMentionedIn`), which fixes Mei being flagged for knowing the casing she was authored to know. Tests: `known-fact-strictness`, `live-narration-quality-gate`, `world-pack-ren`.

Live (Gemini 3.5 Flash Lite then Groq qwen3.8-27b, 8 turns): **4 of 8 accepted**, up from 0-3, and the accepted information answers used the facts: "Night watchman Silas Okafor found the body shortly after midnight at the pier", and a good in-character answer from Mei on the repeat question. Remaining rejections: scenery-heavy replies to "what did the police say" and "head out to the docks" (environment outweighs action), one provider failure, and "examine the bloodstain" while the player stands in the office, which has no bloodstain (a harness artefact, the stain is at the docks).

Known imperfections: "where exactly" was answered "at the pier" rather than "Pier 4" (accepted because the answer anchor matches "pier"); the opening desk scan invents mundane paperwork.

## 13. Reference study: Talemate's query path, and the change it suggested (branch `experiment/reference-narration-study`)

Method: read-only. The repos could not be cloned reliably (network stalls), so the narrator and editor sources were read through raw GitHub files; nothing was executed and no third-party code was copied into this repository (Talemate is AGPL-3.0).

What Talemate does for a player question (`narrator/narrate-query.jinja2`, `narrate-context.jinja2`): one prompt with premise and scene intent, a memory block headed "POTENTIALLY RELEVANT INFORMATION" fetched with the question as its sub-instruction, a world-state snapshot, and the recent scene history; instruction wording is to "answer ... confidently and decisively" and "without advancing the plot". There is no instruction to say "unknown", **no fact check after generation** (output cleanup is formatting only), and the editor's revision pass is off by default and checks repetition and unwanted prose, not facts. Its memory retrieval is conditioned on the question, as ours now is.

Comparison with this project: we verify far more (canon, epistemic boundary, action fidelity, pacing, richness), which is why weak models fail us more often, and why a model that is shown nothing is rejected rather than silently wrong. The difference worth copying was prompt shape, not verification: our prompt offered "clearly state that the available people provide no reliable answer" as an easy exit and left the answering facts buried inside research.

Change made on this branch: for information-seeking turns the prompt builder now adds an "ESTABLISHED FACTS THAT ANSWER THIS QUESTION" block immediately before the output contract, restating the matching authorized facts and telling the model not to claim ignorance when one answers the question (`answerBearingFacts`, `narrativePromptBuilder.ts`).

Result (stubbed prompts confirmed the block; live run on Gemini 3.5 Flash Lite then Groq qwen3.8-27b): 4 of 8 accepted, with qualitatively better answers. "Where exactly was he found?" now returns "...was found shot dead on Pier 4" (first time), "Who found the body?" names Silas Okafor, and the repeat question returns a complete, correct answer. Four turns were lost to provider unavailability, not to the gates. Suite: 2,018 of 2,018.

## 14. Follow-ups from the study (merged to the programme branch)

- The answer-bearing facts block was merged (fast-forward) into `feat/unified-audit-reconciliation-programme`.
- The existing one-call rewrite path (`narrative.review`) now receives the same block and is told to state the answer first, so a scenery-only reply is rewritten toward the answer instead of being discarded. (The rewrite already existed; its prompt did not carry the facts.) `buildAnswerBearingFactsBlock` is exported and unit-tested (`tests/answer-bearing-facts.test.ts`).
- New repeatable baseline: `npm run narration:baseline` plays the 8 scripted Ren turns through the real `/action` pipeline. Stub mode (default, no network) verifies that each information question's prompt contains the fact that answers it; live mode (`BASELINE_MODE=live`, keys from the environment, `BASELINE_MODELS`) reports acceptance per turn and the rejection reason. It backs up and restores the tracked orchestrator config and removes the temporary credential file. Stub result: 5 of 5 information turns carry their answering fact. Live run (Gemini 3.5 Flash Lite then Groq qwen3.8-27b): 2 of 8 accepted (Mei answered "Inspector Calder... warn us off the pier" and "the spent .38 casing lay right beside the body"); the others were provider failures or the scenery gates. Acceptance varies run to run between 2 and 4 of 8 on this route, so compare changes over several runs, not one.

## 15. Soft gates and history window: measured, not proven (2026-11-24)

Changes: (a) the baseline script moves the player to the docks before "examine the bloodstain"; (b) generation-time action-substance and the final N18 environment-excess rejections are skipped when the reply states the fact that answers an information question (`NARRATION_SOFT_GATES=0` restores strict behaviour); (c) the narration prompt's recent-turn window is configurable (`NARRATION_RECENT_TURNS`, default 2, max 12).

Live A/B/C, two runs each, Gemini 3.5 Flash Lite then Groq qwen3.8-27b, 8 scripted turns:

| Config | Accepted (run 1, run 2) | Total | Rejections by cause |
| --- | --- | --- | --- |
| A strict gates, history 2 | 1, 5 | 6/16 | provider/unavailable 6, scenery gate 3, other 1 |
| B soft gates, history 2 | 2, 3 | 5/16 | provider/unavailable 5, scenery gate 3, action-fidelity 2, presentation guard 1 |
| C soft gates, history 6 | 1, 1 | 2/16 | provider/unavailable 12, scenery gate 2 |

Reading: provider unavailability is the largest single cause in every configuration, and run-to-run swings (A: 1 versus 5) exceed any difference between configurations. Soft gates showed no measurable change, plausibly because the scenery rejections occurred on non-information turns (desk scan, walking to the docks), which the exemption deliberately does not cover. Configuration C's low score is dominated by provider failures (12 of 16 turns), so it is **not** evidence that a longer history hurts. The defaults are unchanged (soft gates on, history 2).

Conclusion: live runs on free, overloaded providers cannot separate small prompt and gate effects. Next step is the replay harness (V2 gap G6/X5b): record real candidate narrations once and replay them through the gates offline, so gate and prompt changes are scored deterministically.

## 16. Replay harness (V2 gap G6 / X5b)

`scripts/narration-baseline.ts` now has three modes. **live** can `BASELINE_RECORD` the raw model replies of every call (tagged narrate / rewrite / other); **replay** serves those recorded replies back to the real pipeline through a scripted provider (no network), so prompt, gate and rewrite changes are scored deterministically against actual model output; **stub** only checks prompt contents. `scripts/merge-replay-corpora.mjs` unions several recordings. The committed corpus `tests/fixtures/narration-replay/ren_gemini_groq.json` merges four live runs (Gemini 3.5 Flash Lite then Groq qwen3.8-27b); 7 of 8 turns have at least one recorded narration reply. The harness resets the orchestrator's cooldowns and breaker state at the start of each run, because the orchestrator is a process-wide singleton (without that, a second in-process run was not deterministic).

First replay score: 3 accepted of 7 scorable turns (the live recordings of those turns were accepted 5 times across the runs, so the current gates reject some replies a previous live run accepted: the first thing to investigate). `tests/narration-replay.test.ts` asserts determinism, that every information question's prompt carries its answering fact, and an acceptance floor of 2.

## 17. Open Game Master guard study, and what was implemented from it

Source studied (read-only, MIT): `Lebbitheplow/open-game-master` (renamed from `open-dungeon-master`), `src/lib/dm/narration-guard.ts`, `engine-boundary.ts`, `claims*.ts`, `narrator-quality.ts`, `turn-budget.ts`. A subset is kept on branch `experiment/open-game-master-reference` with observations in its `SOURCE.md`.

How it works: narration never changes mechanical state, so a contradiction is a prose bug. A claims reader extracts what the prose asserts; contradictions are ruled deterministically against the turn's resolved outcomes; the model is asked once to fix its own prose from a call **held outside the turn's call budget**; the rewrite is accepted only if it strictly reduces contradictions; otherwise **just the offending sentences are cut** when enough text remains; otherwise the original stands and the finding is logged. Every turn stores an outcome row (quiet, rewritten, kept_short, kept_unresolved, call_failed, unread, off, none).

What Dreamville lacked and now has:
1. **Severity policy** (`narrationGuardPolicy.ts`): findings are HARD or SOFT. HARD (secret leaks, invented canon, false ignorance of a known fact, movement claims, agency violations, missing canonical consequences, repeated prose, content-free scenery, a reply that does not respond to the action, structurally invalid output, unknown reasons) still reject. SOFT (pacing, style, richness, scene-anchor words, scenery that still carries action) get one repair and are then **kept and recorded**. Kept prose must be readable story text (`isReadableNarration`), so garbage from a broken provider is never kept.
2. **Fail-open after one repair** in the generation validator and the final continuity checks; `NARRATION_SOFT_GATES=0` restores fail-closed behaviour.
3. **Sentence-level cut** (`cutOffendingSentences`): when the final review names unsupported claims, those sentences are removed if at least min(120 characters, a third) remains and the remainder passes.
4. **Reserved correction call** (`AiTurnCallBudget.beginCorrection`): one repair per turn may run past the task and attempt caps.
5. **Per-turn quality record** (`narrationQualityLedger.ts`): outcome, findings by severity, model, attempts, repair and reserve use; returned as `narrativeQuality` on `/action`, readable through `GET /api/game/narration-quality/:storyId` with rates; shown per turn in `npm run narration:baseline`.

Replay score on the recorded real replies (Gemini 3.5 Flash Lite then Groq): **6 of 7 scorable turns accepted, against 3 of 7 with fail-closed gates**, with outcomes quiet 0, rewritten 4, kept_soft 2. Accepted answers were checked by hand: they state the known facts (Okafor, Pier 4, Calder's warning). One accepted "where exactly" reply names the harbor front rather than "Pier 4". A reply that ignored the player's action (bloodstain) stays rejected.

Behaviour changes worth knowing: soft findings no longer lose the turn; the response gained a `narrativeQuality` key (the pinned response-shape test was updated); a double-counted logical call in the rewrite was found and avoided (do not pass the turn budget into the rewrite call, `beginCorrection` already counts it).

## 18. Live confirmation of the guard policy (2026-11-25)

Three live runs of `npm run narration:baseline` (Gemini 3.5 Flash Lite then Groq qwen3.8-27b, same 8 turns on the Ren pack), code at commit `17eeda52`:

| Run | Accepted | Guard outcomes | Provider calls |
| --- | --- | --- | --- |
| 1 | 6 / 8 | rewritten 6, rejected_hard 2 | 30 |
| 2 | 7 / 8 | rewritten 7, rejected_hard 1 | 32 |
| 3 | 6 / 8 | rewritten 4, kept_soft 2, rejected_hard 2 | 28 |

Earlier live runs on the same route scored 0 to 4 of 8 (strict, soft gates and history variants all inside that range), so this is the first configuration that clears the noise. In every run the information answers were grounded in the player's known facts: "Where exactly was he found?" returned Pier 4 (first time it did so consistently, including "Pier Four" in Mei's voice), "Who found the body?" named Silas Okafor, and "What did they say about the bullet casing?" returned the .38 beside the body. No turn was lost to provider unavailability in these runs.

Remaining rejections (all hard by policy): "I ask Mei what the police have said" (twice, environment-only or too little acknowledgement), "I examine the bloodstain" (twice; a reply that does not respond to the action), "I head out to the docks" (once). Provider calls per turn were about 3.5 to 4, with a repair used on most accepted turns, so repair is doing the work, not the first reply: a prompt that gets more first-pass answers right would cut calls.
