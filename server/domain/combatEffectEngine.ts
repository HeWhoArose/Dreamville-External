import type {
  CombatEffectDefinition,
  CombatEffectResult,
  CombatAttackInstanceResult,
} from '../../src/types';
export type { CombatEffectResult, CombatAttackInstanceResult };
import { isDiceFormula, normalizeDiceFormula, resolveCapabilityCheckFormula } from '../../src/data/rulesDice';
import { TacticalCombatEngine } from './combatEngine';
import { combatTargetingEngine } from './combatTargetingEngine';

export class CombatEffectEngine {
  public validateDefinition(definition: CombatEffectDefinition, rulesMode: string = 'FULL_DND'): { success: boolean; errorReason?: string; normalized?: CombatEffectDefinition } {
    if (!definition?.id?.trim() || !definition?.name?.trim()) return { success: false, errorReason: 'Combat effect requires id and name.' };
    if (!definition.resolutionMode) return { success: false, errorReason: 'Combat effect requires resolutionMode.' };
    const validModes = new Set(['SINGLE_ATTACK', 'MULTI_INSTANCE', 'SAVE', 'AREA', 'CHAIN', 'SEQUENCE', 'OUTCOME', 'WORLD_EFFECT']);
    const validScales = new Set(['PERSON', 'GROUP', 'ENCOUNTER', 'STRUCTURE', 'DISTRICT', 'CITY', 'REGION', 'CONTINENT', 'PLANET', 'COSMIC']);
    const validCosts = new Set(['ACTION', 'BONUS_ACTION', 'REACTION', 'FREE']);
    const validTargeting = new Set(['SELF', 'ALLY', 'ENEMY', 'ONE_TARGET', 'MULTI_TARGET', 'PER_INSTANCE', 'ALL_IN_AREA', 'CHAIN', 'RANDOM_LEGAL_TARGET']);
    if (!validModes.has(definition.resolutionMode)) return { success: false, errorReason: `Unsupported resolutionMode '${definition.resolutionMode}'.` };
    if (definition.scale !== undefined && !validScales.has(definition.scale)) return { success: false, errorReason: `Unsupported effect scale '${String(definition.scale)}'.` };
    if (definition.actionCost !== undefined && !validCosts.has(definition.actionCost)) return { success: false, errorReason: `Unsupported actionCost '${String(definition.actionCost)}'.` };
    if (definition.targetingMode !== undefined && !validTargeting.has(definition.targetingMode)) return { success: false, errorReason: `Unsupported targetingMode '${String(definition.targetingMode)}'.` };
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
    if (normalized.damageFormula !== undefined) {
      if (!isDiceFormula(normalized.damageFormula)) {
        return { success: false, errorReason: `Invalid or unsafe damage formula '${normalized.damageFormula}'.` };
      }
      normalized.damageFormula = normalizeDiceFormula(normalized.damageFormula);
    }
    if (normalized.attackFormula !== undefined) {
      if (!isDiceFormula(normalized.attackFormula)) {
        return { success: false, errorReason: `Invalid or unsafe attack formula '${normalized.attackFormula}'.` };
      }
      normalized.attackFormula = resolveCapabilityCheckFormula(rulesMode as any, normalized.attackFormula);
    } else if (normalized.resolutionMode === 'SINGLE_ATTACK' || normalized.resolutionMode === 'MULTI_INSTANCE' || normalized.resolutionMode === 'CHAIN') {
      normalized.attackFormula = resolveCapabilityCheckFormula(rulesMode as any, undefined);
    }
    if (normalized.saveFormula !== undefined) {
      if (!isDiceFormula(normalized.saveFormula)) {
        return { success: false, errorReason: `Invalid or unsafe save formula '${normalized.saveFormula}'.` };
      }
      normalized.saveFormula = resolveCapabilityCheckFormula(rulesMode as any, normalized.saveFormula);
    } else if (normalized.resolutionMode === 'SAVE' || normalized.resolutionMode === 'AREA') {
      normalized.saveFormula = resolveCapabilityCheckFormula(rulesMode as any, undefined);
    }
    if (normalized.executionFormula !== undefined) {
      if (!isDiceFormula(normalized.executionFormula)) {
        return { success: false, errorReason: `Invalid or unsafe execution formula '${normalized.executionFormula}'.` };
      }
      normalized.executionFormula = resolveCapabilityCheckFormula(rulesMode as any, normalized.executionFormula);
    }

    if (normalized.forcedMovement) {
      if (!['SINGLE_ATTACK', 'MULTI_INSTANCE', 'CHAIN'].includes(normalized.resolutionMode)) {
        return { success: false, errorReason: 'Forced movement is currently supported on attack-instance effects only.' };
      }
      if (!['PUSH', 'PULL'].includes(normalized.forcedMovement.type)) {
        return { success: false, errorReason: `Unsupported forced movement type '${String(normalized.forcedMovement.type)}'.` };
      }
      const authoredCollision = normalized.forcedMovement.collision;
      for (const [label, formula] of [
        ['collision damage', authoredCollision?.damageFormula],
        ['collision object damage', authoredCollision?.objectDamageFormula],
        ['collision creature damage', authoredCollision?.creatureDamageFormula],
      ] as const) {
        if (formula !== undefined && !isDiceFormula(formula)) {
          return { success: false, errorReason: `Invalid or unsafe ${label} formula '${formula}'.` };
        }
      }

      normalized.forcedMovement = {
        ...normalized.forcedMovement,
        distanceCells: Math.max(0, Math.min(50, Math.trunc(Number(normalized.forcedMovement.distanceCells) || 0))),
        collision: authoredCollision
          ? {
              ...authoredCollision,
              damageFormula: authoredCollision.damageFormula
                ? normalizeDiceFormula(authoredCollision.damageFormula)
                : undefined,
              objectDamageFormula: authoredCollision.objectDamageFormula
                ? normalizeDiceFormula(authoredCollision.objectDamageFormula)
                : undefined,
              creatureDamageFormula: authoredCollision.creatureDamageFormula
                ? normalizeDiceFormula(authoredCollision.creatureDamageFormula)
                : undefined,
              damageType: authoredCollision.damageType?.trim() || undefined,
              stopOnCollision: authoredCollision.stopOnCollision !== false,
              maxCollisions: Math.max(1, Math.min(3, Math.trunc(Number(authoredCollision.maxCollisions ?? 1) || 1))),
            }
          : undefined,
      };
    }

    if ((normalized.resolutionMode === 'OUTCOME' || normalized.resolutionMode === 'WORLD_EFFECT') && !normalized.outcome) {
      return { success: false, errorReason: 'Outcome/world effects require a semantic outcome.' };
    }
    return { success: true, normalized };
  }

  private resolveExecutionGate(
    engine: TacticalCombatEngine,
    actorId: string,
    definition: CombatEffectDefinition
  ): { success: boolean; errorReason?: string; result?: { success: boolean; mode: import('../../src/types').CombatExecutionMode; roll?: unknown; difficultyClass?: number; reason?: string } } {
    const mode = definition.executionMode || 'AUTOMATIC';
    if (mode === 'AUTOMATIC' || mode === 'CONTEXTUAL' || mode === 'CONCENTRATION') {
      return { success: true, result: { success: true, mode } };
    }

    const dc = Number(definition.executionDifficultyClass);
    if (!Number.isFinite(dc) || dc < 1) {
      return { success: false, errorReason: 'CHECK_REQUIRED execution requires executionDifficultyClass.' };
    }
    const formula = definition.executionFormula || '1d20';
    try {
      const roll = engine.getDiceEngine().roll(formula, 0);
      const success = roll.total >= dc;
      return {
        success,
        result: {
          success,
          mode,
          roll,
          difficultyClass: dc,
          reason: success ? 'Execution gate passed.' : 'Execution gate failed.',
        },
        errorReason: success ? undefined : 'Capability execution gate failed.',
      };
    } catch (error: any) {
      return { success: false, errorReason: error?.message || 'Execution gate could not be resolved.' };
    }
  }

  private applyConditionEffects(
    engine: TacticalCombatEngine,
    actorId: string,
    definition: CombatEffectDefinition,
    instances: CombatAttackInstanceResult[],
    saveSemantics = false
  ): Array<{ targetId: string; conditionIdOrName: string; trigger: import('../../src/types').CombatConditionEffectDefinition['trigger']; applied: boolean; immune: boolean }> {
    const definitions = definition.conditionEffects || [];
    if (!definitions.length) return [];

    const applied: Array<{ targetId: string; conditionIdOrName: string; trigger: import('../../src/types').CombatConditionEffectDefinition['trigger']; applied: boolean; immune: boolean }> = [];

    for (const instance of instances) {
      for (const effect of definitions) {
        let shouldApply = effect.trigger === 'ALWAYS';
        if (saveSemantics) {
          shouldApply =
            shouldApply ||
            (effect.trigger === 'ON_SAVE_FAILURE' && instance.hits) ||
            (effect.trigger === 'ON_SAVE_SUCCESS' && !instance.hits);
        } else {
          shouldApply =
            shouldApply ||
            (effect.trigger === 'ON_HIT' && instance.hits) ||
            (effect.trigger === 'ON_MISS' && !instance.hits) ||
            (effect.trigger === 'ON_CRITICAL' && instance.isCritical);
        }
        if (!shouldApply) continue;

        const result = engine.applyCombatCondition(
          instance.targetId,
          {
            conditionIdOrName: effect.conditionIdOrName,
            intensity: effect.intensity,
            severity: effect.severity,
            durationSeconds: effect.durationSeconds,
            notes: effect.notes,
          },
          actorId,
        );

        applied.push({
          targetId: instance.targetId,
          conditionIdOrName: effect.conditionIdOrName,
          trigger: effect.trigger,
          applied: result.applied,
          immune: result.immune,
        });
      }
    }
    return applied;
  }

  public resolve(
    engine: TacticalCombatEngine,
    actorId: string,
    targetIds: string[],
    definition: CombatEffectDefinition,
    options: { consumeAction?: boolean; recordReplay?: boolean } = {}
  ): CombatEffectResult {
    const profile = engine.getRulesProfile();
    const validation = this.validateDefinition(definition, profile?.mode || 'FULL_DND');
    if (!validation.success || !validation.normalized) return { success: false, errorReason: validation.errorReason };

    const normalized = validation.normalized;
    const beforeState = engine.exportState();
    const replayBeforeState = JSON.parse(JSON.stringify({
      ...beforeState,
      combatReplayRecords: [],
    }));
    const rollback = <T extends CombatEffectResult>(result: T): T => {
      if (!result.success) {
        engine.importState(beforeState);
        return result;
      }
      if (options.recordReplay !== false) {
        engine.recordCombatReplay({
          actionId: `combat_effect_${normalized.id}_${engine.getCurrentRound()}_${engine.getCombatActionSequence()}`,
          turnNumber: engine.getCurrentRound(),
          actorId,
          targetIds: [...targetIds],
          definition: JSON.parse(JSON.stringify(normalized)),
          seedBefore: Number(beforeState.seed || 0),
          rollCounterBefore: Number(beforeState.rollCounter || 0),
          beforeState: replayBeforeState,
          canonicalEventIds: [...(result.canonicalEventIds || [])],
          resultSignature: {
            success: result.success,
            totalDamage: result.totalDamage,
            defeatedTargetIds: [...(result.defeatedTargetIds || [])],
            instanceCount: result.instances?.length || 0,
          },
          consumeAction: options.consumeAction !== false,
          createdAtSequence: engine.getCombatActionSequence(),
        });
      }
      return result;
    };

    const execution = this.resolveExecutionGate(engine, actorId, normalized);
    if (!execution.success || !execution.result?.success) {
      return rollback({
        success: false,
        errorReason: execution.errorReason || 'Execution gate failed.',
        effectId: normalized.id,
        effectName: normalized.name,
        executionResult: execution.result,
      });
    }
    const executionResult = execution.result;

    const targetingInputIds = normalized.instanceTargetIds?.length
      ? Array.from(new Set([...targetIds, ...normalized.instanceTargetIds]))
      : targetIds;
    const targeting = combatTargetingEngine.resolve(engine, actorId, targetingInputIds, normalized);
    if (!targeting.success) return rollback({ success: false, errorReason: targeting.errorReason });

    const shouldConsumeResource = options.consumeAction !== false;
    let resourceConsumed = false;

    if (shouldConsumeResource) {
      const resourceResult = engine.consumeCombatAction(actorId, normalized.actionCost || 'ACTION');
      if (!resourceResult.success) return rollback({ success: false, errorReason: resourceResult.errorReason });
      resourceConsumed = normalized.actionCost !== 'FREE';
    }

    if (normalized.resolutionMode === 'OUTCOME') {
      if (!normalized.outcome) return rollback({ success: false, errorReason: 'OUTCOME effects require a semantic outcome.' });
      const instances: CombatAttackInstanceResult[] = [];
      const eventIds: string[] = [];
      const defeatedTargetIds: string[] = [];
      for (let i = 0; i < targeting.targetIds.length; i += 1) {
        const targetId = targeting.targetIds[i];
        const outcome = engine.applySemanticOutcome(targetId, normalized.outcome, normalized.outcomePayload, actorId);
        if (!outcome.success) return rollback({ success: false, errorReason: outcome.errorReason });
        instances.push({
          instanceIndex: i,
          targetId,
          hits: true,
          isCritical: false,
          damage: 0,
          targetDied: outcome.isDead,
        });
        if (outcome.isDead && !defeatedTargetIds.includes(targetId)) defeatedTargetIds.push(targetId);
        const eventId = (outcome.metadata as any)?.eventId;
        if (typeof eventId === 'string') eventIds.push(eventId);
      }
      return rollback({
        success: true,
        actionConsumed: resourceConsumed,
        effectId: normalized.id,
        effectName: normalized.name,
        instances,
        totalDamage: 0,
        defeatedTargetIds,
        outcome: normalized.outcome,
        canonicalEventIds: eventIds,
        executionResult,
      });
    }

    if (normalized.resolutionMode === 'WORLD_EFFECT') {
      const abstraction = ['PERSON', 'GROUP', 'ENCOUNTER'].includes(normalized.scale) ? 'TACTICAL' : 'MACRO';
      return rollback({
        success: true,
        actionConsumed: resourceConsumed,
        effectId: normalized.id,
        effectName: normalized.name,
        totalDamage: 0,
        outcome: normalized.outcome,
        executionResult,
        worldEffectPreview: {
          scale: normalized.scale,
          outcome: normalized.outcome,
          targetIds: [...targeting.targetIds],
          abstraction,
          changedScopes: [normalized.scale + ':' + normalized.id],
        },
      });
    }

    if (normalized.resolutionMode === 'SINGLE_ATTACK') {
      const targetId = targeting.targetIds[0];
      if (!targetId) return rollback({ success: false, errorReason: 'SINGLE_ATTACK requires one targetId.' });
      const attack = engine.executeAttack(actorId, targetId, {
        overrideFormula: normalized.damageFormula,
        damageType: normalized.damageType,
        advantage: normalized.advantage,
        disadvantage: normalized.disadvantage,
        attackFormula: normalized.attackFormula,
        attackBonusOverride: normalized.attackBonusOverride,
        forcedMovement: normalized.forcedMovement,
        consumeAction: false,
      });
      const singleResult: CombatEffectResult = {
        success: attack.success,
        errorReason: attack.errorReason,
        actionConsumed: attack.success && resourceConsumed,
        effectId: normalized.id,
        effectName: normalized.name,
        instances: attack.success ? [{
          instanceIndex: 0,
          targetId,
          hits: attack.hits,
          isCritical: attack.isCritical,
          damage: attack.damage,
          secondaryDamage: (attack.forcedMovement?.collisions || [])
            .reduce((sum, collision) => sum + collision.damageToMover, 0),
          targetDied: attack.targetDied,
          forcedMovement: attack.forcedMovement,
          roll: attack.roll,
        }] : undefined,
        totalDamage: attack.success
          ? attack.damage + (attack.forcedMovement?.collisions || []).reduce((sum, collision) => sum + collision.damageToMover, 0)
          : 0,
        secondaryDamage: attack.success
          ? (attack.forcedMovement?.collisions || []).reduce((sum, collision) => sum + collision.damageToMover, 0)
          : 0,
        defeatedTargetIds: attack.success && attack.targetDied ? [targetId] : [],
        canonicalEventIds: engine.getCombatEffectEvents()
          .filter((event) => event.eventType === 'ATTACK_INSTANCE_RESOLVED' && event.actorId === actorId && event.targetId === targetId)
          .slice(-1)
          .map((event) => event.eventId),
        executionResult,
      };
      singleResult.conditionsApplied = attack.success
        ? this.applyConditionEffects(engine, actorId, normalized, singleResult.instances || [])
        : [];
      return rollback(singleResult);
    }

    if (normalized.resolutionMode === 'MULTI_INSTANCE') {
      const result = engine.executeMultiAttack(actorId, targeting.targetIds, {
        definition: normalized,
        instanceCount: normalized.instanceCount,
        damageFormula: normalized.damageFormula,
        attackFormula: normalized.attackFormula,
        damageType: normalized.damageType,
        advantage: normalized.advantage,
        disadvantage: normalized.disadvantage,
        retargetPolicy: normalized.retargetPolicy,
        instanceTargetIds: normalized.instanceTargetIds,
        consumeAction: false,
      });
      const multiResult: CombatEffectResult = {
        ...result,
        executionResult,
        actionConsumed: result.success && resourceConsumed,
        effectId: normalized.id,
        effectName: normalized.name,
      };
      multiResult.conditionsApplied = result.success
        ? this.applyConditionEffects(engine, actorId, normalized, result.instances || [])
        : [];
      return rollback(multiResult);
    }

    if (normalized.resolutionMode === 'SAVE') {
      if (!normalized.savingThrowAbility || normalized.difficultyClass == null) {
        return rollback({ success: false, errorReason: 'SAVE effects require savingThrowAbility and difficultyClass.' });
      }
      const result = engine.executeSavingThrowEffect({
        actorId,
        targetIds: targeting.targetIds,
        savingThrowAbility: normalized.savingThrowAbility,
        difficultyClass: normalized.difficultyClass,
        damageFormula: normalized.damageFormula,
        damageType: normalized.damageType,
        saveFormula: normalized.saveFormula,
        halfDamageOnSave: normalized.halfDamageOnSave,
        consumeAction: false,
      });
      const saveResult: CombatEffectResult = { ...result, executionResult, actionConsumed: result.success && resourceConsumed, effectId: normalized.id, effectName: normalized.name };
      saveResult.conditionsApplied = result.success
        ? this.applyConditionEffects(engine, actorId, normalized, result.instances || [], true)
        : [];
      return rollback(saveResult);
    }

    if (normalized.resolutionMode === 'AREA') {
      if (!targeting.targetIds.length) return rollback({ success: false, errorReason: 'AREA effects require resolved targetIds.' });
      if (normalized.savingThrowAbility) {
        if (normalized.difficultyClass == null) return rollback({ success: false, errorReason: 'AREA save effects require difficultyClass.' });
        const result = engine.executeSavingThrowEffect({
          actorId,
          targetIds: targeting.targetIds,
          savingThrowAbility: normalized.savingThrowAbility,
          difficultyClass: normalized.difficultyClass,
          damageFormula: normalized.damageFormula,
          damageType: normalized.damageType,
          saveFormula: normalized.saveFormula,
          halfDamageOnSave: normalized.halfDamageOnSave,
          consumeAction: false,
        });
        const areaSaveResult: CombatEffectResult = { ...result, executionResult, actionConsumed: result.success && resourceConsumed, effectId: normalized.id, effectName: normalized.name };
        areaSaveResult.conditionsApplied = result.success
          ? this.applyConditionEffects(engine, actorId, normalized, result.instances || [], true)
          : [];
        return rollback(areaSaveResult);
      }
      if (!normalized.damageFormula) return rollback({ success: false, errorReason: 'Automatic AREA effects require damageFormula.' });
      const result = engine.executeAreaDamageEffect({
        actorId,
        targetIds: targeting.targetIds,
        damageFormula: normalized.damageFormula,
        damageType: normalized.damageType,
        consumeAction: false,
      });
      const areaResult: CombatEffectResult = { ...result, executionResult, actionConsumed: result.success && resourceConsumed, effectId: normalized.id, effectName: normalized.name };
      areaResult.conditionsApplied = result.success
        ? this.applyConditionEffects(engine, actorId, normalized, result.instances || [])
        : [];
      return rollback(areaResult);
    }

    if (normalized.resolutionMode === 'CHAIN') {
      const chainCount = Math.max(
        1,
        Math.min(
          normalized.chainCount ?? normalized.instanceCount ?? targeting.targetIds.length,
          targeting.targetIds.length
        )
      );
      const result = engine.executeMultiAttack(actorId, targeting.targetIds.slice(0, chainCount), {
        definition: { ...normalized, resolutionMode: 'MULTI_INSTANCE', instanceCount: chainCount },
        instanceCount: chainCount,
        damageFormula: normalized.damageFormula,
        attackFormula: normalized.attackFormula,
        damageType: normalized.damageType,
        advantage: normalized.advantage,
        disadvantage: normalized.disadvantage,
        retargetPolicy: normalized.retargetPolicy,
        consumeAction: false,
      });
      const chainResult: CombatEffectResult = { ...result, executionResult, actionConsumed: result.success && resourceConsumed, effectId: normalized.id, effectName: normalized.name };
      chainResult.conditionsApplied = result.success
        ? this.applyConditionEffects(engine, actorId, normalized, result.instances || [])
        : [];
      return rollback(chainResult);
    }

    if (normalized.resolutionMode === 'SEQUENCE') {
      if (!normalized.sequence?.length) return rollback({ success: false, errorReason: 'SEQUENCE effects require at least one child effect.' });
      const instances: CombatAttackInstanceResult[] = [];
      const defeatedTargetIds: string[] = [];
      const eventIds: string[] = [];
      let totalDamage = 0;

      for (const child of normalized.sequence) {
        const childResult = this.resolve(engine, actorId, targeting.targetIds, child, { consumeAction: false, recordReplay: false });
        if (!childResult.success) return rollback(childResult);
        instances.push(...(childResult.instances || []));
        totalDamage += childResult.totalDamage || 0;
        for (const id of childResult.defeatedTargetIds || []) if (!defeatedTargetIds.includes(id)) defeatedTargetIds.push(id);
        for (const id of childResult.canonicalEventIds || []) eventIds.push(id);
      }

      return rollback({
        success: true,
        actionConsumed: resourceConsumed,
        effectId: normalized.id,
        effectName: normalized.name,
        instances,
        totalDamage,
        defeatedTargetIds,
        canonicalEventIds: eventIds,
        executionResult,
      });
    }

    return rollback({ success: false, errorReason: `Resolution mode '${normalized.resolutionMode}' is handled by a specialized resolver.` });
  }
}

export const combatEffectEngine = new CombatEffectEngine();
