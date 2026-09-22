# Phase 8.5 — Forced Movement & Environmental Collision Audit

## Audit scope

User-requested mechanic:

> A combat effect can force an opponent through the battlefield; if the target reaches a wall, boundary, destructible object, or another creature, movement stops or produces a configured collision consequence such as secondary impact damage.

The audit explicitly checked for an existing authoritative environmental/combat system before adding code.

## Existing authoritative systems found

- `server/domain/combatEngine.ts` — authoritative tactical combat state, participant positions, map bounds, obstacles, hazards, damage, death, conditions, and destructible environment objects.
- `server/domain/combatEffectEngine.ts` — authoritative combat-effect resolution and capability effect validation.
- `server/domain/spellRuntime.ts` — authoritative spell execution, including existing PUSH/PULL movement effects.
- `TacticalCombatEngine.damageDestructibleObject()` — existing authority for structural damage and environment destruction.
- `TacticalCombatEngine.applyCombatDamage()` — existing authority for creature damage, defenses, concentration, morale, death, and conditions.

No second environmental-damage engine was created.

## Implementation

### 1. Canonical forced-movement resolver

Added `TacticalCombatEngine.resolveForcedMovement()`.

It resolves movement one cell at a time and checks, in order:

1. Battlefield boundary
2. Impassable obstacle / wall
3. Existing destructible environment object
4. Existing creature occupying the destination cell

Supported movement:

- PUSH
- PULL

Safety bounds:

- Maximum forced movement distance: 50 cells
- Maximum collision-resolution count: 3

### 2. Collision consequences

Configured collision profiles can provide:

- Secondary damage to the forced-moving creature.
- Damage to a destructible environment object.
- Optional damage to a creature struck during body collision.
- Damage type.
- Whether movement stops at the first collision.
- Bounded multi-collision behavior.

All creature damage continues through `applyCombatDamage()`.

All structural damage continues through `damageDestructibleObject()`.

### 3. Combat-effect integration

`CombatEffectDefinition.forcedMovement` is now supported for:

- SINGLE_ATTACK
- MULTI_INSTANCE
- CHAIN

The resolved attack instance carries:

- primary damage
- secondary collision damage
- forced-movement result
- collision details

The result also exposes aggregate `secondaryDamage`.

### 4. Spell integration

Existing spell PUSH/PULL movement now routes through the same canonical resolver in production combat.

This means a spell and a combat capability do not have separate collision rules.

### 5. Character Genesis integration

The Character Genesis capability-generation pipeline now preserves AI-authored forced-movement definitions instead of dropping them during sanitization.

Therefore a generated ability can describe a mechanic such as:

- PUSH 6 cells
- Wall impact: 2d6 bludgeoning
- Object impact: 2d6 structural damage

The canonical combat validator still remains the final authority.

## Regression tests added

The Phase 8.5 test suite now includes coverage for:

- Wall collision with secondary impact damage.
- Destructible object collision and destruction.
- Creature-on-creature collision.
- Spell PUSH using the shared collision resolver.
- Rejection of unsafe collision damage formulas.

## Static re-audit

The latest GitHub Actions verification reached TypeScript compilation and no longer reports any errors for:

- `CombatForcedMovementDefinition`
- `CombatForcedMovementResult`
- `CombatCollisionProfile`
- `forcedMovement` on public attacks
- spell movement resolver typing

This confirms the newly introduced forced-movement API is not currently producing additional TypeScript errors.

## Runtime verification status

Full runtime verification is still pending.

The repository's current `main` branch fails at the existing `npm run lint` gate on multiple unrelated TypeScript errors. Because the verification workflow stops on lint failure, `npm test` and `npm run build` are skipped in the GitHub Actions run.

Latest relevant verification run:

- Commit: `e06d07561e969ccebba2a2340d38b4e39655d118`
- Workflow run: 290
- Result: lint failure; tests/build skipped

The lint errors include pre-existing issues in combat routes, boss phases, story-check types, combat participant typing, replay/environment state typing, animation service, TacticalCombatView, Character Genesis, and other unrelated modules.

Therefore this feature is **implementation-complete at the static/integration level but not yet runtime-verified**.

## Audit conclusion

The requested mechanic is now represented as a capability of the existing combat system rather than a duplicate subsystem.

Authoritative chain:

Player/AI intent
→ canonical combat effect
→ attack resolution
→ canonical forced movement
→ collision detection
→ existing creature/environment damage authority
→ canonical combat events
→ replay/persistence
→ presentation
