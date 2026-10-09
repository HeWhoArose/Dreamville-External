# Living World Population, Occupancy, and Encounter Audit

## Objective

Keep narration grounded without making the world empty. Canonical simulation may establish NPCs, objects, discoveries, and encounters; narration may only present evidence that has been committed or is explicitly perceptible.

## Audit findings

1. `CurrentSituationBuilder` projects canonical NPC lifecycles at the current location and entity cards whose canonical location/visibility qualifies. It does not itself guarantee a location has a population or create encounter opportunities.
2. `LivingWorldSimulation` supports NPC schedules, movement, physiology, and scheduled world events, but only affects entities/events that have been registered. The existence of the simulator does not prove every generated location has occupants or an encounter profile.
3. `LocationNode.description` and `ambientSensory` are descriptive context, not authoritative proof that a specific person/object exists.
4. Location-level scene objects are explicit canonical data, and ground inventory items are projected from the inventory engine.
5. A location with no population metadata must be treated as UNKNOWN, not silently interpreted as ABANDONED.
6. The opening-scene review projection must provide the same scene-evidence contract as live-turn projections.
7. CI on the previously inspected main revision failed type-check/lint due to a missing `unique` symbol, lifecycle references to nonexistent `spatial` properties, and an opening-review object missing `sceneEvidence`. These were corrected before continuing occupancy work; verify the newest workflow results before considering the branch green.

## Implemented in this pass

- Added optional canonical `LocationPopulationProfile` metadata to `LocationNode`: `INHABITED`, `RESTRICTED`, `ABANDONED`, or `UNKNOWN`.
- Added expected population, encounter profile ID, explanation, access-control flag, and provenance.
- Missing population data resolves to UNKNOWN.
- Added occupancy metadata to `CurrentSituation.sceneEvidence`.
- Added occupancy evidence and an explicit rule to the narration prompt: unknown occupancy is not evidence of abandonment or a guaranteed crowd.
- Added the same occupancy contract to the opening-scene review projection.
- Fixed the known type-check issues reported by GitHub Actions in semantic review, player local spatial-state access, and opening review construction.

## Required live wiring

The following must be traced/verified before this work is considered complete:

1. **World synthesis → GeographyGraph:** generated/authored location population profiles must be preserved when locations are created, imported, copied, and persisted.
2. **NPC authority → location occupancy:** canonical NPC lifecycles/entity cards and schedule profiles must remain synchronized; moving an NPC must update the same authoritative location used by scene projection.
3. **World time → schedule simulation:** only advance schedules when world time advances, and persist resulting movement before narration.
4. **Encounter eligibility → canonical commit:** an encounter opportunity may be proposed from location profile, world state, schedule, and deterministic random seed. It must create/update a canonical NPC/event through the authoritative command/repository path before narration may describe it.
5. **Scene projection → perception:** existence, location, visibility, concealment, audibility, and player knowledge are distinct. A present NPC may be hidden or off-screen; a visible NPC must be supported by perception rules.
6. **StoryBeatDirector → prompt → validation:** scene evidence and occupancy must reach the actual live narration path, not only a helper/test path.
7. **Persistence/idempotency:** reloading a run or retrying a turn must not duplicate NPCs or encounters.

## Acceptance matrix

| Scenario | Required result |
| --- | --- |
| Inhabited location | Population metadata supports activity; canonical occupants or a valid encounter may be surfaced. |
| Restricted location | Access rules affect where occupants can be and what is visible/audible. |
| Abandoned location | Absence is supported by explicit canonical status/evidence, not inferred from an empty NPC query. |
| Unknown occupancy | Preserve uncertainty; do not call the location empty or populated without evidence. |
| Chance encounter | Deterministic eligibility/seed; canonical entity/event commit; idempotent on retries. |
| Quiet turn | No mandatory encounter injection. |
| Search/listen/inspect | Resolution queries canonical scene, NPC, event, and sensory evidence, returning a grounded result or explicit uncertainty. |
| Long session/reload | NPC movement, population status, and encounters persist without duplication. |
| Provider failure | Simulation and canonical state still work; fallback narration does not invent occupants or objects. |

## Status

This pass establishes the occupancy data contract and passes it through the scene and opening-review projections. It does **not** by itself prove encounter generation is connected end-to-end. Do not mark the overall living-world requirement VERIFIED until the required wiring is inspected and integration tests plus the real Start Run/multi-turn flow pass.
