# Final 100+ Turn Integrated Narrative Audit

## Scope

This audit is the final cross-phase verification of the production narration stack after N19. It exercises the live `MultiModelOrchestrator.executeTurn()` path for 120 sequential turns and separately tests N19 selector behavior and total-provider emergency recovery.

## Phases covered

- N1 narrative quality contract
- N2 narrator voice
- N3 semantic narrative research
- N4 continuity
- N5 NPC cognition
- N6 literary review
- N7 novelty
- N8 pacing
- N9 provider handoff
- N10 golden regression invariants
- N11 long-session bounds
- N12 integrated final audit guarantees
- N13 scene composition
- N14 NPC expressive identity
- N15 social attention / conversation topology
- N16 semantic + episodic memory retrieval
- N17 narrative episode projection
- N18 narrative richness evaluation
- N19 creative model tier and cadence routing

## 120-turn scenario

The integrated test cycles through observation, movement/listening, explicit questioning, inspection, passive listening, and scene observation. A visible NPC is used as the active conversational target, the story contains an unresolved fissure thread, and both semantic and episodic memories are seeded.

Turns 1–60 use the primary narrative provider. From turn 61 onward the primary provider is forced to fail with a 500 response so the configured AI fallback path is exercised across the remainder of the session.

Every successful turn verifies:
- the ephemeral narrative plan exists and expires after narration;
- N13 scene composition exists;
- N14 expressive NPC identity reaches NPC cognition;
- N15 social topology exists;
- N17 episode projection exists;
- N18 richness evaluation exists;
- N9 handoff survives provider execution;
- N13/N15/N17/research/NPC cognition/memory material remains visible in the bounded prompt;
- presentation remains separate from canonical command/player state.

## Long-session invariants

The test reuses `NarrativeLongSessionStressEngine` and requires:
- 120 recorded turns;
- narrative history bounded to 40;
- novelty bounded to 120;
- continuity beat/response-shape bounds preserved;
- plot beats/open threads bounded;
- research runtime snapshot below 50 KB;
- narration prompt below 24 KB;
- primary provider exercised but never beyond the first 60 turns;
- fallback provider exercised for at least 60 turns.

## N19 routing verification

The test also clears explicit task pins, fallback chains, and category overrides in an isolated orchestrator and verifies that a `CREATIVE`-capable model is selected over a `FAST`-only candidate for `narrative.generate`.

## Total outage verification

A separate test forces both AI providers to return 500 errors and verifies the deterministic emergency floor still produces a successful turn carrying N13, N15, N17, NPC cognition, N18, and the N9 provider handoff.

## Authority / safety assertions

The integrated audit does not authorize narrative code to mutate canonical state. The 120-turn test snapshots canonical command events and player lifecycle before execution and requires the snapshot to remain identical afterward because all generated turn packages contain no canonical state changes.

## Acceptance rule

Final acceptance requires the integrated 120-turn suite plus the repository's Release Gate and Verification workflows to pass on the merged `main` commit. Any failure is treated as unresolved until corrected and re-audited.