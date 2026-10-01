# Dreamville Final Orphan and Connection Audit — Phase 20

Audit target: the Phase 11–15 integrated branch plus the Phase 16–20 additions on this release branch.

## Audit method

Each release-critical subsystem was traced in both directions:

`producer → contract → consumer`

and

`consumer trigger → producer`

The audit checked source references, API routes, StoryView consumers, persistence boundaries, and focused regression contracts.

## Findings

| Subsystem | Producer | Consumer | Connected | Fallback | Orphan status |
|---|---|---|---|---|---|
| CurrentSituation | CurrentSituationBuilder | WorkingContext, research, director, advisor, visual context | Yes | bounded canonical projection | Not orphaned |
| PlayerIntent | PlayerIntentInterpreter | CurrentSituation, research, WorkingContext, narration | Yes | deterministic interpretation | Not orphaned |
| Narrative Research | NarrativeResearchPipeline | NarrativeDirector / narration | Yes | empty bounded packet + current situation | Not orphaned |
| Narrative Plan | NarrativeDirector | narration prompt / trace | Yes | deterministic plan construction | Not orphaned |
| Semantic Review | SemanticNarrativeReview | rewrite/reject gate | Yes | deterministic review | Not orphaned |
| State Adjudication | NarrativeStateAdjudicator | canonical commit | Yes | reject unverified proposals | Not orphaned |
| Memory/Threads/Plot | NarrativeMemoryLifecycle + ContinuityEngine | next CurrentSituation / WorkingContext | Yes | no promotion for rejected review | Not orphaned |
| Scene Relevance | EntitySceneRelevanceEngine | action advice / scene context | Yes | bounded current-scene projection | Not orphaned |
| Epistemic Boundary | EpistemicBoundaryEnforcer | research/context/player-safe projection | Yes | unauthorized facts removed | Not orphaned |
| Action Suggestions | StoryActionAdvisor | game routes / StoryView | Yes | deterministic capability-aware floor | Not orphaned |
| AI Call Budget | AiTurnCallBudget | AI orchestrator | Yes | deterministic emergency floor | Not orphaned |
| Speech transcription | sensory route → orchestrator transcription | StoryView/API client | Yes | typed transcription errors | Not orphaned |
| Speech synthesis | sensory route → orchestrator synthesis | audio/sensory path | Yes | text fallback/cache | Not orphaned |
| Dice theme | sensory settings → StoryCheckAuthority → RollRecord | DiceRollAnimation | Yes | default canonical theme | Not orphaned |
| Visual context | CurrentSituation + ActionLog | comic prompt | Yes | stale-context invariant fails closed | Not orphaned |
| Comic prompt | comic prompt compiler | MediaAdapterService / API | Yes | deterministic prompt contract | Not orphaned |
| Media generation | MediaAdapterService | scene API / StoryView | Yes | placeholder/provider fallback | Not orphaned |
| Turn harness | TurnIntegrationHarness | Phase 18 tests | Yes | deterministic mock narration | Not orphaned |
| Release contract | verify-release-contract.mjs | package script / release process | Yes | fail-fast verification | Not orphaned |
| Integration matrix | Phase 17 matrix | Phase 19 verifier / audit | Yes | release gate fails without required text/contracts | Not orphaned |

## Specific stale/duplicate-authority checks

### Visual path

The previous scene route independently reconstructed location, character relevance, active dialogue, and opening context from the external view state. That path has been replaced by:

`CurrentSituationBuilder → VisualSceneContext → buildComicScenePromptFromVisualContext`

The route now applies `assertVisualSceneFreshness` before prompt/image generation.

### Story UI freshness

Generated scene artwork is tagged with `sourceActionId`. When a new committed player action appears, StoryView invalidates the old scene prompt/image instead of leaving stale art presented as the current scene.

### Narrative state boundary

The visual and narration layers cannot authorize canonical mutations. The canonical state adjudicator requires independently verified changes before commit.

### Player knowledge boundary

Research is sanitized through the epistemic boundary before being handed to narrative planning/presentation.

## No known Phase 11–16 orphaned subsystem

At source-audit level, no release-critical subsystem introduced by Phases 11–16 is currently orphaned: each has a documented consumer and at least one regression or contract test.

This is not a substitute for runtime verification. The remaining release risk is execution of the final repository npm gate and manual scenario verification on the integration target.

## Open release risks

1. `npm run lint`, `npm test`, and `npm run build` have not been executed in this environment.
2. External provider behaviour still requires live provider/fallback scenario verification.
3. The release branch remains stacked on the Phase 11–15 draft until the earlier PR is integrated.
