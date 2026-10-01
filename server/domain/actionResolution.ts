import type { PlayerIntent } from './playerIntentInterpreter';
import type { StateChangeProposal } from '../../src/types';
import type { StoryCheckResult } from '../../src/types';

export type ActionResolutionMethod =
  | 'NO_CHECK'
  | 'DETERMINISTIC'
  | 'CHECK'
  | 'AUTHORED_CHALLENGE'
  | 'CAPABILITY'
  | 'ITEM_USE'
  | 'COMBAT'
  | 'COST_ONLY';

export type ActionOutcomeTier =
  | 'NO_CHECK'
  | 'CLEAN_SUCCESS'
  | 'SUCCESS_WITH_COST'
  | 'PARTIAL_SUCCESS'
  | 'BLOCKED'
  | 'FAILURE'
  | 'FAILURE_WITH_COST'
  | 'CRITICAL_SUCCESS'
  | 'CRITICAL_FAILURE';

export interface ActionResolution {
  resolutionId: string;
  storyId: string;
  turnId: string;
  playerAction: string;
  playerIntent: {
    action: string;
    interactionMode: string;
    movementIntent: boolean;
    observationIntent: boolean;
    speechIntent: boolean;
    informationGoal?: string;
    targetIds?: string[];
  };
  attemptedEffect: string;
  targetEntityIds: string[];
  resolutionMethod: ActionResolutionMethod;
  check?: StoryCheckResult;
  outcomeTier: ActionOutcomeTier;
  actualEffect: string;
  canonicalStateChanges: StateChangeProposal[];
  physicalConsequences: string[];
  playerVisibleConsequences: string[];
  evidenceIds: string[];
  uncertainty: string[];
  provenance: {
    source: 'CANONICAL_ENGINE';
    canonicalCommandId?: string;
    canonicalEventId?: string;
  };
}

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
    check: resolution.check
      ? {
          testType: resolution.check.testType,
          skill: resolution.check.skill,
          ability: resolution.check.ability,
          total: resolution.check.total,
          difficultyClass: resolution.check.difficultyClass,
          success: resolution.check.success,
          criticalSuccess: resolution.check.criticalSuccess,
          criticalFailure: resolution.check.criticalFailure,
          reason: resolution.check.reason,
          triggerReason: resolution.check.triggerReason,
          narrativeGuidance: resolution.check.narrativeGuidance,
          consequence: resolution.check.consequence,
        }
      : undefined,
  }, null, 2);
}
