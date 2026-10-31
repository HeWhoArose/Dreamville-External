# World Director Phase 6 & Phase 7 Implementation Plan

## 1. Objective & Scope

Complete **Phase 6 (Cross-system outcome completeness)** and **Phase 7 (Continuous regression and player-run live acceptance)** of `/docs/WORLD_DIRECTOR_IMPLEMENTATION_PLAN.md`:

1. **Multi-Effect Outcome Projection (`ActionResolution`)**: Ensure that whenever a canonical action resolves multiple outcomes in a single turn—across **combat spells**, **combat capabilities**, and **story-action consequences**—every player-visible consequence and canonical state mutation is projected into `ActionResolution` (`physicalConsequences`, `playerVisibleConsequences`, and `canonicalStateChanges`).
2. **Semantic Narrative Completeness & Single-Rewrite Repair (`SemanticNarrativeReview` & `AIOrchestrator`)**: Extend `SemanticNarrativeReview` to verify that resolved player-visible consequences are represented in natural language within the narrative candidate. If a resolved consequence is omitted, trigger a **single rewrite** first, and **reject** the candidate if the consequence is still missing after the rewrite—without ever re-executing canonical action resolution or mutating world/combat state a second time.
3. **Phase 7 Engineering Deliverables & Live Acceptance Checklist**: Run deterministic regression suites, typecheck, and lint; update the progress ledger in `/docs/WORLD_DIRECTOR_IMPLEMENTATION_PLAN.md` (§2.23, §2.34, §2.35) with the engineering report (contracts changed, scenarios verified, known limitations/risks) and a reproducible player-run live-session acceptance checklist.

---

## 2. Architectural Changes

### 2.1 Combat & Spell Multi-Effect Outcome Projection
- **Files**:
  - `/server/domain/actionResolution.ts`
  - `/server/domain/combatPlayerActionService.ts`
- **Changes**:
  - Extend `CombatActionResolutionSummary` in `server/domain/actionResolution.ts` with optional structured multi-effect fields:
    - `healing?: number`
    - `secondaryDamage?: number`
    - `conditionsApplied?: string[]`
    - `conditionsRemoved?: string[]`
    - `forcedMovement?: { moved: boolean; distanceFeet: number; direction?: string; destination?: string; collided?: boolean; obstacleName?: string; collisionDamage?: number }`
    - `concentration?: { establishedSpellName?: string; brokenPreviousSpellName?: string; targetBrokenSpellName?: string; targetMaintainedConcentration?: boolean }`
  - Update `actionResolutionFromCombat()` to deterministically project each secondary outcome into:
    - `physicalConsequences` (damage, collision damage, healing, forced movement, defeat)
    - `playerVisibleConsequences` (natural-language descriptions of damage, healing, applied/removed conditions, forced movement and obstacle collision, concentration changes, and defeat)
    - `canonicalStateChanges` (`COMBAT_DAMAGE`, `COMBAT_COLLISION_DAMAGE`, `COMBAT_HEALING`, `COMBAT_CONDITION_APPLIED`, `COMBAT_CONDITION_REMOVED`, `COMBAT_FORCED_MOVEMENT`, `COMBAT_CONCENTRATION`, `COMBAT_DEFEAT`)
  - Update `CombatPlayerActionService.resolve()` in `server/domain/combatPlayerActionService.ts`:
    - **CAPABILITY branch**: Include `effectResult.secondaryDamage`, `effectResult.healing`, `effectResult.conditionsApplied`, `effectResult.conditionsRemoved`, and `effectResult.forcedMovement` in both `mechanicalSummary` and `actionResolutionFromCombat()`.
    - **SPELL branch**: Include `spellResult.healingApplied`, `spellResult.conditionsApplied`, `spellResult.conditionsRemoved`, `spellResult.movementApplied`, `spellResult.movementCollision`, `spellResult.concentrationEstablished`, `spellResult.brokenPreviousConcentration`, and `spellResult.targetConcentrationCheck` in both `mechanicalSummary` and `actionResolutionFromCombat()`.
    - Pass `actionResolution` into `narrator.generateNarrativeOnly(...)` so combat narration candidates undergo the same outcome-completeness review and single-rewrite repair as story turns.

### 2.2 Story-Action Multi-Consequence Completeness
- **File**:
  - `/server/mockEngine/serverMockAuthority.ts`
- **Changes**:
  - Ensure that when a story turn combines a skill check, scene interaction, item consumption, environmental hazard/fall resolution, intra-location movement, or condition-triggered health/death changes (`conditionStateAfterAction`), every player-visible consequence is appended once (deduplicated) to `actionResolution.playerVisibleConsequences` alongside `physicalConsequences` and `canonicalStateChanges`.

### 2.3 Semantic Narrative Completeness Check & Single-Rewrite Repair
- **Files**:
  - `/server/domain/semanticNarrativeReview.ts`
  - `/server/domain/aiOrchestrator.ts`
- **Changes**:
  - Add `'MISSING_VISIBLE_CONSEQUENCE'` to `SemanticViolationCode` in `server/domain/semanticNarrativeReview.ts`.
  - Extend `SemanticNarrativeReview.review()` input with `actionResolution?: ActionResolution`.
  - Implement natural-language consequence verification across resolved consequence categories in `actionResolution.playerVisibleConsequences`:
    - **Damage / Impact / Hazard Harm**: Checks that prose depicts physical impact, wound, pain, strike, burn, shock, or force when damage > 0 was inflicted.
    - **Healing / Restoration**: Checks that prose depicts mending, relief, vitality, or recovery when healing > 0 was applied.
    - **Conditions Applied / Removed**: Checks that prose depicts either the condition name or natural-language sensory/physical equivalents (e.g., knocked down/off feet/sprawling for `prone`, bound/held/entangled for `restrained`, dazed/staggered/frozen for `stunned`/`paralyzed`, etc.).
    - **Forced Movement & Collision**: Checks that prose depicts being pushed, pulled, shoved, hurled, driven back, or slamming into an obstacle when forced movement or collision occurred.
    - **Concentration Changes**: Checks that prose depicts focus wavering, a spell unraveling, or sustained focus when concentration breaks or shifts.
    - **Defeat / Incapacitation**: Checks that prose depicts the target falling, collapsing, or being defeated when `defeated` is true.
    - **Item Consumption / Use**: Checks that prose depicts using, drinking, consuming, or applying the item when an item was consumed/used.
  - When one or more resolved visible consequences are omitted from the candidate narrative:
    - Emit a `MISSING_VISIBLE_CONSEQUENCE` violation (`severity: 'MEDIUM'`, `decision: 'REWRITE'`) listing the omitted consequences in plain natural language (never requiring raw numbers, DCs, or internal engine tokens).
    - Include targeted instructions in `SemanticNarrativeReview.buildRewritePrompt()` so the single rewrite weaves the missing visible consequence(s) naturally into the scene.
  - In `server/domain/aiOrchestrator.ts`:
    - Pass `actionResolution: params.actionResolution` into `SemanticNarrativeReview.review(...)` across `reviewAndRepairNarrative()`, `validateNarrativeCandidate()`, and `generateNarrativeOnly()`.
    - Ensure that a `MISSING_VISIBLE_CONSEQUENCE` violation triggers a single rewrite via `reviewAndRepairNarrative`, and if the rewritten candidate still omits the consequence, `validateNarrativeCandidate` rejects it cleanly—without re-running `CombatPlayerActionService.resolve`, `CombatEffectEngine.resolve`, `executeSpellCast`, or story-action state mutations.

---

## 3. Verification & Phase 7 Deliverables

1. **Deterministic Test Suite (`/tests/worldDirectorPhase6OutcomeCompleteness.test.ts`)**:
   - **Multi-effect spell resolution**: Verify a spell that inflicts damage, applies a condition, forces movement with collision, and updates concentration projects all consequences into `ActionResolution`.
   - **Multi-effect capability resolution**: Verify a combat capability that inflicts damage, applies/removes conditions, and triggers forced movement or healing projects all consequences into `ActionResolution`.
   - **Story-action multi-consequence resolution**: Verify a story turn with multiple outcomes (skill check + hazard/condition/item consequence) records all visible consequences in `ActionResolution.playerVisibleConsequences`.
   - **Semantic review & single-rewrite repair without re-execution**:
     - Verify `SemanticNarrativeReview.review` returns `MISSING_VISIBLE_CONSEQUENCE` (`decision: 'REWRITE'`) when a resolved condition, forced movement, or damage outcome is omitted from candidate prose.
     - Verify `generateNarrativeOnly` repairs the omission via a single rewrite and that canonical resolution executes **exactly once** (no duplicate HP deduction, slot consumption, or state mutation).
     - Verify that if the rewritten candidate still omits the required consequence, validation rejects it cleanly.
2. **Documentation & Progress Ledger (`/docs/WORLD_DIRECTOR_IMPLEMENTATION_PLAN.md`)**:
   - Update §2.23 to mark Phase 6 and Phase 7 engineering deliverables `COMPLETE`.
   - Add §2.34 documenting Phase 6 contracts, files changed, and deterministic test results.
   - Add §2.35 documenting Phase 7 continuous regression results, compact engineering report (changed contracts, verified scenarios, known limitations/risks), and the reproducible player-run live-session acceptance checklist.
3. **Full Regression & Build Verification**:
   - Run targeted tests, full test suite, `compile_applet`, and `lint_applet`.
