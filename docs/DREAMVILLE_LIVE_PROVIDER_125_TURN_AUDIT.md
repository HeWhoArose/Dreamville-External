# Live-Provider 125-Turn Audit — Current Evidence and Exit Criteria

**Audit date:** 2026-10-16  
**Integration candidate:** `bd32e2f7f9ccc205ca8d88f67fd4906e5e2a23b3` (PR #76; open, not merged)

## Current verdict

The integration candidate's automated checks are green, but a fresh 125-turn run with real provider calls has **not** been verified on this candidate. Do not describe the release as fully live-validated.

At the recorded integration head, GitHub Actions completed:
- `npm test`: 1,500 tests passed, 0 failed.
- Release-contract verification: passed.
- Type-check: passed.
- Production build: passed.

The release gate and both verification workflows succeeded. These results establish automated repository correctness at that commit; they do not establish provider availability, live-model quality, or hands-on UI behavior.

## Two different 125-turn checks — do not conflate them

### 1. Automated HTTP integration test (mock providers)

`tests/marathon-125-turn.integration.test.ts` exercises one persistent world through an Express `POST /api/game/action` pipeline and covers 125 numbered turns across six segments. It includes continuity, travel, a secret-leak probe, injected degradation, persistence checkpoints, and idempotency checks.

The test explicitly labels itself **controlled deterministic/mock integration**: external AI credentials are not available to that automated test, and literary quality from a real model is not claimed. It passed in the PR #76 verification run.

### 2. Provider stress script (live intent, not a current result)

`scripts/run_125_turn_stress_test.ts` is a separate script labelled as a live Gemini integration test. It currently calls `MultiModelOrchestrator.executeTurn()` directly; it does not exercise the HTTP action route used by the end-to-end test. The script is not registered in the current `package.json` scripts, so the standard `npm test` and release-gate runs do not execute it.

The checked-in `tests/artifacts/125_turn_live_telemetry.json` is historical evidence, last changed in commit `2391b05412ddaeacaef66cc4e4de22cd3b15c678` on 2026-10-05. Its 125 records contain:
- 123 records attributed to `provider_deterministic_emergency::emergency-fallback-local`;
- 2 records attributed to `google_gemini::gemini-3.5-flash-lite`;
- 119 records marked `VALIDATED` and 6 marked `UNVALIDATED`;
- 6 records with empty narration text.

That artifact is a **historical warning, not a fresh measurement of the current integration candidate**. The high emergency-fallback rate is not enough to assign a single root cause because the artifact is stale and does not provide a complete, current per-candidate trace. Do not silently treat it as proof that the current routing change failed, but do not discard it either.

## Remaining release-critical work

Run a fresh, provider-enabled 125-turn audit against the chosen integration commit, with credentials supplied through the execution environment (never committed to the repository). The live audit should use the application-level action pipeline, not only the direct orchestrator method.

Record the exact commit SHA, timestamp, story/session identifier, action/turn number, HTTP result, selected provider/model, every attempted or preflight-skipped candidate with a reason, validation outcome, latency, AI call count, and whether emergency fallback was used.

Review the results for:

1. All 125 actions are accounted for and tied to one continuous story/session.
2. No successful response is marked validated while its narration is missing or blank.
3. Candidate ordering and every skipped/failing provider are observable; do not collapse missing adapters, preflight rejection, timeouts, quota/rate-limit errors, and semantic validation rejection into one generic fallback reason.
4. Canonical location/time, inventory, entities, knowledge boundaries, NPC presence, and persistence/idempotency invariants survive the long run.
5. The server-held secret does not reach player-visible output.
6. Fallback use is summarized by reason and reviewed against the intended policy. Planned outage-injection turns must be distinguished from unexpected provider failures.
7. Manual UI retry, malformed output, and all-provider outage scenarios are exercised on the integration target.

A mocked 125-turn pass is necessary regression evidence, but it is not a substitute for this provider-enabled run. Until that run and the required manual scenarios are recorded, keep the live-provider/release-validation item marked **pending**.

## Evidence links

- Integration PR: https://github.com/HeWhoArose/Dreamville-External/pull/76
- Passing verification run: https://github.com/HeWhoArose/Dreamville-External/actions/runs/38862436764
- Passing second verification run: https://github.com/HeWhoArose/Dreamville-External/actions/runs/38862436773
- Passing release gate: https://github.com/HeWhoArose/Dreamville-External/actions/runs/38862436816
- Historical telemetry: https://github.com/HeWhoArose/Dreamville-External/blob/bd32e2f7f9ccc205ca8d88f67fd4906e5e2a23b3/tests/artifacts/125_turn_live_telemetry.json
- Mocked 125-turn integration test: https://github.com/HeWhoArose/Dreamville-External/blob/bd32e2f7f9ccc205ca8d88f67fd4906e5e2a23b3/tests/marathon-125-turn.integration.test.ts
- Separate provider stress script: https://github.com/HeWhoArose/Dreamville-External/blob/bd32e2f7f9ccc205ca8d88f67fd4906e5e2a23b3/scripts/run_125_turn_stress_test.ts
