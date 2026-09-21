import type { InMemoryWorldRepository } from '../repositories/worldRepository';
import { rulesProfileEngine, REST_RECOVERY_RULES } from './rulesProfileEngine';

export type RestType = 'SHORT_REST' | 'LONG_REST';
export type RestAction = 'BEGIN' | 'ADVANCE' | 'COMPLETE' | 'INTERRUPT' | 'PERFORM';
export type RestStatus = 'ACTIVE' | 'COMPLETED' | 'INTERRUPTED';

export interface RestState {
  actorId: string;
  restType: RestType;
  status: RestStatus;
  startedAtSeconds: number;
  scheduledEndSeconds: number;
  elapsedSeconds: number;
  completedAtSeconds?: number;
  interruptionReason?: string;
}

export interface HitDiceRecoveryState {
  current: number;
  max: number;
  sides: number;
}

export interface RestRecoverySnapshot {
  activeRests: Record<string, RestState>;
  hitDice: Record<string, HitDiceRecoveryState>;
  lastRestResults: Record<string, {
    restType: RestType;
    status: RestStatus;
    completedAtSeconds?: number;
    interruptionReason?: string;
  }>;
}

export interface RestRequest {
  storyId: string;
  actorId: string;
  action: RestAction;
  restType?: RestType;
  seconds?: number;
  hitDiceToSpend?: number;
  interruptionReason?: string;
  interruptAfterSeconds?: number;
}

export interface RestRecoveryResult {
  success: boolean;
  storyId: string;
  actorId: string;
  action: RestAction;
  restType?: RestType;
  restState?: RestState;
  hitDice?: HitDiceRecoveryState;
  recovery?: {
    hpRestored: number;
    spellSlotsRestored: number;
    hitDiceRecovered: number;
    exhaustionReduced: number;
    fatigueRecovered: number;
    stressRecovered: number;
    magicalEnergyRecovered: number;
    physicalStrainRecovered: number;
    concentrationBroken: boolean;
    clearedConditions: string[];
  };
  conditionEvents?: unknown[];
  livingWorldSummary?: unknown;
  worldClock?: unknown;
  errorReason?: string;
}

interface RestPolicy {
  shortRestSeconds: number;
  longRestSeconds: number;
  shortRestRecoveryModel: 'HIT_DICE' | 'NONE';
  longRestHitDiceRecoveryFraction: number;
  longRestExhaustionRecovery: number;
  shortRestFatigueRecovery: number;
  shortRestStressRecovery: number;
  longRestFatigueRecovery: number;
  longRestStressRecovery: number;
  shortRestPhysicalStrainRecoveryFraction: number;
  longRestPhysicalStrainRecoveryFraction: number;
  shortRestMagicalEnergyRecoveryFraction: number;
  longRestMagicalEnergyRecoveryFraction: number;
  longRestRestoreHp: boolean;
  longRestRestoreSpellSlots: boolean;
  longRestBreakConcentration: boolean;
  allowRestWhileTraveling: boolean;
  allowRestInCombat: boolean;
  clearConditionsOnLongRest: boolean;
  conditionIdsToClearOnLongRest: string[];
}

const DEFAULT_POLICY: RestPolicy = {
  shortRestSeconds: 3600,
  longRestSeconds: 28800,
  shortRestRecoveryModel: 'HIT_DICE',
  longRestHitDiceRecoveryFraction: 0.5,
  longRestExhaustionRecovery: 1,
  shortRestFatigueRecovery: 25,
  shortRestStressRecovery: 25,
  longRestFatigueRecovery: 100,
  longRestStressRecovery: 100,
  shortRestPhysicalStrainRecoveryFraction: 0.5,
  longRestPhysicalStrainRecoveryFraction: 1,
  shortRestMagicalEnergyRecoveryFraction: 0,
  longRestMagicalEnergyRecoveryFraction: 1,
  longRestRestoreHp: true,
  longRestRestoreSpellSlots: true,
  longRestBreakConcentration: true,
  allowRestWhileTraveling: false,
  allowRestInCombat: false,
  clearConditionsOnLongRest: false,
  conditionIdsToClearOnLongRest: [],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function diceSides(value: unknown): number {
  if (typeof value !== 'string') return 8;
  const match = value.trim().match(/^(?:\d+)?d(\d+)$/i);
  const sides = Number(match?.[1] ?? 8);
  return Number.isInteger(sides) && sides >= 2 && sides <= 1000 ? sides : 8;
}

export class RestRecoveryEngine {
  private activeRests = new Map<string, RestState>();
  private hitDice = new Map<string, HitDiceRecoveryState>();
  private lastRestResults = new Map<string, RestRecoverySnapshot['lastRestResults'][string]>();

  constructor(private readonly repository: InMemoryWorldRepository, private readonly storyId: string) {}

  public exportState(): RestRecoverySnapshot {
    return {
      activeRests: Object.fromEntries(Array.from(this.activeRests.entries()).map(([k, v]) => [k, clone(v)])),
      hitDice: Object.fromEntries(Array.from(this.hitDice.entries()).map(([k, v]) => [k, clone(v)])),
      lastRestResults: Object.fromEntries(Array.from(this.lastRestResults.entries()).map(([k, v]) => [k, clone(v)])),
    };
  }

  public importState(snapshot?: Partial<RestRecoverySnapshot>): void {
    this.activeRests.clear();
    this.hitDice.clear();
    this.lastRestResults.clear();
    for (const [id, state] of Object.entries(snapshot?.activeRests || {})) {
      if (state?.actorId && state.status === 'ACTIVE') this.activeRests.set(id, clone(state));
    }
    for (const [id, state] of Object.entries(snapshot?.hitDice || {})) {
      if (!state) continue;
      const max = Math.max(1, Math.trunc(state.max));
      this.hitDice.set(id, { current: Math.max(0, Math.min(max, Math.trunc(state.current))), max, sides: Math.max(2, Math.trunc(state.sides || 8)) });
    }
    for (const [id, state] of Object.entries(snapshot?.lastRestResults || {})) {
      if (state?.restType && state?.status) this.lastRestResults.set(id, clone(state));
    }
  }

  public getRestState(actorId: string): RestState | undefined {
    const state = this.activeRests.get(actorId);
    return state ? clone(state) : undefined;
  }

  public getHitDiceState(actorId: string): HitDiceRecoveryState {
    const existing = this.hitDice.get(actorId);
    if (existing) return clone(existing);
    const core = this.getCoreStatsForRead(actorId);
    const max = Math.max(1, Math.trunc(core.level));
    return { current: max, max, sides: diceSides(core.hitDice) };
  }

  public getLastRestResult(actorId: string) {
    const state = this.lastRestResults.get(actorId);
    return state ? clone(state) : undefined;
  }

  public execute(request: RestRequest): RestRecoveryResult {
    const policy = this.resolvePolicy(request.storyId);
    if (!policy.success || !policy.value) return this.fail(request, policy.errorReason || 'Rest rules are unavailable.');
    switch (request.action) {
      case 'BEGIN': return this.begin(request, policy.value);
      case 'ADVANCE': return this.advance(request, policy.value);
      case 'COMPLETE': return this.complete(request, policy.value);
      case 'INTERRUPT': return this.interrupt(request);
      case 'PERFORM': return this.perform(request, policy.value);
      default: return this.fail(request, 'Unknown rest action.');
    }
  }

  private begin(request: RestRequest, policy: RestPolicy): RestRecoveryResult {
    const valid = this.validateStart(request, policy);
    if (!valid.success) return this.fail(request, valid.errorReason || 'Rest cannot begin.');
    const now = this.repository.getWorldClock(request.storyId).getAbsoluteTime();
    const duration = request.restType === 'LONG_REST' ? policy.longRestSeconds : policy.shortRestSeconds;
    const state: RestState = {
      actorId: request.actorId,
      restType: request.restType!,
      status: 'ACTIVE',
      startedAtSeconds: now,
      scheduledEndSeconds: now + duration,
      elapsedSeconds: 0,
    };
    this.activeRests.set(request.actorId, state);
    this.ensureHitDiceState(request.actorId);
    return this.ok(request, { restType: state.restType, restState: clone(state), hitDice: this.getHitDiceState(request.actorId), worldClock: this.repository.getWorldClock(request.storyId).getState() });
  }

  private advance(request: RestRequest, policy: RestPolicy): RestRecoveryResult {
    const active = this.activeRests.get(request.actorId);
    if (!active) return this.fail(request, 'No active rest exists for this actor.');
    const seconds = Number(request.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return this.fail(request, 'Rest advancement requires positive seconds.');
    const remaining = Math.max(0, active.scheduledEndSeconds - this.repository.getWorldClock(request.storyId).getAbsoluteTime());
    if (seconds > remaining) return this.fail(request, 'Rest advancement cannot exceed the remaining scheduled duration.');

    const advanced = this.advanceCanonicalTime(request.storyId, request.actorId, seconds);
    if (!advanced.success) return this.fail(request, advanced.errorReason || 'Time advancement failed.');
    active.elapsedSeconds += seconds;

    const condition = this.repository.getConditionEngine(request.storyId).getActorState(request.actorId);
    if (condition?.dead || condition?.healthCurrent <= 0) {
      const interrupted = this.interrupt({
        ...request,
        action: 'INTERRUPT',
        interruptionReason: 'Rest interrupted because the actor reached 0 HP or died.',
      });
      interrupted.conditionEvents = advanced.conditionEvents;
      interrupted.livingWorldSummary = advanced.livingWorldSummary;
      return interrupted;
    }

    const now = this.repository.getWorldClock(request.storyId).getAbsoluteTime();
    if (now >= active.scheduledEndSeconds) return this.complete(request, policy, advanced);

    return this.ok(request, {
      restType: active.restType,
      restState: { ...clone(active), elapsedSeconds: now - active.startedAtSeconds },
      hitDice: this.getHitDiceState(request.actorId),
      conditionEvents: advanced.conditionEvents,
      livingWorldSummary: advanced.livingWorldSummary,
      worldClock: this.repository.getWorldClock(request.storyId).getState(),
    });
  }

  private complete(
    request: RestRequest,
    policy: RestPolicy,
    prior?: { conditionEvents?: unknown[]; livingWorldSummary?: unknown }
  ): RestRecoveryResult {
    const active = this.activeRests.get(request.actorId);
    if (!active) return this.fail(request, 'No active rest exists for this actor.');
    const now = this.repository.getWorldClock(request.storyId).getAbsoluteTime();
    if (now < active.scheduledEndSeconds) return this.fail(request, 'Rest cannot complete before its scheduled end.');

    const conditionEngine = this.repository.getConditionEngine(request.storyId);
    const before = conditionEngine.getActorState(request.actorId);
    if (!before || before.dead || before.healthCurrent <= 0) return this.fail(request, 'Dead or incapacitated actors cannot complete rest.');

    const core = this.getCoreStats(request.storyId);
    const recovery: NonNullable<RestRecoveryResult['recovery']> = {
      hpRestored: 0, spellSlotsRestored: 0, hitDiceRecovered: 0, exhaustionReduced: 0,
      fatigueRecovered: 0, stressRecovered: 0, magicalEnergyRecovered: 0, physicalStrainRecovered: 0,
      concentrationBroken: false, clearedConditions: [],
    };

    if (active.restType === 'SHORT_REST') {
      const spend = Math.max(0, Math.trunc(Number(request.hitDiceToSpend || 0)));
      const ledger = this.ensureHitDiceState(request.actorId, core.level, core.hitDice);
      if (policy.shortRestRecoveryModel === 'NONE' && spend > 0) return this.fail(request, 'This rules profile does not permit Hit Die recovery during short rests.');
      if (spend > ledger.current) return this.fail(request, 'Requested Hit Die spend exceeds the canonical remaining Hit Dice.');
      if (spend > 0) {
        const conMod = Math.floor((core.constitution - 10) / 2);
        const dice = this.repository.getCombatEngine(request.storyId).getDiceEngine();
        for (let i = 0; i < spend; i++) {
          const current = conditionEngine.getActorState(request.actorId)!;
          const roll = dice.roll('1d' + ledger.sides, conMod);
          const heal = Math.min(current.healthMax - current.healthCurrent, Math.max(1, roll.total));
          if (heal > 0) {
            conditionEngine.setHealth(request.actorId, current.healthCurrent + heal);
            recovery.hpRestored += heal;
          }
          ledger.current -= 1;
        }
      }
      const state = conditionEngine.getActorState(request.actorId)!;
      const nextFatigue = Math.max(0, state.fatigue - policy.shortRestFatigueRecovery);
      const nextStress = Math.max(0, state.stress - policy.shortRestStressRecovery);
      conditionEngine.setFatigueStress(request.actorId, nextFatigue, nextStress);
      recovery.fatigueRecovered = state.fatigue - nextFatigue;
      recovery.stressRecovered = state.stress - nextStress;
      this.applyCapabilityRecovery(request.storyId, request.actorId, policy, false, recovery);
    } else {
      const state = conditionEngine.getActorState(request.actorId)!;
      if (policy.longRestRestoreHp) {
        recovery.hpRestored = Math.max(0, state.healthMax - state.healthCurrent);
        conditionEngine.setHealth(request.actorId, state.healthMax);
      }

      const ledger = this.ensureHitDiceState(request.actorId, core.level, core.hitDice);
      const recovered = Math.min(ledger.max - ledger.current, Math.ceil(ledger.max * clamp01(policy.longRestHitDiceRecoveryFraction)));
      ledger.current += recovered;
      recovery.hitDiceRecovered = recovered;

      const combat = this.repository.getCombatEngine(request.storyId);
      const spells = combat.getSpellRuntime();
      const spellState = spells.getActorState(request.actorId);
      if (spellState) {
        const nextSpellState = clone(spellState);
        if (policy.longRestRestoreSpellSlots) {
          for (const level of Object.keys(nextSpellState.spellSlots)) {
            const slot = nextSpellState.spellSlots[Number(level)];
            if (!slot) continue;
            recovery.spellSlotsRestored += Math.max(0, slot.max - slot.current);
            slot.current = slot.max;
          }
        }
        if (policy.longRestBreakConcentration && nextSpellState.activeConcentration) {
          spells.breakConcentration(request.actorId, 'Long rest completed.');
          recovery.concentrationBroken = true;
        } else {
          spells.setActorState(request.actorId, nextSpellState);
        }
      }

      const after = conditionEngine.getActorState(request.actorId)!;
      const nextFatigue = Math.max(0, after.fatigue - policy.longRestFatigueRecovery);
      const nextStress = Math.max(0, after.stress - policy.longRestStressRecovery);
      conditionEngine.setFatigueStress(request.actorId, nextFatigue, nextStress);
      recovery.fatigueRecovered = after.fatigue - nextFatigue;
      recovery.stressRecovered = after.stress - nextStress;

      const oldExhaustion = conditionEngine.getExhaustionLevel(request.actorId);
      const newExhaustion = conditionEngine.adjustExhaustion(request.actorId, -policy.longRestExhaustionRecovery, now);
      recovery.exhaustionReduced = oldExhaustion - newExhaustion;

      if (policy.clearConditionsOnLongRest) {
        for (const id of policy.conditionIdsToClearOnLongRest) {
          if (conditionEngine.removeCondition(request.actorId, id)) recovery.clearedConditions.push(id);
        }
      }
      this.applyCapabilityRecovery(request.storyId, request.actorId, policy, true, recovery);
    }

    const restEvents = conditionEngine.processRest(request.actorId, active.restType, now).events;
    this.syncCanonicalMirrors(request.storyId, request.actorId);
    const run = this.repository.getStoryRun(request.storyId);
    if (run) {
      const stateAfter = conditionEngine.getActorState(request.actorId);
      if (stateAfter) run.currentHp = stateAfter.healthCurrent;
      this.repository.saveStoryRun(run);
    }

    const completed: RestState = {
      ...active,
      status: 'COMPLETED',
      completedAtSeconds: now,
      elapsedSeconds: now - active.startedAtSeconds,
    };
    this.activeRests.delete(request.actorId);
    this.lastRestResults.set(request.actorId, { restType: completed.restType, status: completed.status, completedAtSeconds: now });

    return this.ok(request, {
      restType: completed.restType,
      restState: clone(completed),
      hitDice: this.getHitDiceState(request.actorId),
      recovery,
      conditionEvents: [...(prior?.conditionEvents || []), ...restEvents],
      livingWorldSummary: prior?.livingWorldSummary,
      worldClock: this.repository.getWorldClock(request.storyId).getState(),
    });
  }

  private interrupt(request: RestRequest): RestRecoveryResult {
    const active = this.activeRests.get(request.actorId);
    if (!active) return this.fail(request, 'No active rest exists for this actor.');
    const now = this.repository.getWorldClock(request.storyId).getAbsoluteTime();
    const reason = String(request.interruptionReason || 'Rest interrupted.').trim() || 'Rest interrupted.';
    const interrupted: RestState = { ...active, status: 'INTERRUPTED', completedAtSeconds: now, interruptionReason: reason };
    this.activeRests.delete(request.actorId);
    this.lastRestResults.set(request.actorId, { restType: interrupted.restType, status: 'INTERRUPTED', completedAtSeconds: now, interruptionReason: reason });
    return this.ok(request, { restType: interrupted.restType, restState: clone(interrupted), hitDice: this.getHitDiceState(request.actorId), worldClock: this.repository.getWorldClock(request.storyId).getState() });
  }

  private perform(request: RestRequest, policy: RestPolicy): RestRecoveryResult {
    if (!request.restType) return this.fail(request, 'PERFORM requires restType.');
    const duration = request.restType === 'LONG_REST' ? policy.longRestSeconds : policy.shortRestSeconds;
    const interrupt = request.interruptAfterSeconds === undefined ? undefined : Number(request.interruptAfterSeconds);
    if (interrupt !== undefined && (!Number.isFinite(interrupt) || interrupt < 0 || interrupt > duration)) return this.fail(request, 'interruptAfterSeconds is outside the requested rest duration.');

    const started = this.begin(request, policy);
    if (!started.success) return started;
    if (interrupt !== undefined && interrupt === 0) {
      return this.interrupt({ ...request, action: 'INTERRUPT', interruptionReason: request.interruptionReason || 'Rest interrupted before time elapsed.' });
    }

    const advanced = this.advance({ ...request, action: 'ADVANCE', seconds: interrupt === undefined ? duration : Math.trunc(interrupt) }, policy);
    if (!advanced.success) return advanced;
    if (interrupt !== undefined) {
      return this.interrupt({ ...request, action: 'INTERRUPT', interruptionReason: request.interruptionReason || 'Rest interrupted by deterministic interruption.' });
    }
    return advanced;
  }

  private validateStart(request: RestRequest, policy: RestPolicy): { success: boolean; errorReason?: string } {
    if (!request.restType) return { success: false, errorReason: 'restType is required.' };
    if (this.activeRests.has(request.actorId)) return { success: false, errorReason: 'Actor already has an active rest.' };
    const state = this.repository.getConditionEngine(request.storyId).getActorState(request.actorId);
    if (!state) return { success: false, errorReason: 'Actor has no canonical condition state.' };
    if (state.dead || state.healthCurrent <= 0 || state.instances.some((c) => c.name.toLowerCase() === 'unconscious')) {
      return { success: false, errorReason: 'Dead, unconscious, or zero-HP actors cannot begin rest.' };
    }
    const player = this.repository.getPlayerLifecycle(request.storyId);
    if (player?.isTraveling && !policy.allowRestWhileTraveling) return { success: false, errorReason: 'Rest cannot begin while traveling under the active rules profile.' };
    const combat = this.repository.getCombatEngine(request.storyId);
    if (combat.getTurnQueue().length > 0 && !policy.allowRestInCombat) return { success: false, errorReason: 'Rest cannot begin while an encounter is active under the active rules profile.' };
    return { success: true };
  }

  private advanceCanonicalTime(storyId: string, actorId: string, seconds: number): {
    success: boolean;
    errorReason?: string;
    conditionEvents?: unknown[];
    livingWorldSummary?: unknown;
  } {
    const clock = this.repository.getWorldClock(storyId);
    const from = clock.getAbsoluteTime();
    const next = clock.advanceSeconds(seconds);
    const conditionEvents = this.repository.getConditionEngine(storyId).advanceElapsedTime(actorId, from, next.timestamp.totalElapsedSeconds);
    const livingWorldSummary = this.repository.getLivingWorldSimulation(storyId).advanceSimulation({
      elapsedSeconds: seconds,
      currentClock: next.timestamp,
      playerLocationId: this.repository.getCurrentLocation(storyId) || 'loc_whispering_orrery',
      geography: this.repository.getGeographyGraph(storyId),
    });
    this.syncCanonicalMirrors(storyId, actorId);
    const run = this.repository.getStoryRun(storyId);
    const condition = this.repository.getConditionEngine(storyId).getActorState(actorId);
    if (run && condition) {
      run.currentHp = condition.healthCurrent;
      this.repository.saveStoryRun(run);
    }
    return { success: true, conditionEvents, livingWorldSummary };
  }

  private applyCapabilityRecovery(
    storyId: string,
    actorId: string,
    policy: RestPolicy,
    longRest: boolean,
    recovery: NonNullable<RestRecoveryResult['recovery']>
  ): void {
    const engine = this.repository.getCapabilityEngine(storyId);
    const power = engine.getPowerState(actorId);
    const condition = this.repository.getConditionEngine(storyId).getActorState(actorId);
    if (!power || !condition) return;

    const next = clone(power);
    const energyBefore = Math.max(0, Number(next.magicalEnergy || 0));
    const maxEnergy = Math.max(energyBefore, Number((next as any).magicalEnergyMax || 0), Number(next.vesselCapacity || 0) * 2);
    const energyFraction = clamp01(longRest ? policy.longRestMagicalEnergyRecoveryFraction : policy.shortRestMagicalEnergyRecoveryFraction);
    const strainFraction = clamp01(longRest ? policy.longRestPhysicalStrainRecoveryFraction : policy.shortRestPhysicalStrainRecoveryFraction);
    next.magicalEnergy = energyBefore + (maxEnergy - energyBefore) * energyFraction;
    next.physicalStrain = Math.max(0, Number(next.physicalStrain || 0) * (1 - strainFraction));
    next.healthCurrent = condition.healthCurrent;
    next.healthMax = condition.healthMax;
    next.fatigue = condition.fatigue;
    next.stress = condition.stress;
    next.activeConditions = condition.instances.map((c) => c.name);
    recovery.magicalEnergyRecovered += next.magicalEnergy - energyBefore;
    recovery.physicalStrainRecovered += Math.max(0, Number(power.physicalStrain || 0) - next.physicalStrain);
    engine.setPowerState(actorId, next);
  }

  private syncCanonicalMirrors(storyId: string, actorId: string): void {
    const condition = this.repository.getConditionEngine(storyId).getActorState(actorId);
    if (!condition) return;

    const capability = this.repository.getCapabilityEngine(storyId);
    const power = capability.getPowerState(actorId);
    if (power) {
      const next = clone(power);
      next.healthCurrent = condition.healthCurrent;
      next.healthMax = condition.healthMax;
      next.fatigue = condition.fatigue;
      next.stress = condition.stress;
      next.activeConditions = condition.instances.map((c) => c.name);
      capability.setPowerState(actorId, next);
    }

    const combat = this.repository.getCombatEngine(storyId);
    const concentration = combat.getSpellRuntime().getActorState(actorId)?.activeConcentration || null;
    for (const participant of combat.getMutableParticipantsForSpellResolution()) {
      if (participant.id !== actorId) continue;
      participant.hpCurrent = condition.healthCurrent;
      participant.hpMax = condition.healthMax;
      participant.isDead = condition.dead;
      participant.damageProfile = clone(condition.damageProfile);
      participant.conditionProfile = clone(condition.conditionProfile);
      participant.conditions = condition.instances.map((c) => c.name);
      participant.activeConcentration = concentration;
    }
  }

  private resolvePolicy(storyId: string): { success: boolean; value?: RestPolicy; errorReason?: string } {
    const profile = this.repository.getRulesProfile(storyId) || rulesProfileEngine.createDefault('FULL_DND');
    if (!rulesProfileEngine.allowsStandardRestRules(profile)) return { success: false, errorReason: 'Rest is disabled by the active rules profile.' };

    const raw = profile.parameterOverrides?.[REST_RECOVERY_RULES];
    if (profile.mode === 'CUSTOM_HOMEBREW_DND' && (!raw || typeof raw !== 'object')) {
      return { success: false, errorReason: 'CUSTOM_HOMEBREW_DND requires an explicit rest_recovery_rules override before rest is available.' };
    }

    const policy = clone(DEFAULT_POLICY);
    if (raw && typeof raw === 'object') {
      const value = raw as Record<string, unknown>;
      for (const key of Object.keys(policy) as Array<keyof RestPolicy>) {
        const incoming = value[key];
        if (incoming === undefined) continue;
        if (typeof policy[key] === 'number' && typeof incoming === 'number') (policy[key] as unknown as number) = incoming;
        else if (typeof policy[key] === 'boolean' && typeof incoming === 'boolean') (policy[key] as unknown as boolean) = incoming;
        else if (key === 'shortRestRecoveryModel' && (incoming === 'HIT_DICE' || incoming === 'NONE')) policy.shortRestRecoveryModel = incoming;
      }
      if (typeof value.conditionIdsToClearOnLongRest === 'string') {
        policy.conditionIdsToClearOnLongRest = value.conditionIdsToClearOnLongRest.split('|').map((v) => v.trim()).filter(Boolean);
      }
    }

    policy.shortRestSeconds = Math.max(1, Math.trunc(policy.shortRestSeconds));
    policy.longRestSeconds = Math.max(1, Math.trunc(policy.longRestSeconds));
    policy.longRestHitDiceRecoveryFraction = clamp01(policy.longRestHitDiceRecoveryFraction);
    policy.longRestExhaustionRecovery = Math.max(0, Math.trunc(policy.longRestExhaustionRecovery));
    policy.shortRestFatigueRecovery = Math.max(0, policy.shortRestFatigueRecovery);
    policy.shortRestStressRecovery = Math.max(0, policy.shortRestStressRecovery);
    policy.longRestFatigueRecovery = Math.max(0, policy.longRestFatigueRecovery);
    policy.longRestStressRecovery = Math.max(0, policy.longRestStressRecovery);
    policy.shortRestPhysicalStrainRecoveryFraction = clamp01(policy.shortRestPhysicalStrainRecoveryFraction);
    policy.longRestPhysicalStrainRecoveryFraction = clamp01(policy.longRestPhysicalStrainRecoveryFraction);
    policy.shortRestMagicalEnergyRecoveryFraction = clamp01(policy.shortRestMagicalEnergyRecoveryFraction);
    policy.longRestMagicalEnergyRecoveryFraction = clamp01(policy.longRestMagicalEnergyRecoveryFraction);
    return { success: true, value: policy };
  }

  private getCoreStats(storyId: string): { level: number; constitution: number; hitDice?: string } {
    const run = this.repository.getStoryRun(storyId);
    const core = run?.characterCoreStats || run?.protagonist?.coreStats || {};
    return {
      level: Math.max(1, Math.min(20, Math.trunc(Number(core.level || 1)))),
      constitution: Number(core.constitution || 10),
      hitDice: core.hitDice,
    };
  }

  private getCoreStatsForRead(_actorId: string): { level: number; hitDice?: string } {
    const run = this.repository.getStoryRun(this.storyId);
    const core = run?.characterCoreStats || run?.protagonist?.coreStats || {};
    return {
      level: Math.max(1, Math.min(20, Math.trunc(Number(core.level || 1)))),
      hitDice: core.hitDice,
    };
  }

  private ensureHitDiceState(actorId: string, level = 1, hitDice?: string): HitDiceRecoveryState {
    const existing = this.hitDice.get(actorId);
    if (existing) return existing;
    const max = Math.max(1, Math.trunc(level));
    const state = { current: max, max, sides: diceSides(hitDice) };
    this.hitDice.set(actorId, state);
    return state;
  }

  private ok(request: RestRequest, data: Partial<RestRecoveryResult>): RestRecoveryResult {
    return { success: true, storyId: request.storyId, actorId: request.actorId, action: request.action, ...data };
  }

  private fail(request: RestRequest, errorReason: string): RestRecoveryResult {
    return { success: false, storyId: request.storyId, actorId: request.actorId, action: request.action, errorReason };
  }
}
