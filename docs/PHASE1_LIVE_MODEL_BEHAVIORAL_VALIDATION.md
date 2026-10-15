# Phase 1 — Live Model Behavioral Validation

## Objective

Validate the StoryBeat architecture against the **actual configured narrative model**, using the same `generateNarrativeOnly` path used by live freeform turns.

This phase is not a deterministic mock-quality test.

The pass criterion is behavioral:

> Does the real model consistently communicate the meaningful consequence, reaction, information change, or unresolved state of the turn instead of filling the response with scenery and movement prose?

## Scenarios

### A — Trench of Echoes

Player action:

`I move toward the Trench of Echoes.`

Canonical facts:

- the player approaches the established trench;
- the acoustic disturbance becomes more relevant/observable;
- the source remains unknown;
- no patrol arrival may be invented.

Failure signature:

> fluent movement + terrain/sensory description without meaningful change.

Expected:

- approach is communicated;
- observable change is communicated;
- uncertainty is preserved;
- no unsupported patrol arrival or source is invented.

### B — Arena / Viewing Box

Player action:

`I circle the arena floor and watch the private viewing box.`

Canonical facts:

- target is in the viewing box;
- guards/enforcers are present;
- the player is observing;
- empty benches/architecture are not the main story fact.

Failure signature:

> empty arena / architecture / lighting dominates while the target and guards disappear.

Expected:

- target remains narratively salient;
- guards remain present when relevant;
- observation has a meaningful informational result or explicitly remains inconclusive;
- environment is supporting detail.

### C — Dagger / Door / Reaction

Player action:

`I throw the dagger at the guarded door.`

Canonical facts:

- dagger hits the established door;
- mechanical result is fixed by ActionResolution;
- guard reaction is included only if canonically resolved;
- no invented injury, alarm, or target movement.

Failure signature:

> impact is described as a sound/visual event but nothing about the established consequence is communicated.

Expected:

- impact/result is explicit;
- canonically established reaction is surfaced;
- unsupported reaction is not invented.

### D — Quiet / No-Change Turn

Player action:

`I wait and listen.`

Canonical facts:

- no new canonical consequence;
- no new hidden information;
- player remains in control.

Expected:

- no forced drama;
- no invented NPC reaction;
- no fake discovery;
- concise meaningful presentation of the unchanged/uncertain state.

### E — Multi-Turn Continuation

Run:

1. Trench approach.
2. Move closer/listen.
3. Inspect the disturbance.
4. React to newly revealed information.

Expected:

- each turn builds on the prior turn;
- previous meaningful changes are not reset;
- the narrator does not repeatedly restate scenery;
- unresolved questions remain unresolved until canonical evidence changes them.

## Measurement

Every live scenario records:

- provider/model actually used;
- fallback attempts;
- StoryBeatContract;
- final narration;
- N18 score/decision;
- StoryBeat fidelity result;
- environment-excess result;
- rewrite attempted/succeeded;
- latency;
- token budget;
- fallback provenance.

A scenario is **FAIL** if any of these occur:

1. canonical meaningful change is omitted;
2. an established target/entity disappears from focus without justification;
3. established reaction/consequence is replaced by atmosphere;
4. unsupported consequence/reaction is invented;
5. player agency is taken over;
6. hidden information leaks;
7. the response is dominated by scenery while the beat is available;
8. repeated prose describes the same state without advancing information or consequence.

A scenario is **PASS** when the response communicates the authorized beat and preserves all authority boundaries.

## Important limitation

The repository CI environment does not expose provider secrets to this audit agent. Therefore deterministic CI can validate the harness and integration, but **real-model literary behavior must be run in an environment containing the configured Gemini credential**.

This is intentional. We must never fake a “live model pass” with a mock and label it real.

## Phase 1 exit criteria

- all five scenario families executed against the real configured model;
- outputs captured;
- no authority violations;
- no systematic scenery-over-substance failure;
- fallback path separately verified;
- any recurring failure converted into a deterministic regression test;
- fixes applied only after reproducing the failure;
- full regression suite green after each correction cycle;
- final live-model report committed to `docs/`.



---

## Expanded coverage — Narrative Grounding & Player-Intent Plan

This file remains the **Phase 1 live-model gate**. It is not replaced by the broader cross-cutting plan:
[`NARRATIVE_GROUNDING_AND_PLAYER_INTENT_IMPLEMENTATION_PLAN.md`](./NARRATIVE_GROUNDING_AND_PLAYER_INTENT_IMPLEMENTATION_PLAN.md).

Keep scenarios A–E above. Add the following scenarios to the Phase 1 execution matrix. These are **required cases, not claimed results**; each remains unverified until the actual configured model is run through the live player-turn route.

### F — Direct opportunity inquiry

Player action:

`I check the guild board for available work.`

Test fixtures must include both:
- a case where a canonical, player-visible notice exists;
- a case where the available-opportunity source is empty or incomplete.

Expected:
- a real notice is accurately summarized when present;
- no invented notice is described as an existing fact;
- missing/incomplete data is described as unknown or “none found in the sources checked,” not proof that the world has no work.

### G — Elliptical follow-up

Turn 1: `I ask what work is available in this guild.`

Turn 2: `I check further for what I can do.`

Expected:
- turn 2 retains the active work/opportunity information goal;
- it checks additional relevant sources or explains the search boundary;
- it does not revert to generic environmental description;
- it does not create a quest or posting merely to provide a satisfying answer.

### H — Quiet but populated location

Fixture: a location has canonical population/activity evidence, but no NPC is in the immediate visible-entity projection.

Expected:
- the narrator does not label the whole location deserted solely because no NPC is currently visible;
- population, visibility, and uncertainty remain distinct;
- no specific NPC is invented as a confirmed person unless the encounter/world authority provides one.

### I — Canonically deserted or restricted location

Fixture: the location is explicitly deserted or restricted by authoritative world state.

Expected:
- narration preserves that fact;
- no crowd, merchant, guard, or quest board is introduced without a valid canonical event or authorized world-state change.

### J — NPC-initiated activity

Fixture: the authoritative encounter/activity mechanism returns an eligible NPC approach, such as a merchant advertising goods or guild staff offering a visible contract.

Expected:
- the encounter is surfaced naturally;
- the NPC can initiate contact;
- the player is not forced to accept, follow, buy, speak, or begin a quest;
- the event is not duplicated or inconsistent with location/time state.

### K — Rejected primary candidate and rejected repair

Inject a primary candidate that omits the direct answer or invents an unsupported object/event. Then inject a repair that also fails review.

Expected:
- neither rejected candidate is shown;
- the fallback is evidence-bound and preserves the original player goal;
- the exact final candidate passes final validation;
- no canonical state mutation occurs during review or repair.

### L — Provider outage / malformed output

Exercise unavailable provider, malformed output, and exhausted fallback chain using the live action route or its established integration harness.

Expected:
- a bounded deterministic response is returned;
- the response does not fabricate objects, notices, NPCs, reactions, or hidden knowledge;
- state remains valid and unchanged except for canonical effects that were independently resolved before narration;
- fallback provenance and failure reason are recorded.

## Additional required measurements

In addition to the measurements above, capture for F–L:
- exact player input and preceding objective-setting turns;
- interpreted intent, information goal, and continuation source;
- evidence source IDs and visibility authorization;
- population/opportunity data status (present, empty after query, incomplete, or not queried);
- all primary/repair/fallback candidate texts and review decisions;
- final visible response and canonical state diff;
- number of model calls and total latency.

## Revised exit criteria

Phase 1 may be marked **PASS** only when:
- original scenarios A–E and expanded scenarios F–L have been executed;
- deterministic integration cases and live-model behavioural cases are reported separately;
- every returned candidate, including fallback, passes final intent/grounding checks;
- no unsupported fact, hidden-knowledge leak, agency takeover, or canonical mutation from narration is observed;
- information-seeking actions answer from evidence or state the evidence limitation honestly;
- all failures have reproducible regression tests and the full available regression gate is green;
- provider credentials are available for the real-model runs and the outputs are recorded.

If provider credentials are unavailable, report **DETERMINISTIC INTEGRATION PASS / LIVE MODEL BLOCKED** as appropriate. Do not report Phase 1 as fully passed.
