# DreamBook AI Model Intelligence Runtime Specification v1

## Baseline

This specification extends the existing Phase 12 / Phase 12A orchestration system. It is not a replacement for the current orchestrator.

Baseline audited on 28 September 2026 from `main` commit `de7832f022b0c874d23cf648f1d01781a2447b9e`.

The current implementation already contains:
- task/category contracts;
- per-category runtime state;
- task-specific fallback chains;
- provider/model health and cooldown state;
- token usage ledger;
- deterministic emergency recovery;
- semantic response callbacks for important consumers such as Character Genesis;
- category isolation and routing tests.

The new work must preserve those behaviors and must not rewrite healthy gameplay/narrative routing merely to introduce model-intelligence telemetry.

## Core invariant

Simulation determines what happens. Narration describes what happened. AI may propose or narrate, but canonical game authority decides state.

## Objectives

1. Make model selection task-aware rather than ping-aware.
2. Distinguish provider/model existence from task readiness.
3. Keep narration, dialogue, summarization, Character Genesis, world generation, rules, research, speech, and image tasks independently routable.
4. Make fallback continue after retryable provider failures AND task-contract/schema/semantic failures.
5. Distinguish authoritative provider quota from observed usage and estimated headroom.
6. Avoid contacting models that are known to be incompatible with the request.
7. Make Auto Arrange test whether a model can actually perform the category it is being assigned.
8. Make routing latency smaller by avoiding obviously unusable candidates and by using bounded concurrency for discovery/preflight work.
9. Keep provider credentials server-side.
10. Preserve deterministic emergency fallback.

## Runtime data model

### Provider state
Authentication, provider availability, rate-limit metadata, provider-specific health evidence.

### Model state
Availability, cooldown, latency, failures, request count, token usage, last success/failure.

### Category state
Active model, automatic/manual mode, category-scoped fallback order.

### UI state
Temporary/manual selection only. It must never become canonical story state.

## Task taxonomy

Canonical task categories are:
- narration
- dialogue
- summarization
- world_generation
- character_genesis
- memory
- research
- research_world_brief
- utility
- intent_interpretation
- capability_synthesis
- capability_explanation
- tactical_reasoning
- gameplay_advice
- rules
- rule_analysis
- speech
- image

## Candidate readiness states

A candidate can be:
- DISCOVERED
- CLASSIFIED
- CAPABILITY_COMPATIBLE
- CONFIGURED
- QUOTA_AVAILABLE
- TASK_VERIFIED
- READY
- THROTTLED
- COOLDOWN
- UNAVAILABLE
- REJECTED
- UNKNOWN

The system must retain a machine-readable reason for every rejection/skip.

## Eligibility order

For a task request:

1. Resolve canonical task contract.
2. Resolve model identity.
3. Check adapter availability/configuration.
4. Check user-disabled state.
5. Check health/circuit breaker/cooldown.
6. Check task eligibility.
7. Check required input modality.
8. Check required output modality.
9. Check structured-output requirement.
10. Check input + reserved output capacity against the model context window.
11. Check model output limit.
12. Check billing policy when billing information is known.
13. Check provider-authoritative quota when available.
14. Otherwise use observed/estimated headroom and explicitly label it.
15. For Auto Arrange only: run a task-specific, non-mutating canary.
16. Record readiness evidence.

## Fallback contract

A provider response is not success merely because HTTP/provider transport succeeded.

Success requires:
- non-empty response where appropriate;
- parsing success;
- task-contract validation;
- consumer semantic validation where the caller supplies one.

Schema/semantic failures must:
- be recorded against the request;
- be visible in the attempts trail;
- move to the next eligible candidate;
- not automatically mark the provider globally unavailable.

429/5xx/timeouts/unavailable/auth failures must additionally update provider/model runtime state according to the existing cooldown/circuit-breaker policy.

## Billing semantics

Billing status is separate from availability:
- FREE
- PAID
- ACCOUNT_DEPENDENT
- UNKNOWN

Free/paid status must never be inferred solely from an absent provider field.

## Quota semantics

Every quota/headroom value must identify its source:
- PROVIDER
- ESTIMATE
- UNKNOWN

Exact remaining quota may only be shown when provider-authoritative data exists.

## Auto Arrange

Auto Arrange becomes a model-operations workflow:

DISCOVER → NORMALIZE → CLASSIFY → PRECHECK → TASK CANARY → MEASURE → BUILD CATEGORY ROUTES

It must not simply ping every model and mark a responsive model as generally usable.

Preflight work may use bounded concurrency, but provider calls used for a production request remain ordered by the configured fallback chain.

## Category isolation

Changing Narration routing must not change:
- Summarization;
- Character Genesis;
- World Generation;
- Rules;
- Research;
- or any other category.

A model may serve multiple categories only when it independently satisfies each task contract.

## Latency strategy

1. Do not contact candidates known to be unusable.
2. Cache model metadata and preflight results with bounded TTL.
3. Use category-specific timeout budgets.
4. Use streaming for presentation tasks when provider support is available.
5. Use provider-native structured output for structured tasks where available.
6. Do not run a full provider discovery/probe sequence during an ordinary player generation request unless the configured route has no usable candidate and adaptive recovery is explicitly permitted.

## UI requirements

The Model Operations surface must show:
- provider/model;
- category/task;
- readiness state;
- why selected;
- why skipped;
- latency;
- request/token telemetry;
- quota source/state;
- cooldown;
- fallback activation.

No credentials, management keys, or raw authorization headers may appear in client telemetry.

## Implementation order

### Step 1
Introduce a side-effect-free canonical task-candidate preflight evaluator.

### Step 2
Use the evaluator to audit and repair task/fallback-chain compatibility without changing healthy routes.

### Step 3
Move Character Genesis semantic validation into the task execution contract path while preserving its existing consumer validator.

### Step 4
Upgrade Auto Arrange from ping/benchmark to task-aware bounded-concurrency preflight.

### Step 5
Implement provider-aware billing metadata and explicit FREE/PAID/UNKNOWN semantics.

### Step 6
Implement provider-authoritative quota retrieval where the provider exposes it; otherwise keep observed/estimated headroom.

### Step 7
Upgrade per-category fallback construction using task readiness and quota/headroom policy.

### Step 8
Add latency optimizations: cached preflight, category timeouts, provider-native structured output, and streaming presentation paths.

### Step 9
Upgrade Model Operations UI with candidate decision explanations and fallback traces.

### Step 10
Add provider-by-provider acceptance suites.

### Step 11
Run a final cross-system 10-pass audit covering routing, fallback, quota, billing, security, category isolation, persistence, UI, and performance.

### Step 12
Run the final repository gate:
- targeted AI orchestration suites;
- full `npm test`;
- `npm run lint`;
- `npm run build`;
- live runtime proof;
- final regression and fallback audit.

## Change-safety rule

Each implementation step must:
- audit current code first;
- make the smallest compatible change;
- add regression coverage;
- verify fallback behavior;
- re-audit at least 10 times;
- avoid unrelated changes;
- preserve all existing canonical/gameplay authority paths.

A step is not complete when the code merely exists. It is complete only when its applicable implementation, regression, fallback, authority, persistence, performance, and repository checks pass.
