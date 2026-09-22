# Phase 8.5 — Audit Pass 9: Presentation, Replay, and Sandbox Connector Pass

Date: 2026-09-22
HEAD: 808f711728a1b698d68dbef67a73a8325c3531ed

## Scope

This pass re-audited the remaining Phase 8.5 gaps after the Pass 8 static-complete checkpoint, focusing only on missing connectors rather than recreating authoritative systems.

## Implemented in this pass

### 1. Combat animation renderer
File: src/components/combat/CombatAnimationLayer.tsx

- Track selection now honors instanceIndex and presentation conditions: ALWAYS, HIT, MISS, CRITICAL.
- SEQUENTIAL presentation advances using the selected track duration.
- PARALLEL presentation waits for the longest active track instead of immediately completing.
- INSTANT presentation completes immediately.
- The renderer remains presentation-only and consumes resolved combat instances; it does not mutate combat state.

### 2. Canonical replay UI
File: src/components/TacticalCombatView.tsx

- Added a bounded replay browser backed by the existing /combat/replays and /combat/replay endpoints.
- Replay selection and execution are exposed directly in the tactical workstation.
- Replay results report deterministic signature match/mismatch.
- No new replay authority was created.

### 3. Draft combat-effect sandbox
File: src/components/TacticalCombatView.tsx

- Added an explicit Draft simulation mode.
- Draft simulations can exercise the advanced effect fields without selecting an existing canonical capability.
- Live execution remains capability-bound and unchanged.
- When draft mode is disabled, simulation remains bound to the selected canonical capability and the server continues to replace submitted definitions with the authoritative capability definition.

### 4. Regression coverage
File: tests/phase8_5_combat_effects.test.ts

- Added animation-track regression coverage.
- Added bounded replay-record regression coverage.

## Remaining gaps

The following are intentionally not declared complete from static inspection alone:

- Generalized macro-world adapters into every existing settlement/faction/economy/quest authority, because the repository exposes the living-world simulation and geography authorities but no verified generic settlement/faction/economy mutation interface was identified in this pass.
- Full per-instance target assignment authoring UI.
- Full AoE geometry authoring UI.
- Full sequence child-effect authoring UI.
- Runtime/mobile verification.
- npm test, lint, and build execution on this exact HEAD.

## Anti-duplication check

No new damage, action economy, progression, spell, condition, replay, or world-state authority was introduced.

## Verification status

Static code review: PASS for the scoped connector changes.

Runtime execution: PENDING external execution evidence.

No green test/build claim is made from this pass.
