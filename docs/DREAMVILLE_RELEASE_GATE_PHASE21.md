# Dreamville Full Regression and Release Gate — Phase 21

Phase 21 remains the automated release gate for the Phase 16–22 release stack; Phase 22 adds stabilization invariants on top of it.

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

## Verified status at the 2026-10-16 integration candidate

The integration candidate is PR #76, branch `integration/narrative-grounding-runtime-2026-10-16-v2`. At the evidence snapshot documented in `docs/DREAMVILLE_LIVE_PROVIDER_125_TURN_AUDIT.md`, the following GitHub Actions checks passed:

- PR #76 candidate `bd32e2f7f9ccc205ca8d88f67fd4906e5e2a23b3`: both verification workflows passed; the 125-turn deterministic/mock HTTP integration test and Phase 24 system-wide architecture audit were among the passing tests.
- Integration branch follow-up commit `e05f60d7dcde2f12ccac4f77dc23b69144ed82e2`: the release gate passed all steps — release-contract verification, type-check, full test suite (1,500/1,500), and production build.

Evidence: [release gate for e05f60d](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38885769653), [verification for bd32e2f (1)](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38862436764), and [verification for bd32e2f (2)](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38862436773).

These results supersede earlier notes that the integrated automated suite was red. PR #76 remains unmerged, and the listed manual scenarios still need execution on the integration target. The 125-turn live-provider acceptance run is deliberately deferred to the player after the code integrations are complete, because repeatedly calling real Gemini models in CI can consume provider token/quota limits. It is a documented final acceptance test, not a CI gate. See `docs/DREAMVILLE_LIVE_PROVIDER_125_TURN_AUDIT.md` for the historical telemetry and player-run checklist.

The standard automated test and release-gate runs do not execute `scripts/run_125_turn_stress_test.ts`. That standalone provider stress script calls the orchestrator directly, so it is not a substitute for the required application-level live-provider run.
