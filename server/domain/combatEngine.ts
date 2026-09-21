import { WorldTimestamp } from './types';
import { PendingActivationState } from './capabilityEngine';
import { ConditionEngine } from './conditionEngine';
import { CombatActionEconomy, CombatTurnResourceSnapshot } from './combatActionEconomy';
import { deathSaveEngine } from './deathSaveEngine';
import type { DeathSaveState } from '../../src/types';

export interface DiceTerm {
  count: number;
  sides: number;
}

export interface ParsedDiceFormula {
  terms: DiceTerm[];
  flatModifier: number;
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
    this.rollCounter = counter;
  }

  private pseudoRandom(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  public rollDie(sides: number): number {
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
      timestamp: Math.floor(Date.now() / 1000),
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

  public resolveDamage(
    damageFormula: string,
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

export type CoreCombatAction = 'DASH' | 'DODGE' | 'DISENGAGE';

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

  constructor(seed = 1337, ruleset?: IRulesetAdapter, conditionEngine?: ConditionEngine) {
    this.diceEngine = new LocalDiceEngine(seed);
    this.conditionEngine = conditionEngine;
    if (ruleset) {
      this.ruleset = ruleset;
    }
  }

  public getDiceEngine(): LocalDiceEngine {
    return this.diceEngine;
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
    const participant = { ...p };
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
          damageProfile,
          conditionProfile: participant.conditionProfile,
          legacyConditions: participant.conditions,
        });
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
    if (!actor) return { success: false, errorReason: "Actor not found." };
    if (actor.isDead) return { success: false, errorReason: "Dead actors cannot move." };

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
    if (distance > actor.speedCells) {
      return {
        success: false,
        errorReason: `Movement exceeds speed allowance: requested ${distance.toFixed(1)}, allowed ${actor.speedCells}.`,
      };
    }

    const opportunityThreat = !this.actionEconomy.get(actorId)?.disengaging
      ? Array.from(this.participants.values())
          .filter((other) => {
            if (other.id === actorId || other.isDead || other.team === actor.team || other.team === 'neutral') return false;
            if (other.hpCurrent <= 0 || other.conditions.includes('Unconscious')) return false;
            const reach = other.reachCells ?? 1.5;
            const beforeDistance = Math.hypot(actor.x - other.x, actor.y - other.y);
            const afterDistance = Math.hypot(targetX - other.x, targetY - other.y);
            return beforeDistance <= reach && afterDistance > reach;
          })
          .sort((a, b) => a.id.localeCompare(b.id))
          .find((other) => this.actionEconomy.get(other.id)?.reactionAvailable)
      : undefined;

    // Check occupied cells
    for (const other of this.participants.values()) {
      if (other.id !== actorId && !other.isDead && other.x === targetX && other.y === targetY) {
        return { success: false, errorReason: 'Target cell is occupied by another participant.' };
      }
    }

    const movementCost = distance;
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
        provokedOpportunityAttack: Boolean(opportunityThreat),
      },
    });

    if (opportunityThreat) {
      this.executeOpportunityAttack(opportunityThreat.id, actorId);
    }

    return { success: true };
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
      !reaction?.reactionAvailable
    ) {
      return { triggered: false, hit: false, damage: 0, targetDied: target?.isDead ?? false };
    }

    const reactionUse = this.actionEconomy.consumeReaction(attackerId);
    if (!reactionUse.success) {
      return { triggered: false, hit: false, damage: 0, targetDied: target.isDead };
    }

    const targetDodging = !!this.actionEconomy.get(targetId)?.dodging;
    const attackResult = this.ruleset.resolveAttack({
      attackBonus: attacker.attackBonus,
      targetArmorClass: target.armorClass,
      disadvantage: targetDodging,
      diceEngine: this.diceEngine,
    });

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
    const actor = this.participants.get(actorId);
    if (!actor) {
      return { success: false, action, errorReason: 'Actor not found.' };
    }

    const currentActor = this.getCurrentActor();
    if (!currentActor || currentActor.id !== actorId) {
      return {
        success: false,
        action,
        errorReason: "It is not this actor's turn.",
        combatState: this.getTurnResources(actorId),
      };
    }
    if (currentActor.isDead || currentActor.hpCurrent <= 0 || currentActor.conditions.includes('Unconscious')) {
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

  private applyCombatDamage(
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
    const attacker = this.participants.get(attackerId);
    const target = this.participants.get(targetId);
    if (!attacker || !target) throw new Error('Invalid combatants.');

    const currentActor = this.getCurrentActor();
    if (!currentActor || currentActor.id !== attackerId) {
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

    const attackerHasAdvantage =
      attackerConditions.has('invisible');

    const targetDodging = !!this.actionEconomy.get(targetId)?.dodging;
    const targetHasAdvantageAgainst =
      targetConditions.has('blinded') ||
      targetConditions.has('restrained') ||
      targetConditions.has('paralyzed') ||
      targetConditions.has('stunned') ||
      targetConditions.has('unconscious');

    const targetIsProne = targetConditions.has('prone');
    const targetProneAdvantage = targetIsProne && distanceToTarget <= (attacker.reachCells ?? 1.5);
    const targetProneDisadvantage = targetIsProne && distanceToTarget > (attacker.reachCells ?? 1.5);

    const attackRes = this.ruleset.resolveAttack({
      attackBonus: attacker.attackBonus,
      targetArmorClass: target.armorClass,
      advantage: Boolean(
        options?.advantage ||
        attackerHasAdvantage ||
        targetHasAdvantageAgainst ||
        targetProneAdvantage ||
        targetConditions.has('unconscious')
      ),
      disadvantage: Boolean(
        options?.disadvantage ||
        targetDodging ||
        attackerHasDisadvantage ||
        targetProneDisadvantage ||
        targetConditions.has('invisible')
      ),
      diceEngine: this.diceEngine,
    });

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
    if (!currentActor || currentActor.id !== params.actorId) {
      return {
        success: false,
        damage: 0,
        targetDied: target.isDead,
        headline: "It is not this actor's turn.",
        targetHpRemaining: target.hpCurrent,
        interruptedPendingActivation: false,
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
      attackResult = this.ruleset.resolveAttack({
        attackBonus: actor.attackBonus,
        targetArmorClass: target.armorClass,
        diceEngine: this.diceEngine,
      });
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
          const dist = Math.hypot(currentActor.x - hazard.x, currentActor.y - hazard.y);
          if (dist <= hazard.radiusCells) {
            const hazardType =
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
    return Array.from(this.participants.values()).map((p) => ({ ...p }));
  }

  public getParticipant(id: string): BattlefieldParticipant | undefined {
    const p = this.participants.get(id);
    return p ? { ...p } : undefined;
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
  }
}
