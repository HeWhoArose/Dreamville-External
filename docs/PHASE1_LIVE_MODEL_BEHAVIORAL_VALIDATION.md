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

