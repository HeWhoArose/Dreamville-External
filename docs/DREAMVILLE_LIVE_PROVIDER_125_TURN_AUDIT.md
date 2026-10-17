# Player-Run 125-Turn Acceptance Test — Evidence and Checklist

**Audit date:** 2026-10-17  
**Latest verified code-bearing integration commit:** `84dcec5fe1fd5eec71ac7acf9824fb2401a82885` (PR #76; open, not merged)

## Current verdict

The latest code-bearing integration commit `84dcec5fe1fd5eec71ac7acf9824fb2401a82885` has green exact-head automated checks, but a fresh 125-turn run with real provider calls has **not** been verified on this candidate. Do not describe the release as fully live-validated.

At this verified integration head, GitHub Actions completed:
- `npm test`: **1,524 tests passed, 0 failed** across 117 suites.
- Release-contract verification: passed.
- Type-check: passed.
- Lint: passed.
- Production build: passed.

Exact-head CI evidence:
- [Release gate](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39010818963)
- [Verification workflow 1](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39010818965)
- [Verification workflow 2](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39010818981)

These results establish automated repository correctness at this commit; they do not establish real-provider availability, live-model quality, or hands-on UI behavior. The real-provider 125-turn run is intentionally deferred until code integrations have finished, then must be performed as a player-run acceptance check.

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

## Player-run acceptance after integration

**Do not run the 125-turn live-provider test as part of routine CI.** The user has explicitly deferred this test until the integrations are complete so Gemini/provider token and quota limits are not consumed by repeated automated runs. The deterministic/mock 125-turn HTTP integration remains part of automated regression coverage.

After the integration candidate has landed and the remaining manual scenarios are ready, the player should run one continuous 125-turn play session in the actual DreamVille UI using their normal configured provider. Record the candidate/release version and provider/model used, and export or retain available session diagnostics. The play session should be treated as a final acceptance test, not as an automated GitHub Actions gate.

### Player acceptance checklist

1. **Turn and session continuity:** finish the 125-turn play session without restarting the story; check that action history and narrative continuity stay attached to the same run.
2. **Narration substance:** use a mixture of movement, inspection, dialogue, information gathering, combat, item interaction, success/failure outcomes, and quiet/empty scenes. Verify each turn responds to the actual action, not just generic atmosphere.
3. **Movement and scene continuity:** move toward known destinations; verify the intended destination is retained while travelling and that a new location is not described as reached before canonical arrival.
4. **Canonical and knowledge boundaries:** check inventory and locations before/after actions; investigate an unknown NPC/location and a hidden or unauthorized fact; verify the narrator does not invent the answer or leak server-held secrets.
5. **Population and NPC continuity:** check that public/populated places have grounded residents when appropriate, restricted locations are not populated without canonical evidence, and NPC activities/knowledge remain consistent.
6. **Persistence:** reload the story at suitable checkpoints and confirm the player location, inventory, action history, NPC presence, and narrative context are consistent.
7. **Provider degradation:** if the configured provider actually fails during normal play, verify alternate routing and the visible retry/error path. Do not deliberately inject repeated outages or trigger extra model calls just to populate a test log.
8. **Report defects with evidence:** capture the turn/action number, player action, visible result, selected model/provider if displayed, error/diagnostic message, and whether a reload changed the result. Never include API keys or secrets.

A partial or interrupted session should be reported as partial, not counted as a completed 125-turn pass. A green mocked marathon proves the deterministic integration path; the player's session adds the real-provider and real-UI evidence that CI cannot safely guarantee.

## Evidence links

- Integration PR: https://github.com/HeWhoArose/Dreamville-External/pull/76
- Passing verification run: https://github.com/HeWhoArose/Dreamville-External/actions/runs/38967229050
- Passing second verification run: https://github.com/HeWhoArose/Dreamville-External/actions/runs/38967229076
- Passing release gate: https://github.com/HeWhoArose/Dreamville-External/actions/runs/38967229176
- Historical telemetry: https://github.com/HeWhoArose/Dreamville-External/blob/bd32e2f7f9ccc205ca8d88f67fd4906e5e2a23b3/tests/artifacts/125_turn_live_telemetry.json
- Mocked 125-turn integration test: https://github.com/HeWhoArose/Dreamville-External/blob/bd32e2f7f9ccc205ca8d88f67fd4906e5e2a23b3/tests/marathon-125-turn.integration.test.ts
- Separate provider stress script: https://github.com/HeWhoArose/Dreamville-External/blob/bd32e2f7f9ccc205ca8d88f67fd4906e5e2a23b3/scripts/run_125_turn_stress_test.ts
