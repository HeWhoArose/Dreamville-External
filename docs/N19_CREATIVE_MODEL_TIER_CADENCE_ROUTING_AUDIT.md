# N19 — Creative Model Tier & Cadence Routing Audit

## Scope

N19 adds an explicit, deterministic routing projection for AI task quality tier and execution cadence. It extends the existing AI task contract / MultiModelOrchestrator selection path and does not replace provider health, quota, fallback, pin, override, or emergency-floor authorities.

## Pre-implementation audit

Existing routing authorities found:
- AiTaskContracts: required/preferred capabilities, pools, context contracts, validators, fallback limits.
- MultiModelOrchestrator: model registry, provider health/quota checks, task eligibility, configured fallback chains, pins, category overrides, capacity preflight, failure penalties, emergency floor.
- AiTurnCallBudget: per-turn logical call limits and provider-attempt accounting.
- orchestrator_config.json: explicit task fallback route configuration.

Gap:
- No first-class representation of creative quality tier.
- No first-class representation of task cadence.
- Generic selector scoring optimized reliability/priority/capacity but had no reusable narrative-quality preference.
- Configured task routes intentionally remain authoritative; N19 must not silently reorder a user/system-authored route.
- The deterministic emergency floor must never be promoted by creative-quality scoring.

## N19 contract

AiTaskRoutingPolicy projects:
- quality tier: FAST | STANDARD | CREATIVE | PREMIUM_CREATIVE | REVIEW
- cadence: PER_TURN | CONDITIONAL | PERIODIC
- deterministic rationale

Current policy examples:
- narrative.generate → CREATIVE / PER_TURN
- character.dialogue → CREATIVE / PER_TURN
- narrative.review → REVIEW / CONDITIONAL
- intent.interpret → FAST / PER_TURN
- memory.extract and research.query → STANDARD / CONDITIONAL
- summary.scene and research.world-brief → STANDARD / PERIODIC
- world.generate → PREMIUM_CREATIVE / CONDITIONAL

Unlisted tasks receive a category-derived deterministic default.

## Quality scoring

scoreModelForQualityTier() is provider/model agnostic. It scores existing registry metadata such as capability fit, pool fit, context capacity, output capacity, and latency for FAST routing.

It never creates or registers a new model and never bypasses isCandidateUsable().

For configured task routes, pins, and category overrides, the existing authority remains intact. N19 is additive beneath those explicit controls. For ordinary selector scoring, the N19 tier score contributes to the existing reliability/priority score.

## Cadence boundary

Cadence is a routing contract, not a new scheduler. Existing call sites remain authoritative for when a task is actually invoked, while AiTurnCallBudget remains the per-turn safety boundary. N19 therefore avoids adding extra LLM calls or a second scheduling subsystem.

## Failure / fallback

- Health, quota, cooldown, circuit breaker, role eligibility, context capacity, and provider preflight remain authoritative.
- Explicit pins and category overrides remain authoritative.
- Explicit configured task routes retain their configured order.
- N19 never promotes the emergency deterministic floor.
- When all AI candidates fail, the existing deterministic emergency path remains available under existing allowDeterministicFallback semantics.
- N19 policy resolution is deterministic and has category defaults for incomplete task coverage.

## Regression coverage

tests/ai-quality-routing-n19.test.ts covers:
- narration/dialogue creative per-turn policy
- conditional/periodic cadence classification
- creative-vs-fast quality preference
- premium creative preference for creative + reasoning + context
- emergency floor exclusion
- real MultiModelOrchestrator.selectBestModel() wiring when explicit route/pin/override controls are removed

## Re-audit corrections

Before CI, a source-level re-audit found two wiring defects:
1. The selector referenced routingPolicy before binding it.
2. The first quality-score insertion did not survive the initial source transformation.

Both were corrected before pre-merge verification. The first Release Gate then exposed a stale out-of-scope binding at compile time; that stray binding was removed and the exact selector-local binding was added. The corrected head is the one under current CI verification.

## Authority graph

Task call
→ getAiTaskRoutingPolicy(task)
→ existing MultiModelOrchestrator.selectBestModel()
→ existing candidate usability/preflight/health/quota/fallback controls
→ existing provider execution
→ existing task-specific consumers.

No new persistence authority, canonical world mutation authority, narrative-state authority, or provider-health authority is introduced.