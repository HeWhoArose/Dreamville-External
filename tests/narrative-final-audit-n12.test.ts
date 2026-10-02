import test from 'node:test';
import assert from 'node:assert/strict';

import {
	MultiModelOrchestrator,
	type IProviderAdapter,
	type ModelRegistryRecord,
	type ProviderGenerateOptions,
	type ProviderGenerateResult,
} from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { NarratorVoiceEngine } from '../server/domain/narratorVoiceEngine';

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
