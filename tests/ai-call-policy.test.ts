import test from 'node:test';
import assert from 'node:assert/strict';
import { AiCallBudget, decideAiHelperNeed, inferAiCallPolicyMode } from '../server/domain/aiCallPolicy';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { DeterministicMockAdapter, MultiModelOrchestrator, type ModelRegistryRecord } from '../server/domain/aiOrchestrator';
import { getAiTaskContract } from '../server/domain/aiTaskContracts';

test('AI call policy keeps ordinary and canonical mechanics deterministic', () => {
	assert.equal(inferAiCallPolicyMode({ itemKnown: true }), 'DETERMINISTIC_MECHANICS');
	assert.equal(inferAiCallPolicyMode({ hasCanonicalCapability: true, explicitCapabilitySyntax: true }), 'DETERMINISTIC_MECHANICS');
	assert.equal(inferAiCallPolicyMode({ requiresCheckOrHazardInterpretation: true }), 'INTERPRETATION');
	assert.equal(inferAiCallPolicyMode({ explicitCapabilitySyntax: true }), 'NOVEL_CAPABILITY');
	assert.equal(inferAiCallPolicyMode({ ambiguousLanguage: true }), 'INTERPRETATION');
	assert.equal(inferAiCallPolicyMode({ compoundAction: true }), 'INTERPRETATION');
	assert.equal(inferAiCallPolicyMode({ itemKnown: true, compoundAction: true }), 'INTERPRETATION');
});

test('interpretation mode allows one required interpretation and a second repair only when justified', () => {
	const budget = new AiCallBudget('INTERPRETATION');
	const first = budget.authorize('intent.interpret', 700, 'INTENT_INTERPRET');
	assert.equal(first.allowed, true);
	assert.equal(first.maxTokens, 400);

	const premature = budget.authorize('intent.interpret', 350, 'SEMANTIC_REPAIR');
	assert.equal(premature.allowed, true);
	assert.equal(premature.maxTokens, 400);

	const third = budget.authorize('intent.interpret', 350, 'SEMANTIC_REPAIR');
	assert.equal(third.allowed, false);
	assert.match(third.reason, /budget exhausted|next authorized stage|permitted yet/i);

	const forbidden = budget.authorize('rules.analyze', 500, 'SEMANTIC_REPAIR');
	assert.equal(forbidden.allowed, false);

	const snapshot = budget.snapshot();
	assert.equal(snapshot.helperCallsUsed, 2);
	assert.equal(snapshot.maxHelperCalls, 2);
	assert.equal(snapshot.maxHelperOutputTokens, 800);
	assert.deepEqual(snapshot.usedRoles, ['INTENT_INTERPRET', 'SEMANTIC_REPAIR']);
	assert.equal(snapshot.callHistory.filter((entry) => entry.allowed).length, 2);
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
		2,
	);
	assert.equal(
		decideAiHelperNeed({ semanticNoveltyRequested: true }).maxHelperCalls,
		4,
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

test('helper callers execute through the configured task route and adapter before fallback', async () => {
	const orchestrator = new MultiModelOrchestrator();
	const intentModel: ModelRegistryRecord = {
		providerId: 'audit_intent_primary',
		modelId: 'intent-primary',
		displayName: 'Intent Primary',
		pool: 'fast',
		capabilities: ['text_generation', 'structured_output', 'fast'],
		contextWindow: 32768,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 5,
		userPriority: 100,
		roleEligibility: ['intent.interpret'],
		fallbackEligibility: true,
		isEmergencyFloor: false,
		accessStatus: 'accessible',
		lifecycleState: 'active',
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['text', 'json'],
	};
	const intentFallback: ModelRegistryRecord = {
		...intentModel,
		providerId: 'audit_intent_fallback',
		modelId: 'intent-fallback',
		userPriority: 90,
	};
	const capabilityModel: ModelRegistryRecord = {
		providerId: 'audit_capability_primary',
		modelId: 'capability-primary',
		displayName: 'Capability Primary',
		pool: 'reasoning',
		capabilities: ['text_generation', 'reasoning', 'structured_output'],
		contextWindow: 32768,
		health: 'Healthy' as const,
		quota: 'Healthy' as const,
		latencyMs: 5,
		userPriority: 100,
		roleEligibility: ['capability.synthesize'],
		fallbackEligibility: true,
		isEmergencyFloor: false,
		accessStatus: 'accessible' as const,
		lifecycleState: 'active' as const,
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['text', 'json'],
		hasStructuredOutput: true,
	};
	const intentAdapter = new DeterministicMockAdapter('audit_intent_primary');
	const intentFallbackAdapter = new DeterministicMockAdapter('audit_intent_fallback');
	const capabilityAdapter = new DeterministicMockAdapter('audit_capability_primary');

	orchestrator.registerModel(intentModel);
	orchestrator.registerModel(intentFallback);
	orchestrator.registerModel(capabilityModel);
	orchestrator.registerAdapter(intentAdapter);
	orchestrator.registerAdapter(intentFallbackAdapter);
	orchestrator.registerAdapter(capabilityAdapter);
	orchestrator.setFallbackChain('intent.interpret', [
		'audit_intent_primary::intent-primary',
		'audit_intent_fallback::intent-fallback',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.setFallbackChain('capability.synthesize', [
		'audit_capability_primary::capability-primary',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);

	const intentResult = await orchestrator.executeTaskGeneration(
		'intent.interpret',
		'{"action":"hide behind the pillar"}',
		'Return a compact intent.',
		{ timeoutMs: 2000, maxTokens: 100 },
	);
	assert.equal(intentResult.providerId, 'audit_intent_primary');
	assert.equal(intentResult.modelId, 'intent-primary');
	assert.equal(intentResult.source, 'AI_PRIMARY');
	assert.deepEqual(intentAdapter.callHistory.map((entry) => entry.task), ['intent.interpret']);
	assert.equal(intentFallbackAdapter.callHistory.length, 0);

	const capabilityResult = await orchestrator.executeTaskGeneration(
		'capability.synthesize',
		'{"action":"shape a novel ward"}',
		'Return a capability proposal.',
		{ timeoutMs: 2000, maxTokens: 100 },
	);
	assert.equal(capabilityResult.providerId, 'audit_capability_primary');
	assert.equal(capabilityResult.modelId, 'capability-primary');
	assert.equal(capabilityResult.source, 'AI_PRIMARY');
	assert.deepEqual(capabilityAdapter.callHistory.map((entry) => entry.task), ['capability.synthesize']);
});


test('helper task fallback preserves task authority and reaches the next compatible model before emergency floor', async () => {
	const orchestrator = new MultiModelOrchestrator();
	const primary: ModelRegistryRecord = {
		providerId: 'audit_helper_primary',
		modelId: 'primary',
		displayName: 'Helper Primary',
		pool: 'fast',
		capabilities: ['text_generation', 'structured_output', 'fast'],
		contextWindow: 32768,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 5,
		userPriority: 100,
		roleEligibility: ['intent.interpret'],
		fallbackEligibility: true,
		isEmergencyFloor: false,
		accessStatus: 'accessible',
		lifecycleState: 'active',
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['text', 'json'],
	};
	const fallback: ModelRegistryRecord = {
		...primary,
		providerId: 'audit_helper_fallback',
		modelId: 'fallback',
		userPriority: 90,
	};
	const primaryAdapter = new DeterministicMockAdapter('audit_helper_primary');
	primaryAdapter.failureMode = '500';
	primaryAdapter.maxFailuresBeforeSuccess = 1;
	const fallbackAdapter = new DeterministicMockAdapter('audit_helper_fallback');

	orchestrator.registerModel(primary);
	orchestrator.registerModel(fallback);
	orchestrator.registerAdapter(primaryAdapter);
	orchestrator.registerAdapter(fallbackAdapter);
	orchestrator.setFallbackChain('intent.interpret', [
		'audit_helper_primary::primary',
		'audit_helper_fallback::fallback',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);

	const result = await orchestrator.executeTaskGeneration(
		'intent.interpret',
		'{"action":"climb the broken stairs"}',
		'Return a compact intent JSON object.',
		{ timeoutMs: 2000, maxTokens: 100 },
	);

	assert.equal(result.providerId, 'audit_helper_fallback');
	assert.equal(result.modelId, 'fallback');
	assert.equal(result.source, 'AI_FALLBACK');
	assert.equal(primaryAdapter.callHistory.length, 1);
	assert.equal(fallbackAdapter.callHistory.length, 1);
	assert.deepEqual(fallbackAdapter.callHistory.map((entry) => entry.task), ['intent.interpret']);
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
