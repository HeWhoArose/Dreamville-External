# Phase 12 — AI Narration, Provider Abstraction & Prompt Governance

## Phase status

Implementation and source-level audit are complete for the current Phase 12 work.
The runtime npm test/lint/build gate is intentionally pending, per the project workflow, and will be executed after the remaining roadmap phases are completed.

## Scope implemented

### Provider abstraction

- Existing `IProviderAdapter` remains the provider boundary.
- Gemini, OpenRouter, deterministic emergency, mock speech, and mock STT continue to use provider adapters.
- Speech synthesis and transcription now use the canonical model-selection/fallback path instead of hard-coded mock providers.
- Provider credentials remain server-side.

### Prompt governance

- Added `DREAMBOOK_PROMPT_VERSION = phase12-v1`.
- Provider prompt construction exposes the prompt version.
- Successful turn telemetry and continuation checkpoints record the prompt version.

### Structured output and authority

- Malformed live Gemini JSON is rejected instead of being converted into synthetic canonical-looking output.
- AI state-change proposals remain proposals only and pass through `DomainAdjudicationBridge`.
- Presentation-only narration explicitly strips state changes.
- The orchestrated turn HTTP path remains inside `canonicalCommandEngine.execute(...)` with staged transaction handling.

### Runtime health and fallback

- Added `ModelRuntimeStatus` with requests, success/failure counts, consecutive failures, 429/5xx/timeout counts, latency, cooldowns, token dimensions, and runtime headroom metadata.
- Added explicit operational states: AVAILABLE, THROTTLED, COOLDOWN, UNAVAILABLE, DISABLED.
- Added bounded exponential backoff and cooldown-aware model eligibility.
- Added category-scoped manual model overrides.
- Forced-model fallback is restricted to the configured/eligible fallback chain instead of all registered models.
- Fallback defaults are aligned with the canonical runtime orchestrator configuration.
- Emergency floor usage is recorded in runtime telemetry.

### Phase 12A category control

Categories currently separated into:
- narration
- world_generation
- character_genesis
- research
- rules
- speech
- image

Changing a narration model does not alter the world-generation category route.

### Usage telemetry

The runtime ledger records:
- input tokens
- output tokens
- reasoning tokens
- cached tokens
- tool tokens
- total observed tokens
- latency
- failure type
- provider/model/task/category

Provider-authoritative quota values remain separate from observed usage. Unknown quota headroom is not presented as exact.

## Phase 9 → Phase 12 connection

Canonical equipment remains owned by `InventoryItemEngine`.
Its effective capabilities flow through `CapabilityEngine` and into `WorkingContextEngine`.
Phase 12 consumes that authorized working context; it does not independently invent equipment state.

A Phase 12 cross-phase regression covers an equipped canonical item capability appearing in AI working context.

## Phase 10 → Phase 12 connection

Phase 10 living-world/NPC simulation remains owned by the canonical repository and simulation engines.
`WorkingContextEngine` reads current NPC schedules and player-visible simulation state before AI generation.

A Phase 12 cross-phase regression covers a co-located living-world NPC appearing in AI working context.

## Phase 11 → Phase 12 connection

AI working context consumes `WorldRepository.getAuthorizedKnowledgeFacts(...)`.
Private/unacquired knowledge is excluded before prompt assembly.

The Phase 12 regression suite verifies that a private fact is absent from the AI prompt unless the actor has acquired it.

## UI

### Story composer

Added a compact narration model selector beside the player action composer.

It supports:
- Auto / healthy primary routing
- category-scoped manual narration model selection
- model status/cooldown awareness
- last-used model/latency display
- compact observed usage display

Selection is configuration state only; it is not stored as gameplay/world state.

### Model Operations inspector

The existing Routing Workstation now exposes:
- request totals
- observed token totals
- successes/failures
- category runtime state
- active category model
- model operational status
- latency
- 429/5xx counts
- cooldown information
- headroom source

## Regression coverage

Added `tests/phase12.ai-orchestration-runtime.test.ts` covering:

- category isolation
- 429 fallback/cooldown
- timeout fallback
- 5xx fallback
- emergency fallback exhaustion
- malformed provider output
- Phase 9 equipment → AI context connection
- Phase 10 living-world → AI context connection
- Phase 11 secret filtering → AI context
- illegal state-change validation
- provider token telemetry
- runtime/configuration separation

The test fixture disables persisted routing writes so the Phase 12 tests do not alter the repository's shared test configuration.

## Source-level audit loop

The implementation was repeatedly audited for:

1. authority boundaries
2. Phase 9/10/11 integration
3. category isolation
4. fallback/cooldown behavior
5. prompt versioning
6. token accounting
7. secret exposure
8. model selector/UI wiring
9. operations telemetry
10. repository diff scope

Issues found during the loop were fixed before the current checkpoint, including:
- recursive task-category resolver
- overlapping category mappings
- incomplete token-dimension accounting
- hard-coded speech provider routing
- malformed Gemini output synthesis
- fallback default mismatch
- emergency fallback telemetry
- stale operational cooldown state
- persisted-test configuration contamination

## Runtime verification

Not yet run after these Phase 12 changes.

The agreed workflow is to defer the full `npm test`, lint, and production build until the remaining roadmap phases are complete, then run the complete regression gate and repair any failures found there.
