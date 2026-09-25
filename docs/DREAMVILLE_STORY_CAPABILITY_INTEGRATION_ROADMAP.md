# Dreamville Story + Capability Integration Roadmap

## Purpose

This is the master implementation map for the next Dreamville integration cycle. It records the complete workstream before implementation so later phases do not get forgotten or accidentally mixed together.

The governing workflow is:

> **Map → Audit → Implement one phase → Re-audit → Fix → Regression/Fallback check → Repeat**

A phase is not considered complete merely because the code looks correct. The phase must have a source-level audit and explicit regression coverage. The final program also requires a **10-pass integration audit loop** across the finished feature set.

---

# 1. Non-negotiable architecture

Dreamville has two different audiences for capability information.

### Player-facing

The player may see only:

- the character's actual learned skills/techniques/spells
- their progression level/XP where appropriate
- currently usable/effective abilities
- equipment-granted abilities when they are actually active
- normal gameplay outcomes

The player must not see internal authoring/simulation material such as:

- Channel / invocation internals
- adjudication worksheets
- HP/Energy/Strain calculation traces
- sensory directives used by the engine
- Capability DAGs
- derived-skill generation metadata
- internal capability IDs
- speculative simulation traces
- developer/AI workbench controls

### AI/internal

The AI/system may use:

- global capability registry
- world capability registry
- capability graph
- derived techniques
- feasibility simulation
- world-law/metaphysics checks
- character compatibility checks
- progression analysis
- resource/vessel analysis
- synthesis proposals
- canonical adjudication

Internal capability machinery may be created, transformed, or removed by the AI when it is not needed. It must never leak into the player Skillbook merely because the engine can represent it.

---

# 2. Capability decision contract

Every freeform supernatural/capability request follows this authority order:

1. **Does the character already own the capability?**
   - Yes → canonical execution/adjudication.
   - No → dry-run simulation only.

2. **Does the active world permit the requested effect/mechanism?**
   - No → WORLD_FORBIDDEN / UNSUPPORTED.
   - Never synthesize or acquire the forbidden skill.

3. **Does the character have a coherent mechanism or route?**
   - Yes → assess current execution/progression.
   - No → CHARACTER_INCOMPATIBLE unless a valid alternate route exists.

4. **Can the character currently execute it?**
   - Resource, vessel, seal, environmental, level, or condition gates are evaluated.

5. **Can normal progression develop it?**
   - If yes → DEVELOPMENT PROPOSAL.
   - If no → current/alternate route analysis.

6. **Only after explicit player acceptance** may canonical acquisition create a new SkillInstance.

A simulation is always a dry run. It never grants the skill, changes player state, or silently creates a canonical capability.

Examples that must remain true:

- An earthbender in a bending-only world cannot spontaneously learn Lightning Bolt.
- A bending-only world cannot create generic teleportation unless its authored rules explicitly provide a coherent teleport mechanism.
- A character can know that an effect exists in the world without automatically being able to learn it.
- Sufficient mana/energy alone can never override a world law or missing character mechanism.

---

# 3. Implementation phases

## Phase A1 — Canonical player capability boundary

**Goal:** make one authoritative player-safe capability projection the source for all player-facing APIs.

Work:
- Create a shared server-side player capability projection.
- Feed both `/api/game/capabilities` and `/run-canonical-state` from that projection.
- Keep global `getAllCapabilities()` / DAG / simulation data out of player projections.
- Make learned capabilities derive from actor SkillInstances, not from the global registry.
- Give the frontend a typed SkillInstance contract.
- Remove misleading API comments that describe the endpoint as returning the whole registered registry.
- Add boundary regression tests, including the `cap_venomous_bite` poison test: it must not appear for a character who does not own it.
- Preserve compatibility fields where necessary without reintroducing global capability leakage.

**Acceptance:**
- Character Skillbook receives only actor-owned learned skills.
- Effective action capability data may include active equipment grants.
- No DAG/adjudication/simulation data is sent to the player API.
- Internal interpretation remains server/AI gated.

---

## Phase A2 — World-law and capability simulation hardening

**Goal:** make speculative capability analysis genuinely world-authoritative.

Work:
- Audit `CapabilitySimulationEngine` against world lore, metaphysics, magic systems, custom rules, forbidden contradictions, and authored world capabilities.
- Make world support a hard gate rather than a genre guess.
- Separate:
  - WORLD_FORBIDDEN
  - CHARACTER_INCOMPATIBLE
  - CURRENTLY_BLOCKED
  - DEVELOPABLE
  - ALTERNATE_ROUTE
- Ensure a candidate from the global registry cannot by itself establish a world mechanism.
- Evaluate character lore/background, identity, existing powers, progression, vessel/body, resources, and environment.
- Add explicit development ceilings and resource prerequisites.
- Preserve pure dry-run behavior.

**Acceptance examples:**
- Avatar-style earthbender + Lightning Bolt → no capability creation.
- Bending-only world + Teleport → WORLD_FORBIDDEN.
- Arcane world + mage + Fireball not learned → DEVELOPABLE.
- World-permitted but character-incompatible effect → no automatic acquisition.

---

## Phase A3 — Acquisition and progression commit gate

**Goal:** guarantee that proposal, acquisition, and execution remain separate.

Work:
- Audit StoryActionAdvisor proposal creation.
- Ensure proposal generation itself does not mutate canonical state.
- Re-simulate stale proposals at acceptance time.
- Require explicit player acceptance before `acquireSkill`.
- Route accepted capabilities through canonical command authority.
- Persist the new SkillInstance and character capability only after successful canonical commit.
- Prevent duplicate acquisition and stale proposal reuse.
- Ensure rejected/invalid proposals have zero state mutation.

**Acceptance:**
- “simulate” never equals “learn”.
- “propose” never equals “learn”.
- “accept” is the only player-facing path that can commit a proposed skill.

---

## Phase A4 — Canonical Character + Skillbook surface

**Goal:** merge Character, Skills, and Spellbook into one coherent player surface.

Work:
- Keep `CharacterSurface` as the canonical player character viewport.
- Show identity, stats/resources, learned abilities, and progression together.
- Show only actor-owned skills.
- Hide/remove:
  - Adjudication Outcome
  - Capability DAG & Derived Skills
  - Channel/Scale authoring controls
  - AI synthesis controls
  - internal capability IDs
- Remove the obsolete `PowerWorkstation` player route if any route/import remains.
- Remove any duplicate StoryHUD/legacy character implementation if any remains.
- Allow internal AI tooling to exist independently, or remove unused tooling where it no longer provides value.

---

## Phase A5 — Story immediate-turn presentation

**Goal:** separate active-scene outcome flow from history.

The Story page should render, above the input/composer:

1. player action
2. dice roll
3. success/failure
4. immediate consequence
5. immediate narration

Then:

**What do you do?**
[composer]

The **Recent Actions** surface in More must contain only compact submitted player actions. It must not contain:

- dice UI
- success/failure detail
- consequence detail
- narration
- engine adjudication information

---

## Phase A6 — More menu and current-world projection

**Goal:** reduce primary navigation clutter and prevent cross-world leakage.

Primary navigation:
- Story
- Inventory
- Map
- active Combat when appropriate

More:
- Character
- World
- Recent Actions
- Codex
- Evidence / Relationships / Journal as applicable

World must be labeled **World** and must be scoped to the active world.

World character sections:
- At your current location
- Elsewhere in this world

Never show a global “Dreamville” roster.

Filtering must use authoritative `worldId`; location filtering must use authoritative `locationId`.

---

## Phase A7 — Current-scene comic generation

**Goal:** add the Story “+” scene generation workflow.

Flow:

`+` → **Generate Scene** → **Generate Image** / **Generate Prompt**

The source context is only:

- the most recent committed player action/turn
- immediate latest narration
- current location facts
- current visible cast
- immediate consequence/result

It must not use:
- prior scene narration
- old actions
- opening-scene events
- flashbacks
- future events
- alternate outcomes
- invented characters

Image output:
- comic-book sequential art
- one page
- 4-ish distinct panels
- visible panel separation
- same characters/wardrobe/equipment/position continuity
- immediate latest action and aftermath

---

## Phase A8 — True 3D dice presentation

**Goal:** make every die visibly identifiable as the die being rolled.

Geometry targets:
- D4 tetrahedron
- D6 cube
- D8 octahedron
- D10 pentagonal trapezohedron
- D12 dodecahedron
- D20 icosahedron
- D100 percentile-style polyhedron

The animation must rotate actual 3D faces/geometry, not a flat paper-like surface.

Regression should verify both:
- exact die type mapping
- presence of 3D geometry/rendering path

---

## Phase A9 — Redundancy retirement and route cleanup

**Goal:** eliminate duplicate or dead player-facing systems.

Audit:
- old character/world drawers
- duplicate spell/power surfaces
- developer workstations accidentally mounted as player UI
- obsolete routes/imports
- duplicate state fetches
- duplicated capability ownership logic

Remove what no longer has a real purpose. Internal AI tooling may remain only when it is actively used by the AI/runtime.

---

## Phase A10 — Ten-pass integration loop

After A1–A9 are implemented, perform ten deterministic audit passes.

Each pass checks:

1. ownership boundary
2. world-law boundary
3. simulation purity
4. acquisition/commit boundary
5. Character/Skillbook UI
6. immediate result vs Recent Actions
7. World scoping
8. scene freshness
9. dice geometry
10. legacy surface/route cleanup
11. API consistency
12. regression/fallback behavior
13. type safety
14. build/test integrity

Any failure re-enters the current phase before the next audit pass.

---

# 4. Final verification gate

The final gate is:

- `npm run lint`
- `npm test`
- `npm run build`
- GitHub Actions verification
- targeted regression suites for capability simulation, player boundary, Story UI, world scoping, scene generation, and dice

No phase is reported as passing unless the available verification evidence supports that claim.

---

# 5. Current checkpoint

**Roadmap status:** written and active.

**Phase A1 status:** implemented and source-audited.

A1 delivered:
- shared `server/api/playerCapabilityProjection.ts`
- both player capability endpoints now consume the shared projection
- learned skills are backed by actor SkillInstances
- effective capabilities are restricted to actor-learned or active equipment grants
- frontend SkillInstance typing
- player-boundary regression coverage, including the global `cap_venomous_bite` leak case

**A1 verification status:** the deterministic source audit completed **10/10 passes with all 13 checks passing**. GitHub Actions was not yet reporting a workflow run/status for the latest commit at this checkpoint, so runtime `npm test`, lint, and build are not being claimed as verified here.

**Current implementation phase:** A2 — World-law and capability simulation hardening.

Do not skip phases merely because a later feature is visually easier to implement. The canonical capability/world boundary must remain the foundation for the UI and story flow.
