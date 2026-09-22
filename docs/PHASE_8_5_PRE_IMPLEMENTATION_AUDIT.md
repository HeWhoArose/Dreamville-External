# Phase 8.5 — Pre-Implementation Audit

Baseline audited against commit `e0c818a4f640b3b743466078612d7d10667eb0b4` before implementation. The purpose is to avoid duplicating existing systems and the kind of divergence previously seen when a system such as Feat was recreated instead of being connected to its existing authority.

## Classification

| Workstream | Current status | Action |
|---|---|---|
| A Baseline / mutation audit | EXISTS AS PROCESS, no dedicated report | CREATE phase audit artifact + repeat audit loop |
| B Unified Combat Effect model | MISSING | CREATE |
| C Single attack resolver | PARTIAL | REWORK/EXTRACT from existing combat engine without changing legacy semantics |
| D Multi-instance attacks | MISSING | CREATE |
| E Multi-target / AoE / chain / sequence | PARTIAL | CREATE generic layer and connect existing spell/AoE behavior |
| F Execution / delivery / defense separation | PARTIAL | CONNECT capability adjudication + spell runtime + combat effect layer |
| G Damage / defenses | EXISTS | CONNECT/reuse ConditionEngine damage resolution; audit duplicate paths |
| H Conditions / ongoing effects | EXISTS / PARTIAL | REUSE ConditionEngine; add effect-trigger integration only where missing |
| I Action economy / reactions / Ready / OA | EXISTS / PARTIAL | REUSE ledgers/reaction engine; extend generic trigger path and avoid duplicate resource logic |
| J Movement / cover / range | EXISTS / PARTIAL | REUSE combat engine and add effect targeting legality |
| K Battlefield environment state | EXISTS / PARTIAL | REUSE hazards/obstacles; add canonical effect/environment projection hooks |
| L Mythic / world-scale effects | MISSING | CREATE |
| M Boss phase framework | MISSING | CREATE |
| N Canonical events / replay | PARTIAL | EXTEND existing BattleEvent + canonical command event + deterministic dice evidence |
| O Animation sequencing | MISSING AS GENERIC COMBAT PIPELINE | CREATE |
| P AI animation planning | MISSING | CREATE service with runtime-safe fallbacks |
| Q AI-generated combat assets | PARTIAL GENERAL ASSET SYSTEM | CONNECT/reuse MediaAdapterService and generated asset routes; add combat provenance/cache layer |
| R Combat & Effect Simulation Sandbox | MISSING | CREATE |
| S Tactical AI | EXISTS | CONNECT to effect legality/ability selection; do not recreate policy engine |
| T Tactical Combat UI | EXISTS | EXTEND rather than duplicate |
| U Ability authoring UI | EXISTS / PARTIAL | EXTEND existing capability editor; add structured effect fields |
| V Entity / progression connectivity | EXISTS | VERIFY and connect effect provenance/modifiers; do not recreate progression |
| W Persistence / migration | EXISTS / PARTIAL | EXTEND snapshots/store with Phase 8.5 state |
| X Performance | PARTIAL | Add bounded effect/animation/simulation policies |
| Y Accessibility / fast modes | MISSING | CREATE presentation modes over same event stream |
| Z Audit / regression / fallback loops | PROCESS EXISTS | Apply N-times verification with dedicated evidence |

## Confirmed existing authorities

- `TacticalCombatEngine` already owns initiative, participants, movement, attacks, saving throws, damage application, cover, hazards, action economy, Ready, grapple/shove, concentration interaction, and deterministic local dice.
- `ConditionEngine` already owns canonical condition state and damage-profile resolution including resistance/immunity/vulnerability.
- `CombatActionEconomy` already owns Action / Bonus Action / Reaction / movement / Ready resource accounting.
- `CombatReactionEngine` already exists and must be extended rather than replaced.
- `SpellRuntime` already owns spell definitions, spell slots, target validation, saves, damage/healing, concentration and spell-specific runtime behavior.
- `NpcTacticalDecisionPolicy` already exists and must become an intent producer, not a second combat resolver.
- `CapabilityEngine` and `/capabilities/adjudicate` already provide capability authority and execution gating.
- `canonicalCommandEngine` already provides staged transactional command execution and rollback.
- Progression authority already exists through `CharacterProgressionEngine`; Phase 8.5 must consume its resolved modifiers and must not recreate class/feat/species logic.
- Entity Card authority already exists and should remain the canonical identity boundary for named NPCs/creatures.
- General visual asset generation already exists through the media adapter/generated-asset infrastructure; combat visuals must connect to it rather than creating a second provider path.

## High-risk duplication traps

1. Do not add another damage resolver. Reuse ConditionEngine-backed combat damage.
2. Do not add another action ledger. Reuse CombatActionEconomy.
3. Do not create a second reaction system. Extend CombatReactionEngine.
4. Do not create a second progression authority. Consume CharacterProgressionEngine resolutions.
5. Do not create a second spell system. Use SpellRuntime.
6. Do not let Tactical AI mutate combat state.
7. Do not make animation state canonical.
8. Do not turn extreme powers into arbitrary huge HP numbers when a semantic world/outcome effect is more correct.

## Required audit loop

Every implementation workstream must follow:

**inspect → classify → implement/connect → unit test → integration test → regression test → fallback test → re-audit → lint/build → runtime verification**.

The complete phase requires at least **three independent audit passes** after implementation, plus targeted regression/fallback passes after each critical subsystem cluster.
