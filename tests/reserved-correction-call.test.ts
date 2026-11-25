import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiTurnCallBudget } from '../server/domain/aiTurnCallBudget';

/**
 * Reference study: the guard's rewrite is held outside the turn's call budget, because the turns that need repair are the
 * busy ones, which end with their budget spent.
 */
test('a repair is allowed once from the reserve after its own task limit is used', () => {
	const budget = new AiTurnCallBudget();
	assert.equal(budget.beginTask('narrative.review').allowed, true);
	assert.equal(budget.beginTask('narrative.review').allowed, false, 'the normal limit is one logical call');

	const first = budget.beginCorrection('narrative.review');
	assert.deepEqual({ allowed: first.allowed, reserved: first.reserved }, { allowed: true, reserved: true });
	assert.equal(budget.reservedCorrectionsRemaining(), 0);

	const second = budget.beginCorrection('narrative.review');
	assert.equal(second.allowed, false, 'only one reserved correction per turn');
});

test('a correction inside its normal limit does not spend the reserve', () => {
	const budget = new AiTurnCallBudget();
	const correction = budget.beginCorrection('narrative.review');
	assert.deepEqual({ allowed: correction.allowed, reserved: correction.reserved }, { allowed: true, reserved: false });
	assert.equal(budget.reservedCorrectionsRemaining(), 1);
});

test('the reserved correction may make one provider request past the attempt caps; ordinary calls may not', () => {
	const budget = new AiTurnCallBudget(undefined, { perTurn: 2 });
	budget.recordProviderAttempt('narrative.generate');
	budget.recordProviderAttempt('narrative.generate');
	assert.equal(budget.canAttemptProvider('narrative.review').allowed, false, 'the turn cap is spent');
	assert.equal(budget.canAttemptProvider('narrative.review', { reserved: true }).allowed, false, 'the reserve must be claimed by beginCorrection first');

	budget.beginTask('narrative.review');
	const correction = budget.beginCorrection('narrative.review');
	assert.equal(correction.reserved, true);
	const attempt = budget.canAttemptProvider('narrative.review', { reserved: true });
	assert.equal(attempt.allowed, true);
	assert.equal(attempt.usedReserve, true);
	assert.equal(budget.canAttemptProvider('narrative.review', { reserved: true }).allowed, false, 'one request only');
});
