# DreamBook — Operations Menu Audit & Repair Contract
## Version 2.0 — Surgical Operations Scope

**Status:** ACTIVE AUDIT CONTRACT
**Scope owner:** Importer, Archive & Export, Dream Book workstation, Debug & Context.
**Does not own:** gameplay state, Story UI, persistence architecture, AI orchestration, spatial simulation or capability rules.

## 1. Purpose

Operations is a developer/workstation surface. It inspects and operates on canonical systems through their existing APIs. It must never become a second gameplay authority.

Visible Operations entries:
1. Importer
2. Archive & Export
3. Dream Book
4. Debug & Context

## 2. Importer

Importer handles source-story ingestion and adaptation.

Required flow:
source
 ↓
adaptation pipeline
 ↓
Story Bible
 ↓
review/conflict resolution
 ↓
entry point
 ↓
canonical World/Story Run creation

Saved-story and previous-import surfaces must use persisted canonical records rather than hardcoded samples.

Importer must activate the exact Story Run returned by the creation endpoint.

## 3. Archive & Export

Archive is a portability/recovery artifact, not the live database.

It must use the existing Campaign Archive Service and canonical repository serializers.

Required properties:
- partitioned canonical state;
- integrity/hash validation;
- cross-reference validation;
- safe staging;
- failure without destroying the source run;
- exact restored StoryRun identity returned to the UI.

Archive does not create a second persistence authority.

## 4. Dream Book workstation

Dream Book is the engineering traceability/evidence workstation.

It may track:
- requirements;
- status;
- evidence;
- verification results;
- active implementation iteration;
- blockers;
- audit history.

It is not:
- the player's in-world Story Bible;
- canonical story memory;
- the player Compendium;
- the source of gameplay truth.

## 5. Debug & Context

Developer Diagnostics remains read-only.

It may expose:
- chronicle;
- rules diagnostics;
- runtime state projections;
- validation;
- persistence diagnostics;
- acceptance status;
- evidence-based 'why did this happen?' traces.

It must not mutate gameplay state.

Sensitive canonical data must be projected safely.

## 6. Context and run identity

Operations requests must use the exact Story Run selected by the user/developer.

No dummy/default run may silently substitute for a real run.

WorldTemplate and StoryRun IDs must remain distinct.

## 7. Error handling

Classify failures as:
- UI/route failure;
- API failure;
- authority rejection;
- persistence failure;
- archive validation failure;
- deployment/environment failure;
- test/tooling failure.

Do not report a tooling failure as a gameplay defect.

## 8. Production boundary

Production durability belongs to the canonical persistence architecture, not this document.

Operations may expose persistence diagnostics, but it does not define a new datastore.

## 9. Acceptance

Importer:
- real saved stories;
- real previous imports;
- adaptation succeeds;
- canonical Story Run created;
- exact run activated;
- library can resume it.

Archive:
- export;
- validate;
- corrupt archive rejection;
- restore;
- exact restored run activation;
- reload verification.

Dream Book:
- requirements load;
- evidence records;
- promotion checks evidence;
- iteration records persist.

Debug:
- read-only;
- evidence-backed;
- no hidden-state leakage;
- no mutation.

## 10. Boundary

Story UI and deletion/resume behavior are specified in STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md.

Persistence architecture is specified in PERSISTENT_MULTIWORLD_AND_MEMORY_IMPLEMENTATION_PLAN_V1.md.

AI routing is specified in the AI Orchestration documents.

Overall roadmap remains the Master Plan.