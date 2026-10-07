import type { StoryCheckResult, ActionResolution, ActionOutcomeTier, ActionResolutionMethod, CombatNarrativeResolution } from '../../src/types';
export type { ActionResolution, ActionOutcomeTier, ActionResolutionMethod };

export function outcomeTierFromCheck(check: StoryCheckResult): ActionOutcomeTier {
  if (check.outcomeTier) return check.outcomeTier;
  if (check.criticalSuccess) return 'CRITICAL_SUCCESS';
  if (check.criticalFailure) return 'CRITICAL_FAILURE';
  if (check.success) return check.consequence?.applied ? 'SUCCESS_WITH_COST' : 'CLEAN_SUCCESS';
  return check.consequence?.applied ? 'FAILURE_WITH_COST' : 'FAILURE';
}


export function actionResolutionFromCombat(
	combat: CombatNarrativeResolution,
	storyId: string,
	turnId: string = combat.id,
): ActionResolution {
	const hit = combat.hits;
	const outcomeTier: ActionOutcomeTier = hit === false ? 'FAILURE' : combat.damage && combat.damage > 0 ? 'SUCCESS_WITH_COST' : 'CLEAN_SUCCESS';
	const targetNames = combat.targetIds.join(', ');
	const visible = [
		combat.mechanicalSummary,
		...(combat.targetHp || []).map((target) =>
			(target.targetDied ? 'Target ' : 'Target ') + target.targetId + (target.targetDied ? ' was defeated.' : ' remains at ' + target.hpCurrent + ' HP.'),
		),
	].filter(Boolean);
	return {
		resolutionId: combat.id,
		storyId,
		turnId,
		playerAction: combat.actionText,
		playerIntent: {
			action: combat.actionLabel,
			interactionMode: 'COMBAT',
			movementIntent: false,
			observationIntent: false,
			speechIntent: false,
			targetIds: combat.targetIds,
		},
		attemptedEffect: combat.actionText,
		targetEntityIds: combat.targetIds,
		resolutionMethod: 'COMBAT',
		outcomeTier,
		actualEffect: combat.mechanicalSummary,
		canonicalStateChanges: [
			...(combat.damage && combat.damage > 0 ? combat.targetIds.map((targetId) => ({
				kind: 'COMBAT_DAMAGE',
				targetId,
				value: { damage: combat.damage },
				metadata: { source: 'combat_canonical_resolution' },
			})) : []),
			...(combat.targetHp || []).filter((target) => target.targetDied).map((target) => ({
				kind: 'COMBAT_DEFEAT',
				targetId: target.targetId,
				value: { defeated: true },
				metadata: { source: 'combat_canonical_resolution' },
			})),
		],
		physicalConsequences: uniqueResolutionStrings(visible),
		playerVisibleConsequences: uniqueResolutionStrings(visible),
		evidenceIds: combat.canonicalEventIds.slice(0, 8),
		uncertainty: [],
		provenance: {
			source: 'CANONICAL_ENGINE',
			canonicalEventId: combat.canonicalEventIds[0],
		},
	};
}

function uniqueResolutionStrings(values: string[]): string[] {
	return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, 8);
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