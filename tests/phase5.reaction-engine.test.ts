import assert from 'node:assert/strict';
import test from 'node:test';

import { CombatReactionEngine } from '../server/domain/combatReactionEngine';

test('Phase 5: generic reaction adjudicator filters triggers and orders eligible reactions deterministically', () => {
	const engine = new CombatReactionEngine();
	const calls: string[] = [];

	const results = engine.resolve(
		{ type: 'ACTOR_ATTACKED', actorId: 'attacker', targetId: 'target' },
		[
			{
				reactionId: 'late',
				actorId: 'zeta',
				priority: 0,
				triggerType: 'ACTOR_ATTACKED',
				resolve: () => {
					calls.push('zeta');
					return { triggered: true };
				},
			},
			{
				reactionId: 'early',
				actorId: 'alpha',
				priority: 10,
				triggerType: 'ACTOR_ATTACKED',
				resolve: () => {
					calls.push('alpha');
					return { triggered: true };
				},
			},
			{
				reactionId: 'wrong-trigger',
				actorId: 'beta',
				priority: 100,
				triggerType: 'TARGET_ENTERED_REACH',
				resolve: () => {
					calls.push('wrong');
					return { triggered: true };
				},
			},
		]
	);

	assert.deepEqual(calls, ['alpha', 'zeta']);
	assert.deepEqual(results.map((result) => result.actorId), ['alpha', 'zeta']);
});

test('Phase 5: generic reaction adjudicator respects explicit eligibility checks', () => {
	const engine = new CombatReactionEngine();
	let calls = 0;

	const results = engine.resolve(
		{ type: 'CUSTOM', actorId: 'source' },
		[
			{
				reactionId: 'ineligible',
				actorId: 'reactor_a',
				priority: 100,
				triggerType: 'CUSTOM',
				canResolve: () => false,
				resolve: () => { calls++; return { triggered: true }; },
			},
			{
				reactionId: 'eligible',
				actorId: 'reactor_b',
				priority: 0,
				triggerType: 'CUSTOM',
				canResolve: () => true,
				resolve: () => { calls++; return { triggered: true }; },
			},
		]
	);

	assert.equal(calls, 1);
	assert.deepEqual(results.map((result) => result.actorId), ['reactor_b']);
});

test('Phase 5: one actor cannot resolve two reactions from the same trigger event', () => {
	const engine = new CombatReactionEngine();
	let count = 0;

	const results = engine.resolve(
		{ type: 'CUSTOM', actorId: 'actor' },
		[
			{
				reactionId: 'first',
				actorId: 'reactor',
				priority: 10,
				triggerType: 'CUSTOM',
				resolve: () => {
					count++;
					return { triggered: true };
				},
			},
			{
				reactionId: 'second',
				actorId: 'reactor',
				priority: 0,
				triggerType: 'CUSTOM',
				resolve: () => {
					count++;
					return { triggered: true };
				},
			},
		]
	);

	assert.equal(count, 1);
	assert.equal(results.length, 1);
});