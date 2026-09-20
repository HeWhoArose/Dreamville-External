import { WorldTimestamp } from './types';
import { PendingActivationState } from './capabilityEngine';
import { ConditionEngine } from './conditionEngine';

export interface RollRecord {
  rollId: string;
  rulesetVersion: string;
  formula: string;
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
    const match = formula.trim().match(/^(\d+)d(\d+)$/i);
    const count = match ? parseInt(match[1], 10) : 1;
    const sides = match ? parseInt(match[2], 10) : 20;

    const dice: number[] = [];
    for (let i = 0; i < count; i++) {
      dice.push(this.rollDie(sides));
    }

    const diceSum = dice.reduce((a, b) => a + b, 0);
    const total = diceSum + modifier;

    this.rollCounter++;
    return {
      rollId: `roll_${this.rollCounter}`,
      rulesetVersion: 'SRD-5.2.1',
      formula: `${count}d${sides}${modifier >= 0 ? '+' : ''}${modifier}`,
      individualDice: dice,
      modifier,
      total,
      isCriticalSuccess: sides === 20 && dice.includes(20),
      isCriticalFailure: sides === 20 && dice.includes(1),
      timestamp: Math.floor(Date.now() / 1000),
    };
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
    diceEngine?: LocalDiceEngine;
  }): { roll: RollRecord; succeeds: boolean } {
    const dice = params.diceEngine || LocalDiceEngine;
    const roll = dice.roll('1d20', params.saveModifier);
    return {
      roll,
      succeeds: roll.total >= params.difficultyClass,
    };
  }

  public resolveDamage(
    damageFormula: string,
    isCritical = false,
    diceEngine?: LocalDiceEngine
  ): { roll: RollRecord; totalDamage: number } {
    const dice = diceEngine || LocalDiceEngine;
    let roll = dice.roll(damageFormula, 0);
    let total = roll.total;
    if (isCritical) {
      const extraCritRoll = dice.roll(damageFormula, 0);
      total += extraCritRoll.total;
      roll = {
        ...roll,
        individualDice: [...roll.individualDice, ...extraCritRoll.individualDice],
        total,
      };
    }
    return { roll, totalDamage: Math.max(1, total) };
  }
}

export interface BattlefieldParticipant {
  id: string;
  name: string;
  x: number; // Grid coordinate X
  y: number; // Grid coordinate Y
  initiative: number;
  initiativeModifier?: number; // Permitted participant input (CH8.INITIATIVE)
  saveModifiers?: Record<string, number>; // e.g. { DEX: 2, CON: 3, WIS: 1 } (CH8.DEFENSE)
  resistances?: string[]; // e.g. ['fire', 'poison', 'cold'] (CH8.DEFENSE)
  team: 'player_allies' | 'enemies' | 'neutral';
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
  speedCells: number; // Cells per turn
  attackBonus: number;
  damageFormula: string;
  damageType?: string;
  conditions: string[];
  isDead: boolean;
  damageProfile?: import('../../src/types').CharacterDamageProfile;
  conditionProfile?: import('../../src/types').CharacterConditionProfile;
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
  actionType: 'MOVE' | 'ATTACK' | 'CAST' | 'CONDITION_TICK' | 'START_ACTIVATION' | 'INTERRUPT';
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
    if (this.conditionEngine) {
      const existing = this.conditionEngine.getActorState(participant.id);
      if (!existing) {
        this.conditionEngine.seedActor(participant.id, {
          healthCurrent: participant.hpCurrent,
          healthMax: participant.hpMax,
          damageProfile: participant.damageProfile,
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

    // Filter participants
    const projectedParticipants = Array.from(this.participants.values())
      .filter((p) => isKnown(p))
      .map((p) => ({ ...p }));

    // Canonical current actor projection
    const canonicalCurrentActor = this.getCurrentActor();
    let projectedCurrentActor: BattlefieldParticipant | undefined;
    if (canonicalCurrentActor) {
      if (isKnown(canonicalCurrentActor)) {
        projectedCurrentActor = { ...canonicalCurrentActor };
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

    // DEF-CH8-04: Enforce movement-restricting conditions
    const immobilizingConditions = ['Immobilized', 'Paralyzed', 'Stunned', 'Restrained', 'Petrified', 'Asleep', 'Unconscious'];
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

    // Check occupied cells
    for (const other of this.participants.values()) {
      if (other.id !== actorId && !other.isDead && other.x === targetX && other.y === targetY) {
        return { success: false, errorReason: 'Target cell is occupied by another participant.' };
      }
    }

    actor.x = targetX;
    actor.y = targetY;

    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId,
      actionType: 'MOVE',
      headline: `${actor.name} moved to (${targetX}, ${targetY}).`,
    });

    return { success: true };
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
    hits: boolean;
    damage: number;
    targetDied: boolean;
    roll: RollRecord;
    isCritical: boolean;
  } {
    const attacker = this.participants.get(attackerId);
    const target = this.participants.get(targetId);
    if (!attacker || !target) throw new Error('Invalid combatants.');

    const attackRes = this.ruleset.resolveAttack({
      attackBonus: attacker.attackBonus,
      targetArmorClass: target.armorClass,
      advantage: options?.advantage,
      disadvantage: options?.disadvantage,
      diceEngine: this.diceEngine,
    });

    let damage = 0;
    let targetDied = false;

    if (attackRes.hits) {
      const formula = options?.overrideFormula || attacker.damageFormula;
      const dmgRes = this.ruleset.resolveDamage(formula, attackRes.isCritical, this.diceEngine);
      damage = dmgRes.totalDamage;
      if (this.conditionEngine?.getActorState(targetId)) {
        const resolvedDamage = this.conditionEngine.resolveDamage(
          targetId,
          damage,
          options?.damageType || attacker.damageType || 'slashing'
        );
        damage = resolvedDamage.finalAmount;
        target.hpCurrent = resolvedDamage.healthCurrent;
        target.isDead = resolvedDamage.targetDied;
        const conditionState = this.conditionEngine.getActorState(targetId);
        target.conditions = conditionState?.instances.map((instance) => instance.name) || [];
        if (target.isDead && !target.conditions.includes('Dead')) {
          target.conditions.push('Dead');
        }
      } else {
        target.hpCurrent = Math.max(0, target.hpCurrent - damage);
        if (target.hpCurrent === 0) {
          target.isDead = true;
          targetDied = true;
          if (!target.conditions.includes('Dead')) {
            target.conditions.push('Dead');
          }
        }
      }
      targetDied = target.isDead || target.hpCurrent <= 0;

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
      savingThrowResult = this.ruleset.resolveSavingThrow({
        saveModifier: saveMod,
        difficultyClass: dc,
        diceEngine: this.diceEngine,
      });

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
    if (this.conditionEngine?.getActorState(params.targetId)) {
      const resolvedDamage = this.conditionEngine.resolveDamage(
        params.targetId,
        damage,
        params.damageType || 'force'
      );
      damage = resolvedDamage.finalAmount;
      target.hpCurrent = resolvedDamage.healthCurrent;
      target.isDead = resolvedDamage.targetDied;
      const conditionState = this.conditionEngine.getActorState(params.targetId);
      target.conditions = conditionState?.instances.map((instance) => instance.name) || [];
      if (resolvedDamage.immune) saveStatusText += ` [Immune to ${params.damageType || 'force'}]`;
      else if (resolvedDamage.resisted) saveStatusText += ` [Resisted ${params.damageType || 'force'}]`;
      else if (resolvedDamage.vulnerable) saveStatusText += ` [Vulnerable to ${params.damageType || 'force'}]`;
      targetDied = resolvedDamage.targetDied;
      if (targetDied && !target.conditions.includes('Dead')) {
        target.conditions.push('Dead');
      }
    } else {
      if (params.damageType && target.resistances?.includes(params.damageType)) {
        damage = Math.floor(damage / 2);
        saveStatusText += ` [Resisted ${params.damageType}]`;
      }
      target.hpCurrent = Math.max(0, target.hpCurrent - damage);
      if (target.hpCurrent === 0) {
        target.isDead = true;
        targetDied = true;
        if (!target.conditions.includes('Dead')) {
          target.conditions.push('Dead');
        }
      }
    }

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
            if (this.conditionEngine?.getActorState(currentActor.id)) {
              const resolved = this.conditionEngine.resolveDamage(currentActor.id, damage, hazardType);
              damage = resolved.finalAmount;
              currentActor.hpCurrent = resolved.healthCurrent;
              currentActor.isDead = resolved.targetDied;
              const state = this.conditionEngine.getActorState(currentActor.id);
              currentActor.conditions = state?.instances.map((instance) => instance.name) || [];
            } else {
              currentActor.hpCurrent = Math.max(0, currentActor.hpCurrent - damage);
              currentActor.isDead = currentActor.hpCurrent <= 0;
            }
            if (currentActor.isDead && !currentActor.conditions.includes('Dead')) {
              currentActor.conditions.push('Dead');
            }
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
    if (typeof data.seed === 'number') {
      this.diceEngine.setSeed(data.seed);
    }
    if (typeof data.rollCounter === 'number') {
      this.diceEngine.setRollCounter(data.rollCounter);
    }
  }
}
