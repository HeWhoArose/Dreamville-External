# Narrative Grounding Phase 0 — Baseline Audit (2026-10-15)

**Status:** BASELINE RECORDED — implementation must not start by rebuilding existing systems  
**Target branch baseline:** `main` at `090b7d7b8c8b9c6ef47a0f643af3b15a303e1179`  
**Documentation work branch:** `plan/narrative-grounding-phase1`  
**Scope:** documentation governance and the current narrative-grounding work. This report is a point-in-time audit, not a claim that the entire product is healthy.

## Executive finding

DreamVille already contains several substantial narrative and orchestration systems. The current major problem is not simply that a missing “director” module needs to be added. The real question is whether existing canonical evidence, player intent, scene/beat planning, model routing, review/retry, and world-activity systems are connected in the actual player-turn path and enforce the same contract.

The active implementation plan must therefore **audit and reuse existing owners first**, fix only demonstrated gaps, and keep real-provider/live UI validation separate from deterministic CI.

## 1. Already implemented or documented as verified — do not recreate by default

| System | Existing evidence | Current handling |
|---|---|---|
| StoryBeatDirector and StoryBeatContract | `docs/STORY_BEAT_DIRECTOR_FINAL_AUDIT.md` records runtime verification and a historical full regression/release gate | Reuse. Trace every current caller and consumer; add only a reproduced missing contract or connection. |
| N13 Scene Composition | `docs/N13_SCENE_COMPOSITION_AUDIT.md` records implementation and release-gate verification | Reuse scene-composition ownership. |
| N14 NPC Expressive Identity | `docs/N14_NPC_EXPRESSIVE_IDENTITY_AUDIT.md` records implementation and release-gate verification | Reuse identity projection; do not add a second voice/personality owner. |
| N15 Social Attention Topology | `docs/N15_SOCIAL_ATTENTION_TOPOLOGY_AUDIT.md` | Existing contract/prompt integration must be checked against current code and CI before any edits. |
| N16 Semantic Episodic Memory | `docs/N16_SEMANTIC_EPISODIC_MEMORY_AUDIT.md` | Reuse memory/continuity owners; do not create a parallel memory engine. |
| N17 Narrative Episode Projection | `docs/N17_NARRATIVE_EPISODE_PROJECTION_AUDIT.md` | Reuse the existing episode projection and thread/history owners. |
| N18 Narrative Richness Evaluation | `docs/N18_NARRATIVE_RICHNESS_EVALUATION_AUDIT.md` | Reuse as a quality signal; never let a richness score replace semantic truth or canonical authorization. |
| N19 Creative Model Tier/Cadence Routing | `docs/N19_CREATIVE_MODEL_TIER_CADENCE_ROUTING_AUDIT.md` | Reuse existing orchestrator, registry and configured fallback chain; no parallel router or model registration. |
| AI orchestration | `docs/AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md`, `docs/AI_ORCHESTRATION_IMPLEMENTATION_PLAN_V1.md` and the Phase 12 tests | Existing owner. The current `main` test baseline has failures in routing/fallback contracts; investigate separately, not by duplicating orchestration in this docs PR. |
| Canonical situation/evidence | `CurrentSituationBuilder`, `WorldRepository`, canonical command/action resolution, and existing narrative research/context consumers are named in the active plan | Treat their output as evidence. Re-audit current call paths and visibility/knowledge boundaries. |

**Important qualification:** these are existing implementations or recorded verification claims, not proof that every current `main` commit passes. Historical audit pass counts apply to their recorded commit. Recheck current source and CI when changing the owner.

## 2. Partial — integration not yet proven

### Living-world population and encounters

`docs/LIVING_WORLD_POPULATION_AND_ENCOUNTER_AUDIT.md` explicitly says the occupancy data contract has been established and passed through scene/opening-review projections, but **end-to-end encounter generation is not verified**.

Known contract boundary:

`location/population profile + canonical world state + schedule/time + deterministic eligibility`
→ encounter proposal
→ authoritative NPC/event commit
→ `CurrentSituationBuilder` / perception projection
→ StoryBeatDirector / research / live narration
→ final candidate validation
→ persisted, idempotent turn/run result.

The active plan must trace each edge in code. Do not spawn NPCs in the narrator, infer “abandoned” from an empty query, or force an encounter into every quiet turn.

### Current caller/consumer wiring

The active plan includes a caller inventory and producer → contract → consumer map. Phase 0 must re-enumerate callers from current source and verify the *actual runtime order*, including:
- whether canonical action resolution has already happened;
- which CurrentSituation snapshot and authorized evidence are supplied;
- which plan/beat/context reaches the model;
- whether semantic/authority validation runs after every rewrite, fallback, emergency-floor or literary-polish output;
- which canonical state, event, history and memory owners may commit;
- whether errors preserve the established API/UI retry contract.

A map in documentation is not a passing integration test. Each claimed edge needs source references and a test exercising the real caller path.

## 3. Current CI baseline — do not attribute existing failures to this documentation PR

On 2026-10-15, GitHub Actions for `main` at `090b7d7b8c8b9c6ef47a0f643af3b15a303e1179` already showed failed `npm test` / release-gate runs:
- [Main verification run](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38710728660)
- [Main verification run](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38710728481)
- [Main release gate](https://github.com/HeWhoArose/Dreamville-External/actions/runs/38710728448)

The PR branch's latest run showed the same principal runtime failure signatures, including:
- model registry/routing expectation mismatch;
- Phase 12 scene-anchor and scene-drift/fallback assertions;
- production narration model/provider-failure expectation mismatch;
- configured narrative model-order expectation mismatch;
- movement destination preservation and Continue travel-intent classification;
- end-to-end turn-harness failure;
- information-continuity and canonical-location-anchor rejection traces during integration tests.

These are **pre-existing baseline failures by comparison with the recorded `main` runs**, not documentation path failures. This comparison does not establish that every failure is identical or that the PR has passed its own checks. The latest PR checks remain red. Keep the docs PR separate from any runtime repair and do not call CI green.

## 4. Required next work

1. Finish checking documentation-specific path/reference assertions against the archived filenames.
2. Run the docs/release-contract checks and verify that failures from old paths are gone.
3. Compare remaining runtime failures to the `main` baseline; track them in a separate runtime issue/PR unless the documentation change itself caused a regression.
4. Continue Phase 0 source tracing for the actual live-turn callers and every producer/consumer edge.
5. Execute Phase 1 through the real configured provider and Story UI. Until the provider and player-facing sessions are recorded, mark Phase 1 **BLOCKED / NOT PASSED**, never PASS.
6. Execute the population/encounter path end-to-end, including quiet, populated, restricted, abandoned, unknown-occupancy, retry, reload and long-session cases.
7. Only then implement a demonstrated missing edge, add targeted regression tests, run regression/full suite, and repeat the audit.

## 5. Human-required gates

- **[HUMAN LIVE-SESSION REQUIRED]** real configured-provider narration for scenarios A–P in the active plan.
- **[HUMAN UX REVIEW REQUIRED]** assess whether a response answers the player's actual question/action, changes the situation meaningfully, preserves agency and avoids unsupported invention.
- **[HUMAN UI SESSION REQUIRED]** Start Run, multi-turn follow-up, retry, resume/reload and final displayed narration.
- Automated/mock results must be reported separately. Missing credentials or UI access means **BLOCKED**, not PASS.

## Final status

- Documentation index/archive: present on the PR branch.
- Active narrative grounding plan: present, Phase 1 retained, phases 0–9 defined.
- Existing narrative systems: reuse; do not rebuild.
- Living-world encounter integration: **PARTIAL / END-TO-END UNVERIFIED**.
- Phase 1 live-model behaviour: **NOT PASSED**.
- Full CI: **RED on both main baseline and PR branch**; documentation-specific and baseline runtime failures must be distinguished.
- Merge readiness: do not describe the PR as fully verified until its docs/release-contract checks and review are complete.


## 4. Source-trace update (2026-10-15)

The follow-up trace in [`NARRATIVE_GROUNDING_PHASE0_RUNTIME_TRACE_2026-10-15.md`](NARRATIVE_GROUNDING_PHASE0_RUNTIME_TRACE_2026-10-15.md) inspected the live freeform generation path and the world-simulation/occupancy seam against the recorded `main` baseline.

Source tracing found two candidate-validation defects, both now isolated in draft [PR #71](https://github.com/HeWhoArose/Dreamville-External/pull/71): the outer authority N18/N8 rewrite could retain already-rejected primary prose on repair failure, and the internal `narrative.review` rewrite in `generateNarrativeOnly` lacked shared semantic review and could still return success after its final StoryBeat check failed. PR #71 now routes internal rewrite, exact final core candidate, and authority rewrite through a shared final validator and withholds failed authority prose while preserving the committed canonical action. The latest head is still **pending CI verification**; earlier runs show the full suite failing on the same ten baseline runtime assertions. Do not mark the fix verified until the newest head's targeted test, full suite and release gate are inspected.

The living-world source trace has identified the existing producer, `WorldActivityDirector.ensureAmbientPopulation`, and its normal-turn connection into `CurrentSituationBuilder`/ambient-event projection. This is not a missing subsystem. The concrete missing wiring is fresh opening generation: it happened before ambient population seeding and its opening prompt/review omitted visible canonical occupants/activity. Draft [PR #72](https://github.com/HeWhoArose/Dreamville-External/pull/72) proposes that integration and preservation of authored location population metadata. At the tested head, both new targeted tests passed, but full CI still showed ten runtime baseline failures; leave the PR draft and do not treat end-to-end UI behaviour as verified. Do not create a parallel encounter generator.

This source trace does not change the real-model requirement: Phase 1 and post-fix Phase 7 live sessions through the actual player-facing UI remain **BLOCKED until performed**; mocks, source inspection, and GitHub CI do not count as live-provider validation.

## 5. Corrected source finding — existing ambient producer (2026-10-15)

A broader source trace found that the population/encounter producer is not wholly absent. `WorldActivityDirector.ensureAmbientPopulation` seeds deterministic canonical ambient `EntityCard`s for eligible inhabited/public locations and persists them idempotently; `buildAmbientEvents` projects visible local activity, social opportunities, potential encounters, and occasional NPC-initiated activity. `ServerMockAuthority` invokes the producer before `CurrentSituationBuilder.build` on the ordinary freeform path. Existing `tests/world-activity-director.test.ts` covers seeding, restrictions, filtering, idempotence, event projection, and persistence.

The concrete missing boundary found is **fresh opening-scene generation**: `POST /story-runs` immediately calls `OpeningSceneService.generateOpeningScene`, which previously did not seed ambient population or put visible canonical people/activity into the opening context and quality-review situation. The source trace is [`NARRATIVE_GROUNDING_PHASE0_RUNTIME_TRACE_2026-10-15.md`](NARRATIVE_GROUNDING_PHASE0_RUNTIME_TRACE_2026-10-15.md); draft [PR #72](https://github.com/HeWhoArose/Dreamville-External/pull/72) proposes the opening wiring and the preservation of authored location population metadata when StoryRuns are created.

Do not plan or implement a second population/encounter system. Phase 4 must now verify the existing producer's exact caller-to-projection-to-narration path, the opening integration in PR #72, distinction between a projected potential-encounter cue and a canonical committed encounter, and live Start Run → follow-up → reload behavior. PR #72's CI is pending; no runtime fix is considered verified until it passes the required checks. Phase 1/7 real-provider and UI sessions remain human-required and **BLOCKED / NOT PASSED** until run.