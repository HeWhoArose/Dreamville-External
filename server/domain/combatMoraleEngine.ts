import type { CombatMoraleState, CombatMoraleStatus } from '../../src/types';
import type { TacticalCombatEngine } from './combatEngine';

export class CombatMoraleEngine {
  private states = new Map<string, CombatMoraleState>();

  public ensure(actorId: string, initial?: Partial<CombatMoraleState>): CombatMoraleState {
    const existing = this.states.get(actorId);
    if (existing) return { ...existing };
    const maxMorale = Math.max(1, Math.trunc(Number(initial?.maxMorale ?? 100)));
    const morale = Math.max(0, Math.min(maxMorale, Math.trunc(Number(initial?.morale ?? maxMorale))));
    const state: CombatMoraleState = {
      actorId,
      morale,
      maxMorale,
      fleeThreshold: Math.max(0, Math.min(maxMorale, Math.trunc(Number(initial?.fleeThreshold ?? maxMorale * 0.35)))),
      surrenderThreshold: Math.max(0, Math.min(maxMorale, Math.trunc(Number(initial?.surrenderThreshold ?? maxMorale * 0.15)))),
      status: initial?.status || this.statusFor(morale, maxMorale, initial?.fleeThreshold, initial?.surrenderThreshold),
      lastChangeReason: initial?.lastChangeReason,
      revision: Math.max(0, Math.trunc(Number(initial?.revision ?? 0))),
    };
    this.states.set(actorId, state);
    return { ...state };
  }

  public observeDamage(actorId: string, amount: number): CombatMoraleState {
    return this.adjust(actorId, -Math.max(1, Math.min(20, Math.ceil(Math.max(0, amount) / 5))), 'Sustained combat damage.');
  }

  public observeKill(actorId: string): CombatMoraleState {
    return this.adjust(actorId, 12, 'Defeated an enemy.');
  }

  public observeAllyDeath(actorId: string): CombatMoraleState {
    return this.adjust(actorId, -18, 'An allied combatant was defeated.');
  }

  public observeRoundEnd(actorId: string, hpRatio: number): CombatMoraleState {
    const delta = hpRatio >= 0.75 ? 2 : hpRatio <= 0.25 ? -2 : 0;
    return delta === 0 ? this.ensure(actorId) : this.adjust(actorId, delta, 'Round-end morale evaluation.');
  }

  public set(actorId: string, patch: Partial<CombatMoraleState>, reason = 'Manual canonical morale update.'): CombatMoraleState {
    const current = this.ensure(actorId);
    const maxMorale = Math.max(1, Math.trunc(Number(patch.maxMorale ?? current.maxMorale)));
    const nextMorale = Math.max(0, Math.min(maxMorale, Math.trunc(Number(patch.morale ?? current.morale))));
    const state: CombatMoraleState = {
      ...current,
      ...patch,
      actorId,
      maxMorale,
      morale: nextMorale,
      fleeThreshold: Math.max(0, Math.min(maxMorale, Math.trunc(Number(patch.fleeThreshold ?? current.fleeThreshold)))),
      surrenderThreshold: Math.max(0, Math.min(maxMorale, Math.trunc(Number(patch.surrenderThreshold ?? current.surrenderThreshold)))),
      status: patch.status || this.statusFor(nextMorale, maxMorale, patch.fleeThreshold ?? current.fleeThreshold, patch.surrenderThreshold ?? current.surrenderThreshold),
      lastChangeReason: reason,
      revision: current.revision + 1,
    };
    this.states.set(actorId, state);
    return { ...state };
  }

  public get(actorId: string): CombatMoraleState | undefined {
    const state = this.states.get(actorId);
    return state ? { ...state } : undefined;
  }

  public exportState(): CombatMoraleState[] {
    return Array.from(this.states.values()).map((state) => ({ ...state }));
  }

  public importState(states: CombatMoraleState[] = []): void {
    this.states.clear();
    for (const state of states) {
      if (!state?.actorId) continue;
      this.states.set(state.actorId, { ...state });
    }
  }

  private adjust(actorId: string, delta: number, reason: string): CombatMoraleState {
    const current = this.ensure(actorId);
    return this.set(actorId, {
      morale: current.morale + delta,
    }, reason);
  }

  private statusFor(
    morale: number,
    maxMorale: number,
    fleeThreshold?: number,
    surrenderThreshold?: number
  ): CombatMoraleStatus {
    const flee = Number(fleeThreshold ?? maxMorale * 0.35);
    const surrender = Number(surrenderThreshold ?? maxMorale * 0.15);
    if (morale <= surrender) return 'SURRENDERED';
    if (morale <= flee) return 'FLEEING';
    if (morale <= maxMorale * 0.6) return 'SHAKEN';
    return 'STEADFAST';
  }

  public evaluateEncounter(engine: TacticalCombatEngine, actorId: string): CombatMoraleState | undefined {
    const actor = engine.getParticipant(actorId);
    if (!actor) return undefined;
    const state = this.ensure(actorId);
    if (actor.isDead) return state;
    const hpRatio = actor.hpCurrent / Math.max(1, actor.hpMax);
    const aliveEnemies = engine.getParticipants().filter((participant) => participant.team !== actor.team && participant.team !== 'neutral' && !participant.isDead);
    const aliveAllies = engine.getParticipants().filter((participant) => participant.team === actor.team && !participant.isDead);

    let adjustment = 0;
    let reason = 'Encounter morale evaluation.';
    if (aliveEnemies.length === 0) adjustment += 4;
    if (aliveAllies.length <= 1 && actor.team === 'enemies') adjustment -= 5;
    if (hpRatio <= 0.2) adjustment -= 4;
    if (adjustment !== 0) return this.adjust(actorId, adjustment, reason);
    return state;
  }
}

export const combatMoraleEngine = new CombatMoraleEngine();
