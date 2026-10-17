# CH5 FORENSIC RE-AUDIT REPORT

## 1. Executive Result
CH5 is PARTIALLY VERIFIED. The physical validations for crafting and transferring items are functionally implemented and structurally correct for legitimate inputs. However, the `targetOwnerId` trust boundary is entirely unvalidated during self-initiated transfers, allowing arbitrary items to be teleported across the map. Additionally, several integration tests are missing, and corpses globally disappear when a new combat instance initializes.

## 2. Current Repository / Runtime Baseline
- `server/domain/inventoryItem.ts`
- `server/api/gameRoutes.ts`
- `tests/ch5_surgical.test.ts`
- Regression Baseline: 218/218 tests passing, TypeScript clean, Build clean.

## 3. Authority Map
- Canonical location: `PlayerLifecycleState`
- Canonical inventory: `InventoryItemEngine`
- Time authority: `WorldClock` (mutated by `gameRoutes.ts` API route coordinator)
- Corpse authority: `TacticalCombatEngine` (Partial/Flawed Integration)

## 4. CH5-DEF-001 Re-Audit
### Tool Validation
VERIFIED. `InventoryItemEngine.craftItem()` accurately inspects the actor's inventory for the required tool category.
### Canonical Time Authority
VERIFIED. `craftItem()` extracts `craftingTimeSeconds` cleanly. The API route `/api/game/inventory/craft` consumes this integer to strictly mutate `WorldClock.advanceSeconds()`.
### Crafting Atomicity
VERIFIED. Materials are strictly decremented after validation but before instance creation.
### Determinism
VERIFIED. Instance creation is deterministic using `globalInstanceCounter`.

## 5. CH5-DEF-002 Re-Audit
### Source Authority
PARTIALLY VERIFIED. `gameRoutes.ts` independently validates access to non-player sources using `PlayerLifecycleState.locationId` and `TacticalCombatEngine.getParticipants()`.
### Client Payload Trust Boundary
NOT VERIFIED. The route fails to validate `targetOwnerId` when the player is the source (`sourceOwnerId === actorId`). This skips all proximity checks, permitting cross-actor and cross-location transfer (teleportation) directly from the client payload.
### Transfer Atomicity
VERIFIED. Stack splitting accurately decrements quantities and creates deterministic clone instances.
### Stack Splitting
VERIFIED. Safe isolation boundary via `globalInstanceCounter` cloning.
### Corpse/NPC Integration
NOT VERIFIED. Corpses reside inside `TacticalCombatEngine`. However, `combatEngine.clear()` is called in `/api/game/combat/encounter/init`, immediately permanently destroying all globally un-looted corpses.
### Ground/Location Loot
VERIFIED. Legitimate extraction requires geographic proximity matching.

## 6. Epistemic / Security Audit
PARTIALLY VERIFIED. The missing destination validation on transfers acts as a critical security bypass, converting knowledge assertion (a target's ID) into physical ownership delivery.

## 7. AI Boundary Audit
VERIFIED. The AI orchestration path (`DomainAdjudicationBridge`) assesses validation parameters but DOES NOT directly mutate `InventoryItemEngine`. It yields a structured checkpoint, meaning AI cannot convert a textual item claim directly into physical state.

## 8. CH3.2 Integration
VERIFIED. `InventoryItemEngine.transferItem()` securely blocks transferring an equipped item (`if (item.equippedSlot)`).

## 9. CH4 Integration
VERIFIED. Both `craft` and `transfer` API endpoints flawlessly bind to `WorldClock.getTimestamp()` to seed semantic event IDs, recording to `HistoricalChronicleEngine`.

## 10. Persistence / Reload
VERIFIED. Stack-split dependencies like `globalInstanceCounter` correctly persist in `exportState()` and restore in `importState()`.

## 11. Determinism
VERIFIED. ID generation relies entirely on integer counters; completely void of `Date.now()` or `Math.random()`.

## 12. Test Quality & Coverage
NOT VERIFIED. `tests/ch5_surgical.test.ts` successfully spans transfers 1-19, but explicitly lacks tests 20-28 required by the mandate (Cross-Actor isolation, AI Fabrications, CH3.2 and CH4 regressions).

## 13. Live Runtime Verification
PARTIALLY VERIFIED. API routes accurately parse logic, respond synchronously, and export verifiable state via debug. But end-to-end combat/corpse transfer flows could not be thoroughly validated due to the aforementioned target-ID architectural failure.

## 14. Cross-Challenge Regression
VERIFIED. 218/218 passing. No structural drift.

## 15. Forensic Watch-Outs
- **IMPLEMENTATION DETAIL:** The API routes heavily orchestrate cross-domain state changes (invoking clock, emitting to chronicle). The domain engines themselves remain completely ignorant of cross-domain impacts.
- **FORENSIC WATCH-OUT:** Corpses are strictly tied to `TacticalCombatEngine`'s current encounter state, rendering them permanently inaccessible globally upon any new combat initiation.

## 16. Defect Register
- **DEFECT-CH5-003**: Unvalidated Transfer Destination
  - Severity: HIGH
  - Exact Path: `server/api/gameRoutes.ts` POST `/inventory/transfer`
  - Observation: `targetOwnerId` skips validation if `sourceOwnerId === actorId`.
  - Required Behavior: Server must independently verify the actor has physical proximity/entitlement to the target ID.
- **DEFECT-CH5-004**: Corpse State Destruction on Combat Init
  - Severity: HIGH
  - Exact Path: `server/api/gameRoutes.ts` POST `/combat/encounter/init`
  - Observation: `combatEngine.clear()` destroys all corpses globally.
- **DEFECT-CH5-005**: Missing Explicit Integration Tests
  - Severity: MEDIUM
  - Exact Path: `tests/ch5_surgical.test.ts`
  - Observation: Missing 20-28 test coverages.

## 17. Requirement Matrix
| Requirement | Status | Evidence Level | Evidence |
|---|---|---|---|
| Canonical item-instance model | VERIFIED | Source | `InventoryItemEngine.itemInstances` |
| Inventory/world ownership | VERIFIED | Source | Correct ID assignments |
| Equipment authority | VERIFIED | Source | `equippedSlot` tracked |
| Equipment projection boundary | VERIFIED | Source | Blocked transfers |
| Epistemic item observability | VERIFIED | Source | AI boundary untouched |
| Resource discovery | VERIFIED | Source | Source validation |
| Loot/transfer authority | PARTIALLY VERIFIED | Source | Target validation missing |
| Durability/condition | VERIFIED | Source | Persistent mutation |
| Repair validation | VERIFIED | Source | Safe boundary limits |
| Crafting tool validation | VERIFIED | Source | `requiredToolCategory` check |
| Crafting time semantics | VERIFIED | Source | API advances clock |
| Crafting determinism | VERIFIED | Source | Counter-based instance IDs |
| Crafting atomicity | VERIFIED | Source | Strict material decrements |
| Crafting provenance | VERIFIED | Source | Standardized trace emission |
| NPC/corpse integration | PARTIALLY VERIFIED | Source | Cleared out on combat init |
| Persistence/reload parity | VERIFIED | Source | `globalInstanceCounter` exported |
| Causal/history integration | VERIFIED | Source | `chronicle.recordEvidence` |
| AI non-authority | VERIFIED | Source | `DomainAdjudicationBridge` non-mutating |
| CH3.2 integration | VERIFIED | Source | Transfer blocks equipped items |
| CH4 integration | VERIFIED | Source | Semantic time integration |
| Deterministic identity/order | VERIFIED | Source | Stable integer iterations |
| No duplicate authority | PARTIALLY VERIFIED | Source | CombatEngine acts as partial authority |
| Scope isolation | VERIFIED | Source | Cleanly bounded tests |

## 18. Final Traceability
All code audits map cleanly to `gameRoutes.ts`, `inventoryItem.ts`, and `combatEngine.ts`.

## 19. Final CH5 Status
CH5 — PARTIALLY VERIFIED
