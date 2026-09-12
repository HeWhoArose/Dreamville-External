# Dreamville External

## Personal AI Story Engine — External / User-Facing Client

Dreamville External is the external, user-facing application for the
**Personal AI Story Engine**.

This repository is responsible for the presentation and interaction layer
that users experience.

It is NOT the core game engine.

The authoritative core project is maintained separately in the
`Dreamville` repository.

---

## IMPORTANT: Project Identity

**Dreamville in this repository refers to the Personal AI Story Engine
project.**

It is NOT:

- the Dreamville music label
- a music artist platform
- a discography application
- a festival application
- a merchandise store
- a music player

Do not interpret the name "Dreamville" as referring to the music industry
or any unrelated external entity.

---

# Architectural Boundary

The Personal AI Story Engine follows this conceptual flow:

Canonical Game State
        ↓
Deterministic Game Logic
        ↓
Bounded Context
        ↓
AI Proposal / Narration
        ↓
Validation
        ↓
Canonical Commit

The external application is downstream of the authoritative game engine.

The external application must NOT become an alternative source of
canonical game truth.

---

# Core Engine Ownership

The core engine is maintained separately in the `Dreamville` repository.

The core engine is authoritative for:

- canonical world state
- player state
- deterministic simulation
- deterministic rules
- world time
- movement and travel
- inventory authority
- equipment authority
- epistemic state
- player knowledge
- NPC knowledge
- provenance
- persistence
- canonical event history
- validation of player actions
- validation of AI proposals

This repository must not silently recreate or replace these systems.

---

# External Client Responsibilities

This repository is responsible for the user-facing experience, including
areas such as:

- story presentation
- dialogue presentation
- player choices
- character/NPC interfaces
- inventory presentation
- equipment presentation
- maps and world presentation
- chronicle and dossier presentation
- menus
- progression presentation
- save/progress interfaces
- user settings
- visual presentation
- approved communication with the authoritative game system

The exact feature set will be implemented incrementally.

---

# Knowledge and Visibility Rules

The system distinguishes between:

WORLD TRUTH
≠
PLAYER KNOWLEDGE
≠
NPC KNOWLEDGE
≠
AI CONTEXT

The external client must preserve this distinction.

The client must not expose hidden canonical information merely because that
information exists in the backend.

Information displayed to a player must be based on information the active
viewer is authorized to know.

The client must not assume that:

- the player is omniscient
- the protagonist is omniscient
- NPCs know everything
- the AI knows everything
- the client can access unrestricted world state

---

# AI Rules

AI-generated text is not automatically canonical game state.

AI may be used for presentation, narration, dialogue, summarization,
or other approved bounded tasks.

AI output must remain downstream of deterministic game authority.

The external client must not replace deterministic rules with LLM
reasoning simply because an LLM can produce a plausible result.

The following distinction must remain intact:

AI proposal
    ↓
Validation by authoritative systems
    ↓
Canonical state change

not:

AI proposal
    ↓
Canonical truth

---

# Development Principle

This repository should be developed as an external client around the
existing engine rather than as a replacement for the engine.

When a requested external feature appears to require a change to the core
engine or its authoritative contracts:

1. Identify the dependency.
2. Explain which boundary is affected.
3. Do not silently redesign the core.
4. Propose the required change for architectural review.

---

# Current Development Status

This repository is currently an experimental external-development
environment.

The first phase uses mock structured data.

The application must not initially depend on the real core engine.

The purpose of the initial experiment is to determine whether Google AI
Studio can effectively develop and maintain the external/user-facing
layer
while the deterministic core continues to be maintained separately.

---

# GitHub and Branch Safety

The `Dreamville` repository remains the authoritative core repository.

This repository is separate from the core repository.

Changes made here must not be treated as changes to the core engine.

Experimental work should be committed incrementally and reviewed before
being considered stable.

---

# Important Rule for AI Coding Agents

Before modifying this repository, inspect its documentation and existing
structure.

Do not assume that generating a complete replacement application is the
correct approach.

Prefer small, incremental changes.

Do not introduce unrelated features.

Do not reinterpret the project identity.

Do not replace the architecture with a more convenient architecture.

When uncertain about an architectural boundary, stop and identify the
uncertainty rather than silently crossing the boundary.
