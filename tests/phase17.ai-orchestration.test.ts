import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';
import { getAiTaskContract, getAllAiTaskContracts } from '../server/domain/aiTaskContracts';
import { narrativeContinuityEngine } from '../server/domain/narrativeContinuityEngine';
import { WorldMomentumEngine } from '../server/domain/worldMomentumEngine';
import { MemoryOpportunityEngine } from '../server/domain/memoryOpportunityEngine';
import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { combatTacticsService } from '../server/domain/combatTacticsService';

test('Phase 17 AI orchestration contracts cover every new intelligence category', () => {
	const expected: Array<[string, string]> = [
		['character.extract', 'character_genesis'],
		['memory.extract', 'memory'],
		['character.dialogue', 'dialogue'],
		['intent.interpret', 'intent_interpretation'],
		['capability.synthesize', 'capability_synthesis'],
		['capability.explain', 'capability_explanation'],
		['research.query', 'research'],
		['research.world-brief', 'research_world_brief'],
		['rules.analyze', 'rule_analysis'],
		['tactical.reason', 'tactical_reasoning'],
		['narrative.generate', 'narration'],
		['summary.scene', 'summarization'],
		['world.generate', 'world_generation'],
		['utility.inspect', 'utility'],
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
		'research_world_brief',
		'summarization',
		'character_genesis',
		'memory',
		'dialogue',
		'utility',
		'tactical_reasoning',
		'rules',
		'rule_analysis',
		'narration',
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
	assert.equal(orchestrator.getTaskCategory('research.world-brief'), 'research_world_brief');
	assert.equal(orchestrator.getTaskCategory('character.extract'), 'character_genesis');
	assert.equal(orchestrator.getTaskCategory('memory.extract'), 'memory');
	assert.equal(orchestrator.getTaskCategory('character.dialogue'), 'dialogue');
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


test('Phase 17: narrative continuity is persisted only when a canonical turn is recorded', () => {
	const saved: any[] = [];
	const repository: any = {
		getStoryRun: () => ({ runtimeState: {} }),
		getWorldClock: () => ({
			getTimestamp: () => ({ totalElapsedSeconds: 100, year: 1, month: 1, day: 1, hour: 12, minute: 0, second: 0 }),
		}),
		getCanonicalCommandEvents: () => [],
		getPlayerLifecycle: () => ({ actorId: 'player' }),
		getMemoryEngine: () => new MemoryOpportunityEngine(),
		saveStoryRun: (run: any) => saved.push(run),
	};
	const result = narrativeContinuityEngine.recordTurn(repository, {
		storyId: 'phase17_continuity',
		turnId: 'turn_1',
		playerAction: 'Inspect the gate.',
		turnPackage: {
			narrative: ['The gate groans open.'],
			dialogue: [],
			events: ['GATE_OPENED'],
			stateChanges: [],
			memoryCandidates: ['The old gate is open.'],
			audioCues: [],
		},
	});
	assert.equal(result.plot.beats.length, 1);
	assert.equal(saved.length, 1);
});

test('Phase 17: world momentum is deterministic and connected to world-time simulation output', () => {
	const saved: any[] = [];
	const repository: any = {
		getStoryRun: () => ({ runtimeState: {} }),
		saveStoryRun: (run: any) => saved.push(run),
	};
	const result = WorldMomentumEngine.advance({
		repository,
		storyId: 'phase17_momentum',
		currentSeconds: 3600,
		triggeredEvents: [{ id: 'event_1', name: 'Siege begins' }],
		missedEvents: [{ id: 'event_2', name: 'Council deadline' }],
	});
	assert.equal(result.state.pressure, 11);
	assert.deepEqual(result.signals, ['WORLD_EVENT:Siege begins', 'MISSED_EVENT:Council deadline']);
	assert.equal(saved.length, 1);
	assert.equal(saved[0].runtimeState.worldMomentum.pressure, 11);
});

test('Phase 17: NPC tactical execution leaves encounter-specific private memory for future planning', () => {
	const engine = new TacticalCombatEngine(42);
	engine.addParticipant({
		id: 'npc',
		name: 'Tactician',
		x: 0,
		y: 0,
		initiative: 10,
		team: 'enemies',
		hpCurrent: 20,
		hpMax: 20,
		armorClass: 14,
		speedCells: 5,
		attackBonus: 5,
		damageFormula: '1d6',
		conditions: [],
		isDead: false,
	});
	engine.addParticipant({
		id: 'player',
		name: 'Player',
		x: 2,
		y: 0,
		initiative: 5,
		team: 'player_allies',
		hpCurrent: 20,
		hpMax: 20,
		armorClass: 12,
		speedCells: 6,
		attackBonus: 5,
		damageFormula: '1d6',
		conditions: [],
		isDead: false,
	});
	const plan: any = {
		planId: 'plan_phase17',
		actorId: 'npc',
		objective: 'Protect the escape route.',
		steps: [{
			id: 'step_1',
			actionType: 'ATTACK',
			targetId: 'player',
		}],
		currentStepIndex: 0,
		status: 'ACTIVE',
		revision: 1,
		source: 'AI',
		updatedTurn: 1,
		updatedAt: new Date().toISOString(),
	};
	engine.setTacticalPlan(plan);
	const memory = new MemoryOpportunityEngine();
	const repository: any = {
		getMemoryEngine: () => memory,
		getWorldClock: () => ({
			getTimestamp: () => ({ totalElapsedSeconds: 10, year: 1, month: 1, day: 1, hour: 12, minute: 0, second: 0 }),
		}),
	};
	combatTacticsService.recordExecution(engine, 'npc', false, repository, 'phase17_combat', 'cmd_1');
	const memories = memory.getAllMemories('phase17_combat');
	assert.equal(memories.length, 1);
	assert.equal(memories[0].subjectEntityId, 'npc');
	assert.equal(memories[0].visibility, 'PRIVATE');
	assert.match(memories[0].content, /replanning/i);
});
