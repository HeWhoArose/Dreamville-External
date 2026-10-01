# Dreamville Cross-System Integration Matrix — Phase 17

This matrix is the release contract for the Phase 1–16 architecture. It records the authoritative producer, the contract crossing the boundary, the consumer, the trigger, the failure floor, and the regression contract.

| Phase | Producer | Contract | Consumer | Trigger | Fallback | Test |
|---|---|---|---|---|---|---|
| 1 | CurrentSituationBuilder | CurrentSituation | WorkingContextEngine | gameplay turn/context request | bounded canonical projection | current-situation regression |
| 2 | PlayerIntentInterpreter | PlayerIntent | CurrentSituation / research / narration | player input | deterministic intent | player-intent regression |
| 3 | NarrativeResearchPipeline | bounded NarrativeResearchResult | narration prompt / director | narrative turn | current-situation-only retrieval | narrative-research regression |
| 4 | NarrativeDirector | EphemeralNarrativePlan | narration / adjudication metadata | narrative turn | deterministic plan floor | narrative-director regression |
| 5 | buildNarrationPrompt | ordered narrative prompt | AI narration task | narrative generation | deterministic prompt path | prompt/orchestration regression |
| 6 | SemanticNarrativeReview | NarrativeReview | rewrite gate / state adjudication | generated narration | one rewrite then reject | semantic-review regression |
| 7 | NarrativeStateAdjudicator | StateAdjudicationResult | canonical staged commit | accepted narration/effects | reject unverified mutations | adjudicator regression |
| 8 | NarrativeMemoryLifecycle | durable memory/thread/plot decisions | runtime narrative state | committed turn | no promotion on rejected/unanchored output | lifecycle regression |
| 9 | EntitySceneRelevanceEngine | ranked relevant entities | research / action advice / visual scene | current scene/action | bounded current-location projection | relevance regression |
| 10 | EpistemicBoundaryEnforcer | sanitized research/context | narration boundary | context assembly | remove unauthorized facts | epistemic regression |
| 11 | StoryActionAdvisor | ActionTip / ActionAdvice | StoryView suggestions | scene/action advice request | deterministic capability floor | action-suggestion regression |
| 12 | AiTurnCallBudget | AiTurnCallBudgetSnapshot | executeTurn model operations | logical AI call | deterministic emergency floor | budget regression |
| 13 | StoryView | composer / retry contracts | gameplay UI | player submits or retries action | retry only failed CUSTOM_ACTION | composer contract regression |
| 14 | ApiClient transcription boundary | normalized transcript/error contract | StoryView composer | voice recording | typed transcription failure | transcription regression |
| 15 | StoryCheckAuthority / StoryCheckEngine | authoritative RollRecord theme metadata | DiceRollAnimation | skill/check resolution | canonical default dice theme | dice integration regression |
| 16 | CurrentSituationBuilder + latest ActionLog | VisualSceneContext | comic prompt / media adapter | scene prompt/image request | presentation fallback / placeholder | visual-scene regression |
| 16 | VisualSceneContext | freshness token + sourceActionId | StoryView scene panel | action history changes | invalidate stale scene | UI freshness contract |
| 16 | MediaAdapterService | MediaGenerationResult | StoryView | image generation | SVG/prompt fallback | media failure regressions |
| 17 | Integration matrix | subsystem producer/consumer contract | release audit | every integration review | fail closed on missing connection | matrix contract test |
| 18 | TurnIntegrationHarness | EndToEndTurnTrace | automated regression suite | scenario execution | deterministic/mock narration | end-to-end scenario suite |
| 19 | Verification discipline checks | source/test/build gate contract | contributors/release process | implementation change | stop before release if contract absent | verification contract test |
| 20 | OrphanConnectionAudit | orphan/connection report | release audit | pre-release audit | unresolved entries block release | orphan audit test |
| 21 | ReleaseGateDefinition | lint/test/build + scenario gate | release decision | candidate branch/main | no release claim without all gates | release-gate contract test |
| 22 | Phase 22 stabilization contracts | stabilization invariants + regression suite | release verifier / release gate | release-candidate audit | fail-fast on stale/partial/orphaned closure | phase22-release-stabilization test |

## Canonical gameplay dependency chain

`PLAYER INPUT → PlayerIntent → CurrentSituation → NarrativeResearch → NarrativePlan → Narration → SemanticReview → StateAdjudication → CanonicalCommit → Plot/Memory/Threads → Next CurrentSituation`

## Canonical visual dependency chain

`CurrentSituation + latest committed ActionLog → VisualSceneContext → comic prompt → MediaAdapterService → StoryView`

The visual chain is presentation-only. It cannot authorize canonical state mutation.

## Failure propagation rule

A downstream presentation failure must not roll back an already committed canonical turn. A canonical commit failure must not be hidden by successful narration or successful artwork generation.

## Release rule

Every row must have a real producer, a typed/structured boundary, a real consumer, a trigger, a deterministic or bounded fallback where appropriate, and a regression contract. A subsystem that exists without a consumer is not considered implemented.
