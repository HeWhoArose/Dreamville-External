# Dreamville Full Regression and Release Gate — Phase 21

Phase 21 is the final release gate for the Phase 16–21 stack.

## Automated gate

The repository now exposes:

- `npm run verify:contracts`
- `npm run lint`
- `npm test`
- `npm run build`

A GitHub Actions workflow runs those four commands on pushes and pull requests targeting `main` or phase branches.

## Required manual scenarios

The release candidate must also exercise:

### Narrative
- `I move closer to hear the rumors.`
- `I ask Maren what happened.`
- movement to a known location
- inspection of a known object
- combat attempt
- item interaction
- successful check
- failed check

### Knowledge and relevance
- unknown NPC
- unknown location
- hidden/unauthorized fact
- off-location entity
- stale opening text after a committed turn
- stale active dialogue after a non-dialogue turn

### Failure and fallback
- primary model available
- primary model unavailable with fallback
- all providers unavailable with deterministic emergency floor
- malformed model JSON
- empty narration
- semantic mismatch requiring rewrite
- state adjudication rejection
- media provider failure/placeholder fallback
- speech transcription malformed/timeout/provider-unavailable
- UI retry of only a failed CUSTOM_ACTION

### Visual freshness
1. Generate scene artwork for turn N.
2. Commit turn N+1.
3. Verify old artwork is invalidated in StoryView.
4. Generate new scene.
5. Verify the returned `sourceActionId` equals turn N+1.
6. Verify opening-scene prose is not used after a committed turn.

## Release decision rule

The release is not considered green unless:

1. The automated GitHub release-gate job passes.
2. `npm run lint` passes.
3. `npm test` passes.
4. `npm run build` passes.
5. Manual scenario coverage above is exercised on the integration target.
6. The Phase 20 orphan/connection audit has no unresolved release-critical entry.

## Environment status for this implementation session

The working environment could not access the repository over the network, so the npm commands were not executed locally. GitHub Actions has nevertheless executed the release gate on this branch: contract verification and TypeScript have passed, while the full test suite is still red on remaining earlier-phase/integration regressions. Therefore Phase 21 is implemented but the release candidate is not yet green. The final main-branch gate remains the authoritative release verification.
