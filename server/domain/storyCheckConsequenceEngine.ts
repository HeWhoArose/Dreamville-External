import type {
  StoryCheckChallenge,
  StoryCheckConsequenceResult,
  StoryCheckResult,
} from '../../src/types';
import { LocalDiceEngine } from './combatEngine';
import { ConditionEngine } from './conditionEngine';
import { hashStringToSeed } from './deterministicRng';

export class StoryCheckConsequenceEngine {
  private dice(storyId: string, check: StoryCheckResult, formula: string): LocalDiceEngine {
    return new LocalDiceEngine(
      hashStringToSeed(`story-check-consequence::${storyId}::${check.checkId}::${check.roll.rollId}::${formula}`)
    );
  }

  public apply(
    storyId: string,
    actorId: string,
    check: StoryCheckResult,
    challenge: StoryCheckChallenge,
    conditionEngine: ConditionEngine,
    nowSeconds: number
  ): StoryCheckConsequenceResult {
    const branch = check.success ? 'SUCCESS' : 'FAILURE';
    const outcome = check.success ? challenge.onSuccess : challenge.onFailure;
    const appliedConditions: string[] = [];
    const removedConditions: string[] = [];

    if (!outcome) {
      return {
        challengeId: challenge.id,
        applied: false,
        branch,
        summary: check.success
          ? challenge.label + ': the saving throw succeeded and no additional authored effect applies.'
          : challenge.label + ': the saving throw failed, but no authored failure consequence applies.',
        appliedConditions,
        removedConditions,
        noEffectReason: 'The challenge defines no consequence for this branch.',
      };
    }

    let damageRoll: StoryCheckConsequenceResult['damageRoll'];
    let damage: StoryCheckConsequenceResult['damage'];

    if (outcome.damageFormula) {
      const rolled = this.dice(storyId, check, outcome.damageFormula).roll(outcome.damageFormula, 0);
      const multiplier = Math.max(0, Number(outcome.damageMultiplier ?? 1));
      const requestedAmount = Math.max(0, Math.floor(rolled.total * multiplier));
      const resolved = conditionEngine.resolveDamage(
        actorId,
        requestedAmount,
        outcome.damageType || 'custom',
        { targetBodyRegionId: outcome.targetBodyRegionId }
      );

      damageRoll = rolled;
      damage = {
        requestedAmount,
        rolledAmount: rolled.total,
        finalAmount: resolved.finalAmount,
        damageType: resolved.damageType,
        immune: resolved.immune,
        resisted: resolved.resisted,
        vulnerable: resolved.vulnerable,
        healthCurrent: resolved.healthCurrent,
        targetDied: resolved.targetDied,
        destroyedBodyRegions: resolved.destroyedBodyRegions,
      };
    }

    for (const condition of outcome.conditions || []) {
      const result = conditionEngine.applyCondition(actorId, {
        definitionIdOrName: condition.definitionIdOrName,
        intensity: condition.intensity,
        severity: condition.severity,
        durationSeconds: condition.durationSeconds,
        affectedBodyRegions: condition.affectedBodyRegions,
        nowSeconds,
        source: challenge.sourceType,
        sourceActorId: actorId,
        notes: 'Applied by authored story challenge ' + challenge.id + '.',
      });
      if (result.applied && result.instance) {
        appliedConditions.push(result.instance.name);
      }
    }

    for (const conditionId of outcome.removeConditions || []) {
      if (conditionEngine.removeCondition(actorId, conditionId)) {
        removedConditions.push(conditionId);
      }
    }

    const details: string[] = [];
    if (damage) {
      details.push(
        damage.finalAmount > 0
          ? damage.finalAmount + ' ' + damage.damageType + ' damage'
          : damage.damageType + ' damage was negated'
      );
    }
    if (appliedConditions.length > 0) {
      details.push('condition: ' + appliedConditions.join(', '));
    }
    if (removedConditions.length > 0) {
      details.push('removed: ' + removedConditions.join(', '));
    }

    return {
      challengeId: challenge.id,
      applied: true,
      branch,
      summary: outcome.summary || (
        details.length > 0
          ? challenge.label + ': ' + details.join('; ') + '.'
          : challenge.label + ': the authored consequence resolves without an additional numeric effect.'
      ),
      damageRoll,
      damage,
      appliedConditions,
      removedConditions,
    };
  }
}

export const storyCheckConsequenceEngine = new StoryCheckConsequenceEngine();