# Dreamville External — Project Specification

## 1. Purpose

Dreamville External is the user-facing client for the Personal AI Story
Engine.

Its purpose is to provide a presentation and interaction layer over an
authoritative deterministic game engine maintained separately.

This project is experimental and is being evaluated as a potential
Google AI Studio development environment.

---

# 2. System Relationship

Conceptually:

                    PERSONAL AI STORY ENGINE

                 ┌──────────────────────────┐
                 │      CORE ENGINE         │
                 │                          │
                 │ Canonical State          │
                 │ Deterministic Rules      │
                 │ Simulation               │
                 │ Epistemics               │
                 │ Persistence              │
                 │ Validation               │
                 └────────────┬─────────────┘
                              │
                         Approved Contract
                              │
                              ▼
                 ┌──────────────────────────┐
                 │    DREAMVILLE EXTERNAL   │
                 │                          │
                 │ User Interface           │
                 │ Story Presentation       │
                 │ Character UI             │
                 │ Inventory UI             │
                 │ Maps                     │
                 │ Dialogue                 │
                 │ Interaction             │
                 └──────────────────────────┘

The external client is not authoritative.

---

# 3. Authoritative Truth

The external client must treat authoritative game-state data received
from the core system as authoritative input.

The client must not independently decide:

- whether an event occurred
- whether an action is legal
- whether an item exists
- whether an item can be equipped
- whether an NPC possesses knowledge
- whether a character is physically present
- whether travel is possible
- how much time a journey takes
- whether a player has permission
- whether a hidden event occurred

These are engine concerns.

---

# 4. Epistemic Separation

The system explicitly distinguishes:

- Canonical World Truth
- Player Knowledge
- NPC Knowledge
- AI Context

A client display must be constructed from information authorized for the
active viewer.

Hidden information must not be leaked simply because it exists in a
received data structure.

The client should prefer explicit visibility structures over assumptions.

---

# 5. Mock Data Phase

The first development phase must operate using mock structured data.

The mock contract should represent concepts such as:

- scene
- location
- world time
- player-visible characters
- dialogue
- player-visible inventory
- player-visible equipment
- available actions
- player-visible knowledge
- map information

Mock data exists solely to evaluate the external presentation layer.

It does not represent the authoritative game engine.

---

# 6. Future API Boundary

A future implementation may consume authoritative data through an API or
other approved communication mechanism.

The actual API contract must not be invented merely for convenience by
the external frontend.

Before real integration is implemented, the contract should be explicitly
defined and approved by the project's architectural control process.

---

# 7. User Actions

The external client may eventually send user action requests to the
authoritative engine.

Examples may include:

- movement requests
- dialogue choices
- interaction requests
- inventory actions
- equipment requests
- exploration actions

The external client submits requests.

The authoritative engine decides whether those requests are valid and what
state transition occurs.

The client must not treat its own request as proof that the action
succeeded.

---

# 8. AI Integration

Future AI integration must follow the project's bounded-context model.

The preferred conceptual flow is:

Canonical State
    ↓
Deterministic Filtering
    ↓
Bounded Context
    ↓
AI
    ↓
Proposal / Narrative
    ↓
Validation
    ↓
Presentation or Canonical Commit

The external client must not send unrestricted hidden canonical state to
the AI merely because doing so is technically easier.

---

# 9. Asset Strategy

The application may eventually require a large collection of:

- character artwork
- location artwork
- item artwork
- equipment artwork
- maps
- illustrations
- generated images
- audio
- other media

Large asset collections should not be treated as source-code files that
must all live permanently inside this repository.

The eventual system should be designed so that assets can be hosted in
appropriate external storage and referenced through stable asset
identifiers or URLs.

The exact asset-storage architecture is not defined by this document.

---

# 10. Incremental Development

Do not attempt to implement the complete application in a single step.

Prefer:

1. project foundation
2. story presentation
3. dialogue interface
4. character presentation
5. inventory presentation
6. equipment presentation
7. map presentation
8. structured mock-state integration
9. controlled API integration
10. bounded AI integration

Each phase should be testable independently.

---

# 11. Architectural Escalation Rule

If implementing an external feature requires changing:

- canonical game state
- deterministic simulation
- core domain models
- epistemic authority
- persistence authority
- validation authority
- provenance
- existing authoritative contracts

the external implementation must stop at the boundary.

The proposed dependency should be documented for architectural review.

---

# 12. AI Coding-Agent Rule

AI coding agents must not:

- reinterpret project identity
- invent unrelated product functionality
- generate replacement systems for the core engine
- make hidden architectural changes
- silently expand scope
- assume unrestricted knowledge is appropriate
- convert AI output directly into canonical state

Agents should inspect existing documentation before making changes and
should prefer minimal, incremental modifications.
