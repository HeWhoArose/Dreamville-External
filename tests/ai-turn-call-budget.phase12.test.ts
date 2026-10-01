import test from 'node:test';
import assert from 'node:assert/strict';
import { AiTurnCallBudget } from '../server/domain/aiTurnCallBudget';

test('Phase 12 budget allows one logical intent call and records fallback provider attempts', () => {
	const budget = new AiTurnCallBudget();
	assert.equal(budget.beginTask('intent.interpret').allowed, true);
	budget.recordProviderAttempt('intent.interpret');
	budget.recordProviderAttempt('intent.interpret');
	const snapshot = budget.snapshot();
	assert.equal(snapshot.logicalCallsByTask['intent.interpret'], 1);
	assert.equal(snapshot.providerAttemptsByTask['intent.interpret'], 2);
	assert.equal(snapshot.totalLogicalCalls, 1);
	assert.equal(snapshot.totalProviderAttempts, 2);
});

test('Phase 12 budget blocks a duplicate logical task without blocking provider fallback attempts inside the first call', () => {
	const budget = new AiTurnCallBudget();
	assert.equal(budget.beginTask('narrative.generate').allowed, true);
	budget.recordProviderAttempt('narrative.generate');
	budget.recordProviderAttempt('narrative.generate');
	const second = budget.beginTask('narrative.generate');
	assert.equal(second.allowed, false);
	assert.match(second.reason || '', /budget exhausted/i);
	const snapshot = budget.snapshot();
	assert.equal(snapshot.logicalCallsByTask['narrative.generate'], 1);
	assert.equal(snapshot.providerAttemptsByTask['narrative.generate'], 2);
	assert.equal(snapshot.blockedTasks.length, 1);
});

test('Phase 12 budget keeps independent task budgets independent', () => {
	const budget = new AiTurnCallBudget();
	assert.equal(budget.beginTask('intent.interpret').allowed, true);
	assert.equal(budget.beginTask('narrative.generate').allowed, true);
	assert.equal(budget.beginTask('narrative.review').allowed, true);
	const snapshot = budget.snapshot();
	assert.equal(snapshot.totalLogicalCalls, 3);
});
