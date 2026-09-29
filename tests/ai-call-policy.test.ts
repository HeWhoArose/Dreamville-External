import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AiCallBudget, decideAiHelperNeed, inferAiCallPolicyMode } from '../server/domain/aiCallPolicy';
import { evaluateAiTaskReadiness, getAiTaskContract, MultiModelOrchestrator } from '../server/domain/aiOrchestrator';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';

test('AI call policy keeps ordinary and canonical mechanics deterministic', () => {
	assert.equal(inferAiCallPolicyMode({ itemKnown: true }), 'DETERMINISTIC_MECHANICS');
	assert.equal(inferAiCallPolicyMode({ hasCanonicalCapability: true, explicitCapabilitySyntax: true }), 'DETERMINISTIC_MECHANICS');
	assert.equal(inferAiCallPolicyMode({ requiresCheckOrHazardInterpretation: true }), 'INTERPRETATION');
	assert.equal(inferAiCallPolicyMode({ explicitCapabilitySyntax: true }), 'NOVEL_CAPABILITY');
	assert.equal(inferAiCallPolicyMode({ ambiguousLanguage: true }), 'INTERPRETATION');
	assert.equal(inferAiCallPolicyMode({ semanticNoveltyRequested: true }), 'NOVEL_CAPABILITY');
	assert.equal(inferAiCallPolicyMode({ compoundAction: true }), 'INTERPRETATION');
	assert.equal(inferAiCallPolicyMode({}), 'NARRATION_ONLY');
});

test('scenario selection uses the minimum helper class and reserves adaptation only for semantic novelty', () => {
	assert.equal(decideAiHelperNeed({ itemKnown: true }).maxHelperCalls, 0);
	assert.equal(decideAiHelperNeed({ hasCanonicalCapability: true }).maxHelperCalls, 0);
	assert.equal(decideAiHelperNeed({ requiresCheckOrHazardInterpretation: true }).maxHelperCalls, 2);
	assert.equal(decideAiHelperNeed({ ambiguousLanguage: true }).strategy, 'INTERPRET_ONCE');
	assert.equal(decideAiHelperNeed({ explicitCapabilitySyntax: true }).maxHelperCalls, 4);
	assert.equal(decideAiHelperNeed({ unknownUseTarget: true }).maxHelperCalls, 4);
	assert.equal(decideAiHelperNeed({ semanticNoveltyRequested: true, compoundAction: true }).maxHelperCalls, 4);
	assert.equal(decideAiHelperNeed({ itemKnown: true, compoundAction: true }).strategy, 'INTERPRET_ONCE');
});

test('interpretation mode allows one required interpretation and one repair only when the caller explicitly advances the stage', () => {
	const budget = new AiCallBudget('INTERPRETATION');

	const first = budget.authorize('intent.interpret', 700, 'INTENT_INTERPRET');
	assert.equal(first.allowed, true);
	assert.equal(first.maxTokens, 400);

	const prematureRepair = budget.authorize('intent.interpret', 350, 'SEMANTIC_REPAIR');
	assert.equal(prematureRepair.allowed, false);

	const repair = budget.authorize('intent.interpret', 350, 'SEMANTIC_REPAIR');
	assert.equal(repair.allowed, true);
	assert.equal(repair.maxTokens, 400);

	const third = budget.authorize('intent.interpret', 350, 'SEMANTIC_REPAIR');
	assert.equal(third.allowed, false);
	assert.match(third.reason, /next authorized stage|budget exhausted/i);

	const forbidden = budget.authorize('rules.analyze', 500, 'SEMANTIC_REPAIR');
	assert.equal(forbidden.allowed, false);

	const snapshot = budget.snapshot();
	assert.equal(snapshot.helperCallsUsed, 2);
	assert.equal(snapshot.maxHelperCalls, 2);
	assert.equal(snapshot.maxHelperOutputTokens, 800);
	assert.equal(snapshot.callHistory.filter((entry) => entry.allowed).length, 2);
	assert.equal(snapshot.callHistory[0]?.role, 'INTENT_INTERPRET');
	assert.equal(snapshot.callHistory[1]?.role, 'SEMANTIC_REPAIR');
});

test('novel capability mode is stage-gated: intent -> synthesize -> repair -> synthesize, never maximum-by-default', () => {
	const budget = new AiCallBudget('NOVEL_CAPABILITY');

	assert.equal(budget.authorize('intent.interpret', 350, 'INTENT_INTERPRET').allowed, true);
	assert.equal(budget.authorize('capability.synthesize', 850, 'CAPABILITY_SYNTHESIZE').allowed, true);

	const wrongThirdStage = budget.authorize('capability.synthesize', 850, 'CAPABILITY_SYNTHESIZE');
	assert.equal(wrongThirdStage.allowed, false);
	assert.match(wrongThirdStage.reason, /next authorized stage/i);

	assert.equal(budget.authorize('intent.interpret', 350, 'SEMANTIC_REPAIR').allowed, true);
	assert.equal(budget.authorize('capability.synthesize', 850, 'CAPABILITY_SYNTHESIZE').allowed, true);

	const fifth = budget.authorize('capability.synthesize', 850, 'CAPABILITY_SYNTHESIZE');
	assert.equal(fifth.allowed, false);

	const forbiddenResearch = budget.authorize('research.query', 900);
	assert.equal(forbiddenResearch.allowed, false);

	const snapshot = budget.snapshot();
	assert.equal(snapshot.helperCallsUsed, 4);
	assert.equal(snapshot.maxHelperCalls, 4);
	assert.equal(snapshot.helperOutputTokensUsed, 2500);
	assert.deepEqual(snapshot.allowedTasks, ['intent.interpret', 'capability.synthesize']);
	assert.deepEqual(
		snapshot.callHistory.filter((entry) => entry.allowed).map((entry) => entry.role),
		['INTENT_INTERPRET', 'CAPABILITY_SYNTHESIZE', 'SEMANTIC_REPAIR', 'CAPABILITY_SYNTHESIZE'],
	);
});

test('deterministic modes cannot be pushed into helper calls', () => {
	for (const mode of ['NARRATION_ONLY', 'DETERMINISTIC_MECHANICS'] as const) {
		const budget = new AiCallBudget(mode);
		const result = budget.authorize('intent.interpret', 350, 'INTENT_INTERPRET');
		assert.equal(result.allowed, false);
		assert.equal(budget.snapshot().helperCallsUsed, 0);
	}
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

test('production helper routes are complete and route models are contract-compatible', () => {
	const configPath = path.resolve(process.cwd(), 'server', 'data', 'orchestrator_config.json');
	const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
		fallbackChains?: Record<string, string[]>;
	};
	const orchestrator = new MultiModelOrchestrator();

	for (const task of ['intent.interpret', 'capability.synthesize'] as const) {
		const route = config.fallbackChains?.[task] || [];
		assert.ok(route.length >= 3, task + ' must have a real AI fallback route plus emergency floor');
		assert.ok(route.at(-1)?.includes('emergency-fallback-local'), task + ' must terminate at deterministic emergency floor');

		const contract = getAiTaskContract(task);
		const primaryKey = route.find((key) => !key.includes('emergency-fallback-local'));
		assert.ok(primaryKey, task + ' must have a non-emergency primary');

		for (const key of route.filter((value) => !value.includes('emergency-fallback-local'))) {
			const separator = key.indexOf('::');
			assert.ok(separator > 0, task + ' route entry must identify provider and model: ' + key);
			const providerId = key.slice(0, separator);
			const modelId = key.slice(separator + 2);
			const model = orchestrator.getModel(providerId, modelId);
			assert.ok(model, 'Configured route model must be registered: ' + key);
			assert.ok(model?.roleEligibility.includes(task), key + ' must be eligible for ' + task);
			assert.ok(orchestrator.getAdapter(providerId), 'Configured route provider must have an adapter: ' + providerId);

			const readiness = evaluateAiTaskReadiness(task, model!);
			assert.equal(readiness.capabilityCompatible, true, key + ' must satisfy the task capability contract');
			assert.equal(readiness.contextCompatible, true, key + ' must satisfy the context contract');
		}

		const primary = primaryKey!;
		const separator = primary.indexOf('::');
		const primaryModel = orchestrator.getModel(primary.slice(0, separator), primary.slice(separator + 2));
		assert.ok(primaryModel);
		assert.ok(contract.preferredPools.includes(primaryModel!.pool), task + ' primary pool must match the task contract');
	}
});
