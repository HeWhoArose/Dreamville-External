import { WorldTimestamp } from './types';

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
  resolveAttack(params: {
    attackBonus: number;
    targetArmorClass: number;
    advantage?: boolean;
    disadvantage?: boolean;
  }): { roll: RollRecord; hits: boolean; isCritical: boolean };
  resolveSavingThrow(params: {
    saveModifier: number;
    difficultyClass: number;
  }): { roll: RollRecord; succeeds: boolean };
  resolveDamage(damageFormula: string, isCritical?: boolean): { roll: RollRecord; totalDamage: number };
}

/**
 * LocalDiceEngine
 * Deterministic local dice resolution. AI never invents numbers.
 */
export class LocalDiceEngine {
  private static seed = 1337;

  public static setSeed(newSeed: number): void {
    this.seed = newSeed;
  }

  private static pseudoRandom(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  public static rollDie(sides: number): number {
    return Math.floor(this.pseudoRandom() * sides) + 1;
  }

  public static roll(formula: string, modifier = 0): RollRecord {
    // Formula e.g. "1d20", "2d6"
    const match = formula.trim().match(/^(\d+)d(\d+)$/i);
    const count = match ? parseInt(match[1], 10) : 1;
    const sides = match ? parseInt(match[2], 10) : 20;

    const dice: number[] = [];
    for (let i = 0; i < count; i++) {
      dice.push(this.rollDie(sides));
    }

    const diceSum = dice.reduce((a, b) => a + b, 0);
    const total = diceSum + modifier;

    return {
      rollId: `roll_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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

  public resolveAttack(params: {
    attackBonus: number;
    targetArmorClass: number;
    advantage?: boolean;
    disadvantage?: boolean;
  }): { roll: RollRecord; hits: boolean; isCritical: boolean } {
    const roll1 = LocalDiceEngine.roll('1d20', params.attackBonus);
    let chosenRoll = roll1;

    if (params.advantage && !params.disadvantage) {
      const roll2 = LocalDiceEngine.roll('1d20', params.attackBonus);
      chosenRoll = roll2.total > roll1.total ? roll2 : roll1;
    } else if (params.disadvantage && !params.advantage) {
      const roll2 = LocalDiceEngine.roll('1d20', params.attackBonus);
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
  }): { roll: RollRecord; succeeds: boolean } {
    const roll = LocalDiceEngine.roll('1d20', params.saveModifier);
    return {
      roll,
      succeeds: roll.total >= params.difficultyClass,
    };
  }

  public resolveDamage(damageFormula: string, isCritical = false): { roll: RollRecord; totalDamage: number } {
    let roll = LocalDiceEngine.roll(damageFormula, 0);
    let total = roll.total;
    if (isCritical) {
      const extraCritRoll = LocalDiceEngine.roll(damageFormula, 0);
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
  team: 'player_allies' | 'enemies' | 'neutral';
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
  speedCells: number; // Cells per turn
  attackBonus: number;
  damageFormula: string;
  conditions: string[];
  isDead: boolean;
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
  actionType: 'MOVE' | 'ATTACK' | 'CAST' | 'CONDITION_TICK';
  headline: string;
  damageInflicted?: number;
  rollRecord?: RollRecord;
  metadata?: Record<string, unknown>;
}

export interface TacticalCombatStateExport {
  participants: BattlefieldParticipant[];
  hazards: DynamicHazardZone[];
  turnQueue: string[];
  currentTurnIndex: number;
  currentRound: number;
  eventLog: BattleEvent[];
}

/**
 * TacticalCombatEngine
 * Authority for grid movements, initiative order, attack resolution, and dynamic battlefield zones (V10.8.4A).
 */
export class TacticalCombatEngine {
  private participants: Map<string, BattlefieldParticipant> = new Map();
  private hazards: DynamicHazardZone[] = [];
  private ruleset: IRulesetAdapter = new Dnd521RulesetAdapter();
  private turnQueue: string[] = [];
  private currentTurnIndex = 0;
  private currentRound = 1;
  private eventLog: BattleEvent[] = [];

  public clear(): void {
    this.participants.clear();
    this.hazards = [];
    this.turnQueue = [];
    this.currentTurnIndex = 0;
    this.currentRound = 1;
    this.eventLog = [];
  }

  public addParticipant(p: BattlefieldParticipant): void {
    this.participants.set(p.id, { ...p });
    if (!this.turnQueue.includes(p.id)) {
      this.turnQueue.push(p.id);
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
      const roll = LocalDiceEngine.roll('1d20', 2);
      p.initiative = roll.total;
    }
    this.turnQueue = Array.from(this.participants.values())
      .sort((a, b) => b.initiative - a.initiative)
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

  public moveActor(actorId: string, targetX: number, targetY: number): {
    success: boolean;
    errorReason?: string;
  } {
    const actor = this.participants.get(actorId);
    if (!actor) return { success: false, errorReason: 'Actor not found.' };
    if (actor.isDead) return { success: false, errorReason: 'Dead actors cannot move.' };

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
    });

    let damage = 0;
    let targetDied = false;

    if (attackRes.hits) {
      const formula = options?.overrideFormula || attacker.damageFormula;
      const dmgRes = this.ruleset.resolveDamage(formula, attackRes.isCritical);
      damage = dmgRes.totalDamage;
      target.hpCurrent = Math.max(0, target.hpCurrent - damage);
      if (target.hpCurrent === 0) {
        target.isDead = true;
        targetDied = true;
        if (!target.conditions.includes('Dead')) {
          target.conditions.push('Dead');
        }
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
    powerTier: string;
    category: string;
    baseDamage?: number;
  }): {
    success: boolean;
    damage: number;
    targetDied: boolean;
    headline: string;
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

    target.hpCurrent = Math.max(0, target.hpCurrent - damage);
    let targetDied = false;
    if (target.hpCurrent === 0) {
      target.isDead = true;
      targetDied = true;
      if (!target.conditions.includes('Dead')) {
        target.conditions.push('Dead');
      }
    }

    const headline = `${actor.name} unleashed ${params.capabilityName} on ${target.name} for ${damage} damage!${
      targetDied ? ` ${target.name} was vanquished!` : ''
    }`;

    this.eventLog.push({
      turnNumber: this.currentRound,
      actorId: params.actorId,
      targetId: params.targetId,
      actionType: 'CAST',
      headline,
      damageInflicted: damage,
      metadata: {
        capabilityName: params.capabilityName,
        powerTier: params.powerTier,
        category: params.category,
      },
    });

    return {
      success: true,
      damage,
      targetDied,
      headline,
    };
  }

  public advanceTurn(): {
    currentActor: BattlefieldParticipant | undefined;
    currentRound: number;
    currentTurnIndex: number;
    hazardEvents: BattleEvent[];
  } {
    if (this.turnQueue.length === 0) {
      return {
        currentActor: undefined,
        currentRound: this.currentRound,
        currentTurnIndex: this.currentTurnIndex,
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

    // Process hazard zone ticking for actors
    const hazardEvents: BattleEvent[] = [];
    const currentActor = this.getCurrentActor();
    if (currentActor && !currentActor.isDead) {
      for (const hazard of this.hazards) {
        const dist = Math.hypot(currentActor.x - hazard.x, currentActor.y - hazard.y);
        if (dist <= hazard.radiusCells) {
          currentActor.hpCurrent = Math.max(0, currentActor.hpCurrent - hazard.damagePerTurn);
          if (currentActor.hpCurrent === 0) {
            currentActor.isDead = true;
            if (!currentActor.conditions.includes('Dead')) {
              currentActor.conditions.push('Dead');
            }
          }
          const event: BattleEvent = {
            turnNumber: this.currentRound,
            actorId: currentActor.id,
            actionType: 'CONDITION_TICK',
            headline: `${currentActor.name} took ${hazard.damagePerTurn} damage from ${hazard.type}.`,
            damageInflicted: hazard.damagePerTurn,
          };
          this.eventLog.push(event);
          hazardEvents.push(event);
        }
      }
    }

    return {
      currentActor: this.getCurrentActor(),
      currentRound: this.currentRound,
      currentTurnIndex: this.currentTurnIndex,
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
      turnQueue: this.getTurnQueue(),
      currentTurnIndex: this.currentTurnIndex,
      currentRound: this.currentRound,
      eventLog: this.getBattleEvents(),
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
  }
}
