# World Director Phase 7 — Player-Run Live Acceptance Checklist

**Status:** PREPARED — NOT RUN  
**Owner:** Player, with engineering follow-up  
**Purpose:** verify the actual Story UI and configured live provider against the World Director opening/observation/revisit contracts. Automated CI is not a substitute for this session.

## Safety and setup

- [ ] Use a **disposable test story** in the actual Story UI, with the intended World Director investigation seed prepared through the supported product flow.
- [ ] Do not use `default_story` for this acceptance run.
- [ ] Do not import edited archives, inject inventory/entities, hand-edit canonical partitions, or run the removed legacy harnesses (`live_client.ts`, `test_script.ts`).
- [ ] If the UI cannot create/select a disposable investigation story or the expected scene is not prepared, stop and record **BLOCKED**. Do not invent missing incident, victim, body, or evidence records by hand.
- [ ] Confirm the app is running the intended branch/build. Record commit SHA/build identifier if visible.
- [ ] Record provider and exact model identifier as displayed/configured. Never include API keys, tokens, passwords, or private credentials in evidence.
- [ ] Capture a timestamp and a non-sensitive session/story identifier. Redact private details from screenshots/transcripts.

## A. Opening scene — primary route

1. Start the prepared disposable story using the normal Story UI and wait for loading to finish.
2. Save the exact opening prose as displayed (copy text or screenshot).
3. Inspect the scene context using the normal supported UI/debug/context-inspection facility, if available. Record visible canonical scene anchors, visible occupants, environment/occupancy state, and the active incident/victim/body/evidence references that the UI legitimately exposes.
4. Verify that the opening describes only supported, player-visible facts. In particular:
   - [ ] The scene has concrete, canonical anchors rather than generic scenery alone.
   - [ ] It does not assert an empty/abandoned location when occupancy is unknown.
   - [ ] It does not disclose a hidden clue before its discovery conditions are met.
   - [ ] It does not reveal an unknown diagnosis, culprit, motive, or other unrevealed investigation truth.
   - [ ] It does not give the player an NPC's name/identity before the character is introduced or otherwise known to the player.
   - [ ] Occupants and ambient activity are consistent with the established location, occupancy, and time.

**Record:** opening transcript/screenshot reference, visible context facts, provider/model, load errors, and whether the opening appeared to use the primary or fallback route (only if the UI exposes this).

## B. First observation — victim

Enter this exact player action:

> I observe the victim.

- [ ] The response addresses the victim, rather than returning unrelated scenery.
- [ ] It reports only observable physical details and facts established by the current scene.
- [ ] It does not invent a cause of death, diagnosis, identity, culprit, or forensic result not established by canon.
- [ ] It preserves hidden/discoverable evidence boundaries.
- [ ] The turn completes normally: no indefinite spinner, duplicate turn, blank response, or uncaught error.

Save the exact displayed response and any relevant context snapshot.

## C. Second observation — environment

Enter this exact player action:

> I observe the environment.

- [ ] The response is about the current environment and its relevant visible objects/features.
- [ ] It is consistent with the opening and the victim-observation turn.
- [ ] It does not invent a layout, pipe, person, branch, object, or other scene feature unsupported by canonical context.
- [ ] It does not claim that something is absent merely because it was not projected or mentioned.
- [ ] Hidden clues remain undisclosed unless the established discovery rules allow them.
- [ ] The turn completes normally and retains the correct story/scene context.

Save the exact displayed response and any relevant context snapshot.

## D. Optional clue interaction — only if the scene supplies a valid clue

Do not invent a clue or manually add one for this test.

- [ ] If a canonical clue is visible, examine it through the normal UI and record the result.
- [ ] If a clue is discoverable but hidden, first verify that it is not disclosed by ordinary observation; then use the supported search/examine action that satisfies its discovery conditions.
- [ ] If no suitable clue exists or the UI has no supported interaction, mark this subsection **N/A** with the reason.
- [ ] If discovered, verify the clue becomes known through the normal game flow and remains known after reload.

## E. Reload and revisit

1. Use the normal save/return/reload/reopen workflow. Do not edit save files directly.
2. Reopen the same disposable story and revisit the same location.
3. Record the reloaded opening/current scene and repeat one relevant observation if needed.

- [ ] Canonical scene state and prior legitimate discovery persist.
- [ ] Reload/revisit does not create duplicate incidents, victims, bodies, clues, objects, or occupants.
- [ ] Previously hidden information does not become known solely because of reload.
- [ ] The scene does not revert to a contradictory initial state.
- [ ] The player remains at the canonical location; travel/arrival is not falsely claimed.
- [ ] No dummy inventory, goblin target, injected archive, or other test harness artefact appears.

Save before/after transcript or screenshots and note any changed facts.

## F. Fallback route — if available through supported configuration

Do not deliberately corrupt credentials or edit provider secrets to force failure. If the application exposes a safe provider-selection or fallback-testing control:

- [ ] Repeat the opening/observation checks using the documented fallback route.
- [ ] Record the actual provider/model/route reported by the application, or mark it unknown if not exposed.
- [ ] Verify fallback prose retains the same required canonical facts and hidden-information boundaries. Different prose style is acceptable; changed facts are not.

If no safe, supported way to select or observe fallback exists, mark this subsection **N/A — no supported control exposed**. Do not claim fallback was tested.

## G. Optional multi-effect action — only when a valid canonical encounter exists

Do not create combat state, add a target, inject an item/spell, or import an edited archive to make this scenario possible. Use only a combat encounter and owned spell/capability already available through the supported story flow.

- [ ] If a valid multi-effect action is available, perform one action whose canonical result visibly includes more than one consequence (for example damage plus an applied condition, healing plus a condition change, or forced movement plus collision), using only an option the character legitimately owns.
- [ ] Record the exact action, the displayed result, and the target's before/after visible state where the normal UI exposes it.
- [ ] Verify the narration depicts each player-visible consequence without inventing extra outcomes or omitting a distinct visible effect.
- [ ] Verify resource costs and state changes are not applied twice when narration is repaired or retried.
- [ ] If no suitable canonical multi-effect action is already available, mark this scenario **N/A — no legitimate encounter/action available**. Do not manufacture a test setup.

Save the exact displayed response and any safe, player-accessible evidence.

## H. Results and evidence

Complete this summary after the run. Use **PASS**, **FAIL**, **BLOCKED**, or **N/A**; do not mark a scenario PASS from memory if no evidence was captured.

| Field | Record |
|---|---|
| Date/time and timezone | |
| App/build/commit | |
| Story/session identifier (non-sensitive) | |
| Provider and exact model ID | |
| Opening route (primary/fallback/unknown) | |
| Opening scene | |
| “I observe the victim” | |
| “I observe the environment” | |
| Clue interaction | |
| Reload/revisit | |
| Fallback route | |
| UI loading/errors | |
| Evidence references (redacted screenshots/transcript/context) | |
| Overall result | |

### Failure reporting

For each failure, record the exact player action, exact displayed response, expected behaviour, actual behaviour, approximate timestamp, provider/model/route if known, and evidence reference. Redact credentials and private personal information. Do not silently edit the canon or rerun until the first failure evidence is preserved.

A **FAIL** reopens the engineering loop for the affected slice: **AUDIT → IMPLEMENT → TEST → REGRESSION → RE-AUDIT**. Keep the issue open until the fix passes automated regression and the failed live scenario is repeated successfully.

## Acceptance rule

This checklist is a plan, not evidence that the live test occurred. Phase 7 player acceptance remains **PENDING** until the player submits captured results. Automated tests, mock providers, successful builds, and CI alone must never be reported as live-model/UI PASS.
