# Dreamville — Current Integrated Project Specification

**Status:** CURRENT PROJECT BOUNDARY

## 1. Purpose

Dreamville is an integrated AI-assisted story/role-playing engine and player-facing application. This repository contains both the deterministic server runtime and the user-facing UI.

- `server/`: world repository and state projections, deterministic actions/simulation, canonical commands, rules/checks/capabilities, persistence, AI orchestration, narration/research/memory systems and API routes.
- `src/`: Story UI, player interaction, presentation and application screens.
- `docs/`: subsystem contracts, current work plan, verification evidence and an explicitly non-executable historical archive.

## 2. Authority model

```
Player action
  -> intent interpretation
  -> canonical rule/action resolution
  -> authorized current-situation and evidence projection
  -> AI interpretation/narration proposal
  -> semantic, schema, epistemic and authority validation
  -> canonical state mutation only through owning command/service
  -> durable events/memory according to their owning lifecycle
  -> player-facing result
```

Canonical world state, rules, location/time, movement/travel, combat/check resolution, inventory/capability, epistemic knowledge, persistence and event authority are owned by their current server-side domain services. AI output is never canonical merely because it is plausible.

## 3. Coding-agent rule

Before changing a subsystem:
1. Read `docs/README.md`.
2. Read its active owner contract.
3. Inspect current source and every real caller/consumer.
4. Check the current verification report and CI for the target commit.
5. Reuse current authorities and typed contracts; do not create duplicates.
6. Add tests that exercise the real integration path and all relevant failure/fallback paths.
7. Distinguish automated tests from live-provider and human-UI verification.

## 4. Narrative validation status

StoryBeatDirector and the N13–N19 narrative layers already have implementation evidence in the repository. This is not evidence that every current-model narrative behaviour is perfect.

The active [Narrative Grounding Execution Plan V2](docs/NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md) preserves and expands the original live-model Phase 1. The real-provider and human-session gate is **PLANNED / NOT YET PASSED** until outputs, provider/model identity, scenario results and relevant regression evidence are recorded.

## 5. Historical documents

Superseded documents are preserved under `docs/outdated/` for traceability only. They are not implementation instructions. Use the current code and the [documentation index](docs/README.md) for decisions.
