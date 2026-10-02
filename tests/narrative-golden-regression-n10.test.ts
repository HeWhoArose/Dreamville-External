import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeGoldenRegressionEngine, NARRATIVE_GOLDEN_SCENARIOS, type NarrativeGoldenObservation, type NarrativeGoldenScenario } from '../server/domain/narrativeGoldenRegression';
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

function scenarioResponse(scenario: NarrativeGoldenScenario, variant: 'PRIMARY' | 'FALLBACK'): string {
	const suffix = variant === 'PRIMARY' ? 'The presentation remains measured and scene-bound.' : 'The wording varies, but the same immediate evidence and player agency are preserved.';
	switch (scenario.id) {
		case 'G01_OBSERVATION':
			return JSON.stringify({
				narrative: [
					'You observe the archivists inside the Whispering Orrery without interrupting them.',
					'Their quiet work continues around you while the scene remains unchanged. ' + suffix,
				],
				dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [],
			});
		case 'G02_INFORMATION':
			return JSON.stringify({
				narrative: [
					'You ask about the starlight fissures without committing anyone to a certainty.',
					'Archivist Maren can offer only uncertain hearsay: the fissures are unverified, and no reliable answer is established from the immediate evidence. ' + suffix,
				],
				dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [],
			});
		case 'G03_MOVEMENT':
			return JSON.stringify({
				narrative: [
					'You move closer to Archivist Maren within the Whispering Orrery, narrowing the distance without changing the scene.',
					'Her low conversation remains within earshot. ' + suffix,
				],
				dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [],
			});
		case 'G04_COMBAT':
			return JSON.stringify({
				narrative: [
					'You strike at the creature inside the Whispering Orrery, committing only to the immediate attack.',
					'The impact becomes the current beat; the narration does not choose your next action for you. ' + suffix,
				],
				dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [],
			});
		default:
			throw new Error('Unknown N10 golden scenario: ' + scenario.id);
	}
}

function setupRepository(storyId: string): InMemoryWorldRepository {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);
	const run = repository.getStoryRun(storyId);
	assert.ok(run);
	run.runtimeState = {
		...(run.runtimeState || {}),
		activeDialogue: {
			nodeId: 'n10_dialogue',
			speakerId: 'n10_maren',
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
	return repository;
}

function prepareOrchestrator(primary: DeterministicMockAdapter, fallback?: DeterministicMockAdapter): MultiModelOrchestrator {
	const orchestrator = new MultiModelOrchestrator();
	for (const model of orchestrator.getAllModels()) {
		if (!model.isEmergencyFloor) orchestrator.updateModelHealth(model.providerId, model.modelId, 'DisabledByUser');
	}

	const primaryRecord = narrativeModel(primary.providerId, 'n10-primary', 100);
	orchestrator.registerModel(primaryRecord);
	orchestrator.registerAdapter(primary);
	const chain = [primary.providerId + '::n10-primary'];

	if (fallback) {
		const fallbackRecord = narrativeModel(fallback.providerId, 'n10-fallback', 90);
		orchestrator.registerModel(fallbackRecord);
		orchestrator.registerAdapter(fallback);
		chain.push(fallback.providerId + '::n10-fallback');
	}

	chain.push('provider_deterministic_emergency::emergency-fallback-local');
	orchestrator.pinModelForTask('narrative.generate', primaryRecord.modelId);
	orchestrator.setFallbackChain('narrative.generate', chain);
	return orchestrator;
}

function observe(result: Awaited<ReturnType<MultiModelOrchestrator['executeTurn']>>): NarrativeGoldenObservation {
	assert.ok(result.playerIntent, JSON.stringify(result));
	assert.ok(result.telemetry.narrativeProviderHandoff, JSON.stringify(result));
	assert.ok(result.turnPackage, JSON.stringify(result));
	return {
		providerId: result.telemetry.selectedModelId,
		source: result.telemetry.narrativeProviderHandoff.providerIndependentInstruction.includes('N9 PROVIDER HANDOFF CONTRACT')
			? (result.telemetry.selectedProviderId === 'provider_deterministic_emergency' ? 'DETERMINISTIC_FALLBACK' : (result.telemetry.fallbackChain.length > 1 ? 'AI_FALLBACK' : 'AI_PRIMARY'))
			: 'AI_PRIMARY',
		narrative: result.turnPackage.narrative.join(' '),
		intent: result.playerIntent,
		qualityProfile: result.telemetry.narrativeProviderHandoff.qualityProfile,
		qualityEnforcement: result.telemetry.narrativeProviderHandoff.qualityEnforcement,
		pacingProfile: result.telemetry.narrativeProviderHandoff.pacingProfile,
		pacingMaxWords: result.telemetry.narrativeProviderHandoff.pacingRange.maxWords,
		handoff: result.telemetry.narrativeProviderHandoff,
		stateChangeCount: result.turnPackage.stateChanges?.length || 0,
		approvedChangeCount: result.adjudicationResult?.approvedCount || 0,
	};
}

async function runGoldenScenario(scenario: NarrativeGoldenScenario, mode: 'PRIMARY' | 'FALLBACK' | 'EMERGENCY') {
	const storyId = 'n10_' + scenario.id.toLowerCase() + '_' + mode.toLowerCase();
	const repository = setupRepository(storyId);
	const primary = new DeterministicMockAdapter('n10_primary_' + mode.toLowerCase());
	const fallback = new DeterministicMockAdapter('n10_fallback_' + mode.toLowerCase());

	if (mode === 'PRIMARY') {
		primary.cannedResponses.set('narrative.generate', scenarioResponse(scenario, 'PRIMARY'));
	} else if (mode === 'FALLBACK') {
		primary.failureMode = '500';
		fallback.cannedResponses.set('narrative.generate', scenarioResponse(scenario, 'FALLBACK'));
	} else {
		primary.failureMode = '500';
	}

	const orchestrator = prepareOrchestrator(primary, mode === 'FALLBACK' ? fallback : undefined);
	const result = await orchestrator.executeTurn({
		storyId,
		playerAction: scenario.playerAction,
		repository,
		hardTokenBudget: 1400,
		timeoutMs: 1000,
		maxRetries: 0,
	});

	const observation = observe(result);
	return { result, observation };
}

for (const scenario of NARRATIVE_GOLDEN_SCENARIOS) {
	test('N10 golden: ' + scenario.id + ' remains stable on primary provider', async () => {
		const { observation } = await runGoldenScenario(scenario, 'PRIMARY');
		const evaluation = NarrativeGoldenRegressionEngine.evaluate(scenario, observation);
		assert.equal(evaluation.passed, true, evaluation.failures.join('\n'));
	});

	test('N10 golden: ' + scenario.id + ' remains presentation-compatible on AI fallback', async () => {
		const primaryRun = await runGoldenScenario(scenario, 'PRIMARY');
		const fallbackRun = await runGoldenScenario(scenario, 'FALLBACK');
		const primaryEvaluation = NarrativeGoldenRegressionEngine.evaluate(scenario, primaryRun.observation);
		const fallbackEvaluation = NarrativeGoldenRegressionEngine.evaluate(scenario, fallbackRun.observation);
		const compatibility = NarrativeGoldenRegressionEngine.comparePresentation(primaryRun.observation, fallbackRun.observation);
		assert.equal(primaryEvaluation.passed, true, primaryEvaluation.failures.join('\n'));
		assert.equal(fallbackEvaluation.passed, true, fallbackEvaluation.failures.join('\n'));
		assert.equal(compatibility.passed, true, compatibility.failures.join('\n'));
	});

	test('N10 golden: ' + scenario.id + ' survives deterministic emergency floor', async () => {
		const { observation } = await runGoldenScenario(scenario, 'EMERGENCY');
		const evaluation = NarrativeGoldenRegressionEngine.evaluate(scenario, observation);
		assert.equal(evaluation.passed, true, evaluation.failures.join('\n'));
	});
}

test('N10 golden suite compares stable presentation invariants, not exact prose', () => {
	const first = NARRATIVE_GOLDEN_SCENARIOS[0];
	const primaryObservation: NarrativeGoldenObservation = {
		providerId: 'primary',
		source: 'AI_PRIMARY',
		narrative: 'You observe the archivists inside the Whispering Orrery.',
		intent: { action: 'observe', goal: 'observe', interactionMode: 'PASSIVE_OBSERVATION', speechIntent: false, movementIntent: false, observationIntent: true, explicitTargets: [], impliedTargets: [], confidence: 1, source: 'DETERMINISTIC', originalText: first.playerAction },
		qualityProfile: 'MICRO_ACTION',
		qualityEnforcement: 'REWRITE',
		pacingProfile: 'MICRO',
		pacingMaxWords: 85,
		handoff: {
			version: 1, handoffId: 'n9.test.primary', storyId: 'golden', turnId: 'turn', voiceProfileId: 'voice.dreamville.default.v1',
			qualityProfile: 'MICRO_ACTION', qualityEnforcement: 'REWRITE', pacingProfile: 'MICRO',
			pacingRange: { minWords: 25, maxWords: 85, maxParagraphs: 1 },
			continuity: { emotionalTemperature: 'CALM', tension: 0, sceneMomentum: 'STEADY' },
			noveltyGuidance: 'no tracked repetition', providerIndependentInstruction: 'N9 PROVIDER HANDOFF CONTRACT v1. The selected model is an interchangeable provider.',
		},
		stateChangeCount: 0, approvedChangeCount: 0,
	};
	const fallbackObservation = {
		...primaryObservation,
		providerId: 'fallback',
		source: 'AI_FALLBACK' as const,
		narrative: 'The Whispering Orrery remains around you while the archivists continue their work.',
		handoff: { ...primaryObservation.handoff!, handoffId: 'n9.test.fallback' },
	};
	const comparison = NarrativeGoldenRegressionEngine.comparePresentation(primaryObservation, fallbackObservation);
	assert.equal(comparison.passed, true, comparison.failures.join('\n'));
});
