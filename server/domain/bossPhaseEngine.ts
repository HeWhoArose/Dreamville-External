import type { CombatEffectDefinition } from '../../src/types';
import { TacticalCombatEngine } from './combatEngine';
import type { WorldRepository } from '../repositories/worldRepository';

export interface BossPhaseDefinition {
  id: string;
  name: string;
  minHpPercent?: number;
  maxHpPercent?: number;
  abilities?: string[];
  targetPriority?: string;
  environmentEffects?: string[];
  modifiers?: Record<string, number>;
}

export interface BossPhaseState {
  bossId: string;
  currentPhaseId: string;
  enteredAtRound: number;
  transitions: string[];
}

export class BossPhaseEngine {
  public resolvePhase(phases: BossPhaseDefinition[], hpCurrent: number, hpMax: number): BossPhaseDefinition | undefined {
    const percent = hpMax > 0 ? hpCurrent / hpMax : 0;
    return [...phases]
      .sort((a, b) => (b.minHpPercent ?? 0) - (a.minHpPercent ?? 0) || a.id.localeCompare(b.id))
      .find((phase) => percent <= (phase.maxHpPercent ?? 1) && percent >= (phase.minHpPercent ?? 0));
  }

  public evaluateAndPersist(params: {
    repository: WorldRepository;
    storyId: string;
    bossId: string;
    phases: BossPhaseDefinition[];
  }): { success: boolean; changed: boolean; state?: BossPhaseState; phase?: BossPhaseDefinition; errorReason?: string } {
    const combat = params.repository.getCombatEngine(params.storyId);
    const boss = combat.getParticipant(params.bossId);
    if (!boss) return { success: false, changed: false, errorReason: 'Boss participant not found.' };
    const phase = this.resolvePhase(params.phases, boss.hpCurrent, boss.hpMax);
    if (!phase) return { success: false, changed: false, errorReason: 'No boss phase matches current HP state.' };
    const current = params.repository.getActiveEffects(params.storyId).find((effect: any) => effect.type === 'BOSS_PHASE_STATE' && effect.bossId === params.bossId);
    const currentPhaseId = current?.currentPhaseId;
    if (currentPhaseId === phase.id) {
      const sync = combat.setBossPhaseState(params.bossId, {
        phaseId: phase.id,
        modifiers: phase.modifiers,
        abilities: phase.abilities,
        targetPriority: phase.targetPriority,
        environmentEffects: phase.environmentEffects,
      });
      if (!sync.success) return { success: false, changed: false, errorReason: sync.errorReason };
      return { success: true, changed: false, phase, state: current?.state };
    }
    const round = combat.getCurrentRound();
    const state: BossPhaseState = {
      bossId: params.bossId,
      currentPhaseId: phase.id,
      enteredAtRound: round,
      transitions: [...(current?.state?.transitions || []), `${currentPhaseId || 'INITIAL'}->${phase.id}`],
    };
    const combatPhase = combat.setBossPhaseState(params.bossId, {
      phaseId: phase.id,
      modifiers: phase.modifiers,
      abilities: phase.abilities,
      targetPriority: phase.targetPriority,
      environmentEffects: phase.environmentEffects,
    });
    if (!combatPhase.success) return { success: false, changed: false, errorReason: combatPhase.errorReason };

    params.repository.saveActiveEffect({
      id: `boss_phase_${params.storyId}_${params.bossId}` ,
      type: 'BOSS_PHASE_STATE',
      storyId: params.storyId,
      bossId: params.bossId,
      currentPhaseId: phase.id,
      state,
      abilities: [...(phase.abilities || [])],
      environmentEffects: [...(phase.environmentEffects || [])],
      canonical: true,
    });
    params.repository.saveWorldFact(params.storyId, {
      id: `boss_phase_event_${params.storyId}_${params.bossId}_${round}_${state.transitions.length}` ,
      category: 'BOSS_PHASE',
      type: 'BOSS_PHASE_CHANGED',
      bossId: params.bossId,
      previousPhaseId: currentPhaseId || null,
      currentPhaseId: phase.id,
      round,
      canonical: true,
    });
    return { success: true, changed: true, phase, state };
  }

  public buildPhaseEffect(phase: BossPhaseDefinition): CombatEffectDefinition[] {
    return (phase.abilities || []).map((abilityId) => ({
      id: abilityId,
      name: abilityId,
      resolutionMode: 'SINGLE_ATTACK',
      scale: 'PERSON',
      actionCost: 'ACTION',
    }));
  }
}

export const bossPhaseEngine = new BossPhaseEngine();
