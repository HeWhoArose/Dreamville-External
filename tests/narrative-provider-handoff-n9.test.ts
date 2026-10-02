import test from 'node:test';
import assert from 'node:assert/strict';
import { NarrativeProviderHandoffEngine } from '../server/domain/narrativeProviderHandoff';
import { NarratorVoiceEngine } from '../server/domain/narratorVoiceEngine';
import { NarrativePacingEngine } from '../server/domain/narrativePacingEngine';
import { NarrativeQualityContractEngine } from '../server/domain/narrativeQualityContract';
import { NarrativeContinuityStateEngine } from '../server/domain/narrativeContinuityState';
import { NarrativeNoveltyEngine } from '../server/domain/narrativeNoveltyEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';
import { DeterministicMockAdapter, MultiModelOrchestrator, type ModelRegistryRecord } from '../server/domain/aiOrchestrator';

function model(providerId: string, modelId: string, priority = 100): ModelRegistryRecord {
	return {
		providerId, modelId, displayName: modelId, pool: 'creative',
		capabilities: ['text_generation', 'structured_output', 'creative_writing'],
		contextWindow: 128000, health: 'Healthy', quota: 'Healthy', latencyMs: 5,
		userPriority: priority, roleEligibility: ['narrative.generate'], fallbackEligibility: true,
		accessStatus: 'accessible', lifecycleState: 'active',
		supportedInputTypes: ['text'], supportedOutputTypes: ['text', 'json'], hasStructuredOutput: true,
	};
}

const validNarrative = JSON.stringify({
	narrative: ['You move closer to the archivists, keeping your attention on the low conversation.', 'The whispers mention unstable starlight fissures in the lower sea.'],
	dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [],
});

function prepare(primary: DeterministicMockAdapter, fallback?: DeterministicMockAdapter) {
	const o = new MultiModelOrchestrator();
	for (const m of o.getAllModels()) if (!m.isEmergencyFloor) o.updateModelHealth(m.providerId, m.modelId, 'DisabledByUser');
	const p = model(primary.providerId, 'n9-primary', 100); o.registerModel(p); o.registerAdapter(primary);
	const chain = [primary.providerId + '::n9-primary'];
	if (fallback) { const f = model(fallback.providerId, 'n9-fallback', 90); o.registerModel(f); o.registerAdapter(f); chain.push(f.providerId + '::n9-fallback'); }
	chain.push('provider_deterministic_emergency::emergency-fallback-local');
	o.pinModelForTask('narrative.generate', p.modelId);
	o.setFallbackChain('narrative.generate', chain);
	return o;
}

test('N9 creates a provider-independent presentation fingerprint', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n9_contract');
	const situation = CurrentSituationBuilder.build({ storyId: 'n9_contract', playerAction: 'I observe.', worldRepo: repository });
	const intent = PlayerIntentInterpreter.deterministic('I observe.', situation);
	const voice = NarratorVoiceEngine.resolve(repository, 'n9_contract');
	const quality = NarrativeQualityContractEngine.resolve(intent);
	const pacing = NarrativePacingEngine.resolve({ situation, intent });
	const continuity = NarrativeContinuityStateEngine.defaultState('n9_contract');
	const novelty = NarrativeNoveltyEngine.defaultState('n9_contract');
	const contract = NarrativeProviderHandoffEngine.resolve({ storyId: 'n9_contract', turnId: situation.turnId, voice, quality, pacing, continuity, novelty });
	const snapshot = NarrativeProviderHandoffEngine.snapshot(contract);
	assert.ok(contract.handoffId.startsWith('n9.'));
	assert.equal(NarrativeProviderHandoffEngine.samePresentationContract(contract, snapshot), true);
	assert.match(contract.providerIndependentInstruction, /selected model is an interchangeable provider/i);
	assert.match(NarrativeProviderHandoffEngine.toPromptContext(contract), /N9 PROVIDER HANDOFF CONTRACT/);
});

test('N9 fallback providers receive the identical provider-independent handoff', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n9_fallback');
	const primary = new DeterministicMockAdapter('n9_primary');
	primary.failureMode = 'malformed_json';
	const fallback = new DeterministicMockAdapter('n9_fallback');
	fallback.cannedResponses.set('narrative.generate', validNarrative);
	const orchestrator = prepare(primary, fallback);
	const result = await orchestrator.generateNarrativeOnly({
		storyId: 'n9_fallback',
		playerAction: 'I move closer to hear the rumors.',
		hardTokenBudget: 1400,
		timeoutMs: 1000,
		maxRetries: 0,
	});
	assert.equal(result.success, true, result.error);
	assert.equal(primary.callHistory.length, 1);
	assert.equal(fallback.callHistory.length, 1);
	const primaryInstruction = primary.callHistory[0].options?.systemInstruction || '';
	const fallbackInstruction = fallback.callHistory[0].options?.systemInstruction || '';
	assert.equal(primaryInstruction, fallbackInstruction);
	assert.match(primaryInstruction, /N9 PROVIDER HANDOFF CONTRACT/);
	assert.match(primaryInstruction, /provider\\/model changes must alter implementation only/i);
	assert.match(fallback.callHistory[0].prompt, /N9 PROVIDER HANDOFF CONTRACT/);
	assert.ok(result.modelId);
});

test('N9 emergency floor receives the same handoff contract', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n9_emergency');
	const primary = new DeterministicMockAdapter('n9_primary_emergency');
	primary.failureMode = '500';
	const orchestrator = prepare(primary);
	const result = await orchestrator.generateNarrativeOnly({
		storyId: 'n9_emergency',
		playerAction: 'I move closer to hear the rumors.',
		hardTokenBudget: 1400,
		timeoutMs: 1000,
		maxRetries: 0,
	});
	assert.equal(result.success, true, result.error);
	assert.equal(result.source, 'DETERMINISTIC_FALLBACK');
	assert.ok(result.narrativeProviderHandoff);
	assert.match(result.narrativeProviderHandoff.providerIndependentInstruction, /N9 PROVIDER HANDOFF CONTRACT/);
});
