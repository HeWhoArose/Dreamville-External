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
    if (normalized.deliveryMode === 'CHECK_REQUIRED') {
      const dc = Number(normalized.deliveryDifficultyClass);
      if (!Number.isFinite(dc) || dc < 1) return { success: false, errorReason: 'CHECK_REQUIRED delivery requires deliveryDifficultyClass.' };
    }
    if (normalized.deliveryFormula !== undefined) {
      if (!isDiceFormula(normalized.deliveryFormula)) return { success: false, errorReason: `Invalid or unsafe delivery formula '${normalized.deliveryFormula}'.` };
      normalized.deliveryFormula = resolveCapabilityCheckFormula(rulesMode as any, normalized.deliveryFormula);
    }
    if (normalized.resourceCost !== undefined) {
      const name = String(normalized.resourceCost.name || '').trim();
      const amount = Number(normalized.resourceCost.amount);
      if (!name || !Number.isFinite(amount) || amount < 0 || amount > 1000) return { success: false, errorReason: 'resourceCost needs a resource name and an amount from 0 to 1000.' };
      normalized.resourceCost = { name, amount: Math.trunc(amount) };
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
    options: { consumeAction?: boolean; recordReplay?: boolean; consumeResources?: boolean } = {}
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
    const deliveredResultsHolder: { value?: NonNullable<CombatEffectResult['deliveryResults']> } = {};
    const rollback = <T extends CombatEffectResult>(result: T): T => {
      if (result.success && deliveredResultsHolder.value && !result.deliveryResults) result.deliveryResults = deliveredResultsHolder.value;
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

    const afterExecution = engine.consumeStageInterrupt('AFTER_EXECUTION', { sourceActorId: actorId, targetIds });
    if (afterExecution.fired && afterExecution.action === 'CANCEL_EFFECT') {
      engine.recordStageEvent('EXECUTION_INTERRUPTED', afterExecution.actorId || actorId, targetIds[0], `${normalized.name} was cancelled as it was produced.`, { interruptId: afterExecution.interruptId });
      return rollback({
        success: true,
        actionConsumed: resourceConsumed,
        effectId: normalized.id,
        effectName: normalized.name,
        instances: [],
        totalDamage: 0,
        deliveryBlocked: true,
        interrupted: { stage: 'AFTER_EXECUTION', byActorId: afterExecution.actorId || '', interruptId: afterExecution.interruptId || '' },
        executionResult,
      });
    }

    if (normalized.resourceCost && options.consumeResources !== false) {
      const spent = engine.spendSpecialResource(actorId, normalized.resourceCost.name, normalized.resourceCost.amount);
      if (!spent.success) return rollback({ success: false, errorReason: spent.errorReason });
    }

    // Delivery stage: the effect has been executed; does it reach each target? Distinct from a save (resisted) and from
    // execution (the user failing to produce it). Interrupts, wards and delivery checks live here.
    const reachable = targeting.targetIds.filter((id) => id !== actorId);
    if (normalized.resolutionMode !== 'WORLD_EFFECT' && reachable.length > 0) {
      const interrupt = engine.consumeStageInterrupt('BEFORE_DELIVERY', { sourceActorId: actorId, targetIds: targeting.targetIds });
      if (interrupt.fired && interrupt.action === 'CANCEL_EFFECT') {
        engine.recordStageEvent('DELIVERY_INTERRUPTED', interrupt.actorId || actorId, targeting.targetIds[0], `${normalized.name} was cancelled before it arrived.`, { interruptId: interrupt.interruptId });
        return rollback({
          success: true,
          actionConsumed: resourceConsumed,
          effectId: normalized.id,
          effectName: normalized.name,
          instances: [],
          totalDamage: 0,
          deliveryBlocked: true,
          interrupted: { stage: 'BEFORE_DELIVERY', byActorId: interrupt.actorId || '', interruptId: interrupt.interruptId || '' },
          deliveryResults: targeting.targetIds.map((targetId) => ({ targetId, delivered: false, reason: 'Cancelled by an interrupt before delivery.' })),
          executionResult,
        });
      }
      const deliveryResults: NonNullable<CombatEffectResult['deliveryResults']> = [];
      const tags = [...(normalized.tags || []), normalized.damageType || ''].filter(Boolean).map((tag) => tag.toLowerCase());
      for (const targetId of targeting.targetIds) {
        if (targetId === actorId) { deliveryResults.push({ targetId, delivered: true, reason: 'Self-targeted.' }); continue; }
        const wards = (engine.getParticipant(targetId)?.wardedAgainst || []).map((ward) => ward.toLowerCase());
        const warded = wards.includes('all') || tags.some((tag) => wards.includes(tag));
        if (warded) {
          deliveryResults.push({ targetId, delivered: false, reason: 'Warded: the effect cannot reach this target.' });
          engine.recordStageEvent('DELIVERY_BLOCKED', actorId, targetId, `${normalized.name} was blocked by a ward before reaching its target.`, { tags });
          continue;
        }
        if (normalized.deliveryMode === 'CHECK_REQUIRED' && normalized.resolutionMode !== 'MULTI_INSTANCE') {
          const dc = Number(normalized.deliveryDifficultyClass);
          const roll = engine.getDiceEngine().roll(normalized.deliveryFormula || '1d20', 0);
          const delivered = roll.total >= dc;
          deliveryResults.push({ targetId, delivered, reason: delivered ? 'Delivery check passed.' : 'Delivery check failed.', roll, difficultyClass: dc });
          if (!delivered) engine.recordStageEvent('DELIVERY_BLOCKED', actorId, targetId, `${normalized.name} failed its delivery check and did not arrive.`, { roll: roll.total, difficultyClass: dc });
          continue;
        }
        deliveryResults.push({ targetId, delivered: true, reason: 'Delivered.' });
      }
      // A multi-instance effect rolls delivery for each instance: five beams can each fail to arrive on their own.
      if (normalized.deliveryMode === 'CHECK_REQUIRED' && normalized.resolutionMode === 'MULTI_INSTANCE') {
        const dc = Number(normalized.deliveryDifficultyClass);
        const total = normalized.instanceCount || 1;
        const wardedIds = new Set(deliveryResults.filter((entry) => !entry.delivered).map((entry) => entry.targetId));
        const kept: Array<{ index: number; targetId: string }> = [];
        for (let index = 0; index < total; index += 1) {
          const targetId = normalized.instanceTargetIds?.[index] ?? targeting.targetIds[0];
          if (wardedIds.has(targetId)) continue;
          const roll = engine.getDiceEngine().roll(normalized.deliveryFormula || '1d20', 0);
          const delivered = roll.total >= dc;
          deliveryResults.push({ targetId, delivered, instanceIndex: index, reason: delivered ? 'Delivery check passed.' : 'Delivery check failed.', roll, difficultyClass: dc });
          if (delivered) kept.push({ index, targetId }); else engine.recordStageEvent('DELIVERY_BLOCKED', actorId, targetId, `${normalized.name} (instance ${index + 1}) failed its delivery check and did not arrive.`, { roll: roll.total, difficultyClass: dc, instanceIndex: index });
        }
        if (kept.length > 0 && kept.length < total) {
          normalized.instanceCount = kept.length;
          if (normalized.instanceTargetIds?.length) normalized.instanceTargetIds = kept.map((entry) => entry.targetId);
        }
        // The per-beam results replace the generic per-target "delivered" entries; wards (undelivered) stay.
        for (let index = deliveryResults.length - 1; index >= 0; index -= 1) {
          if (deliveryResults[index].instanceIndex === undefined && deliveryResults[index].delivered) deliveryResults.splice(index, 1);
        }
      }
      const deliveredIds = Array.from(new Set(deliveryResults.filter((entry) => entry.delivered).map((entry) => entry.targetId)));
      if (deliveredIds.length < targeting.targetIds.length) {
        if (deliveredIds.length === 0) {
          return rollback({
            success: true,
            actionConsumed: resourceConsumed,
            effectId: normalized.id,
            effectName: normalized.name,
            instances: [],
            totalDamage: 0,
            deliveryBlocked: true,
            deliveryResults,
            executionResult,
          });
        }
        (targeting as { targetIds: string[] }).targetIds = deliveredIds;
      }
      deliveredResultsHolder.value = deliveryResults;
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

// Lets the combat engine resolve triggered effects and falls through this pipeline without importing it (no import cycle).
TacticalCombatEngine.setEffectResolver(
  (engine, actorId, targetIds, definition, options) => combatEffectEngine.resolve(engine, actorId, targetIds, definition, options),
  (actorId, feet) => buildFallEffect(actorId, feet),
);

/**
 * Extra Attack and Multiattack as the unified multi-instance effect: one action, one independent attack roll per instance.
 * `attacks` defaults to the actor's attacks per action.
 */
export function buildMultiattackEffect(engine: TacticalCombatEngine, actorId: string, targetId: string, attacks?: number): CombatEffectDefinition | undefined {
  const actor = engine.getParticipant(actorId);
  if (!actor) return undefined;
  const count = Math.max(1, Math.floor(attacks ?? actor.attacksPerAction ?? 1));
  return {
    id: `multiattack_${actorId}`,
    name: 'Multiattack',
    resolutionMode: 'MULTI_INSTANCE',
    scale: 'PERSON',
    actionCost: 'ACTION',
    targetingMode: 'ONE_TARGET',
    instanceCount: count,
    damageFormula: actor.damageFormula,
    damageType: actor.damageType,
    provenance: 'dreamville:multiattack',
  };
}

/** A fall as an automatic effect on the faller: 1d6 per 10 feet (at most 20d6), bludgeoning, landing prone. */
export function buildFallEffect(actorId: string, feet: number): CombatEffectDefinition | undefined {
  const dice = Math.min(20, Math.floor(Math.max(0, feet) / 10));
  if (dice <= 0) return undefined;
  return {
    id: `fall_${actorId}`,
    name: 'Fall',
    resolutionMode: 'AREA',
    scale: 'PERSON',
    actionCost: 'FREE',
    targetingMode: 'SELF',
    damageFormula: `${dice}d6`,
    damageType: 'bludgeoning',
    areaShape: 'POINT',
    areaRadiusCells: 0,
    conditionEffects: [{ trigger: 'ALWAYS', conditionIdOrName: 'Prone' }],
    provenance: 'dreamville:fall',
  };
}
