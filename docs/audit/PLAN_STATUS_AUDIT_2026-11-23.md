# Plan Status Audit: needed, done, done differently, no longer needed

- **Date:** 2026-11-23
- **Question:** For every current plan, which items still need implementing, which are no longer needed, and which were already done, including fixed by a different route than the plan described.
- **Companion:** [PLAN_DOCUMENT_AUDIT_2026-11-23.md](PLAN_DOCUMENT_AUDIT_2026-11-23.md) (which documents exist and which are pinned by tests).

## How to read this, and what was and was not checked

Status labels: **DONE**, **DONE DIFFERENTLY** (the goal is met by another mechanism than the plan named), **PARTIAL**, **NEEDED**, **CONDITIONAL** (only if a measurement says so), **NOT NEEDED**, **HUMAN GATE** (cannot be closed by code).

- **Verified:** I grepped the code for each item's named artefacts, read the relevant code where the answer was not obvious (for example the emergent-thread title), and checked that matching test suites exist. The full suite (1,986 tests) passes.
- **Not verified:** I did not re-run each plan's acceptance matrix one item at a time, and I did not open the UI. For the two UI contracts (Story runtime, Operations menu) I relied on their own recorded 2026-09-27 verification. "A test file exists" is weaker than "the test asserts this plan item"; I flag where that matters.

## 1. Narrative grounding plan V2 (`NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md`)

| Gap / slice | What the plan asked | Today | Status |
| --- | --- | --- | --- |
| G1 / X1 objective ledger | One read-only, player-visible list of objectives | Quests still come only from authored `plannedEvents` (`gameRoutes.ts` ~11405). No ledger anywhere | **NEEDED** |
| G2 / X1b information-goal continuation | Remember the player's aim across follow-ups | No cross-turn store | **NEEDED**, but see "Phase 2 caveat" below |
| G3 / X4 milestone layer | Long-horizon structure | No `storyArc`, `plotThread` or `foreshadow` names exist in `server/` or `src/` | **NEEDED** |
| G4 / X2 redirection and over-compliance checks | Review for bare refusals and adopting false player claims; name-leak check | **Name-leak check: DONE DIFFERENTLY** (1A epistemic masking and the unintroduced-name review rule). Redirection policy and over-compliance check: absent | **PARTIAL** |
| G5 / X3 arc summaries | Periodic arc-level memory summaries | 1D consolidates *resolved threads* into semantic memory (event-driven), not periodic arc summaries. V2 itself says X3 stays deferred if scenario S passes | **DONE DIFFERENTLY / CONDITIONAL** |
| G6 / X5b replay harness | Replay recorded sessions through review, repair, fallback | No replay path. Capture side was fixed in V2 Phase 0 | **NEEDED** |
| G7 / X6c `StoryDirectorService` | Decision D1 (2026-10-18): fold and archive | **Done 2026-11-23** (see section 9). Note: the first version of this row wrongly said it had no tests; three test files referenced it | **DONE** |
| G8 / X6b emergent-thread text | Grounded text or suppression | Was a live defect (raw internal location ID in the title). **Fixed 2026-11-23** (see section 9) | **DONE** |
| G9 / X9 stakes, fail-forward | Persistent non-combat consequences | Not demonstrated, no code found. V2 itself marks it "to verify" | **CONDITIONAL** |
| G10 / X8 stall ladder | Handle objectives left open through quiet turns | No code found. V2 marks it "to verify" | **CONDITIONAL** |
| Phase 6 core (one bounded repair, fallback never invents) | | 1A call budget and single repair; confirmed live: provider failure returned `NARRATION_AI_UNAVAILABLE` and no invented prose | **DONE DIFFERENTLY** (delivered by 1A, not by a V2 phase) |
| Phase 4 population grounding | Reuse `ensureAmbientPopulation` | Reused; also wired at the opening (`openingSceneService.ts:145`) | **DONE** |
| Phase 1 / 7 live scenarios A–X | Human live sessions | Not run; one limited OpenRouter run is not the scenario suite | **HUMAN GATE** |

**Phase 2 caveat.** V2 Phase 2 says to reproduce failures G and M "in the baseline" first. That baseline is V2 Phase 1 and has not run. Building X1/X1b now means building to an unreproduced failure.

## 2. Unified plan (`UNIFIED_AUDIT_RECONCILIATION.md`)

Phases 0 and 1A–1F: **DONE**, verified offline (ledger: `FINAL_24_DOMAIN_AUDIT_AND_DELIVERABLES.md`). Real-provider verification is partial and human UI is a **HUMAN GATE**. No phase exists after 1F.

## 3. AI orchestration plan (`AI_ORCHESTRATION_IMPLEMENTATION_PLAN_V1.md`, marked ACTIVE)

Effectively complete; it can be marked DONE.

| Workstream | Today | Status |
| --- | --- | --- |
| A TaskContractRegistry | `aiTaskContracts.ts` with `getAiTaskContract`. The plan named 17 tasks (`summary.history`, `summary.memory`, `research.extract`, `research.qualify`, `world.expand`, `character.progression.infer`, `rules.explain`, `tactical.plan`, `tactical.replan`, ...); none of those IDs exist. The real set has about 22 IDs (`summary.scene`, `rules.adjudicate`, `rules.analyze`, `tactical.reason`, `combat.tactics`, `utility.inspect`, ...) | **DONE DIFFERENTLY** (consolidated names) |
| B Context adapters | `aiContextAdapters.ts` defines all seven (`ResearchBrief`, `WorldGeneration`, `CharacterGeneration`, `RulesOutcome`, `CombatAI`, `NarrativeOutcome`, `Ooc`) | **DONE** |
| C Narration consolidation | Working context and continuity feed the narration prompt (observed in live prompts) | **DONE** |
| D OOC tool registry | `oocToolRegistry.ts`; mutations go through `canonicalCommandEngine.execute` | **DONE** |
| E Model intelligence | Readiness, 429, 5xx, cooldown, circuit breaker exist; hardened further this session (retired-model cooldown, per-turn attempt cap) | **DONE** |
| F Tactical AI | `combatTacticsService.ts`, `combat.tactics` and `tactical.reason` tasks. Separate `tactical.plan` / `tactical.replan` contracts were not created | **DONE DIFFERENTLY** |
| G Acceptance | Matching suites exist and pass | **DONE** (not item-by-item re-run) |

## 4. Capability, integration and multiworld contracts

| Plan | Evidence | Status |
| --- | --- | --- |
| `DREAMVILLE_CAPABILITY_AND_STORY_IMPLEMENTATION_PLAN.md` (CAP-0..6) | Suites per acceptance item: `capability-skills-checks`, `capability-world-law`, `capability-player-boundary`, `capability-story-boundary`, `ch3_2_equipment_capabilities`, `player-capability-projection` and more | **DONE** |
| `DREAMVILLE_STORY_CAPABILITY_INTEGRATION_ROADMAP.md` | Integration chains covered by `integration-matrix.phase17`, `narrative-orchestration-phase3-5.integration` and the capability suites | **DONE** |
| `PERSISTENT_MULTIWORLD_AND_MEMORY_IMPLEMENTATION_PLAN_V1.md` §1-7, 9-11 | `s5-persistent-multiworld.test.ts`, `universe_runtime.test.ts`; dormant catch-up logic present in `capabilityEngine`/`livingWorldSimulation`/`gameRoutes` | **DONE** |
| Same plan, §8 "future multi-scale simulation" | Explicitly labelled future and owned by the spatial spec | **NOT NEEDED now** |
| `SURGICAL_ARCHITECTURE_REGISTRY_V1.md` S0-S7 | Each recorded VERIFIED, runtime tested 2026-09-27 | **DONE** (historical record, not re-verified) |

## 5. World Director and living-world plans

| Plan | Today | Status |
| --- | --- | --- |
| `WORLD_DIRECTOR_IMPLEMENTATION_PLAN.md` phases 0-5 | Per the index, complete. The "premise is not prepared incident state" problem (its section 2.2) was solved by `worldDirectorPreparationService`, **then extended by Unified 1B to freeform string premises** | **DONE** (extended by another plan) |
| Same, phase 6 outcome completeness | CI-verified per the index | **DONE** |
| Same, phase 7 player acceptance | Checklist prepared, NOT RUN | **HUMAN GATE** |
| `LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md`, opening-path gap | Opening now seeds population (`openingSceneService.ts:145`, `opening-scene-ambient-population.integration.test.ts`) | **DONE** (the doc still says PARTIAL) |
| Same, "encounter opportunity to canonical commit" handoff | `npc-initiated-interaction.integration.test.ts` exists; I did not trace the handoff end to end | **PARTIAL / unverified** |

## 6. UI contracts

`STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md` and `OPERATIONS_MENU_AUDIT_V1.md` are acceptance contracts whose own audits record runtime verification on 2026-09-27, with browser-only 3D dice inspection outstanding. I did not re-verify them. **HUMAN GATE** for the visual and interaction parts.

## 7. Needs that no plan owns (found this session)

1. **Narration yield on real models.** About 3 of 10 live turns were accepted. No plan measures or tunes this, because every phase was tested against cooperative fakes. See `NARRATION_FIX_VS_REPLACE_ASSESSMENT.md`.
2. **Default fantasy starter gear in the Ren premise** (iron sword, steel cuirass, astrolabe...). The regression test only asserts "no watch", so a possible unsupported-possessions gap went unnoticed.
3. **Hard safety versus soft quality review split**, to stop discarding turns on quality-only failures.

## 8. Recommended order

1. **Now, small and certain:** fix G8 (ungrounded emergent-thread title) and execute decision D1 for `StoryDirectorService` (archive it). Both are already decided or clearly defective.
2. **Decide the starter-inventory question** (item 2 in section 7) with an actual test of what a Ren run starts with.
3. **Run the V2 live baseline on a capable model**, which is the prerequisite for X1/X1b and measures item 1.
4. **Then build by measured failure:** objective ledger and continuation only if follow-ups lose the aim; soft/hard review split if over-rejection dominates; X4/X8/X9 only if scenarios T, W or the long-session checks fail.
5. **Mark as complete in the docs:** the AI orchestration plan, the capability and integration plans, and the living-world opening-path item. They are done but still labelled ACTIVE or PARTIAL.

## 9a. Starter gear (section 7, item 2): fixed 2026-11-24

Confirmed by code trace: any story without `protagonist.startingEquipment` received the Whispering Orrery demo kit (longsword, steel cuirass, astrolabe, veil, ingots, salves) from `seedStarterInventoryForActor`. `getInventoryEngine` in `worldRepository.ts` now grants it only to `default_story`; every other story starts empty unless its genesis or seed defines equipment. Test: `tests/starter-inventory-scope.test.ts`. No existing test depended on the old fallback. Full suite 1,991/1,991.

## 9. Work done after this audit (2026-11-23)

Two items from section 8, step 1 were completed.

**G8: emergent-thread wording.** `emergentNarrativeEngine.ts` now builds thread wording through `describeEmergentThread` from the committed event type and the location's *display name*, with a neutral fallback ("an unrecorded location"). The title is now "Investigate area at Warehouse Docks" instead of "Emergent Thread: INVESTIGATE AREA at loc_warehouse_docks". The canonical `locationId` is still stored for matching and stage advancement. Tests: `tests/emergent-thread-title.test.ts` (3 tests, including that a repeat event still advances the same thread).

**G7 / D1: `StoryDirectorService` archived.** Removed: `server/services/storyDirectorService.ts`, the three `/worlds/runs/:storyId/story-director/*` endpoints, and the director steps (4 to 6) of `tests/ch16_behavioral_verification.test.ts`. Updated: `tests/phase3.command-routing-audit.test.ts` (no longer lists the routes), and the Living Bible requirement text and `codeEvidence` paths in `server/domain/livingBible.ts` and `data/workstation_ledger.json` (the ledger refuses to VERIFY a requirement whose evidence files do not exist). `tests/phase3.canonical-command.test.ts` used the director only as a vehicle for a staged-transaction scoping check; that check was kept (the handler now reads its own staged write through `context.repository`) rather than deleted, so no coverage was lost. The deleted file is tracked in git history.

Verification: full suite 1,989/1,989, `verify:contracts` PASS, `tsc --noEmit` clean, `npm run build` OK.

**Not preserved on purpose:** the director's refusal-consequence and off-screen protagonist simulation behaviours went with it. The Phase 0 report found its trigger content unreachable (it required locations and items no seeded world defines), and D1 says nothing needs porting. If the "refusal has consequences" idea is wanted, V2 slice X9 is where it would be rebuilt as a proper milestone fixture.
