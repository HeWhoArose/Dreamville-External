import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { NarrativeLongSessionStressEngine } from '../server/domain/narrativeLongSessionStress';
import { getAiTaskRoutingPolicy } from '../server/domain/aiQualityRouting';
import type { DurableMemory } from '../server/domain/memoryOpportunityEngine';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';

function narrativeModel(providerId: string, modelId: string, priority = 100): ModelRegistryRecord {
	return {
		providerId,
		modelId,
		displayName: modelId,
		pool: 'creative',
		capabilities: ['text_generation', 'structured_output', 'creative_writing', 'long_context'],
		contextWindow: 128000,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 2,
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

function memory(overrides: Partial<DurableMemory> = {}): DurableMemory {
	return {
		id: 'final-audit-memory',
		storyId: 'final_integrated_120',
		memoryClass: 'EPISODIC',
		subjectEntityId: 'player',
		relatedEntityIds: [],
		content: 'Earlier in the archive, the player watched Archivist Maren pause beside the unstable starlight fissure while the surrounding instruments stayed quiet.',
		importance: 74,
		confidence: 0.92,
		status: 'active',
		visibility: 'PUBLIC',
		accessibleToEntityIds: [],
		isPersistentCritical: false,
		provenance: 'final_integrated_audit',
		perspective: 'SUBJECTIVE',
		validFromTurn: 1,
		lastRecalledTurn: 1,
		triggerConditionTags: ['archivist', 'maren', 'fissure', 'archive'],
		...overrides,
	};
}

const ACTIONS = [
	'I observe the nearby person.',
	'I move closer to hear the conversation.',
	'I ask what happened to the starlight fissure.',
	'I inspect the nearby instrument without changing anything else.',
	'I listen for more information without interrupting.',
	'I observe the archivists and keep the fissure in view.',
] as const;

const SCENE_DETAILS = [
	'Brass rings turn overhead while the chamber keeps a low mechanical hum.',
	'Blue indicator lights tremble across the workbench and settle into a steady rhythm.',
	'Dust shifts along the stone rail as a faint current passes through the archive.',
	'A loose page lifts at one corner and settles against the weight holding it down.',
	'The nearest lens catches a pale reflection and then returns to the dim room.',
	'Quiet footsteps cross the far side of the chamber and fade behind the instruments.',
	'The archivist pauses over a brass dial before returning to the same careful motion.',
	'A thin vibration travels through the rail beneath your hand and disappears.',
	'The room remains cool, with old metal carrying a faint scent of oil and rain.',
	'A distant mechanism clicks once, leaving the rest of the archive unusually still.',
	'The workbench casts narrow shadows across the floor while Maren keeps her attention on the equipment.',
	'The glass beside the instrument holds a dull reflection of the chamber and nothing more.',
] as const;

function responseForTurn(turn: number, locationName: string): string {
	const action = ACTIONS[(turn - 1) % ACTIONS.length];
	const detail = SCENE_DETAILS[(turn - 1) % SCENE_DETAILS.length];
	const question = /ask/i.test(action);
	const opening = question
		? 'In ' + locationName + ', Maren answers cautiously, choosing her words with the restraint of someone who knows the subject is uncertain.'
		: 'In ' + locationName + ', you keep the immediate scene within view while the archivists continue their work.';
	const second = question
		? 'Her reply leaves the origin of the fissure unresolved rather than supplying a certainty the scene does not establish.'
		: 'You remain within the current scene and take no unchosen action; the available evidence stays bounded to what can be seen, heard, or cautiously inferred.';
	return JSON.stringify({
		narrative: [
			opening + ' ' + detail,
			second + ' Nothing in the narration commits a new location, time, relationship, inventory result, or future player decision.',
		],
		dialogue: question ? [{ speaker: 'Archivist Maren', text: 'I can tell you what I saw, but I cannot tell you what the fissure truly is.' }] : [],
		events: [],
		stateChanges: [],
		memoryCandidates: [],
		audioCues: [],
		visualCues: [detail],
	});
}

function prepareRepository(): InMemoryWorldRepository {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'final_integrated_120';
	repository.seedStory(storyId);

	const run = repository.getStoryRun(storyId);
	assert.ok(run);
	run!.runtimeState = {
		...(run!.runtimeState || {}),
		plot: {
			storyId,
			version: 1,
			currentArc: 'WHISPERING_SPORE_SEA',
			summary: 'Determine what can reliably be learned about the starlight fissure.',
			beats: [],
			openThreads: ['Determine the origin of the starlight fissure'],
			updatedAt: repository.getWorldClock(storyId).getTimestamp().toString(),
		},
	};
	repository.saveStoryRun(run!);

	repository.saveStoryThread({
		storyId,
		threadId: 'final_audit_fissure_thread',
		title: 'Starlight fissure',
		summary: 'Determine the origin of the starlight fissure.',
		status: 'OPEN',
		priority: 'HIGH',
	});

	repository.getMemoryEngine(storyId).storeMemory(memory({ id: 'final-audit-episodic', memoryClass: 'EPISODIC' }));
	repository.getMemoryEngine(storyId).storeMemory(memory({
		id: 'final-audit-semantic',
		memoryClass: 'SEMANTIC',
		content: 'The archive has public records about starlight fissures, but their causes remain uncertain unless canonical evidence establishes otherwise.',
		importance: 80,
	}));

	return repository;
}

function prepareOrchestrator(primary: DeterministicMockAdapter, fallback: DeterministicMockAdapter): MultiModelOrchestrator {
	const orchestrator = new MultiModelOrchestrator();
	for (const model of orchestrator.getAllModels()) {
		if (!model.isEmergencyFloor) orchestrator.updateModelHealth(model.providerId, model.modelId, 'DisabledByUser');
	}
	const primaryRecord = narrativeModel(primary.providerId, 'final-audit-primary', 100);
	const fallbackRecord = narrativeModel(fallback.providerId, 'final-audit-fallback', 90);
	orchestrator.registerModel(primaryRecord);
	orchestrator.registerModel(fallbackRecord);
	orchestrator.registerAdapter(primary);
	orchestrator.registerAdapter(fallback);
	orchestrator.pinModelForTask('narrative.generate', primaryRecord.modelId);
	orchestrator.setFallbackChain('narrative.generate', [
		primary.providerId + '::' + primaryRecord.modelId,
		fallback.providerId + '::' + fallbackRecord.modelId,
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
	return orchestrator;
}

test('FINAL INTEGRATED AUDIT — 120 turns preserve the full N1-N19 narrative contract', async () => {
	const storyId = 'final_integrated_120';
	const repository = prepareRepository();
	const firstSituation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I observe the nearby person.',
		viewerActorId: repository.getPlayerLifecycle(storyId)?.actorId,
		worldRepo: repository,
	});
	const target = firstSituation.nearbyEntities.find((entity) => entity.kind !== 'PLAYER');
	assert.ok(target, 'Final integrated audit requires a visible NPC target.');
	repository.getMemoryEngine(storyId).storeMemory(memory({
		id: 'final-audit-target-episodic',
		relatedEntityIds: [target!.id],
		content: 'Earlier, the player watched ' + target!.name + ' pause beside the unstable starlight fissure before returning to the archive instruments.',
		triggerConditionTags: ['archive', 'fissure', 'observe'],
	}));

	const run = repository.getStoryRun(storyId);
	assert.ok(run);
	run!.runtimeState = {
		...(run!.runtimeState || {}),
		activeDialogue: {
			nodeId: 'final_audit_dialogue',
			speakerId: target!.id,
			speakerName: target!.name,
			text: 'The archivists are whispering about the unstable starlight fissure.',
		},
	};
	repository.saveStoryRun(run!);

	const primary = new DeterministicMockAdapter('final_audit_primary');
	const fallback = new DeterministicMockAdapter('final_audit_fallback');
	const orchestrator = prepareOrchestrator(primary, fallback);

	assert.equal(getAiTaskRoutingPolicy('narrative.generate').qualityTier, 'CREATIVE');
	assert.equal(getAiTaskRoutingPolicy('narrative.generate').cadence, 'PER_TURN');

	const canonicalBefore = JSON.stringify({
		events: repository.getCanonicalCommandEvents(storyId),
		player: repository.getPlayerLifecycle(storyId),
	});

	const observations: Array<{ turn: number; selectedModelId: string; promptChars: number; npcCount: number; socialParticipantCount: number; episodePhase?: string; richnessScore?: number; }> = [];

	for (let turn = 1; turn <= 120; turn += 1) {
		const action = ACTIONS[(turn - 1) % ACTIONS.length];
		const locationId = repository.getPlayerLifecycle(storyId)?.locationId;
		const locationNode = locationId ? repository.getGeographyGraph(storyId).getNode(locationId) : undefined;
		const locationName = locationNode?.name || 'the current archive';
		const response = responseForTurn(turn, locationName);
		if (turn < 61) {
			primary.cannedResponses.set('narrative.generate', response);
		} else {
			primary.failureMode = '500';
			fallback.cannedResponses.set('narrative.generate', response);
		}

		const result = await orchestrator.executeTurn({
			storyId,
			playerAction: action,
			repository,
			hardTokenBudget: 2200,
			timeoutMs: 1000,
			maxRetries: 0,
		});

		assert.equal(result.success, true, 'turn ' + turn + ': ' + (result.error || 'unknown failure'));
		assert.ok(result.narrativePlan, 'turn ' + turn + ': missing narrative plan');
		assert.ok(result.telemetry.narrativeProviderHandoff, 'turn ' + turn + ': missing N9 provider handoff');
		assert.ok(result.narrativeRichnessEvaluation, 'turn ' + turn + ': N18 richness evaluation missing');
		assert.ok(result.narrativePlan.socialTopology, 'turn ' + turn + ': N15 social topology missing');
		assert.ok(result.narrativePlan.episodeProjection, 'turn ' + turn + ': N17 episode projection missing');
		assert.ok(result.narrativePlan.npcCognition?.some((npc) => npc.actorId === target!.id), 'turn ' + turn + ': N5/N14 NPC cognition missing');
		assert.equal(result.narrativePlan.expiresAfterNarration, true);
		assert.equal(result.playerIntent?.originalText, action);

		const adapter = result.telemetry.selectedProviderId === primary.providerId ? primary : fallback;
		const lastCall = adapter.callHistory[adapter.callHistory.length - 1];
		assert.ok(lastCall, 'turn ' + turn + ': missing provider call');
		for (const marker of [
			'N13 SCENE COMPOSITION CONTRACT v1',
			'N15 SOCIAL ATTENTION',
			'N17 NARRATIVE EPISODE PROJECTION',
			'NARRATIVE RESEARCH',
			'NPC cognition contracts:',
			'expressiveIdentity',
			'MEMORY',
		]) {
			assert.ok(lastCall.prompt.includes(marker), 'turn ' + turn + ': missing prompt marker ' + marker);
		}
		assert.match(lastCall.options?.systemInstruction || '', /N9 PROVIDER HANDOFF CONTRACT/i, 'turn ' + turn + ': missing N9 handoff instruction');

		observations.push({
			turn,
			selectedModelId: result.telemetry.selectedModelId,
			promptChars: lastCall.prompt.length,
			npcCount: result.narrativePlan.npcCognition?.length || 0,
			socialParticipantCount: result.narrativePlan.socialTopology?.participants.length || 0,
			episodePhase: result.narrativePlan.episodeProjection?.phase,
			richnessScore: result.narrativeRichnessEvaluation.overallScore,
		});
	}

	const metrics = NarrativeLongSessionStressEngine.collect(repository, storyId);
	assert.deepEqual(NarrativeLongSessionStressEngine.validateBounds(metrics), []);
	assert.equal(metrics.turnCount, 120);
	assert.equal(metrics.narrativeContextHistory, 40);
	assert.ok(metrics.noveltyItems <= 120);
	assert.ok(metrics.continuity.narrativeBeats <= 8);
	assert.ok(metrics.continuity.responseShapes <= 8);
	assert.ok(metrics.plotBeats <= 40);
	assert.ok(metrics.plotOpenThreads <= 24);
	assert.ok(metrics.openNarrativeThreads <= 40);
	assert.ok(metrics.researchSnapshotBytes < 50000);
	assert.ok(primary.callHistory.length >= 1);
	assert.ok(primary.callHistory.length <= 60);
	assert.ok(fallback.callHistory.length >= 60);
	assert.ok(observations.filter((entry) => entry.selectedModelId === 'final-audit-fallback').length >= 60);
	assert.ok(observations.every((entry) => entry.promptChars < 24000));
	assert.ok(observations.every((entry) => entry.socialParticipantCount >= 0));
	assert.ok(observations.some((entry) => entry.episodePhase && entry.episodePhase !== 'OPENING'));
	assert.ok(observations.every((entry) => typeof entry.richnessScore === 'number'));
	assert.equal(JSON.stringify({ events: repository.getCanonicalCommandEvents(storyId), player: repository.getPlayerLifecycle(storyId) }), canonicalBefore, '120-turn presentation audit mutated canonical command/player state');
});

test('FINAL INTEGRATED AUDIT — N19 selects creative capability when explicit routing controls are absent', () => {
	const orchestrator = new MultiModelOrchestrator();
	const internal = orchestrator as any;
	internal.models.clear();
	internal.taskFallbackChains.clear();
	internal.taskPinnedModels.clear();
	internal.categoryOverrides.clear();
	const base = { providerId: 'final-quality-test', displayName: 'Final Quality Test', contextWindow: 128000, health: 'Healthy', quota: 'Healthy', latencyMs: 300, userPriority: 50, roleEligibility: ['narrative.generate'], accessStatus: 'accessible', fallbackEligibility: true, isEmergencyFloor: false };
	internal.models.set('final-quality-test::fast', { ...base, modelId: 'fast', pool: 'fast', capabilities: ['text_generation', 'fast'] });
	internal.models.set('final-quality-test::creative', { ...base, modelId: 'creative', pool: 'creative', capabilities: ['text_generation', 'creative_writing', 'long_context'] });
	const selection = orchestrator.selectBestModel('narrative.generate');
	assert.equal(selection.selectedModel.modelId, 'creative');
	assert.match(selection.selectionReason, /CREATIVE/);
});

test('FINAL INTEGRATED AUDIT — emergency floor preserves N13-N18 presentation contracts after total AI outage', async () => {
	const storyId = 'final_integrated_120';
	const repository = prepareRepository();
	const primary = new DeterministicMockAdapter('final_emergency_primary');
	const fallback = new DeterministicMockAdapter('final_emergency_fallback');
	primary.failureMode = '500';
	fallback.failureMode = '500';
	const orchestrator = prepareOrchestrator(primary, fallback);
	const result = await orchestrator.executeTurn({ storyId, playerAction: 'I inspect the nearby instrument.', repository, hardTokenBudget: 1500, timeoutMs: 1000, maxRetries: 0 });
	assert.equal(result.success, true, result.error || 'Emergency fallback failed');
	assert.equal(result.telemetry.selectedProviderId, 'provider_deterministic_emergency');
  assert.ok(fallback.callHistory.length >= 1);
  assert.ok(fallback.callHistory[fallback.callHistory.length - 1].prompt.includes('N13 SCENE COMPOSITION CONTRACT v1'));
	assert.ok(result.narrativePlan?.socialTopology);
	assert.ok(result.narrativePlan?.episodeProjection);
	assert.ok(result.narrativePlan?.npcCognition?.length);
	assert.ok(result.narrativeRichnessEvaluation);
	assert.match(result.telemetry.narrativeProviderHandoff?.providerIndependentInstruction || '', /N9 PROVIDER HANDOFF CONTRACT/i);
});