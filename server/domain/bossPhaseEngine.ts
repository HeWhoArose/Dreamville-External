import type { CombatEffectDefinition, DynamicHazardZone } from '../../src/types';
import { TacticalCombatEngine } from './combatEngine';
import type { WorldRepository } from '../repositories/worldRepository';
import { combatEnvironmentEngine } from './combatEnvironmentEngine';

export interface BossPhaseDefinition {
  id: string;
  name: string;
  minHpPercent?: number;
  maxHpPercent?: number;
  abilities?: string[];
  targetPriority?: string;
  environmentEffects?: Array<string | DynamicHazardZone>;
  modifiers?: Record<string, number>;
}

export interface BossPhaseState {
  bossId: string;
  currentPhaseId: string;
  enteredAtRound: number;
  transitions: string[];
}

export class BossPhaseEngine {
  public getAuthoredPhases(repository: WorldRepository, storyId: string, bossId: string): BossPhaseDefinition[] {
    const card = repository.getEntityCard(storyId, bossId);
    const combatMetadata =
      card?.metadata &&
      typeof card.metadata.combat === 'object' &&
      card.metadata.combat !== null
        ? card.metadata.combat as Record<string, unknown>
        : undefined;
    const rawPhases = combatMetadata?.bossPhases;
    if (!Array.isArray(rawPhases)) return [];

    return rawPhases
      .filter((phase: any) => phase && typeof phase.id === 'string' && typeof phase.name === 'string')
      .slice(0, 20)
      .map((phase: any) => ({
        id: String(phase.id),
        name: String(phase.name),
        minHpPercent: phase.minHpPercent == null ? undefined : Math.max(0, Math.min(1, Number(phase.minHpPercent))),
        maxHpPercent: phase.maxHpPercent == null ? undefined : Math.max(0, Math.min(1, Number(phase.maxHpPercent))),
        abilities: Array.isArray(phase.abilities) ? phase.abilities.map(String).slice(0, 50) : [],
        targetPriority: typeof phase.targetPriority === 'string' ? phase.targetPriority : undefined,
        environmentEffects: Array.isArray(phase.environmentEffects)
          ? phase.environmentEffects.slice(0, 20).map((effect: any) => {
              if (typeof effect === 'string') return effect;
              if (!effect || typeof effect !== 'object') return null;
              return {
                id: String(effect.id || 'boss_hazard'),
                type: effect.type,
                x: Number(effect.x || 0),
                y: Number(effect.y || 0),
                radiusCells: Math.max(0, Number(effect.radiusCells || 0)),
                durationTurns: Math.max(1, Math.trunc(Number(effect.durationTurns || 1))),
                damagePerTurn: Math.max(0, Number(effect.damagePerTurn || 0)),
              } as DynamicHazardZone;
            }).filter(Boolean)
          : [],
        modifiers:
          phase.modifiers && typeof phase.modifiers === 'object'
            ? Object.fromEntries(
                Object.entries(phase.modifiers).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
              )
            : {},
      }));
  }

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
    phases?: BossPhaseDefinition[];
  }): { success: boolean; changed: boolean; state?: BossPhaseState; phase?: BossPhaseDefinition; errorReason?: string } {
    const combat = params.repository.getCombatEngine(params.storyId);
    const boss = combat.getParticipant(params.bossId);
    if (!boss) return { success: false, changed: false, errorReason: 'Boss participant not found.' };

    const authoredPhases = params.phases?.length
      ? params.phases
      : this.getAuthoredPhases(params.repository, params.storyId, params.bossId);
    if (!authoredPhases.length) {
      return {
        success: false,
        changed: false,
        errorReason: 'No canonical boss phase definitions are registered for this entity.',
      };
    }

    const phase = this.resolvePhase(authoredPhases, boss.hpCurrent, boss.hpMax);
    if (!phase) return { success: false, changed: false, errorReason: 'No boss phase matches current HP state.' };
    const current = params.repository.getActiveEffects(params.storyId).find((effect: any) => effect.type === 'BOSS_PHASE_STATE' && effect.bossId === params.bossId);
    const currentPhaseId = current?.currentPhaseId;
    if (currentPhaseId === phase.id) {
      const sync = combat.setBossPhaseState(params.bossId, {
        phaseId: phase.id,
        modifiers: phase.modifiers,
        abilities: phase.abilities,
        targetPriority: phase.targetPriority,
        environmentEffects: resolvedHazards.map((effect) => effect.id),
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
    const bossCard = params.repository.getEntityCard(params.storyId, params.bossId);
    const combatMetadata =
      bossCard?.metadata &&
      typeof bossCard.metadata.combat === 'object' &&
      bossCard.metadata.combat !== null
        ? bossCard.metadata.combat as Record<string, unknown>
        : undefined;
    const hazardCatalog =
      combatMetadata?.environmentEffects &&
      typeof combatMetadata.environmentEffects === 'object'
        ? combatMetadata.environmentEffects as Record<string, unknown>
        : {};

    const resolvedHazards: DynamicHazardZone[] = [];
    for (const effect of phase.environmentEffects || []) {
      let hazard: DynamicHazardZone | undefined;
      if (typeof effect === 'string') {
        const raw = hazardCatalog[effect];
        if (!raw || typeof raw !== 'object') {
          return {
            success: false,
            changed: false,
            errorReason: `Boss phase environment effect '${effect}' is not registered in the entity's canonical combat environment catalog.`,
          };
        }
        const candidate = raw as Record<string, unknown>;
        hazard = {
          id: String(candidate.id || effect),
          type: String(candidate.type || 'custom'),
          x: Number(candidate.x || 0),
          y: Number(candidate.y || 0),
          radiusCells: Math.max(0, Number(candidate.radiusCells || 0)),
          durationTurns: Math.max(1, Math.trunc(Number(candidate.durationTurns || 1))),
          damagePerTurn: Math.max(0, Number(candidate.damagePerTurn || 0)),
        } as DynamicHazardZone;
      } else {
        hazard = effect;
      }

      if (hazard) {
        resolvedHazards.push(hazard);
        const hazardResult = combatEnvironmentEngine.createHazard({
          repository: params.repository,
          storyId: params.storyId,
          actorId: params.bossId,
          hazard,
        });
        if (!hazardResult.success) {
          return { success: false, changed: false, errorReason: hazardResult.errorReason };
        }
      }
    }

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
      environmentEffects: (phase.environmentEffects || []).map((effect) => typeof effect === 'string' ? effect : effect.id),
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
