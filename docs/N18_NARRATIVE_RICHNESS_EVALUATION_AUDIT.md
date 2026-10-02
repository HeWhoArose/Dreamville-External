# N18 Narrative Richness Evaluation Audit

## Scope

N18 adds a deterministic, presentation-only richness evaluator for accepted narrative output. It does not replace semantic safety review, literary review, canonical adjudication, memory lifecycle, or NPC/world authorities.

## Pre-implementation audit

### Existing authorities

- `SemanticNarrativeReview`: semantic correctness, player agency, epistemic safety, action/observation requirements.
- `LiteraryNarrativeReview`: deterministic literary quality checks plus the existing single rewrite surface.
- `NarrativeEpisodeProjection`: bounded episode shape and continuity cues.
- `SceneComposition`: beat, subtext, reaction, sensory and closure presentation cues.
- `NarrativeNoveltyEngine`: repetition/trope detection.
- `NarrativeStateAdjudicator`: canonical state boundary.

### Gap found

Existing review logic protected correctness and several literary failure modes, but there was no explicit deterministic contract measuring whether an accepted turn was rich enough across specificity, dialogue individuality, subtext, emotional movement, sensory diversity, beat progression, tension, meaningful reaction, freshness, setup/payoff, closure, and player agency.

### N18 authority decision

N18 is a pure evaluator. It reads existing authorized turn inputs and returns a transient evaluation. It never writes canonical state.

N18 is advisory. It never creates a new rewrite call or a new acceptance gate. When an existing literary rewrite is already authorized, N18 improvement cues are fed into that same rewrite prompt. No additional mandatory LLM call is introduced.

## Producer -> evaluator -> consumer

`StructuredTurnPackage`
-> `NarrativeRichnessEvaluator.evaluate()`
-> `NarrativeRichnessEvaluation`
-> existing literary rewrite guidance when N6 already requests REWRITE
-> post-rewrite semantic + literary + novelty + N18 measurement
-> canonical adjudication

The separate `generateNarrativeOnly` route exposes the evaluation result without adding a second generation call.

## Dimensions

N18 evaluates twelve weighted dimensions:

1. Specificity
2. Character/dialogue individuality
3. Subtext
4. Emotional progression
5. Sensory variety
6. Beat progression
7. Dramatic tension
8. Meaningful reaction
9. Freshness
10. Setup/payoff
11. Closure
12. Player agency

The evaluator is context-sensitive for micro-turns and turns without dialogue or explicit subtext/reaction requirements so it does not reward unnecessary prose padding.

## Failure and fallback policy

- Empty narration produces `IMPROVE` with an explicit deterministic fallback reason.
- A richness failure does not override semantic/canonical safety.
- A provider rewrite remains constrained by the existing semantic and literary gates.
- If the single existing literary rewrite does not reach N18 PASS, the turn remains rejected and the surrounding provider fallback path may recover with its existing behavior.
- Emergency fallback output can remain available even when richness is imperfect; availability never authorizes a canonical mutation.

## Regression coverage

The N18 suite covers:
- rich grounded narration
- flat/generic narration
- focused micro-turns
- player agency takeover
- empty narration fallback
- reuse of the existing literary rewrite surface
- production orchestrator wiring
- separation from semantic safety review

## Verification status

This document is updated before merge with the actual lint, full test, build, release-contract, and post-merge verification results.
