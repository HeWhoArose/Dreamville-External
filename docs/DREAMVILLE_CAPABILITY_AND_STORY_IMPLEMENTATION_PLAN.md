# Dreamville — Capability, Skillbook, World-Law & Check Implementation Plan
## Version 2.0 — Surgical Capability Contract

**Status:** ACTIVE
**Scope owner:** capability ownership, Skillbook projection, world-law compatibility, progression/acquisition and skill-check resolution.
**Does not own:** general Story UI, dice presentation, narration orchestration, persistence, spatial simulation or Operations UI.

## 1. Authority law

Owned capability ≠ global capability registry entry.

The player-facing Skillbook contains only actor-owned learned SkillInstances and explicitly active/effective grants that the product contract permits.

Simulation is not acquisition.
Proposal is not acquisition.
Only an explicit canonical acquisition path can create a learned SkillInstance.

## 2. Capability decision pipeline

REQUEST
 ↓
already owned?
 ├─ YES → canonical execution
 └─ NO → dry-run simulation
       ↓
world-law compatibility
       ↓
character mechanism/compatibility
       ↓
resource/body/progression gates
       ↓
DEVELOPMENT PROPOSAL or rejection
       ↓
explicit player acceptance
       ↓
canonical command
       ↓
SkillInstance persistence

Dry-run simulation must not mutate canonical capability state.

## 3. World-law categories

Every speculative capability resolves to one of:
- ALREADY_OWNED;
- WORLD_SUPPORTED_NOT_LEARNED;
- CURRENTLY_BLOCKED;
- DEVELOPABLE;
- CHARACTER_INCOMPATIBLE;
- WORLD_FORBIDDEN/UNSUPPORTED.

A global capability registry entry cannot establish world support by itself.

## 4. Character compatibility

Evaluation may use:
- character identity;
- lore/background;
- existing capabilities;
- progression;
- body/vessel constraints;
- resources;
- conditions;
- environment;
- authored world rules.

Novel synthesis must pass the same simulation and validation gates as an existing mechanism.

## 5. Skill checks

The check system owns the mapping from a situation to a canonical skill profile.

The expected core skill set is 18 skills:
- Acrobatics
- Animal Handling
- Arcana
- Athletics
- Deception
- History
- Insight
- Intimidation
- Investigation
- Medicine
- Nature
- Perception
- Performance
- Persuasion
- Religion
- Sleight of Hand
- Stealth
- Survival

Each skill must resolve to:
- governing ability;
- proficiency state;
- relevant modifiers;
- equipment/condition modifiers;
- advantage/disadvantage state where supported;
- canonical dice request;
- DC comparison;
- canonical result.

The LLM may explain or narrate a check. It must not invent the roll result.

## 6. Skill-check invocation

Checks are invoked by the canonical rules/action layer when a situation requires them.

Examples:
- noticing a hidden object → Perception;
- reading motives/deception → Insight;
- recalling magical knowledge → Arcana;
- performing before an audience → Performance.

Keyword recognition may assist intent interpretation, but it must never be the final authority when structured action context already identifies the required skill.

## 7. Acquisition

Accepted acquisition must:
- revalidate the proposal;
- execute through canonical command authority;
- create exactly one SkillInstance;
- persist it;
- update the same player projection used by Skillbook;
- emit the appropriate canonical event.

Rejected, stale or invalid proposals must produce zero capability mutation.

## 8. Equipment-granted capabilities

Equipment may grant an effective capability without creating a learned SkillInstance.

Therefore:
- executable/effective ≠ learned;
- equipped capability ≠ Skillbook ownership unless explicitly defined by product rules.

## 9. Player boundary

Do not expose:
- Capability DAG;
- adjudication worksheets;
- internal capability IDs;
- speculative simulation traces;
- synthesis metadata;
- developer AI controls.

Player UI consumes one canonical projection.

## 10. Implementation order

CAP-0 audit current ownership
↓
CAP-1 player-safe Skillbook projection
↓
CAP-2 world-law/character simulation
↓
CAP-3 acquisition/progression commit gate
↓
CAP-4 skill-check resolver completeness
↓
CAP-5 equipment-granted vs learned separation
↓
CAP-6 regression and 10-pass integration

Story UI and dice work are referenced by contract but implemented under the Story Runtime specification.

## 11. Acceptance

Prove:
- global registry entries do not leak into Skillbook;
- equipment grants are separated from learned skills;
- simulation is side-effect free;
- world-forbidden capabilities cannot be acquired;
- character-incompatible capabilities cannot be silently granted;
- stale proposals are rejected;
- all 18 skills resolve correctly;
- check results originate from the canonical dice/rules path;
- persistence uses existing campaign authority.

## 12. Boundary

This document owns capability truth. The Story Runtime document owns how checks and capabilities are displayed to the player. The AI Orchestration document owns how AI requests or explains capability-related tasks.