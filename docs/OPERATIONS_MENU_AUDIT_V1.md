# DreamBook — Operations Menu Audit & Repair Contract
## Version 1.0

**Status:** AUDIT / IMPLEMENTATION TRACKER  
**Scope:** Importer, Archive & Export, Dream Book, Debug & Context  
**Repository:** `HeWhoArose/Dreamville-External`

---

# 1. Purpose

This document records what each Operations entry is supposed to do, what the current code actually does, what is authoritative, and what must be fixed before these tools are treated as production-safe.

---

# 2. Operations Menu

The canonical Operations menu contains:

1. Importer
2. Archive & Export
3. Dream Book
4. Debug & Context

The previous user-facing label "Living Bible" is retained only in technical identifiers/API paths for compatibility. The visible product name is now "Dream Book".

---

# 3. Importer

## Intended purpose

Bring an existing story into DreamBook, transform it through the story-adaptation pipeline, review the generated Story Bible, resolve conflicts, select an entry point, and create a playable Story Run.

## Current implementation

The UI is `src/components/ImportStoryModal.tsx`.

It supports:

- paste text;
- upload .txt/.md;
- saved-story surface;
- previous-import surface;
- adaptation profile controls;
- nine-stage pipeline progress;
- structured review;
- conflict resolution;
- entry-point selection;
- playable-session creation.

The server implementation is `server/api/adaptationRoutes.ts`.

The main pipeline is:

```
ingest
→ segment
→ extract
→ normalize
→ resolve
→ build Story Bible
→ choose entry point
→ instantiate player
→ create adaptation session
```

## Important limitation

The "Use Saved Story" surface currently loads a hardcoded sample rather than a real saved-story catalog.

The "Continue Previous Import" surface is currently a UI placeholder and does not yet expose a complete persisted previous-import selector.

Therefore the Importer is **partially implemented**, not fully production-complete.

## Required production behavior

- saved stories must come from canonical persistence;
- previous imports must come from persisted adaptation sessions;
- importing must create/associate a canonical World/Story Run correctly;
- successful import must activate the returned Story Run, not leave the old active Story ID selected;
- errors must be structured and visible.

---

# 4. Archive & Export

## Intended purpose

Provide lossless campaign portability and recovery.

## Current implementation

The archive UI is `src/components/ArchiveModal.tsx`.

The canonical archive implementation is:

- `server/domain/campaignArchive.ts`
- `server/services/campaignArchiveService.ts`
- `WorldRepository.exportCampaignArchive()`
- `WorldRepository.restoreCampaignArchive()`

The archive contains partitioned canonical state such as:

- world;
- player;
- inventory;
- NPCs;
- chronicle;
- narrative;
- capabilities;
- progression;
- combat;
- memories;
- living world;
- sensory configuration;
- adaptation state;
- assets.

Each partition is SHA-256 hashed.

Restore performs validation, staging, cross-reference checks and an atomic reference swap.

## Required production behavior

Archive export/import must always use the intended Story Run ID.

A restore must return the restored Story Run ID to the UI.

The UI must activate the restored run after successful restore.

Archive must be treated as a recovery/portability mechanism, not as the primary live database.

---

# 5. Dream Book

## Intended purpose

The previous Living Bible workstation is a development specification/evidence registry.

It tracks:

- implementation requirements;
- requirement status;
- source evidence;
- test evidence;
- trusted verification evidence;
- developer iteration history;
- active development phase;
- blockers;
- next task.

The server implementation is `server/domain/livingBible.ts`.

The API remains under:

- GET /api/game/living-bible
- POST /api/game/living-bible/evidence
- POST /api/game/living-bible/promote
- GET /api/game/workstation
- POST /api/game/workstation/iteration

## What it is NOT

It is not the player's in-world Story Bible.

It is not the canonical story narrative.

It is not the player's Compendium.

It is an engineering traceability and verification workstation.

The visible product label is now "Dream Book" to align the UI terminology with the project identity while retaining the internal technical API names for compatibility.

---

# 6. Debug & Context

## Intended purpose

Provide a read-only forensic inspector for canonical game state.

Current tabs include:

- Chronicle Timeline;
- Rule Inspector;
- Runtime State;
- Validation;
- Save Diagnostics;
- Final Acceptance.

It also provides "Why did this happen?" explanations based on canonical evidence.

The server implementation is `server/domain/developerDiagnosticsService.ts` and related game routes.

## Authority

This tool is read-only.

It must not mutate gameplay state.

## Required production behavior

Diagnostics should remain safe to expose only if sensitive canonical information is properly projected. Debug endpoints should eventually be access-controlled for public production users.

---

# 7. Why These Tools Can Show Errors

Code-level audit identifies several different failure classes that must not be confused.

### A. Route/UI wiring

Operations entries trigger modal/workstation components through App navigation.

### B. Story context

Archive and diagnostics depend on the correct Story Run context.

### C. Persistence

The current server persistence store defaults to a local file:

```
.dreambook/data.json
```

Cloud Run's container filesystem is not durable storage. Therefore production persistence must eventually move to an external durable datastore.

### D. Development workstation persistence

The Dream Book workstation currently writes:

```
data/workstation_ledger.json
```

This has the same Cloud Run durability problem.

### E. Archive correctness

Archive itself is designed for portability and recovery, but it must be invoked against the intended Story Run.

---

# 8. Production Rule

Do not declare Operations production-safe merely because the modal opens.

Each operation requires:

```
UI
→ API route
→ authority
→ persistence
→ error handling
→ reload
→ deployment/restart
→ regression
```

---

# 9. Required Acceptance Matrix

## Importer

- paste source;
- upload file;
- analyze;
- pipeline completes;
- review appears;
- conflict resolution works;
- entry point selection works;
- Story Run is created;
- returned Story Run becomes active;
- Story Library contains it;
- reload can resume it.

## Archive

- export active run;
- download archive;
- validate archive;
- corrupt archive rejected;
- import archive;
- restored run becomes active;
- Story Library contains restored run;
- reload can resume it.

## Dream Book

- requirements load;
- status filters work;
- search works;
- evidence records;
- promotion validates evidence;
- workstation loads;
- iteration recording persists;
- reload preserves ledger.

## Debug

- timeline loads;
- pagination works;
- rule diagnostics load;
- runtime diagnostics load;
- validation loads;
- persistence diagnostics load;
- acceptance matrix loads;
- "Why did this happen?" uses canonical evidence;
- no mutation occurs.

---

# 10. Production Persistence Gate

Operations cannot be declared production-safe while their important state depends only on local container files.

The eventual architecture must use:

```
Web / Android clients
        ↓
DreamBook API
        ↓
Canonical authorities
        ↓
Durable external persistence
```

Local JSON remains useful for development/test environments and migration/recovery tooling.

---

# 11. Completion Rule

Keep this audit document until every Operations acceptance scenario passes.

After production hardening is complete, it may be archived as an audit record rather than deleted, because it provides useful evidence of what was verified and why.
