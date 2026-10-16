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

The latest verified integration candidate is PR #76 at `91fe1545b27d9d19d1b900f5050a3135f6342802`. All three exact-head GitHub Actions checks passed:

- `npm run verify:contracts`: passed.
- `npm run lint` / TypeScript check: passed.
- `npm test`: **1,517/1,517 passed**.
- `npm run build`: passed.
- Both verification workflows: passed.

Evidence: [release gate](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38941727238), [verification 1](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38941727068), [verification 2](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38941727299).

The 125-turn live-provider play session is deliberately deferred to the player after code integrations are complete because repeated automated calls can consume provider token/quota limits. It is a documented final player acceptance test, not a routine CI gate. The deterministic/mock HTTP marathon remains part of automated regression coverage. Manual UI/model scenarios also remain post-integration acceptance work.

The forensic recorder now preserves between-command state changes in explicit `AUXILIARY` interactions. It keeps full-snapshot hashes—including `runtimeState`—and has regression coverage for both boundary gaps and state-patch tampering. The final CI runs show no real `default_story` or marathon state-before mismatch; the remaining warning is deliberately produced by the invalid-state negative test.

PR #76 remains open and unmerged. The final merged-main gate must still be run after integration. See `docs/DREAMVILLE_LIVE_PROVIDER_125_TURN_AUDIT.md` for the player checklist and historical telemetry context.
