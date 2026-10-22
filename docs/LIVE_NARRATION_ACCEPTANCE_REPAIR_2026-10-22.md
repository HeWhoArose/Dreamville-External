# Live Narration Acceptance Repair — 2026-10-22

## Status

Working branch: `fix/live-narration-acceptance`  
Baseline: `main` at `0cc4676242a7f5c8230eb961d1d6817d082e7489`

This repair addresses the concrete live Story failure report for Aelion Vane at Threshold of the Radiance, Cycle 42, 17:42, Afternoon. It is intentionally separate from `main`; no merge is implied by this document.

## Reproduced source-level causes

1. **Opening sensory labels and temporal mismatch.** The deterministic opening path previously concatenated `ambientSensory` directly into the first paragraph. Values formatted as `Visual:`, `Sounds:`, `Scent:`, and `Tactile:` could therefore appear as raw fields, including a time-of-day claim that contradicted the canonical clock.
2. **Internal occupancy explanation.** When no visible entity passed the visibility filter, the fallback emitted an implementation-facing description of the canonical scene projection instead of player-facing prose.
3. **Context compression weakened rules.** The ordinary narration prompt contained a canonical-current-time and evidence constraint, but the compact prompt variants did not retain all the same operational instructions. A lower token budget could therefore make it easier for a provider to generate a temporal contradiction or answer an investigative action with atmosphere only.
4. **Narration failure and action retry are distinct.** The Story transcript reports that the action is committed and narration failed review. The in-card narration Retry calls `POST /api/game/action/narrate/regenerate` with an existing `actionId`; that route generates presentation only. Separately, the bottom-level action Retry resubmits a command after a failed HTTP request. If a server-side commit happened before the response was lost, a fresh command identity could duplicate the action.

## Changes on this branch

- Sanitize deterministic and model-generated opening prose for internal occupancy language, UI labels, and structured sensory labels.
- Apply a canonical-time-aware sanitizer to opening sensory evidence; discard only sentence-level sensory claims that explicitly contradict the opening clock. If no safe ambient detail remains, fall back to the canonical location description and then to a neutral sentence.
- Preserve paragraph breaks during sanitization.
- Keep canonical clock alignment and grounded-information requirements in the full and compact variants of the narration prompt. Observing/investigating must yield grounded evidence or state the limit of what the available evidence can establish; atmosphere alone is not an answer.
- Expand the N18 action-substance response vocabulary to recognize evidence-bounded unknowns such as “no evidence,” “insufficient evidence,” “cannot determine,” and “the source/reason remains unknown.” This does not create facts or weaken semantic/canonical review; it allows an honest non-answer to count as a resolved information result.
- Reuse the original `commandId` / `idempotencyKey` for the bottom-level retry of a failed custom-action HTTP request. The canonical command engine already has duplicate-command protection.
- Add regression tests for the opening leak/time contradiction, compact prompt requirements, evidence-bounded observation, idempotent action retry, and the presentation-only narration regeneration route.

## What this does not claim

- Provider-backed success is not established by mocked/unit tests. The reported Gemini timeout and expired InclusionAI key are external runtime/configuration failures and still need to be checked in the deployed environment.
- The narrative retry route is source-audited as presentation-only, but the exact mobile UI interaction from the supplied transcript has not been replayed against a live session here.
- The prose “moves deeper toward the signal” does not itself prove a canonical location transition. The current prompt contract requires the player to remain at the canonical location unless the authoritative game state commits movement. A final movement-specific live acceptance check remains necessary.
- **CI status (verified 2026-10-22):** GitHub Actions run [39830114925](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39830114925) passed `npm install --no-audit --no-fund`, `npm run lint`, `npm test`, and `npm run build` for commit `04333efe2e64fde5dfd0fe88386ca46c4a036bef`. It did not include the release-contract check. The branch workflow was then updated to include `npm run verify:contracts`; the expanded run [39840939827](https://github.com/HeWhoArose/Dreamville-External/actions/runs/39840939827) was in progress when this note was updated. Live provider-backed Story UI and mobile retry acceptance remain unverified.

## Acceptance checklist

- [ ] Opening output contains no raw sensory labels or internal projection/occupancy language.
- [ ] Opening output at 17:42 Afternoon contains no first-light/dawn/morning claim unless canonical time changes first.
- [ ] A perimeter observation produces a grounded explanation or an explicit evidence-bounded limitation.
- [ ] Retry of a narration error changes only presentation and does not create a second action, advance time, duplicate inventory, or alter canonical state.
- [ ] Retry after an uncertain HTTP outcome reuses the same command identity and the canonical action is applied once.
- [ ] Provider errors remain visible and correctly classified; no fake narration is returned as if an AI model generated it.
- [x] CI TypeScript/lint check, full `npm test`, and production build passed for commit `04333efe2e64fde5dfd0fe88386ca46c4a036bef` (Actions run 39830114925).
- [ ] Confirm expanded CI run 39840939827 completes successfully, including `npm run verify:contracts`.
- [ ] Replay the same actions through the deployed Story UI with a healthy provider configuration and inspect the persisted world state.
