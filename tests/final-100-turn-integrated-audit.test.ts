import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { NarrativeLongSessionStressEngine } from '../server/domain/narrativeLongSessionStress';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { NarrativeDirector } from '../server/domain/narrativeDirector';

function model(providerId: string, modelId: string, pool: 'creative' | 'fast', capabilities: string[], priority: number): ModelRegistryRecord {
	return {
		providerId,
		modelId,
		displayName: modelId,
		pool,
		capabilities,
		contextWindow: 128000,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: pool === 'creative' ? 5 : 10,
		userPriority: priority,
		roleEligibility: ['narrative.generate'],
		fallbackEligibility: true,
		accessStatus: 'accessible',
		lifecycleState: 'active',
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['text', 'json'],
		hasStructuredOutput: true,
		outputTokenLimit: 4096,
	};
}

function responseForTurn(turn: number, location: string, target: string): string {
	const openings = [
		'At the start of this exchange',
		'As the conversation settles',
		'With the room still quiet',
		'After a brief pause',
		'Under the archive lights',
		'As the nearby machinery hums',
		'With dust shifting nearby',
		'Beside the active worktable',
		'As the corridor sounds recede',
		'With the ambient hum returning',
		'After the last answer fades',
		'As the next question lands',
	];
	const sensory = [
		'brass lamp-light catches the stone',
		'a faint mechanical hum passes beneath the room',
		'dust shifts lightly along the floor',
		'a nearby instrument gives a restrained click',
		'a cool draft crosses the room and fades',
		'paper edges lift and settle',
		'a thin reflection trembles across the glass',
		'the room’s mechanical rhythm continues',
		'old metal carries a soft vibration',
		'the corridor remains audible but distant',
		'overhead fixtures catch a muted glint',
		'the room’s low hum settles again',
	];
	const replies = [
		'I can tell you only what is evident here.',
		'That is all I can confirm from this place.',
		'I would keep the answer to what we can observe.',
		'Nothing beyond the immediate scene can be confirmed by me.',
		'I can answer only from what is plainly available here.',
		'That is as far as I can go without assuming more.',
		'I would rather leave anything beyond this scene uncertain.',
		'What you can see here is all I can stand behind.',
		'I can confirm only what remains observable now.',
		'I will not claim more than the scene supports.',
		'The immediate evidence is all I can speak to.',
		'For now, that is the limit of what I can confirm.',
	];
	const opener = openings[(turn - 1) % openings.length];
	const sense = sensory[(turn - 1) % sensory.length];
	const reply = replies[(turn - 1) % replies.length];
	return JSON.stringify({
		narrative: [
			`${opener}, exchange ${turn}, you ask ${target} about the current scene in ${location}; ${sense}.`,
			`${target} answers in a measured voice: "${reply}" Nothing beyond the immediate scene is established in this turn.`,
		],
		dialogue: [{ speaker: target, text: reply }],
		events: [],
		stateChanges: [],
		memoryCandidates: [],
		audioCues: [],
	});
}

test('Final integrated audit — 120-turn narration session preserves N13-N19 contracts and long-session bounds', async () => {
	const storyId = 'final_integrated_120_turn_audit';
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);

	const initialPlayer = repository.getPlayerLifecycle(storyId);
	assert.ok(initialPlayer);

	const situation = (await import('../server/domain/currentSituation')).CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I move closer to hear the rumors.',
		viewerActorId: initialPlayer?.actorId,
		worldRepo: repository,
	});
	const target = situation.nearbyEntities.find((entity) => ['NPC', 'CHARACTER'].includes(String(entity.kind).toUpperCase()));
	assert.ok(target, 'Final audit requires a visible non-player entity for N14/N15 coverage.');

	const targetedSituation = CurrentSituationBuilder.build({
		storyId,
		playerAction: `I ask ${target!.name} what happened to the expedition charts.`,
		viewerActorId: initialPlayer?.actorId,
		worldRepo: repository,
	});
	const targetedIntent = PlayerIntentInterpreter.deterministic(
		`I ask ${target!.name} what happened to the expedition charts.`,
		targetedSituation,
	);
	assert.ok(targetedIntent.explicitTargets.some((ref) => ref.id === target!.id), 'N14/N15 targeted setup could not resolve the visible NPC as an explicit target.');
	const targetedResearch = NarrativeResearchPipeline.research({
		repository,
		storyId,
		currentSituation: targetedSituation,
		playerIntent: targetedIntent,
		playerAction: targetedIntent.originalText,
		viewerActorId: targetedSituation.player.actorId,
	});
	const targetedPlan = NarrativeDirector.create({
		repository,
		storyId,
		situation: targetedSituation,
		intent: targetedIntent,
		research: targetedResearch,
	});
	assert.ok(targetedPlan.npcCognition?.some((npc) => npc.actorId === target!.id && npc.expressiveIdentity), 'N14 expressive identity projection failed for an explicit grounded NPC target.');
	assert.ok(targetedPlan.socialTopology?.conversationActive, 'N15 conversation topology did not activate for explicit NPC dialogue.');

	const memoryEngine = repository.getMemoryEngine(storyId);
	memoryEngine.storeMemory({
		id: 'final-semantic-chart-memory',
		storyId,
		memoryClass: 'SEMANTIC',
		subjectEntityId: initialPlayer!.actorId,
		relatedEntityIds: [target!.id],
		relatedLocationId: initialPlayer!.locationId,
		content: `The archive keeps sealed expedition charts associated with ${target!.name}.`,
		importance: 82,
		confidence: 0.95,
		status: 'active',
		visibility: 'PUBLIC',
		accessibleToEntityIds: [],
		isPersistentCritical: false,
		provenance: 'final_integrated_audit',
		perspective: 'OBJECTIVE',
		validFromTurn: 1,
		lastRecalledTurn: 1,
		triggerConditionTags: ['archive', 'charts', 'expedition', target!.name.toLowerCase()],
	} as any);
	memoryEngine.storeMemory({
		id: 'final-episodic-chart-memory',
		storyId,
		memoryClass: 'EPISODIC',
		subjectEntityId: initialPlayer!.actorId,
		relatedEntityIds: [target!.id],
		relatedLocationId: initialPlayer!.locationId,
		content: `Earlier, you watched ${target!.name} seal the expedition charts before returning to the archive.`,
		importance: 62,
		confidence: 0.9,
		status: 'active',
		visibility: 'PRIVATE',
		accessibleToEntityIds: [initialPlayer!.actorId],
		isPersistentCritical: false,
		provenance: 'final_integrated_audit',
		perspective: 'SUBJECTIVE',
		validFromTurn: 1,
		lastRecalledTurn: 1,
		triggerConditionTags: ['archive', 'charts', 'sealed', target!.name.toLowerCase()],
	} as any);

	const primary = new DeterministicMockAdapter('final_audit_creative_provider');
	const fast = new DeterministicMockAdapter('final_audit_fast_provider');
	const orchestrator = new MultiModelOrchestrator();
	const emergencyModel = orchestrator.getAllModels().find((candidate) => candidate.isEmergencyFloor);
	const internalRegistry = orchestrator as any;
	internalRegistry.models.clear();
	if (emergencyModel) {
		internalRegistry.models.set(emergencyModel.providerId + '::' + emergencyModel.modelId, emergencyModel);
	}

	const creativeModel = model(
		primary.providerId,
		'final-audit-creative',
		'creative',
		['text_generation', 'creative_writing', 'long_context', 'reasoning', 'structured_output'],
		50,
	);
	const fastModel = model(
		fast.providerId,
		'final-audit-fast',
		'fast',
		['text_generation', 'fast', 'structured_output'],
		50,
	);
	orchestrator.registerModel(creativeModel);
	orchestrator.registerModel(fastModel);
	orchestrator.registerAdapter(primary);
	orchestrator.registerAdapter(fast);

	const internal = orchestrator as any;
	internal.taskFallbackChains.clear();
	internal.taskPinnedModels.clear();
	internal.categoryOverrides.clear();

	orchestrator.setFallbackChain('narrative.generate', [
		'final_audit_creative_provider::final-audit-creative',
		'final_audit_fast_provider::final-audit-fast',
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'final-audit-creative');

	const canonicalBefore = JSON.stringify({
		events: repository.getCanonicalCommandEvents(storyId),
		player: repository.getPlayerLifecycle(storyId),
	});

	const observations: Array<{
		turn: number;
		selectedModelId: string;
		promptChars: number;
		phase: string;
		richnessDecision: string;
		memoryBlocks: number;
		fastProviderAttempts: number;
		primaryProviderAttempts: number;
	}> = [];

	for (let turn = 1; turn <= 120; turn += 1) {
		if (turn === 61) primary.failureMode = '500';
		if (turn === 91) fast.failureMode = '500';
		if (turn === 96) {
			fast.failureMode = undefined;
			internal.resetCircuitBreaker(fast.providerId, fast.modelId);
			const fastRuntime = internal.runtimeStatus.get(fast.providerId + '::' + fast.modelId);
			if (fastRuntime) {
				fastRuntime.cooldownUntil = undefined;
				fastRuntime.operationalStatus = 'AVAILABLE';
			}
			internal.taskPinnedModels.delete('narrative.generate');
			internal.consecutiveFailures.clear();
			internal.circuitBreakersTripped.clear();
			creativeModel.health = 'Healthy';
			creativeModel.quota = 'Healthy';
			creativeModel.accessStatus = 'accessible';
			fastModel.health = 'Healthy';
			fastModel.quota = 'Healthy';
			fastModel.accessStatus = 'accessible';
			for (const recoveryModel of [creativeModel, fastModel]) {
				const recoveryRuntime = internal.runtimeStatus.get(recoveryModel.providerId + '::' + recoveryModel.modelId);
				if (recoveryRuntime) {
					recoveryRuntime.consecutiveFailures = 0;
					recoveryRuntime.cooldownUntil = undefined;
					recoveryRuntime.operationalStatus = 'AVAILABLE';
					recoveryRuntime.status = 'Healthy';
				}
			}
			const recoverySelection = orchestrator.selectBestModel('narrative.generate', { contextTokens: 0 });
			assert.notEqual(recoverySelection.selectedModel.modelId, 'emergency-fallback-local', 'N19 recovery selection remained on the deterministic emergency floor.');

		const action = `I ask ${target!.name} about the current scene.`;

		const primaryCallsBefore = primary.callHistory.length;
		const fastCallsBefore = fast.callHistory.length;

		const response = responseForTurn(turn, situation.location.name, target!.name);
		primary.cannedResponses.set('narrative.generate', response);
		primary.cannedResponses.set('narrative.review', response);
		fast.cannedResponses.set('narrative.generate', response);
		fast.cannedResponses.set('narrative.review', response);

		const result = await orchestrator.executeTurn({
			storyId,
			playerAction: action,
			forceModelId: turn < 96 ? 'final-audit-creative' : undefined,
			repository,
			hardTokenBudget: 1400,
			timeoutMs: 1000,
			maxRetries: 0,
		});

		assert.equal(result.success, true, 'turn ' + turn + ': ' + (result.error || 'unknown failure'));
		assert.ok(result.narrativePlan, 'turn ' + turn + ': missing Narrative Director plan');
		// N13 is intentionally resolved at the final prompt stage; verify it at its real consumer boundary below.
		assert.ok(result.narrativePlan?.socialTopology, 'turn ' + turn + ': N15 social topology missing');
		assert.ok(result.narrativePlan?.episodeProjection, 'turn ' + turn + ': N17 episode projection missing');
		assert.notEqual(result.telemetry.selectedModelId, 'canon-guard', 'turn ' + turn + ': integrated audit unexpectedly short-circuited before narration generation');
		assert.ok(result.narrativeRichnessEvaluation, 'turn ' + turn + ': N18 richness evaluation missing; model=' + result.telemetry.selectedModelId + '; provider=' + result.telemetry.selectedProviderId + '; plan=' + Boolean(result.narrativePlan) + '; review=' + result.narrativeReview?.decision + '; telemetryRichness=' + Boolean(result.telemetry.narrativeRichnessEvaluation) + '; attempts=' + result.telemetry.attempts);
		const researchBlockCount = Number(result.telemetry.researchBlockCount || 0);
		assert.ok(researchBlockCount >= 1, 'turn ' + turn + ': N16 memory/research path produced no bounded research blocks');
		const primaryProviderAttempts = primary.callHistory.slice(primaryCallsBefore).filter((call) => call.task === 'narrative.generate').length;
		const fastProviderAttempts = fast.callHistory.slice(fastCallsBefore).filter((call) => call.task === 'narrative.generate').length;

		const newPrimaryCalls = primary.callHistory.slice(primary.callHistory.length > 0 ? Math.max(0, primary.callHistory.length - 8) : 0);
		const newFastCalls = fast.callHistory.slice(fast.callHistory.length > 0 ? Math.max(0, fast.callHistory.length - 8) : 0);
		const narrationCandidates = [...newPrimaryCalls, ...newFastCalls]
			.filter((call) => call.task === 'narrative.generate' && /N13 SCENE COMPOSITION/i.test(call.prompt));
		const narrationCall = narrationCandidates.at(-1)?.prompt || '';
		assert.match(narrationCall, /N13 SCENE COMPOSITION/i, 'turn ' + turn + ': N13 missing from original narration prompt');
		assert.match(narrationCall, /N15 SOCIAL ATTENTION \/ CONVERSATION TOPOLOGY/i, 'turn ' + turn + ': N15 missing from original narration prompt');
		assert.match(narrationCall, /N17 NARRATIVE EPISODE PROJECTION/i, 'turn ' + turn + ': N17 missing from original narration prompt');

		observations.push({
			turn,
			selectedModelId: result.telemetry.selectedModelId,
			promptChars: narrationCall.length,
			phase: result.narrativePlan.episodeProjection?.phase || 'UNKNOWN',
			richnessDecision: result.narrativeRichnessEvaluation?.decision || 'UNKNOWN',
			memoryBlocks: researchBlockCount,
			fastProviderAttempts,
			primaryProviderAttempts,
		});
	}

	assert.equal(observations.length, 120);
	assert.equal(observations[0].selectedModelId, 'final-audit-creative', 'N19 did not select the creative model on the normal path');
	assert.ok(observations.slice(60).some((entry) => entry.selectedModelId === 'final-audit-fast' || entry.selectedModelId === 'emergency-fallback-local'), 'N19/fallback path did not leave the failed creative model');
	assert.ok(observations.slice(90, 95).some((entry) => entry.selectedModelId === 'emergency-fallback-local'), 'Emergency floor was not exercised after total AI outage');
	assert.ok(observations.slice(95).some((entry) => entry.fastProviderAttempts > 0 || entry.primaryProviderAttempts > 0), 'AI recovery did not resume after provider recovery');

	assert.ok(observations.slice(1).every((entry) => entry.phase !== 'OPENING'), 'N17 remained stuck in OPENING after the episode had history');

	const maxPrompt = Math.max(...observations.map((entry) => entry.promptChars));
	assert.ok(maxPrompt < 20000, 'prompt envelope exceeded long-session bound: ' + maxPrompt);
	assert.ok(observations.at(-1)!.promptChars < observations[0].promptChars * 2.5, 'prompt grew materially across the session');

	const metrics = NarrativeLongSessionStressEngine.collect(repository, storyId);
	const boundFailures = NarrativeLongSessionStressEngine.validateBounds(metrics);
	assert.deepEqual(boundFailures, [], boundFailures.join('\n'));
	assert.equal(metrics.turnCount, 120);
	assert.equal(metrics.narrativeContextHistory, 40);

	assert.equal(
		JSON.stringify({
			events: repository.getCanonicalCommandEvents(storyId),
			player: repository.getPlayerLifecycle(storyId),
		}),
		canonicalBefore,
		'canonical command/event or player lifecycle state changed during the presentation-only audit path',
	);
});
