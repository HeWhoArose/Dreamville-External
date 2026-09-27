# Story Runtime & Player Interaction — Surgical Audit
**Date:** 2026-09-27  
**Owner:** Story Runtime & Player Interaction Spec  
**Status:** VERIFIED — RUNTIME TESTED (with browser-only 3D visual inspection remaining)

## Scope

This audit covers S2 only. The Master Plan remains unchanged and frozen. Existing canonical systems remain owners of persistence, action execution, capability checks, AI context, and multi-world state.

## Findings and repairs

### 1. Dice presentation

The existing 3D dice renderer was retained rather than replaced. It already uses `@3d-dice/dice-box-threejs` and deterministic authoritative die values.

Surgical defect found:
- When `diceTerms` were absent, mixed formulas such as `1d20+2d6+1d4` were collapsed into a single D20 visual group.
- This could make the presentation disagree with the authoritative roll structure even though the server result was correct.

Repair:
- Formula parsing now produces one visual group per dice term.
- Authoritative `individualDice` values remain bound to their exact group and die count.
- `expandDiceTerms` and `expandDiceGroups` are exported for direct audit coverage.
- Supported die families remain D4, D6, D8, D10, D12, D20 and D100.

### 2. Story / OOC / Continue

The existing player interaction surface was preserved:
- Story input remains the canonical freeform story action path.
- OOC requests continue through `/action/ooc` and the registered OOC tool architecture.
- Continue remains a player-facing action that enters the same canonical story action boundary rather than mutating state directly.

No regex/keyword OOC mutation path was reintroduced.

### 3. Player portrait

The Story View already consumes the active protagonist portrait projected by canonical view state and renders it beside the player's speech, with the existing portrait emoji fallback.

No second portrait authority was introduced.

### 4. Resume Run

The dashboard and Story Library continue to resolve and resume by the exact persisted `runId`/`storyId`.

The legacy `default_story` bootstrap state is not fabricated into the user library.

### 5. Destructive deletion

The server already required:
- explicit `confirm: true`
- exact title confirmation

The UX was strengthened so Story Run and World deletion use an exact-title prompt instead of a generic yes/no confirmation.

An existing client defect was also repaired:
- World deletion previously inspected stale `storyLibraryStories` state immediately after asynchronous deletion.
- The fallback now uses the freshly fetched remaining Story Runs, so it cannot accidentally select a run belonging to the deleted world.

## Boundary verification

No new authority was introduced.

The dependency direction remains:

```text
Story UI
  ↓
App action / route orchestration
  ↓
canonical story action APIs
  ↓
existing authoritative engines/repository
```

OOC remains:

```text
Story View OOC
  ↓
/action/ooc
  ↓
Working Context + AI Orchestrator
  ↓
registered OOC tool registry (when a mutation is requested)
  ↓
canonical command/state authority
```

Dice remains presentation-only. The authoritative roll is created by the server; the 3D renderer presents that result.

## Audit tests added

`tests/story-runtime-player-interaction.audit-loop.test.ts`

It performs 11 deterministic audit passes covering:
- mixed dice group preservation
- authoritative die values
- supported physical die mappings
- Story/OOC/Continue connections
- player portrait connection
- exact Story Run resume source
- exact-title deletion wiring
- server confirmation enforcement

`tests/ch16_live_ui_workflow.test.ts`

The live API workflow now additionally verifies:
- incorrect Story Run deletion title is rejected
- correct Story Run title deletes only the requested run
- incorrect World deletion title is rejected
- correct World title deletion removes the world and its attached runs
- deleted run/world endpoints return 404

## Verification result

Latest GitHub Actions verification for commit `6176b9c2dd26ca79999dd24825f5419b90fa65f2`:

- `npm run lint` — PASS
- `npm test` — PASS
- `npm run build` — PASS
- both repository verification workflows — PASS

The automated suite verifies the canonical contracts and API flows. The remaining non-automated check is visual inspection of the actual browser/WebGL 3D dice animation on a real client; this is not claimed as automated by the CI suite.

## Non-regression decision

No duplicate:
- persistence engine
- Story Run repository
- dice authority
- OOC mutation engine
- AI router
- narration context engine
- capability registry
- check engine

was created.

S2 is therefore complete at the code/API contract level and ready for the next surgical phase.
