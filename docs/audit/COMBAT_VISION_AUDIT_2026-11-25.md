# Combat system audit against the Phase 8.5 vision (2026-11-25)

Scope: the unified combat vision (one deterministic engine, one effect-resolution system, one canonical authority, AI as
interpreter/narrator/animator) checked against the repository as it stands on `feat/unified-audit-reconciliation-programme`.
Everything below was read from the code and tests, not from the historical audit documents.

Status legend: **Built** (implemented and tested), **Partial** (implemented but narrower than the vision), **Missing** (no
implementation found), **Unverified** (exists but not exercised by any test I could find).

## Verdict in one paragraph

The core of the vision is real. The engine is deterministic and seeded, effects resolve through one pipeline with eight resolution
modes, a five-beam attack really is five independent rolls in one action and one atomic transaction with rollback and replay, and
a world effect can commit a macro-scale change instead of subtracting hit points. The gaps are in the layers around it: sequences
cannot branch on a previous step, there is no separate delivery check, the trigger system stops at conditions and lacks turn-start
and turn-end events, boss phases cannot summon or hold resources and their abilities become empty stubs, the environment has four
hazard types and no bridges, pits or traps, and the combat screen has no inspector, no boss phase panel and no world-effect preview.
One more point is about my own work in this session: Extra Attack, two-weapon fighting, falling damage and underwater penalties
were added as direct engine methods, not as effects in the unified pipeline, and nothing yet feeds `attacksPerAction` from a class.

## 1. The fundamental combat experience

| Vision | Status | Evidence |
|---|---|---|
| Turn-based, tactical: initiative, positioning, movement, range, awareness | Built | `combatEngine.ts` (4,500 lines): initiative, grid movement, reach, line of sight, perception filter (`isParticipantKnownToActor`) |
| Mechanically authoritative | Built | Dice are a seeded `LocalDiceEngine`; seed and roll counter are saved with state; AI never rolls or decides |
| Ruleset-flexible | Built | `rulesProfileEngine.ts`: `FULL_DND`, `HYBRID_DND`, `CUSTOM_HOMEBREW_DND`; per-rule switches added this session (`rulesCatalogue.ts`) |
| Works across PROTAGONIST, SIDE_CHARACTER, FREE_ROAM | **Unverified** | No combat test references the side-character or free-roam modes |
| Visually expressive, animations match outcomes | Partial | See section 10 |

## 2. Attack and ability possibilities

| Vision | Status | Evidence |
|---|---|---|
| A. Single attacks | Built | `SINGLE_ATTACK`; `executeAttack` |
| B. Multi-instance (one action, N independent hits) | Built | `MULTI_INSTANCE` with `instanceCount`, per-instance targets; test "five-beam multi-instance attack consumes one Action and resolves five independent instances"; bounded at 50 instances |
| C. Multi-target | Built | `targetingMode` `MULTI_TARGET`, `PER_INSTANCE`, `maxTargets`; duplicate per-instance targets preserved |
| D. Area of effect | Built | `AREA` with POINT, LINE, CONE, CIRCLE, SPHERE, RING, WALL shapes; per-target defence pipeline; origin and per-target range validation |
| E. Chain / bounce | Built | `CHAIN` with `chainCount`, `chainJumpRangeCells`; deterministic expansion test |
| F. Sequence / combo, next step depends on previous result | **Partial** | `SEQUENCE` runs child effects in order, but unconditionally: `combatEffectEngine.ts` loops every child and the type has no condition field. A failed child rolls the whole action back instead of branching |
| Retargeting only by explicit policy | Built | `retargetPolicy: 'NONE' | 'RETARGET_ON_DEATH'` |
| "Not hardcoded individually" | **Partial** | The effect pipeline honours this. Extra Attack and two-weapon fighting added this session live in `executeAttack` / `executeOffhandAttack`, outside the effect pipeline |

## 3. Kinds of resolution

| Vision | Status | Evidence |
|---|---|---|
| Attack vs defence, saving throw, area, multi-instance, chain, sequence | Built | The eight `CombatResolutionMode` values |
| Execution check (can the character activate it) | Built | `resolveExecutionGate`: `CHECK_REQUIRED` rolls against `executionDifficultyClass`; `executionFailureOutcome` |
| Delivery check (does it reach the target, e.g. blocked by anti-magic) | **Missing** | No delivery stage exists. Line of sight and range are validated, but there is no separate roll or event for "executed but blocked before arrival" |
| Semantic outcome | Built | `OUTCOME` with 13 outcome types: erase, banish, teleport, transform, seal, summon, resources, environment, world state |
| World effect | Built | `WORLD_EFFECT` resolves to a preview in the effect engine and commits through `worldEffectEngine.apply` (`gameRoutes.ts:5654`); macro abstraction for scales above ENCOUNTER |

Consequence: the "beginner mage fails to execute / master executes but anti-magic blocks / executes, arrives, resisted" example
works for the first and third cases and cannot represent the middle one.

## 4. Defences, damage, status effects, triggers

| Vision | Status | Evidence |
|---|---|---|
| AC, saves, advantage and disadvantage, crits, resistance, vulnerability, immunity | Built | `resolveStandardAttack`, `conditionEngine.resolveDamage`, per-type profiles |
| Canonical damage types | Built | `damageType` through the whole pipeline |
| Status conditions incl. custom | Built | `conditionEngine.ts`; custom definitions supported |
| Ongoing effects: DoT, HoT, regeneration, buffs, shields, stacking, expiry | Built | `damagePerTick`, `healingPerTick`, intensity stacking, elapsed-time ticks (`conditionEngine.ts:519`) |
| Generic triggers `ON_ATTACK ... ON_TURN_END` | **Partial** | Events fired: `ON_ACTION, ON_ATTACK, ON_HIT, ON_MISS, ON_DAMAGE, ON_SAVE, ON_MOVE, ON_KILL, ON_DEATH, ON_REACTION, ON_ROUND_START, ON_ROUND_END`. Missing: `ON_TURN_START` and `ON_TURN_END` (per-actor, not per-round). The events drive conditions only, not capabilities or custom abilities |

## 5. Action economy, reactions, interruptions

| Vision | Status | Evidence |
|---|---|---|
| Action, Bonus Action, Reaction, Movement, Object Interaction | Built | `combatActionEconomy.ts` |
| Special resources in the ledger | **Partial** | Per-participant `combatResources` exists and outcomes can grant or remove them, but they are not part of the turn resource ledger |
| Split movement, Dash, Dodge, Disengage | Built | Tested (`combatTurnRules`, `phase5.core-combat`) |
| Ready Action with trigger execution | Built | `armReadyAction`, `resolveReadyTriggers` (historically unfinished, now present) |
| Opportunity attacks | Built | `resolveOpportunityReactions`; multiple attackers resolve deterministically |
| Generic reaction framework with priorities and costs | Built | `combatReactionEngine.ts`: triggers `ACTOR_MOVED, ACTOR_ATTACKED, TARGET_ENTERED_REACH, TURN_STARTED, CUSTOM`, priorities |
| Interrupting before or after resolution stages | **Partial** | Reactions fire on movement, attack and turn-start triggers; there is no hook between the attack roll and the damage, or between execution and delivery. `interruptConcentration` exists |
| Concentration and channelled abilities | Built | `spellRuntime` concentration, `CONCENTRATION` execution mode, `/combat/interrupt` |

## 6. Movement and interactive battlefields

| Vision | Status | Evidence |
|---|---|---|
| Grid movement, speed, split movement, reach, range, line of sight | Built | `moveActor`, spatial grid cost, `resolveSpatialLineOfSight` |
| Cover | **Partial** | HALF, THREE_QUARTERS, TOTAL levels apply to AC; cover is set on a participant, not derived from terrain geometry (obstacles only block as TOTAL) |
| Difficult terrain | Built | Movement cost includes difficult cells |
| Collision, forced movement | Built | Wall, boundary and creature collision with secondary impact damage; routed through one authority |
| Destructible objects change canonical state | Built | `destructibleObjects`; test "forced movement ... can destroy an existing destructible object"; `ENVIRONMENT_DESTROYED` outcome |
| Environmental damage, traps, hazards | **Partial** | `DynamicHazardZone` supports only four types: `fire_zone`, `ice_patch`, `poison_cloud`, `barricade`, each with damage per turn |
| Bridges, pits, temporary walls, terrain changes | **Missing** | `addObstacle` adds a static impassable cell; there is no temporary barrier lifetime, pit, bridge or trap type |
| Falling damage | Built this session | `applyFallDamage` (1d6 per 10 feet, up to 20d6, prone). Direct method, not yet triggered by pits or forced movement off a ledge |

## 7. Bosses and intelligent enemies

| Vision | Status | Evidence |
|---|---|---|
| Multi-phase, health-threshold transitions | Built | `bossPhaseEngine.resolvePhase`, `evaluateAndPersist`, route `/combat/boss/evaluate-phase` |
| Changing priorities, abilities, environment | Partial | Priority modifiers and environment hazards apply. `buildPhaseEffect` turns each phase ability into a bare `SINGLE_ATTACK` stub with only an id and name: no damage, no range, no saves |
| Summoning reinforcements on a phase | **Missing** | `SUMMONED` exists as an outcome, but phase definitions cannot trigger it |
| Custom resources (rage, energy, legendary charges, shields) on bosses | **Missing** at phase level | Resource outcomes exist; phases do not declare or reset resources |
| Transition is a canonical event | Built | Phase persisted and evented, not narrated |
| NPC tactical AI with survival, ally protection, finishing weak targets | Built | `tacticalDecisionPolicy.ts` (575 lines), `combatTacticsService.ts`; AI proposal clamped and validated, deterministic fallback |
| Decisions only on perceivable information | Built | `isParticipantKnownToActor` filters known allies and enemies |

## 8. Mythic, eldritch and cosmic combat

| Vision | Status | Evidence |
|---|---|---|
| Ten scales PERSON to COSMIC | Built | `CombatEffectScale`; `worldEffectEngine` validates scale order |
| Planet-scale effect is a macro event, not millions of HP | Built | `abstraction: 'MACRO'`; `worldEffectEngine.apply` writes world events and changed scopes |
| No artificial power balancing | Built | Validation checks legality and authority, not magnitude; giant dice formulas are rejected and pushed to semantic outcomes |
| Authority and permission checks | Built | `sourceAuthorized` and `worldAuthorized` diagnostics; a client draft cannot replace an authoritative capability (tested) |

## 9. AI-generated abilities and the sandbox

| Vision | Status | Evidence |
|---|---|---|
| Natural language to structured ability | Partial | Routes exist: `/capabilities/interpret`, `/synthesize`, `/adjudicate`, `/acquire`, `/library/*`. One route states that interpretation is reserved for internal AI simulation. Not audited end to end |
| Schema validation, sandbox, canonical validation, player confirmation, registration | Partial | `/combat/effect/validate`, `/combat/simulate`, `/capabilities/acquire`. The player-facing "describe it, review the simulation, confirm" flow was not found in the UI |
| Sandbox modes SINGLE_RUN, REPLAY, BATCH, SCENARIO_MATRIX | Built (unnamed) | `simulate`, `batchSimulate`, `scenarioMatrix`, `/combat/replay`; the four names are not used as a mode field |
| Reports structural, rules, source, world validity and simulatability | Built | `CombatSimulationAuthorityDiagnostics` |
| AI cannot secretly grant authority or bypass immunities | Built | Tested: forged definitions rejected, simulation bound to canonical capability identity |

## 10. Animation and presentation

| Vision | Status | Evidence |
|---|---|---|
| Primitives and compositions | Partial | Deterministic animation plans with bounded per-instance tracks exist; the named compositions (Fireball, Laser, MultiBeam, ChainLightning, SwordCombo, Teleport, Summon, Explosion, Healing) were not found as a defined set |
| AI designs plans, not frames | Built | `combat.animation.plan` task and `/combat/animation-plan` with a non-blocking deterministic fallback |
| Assets generated on demand, cached | Built | `/combat/asset/ensure` |
| Four modes FULL, FAST, TEXT, LOG from the same events | Built | `CombatAnimationLayer.tsx`; switcher in `TacticalCombatView.tsx`; tests show presentation never becomes canonical state |

## 11. Combat interface

| Vision | Status | Evidence |
|---|---|---|
| Extends `TacticalCombatView.tsx` rather than duplicating | Built | One 1,446-line view |
| Initiative, turn, resources, target, abilities, event log | Built | Initiative list, Action / Bonus / Reaction tiles, battle event log |
| Individual multi-attack results | Built | Effect result shows instance count and total damage |
| Detailed inspector (roll + proficiency + ability + weapon = total) | **Missing** | No attack-breakdown view found |
| Boss phase information | **Missing** | No boss or phase text in the view |
| World-effect previews | **Missing** | The simulation result is shown; no world-effect preview panel |
| Ability editing and simulation tools | Partial | Simulation with a draft mode exists; editing is limited |
| Mobile: summaries first, details expandable | **Unverified** | Not checked |

## 12. Items the old handover called unfinished, re-verified

| Item | Status now |
|---|---|
| Opportunity Attack runtime | Built (tested; now switchable by rule) |
| Ready Action trigger execution | Built |
| Full reaction framework | Built for movement, attack, reach and turn-start triggers; stage-level interrupts missing |
| Concentration | Built |
| Cover | Partial (levels only, not from terrain) |
| Grapple and Shove | Built (now switchable by rule) |
| Complete spellcasting runtime | Built, extended this session (components, cantrip scaling, counterspell, dispel, level cap) |
| Full class, species and feat runtime | Partial: the progression engine is data-driven and sound; a starter D&D library of 11 classes and 2 species was added this session; it is not auto-registered in worlds |

## 13. Architecture

| Layer | Status |
|---|---|
| Player intent or NPC proposal, then definition, then canonical authority validation | Built |
| Execution, targeting, defence, effect resolution | Built |
| Atomic canonical commit | Built: `combatEffectEngine.resolve` snapshots state and rolls back on any failure |
| Events, persistence, replay | Built: `recordCombatReplay` with seed, roll counter and result signature; replay is reproducible; world-preview replay is non-mutating |
| AI narration after the commit | Built: narration receives the committed outcome and may not change it |
| Animations after the commit | Built |

## Resolution of the gaps (same day, after the audit)

Gap 1 (conditional sequences) was left alone on request. Gaps 2 to 12 were worked, with tests. Where the work is narrower than the
vision, it says so.

| Gap | Result | What exists now | What is still narrower than the vision |
|---|---|---|---|
| 1. Conditional SEQUENCE | **Left open** (by request) | Unchanged | Children still run unconditionally |
| 2. Delivery stage | Fixed | `deliveryMode: CHECK_REQUIRED`, wards (`wardedAgainst` by tag or damage type or `all`), per-target `deliveryResults`, `DELIVERY_BLOCKED` events; the action is still spent; distinct from a save | Delivery is per effect, not per instance of a multi-instance effect |
| 3. Triggers | Partly fixed | Correction: `ON_ROUND_START` and `ON_ROUND_END` were already fired for each actor's own turn, so turn events existed under another name. Added `ON_TURN_START` and `ON_TURN_END`, and `registerTriggeredEffect`: any ability can subscribe to any combat event and resolve an effect through the unified pipeline (free, depth-limited, firing limits, survives state export and import) | Nothing registers triggered effects automatically yet: acquiring a capability or class feature does not subscribe it. The mechanism is there; the content is not wired to it |
| 4. Bosses | Fixed in the engine | Phases carry full effect definitions (a stub is marked `boss_phase_stub`), reinforcements join the turn order, resource pools are set on entry, the transition is a `BOSS_PHASE_TRANSITION` event, abilities can spend boss resources. Boss panel in the combat view | The Ashen Cup's champion has no phases authored in the world pack, so the arena only exercises this in a test |
| 5. Environment | Fixed | Pits (fall damage, safe under a bridge), bridges, one-shot traps, low obstacles that give cover derived from the line between attacker and target (shown in the inspector), falls routed through the effect pipeline. Correction: temporary barriers already existed as the `barricade` hazard | Terrain is declared in code or by a boss phase; world packs cannot declare cover, pits or traps yet |
| 6. One effect system | Mostly fixed | Falls run as an automatic effect; Extra Attack is also expressible as a `MULTI_INSTANCE` effect (`buildMultiattackEffect`); `attacksPerAction` is fed by the progression modifier `combat.extraAttacks`, which the class library now grants to fighter, barbarian, paladin and monk | `executeAttack` still handles Extra Attack and the off-hand attack directly; underwater penalties are still an inline attack modifier. Class riders (Sneak Attack, Rage damage, Smite) remain descriptive |
| 7. Combat interface | Fixed | `CombatInspector` (summary first, one line per instance, expand for d20, bonuses, target defence with cover, advantage and disadvantage sources, damage roll, delivery results, interrupts), `BossPhasePanel`, `WorldEffectPreview` (scale ladder, "world event" versus tactical, no-mutation note); all wired into `TacticalCombatView` | Tested as rendered markup and against real engine output; not yet looked at in a browser at phone width |
| 8. Stage interrupts | Partly fixed | `prepareInterrupt` for a reaction that cancels an effect before delivery (Counterspell) or reduces damage before it lands (Shield); costs the reaction, single use, lapses at the owner's next turn | Two stages only: before delivery and before damage |
| 9. Ledger and sandbox names | Fixed | Special resources show in the turn ledger and effects can spend them (`resourceCost`, rolled back on failure); `CombatSimulationEngine.run` with the four named modes and a `mode` field on `/combat/simulate` | |
| 10. Narrative modes | Fixed | The arena fight is tested under PROTAGONIST, SIDE_CHARACTER and FREE_ROAM and resolves identically for the same seed | |
| 11. Ability creation flow | Fixed at service and route level | `AbilityDraftService`: describe or send a definition, validation, sandbox preview on a training-dummy battlefield, diagnostics, explicit player confirmation before the ability is registered and acquired; unsafe definitions are rejected with reasons; routes under `/combat/ability-draft` | No screen for it yet; the AI interpretation step depends on the `capability.synthesize` task and falls back to asking for a definition |
| 12. Named compositions | Fixed | Nine named compositions (Fireball, Laser, MultiBeam, ChainLightning, SwordCombo, Teleport, Summon, Explosion, Healing) built from fifteen primitives, chosen by the deterministic plan and accepted from the AI plan | Presentation only; no new art assets were generated |

### Second pass: the items that were narrower than the vision

| Item | Result |
|---|---|
| Delivery per instance | Fixed. A multi-instance effect with a delivery check rolls it for each beam; only the beams that arrive are resolved; the inspector gets one delivery result per beam |
| Interrupt stages | Fixed to three: after execution (the action is spent, the resource is not), before delivery, before damage |
| Class riders | Fixed for Sneak Attack and Rage. Sneak Attack is 1d6 per odd rogue level, once per turn, with advantage or an able ally beside the target and no disadvantage, doubled on a critical; Rage adds its bonus to melee attacks while raging. Both are rolled by the engine from progression modifiers, gated by their rules, shown as riders in the inspector. Divine Smite is still descriptive (it needs the player to choose to spend a slot) and Rage does not yet grant damage resistance |
| Auto-subscribe | Fixed. At the start of a fight, unlocked abilities whose trigger is a combat event and that carry an effect definition subscribe themselves; a feature whose rule is switched off never subscribes |
| Packs declare combat | Fixed. A world pack can give an NPC a combat block (hp, armor class, speed, attack, damage, boss phases) and a location its terrain (bounds, cover, pits, traps, start squares). The Ashen Cup now uses both: the champion fights with his declared numbers and two phases; the sand has low walls, rubble, a pit and a spike plate. A location without authored terrain still gets the default brazier |
| Extra Attack, off-hand attack, underwater | Unchanged on purpose: they share `resolveStandardAttack` with the effect pipeline, so the same advantage, cover and delivery rules apply to both paths |
| Phone-width browser check, ability creation screen | Not done |

### What the arena play-through found (and fixed)

Running the real routes end to end exposed problems that unit tests had not:

- **A stalemate:** a player downed at 0 hit points and then stable left the bout open forever, because defeat required a death. Defeat now means the party is out of the fight: every ally dead, or every ally down while an enemy still stands.
- **The champion was a generic creature:** the encounter route built an NPC opponent from card stats only, so an authored champion fought as a goblin with 28 hit points. Packs can now declare combat, and the route uses it.
- **Armor did not stack:** a carried shield and a cuirass shared one stacking group, so only the better applied. Shields now stack with body armor.
- **Weapons ignored the wielder's strength:** the encounter built weapon damage without the ability modifier, and ignored a pack weapon's damage dice. Both are fixed; the in-fight gear service follows the same rule.
- **No way to throw a weapon or change gear mid-fight:** added `/combat/throw` (range bands, disadvantage at long range or with a hostile in reach, an improvised 1d4 for a weapon not made to be thrown, the weapon lands on the sand) and `/combat/equip` (the first change each turn is the free object interaction, the next costs the action).

The arena world (The Ashen Cup) now has a play-through test up to the start of the battle: kit up at the armoury, hear bout three
called, reach the Ring Gate before the deadline, build the fighters from their real gear, derive cover from the sand's low wall,
roll initiative, and check opportunity attacks, the Cup's Hybrid rules (no spells, no long rest) and the champion's phase change.

## What this session added, and where it diverges from the vision

- Per-rule switches over about 60 D&D rules, with Full D&D unchanged by default, Hybrid choosing rules, Custom starting with none.
- Enforcement of 40-odd rules in the engines (opportunity attacks, cover, surprise, grapple, death saves, Extra Attack, off-hand attack,
  massive damage, critical extras, falling, underwater, action economy, reactions, initiative; spell slots, concentration,
  upcasting, rituals, components, cantrip scaling, counterspell, dispel, level cap; rests and the one-long-rest limit).
- Divergences from "one effect-resolution system":
  - Extra Attack, off-hand attack, falling damage and underwater penalty are direct methods. They should be re-expressed as effect
    definitions (Extra Attack as a `MULTI_INSTANCE` effect with `instanceCount` from the actor, falling as an `OUTCOME` or hazard).
  - Nothing sets `attacksPerAction` or `offhandDamageFormula` on a participant. No class feature, progression modifier or item feeds
    them yet, so Extra Attack is enforceable but never granted in play.
  - Class riders (Sneak Attack, Rage damage, Divine Smite) are descriptive abilities; the damage pipeline does not roll them.

## Gap list, ordered by how much of the vision each unlocks

1. **Make SEQUENCE conditional.** Add a per-step condition (`ON_PREVIOUS_HIT`, `ON_PREVIOUS_MISS`, `ON_PREVIOUS_KILL`, `ALWAYS`) and let a failed step stop the chain instead of rolling back everything. Unlocks combos, finishers, and "Strike, Strike, Finisher".
2. **Add a delivery stage** between execution and targeting: a check or an anti-magic zone that blocks the effect and emits its own event.
3. **Complete the trigger set**: `ON_TURN_START`, `ON_TURN_END`, and let capabilities, not only conditions, subscribe to events.
4. **Boss phases**: carry full effect definitions (not stubs), allow `summon` and resource declarations on a phase, and add a boss phase panel to the combat view.
5. **Environment**: add pit, bridge, trap and temporary-barrier objects with lifetimes; derive cover from terrain; connect falling damage to pits and forced movement off ledges.
6. **Route the session's direct mechanics through effects**: Extra Attack and off-hand attacks as `MULTI_INSTANCE`, falling as an outcome; feed `attacksPerAction` and `offhandDamageFormula` from progression modifiers.
7. **Combat inspector** with the attack-calculation breakdown, plus mobile summary-first layout and a world-effect preview.
8. **Stage-level interrupts**: reaction hooks before damage and after execution.
9. **Turn-ledger special resources** and a mode field naming the four sandbox modes.
10. **Narrative-mode coverage**: tests proving combat works the same in SIDE_CHARACTER and FREE_ROAM.
11. **Player-facing ability creation flow**: describe, simulate, review diagnostics, confirm; end-to-end test.
12. **Named animation compositions** as a defined, tested set.

## Note for the Unified Audit Reconciliation roadmap

The six-phase reconciliation roadmap covers combat inside its 24-domain audit but does not schedule the items above. Gaps 1 to 5
and 7 are real feature work against the Phase 8.5 specification and should be added to the roadmap explicitly, so the combat
system is not left behind by the wider programme.
