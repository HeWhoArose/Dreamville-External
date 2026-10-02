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
	const openings = [
		'Across ' + locationName + ', your attention settles on the archivists without interrupting their work.',
		'From where you stand in ' + locationName + ', you watch the archivists continue their quiet task.',
		'The workbench draws your eye in ' + locationName + ', and you take in the archivists’ movements.',
		'Nothing in ' + locationName + ' demands action yet; you study the archivists as they carry on.',
		'Your attention lingers on the archivists inside ' + locationName + ', following the small changes in their routine.',
		'You take a moment to watch the archivists around you in ' + locationName + '.',
		'Within ' + locationName + ', the archivists remain your focus as you quietly observe.',
		'You let the scene in ' + locationName + ' speak for itself while keeping the archivists in view.',
		'The nearest instruments frame your view of the archivists in ' + locationName + '.',
		'You scan the immediate scene of ' + locationName + ' and settle on the archivists’ ongoing work.',
		'At the edge of the work area in ' + locationName + ', you continue watching the archivists.',
		'For the moment, ' + locationName + ' offers no demand beyond careful observation, and the archivists remain your focus.',
	];
	const details = [
		'Brass rings turn overhead while a low current of air passes through the chamber.',
		'Blue instrument lights flicker along the archivists’ workbench before settling.',
		'Dust shifts across old stone beside the observatory rail.',
		'Distant mechanisms click once and then fall silent again.',
		'A thin reflection moves across the glass before fading.',
		'The archivists continue their measured work without breaking concentration.',
		'Quiet footsteps pass behind the nearest instrument and disappear.',
		'The chamber keeps its steady hum around the observation.',
		'A loose page lifts at one corner and settles back onto the table.',
		'The nearest brass assembly gives a soft mechanical tick.',
		'A faint vibration travels through the rail beneath your hand.',
		'Nothing else in the immediate scene demands a response yet.',
	];
	const opening = openings[(turn - 1) % openings.length];
	const detail = details[(turn * 3) % details.length];
	const suffixes = [
		'No new location or time change is committed.',
		'The observation remains limited to what is directly visible.',
		'Nothing in the scene establishes a new fact beyond what you can currently perceive.',
		'The immediate situation remains unchanged.',
		'No later player choice is assumed.',
	];
	return JSON.stringify({
		narrative: [
			opening,
			turn % 2 === 0 ? detail + ' ' + suffixes[turn % suffixes.length] : suffixes[turn % suffixes.length] + ' ' + detail,
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
