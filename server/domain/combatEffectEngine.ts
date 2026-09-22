import type {
  CombatEffectDefinition,
  CombatEffectResult,
} from '../../src/types';
import { resolveCapabilityCheckFormula } from '../../src/data/rulesDice';
import { TacticalCombatEngine } from './combatEngine';

export class CombatEffectEngine {
  public validateDefinition(definition: CombatEffectDefinition, rulesMode: string = 'FULL_DND'): { success: boolean; errorReason?: string; normalized?: CombatEffectDefinition } {
    if (!definition?.id?.trim() || !definition?.name?.trim()) return { success: false, errorReason: 'Combat effect requires id and name.' };
    if (!definition.resolutionMode) return { success: false, errorReason: 'Combat effect requires resolutionMode.' };
    const scale = definition.scale || 'PERSON';
    const normalized: CombatEffectDefinition = {
      ...definition,
      id: definition.id.trim(),
      name: definition.name.trim(),
      scale,
      actionCost: definition.actionCost || 'ACTION',
      targetingMode: definition.targetingMode || 'ONE_TARGET',
      instanceCount: definition.instanceCount == null ? undefined : Math.max(1, Math.min(50, Math.trunc(definition.instanceCount))),
      maxTargets: definition.maxTargets == null ? undefined : Math.max(1, Math.min(100, Math.trunc(definition.maxTargets))),
    };

    if (normalized.resolutionMode === 'MULTI_INSTANCE' && !normalized.instanceCount) {
      return { success: false, errorReason: 'MULTI_INSTANCE effects require instanceCount between 1 and 50.' };
    }
    if (normalized.resolutionMode === 'MULTI_INSTANCE' && normalized.actionCost !== 'ACTION') {
      return { success: false, errorReason: 'MULTI_INSTANCE combat attacks currently require one ACTION as their action cost.' };
    }
    if (normalized.resolutionMode === 'SINGLE_ATTACK' || normalized.resolutionMode === 'MULTI_INSTANCE') {
      normalized.attackFormula = resolveCapabilityCheckFormula(rulesMode as any, normalized.attackFormula);
    }
    if (normalized.damageFormula !== undefined && !/^(?:\d+)d(?:\d+)(?:[+-]\d+)?$/i.test(normalized.damageFormula.replace(/\s+/g, ''))) {
      return { success: false, errorReason: `Invalid damage formula '${normalized.damageFormula}'.` };
    }
    if (normalized.attackFormula !== undefined && !/^(?:\d+)d(?:\d+)(?:[+-]\d+)?$/i.test(normalized.attackFormula.replace(/\s+/g, ''))) {
      return { success: false, errorReason: `Invalid attack formula '${normalized.attackFormula}'.` };
    }
    if ((normalized.resolutionMode === 'OUTCOME' || normalized.resolutionMode === 'WORLD_EFFECT') && !normalized.outcome) {
      return { success: false, errorReason: 'Outcome/world effects require a semantic outcome.' };
    }
    return { success: true, normalized };
  }

  public resolve(engine: TacticalCombatEngine, actorId: string, targetIds: string[], definition: CombatEffectDefinition): CombatEffectResult {
    const profile = engine.getRulesProfile();
    const validation = this.validateDefinition(definition, profile?.mode || 'FULL_DND');
    if (!validation.success || !validation.normalized) return { success: false, errorReason: validation.errorReason };
    const normalized = validation.normalized;
    if (normalized.resolutionMode === 'SINGLE_ATTACK') {
      const targetId = targetIds[0];
      if (!targetId) return { success: false, errorReason: 'SINGLE_ATTACK requires one targetId.' };
      const attack = engine.executeAttack(actorId, targetId, {
        overrideFormula: normalized.damageFormula,
        damageType: normalized.damageType,
        advantage: normalized.advantage,
        disadvantage: normalized.disadvantage,
      });
      return {
        success: attack.success,
        errorReason: attack.errorReason,
        actionConsumed: attack.success,
        effectId: normalized.id,
        effectName: normalized.name,
        instances: attack.success ? [{
          instanceIndex: 0, targetId, hits: attack.hits, isCritical: attack.isCritical, damage: attack.damage, targetDied: attack.targetDied, roll: attack.roll,
        }] : undefined,
        totalDamage: attack.success ? attack.damage : 0,
        defeatedTargetIds: attack.success && attack.targetDied ? [targetId] : [],
        canonicalEventIds: engine.getCombatEffectEvents().filter((event) => event.eventType === 'ATTACK_INSTANCE_RESOLVED' && event.actorId === actorId && event.targetId === targetId).slice(-1).map((event) => event.eventId),
      };
    }
    if (normalized.resolutionMode === 'MULTI_INSTANCE') {
      return engine.executeMultiAttack(actorId, targetIds, {
        definition: normalized,
        instanceCount: normalized.instanceCount,
        damageFormula: normalized.damageFormula,
        attackFormula: normalized.attackFormula,
        damageType: normalized.damageType,
        advantage: normalized.advantage,
        disadvantage: normalized.disadvantage,
        retargetPolicy: normalized.retargetPolicy,
      });
    }
    return { success: false, errorReason: `Resolution mode '${normalized.resolutionMode}' is handled by a specialized resolver.` };
  }
}

export const combatEffectEngine = new CombatEffectEngine();
