import type { WorldRepository } from '../repositories/worldRepository';
import { LocalDiceEngine } from './combatEngine';
import { hashStringToSeed } from './deterministicRng';

export interface EnvironmentalHazardResolution {
	success: boolean;
	applied: boolean;
	hazardType: 'FALL' | 'TRAP' | 'DEBRIS' | 'POISON' | 'FIRE' | 'OTHER';
	distanceFeet?: number;
	damageFormula?: string;
	damage?: {
		rolledAmount: number;
		finalAmount: number;
		healthCurrent: number;
		damageType: string;
		targetDied: boolean;
	};
	errorReason?: string;
}

export class EnvironmentalHazardEngine {
	public resolveFall(params: {
		repository: WorldRepository;
		storyId: string;
		actorId: string;
		distanceFeet: number;
	}): EnvironmentalHazardResolution {
		const distanceFeet = Math.max(0, Number(params.distanceFeet) || 0);
		if (distanceFeet < 10) {
			return { success: true, applied: false, hazardType: 'FALL', distanceFeet };
		}

		const diceCount = Math.min(20, Math.max(1, Math.ceil(distanceFeet / 10)));
		const damageFormula = diceCount + 'd6';
		const dice = new LocalDiceEngine(
			hashStringToSeed('environmental-fall::' + params.storyId + '::' + params.actorId + '::' + distanceFeet)
		);
		const roll = dice.roll(damageFormula, 0);
		const resolved = params.repository
			.getConditionEngine(params.storyId)
			.resolveDamage(params.actorId, roll.total, 'fall');

		return {
			success: true,
			applied: true,
			hazardType: 'FALL',
			distanceFeet,
			damageFormula,
			damage: {
			rolledAmount: roll.total,
			finalAmount: resolved.finalAmount,
			healthCurrent: resolved.healthCurrent,
			damageType: resolved.damageType,
			targetDied: resolved.targetDied,
		},
		};
	}
}

export const environmentalHazardEngine = new EnvironmentalHazardEngine();
