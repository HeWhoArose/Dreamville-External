import type {
  CombatEffectDefinition,
  CombatEffectResult,
} from '../../src/types';
import { resolveCapabilityCheckFormula } from '../../src/data/rulesDice';
import { TacticalCombatEngine } from './combatEngine';
import { combatTargetingEngine } from './combatTargetingEngine';

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
    if (normalized.resolutionMode === 'SINGLE_ATTACK' || normalized.resolutionMode === 'MULTI_INSTANCE' || normalized.resolutionMode === 'CHAIN') {
      normalized.attackFormula = resolveCapabilityCheckFormula(rulesMode as any, normalized.attackFormula);
    }
    if (normalized.resolutionMode === 'SAVE' || normalized.resolutionMode === 'AREA') {
      normalized.saveFormula = resolveCapabilityCheckFormula(rulesMode as any, normalized.saveFormula);
    }
    if (normalized.damageFormula !== undefined && !/^(?:\d+)d(?:\d+)(?:[+-]\d+)?$/i.test(normalized.damageFormula.replace(/\s+/g, ''))) {
      return { success: false, errorReason: `Invalid damage formula '${normalized.damageFormula}'.` };
    }
    if (normalized.attackFormula !== undefined && !/^(?:\d+)d(?:\d+)(?:[+-]\d+)?$/i.test(normalized.attackFormula.replace(/\s+/g, ''))) {
      return { success: false, errorReason: `Invalid attack formula '${normalized.attackFormula}'.` };
    }
    if (normalized.saveFormula !== undefined && !/^(?:\d+)d(?:\d+)(?:[+-]\d+)?$/i.test(normalized.saveFormula.replace(/\s+/g, ''))) {
      return { success: false, errorReason: `Invalid save formula '${normalized.saveFormula}'.` };
    }
    if ((normalized.resolutionMode === 'OUTCOME' || normalized.resolutionMode === 'WORLD_EFFECT') && !normalized.outcome) {
      return { success: false, errorReason: 'Outcome/world effects require a semantic outcome.' };
    }
    return { success: true, normalized };
  }

  public resolve(engine: TacticalCombatEngine, actorId: string, targetIds: string[], definition: CombatEffectDefinition, options: { consumeAction?: boolean } = {}): CombatEffectResult {
    const profile = engine.getRulesProfile();
    const validation = this.validateDefinition(definition, profile?.mode || 'FULL_DND');
    if (!validation.success || !validation.normalized) return { success: false, errorReason: validation.errorReason };
    const normalized = validation.normalized;
    const targeting = combatTargetingEngine.resolve(engine, actorId, targetIds, normalized);
    if (!targeting.success) return { success: false, errorReason: targeting.errorReason };
    const resolvedTargetIds = targeting.targetIds;
    if (normalized.resolutionMode === 'SINGLE_ATTACK') {
      const targetId = resolvedTargetIds[0];
      if (!targetId) return { success: false, errorReason: 'SINGLE_ATTACK requires one targetId.' };
      const attack = engine.executeAttack(actorId, targetId, {
        overrideFormula: normalized.damageFormula,
        damageType: normalized.damageType,
        advantage: normalized.advantage,
        disadvantage: normalized.disadvantage,
        attackFormula: normalized.attackFormula,
        consumeAction: options.consumeAction !== false,
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
      return engine.executeMultiAttack(actorId, resolvedTargetIds, {
        definition: normalized,
        instanceCount: normalized.instanceCount,
        damageFormula: normalized.damageFormula,
        attackFormula: normalized.attackFormula,
        damageType: normalized.damageType,
        advantage: normalized.advantage,
        disadvantage: normalized.disadvantage,
        retargetPolicy: normalized.retargetPolicy,
        consumeAction: options.consumeAction !== false,
      });
    }
    if (normalized.resolutionMode === 'SAVE') {
      if (!normalized.savingThrowAbility || normalized.difficultyClass == null) return { success: false, errorReason: 'SAVE effects require savingThrowAbility and difficultyClass.' };
      return engine.executeSavingThrowEffect({ actorId, targetIds: resolvedTargetIds, savingThrowAbility: normalized.savingThrowAbility, difficultyClass: normalized.difficultyClass, damageFormula: normalized.damageFormula, damageType: normalized.damageType, saveFormula: normalized.saveFormula, halfDamageOnSave: normalized.halfDamageOnSave, consumeAction: options.consumeAction !== false });
    }
    if (normalized.resolutionMode === 'AREA') {
      if (!resolvedTargetIds.length) return { success: false, errorReason: 'AREA effects require resolved targetIds.' };
      if (normalized.savingThrowAbility) {
        if (normalized.difficultyClass == null) return { success: false, errorReason: 'AREA save effects require difficultyClass.' };
        return engine.executeSavingThrowEffect({ actorId, targetIds: resolvedTargetIds, savingThrowAbility: normalized.savingThrowAbility, difficultyClass: normalized.difficultyClass, damageFormula: normalized.damageFormula, damageType: normalized.damageType, saveFormula: normalized.saveFormula, halfDamageOnSave: normalized.halfDamageOnSave, consumeAction: options.consumeAction !== false });
      }
      if (!normalized.damageFormula) return { success: false, errorReason: 'Automatic AREA effects require damageFormula.' };
      return engine.executeAreaDamageEffect({ actorId, targetIds: resolvedTargetIds, damageFormula: normalized.damageFormula, damageType: normalized.damageType, consumeAction: options.consumeAction !== false });
    }
    if (normalized.resolutionMode === 'CHAIN') {
      const chainCount = Math.max(1, Math.min(normalized.chainCount ?? normalized.instanceCount ?? resolvedTargetIds.length, resolvedTargetIds.length));
      return engine.executeMultiAttack(actorId, resolvedTargetIds.slice(0, chainCount), { definition: { ...normalized, resolutionMode: 'MULTI_INSTANCE', instanceCount: chainCount }, instanceCount: chainCount, damageFormula: normalized.damageFormula, attackFormula: normalized.attackFormula, damageType: normalized.damageType, advantage: normalized.advantage, disadvantage: normalized.disadvantage, retargetPolicy: normalized.retargetPolicy, consumeAction: options.consumeAction !== false });
    }
    if (normalized.resolutionMode === 'SEQUENCE') {
      if (!normalized.sequence?.length) return { success: false, errorReason: 'SEQUENCE effects require at least one child effect.' };
      const instances: any[] = [];
      const defeatedTargetIds: string[] = [];
      const eventIds: string[] = [];
      let totalDamage = 0;
      let first = true;
      for (const child of normalized.sequence) {
        const childResult = this.resolve(engine, actorId, resolvedTargetIds, child, { consumeAction: options.consumeAction !== false && first });
        first = false;
        if (!childResult.success) return childResult;
        instances.push(...(childResult.instances || []));
        totalDamage += childResult.totalDamage || 0;
        for (const id of childResult.defeatedTargetIds || []) if (!defeatedTargetIds.includes(id)) defeatedTargetIds.push(id);
        for (const id of childResult.canonicalEventIds || []) eventIds.push(id);
      }
      return { success: true, actionConsumed: options.consumeAction !== false, effectId: normalized.id, effectName: normalized.name, instances, totalDamage, defeatedTargetIds, canonicalEventIds: eventIds };
    }
    return { success: false, errorReason: `Resolution mode '${normalized.resolutionMode}' is handled by a specialized resolver.` };
  }
}

export const combatEffectEngine = new CombatEffectEngine();
