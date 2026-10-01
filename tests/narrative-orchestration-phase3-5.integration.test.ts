import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function narrativeModel(providerId: string, modelId: string, priority = 100): ModelRegistryRecord {
	return {
		providerId,
		modelId,
		displayName: modelId,
		pool: 'creative',
		capabilities: ['text_generation', 'structured_output', 'creative_writing'],
		contextWindow: 128000,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 5,
		userPriority: priority,
		roleEligibility: ['narrative.generate'],
		fallbackEligibility: true,
		accessStatus: 'accessible',
		lifecycleState: 'active',
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['text', 'json'],
		hasStructuredOutput: true,
	};
}

function validNarrative(): string {
	return JSON.stringify({
		narrative: [
			'You move closer to the Whispering Orrery archivists without speaking, keeping your attention on the low conversation.',
			'The whispers mention unstable starlight fissures in the lower sea, though the speakers treat the report as uncertain hearsay.',
		],
		dialogue: [],
		events: ['RESEARCHED_RUMOR_HEARD'],
		stateChanges: [],
		memoryCandidates: [],
		audioCues: [],
	});
}

function setupRepository(storyId: string) {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);
	const run = repository.getStoryRun(storyId);
	assert.ok(run);
	run.openingScene = {
		...(run.openingScene || {}),
		narrativeText: 'OLD_OPENING_SENTINEL_THIS_MUST_NOT_REACH_NARRATION_PROMPT',
	};
	run.runtimeState = {
		...(run.runtimeState || {}),
		activeDialogue: {
			nodeId: 'integration_dialogue',
			speakerId: 'integration_speaker',
			speakerName: 'Archivist Maren',
			text: 'The archivists are whispering about unstable starlight fissures in the lower sea.',
		},
		plot: {
			storyId,
			version: 1,
			currentArc: 'WHISPERING_SPORE_SEA',
			summary: 'Investigate the starlight fissure rumors.',
			beats: [],
			openThreads: ['Investigate the starlight fissures'],
			updatedAt: repository.getWorldClock(storyId).getTimestamp().toString(),
		},
	};
	repository.saveStoryRun(run);
	repository.saveStoryThread({
		storyId,
		threadId: 'integration_fissures',
		title: 'Starlight fissure rumors',
		summary: 'Determine whether the reported fissures are real.',
		status: 'OPEN',
		priority: 'HIGH',
	});
	return repository;
}

function prepareOrchestrator(primary: DeterministicMockAdapter, fallback?: DeterministicMockAdapter) {
	const orchestrator = new MultiModelOrchestrator();
	for (const model of orchestrator.getAllModels()) {
		if (!model.isEmergencyFloor) {
			orchestrator.updateModelHealth(model.providerId, model.modelId, 'DisabledByUser');
		}
	}

	const primaryRecord = narrativeModel(primary.providerId, 'integration-primary', 100);
	orchestrator.registerModel(primaryRecord);
	orchestrator.registerAdapter(primary);
	const chain = [primary.providerId + '::integration-primary'];

	if (fallback) {
		const fallbackRecord = narrativeModel(fallback.providerId, 'integration-fallback', 90);
		orchestrator.registerModel(fallbackRecord);
		orchestrator.registerAdapter(fallback);
		chain.push(fallback.providerId + '::integration-fallback');
	}

	chain.push('provider_deterministic_emergency::emergency-fallback-local');
	orchestrator.pinModelForTask('narrative.generate', primaryRecord.modelId);
	orchestrator.setFallbackChain('narrative.generate', chain);
	return orchestrator;
}

test('Phases 3-5 reach the live narrative provider with ordered CurrentSituation → Intent → Research → Plan context', async () => {
	const storyId = 'phase3_5_live_primary';
	const repository = setupRepository(storyId);
	const primary = new DeterministicMockAdapter('integration_primary');
	primary.cannedResponses.set('narrative.generate', validNarrative());
	const orchestrator = prepareOrchestrator(primary);

	const result = await orchestrator.executeTurn({
		storyId,
		playerAction: 'I move closer to hear the rumors.',
		repository,
		hardTokenBudget: 1200,
		timeoutMs: 1000,
		maxRetries: 0,
	});

	assert.equal(result.success, true, result.error || JSON.stringify(result));
	console.error('AUDIT_DEBUG_PRIMARY_TELEMETRY', JSON.stringify(result.telemetry, null, 2), JSON.stringify(result.attemptsTrail, null, 2));
	assert.equal(result.telemetry.selectedModelId, 'integration-primary');
	assert.equal(result.telemetry.researchBlockCount && result.telemetry.researchBlockCount > 0, true);
	assert.equal(result.telemetry.researchTokens && result.telemetry.researchTokens > 0, true);
	assert.equal(result.playerIntent?.speechIntent, false);
	assert.equal(result.playerIntent?.movementIntent, true);
	assert.equal(result.playerIntent?.observationIntent, true);
	assert.ok(result.narrativePlan);
	assert.equal(result.narrativePlan?.expiresAfterNarration, true);

	assert.equal(primary.callHistory.length, 1);
	const prompt = primary.callHistory[0].prompt;
	const orderedSections = [
		'GLOBAL NARRATION INSTRUCTIONS',
		'NARRATIVE STYLE',
		'CURRENT SITUATION',
		'PLAYER INTENT',
		'NARRATIVE RESEARCH',
		'NARRATIVE DIRECTOR PLAN',
		'SUPPORTING WORKING CONTEXT',
		'Canonical constraints:',
		'OUTPUT CONTRACT',
	].map((section) => prompt.indexOf(section));
	for (let i = 0; i < orderedSections.length; i += 1) {
		assert.notEqual(orderedSections[i], -1, 'Missing required narration prompt section.');
		if (i > 0) assert.equal(orderedSections[i] > orderedSections[i - 1], true);
	}
	assert.match(prompt, /speechIntent[\s":]+false/i);
	assert.match(prompt, /Do not create player speech/i);
	assert.match(prompt, /starlight fissures/i);
	assert.doesNotMatch(prompt, /OLD_OPENING_SENTINEL_THIS_MUST_NOT_REACH_NARRATION_PROMPT/i);
	assert.equal(repository.getStoryRun(storyId)?.runtimeState?.narrativePlan, undefined, 'Ephemeral Phase 4 plan must not be persisted as runtime state.');
});

test('Phase 3-5 narrative context survives malformed primary output and reaches the configured AI fallback', async () => {
	const storyId = 'phase3_5_ai_fallback';
	const repository = setupRepository(storyId);
	const primary = new DeterministicMockAdapter('integration_primary_fallback');
	primary.failureMode = 'malformed_json';
	const fallback = new DeterministicMockAdapter('integration_secondary_fallback');
	fallback.cannedResponses.set('narrative.generate', validNarrative());
	const orchestrator = prepareOrchestrator(primary, fallback);

	const result = await orchestrator.executeTurn({
		storyId,
		playerAction: 'I move closer to hear the rumors.',
		repository,
		hardTokenBudget: 1200,
		timeoutMs: 1000,
		maxRetries: 0,
	});

	assert.equal(result.success, true, result.error || JSON.stringify(result));
	console.error('AUDIT_DEBUG_FALLBACK_TELEMETRY', JSON.stringify(result.telemetry, null, 2), JSON.stringify(result.attemptsTrail, null, 2));
	assert.equal(result.telemetry.selectedModelId, 'integration-fallback');
	assert.equal(result.telemetry.fallbackChain.includes('integration-fallback'), true);
	assert.equal(primary.callHistory.length, 1);
	assert.equal(fallback.callHistory.length, 1);
	assert.match(primary.callHistory[0].prompt, /NARRATIVE DIRECTOR PLAN/i);
	assert.match(fallback.callHistory[0].prompt, /NARRATIVE RESEARCH/i);
	assert.match(fallback.callHistory[0].prompt, /speechIntent[\s":]+false/i);
	assert.match(fallback.callHistory[0].prompt, /starlight fissures/i);
});

test('Phase 3-5 emergency floor receives the same context and remains semantically anchored when AI is unavailable', async () => {
	const storyId = 'phase3_5_emergency';
	const repository = setupRepository(storyId);
	const primary = new DeterministicMockAdapter('integration_primary_emergency');
	primary.failureMode = '500';
	const orchestrator = prepareOrchestrator(primary);

	const result = await orchestrator.executeTurn({
		storyId,
		playerAction: 'I move closer to hear the rumors.',
		repository,
		hardTokenBudget: 1200,
		timeoutMs: 1000,
		maxRetries: 0,
	});

	assert.equal(result.success, true);
	assert.equal(result.telemetry.selectedModelId, 'emergency-fallback-local');
	assert.equal(result.telemetry.fallbackChain.includes('emergency-fallback-local'), true);
	assert.equal(result.telemetry.researchBlockCount && result.telemetry.researchBlockCount > 0, true);
	assert.ok(result.playerIntent);
	assert.equal(result.playerIntent?.speechIntent, false);
	assert.equal(result.playerIntent?.movementIntent, true);
	assert.equal(result.playerIntent?.observationIntent, true);
	assert.ok(result.narrativePlan);
	assert.ok(result.turnPackage?.narrative?.length);
	assert.match(result.turnPackage?.narrative?.join(' ') || '', /hear|listen|rumor|action/i);
	assert.equal(primary.callHistory.length, 1);
	assert.match(primary.callHistory[0].prompt, /CURRENT SITUATION/i);
	assert.match(primary.callHistory[0].prompt, /PLAYER INTENT/i);
	assert.match(primary.callHistory[0].prompt, /NARRATIVE RESEARCH/i);
	assert.match(primary.callHistory[0].prompt, /NARRATIVE DIRECTOR PLAN/i);
});
