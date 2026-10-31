import type { StoryCheckResult, ActionResolution, ActionOutcomeTier, ActionResolutionMethod, CombatNarrativeResolution } from '../../src/types';
export type { ActionResolution, ActionOutcomeTier, ActionResolutionMethod };

export function outcomeTierFromCheck(check: StoryCheckResult): ActionOutcomeTier {
  if (check.outcomeTier) return check.outcomeTier;
  if (check.criticalSuccess) return 'CRITICAL_SUCCESS';
  if (check.criticalFailure) return 'CRITICAL_FAILURE';
  if (check.success) return check.consequence?.applied ? 'SUCCESS_WITH_COST' : 'CLEAN_SUCCESS';
  return check.consequence?.applied ? 'FAILURE_WITH_COST' : 'FAILURE';
}


export interface CombatMultiEffectDetails {
	healing?: number;
	secondaryDamage?: number;
	conditionsApplied?: string[];
	conditionsRemoved?: string[];
	forcedMovement?: {
		moved: boolean;
		distanceFeet?: number;
		distanceCells?: number;
		direction?: string;
		destination?: string;
		from?: { x: number; y: number };
		to?: { x: number; y: number };
		collided?: boolean;
		obstacleName?: string;
		collisionDamage?: number;
	};
	concentration?: {
		establishedSpellName?: string;
		brokenPreviousSpellName?: string;
		targetBrokenSpellName?: string;
		targetMaintainedConcentration?: boolean;
	};
}

export type CombatActionResolutionInput = CombatNarrativeResolution & CombatMultiEffectDetails;

export function actionResolutionFromCombat(
	combat: CombatActionResolutionInput,
	storyId: string,
	turnId: string = combat.id,
): ActionResolution {
	const hit = combat.hits;
	const hasDamage = Boolean((combat.damage && combat.damage > 0) || (combat.secondaryDamage && combat.secondaryDamage > 0));
	const outcomeTier: ActionOutcomeTier = hit === false ? 'FAILURE' : hasDamage ? 'SUCCESS_WITH_COST' : 'CLEAN_SUCCESS';
	const primaryTargetId = combat.targetIds[0] || combat.actorId;
	const collisionDamage = Number(combat.forcedMovement?.collisionDamage || combat.secondaryDamage || 0);
	const physical: string[] = [
		combat.mechanicalSummary,
		...(combat.targetHp || []).map((target) =>
			(target.targetDied ? 'Target ' : 'Target ') + target.targetId + (target.targetDied ? ' was defeated.' : ' remains at ' + target.hpCurrent + ' HP.'),
		),
	];
	const visible: string[] = [...physical];

	if (combat.healing && combat.healing > 0) {
		const healLine = `Restored ${combat.healing} health.`;
		physical.push(healLine);
		visible.push(healLine);
	}
	if (combat.conditionsApplied && combat.conditionsApplied.length > 0) {
		const appliedLine = `Applied condition${combat.conditionsApplied.length > 1 ? 's' : ''}: ${combat.conditionsApplied.join(', ')}.`;
		physical.push(appliedLine);
		visible.push(appliedLine);
	}
	if (combat.conditionsRemoved && combat.conditionsRemoved.length > 0) {
		const removedLine = `Removed condition${combat.conditionsRemoved.length > 1 ? 's' : ''}: ${combat.conditionsRemoved.join(', ')}.`;
		physical.push(removedLine);
		visible.push(removedLine);
	}
	if (combat.forcedMovement?.moved) {
		const distFeet = combat.forcedMovement.distanceFeet ?? (combat.forcedMovement.distanceCells ? combat.forcedMovement.distanceCells * 5 : undefined);
		const moveLine = `Target was forced to move${distFeet ? ' ' + distFeet + ' feet' : ''}${combat.forcedMovement.destination ? ' to ' + combat.forcedMovement.destination : ''}.`;
		physical.push(moveLine);
		visible.push(moveLine);
	}
	if (combat.forcedMovement?.collided || collisionDamage > 0) {
		const obstacleText = combat.forcedMovement?.obstacleName ? ` with ${combat.forcedMovement.obstacleName}` : '';
		const damageText = collisionDamage > 0 ? ` for ${collisionDamage} collision damage` : '';
		const collisionLine = `Target collided${obstacleText}${damageText}.`;
		physical.push(collisionLine);
		visible.push(collisionLine);
	}
	if (combat.concentration?.brokenPreviousSpellName) {
		visible.push(`Previous concentration on ${combat.concentration.brokenPreviousSpellName} ended.`);
	}
	if (combat.concentration?.establishedSpellName) {
		visible.push(`Concentration established on ${combat.concentration.establishedSpellName}.`);
	}
	if (combat.concentration?.targetBrokenSpellName) {
		const brokenLine = `Target lost concentration on ${combat.concentration.targetBrokenSpellName}.`;
		physical.push(brokenLine);
		visible.push(brokenLine);
	}
	if (combat.concentration?.targetMaintainedConcentration) {
		visible.push('Target maintained concentration despite the hit.');
	}

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
			...(combat.damage && combat.damage > 0 ? (combat.targetIds.length ? combat.targetIds : [primaryTargetId]).map((targetId) => ({
				kind: 'COMBAT_DAMAGE',
				targetId,
				value: { damage: combat.damage },
				metadata: { source: 'combat_canonical_resolution' },
			})) : []),
			...(collisionDamage > 0 ? [{
				kind: 'COMBAT_COLLISION_DAMAGE',
				targetId: primaryTargetId,
				value: { damage: collisionDamage, obstacleName: combat.forcedMovement?.obstacleName },
				metadata: { source: 'combat_canonical_resolution' },
			}] : []),
			...(combat.healing && combat.healing > 0 ? [{
				kind: 'COMBAT_HEALING',
				targetId: primaryTargetId,
				value: { healing: combat.healing },
				metadata: { source: 'combat_canonical_resolution' },
			}] : []),
			...(combat.conditionsApplied || []).map((condition) => ({
				kind: 'COMBAT_CONDITION_APPLIED',
				targetId: primaryTargetId,
				value: { condition },
				metadata: { source: 'combat_canonical_resolution' },
			})),
			...(combat.conditionsRemoved || []).map((condition) => ({
				kind: 'COMBAT_CONDITION_REMOVED',
				targetId: primaryTargetId,
				value: { condition },
				metadata: { source: 'combat_canonical_resolution' },
			})),
			...(combat.forcedMovement?.moved || combat.forcedMovement?.collided ? [{
				kind: 'COMBAT_FORCED_MOVEMENT',
				targetId: primaryTargetId,
				value: {
					moved: Boolean(combat.forcedMovement.moved),
					distanceFeet: combat.forcedMovement.distanceFeet ?? (combat.forcedMovement.distanceCells ? combat.forcedMovement.distanceCells * 5 : undefined),
					destination: combat.forcedMovement.destination,
					collided: Boolean(combat.forcedMovement.collided),
					obstacleName: combat.forcedMovement.obstacleName,
					collisionDamage: collisionDamage > 0 ? collisionDamage : undefined,
				},
				metadata: { source: 'combat_canonical_resolution' },
			}] : []),
			...(combat.concentration && (
				combat.concentration.establishedSpellName ||
				combat.concentration.brokenPreviousSpellName ||
				combat.concentration.targetBrokenSpellName ||
				combat.concentration.targetMaintainedConcentration
			) ? [{
				kind: 'COMBAT_CONCENTRATION',
				targetId: combat.concentration.targetBrokenSpellName || combat.concentration.targetMaintainedConcentration ? primaryTargetId : combat.actorId,
				value: { ...combat.concentration },
				metadata: { source: 'combat_canonical_resolution' },
			}] : []),
			...(combat.targetHp || []).filter((target) => target.targetDied).map((target) => ({
				kind: 'COMBAT_DEFEAT',
				targetId: target.targetId,
				value: { defeated: true },
				metadata: { source: 'combat_canonical_resolution' },
			})),
		],
		physicalConsequences: uniqueResolutionStrings(physical),
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
	return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, 12);
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