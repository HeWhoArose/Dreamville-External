import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { NarrativeLongSessionStressEngine } from '../server/domain/narrativeLongSessionStress';

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
		latencyMs: 1,
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

function prepareOrchestrator(primary: DeterministicMockAdapter, fallback: DeterministicMockAdapter): MultiModelOrchestrator {
	const orchestrator = new MultiModelOrchestrator();
	for (const model of orchestrator.getAllModels()) {
		if (!model.isEmergencyFloor) orchestrator.updateModelHealth(model.providerId, model.modelId, 'DisabledByUser');
	}
	const primaryRecord = narrativeModel(primary.providerId, 'n11-primary', 100);
	const fallbackRecord = narrativeModel(fallback.providerId, 'n11-fallback', 90);
	orchestrator.registerModel(primaryRecord);
	orchestrator.registerModel(fallbackRecord);
	orchestrator.registerAdapter(primary);
	orchestrator.registerAdapter(fallback);
	orchestrator.pinModelForTask('narrative.generate', primaryRecord.modelId);
	orchestrator.setFallbackChain('narrative.generate', [
		primary.providerId + '::n11-primary',
		fallback.providerId + '::n11-fallback',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	return orchestrator;
}

function responseForTurn(turn: number, locationName: string): string {
	const details = [
		'brass rings turn overhead while a low current of air moves through the chamber',
		'blue instrument lights flicker along the archivists’ workbench',
		'dust shifts across the old stone beside the observatory rail',
		'distant mechanisms click once and settle back into silence',
		'a thin reflection moves across the glass before fading',
		'the archivists continue their measured work without interrupting the scene',
		'quiet footsteps pass behind the nearest instrument and disappear',
		'the chamber holds its steady hum while the observation continues',
	];
	return JSON.stringify({
		narrative: [
			'You observe the archivists in ' + locationName + ' without changing position.',
			'Turn ' + turn + ' remains grounded in the immediate scene; ' + details[turn % details.length] + '.',
		],
		dialogue: [],
		events: [],
		stateChanges: [],
		memoryCandidates: [],
		audioCues: [],
	});
}

function snapshotCanonical(repository: InMemoryWorldRepository, storyId: string): string {
	return JSON.stringify({
		events: repository.getCanonicalCommandEvents(storyId),
		player: repository.getPlayerLifecycle(storyId),
	});
}

test('N11 100-turn session stays bounded and presentation-stable', async () => {
	const storyId = 'n11_long_session';
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);
	const player = repository.getPlayerLifecycle(storyId);
	const location = player?.locationId
		? repository.getGeographyGraph(storyId).getNode(player.locationId)
		: undefined;
	const locationName = location?.name || 'the current location';

	const primary = new DeterministicMockAdapter('n11_primary_provider');
	const fallback = new DeterministicMockAdapter('n11_fallback_provider');
	const orchestrator = prepareOrchestrator(primary, fallback);
	const canonicalBefore = snapshotCanonical(repository, storyId);
	const observations: Array<{
		turn: number;
		selectedModelId: string;
		voiceProfileId?: string;
		qualityProfile?: string;
		pacingProfile?: string;
		handoffId?: string;
		promptChars: number;
	}> = [];

	for (let turn = 1; turn <= 100; turn += 1) {
		if (turn === 61) {
			primary.failureMode = '500';
		}
		const response = responseForTurn(turn, locationName);
		if (turn < 61) primary.cannedResponses.set('narrative.generate', response);
		else fallback.cannedResponses.set('narrative.generate', response);

		const result = await orchestrator.executeTurn({
			storyId,
			playerAction: 'I observe the archivists.',
			repository,
			hardTokenBudget: 1200,
			timeoutMs: 1000,
			maxRetries: 0,
		});

		assert.equal(result.success, true, 'turn ' + turn + ': ' + (result.error || 'unknown failure'));
		assert.ok(result.telemetry.narrativeProviderHandoff, 'turn ' + turn + ': missing N9 handoff');
		assert.ok(result.playerIntent?.observationIntent, 'turn ' + turn + ': observation intent drifted');
		assert.equal(result.playerIntent?.movementIntent, false, 'turn ' + turn + ': movement intent drifted');
		assert.equal(result.playerIntent?.speechIntent, false, 'turn ' + turn + ': speech intent drifted');

		const adapter = result.telemetry.selectedProviderId === primary.providerId ? primary : fallback;
		const lastCall = adapter.callHistory[adapter.callHistory.length - 1];
		assert.ok(lastCall, 'turn ' + turn + ': provider call missing');
		observations.push({
			turn,
			selectedModelId: result.telemetry.selectedModelId,
			voiceProfileId: result.telemetry.narrativeProviderHandoff.voiceProfileId,
			qualityProfile: result.telemetry.narrativeProviderHandoff.qualityProfile,
			pacingProfile: result.telemetry.narrativeProviderHandoff.pacingProfile,
			handoffId: result.telemetry.narrativeProviderHandoff.handoffId,
			promptChars: lastCall.prompt.length,
		});
	}

	const metrics = NarrativeLongSessionStressEngine.collect(repository, storyId);
	const boundFailures = NarrativeLongSessionStressEngine.validateBounds(metrics);
	assert.deepEqual(boundFailures, [], boundFailures.join('\n'));

	assert.equal(primary.callHistory.length, 60, 'primary provider should own the first 60 turns');
	assert.ok(fallback.callHistory.length >= 40, 'fallback provider should own the post-handoff session');

	const postStartup = observations.slice(1);
	assert.equal(new Set(postStartup.map(x => x.voiceProfileId)).size, 1, 'narrator voice drifted during the session');
	assert.equal(new Set(postStartup.map(x => x.qualityProfile)).size, 1, 'N1 quality profile drifted during stable-intent session');
	assert.equal(new Set(postStartup.slice(0, 59).map(x => x.pacingProfile)).size, 1, 'N8 pacing profile drifted during stable-intent session');

	const handoffSwitch = observations[60];
	const beforeSwitch = observations[59];
	assert.ok(handoffSwitch.handoffId);
	assert.ok(beforeSwitch.handoffId);
	assert.match(fallback.callHistory[0].options?.systemInstruction || '', /N9 PROVIDER HANDOFF CONTRACT/i);
	assert.equal(snapshotCanonical(repository, storyId), canonicalBefore, 'long-session presentation path mutated canonical state unexpectedly');

	const promptSamples = observations.filter((_, index) => index % 10 === 0).map(x => x.promptChars);
	const firstPrompt = promptSamples[0];
	const maxPrompt = Math.max(...promptSamples);
	assert.ok(maxPrompt < 20000, 'narration prompt grew beyond a bounded long-session envelope: ' + maxPrompt);
	assert.ok(promptSamples[promptSamples.length - 1] < firstPrompt * 2.5, 'narration prompt grew materially across the long session');

	assert.equal(metrics.turnCount, 100);
	assert.equal(metrics.narrativeContextHistory, 40);
	assert.equal(metrics.noveltyItems <= 120, true);
	assert.equal(metrics.continuity.narrativeBeats <= 8, true);
	assert.equal(metrics.continuity.responseShapes <= 8, true);
	assert.equal(metrics.plotBeats <= 40, true);
	assert.equal(metrics.plotOpenThreads <= 24, true);
	assert.ok(metrics.researchSnapshotBytes < 50000, 'research runtime snapshot grew unexpectedly: ' + metrics.researchSnapshotBytes);
});
