# Phase 8.5 — Audit Pass 11: Combat Asset Cache Hardening

Date: 2026-09-22
HEAD: d97bdbeb9e75e5f5d5f2d15fa90c4db60dcb349b

## Scope

Audited the remaining presentation/performance gap around generated combat visual assets.

## Finding

The existing `CombatAssetService` already reused the shared media adapter and persisted presentation-only asset references, but its in-memory cache was keyed only by assetId and had no explicit size bound. A caller-provided assetId could therefore be reused across stories without a namespace, and long sessions could grow the process-local cache indefinitely.

## Remaster implemented

`server/services/combatAssetService.ts`

- Cache identity is now namespaced by `storyId + assetId`.
- `get()` remains backward-compatible while supporting story-scoped lookup.
- Persisted asset reuse now verifies storyId and effectId in addition to assetId and presentation-only status.
- The process-local cache is explicitly bounded to 256 records with oldest-entry eviction.
- Canonical combat state remains untouched; asset records remain presentation-only.
- No new image provider or asset authority was introduced.

## Remaining verified gaps

- Faction/settlement/economy runtime mutation authority still has not been verified in the examined repository surface, so no duplicate subsystem was created.
- Runtime `npm test`, lint, build, mobile verification, and live runtime proof remain external-verification work.

## Verification status

Static audit: PASS for the scoped asset-cache change.
GitHub combined status for this HEAD: not yet available/empty from the connector.
Workflow run lookup: not yet available/empty from the connector.
