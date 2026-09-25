# Dreamville — Capability, Skillbook, World-Rule & Story Flow Implementation Plan

Status: **ACTIVE — Phase 1 beginning**
Repository: `HeWhoArose/Dreamville-External`
Primary branch: `main`

## Purpose

This plan is the implementation ledger for the capability/Skillbook/story systems discussed in the current development pass. It is intentionally written into Dreamville before implementation so that the work remains connected across backend authority, player projections, AI-only simulation, progression, Story UI, world scoping, media generation, and regression verification.

## Non-negotiable architecture rules

1. **Owned capability ≠ global capability registry entry.**
   The Skillbook can only display actor-owned learned skills/techniques/spells/abilities, backed by canonical `SkillInstance` ownership.

2. **AI simulation is not player UI.**
   Adjudication data, DAGs, derived skills, internal capability IDs, simulation traces, resource calculations, sensory directives, synthesis metadata, and authoring controls remain AI/internal only.

3. **Simulation never silently grants.**
   A request for an unknown ability is evaluated first as a dry run. Canonical acquisition happens only after an explicit acquisition decision and a fresh authoritative commit.

4. **World law is authoritative.**
   A concept that cannot exist under the active world's metaphysics/rules must not be synthesized as a character skill. The system must distinguish:
   - already owned;
   - world-supported but not learned;
   - character-compatible but currently blocked;
   - conditionally/developably compatible;
   - character-incompatible;
   - world-forbidden/unsupported.

5. **Existing mechanisms are preferred before invention.**
   The simulator should first reuse, extend, transform, or combine existing character/world mechanisms. Novel synthesis is only a later option and must be revalidated through the same simulation gate.

6. **Story turn output is separate from Recent Actions.**
   The active scene owns the immediate result: player action → dice/check → success/failure → consequence → immediate narration. Recent Actions contains only a compact history of player-submitted actions.

7. **World is world-scoped.**
   World view may expose characters at the current location and elsewhere in the active world, never a global Dreamville roster.

8. **Scene media uses the latest turn only.**
   Comic scene generation must anchor to the immediate/latest narration and current scene facts, with no stale prior-scene carryover.

9. **Player-facing synthesis is forbidden.**
   Internal AI routes such as capability synthesis/interpretation remain explicitly guarded by the internal-AI boundary.

## Implementation phases

### Phase 0 — Audit & dependency map
- Inventory all player-facing and internal capability data paths.
- Locate every use of global capability registries and capability graphs.
- Locate all Skillbook/Character/Power/Workstation duplicates.
- Trace Story action history ordering and immediate-result ownership.
- Trace World character projection back to authoritative world identity.
- Trace current-scene prompt/image endpoints to their actual source action.
- Confirm dice renderer and dice-type mapping are true 3D geometry, not flat transforms.
- Record findings before mutations.

### Phase 1 — Canonical capability ownership & Skillbook boundary
- Make one authoritative player capability projection contract.
- Ensure Skillbook data comes only from actor-owned learned `SkillInstance` records.
- Keep equipment-granted capabilities separate from learned Skillbook entries.
- Prevent any legacy/global registry projection from reaching player-facing state.
- Keep capability DAG, synthesis output, and adjudication internals on AI/internal routes only.
- Add regression tests for global-registry leakage, equipment-vs-learned separation, and internal-route guards.
- Run the loop protocol below for ten deterministic audit passes.

**Acceptance gates**
- A capability existing in `CapabilityEngine` is not visible in the Skillbook unless a matching actor-owned `SkillInstance` exists.
- A skill acquired by equipment is executable/effective when appropriate but is not presented as learned.
- Player-facing capability payloads do not expose the global capability graph or simulation internals.
- Internal synthesis/interpretation routes remain inaccessible without the internal-AI boundary.

### Phase 2 — World-law + character compatibility simulation
- Harden the dry-run simulator as the only speculative capability feasibility layer.
- Build a stricter world-law hierarchy: world law → power system/metaphysics → custom rules → character mechanism → resources/body → progression.
- Add deterministic world-forbidden cases (e.g. bending-only world + teleportation).
- Add character-affinity cases (e.g. earthbender + lightning).
- Distinguish impossible-in-world from possible-in-world-but-not-for-this-character.
- Prefer existing mechanisms and progression routes before novel synthesis.
- Keep all simulation output internal until the normal player-facing explanation requires a safe summary.
- Re-run generated candidates through the same simulation before proposal.

### Phase 3 — Explicit acquisition/progression commit
- Make proposal acceptance the only canonical path from simulation → acquisition.
- Revalidate the proposal at commit time against the current world, actor ownership, progression state, resources, and rules.
- Prevent stale proposals and race-condition grants.
- Ensure canonical progression events are the persistence source for newly learned skills.
- Ensure rejected simulation has zero capability-state mutation.
- Ensure acquired skills immediately appear in Skillbook via the same projection path.

### Phase 4 — Story immediate-result flow
- Keep only the player action in Recent Actions.
- Keep dice, check result, success/failure, consequences, and immediate narration in the active turn result.
- Ensure newest canonical action is the displayed latest turn.
- Keep the action composer below the immediate result.
- Preserve fallback behavior when AI action advice is unavailable.

### Phase 5 — World-scoped character projection
- Ensure server-side character projection carries authoritative world identity.
- Keep current-location characters and elsewhere-in-world characters.
- Never fall back to a global Dreamville roster.
- Fail closed when world identity cannot be established.

### Phase 6 — Current-scene comic generation
- Trace and harden `Generate Scene → Generate Image/Prompt`.
- Build context only from the latest completed turn and current scene.
- Enforce 4-panel sequential-art continuity and exact immediate result.
- Prohibit stale dialogue/history, flashbacks, invented characters, alternate outcomes, and invented powers.
- Ensure generated asset display and prompt output are connected to the same turn.

### Phase 7 — Dice visual integrity
- Verify every supported die is represented as a recognizable 3D polyhedron.
- Preserve exact D4/D6/D8/D10/D12/D20/D100 identification.
- Ensure animation uses volumetric rotation rather than a flat-sheet effect.
- Add renderer-source and behavioral regression coverage.

### Phase 8 — Duplicate/legacy surface retirement
- Retire unused CharacterDossier/legacy HUD/workstation surfaces from player routing.
- Keep only one player Character/Skillbook surface.
- Keep internal workbench/diagnostic surfaces in developer-only routes.
- Audit imports and references so dead UI cannot silently re-enter the player flow.

### Phase 9 — Cross-system contract tests
- Test the chain:
  action → ownership resolution → simulation → proposal/deny → acquisition → execution → Skillbook.
- Test world-forbidden and character-incompatible paths.
- Test scene-generation freshness.
- Test World scoping.
- Test Story immediate-result placement and Recent Actions separation.
- Test fallback paths.

### Phase 10 — Final 10-pass integration loop
Every pass performs:
1. Audit current implementation against the plan.
2. Identify any disconnected, duplicated, leaked, or stale path.
3. Implement the smallest coherent correction.
4. Re-audit the changed path and its upstream/downstream contracts.
5. Verify regression/fallback behavior.
6. Record the pass outcome in the test/audit ledger.

No pass is considered complete merely because a UI appears correct; the API boundary, canonical state, projection, and persistence path must agree.

## Loop rule

For each implementation phase, and especially the final integration phase, use **10 explicit audit/implementation passes**:

**Audit → Implement → Re-audit → Regression/Fallback → Repeat**

The loop must cover:
- happy path;
- world-forbidden path;
- character-incompatible path;
- insufficient resource/body path;
- progression-locked path;
- stale proposal path;
- equipment-granted-but-not-learned path;
- global-registry leakage path;
- AI/provider failure fallback;
- UI/route regression.

## Current execution ledger

### Phase 1 — Canonical capability ownership & Skillbook boundary
Status: **IMPLEMENTED — verification in progress**

Implementation commits:
- `7755e06dd4c7128b88c927576760e0d7737a5547` — implementation plan
- `db8656a6294b933a55b7248bd07550f0387c629f` — centralized Skillbook projection boundary
- `e323aed27be4beade3d482e315ce1e6605c768c0` — ten-pass player-boundary audit/regression tests

Phase 1 changes:
- Added canonical `projectPlayerSkillbook()` projection.
- Skillbook ownership is now anchored to actor-scoped `SkillInstance` records.
- Registry-only capabilities cannot enter the Skillbook merely because their definitions exist.
- Equipment-granted capabilities remain effective actor capabilities but are not promoted into learned Skillbook entries.
- Legacy `/run-canonical-state` uses the player-safe capability projection instead of the global registry.
- Capability synthesis and interpretation remain explicitly AI/internal-only.
- Added ten-pass regression coverage for ownership leakage, equipment-vs-learned separation, player projection internals, legacy route leakage, and AI-only authoring boundaries.

Static re-audit:
- 10/10 boundary-loop passes satisfied at source level.
- Story player surface still uses `CharacterSurface` and does not contain the internal Capability DAG / Adjudication panels.
- GitHub Actions run `36160257145` is executing the repository verification workflow. At the last check, `npm install` and `npm run lint` had passed; `npm test` was still running, so full test/build success is not yet claimed.

## Phase completion rule

A phase is not marked complete until:
- source-level audit is clean;
- connected contracts are verified;
- regression coverage exists for new boundaries;
- fallback behavior is verified;
- no internal-only panel/data is exposed through the player surface;
- no claim of build/test success is made without an actual verification result.

