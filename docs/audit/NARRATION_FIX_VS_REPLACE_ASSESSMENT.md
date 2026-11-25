# Narration System: Fix vs Replace Assessment

- **Date:** 2026-11-23
- **Question:** Do the Phase 1A–1F plans fix Dreamville's narration system, or would it be better to adopt an existing open-source system and improve on it?
- **Short answer:** Keep Dreamville's pipeline. The plans fix *correctness* of narration, not *yield and quality at generation*, and that second gap is where the live run hurt. No open-source candidate reviewed closes that gap, and several would remove Dreamville's strongest guarantee.

## 1. What the plans fix, and what they do not

Evidence base: offline suites (1978 pass), plus a limited live run on OpenRouter free models (about 10 turns, see ledger §12.1a).

| Concern | Addressed by plans? | Evidence |
| --- | --- | --- |
| LLM output cannot mutate canonical state | Yes (1A, 1C) | `WorldSimulationProposal`, CAS, adjudicator; offline suites |
| Narration grounded in committed facts (names, possessions, movement, corpse, forensic claims) | Yes (1A, 1B, 1D) | Review gates fired live: rejected "wet boards" as unsupported detail |
| Memory, NPC knowledge, witness facts | Yes (1D) | Offline suites only; not exercised live |
| Lock contention and background work | Yes (1E) | Offline suites; 3-phase `/action` |
| **First-pass acceptance of real-model narration** | **No** | About 3 of 10 live turns produced accepted prose; most rejections were the action-substance gate or unsupported-detail review |
| **Prompt and gate calibration against real model output** | **No** | Real-provider testing was BLOCKED during all phases; every phase was verified against mocks |
| **Behaviour on reasoning-style models** | **No** (fixed 2026-11-23, see §4) | Free reasoning models returned empty content at the 650-token pacing budget |
| **Network calls per turn under failover** | Partly | Per-turn logical budget exists; real attempts were 8–14 per turn on an unrestricted catalog |

Why this gap exists: every phase was tested with deterministic mocks that always return acceptable JSON. A validator tuned only against a cooperative fake will look healthy and still reject a large share of real output. The plans never contained a step that measures that.

## 2. Open-source candidates reviewed

Sources: repository front pages read on 2026-11-23. Language percentages and last-commit dates did not render, so "actively maintained" is **unverified** for all of them. Star counts are as shown at read time.

| Project | License | Language | Stars | How it splits state vs narration | Automatic review of prose before display? |
| --- | --- | --- | --- | --- | --- |
| [Talemate](https://github.com/vegu-ai/talemate) | **AGPL-3.0** | Python (+ frontend) | ~440 | Multi-agent (narrator, director, editor, world-state agent); world state appears LLM-maintained | Not confirmed |
| [Andromeda](https://github.com/danielrod36/Andromeda) | MIT code; OGL for one theme pack | Python + Godot | 0 | Deterministic engine owns dice/state, LLM narrates | No |
| [rpg-mcp](https://github.com/Mnehmos/rpg-mcp) | **Unresolved** (sidebar MIT, README ISC) | TypeScript | ~47 | LLM proposes, engine validates actions | No (validates actions, not prose) |
| [MnesOS](https://github.com/neolaw84/MnesOS) | **None found** | Python + TS client | 0 | Rules engine owns mechanics; Director/Narrator split | No |
| [NarrativeEngine-P](https://github.com/Sagesheep/NarrativeEngine-P) | MIT | JS/TS | ~134 | Engine owns dice/travel; **LLM extracts world-state facts after each turn** | User-triggered "Lore Check", not an automatic gate |

Also noted: the plan's own §6 of [UNIFIED_AUDIT_RECONCILIATION.md](../UNIFIED_AUDIT_RECONCILIATION.md) already reviewed Openovel (Apache-2.0), AiChatTrpg (Apache-2.0, with an AGPL dependency warning), NarrativeEngine-P and Project Lunar, and decided to *borrow patterns, not copy*. A related paper, [World-State Transformations for Neuro-symbolic Interactive Storytelling](https://arxiv.org/abs/2605.24719), supports the same direction: a rule-based state layer improves coherence, tested with 8 participants only.

## 3. Recommendation: do not replace; borrow selectively

Reasons, in order of weight:

1. **None of the five has the thing Dreamville's design depends on:** an automatic check of the finished prose against committed state before the player sees it. Replacing the pipeline would delete the layer that caught the invented detail in the live run.
2. **Licensing and runtime.** The strongest narration-focused candidate (Talemate) is AGPL-3.0 and Python; copying or running it as a networked sidecar brings AGPL obligations. Dreamville is TypeScript/Node. The two TypeScript candidates have an unresolved license (rpg-mcp) or weaker state guarantees (NarrativeEngine-P).
3. **Maturity.** Most candidates are tiny or brand new (0 to ~440 stars). Adopting one trades a 1978-test system for a young codebase.
4. **The real problem is not solved by any of them.** They mostly assume the model is good and do not validate its output.

What to borrow (ideas, not code, per the plan's own §6.6 policy):
- Talemate's separate *editor* role as a model for the single permitted repair pass (idea only; AGPL).
- NarrativeEngine-P's confirm-before-apply handling of inventory changes (MIT, TypeScript; code may be reusable after the pinning and notice steps in §6.6).
- rpg-mcp's pre-execution constraint validator pattern (resolve its license before touching code).

## 4. What was fixed today

- Retired two free-model routes the provider reports as no longer free (`ling-3.0-flash:free`, `qwen3.8-27b:free`) and mapped them, in defaults, persisted configs and the tracked config, to specific models confirmed working by a live probe. The `openrouter/free` router is deliberately **not** used (existing policy: random per-call model breaks narration consistency).
- Provider-confirmed "unavailable for free" 404s now trigger a 6-hour cooldown instead of a retry every turn.
- First OpenRouter request now has a 1536-token floor so reasoning models do not burn the call.
- Tests: `tests/free-model-retirement.test.ts` plus updates to four existing tests.

## 5. What would change this recommendation

The decision rests on licensing, runtime and the missing review gate. It does **not** rest on proof that Dreamville's narration is good, because that has not been measured on a capable model. Run the same Ren scenario on a strong model:
- **Acceptance high (for example 80%+):** the free models were the problem; keep the pipeline and tune model selection.
- **Acceptance still low:** the pipeline (prompt size, gate strictness) is the problem. The fix is still inside Dreamville: split gates into hard safety checks versus soft quality checks, and use the one repair pass for quality failures instead of discarding the turn.

Not measured: prompt size per turn, acceptance rate on any non-free model, and the internals of the five candidates beyond their front pages.

## 6. Why a turn makes many real LLM calls (measured 2026-11-23)

Method: a counting adapter behind the real `POST /api/game/action` route, plus the live-run call logs. Offline counting was done with fake, always-valid model output.

| Step | When it runs | Cost |
| --- | --- | --- |
| `intent.interpret` | Only if deterministic parsing is below 0.9 confidence (most natural free text is) | 1 call, about 360 input tokens |
| `narrative.generate` | Always | 1 call, about 1.1k user + 1.3k system tokens on a small scene |
| `narrative.review` (repair) | Only if the local deterministic review rejects the draft | 1 call, about 1.5k tokens |

So the baseline is 1 to 3 logical calls. The 5 to 14 real requests seen live come from multipliers:
1. **Uncapped failover.** For a *configured* fallback chain (the defaults are one), the code sets the attempt budget to infinity, so one turn could walk a whole 8-model chain. The old call budget recorded provider attempts but never limited them.
2. **Empty reasoning output.** A reasoning model that spends its token budget on thinking triggers a second, larger recovery request to the same model (mitigated by the 1536-token floor).
3. **Review rejection** adds a repair call.
4. **Stale or throttled models** were retried every turn (fixed: long cooldown on "unavailable for free").

Change made: `AiTurnCallBudget.canAttemptProvider` caps real provider requests per turn (narrative.generate 4, other tasks 3, whole turn 10). The zero-cost deterministic fallback floor is exempt, and hitting the cap is reported truthfully as AI unavailable. `executeTurn` retries the same model, so it caps *distinct models tried* instead. Tests: `tests/provider-attempt-cap.integration.test.ts` and `tests/ai-turn-call-budget.phase12.test.ts`.

Not measured: prompt size growth over a long session (the first-turn numbers above are for a small scene), and the cap values themselves are reasoned defaults, not tuned against live data.
