import test from 'node:test';
import assert from 'node:assert/strict';
import { AiCallBudget, decideAiHelperNeed, inferAiCallPolicyMode } from '../server/domain/aiCallPolicy';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';
import { getAiTaskContract } from '../server/domain/aiTaskContracts';

test('AI call policy keeps ordinary and canonical mechanics deterministic', () => {
	assert.equal(inferAiCallPolicyMode({ itemKnown: true }), 'DETERMINISTIC_MECHANICS');
	assert.equal(inferAiCallPolicyMode({ hasCanonicalCapability: true, explicitCapabilitySyntax: true }), 'DETERMINISTIC_MECHANICS');
	assert.equal(inferAiCallPolicyMode({ requiresCheckOrHazardInterpretation: true }), 'INTERPRETATION');
	assert.equal(inferAiCallPolicyMode({ explicitCapabilitySyntax: true }), 'NOVEL_CAPABILITY');
	assert.equal(inferAiCallPolicyMode({ ambiguousLanguage: true }), 'NARRATION_ONLY');
	assert.equal(inferAiCallPolicyMode({ compoundAction: true }), 'INTERPRETATION');
	assert.equal(inferAiCallPolicyMode({ itemKnown: true, compoundAction: true }), 'INTERPRETATION');
});

test('interpretation mode permits exactly one small helper call', () => {
	const budget = new AiCallBudget('INTERPRETATION');
	const first = budget.authorize('intent.interpret', 700, 'INTENT_INTERPRET');
	assert.equal(first.allowed, true);
	assert.equal(first.maxTokens, 400);

	const second = budget.authorize('intent.interpret', 350, 'INTENT_INTERPRET');
	assert.equal(second.allowed, false);
	assert.match(second.reason, /may only execute once|budget exhausted/i);

	const forbidden = budget.authorize('rules.analyze', 500, 'INTENT_INTERPRET');
	assert.equal(forbidden.allowed, false);

	const snapshot = budget.snapshot();
	assert.equal(snapshot.helperCallsUsed, 1);
	assert.equal(snapshot.maxHelperCalls, 1);
	assert.equal(snapshot.maxHelperOutputTokens, 400);
	assert.deepEqual(snapshot.usedRoles, ['INTENT_INTERPRET']);
	assert.equal(snapshot.blockedTasks.length, 2);
});

test('adaptive novel capability mode is bounded at four roles and never defaults to four calls', () => {
	const budget = new AiCallBudget('NOVEL_CAPABILITY');

	const intent = budget.authorize('intent.interpret', 350, 'INTENT_INTERPRET');
	assert.equal(intent.allowed, true);
	assert.equal(intent.maxTokens, 350);

	const synthesis = budget.authorize('capability.synthesize', 850, 'CAPABILITY_SYNTHESIZE');
	assert.equal(synthesis.allowed, true);
	assert.equal(synthesis.maxTokens, 850);

	const repair = budget.authorize('capability.synthesize', 850, 'SEMANTIC_REPAIR');
	assert.equal(repair.allowed, true);
	assert.equal(repair.maxTokens, 850);

	const alternative = budget.authorize('capability.synthesize', 850, 'ALTERNATIVE_SYNTHESIZE');
	assert.equal(alternative.allowed, true);
	assert.equal(alternative.maxTokens, 850);

	const fifth = budget.authorize('capability.synthesize', 100, 'ALTERNATIVE_SYNTHESIZE');
	assert.equal(fifth.allowed, false);
	assert.match(fifth.reason, /may only execute once|budget exhausted/i);

	const advisory = budget.authorize('research.query', 900, 'CAPABILITY_SYNTHESIZE');
	assert.equal(advisory.allowed, false);

	const wrongOrder = new AiCallBudget('NOVEL_CAPABILITY');
	assert.equal(wrongOrder.authorize('capability.synthesize', 850, 'CAPABILITY_SYNTHESIZE').allowed, false);

	const snapshot = budget.snapshot();
	assert.equal(snapshot.helperCallsUsed, 4);
	assert.equal(snapshot.maxHelperCalls, 4);
	assert.equal(snapshot.maxHelperOutputTokens, 3000);
	assert.deepEqual(snapshot.usedRoles, [
		'INTENT_INTERPRET',
		'CAPABILITY_SYNTHESIZE',
		'SEMANTIC_REPAIR',
		'ALTERNATIVE_SYNTHESIZE',
	]);
});

test('helper selection is deliberate: clear actions get none, ambiguity gets one, novel capability gets adaptive room', () => {
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
		decideAiHelperNeed({ ambiguousLanguage: true }).strategy,
		'INTERPRET_ONCE',
	);
	assert.equal(
		decideAiHelperNeed({ ambiguousLanguage: true }).maxHelperCalls,
		1,
	);
	assert.equal(
		decideAiHelperNeed({ compoundAction: true }).mode,
		'INTERPRETATION',
	);
	assert.equal(
		decideAiHelperNeed({ explicitCapabilitySyntax: true }).strategy,
		'INTERPRET_SYNTHESIZE_AND_REPAIR',
	);
	assert.equal(
		decideAiHelperNeed({ explicitCapabilitySyntax: true }).maxHelperCalls,
		4,
	);
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

test('helper callers use the task-specific routes and each primary route model is contract-compatible', () => {
	const orchestrator = new MultiModelOrchestrator();

	const states = orchestrator.getCategoryRuntimeStates();
	const findRoute = (task: 'intent.interpret' | 'capability.synthesize') => {
		const category = states.find((state) => state.tasks.includes(task));
		assert.ok(category, `Missing runtime category for ${task}`);
		const route = category.taskRoutes.find((entry) => entry.task === task);
		assert.ok(route, `Missing runtime task route for ${task}`);
		return route;
	};

	const intentRoute = findRoute('intent.interpret');
	assert.equal(intentRoute.fallbackChain[0], 'google_gemini::gemini-3.5-flash-lite');
	assert.equal(intentRoute.fallbackChain[intentRoute.fallbackChain.length - 1], 'provider_deterministic_emergency::emergency-fallback-local');

	const capabilityRoute = findRoute('capability.synthesize');
	assert.equal(capabilityRoute.fallbackChain[0], 'groq::openai/gpt-oss-120b');
	assert.equal(capabilityRoute.fallbackChain[capabilityRoute.fallbackChain.length - 1], 'provider_deterministic_emergency::emergency-fallback-local');

	for (const task of ['intent.interpret', 'capability.synthesize'] as const) {
		const contract = getAiTaskContract(task);
		const selected = orchestrator.selectBestModel(task, { contextTokens: 256 }).selectedModel;
		assert.ok(selected.roleEligibility.includes(task), `${task} selected an ineligible model`);
		assert.ok(contract.requiredCapabilities.every((capability) => selected.capabilities.includes(capability)), `${task} selected a model without required capabilities`);
		assert.ok(selected.supportedInputTypes?.includes('text'), `${task} selected a model that cannot accept text`);
		assert.ok(
			contract.requiredOutputTypes.every((outputType) => selected.supportedOutputTypes?.includes(outputType) || outputType === 'text'),
			`${task} selected a model with incompatible output support`,
		);
	}

	const intentSelected = orchestrator.selectBestModel('intent.interpret', { contextTokens: 256 }).selectedModel;
	assert.equal(intentSelected.providerId, 'google_gemini');
	assert.equal(intentSelected.modelId, 'gemini-3.5-flash-lite');

	const capabilitySelected = orchestrator.selectBestModel('capability.synthesize', { contextTokens: 256 }).selectedModel;
	assert.equal(capabilitySelected.providerId, 'google_gemini');
	assert.equal(capabilitySelected.modelId, 'gemini-3.5-flash');
});

test('deterministic callers remain blocked from helper-only roles', () => {
	const budget = new AiCallBudget('DETERMINISTIC_MECHANICS');
	for (const [task, role] of [
		['intent.interpret', 'INTENT_INTERPRET'],
		['capability.synthesize', 'CAPABILITY_SYNTHESIZE'],
		['capability.synthesize', 'SEMANTIC_REPAIR'],
		['capability.synthesize', 'ALTERNATIVE_SYNTHESIZE'],
	] as const) {
		const result = budget.authorize(task, 850, role);
		assert.equal(result.allowed, false);
	}
});
