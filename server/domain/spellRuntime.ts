import type { RulesProfile } from '../../src/types';
import { rulesProfileEngine } from './rulesProfileEngine';
import { LocalDiceEngine, BattlefieldParticipant, RollRecord, CoverLevel } from './combatEngine';
import { ConditionEngine, conditionEngine as defaultConditionEngine } from './conditionEngine';
import { HistoricalChronicleEngine } from './historicalChronicleEngine';
import { dndSpellRulesEvaluator, SpellEvaluationResult } from './dndSpellRulesModel';

export type SpellSchool =
  | 'abjuration'
  | 'conjuration'
  | 'divination'
  | 'enchantment'
  | 'evocation'
  | 'illusion'
  | 'necromancy'
  | 'transmutation';

export type SpellTargetType =
  | 'SELF'
  | 'TOUCH'
  | 'SINGLE_CREATURE'
  | 'SINGLE_ENEMY'
  | 'SINGLE_ALLY'
  | 'AREA_SPHERE'
  | 'AREA_CONE'
  | 'AREA_LINE'
  | 'POINT';

export interface SpellDefinition {
  id: string;
  name: string;
  level: number; // 0 for cantrip, 1-9 for leveled spells
  school: SpellSchool;
  castingTime: 'ACTION' | 'BONUS_ACTION' | 'REACTION' | 'MINUTE' | 'RITUAL';
  range: number; // in feet (0 for SELF, 5 for TOUCH, 30, 60, 120, etc.)
  rangeType: 'SELF' | 'TOUCH' | 'RANGED' | 'SIGHT' | 'UNLIMITED';
  targetType: SpellTargetType;
  areaRadiusFeet?: number;
  durationRounds: number; // 0 for instantaneous, 10 for 1 min, 100 for 10 min
  requiresConcentration: boolean;
  isRitual: boolean;
  defenseModel: 'ATTACK_VS_AC' | 'SAVING_THROW' | 'AUTOMATIC' | 'BUFF' | 'HEAL';
  savingThrowAbility?: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  halfDamageOnSave?: boolean;
  damageFormula?: string;
  damageType?: string; // 'fire', 'cold', 'force', 'radiant', 'necrotic', 'lightning', 'thunder', etc.
  healingFormula?: string;
  upcastDamageDicePerLevel?: string;
  upcastHealingDicePerLevel?: string;
  appliedConditions?: string[];
  removesConditions?: string[];
  movementEffect?: {
    type: 'TELEPORT' | 'PUSH' | 'PULL';
    distanceFeet: number;
  };
  buffEffect?: {
    armorClassBonus?: number;
    attackBonusModifier?: number;
    saveBonusModifier?: number;
    speedMultiplier?: number;
  };
  description: string;
}

export interface SpellSlotState {
  current: number;
  max: number;
}

export type SpellSlotTracker = Record<number, SpellSlotState>;

export interface ActiveConcentration {
  spellId: string;
  spellName: string;
  slotLevel: number;
  castAtRound: number;
  castAtTurn: number;
  durationRounds: number;
  remainingRounds: number;
  casterId: string;
  targetIds: string[];
  appliedConditions: Array<{ targetId: string; condition: string; conditionInstanceId?: string }>;
  effects?: Record<string, unknown>;
}

export interface ActorSpellcastingState {
  actorId: string;
  casterLevel: number;
  spellcastingAbility: 'INT' | 'WIS' | 'CHA';
  spellAttackBonus: number;
  spellSaveDc: number;
  spellSlots: SpellSlotTracker;
  knownSpells: string[];
  preparedSpells: string[];
  requiresPreparation: boolean;
  maxPreparedSpells: number;
  activeConcentration: ActiveConcentration | null;
}

export interface SpellDamageResolution {
  damage: number;
  targetDied: boolean;
  immune?: boolean;
  resisted?: boolean;
  vulnerable?: boolean;
}

export type SpellDamageResolver = (
  target: BattlefieldParticipant,
  amount: number,
  damageType: string,
  criticalHit?: boolean
) => SpellDamageResolution;

export type SpellHealingResolver = (
  target: BattlefieldParticipant,
  amount: number
) => { healing: number; revived: boolean };

export interface CastSpellRequest {
  storyId?: string;
  casterId: string;
  spellId: string;
  targetId?: string;
  targetPosition?: { x: number; y: number };
  slotLevel?: number; // base level or upcast slot level
  isRitual?: boolean;
  combatRound?: number;
  combatTurnIndex?: number;
  advantage?: boolean;
  disadvantage?: boolean;
  rulesProfile?: RulesProfile;
  diceEngine?: LocalDiceEngine;
  /** Production callers must resolve targets from canonical state before casting. */
  requireAuthoritativeTarget?: boolean;
  /** Explicit opt-in for isolated unit tests/simulations without a canonical battlefield. */
  allowSyntheticTarget?: boolean;
  /** Canonical combat authority may provide the damage/death resolver. */
  damageResolver?: SpellDamageResolver;
  /** Canonical combat authority may provide the healing/revival resolver. */
  healingResolver?: SpellHealingResolver;
}

export interface CastSpellExecutionResult {
  success: boolean;
  errorCode?: string;
  errorReason?: string;
  spellId: string;
  spellName: string;
  slotLevelUsed: number;
  slotsRemaining?: SpellSlotState;
  isRitual: boolean;
  requiresConcentration: boolean;
  brokenPreviousConcentration?: { spellId: string; spellName: string };
  attackResult?: { roll: RollRecord; hits: boolean; isCritical: boolean };
  savingThrowResult?: { roll: RollRecord; succeeds: boolean; ability: string; dc: number };
  damageInflicted?: number;
  healingApplied?: number;
  damageType?: string;
  targetDied?: boolean;
  targetHpRemaining?: number;
  targetImmune?: boolean;
  targetResisted?: boolean;
  targetVulnerable?: boolean;
  conditionsApplied?: string[];
  conditionsRemoved?: string[];
  movementApplied?: { from: { x: number; y: number }; to: { x: number; y: number } };
  concentrationEstablished?: boolean;
  targetConcentrationCheck?: ConcentrationCheckResult;
  headline: string;
}

export interface ConcentrationCheckResult {
  actorId: string;
  spellId: string;
  spellName: string;
  damageTaken: number;
  dc: number;
  saveModifier: number;
  roll: RollRecord;
  succeeded: boolean;
  concentrationBroken: boolean;
  cleanedUpConditions: Array<{ targetId: string; condition: string }>;
  headline: string;
}

/**
 * Standard D&D 5e Full Caster Spell Slot Table (levels 1-20, slots 1-9)
 */
export const STANDARD_5E_SPELL_SLOTS_TABLE: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 1: 3 },
  3: { 1: 4, 2: 2 },
  4: { 1: 4, 2: 3 },
  5: { 1: 4, 2: 3, 3: 2 },
  6: { 1: 4, 2: 3, 3: 3 },
  7: { 1: 4, 2: 3, 3: 3, 4: 1 },
  8: { 1: 4, 2: 3, 3: 3, 4: 2 },
  9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
};

export function createDefaultSpellSlots(casterLevel: number): SpellSlotTracker {
  const level = Math.max(1, Math.min(20, Math.floor(casterLevel || 1)));
  const tableRow = STANDARD_5E_SPELL_SLOTS_TABLE[level] || { 1: 2 };
  const tracker: SpellSlotTracker = {};
  for (let s = 1; s <= 9; s++) {
    const count = tableRow[s] || 0;
    tracker[s] = { current: count, max: count };
  }
  return tracker;
}

export class SpellRuntime {
  private spells: Map<string, SpellDefinition> = new Map();
  private actorStates: Map<string, ActorSpellcastingState> = new Map();
  private conditionEngine: ConditionEngine;
  private chronicleEngine?: HistoricalChronicleEngine;
  private readonly participantRefs: Map<string, BattlefieldParticipant> = new Map();

  constructor(options?: {
    conditionEngine?: ConditionEngine;
    chronicleEngine?: HistoricalChronicleEngine;
  }) {
    this.conditionEngine = options?.conditionEngine || defaultConditionEngine;
    this.chronicleEngine = options?.chronicleEngine;
    this.registerCanonicalSpells();
  }

  public setConditionEngine(engine: ConditionEngine): void {
    this.conditionEngine = engine;
  }

  public setChronicleEngine(engine: HistoricalChronicleEngine): void {
    this.chronicleEngine = engine;
  }

  public registerSpell(spell: SpellDefinition): void {
    this.spells.set(spell.id.toLowerCase(), spell);
    this.spells.set(this.normalizeName(spell.name), spell);
  }

  /** Read-only actor spell state lookup. Does not create or mutate state. */
  public getActorState(actorId: string): ActorSpellcastingState | undefined {
    const state = this.actorStates.get(actorId);
    return state ? JSON.parse(JSON.stringify(state)) : undefined;
  }

  public getSpell(idOrName: string): SpellDefinition | undefined {
    if (!idOrName) return undefined;
    return this.spells.get(idOrName.toLowerCase().trim()) || this.spells.get(this.normalizeName(idOrName));
  }

  public getAllSpells(): SpellDefinition[] {
    const unique = new Map<string, SpellDefinition>();
    for (const spell of this.spells.values()) {
      unique.set(spell.id, spell);
    }
    return Array.from(unique.values()).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  private registerCanonicalSpells(): void {
    const canon: SpellDefinition[] = [
      // CANTRIPS (Level 0)
      {
        id: 'fire_bolt',
        name: 'Fire Bolt',
        level: 0,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 120,
        rangeType: 'RANGED',
        targetType: 'SINGLE_ENEMY',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'ATTACK_VS_AC',
        damageFormula: '1d10',
        damageType: 'fire',
        description: 'Hurls a mote of fire at a creature or object within range.',
      },
      {
        id: 'ray_of_frost',
        name: 'Ray of Frost',
        level: 0,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 60,
        rangeType: 'RANGED',
        targetType: 'SINGLE_ENEMY',
        durationRounds: 1,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'ATTACK_VS_AC',
        damageFormula: '1d8',
        damageType: 'cold',
        appliedConditions: ['Slowed'],
        description: 'A frigid beam of blue-white light streaks toward a target.',
      },
      {
        id: 'sacred_flame',
        name: 'Sacred Flame',
        level: 0,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 60,
        rangeType: 'RANGED',
        targetType: 'SINGLE_ENEMY',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'SAVING_THROW',
        savingThrowAbility: 'DEX',
        halfDamageOnSave: false,
        damageFormula: '1d8',
        damageType: 'radiant',
        description: 'Flame-like radiance descends on a creature that you can see within range.',
      },
      {
        id: 'shocking_grasp',
        name: 'Shocking Grasp',
        level: 0,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 5,
        rangeType: 'TOUCH',
        targetType: 'SINGLE_ENEMY',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'ATTACK_VS_AC',
        damageFormula: '1d8',
        damageType: 'lightning',
        description: 'Lightning springs from your hand to deliver a shock to a creature you try to touch.',
      },

      // LEVEL 1
      {
        id: 'magic_missile',
        name: 'Magic Missile',
        level: 1,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 120,
        rangeType: 'RANGED',
        targetType: 'SINGLE_CREATURE',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'AUTOMATIC',
        damageFormula: '3d4+3',
        damageType: 'force',
        upcastDamageDicePerLevel: '1d4+1',
        description: 'Three glowing darts of magical force strike their targets infallibly.',
      },
      {
        id: 'cure_wounds',
        name: 'Cure Wounds',
        level: 1,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 5,
        rangeType: 'TOUCH',
        targetType: 'SINGLE_ALLY',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'HEAL',
        healingFormula: '1d8+3',
        upcastHealingDicePerLevel: '1d8',
        description: 'A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier.',
      },
      {
        id: 'healing_word',
        name: 'Healing Word',
        level: 1,
        school: 'evocation',
        castingTime: 'BONUS_ACTION',
        range: 60,
        rangeType: 'RANGED',
        targetType: 'SINGLE_ALLY',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'HEAL',
        healingFormula: '1d4+3',
        upcastHealingDicePerLevel: '1d4',
        description: 'A creature of your choice that you can see within range regains hit points equal to 1d4 + your spellcasting ability modifier.',
      },
      {
        id: 'shield',
        name: 'Shield',
        level: 1,
        school: 'abjuration',
        castingTime: 'REACTION',
        range: 0,
        rangeType: 'SELF',
        targetType: 'SELF',
        durationRounds: 1,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'BUFF',
        buffEffect: { armorClassBonus: 5 },
        description: 'An invisible barrier of magical force appears and protects you (+5 AC until next turn).',
      },
      {
        id: 'thunderwave',
        name: 'Thunderwave',
        level: 1,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 15,
        rangeType: 'TOUCH',
        targetType: 'AREA_CONE',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'SAVING_THROW',
        savingThrowAbility: 'CON',
        halfDamageOnSave: true,
        damageFormula: '2d8',
        damageType: 'thunder',
        upcastDamageDicePerLevel: '1d8',
        movementEffect: { type: 'PUSH', distanceFeet: 10 },
        description: 'A wave of thunderous force sweeps out from you pushing creatures 10 feet away.',
      },
      {
        id: 'burning_hands',
        name: 'Burning Hands',
        level: 1,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 15,
        rangeType: 'TOUCH',
        targetType: 'AREA_CONE',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'SAVING_THROW',
        savingThrowAbility: 'DEX',
        halfDamageOnSave: true,
        damageFormula: '3d6',
        damageType: 'fire',
        upcastDamageDicePerLevel: '1d6',
        description: 'A thin sheet of flames shoots forth from your outstretched fingertips.',
      },
      {
        id: 'detect_magic',
        name: 'Detect Magic',
        level: 1,
        school: 'divination',
        castingTime: 'ACTION',
        range: 0,
        rangeType: 'SELF',
        targetType: 'SELF',
        durationRounds: 100,
        requiresConcentration: true,
        isRitual: true,
        defenseModel: 'BUFF',
        description: 'For the duration, you sense the presence of magic within 30 feet of you.',
      },
      {
        id: 'identify',
        name: 'Identify',
        level: 1,
        school: 'divination',
        castingTime: 'MINUTE',
        range: 5,
        rangeType: 'TOUCH',
        targetType: 'TOUCH',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: true,
        defenseModel: 'BUFF',
        description: 'You choose one object that you must touch throughout the casting of the spell to discover its magical properties.',
      },

      // LEVEL 2
      {
        id: 'hold_person',
        name: 'Hold Person',
        level: 2,
        school: 'enchantment',
        castingTime: 'ACTION',
        range: 60,
        rangeType: 'RANGED',
        targetType: 'SINGLE_ENEMY',
        durationRounds: 10,
        requiresConcentration: true,
        isRitual: false,
        defenseModel: 'SAVING_THROW',
        savingThrowAbility: 'WIS',
        halfDamageOnSave: false,
        appliedConditions: ['Paralyzed'],
        description: 'Choose a humanoid that you can see within range. The target must succeed on a Wisdom saving throw or be paralyzed.',
      },
      {
        id: 'misty_step',
        name: 'Misty Step',
        level: 2,
        school: 'conjuration',
        castingTime: 'BONUS_ACTION',
        range: 30,
        rangeType: 'RANGED',
        targetType: 'SELF',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'BUFF',
        movementEffect: { type: 'TELEPORT', distanceFeet: 30 },
        description: 'Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see.',
      },
      {
        id: 'invisibility',
        name: 'Invisibility',
        level: 2,
        school: 'illusion',
        castingTime: 'ACTION',
        range: 5,
        rangeType: 'TOUCH',
        targetType: 'SINGLE_ALLY',
        durationRounds: 100,
        requiresConcentration: true,
        isRitual: false,
        defenseModel: 'BUFF',
        appliedConditions: ['Invisible'],
        description: 'A creature you touch becomes invisible until the spell ends.',
      },
      {
        id: 'scorching_ray',
        name: 'Scorching Ray',
        level: 2,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 120,
        rangeType: 'RANGED',
        targetType: 'SINGLE_ENEMY',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'ATTACK_VS_AC',
        damageFormula: '6d6', // 3 rays of 2d6 combined
        damageType: 'fire',
        upcastDamageDicePerLevel: '2d6',
        description: 'You hurl three rays of fire at targets within range.',
      },

      // LEVEL 3
      {
        id: 'fireball',
        name: 'Fireball',
        level: 3,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 150,
        rangeType: 'RANGED',
        targetType: 'AREA_SPHERE',
        areaRadiusFeet: 20,
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'SAVING_THROW',
        savingThrowAbility: 'DEX',
        halfDamageOnSave: true,
        damageFormula: '8d6',
        damageType: 'fire',
        upcastDamageDicePerLevel: '1d6',
        description: 'A bright streak flashes from your pointing finger to a point within range and blossoms into an explosion of flame.',
      },
      {
        id: 'lightning_bolt',
        name: 'Lightning Bolt',
        level: 3,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 100,
        rangeType: 'RANGED',
        targetType: 'AREA_LINE',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'SAVING_THROW',
        savingThrowAbility: 'DEX',
        halfDamageOnSave: true,
        damageFormula: '8d6',
        damageType: 'lightning',
        upcastDamageDicePerLevel: '1d6',
        description: 'A stroke of lightning forming a line 100 feet long and 5 feet wide blasts out from you.',
      },
      {
        id: 'haste',
        name: 'Haste',
        level: 3,
        school: 'transmutation',
        castingTime: 'ACTION',
        range: 30,
        rangeType: 'RANGED',
        targetType: 'SINGLE_ALLY',
        durationRounds: 10,
        requiresConcentration: true,
        isRitual: false,
        defenseModel: 'BUFF',
        buffEffect: { armorClassBonus: 2, speedMultiplier: 2 },
        description: 'Choose a willing creature that you can see within range. Until the spell ends, the target’s speed is doubled, it gains a +2 bonus to AC.',
      },
      {
        id: 'fly',
        name: 'Fly',
        level: 3,
        school: 'transmutation',
        castingTime: 'ACTION',
        range: 5,
        rangeType: 'TOUCH',
        targetType: 'SINGLE_ALLY',
        durationRounds: 100,
        requiresConcentration: true,
        isRitual: false,
        defenseModel: 'BUFF',
        description: 'You touch a willing creature. The target gains a flying speed of 60 feet for the duration.',
      },

      // LEVEL 4
      {
        id: 'ice_storm',
        name: 'Ice Storm',
        level: 4,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 300,
        rangeType: 'RANGED',
        targetType: 'AREA_SPHERE',
        areaRadiusFeet: 20,
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'SAVING_THROW',
        savingThrowAbility: 'DEX',
        halfDamageOnSave: true,
        damageFormula: '2d8+4d6',
        damageType: 'cold',
        upcastDamageDicePerLevel: '1d8',
        description: 'A hail of rock-hard ice pounds to the ground in a 20-foot-radius cylinder.',
      },

      // LEVEL 5
      {
        id: 'cone_of_cold',
        name: 'Cone of Cold',
        level: 5,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 60,
        rangeType: 'TOUCH',
        targetType: 'AREA_CONE',
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'SAVING_THROW',
        savingThrowAbility: 'CON',
        halfDamageOnSave: true,
        damageFormula: '8d8',
        damageType: 'cold',
        upcastDamageDicePerLevel: '1d8',
        description: 'A blast of cold air erupts from your hands. Each creature in a 60-foot cone must make a Constitution saving throw.',
      },
      {
        id: 'mass_cure_wounds',
        name: 'Mass Cure Wounds',
        level: 5,
        school: 'evocation',
        castingTime: 'ACTION',
        range: 60,
        rangeType: 'RANGED',
        targetType: 'AREA_SPHERE',
        areaRadiusFeet: 30,
        durationRounds: 0,
        requiresConcentration: false,
        isRitual: false,
        defenseModel: 'HEAL',
        healingFormula: '3d8+5',
        upcastHealingDicePerLevel: '1d8',
        description: 'A wave of healing energy washes out from a point of your choice within range.',
      },
    ];

    for (const spell of canon) {
      this.registerSpell(spell);
    }
  }

  private createDefaultActorState(
    actorId: string,
    initial?: Partial<ActorSpellcastingState>
  ): ActorSpellcastingState {
    const casterLevel = initial?.casterLevel || 5;
    const ability = initial?.spellcastingAbility || 'INT';
    const prof = Math.floor((casterLevel - 1) / 4) + 2;
    const abilityMod = 3;
    return {
      actorId,
      casterLevel,
      spellcastingAbility: ability,
      spellAttackBonus: initial?.spellAttackBonus ?? prof + abilityMod,
      spellSaveDc: initial?.spellSaveDc ?? 8 + prof + abilityMod,
      spellSlots: initial?.spellSlots ? JSON.parse(JSON.stringify(initial.spellSlots)) : createDefaultSpellSlots(casterLevel),
      knownSpells: initial?.knownSpells ? [...initial.knownSpells] : ['fire_bolt', 'magic_missile', 'cure_wounds', 'shield', 'hold_person', 'fireball'],
      preparedSpells: initial?.preparedSpells ? [...initial.preparedSpells] : ['fire_bolt', 'magic_missile', 'cure_wounds', 'shield', 'hold_person', 'fireball'],
      requiresPreparation: initial?.requiresPreparation ?? true,
      maxPreparedSpells: initial?.maxPreparedSpells ?? Math.max(1, casterLevel + abilityMod),
      activeConcentration: initial?.activeConcentration ? JSON.parse(JSON.stringify(initial.activeConcentration)) : null,
    };
  }

  public getOrCreateActorState(
    actorId: string,
    initial?: Partial<ActorSpellcastingState>
  ): ActorSpellcastingState {
    let state = this.actorStates.get(actorId);
    if (!state) {
      state = this.createDefaultActorState(actorId, initial);
      this.actorStates.set(actorId, state);
    }
    return state;
  }

  public setActorState(actorId: string, state: ActorSpellcastingState): void {
    this.actorStates.set(actorId, JSON.parse(JSON.stringify(state)));
  }

  public prepareSpell(actorId: string, spellId: string): { success: boolean; errorReason?: string } {
    const spell = this.getSpell(spellId);
    if (!spell) return { success: false, errorReason: `Spell "${spellId}" not found in catalog.` };
    if (spell.level === 0) return { success: true }; // Cantrips are always prepared

    const state = this.getOrCreateActorState(actorId);
    const normId = spell.id;
    if (state.preparedSpells.includes(normId)) {
      return { success: true };
    }
    if (state.preparedSpells.length >= state.maxPreparedSpells) {
      return {
        success: false,
        errorReason: `Cannot prepare more than ${state.maxPreparedSpells} spells.`,
      };
    }
    state.preparedSpells.push(normId);
    return { success: true };
  }

  public unprepareSpell(actorId: string, spellId: string): { success: boolean; errorReason?: string } {
    const spell = this.getSpell(spellId);
    if (!spell) return { success: false, errorReason: `Spell "${spellId}" not found.` };
    if (spell.level === 0) return { success: false, errorReason: 'Cannot unprepare a cantrip.' };

    const state = this.getOrCreateActorState(actorId);
    const normId = spell.id;
    state.preparedSpells = state.preparedSpells.filter((id) => id !== normId);
    return { success: true };
  }

  public initializeSlots(actorId: string, slots: Record<number, { current: number; max: number }>): void {
    if (!slots || typeof slots !== 'object' || Array.isArray(slots)) {
      throw new Error('Spell slots must be an object keyed by slot level.');
    }

    const normalized: SpellSlotTracker = {};
    for (const [rawLevel, rawState] of Object.entries(slots)) {
      const level = Number(rawLevel);
      if (!Number.isInteger(level) || level < 1 || level > 9) {
        throw new Error(`Invalid spell slot level "${rawLevel}". Expected an integer from 1 to 9.`);
      }
      if (!rawState || typeof rawState !== 'object') {
        throw new Error(`Invalid spell slot state for level ${level}.`);
      }

      const current = Number((rawState as { current?: unknown }).current);
      const max = Number((rawState as { max?: unknown }).max);
      if (!Number.isFinite(current) || !Number.isFinite(max)) {
        throw new Error(`Spell slot level ${level} requires finite current/max values.`);
      }

      const normalizedCurrent = Math.floor(current);
      const normalizedMax = Math.floor(max);
      if (normalizedMax < 0 || normalizedCurrent < 0 || normalizedCurrent > normalizedMax) {
        throw new Error(`Invalid spell slot state for level ${level}: current must be between 0 and max.`);
      }
      normalized[level] = { current: normalizedCurrent, max: normalizedMax };
    }

    const state = this.getOrCreateActorState(actorId);
    state.spellSlots = normalized;
  }

  public learnSpell(actorId: string, spellId: string): { success: boolean; errorReason?: string; knownSpells: string[] } {
    const spell = this.getSpell(spellId);
    if (!spell) {
      const existing = this.actorStates.get(actorId);
      return {
        success: false,
        errorReason: `Spell "${spellId}" not found in catalog.`,
        knownSpells: existing ? [...existing.knownSpells] : [],
      };
    }

    const state = this.getOrCreateActorState(actorId);
    if (!state.knownSpells.includes(spell.id)) {
      state.knownSpells.push(spell.id);
    }
    return { success: true, knownSpells: [...state.knownSpells] };
  }

  public resetSlots(actorId: string, type: 'SHORT' | 'LONG' = 'LONG'): ActorSpellcastingState {
    this.restoreSpellSlots(actorId, type === 'SHORT' ? 'SHORT_REST' : 'LONG_REST');
    return this.getOrCreateActorState(actorId);
  }

  public evaluateCustomSpellProposal(
    proposal: {
      spellName?: string;
      name?: string;
      spellLevel?: number;
      level?: number;
      school?: string;
      castingTime?: string;
      range?: number;
      requiresConcentration?: boolean;
      isRitual?: boolean;
      description?: string;
      damageFormula?: string;
      damageType?: string;
      healingFormula?: string;
      casterLevel?: number;
    },
    characterLevel?: number,
    rulesProfile?: RulesProfile
  ): SpellEvaluationResult & { sanitizedSpell?: SpellDefinition; adjudicationNotes?: string } {
    const spellName = String(proposal.spellName || proposal.name || 'Unnamed Custom Spell').trim();
    const spellLevel = Number(proposal.spellLevel ?? proposal.level ?? 1);
    const cLevel = characterLevel || proposal.casterLevel || 5;
    const profile = rulesProfile || rulesProfileEngine.createDefault('FULL_DND');

    const evalResult = dndSpellRulesEvaluator.evaluateSpellProposal({
      proposal: {
        spellName,
        spellLevel,
        school: proposal.school,
      },
      characterLevel: cLevel,
      dndMode: profile.mode,
      rulesProfile: profile,
    });

    if (!evalResult.approved) {
      return {
        ...evalResult,
        adjudicationNotes: evalResult.downgradeRequirement?.reason || `Spell "${spellName}" rejected: exceeds caster capabilities or profile constraints.`,
      };
    }

    const sanitizedId = `custom_${spellName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
    const sanitizedSpell: SpellDefinition = {
      id: sanitizedId,
      name: spellName,
      level: spellLevel,
      school: (proposal.school?.toLowerCase() as SpellSchool) || 'evocation',
      castingTime: (proposal.castingTime?.toUpperCase() as 'ACTION' | 'BONUS_ACTION' | 'REACTION') || 'ACTION',
      range: typeof proposal.range === 'number' ? proposal.range : 60,
      rangeType: (proposal.range === 0 || proposal.range === undefined) ? 'RANGED' : proposal.range <= 5 ? 'TOUCH' : 'RANGED',
      targetType: 'SINGLE_ENEMY',
      durationRounds: proposal.requiresConcentration ? 10 : 0,
      requiresConcentration: Boolean(proposal.requiresConcentration),
      isRitual: Boolean(proposal.isRitual),
      defenseModel: proposal.damageFormula ? 'ATTACK_VS_AC' : proposal.healingFormula ? 'HEAL' : 'BUFF',
      damageFormula: proposal.damageFormula,
      damageType: proposal.damageType || (proposal.damageFormula ? 'force' : undefined),
      healingFormula: proposal.healingFormula,
      description: proposal.description || `A customized spell: ${spellName}.`,
    };

    return {
      ...evalResult,
      sanitizedSpell,
      adjudicationNotes: `Custom spell proposal "${spellName}" approved canonically at spell level ${spellLevel}.`,
    };
  }

  public restoreSpellSlots(actorId: string, type: 'SHORT_REST' | 'LONG_REST' = 'LONG_REST'): void {
    const state = this.getOrCreateActorState(actorId);
    if (type === 'LONG_REST') {
      for (const level of Object.keys(state.spellSlots)) {
        const num = Number(level);
        state.spellSlots[num].current = state.spellSlots[num].max;
      }
    } else {
      // Arcane recovery or partial short rest: restore up to ceil(level / 2) slot levels
      const maxRecoveryLevels = Math.max(1, Math.ceil(state.casterLevel / 2));
      let recovered = 0;
      for (let s = 1; s <= 5 && recovered < maxRecoveryLevels; s++) {
        const slot = state.spellSlots[s];
        if (slot && slot.current < slot.max) {
          while (slot.current < slot.max && recovered + s <= maxRecoveryLevels) {
            slot.current++;
            recovered += s;
          }
        }
      }
    }
  }

  /** Bind authoritative mutable participant references for effect application/cleanup. */
  public setParticipantContext(participants: BattlefieldParticipant[]): void {
    this.participantRefs.clear();
    for (const participant of participants) {
      this.participantRefs.set(participant.id, participant);
    }
  }

  private resolveAreaTargets(
    spell: SpellDefinition,
    caster: BattlefieldParticipant,
    target: BattlefieldParticipant | undefined,
    targetPosition: { x: number; y: number } | undefined,
    allParticipants: BattlefieldParticipant[]
  ): BattlefieldParticipant[] {
    const areaTypes = new Set<SpellTargetType>(['AREA_SPHERE', 'AREA_LINE', 'AREA_CONE']);
    if (!areaTypes.has(spell.targetType)) return [];

    const participants = new Map<string, BattlefieldParticipant>();
    for (const participant of allParticipants) participants.set(participant.id, participant);
    if (target) participants.set(target.id, target);

    const center = targetPosition || (target ? { x: target.x, y: target.y } : undefined);
    if (!center) return [];

    const candidates = Array.from(participants.values()).filter((p) => {
      if (p.isDead || p.hpCurrent <= 0) return false;
      if (spell.defenseModel === 'HEAL' && p.team !== caster.team) return false;
      return true;
    });

    const maxRangeCells = Math.max(0, spell.range / 5);
    const centerDistance = (p: BattlefieldParticipant) => Math.hypot(p.x - caster.x, p.y - caster.y);

    if (spell.targetType === 'AREA_SPHERE') {
      const radiusCells = Math.max(0, (spell.areaRadiusFeet || 0) / 5);
      return candidates.filter((p) => Math.hypot(p.x - center.x, p.y - center.y) <= radiusCells + 1e-9);
    }

    if (spell.targetType === 'AREA_LINE') {
      const vx = center.x - caster.x;
      const vy = center.y - caster.y;
      const lengthSquared = vx * vx + vy * vy;
      if (lengthSquared <= 1e-9) return [];
      const widthCells = 0.5;
      return candidates.filter((p) => {
        const px = p.x - caster.x;
        const py = p.y - caster.y;
        const projection = (px * vx + py * vy) / lengthSquared;
        if (projection < -1e-9 || projection > 1 + 1e-9) return false;
        if (centerDistance(p) > maxRangeCells + 1e-9) return false;
        const closestX = caster.x + vx * projection;
        const closestY = caster.y + vy * projection;
        return Math.hypot(p.x - closestX, p.y - closestY) <= widthCells + 1e-9;
      });
    }

    const vx = center.x - caster.x;
    const vy = center.y - caster.y;
    const directionLength = Math.hypot(vx, vy);
    if (directionLength <= 1e-9) return [];
    return candidates.filter((p) => {
      const dx = p.x - caster.x;
      const dy = p.y - caster.y;
      const distance = Math.hypot(dx, dy);
      if (distance > maxRangeCells + 1e-9 || distance <= 1e-9) return false;
      const cosine = (dx * vx + dy * vy) / (distance * directionLength);
      return cosine >= Math.cos(Math.PI / 4) - 1e-9;
    });
  }

  /**
   * Advances an active concentration effect by one canonical combat round.
   * Mutates authoritative actor state; read-only callers use getActorState().
   */
  public advanceConcentrationRound(actorId: string): ActiveConcentration | undefined {
    const state = this.actorStates.get(actorId);
    const active = state?.activeConcentration;
    if (!active) return undefined;

    active.remainingRounds = Math.max(0, active.remainingRounds - 1);
    const participant = this.participantRefs.get(actorId);
    if (participant) {
      participant.activeConcentration = JSON.parse(JSON.stringify(active));
    }
    return JSON.parse(JSON.stringify(active));
  }

  public breakConcentration(
    actorId: string,
    reason: string
  ): {
    broken: boolean;
    previousSpell?: { spellId: string; spellName: string };
    cleanedUpConditions: Array<{ targetId: string; condition: string }>;
  } {
    // Concentration cancellation is a state mutation, so it must operate on
    // the authoritative actor-state object rather than the read-only projection.
    const state = this.actorStates.get(actorId);
    const active = state?.activeConcentration;
    if (!state || !active) {
      return { broken: false, cleanedUpConditions: [] };
    }

    const cleanedUpConditions: Array<{ targetId: string; condition: string }> = [];
    if (Array.isArray(active.appliedConditions)) {
      for (const item of active.appliedConditions) {
        if (item.conditionInstanceId) {
          this.conditionEngine.removeCondition(item.targetId, item.conditionInstanceId);
        } else {
          // Backward-compatible cleanup for older persisted concentration state.
          this.conditionEngine.removeCondition(item.targetId, item.condition);
        }

        const participant = this.participantRefs.get(item.targetId);
        const conditionState = this.conditionEngine.getActorState(item.targetId);
        if (participant && conditionState) {
          participant.conditions = conditionState.instances.map((instance) => instance.name);
        }

        cleanedUpConditions.push(item);
      }
    }

    const buffEffects = active.effects?.buffs as Array<{
      targetId: string;
      previousArmorClass: number;
      previousSpeedCells: number;
      previousAttackBonus: number;
      previousSavingThrowModifiers?: Record<string, number>;
      appliedArmorClassBonus?: number;
      appliedSpeedMultiplier?: number;
      appliedAttackBonusModifier?: number;
      appliedSaveBonusModifier?: number;
    }> | undefined;
    if (Array.isArray(buffEffects)) {
      for (const effect of buffEffects) {
        const participant = this.participantRefs.get(effect.targetId);
        if (!participant) continue;

        if (typeof effect.appliedArmorClassBonus === 'number') {
          participant.armorClass -= effect.appliedArmorClassBonus;
        } else {
          participant.armorClass = effect.previousArmorClass;
        }

        if (typeof effect.appliedSpeedMultiplier === 'number' && effect.appliedSpeedMultiplier > 0) {
          participant.speedCells /= effect.appliedSpeedMultiplier;
        } else {
          participant.speedCells = effect.previousSpeedCells;
        }

        if (typeof effect.appliedAttackBonusModifier === 'number') {
          participant.attackBonus -= effect.appliedAttackBonusModifier;
        } else {
          participant.attackBonus = effect.previousAttackBonus;
        }

        if (typeof effect.appliedSaveBonusModifier === 'number') {
          const nextSaves = { ...(participant.savingThrowModifiers || {}) };
          for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
            if (nextSaves[ability] !== undefined) {
              nextSaves[ability] -= effect.appliedSaveBonusModifier;
            }
          }
          participant.savingThrowModifiers = nextSaves;
        } else if (effect.previousSavingThrowModifiers) {
          participant.savingThrowModifiers = { ...effect.previousSavingThrowModifiers };
        }
      }
    }

    const previousSpell = {
      spellId: active.spellId,
      spellName: active.spellName,
    };
    state.activeConcentration = null;
    const concentratingParticipant = this.participantRefs.get(actorId);
    if (concentratingParticipant) {
      concentratingParticipant.activeConcentration = null;
    }

    return {
      broken: true,
      previousSpell,
      cleanedUpConditions,
    };
  }

  public resolveDamageConcentrationCheck(
    targetParticipant: BattlefieldParticipant,
    damageTaken: number,
    diceEngine?: LocalDiceEngine,
    participantContext: BattlefieldParticipant[] = []
  ): ConcentrationCheckResult | undefined {
    if (participantContext.length > 0) this.setParticipantContext(participantContext);
    const state = this.getActorState(targetParticipant.id);
    const active = state?.activeConcentration;
    if (!state || !active || damageTaken <= 0) return undefined;

    const dc = Math.max(10, Math.floor(damageTaken / 2));
    const conMod = targetParticipant.saveModifiers?.CON ?? 0;
    const dice = diceEngine || LocalDiceEngine;
    const roll = dice.roll('1d20', conMod);
    const succeeded = roll.total >= dc;

    if (!succeeded) {
      const breakRes = this.breakConcentration(
        targetParticipant.id,
        `Failed Constitution concentration check (${roll.total} vs DC ${dc}) after taking ${damageTaken} damage`
      );
      return {
        actorId: targetParticipant.id,
        spellId: active.spellId,
        spellName: active.spellName,
        damageTaken,
        dc,
        saveModifier: conMod,
        roll,
        succeeded: false,
        concentrationBroken: true,
        cleanedUpConditions: breakRes.cleanedUpConditions,
        headline: `${targetParticipant.name} took ${damageTaken} damage and failed concentration save (rolled ${roll.total} vs DC ${dc}). Concentration on ${active.spellName} was broken!`,
      };
    }

    return {
      actorId: targetParticipant.id,
      spellId: active.spellId,
      spellName: active.spellName,
      damageTaken,
      dc,
      saveModifier: conMod,
      roll,
      succeeded: true,
      concentrationBroken: false,
      cleanedUpConditions: [],
      headline: `${targetParticipant.name} maintained concentration on ${active.spellName} (rolled ${roll.total} vs DC ${dc}).`,
    };
  }

  public castSpellAuthoritative(params: {
    request: CastSpellRequest;
    casterParticipant?: BattlefieldParticipant;
    targetParticipant?: BattlefieldParticipant;
    allParticipants?: BattlefieldParticipant[];
  }): CastSpellExecutionResult {
    const { request, allParticipants = [] } = params;
    const {
      casterId,
      spellId,
      targetId,
      isRitual = false,
      slotLevel: requestedSlotLevel,
      advantage = false,
      disadvantage = false,
      combatRound = 1,
      combatTurnIndex = 0,
      rulesProfile,
    } = request;

    const spell = this.getSpell(spellId);
    if (!spell) {
      return {
        success: false,
        errorCode: 'SPELL_NOT_FOUND',
        errorReason: `Spell "${spellId}" does not exist in canonical spell catalog.`,
        spellId,
        spellName: spellId,
        slotLevelUsed: 0,
        isRitual,
        requiresConcentration: false,
        headline: `Spell casting failed: unknown spell "${spellId}".`,
      };
    }

    const existingState = this.actorStates.get(casterId);
    const state = existingState || this.createDefaultActorState(casterId, {
      spellAttackBonus: params.casterParticipant?.attackBonus,
      spellSaveDc: params.casterParticipant?.savingThrowModifiers?.INT
        ? 8 + 3 + (params.casterParticipant.savingThrowModifiers.INT || 0)
        : undefined,
    });

    const casterParticipant: BattlefieldParticipant = params.casterParticipant || {
      id: casterId,
      name: casterId,
      team: 'player_allies',
      x: 0,
      y: 0,
      initiative: 10,
      armorClass: 15,
      attackBonus: state.spellAttackBonus,
      hpCurrent: 30,
      hpMax: 30,
      speedCells: 6,
      damageFormula: '1d6',
      conditions: [],
      isDead: false,
      spellAttackBonus: state.spellAttackBonus,
      spellSaveDc: state.spellSaveDc,
      spellSlots: state.spellSlots,
      preparedSpells: state.preparedSpells,
      knownSpells: state.knownSpells,
    };

    let targetParticipant = params.targetParticipant;
    if (!targetParticipant && targetId) {
      if (targetId === casterId) {
        targetParticipant = casterParticipant;
      } else if (request.allowSyntheticTarget) {
        // Explicitly isolated/test-only compatibility path. Authoritative API/combat
        // callers set requireAuthoritativeTarget and never reach this branch.
        const isTouch = spell.rangeType === 'TOUCH' || spell.range <= 5;
        targetParticipant = {
          id: targetId,
          name: targetId,
          team: spell.targetType === 'SINGLE_ALLY' ? 'player_allies' : 'enemies',
          x: request.targetPosition?.x ?? (isTouch ? casterParticipant.x : casterParticipant.x + 2),
          y: request.targetPosition?.y ?? casterParticipant.y,
          initiative: 10,
          armorClass: 13,
          attackBonus: 2,
          damageFormula: '1d6',
          conditions: [],
          isDead: false,
          hpCurrent: 25,
          hpMax: 25,
          speedCells: 6,
        };
      } else if (request.requireAuthoritativeTarget) {
        return {
          success: false,
          errorCode: 'TARGET_NOT_FOUND',
          errorReason: 'Target ' + targetId + ' is not present in authoritative combat state.',
          spellId: spell.id,
          spellName: spell.name,
          slotLevelUsed: 0,
          isRitual,
          requiresConcentration: spell.requiresConcentration,
          headline: 'Cannot cast ' + spell.name + ': target ' + targetId + ' was not found in authoritative state.',
        };
      }
    }

    if (spell.targetType === 'SELF' && !targetParticipant) {
      targetParticipant = casterParticipant;
    }

    const isAreaSpell = spell.targetType === 'POINT' || spell.targetType === 'AREA_SPHERE' || spell.targetType === 'AREA_LINE' || spell.targetType === 'AREA_CONE';
    if (request.requireAuthoritativeTarget && spell.targetType !== 'SELF' && !isAreaSpell && !targetParticipant) {
      return {
        success: false,
        errorCode: 'TARGET_REQUIRED',
        errorReason: 'Spell ' + spell.name + ' requires an authoritative target.',
        spellId: spell.id,
        spellName: spell.name,
        slotLevelUsed: 0,
        isRitual,
        requiresConcentration: spell.requiresConcentration,
        headline: 'Cannot cast ' + spell.name + ': no authoritative target was provided.',
      };
    }

    const profile = rulesProfile || rulesProfileEngine.createDefault('FULL_DND');
    const allowsStandardSpellRules = rulesProfileEngine.allowsStandardDndSpellRules(profile);
    const standardOverrides = profile.parameterOverrides?.standard_dnd_spell_rules as Record<string, unknown> | undefined;
    const customOverrides = profile.parameterOverrides?.custom_spell_rules as Record<string, unknown> | undefined;
    const overrides = allowsStandardSpellRules ? standardOverrides : customOverrides;
    const unlimitedSlots = Boolean(overrides?.unlimitedSpellSlots);
    const allowUnprepared = Boolean(overrides?.allowUnpreparedCasting);
    const maxAllowedLevel = overrides?.maxAllowedSpellLevel !== undefined ? Number(overrides.maxAllowedSpellLevel) : undefined;
    const enforceSlotConsumption = allowsStandardSpellRules
      ? !unlimitedSlots
      : Boolean(customOverrides?.enforceSlotConsumption);

    // Rule: Mode-specific level caps
    if (maxAllowedLevel !== undefined && spell.level > maxAllowedLevel) {
      return {
        success: false,
        errorCode: 'SPELL_LEVEL_EXCEEDS_CAP',
        errorReason: `Spell level ${spell.level} exceeds rules profile maximum of ${maxAllowedLevel}.`,
        spellId: spell.id,
        spellName: spell.name,
        slotLevelUsed: 0,
        isRitual,
        requiresConcentration: spell.requiresConcentration,
        headline: `Cast rejected: spell level exceeds maximum allowed by rules profile.`,
      };
    }

    // Rule 1: Prepared / Known Spells Check
    if (
      allowsStandardSpellRules &&
      spell.level > 0 &&
      state.requiresPreparation &&
      !allowUnprepared
    ) {
      const isKnown = state.knownSpells.some((k) => k.toLowerCase() === spell.id.toLowerCase() || this.normalizeName(k) === spell.id);
      const isPrepared = state.preparedSpells.some((p) => p.toLowerCase() === spell.id.toLowerCase() || this.normalizeName(p) === spell.id);
      if (!isPrepared && !isRitual) {
        return {
          success: false,
          errorCode: 'SPELL_NOT_PREPARED',
          errorReason: `Spell "${spell.name}" is not prepared by caster "${casterId}".`,
          spellId: spell.id,
          spellName: spell.name,
          slotLevelUsed: 0,
          isRitual,
          requiresConcentration: spell.requiresConcentration,
          headline: `Cannot cast ${spell.name}: spell is not prepared.`,
        };
      }
    }

    // Rule 2: Ritual Casting Verification. Standard D&D ritual legality is enforced
    // only when standard spell rules are enabled; Custom Homebrew owns its own semantics.
    if (isRitual && allowsStandardSpellRules) {
      if (!spell.isRitual) {
        return {
          success: false,
          errorCode: 'NOT_A_RITUAL_SPELL',
          errorReason: `Spell "${spell.name}" does not possess the ritual tag and cannot be cast as a ritual.`,
          spellId: spell.id,
          spellName: spell.name,
          slotLevelUsed: 0,
          isRitual: true,
          requiresConcentration: spell.requiresConcentration,
          headline: `Cannot cast ${spell.name} as ritual: spell lacks ritual property.`,
        };
      }
    }

    // Rule 3: Spell Slot Level & Consumption
    const effectiveSlotLevel = isRitual
      ? 0
      : spell.level === 0
        ? 0
        : (requestedSlotLevel !== undefined ? requestedSlotLevel : spell.level);

    if (effectiveSlotLevel > 0 && effectiveSlotLevel < spell.level) {
      return {
        success: false,
        errorCode: 'INVALID_SLOT_LEVEL',
        errorReason: `Cannot cast level ${spell.level} spell with level ${effectiveSlotLevel} slot.`,
        spellId: spell.id,
        spellName: spell.name,
        slotLevelUsed: effectiveSlotLevel,
        isRitual,
        requiresConcentration: spell.requiresConcentration,
        headline: `Invalid slot level ${effectiveSlotLevel} for ${spell.name}.`,
      };
    }

    if (effectiveSlotLevel > 0 && enforceSlotConsumption) {
      const slot = state.spellSlots[effectiveSlotLevel];
      if (!slot || slot.current <= 0) {
        return {
          success: false,
          errorCode: 'INSUFFICIENT_SPELL_SLOTS',
          errorReason: `Caster has no available level ${effectiveSlotLevel} spell slots.`,
          spellId: spell.id,
          spellName: spell.name,
          slotLevelUsed: effectiveSlotLevel,
          isRitual,
          requiresConcentration: spell.requiresConcentration,
          headline: `Cannot cast ${spell.name}: no level ${effectiveSlotLevel} spell slots remaining.`,
        };
      }
    }

    // Rule 4: Targeting & Range Verification
    const targetTypeRequiresCreature = new Set<SpellTargetType>(['TOUCH', 'SINGLE_CREATURE', 'SINGLE_ENEMY', 'SINGLE_ALLY']);
    if (targetTypeRequiresCreature.has(spell.targetType) && !targetParticipant && (!targetId || request.requireAuthoritativeTarget)) {
      return {
        success: false,
        errorCode: 'TARGET_REQUIRED',
        errorReason: 'Spell "' + spell.name + '" requires a creature target.',
        spellId: spell.id,
        spellName: spell.name,
        slotLevelUsed: effectiveSlotLevel,
        isRitual,
        requiresConcentration: spell.requiresConcentration,
        headline: 'Cannot cast ' + spell.name + ': no creature target was provided.',
      };
    }
    if (spell.targetType === 'SELF' && targetParticipant && targetParticipant.id !== casterId) {
      return {
        success: false,
        errorCode: 'INVALID_TARGET_TYPE',
        errorReason: 'Spell "' + spell.name + '" is self-targeted and cannot target "' + targetParticipant.name + '".',
        spellId: spell.id,
        spellName: spell.name,
        slotLevelUsed: effectiveSlotLevel,
        isRitual,
        requiresConcentration: spell.requiresConcentration,
        headline: 'Cannot cast ' + spell.name + ': invalid self target.',
      };
    }
    if (spell.targetType === 'SINGLE_ALLY' && targetParticipant && targetParticipant.team !== casterParticipant.team) {
      return {
        success: false,
        errorCode: 'INVALID_ALLY_TARGET',
        errorReason: 'Target "' + targetParticipant.name + '" is not allied with the caster.',
        spellId: spell.id,
        spellName: spell.name,
        slotLevelUsed: effectiveSlotLevel,
        isRitual,
        requiresConcentration: spell.requiresConcentration,
        headline: 'Cannot cast ' + spell.name + ': target is not an ally.',
      };
    }
    if (spell.targetType === 'SINGLE_ENEMY' && (!targetParticipant || targetParticipant.team === casterParticipant.team || targetParticipant.team === 'neutral')) {
      return {
        success: false,
        errorCode: 'INVALID_ENEMY_TARGET',
        errorReason: 'Target "' + (targetParticipant?.name || targetId || 'unknown') + '" is not a hostile creature.',
        spellId: spell.id,
        spellName: spell.name,
        slotLevelUsed: effectiveSlotLevel,
        isRitual,
        requiresConcentration: spell.requiresConcentration,
        headline: 'Cannot cast ' + spell.name + ': target is not hostile.',
      };
    }
    const isAreaOrPointTarget = spell.targetType === 'POINT' || spell.targetType === 'AREA_SPHERE' || spell.targetType === 'AREA_LINE' || spell.targetType === 'AREA_CONE';
    if (isAreaOrPointTarget && !request.targetPosition && !targetParticipant) {
      return {
        success: false,
        errorCode: 'TARGET_POSITION_REQUIRED',
        errorReason: 'Spell "' + spell.name + '" requires a target point or center.',
        spellId: spell.id,
        spellName: spell.name,
        slotLevelUsed: effectiveSlotLevel,
        isRitual,
        requiresConcentration: spell.requiresConcentration,
        headline: 'Cannot cast ' + spell.name + ': no target position was provided.',
      };
    }
    if (isAreaOrPointTarget && request.targetPosition && spell.rangeType !== 'SELF' && spell.rangeType !== 'UNLIMITED' && spell.range > 0) {
      const dx = (request.targetPosition.x - casterParticipant.x) * 5;
      const dy = (request.targetPosition.y - casterParticipant.y) * 5;
      const distanceFeet = Math.hypot(dx, dy);
      if (distanceFeet > spell.range + 0.1) {
        return {
          success: false,
          errorCode: 'TARGET_OUT_OF_RANGE',
          errorReason: 'Target point is ' + Math.round(distanceFeet) + 'ft away, exceeding spell range of ' + spell.range + 'ft.',
          spellId: spell.id,
          spellName: spell.name,
          slotLevelUsed: effectiveSlotLevel,
          isRitual,
          requiresConcentration: spell.requiresConcentration,
          headline: 'Target point is out of range (' + Math.round(distanceFeet) + 'ft / ' + spell.range + 'ft).',
        };
      }
    }
        if (targetParticipant) {
      // Check Total Cover
      if (targetParticipant.cover === 'TOTAL' && spell.targetType !== 'SELF') {
        return {
          success: false,
          errorCode: 'TARGET_BEHIND_TOTAL_COVER',
          errorReason: `Target ${targetParticipant.name} has Total Cover and cannot be targeted directly.`,
          spellId: spell.id,
          spellName: spell.name,
          slotLevelUsed: effectiveSlotLevel,
          isRitual,
          requiresConcentration: spell.requiresConcentration,
          headline: `Spell blocked: target has Total Cover.`,
        };
      }

      // Check range
      if (spell.rangeType !== 'SELF' && spell.rangeType !== 'UNLIMITED' && spell.range > 0) {
        const dx = (targetParticipant.x - casterParticipant.x) * 5;
        const dy = (targetParticipant.y - casterParticipant.y) * 5;
        const distanceFeet = Math.hypot(dx, dy);
        if (distanceFeet > spell.range + 0.1) {
          return {
            success: false,
            errorCode: 'TARGET_OUT_OF_RANGE',
            errorReason: `Target ${targetParticipant.name} is ${Math.round(distanceFeet)}ft away, exceeding spell range of ${spell.range}ft.`,
            spellId: spell.id,
            spellName: spell.name,
            slotLevelUsed: effectiveSlotLevel,
            isRitual,
            requiresConcentration: spell.requiresConcentration,
            headline: `Target is out of range (${Math.round(distanceFeet)}ft / ${spell.range}ft).`,
          };
        }
      }
    }

    const areaTargets = isAreaSpell
      ? this.resolveAreaTargets(spell, casterParticipant, targetParticipant, request.targetPosition, allParticipants)
      : [];

    if (isAreaSpell && areaTargets.length === 0) {
      return {
        success: false,
        errorCode: 'NO_AREA_TARGETS',
        errorReason: 'Spell "' + spell.name + '" did not resolve any valid targets at the selected point.',
        spellId: spell.id,
        spellName: spell.name,
        slotLevelUsed: effectiveSlotLevel,
        isRitual,
        requiresConcentration: spell.requiresConcentration,
        headline: 'Cannot cast ' + spell.name + ': no valid creatures were affected.',
      };
    }


    // --- ATOMIC AUTHORITATIVE EXECUTION COMMENCES ---
    // No persistent spell state or participant binding is created until every
    // validation above has succeeded.
    if (!existingState) {
      this.actorStates.set(casterId, state);
    }
    this.setParticipantContext(
      allParticipants.length > 0
        ? allParticipants
        : [casterParticipant].filter(Boolean) as BattlefieldParticipant[]
    );

    // 1. Consume Spell Slot (if leveled spell and not ritual)
    if (effectiveSlotLevel > 0 && enforceSlotConsumption) {
      state.spellSlots[effectiveSlotLevel].current = Math.max(
        0,
        state.spellSlots[effectiveSlotLevel].current - 1
      );
    }

    // 2. Concentration Transition
    let brokenPreviousConcentration: { spellId: string; spellName: string } | undefined;
    if (spell.requiresConcentration) {
      if (state.activeConcentration) {
        const breakRes = this.breakConcentration(
          casterId,
          `Cast new concentration spell ${spell.name}`
        );
        if (breakRes.previousSpell) {
          brokenPreviousConcentration = breakRes.previousSpell;
        }
      }
    }

    // 3. Effect Resolution
    const dice = request.diceEngine || new LocalDiceEngine(1337);
    let attackResult: { roll: RollRecord; hits: boolean; isCritical: boolean } | undefined;
    let savingThrowResult: { roll: RollRecord; succeeds: boolean; ability: string; dc: number } | undefined;
    let damageInflicted = 0;
    let healingApplied = 0;
    let targetDied = false;
    let targetHpRemaining = targetParticipant?.hpCurrent ?? 0;
    let targetImmune = false;
    let targetResisted = false;
    let targetVulnerable = false;
    const conditionsApplied: string[] = [];
    const conditionsRemoved: string[] = [];
    const concentrationAppliedConditions: Array<{
      targetId: string;
      condition: string;
      conditionInstanceId?: string;
    }> = [];
    const concentrationBuffEffects: Array<{
      targetId: string;
      previousArmorClass: number;
      previousSpeedCells: number;
      previousAttackBonus: number;
      previousSavingThrowModifiers?: Record<string, number>;
      appliedArmorClassBonus?: number;
      appliedSpeedMultiplier?: number;
      appliedAttackBonusModifier?: number;
      appliedSaveBonusModifier?: number;
    }> = [];
    let movementApplied: { from: { x: number; y: number }; to: { x: number; y: number } } | undefined;
    let targetConcCheck: ConcentrationCheckResult | undefined;

    // Upcasting scaling calculations
    const upcastLevelDelta = Math.max(0, effectiveSlotLevel - spell.level);

    if (isAreaSpell) {
      for (const areaTarget of areaTargets) {
        if (spell.defenseModel === 'SAVING_THROW') {
          const ability = spell.savingThrowAbility || 'DEX';
          const saveMod = areaTarget.saveModifiers?.[ability] ?? 0;
          const dc = state.spellSaveDc;
          const roll = dice.roll('1d20', saveMod);
          const targetConditions = new Set((areaTarget.conditions || []).map((c) => c.toLowerCase()));
          const automaticFailure =
            ['paralyzed', 'petrified', 'stunned', 'unconscious'].some((cond) => targetConditions.has(cond)) &&
            ['STR', 'DEX'].includes(ability);
          const succeeds = automaticFailure ? false : roll.total >= dc;
          savingThrowResult = { roll, succeeds, ability, dc };

          if (spell.damageFormula) {
            let baseDmg = dice.roll(spell.damageFormula).total;
            if (upcastLevelDelta > 0 && spell.upcastDamageDicePerLevel) {
              for (let u = 0; u < upcastLevelDelta; u++) baseDmg += dice.roll(spell.upcastDamageDicePerLevel).total;
            }
            if (succeeds) baseDmg = spell.halfDamageOnSave ? Math.floor(baseDmg / 2) : 0;
            if (baseDmg > 0) {
              const dmgRes = request.damageResolver
                ? request.damageResolver(areaTarget, baseDmg, spell.damageType || 'force', false)
                : this.applyAuthoritativeDamage(areaTarget, baseDmg, spell.damageType || 'force');
              damageInflicted += dmgRes.damage;
              targetDied = targetDied || dmgRes.targetDied;
              targetHpRemaining = areaTarget.hpCurrent;
              targetImmune = targetImmune || Boolean(dmgRes.immune);
              targetResisted = targetResisted || Boolean(dmgRes.resisted);
              targetVulnerable = targetVulnerable || Boolean(dmgRes.vulnerable);
              if (dmgRes.damage > 0 && !request.damageResolver) {
                targetConcCheck = this.resolveDamageConcentrationCheck(areaTarget, dmgRes.damage, dice, allParticipants);
              }
            }
          }

          if (!succeeds && Array.isArray(spell.appliedConditions)) {
            for (const cond of spell.appliedConditions) {
              const conditionResult = this.conditionEngine.applyCondition(areaTarget.id, {
                definitionIdOrName: cond,
                sourceActorId: casterId,
                durationSeconds: (spell.durationRounds || 1) * 6,
              });
              if (conditionResult.applied && !conditionResult.immune && conditionResult.reason !== 'Existing condition updated.') {
                areaTarget.conditions = this.conditionEngine.getActorState(areaTarget.id)?.instances.map((instance) => instance.name) || areaTarget.conditions;
                conditionsApplied.push(cond);
                concentrationAppliedConditions.push({
                  targetId: areaTarget.id,
                  condition: cond,
                  conditionInstanceId: conditionResult.instance?.id,
                });
              }
            }
          }
        } else if (spell.defenseModel === 'AUTOMATIC') {
          if (!spell.damageFormula) continue;
          let baseDmg = dice.roll(spell.damageFormula).total;
          if (upcastLevelDelta > 0 && spell.upcastDamageDicePerLevel) {
            for (let u = 0; u < upcastLevelDelta; u++) baseDmg += dice.roll(spell.upcastDamageDicePerLevel).total;
          }
          const dmgRes = request.damageResolver
            ? request.damageResolver(areaTarget, baseDmg, spell.damageType || 'force', false)
            : this.applyAuthoritativeDamage(areaTarget, baseDmg, spell.damageType || 'force');
          damageInflicted += dmgRes.damage;
          targetDied = targetDied || dmgRes.targetDied;
          targetHpRemaining = areaTarget.hpCurrent;
          targetImmune = targetImmune || Boolean(dmgRes.immune);
          targetResisted = targetResisted || Boolean(dmgRes.resisted);
          targetVulnerable = targetVulnerable || Boolean(dmgRes.vulnerable);
          if (dmgRes.damage > 0 && !request.damageResolver) {
            targetConcCheck = this.resolveDamageConcentrationCheck(areaTarget, dmgRes.damage, dice, allParticipants);
          }
        } else if (spell.defenseModel === 'HEAL' && spell.healingFormula) {
          let healAmt = dice.roll(spell.healingFormula).total;
          if (upcastLevelDelta > 0 && spell.upcastHealingDicePerLevel) {
            for (let u = 0; u < upcastLevelDelta; u++) healAmt += dice.roll(spell.upcastHealingDicePerLevel).total;
          }
          const healResult = request.healingResolver
            ? request.healingResolver(areaTarget, healAmt)
            : undefined;
          if (healResult) {
            healingApplied += healResult.healing;
          } else {
            const oldHp = areaTarget.hpCurrent;
            areaTarget.hpCurrent = Math.min(areaTarget.hpMax, areaTarget.hpCurrent + healAmt);
            healingApplied += areaTarget.hpCurrent - oldHp;
          }
          targetHpRemaining = areaTarget.hpCurrent;
        }
      }
    } else if (spell.defenseModel === 'ATTACK_VS_AC' && targetParticipant) {
      const roll1 = dice.roll('1d20', state.spellAttackBonus);
      let chosenRoll = roll1;
      if (advantage && !disadvantage) {
        const roll2 = dice.roll('1d20', state.spellAttackBonus);
        chosenRoll = roll2.total > roll1.total ? roll2 : roll1;
      } else if (disadvantage && !advantage) {
        const roll2 = dice.roll('1d20', state.spellAttackBonus);
        chosenRoll = roll2.total < roll1.total ? roll2 : roll1;
      }
      const nat20 = chosenRoll.individualDice[0] === 20;
      const nat1 = chosenRoll.individualDice[0] === 1;
      const hits = nat20 ? true : nat1 ? false : chosenRoll.total >= targetParticipant.armorClass;
      attackResult = {
        roll: chosenRoll,
        hits,
        isCritical: nat20,
      };

      if (hits && spell.damageFormula) {
        const baseDmgRoll = dice.roll(spell.damageFormula);
        let dmgTotal = baseDmgRoll.total;
        if (upcastLevelDelta > 0 && spell.upcastDamageDicePerLevel) {
          for (let u = 0; u < upcastLevelDelta; u++) {
            dmgTotal += dice.roll(spell.upcastDamageDicePerLevel).total;
          }
        }
        if (nat20) dmgTotal *= 2; // Critical damage

        const dmgRes = request.damageResolver
          ? request.damageResolver(targetParticipant, dmgTotal, spell.damageType || 'force', nat20)
          : this.applyAuthoritativeDamage(targetParticipant, dmgTotal, spell.damageType || 'force');
        damageInflicted = dmgRes.damage;
        targetDied = dmgRes.targetDied;
        targetHpRemaining = targetParticipant.hpCurrent;
        targetImmune = Boolean(dmgRes.immune);
        targetResisted = Boolean(dmgRes.resisted);
        targetVulnerable = Boolean(dmgRes.vulnerable);

        if (damageInflicted > 0 && !request.damageResolver) {
          targetConcCheck = this.resolveDamageConcentrationCheck(targetParticipant, damageInflicted, dice);
        }
      }
    } else if (spell.defenseModel === 'SAVING_THROW' && targetParticipant) {
      const ability = spell.savingThrowAbility || 'DEX';
      const saveMod = targetParticipant.saveModifiers?.[ability] ?? 0;
      const dc = state.spellSaveDc;

      const roll = dice.roll('1d20', saveMod);
      const targetConditions = new Set((targetParticipant.conditions || []).map((c) => c.toLowerCase()));
      const automaticFailure =
        ['paralyzed', 'petrified', 'stunned', 'unconscious'].some((c) => targetConditions.has(c)) &&
        ['STR', 'DEX'].includes(ability);

      const succeeds = automaticFailure ? false : roll.total >= dc;
      savingThrowResult = { roll, succeeds, ability, dc };

      if (spell.damageFormula) {
        let baseDmg = dice.roll(spell.damageFormula).total;
        if (upcastLevelDelta > 0 && spell.upcastDamageDicePerLevel) {
          for (let u = 0; u < upcastLevelDelta; u++) {
            baseDmg += dice.roll(spell.upcastDamageDicePerLevel).total;
          }
        }
        if (succeeds) {
          baseDmg = spell.halfDamageOnSave ? Math.floor(baseDmg / 2) : 0;
        }

        if (baseDmg > 0) {
          const dmgRes = request.damageResolver
            ? request.damageResolver(targetParticipant, baseDmg, spell.damageType || 'force', false)
            : this.applyAuthoritativeDamage(targetParticipant, baseDmg, spell.damageType || 'force');
          damageInflicted = dmgRes.damage;
          targetDied = dmgRes.targetDied;
          targetHpRemaining = targetParticipant.hpCurrent;
          targetImmune = Boolean(dmgRes.immune);
          targetResisted = Boolean(dmgRes.resisted);
          targetVulnerable = Boolean(dmgRes.vulnerable);

          if (damageInflicted > 0 && !request.damageResolver) {
            targetConcCheck = this.resolveDamageConcentrationCheck(targetParticipant, damageInflicted, dice);
          }
        }
      }

      // If save failed, apply status conditions
      if (!succeeds && Array.isArray(spell.appliedConditions)) {
        for (const cond of spell.appliedConditions) {
          const conditionResult = this.conditionEngine.applyCondition(targetParticipant.id, {
            definitionIdOrName: cond,
            sourceActorId: casterId,
            durationSeconds: (spell.durationRounds || 1) * 6,
          });
          if (conditionResult.applied && !conditionResult.immune && conditionResult.reason !== 'Existing condition updated.') {
            targetParticipant.conditions = this.conditionEngine.getActorState(targetParticipant.id)?.instances.map((instance) => instance.name) || targetParticipant.conditions;
            conditionsApplied.push(cond);
            concentrationAppliedConditions.push({
              targetId: targetParticipant.id,
              condition: cond,
              conditionInstanceId: conditionResult.instance?.id,
            });
          }
        }
      }
    } else if (spell.defenseModel === 'AUTOMATIC' && targetParticipant) {
      if (spell.damageFormula) {
        let baseDmg = dice.roll(spell.damageFormula).total;
        if (upcastLevelDelta > 0 && spell.upcastDamageDicePerLevel) {
          for (let u = 0; u < upcastLevelDelta; u++) {
            baseDmg += dice.roll(spell.upcastDamageDicePerLevel).total;
          }
        }
        const dmgRes = request.damageResolver
          ? request.damageResolver(targetParticipant, baseDmg, spell.damageType || 'force', false)
          : this.applyAuthoritativeDamage(targetParticipant, baseDmg, spell.damageType || 'force');
        damageInflicted = dmgRes.damage;
        targetDied = dmgRes.targetDied;
        targetHpRemaining = targetParticipant.hpCurrent;
        targetImmune = Boolean(dmgRes.immune);
        targetResisted = Boolean(dmgRes.resisted);
        targetVulnerable = Boolean(dmgRes.vulnerable);

        if (damageInflicted > 0) {
          targetConcCheck = this.resolveDamageConcentrationCheck(targetParticipant, damageInflicted, dice);
        }
      }
    } else if (spell.defenseModel === 'HEAL' && targetParticipant) {
      if (spell.healingFormula) {
        let healAmt = dice.roll(spell.healingFormula).total;
        if (upcastLevelDelta > 0 && spell.upcastHealingDicePerLevel) {
          for (let u = 0; u < upcastLevelDelta; u++) {
            healAmt += dice.roll(spell.upcastHealingDicePerLevel).total;
          }
        }
        const healResult = request.healingResolver
          ? request.healingResolver(targetParticipant, healAmt)
          : undefined;

        if (healResult) {
          healingApplied = healResult.healing;
          if (healResult.revived) conditionsRemoved.push('Unconscious');
        } else {
          const oldHp = targetParticipant.hpCurrent;
          targetParticipant.hpCurrent = Math.min(
            targetParticipant.hpMax,
            targetParticipant.hpCurrent + healAmt
          );
          healingApplied = targetParticipant.hpCurrent - oldHp;
          targetHpRemaining = targetParticipant.hpCurrent;

          // Isolated/unit-test fallback: keep the legacy local revive behavior.
          if (oldHp <= 0 && targetParticipant.hpCurrent > 0) {
            targetParticipant.isDead = false;
            targetParticipant.conditions = targetParticipant.conditions.filter(
              (c) => c !== 'Unconscious' && c !== 'Dead'
            );
            this.conditionEngine.recoverFromZero(targetParticipant.id, targetParticipant.hpCurrent);
            conditionsRemoved.push('Unconscious');
          }
        }
        targetHpRemaining = targetParticipant.hpCurrent;
      }
    } else if (spell.defenseModel === 'BUFF') {
      const buffTarget = targetParticipant || casterParticipant;
      if (Array.isArray(spell.appliedConditions)) {
        for (const cond of spell.appliedConditions) {
          const conditionResult = this.conditionEngine.applyCondition(buffTarget.id, {
            definitionIdOrName: cond,
            sourceActorId: casterId,
            durationSeconds: (spell.durationRounds || 1) * 6,
          });
          if (conditionResult.applied && !conditionResult.immune && conditionResult.reason !== 'Existing condition updated.') {
            buffTarget.conditions = this.conditionEngine.getActorState(buffTarget.id)?.instances.map((instance) => instance.name) || buffTarget.conditions;
            conditionsApplied.push(cond);
            concentrationAppliedConditions.push({
              targetId: buffTarget.id,
              condition: cond,
              conditionInstanceId: conditionResult.instance?.id,
            });
          }
        }
      }

      if (spell.buffEffect) {
        const previousSavingThrowModifiers = buffTarget.savingThrowModifiers
          ? { ...buffTarget.savingThrowModifiers }
          : undefined;
        const appliedArmorClassBonus = Number(spell.buffEffect.armorClassBonus || 0);
        const appliedSpeedMultiplier = Number(spell.buffEffect.speedMultiplier || 0);
        const appliedAttackBonusModifier = Number(spell.buffEffect.attackBonusModifier || 0);
        const appliedSaveBonusModifier = Number(spell.buffEffect.saveBonusModifier || 0);

        concentrationBuffEffects.push({
          targetId: buffTarget.id,
          previousArmorClass: buffTarget.armorClass,
          previousSpeedCells: buffTarget.speedCells,
          previousAttackBonus: buffTarget.attackBonus,
          previousSavingThrowModifiers,
          appliedArmorClassBonus: appliedArmorClassBonus !== 0 ? appliedArmorClassBonus : undefined,
          appliedSpeedMultiplier: appliedSpeedMultiplier > 0 && appliedSpeedMultiplier !== 1
            ? appliedSpeedMultiplier
            : undefined,
          appliedAttackBonusModifier: appliedAttackBonusModifier !== 0 ? appliedAttackBonusModifier : undefined,
          appliedSaveBonusModifier: appliedSaveBonusModifier !== 0 ? appliedSaveBonusModifier : undefined,
        });

        if (appliedArmorClassBonus !== 0) {
          buffTarget.armorClass += appliedArmorClassBonus;
        }
        if (appliedSpeedMultiplier > 0) {
          buffTarget.speedCells *= appliedSpeedMultiplier;
        }
        if (appliedAttackBonusModifier !== 0) {
          buffTarget.attackBonus += appliedAttackBonusModifier;
        }
        if (appliedSaveBonusModifier !== 0) {
          const nextSaves = { ...(buffTarget.savingThrowModifiers || {}) };
          for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
            nextSaves[ability] = (nextSaves[ability] || 0) + appliedSaveBonusModifier;
          }
          buffTarget.savingThrowModifiers = nextSaves;
        }
      }
    }

    // Movement / Teleportation
    if (spell.movementEffect) {
      const moveTarget = targetParticipant || casterParticipant;
      const initialPos = { x: moveTarget.x, y: moveTarget.y };
      if (spell.movementEffect.type === 'TELEPORT') {
        // Teleport to requested position or offset
        const targetPos = request.targetPosition || {
          x: moveTarget.x + Math.min(6, Math.floor(spell.movementEffect.distanceFeet / 5)),
          y: moveTarget.y,
        };
        moveTarget.x = targetPos.x;
        moveTarget.y = targetPos.y;
        movementApplied = { from: initialPos, to: targetPos };
      } else if (spell.movementEffect.type === 'PUSH' && targetParticipant) {
        // Push target away from caster
        const dx = Math.sign(targetParticipant.x - casterParticipant.x) || 1;
        const dy = Math.sign(targetParticipant.y - casterParticipant.y) || 0;
        const pushCells = Math.floor(spell.movementEffect.distanceFeet / 5);
        const targetPos = {
          x: targetParticipant.x + dx * pushCells,
          y: targetParticipant.y + dy * pushCells,
        };
        targetParticipant.x = targetPos.x;
        targetParticipant.y = targetPos.y;
        movementApplied = { from: initialPos, to: targetPos };
      }
    }

    // Establish Concentration if spell requires it and was successfully cast
    let concentrationEstablished = false;
    if (spell.requiresConcentration && !targetDied) {
      const targetIds = areaTargets.length > 0
        ? areaTargets.map((p) => p.id)
        : targetParticipant
          ? [targetParticipant.id]
          : [casterId];
      const concConditions = concentrationAppliedConditions.length > 0
        ? concentrationAppliedConditions
        : conditionsApplied.map((cond) => ({
            targetId: targetParticipant?.id || casterId,
            condition: cond,
          }));
      state.activeConcentration = {
        spellId: spell.id,
        spellName: spell.name,
        slotLevel: effectiveSlotLevel,
        castAtRound: combatRound,
        castAtTurn: combatTurnIndex,
        durationRounds: spell.durationRounds || 10,
        remainingRounds: spell.durationRounds || 10,
        casterId,
        targetIds,
        appliedConditions: concConditions,
        effects: concentrationBuffEffects.length > 0 ? { buffs: concentrationBuffEffects } : undefined,
      };
      concentrationEstablished = true;
      casterParticipant.activeConcentration = JSON.parse(JSON.stringify(state.activeConcentration));
    }

    // Headline generation
    let headline = `${casterParticipant.name} cast ${spell.name}`;
    if (effectiveSlotLevel > spell.level) {
      headline += ` (upcast at level ${effectiveSlotLevel})`;
    } else if (isRitual) {
      headline += ` as a ritual`;
    }
    if (isAreaSpell) {
      headline += ` affecting ${areaTargets.length} creature${areaTargets.length === 1 ? '' : 's'}`;
    } else if (targetParticipant) {
      headline += ` on ${targetParticipant.name}`;
    }
    if (damageInflicted > 0) {
      headline += ` dealing ${damageInflicted} ${spell.damageType || 'force'} damage!`;
      if (targetImmune) headline += ' [Immune]';
      else if (targetResisted) headline += ' [Resisted]';
      else if (targetVulnerable) headline += ' [Vulnerable]';
      if (targetDied) headline += ` ${targetParticipant?.name} was vanquished!`;
    } else if (healingApplied > 0) {
      headline += ` restoring ${healingApplied} HP!`;
    }
    if (conditionsApplied.length > 0) {
      headline += ` Inflicted: ${conditionsApplied.join(', ')}.`;
    }
    if (movementApplied) {
      headline += ` Repositioned to (${movementApplied.to.x}, ${movementApplied.to.y}).`;
    }

    return {
      success: true,
      spellId: spell.id,
      spellName: spell.name,
      slotLevelUsed: effectiveSlotLevel,
      slotsRemaining: effectiveSlotLevel > 0 ? state.spellSlots[effectiveSlotLevel] : undefined,
      isRitual,
      requiresConcentration: spell.requiresConcentration,
      brokenPreviousConcentration,
      attackResult,
      savingThrowResult,
      damageInflicted,
      healingApplied,
      damageType: spell.damageType,
      targetDied,
      targetHpRemaining,
      targetImmune,
      targetResisted,
      targetVulnerable,
      conditionsApplied,
      conditionsRemoved,
      movementApplied,
      concentrationEstablished,
      targetConcentrationCheck: targetConcCheck,
      headline,
    };
  }

  private applyAuthoritativeDamage(
    target: BattlefieldParticipant,
    amount: number,
    damageType: string
  ): {
    damage: number;
    targetDied: boolean;
    immune: boolean;
    resisted: boolean;
    vulnerable: boolean;
  } {
    let finalAmount = Math.max(0, amount);
    let immune = false;
    let resisted = false;
    let vulnerable = false;

    if (damageType) {
      const type = damageType.toLowerCase();
      const imm = (target.immunities || []).map((i) => i.toLowerCase());
      const res = (target.resistances || []).map((r) => r.toLowerCase());
      const vul = (target.vulnerabilities || []).map((v) => v.toLowerCase());

      if (imm.includes(type)) {
        finalAmount = 0;
        immune = true;
      } else if (res.includes(type)) {
        finalAmount = Math.floor(finalAmount / 2);
        resisted = true;
      } else if (vul.includes(type)) {
        finalAmount *= 2;
        vulnerable = true;
      }
    }

    target.hpCurrent = Math.max(0, target.hpCurrent - finalAmount);
    if (target.hpCurrent <= 0) {
      target.isDead = true;
      if (!target.conditions.includes('Dead')) {
        target.conditions.push('Dead');
      }
      // Breaking concentration on death/0 HP
      this.breakConcentration(target.id, 'Creature reduced to 0 HP');
    }

    return {
      damage: finalAmount,
      targetDied: target.isDead,
      immune,
      resisted,
      vulnerable,
    };
  }

  public exportState(): {
    actorStates: Record<string, ActorSpellcastingState>;
    customSpells: SpellDefinition[];
  } {
    const actorStates: Record<string, ActorSpellcastingState> = {};
    for (const [id, state] of this.actorStates.entries()) {
      actorStates[id] = JSON.parse(JSON.stringify(state));
    }
    const customSpells = this.getAllSpells();
    return { actorStates, customSpells };
  }

  public importState(data: {
    actorStates?: Record<string, ActorSpellcastingState>;
    customSpells?: SpellDefinition[];
  }): void {
    if (data.customSpells) {
      for (const spell of data.customSpells) {
        this.registerSpell(spell);
      }
    }
    if (data.actorStates) {
      this.actorStates.clear();
      for (const [id, state] of Object.entries(data.actorStates)) {
        this.actorStates.set(id, JSON.parse(JSON.stringify(state)));
      }
    }
  }
}

export const spellRuntime = new SpellRuntime();