import type { DynamicHazardZone } from '../../src/types';
import type { WorldRepository } from '../repositories/worldRepository';

export class CombatEnvironmentEngine {
  public createHazard(params: { repository: WorldRepository; storyId: string; actorId: string; hazard: DynamicHazardZone }): { success: boolean; hazard?: DynamicHazardZone; errorReason?: string } {
    if (!params.hazard?.id || params.hazard.radiusCells < 0 || params.hazard.durationTurns <= 0) return { success: false, errorReason: 'Hazard definition is invalid.' };
    const combat = params.repository.getCombatEngine(params.storyId);
    combat.replaceHazard({ ...params.hazard });
    params.repository.saveWorldFact(params.storyId, { id: `hazard_${params.storyId}_${params.hazard.id}_${params.hazard.durationTurns}`, category: 'COMBAT_ENVIRONMENT', type: 'HAZARD_CREATED', actorId: params.actorId, hazard: { ...params.hazard }, canonical: true });
    return { success: true, hazard: { ...params.hazard } };
  }

  public removeHazard(params: { repository: WorldRepository; storyId: string; actorId: string; hazardId: string }): { success: boolean; removed: boolean } {
    const combat = params.repository.getCombatEngine(params.storyId);
    const result = combat.removeHazard(params.hazardId);
    if (result.removed) params.repository.saveWorldFact(params.storyId, { id: `hazard_remove_${params.storyId}_${params.hazardId}_${Date.now()}`, category: 'COMBAT_ENVIRONMENT', type: 'HAZARD_REMOVED', actorId: params.actorId, hazardId: params.hazardId, canonical: true });
    return result;
  }
}

export const combatEnvironmentEngine = new CombatEnvironmentEngine();
