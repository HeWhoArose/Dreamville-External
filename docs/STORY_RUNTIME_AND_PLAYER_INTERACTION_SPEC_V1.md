# DreamBook — Story Runtime & Player Interaction Specification
## Version 1.0 — Surgical UI/Interaction Contract

**Status:** ACTIVE
**Scope owner:** Story runtime presentation and player interaction.
**Consumes:** canonical character/check/world/run state and AI outputs.
**Does not own:** canonical game rules, persistence, AI routing, spatial simulation or capability authority.

## 1. Purpose

This document owns the player-facing interaction problems that were previously scattered across capability, AI and Operations documents.

Primary concerns:
- dice presentation;
- immediate turn presentation;
- Story/OOC/Continue interaction;
- player portrait/avatar beside player speech;
- resume-current-run behavior;
- safe deletion of worlds and runs;
- clear skill-check presentation;
- narration context presentation boundaries.

## 2. Story turn presentation

Every completed turn is presented as:

1. player action;
2. canonical dice/check result when applicable;
3. success/failure;
4. immediate canonical consequence;
5. immediate narration.

The Story UI renders canonical results. It does not recompute them.

## 3. Dice presentation

The dice renderer must visibly represent the actual die being rolled.

Supported visual types:
- D4 tetrahedron;
- D6 cube;
- D8 octahedron;
- D10 pentagonal trapezohedron;
- D12 dodecahedron;
- D20 icosahedron;
- D100 percentile representation.

Animation must use real 3D geometry/physics presentation rather than a flat rotating sheet.

Critical rule:

CANONICAL DICE ENGINE
        ↓
authoritative roll values
        ↓
3D presentation

The renderer may animate a forced canonical result, but must never replace the canonical result with a client-generated roll.

## 4. Skill-check display

Every check display should identify:
- skill;
- governing ability;
- proficiency;
- modifier sources where appropriate;
- dice formula;
- individual die results;
- modifier;
- total;
- DC when applicable;
- outcome;
- consequence.

The check authority owns the result. The UI only presents it.

## 5. Story / OOC / Continue

The composer supports three interaction states:

### Story
Normal gameplay. The player's message is interpreted as an in-world action or dialogue request.

### OOC
Out-of-character assistance. The player can ask about canonical state, memories, inventory, rules, characters or the current world without forcing the request through normal story narration.

### Continue
Explicitly asks the narrative system to continue from the current canonical state when the interaction is waiting for continuation.

These are interaction modes, not separate game engines.

## 6. OOC safety

OOC reads use authorized context.

OOC mutations use registered canonical tools only:

OOC request
 ↓
task interpretation
 ↓
registered tool
 ↓
canonical command
 ↓
validation
 ↓
commit
 ↓
OOC response

Do not implement OOC mutations as regex/keyword shortcuts that directly alter repository state.

Examples of legitimate future tools:
- get character sheet;
- get inventory;
- search memory;
- get authorized lore;
- get world state;
- get combat state;
- get quests;
- advance/rest through canonical commands;
- travel through UniverseRuntimeService;
- explicitly authorized item/entity operations.

Every mutation must remain auditable and reversible through the normal canonical event/persistence path.

## 7. Continue semantics

Continue must not fabricate a new event simply because the player pressed the button.

Correct behavior:

Continue
 ↓
read current canonical state
 ↓
determine whether autonomous/world/narrative continuation is available
 ↓
if a canonical action is required, resolve it
 ↓
generate narration from approved outcome

## 8. Narration context

The Story UI does not assemble the model prompt itself.

WorkingContextEngine/NarrativeContinuityEngine provide the authorized context.

Relevant context may include:
- current scene;
- player identity/state;
- active NPC/speaker;
- visible actors;
- current location/world;
- authorized world knowledge;
- relevant memories;
- NPC-specific continuity;
- relationships;
- quests/story threads;
- plot/plan context;
- world momentum;
- recent canonical changes;
- narrative/rules profile;
- sensory facts;
- canonical action outcome.

Retrieval must be relevance- and authorization-based. The entire campaign is never blindly injected into the prompt.

## 9. Player portrait

Player-authored messages should display a small round player portrait/avatar beside the message.

Identity source:
- active Story Run character identity;
- approved character asset where available;
- otherwise the canonical default placeholder.

The portrait is presentation metadata. It does not become a gameplay identity authority.

## 10. Resume Run

Dashboard and Story Library must use the canonical StoryRun ID.

Required flow:

Dashboard
 ↓
select persisted StoryRunSummary
 ↓
GET/load exact StoryRun
 ↓
activate exact run
 ↓
Story screen

No dummy/default run may be substituted when a real run ID exists.

Acceptance:
- create run;
- leave run;
- dashboard;
- click Resume;
- same StoryRun ID;
- same world;
- same character;
- same latest canonical state;
- reload;
- resume again.

## 11. World and Story Run deletion

Deletion must be explicit and destructive.

Required flow:

Delete
 ↓
show exact title/type
 ↓
explain consequences
 ↓
require deliberate confirmation
 ↓
canonical deletion
 ↓
persistence commit
 ↓
library refresh

For high-risk deletion, use exact-title confirmation or equivalent deliberate confirmation.

Never delete through an accidental single click.

World deletion must clearly distinguish a reusable WorldTemplate from a Story Run.

## 12. Library identity

World Library and Story Library represent different entity types.

World Library:
- reusable WorldTemplates;
- world metadata;
- world visual identity;
- available run creation.

Story Library:
- actual persisted Story Runs;
- current progress;
- last played state;
- resume target.

Do not substitute one entity for the other.

## 13. Visual design direction

Competitive UI research may inform presentation patterns such as colorful tabletop-like dice, clear continuation controls and compact OOC interaction.

DreamBook must not copy proprietary source code, assets or hidden implementation.

Visual similarity is a product-design reference; canonical authority remains DreamBook's own architecture.

## 14. F&F research note

Existing project research notes describe Friends & Fables patterns including dedicated OOC interaction, continuation/manual interaction, tool-assisted OOC workflows and 3D dice presentation.

Those notes are treated as design research, not as proof of the competitor's internal implementation.

Where a current official source cannot verify a technical claim, the claim must be labeled unverified rather than treated as fact.

## 15. Acceptance matrix

### Dice
- every supported die is visually identifiable;
- canonical value is displayed correctly;
- animation cannot change the result;
- renderer does not regress to flat-sheet presentation.

### OOC/Continue
- Story and OOC are distinct interaction modes;
- Continue resumes only from canonical state;
- OOC answers use authorized context;
- OOC mutation uses registered canonical tools;
- no keyword-based direct mutation.

### Narration
- current scene is present;
- relevant player/world/story context is present;
- authorized memories are retrievable;
- NPC-specific context is available when relevant;
- hidden facts are excluded;
- narration cannot create canonical outcomes.

### Resume
- exact persisted StoryRun is reopened;
- no dummy run substitution;
- state survives reload.

### Deletion
- world and run are clearly distinguished;
- destructive confirmation is explicit;
- deleted entities disappear from canonical library projections.

### Portrait
- correct active character identity;
- stable persisted asset;
- fallback placeholder when no approved art exists.

## 16. Verification gate

Required:
- npm test;
- npm run lint;
- npm run build;
- targeted Story/UI/API tests;
- live resume/delete/OOC/dice checks where applicable.

Do not mark a UI feature VERIFIED from source inspection alone.