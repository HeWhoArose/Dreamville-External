import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { NarrativeLongSessionStressEngine } from '../server/domain/narrativeLongSessionStress';

function narrativeModel(
	providerId: string,
	modelId: string,
	overrides: Partial<ModelRegistryRecord> = {},
): ModelRegistryRecord {
	return {
		providerId,
		modelId,
		displayName: modelId,
		pool: 'creative',
		capabilities: ['text_generation', 'structured_output', 'creative_writing', 'long_context'],
		contextWindow: 128000,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 5,
		userPriority: 100,
		roleEligibility: ['narrative.generate'],
		fallbackEligibility: true,
		accessStatus: 'accessible',
		lifecycleState: 'active',
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['text', 'json'],
		hasStructuredOutput: true,
		...overrides,
	};
}

function responseForTurn(turn: number): string {
	const details = [
		'Brass rings click softly above the rail while blue instrument light moves across the stone.',
		'A faint mechanical hum passes through the chamber as dust settles beside the workbench.',
		'The prism glass catches a pale reflection before the light fades back into the orrery.',
		'A loose page stirs near Maren’s elbow and settles beneath the steady ticking of the instruments.',
		'The air carries the dry scent of old paper and metal while the chamber remains otherwise quiet.',
		'One of the outer rings turns a fraction and stops, leaving the archive in measured silence.',
		'Maren keeps her attention on the records while distant footsteps fade beyond the vault arch.',
		'A small tremor travels through the brass rail and disappears almost as quickly as it arrived.',
	];
	const detail = details[(turn - 1) % details.length];
	return JSON.stringify({
		narrative: [
			'You remain within the Whispering Orrery, listening to Maren the Archivist without speaking or changing the scene.',
			turn % 3 === 0
				? 'Her quiet work continues beside the records, and the starlight fissure reports remain uncertain rather than established fact. ' + detail
				: detail + ' Maren continues her careful work while the unverified fissure rumors remain only rumors.',
		],
		dialogue: [],
		events: [],
		stateChanges: [],
		memoryCandidates: [],
		audioCues: [],
		visualCues: ['Whispering Orrery', 'Maren the Archivist', detail],
	});
}

function prepareOrchestrator(
	primary: DeterministicMockAdapter,
	fallback: DeterministicMockAdapter,
): MultiModelOrchestrator {
	const orchestrator = new MultiModelOrchestrator();
	const internal = orchestrator as any;

	for (const model of orchestrator.getAllModels()) {
		if (!model.isEmergencyFloor) {
			orchestrator.updateModelHealth(model.providerId, model.modelId, 'DisabledByUser');
		}
	}

	// Final audit deliberately removes explicit pins/routes/overrides so N19's
	// quality-tier selector is the active authority for ordinary task selection.
	internal.taskFallbackChains.clear();
	internal.taskPinnedModels.clear();
	internal.categoryOverrides.clear();
	internal.manualOverrides.clear();
	internal.explicitFallbackChainTasks.clear();

	orchestrator.registerModel(narrativeModel(primary.providerId, 'final-audit-primary', {
		pool: 'creative',
		capabilities: ['text_generation', 'structured_output', 'creative_writing', 'long_context'],
		userPriority: 50,
	}));
	orchestrator.registerModel(narrativeModel(fallback.providerId, 'final-audit-fallback', {
		pool: 'fast',
		capabilities: ['text_generation', 'fast'],
		userPriority: 50,
	}));
	orchestrator.registerAdapter(primary);
	orchestrator.registerAdapter(fallback);
	return orchestrator;
}

function canonicalSnapshot(repository: InMemoryWorldRepository, storyId: string): string {
	return JSON.stringify({
		events: repository.getCanonicalCommandEvents(storyId),
		player: repository.getPlayerLifecycle(storyId),
	});
}

test('FINAL INTEGRATED AUDIT — 120 narrative turns preserve N1-N19 contracts, fallback recovery, bounds, and canonical safety', async () => {
	const storyId = 'final_n1_n19_120_turn_audit';
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);

	const run = repository.getStoryRun(storyId);
	assert.ok(run);
	run.runtimeState = {
		...(run.runtimeState || {}),
		activeDialogue: {
			nodeId: 'final_audit_dialogue',
			speakerId: 'char_maren',
			speakerName: 'Maren the Archivist',
			text: 'Maren is quietly reviewing reports about unstable starlight fissures beneath the citadel.',
		},
		plot: {
			storyId,
			version: 1,
			currentArc: 'WHISPERING_SPORE_SEA',
			summary: 'Determine whether the starlight fissure reports are reliable.',
			beats: [],
			openThreads: ['Determine whether the reported starlight fissures are real.'],
			updatedAt: repository.getWorldClock(storyId).getTimestamp().toString(),
		},
	};
	repository.saveStoryRun(run);

	const primary = new DeterministicMockAdapter('final_audit_primary_provider');
	const fallback = new DeterministicMockAdapter('final_audit_fallback_provider');
	const orchestrator = prepareOrchestrator(primary, fallback);
	const canonicalBefore = canonicalSnapshot(repository, storyId);

	const observations: Array<{
		turn: number;
		modelId: string;
		providerId: string;
		promptChars: number;
		qualityTier: string;
		richnessScore: number;
		richnessDimensions: number;
		planHasNpcIdentity: boolean;
		socialRoles: number;
		hasEpisodeProjection: boolean;
		hasSceneCompositionPrompt: boolean;
		hasResearchPrompt: boolean;
	}> = [];

	for (let turn = 1; turn <= 120; turn += 1) {
		primary.cannedResponses.set('narrative.generate', responseForTurn(turn));
		fallback.cannedResponses.set('narrative.generate', responseForTurn(turn));

		if (turn === 61) {
			primary.failureMode = '500';
		}
		if (turn === 91) {
			fallback.failureMode = '500';
		}

		const result = await orchestrator.executeTurn({
			storyId,
			playerAction: 'I observe Maren and listen to the rumors.',
			repository,
			hardTokenBudget: 1500,
			timeoutMs: 1000,
			maxRetries: 0,
		});

		assert.equal(result.success, true, 'turn ' + turn + ': ' + (result.error || 'unknown failure'));
		assert.ok(result.playerIntent, 'turn ' + turn + ': missing player intent');
		assert.equal(result.playerIntent?.speechIntent, false, 'turn ' + turn + ': speech intent drifted');
		assert.equal(result.playerIntent?.observationIntent, true, 'turn ' + turn + ': observation intent drifted');
		assert.equal(result.playerIntent?.movementIntent, false, 'turn ' + turn + ': movement intent drifted');

		assert.ok(result.narrativePlan, 'turn ' + turn + ': missing narrative plan');
		assert.ok(result.narrativePlan?.socialTopology, 'turn ' + turn + ': N15 social topology missing');
		assert.ok(result.narrativePlan?.episodeProjection, 'turn ' + turn + ': N17 episode projection missing');
		assert.ok((result.narrativePlan?.npcCognition || []).length >= 1, 'turn ' + turn + ': N14 NPC cognition missing');

		const npc = result.narrativePlan?.npcCognition?.[0];
		assert.ok(npc?.expressiveIdentity, 'turn ' + turn + ': N14 expressive identity missing');
		assert.equal(npc?.expressiveIdentity?.expiresAfterNarration, true, 'turn ' + turn + ': N14 must remain ephemeral');

		const prompt =
			(turn === 61 && fallback.callHistory.length > 0
				? fallback.callHistory[fallback.callHistory.length - 1]?.prompt
				: turn >= 91 && fallback.failureMode === '500'
					? primary.callHistory[primary.callHistory.length - 1]?.prompt
					: result.telemetry.selectedProviderId === primary.providerId
						? primary.callHistory[primary.callHistory.length - 1]?.prompt
						: fallback.callHistory[fallback.callHistory.length - 1]?.prompt) || '';

		assert.match(prompt, /N13 SCENE COMPOSITION/i, 'turn ' + turn + ': N13 prompt section missing');
		assert.match(prompt, /N15 SOCIAL ATTENTION \/ CONVERSATION TOPOLOGY/i, 'turn ' + turn + ': N15 prompt section missing');
		assert.match(prompt, /N17 NARRATIVE EPISODE PROJECTION/i, 'turn ' + turn + ': N17 prompt section missing');
		assert.match(prompt, /NARRATIVE RESEARCH/i, 'turn ' + turn + ': bounded research section missing');
		assert.match(prompt, /Maren the Archivist/i, 'turn ' + turn + ': NPC context disappeared');
		assert.ok(prompt.length < 20000, 'turn ' + turn + ': prompt escaped long-session envelope');

		const richness = result.narrativeRichnessEvaluation;
		assert.ok(richness, 'turn ' + turn + ': N18 richness evaluation missing');
		assert.equal(richness?.presentationOnly, true, 'turn ' + turn + ': N18 must remain presentation-only');
		assert.equal(richness?.source, 'DETERMINISTIC', 'turn ' + turn + ': N18 source drifted');
		assert.equal(richness?.dimensions.length, 12, 'turn ' + turn + ': N18 dimension count drifted');

		assert.equal(result.turnPackage?.stateChanges?.length || 0, 0, 'turn ' + turn + ': provider proposed canonical mutation');
		assert.equal(result.adjudicationResult?.approvedCount || 0, 0, 'turn ' + turn + ': canonical state mutation was approved');
		assert.equal(result.narrativeReview?.decision, 'ACCEPT', 'turn ' + turn + ': semantic review failed');
		assert.ok(result.telemetry.narrativeProviderHandoff, 'turn ' + turn + ': N9 handoff missing');
		assert.ok(result.telemetry.aiCallBudget, 'turn ' + turn + ': AI budget telemetry missing');
		assert.ok(result.telemetry.aiCallBudget!.logicalCallsByTask['narrative.generate'] <= 1, 'turn ' + turn + ': narrative.generate exceeded one logical call');
		assert.ok((result.telemetry.aiCallBudget!.logicalCallsByTask['narrative.review'] || 0) <= 1, 'turn ' + turn + ': narrative.review exceeded one logical call');

		observations.push({
			turn,
			modelId: result.telemetry.selectedModelId,
			providerId: result.telemetry.selectedProviderId,
			promptChars: prompt.length,
			qualityTier: result.telemetry.selectionReason,
			richnessScore: richness!.overallScore,
			richnessDimensions: richness!.dimensions.length,
			planHasNpcIdentity: Boolean(npc?.expressiveIdentity),
			socialRoles: result.narrativePlan?.socialTopology?.participants?.length || 0,
			hasEpisodeProjection: Boolean(result.narrativePlan?.episodeProjection),
			hasSceneCompositionPrompt: /N13 SCENE COMPOSITION/i.test(prompt),
			hasResearchPrompt: /NARRATIVE RESEARCH/i.test(prompt),
		});

		if (turn === 60) {
			assert.equal(result.telemetry.selectedModelId, 'final-audit-primary', 'N19 did not select the creative model before degradation');
			assert.match(result.telemetry.selectionReason, /CREATIVE/i, 'N19 creative tier was not visible in selection telemetry');
		}
	}

	const metrics = NarrativeLongSessionStressEngine.collect(repository, storyId);
	assert.deepEqual(
		NarrativeLongSessionStressEngine.validateBounds(metrics),
		[],
		'long-session bound failures: ' + NarrativeLongSessionStressEngine.validateBounds(metrics).join('\n'),
	);

	assert.equal(metrics.turnCount, 120);
	assert.equal(metrics.narrativeContextHistory, 40);
	assert.ok(metrics.noveltyItems <= 120);
	assert.ok(metrics.continuity.narrativeBeats <= 8);
	assert.ok(metrics.continuity.responseShapes <= 8);
	assert.ok(metrics.continuity.focus <= 6);
	assert.ok(metrics.plotBeats <= 40);
	assert.ok(metrics.plotOpenThreads <= 24);
	assert.ok(metrics.openNarrativeThreads <= 40);
	assert.ok(metrics.researchSnapshotBytes < 50000);
	assert.equal(canonicalSnapshot(repository, storyId), canonicalBefore, '120-turn presentation path mutated canonical state');

	assert.ok(primary.callHistory.length >= 60, 'primary provider did not carry the initial session');
	assert.ok(fallback.callHistory.length >= 30, 'fallback provider did not carry a meaningful recovery window');

	const fallbackSelections = observations.filter((item) => item.modelId === 'final-audit-fallback').length;
	const emergencySelections = observations.filter((item) => item.modelId === 'emergency-fallback-local').length;
	assert.ok(fallbackSelections > 0, 'N19/N11 fallback provider was never exercised');
	assert.ok(emergencySelections > 0, 'deterministic emergency floor was never exercised');

	const postStartup = observations.slice(1);
	assert.equal(new Set(postStartup.map((item) => item.richnessDimensions)).size, 1);
	assert.ok(postStartup.every((item) => item.planHasNpcIdentity));
	assert.ok(postStartup.every((item) => item.hasEpisodeProjection));
	assert.ok(postStartup.every((item) => item.hasSceneCompositionPrompt));
	assert.ok(postStartup.every((item) => item.hasResearchPrompt));

	const promptSamples = observations.filter((_, index) => index % 10 === 0).map((item) => item.promptChars);
	assert.ok(Math.max(...promptSamples) < 20000);
	assert.ok(promptSamples[promptSamples.length - 1] < promptSamples[0] * 2.5);

	assert.ok(observations.some((item) => item.turn === 61 && item.modelId === 'final-audit-fallback'), 'turn 61 did not recover to configured fallback candidate path');
	assert.ok(observations.some((item) => item.turn === 91 && item.modelId === 'emergency-fallback-local'), 'turn 91 did not recover to emergency floor');
});

test('FINAL INTEGRATED AUDIT — N18 receives the resolved N13 composition projection', async () => {
	const fs = await import('node:fs/promises');
	const source = await fs.readFile(new URL('../server/domain/aiOrchestrator.ts', import.meta.url), 'utf8');
	assert.match(source, /const richnessEvaluationPlan: EphemeralNarrativePlan = \{/);
	assert.match(source, /sceneComposition:\s*narrationPrompt\.sceneComposition/);
	assert.match(source, /plan:\s*richnessEvaluationPlan/);
});
