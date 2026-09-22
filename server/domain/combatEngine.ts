import { WorldTimestamp } from './types';
import { PendingActivationState } from './capabilityEngine';
import { ConditionEngine } from './conditionEngine';
import { CombatActionEconomy, CombatTurnResourceSnapshot, ReadyTriggerType } from './combatActionEconomy';
import { CombatReactionEngine } from './combatReactionEngine';
import { deathSaveEngine } from './deathSaveEngine';
import type { DeathSaveState, RulesProfile } from '../../src/types';
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
  diceTerms: DiceTerm[];
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
    advantage?: boolean;
    disadvantage?: boolean;
    diceEngine?: LocalDiceEngine;
  }): { roll: RollRecord; hits: boolean; isCritical: boolean };
  resolveSavingThrow(params: {
    saveModifier: number;
    difficultyClass: number;
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
    advantage?: boolean;
    disadvantage?: boolean;
    diceEngine?: LocalDiceEngine;
  }): { roll: RollRecord; hits: boolean; isCritical: boolean } {
    const dice = params.diceEngine || LocalDiceEngine;
    const roll1 = dice.roll('1d20', params.attackBonus);
    let chosenRoll = roll1;

    if (params.advantage && !params.disadvantage) {
      const roll2 = dice.roll('1d20', params.attackBonus);
      chosenRoll = roll2.total > roll1.total ? roll2 : roll1;
    } else if (params.disadvantage && !params.advantage) {
      const roll2 = dice.roll('1d20', params.attackBonus);
      chosenRoll = roll2.total < roll1.total ? roll2 : roll1;
    }

    const naturalD20 = chosenRoll.individualDice[0];
    const isCritical = naturalD20 === 20;
    const isCritFail = naturalD20 === 1;

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
    advantage?: boolean;
    disadvantage?: boolean;
    diceEngine?: LocalDiceEngine;
  }): { roll: RollRecord; succeeds: boolean } {
    const dice = params.diceEngine || LocalDiceEngine;
    const roll1 = dice.roll('1d20', params.saveModifier);
    let chosenRoll = roll1;

    if (params.advantage && !params.disadvantage) {
      const roll2 = dice.roll('1d20', params.saveModifier);
      chosenRoll = roll2.total > roll1.total ? roll2 : roll1;
    } else if (params.disadvantage && !params.advantage) {
      const roll2 = dice.roll('1d20', params.saveModifier);
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

  private progressionModifier(actorId: string, target: string): number {
    const resolution = this.progressionModifierResolver?.(actorId);
    const modifier = resolution?.modifiers.find((entry) => entry.target === target);
    return typeof modifier?.value === 'number' && Number.isFinite(modifier.value) ? modifier.value : 0;
  }

  private projectedParticipant(participant: BattlefieldParticipant): BattlefieldParticipant {
    const projected = { ...participant };
    projected.attackBonus += this.progressionModifier(participant.id, 'combat.attackBonus');
    projected.armorClass += this.progressionModifier(participant.id, 'coreStats.armorClass');
    projected.speedCells = Math.max(
      0,
      projected.speedCells + this.progressionModifier(participant.id, 'coreStats.speed') / 5
    );
    projected.hpMax = Math.max(1, projected.hpMax + this.progressionModifier(participant.id, 'coreStats.hpMax'));
    projected.spellAttackBonus = (projected.spellAttackBonus ?? projected.attackBonus)
      + this.progressionModifier(participant.id, 'spell.attackBonus');
    projected.spellSaveDc = (projected.spellSaveDc ?? 8)
      + this.progressionModifier(participant.id, 'spell.saveDC');
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
    this.participants.clear();
    this.hazards = [];
    this.obstacles = [];
    this.mapBounds = undefined;
    this.turnQueue = [];
    this.currentTurnIndex = 0;
    this.currentRound = 1;
    this.eventLog = [];
    this.pendingActivations.clear();
    this.actionEconomy.clear();
    this.diceEngine.setSeed(this.initialSeed);
    this.diceEngine.setRollCounter(0);
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
      const existing = this.conditionEngine.getActorState(participant.id);
      if (!existing) {
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
        this.conditionEngine.seedActor(participant.id, {
          healthCurrent: participant.hpCurrent,
          healthMax: participant.hpMax,
          damageProfile,          conditionProfile: participant.conditionProfile,
          legacyConditions: participant.conditions,        });
      } else {
        participant.hpCurrent = existing.healthCurrent;
        participant.hpMax = existing.healthMax;
        participant.isDead = existing.dead;
        participant.damageProfile = existing.damageProfile;
        participant.conditionProfile = existing.conditionProfile;
        participant.conditions = existing.instances.map((instance) => instance.name);
      }
    }
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
      const projected = { ...p };
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

    // DEF-CH8-04: Enforce movement-restricting conditions
    const immobilizingConditions = ['Immobilized', 'Grappled', 'Paralyzed', 'Stunned', 'Restrained', 'Petrified', 'Asleep', 'Unconscious'];
    if (actor.conditions && actor.conditions.some((c) => immobilizingConditions.includes(c))) {
      const activeCond = actor.conditions.find((c) => immobilizingConditions.includes(c));
      return {
        success: false,
        errorReason: `Actor is ${activeCond} and cannot move.`,
      };
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

    const movementResult = this.actionEconomy.consumeMovement(actorId, movementCost);
    if (!movementResult.success) {
      return movementResult;
    }

    actor.x = targetX;
    actor.y = targetY;

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

    const action = this.actionEconomy.consume(actorId, 'ACTION');
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
    const resource = this.actionEconomy.consume(attackerId, 'ACTION');
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
    options?: { advantage?: boolean; disadvantage?: boolean }
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
        attackBonus: attacker.attackBonus + this.progressionModifier(attacker.id, 'combat.attackBonus') + exhaustionPenalty,
        targetArmorClass: target.armorClass + this.progressionModifier(target.id, 'coreStats.armorClass') + this.getCoverBonus(target),
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
    criticalHit = false
  ): {
    damage: number;    targetDied: boolean;
    immune?: boolean;
    resisted?: boolean;
    vulnerable?: boolean;
  } {
    const amount = Math.max(0, requestedAmount);
    const previousHp = Math.max(0, target.hpCurrent);

    if (target.usesDeathSaves && previousHp <= 0 && amount > 0) {
      const currentState = target.deathSaveState || deathSaveEngine.createState();
      const damageResult = deathSaveEngine.applyDamageAtZero(currentState, criticalHit);
      target.deathSaveState = damageResult.state;

      if (damageResult.died) {
        target.isDead = true;
        if (this.conditionEngine?.getActorState(target.id)) {
          this.conditionEngine.markDead(target.id);
        }
        if (!target.conditions.includes('Dead')) target.conditions.push('Dead');
      } else {
        target.isDead = false;
      }

      return {
        damage: amount,
        targetDied: damageResult.died,
      };
    }

    if (this.conditionEngine?.getActorState(target.id)) {
      const resolvedDamage = this.conditionEngine.resolveDamage(
        target.id,
        amount,
        damageType
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

      return {
        damage: resolvedDamage.finalAmount,
        targetDied: target.isDead,
        immune: resolvedDamage.immune,
        resisted: resolvedDamage.resisted,
        vulnerable: resolvedDamage.vulnerable,
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

    return {
      damage: finalAmount,
      targetDied: target.isDead,
      immune: isImmune,
      resisted: isResisted,
      vulnerable: isVulnerable,
    };
  }

  public executeAttack(
    attackerId: string,
    targetId: string,
    options?: {
      overrideFormula?: string;
      advantage?: boolean;
      disadvantage?: boolean;
      damageType?: string;
    }
  ): {
    success: boolean;
    errorReason?: string;
    hits: boolean;
    damage: number;
    targetDied: boolean;
    roll?: RollRecord;
    isCritical: boolean;
  } {
    if (!this.tacticalCombatEnabled()) {
      return { success: false, errorReason: 'Tactical combat is disabled by the active rules profile.', hits: false, damage: 0, targetDied: false, isCritical: false };
    }

    const attacker = this.participants.get(attackerId);
    const target = this.participants.get(targetId);
    if (!attacker || !target) throw new Error('Invalid combatants.');
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

    const currentActor = this.getCurrentActor();
    if (this.turnQueue.length > 0 && (!currentActor || currentActor.id !== attackerId)) {
      return {
        success: false,
        errorReason: "It is not this attacker's turn.",
        hits: false,
        damage: 0,
        targetDied: target.isDead,
        isCritical: false,
      };
    }
    if (attacker.isDead || attacker.hpCurrent <= 0 || attacker.conditions.includes('Unconscious')) {
      return {
        success: false,
        errorReason: 'An unconscious or dead actor cannot attack.',
        hits: false,
        damage: 0,
        targetDied: target.isDead,
        isCritical: false,
      };
    }

    const actionResult = this.actionEconomy.consume(attackerId, 'ACTION');
    if (!actionResult.success) {
      return {
        success: false,
        errorReason: actionResult.errorReason,
        hits: false,
        damage: 0,
        targetDied: target.isDead,
        isCritical: false,
      };
    }

    const attackResolution = this.resolveStandardAttack(attacker, target, {
      advantage: options?.advantage,
      disadvantage: options?.disadvantage,
    });
    if (attackResolution.blocked || !attackResolution.roll) {
      return { success: false, errorReason: 'Target cannot be directly targeted because it has Total Cover.', hits: false, damage: 0, targetDied: target.isDead, isCritical: false };
    }
    const attackRes = attackResolution.roll;
    const targetConditions = new Set(target.conditions.map((condition) => condition.toLowerCase()));
    const distanceToTarget = Math.hypot(target.x - attacker.x, target.y - attacker.y);
    let damage = 0;
    let targetDied = false;

    if (attackRes.hits) {
      const formula = options?.overrideFormula || attacker.damageFormula;
      const unconsciousMeleeCritical =
        targetConditions.has('unconscious') &&
        distanceToTarget <= (attacker.reachCells ?? 1.5);
      const dmgRes = this.ruleset.resolveDamage(
        formula,
        attackRes.isCritical || unconsciousMeleeCritical,
        this.diceEngine
      );
      damage = dmgRes.totalDamage;
      const damageResult = this.applyCombatDamage(
        target,
        damage,
        options?.damageType || attacker.damageType || 'slashing',
        attackRes.isCritical || unconsciousMeleeCritical
      );
      damage = damageResult.damage;
      targetDied = damageResult.targetDied;

      // Interrupt pending activation on taking damage
      if (damage > 0 && this.pendingActivations.has(targetId)) {
        this.interruptActivation(targetId, `Damaged for ${damage} points`);
      }
    }

    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId: attackerId,
      targetId,
      actionType: 'ATTACK',
      headline: attackRes.hits
        ? `${attacker.name} hit ${target.name} for ${damage} damage!${targetDied ? ` ${target.name} has fallen!` : ''}`
        : `${attacker.name} missed ${target.name}.`,
      damageInflicted: damage,
      rollRecord: attackRes.roll,
    });

    this.resolveReadyTriggers({
      type: 'ACTOR_ATTACKED',
      actorId: attackerId,
      targetId,
    });

    return {
      success: true,
      hits: attackRes.hits,
      damage,
      targetDied,
      roll: attackRes.roll,
      isCritical: attackRes.isCritical,
    };
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
      const actionResult = this.actionEconomy.consume(params.actorId, resource);
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
        damageResolver: (damageTarget, amount, damageType, criticalHit = false) =>
          this.applyCombatDamage(damageTarget, amount, damageType, criticalHit),
        healingResolver: (healingTarget, amount) =>
          this.resolveAuthoritativeSpellHealing(healingTarget, amount),
      },
      casterParticipant: actor,
      targetParticipant: target,
      allParticipants: this.getMutableParticipantsForSpellResolution(),
    });

    if (!result.success) {
      return { success: false, errorReason: result.errorReason, result };
    }

    // Consume action resource upon successful cast
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
    return [...this.eventLog];
  }

  public getParticipants(): BattlefieldParticipant[] {
    return Array.from(this.participants.values()).map((p) => this.projectedParticipant(p));
  }

  /** Internal authoritative participant references used by spell effect resolution. */
  public getMutableParticipantsForSpellResolution(): BattlefieldParticipant[] {
    return Array.from(this.participants.values());
  }

  public getParticipant(id: string): BattlefieldParticipant | undefined {
    const p = this.participants.get(id);
    return p ? this.projectedParticipant(p) : undefined;
  }

  public exportState(): TacticalCombatStateExport {
    return {
      participants: this.getParticipants(),
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
  }
}