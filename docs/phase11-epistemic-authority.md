# Phase 11 — Knowledge, Secrets & Epistemic Authority

## Scope

Phase 11 establishes a canonical information boundary so player-facing projections, NPC decisions, and AI context receive only information the viewer/actor is authorized to know.

## Implemented

- Added actor-scoped knowledge authorization in `WorldRepository.getAuthorizedKnowledgeFacts()`.
- Required explicit Phase 8 acquisition for non-public knowledge.
- Kept public world facts globally visible.
- Bound WorkingContextEngine turn/opening context to authorized knowledge.
- Added an actor-authoritative NPC dialogue context builder.
- Changed `/context/npc-dialogue` to require a canonical `npcId` and ignore client-supplied knowledge/observation/system-directive payloads.
- Prevented NPC actions that require unknown facts.
- Hardened HistoricalChronicleEngine faction/secret evidence projection.
- Sanitized `/run-canonical-state` knowledge/evidence.
- Sanitized `/worlds/runs/:storyId` and visual-asset responses so raw runtimeState/canonicalEvents are not exposed.
- Bound progression read projections to the active player actor.
- Restored immutable access for canonical item definitions after the pre-Phase-11 audit found a mutable-definition authority regression.
- Restored strict Phase 8 facility visibility after the pre-Phase-11 audit found remote facility overexposure.

## Regression coverage

`tests/phase11.epistemic-authority.test.ts` covers:

- unacquired private facts
- explicit knowledge acquisition
- failed knowledge checks
- turn-context filtering
- opening-context filtering
- entity visibility derived from authorized knowledge
- public facts
- NPC knowledge-gated decisions
- actor-authoritative NPC dialogue context
- faction evidence visibility
- secret evidence visibility

Phase 8 regression coverage also verifies undiscovered remote facilities remain hidden.

## Static audit result

The Phase 11 audit reviewed:

- WorkingContextEngine turn/opening assembly
- NPC dialogue context construction
- AI orchestrator context assembly
- OpeningSceneService
- NPC autonomy knowledge gates
- HistoricalChronicleEngine epistemic projection
- WorldRepository knowledge and entity-visibility checks
- player-facing game routes that return story-run/canonical-state data

No remaining source-level Phase 11 leakage path was identified in the reviewed paths.

## Runtime verification

The latest Gemini report before these Phase 11 changes reported 811/811 tests, clean lint, and successful production build. Those checks were not re-executed after the Phase 11 changes because this environment does not have the repository dependencies/runtime available. GitHub Actions has no workflow run associated with the current commit at the time of this audit.

Runtime test execution remains the final completion-gate item before Phase 11 can be declared VERIFIED.
