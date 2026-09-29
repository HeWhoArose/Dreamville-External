import test from 'node:test';
import assert from 'node:assert/strict';
import { EnvironmentalHazardEngine } from '../server/domain/environmentalHazardEngine';

test('fall damage uses canonical 1d6 per 10 feet up to 20d6', () => {
	const calls: any[] = [];
	const repository = {
		getConditionEngine: () => ({
			resolveDamage: (actorId: string, amount: number, damageType: string) => {
				calls.push({ actorId, amount, damageType });
				return {
					requestedAmount: amount,
					finalAmount: amount,
					damageType,
					immune: false,
					resisted: false,
					vulnerable: false,
					healthCurrent: 7,
					targetDied: false,
					destroyedBodyRegions: [],
				};
			},
		}),
	} as any;

	const engine = new EnvironmentalHazardEngine();
	const result = engine.resolveFall({
		repository,
		storyId: 'story_1',
		actorId: 'actor_1',
		distanceFeet: 30,
	});

	assert.equal(result.success, true);
	assert.equal(result.applied, true);
	assert.equal(result.damageFormula, '3d6');
	assert.equal(calls.length, 1);
	assert.equal(calls[0].damageType, 'fall');
});

test('falls shorter than ten feet do not create automatic damage', () => {
	const repository = {
		getConditionEngine: () => ({
			resolveDamage: () => {
				throw new Error('should not resolve damage');
			},
		}),
	} as any;

	const result = new EnvironmentalHazardEngine().resolveFall({
		repository,
		storyId: 'story_1',
		actorId: 'actor_1',
		distanceFeet: 5,
	});

	assert.equal(result.applied, false);
});
