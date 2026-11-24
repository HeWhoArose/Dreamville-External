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

test('provider attempt caps: narrative.generate allows 4 real requests, other tasks 3, then blocks with a reason', () => {
	const budget = new AiTurnCallBudget();
	for (let i = 0; i < 4; i++) {
		assert.equal(budget.canAttemptProvider('narrative.generate').allowed, true, `attempt ${i + 1} should be allowed`);
		budget.recordProviderAttempt('narrative.generate');
	}
	const blocked = budget.canAttemptProvider('narrative.generate');
	assert.equal(blocked.allowed, false);
	assert.match(blocked.reason || '', /provider attempt cap reached for narrative\.generate: 4\/4/i);

	for (let i = 0; i < 3; i++) {
		assert.equal(budget.canAttemptProvider('memory.extract').allowed, true);
		budget.recordProviderAttempt('memory.extract');
	}
	assert.equal(budget.canAttemptProvider('memory.extract').allowed, false);
});

test('provider attempt caps: a whole-turn ceiling applies across tasks and caps are configurable', () => {
	const budget = new AiTurnCallBudget(undefined, { perTurn: 5, defaultPerTask: 10, perTask: { 'narrative.generate': 10 } });
	for (let i = 0; i < 5; i++) {
		assert.equal(budget.canAttemptProvider(i % 2 ? 'intent.interpret' : 'narrative.generate').allowed, true);
		budget.recordProviderAttempt(i % 2 ? 'intent.interpret' : 'narrative.generate');
	}
	const decision = budget.canAttemptProvider('narrative.generate');
	assert.equal(decision.allowed, false);
	assert.match(decision.reason || '', /across all tasks/i);
});
