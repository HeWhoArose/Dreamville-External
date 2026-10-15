# CH4 FORENSIC AUDIT REPORT

## 1. Executive Summary

CH4 — PARTIALLY VERIFIED

The foundational models for Historical Evidence, Significance Evaluation, Dossiers, and Chronicles are robustly implemented. Epistemic projection safely isolates secret entries, and rebuild capabilities deterministically reconstruct dossiers from raw evidence. However, critical defects exist regarding semantic deduplication (non-deterministic evidence IDs) and causality (LLM output being accepted directly as canonical chronicle truth via the AI orchestrator).

## 2. DreamBook Contract Reconstruction

- **Phase 1**: Produce structured historical evidence referencing canonical source events and deterministically evaluate significance based on rigid criteria, avoiding LLM heuristics.
- **Phase 2**: Aggregate significant evidence into canonical NPC dossiers as derived milestones, purely rebuildable from evidence without external dependencies.
- **Phase 3**: Aggregate historic evidence into a globally ordered chronological record. Deduplicate records robustly across replays.
- **Phase 4**: Project dossiers and chronicles securely, filtering out secret/faction information unless explicitly authorized. Ensure LLM historical summaries are derived from approved evidence, not the source of it.
- **Boundaries**: Derived records must never become a shadow canonical state. LLM must not author canonical facts directly into the chronicle.

## 3. Current Implementation Map

- `server/domain/historicalEvidence.ts`: Core interfaces for Evidence, Dossier, and Chronicle.
- `server/domain/significanceEvaluator.ts`: Deterministic evaluation rules.
- `server/domain/historicalChronicleEngine.ts`: In-memory evidence store, deduplication logic, projection filters, and rebuild/archive routines.
- `server/simulation/worldSimulationService.ts`: Lifecycle event hooks generating evidence.
- `server/api/gameRoutes.ts`: System action hooks and API projections (`/chronicle`, `/dossiers`).
- `server/domain/aiOrchestrator.ts`: Adjudication bridge emitting `CHRONICLE` state changes.
- `src/components/ChronicleView.tsx` & `CharacterDossier.tsx`: Presentation UI.

## 4. Authority Map

- **Canonical Authority**: `worldRepository.ts` and domain engines (Lifecycle, Combat, Inventory).
- **Derived Authority**: `HistoricalChronicleEngine` (stores historical evidence and orchestrates promotion).
- **Validator**: `SignificanceEvaluator` (evaluates category and thresholds deterministically).
- **Read-Only Projection**: `HistoricalChronicleEngine.projectPlayerChronicle` / `projectPlayerDossier` serving APIs.
- **Writer**: `worldSimulationService.ts`, `gameRoutes.ts`, `aiOrchestrator.ts`.
- **Persistence Owner**: `CampaignArchiveService` via `exportState` / `importState`.

## 5. Data-Flow Traces

### TRACE A — Lifecycle → Evidence
Canonical NPC lifecycle events (e.g., in `worldSimulationService`) hook into `chronicleEngine.recordEvidence` synchronously after updating the `worldRepository`.

### TRACE B — Evidence → Significance
`SignificanceEvaluator.evaluate()` checks event categories and text-matches on strings (e.g., "death") to yield deterministic significance (TRIVIAL, NOTABLE, SIGNIFICANT, HISTORIC).

### TRACE C — Evidence → Dossier
If `promotedToDossier` is true, `HistoricalChronicleEngine.promoteToDossier` creates or appends to `NpcDossier`, preserving temporal order and deduplicating via `evidenceId`.

### TRACE D — Evidence → Chronicle
If `promotedToChronicle` is true, `HistoricalChronicleEngine.promoteToChronicle` maps the evidence to a `ChronicleEntry` and appends it to the ledger.

### TRACE E — Dossier/Chronicle → Projection
API queries route through `projectPlayerChronicle` and `projectPlayerDossier`, which filter out milestones marked `SECRET` or `OBSERVERS_ONLY` if the player is not listed in `confidentialToEntityIds`.

### TRACE F — Evidence → AI Summary
**DEFECT**: In `aiOrchestrator.ts`, the LLM proposes state changes of kind `CHRONICLE`. If approved, the LLM's raw text (`change.value`) is directly converted into a new `HistoricalEvidence` record with hardcoded provenance (`direct_astronomical_observation`). LLM assertions are becoming canonical truth.

### TRACE G — Persistence
`HistoricalChronicleEngine.exportState` exports `evidenceStore`, `dossiers`, and `chronicleEntries`. `importState` restores them, with a fallback to `rebuildFromEvidence()` if dossiers are missing.

## 6. Requirement Matrix

| Requirement ID | Requirement | Classification | Status | Evidence | Evidence Level |
|---|---|---|---|---|---|
| CH4.EVIDENCE | Deterministic historical evidence model referencing source state | DREAMBOOK REQUIREMENT | VERIFIED | `historicalEvidence.ts` | SOURCE INSPECTION |
| CH4.SIGNIFICANCE | Deterministic promotion criteria without hidden heuristic authority | DREAMBOOK REQUIREMENT | VERIFIED | `significanceEvaluator.ts` | UNIT TEST |
| CH4.DOSSIER | Persistent dossier linked to canonical NPC | DREAMBOOK REQUIREMENT | VERIFIED | `historicalChronicleEngine.ts` | SOURCE INSPECTION |
| CH4.AGGREGATION | Dossier history aggregates qualifying lifecycle/social events | DREAMBOOK REQUIREMENT | VERIFIED | `historicalChronicleEngine.promoteToDossier` | UNIT TEST |
| CH4.REBUILD | Dossier deterministically rebuilt from canonical evidence | DREAMBOOK REQUIREMENT | VERIFIED | `rebuildFromEvidence()` | UNIT TEST |
| CH4.CHRONICLE | Chronicle entries temporally ordered, deterministic | DREAMBOOK REQUIREMENT | VERIFIED | `promoteToChronicle()` | SOURCE INSPECTION |
| CH4.CAUSALITY | Causal links exist only when supported by structured evidence | DREAMBOOK REQUIREMENT | NOT VERIFIED | LLM generates CHRONICLE records directly in `aiOrchestrator.ts` | SOURCE INSPECTION |
| CH4.DEDUP | Repeated promotion produces deduplicated historical records | DREAMBOOK REQUIREMENT | PARTIALLY VERIFIED | ID matching exists, but generated IDs use `Date.now()` and `Math.random()` | SOURCE INSPECTION |
| CH4.EPISTEMIC | Projection prevents hidden world facts leaking | DREAMBOOK REQUIREMENT | VERIFIED | `projectPlayerChronicle()` filters | UNIT TEST |
| CH4.SUMMARY | AI historical summaries are projections over approved evidence | DREAMBOOK REQUIREMENT | NOT VERIFIED | LLM summary becomes canonical truth | SOURCE INSPECTION |
| CH4.ISOLATION | Boundary integrity for presentation vs canonical mutation | DREAMBOOK REQUIREMENT | PARTIALLY VERIFIED | UI components exist (presentation), but AI injects canonical truth | SOURCE INSPECTION |

## 7. Epistemic / Security Audit

- Projections safely isolate `SECRET` and `OBSERVERS_ONLY` evidence records from unauthorized access.
- `GET /api/game/chronicle` correctly enforces these rules using the `projectPlayerChronicle` method.
- The `exportState` API route exports all states (lossless), which is a valid archival operation but exposes full history locally.

## 8. Persistence Audit

- **Partitions**: Handled by `CampaignArchiveService`, merging `chronicleState` (containing `evidenceStore`, `dossiers`, and `chronicleEntries`).
- **Restore / Rebuild**: Supported completely. Dossiers and chronicles map back to structured raw evidence and can be rebuilt deterministically if `dossiers` are omitted in the archive.
- **Integrity**: `evidenceId` linkages stay robust through serialization.

## 9. Determinism Audit

- **Identity Defect**: `server/api/gameRoutes.ts` uses `Date.now()` and `Math.random()` to dynamically mint evidence IDs (e.g., `ev_craft_${Date.now()}_${Math.random()}`). This breaks determinism and defeats deduplication if events are evaluated asynchronously or during restoration/replay.
- `worldSimulationService.ts` similarly leans on `Date.now()` (via timestamps) or arbitrary temporal values for IDs.

## 10. Cross-Challenge Dependencies

- **CH1 → CH4**: Clock timestamps correctly anchor evidence creation (VERIFIED).
- **CH2 → CH4**: Epistemic `confidentialToEntityIds` aligns with social observer projections (VERIFIED).
- **CH3 → CH4**: Lifecycle events synchronously push structured evidence into the historical engine (VERIFIED).
- **CH3.2 → CH4**: Capability invocation triggers evidence creation, but currently uses non-deterministic ID generation (PARTIALLY VERIFIED).

## 11. Forensic Watch-Outs

- **Atomicity Risk**: `worldSimulationService.ts` triggers `chronicleEngine.recordEvidence()` *after* `updatePlayerLifecycle()` executes. Since these are in-memory synchronous operations before persistence, partial writes to disk are mitigated, but memory state could drift if errors occur post-mutation.
- **AI Adjudicator Override**: `aiOrchestrator.ts` accepts unstructured `CHRONICLE` payloads and forcibly inserts them into the evidence store.

## 12. Test Coverage and Evidence Levels

- `tests/historicalEvidence.test.ts` provides UNIT TEST coverage for significance evaluation, epistemic projection, and deduplication logic.
- `tests/liveRuntimeProof.test.ts` provides LIVE HTTP coverage confirming that endpoints route through the epistemic projection filters.
- **Missing**: Deterministic evidence generation/replay tests (they currently use static IDs in tests).

## 13. Defect Register

**DEFECT ID**: CH4-DEF-001
- **Requirement ID**: CH4.DEDUP
- **Classification**: DREAMBOOK REQUIREMENT
- **Severity**: HIGH
- **Evidence**: `server/api/gameRoutes.ts` & `server/simulation/worldSimulationService.ts`
- **Evidence Level**: SOURCE INSPECTION
- **Affected Authority**: HistoricalChronicleEngine
- **Root Cause**: Extensive usage of `Date.now()` and `Math.random()` for evidence IDs.
- **Current Behavior**: Identical events replayed across different temporal bounds bypass deduplication.
- **Required Behavior**: Evidence IDs must be deterministically generated from canonical source event IDs and semantic properties.
- **Repair Direction**: Replace random ID generation with stable hashes or structured composite IDs.
- **Regression Risk**: LOW
- **Verification Needed**: Replay identical events and assert chronicle length is unchanged.

**DEFECT ID**: CH4-DEF-002
- **Requirement ID**: CH4.SUMMARY / CH4.CAUSALITY
- **Classification**: DREAMBOOK REQUIREMENT
- **Severity**: CRITICAL
- **Evidence**: `server/domain/aiOrchestrator.ts`
- **Evidence Level**: SOURCE INSPECTION
- **Affected Authority**: DomainAdjudicationBridge
- **Root Cause**: LLM `CHRONICLE` turn packages are directly translated to canonical historical evidence without underlying structural source events.
- **Current Behavior**: LLM invents historical truth and injects it.
- **Required Behavior**: LLM can only summarize existing evidence; canonical evidence must originate from engine actions.
- **Repair Direction**: Disable the `CHRONICLE` state change kind in the AI Orchestrator or explicitly segregate it into a non-canonical AI summary overlay.
- **Regression Risk**: HIGH
- **Verification Needed**: Assert AI cannot write historical evidence directly.

## 14. Optional Recommendations

- OPTIONAL: Expose a clear `/api/game/chronicle/rebuild` debug endpoint strictly for developer testing to validate invariant 5 in runtime.
- OPTIONAL: Transition `significanceEvaluator.ts` summary string checks to strict enum-based `Metadata` triggers to prevent narrative typo breaks.

## 15. Slice/Phase Status

- Phase 1 / Slice 1.1: VERIFIED
- Phase 1 / Slice 1.2: VERIFIED
- Phase 2 / Slice 2.1–2.3: VERIFIED
- Phase 3 / Slice 3.1–3.2: PARTIALLY VERIFIED
- Phase 4 / Slice 4.1–4.2: PARTIALLY VERIFIED

## 16. Final Audit Verdict

CH4 — PARTIALLY VERIFIED
