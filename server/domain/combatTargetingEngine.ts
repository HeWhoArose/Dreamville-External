import type { CombatEffectDefinition, CombatTargetingMode } from '../../src/types';
import { TacticalCombatEngine } from './combatEngine';

export class CombatTargetingEngine {
  public resolve(
    engine: TacticalCombatEngine,
    actorId: string,
    requestedTargetIds: string[],
    definition: CombatEffectDefinition
  ): { success: boolean; errorReason?: string; targetIds: string[]; origin?: { x: number; y: number } } {
    const actor = engine.getParticipant(actorId);
    if (!actor) return { success: false, errorReason: 'Actor not found.', targetIds: [] };

    const participants = engine.getParticipants().filter((participant) => !participant.isDead && participant.hpCurrent > 0);
    const requested = Array.from(new Set((requestedTargetIds || []).filter(Boolean)));
    const mode: CombatTargetingMode = definition.targetingMode || 'ONE_TARGET';
    const selected = participants.filter((participant) => requested.includes(participant.id));

    if (mode === 'SELF') return { success: true, targetIds: [actorId], origin: { x: actor.x, y: actor.y } };
    if (!requested.length && mode !== 'ALL_IN_AREA' && mode !== 'RANDOM_LEGAL_TARGET') {
      return { success: false, errorReason: 'At least one target is required.', targetIds: [] };
    }

    const allowedByMode = (participant: typeof actor) => {
      if (participant.id === actorId) return false;
      if (mode === 'ALLY') return participant.team === actor.team;
      if (mode === 'ENEMY' || mode === 'ONE_TARGET' || mode === 'MULTI_TARGET' || mode === 'PER_INSTANCE' || mode === 'CHAIN' || mode === 'ALL_IN_AREA' || mode === 'RANDOM_LEGAL_TARGET') {
        return participant.team !== actor.team && participant.team !== 'neutral';
      }
      return true;
    };

    let targetIds = selected.filter(allowedByMode).map((participant) => participant.id);
    let origin: { x: number; y: number } | undefined;

    if (mode === 'RANDOM_LEGAL_TARGET') {
      const legal = participants.filter(allowedByMode).sort((a, b) => a.id.localeCompare(b.id));
      if (!legal.length) return { success: false, errorReason: 'No legal target exists for RANDOM_LEGAL_TARGET.', targetIds: [] };
      const basis = `${actorId}:${definition.id}:${engine.getCurrentRound()}`;
      let hash = 0;
      for (let i = 0; i < basis.length; i += 1) hash = (hash * 31 + basis.charCodeAt(i)) >>> 0;
      targetIds = [legal[hash % legal.length].id];
    }

    if (mode === 'ALL_IN_AREA') {
      const center = selected[0] || participants.find((participant) => participant.id !== actorId);
      if (!center) return { success: false, errorReason: 'No valid area origin exists.', targetIds: [] };
      origin = { x: center.x, y: center.y };

      const radius = Math.max(0, Number(definition.areaRadiusCells ?? 1));
      const innerRadius = Math.max(0, Math.min(radius, Number(definition.areaInnerRadiusCells ?? 0)));
      const width = Math.max(0.5, Number(definition.areaWidthCells ?? 1));
      const areaShape = definition.areaShape || 'CIRCLE';
      const directionX = center.x - actor.x;
      const directionY = center.y - actor.y;
      const directionLength = Math.hypot(directionX, directionY) || 1;
      const ux = directionX / directionLength;
      const uy = directionY / directionLength;

      const inArea = (participant: typeof actor) => {
        const dx = participant.x - center.x;
        const dy = participant.y - center.y;
        const radialDistance = Math.hypot(dx, dy);

        if (areaShape === 'POINT') return radialDistance <= Math.max(0.5, width / 2);
        if (areaShape === 'RING') return radialDistance <= radius && radialDistance >= innerRadius;
        if (areaShape === 'CIRCLE' || areaShape === 'SPHERE') return radialDistance <= radius;

        const fromOriginX = participant.x - actor.x;
        const fromOriginY = participant.y - actor.y;
        const projection = fromOriginX * ux + fromOriginY * uy;
        const perpendicular = Math.abs(fromOriginX * uy - fromOriginY * ux);

        if (areaShape === 'LINE' || areaShape === 'WALL') {
          return projection >= 0 && projection <= radius && perpendicular <= width / 2;
        }

        if (areaShape === 'CONE') {
          if (projection < 0 || projection > radius) return false;
          const distance = Math.hypot(fromOriginX, fromOriginY);
          if (distance <= 0.001) return true;
          // 90-degree cone: half-angle 45 degrees.
          return projection / distance >= Math.SQRT1_2;
        }

        return radialDistance <= radius;
      };

      targetIds = participants.filter(allowedByMode).filter(inArea).map((participant) => participant.id);
    }

    if (mode === 'ONE_TARGET') targetIds = targetIds.slice(0, 1);
    if (mode === 'PER_INSTANCE' && definition.instanceCount) targetIds = targetIds.slice(0, Math.max(1, definition.instanceCount));
    if (definition.maxTargets !== undefined) {
      targetIds = targetIds.slice(0, Math.max(1, Math.min(100, Math.trunc(definition.maxTargets))));
    }

    if (!targetIds.length) {
      return { success: false, errorReason: 'No legal targets satisfy the requested targeting mode.', targetIds: [] };
    }

    if (definition.rangeCells !== undefined) {
      const range = Math.max(0, Number(definition.rangeCells));
      const rangeOrigin = origin || { x: actor.x, y: actor.y };
      const distance = Math.hypot(rangeOrigin.x - actor.x, rangeOrigin.y - actor.y);
      if (distance > range) {
        return { success: false, errorReason: 'Effect origin is outside the actor range.', targetIds: [] };
      }
      if (!origin) {
        const outOfRange = targetIds.some((targetId) => {
          const target = participants.find((participant) => participant.id === targetId);
          return target ? Math.hypot(target.x - actor.x, target.y - actor.y) > range : true;
        });
        if (outOfRange) return { success: false, errorReason: 'At least one target is outside the effect range.', targetIds: [] };
      }
    }

    return { success: true, targetIds, origin };
  }
}

export const combatTargetingEngine = new CombatTargetingEngine();
