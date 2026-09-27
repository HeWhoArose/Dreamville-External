# Dreamville — Story + Capability Integration Map
## Version 2.0 — Surgical Cross-System Contract

**Status:** ACTIVE INTEGRATION MAP
**Purpose:** define only the connections between Story presentation and canonical capability systems.

## 1. Ownership

Capability truth belongs to:
DREAMVILLE_CAPABILITY_AND_STORY_IMPLEMENTATION_PLAN.md

Story runtime/player interaction belongs to:
STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md

AI context/routing belongs to:
AI_ORCHESTRATION_MODEL_INTELLIGENCE_SPEC_V1.md

Persistence belongs to:
PERSISTENT_MULTIWORLD_AND_MEMORY_IMPLEMENTATION_PLAN_V1.md

Overall roadmap belongs to the Master Plan.

## 2. Canonical story-turn flow

PLAYER ACTION
 ↓
intent interpretation
 ↓
canonical action/check requirement
 ↓
rules/capability resolution
 ↓
canonical dice/check
 ↓
canonical consequence
 ↓
canonical event
 ↓
NarrativeOutcomeContext
 ↓
narration
 ↓
player presentation

Recent Actions is a history projection. It is not the source of truth.

## 3. Capability → Story

Story may request:
- capability execution;
- capability check;
- skill check;
- progression action;
- acquisition proposal.

Story does not mutate capability state directly.

## 4. Story → Capability

The action interpreter supplies structured intent.
The capability authority decides:
- whether the capability exists;
- whether the actor owns it;
- whether it is legal;
- whether it can currently execute;
- whether a check is required.

## 5. Check → Story

The check result returned to Story must contain:
- skill;
- governing ability;
- dice formula;
- individual dice results;
- modifier;
- total;
- DC where applicable;
- success/failure;
- critical state where applicable;
- canonical consequence.

Story renders these values. It does not recalculate them.

## 6. Immediate result vs history

Active turn:
- player action;
- dice;
- check result;
- immediate consequence;
- immediate narration.

Recent Actions:
- compact submitted player actions only.

Do not duplicate the complete turn result inside Recent Actions.

## 7. Scene media

Current-scene image/comic generation uses only the latest committed turn and current scene facts.

Do not source it from stale action history or invent alternate outcomes.

## 8. Integration tests

Required chains:
- action → skill resolution → dice → result → narration;
- capability proposal → acceptance → SkillInstance → Skillbook;
- equipment grant → effective action → no false learned Skillbook entry;
- world-forbidden capability → rejection → no state mutation;
- stale proposal → revalidation failure → no mutation;
- latest turn → scene media context.

## 9. Completion

This map is complete when the owning documents pass their own acceptance gates and cross-system tests prove the connections above.