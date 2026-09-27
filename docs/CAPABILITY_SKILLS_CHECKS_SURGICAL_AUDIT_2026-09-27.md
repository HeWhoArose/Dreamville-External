# DreamBook — Capability / Skills / Checks Surgical Audit

## 2026-09-27

**Scope:** S1 — Capability / Skill / Check integrity
**Master Plan:** complete/frozen
**Status:** VERIFIED — runtime tested

## Implemented

- Central `storySkillCheckRegistry.ts` now derives the 18 standard skill identities/abilities from the shared D&D skill catalog and owns the server-side trigger/DC metadata.
- `StoryCheckEngine` no longer owns a duplicate hard-coded 18-skill definition table.
- Actor skill proficiency lookup accepts both canonical skill IDs and display names.
- `StoryCheckAuthority` is the canonical read-only boundary for story-check resolution.
- `ServerMockAuthority` is the authoritative action-processing caller of `StoryCheckAuthority`.
- `StoryCheckAuthority` rejects non-active player actor IDs and reads actor state from `WorldRepository`.
- `StoryCheckAuthority` does not call AI, narration, persistence writers, or UI code.
- Player capability APIs continue to use the existing player-safe projection boundary.
- Existing learned-vs-equipment capability separation remains intact.

## 10-pass audit

Passes 1–10 covered:

1. shared catalog ownership;
2. 18-skill completeness;
3. engine-to-registry connection;
4. ID/name resolution;
5. active-actor authorization;
6. canonical actor/run reads;
7. authoritative action call graph;
8. player capability projection boundary;
9. frontend catalog coverage;
10. regression-test coverage.

All ten source-contract passes were green.

A post-regression audit pass 11 was also green after the runtime failure discovered the Animal Handling trigger wording gap.

## Regression discovered during runtime gate

The first full repository test run after implementation reported:

- 995 tests
- 994 passed
- 1 failed

Failure:

`each standard skill resolves through the central registry across ten audit passes`

Root cause:

The test action `I calm the frightened horse.` did not match the Animal Handling trigger `calm the horse`.

Fix:

Added explicit Animal Handling trigger variants including `calm the frightened horse`, `calm a horse`, and related canonical handling phrases.

## Final runtime gate

GitHub Actions run `36339298118` on commit `8c050e0ba729e5490e83243dd45c22a3216685fb` completed successfully.

Results:

- TypeScript lint/typecheck: PASS
- npm test: PASS
- Tests: **995**
- Passed: **995**
- Failed: **0**
- Production build: PASS

Both configured Dreamville verification workflows completed successfully for the same commit.

## Completion rule

S1 is considered verified at runtime. Future capability work must continue to use the ownership and authority boundaries established here and must not reintroduce a second skill/check registry or a direct route-level check authority.