import test from 'node:test';
import assert from 'node:assert/strict';

import {
	MultiModelOrchestrator,
	DeterministicMockAdapter,
	type IProviderAdapter,
	type ModelRegistryRecord,
	type ProviderGenerateOptions,
	type ProviderGenerateResult,
} from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { NarratorVoiceEngine } from '../server/domain/narratorVoiceEngine';
import { NarrativeContinuityStateEngine } from '../server/domain/narrativeContinuityState';
import { NarrativeNoveltyEngine } from '../server/domain/narrativeNoveltyEngine';

class SequenceNarrativeAdapter implements IProviderAdapter {
	public readonly providerId = 'n12_sequence_provider';
	public readonly calls: Array<{ task: string; prompt: string; options?: ProviderGenerateOptions }> = [];
	private readonly responses: string[];

	constructor(responses: string[]) {
		this.responses = [...responses];
	}

	public async generate(task: any, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
		this.calls.push({ task, prompt, options });
		const text = this.responses.shift() || this.responses[this.responses.length - 1];
		if (!text) throw new Error('N12 test adapter has no response left.');
		return {
			text,
			latencyMs: 1,
			inputTokens: Math.ceil(prompt.length / 4),
			outputTokens: Math.ceil(text.length / 4),
			modelId: 'n12-sequence-model',
			providerId: this.providerId,
		};
	}

	public async validateCredentials(): Promise<boolean> {
		return true;
	}
}

class InspectableEmergencyAdapter implements IProviderAdapter {
	public readonly providerId = 'provider_deterministic_emergency';
	public readonly calls: Array<{ task: string; prompt: string; options?: ProviderGenerateOptions }> = [];

	public async generate(task: any, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
		this.calls.push({ task, prompt, options });
		const location = options?.canonicalLocationName || 'the current location';
		return {
			text: turnResponse(`At ${location}, the immediate scene remains grounded in the visible surroundings as you observe from your current position. There is no reliable answer beyond these directly visible details.`),
			latencyMs: 1,
			inputTokens: Math.ceil(prompt.length / 4),
			outputTokens: 30,
			modelId: 'emergency-fallback-local',
			providerId: this.providerId,
		};
	}

	public async validateCredentials(): Promise<boolean> {
		return true;
	}
}

function narrativeModel(): ModelRegistryRecord {
	return {
		providerId: 'n12_sequence_provider',
		modelId: 'n12-sequence-model',
		displayName: 'N12 Sequence Model',
		pool: 'creative',
		capabilities: ['text_generation', 'structured_output', 'creative_writing'],
		contextWindow: 128000,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 1,
		userPriority: 100,
		roleEligibility: ['narrative.generate'],
		fallbackEligibility: true,
		accessStatus: 'accessible',
		lifecycleState: 'active',
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['text', 'json'],
		hasStructuredOutput: true,
	};
}

function turnResponse(narration: string): string {
	return JSON.stringify({
		narrative: [narration],
		dialogue: [],
		events: [],
		stateChanges: [],
		memoryCandidates: [],
		audioCues: [],
	});
}

function prepare(orchestrator: MultiModelOrchestrator, adapter: SequenceNarrativeAdapter): void {
	for (const model of orchestrator.getAllModels()) {
		if (!model.isEmergencyFloor) orchestrator.updateModelHealth(model.providerId, model.modelId, 'DisabledByUser');
	}
	const model = narrativeModel();
	orchestrator.registerModel(model);
	orchestrator.registerAdapter(adapter);
	orchestrator.pinModelForTask('narrative.generate', model.modelId);
	orchestrator.setFallbackChain('narrative.generate', [
		adapter.providerId + '::' + model.modelId,
		'provider_deterministic_emergency::emergency-fallback-local',
	]);
}

test('N12 primary executeTurn carries N5 cognition and rewrites keep N9/N8 contracts', async () => {
	const storyId = 'n12_integrated_audit';
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);

	const initialSituation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I observe the nearby person.',
		viewerActorId: repository.getPlayerLifecycle(storyId)?.actorId,
		worldRepo: repository,
	});
	const target = initialSituation.nearbyEntities.find((entity) => entity.kind !== 'PLAYER');
	assert.ok(target, 'N12 fixture requires at least one non-player visible scene entity.');

	const locationName = initialSituation.location.name;
	const bad = turnResponse(
		`At ${locationName}, you notice ${target!.name} and then you decide to leave it alone. ` +
		'The nearby instruments continue their routine while you watch from your position; there is no reliable answer beyond what is directly visible, and no new fact is established.'
	);
	const good = turnResponse(
		`At ${locationName}, you keep ${target!.name} in view as the nearby work continues. ` +
		'You watch the figure\'s hands and the surrounding instruments, noticing the measured pace of the task and the details that remain visible from your position; there is no reliable answer beyond what is directly visible.'
	);

	const adapter = new SequenceNarrativeAdapter([bad, good]);
	const orchestrator = new MultiModelOrchestrator();
	prepare(orchestrator, adapter);

	const result = await orchestrator.executeTurn({
		storyId,
		playerAction: `I observe ${target!.name}.`,
		repository,
		hardTokenBudget: 1200,
		timeoutMs: 1000,
		maxRetries: 0,
	});

	assert.equal(result.success, true, result.error || 'N12 integrated turn failed.');
	assert.ok(result.narrativePlan?.npcCognition?.some((npc) => npc.actorId === target!.id), 'N5 cognition did not reach the primary executeTurn narrative plan.');
	assert.equal(adapter.calls.length, 2, 'N12 fixture should perform one primary generation plus one semantic rewrite.');
	assert.match(adapter.calls[1].options?.systemInstruction || '', /N9 PROVIDER HANDOFF CONTRACT/i, 'semantic rewrite lost the N9 provider handoff.');
	assert.equal(typeof adapter.calls[1].options?.maxTokens, 'number', 'N12 semantic rewrite must use an explicit N8-derived output budget.');
	assert.ok((adapter.calls[1].options?.maxTokens || 0) > 0, 'N12 semantic rewrite budget must be positive.');
	assert.equal(result.narrativeReview?.decision, 'ACCEPT');
	assert.equal(result.checkpoint?.styleContract?.profileId, NarratorVoiceEngine.resolve(repository, storyId).profileId);
	assert.match(adapter.calls[0].options?.systemInstruction || '', /N9 PROVIDER HANDOFF CONTRACT/i);
});


test('N12 live executeTurn injects persisted N4 continuity into the production narration prompt', async () => {
	const storyId = 'n12_live_n4_prompt';
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);
	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I observe the nearby person.',
		viewerActorId: repository.getPlayerLifecycle(storyId)?.actorId,
		worldRepo: repository,
	});
	const target = situation.nearbyEntities.find((entity) => entity.kind !== 'PLAYER');
	assert.ok(target);

	const continuity = NarrativeContinuityStateEngine.recordAcceptedTurn({
		repository,
		storyId,
		turnId: 'n12_previous',
		situation,
		intent: {
			action: 'observe',
			goal: 'observe',
			interactionMode: 'PASSIVE_OBSERVATION',
			speechIntent: false,
			movementIntent: false,
			observationIntent: true,
			explicitTargets: [{ id: target!.id, name: target!.name, kind: target!.kind, source: 'EXPLICIT' }],
			impliedTargets: [],
			confidence: 1,
			source: 'DETERMINISTIC',
			originalText: 'I observe the nearby person.',
		},
		narration: 'The room remains unsettled while you keep the nearby figure in view.',
	});
	const run = repository.getStoryRun(storyId);
	assert.ok(run);
	run!.runtimeState.narrativeContinuity = {
		...continuity,
		narrativeFocus: ['N12_CONTINUITY_FOCUS'],
		unresolvedSubtext: ['N12_CONTINUITY_SUBTEXT'],
		tension: 73,
		emotionalTemperature: 'TENSE',
	};
	repository.saveStoryRun(run!);

	const adapter = new SequenceNarrativeAdapter([
		turnResponse(`At ${situation.location.name}, you keep ${target!.name} in view while the immediate scene remains grounded in what you can see.`),
	]);
	const orchestrator = new MultiModelOrchestrator();
	prepare(orchestrator, adapter);

	const result = await orchestrator.executeTurn({
		storyId,
		playerAction: `I observe ${target!.name}.`,
		repository,
		hardTokenBudget: 1400,
		timeoutMs: 1000,
		maxRetries: 0,
	});

	assert.equal(result.success, true, result.error || 'N12 live continuity turn failed.');
	assert.match(adapter.calls[0].prompt, /N12_CONTINUITY_FOCUS/);
	assert.match(adapter.calls[0].prompt, /N12_CONTINUITY_SUBTEXT/);
	assert.match(adapter.calls[0].prompt, /NARRATIVE CONTINUITY STATE v1/);
	assert.match(adapter.calls[0].prompt, /Scene momentum:/);
});

test('N12 accepted executeTurn records novelty exactly once through the lifecycle authority', async () => {
	const storyId = 'n12_single_n7_record';
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);
	const situation = CurrentSituationBuilder.build({ storyId, playerAction: 'I observe the room.', worldRepo: repository });
	const adapter = new SequenceNarrativeAdapter([
		turnResponse(`At ${situation.location.name}, you observe the nearby work area and note only details available from your position.`),
	]);
	const orchestrator = new MultiModelOrchestrator();
	prepare(orchestrator, adapter);

	const result = await orchestrator.executeTurn({
		storyId,
		playerAction: 'I observe the room.',
		repository,
		hardTokenBudget: 1400,
		timeoutMs: 1000,
		maxRetries: 0,
	});
	assert.equal(result.success, true, result.error || 'N12 single-record turn failed.');
	const novelty = NarrativeNoveltyEngine.resolve(repository, storyId);
	assert.equal(novelty.turnCount, 1);
});

test('N12 emergency narration preserves N8/N9/N6 guarantees after provider exhaustion', async () => {
	const storyId = 'n12_emergency_contract';
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);
	const primary = new DeterministicMockAdapter('n12_primary_exhausted');
	primary.failureMode = '500';
	const emergency = new InspectableEmergencyAdapter();
	const orchestrator = new MultiModelOrchestrator();
	for (const model of orchestrator.getAllModels()) {
		if (!model.isEmergencyFloor) orchestrator.updateModelHealth(model.providerId, model.modelId, 'DisabledByUser');
	}
	const primaryRecord = narrativeModel();
	orchestrator.registerModel(primaryRecord);
	orchestrator.registerAdapter(primary);
	orchestrator.registerModel({
		providerId: emergency.providerId,
		modelId: 'emergency-fallback-local',
		displayName: 'N12 Inspectable Emergency Floor',
		pool: 'emergency',
		capabilities: ['zero_cost', 'unlimited_quota', 'deterministic', 'text_generation', 'structured_output', 'text'],
		contextWindow: 1000000,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 1,
		userPriority: 10,
		roleEligibility: ['narrative.generate'],
		isEmergencyFloor: true,
		fallbackEligibility: true,
		accessStatus: 'accessible',
		lifecycleState: 'active',
		supportedInputTypes: ['text'],
		supportedOutputTypes: ['text', 'json'],
	});
	orchestrator.registerAdapter(emergency);
	orchestrator.pinModelForTask('narrative.generate', primaryRecord.modelId);
	orchestrator.setFallbackChain('narrative.generate', [
		primary.providerId + '::' + primaryRecord.modelId,
		'provider_deterministic_emergency::emergency-fallback-local',
	]);

	const result = await orchestrator.executeTurn({
		storyId,
		playerAction: 'I observe the room.',
		repository,
		hardTokenBudget: 1400,
		timeoutMs: 1000,
		maxRetries: 0,
	});

	assert.equal(result.success, true, result.error || 'N12 emergency recovery failed.');
	assert.equal(result.telemetry.selectedProviderId, 'provider_deterministic_emergency');
	assert.ok(result.telemetry.narrativeProviderHandoff, 'Emergency telemetry lost N9 handoff.');
	assert.equal(emergency.calls.length, 1);
	assert.equal(typeof emergency.calls[0].options?.maxTokens, 'number');
	assert.ok((emergency.calls[0].options?.maxTokens || 0) > 0);
	assert.match(emergency.calls[0].options?.systemInstruction || '', /N9 PROVIDER HANDOFF CONTRACT/i);
	assert.ok(result.literaryReview === undefined || result.literaryReview.decision === 'ACCEPT');
});
