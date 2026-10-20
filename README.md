# Dreamville

## Personal AI Story Engine

Dreamville is a personal AI story engine: a single-player, AI-narrated
role-playing experience built on a deterministic world and gameplay runtime,
AI orchestration, narrative systems, persistence, and a player-facing UI.

> **Note on the name:** Dreamville here refers to this project only. It has no
> connection to the music label or any other entity of the same name.

---

## What it does

- Runs a persistent, living world with its own clock, geography, factions,
  NPCs, items, and consequences.
- Resolves player actions through deterministic rules: skill checks, combat,
  conditions, spellcasting, rest and recovery, and character progression.
- Uses AI for narration, dialogue, scene composition, and interpreting what the
  player is trying to do, always within bounded context.
- Tracks who knows what, so the player, each NPC, and the AI only ever work
  from information they are entitled to have.
- Keeps a chronicle of canonical events, with provenance for how each fact came
  to be.
- Supports multiple worlds and campaigns, with saving, archiving, and story
  memory that persists across sessions.

---

## Architecture

This repository contains the whole application. The `server/` tree owns
canonical runtime and gameplay services, world state, action resolution,
simulation, persistence, and AI orchestration. The `src/` tree owns
player-facing presentation and interaction.

Every turn follows the same authority pipeline:

```
Player intent
  -> canonical interpretation / rules / action resolution
  -> authoritative state and evidence projection
  -> AI proposal or narration
  -> validation / authorized adjudication
  -> canonical commit only through the owning command/state authority
  -> player-facing projection
```

**Simulation determines what happened. Narration describes what happened.** AI
may interpret, propose, or present information, but plausible prose is never
canonical truth. Model output becomes part of the world only after validation
and a commit through the system that owns that state.

**Four kinds of knowledge are kept separate:**

```
WORLD TRUTH ≠ PLAYER KNOWLEDGE ≠ NPC KNOWLEDGE ≠ AI CONTEXT
```

The interface and the narration layer only expose what the active viewer is
authorized to know. Hidden world facts are not leaked just because they exist
in the simulation.

---

## Project layout

| Path | Contents |
| --- | --- |
| `src/` | React front end: components, routes, client services |
| `server/api/` | HTTP routes for gameplay, adaptation, and sensory systems |
| `server/domain/` | Rules and simulation: combat, checks, capabilities, epistemics, narrative direction, world simulation, AI orchestration |
| `server/services/` | Higher-level services: character creation, campaign archive, opening scenes, media, entity cards |
| `server/simulation/` | World and spatial simulation |
| `server/repositories/` | World persistence |
| `server/data/` | Server-side data |
| `tests/` | Automated test suite |
| `scripts/` | Build helpers, regression batches, stress tests, release-contract verification |
| `docs/` | Specifications, plans, and audit records |

---

## Tech stack

- **Front end:** React 18, Vite, Tailwind CSS 4, Motion, Lucide
- **Back end:** Node.js with Express 5, written in TypeScript
- **AI:** Google Gemini via `@google/genai`
- **Dice:** `@3d-dice/dice-box-threejs`

---

## Getting started

```bash
npm install
cp .env.example .env     # then add your GEMINI_API_KEY
npm run dev
```

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build the client and bundle the server |
| `npm start` | Run the production build |
| `npm run lint` | Type-check with `tsc` |
| `npm test` | Run the test suite |
| `npm run verify:contracts` | Verify release contracts |

CI runs contract verification, lint, tests, and build on pushes and pull
requests to `main`.

### Configuration

Copy `.env.example` to `.env` and set:

- `GEMINI_API_KEY`: your Gemini API key.

Local provider credentials and runtime persistence are git-ignored. Never
commit API keys.

---

## Before editing anything

Read the [documentation index](docs/README.md). It identifies active plans,
verified systems, partial work, and archives.

For narrative grounding and information-seeking work, the current cross-system
plan is the [Narrative Grounding Execution Plan
V2](docs/NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md). The
StoryBeatDirector implementation is documented as verified in [its final
audit](docs/STORY_BEAT_DIRECTOR_FINAL_AUDIT.md); do not recreate it.

**Phase 1 of the active narrative plan has not yet passed.** Real-provider live
sessions and human UX checks are required for that gate. Mock-only CI cannot be
presented as a real-model pass.

---

## Development discipline

For every task: audit the current code first; identify the real caller or
trigger, producer, contract, consumers, and fallback; implement the smallest
demonstrated gap; add a regression test; run targeted and full tests, lint, and
build; trace the connection again; and report automated CI separately from
human live-session results.

Do not create parallel sources of truth for world state, spatial simulation,
capability and check resolution, memory, NPC authority, model routing, or
narrative planning. Prefer the existing owner subsystem and typed contract.

Do not replace deterministic rules with LLM reasoning, and do not let AI output
or client code become an alternative source of canonical truth.

## Archive rule

Files under [`docs/outdated/`](docs/outdated/README.md) are historical or
superseded and **must not be used as implementation instructions**. They remain
for provenance only.
