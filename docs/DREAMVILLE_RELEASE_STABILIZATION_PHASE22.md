# Dreamville Phase 22 — Release Stabilization & Integration Closure

Phase 22 is the final stabilization layer for the Phase 16–21 implementation stack.

## Purpose

This phase does not create another competing narrative architecture. It closes integration gaps discovered by the release gate and verifies that the Phase 16–21 producer→consumer graph remains intact under partial, stale, malformed, unavailable, and fallback conditions.

## Closure rules

1. Canonical state remains authoritative; presentation systems never mutate it.
2. CurrentSituation is the shared read model for narrative, research, suggestions, and visual context.
3. Explicit player intent outranks incidental textual relevance when selecting scene entities.
4. Player-authorized knowledge may re-enter context; unauthorized world truth must remain filtered.
5. Optional/partial context must fail safely rather than throw.
6. Media failure returns a typed presentation fallback and never blocks canonical gameplay.
7. Release evidence must distinguish local validation from GitHub CI validation.

## Producer → consumer closure

| Producer | Contract | Consumer | Failure floor |
|---|---|---|---|
| WorldRepository seed | canonical geography/entities/rumor/thread | CurrentSituation | deterministic seeded scene |
| EntitySceneRelevanceEngine | bounded relevance scores | VisualSceneContext / action advice | visible same-location projection |
| WorldRepository knowledge | authorized fact projection | WorkingContext / NarrativeResearch | empty authorized set |
| NarrativePromptBuilder | player-safe prompt contract | narrative provider | deterministic emergency narration |
| MediaAdapterService | presentation result | scene route / StoryView | prompt/placeholder fallback |
| Release verifier | source contracts | release gate | fail-fast |

## Required verification

- npm run verify:contracts
- npm run lint
- npm test
- npm run build

The stacked release branch may execute these through GitHub Actions. If a command has not been run locally, the report must say so explicitly.

## Exit criteria

Phase 22 is complete only when:
- Phase 16 visual freshness and source-action identity remain enforced.
- Phase 17 integration matrix still traces real producers and consumers.
- Phase 18 harness covers primary, fallback, emergency, malformed, empty, partial, and canonical-commit-failure paths.
- Phase 19 verification discipline remains fail-fast.
- Phase 20 orphan audit contains no known release-critical orphan.
- Phase 21 release gate is wired to contracts → lint → test → build.
- Phase 22 stabilization tests pass and no new orphaned authority is introduced.