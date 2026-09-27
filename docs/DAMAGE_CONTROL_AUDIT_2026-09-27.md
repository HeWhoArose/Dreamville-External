# DreamBook — 2026-09-27 Damage-Control Audit

**Purpose:** record the accidental duplicate implementation attempt and its disposition.

## 1. Trigger

A previous implementation instruction was started even though portions had already been implemented in another development thread.

The instruction covered dice presentation, OOC, Continue, narration context, portraits, resume, deletion and skills.

## 2. Commit sequence inspected

Relevant recent commits included:
- `5f230ff090` — initial Frank Ali ThreeJS dice-box integration;
- `9e01ca217a` — restored full 3D dice presentation with canonical forced outcomes;
- `77ac5fa9b4` — expanded narration context with character/world/plot continuity;
- `645c18428d` — active NPC target context;
- `a077786cb3` — research/plot/plan/story-thread context;
- `30c9a9d54c` — NPC-specific memory/agency context;
- `fff218b5ac` — direct keyword-based OOC mutations;
- `dd267a05a1` — incomplete OOC tool-registry expansion.

## 3. Damage found

### A. Direct keyword-based OOC mutation — REVERTED

`fff218b5ac` added `tryExecuteOocCanonicalAction()` to `server/api/gameRoutes.ts`.

That implementation recognized natural-language phrases with regular expressions and directly performed actions such as continuing the story, resetting spell slots and creating items.

Although some mutations were routed through CanonicalCommandEngine, the architecture was still wrong for the active design because OOC mutation was embedded as ad-hoc endpoint heuristics rather than a formal registered-tool contract.

**Disposition:** reverted to the parent revision.

### B. Incomplete OOC registry expansion — REVERTED

`dd267a05a1` attempted to add `get_character_sheet` and `create_item` to `oocToolRegistry.ts`, but the patch contained malformed/duplicated object structure and was not suitable as a clean implementation.

**Disposition:** reverted to the pre-change registry.

## 4. Changes retained

### Dice
The repository's current dice path retains the 3D polyhedral renderer work and canonical forced outcomes. This aligns with the capability plan's existing 3D-dice requirement and does not create a second dice authority.

### Narration context
The later context-enrichment commits remain because they extend the existing WorkingContextEngine/NarrativeContinuityEngine rather than creating a second narration engine.

They require a follow-up epistemic audit because WorldTemplate fields such as characters/factions/timeline are projected as 'public world data'. The current source does not, by itself, prove that every such field is always public for every world.

### NPC continuity
NPC-specific target context and continuity retrieval remain on the existing Dynamic Character Agency / NarrativeContinuityEngine path.

## 5. Current source checks

Current `server/api/gameRoutes.ts` no longer contains `tryExecuteOocCanonicalAction` or the accidental `OOC_CREATE_ITEM` endpoint logic.

Current `server/domain/oocToolRegistry.ts` no longer contains the incomplete `get_character_sheet` or `create_item` additions from `dd267a05a1`.

`travel_to_world` remains because it predates the accidental registry expansion and belongs to the existing multi-world architecture.

## 6. What was NOT changed

The Master Implementation Plan was not modified.

Existing canonical authorities were not replaced.

No new persistence, spatial, epistemic, capability or AI authority was created.

## 7. Verification limitation

The GitHub connector does not provide a local npm runtime in this chat, and the repository cannot be cloned into the container because external network access is unavailable there.

Therefore this audit verifies source/commit state but does **not** claim a fresh `npm test`, `npm run lint` or `npm run build` result.

The repository package scripts confirm those commands are the available test/lint/build gates.

## 8. Next verification

Run:

npm test
npm run lint
npm run build

Then perform the targeted Story Runtime, OOC, narration-context, dice, resume/delete and capability regression suites.

## 9. Final disposition

**Accidental OOC implementation:** removed.

**Malformed OOC registry expansion:** removed.

**3D dice work:** retained for verification.

**Narration-context enrichment:** retained, with an epistemic/public-world audit required before it is declared fully safe.

**Master Plan:** unchanged and remains the completed master baseline.