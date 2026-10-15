# Dreamville — Integrated AI Story Engine

Dreamville is an AI-assisted interactive story / role-playing application with a deterministic world and gameplay runtime, AI orchestration, narrative systems, persistence, and a user-facing UI.

## Current repository boundary

**This repository contains the active integrated engine and application.** The `server/` tree owns canonical runtime/gameplay services, world state access, action resolution, simulation, persistence and AI orchestration. The `src/` tree owns player-facing presentation and interaction.

Older documentation that described this repository as a presentation-only client for a separate core is historical and has been archived. Do not revive that boundary unless a current, verified dependency explicitly requires it.

The internal authority boundary remains strict:

```
Player intent
  -> canonical interpretation / rules / action resolution
  -> authoritative state and evidence projection
  -> AI proposal or narration
  -> validation / authorized adjudication
  -> canonical commit only through the owning command/state authority
  -> player-facing projection
```

**Simulation determines what happened. Narration describes what happened. AI may interpret, propose or present information, but plausible prose is not canonical truth.**

## Before editing anything

Read [the current documentation index](docs/README.md). It identifies active plans, verified systems, partial work and archives.

For narrative grounding / information-seeking work, the current cross-system plan is [Active Narrative Grounding & Live-Model Validation](docs/ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md). The existing StoryBeatDirector implementation is documented as verified in [its final audit](docs/STORY_BEAT_DIRECTOR_FINAL_AUDIT.md); do not recreate it.

**Phase 1 of the active narrative plan is not yet passed.** Real-provider live sessions and human UX checks are required for that gate. Mock-only CI cannot be presented as a real-model pass.

## Development discipline

For every task: audit the current code first; identify the real caller/trigger, producer, contract, consumers and fallback; implement the smallest demonstrated gap; add a regression test; run targeted and full available tests, lint and build; trace the connection again; and report automated CI separately from human live-session results.

Do not create parallel sources of truth for world state, spatial simulation, capability/check resolution, memory, NPC authority, model routing or narrative planning. Prefer the existing owner subsystem and typed contract.

## Archive rule

Files under [`docs/outdated/`](docs/outdated/README.md) are historical or superseded and **must not be used as implementation instructions**. They remain for provenance only.
