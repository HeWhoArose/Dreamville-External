import type { StoryCheckResult, ActionResolution, ActionOutcomeTier } from '../../src/types';
export type { ActionResolution, ActionOutcomeTier };

export function outcomeTierFromCheck(check: StoryCheckResult): ActionOutcomeTier {
  if (check.criticalSuccess) return 'CRITICAL_SUCCESS';
  if (check.criticalFailure) return 'CRITICAL_FAILURE';
  if (check.success) return check.consequence?.applied ? 'SUCCESS_WITH_COST' : 'CLEAN_SUCCESS';
  return check.consequence?.applied ? 'FAILURE_WITH_COST' : 'FAILURE';
}

export function buildActionResolutionPromptContext(resolution?: ActionResolution): string {
  if (!resolution) return '[no structured action resolution supplied]';
  return JSON.stringify({
    resolutionId: resolution.resolutionId,
    attemptedEffect: resolution.attemptedEffect,
    targetEntityIds: resolution.targetEntityIds,
    resolutionMethod: resolution.resolutionMethod,
    outcomeTier: resolution.outcomeTier,
    actualEffect: resolution.actualEffect,
    canonicalStateChanges: resolution.canonicalStateChanges,
    physicalConsequences: resolution.physicalConsequences,
    playerVisibleConsequences: resolution.playerVisibleConsequences,
    evidenceIds: resolution.evidenceIds,
    uncertainty: resolution.uncertainty,
    provenance: resolution.provenance,
    check: resolution.check ? {
      testType: resolution.check.testType,
      skill: resolution.check.skill,
      ability: resolution.check.ability,
      total: resolution.check.total,
      difficultyClass: resolution.check.difficultyClass,
      success: resolution.check.success,
      outcomeTier: resolution.check.outcomeTier,
      criticalSuccess: resolution.check.criticalSuccess,
      criticalFailure: resolution.check.criticalFailure,
      reason: resolution.check.reason,
      triggerReason: resolution.check.triggerReason,
      narrativeGuidance: resolution.check.narrativeGuidance,
      consequence: resolution.check.consequence,
    } : undefined,
  }, null, 2);
}