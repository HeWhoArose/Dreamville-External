# Dreamville Verification Discipline — Phase 19

This document turns the implementation discipline into a repeatable engineering gate.

## Required edit loop

Every phase or fix follows this order:

1. Audit the current implementation and contracts.
2. Identify the authoritative producer and intended consumer.
3. Make the smallest coherent implementation slice that connects both.
4. Re-read every changed file and inspect imports, exports, generics, conditionals, templates, and serialization boundaries.
5. Add or update focused regression tests.
6. Re-audit producer → consumer and consumer → producer connections.
7. Exercise success, fallback, emergency, malformed, unavailable, empty, and partial-data paths where the subsystem permits them.
8. Run repository verification:
   - `npm run verify:contracts`
   - `npm run lint`
   - `npm test`
   - `npm run build`
9. Review generated diff and commit the coherent slice.
10. Only then move to the next phase.

## Architecture invariants

### Canonical truth

AI narration, research, plans, visual prompts, audio, and UI presentation are not canonical world state.

Canonical state changes must be authorized by the relevant deterministic game-system boundary and staged/committed through the canonical adjudication path.

### Context

Narrative consumers must use the same CurrentSituation / semantic intent projection rather than reconstructing competing versions of the scene from stale opening text, unrelated history, or private world facts.

### Player intent

Semantic interpretation must preserve explicit speech, movement, observation, manipulation, combat, and information-seeking distinctions. An AI interpretation may refine low-confidence semantics but may not invent unsupported speech, movement, targets, locations, or facts.

### Visual presentation

The visual pipeline is:

`CurrentSituation + latest committed ActionLog → VisualSceneContext → comic prompt → MediaAdapterService → StoryView`

A new turn invalidates previously generated scene artwork in the UI. A failed canonical action must not be depicted as a success.

### Failure containment

Provider failure must not block deterministic gameplay.

Presentation failure must not roll back canonical state.

Canonical commit failure must not be hidden by successful narration or successful media generation.

## Verification categories

| Category | Required evidence |
|---|---|
| Source contract | Producer and consumer symbols exist and are connected |
| Type contract | Shared interfaces/types cross the boundary |
| Runtime contract | Trigger calls the intended consumer |
| Fallback contract | Deterministic or bounded fallback is defined |
| Negative contract | Malformed/unavailable/empty data cannot silently create invalid state |
| Regression contract | A focused test asserts the connection |
| Release contract | Full lint/test/build are run on the release target |

## Environment limitation

If the repository cannot be executed in the working environment, do not claim `npm run lint`, `npm test`, or `npm run build` passed. Source-level audits and tests may still be authored, but the final release gate remains pending until those commands execute successfully on the target branch.

## Phase 19 exit condition

A phase is not considered complete because its source files exist. It is complete only when its contract is connected, regression-covered, audited after implementation, and included in the release verification path.
