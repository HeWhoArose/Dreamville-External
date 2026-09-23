import { WorldTimestamp } from './types';
import { PendingActivationState } from './capabilityEngine';
import { ConditionEngine } from './conditionEngine';
import { CombatActionEconomy, CombatTurnResourceSnapshot, ReadyTriggerType } from './combatActionEconomy';
import { CombatReactionEngine } from './combatReactionEngine';
import { deathSaveEngine } from './deathSaveEngine';
import type { DeathSaveState, RulesProfile, CombatAttackInstanceResult, CombatEffectDefinition, CombatEffectResult, CombatEventRecord, CombatReplayRecord, BodyRegionId, DestructibleEnvironmentObject, CombatMoraleState, CombatForcedMovementDefinition, CombatForcedMovementResult, CombatMovementCollisionResult } from '../../src/types';
import { CombatMoraleEngine } from './combatMoraleEngine';
import { resolveCapabilityCheckFormula } from '../../src/data/rulesDice';
import type { ProgressionResolution } from './characterProgressionEngine';
import {
  SpellRuntime,
  spellRuntime as defaultSpellRuntime,
  CastSpellRequest,
  CastSpellExecutionResult,
  ActiveConcentration,
} from './spellRuntime';

export interface DiceTerm {
  count: number;
  sides: number;
}

export interface ParsedDiceFormula {
  terms: DiceTerm[];
  flatModifier: number;
}

export interface LocalDiceEngineState {
  seed: number;
  rollCounter: number;
}

export interface RollRecord {
  rollId: string;
  rulesetVersion: string;
  formula: string;
  diceTerms?: DiceTerm[];
  individualDice: number[];
  modifier: number;
  total: number;
  isCriticalSuccess: boolean;
  isCriticalFailure: boolean;
  timestamp: number; // Elapsed seconds
  seedOrEntropyMetadata?: string;
}

export interface IRulesetAdapter {
  rulesetId: string;
  version: string;
  calculateModifier(score: number): number;
  resolveInitiative?(params: {
    actorId: string;
    participant: BattlefieldParticipant;
    diceEngine?: LocalDiceEngine;
  }): { roll: RollRecord; totalInitiative: number };
  resolveAttack(params: {
    attackBonus: number;
    targetArmorClass: number;
    attackFormula?: string;
    advantage?: boolean;
    disadvantage?: boolean;
    diceEngine?: LocalDiceEngine;
  }): { roll: RollRecord; hits: boolean; isCritical: boolean };
  resolveSavingThrow(params: {
    saveModifier: number;
    difficultyClass: number;
    rollFormula?: string;
    advantage?: boolean;
    disadvantage?: boolean;
    diceEngine?: LocalDiceEngine;
  }): { roll: RollRecord; succeeds: boolean };
  resolveDamage(
    damageFormula: string,
    isCritical?: boolean,
    diceEngine?: LocalDiceEngine
  ): { roll: RollRecord; totalDamage: number };
}

/**
 * LocalDiceEngine
 * Deterministic local dice resolution with instance and scoped PRNG state. AI never invents numbers.
 */
export class LocalDiceEngine {
  private rollCounter = 0;
  private seed = 1337;

  constructor(seed = 1337) {
    this.seed = seed;
  }

  public setSeed(newSeed: number): void {
    this.seed = newSeed;
  }

  public getSeed(): number {
    return this.seed;
  }

  public getRollCounter(): number {
    return this.rollCounter;
  }

  public setRollCounter(counter: number): void {
    this.rollCounter = Math.max(0, Math.trunc(counter));
  }

  public exportState(): LocalDiceEngineState {
    return {
      seed: this.seed,
      rollCounter: this.rollCounter,
    };
  }

  public importState(state: Partial<LocalDiceEngineState>): void {
    if (typeof state.seed === 'number' && Number.isFinite(state.seed)) this.seed = state.seed;
    if (typeof state.rollCounter === 'number' && Number.isFinite(state.rollCounter)) {
      this.rollCounter = Math.max(0, Math.trunc(state.rollCounter));
    }
  }

  private pseudoRandom(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  public rollDie(sides: number): number {
    if (!Number.isInteger(sides) || sides < 2) throw new Error('Dice sides must be an integer >= 2.');
    return Math.floor(this.pseudoRandom() * sides) + 1;
  }

  public roll(formula: string, modifier = 0): RollRecord {
    const parsed = LocalDiceEngine.parseFormula(formula);
    const dice: number[] = [];

    for (const term of parsed.terms) {
      for (let i = 0; i < term.count; i++) {
        dice.push(this.rollDie(term.sides));
      }
    }

    const diceSum = dice.reduce((a, b) => a + b, 0);
    const combinedModifier = parsed.flatModifier + modifier;
    const total = diceSum + combinedModifier;
    const hasD20 = parsed.terms.some((term) => term.sides === 20);
    const naturalD20Values: number[] = [];
    let diceOffset = 0;
    for (const term of parsed.terms) {
      const termValues = dice.slice(diceOffset, diceOffset + term.count);
      if (term.sides === 20) naturalD20Values.push(...termValues);
      diceOffset += term.count;
    }

    this.rollCounter++;
    return {
      rollId: `roll_${this.rollCounter}`,
      rulesetVersion: 'SRD-5.2.1',
      formula: LocalDiceEngine.formatFormula(parsed.terms, combinedModifier),
      diceTerms: parsed.terms,
      individualDice: dice,
      modifier: combinedModifier,
      total,
      isCriticalSuccess: hasD20 && naturalD20Values.includes(20),
      isCriticalFailure: hasD20 && naturalD20Values.includes(1),
      // Canonical roll records must not depend on wall-clock time. The logical
      // roll sequence is deterministic and is sufficient for replay ordering.
      timestamp: this.rollCounter,
      seedOrEntropyMetadata: `seed:${this.seed};roll:${this.rollCounter}`,
    };
  }

  public static parseFormula(formula: string): ParsedDiceFormula {
    const normalized = (formula || '').replace(/\s+/g, '').toLowerCase();
    if (!normalized) return { terms: [{ count: 1, sides: 20 }], flatModifier: 0 };

    const terms: DiceTerm[] = [];
    let flatModifier = 0;
    let index = 0;
    let expectingOperator: '+' | '-' = '+';

    while (index < normalized.length) {
      if (normalized[index] === '+' || normalized[index] === '-') {
        expectingOperator = normalized[index] as '+' | '-';
        index += 1;
      }

      const diceMatch = normalized.slice(index).match(/^(\d*)d(\d+)/i);
      if (diceMatch) {
        const count = Math.max(1, Number(diceMatch[1] || 1));
        const sides = Math.max(2, Number(diceMatch[2]));
        if (count > 1000 || sides > 1000) throw new Error('Dice formula exceeds the supported safety limits.');
        terms.push({ count, sides });
        index += diceMatch[0].length;
      } else {
        const numberMatch = normalized.slice(index).match(/^\d+/);
        if (!numberMatch) throw new Error(`Invalid dice formula near "${normalized.slice(index)}".`);
        const number = Number(numberMatch[0]);
        flatModifier += expectingOperator === '-' ? -number : number;
        index += numberMatch[0].length;
      }
      expectingOperator = '+';
    }

    if (terms.length === 0) terms.push({ count: 1, sides: 20 });
    return { terms, flatModifier };
  }

  public static formatFormula(terms: DiceTerm[], modifier: number): string {
    const dicePart = terms.map((term) => `${term.count}d${term.sides}`).join('+');
    return modifier === 0 ? dicePart : `${dicePart}${modifier > 0 ? '+' : ''}${modifier}`;
  }
  // Static fallback instance for backwards compatibility
  private static defaultInstance = new LocalDiceEngine(1337);

  public static setSeed(newSeed: number): void {
    LocalDiceEngine.defaultInstance.setSeed(newSeed);
  }

  public static rollDie(sides: number): number {
    return LocalDiceEngine.defaultInstance.rollDie(sides);
  }

  public static roll(formula: string, modifier = 0): RollRecord {
    return LocalDiceEngine.defaultInstance.roll(formula, modifier);
  }
}

/**
 * Dnd521RulesetAdapter
 * Official D&D SRD 5.2.1 compliant rules adapter (DreamBook §359, V7.2, V10.8.22).
 */
export class Dnd521RulesetAdapter implements IRulesetAdapter {
  public readonly rulesetId = 'dnd-srd';
  public readonly version = '5.2.1';

  public calculateModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  public resolveInitiative(params: {
    actorId: string;
    participant: BattlefieldParticipant;
    diceEngine?: LocalDiceEngine;
  }): { roll: RollRecord; totalInitiative: number } {
    const dice = params.diceEngine || LocalDiceEngine;
    const mod = typeof params.participant.initiativeModifier === 'number'
      ? params.participant.initiativeModifier
      : (typeof params.participant.attackBonus === 'number' ? Math.max(0, Math.floor(params.participant.attackBonus / 2)) : 0);
    const roll = dice.roll('1d20', mod);
    return { roll, totalInitiative: roll.total };
  }

  public resolveAttack(params: {
    attackBonus: number;
    targetArmorClass: number;
    attackFormula?: string;
    advantage?: boolean;
    disadvantage?: boolean;
    diceEngine?: LocalDiceEngine;
  }): { roll: RollRecord; hits: boolean; isCritical: boolean } {
    const dice = params.diceEngine || LocalDiceEngine;
    const attackFormula = params.attackFormula || '1d20';
    const appliesD20Advantage = attackFormula.replace(/\s+/g, '').toLowerCase() === '1d20';
    const roll1 = dice.roll(attackFormula, params.attackBonus);
    let chosenRoll = roll1;

    if (appliesD20Advantage && params.advantage && !params.disadvantage) {
      const roll2 = dice.roll(attackFormula, params.attackBonus);
      chosenRoll = roll2.total > roll1.total ? roll2 : roll1;
    } else if (appliesD20Advantage && params.disadvantage && !params.advantage) {
      const roll2 = dice.roll(attackFormula, params.attackBonus);
      chosenRoll = roll2.total < roll1.total ? roll2 : roll1;
    }

    const isD20Check = attackFormula.replace(/\s+/g, '').toLowerCase() === '1d20';
    const naturalD20 = chosenRoll.individualDice[0];
    const isCritical = isD20Check && naturalD20 === 20;
    const isCritFail = isD20Check && naturalD20 === 1;

    let hits = false;
    if (isCritical) {
      hits = true;
    } else if (isCritFail) {
      hits = false;
    } else {
      hits = chosenRoll.total >= params.targetArmorClass;
    }

    return { roll: chosenRoll, hits, isCritical };
  }

  public resolveSavingThrow(params: {
    saveModifier: number;
    difficultyClass: number;
    rollFormula?: string;
    advantage?: boolean;
    disadvantage?: boolean;
    diceEngine?: LocalDiceEngine;
  }): { roll: RollRecord; succeeds: boolean } {
    const dice = params.diceEngine || LocalDiceEngine;
    const rollFormula = params.rollFormula || '1d20';
    const appliesD20Advantage = rollFormula.replace(/\s+/g, '').toLowerCase() === '1d20';
    const roll1 = dice.roll(rollFormula, params.saveModifier);
    let chosenRoll = roll1;

    if (appliesD20Advantage && params.advantage && !params.disadvantage) {
      const roll2 = dice.roll(rollFormula, params.saveModifier);
      chosenRoll = roll2.total > roll1.total ? roll2 : roll1;
    } else if (appliesD20Advantage && params.disadvantage && !params.advantage) {
      const roll2 = dice.roll(rollFormula, params.saveModifier);
      chosenRoll = roll2.total < roll1.total ? roll2 : roll1;
    }

    return {
      roll: chosenRoll,
      succeeds: chosenRoll.total >= params.difficultyClass,
    };
  }
  public resolveDamage(    damageFormula: string,
    isCritical = false,
    diceEngine?: LocalDiceEngine
  ): { roll: RollRecord; totalDamage: number } {
    const dice = diceEngine || LocalDiceEngine;
    const parsed = LocalDiceEngine.parseFormula(damageFormula);
    const baseRoll = dice.roll(damageFormula, 0);
    let total = baseRoll.total;
    let roll = baseRoll;

    if (isCritical) {
      const diceOnlyFormula = parsed.terms.map((term) => `${term.count}d${term.sides}`).join('+');
      const extraCritRoll = dice.roll(diceOnlyFormula, 0);
      total += extraCritRoll.individualDice.reduce((sum, value) => sum + value, 0);
      roll = {
        ...baseRoll,
        individualDice: [...baseRoll.individualDice, ...extraCritRoll.individualDice],
        total,
      };
    }
    return { roll, totalDamage: Math.max(1, total) };
  }
}

export type CoreCombatAction = 'DASH' | 'DODGE' | 'DISENGAGE' | 'READY' | 'GRAPPLE' | 'SHOVE';

export type CoverLevel = 'NONE' | 'HALF' | 'THREE_QUARTERS' | 'TOTAL';

export interface BattlefieldParticipant {
  id: string;
  name: string;
  x: number; // Grid coordinate X
  y: number; // Grid coordinate Y
  initiative: number;
  initiativeModifier?: number; // Permitted participant input (CH8.INITIATIVE)
  saveModifiers?: Record<string, number>; // e.g. { DEX: 2, CON: 3, WIS: 1 } (CH8.DEFENSE)
  resistances?: string[]; // e.g. ['fire', 'poison', 'cold'] (CH8.DEFENSE)
  immunities?: string[];
  vulnerabilities?: string[];
  cover?: CoverLevel;
  grappledBy?: string;
  team: 'player_allies' | 'enemies' | 'neutral';
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
  speedCells: number; // Cells per turn
  attackBonus: number;
  damageFormula: string;
  damageType?: string;
  conditions: string[];
  reachCells?: number;
  savingThrowModifiers?: Record<string, number>;
  isDead: boolean;
  damageProfile?: import('../../src/types').CharacterDamageProfile;
  conditionProfile?: import('../../src/types').CharacterConditionProfile;
  usesDeathSaves?: boolean;
  deathSaveState?: DeathSaveState;
  spellSlots?: Record<number, { current: number; max: number }>;
  knownSpells?: string[];
  preparedSpells?: string[];
  activeConcentration?: ActiveConcentration | null;
  spellSaveDc?: number;
  spellAttackBonus?: number;
  combatResources?: Record<string, number>;
  bossPhaseId?: string;
  bossPhaseModifiers?: Record<string, number>;
  bossPhaseAbilities?: string[];
  bossTargetPriority?: string;
  bossEnvironmentEffects?: string[];
  moraleState?: any;
}

export interface DynamicHazardZone {
  id: string;
  type: 'fire_zone' | 'ice_patch' | 'poison_cloud' | 'barricade';
  x: number;
  y: number;
  radiusCells: number;
  durationTurns: number;
  damagePerTurn: number;
}

export interface BattleEvent {
  turnNumber: number;
  actorId: string;
  targetId?: string;
  actionType: 'MOVE' | 'ATTACK' | 'CAST' | 'ACTION' | 'CONDITION_TICK' | 'START_ACTIVATION' | 'INTERRUPT';
  headline: string;
  damageInflicted?: number;
  rollRecord?: RollRecord;
  metadata?: Record<string, unknown>;
}

export interface TacticalCombatStateExport {
  participants: BattlefieldParticipant[];
  hazards: DynamicHazardZone[];
  obstacles?: { x: number; y: number; isImpassable?: boolean }[];
  mapBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  turnQueue: string[];
  currentTurnIndex: number;
  currentRound: number;
  eventLog: BattleEvent[];
  pendingActivations?: PendingActivationState[];
  turnResources?: CombatTurnResourceSnapshot[];
  seed?: number;
  rollCounter?: number;
  rulesProfile?: RulesProfile;
  spellRuntimeState?: ReturnType<SpellRuntime['exportState']>;
  combatEffectEvents?: CombatEventRecord[];
  combatActionSequence?: number;
  destructibleObjects?: DestructibleEnvironmentObject[];
  combatReplayRecords?: CombatReplayRecord[];
  moraleStates?: unknown;
  bossPhaseStates?: Array<{ bossId: string; phaseId: string; modifiers: Record<string, number>; abilities: string[]; targetPriority?: string; environmentEffects: string[] }>;
  conditionEngineState?: ReturnType<ConditionEngine['exportState']>;
  progressionResolutions?: Record<string, any>;
}

export interface ProjectedCombatState {
  participants: BattlefieldParticipant[];
  currentActor: BattlefieldParticipant | undefined;
  hazards: DynamicHazardZone[];
  obstacles?: { x: number; y: number; isImpassable?: boolean }[];
  mapBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  turnQueue: string[];
  currentTurnIndex: number;
  currentRound: number;
  eventLog: BattleEvent[];
  isEncounterActive: boolean;
  victory: boolean;
  defeat: boolean;
  isPlayerTurn: boolean;
  viewerTurnResources?: CombatTurnResourceSnapshot;
  pendingActivations?: PendingActivationState[];
}

export interface CombatPerceptionOptions {
  knownParticipantIds?: string[];
  epistemicKnowledgeChecker?: (viewerActorId: string, targetId: string) => boolean;
}

/**
 * TacticalCombatEngine
 * Authority for grid movements, initiative order, attack resolution, and dynamic battlefield zones (V10.8.4A).
 */
export class TacticalCombatEngine {
  private participants: Map<string, BattlefieldParticipant> = new Map();
  private hazards: DynamicHazardZone[] = [];
  private destructibleObjects = new Map<string, DestructibleEnvironmentObject>();
  private obstacles: { x: number; y: number; isImpassable?: boolean }[] = [];
  private mapBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  private ruleset: IRulesetAdapter = new Dnd521RulesetAdapter();
  private diceEngine: LocalDiceEngine;
  private turnQueue: string[] = [];
  private currentTurnIndex = 0;
  private currentRound = 1;
  private eventLog: BattleEvent[] = [];
  private pendingActivations: Map<string, PendingActivationState> = new Map();
  private actionEconomy: CombatActionEconomy = new CombatActionEconomy();
  private conditionEngine?: ConditionEngine;
  private rulesProfile?: RulesProfile;
  private readonly reactionEngine = new CombatReactionEngine();
  private spellRuntime: SpellRuntime;
  private progressionModifierResolver?: (actorId: string) => ProgressionResolution | undefined;
  private bossPhaseStates = new Map<string, { phaseId: string; modifiers: Record<string, number>; abilities: string[]; targetPriority?: string; environmentEffects: string[] }>();
  private bossPhaseEvaluationResolver?: (bossId: string, engine: TacticalCombatEngine) => void;
  private combatEffectEvents: CombatEventRecord[] = [];
  private combatReplayRecords: CombatReplayRecord[] = [];
  private readonly moraleEngine = new CombatMoraleEngine();
  private combatActionSequence = 0;
  private initialSeed: number;

  constructor(seed = 1337, ruleset?: IRulesetAdapter, conditionEngine?: ConditionEngine) {
    this.initialSeed = seed;
    this.diceEngine = new LocalDiceEngine(seed);
    this.conditionEngine = conditionEngine || new ConditionEngine();
    this.spellRuntime = new SpellRuntime({ conditionEngine: this.conditionEngine });
    if (ruleset) {
      this.ruleset = ruleset;
    }
  }

  public getSpellRuntime(): SpellRuntime {
    return this.spellRuntime;
  }

  public setSpellRuntime(runtime: SpellRuntime): void {
    this.spellRuntime = runtime;
  }

  public getDiceEngine(): LocalDiceEngine {
    return this.diceEngine;
  }

  public setProgressionModifierResolver(
    resolver?: (actorId: string) => ProgressionResolution | undefined
  ): void {
    this.progressionModifierResolver = resolver;
  }

  public setBossPhaseEvaluationResolver(
    resolver?: (bossId: string, engine: TacticalCombatEngine) => void
  ): void {
    this.bossPhaseEvaluationResolver = resolver;
  }

  private progressionModifier(actorId: string, target: string): number {
    const resolution = this.progressionModifierResolver?.(actorId);
    const modifier = resolution?.modifiers.find((entry) => entry.target === target);
    return typeof modifier?.value === 'number' && Number.isFinite(modifier.value) ? modifier.value : 0;
  }

  private bossPhaseModifier(actorId: string, target: string): number {
    const state = this.bossPhaseStates.get(actorId);
    const value = state?.modifiers?.[target];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private projectedParticipant(participant: BattlefieldParticipant): BattlefieldParticipant {
    const projected = { ...participant };
    projected.attackBonus += this.progressionModifier(participant.id, 'combat.attackBonus') + this.bossPhaseModifier(participant.id, 'combat.attackBonus');
    projected.armorClass += this.progressionModifier(participant.id, 'coreStats.armorClass') + this.bossPhaseModifier(participant.id, 'coreStats.armorClass');
    projected.speedCells = Math.max(
      0,
      projected.speedCells +
        (this.progressionModifier(participant.id, 'coreStats.speed') + this.bossPhaseModifier(participant.id, 'coreStats.speed')) / 5
    );
    projected.hpMax = Math.max(1, projected.hpMax + this.progressionModifier(participant.id, 'coreStats.hpMax') + this.bossPhaseModifier(participant.id, 'coreStats.hpMax'));
    projected.spellAttackBonus = (participant.spellAttackBonus ?? participant.attackBonus)
      + this.progressionModifier(participant.id, 'spell.attackBonus')
      + this.bossPhaseModifier(participant.id, 'spell.attackBonus');
    projected.spellSaveDc = (participant.spellSaveDc ?? 8)
      + this.progressionModifier(participant.id, 'spell.saveDC')
      + this.bossPhaseModifier(participant.id, 'spell.saveDC');
    projected.bossPhaseId = this.bossPhaseStates.get(participant.id)?.phaseId;
    projected.bossPhaseAbilities = [...(this.bossPhaseStates.get(participant.id)?.abilities || [])];
    projected.bossTargetPriority = this.bossPhaseStates.get(participant.id)?.targetPriority;
    projected.bossEnvironmentEffects = [...(this.bossPhaseStates.get(participant.id)?.environmentEffects || [])];
    return projected;
  }

  public setSeed(seed: number): void {
    this.diceEngine.setSeed(seed);
  }

  public setRuleset(ruleset: IRulesetAdapter): void {
    this.ruleset = ruleset;
  }

  public getRuleset(): IRulesetAdapter {
    return this.ruleset;
  }

  public setRulesProfile(profile?: RulesProfile): void {
    this.rulesProfile = profile ? JSON.parse(JSON.stringify(profile)) : undefined;
  }

  public getRulesProfile(): RulesProfile | undefined {
    return this.rulesProfile ? JSON.parse(JSON.stringify(this.rulesProfile)) : undefined;
  }

  private tacticalCombatEnabled(): boolean {
    return !this.rulesProfile || !this.rulesProfile.disabledMechanics.includes('dnd_tactical_combat');
  }

  public setMapBounds(bounds?: { minX: number; maxX: number; minY: number; maxY: number }): void {
    this.mapBounds = bounds ? { ...bounds } : undefined;
  }

  public getMapBounds(): { minX: number; maxX: number; minY: number; maxY: number } | undefined {
    return this.mapBounds ? { ...this.mapBounds } : undefined;
  }

  public addObstacle(obstacle: { x: number; y: number; isImpassable?: boolean }): void {
    this.obstacles.push({ isImpassable: true, ...obstacle });
  }

  public getObstacles(): { x: number; y: number; isImpassable?: boolean }[] {
    return this.obstacles.map((o) => ({ ...o }));
  }

  public clear(): void {
    const preservedConditionDefinitions = this.conditionEngine?.getDefinitions() || [];
    this.participants.clear();
    this.hazards = [];
    this.obstacles = [];
    this.mapBounds = undefined;
    this.turnQueue = [];
    this.currentTurnIndex = 0;
    this.currentRound = 1;
    this.eventLog = [];
    this.combatEffectEvents = [];
    this.combatReplayRecords = [];
    this.destructibleObjects.clear();
    this.moraleEngine.importState([]);
    this.combatActionSequence = 0;
    this.pendingActivations.clear();
    this.bossPhaseStates.clear();
    this.actionEconomy.clear();
    this.diceEngine.setSeed(this.initialSeed);
    this.diceEngine.setRollCounter(0);
    if (this.conditionEngine) {
      this.conditionEngine.importState({ definitions: preservedConditionDefinitions, actors: [] });
    }
    this.spellRuntime.setParticipantContext([]);
  }

  public startActivation(activation: PendingActivationState): void {
    const actor = this.participants.get(activation.actorId);
    this.pendingActivations.set(activation.actorId, JSON.parse(JSON.stringify(activation)));
    const actionLabel = activation.activationMode === 'charged' ? 'charging' : 'channelling';
    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId: activation.actorId,
      actionType: 'START_ACTIVATION',
      headline: `${actor?.name || activation.actorId} began ${actionLabel} ${activation.capabilityId} (${activation.remainingTurns} turns required).`,
      metadata: {
        capabilityId: activation.capabilityId,
        activationMode: activation.activationMode,
        remainingTurns: activation.remainingTurns,
        isInterruptible: activation.isInterruptible,
      },
    });
  }

  public getPendingActivation(actorId: string): PendingActivationState | undefined {
    const act = this.pendingActivations.get(actorId);
    return act ? JSON.parse(JSON.stringify(act)) : undefined;
  }

  public removePendingActivation(actorId: string): void {
    this.pendingActivations.delete(actorId);
  }

  public getAllPendingActivations(): PendingActivationState[] {
    return Array.from(this.pendingActivations.values()).map((a) => JSON.parse(JSON.stringify(a)));
  }

  public interruptActivation(actorId: string, reason: string): {
    interrupted: boolean;
    activation?: PendingActivationState;
    reason?: string;
  } {
    const pending = this.pendingActivations.get(actorId);
    if (!pending) {
      return { interrupted: false };
    }

    if (!pending.isInterruptible) {
      return {
        interrupted: false,
        activation: JSON.parse(JSON.stringify(pending)),
        reason: 'Activation is non-interruptible',
      };
    }

    this.pendingActivations.delete(actorId);
    const actor = this.participants.get(actorId);
    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId,
      actionType: 'INTERRUPT',
      headline: `${actor?.name || actorId}'s ${pending.capabilityId} was interrupted: ${reason}!`,
      metadata: {
        capabilityId: pending.capabilityId,
        reason,
      },
    });

    return {
      interrupted: true,
      activation: JSON.parse(JSON.stringify(pending)),
      reason,
    };
  }

  public addParticipant(p: BattlefieldParticipant): void {
    const participant = p;
    if (participant.usesDeathSaves && !participant.deathSaveState) {
      participant.deathSaveState = deathSaveEngine.createState();
    }
    if (this.conditionEngine) {
      const damageProfile = participant.damageProfile || {
        damageImmunities: participant.immunities || [],
        damageResistances: participant.resistances || [],
        damageVulnerabilities: participant.vulnerabilities || [],
      };
      participant.damageProfile = damageProfile;
      if (!participant.conditionProfile) {
        participant.conditionProfile = {
          conditionImmunities: [],
          conditionResistances: [],
          conditionVulnerabilities: [],
        };
      }
      const seeded = this.conditionEngine.seedActor(participant.id, {
        healthCurrent: participant.hpCurrent,
        healthMax: participant.hpMax,
        damageProfile,
        conditionProfile: participant.conditionProfile,
        legacyConditions: participant.conditions,
      });
      participant.hpCurrent = seeded.healthCurrent;
      participant.hpMax = seeded.healthMax;
      participant.isDead = seeded.dead;
      participant.damageProfile = seeded.damageProfile;
      participant.conditionProfile = seeded.conditionProfile;
      participant.conditions = seeded.instances.map((instance) => instance.name);
    }
    const morale = this.moraleEngine.ensure(participant.id, participant.moraleState);
    participant.moraleState = morale;
    this.participants.set(participant.id, participant);
    this.actionEconomy.registerActor(participant.id, participant.speedCells, this.currentRound);
    if (!this.turnQueue.includes(participant.id)) {
      this.turnQueue.push(participant.id);
    }
  }

  public updateParticipant(id: string, updates: Partial<BattlefieldParticipant>): void {
    const existing = this.participants.get(id);
    if (existing) {
      this.participants.set(id, { ...existing, ...updates });
    }
  }

  public addHazard(h: DynamicHazardZone): void {
    this.hazards.push({ ...h });
  }
  public removeHazard(hazardId: string): { success: boolean; removed: boolean } {
    const before = this.hazards.length;
    this.hazards = this.hazards.filter((hazard) => hazard.id !== hazardId);
    return { success: true, removed: this.hazards.length !== before };
  }

  public replaceHazard(hazard: DynamicHazardZone): { success: boolean } {
    this.removeHazard(hazard.id);
    this.addHazard(hazard);
    return { success: true };
  }

  public rollInitiative(): void {
    for (const p of Array.from(this.participants.values())) {
      if (p.initiative && p.initiative > 0) {
        continue;
      }
      if (this.ruleset.resolveInitiative) {
        const initRes = this.ruleset.resolveInitiative({
          actorId: p.id,
          participant: p,
          diceEngine: this.diceEngine,
        });
        p.initiative = initRes.totalInitiative;
      } else {
        const mod = typeof p.initiativeModifier === 'number' ? p.initiativeModifier : 0;
        const roll = this.diceEngine.roll('1d20', mod);
        p.initiative = roll.total;
      }
    }
    this.turnQueue = Array.from(this.participants.values())
      .sort((a, b) => (b.initiative !== a.initiative ? b.initiative - a.initiative : a.id.localeCompare(b.id)))
      .map((p) => p.id);
    this.currentTurnIndex = 0;

    const currentActor = this.getCurrentActor();
    if (currentActor) {
      this.processConditionCombatEvent(currentActor.id, 'ON_ROUND_START', 'round_start');
      this.actionEconomy.beginTurn(currentActor.id, currentActor.speedCells, this.currentRound);
    }
  }

  public getCurrentActor(): BattlefieldParticipant | undefined {
    if (this.turnQueue.length === 0) return undefined;
    const id = this.turnQueue[this.currentTurnIndex % this.turnQueue.length];
    return id ? this.participants.get(id) : undefined;
  }

  public getCurrentRound(): number {
    return this.currentRound;
  }

  public getCurrentTurnIndex(): number {
    return this.currentTurnIndex;
  }

  public getTurnQueue(): string[] {
    return [...this.turnQueue];
  }

  public getTurnResources(actorId: string): CombatTurnResourceSnapshot | undefined {
    return this.actionEconomy.get(actorId);
  }

  public getActionEconomy(): CombatActionEconomy {
    return this.actionEconomy;
  }

  public getHazards(): DynamicHazardZone[] {
    return this.hazards.map((h) => ({ ...h }));
  }

  public getDestructibleObjects(): DestructibleEnvironmentObject[] {
    return Array.from(this.destructibleObjects.values()).map((object) => JSON.parse(JSON.stringify(object)));
  }

  public getMoraleState(actorId: string): CombatMoraleState | undefined {
    return this.moraleEngine.get(actorId);
  }

  public setMoraleState(
    actorId: string,
    patch: Partial<CombatMoraleState>,
    reason = 'Canonical morale update.'
  ): { success: boolean; state?: CombatMoraleState; errorReason?: string } {
    const participant = this.participants.get(actorId);
    if (!participant) return { success: false, errorReason: 'Morale actor not found.' };
    const state = this.moraleEngine.set(actorId, patch, reason);
    participant.moraleState = state;
    this.combatActionSequence += 1;
    const eventId = `combat_evt_${this.currentRound}_${this.combatActionSequence}`;
    this.combatEffectEvents.push({
      eventId,
      actionId: `morale_${this.currentRound}_${actorId}`,
      eventType: 'MORALE_STATE_CHANGED',
      turnNumber: this.currentRound,
      actorId,
      targetId: actorId,
      headline: `${participant.name} morale became ${state.status}.`,
      metadata: {
        morale: state.morale,
        maxMorale: state.maxMorale,
        status: state.status,
        reason: state.lastChangeReason,
        revision: state.revision,
      },
    });
    return { success: true, state };
  }

  public upsertDestructibleObject(object: DestructibleEnvironmentObject): { success: boolean; errorReason?: string } {
    if (!object?.id || !object.name) return { success: false, errorReason: 'Destructible environment object requires an id and name.' };
    const hpMax = Math.max(1, Math.trunc(Number(object.hpMax) || 0));
    const hpCurrent = Math.max(0, Math.min(hpMax, Math.trunc(Number(object.hpCurrent ?? hpMax) || 0)));
    this.destructibleObjects.set(object.id, {
      ...JSON.parse(JSON.stringify(object)),
      hpMax,
      hpCurrent,
      isDestroyed: Boolean(object.isDestroyed || hpCurrent <= 0),
      damageTypes: {
        resistances: [...(object.damageTypes?.resistances || [])],
        immunities: [...(object.damageTypes?.immunities || [])],
        vulnerabilities: [...(object.damageTypes?.vulnerabilities || [])],
      },
      tags: [...(object.tags || [])],
    });
    return { success: true };
  }

  public damageDestructibleObject(
    objectId: string,
    requestedAmount: number,
    damageType = 'custom',
  ): { success: boolean; errorReason?: string; damage: number; destroyed: boolean; wasDestroyed: boolean } {
    const object = this.destructibleObjects.get(objectId);
    if (!object) return { success: false, errorReason: 'Destructible environment object not found.', damage: 0, destroyed: false, wasDestroyed: false };
    const wasDestroyed = object.isDestroyed;
    if (wasDestroyed) return { success: true, damage: 0, destroyed: true, wasDestroyed: true };

    const type = damageType.trim().toLowerCase();
    const immunities = (object.damageTypes?.immunities || []).map((value) => value.toLowerCase());
    const resistances = (object.damageTypes?.resistances || []).map((value) => value.toLowerCase());
    const vulnerabilities = (object.damageTypes?.vulnerabilities || []).map((value) => value.toLowerCase());

    let finalAmount = Math.max(0, Number(requestedAmount) || 0);
    if (immunities.includes(type)) finalAmount = 0;
    else if (resistances.includes(type)) finalAmount = Math.floor(finalAmount / 2);
    else if (vulnerabilities.includes(type)) finalAmount *= 2;

    object.hpCurrent = Math.max(0, object.hpCurrent - finalAmount);
    object.isDestroyed = object.hpCurrent <= 0;

    this.combatActionSequence += 1;
    const eventId = `combat_evt_${this.currentRound}_${this.combatActionSequence}`;
    this.combatEffectEvents.push({
      eventId,
      actionId: `environment_${this.currentRound}_${objectId}`,
      eventType: object.isDestroyed ? 'ENVIRONMENT_DESTROYED' : 'ENVIRONMENT_DAMAGED',
      turnNumber: this.currentRound,
      actorId: 'ENVIRONMENT',
      headline: object.isDestroyed
        ? `${object.name} was destroyed.`
        : `${object.name} took ${finalAmount} damage.`,
      damage: finalAmount,
      finalDamage: finalAmount,
      metadata: {
        destructibleId: objectId,
        damageType: type,
        immune: immunities.includes(type),
        resisted: resistances.includes(type),
        vulnerable: vulnerabilities.includes(type),
        hpCurrent: object.hpCurrent,
        hpMax: object.hpMax,
        eventId,
      },
    });

    return {
      success: true,
      damage: finalAmount,
      destroyed: object.isDestroyed,
      wasDestroyed,
    };
  }

  /**
   * Authoritative check if a target is known/perceived by a viewing actor.
   * Enforces CH2-08 actor-scoped tactical information boundary.
   */
  public isParticipantKnownToActor(
    viewerActorId: string,
    target: BattlefieldParticipant,
    options?: CombatPerceptionOptions
  ): boolean {
    // 1. Viewing actor always knows themselves
    if (target.id === viewerActorId) return true;

    // 2. Explicit known participant ID whitelist
    if (options?.knownParticipantIds) {
      if (!options.knownParticipantIds.includes(target.id)) {
        return false;
      }
    }

    // 3. Epistemic knowledge callback check
    if (options?.epistemicKnowledgeChecker) {
      return options.epistemicKnowledgeChecker(viewerActorId, target.id);
    }

    // 4. Check concealment, stealth, and invisible conditions
    const hiddenConditions = ['Hidden', 'Stealthed', 'Invisible', 'Concealed', 'Unperceived'];
    if (target.conditions && target.conditions.some((c) => hiddenConditions.includes(c))) {
      return false;
    }

    return true;
  }

  /**
   * Projects an actor-scoped view of the tactical battlefield (CH2-08).
   * Derived read-only projection; NEVER mutates canonical combat state.
   */
  public projectCombatForActor(
    viewerActorId: string,
    options?: CombatPerceptionOptions
  ): ProjectedCombatState {
    const isKnown = (p: BattlefieldParticipant) =>
      this.isParticipantKnownToActor(viewerActorId, p, options);

    const isKnownById = (id: string) => {
      const p = this.participants.get(id);
      return p ? isKnown(p) : false;
    };

    const projectParticipant = (p: BattlefieldParticipant): BattlefieldParticipant => {
      const projected = this.projectedParticipant(p);
      if (p.id !== viewerActorId) {
        projected.deathSaveState = undefined;
      }
      return projected;
    };

    // Filter participants
    const projectedParticipants = Array.from(this.participants.values())
      .filter((p) => isKnown(p))
      .map(projectParticipant);

    // Canonical current actor projection
    const canonicalCurrentActor = this.getCurrentActor();
    let projectedCurrentActor: BattlefieldParticipant | undefined;
    if (canonicalCurrentActor) {
      if (isKnown(canonicalCurrentActor)) {
        projectedCurrentActor = projectParticipant(canonicalCurrentActor);
      } else {
        projectedCurrentActor = {
          id: 'unknown_actor',
          name: 'Unknown Combatant',
          x: -1,
          y: -1,
          initiative: canonicalCurrentActor.initiative,
          team: canonicalCurrentActor.team,
          hpCurrent: 0,
          hpMax: 0,
          armorClass: 0,
          speedCells: 0,
          attackBonus: 0,
          damageFormula: '0',
          conditions: [],
          isDead: false,
        };
      }
    }

    // Turn Queue: mask unknown actor IDs
    const projectedTurnQueue = this.turnQueue.map((id) =>
      isKnownById(id) ? id : 'unknown_actor'
    );

    // Event Log: sanitize events involving unknown entities
    const projectedEvents: BattleEvent[] = this.eventLog.map((ev) => {
      const actorKnown = isKnownById(ev.actorId);
      const targetKnown = !ev.targetId || isKnownById(ev.targetId);

      if (actorKnown && targetKnown) {
        return { ...ev };
      }

      return {
        turnNumber: ev.turnNumber,
        actorId: actorKnown ? ev.actorId : 'unknown_actor',
        targetId: ev.targetId ? (targetKnown ? ev.targetId : 'unknown_target') : undefined,
        actionType: ev.actionType,
        headline: 'An unknown combat event occurred.',
        damageInflicted: ev.damageInflicted,
      };
    });

    const aliveEnemies = projectedParticipants.filter((p) => p.team === 'enemies' && !p.isDead);
    const aliveAllies = projectedParticipants.filter((p) => p.team === 'player_allies' && !p.isDead);
    const totalEnemies = projectedParticipants.filter((p) => p.team === 'enemies');

    const victory = totalEnemies.length > 0 && aliveEnemies.length === 0;
    const defeat = aliveAllies.length === 0 && projectedParticipants.some((p) => p.team === 'player_allies');
    const isEncounterActive = !victory && !defeat && projectedParticipants.length > 0;
    const isPlayerTurn = canonicalCurrentActor?.id === viewerActorId && !canonicalCurrentActor.isDead;
    const viewerTurnResources = this.actionEconomy.get(viewerActorId);

    return {
      participants: projectedParticipants,
      currentActor: projectedCurrentActor,
      hazards: this.getHazards(),
      obstacles: this.getObstacles(),
      mapBounds: this.getMapBounds(),
      turnQueue: projectedTurnQueue,
      currentRound: this.currentRound,
      currentTurnIndex: this.currentTurnIndex,
      eventLog: projectedEvents,
      isEncounterActive,
      victory,
      defeat,
      isPlayerTurn,
      viewerTurnResources,
      pendingActivations: this.getAllPendingActivations().filter((a) => isKnownById(a.actorId)),
    };
  }

  /**
   * Authoritative forced-movement resolver shared by combat effects and spells.
   * Movement is resolved cell-by-cell so walls, boundaries, destructible objects,
   * and creatures can produce canonical collision consequences.
   */
  public resolveForcedMovement(params: {
    targetId: string;
    sourcePosition?: { x: number; y: number };
    sourceActorId?: string;
    movement: CombatForcedMovementDefinition;
    actionId?: string;
  }): CombatForcedMovementResult {
    const target = this.participants.get(params.targetId);
    const requestedDistanceCells = Math.max(
      0,
      Math.min(50, Math.trunc(Number(params.movement?.distanceCells) || 0))
    );
    const from = target ? { x: target.x, y: target.y } : { x: 0, y: 0 };

    if (!target || requestedDistanceCells <= 0) {
      return {
        moved: false,
        from,
        to: from,
        requestedDistanceCells,
        actualDistanceCells: 0,
        collisionsResolved: 0,
      };
    }

    if (target.isDead && target.hpCurrent <= 0) {
      return {
        moved: false,
        from,
        to: from,
        requestedDistanceCells,
        actualDistanceCells: 0,
        collisionsResolved: 0,
      };
    }

    const movementType = params.movement.type;
    if (movementType !== 'PUSH' && movementType !== 'PULL') {
      return {
        moved: false,
        from,
        to: from,
        requestedDistanceCells,
        actualDistanceCells: 0,
        collisionsResolved: 0,
      };
    }

    const source = params.sourcePosition || from;
    let stepX = Math.sign(target.x - source.x);
    let stepY = Math.sign(target.y - source.y);

    if (stepX === 0 && stepY === 0) {
      stepX = movementType === 'PUSH' ? 1 : -1;
      stepY = 0;
    } else if (movementType === 'PULL') {
      stepX *= -1;
      stepY *= -1;
    }

    const collisionProfile = params.movement.collision;
    const maxCollisions = Math.max(
      1,
      Math.min(3, Math.trunc(Number(collisionProfile?.maxCollisions ?? 1) || 1))
    );
    const stopOnCollision = collisionProfile?.stopOnCollision !== false;
    let actualDistanceCells = 0;
    let collisionsResolved = 0;
    const resolvedCollisions: CombatMovementCollisionResult[] = [];
    let lastCollision: CombatMovementCollisionResult | undefined;

    const resolveFormula = (formula: string | undefined): number => {
      if (!formula) return 0;
      try {
        const roll = this.ruleset.resolveDamage(formula, false, this.diceEngine);
        return Math.max(0, roll.totalDamage);
      } catch {
        return 0;
      }
    };

    for (let step = 1; step <= requestedDistanceCells; step += 1) {
      const attemptedPosition = {
        x: target.x + stepX,
        y: target.y + stepY,
      };

      let collision:
        | {
            kind: 'BOUNDARY' | 'WALL' | 'DESTRUCTIBLE_OBJECT' | 'CREATURE';
            blockerId?: string;
            blockerName?: string;
            object?: DestructibleEnvironmentObject;
            creature?: BattlefieldParticipant;
          }
        | undefined;

      if (
        this.mapBounds &&
        (attemptedPosition.x < this.mapBounds.minX ||
          attemptedPosition.x > this.mapBounds.maxX ||
          attemptedPosition.y < this.mapBounds.minY ||
          attemptedPosition.y > this.mapBounds.maxY)
      ) {
        collision = { kind: 'BOUNDARY', blockerName: 'Battlefield boundary' };
      }

      if (!collision) {
        const obstacle = this.obstacles
          .filter((entry) =>
            entry.x === attemptedPosition.x &&
            entry.y === attemptedPosition.y &&
            entry.isImpassable !== false
          )
          .sort((a, b) => `${a.x}:${a.y}`.localeCompare(`${b.x}:${b.y}`))[0];
        if (obstacle) {
          collision = {
            kind: 'WALL',
            blockerName: 'Impassable obstacle',
          };
        }
      }

      if (!collision) {
        const object = Array.from(this.destructibleObjects.values())
          .filter((entry) =>
            !entry.isDestroyed &&
            entry.x === attemptedPosition.x &&
            entry.y === attemptedPosition.y
          )
          .sort((a, b) => a.id.localeCompare(b.id))[0];

        if (object) {
          collision = {
            kind: 'DESTRUCTIBLE_OBJECT',
            blockerId: object.id,
            blockerName: object.name,
            object,
          };
        }
      }

      if (!collision) {
        const creature = Array.from(this.participants.values())
          .filter((entry) =>
            entry.id !== target.id &&
            !entry.isDead &&
            entry.hpCurrent > 0 &&
            entry.x === attemptedPosition.x &&
            entry.y === attemptedPosition.y
          )
          .sort((a, b) => a.id.localeCompare(b.id))[0];

        if (creature) {
          collision = {
            kind: 'CREATURE',
            blockerId: creature.id,
            blockerName: creature.name,
            creature,
          };
        }
      }

      if (!collision) {
        target.x = attemptedPosition.x;
        target.y = attemptedPosition.y;
        actualDistanceCells += 1;
        continue;
      }

      collisionsResolved += 1;
      const damageToMover = resolveFormula(collisionProfile?.damageFormula);
      const damageToCreature = collision.kind === 'CREATURE'
        ? resolveFormula(collisionProfile?.creatureDamageFormula)
        : 0;
      const objectDamageFormula =
        collisionProfile?.objectDamageFormula || collisionProfile?.damageFormula;
      const damageToObject = collision.kind === 'DESTRUCTIBLE_OBJECT'
        ? resolveFormula(objectDamageFormula)
        : 0;

      let resolvedMoverDamage = 0;
      let moverDied = false;
      if (damageToMover > 0) {
        const damageResult = this.applyCombatDamage(
          target,
          damageToMover,
          collisionProfile?.damageType || 'bludgeoning',
          false
        );
        resolvedMoverDamage = damageResult.damage;
        moverDied = damageResult.targetDied;
        if (resolvedMoverDamage > 0 && this.pendingActivations.has(target.id)) {
          this.interruptActivation(target.id, `Collision impact dealt ${resolvedMoverDamage} damage`);
        }
      }

      let resolvedCreatureDamage = 0;
      if (collision.creature && damageToCreature > 0 && !collision.creature.isDead) {
        const creatureDamage = this.applyCombatDamage(
          collision.creature,
          damageToCreature,
          collisionProfile?.damageType || 'bludgeoning',
          false
        );
        resolvedCreatureDamage = creatureDamage.damage;
      }

      let objectDestroyed = false;
      let resolvedObjectDamage = 0;
      if (collision.object && damageToObject > 0) {
        const objectDamage = this.damageDestructibleObject(
          collision.object.id,
          damageToObject,
          collisionProfile?.damageType || 'bludgeoning'
        );
        resolvedObjectDamage = objectDamage.damage;
        objectDestroyed = objectDamage.destroyed;
      }

      lastCollision = {
        kind: collision.kind,
        blockerId: collision.blockerId,
        blockerName: collision.blockerName,
        position: { x: target.x, y: target.y },
        attemptedPosition,
        damageToMover: resolvedMoverDamage,
        damageToObject: resolvedObjectDamage,
        damageToCreature: resolvedCreatureDamage,
        targetDied: moverDied,
        objectDestroyed,
      };
      resolvedCollisions.push(lastCollision);

      if (
        stopOnCollision ||
        collision.kind !== 'DESTRUCTIBLE_OBJECT' ||
        !objectDestroyed ||
        collisionsResolved >= maxCollisions ||
        moverDied
      ) {
        break;
      }

      // A destroyed destructible object can be passed through when explicitly
      // authored with stopOnCollision=false.
      target.x = attemptedPosition.x;
      target.y = attemptedPosition.y;
      actualDistanceCells += 1;
    }

    const to = { x: target.x, y: target.y };
    this.combatActionSequence += 1;
    const eventId = 'combat_evt_' + this.currentRound + '_' + this.combatActionSequence;
    const actionId = params.actionId || 'forced_movement_' + this.currentRound + '_' + target.id;

    this.combatEffectEvents.push({
      eventId,
      actionId,
      eventType: lastCollision ? 'FORCED_MOVEMENT_COLLISION_RESOLVED' : 'FORCED_MOVEMENT_RESOLVED',
      turnNumber: this.currentRound,
      actorId: params.sourceActorId || target.id,
      targetId: target.id,
      headline: lastCollision
        ? target.name + ' was forced from (' + from.x + ', ' + from.y + ') to (' + to.x + ', ' + to.y + ') and collided with ' + (lastCollision.blockerName || lastCollision.kind.toLowerCase()) + '.'
        : target.name + ' was forced from (' + from.x + ', ' + from.y + ') to (' + to.x + ', ' + to.y + ').',
      damage: lastCollision?.damageToMover || 0,
      finalDamage: lastCollision?.damageToMover || 0,
      metadata: {
        sourceActorId: params.sourceActorId || target.id,
        movementType,
        requestedDistanceCells,
        actualDistanceCells,
        from,
        to,
        collision: resolvedCollisions[0],
        collisions: resolvedCollisions,
        collisionsResolved,
      },
    });

    return {
      moved: actualDistanceCells > 0,
      from,
      to,
      requestedDistanceCells,
      actualDistanceCells,
      collision: resolvedCollisions[0],
      collisions: resolvedCollisions,
      collisionsResolved,
    };
  }
  public moveActor(actorId: string, targetX: number, targetY: number): {
    success: boolean;
    errorReason?: string;
  } {
    const actor = this.participants.get(actorId);
    if (!this.tacticalCombatEnabled()) return { success: false, errorReason: 'Tactical combat is disabled by the active rules profile.' };
    if (!actor) return { success: false, errorReason: "Actor not found." };
    if (actor.isDead || actor.hpCurrent <= 0 || actor.conditions.includes('Unconscious')) {
      return { success: false, errorReason: 'Dead, unconscious, or zero-HP actors cannot move.' };
    }

    const currentActor = this.getCurrentActor();
    if (!currentActor || currentActor.id !== actorId) {
      return { success: false, errorReason: "It is not this actor's turn." };
    }

    // Movement legality is centralized in ConditionEngine blocksActions semantics.
    if (this.conditionEngine?.isActionBlocked(actorId, 'MOVEMENT') || actor.conditions.includes('Grappled') || actor.conditions.includes('Restrained') || actor.conditions.includes('Paralyzed') || actor.conditions.includes('Petrified') || actor.conditions.includes('Stunned') || Boolean(actor.grappledBy)) {
      return { success: false, errorReason: 'Actor is blocked from movement by an active condition.' };
    }

    // DEF-CH8-03: Enforce canonical map boundaries if configured
    if (this.mapBounds) {
      if (
        targetX < this.mapBounds.minX ||
        targetX > this.mapBounds.maxX ||
        targetY < this.mapBounds.minY ||
        targetY > this.mapBounds.maxY
      ) {
        return {
          success: false,
          errorReason: `Target coordinates (${targetX}, ${targetY}) exceed map boundaries [${this.mapBounds.minX}..${this.mapBounds.maxX}, ${this.mapBounds.minY}..${this.mapBounds.maxY}].`,
        };
      }
    }

    // DEF-CH8-03: Enforce impassable obstacles
    for (const obs of this.obstacles) {
      if (obs.x === targetX && obs.y === targetY && obs.isImpassable !== false) {
        return {
          success: false,
          errorReason: `Target cell (${targetX}, ${targetY}) is blocked by an impassable obstacle.`,
        };
      }
    }

    const distance = Math.hypot(targetX - actor.x, targetY - actor.y);

    const path = this.calculateMovementPath(actorId, actor.x, actor.y, targetX, targetY);
    if (!path) {
      return {
        success: false,
        errorReason: 'Movement path is blocked or leaves the configured map bounds.',
      };
    }
    const movementCost = this.calculateMovementCost(path);

    const opportunityThreats = !this.actionEconomy.get(actorId)?.disengaging
      ? Array.from(this.participants.values())
          .filter((other) => {
            if (other.id === actorId || other.isDead || other.team === actor.team || other.team === 'neutral') return false;
            if (other.hpCurrent <= 0 || other.conditions.includes('Unconscious')) return false;
            if (!this.actionEconomy.get(other.id)?.reactionAvailable) return false;
            const reach = other.reachCells ?? 1.5;
            if (Math.hypot(path[0].x - other.x, path[0].y - other.y) > reach) return false;
            return path.slice(1).some((cell) => Math.hypot(cell.x - other.x, cell.y - other.y) > reach);
          })          .sort((a, b) => a.id.localeCompare(b.id))
      : [];
    if (movementCost > this.actionEconomy.get(actorId)?.movementRemainingCells! + 1e-9) {
      return {
        success: false,
        errorReason: `Movement requires ${movementCost.toFixed(1)} cells but only ${this.actionEconomy.get(actorId)?.movementRemainingCells ?? 0} remain.`,
      };
    }

    // Check occupied cells
    for (const other of this.participants.values()) {
      if (other.id !== actorId && !other.isDead && other.x === targetX && other.y === targetY) {
        return { success: false, errorReason: 'Target cell is occupied by another participant.' };
      }
    }

    // Opportunity attacks resolve before the mover leaves the attacker's reach.
    if (opportunityThreats.length > 0) {
      this.resolveOpportunityReactions(actorId, opportunityThreats);
    }

    if (actor.isDead || actor.hpCurrent <= 0 || actor.conditions.includes('Unconscious')) {
      return { success: false, errorReason: 'Movement was interrupted before the actor could leave reach.' };
    }

    if (this.conditionEngine?.isActionBlocked(actorId, 'MOVEMENT')) {
      return { success: false, errorReason: 'Actor is blocked from movement by an active condition.' };
    }
    const movementResult = this.actionEconomy.consumeMovement(actorId, movementCost);
    if (!movementResult.success) {
      return movementResult;
    }

    actor.x = targetX;
    actor.y = targetY;
    this.processConditionCombatEvent(actorId, 'ON_MOVE', 'move');

    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId,
      actionType: 'MOVE',
      headline: `${actor.name} moved to (${targetX}, ${targetY}).`,
      metadata: {
        movementDistance: distance,
        movementCost,
        path,
        difficultTerrainCells: Math.max(0, movementCost - distance),
        provokedOpportunityAttack: opportunityThreats.length > 0,
      },
    });


    this.releaseInvalidGrapples();

    this.resolveReadyTriggers({
      type: 'ACTOR_MOVED',
      actorId,
      targetId: actorId,
      from: { x: path[0]?.x ?? actor.x, y: path[0]?.y ?? actor.y },
      to: { x: targetX, y: targetY },
    });

    for (const readyActor of this.participants.values()) {
      if (readyActor.id === actorId || readyActor.isDead) continue;
      const beforeDistance = Math.hypot(path[0].x - readyActor.x, path[0].y - readyActor.y);
      const afterDistance = Math.hypot(targetX - readyActor.x, targetY - readyActor.y);
      if (beforeDistance > (readyActor.reachCells ?? 1.5) && afterDistance <= (readyActor.reachCells ?? 1.5)) {
        this.resolveReadyTriggers({
          type: 'TARGET_ENTERED_REACH',
          actorId,
          targetId: readyActor.id,
        });
      }
    }

    return { success: true };
  }

  private isPathCellBlocked(x: number, y: number): boolean {
    if (this.mapBounds && (x < this.mapBounds.minX || x > this.mapBounds.maxX || y < this.mapBounds.minY || y > this.mapBounds.maxY)) return true;
    if (this.obstacles.some((obs) => obs.x === x && obs.y === y && obs.isImpassable !== false)) return true;
    return this.hazards.some((hazard) => hazard.type === 'barricade' && hazard.x === x && hazard.y === y);
  }

  private releaseInvalidGrapples(): void {
    for (const target of this.participants.values()) {
      if (!target.grappledBy || !target.conditions.includes('Grappled')) continue;
      const grappler = this.participants.get(target.grappledBy);
      if (!grappler || grappler.isDead || grappler.hpCurrent <= 0 || grappler.conditions.includes('Incapacitated') || grappler.conditions.includes('Unconscious')) {
        target.conditions = target.conditions.filter((condition) => condition !== 'Grappled');
        target.grappledBy = undefined;
        continue;
      }
      const reach = grappler.reachCells ?? 1.5;
      if (Math.hypot(target.x - grappler.x, target.y - grappler.y) > reach) {
        target.conditions = target.conditions.filter((condition) => condition !== 'Grappled');
        target.grappledBy = undefined;
      }
    }
  }

  private calculateMovementPath(actorId: string, fromX: number, fromY: number, targetX: number, targetY: number): { x: number; y: number }[] | undefined {
    const steps = Math.max(Math.abs(targetX - fromX), Math.abs(targetY - fromY));
    if (steps === 0) return [{ x: fromX, y: fromY }];

    const path: { x: number; y: number }[] = [{ x: fromX, y: fromY }];
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(fromX + ((targetX - fromX) * i) / steps);
      const y = Math.round(fromY + ((targetY - fromY) * i) / steps);
      if (this.mapBounds && (x < this.mapBounds.minX || x > this.mapBounds.maxX || y < this.mapBounds.minY || y > this.mapBounds.maxY)) {
        return undefined;
      }
      const obstacle = this.obstacles.find((obs) => obs.x === x && obs.y === y && obs.isImpassable !== false);
      if (obstacle) return undefined;

      const barricade = this.hazards.find((hazard) =>
        hazard.type === 'barricade' &&
        hazard.x === x &&
        hazard.y === y
      );
      if (barricade) return undefined;

      const previous = path[path.length - 1];
      const diagonal = previous.x !== x && previous.y !== y;
      if (diagonal) {
        const cornerBlocked =
          this.isPathCellBlocked(previous.x, y) ||
          this.isPathCellBlocked(x, previous.y);
        if (cornerBlocked) return undefined;
      }

      if (Array.from(this.participants.values()).some((participant) =>
        participant.id !== actorId &&
        !participant.isDead &&
        participant.x === x &&
        participant.y === y
      )) {
        return undefined;
      }

      path.push({ x, y });
    }
    return path;
  }

  private calculateMovementCost(path: { x: number; y: number }[]): number {
    let cost = 0;
    for (let i = 1; i < path.length; i++) {
      const previous = path[i - 1];
      const current = path[i];
      const diagonal = previous.x !== current.x && previous.y !== current.y;
      const base = diagonal ? Math.SQRT2 : 1;
      const difficult = this.hazards.some((hazard) =>
        hazard.type === 'ice_patch' &&
        Math.hypot(current.x - hazard.x, current.y - hazard.y) <= hazard.radiusCells
      );
      cost += difficult ? base * 2 : base;
    }
    return cost;
  }

  private resolveOpportunityReactions(actorId: string, threats: BattlefieldParticipant[]): void {
    this.reactionEngine.resolve(
      {
        type: 'ACTOR_MOVED',
        actorId,
        targetId: actorId,
        metadata: { reason: 'Target left reach without Disengaging.' },
      },
      threats.map((attacker) => ({
        reactionId: `opportunity:${attacker.id}:${actorId}`,
        actorId: attacker.id,
        priority: 0,
        triggerType: 'ACTOR_MOVED' as const,
        targetId: actorId,
        canResolve: () => Boolean(this.actionEconomy.get(attacker.id)?.reactionAvailable),
        resolve: () => this.executeOpportunityAttack(attacker.id, actorId),
      }))
    );
  }

  private resolveReadyTriggers(event: {
    type: ReadyTriggerType;
    actorId: string;
    targetId?: string;
    from?: { x: number; y: number };
    to?: { x: number; y: number };
  }): void {
    this.reactionEngine.resolve(
      {
        type: event.type,
        actorId: event.actorId,
        targetId: event.targetId,
        from: event.from,
        to: event.to,
      },
      Array.from(this.participants.values()).map((participant) => {
        const ready = this.actionEconomy.getReadyAction(participant.id);
        return {
          reactionId: `ready:${participant.id}:${event.type}:${event.actorId}`,
          actorId: participant.id,
          priority: 0,
          triggerType: event.type,
          triggerActorId: ready?.triggerActorId,
          targetId: ready?.targetId,
          matches: (reactionEvent) => {
            const currentReady = this.actionEconomy.getReadyAction(participant.id);
            if (!currentReady || currentReady.triggerType !== reactionEvent.type) return false;
            if (currentReady.triggerActorId && currentReady.triggerActorId !== reactionEvent.actorId) return false;
            if (currentReady.targetId && reactionEvent.targetId &&
              currentReady.targetId !== reactionEvent.targetId &&
              currentReady.targetId !== reactionEvent.actorId) return false;
            return true;
          },
          canResolve: () => {
            const currentReady = this.actionEconomy.getReadyAction(participant.id);
            const currentParticipant = this.participants.get(participant.id);
            return Boolean(
              currentReady &&
              currentReady.triggerType === event.type &&
              !currentParticipant?.isDead &&
              (currentParticipant?.hpCurrent ?? 0) > 0 &&
              !currentParticipant?.conditions.includes('Unconscious')
            );
          },
          resolve: () => {
            const currentReady = this.actionEconomy.getReadyAction(participant.id);
            if (!currentReady) {
              return { triggered: false, hits: false, damage: 0, targetDied: false };
            }

            const reaction = this.actionEconomy.consumeReadyReaction(participant.id);
            if (!reaction.success) {
              return { triggered: false, hits: false, damage: 0, targetDied: false };
            }

            const targetId = currentReady.targetId || event.actorId;
            if (currentReady.actionType !== 'ATTACK' || !this.participants.has(targetId)) {
              return { triggered: true, hits: false, damage: 0, targetDied: false };
            }

            const result = this.resolveReactionAttack(participant.id, targetId);
            this.eventLog.push({
              turnNumber: this.currentRound,
              actorId: participant.id,
              targetId,
              actionType: 'ATTACK',
              headline: result.hits
                ? `${this.participants.get(participant.id)?.name || participant.id} triggered Ready Action against ${this.participants.get(targetId)?.name || targetId}.`
                : `${this.participants.get(participant.id)?.name || participant.id} triggered Ready Action and missed.`,
              damageInflicted: result.damage,
              rollRecord: result.roll,
              metadata: { reaction: true, reason: 'Ready Action trigger.' },
            });

            return { triggered: true, ...result };
          },
        };
      })
    );
  }
  private resolveReactionAttack(attackerId: string, targetId: string): { hits: boolean; damage: number; targetDied: boolean; roll?: RollRecord; isCritical: boolean } {
    const attacker = this.participants.get(attackerId);
    const target = this.participants.get(targetId);
    if (!attacker || !target || attacker.isDead || target.isDead) {
      return { hits: false, damage: 0, targetDied: target?.isDead ?? false, isCritical: false };
    }
    this.processConditionCombatEvent(attackerId, 'ON_REACTION', 'reaction');
    const resolution = this.resolveStandardAttack(attacker, target);
    if (resolution.blocked || !resolution.roll) {
      return { hits: false, damage: 0, targetDied: target.isDead, isCritical: false };
    }
    const attackResult = resolution.roll;
    let damage = 0;
    let targetDied = false;
    if (attackResult.hits) {
      const damageResult = this.ruleset.resolveDamage(attacker.damageFormula, attackResult.isCritical, this.diceEngine);
      const resolved = this.applyCombatDamage(target, damageResult.totalDamage, attacker.damageType || 'slashing', attackResult.isCritical);
      damage = resolved.damage;
      targetDied = resolved.targetDied;
    }
    return { hits: attackResult.hits, damage, targetDied, roll: attackResult.roll, isCritical: attackResult.isCritical };
  }

  private getCoverBonus(target: BattlefieldParticipant): number {
    switch (target.cover) {
      case 'HALF': return 2;
      case 'THREE_QUARTERS': return 5;
      case 'TOTAL': return 0;
      default: return 0;
    }
  }

  public getCoverLevel(targetId: string): CoverLevel {
    return this.participants.get(targetId)?.cover || 'NONE';
  }

  public setCover(targetId: string, cover: CoverLevel): { success: boolean; errorReason?: string } {
    const target = this.participants.get(targetId);
    if (!target) return { success: false, errorReason: 'Target not found.' };
    target.cover = cover;
    return { success: true };
  }

  public armReadyAction(
    actorId: string,
    actionDescription: string,
    triggerDescription: string,
    options: {
      triggerType: ReadyTriggerType;
      triggerActorId?: string;
      targetId?: string;
    }
  ): { success: boolean; errorReason?: string } {
    if (!this.tacticalCombatEnabled()) {
      return { success: false, errorReason: 'Tactical combat is disabled by the active rules profile.' };
    }
    if (this.turnQueue.length > 0 && this.getCurrentActor()?.id !== actorId) {
      return { success: false, errorReason: "It is not this actor's turn." };
    }
    const legality = this.canActorPerformCombatAction(actorId, 'ACTION');
    if (!legality.success) return legality;
    return this.actionEconomy.setReadyAction(actorId, actionDescription, triggerDescription, {
      ...options,
      actionType: 'ATTACK',
    });
  }

  public executeGrapple(attackerId: string, targetId: string): { success: boolean; errorReason?: string; applied?: boolean } {
    return this.executeControlAction(attackerId, targetId, 'GRAPPLE');
  }

  public escapeGrapple(actorId: string, ability: 'STR' | 'DEX' = 'STR'): { success: boolean; escaped?: boolean; errorReason?: string } {
    const actor = this.participants.get(actorId);
    if (!actor) return { success: false, errorReason: 'Actor not found.' };
    if (!actor.conditions.includes('Grappled')) return { success: false, errorReason: 'Actor is not Grappled.' };
    const grappler = actor.grappledBy ? this.participants.get(actor.grappledBy) : undefined;
    if (!grappler) return { success: false, errorReason: 'The source of the Grapple is no longer present.' };

    const action = this.consumeCombatAction(actorId, 'ACTION');
    if (!action.success) return { success: false, errorReason: action.errorReason };

    const escapeDc = 8 +
      (grappler.saveModifiers?.STR ?? grappler.savingThrowModifiers?.STR ?? 0) +
      Math.max(0, Math.floor((grappler.attackBonus - (grappler.saveModifiers?.STR ?? 0))));
    const modifier = actor.saveModifiers?.[ability] ?? actor.savingThrowModifiers?.[ability] ?? 0;
    const check = this.diceEngine.roll('1d20', modifier);    const escaped = check.total >= escapeDc;

    if (escaped) {
      actor.conditions = actor.conditions.filter((condition) => condition !== 'Grappled');
      actor.grappledBy = undefined;
      if (this.conditionEngine) {
        this.conditionEngine.removeCondition(actorId, 'Grappled');
      }
    }

    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId,
      targetId: grappler.id,
      actionType: 'ACTION',
      headline: escaped
        ? `${actor.name} escaped the Grapple.`
        : `${actor.name} failed to escape the Grapple.`,
      rollRecord: check,
      metadata: { combatAction: 'ESCAPE_GRAPPLE', escapeDc, ability },
    });

    return { success: true, escaped };
  }

  public executeShove(attackerId: string, targetId: string, prone = false): { success: boolean; errorReason?: string; applied?: boolean } {
    const result = this.executeControlAction(attackerId, targetId, 'SHOVE');
    if (!result.success || !result.applied) return result;
    const target = this.participants.get(targetId);
    if (!target) return result;
    if (prone && !target.conditions.includes('Prone')) {
      target.conditions.push('Prone');
      if (this.conditionEngine) {
        this.conditionEngine.applyCondition(target.id, {
          definitionIdOrName: 'Prone',
          sourceActorId: attackerId,
        });
      }
    }
    if (!prone) {
      const attacker = this.participants.get(attackerId)!;
      const dx = Math.sign(target.x - attacker.x);
      const dy = Math.sign(target.y - attacker.y);
      const pushX = target.x + dx;
      const pushY = target.y + dy;
      if (this.isCellFree(pushX, pushY)) {
        target.x = pushX;
        target.y = pushY;
      }
    }
    return result;
  }

  private executeControlAction(attackerId: string, targetId: string, action: 'GRAPPLE' | 'SHOVE'): { success: boolean; errorReason?: string; applied?: boolean } {
    if (!this.tacticalCombatEnabled()) return { success: false, errorReason: 'Tactical combat is disabled by the active rules profile.' };
    const attacker = this.participants.get(attackerId);
    const target = this.participants.get(targetId);
    if (!attacker || !target) return { success: false, errorReason: 'Attacker or target not found.' };
    if (this.turnQueue.length > 0 && this.getCurrentActor()?.id !== attackerId) return { success: false, errorReason: "It is not this actor's turn." };
    if (attacker.isDead || target.isDead || attacker.hpCurrent <= 0 || target.hpCurrent <= 0) {
      return { success: false, errorReason: 'Dead or incapacitated combatants cannot resolve this action.' };
    }
    const reach = attacker.reachCells ?? 1.5;
    if (Math.hypot(target.x - attacker.x, target.y - attacker.y) > reach) {
      return { success: false, errorReason: 'Target is outside melee reach.' };
    }
    const resource = this.consumeCombatAction(attackerId, 'ACTION');
    if (!resource.success) return { success: false, errorReason: resource.errorReason };
    const strMod = attacker.saveModifiers?.STR ?? attacker.savingThrowModifiers?.STR ?? 0;
    const proficiency = Math.max(0, Math.floor((attacker.attackBonus - strMod)));
    const dc = 8 + strMod + proficiency;
    const saveAbility = target.saveModifiers?.STR ?? target.savingThrowModifiers?.STR ?? 0;
    const save = this.ruleset.resolveSavingThrow({ saveModifier: saveAbility, difficultyClass: dc, diceEngine: this.diceEngine });
    const applied = !save.succeeds;
    if (applied) {
      if (action === 'GRAPPLE' && !target.conditions.includes('Grappled')) {
        target.conditions.push('Grappled');
        target.grappledBy = attackerId;
        if (this.conditionEngine) {
          this.conditionEngine.applyCondition(target.id, {
            definitionIdOrName: 'Grappled',
            sourceActorId: attackerId,
          });
        }
      }
    }
    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId: attackerId,
      targetId,
      actionType: 'ACTION',
      headline: applied
        ? `${attacker.name} used ${action.toLowerCase()} against ${target.name}.`
        : `${target.name} resisted ${action.toLowerCase()}.`,
      rollRecord: save.roll,
      metadata: { combatAction: action, dc, saveAbility: 'STR' },
    });
    return { success: true, applied };
  }

  private isCellFree(x: number, y: number): boolean {
    if (this.mapBounds && (x < this.mapBounds.minX || x > this.mapBounds.maxX || y < this.mapBounds.minY || y > this.mapBounds.maxY)) return false;
    if (this.obstacles.some((o) => o.x === x && o.y === y && o.isImpassable !== false)) return false;
    return !Array.from(this.participants.values()).some((p) => !p.isDead && p.x === x && p.y === y);
  }

  private resolveStandardAttack(
    attacker: BattlefieldParticipant,
    target: BattlefieldParticipant,
    options?: { advantage?: boolean; disadvantage?: boolean; attackFormula?: string }
  ): { blocked: boolean; roll?: { roll: RollRecord; hits: boolean; isCritical: boolean } } {
    if (target.cover === 'TOTAL') return { blocked: true };

    const attackerConditions = new Set(attacker.conditions.map((condition) => condition.toLowerCase()));
    const targetConditions = new Set(target.conditions.map((condition) => condition.toLowerCase()));
    const distanceToTarget = Math.hypot(target.x - attacker.x, target.y - attacker.y);
    const attackerHasDisadvantage =
      attackerConditions.has('blinded') ||
      attackerConditions.has('poisoned') ||
      attackerConditions.has('frightened') ||
      attackerConditions.has('restrained') ||
      attackerConditions.has('paralyzed') ||
      attackerConditions.has('stunned') ||
      attackerConditions.has('prone');
    const attackerHasAdvantage = attackerConditions.has('invisible');
    const targetDodging = Boolean(this.actionEconomy.get(target.id)?.dodging);
    const targetHasAdvantageAgainst =
      targetConditions.has('blinded') ||
      targetConditions.has('restrained') ||
      targetConditions.has('paralyzed') ||
      targetConditions.has('stunned') ||
      targetConditions.has('unconscious');
    const targetIsProne = targetConditions.has('prone');
    const targetProneAdvantage = targetIsProne && distanceToTarget <= (attacker.reachCells ?? 1.5);
    const targetProneDisadvantage = targetIsProne && distanceToTarget > (attacker.reachCells ?? 1.5);
    const exhaustionPenalty = this.conditionEngine?.getExhaustionModifiers(attacker.id).d20Penalty || 0;

    return {
      blocked: false,
      roll: this.ruleset.resolveAttack({
        attackBonus:
          attacker.attackBonus +
          this.progressionModifier(attacker.id, 'combat.attackBonus') +
          this.bossPhaseModifier(attacker.id, 'combat.attackBonus') +
          exhaustionPenalty,
        targetArmorClass:
          target.armorClass +
          this.progressionModifier(target.id, 'coreStats.armorClass') +
          this.bossPhaseModifier(target.id, 'coreStats.armorClass') +
          this.getCoverBonus(target),
        attackFormula: resolveCapabilityCheckFormula((this.rulesProfile?.mode || 'FULL_DND') as any, options?.attackFormula),
        advantage: Boolean(options?.advantage || attackerHasAdvantage || targetHasAdvantageAgainst || targetProneAdvantage || targetConditions.has('unconscious')),
        disadvantage: Boolean(options?.disadvantage || targetDodging || attackerHasDisadvantage || targetProneDisadvantage || targetConditions.has('invisible')),
        diceEngine: this.diceEngine,
      }),
    };
  }
  private executeOpportunityAttack(attackerId: string, targetId: string): {
    triggered: boolean;
    hit: boolean;
    damage: number;
    targetDied: boolean;
  } {
    const attacker = this.participants.get(attackerId);
    const target = this.participants.get(targetId);
    const reaction = this.actionEconomy.get(attackerId);

    if (
      !attacker ||
      !target ||
      attacker.isDead ||
      target.isDead ||
      attacker.hpCurrent <= 0 ||
      attacker.conditions.includes('Unconscious') ||
      !reaction?.reactionAvailable ||
      Math.hypot(target.x - attacker.x, target.y - attacker.y) > (attacker.reachCells ?? 1.5) ||
      target.conditions.some((condition) => ['Invisible', 'Hidden', 'Unperceived'].includes(condition))
    ) {
      return { triggered: false, hit: false, damage: 0, targetDied: target?.isDead ?? false };
    }

    const reactionLegality = this.canActorPerformCombatAction(attackerId, 'REACTION');
    if (!reactionLegality.success) {
      return { triggered: false, hit: false, damage: 0, targetDied: target.isDead };
    }
    const reactionUse = this.actionEconomy.consumeReaction(attackerId);
    if (!reactionUse.success) {
      return { triggered: false, hit: false, damage: 0, targetDied: target.isDead };
    }

    const resolution = this.resolveStandardAttack(attacker, target);
    if (resolution.blocked || !resolution.roll) {
      return { triggered: false, hit: false, damage: 0, targetDied: target.isDead };
    }
    const attackResult = resolution.roll;
    let damage = 0;
    let targetDied = false;
    if (attackResult.hits) {
      const damageResult = this.ruleset.resolveDamage(
        attacker.damageFormula,
        attackResult.isCritical,
        this.diceEngine
      );
      const resolved = this.applyCombatDamage(
        target,
        damageResult.totalDamage,
        attacker.damageType || 'slashing',
        attackResult.isCritical
      );
      damage = resolved.damage;
      targetDied = resolved.targetDied;
    }

    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId: attackerId,
      targetId,
      actionType: 'ATTACK',
      headline: attackResult.hits
        ? `${attacker.name} made an opportunity attack against ${target.name} for ${damage} damage!${targetDied ? ` ${target.name} has fallen!` : ''}`
        : `${attacker.name}'s opportunity attack missed ${target.name}.`,
      damageInflicted: damage,
      rollRecord: attackResult.roll,
      metadata: {
        reaction: true,
        reason: 'Target left reach without Disengaging.',
      },
    });

    return {
      triggered: true,
      hit: attackResult.hits,
      damage,
      targetDied,
    };
  }

  public executeCoreAction(
    actorId: string,
    action: CoreCombatAction
  ): {
    success: boolean;
    action: CoreCombatAction;
    errorReason?: string;
    combatState?: CombatTurnResourceSnapshot;
  } {
    if (!this.tacticalCombatEnabled()) {
      return { success: false, action, errorReason: 'Tactical combat is disabled by the active rules profile.', combatState: this.getTurnResources(actorId) };
    }
    const actor = this.participants.get(actorId);
    if (!actor) {
      return { success: false, action, errorReason: 'Actor not found.' };
    }

    const currentActor = this.getCurrentActor();
    if (this.turnQueue.length > 0 && (!currentActor || currentActor.id !== actorId)) {
      return {
        success: false,
        action,
        errorReason: "It is not this actor's turn.",
        combatState: this.getTurnResources(actorId),
      };
    }
    if (actor.isDead || actor.hpCurrent <= 0 || actor.conditions.includes('Unconscious')) {
      return {
        success: false,
        action,
        errorReason: 'An unconscious or dead actor cannot take a combat action.',
        combatState: this.getTurnResources(actorId),
      };
    }
    const conditionLegality = this.canActorPerformCombatAction(actorId, 'ACTION');
    if (!conditionLegality.success) {
      return {
        success: false,
        action,
        errorReason: conditionLegality.errorReason,
        combatState: this.getTurnResources(actorId),
      };
    }

    let result: { success: boolean; errorReason?: string };
    switch (action) {
      case 'DASH':
        result = this.actionEconomy.grantDash(actorId);
        break;
      case 'DODGE':
        result = this.actionEconomy.setDodging(actorId);
        break;
      case 'DISENGAGE':
        result = this.actionEconomy.setDisengaging(actorId);
        break;
      case 'READY':
        result = this.actionEconomy.setReadyAction(actorId, 'Prepared attack', 'Configured trigger.', {
          triggerType: 'ACTOR_MOVED',
          triggerActorId: undefined,
          actionType: 'ATTACK',
        });
        break;
      case 'GRAPPLE':
      case 'SHOVE':
        result = { success: false, errorReason: 'Use executeGrapple or executeShove with a targetId.' };
        break;
      default:
        result = { success: false, errorReason: `Unsupported combat action: ${String(action)}` };
        break;
    }

    if (!result.success) {
      return { success: false, action, errorReason: result.errorReason, combatState: this.getTurnResources(actorId) };
    }

    const headline =
      action === 'DASH'
        ? `${actor.name} took the Dash action.`
        : action === 'DODGE'
          ? `${actor.name} took the Dodge action.`
          : `${actor.name} took the Disengage action.`;

    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId,
      actionType: 'ACTION',
      headline,
      metadata: {
        coreAction: action,
      },
    });

    return {
      success: true,
      action,
      combatState: this.getTurnResources(actorId),
    };
  }

  /**
   * Canonical spell-damage entry point. Keeps spell resolution on the combat
   * authority for HP, resistances, immunities, vulnerabilities, death saves,
   * death, and concentration interruption.
   */
  public resolveAuthoritativeSpellDamage(
    target: BattlefieldParticipant,
    requestedAmount: number,
    damageType: string,
    criticalHit = false
  ): {
    damage: number;
    targetDied: boolean;
    immune?: boolean;
    resisted?: boolean;
    vulnerable?: boolean;
  } {
    this.spellRuntime.setParticipantContext(this.getMutableParticipantsForSpellResolution());
    return this.applyCombatDamage(target, requestedAmount, damageType, criticalHit);
  }

  /**
   * Canonical spell-healing entry point. Keeps participant HP and the
   * condition-system health ledger synchronized, including revival from 0 HP.
   */
  public resolveAuthoritativeSpellHealing(
    target: BattlefieldParticipant,
    requestedAmount: number
  ): { healing: number; revived: boolean } {
    const amount = Math.max(0, Math.floor(Number(requestedAmount) || 0));
    if (amount <= 0) return { healing: 0, revived: false };

    const conditionState = this.conditionEngine?.getActorState(target.id);
    if (conditionState && this.conditionEngine) {
      const previousHp = Math.max(0, conditionState.healthCurrent);
      const maxHp = Math.max(1, conditionState.healthMax, target.hpMax);
      const healed = Math.max(0, Math.min(amount, maxHp - previousHp));
      if (healed <= 0) return { healing: 0, revived: false };

      const nextHp = previousHp + healed;
      if (previousHp <= 0) {
        this.conditionEngine.recoverFromZero(target.id, nextHp);
      } else {
        this.conditionEngine.setHealth(target.id, nextHp, maxHp);
      }

      const refreshed = this.conditionEngine.getActorState(target.id);
      target.hpMax = maxHp;
      target.hpCurrent = refreshed?.healthCurrent ?? nextHp;
      target.isDead = Boolean(refreshed?.dead) || target.hpCurrent <= 0;
      target.conditions = refreshed?.instances.map((instance) => instance.name) || target.conditions.filter(
        (condition) => condition !== 'Dead' && condition !== 'Unconscious'
      );
      return {
        healing: healed,
        revived: previousHp <= 0 && target.hpCurrent > 0,
      };
    }

    const previousHp = Math.max(0, target.hpCurrent);
    const healed = Math.max(0, Math.min(amount, Math.max(1, target.hpMax) - previousHp));
    if (healed <= 0) return { healing: 0, revived: false };
    target.hpCurrent = previousHp + healed;
    const revived = previousHp <= 0 && target.hpCurrent > 0;
    if (revived) {
      target.isDead = false;
      target.conditions = target.conditions.filter((condition) => condition !== 'Dead' && condition !== 'Unconscious');
    }
    return { healing: healed, revived };
  }


  private applyCombatDamage(
    target: BattlefieldParticipant,
    requestedAmount: number,
    damageType: string,
    criticalHit = false,
    targetBodyRegionId?: BodyRegionId
  ): {
    damage: number;
    targetDied: boolean;
    immune?: boolean;
    resisted?: boolean;
    vulnerable?: boolean;
    destroyedBodyRegions: BodyRegionId[];
  } {
    const amount = Math.max(0, requestedAmount);
    const previousHp = Math.max(0, target.hpCurrent);

    if (target.usesDeathSaves && previousHp <= 0 && amount > 0) {
      let resolvedFinalAmount = amount;
      let immune = false;
      let resisted = false;
      let vulnerable = false;

      if (this.conditionEngine?.getActorState(target.id)) {
        const defenseResolved = this.conditionEngine.resolveDamage(target.id, amount, damageType);
        resolvedFinalAmount = defenseResolved.finalAmount;
        immune = defenseResolved.immune;
        resisted = defenseResolved.resisted;
        vulnerable = defenseResolved.vulnerable;
      } else {
        const type = (damageType || '').trim().toLowerCase();
        if (type && target.immunities?.some((value) => value.toLowerCase() === type)) {
          resolvedFinalAmount = 0;
          immune = true;
        } else if (type && target.resistances?.some((value) => value.toLowerCase() === type)) {
          resolvedFinalAmount = Math.floor(resolvedFinalAmount / 2);
          resisted = true;
        } else if (type && target.vulnerabilities?.some((value) => value.toLowerCase() === type)) {
          resolvedFinalAmount *= 2;
          vulnerable = true;
        }
      }

      if (resolvedFinalAmount <= 0) {
        target.isDead = false;
        if (this.conditionEngine?.getActorState(target.id)) {
          this.conditionEngine.markUnconsciousAtZero(target.id);
          const state = this.conditionEngine.getActorState(target.id);
          target.conditions = state?.instances.map((instance) => instance.name) || target.conditions;
        } else if (!target.conditions.includes('Unconscious')) {
          target.conditions.push('Unconscious');
        }
        this.bossPhaseEvaluationResolver?.(target.id, this);
        return {
          damage: 0,
          targetDied: false,
          immune,
          resisted,
          vulnerable,
          destroyedBodyRegions: [],
        };
      }

      const currentState = target.deathSaveState || deathSaveEngine.createState();
      const deathResult = deathSaveEngine.applyDamageAtZero(currentState, criticalHit);
      target.deathSaveState = deathResult.state;

      if (deathResult.died) {
        target.isDead = true;
        if (this.conditionEngine?.getActorState(target.id)) {
          this.conditionEngine.markDead(target.id);
        }
        if (!target.conditions.includes('Dead')) target.conditions.push('Dead');
      } else {
        target.isDead = false;
        if (this.conditionEngine?.getActorState(target.id)) {
          this.conditionEngine.markUnconsciousAtZero(target.id);
        } else if (!target.conditions.includes('Unconscious')) {
          target.conditions.push('Unconscious');
        }
      }

      this.bossPhaseEvaluationResolver?.(target.id, this);
      return {
        damage: resolvedFinalAmount,
        targetDied: deathResult.died,
        immune,
        resisted,
        vulnerable,
        destroyedBodyRegions: [],
      };
    }

    if (this.conditionEngine?.getActorState(target.id)) {
      const resolvedDamage = this.conditionEngine.resolveDamage(
        target.id,
        amount,
        damageType,
        { targetBodyRegionId }
      );
      target.hpCurrent = resolvedDamage.healthCurrent;
      target.isDead = resolvedDamage.targetDied;
      target.conditions = this.conditionEngine.getActorState(target.id)?.instances.map((instance) => instance.name) || [];
      if (
        target.usesDeathSaves &&
        previousHp > 0 &&
        target.hpCurrent <= 0 &&
        !target.isDead
      ) {
        target.deathSaveState = deathSaveEngine.createState();
      }

      if (
        target.usesDeathSaves &&
        previousHp > 0 &&
        target.hpCurrent <= 0 &&
        target.isDead
      ) {
        const massiveDamage = resolvedDamage.finalAmount >= previousHp + target.hpMax;
        const terminalBody = resolvedDamage.destroyedBodyRegions.includes('HEART');
        if (!massiveDamage && !terminalBody) {
          this.conditionEngine.markUnconsciousAtZero(target.id);
          target.hpCurrent = 0;
          target.isDead = false;
          target.deathSaveState = deathSaveEngine.createState();
          target.conditions = this.conditionEngine.getActorState(target.id)?.instances.map((instance) => instance.name) || [];
        } else {
          this.conditionEngine.markDead(target.id);
        }
      }

      if (target.isDead && !target.conditions.includes('Dead')) {
        target.conditions.push('Dead');
      }

      if (resolvedDamage.finalAmount > 0 && this.spellRuntime) {
        const concRes = this.spellRuntime.resolveDamageConcentrationCheck(target, resolvedDamage.finalAmount, this.diceEngine);
        if (concRes?.concentrationBroken) {
          target.activeConcentration = null;
          this.eventLog.push({
            turnNumber: this.currentRound,
            actorId: target.id,
            actionType: 'INTERRUPT',
            headline: concRes.headline,
          });
        }
      }
      if ((target.isDead || target.hpCurrent <= 0) && this.spellRuntime) {
        this.spellRuntime.breakConcentration(target.id, 'Creature dropped to 0 HP');
        target.activeConcentration = null;
      }

      const moraleAfterDamage = this.moraleEngine.observeDamage(target.id, resolvedDamage.finalAmount);
      target.moraleState = moraleAfterDamage;
      this.bossPhaseEvaluationResolver?.(target.id, this);
      return {
        damage: resolvedDamage.finalAmount,
        targetDied: target.isDead,
        immune: resolvedDamage.immune,
        resisted: resolvedDamage.resisted,
        vulnerable: resolvedDamage.vulnerable,
        destroyedBodyRegions: resolvedDamage.destroyedBodyRegions,
      };
    }

    let finalAmount = amount;
    let isImmune = false;
    let isResisted = false;
    let isVulnerable = false;

    if (damageType) {
      const type = damageType.toLowerCase();
      const imm = target.immunities?.map((i) => i.toLowerCase()) || [];
      const res = target.resistances?.map((r) => r.toLowerCase()) || [];
      const vul = target.vulnerabilities?.map((v) => v.toLowerCase()) || [];

      if (imm.includes(type)) {
        finalAmount = 0;
        isImmune = true;
      } else if (res.includes(type)) {
        finalAmount = Math.floor(finalAmount / 2);
        isResisted = true;
      } else if (vul.includes(type)) {
        finalAmount = finalAmount * 2;
        isVulnerable = true;
      }
    }

    target.hpCurrent = Math.max(0, target.hpCurrent - finalAmount);

    if (target.usesDeathSaves && previousHp > 0 && target.hpCurrent <= 0) {
      const massiveDamage = finalAmount >= previousHp + target.hpMax;
      if (!massiveDamage) {
        target.isDead = false;
        target.deathSaveState = deathSaveEngine.createState();
        if (!target.conditions.includes('Unconscious')) target.conditions.push('Unconscious');
      } else {
        target.isDead = true;
      }
    } else if (target.hpCurrent <= 0) {
      target.isDead = true;
    }

    if (target.isDead && !target.conditions.includes('Dead')) {
      target.conditions.push('Dead');
    }

    if (finalAmount > 0 && this.spellRuntime) {
      const concRes = this.spellRuntime.resolveDamageConcentrationCheck(target, finalAmount, this.diceEngine);
      if (concRes?.concentrationBroken) {
        this.eventLog.push({
          turnNumber: this.currentRound,
          actorId: target.id,
          actionType: 'INTERRUPT',
          headline: concRes.headline,
        });
      }
    }
    if ((target.isDead || target.hpCurrent <= 0) && this.spellRuntime) {
      this.spellRuntime.breakConcentration(target.id, 'Creature dropped to 0 HP');
    }

    const moraleAfterDamage = this.moraleEngine.observeDamage(target.id, finalAmount);
    target.moraleState = moraleAfterDamage;
    this.bossPhaseEvaluationResolver?.(target.id, this);
    return {
      damage: finalAmount,
      targetDied: target.isDead,
      immune: isImmune,
      resisted: isResisted,
      vulnerable: isVulnerable,
      destroyedBodyRegions: [],
    };
  }

  private resolveHitLocation(
    target: BattlefieldParticipant,
    options: {
      hitLocationMode?: CombatEffectDefinition['hitLocationMode'];
      targetBodyRegionId?: BodyRegionId;
      instanceIndex?: number;
    }
  ): BodyRegionId | undefined {
    const mode = options.hitLocationMode || 'NONE';
    if (mode === 'NONE') return undefined;
    const state = this.conditionEngine?.getActorState(target.id);
    const regions = state?.bodyRegions?.filter((region) => !region.destroyed) || [];
    if (!regions.length) return undefined;
    if (mode === 'EXPLICIT') {
      const requested = options.targetBodyRegionId;
      return requested && regions.some((region) => region.id === requested) ? requested : undefined;
    }
    const seedText = [target.id, String(this.currentRound), String(options.instanceIndex ?? 0), String(this.combatActionSequence)].join(':');
    let hash = 0;
    for (let i = 0; i < seedText.length; i += 1) hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
    return regions[hash % regions.length].id;
  }

  private resolveAttackInstanceInternal(
    attackerId: string,
    targetId: string,
    options: {
      overrideFormula?: string;
      advantage?: boolean;
      disadvantage?: boolean;
      damageType?: string;
      attackBonusOverride?: number;
      attackFormula?: string;
      actionId?: string;
      instanceIndex?: number;
      emitBattleEvent?: boolean;
      hitLocationMode?: CombatEffectDefinition['hitLocationMode'];
      targetBodyRegionId?: BodyRegionId;
      forcedMovement?: CombatForcedMovementDefinition;
    } = {}
  ): CombatAttackInstanceResult & { success: boolean; errorReason?: string; roll?: RollRecord; damageRoll?: RollRecord } {
    const attacker = this.participants.get(attackerId);
    const target = this.participants.get(targetId);
    if (!attacker || !target) {
      return { success: false, errorReason: 'Invalid combatants.', instanceIndex: options.instanceIndex ?? 0, targetId, hits: false, isCritical: false, damage: 0, targetDied: false };
    }
    if (attacker.isDead || attacker.hpCurrent <= 0 || attacker.conditions.includes('Unconscious')) {
      return { success: false, errorReason: 'An unconscious or dead actor cannot attack.', instanceIndex: options.instanceIndex ?? 0, targetId, hits: false, isCritical: false, damage: 0, targetDied: target.isDead };
    }
    if (target.isDead || target.hpCurrent <= 0) {
      return { success: false, errorReason: 'Target is already defeated.', instanceIndex: options.instanceIndex ?? 0, targetId, hits: false, isCritical: false, damage: 0, targetDied: true };
    }
    if (target.cover === 'TOTAL') {
      return { success: false, errorReason: 'Target has Total Cover and cannot be targeted directly.', instanceIndex: options.instanceIndex ?? 0, targetId, hits: false, isCritical: false, damage: 0, targetDied: target.isDead };
    }

    this.processConditionCombatEvent(attackerId, 'ON_ATTACK', 'attack');

    const attackSource = options.attackBonusOverride === undefined
      ? this.participants.get(attackerId) || attacker
      : { ...(this.participants.get(attackerId) || attacker), attackBonus: options.attackBonusOverride };
    const attackResolution = this.resolveStandardAttack(attackSource, target, {
      advantage: options.advantage,
      disadvantage: options.disadvantage,
      attackFormula: options.attackFormula,
    });
    if (attackResolution.blocked || !attackResolution.roll) {
      return { success: false, errorReason: 'Target cannot be directly targeted because it has Total Cover.', instanceIndex: options.instanceIndex ?? 0, targetId, hits: false, isCritical: false, damage: 0, targetDied: target.isDead };
    }

    const attackResult = attackResolution.roll;
    const targetConditions = new Set(target.conditions.map((condition) => condition.toLowerCase()));
    const distanceToTarget = Math.hypot(target.x - attacker.x, target.y - attacker.y);
    let damage = 0;
    let targetDied = false;
    let damageRoll: RollRecord | undefined;
    let defense: CombatAttackInstanceResult['defense'];
    let hitLocation: BodyRegionId | undefined;
    let destroyedBodyRegions: BodyRegionId[] = [];

    if (attackResult.hits) {
      const formula = options.overrideFormula || attacker.damageFormula;
      const unconsciousMeleeCritical = targetConditions.has('unconscious') && distanceToTarget <= (attacker.reachCells ?? 1.5);
      const critical = attackResult.isCritical || unconsciousMeleeCritical;
      const dmgRes = this.ruleset.resolveDamage(formula, critical, this.diceEngine);
      damageRoll = dmgRes.roll;
      hitLocation = this.resolveHitLocation(target, options);
      const damageResult = this.applyCombatDamage(target, dmgRes.totalDamage, options.damageType || attacker.damageType || 'slashing', critical, hitLocation);
      damage = damageResult.damage;
      targetDied = damageResult.targetDied;
      destroyedBodyRegions = damageResult.destroyedBodyRegions || [];
      defense = { immune: damageResult.immune, resisted: damageResult.resisted, vulnerable: damageResult.vulnerable };

      if (damage > 0 && this.pendingActivations.has(targetId)) {
        this.interruptActivation(targetId, `Damaged for ${damage} points`);
      }
    }

    const instanceIndex = options.instanceIndex ?? 0;
    const actionId = options.actionId || `combat_action_${this.currentRound}_${attackerId}_${this.combatActionSequence + 1}`;
    this.combatActionSequence += 1;
    const eventId = `combat_evt_${this.currentRound}_${this.combatActionSequence}`;
    const event: CombatEventRecord = {
      eventId,
      actionId,
      eventType: 'ATTACK_INSTANCE_RESOLVED',
      turnNumber: this.currentRound,
      actorId: attackerId,
      targetId,
      instanceIndex,
      headline: attackResult.hits
        ? `${attacker.name} hit ${target.name} for ${damage} damage.${targetDied ? ` ${target.name} has fallen!` : ''}`
        : `${attacker.name} missed ${target.name}.`,
      attackRoll: attackResult.roll,
      damageRoll,
      damage,
      finalDamage: damage,
      isCritical: attackResult.isCritical,
      metadata: { defense },
    };
    this.combatEffectEvents.push(event);

    if (attackResult.hits) {
      this.processConditionCombatEvent(attackerId, 'ON_HIT', 'hit');
      if (damage > 0) this.processConditionCombatEvent(targetId, 'ON_DAMAGE', 'damage');
    } else {
      this.processConditionCombatEvent(attackerId, 'ON_MISS', 'miss');
    }
    if (targetDied) {
      const killerMorale = this.moraleEngine.observeKill(attackerId);
      const killer = this.participants.get(attackerId);
      if (killer) killer.moraleState = killerMorale;
      for (const ally of this.participants.values()) {
        if (ally.id === attackerId || ally.team !== target.team || ally.isDead) continue;
        ally.moraleState = this.moraleEngine.observeAllyDeath(ally.id);
      }
      this.processConditionCombatEvent(attackerId, 'ON_KILL', 'kill');
      this.processConditionCombatEvent(targetId, 'ON_DEATH', 'death');
    }

    if (options.emitBattleEvent !== false) {
      this.eventLog.push({
        turnNumber: this.currentRound,
        actorId: attackerId,
        targetId,
        actionType: 'ATTACK',
        headline: event.headline,
        damageInflicted: damage,
        rollRecord: attackResult.roll,
        metadata: { actionId, instanceIndex, eventId, critical: attackResult.isCritical, defense, hitLocation, destroyedBodyRegions },
      });
    }

    return {
      success: true,
      instanceIndex,
      targetId,
      hits: attackResult.hits,
      isCritical: attackResult.isCritical,
      damage,
      targetDied,
      hitLocation,
      destroyedBodyRegions,
      roll: attackResult.roll,
      damageRoll,
      attackRollTotal: attackResult.roll.total,
      targetArmorClass: target.armorClass + this.progressionModifier(target.id, 'coreStats.armorClass') + this.bossPhaseModifier(target.id, 'coreStats.armorClass') + this.getCoverBonus(target),
      defense,
    };
  }

  private processConditionCombatEvent(
    actorId: string,
    event:
      | 'ON_ACTION'
      | 'ON_ATTACK'
      | 'ON_HIT'
      | 'ON_MISS'
      | 'ON_DAMAGE'
      | 'ON_SAVE'
      | 'ON_MOVE'
      | 'ON_KILL'
      | 'ON_DEATH'
      | 'ON_REACTION'
      | 'ON_ROUND_START'
      | 'ON_ROUND_END',
    actionText?: string,
  ): void {
    if (!this.conditionEngine?.getActorState(actorId)) return;
    const result = this.conditionEngine.processCombatEvent(actorId, event, {
      actionText,
      nowSeconds: this.currentRound,
    });
    const participant = this.participants.get(actorId);
    const state = this.conditionEngine.getActorState(actorId);
    if (participant && state) {
      participant.hpCurrent = state.healthCurrent;
      participant.hpMax = state.healthMax;
      participant.isDead = state.dead;
      participant.conditions = state.instances.map((instance) => instance.name);
      participant.damageProfile = state.damageProfile;
      participant.conditionProfile = state.conditionProfile;
    }
    if (!result.changed) return;

    for (const triggerEvent of result.events) {
      this.combatActionSequence += 1;
      this.combatEffectEvents.push({
        eventId: `combat_evt_${this.currentRound}_${this.combatActionSequence}`,
        actionId: `condition_trigger_${this.currentRound}_${actorId}`,
        eventType: 'CONDITION_TRIGGER_RESOLVED',
        turnNumber: this.currentRound,
        actorId,
        targetId: actorId,
        headline: triggerEvent.notes.join(' ') || `${triggerEvent.conditionName} reacted to ${event}.`,
        damage: triggerEvent.damage?.finalAmount || 0,
        finalDamage: triggerEvent.damage?.finalAmount || 0,
        metadata: {
          conditionEvent: event,
          conditionId: triggerEvent.conditionId,
          conditionName: triggerEvent.conditionName,
          intensityBefore: triggerEvent.intensityBefore,
          intensityAfter: triggerEvent.intensityAfter,
          removed: triggerEvent.removed,
        },
      });
    }
  }

  public applyCombatCondition(
    targetId: string,
    condition: {
      conditionIdOrName: string;
      intensity?: number;
      severity?: number;
      durationSeconds?: number | null;
      notes?: string;
    },
    sourceActorId?: string
  ): { success: boolean; applied: boolean; immune: boolean; errorReason?: string } {
    const target = this.participants.get(targetId);
    if (!target) return { success: false, applied: false, immune: false, errorReason: 'Condition target not found.' };
    if (!this.conditionEngine) {
      if (!target.conditions.includes(condition.conditionIdOrName)) target.conditions.push(condition.conditionIdOrName);
      return { success: true, applied: true, immune: false };
    }

    const result = this.conditionEngine.applyCondition(targetId, {
      definitionIdOrName: condition.conditionIdOrName,
      intensity: condition.intensity,
      severity: condition.severity,
      durationSeconds: condition.durationSeconds,
      sourceActorId,
      notes: condition.notes,
      nowSeconds: this.currentRound,
    });

    const state = this.conditionEngine.getActorState(targetId);
    if (state) {
      target.conditions = state.instances.map((instance) => instance.name);
      target.hpCurrent = state.healthCurrent;
      target.isDead = state.dead;
    } else if (result.applied && !target.conditions.includes(condition.conditionIdOrName)) {
      target.conditions.push(condition.conditionIdOrName);
    }

    this.combatActionSequence += 1;
    const conditionEventId = `combat_evt_${this.currentRound}_${this.combatActionSequence}`;
    this.combatEffectEvents.push({
      eventId: conditionEventId,
      actionId: `condition_${this.currentRound}_${sourceActorId || 'SYSTEM'}`,
      eventType: result.applied ? 'CONDITION_APPLIED' : result.immune ? 'CONDITION_BLOCKED' : 'CONDITION_REJECTED',
      turnNumber: this.currentRound,
      actorId: sourceActorId || targetId,
      targetId,
      headline: result.applied
        ? `${target.name} gained ${condition.conditionIdOrName}.`
        : `${target.name} did not gain ${condition.conditionIdOrName}.`,
      metadata: {
        conditionIdOrName: condition.conditionIdOrName,
        intensity: condition.intensity,
        severity: condition.severity,
        durationSeconds: condition.durationSeconds,
        immune: result.immune,
        applied: result.applied,
      },
    });

    return { success: true, applied: result.applied, immune: result.immune, errorReason: result.reason };
  }

  public canActorPerformCombatAction(
    actorId: string,
    actionCost: import('../../src/types').CombatActionCost = 'ACTION'
  ): { success: boolean; errorReason?: string } {
    const actionBlock =
      actionCost === 'BONUS_ACTION'
        ? 'BONUS_ACTION'
        : actionCost === 'REACTION'
          ? 'REACTION'
          : actionCost === 'FREE'
            ? undefined
            : 'ACTION';
    if (actionBlock && this.conditionEngine?.isActionBlocked(actorId, actionBlock)) {
      return {
        success: false,
        errorReason: `Actor is blocked from using ${actionBlock.replace('_', ' ').toLowerCase()} by an active condition.`,
      };
    }
    return { success: true };
  }

  public consumeCombatAction(actorId: string, actionCost: import('../../src/types').CombatActionCost = 'ACTION'): { success: boolean; errorReason?: string } {
    const legality = this.canActorPerformCombatAction(actorId, actionCost);
    if (!legality.success) return legality;
    if (actionCost === 'FREE') return { success: true };
    const resource = actionCost === 'BONUS_ACTION'
      ? 'BONUS_ACTION'
      : actionCost === 'REACTION'
        ? 'REACTION'
        : 'ACTION';
    return this.actionEconomy.consume(actorId, resource);
  }

  public executeAttack(
    attackerId: string,
    targetId: string,
    options?: {
      overrideFormula?: string;
      advantage?: boolean;
      disadvantage?: boolean;
      damageType?: string;
      attackFormula?: string;
      consumeAction?: boolean;
      hitLocationMode?: CombatEffectDefinition['hitLocationMode'];
      targetBodyRegionId?: BodyRegionId;
      forcedMovement?: CombatForcedMovementDefinition;
      attackBonusOverride?: number;
    }
  ): {
    success: boolean;
    errorReason?: string;
    hits: boolean;
    damage: number;
    targetDied: boolean;
    roll?: RollRecord;
    isCritical: boolean;
    forcedMovement?: CombatForcedMovementResult;
  } {
    if (!this.tacticalCombatEnabled()) {
      return { success: false, errorReason: 'Tactical combat is disabled by the active rules profile.', hits: false, damage: 0, targetDied: false, isCritical: false };
    }
    const attacker = this.participants.get(attackerId);
    const target = this.participants.get(targetId);
    if (!attacker || !target) throw new Error('Invalid combatants.');
    const currentActor = this.getCurrentActor();
    if (this.turnQueue.length > 0 && (!currentActor || currentActor.id !== attackerId)) {
      return { success: false, errorReason: "It is not this attacker's turn.", hits: false, damage: 0, targetDied: target.isDead, isCritical: false };
    }
    const conditionLegality = this.canActorPerformCombatAction(attackerId, 'ACTION');
    if (!conditionLegality.success) {
      return {
        success: false,
        errorReason: conditionLegality.errorReason,
        hits: false,
        damage: 0,
        targetDied: target.isDead,
        isCritical: false,
      };
    }

    // Total Cover is a pre-action targeting failure. Validate it before consuming
    // the Action so a blocked direct attack preserves the actor's Action resource.
    if (target.cover === 'TOTAL') {
      return {
        success: false,
        errorReason: 'Target has Total Cover and cannot be targeted directly.',
        hits: false,
        damage: 0,
        targetDied: target.isDead,
        isCritical: false,
      };
    }

    const actionResult = options?.consumeAction === false
      ? { success: true as const }
      : this.consumeCombatAction(attackerId, 'ACTION');
    if (!actionResult.success) {
      return { success: false, errorReason: actionResult.errorReason, hits: false, damage: 0, targetDied: target.isDead, isCritical: false };
    }
    const result = this.resolveAttackInstanceInternal(attackerId, targetId, {
      ...options,
      attackFormula: options?.attackFormula,
    });
    if (!result.success) {
      return { success: false, errorReason: result.errorReason, hits: false, damage: 0, targetDied: result.targetDied, isCritical: result.isCritical };
    }

    let forcedMovement: CombatForcedMovementResult | undefined;
    if (result.hits && !result.targetDied && options?.forcedMovement) {
      forcedMovement = this.resolveForcedMovement({
        targetId,
        sourcePosition: { x: attacker.x, y: attacker.y },
        sourceActorId: attackerId,
        movement: options.forcedMovement,
      });
      if ((forcedMovement.collisions || []).some((collision) => collision.targetDied)) {
        result.targetDied = true;
      }
    }

    this.resolveReadyTriggers({ type: 'ACTOR_ATTACKED', actorId: attackerId, targetId });
    return {
      success: true,
      hits: result.hits,
      damage: result.damage,
      targetDied: result.targetDied,
      roll: result.roll,
      isCritical: result.isCritical,
      forcedMovement,
    };
  }

  public executeMultiAttack(
    attackerId: string,
    targetIds: string[],
    options: {
      definition?: CombatEffectDefinition;
      instanceCount?: number;
      overrideFormula?: string;
      damageFormula?: string;
      attackFormula?: string;
      damageType?: string;
      advantage?: boolean;
      disadvantage?: boolean;
      retargetPolicy?: 'NONE' | 'RETARGET_ON_DEATH';
      instanceTargetIds?: string[];
      consumeAction?: boolean;
    } = {}
  ): CombatEffectResult {
    if (!this.tacticalCombatEnabled()) return { success: false, errorReason: 'Tactical combat is disabled by the active rules profile.' };
    const attacker = this.participants.get(attackerId);
    if (!attacker) return { success: false, errorReason: 'Attacker not found.' };
    const rawTargetIds = targetIds.filter(Boolean);
    const uniqueTargets = Array.from(new Set(rawTargetIds));
    const explicitInstanceTargets = (options.instanceTargetIds || options.definition?.instanceTargetIds || []).filter(Boolean);
    if (uniqueTargets.length === 0 && explicitInstanceTargets.length === 0) return { success: false, errorReason: 'At least one targetId is required.' };
    const requestedCount = Math.trunc(options.instanceCount ?? options.definition?.instanceCount ?? (explicitInstanceTargets.length || uniqueTargets.length));
    const count = Math.max(1, Math.min(50, requestedCount));
    const availableTargets = Array.from(new Set([...uniqueTargets, ...explicitInstanceTargets]))
      .map((id) => this.participants.get(id))
      .filter(Boolean) as BattlefieldParticipant[];
    if (availableTargets.length === 0) return { success: false, errorReason: 'No valid targets are available.' };
    if (availableTargets.length === 0) return { success: false, errorReason: 'No valid targets are available.' };
    const currentActor = this.getCurrentActor();
    if (this.turnQueue.length > 0 && (!currentActor || currentActor.id !== attackerId)) return { success: false, errorReason: "It is not this attacker's turn." };
    if (attacker.isDead || attacker.hpCurrent <= 0 || attacker.conditions.includes('Unconscious')) return { success: false, errorReason: 'An unconscious or dead actor cannot attack.' };
    const actionResult = options.consumeAction === false
      ? { success: true as const }
      : this.consumeCombatAction(attackerId, 'ACTION');
    if (!actionResult.success) return { success: false, errorReason: actionResult.errorReason };

    const actionId = `combat_action_${this.currentRound}_${attackerId}_multi_${this.combatActionSequence + 1}`;
    const instances: CombatAttackInstanceResult[] = [];
    let totalDamage = 0;
    const defeatedTargetIds: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const requestedTargetId = explicitInstanceTargets[i];
      let target = requestedTargetId
        ? this.participants.get(requestedTargetId)
        : availableTargets[i < availableTargets.length ? i : 0];
      if (!target) {
        return {
          success: false,
          errorReason: `Instance ${i + 1} requested an unavailable target.`,
          actionConsumed: false,
          effectId: options.definition?.id,
          effectName: options.definition?.name,
        };
      }
      if (target.isDead || target.hpCurrent <= 0) {
        if (options.retargetPolicy === 'RETARGET_ON_DEATH' || options.definition?.retargetPolicy === 'RETARGET_ON_DEATH') {
          target = availableTargets.find((candidate) => !candidate.isDead && candidate.hpCurrent > 0) || target;
        }
      }
      if (target.isDead || target.hpCurrent <= 0) {
        this.combatActionSequence += 1;
        this.combatEffectEvents.push({
          eventId: `combat_evt_${this.currentRound}_${this.combatActionSequence}`, actionId, eventType: 'ATTACK_INSTANCE_SKIPPED',
          turnNumber: this.currentRound, actorId: attackerId, targetId: target.id, instanceIndex: i,
          headline: `Attack instance ${i + 1} was skipped because its target was already defeated.`, metadata: { reason: 'TARGET_DEFEATED' },
        });
        continue;
      }
      const result = this.resolveAttackInstanceInternal(attackerId, target.id, {
        overrideFormula: options.damageFormula || options.overrideFormula,
        damageType: options.damageType || options.definition?.damageType,
        attackFormula: options.attackFormula || options.definition?.attackFormula,
        advantage: options.advantage ?? options.definition?.advantage,
        disadvantage: options.disadvantage ?? options.definition?.disadvantage,
        actionId, instanceIndex: i,
      });
      if (!result.success) return { success: false, errorReason: result.errorReason, actionConsumed: true, effectId: options.definition?.id, effectName: options.definition?.name };

      if (result.hits && !result.targetDied && options.definition?.forcedMovement) {
        result.forcedMovement = this.resolveForcedMovement({
          targetId: result.targetId,
          sourcePosition: { x: attacker.x, y: attacker.y },
          sourceActorId: attackerId,
          movement: options.definition.forcedMovement,
          actionId,
        });
        if ((result.forcedMovement.collisions || []).some((collision) => collision.targetDied)) {
          result.targetDied = true;
        }
        result.secondaryDamage = (result.forcedMovement.collisions || [])
          .reduce((sum, collision) => sum + collision.damageToMover, 0);
      }

      instances.push(result);
      totalDamage += result.damage + (result.secondaryDamage || 0);
      if (result.targetDied && !defeatedTargetIds.includes(result.targetId)) defeatedTargetIds.push(result.targetId);
    }
    this.resolveReadyTriggers({ type: 'ACTOR_ATTACKED', actorId: attackerId, targetId: instances[0]?.targetId });
    const secondaryDamage = instances.reduce((sum, instance) => sum + (instance.secondaryDamage || 0), 0);
    return {
      success: true, actionConsumed: options.consumeAction !== false, effectId: options.definition?.id, effectName: options.definition?.name,
      instances, totalDamage, secondaryDamage, defeatedTargetIds,
      canonicalEventIds: instances.map((instance) => this.combatEffectEvents.find((event) => event.actionId === actionId && event.instanceIndex === instance.instanceIndex)?.eventId).filter(Boolean) as string[],
    };
  }

  public executeAreaDamageEffect(params: {
    actorId: string;
    targetIds: string[];
    damageFormula: string;
    damageType?: string;
    actionId?: string;
    consumeAction?: boolean;
  }): CombatEffectResult {
    if (!this.tacticalCombatEnabled()) return { success: false, errorReason: 'Tactical combat is disabled by the active rules profile.' };
    const actor = this.participants.get(params.actorId);
    if (!actor) return { success: false, errorReason: 'Actor not found.' };
    const targets = Array.from(new Set(params.targetIds.filter(Boolean))).map((id) => this.participants.get(id)).filter((target): target is BattlefieldParticipant => Boolean(target));
    if (!targets.length) return { success: false, errorReason: 'At least one valid target is required.' };
    const currentActor = this.getCurrentActor();
    if (this.turnQueue.length > 0 && (!currentActor || currentActor.id !== params.actorId)) return { success: false, errorReason: "It is not this actor's turn." };
    const actionResult = params.consumeAction === false ? { success: true as const } : this.consumeCombatAction(params.actorId, 'ACTION');
    if (!actionResult.success) return { success: false, errorReason: actionResult.errorReason };
    const actionId = params.actionId || `combat_action_${this.currentRound}_${params.actorId}_area_${this.combatActionSequence + 1}`;
    const instances: CombatAttackInstanceResult[] = [];
    const defeatedTargetIds: string[] = [];
    let totalDamage = 0;
    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      if (target.isDead || target.hpCurrent <= 0) continue;
      const damageRoll = this.ruleset.resolveDamage(params.damageFormula, false, this.diceEngine);
      const resolved = this.applyCombatDamage(target, damageRoll.totalDamage, params.damageType || 'force', false);
      if (resolved.targetDied && !defeatedTargetIds.includes(target.id)) defeatedTargetIds.push(target.id);
      totalDamage += resolved.damage;
      this.combatActionSequence += 1;
      const eventId = `combat_evt_${this.currentRound}_${this.combatActionSequence}`;
      this.combatEffectEvents.push({
        eventId, actionId, eventType: 'AREA_DAMAGE_RESOLVED', turnNumber: this.currentRound, actorId: params.actorId, targetId: target.id, instanceIndex: i,
        headline: `${actor.name} affected ${target.name} for ${resolved.damage} damage.`,
        damageRoll: damageRoll.roll, damage: resolved.damage, finalDamage: resolved.damage,
        metadata: { damageType: params.damageType || 'force', defense: { immune: resolved.immune, resisted: resolved.resisted, vulnerable: resolved.vulnerable } },
      });
      if (resolved.damage > 0) {
        this.processConditionCombatEvent(target.id, 'ON_DAMAGE', 'area_damage');
      }

      this.eventLog.push({
        turnNumber: this.currentRound, actorId: params.actorId, targetId: target.id, actionType: 'CAST',
        headline: `${actor.name} affected ${target.name} for ${resolved.damage} damage.`,
        damageInflicted: resolved.damage, rollRecord: damageRoll.roll, metadata: { actionId, eventId, area: true, damageType: params.damageType || 'force' },
      });
      instances.push({
        instanceIndex: i, targetId: target.id, hits: true, isCritical: false, damage: resolved.damage, targetDied: resolved.targetDied,
        damageRoll: damageRoll.roll, defense: { immune: resolved.immune, resisted: resolved.resisted, vulnerable: resolved.vulnerable },
      });
    }
    return {
      success: true, actionConsumed: params.consumeAction !== false, instances, totalDamage, defeatedTargetIds,
      canonicalEventIds: this.combatEffectEvents.filter((event) => event.actionId === actionId).map((event) => event.eventId),
    };
  }

  public executeSavingThrowEffect(params: {
    actorId: string;
    targetIds: string[];
    savingThrowAbility: string;
    difficultyClass: number;
    damageFormula?: string;
    damageType?: string;
    saveFormula?: string;
    halfDamageOnSave?: boolean;
    actionId?: string;
    consumeAction?: boolean;
  }): CombatEffectResult {
    if (!this.tacticalCombatEnabled()) return { success: false, errorReason: 'Tactical combat is disabled by the active rules profile.' };
    const actor = this.participants.get(params.actorId);
    if (!actor) return { success: false, errorReason: 'Actor not found.' };
    const targets = Array.from(new Set(params.targetIds.filter(Boolean))).map((id) => this.participants.get(id)).filter((target): target is BattlefieldParticipant => Boolean(target));
    if (!targets.length) return { success: false, errorReason: 'At least one valid target is required.' };
    const currentActor = this.getCurrentActor();
    if (this.turnQueue.length > 0 && (!currentActor || currentActor.id !== params.actorId)) return { success: false, errorReason: "It is not this actor's turn." };
    const actionResult = params.consumeAction === false ? { success: true as const } : this.consumeCombatAction(params.actorId, 'ACTION');
    if (!actionResult.success) return { success: false, errorReason: actionResult.errorReason };
    const rollFormula = resolveCapabilityCheckFormula((this.rulesProfile?.mode || 'FULL_DND') as any, params.saveFormula);
    const actionId = params.actionId || `combat_action_${this.currentRound}_${params.actorId}_save_${this.combatActionSequence + 1}`;
    const instances: CombatAttackInstanceResult[] = [];
    const defeatedTargetIds: string[] = [];
    let totalDamage = 0;
    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      if (target.isDead || target.hpCurrent <= 0) continue;
      const saveAbility = params.savingThrowAbility.toUpperCase();
      const modifier = target.saveModifiers?.[saveAbility] ?? target.savingThrowModifiers?.[saveAbility] ?? 0;
      const targetConditions = new Set(target.conditions.map((condition) => condition.toLowerCase()));
      const targetDodging = Boolean(this.actionEconomy.get(target.id)?.dodging);
      const automaticFailure =
        ['DEX', 'STR'].includes(saveAbility) &&
        ['paralyzed', 'petrified', 'unconscious'].some((condition) => targetConditions.has(condition));
      const save = this.ruleset.resolveSavingThrow({
        saveModifier: modifier,
        difficultyClass: params.difficultyClass,
        rollFormula,
        advantage: targetDodging && saveAbility === 'DEX',
        disadvantage: targetConditions.has('restrained') && saveAbility === 'DEX',
        diceEngine: this.diceEngine,
      });
      if (automaticFailure) save.succeeds = false;
      let damage = 0;
      let targetDied = false;
      let damageRoll: RollRecord | undefined;
      if (params.damageFormula) {
        const raw = this.ruleset.resolveDamage(params.damageFormula, false, this.diceEngine);
        damageRoll = raw.roll;
        const amount = save.succeeds ? (params.halfDamageOnSave ? Math.floor(raw.totalDamage / 2) : 0) : raw.totalDamage;
        if (amount > 0) {
          const resolved = this.applyCombatDamage(target, amount, params.damageType || 'force', false);
          damage = resolved.damage;
          targetDied = resolved.targetDied;
          if (targetDied && !defeatedTargetIds.includes(target.id)) defeatedTargetIds.push(target.id);
        }
      }
      this.combatActionSequence += 1;
      const eventId = `combat_evt_${this.currentRound}_${this.combatActionSequence}`;
      this.combatEffectEvents.push({
        eventId, actionId, eventType: 'SAVE_RESOLVED', turnNumber: this.currentRound, actorId: params.actorId, targetId: target.id, instanceIndex: i,
        headline: save.succeeds ? `${target.name} succeeded on the ${params.savingThrowAbility} save.` : `${target.name} failed the ${params.savingThrowAbility} save.`,
        saveRoll: save.roll, damageRoll, damage, finalDamage: damage, isCritical: false,
        metadata: { difficultyClass: params.difficultyClass, saveFormula: rollFormula, halfDamageOnSave: Boolean(params.halfDamageOnSave), damageType: params.damageType || 'force' },
      });
      this.eventLog.push({
        turnNumber: this.currentRound, actorId: params.actorId, targetId: target.id, actionType: 'CAST',
        headline: save.succeeds ? `${target.name} succeeded on the ${params.savingThrowAbility} save${damage ? ` and took ${damage} damage.` : '.'}` : `${target.name} failed the ${params.savingThrowAbility} save${damage ? ` and took ${damage} damage.` : '.'}`,
        damageInflicted: damage, rollRecord: save.roll, metadata: { actionId, eventId, savingThrowAbility: params.savingThrowAbility, difficultyClass: params.difficultyClass },
      });
      instances.push({ instanceIndex: i, targetId: target.id, hits: !save.succeeds, isCritical: false, damage, targetDied, roll: save.roll, damageRoll, targetArmorClass: params.difficultyClass });
      totalDamage += damage;
    }
    return { success: true, actionConsumed: params.consumeAction !== false, instances, totalDamage, defeatedTargetIds, canonicalEventIds: this.combatEffectEvents.filter((event) => event.actionId === actionId).map((event) => event.eventId) };
  }

  private trimEventBuffers(): void {
    const MAX_BATTLE_EVENTS = 500;
    const MAX_COMBAT_EFFECT_EVENTS = 1000;
    if (this.eventLog.length > MAX_BATTLE_EVENTS) {
      this.eventLog = this.eventLog.slice(-MAX_BATTLE_EVENTS);
    }
    if (this.combatEffectEvents.length > MAX_COMBAT_EFFECT_EVENTS) {
      this.combatEffectEvents = this.combatEffectEvents.slice(-MAX_COMBAT_EFFECT_EVENTS);
    }
  }

  public getCombatEffectEvents(): CombatEventRecord[] {
    this.trimEventBuffers();
    return JSON.parse(JSON.stringify(this.combatEffectEvents));
  }

  public clearCombatEffectEvents(): void {
    this.combatEffectEvents = [];
  }

  public getCombatReplayRecords(): CombatReplayRecord[] {
    return JSON.parse(JSON.stringify(this.combatReplayRecords));
  }

  public recordCombatReplay(record: Omit<CombatReplayRecord, 'id'>): CombatReplayRecord {
    const id = `combat_replay_${this.currentRound}_${this.combatActionSequence + 1}_${record.actorId}`;
    const stored: CombatReplayRecord = {
      id,
      ...JSON.parse(JSON.stringify(record)),
    };
    this.combatReplayRecords.push(stored);
    if (this.combatReplayRecords.length > 100) {
      this.combatReplayRecords.splice(0, this.combatReplayRecords.length - 100);
    }
    return JSON.parse(JSON.stringify(stored));
  }

  public getCombatActionSequence(): number {
    return this.combatActionSequence;
  }

  public executeCapabilityCast(params: {
    actorId: string;
    targetId: string;
    capabilityName: string;
    powerTier?: string;
    category?: string;
    baseDamage?: number;
    defenseModel?: 'attack_vs_ac' | 'saving_throw' | 'resistance' | 'unavoidable' | 'area_automatic';
    savingThrowType?: string;
    difficultyClass?: number;
    halfDamageOnSave?: boolean;
    damageType?: string;
    actionType?: 'action' | 'bonus_action' | 'reaction' | 'free';
    consumeResource?: boolean;
  }): {
    success: boolean;
    damage: number;
    targetDied: boolean;
    headline: string;
    targetHpRemaining: number;
    interruptedPendingActivation: boolean;
    savingThrowResult?: { roll: RollRecord; succeeds: boolean };
    attackResult?: { roll: RollRecord; hits: boolean; isCritical: boolean };
  } {
    const actor = this.participants.get(params.actorId);
    const target = this.participants.get(params.targetId);
    if (!actor || !target) throw new Error('Invalid combatants for cast.');

    const currentActor = this.getCurrentActor();
    if (this.turnQueue.length > 0 && (!currentActor || currentActor.id !== params.actorId)) {
      return {
        success: false,
        damage: 0,
        targetDied: target.isDead,
        headline: "It is not this actor's turn.",        targetHpRemaining: target.hpCurrent,        interruptedPendingActivation: false,
      };
    }
    if (actor.isDead || actor.hpCurrent <= 0 || actor.conditions.includes('Unconscious')) {
      return {
        success: false,
        damage: 0,
        targetDied: target.isDead,
        headline: 'An unconscious or dead actor cannot cast a capability.',
        targetHpRemaining: target.hpCurrent,
        interruptedPendingActivation: false,
      };
    }

    const resource =
      params.actionType === 'bonus_action'
        ? 'BONUS_ACTION'
        : params.actionType === 'reaction'
          ? 'REACTION'
          : 'ACTION';

    if (params.consumeResource !== false && params.actionType !== 'free') {
      const actionResult = this.consumeCombatAction(params.actorId, resource as import('../../src/types').CombatActionCost);
      if (!actionResult.success) {
        return {
          success: false,
          damage: 0,
          targetDied: target.isDead,
          headline: actionResult.errorReason || 'Combat resource unavailable.',
          targetHpRemaining: target.hpCurrent,
          interruptedPendingActivation: false,
        };
      }
    }

    // Calculate deterministic base damage
    let damage = params.baseDamage;
    if (damage === undefined) {
      switch (params.powerTier) {
        case 'WorldScale':
          damage = 60;
          break;
        case 'Major':
          damage = 36;
          break;
        case 'Moderate':
          damage = 22;
          break;
        case 'Minor':
        default:
          damage = 12;
          break;
      }
      if (params.category === 'Combat' || params.category === 'Magic') {
        damage += 4;
      }
    }

    let savingThrowResult: { roll: RollRecord; succeeds: boolean } | undefined;
    let attackResult: { roll: RollRecord; hits: boolean; isCritical: boolean } | undefined;
    let saveStatusText = '';

    // DEF-CH8-05: Integrated declared defense model
    if (params.defenseModel === 'saving_throw' || (params.difficultyClass !== undefined && params.defenseModel !== 'unavoidable')) {
      const saveType = params.savingThrowType || 'DEX';
      const saveMod = target.saveModifiers?.[saveType] ?? 0;
      const dc = params.difficultyClass ?? 13;
      const targetConditions = new Set(target.conditions.map((condition) => condition.toLowerCase()));
      const targetDodging = !!this.actionEconomy.get(params.targetId)?.dodging;
      const automaticFailure =
        ['paralyzed', 'petrified', 'stunned', 'unconscious'].some(
          (condition) => targetConditions.has(condition)
        ) &&
        ['DEX', 'STR'].includes(saveType.toUpperCase());
      savingThrowResult = this.ruleset.resolveSavingThrow({
        saveModifier: saveMod,
        difficultyClass: dc,
        advantage: targetDodging && saveType.toUpperCase() === 'DEX',
        disadvantage: targetConditions.has('restrained') && saveType.toUpperCase() === 'DEX',
        diceEngine: this.diceEngine,
      });
      if (automaticFailure) {
        savingThrowResult.succeeds = false;
      }

      if (savingThrowResult.succeeds) {
        if (params.halfDamageOnSave !== false) {
          damage = Math.floor(damage / 2);
          saveStatusText = ` (${target.name} succeeded ${saveType} save vs DC ${dc}, taking half damage)`;
        } else {
          damage = 0;
          saveStatusText = ` (${target.name} succeeded ${saveType} save vs DC ${dc} and avoided damage)`;
        }
      } else {
        saveStatusText = ` (${target.name} failed ${saveType} save vs DC ${dc})`;
      }
    } else if (params.defenseModel === 'attack_vs_ac') {
      const resolution = this.resolveStandardAttack(actor, target);
      if (resolution.blocked || !resolution.roll) {
        return { success: false, damage: 0, targetDied: target.isDead, headline: 'Target has Total Cover and cannot be targeted directly.', targetHpRemaining: target.hpCurrent, interruptedPendingActivation: false };
      }
      attackResult = resolution.roll;
      if (!attackResult.hits) {
        damage = 0;
        saveStatusText = ` (${actor.name} missed attack vs AC ${target.armorClass})`;
      } else if (attackResult.isCritical) {
        damage = damage * 2;
        saveStatusText = ` (Critical hit!)`;
      }
    }

    let targetDied = false;
    const damageResult = this.applyCombatDamage(
      target,
      damage,
      params.damageType || 'force',
      attackResult?.isCritical || false
    );
    damage = damageResult.damage;
    if (damageResult.immune) saveStatusText += ` [Immune to ${params.damageType || 'force'}]`;
    else if (damageResult.resisted) saveStatusText += ` [Resisted ${params.damageType || 'force'}]`;
    else if (damageResult.vulnerable) saveStatusText += ` [Vulnerable to ${params.damageType || 'force'}]`;
    targetDied = damageResult.targetDied;

    // Interrupt pending activation on taking damage
    let interruptedPendingActivation = false;
    if (damage > 0 && this.pendingActivations.has(params.targetId)) {
      const intRes = this.interruptActivation(params.targetId, `Damaged for ${damage} points`);
      interruptedPendingActivation = intRes.interrupted;
    }

    const headline = `${actor.name} unleashed ${params.capabilityName || 'capability'} on ${target.name} for ${damage} damage!${saveStatusText}${
      targetDied ? ` ${target.name} was vanquished!` : ''
    }`;

    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId: params.actorId,
      targetId: params.targetId,
      actionType: 'CAST',
      headline,
      damageInflicted: damage,
      rollRecord: savingThrowResult?.roll || attackResult?.roll,
      metadata: {
        capabilityName: params.capabilityName,
        powerTier: params.powerTier,
        category: params.category,
        defenseModel: params.defenseModel,
        savingThrowResult,
        attackResult,
      },
    });

    return {
      success: true,
      damage,
      targetDied,
      headline,
      targetHpRemaining: target.hpCurrent,
      interruptedPendingActivation,
      savingThrowResult,
      attackResult,
    };
  }

  public executeSpellCast(params: {
    actorId: string;
    spellId: string;
    targetId?: string;
    targetPosition?: { x: number; y: number };
    slotLevel?: number;
    isRitual?: boolean;
    advantage?: boolean;
    disadvantage?: boolean;
  }): {
    success: boolean;
    errorReason?: string;
    result?: CastSpellExecutionResult;
    headline?: string;
  } {
    const preState = this.exportState();
    try {
      if (!this.tacticalCombatEnabled()) {
        return { success: false, errorReason: 'Tactical combat is disabled by the active rules profile.' };
      }
    const actor = this.participants.get(params.actorId);
    if (!actor) {
      return { success: false, errorReason: 'Actor not found.' };
    }
    if (actor.isDead || actor.hpCurrent <= 0 || actor.conditions.includes('Unconscious')) {
      return { success: false, errorReason: 'An unconscious or dead actor cannot cast spells.' };
    }

    const spell = this.spellRuntime.getSpell(params.spellId);
    if (!spell) {
      return { success: false, errorReason: `Spell "${params.spellId}" not found in catalog.` };
    }

    const isReaction = spell.castingTime === 'REACTION';
    const isBonusAction = spell.castingTime === 'BONUS_ACTION';

    const resourceType: 'ACTION' | 'BONUS_ACTION' | 'REACTION' = isReaction
      ? 'REACTION'
      : isBonusAction
        ? 'BONUS_ACTION'
        : 'ACTION';

    const conditionLegality = this.canActorPerformCombatAction(params.actorId, resourceType);
    if (!conditionLegality.success) {
      return { success: false, errorReason: conditionLegality.errorReason };
    }

    if (isReaction) {
      if (!this.actionEconomy.canConsume(params.actorId, 'REACTION')) {
        return { success: false, errorReason: 'Reaction already spent this round.' };
      }
    } else {
      const currentActor = this.getCurrentActor();
      if (this.turnQueue.length > 0 && (!currentActor || currentActor.id !== params.actorId)) {
        return { success: false, errorReason: "It is not this actor's turn." };
      }
      if (!this.actionEconomy.canConsume(params.actorId, resourceType)) {
        return { success: false, errorReason: `${resourceType === 'BONUS_ACTION' ? 'Bonus action' : 'Action'} already spent this turn.` };
      }
    }

    const target = params.targetId ? this.participants.get(params.targetId) : undefined;
    if (params.targetId && !target) {
      return { success: false, errorReason: `Target "${params.targetId}" not found on battlefield.` };
    }

    // Sync actor's state if configured on participant
    const state = this.spellRuntime.getOrCreateActorState(actor.id);
    if (actor.spellSlots && Object.keys(state.spellSlots || {}).length === 0) {
      state.spellSlots = actor.spellSlots;
    }
    if (actor.preparedSpells && (state.preparedSpells || []).length === 0) {
      state.preparedSpells = actor.preparedSpells;
    }
    if (actor.knownSpells && (state.knownSpells || []).length === 0) {
      state.knownSpells = actor.knownSpells;
    }

    const result = this.spellRuntime.castSpellAuthoritative({
      request: {
        ...params,
        casterId: params.actorId,
        combatRound: this.currentRound,
        combatTurnIndex: this.currentTurnIndex,
        rulesProfile: this.rulesProfile,
        diceEngine: this.diceEngine,
        requireAuthoritativeTarget: true,
        spellAttackBonusOverride:
          actor.spellAttackBonus !== undefined
            ? actor.spellAttackBonus + this.progressionModifier(actor.id, 'spell.attackBonus')
            : actor.attackBonus + this.progressionModifier(actor.id, 'spell.attackBonus'),
        spellSaveDcOverride:
          (actor.spellSaveDc ?? 8) + this.progressionModifier(actor.id, 'spell.saveDC'),
        spellDamageBonusOverride: this.progressionModifier(actor.id, 'spell.damage'),
        damageResolver: (damageTarget, amount, damageType, criticalHit = false) =>
          this.applyCombatDamage(damageTarget, amount, damageType, criticalHit),
        healingResolver: (healingTarget, amount) =>
          this.resolveAuthoritativeSpellHealing(healingTarget, amount),
        movementResolver: (movement) =>
          this.resolveForcedMovement({
            targetId: movement.target.id,
            sourcePosition: { x: movement.source.x, y: movement.source.y },
            sourceActorId: movement.source.id,
            movement: {
              type: movement.type,
              distanceCells: movement.distanceCells,
              collision: movement.collision,
            },
          }),
      },
      casterParticipant: actor,
      targetParticipant: target,
      allParticipants: this.getMutableParticipantsForSpellResolution(),
    });

    if (!result.success) {
      return { success: false, errorReason: result.errorReason, result };
    }

    // Consume action resource only after the spell has resolved successfully.
    this.actionEconomy.consume(params.actorId, resourceType);

    // Synchronize state back to participant
    actor.spellSlots = state.spellSlots;
    actor.activeConcentration = state.activeConcentration;

    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId: params.actorId,
      targetId: params.targetId,
      actionType: 'CAST',
      headline: result.headline,
      damageInflicted: result.damageInflicted,
      rollRecord: result.savingThrowResult?.roll || result.attackResult?.roll,
      metadata: {
        spellId: result.spellId,
        spellName: result.spellName,
        slotLevelUsed: result.slotLevelUsed,
        isRitual: result.isRitual,
        requiresConcentration: result.requiresConcentration,
        brokenPreviousConcentration: result.brokenPreviousConcentration,
        savingThrowResult: result.savingThrowResult,
        attackResult: result.attackResult,
        conditionsApplied: result.conditionsApplied,
        conditionsRemoved: result.conditionsRemoved,
        movementApplied: result.movementApplied,
      },
    });

    if (result.targetConcentrationCheck?.concentrationBroken && target) {
      this.eventLog.push({
        turnNumber: this.currentRound,
        actorId: target.id,
        actionType: 'INTERRUPT',
        headline: result.targetConcentrationCheck.headline,
      });
    }

    return {
      success: true,
      result,
      headline: result.headline,
    };
    } catch (error: any) {
      this.importState(preState);
      return {
        success: false,
        errorReason: error?.message || 'Spell cast failed and was rolled back.',
      };
    }
  }

  public interruptConcentration(
    actorId: string,
    reason: string
  ): { interrupted: boolean; spellName?: string } {
    const res = this.spellRuntime.breakConcentration(actorId, reason);
    if (res.broken) {
      const actor = this.participants.get(actorId);
      if (actor) {
        actor.activeConcentration = null;
      }
      this.eventLog.push({
        turnNumber: this.currentRound,
        actorId,
        actionType: 'INTERRUPT',
        headline: `${actor?.name || actorId}'s concentration on ${res.previousSpell?.spellName} was broken: ${reason}.`,
      });
      return { interrupted: true, spellName: res.previousSpell?.spellName };
    }
    return { interrupted: false };
  }

  public advanceTurn(): {
    currentActor: BattlefieldParticipant | undefined;
    currentRound: number;
    round: number;
    currentTurnIndex: number;
    turnIndex: number;
    hazardEvents: BattleEvent[];
  } {
    if (this.turnQueue.length === 0) {
      return {
        currentActor: undefined,
        currentRound: this.currentRound,
        round: this.currentRound,
        currentTurnIndex: this.currentTurnIndex,
        turnIndex: this.currentTurnIndex,
        hazardEvents: [],
      };
    }

    const endingActor = this.getCurrentActor();
    if (endingActor) {
      this.processConditionCombatEvent(endingActor.id, 'ON_ROUND_END', 'round_end');
      this.actionEconomy.endTurn(endingActor.id);
    }

    this.currentTurnIndex++;
    if (this.currentTurnIndex >= this.turnQueue.length) {
      this.currentTurnIndex = 0;
      this.currentRound++;
      for (const hazard of this.hazards) {
        hazard.durationTurns--;
      }
      this.hazards = this.hazards.filter((h) => h.durationTurns > 0);

      // Decrement concentration duration through the authoritative spell runtime.
      for (const participant of this.participants.values()) {
        const conc = this.spellRuntime.advanceConcentrationRound(participant.id);
        if (conc) {
          participant.activeConcentration = conc.remainingRounds > 0 ? conc : null;
        }
        if (conc && conc.remainingRounds <= 0) {
          const breakRes = this.spellRuntime.breakConcentration(
            participant.id,
            `Concentration duration on ${conc.spellName} completed`
          );
          this.eventLog.push({
            turnNumber: this.currentRound,
            actorId: participant.id,
            actionType: 'INTERRUPT',
            headline: `${participant.name}'s concentration on ${conc.spellName} ended (duration expired).`,
            metadata: {
              spellId: conc.spellId,
              spellName: conc.spellName,
              cleanedUpConditions: breakRes.cleanedUpConditions,
            },
          });
        }
      }
    }

    // Process canonical condition ticks first, then environmental hazards.
    const hazardEvents: BattleEvent[] = [];
    const currentActor = this.getCurrentActor();
    if (currentActor) {
      this.actionEconomy.beginTurn(currentActor.id, currentActor.speedCells, this.currentRound);

      if (
        currentActor.usesDeathSaves &&
        currentActor.hpCurrent <= 0 &&
        !currentActor.isDead &&
        !currentActor.deathSaveState?.stable
      ) {
        const deathSaveResult = deathSaveEngine.resolveTurnStart(
          currentActor.deathSaveState || deathSaveEngine.createState(),
          this.diceEngine
        );
        currentActor.deathSaveState = deathSaveResult.state;

        const deathEvent: BattleEvent = {
          turnNumber: this.currentRound,
          actorId: currentActor.id,
          actionType: 'CONDITION_TICK',
          headline: deathSaveResult.summary,
          rollRecord: deathSaveResult.roll as any,
          metadata: {
            deathSave: true,
            successes: deathSaveResult.state.successes,
            failures: deathSaveResult.state.failures,
            stabilized: deathSaveResult.stabilized,
            revived: deathSaveResult.revived,
            died: deathSaveResult.died,
          },
        };
        this.eventLog.push(deathEvent);
        hazardEvents.push(deathEvent);

        if (deathSaveResult.revived) {
          currentActor.hpCurrent = 1;
          currentActor.isDead = false;
          currentActor.deathSaveState = deathSaveEngine.createState();
          if (this.conditionEngine?.getActorState(currentActor.id)) {
            this.conditionEngine.recoverFromZero(currentActor.id, 1);
            const state = this.conditionEngine.getActorState(currentActor.id);
            currentActor.conditions = state?.instances.map((instance) => instance.name) || [];
          } else {
            currentActor.conditions = currentActor.conditions.filter((condition) => condition !== 'Unconscious');
          }
        } else if (deathSaveResult.died) {
          currentActor.isDead = true;
          if (this.conditionEngine?.getActorState(currentActor.id)) {
            this.conditionEngine.markDead(currentActor.id);
          }
          if (!currentActor.conditions.includes('Dead')) {
            currentActor.conditions.push('Dead');
          }
        }
      }
    }
    if (currentActor && !currentActor.isDead) {
      if (this.conditionEngine) {
        const conditionTicks = this.conditionEngine.tickActor(
          currentActor.id,
          'TURN',
          this.currentRound
        );
        const conditionState = this.conditionEngine.getActorState(currentActor.id);
        if (conditionState) {
          currentActor.hpCurrent = conditionState.healthCurrent;
          currentActor.isDead = conditionState.dead;
          currentActor.conditions = conditionState.instances.map((instance) => instance.name);
          if (currentActor.usesDeathSaves && currentActor.hpCurrent > 0) {
            currentActor.deathSaveState = deathSaveEngine.createState();
          }
          if (currentActor.isDead && !currentActor.conditions.includes('Dead')) {
            currentActor.conditions.push('Dead');
          }
        }
        for (const tick of conditionTicks) {
          const event: BattleEvent = {
            turnNumber: this.currentRound,
            actorId: currentActor.id,
            actionType: 'CONDITION_TICK',
            headline: tick.damage?.finalAmount
              ? `${currentActor.name} suffered ${tick.damage.finalAmount} ${tick.damage.damageType} damage from ${tick.conditionName}.`
              : `${currentActor.name}'s ${tick.conditionName} condition progressed.`,
            damageInflicted: tick.damage?.finalAmount,
            metadata: {
              conditionId: tick.conditionId,
              intensityBefore: tick.intensityBefore,
              intensityAfter: tick.intensityAfter,
              notes: tick.notes,
            },
          };
          this.eventLog.push(event);
          hazardEvents.push(event);
          this.combatActionSequence += 1;
          this.combatEffectEvents.push({
            eventId: `combat_evt_${this.currentRound}_${this.combatActionSequence}`,
            actionId: `condition_tick_${this.currentRound}_${currentActor.id}`,
            eventType: 'CONDITION_TICK_RESOLVED',
            turnNumber: this.currentRound,
            actorId: currentActor.id,
            targetId: currentActor.id,
            headline: event.headline,
            damage: tick.damage?.finalAmount || 0,
            finalDamage: tick.damage?.finalAmount || 0,
            metadata: {
              conditionId: tick.conditionId,
              conditionName: tick.conditionName,
              intensityBefore: tick.intensityBefore,
              intensityAfter: tick.intensityAfter,
              removed: tick.removed,
              notes: tick.notes,
            },
          });
        }
      }

      if (!currentActor.isDead) {
        for (const hazard of this.hazards) {
          const dist = Math.hypot(currentActor.x - hazard.x, currentActor.y - hazard.y);          if (dist <= hazard.radiusCells) {            const hazardType =
              hazard.type === 'fire_zone' ? 'fire' :
              hazard.type === 'ice_patch' ? 'cold' :
              hazard.type === 'poison_cloud' ? 'poison' : 'custom';
            let damage = hazard.damagePerTurn;
            const damageResult = this.applyCombatDamage(
              currentActor,
              damage,
              hazardType,
              false
            );
            damage = damageResult.damage;
            const event: BattleEvent = {
              turnNumber: this.currentRound,
              actorId: currentActor.id,
              actionType: 'CONDITION_TICK',
              headline: `${currentActor.name} took ${damage} damage from ${hazard.type}.`,
              damageInflicted: damage,
              metadata: { damageType: hazardType },
            };
            this.eventLog.push(event);
            hazardEvents.push(event);

            if (damage > 0 && this.pendingActivations.has(currentActor.id)) {
              this.interruptActivation(currentActor.id, `Damaged for ${damage} points by ${hazard.type}`);
            }
          }
        }
      }

      // Advance pending activation for current actor (if still alive and not interrupted)
      if (!currentActor.isDead && this.pendingActivations.has(currentActor.id)) {
        const pending = this.pendingActivations.get(currentActor.id)!;
        if (pending.activationMode === 'charged') {
          pending.remainingTurns = Math.max(0, pending.remainingTurns - 1);
        } else if (pending.activationMode === 'channelled') {
          pending.channelSustainedTurns = (pending.channelSustainedTurns || 0) + 1;
        }
      }
    }

    return {
      currentActor: this.getCurrentActor(),
      currentRound: this.currentRound,
      round: this.currentRound,
      currentTurnIndex: this.currentTurnIndex,
      turnIndex: this.currentTurnIndex,
      hazardEvents,
    };
  }

  public getBattleEvents(): BattleEvent[] {
    this.trimEventBuffers();
    return [...this.eventLog];
  }

  public getParticipants(): BattlefieldParticipant[] {
    return Array.from(this.participants.values()).map((p) => this.projectedParticipant(p));
  }

  /** Internal authoritative participant references used by spell effect resolution. */
  public getMutableParticipantsForSpellResolution(): BattlefieldParticipant[] {
    return Array.from(this.participants.values());
  }

  public setBossPhaseState(
    bossId: string,
    state: {
      phaseId: string;
      modifiers?: Record<string, number>;
      abilities?: string[];
      targetPriority?: string;
      environmentEffects?: string[];
    }
  ): { success: boolean; errorReason?: string } {
    const boss = this.participants.get(bossId);
    if (!boss) return { success: false, errorReason: 'Boss participant not found.' };
    const normalized = {
      phaseId: state.phaseId,
      modifiers: Object.fromEntries(Object.entries(state.modifiers || {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))),
      abilities: Array.isArray(state.abilities) ? state.abilities.map(String) : [],
      targetPriority: state.targetPriority,
      environmentEffects: Array.isArray(state.environmentEffects) ? state.environmentEffects.map(String) : [],
    };
    this.bossPhaseStates.set(bossId, normalized);
    boss.bossPhaseId = normalized.phaseId;
    boss.bossPhaseModifiers = { ...normalized.modifiers };
    boss.bossPhaseAbilities = [...normalized.abilities];
    boss.bossTargetPriority = normalized.targetPriority;
    boss.bossEnvironmentEffects = [...normalized.environmentEffects];
    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId: bossId,
      actionType: 'ACTION',
      headline: `${boss.name} entered boss phase ${normalized.phaseId}.`,
      metadata: { bossPhase: normalized },
    });
    return { success: true };
  }

  public getBossPhaseState(bossId: string): {
    phaseId: string;
    modifiers: Record<string, number>;
    abilities: string[];
    targetPriority?: string;
    environmentEffects: string[];
  } | undefined {
    const state = this.bossPhaseStates.get(bossId);
    return state ? JSON.parse(JSON.stringify(state)) : undefined;
  }

  public getParticipant(id: string): BattlefieldParticipant | undefined {
    const p = this.participants.get(id);
    return p ? this.projectedParticipant(p) : undefined;
  }
  public applySemanticOutcome(
    targetId: string,
    outcome: import('../../src/types').CombatOutcomeType,
    outcomePayload?: Record<string, unknown>,
    sourceActorId?: string
  ): { success: boolean; errorReason?: string; targetId: string; wasAlive: boolean; isDead: boolean; metadata?: Record<string, unknown> } {
    const target = this.participants.get(targetId);
    if (!target) return { success: false, errorReason: 'Target participant not found.', targetId, wasAlive: false, isDead: false };

    const wasAlive = !target.isDead && target.hpCurrent > 0;
    const metadata: Record<string, unknown> = { semanticOutcome: outcome, outcomePayload: outcomePayload || {} };

    switch (outcome) {
      case 'DOWNED':
        target.hpCurrent = 0;
        target.isDead = false;
        if (!target.conditions.includes('Unconscious')) target.conditions.push('Unconscious');
        if (this.conditionEngine?.getActorState(targetId)) {
          this.conditionEngine.markUnconsciousAtZero(targetId);
        }
        metadata.downed = true;
        break;

      case 'INSTANT_DEFEAT':
      case 'ERASE_FROM_WORLD':
      case 'BANISHED':
        target.hpCurrent = 0;
        target.isDead = true;
        if (!target.conditions.includes('Dead')) target.conditions.push('Dead');
        if (!target.conditions.includes('Unconscious')) target.conditions.push('Unconscious');
        if (this.conditionEngine?.getActorState(targetId)) {
          this.conditionEngine.markDead(targetId);
        }
        if (outcome === 'ERASE_FROM_WORLD') metadata.erase = true;
        break;

      case 'SEALED':
        if (!target.conditions.includes('Sealed')) target.conditions.push('Sealed');
        if (this.conditionEngine) {
          this.conditionEngine.applyCondition(targetId, {
            definitionIdOrName: 'Sealed',
            sourceActorId: typeof outcomePayload?.sourceActorId === 'string' ? outcomePayload.sourceActorId : targetId,
          });
        }
        break;

      case 'TRANSFORMED':
        if (!target.conditions.includes('Transformed')) target.conditions.push('Transformed');
        metadata.transformation = outcomePayload?.transformation || outcomePayload?.form || null;
        break;

      case 'TELEPORTED': {
        const position = outcomePayload?.targetPosition;
        if (position && typeof position === 'object') {
          const next = position as Record<string, unknown>;
          const x = Number(next.x);
          const y = Number(next.y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            target.x = x;
            target.y = y;
            metadata.targetPosition = { x, y };
          }
        }
        break;
      }

      case 'RESOURCE_GRANTED':
      case 'RESOURCE_REMOVED': {
        const resource = String(outcomePayload?.resource || 'generic');
        const amount = Math.max(0, Number(outcomePayload?.amount ?? 0) || 0);
        target.combatResources = { ...(target.combatResources || {}) };
        const current = Math.max(0, Number(target.combatResources[resource] || 0));
        target.combatResources[resource] = outcome === 'RESOURCE_GRANTED' ? current + amount : Math.max(0, current - amount);
        metadata.resource = resource;
        metadata.amount = amount;
        metadata.previousAmount = current;
        metadata.newAmount = target.combatResources[resource];
        break;
      }

      case 'SUMMONED': {
        const rawSummon = outcomePayload?.participant;
        if (!rawSummon || typeof rawSummon !== 'object') {
          metadata.payload = outcomePayload || {};
          break;
        }
        const summon = rawSummon as Record<string, unknown>;
        const baseId = String(summon.id || ('summon_' + this.currentRound + '_' + this.combatActionSequence));
        let summonId = baseId;
        let suffix = 2;
        while (this.participants.has(summonId)) {
          summonId = baseId + '_' + suffix;
          suffix += 1;
        }
        this.addParticipant({
          id: summonId,
          name: String(summon.name || 'Summoned Entity'),
          x: Number(summon.x ?? target.x),
          y: Number(summon.y ?? target.y),
          initiative: Number(summon.initiative ?? target.initiative),
          team: (summon.team === 'player_allies' || summon.team === 'neutral') ? summon.team : target.team,
          hpCurrent: Math.max(1, Number(summon.hpCurrent ?? summon.hpMax ?? 1)),
          hpMax: Math.max(1, Number(summon.hpMax ?? summon.hpCurrent ?? 1)),
          armorClass: Math.max(0, Number(summon.armorClass ?? 10)),
          speedCells: Math.max(0, Number(summon.speedCells ?? 4)),
          attackBonus: Number(summon.attackBonus ?? 0),
          damageFormula: typeof summon.damageFormula === 'string' ? summon.damageFormula : '1d4',
          damageType: typeof summon.damageType === 'string' ? summon.damageType : undefined,
          conditions: Array.isArray(summon.conditions) ? summon.conditions.map(String) : [],
          isDead: false,
        });
        metadata.summonedId = summonId;
        metadata.summon = summon;
        break;
      }

      case 'WORLD_STATE_CHANGED':
        metadata.payload = outcomePayload || {};
        break;

      default:
        break;
    }

    this.combatActionSequence += 1;
    const eventId = 'combat_evt_' + this.currentRound + '_' + this.combatActionSequence;
    this.combatEffectEvents.push({
      eventId,
      actionId: 'combat_outcome_' + this.currentRound + '_' + this.combatActionSequence,
      eventType: 'SEMANTIC_OUTCOME_RESOLVED',
      turnNumber: this.currentRound,
      actorId: sourceActorId || targetId,
      targetId,
      headline: `Semantic outcome ${outcome} applied to ${target.name}.`,
      metadata,
    });
    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId: sourceActorId || targetId,
      targetId,
      actionType: 'CAST',
      headline: `Semantic outcome ${outcome} applied to ${target.name}.`,
      damageInflicted: 0,
      metadata: { ...metadata, eventId },
    });

    return { success: true, targetId, wasAlive, isDead: target.isDead, metadata: { ...metadata, eventId } };
  }

  public exportState(): TacticalCombatStateExport {
    const canonicalParticipants = Array.from(this.participants.values()).map((participant) => JSON.parse(JSON.stringify(participant)));
    const progressionResolutions: Record<string, any> = {};
    if (this.progressionModifierResolver) {
      for (const p of this.participants.values()) {
        const resolution = this.progressionModifierResolver(p.id);
        if (resolution) progressionResolutions[p.id] = JSON.parse(JSON.stringify(resolution));
      }
    }
    return {
      participants: canonicalParticipants,
      hazards: this.getHazards(),
      obstacles: this.getObstacles(),
      mapBounds: this.getMapBounds(),
      turnQueue: this.getTurnQueue(),
      currentTurnIndex: this.currentTurnIndex,
      currentRound: this.currentRound,
      eventLog: this.getBattleEvents(),
      pendingActivations: this.getAllPendingActivations(),
      turnResources: this.actionEconomy.exportState(),
      seed: this.diceEngine.getSeed(),
      rollCounter: this.diceEngine.getRollCounter(),
      rulesProfile: this.getRulesProfile(),
      spellRuntimeState: this.spellRuntime.exportState(),
      combatEffectEvents: this.getCombatEffectEvents(),
      combatActionSequence: this.combatActionSequence,
      destructibleObjects: this.getDestructibleObjects(),
      combatReplayRecords: this.getCombatReplayRecords(),
      moraleStates: this.moraleEngine.exportState(),
      bossPhaseStates: Array.from(this.bossPhaseStates.entries()).map(([bossId, state]) => ({ bossId, ...state })),
      conditionEngineState: this.conditionEngine?.exportState(),
      progressionResolutions: Object.keys(progressionResolutions).length > 0 ? progressionResolutions : undefined,
    };
  }

  public importState(data: Partial<TacticalCombatStateExport>): void {
    this.clear();
    if (data.participants) {
      for (const p of data.participants) {
        this.addParticipant(p);
      }
    }
    if (data.hazards) {
      for (const h of data.hazards) {
        this.addHazard(h);
      }
    }
    this.destructibleObjects.clear();
    for (const object of data.destructibleObjects || []) {
      this.upsertDestructibleObject(object);
    }
    if (data.obstacles) {
      for (const obs of data.obstacles) {
        this.addObstacle(obs);
      }
    }
    if (data.mapBounds) {
      this.setMapBounds(data.mapBounds);
    }
    if (data.turnQueue) {
      this.turnQueue = [...data.turnQueue];
    }
    if (typeof data.currentTurnIndex === 'number') {
      this.currentTurnIndex = data.currentTurnIndex;
    }
    if (typeof data.currentRound === 'number') {
      this.currentRound = data.currentRound;
    }
    if (data.eventLog) {
      this.eventLog = [...data.eventLog];
    }
    if (data.pendingActivations) {
      for (const act of data.pendingActivations) {
        this.pendingActivations.set(act.actorId, JSON.parse(JSON.stringify(act)));
      }
    }
    if (data.turnResources) {
      this.actionEconomy.importState(data.turnResources);
    } else {
      const currentActor = this.getCurrentActor();
      if (currentActor) {
        this.actionEconomy.beginTurn(currentActor.id, currentActor.speedCells, this.currentRound);
      }
    }
    if (typeof data.seed === 'number') {
      this.diceEngine.setSeed(data.seed);
    }
    if (typeof data.rollCounter === 'number') {
      this.diceEngine.setRollCounter(data.rollCounter);
    }
    if (data.rulesProfile) {
      this.setRulesProfile(data.rulesProfile);
    }
    if (data.spellRuntimeState) {
      this.spellRuntime.importState(data.spellRuntimeState);
      this.spellRuntime.setParticipantContext(this.getMutableParticipantsForSpellResolution());
    }
    if (data.conditionEngineState && this.conditionEngine) {
      this.conditionEngine.importState(data.conditionEngineState);
      for (const participant of this.participants.values()) {
        const conditionState = this.conditionEngine.getActorState(participant.id);
        if (!conditionState) continue;
        participant.hpCurrent = conditionState.healthCurrent;
        participant.hpMax = conditionState.healthMax;
        participant.isDead = conditionState.dead;
        participant.conditions = conditionState.instances.map((instance) => instance.name);
        participant.damageProfile = conditionState.damageProfile;
        participant.conditionProfile = conditionState.conditionProfile;
      }
      this.spellRuntime.setParticipantContext(this.getMutableParticipantsForSpellResolution());
    }
    this.combatEffectEvents = [...(data.combatEffectEvents || [])];
    this.combatReplayRecords = [...(data.combatReplayRecords || [])].slice(-100);
    this.moraleEngine.importState((data.moraleStates as any) || []);
    for (const participant of this.participants.values()) {
      participant.moraleState = this.moraleEngine.get(participant.id);
    }
    this.combatActionSequence = typeof data.combatActionSequence === 'number' ? Math.max(0, Math.trunc(data.combatActionSequence)) : this.combatEffectEvents.length;
    this.bossPhaseStates.clear();
    for (const state of (data as any).bossPhaseStates || []) {
      if (!state?.bossId || !state?.phaseId) continue;
      this.bossPhaseStates.set(state.bossId, {
        phaseId: state.phaseId,
        modifiers: { ...(state.modifiers || {}) },
        abilities: Array.isArray(state.abilities) ? [...state.abilities] : [],
        targetPriority: state.targetPriority,
        environmentEffects: Array.isArray(state.environmentEffects) ? [...state.environmentEffects] : [],
      });
      const participant = this.participants.get(state.bossId);
      if (participant) {
        participant.bossPhaseId = state.phaseId;
        participant.bossPhaseModifiers = { ...(state.modifiers || {}) };
        participant.bossPhaseAbilities = Array.isArray(state.abilities) ? [...state.abilities] : [];
        participant.bossTargetPriority = state.targetPriority;
        participant.bossEnvironmentEffects = Array.isArray(state.environmentEffects) ? [...state.environmentEffects] : [];
      }
    }
    if (data.progressionResolutions) {
      const resolutions = { ...data.progressionResolutions };
      this.setProgressionModifierResolver((actorId) => resolutions[actorId]);
    }
  }
}