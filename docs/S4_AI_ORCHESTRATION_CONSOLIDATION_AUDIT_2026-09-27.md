# S4 — AI Orchestration Consolidation Surgical Audit
Date: 2026-09-27
Status: VERIFIED — RUNTIME TESTED

## Scope
This audit implements the S4 owner scope from SURGICAL_ARCHITECTURE_REGISTRY_V1.md and the active AI orchestration specifications. It consolidates task contracts, model/task readiness, response validation, fallback policy, and context adapters without creating a second AI router or a second working-context engine.

## Implemented

### 1. Single task-contract authority
server/domain/aiTaskContracts.ts remains the single task-contract registry.

Each task now exposes derived metadata for:
- context contracts;
- required tool modes;
- response validator kind;
- fallback policy;
- downstream canonical consumer.

The existing task definitions remain the source of task identity, category, required capabilities, input/output modalities and structured-output requirements.

### 2. Central model/task readiness
evaluateAiTaskReadiness() is now the shared readiness authority for (task, model, context) compatibility.

It checks task eligibility, emergency-floor semantics, model health, provider configuration/access, quota/access limits, context-window fit, declared capabilities, input/output modalities, and structured-output compatibility.

MultiModelOrchestrator.isCandidateUsable() now consumes this shared readiness result rather than duplicating the compatibility rules.
getTaskReadiness() exposes the same result for audit/introspection.

### 3. Central response validation and fallback
MultiModelOrchestrator.executeTaskGeneration() now resolves the canonical task contract, obtains the normal model selection/fallback chain, executes the selected provider, validates the provider response through the task contract when no task-specific validator overrides it, advances the same request to another eligible model when validation fails, and preserves the existing emergency deterministic floor.

Schema/task-validation failures advance the current request without globally circuit-breaking the model. Operational failures retain the existing circuit-breaker behavior.

### 4. Canonical context adapters
server/domain/aiContextAdapters.ts provides typed adapters for research, world generation, character generation, rules outcomes, combat AI, narrative outcomes, and OOC.

The adapters are projections/composition helpers. They do not own canonical state, adjudication, persistence, narration, or routing.

WorkingContextEngine remains the sole working-context assembly/budgeting authority. NarrativeContinuityEngine remains the narrative research authority. projectPlayerCapabilities() remains the player-facing capability boundary.

### 5. Epistemic and authority preservation
AI context is assembled from canonical repository projections and player-authorized views. The adapters do not expose raw capability registries, hidden combat state, or private planner/evidence internals.

Committed canonical outcomes may be inserted as protected working-context chunks. AI prose remains downstream of canonical adjudication.

### 6. Canonical category-to-task mapping and route semantics
Category membership is now derived directly from the canonical task-contract registry through getAiTasksByCategory() rather than a second hardcoded category map.

getCategoryRuntimeStates() no longer treats tasks[0] as the category's route. Each task in a category receives its own TaskRuntimeRouteState, exposing:
- the task's active model;
- whether the route is AUTO, TASK_PINNED, or CATEGORY_MANUAL;
- that task's configured fallback chain.

For multi-task categories such as narration, tactical_reasoning, gameplay_advice, and speech, the runtime now reports every task independently. Category-level presentation fields are only populated when the task routes actually share a common active model or common fallback chain; divergent task routes are not collapsed into the first task.

Category overrides remain task-compatible: a category-selected model may be used by every task for which it is eligible, while tasks that require a different modality/capability retain their own task route. This preserves existing speech/transcription and tactical/narrative task boundaries instead of forcing incompatible tasks onto one provider path.

autoConfigureFallbacks() also derives its task list from the canonical contract registry, so newly registered or multi-task category members cannot be silently omitted from fallback configuration.
## Call graph
Canonical state -> authority-owned projection -> AiTaskContract -> evaluateAiTaskReadiness -> MultiModelOrchestrator -> provider adapter -> task response validator -> fallback or accepted AI result -> existing authoritative consumer -> canonical commit / derived narration

No second router, state authority, or working-context engine was introduced.

## Verification
Dedicated regression suite: tests/s4-ai-orchestration-consolidation.test.ts

Coverage:
- task metadata is present for the registered runtime task set;
- incompatible models are rejected before execution;
- malformed structured output is rejected centrally;
- schema-invalid primary models fall through to an eligible fallback;
- context adapters remain read-only and player-authorized.

Final repository verification for the category-to-task routing hardening on commit e3e56288f952da4ca80fb1f7c1c172e4873d3c0d:
- npm run lint — PASS
- npm test — PASS
- npm run build — PASS
- 1018 tests passed, 0 failed, 0 skipped
- both GitHub verification workflows — PASS
- the dedicated S4 route audit exercises ten repeated passes over every task in every category and explicitly covers narration, tactical_reasoning, gameplay_advice, and speech.

## Ownership
S4 implementation is owned by the AI orchestration layer and its contract/readiness/adapter files. Existing canonical game systems remain the owners of state and adjudication.

The Master Plan remains unchanged.