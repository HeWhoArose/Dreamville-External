import type { CombatEffectDefinition, CombatTargetingMode } from '../../src/types';
import { TacticalCombatEngine } from './combatEngine';

export class CombatTargetingEngine {
  public resolve(engine: TacticalCombatEngine, actorId: string, requestedTargetIds: string[], definition: CombatEffectDefinition): { success: boolean; errorReason?: string; targetIds: string[]; origin?: { x: number; y: number } } {
    const actor = engine.getParticipant(actorId);
    if (!actor) return { success: false, errorReason: 'Actor not found.', targetIds: [] };
    const participants = engine.getParticipants().filter((participant) => !participant.isDead && participant.hpCurrent > 0);
    const requested = Array.from(new Set(requestedTargetIds.filter(Boolean)));
    const mode: CombatTargetingMode = definition.targetingMode || 'ONE_TARGET';
    if (mode === 'SELF') return { success: true, targetIds: [actorId], origin: { x: actor.x, y: actor.y } };
    if (!requested.length && mode !== 'ALL_IN_AREA') return { success: false, errorReason: 'At least one target is required.', targetIds: [] };

    const selected = participants.filter((participant) => requested.includes(participant.id));
    const allowedByMode = (participant: typeof actor) => {
      if (mode === 'ALLY') return participant.team === actor.team;
      if (mode === 'ENEMY' || mode === 'ONE_TARGET' || mode === 'MULTI_TARGET' || mode === 'PER_INSTANCE' || mode === 'CHAIN' || mode === 'ALL_IN_AREA') return participant.team !== actor.team;
      return true;
    };

    let targetIds = selected.filter(allowedByMode).map((participant) => participant.id);
    let origin: { x: number; y: number } | undefined;
    if (mode === 'ALL_IN_AREA') {
      const center = selected[0] || participants.find((participant) => participant.id !== actorId);
      if (!center) return { success: false, errorReason: 'No valid area origin exists.', targetIds: [] };
      origin = { x: center.x, y: center.y };
      const radius = Math.max(0, Number(definition.areaRadiusCells ?? 1));
      targetIds = participants
        .filter(allowedByMode)
        .filter((participant) => Math.hypot(participant.x - center.x, participant.y - center.y) <= radius)
        .map((participant) => participant.id);
    }

    if (mode === 'ONE_TARGET') targetIds = targetIds.slice(0, 1);
    if (mode === 'PER_INSTANCE') {
      const expectedInstances = definition.instanceCount ?? 0;
      if (expectedInstances < 1) return { success: false, errorReason: 'PER_INSTANCE targeting requires instanceCount.', targetIds: [] };
      if (targetIds.length !== expectedInstances) return { success: false, errorReason: `PER_INSTANCE targeting requires exactly ${expectedInstances} targetIds.`, targetIds: [] };
    }
    if (definition.maxTargets !== undefined) targetIds = targetIds.slice(0, Math.max(1, Math.min(100, Math.trunc(definition.maxTargets))));
    if (!targetIds.length) return { success: false, errorReason: 'No legal targets satisfy the requested targeting mode.', targetIds: [] };

    if (definition.rangeCells !== undefined) {
      const range = Math.max(0, Number(definition.rangeCells));
      const outOfRange = targetIds.some((targetId) => {
        const target = participants.find((participant) => participant.id === targetId);
        return target ? Math.hypot(target.x - actor.x, target.y - actor.y) > range : true;
      });
      if (outOfRange) return { success: false, errorReason: 'At least one target is outside the effect range.', targetIds: [] };
    }

    return { success: true, targetIds, origin };
  }
}

export const combatTargetingEngine = new CombatTargetingEngine();
