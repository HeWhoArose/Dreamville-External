# Dreamville Final Orphan and Connection Audit — Phase 20

Audit target: the Phase 11–15 integrated branch plus the Phase 16–22 additions and stabilization closure on this release branch.

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

At source-audit level, no release-critical subsystem introduced by Phases 11–16 is currently orphaned: each has a documented consumer and at least one regression or contract test. The Phase 17–22 closure layers were then checked against the same producer → contract → consumer rule, with no known release-critical orphan remaining.

This source-level audit is not a substitute for runtime verification. The original branch-specific gate notes below are historical snapshots, not current status.

## Historical release risks — prior stacked branch snapshot

At the time of the earlier audit run, the release candidate was stacked on separate Phase 11–15 implementation work and the full test gate was red. Those findings explain the original investigation but have been superseded by later integration validation.

## Current integration update (2026-10-16)

The latest verified PR #76 integration commit is `91fe1545b27d9d19d1b900f5050a3135f6342802`. GitHub Actions passed on this exact commit:

- release-contract verification: passed;
- lint and TypeScript check: passed;
- `npm test`: **1,517/1,517 passed**;
- production build: passed;
- both verification workflows: passed.

Evidence: [release gate](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38941727238), [verification 1](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38941727068), [verification 2](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38941727299).

The session-recorder continuity gap is now represented as explicit AUXILIARY state-transition patches when the captured state changes between recorder boundaries. Hashes remain over the full snapshot, including `runtimeState`, and regression tests prove that runtime-state patch tampering fails validation. At this exact head, no state-before mismatch warnings remain for `default_story`, `run_legacy`, or the marathon; the only mismatch log is the expected negative test with an invalid state shape.

The live-provider 125-turn play session is deliberately deferred to the player after code integration because repeated automated calls can consume provider token/quota limits. The deterministic/mock 125-turn HTTP integration remains automated regression coverage. The player-run session and manual UI scenarios are acceptance checks, not CI gate steps.

PR #76 remains open and unmerged. A green automated gate is evidence for this exact candidate, not a claim that the final merged-main gate or player acceptance session has happened.
