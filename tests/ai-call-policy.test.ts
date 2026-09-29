import test from 'node:test';
import assert from 'node:assert/strict';
import { AiCallBudget, decideAiHelperNeed, inferAiCallPolicyMode } from '../server/domain/aiCallPolicy';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';

test('AI call policy keeps ordinary and canonical mechanics deterministic', () => {
	assert.equal(inferAiCallPolicyMode({ itemKnown: true }), 'DETERMINISTIC_MECHANICS');
	assert.equal(inferAiCallPolicyMode({ hasCanonicalCapability: true, explicitCapabilitySyntax: true }), 'DETERMINISTIC_MECHANICS');
	assert.equal(inferAiCallPolicyMode({ requiresCheckOrHazardInterpretation: true }), 'INTERPRETATION');
	assert.equal(inferAiCallPolicyMode({ explicitCapabilitySyntax: true }), 'NOVEL_CAPABILITY');
	assert.equal(inferAiCallPolicyMode({}), 'NARRATION_ONLY');
});

test('interpretation mode permits exactly one small helper call', () => {
	const budget = new AiCallBudget('INTERPRETATION');
	const first = budget.authorize('intent.interpret', 700);
	assert.equal(first.allowed, true);
	assert.equal(first.maxTokens, 400);

	const second = budget.authorize('intent.interpret', 350);
	assert.equal(second.allowed, false);
	assert.match(second.reason, /budget exhausted/i);

	const forbidden = budget.authorize('rules.analyze', 500);
	assert.equal(forbidden.allowed, false);

	const snapshot = budget.snapshot();
	assert.equal(snapshot.helperCallsUsed, 1);
	assert.equal(snapshot.maxHelperCalls, 1);
	assert.equal(snapshot.maxHelperOutputTokens, 400);
	assert.equal(snapshot.blockedTasks.length, 2);
});

test('novel capability mode allows intent plus one synthesis call, but blocks advisory cascades', () => {
	const budget = new AiCallBudget('NOVEL_CAPABILITY');

	assert.equal(budget.authorize('intent.interpret', 350).allowed, true);
	assert.equal(budget.authorize('research.query', 900).allowed, false);
	assert.equal(budget.authorize('capability.synthesize', 850).allowed, true);
	assert.equal(budget.authorize('capability.explain', 700).allowed, false);

	const snapshot = budget.snapshot();
	assert.equal(snapshot.helperCallsUsed, 2);
	assert.equal(snapshot.maxHelperCalls, 2);
	assert.deepEqual(snapshot.allowedTasks, ['intent.interpret', 'capability.synthesize']);
});

test('F&F-style context normalization deduplicates overlapping blocks and assigns lifecycle metadata', () => {
	const blocks = WorkingContextEngine.normalizeContextBlocks([
		{
			id: 'knowledge-a',
			band: 'B5_SEMANTIC_LORE',
			label: 'Archival World Lore',
			content: 'The sealed gate opens only at moonrise.',
			estimatedTokens: 10,
			sourceAuthority: 'KnowledgeBase',
			relevanceScore: 0.4,
		},
		{
			id: 'knowledge-b',
			band: 'B3_CAUSAL_OPPORTUNITY',
			label: 'Research Result',
			content: 'The sealed gate opens only at moonrise.',
			estimatedTokens: 10,
			sourceAuthority: 'NarrativeContinuityEngine',
			relevanceScore: 0.9,
		},
	]);

	assert.equal(blocks.length, 1);
	assert.equal(blocks[0].band, 'B3_CAUSAL_OPPORTUNITY');
	assert.equal(blocks[0].blockType, 'LORE');
	assert.equal(blocks[0].blockStatus, 'ACTIVE');
	assert.equal(blocks[0].isProtected, false);
	assert.match(blocks[0].sourceAuthority || '', /NarrativeContinuityEngine/);
});



test('helper selection is deliberate: clear actions get none, ambiguity gets one, novel capability gets two', () => {
	assert.deepEqual(
		decideAiHelperNeed({ itemKnown: true }),
		{
			strategy: 'NONE',
			mode: 'DETERMINISTIC_MECHANICS',
			reason: 'The requested item is canonically identified; inventory resolution does not need an LLM.',
			maxHelperCalls: 0,
		},
	);
	assert.equal(
		decideAiHelperNeed({ requiresCheckOrHazardInterpretation: true }).strategy,
		'INTERPRET_ONCE',
	);
	assert.equal(
		decideAiHelperNeed({ explicitCapabilitySyntax: true }).strategy,
		'INTERPRET_THEN_SYNTHESIZE',
	);
	assert.equal(
		decideAiHelperNeed({ ambiguousLanguage: true }).strategy,
		'INTERPRET_ONCE',
	);
});
