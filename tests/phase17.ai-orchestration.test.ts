import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';
import { getAiTaskContract, getAllAiTaskContracts } from '../server/domain/aiTaskContracts';

test('Phase 17 AI orchestration contracts cover every new intelligence category', () => {
	const expected: Array<[string, string]> = [
		['intent.interpret', 'intent_interpretation'],
		['capability.synthesize', 'capability_synthesis'],
		['capability.explain', 'capability_explanation'],
		['research.query', 'research'],
		['research.world-brief', 'research'],
		['rules.analyze', 'rule_analysis'],
		['tactical.reason', 'tactical_reasoning'],
		['narrative.generate', 'narration'],
		['summary.scene', 'summarization'],
		['world.generate', 'world_generation'],
	];

	for (const [task, category] of expected) {
		const contract = getAiTaskContract(task as any);
		assert.equal(contract.task, task);
		assert.equal(contract.category, category);
		assert.ok(contract.requiredCapabilities.length > 0);
		assert.ok(contract.defaultTimeoutMs > 0);
		assert.ok(contract.defaultMaxTokens > 0);
	}
});

test('Phase 17 AI orchestration categories are isolated and independently routable', () => {
	const orchestrator = new MultiModelOrchestrator();
	const categories = orchestrator.getCategoryRuntimeStates();
	const byCategory = new Map(categories.map((entry) => [entry.category, entry]));

	for (const category of [
		'intent_interpretation',
		'capability_synthesis',
		'capability_explanation',
		'research',
		'tactical_reasoning',
		'rules',
		'rule_analysis',
		'narration',
		'summarization',
		'world_generation',
	]) {
		const state = byCategory.get(category as any);
		assert.ok(state, 'Missing category runtime state: ' + category);
		assert.ok(state!.tasks.length > 0, 'Category has no task bindings: ' + category);
		assert.ok(state!.fallbackChain.length > 0, 'Category has no fallback chain: ' + category);
	}
});

test('Phase 17 every new AI task has a fallback path ending in deterministic recovery', () => {
	const orchestrator = new MultiModelOrchestrator();
	for (const contract of getAllAiTaskContracts()) {
		const chain = orchestrator.getFallbackChain(contract.task);
		assert.ok(chain.length > 0, 'Empty fallback chain for ' + contract.task);
		assert.ok(
			chain.some((key) => key.includes('emergency-fallback-local')),
			'No deterministic emergency fallback for ' + contract.task,
		);
	}
});

test('Phase 17 category selection does not silently alias intent, narration, summarization, or research', () => {
	const orchestrator = new MultiModelOrchestrator();
	assert.equal(orchestrator.getTaskCategory('intent.interpret'), 'intent_interpretation');
	assert.equal(orchestrator.getTaskCategory('narrative.generate'), 'narration');
	assert.equal(orchestrator.getTaskCategory('summary.scene'), 'summarization');
	assert.equal(orchestrator.getTaskCategory('research.query'), 'research');
	assert.equal(orchestrator.getTaskCategory('rules.analyze'), 'rule_analysis');
	assert.equal(orchestrator.getTaskCategory('tactical.reason'), 'tactical_reasoning');
});

test('Phase 17 new task selection exposes an eligible model or deterministic fallback without throwing', () => {
	const orchestrator = new MultiModelOrchestrator();
	for (const task of [
		'intent.interpret',
		'capability.synthesize',
		'capability.explain',
		'research.query',
		'research.world-brief',
		'rules.analyze',
		'tactical.reason',
		'world.generate',
	] as any[]) {
		const selection = orchestrator.selectBestModel(task);
		assert.ok(selection.selectedModel);
		assert.ok(selection.fallbacks.length >= 1);
	}
});
