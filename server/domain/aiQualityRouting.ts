import type { ModelPool, ModelRegistryRecord, TaskId } from './aiOrchestrator';
import { getAiTaskContract } from './aiTaskContracts';

export type AiQualityTier = 'FAST' | 'STANDARD' | 'CREATIVE' | 'PREMIUM_CREATIVE' | 'REVIEW';
export type AiTaskCadence = 'PER_TURN' | 'CONDITIONAL' | 'PERIODIC';

export interface AiTaskRoutingPolicy {
	task: TaskId;
	qualityTier: AiQualityTier;
	cadence: AiTaskCadence;
	reason: string;
}

const TASK_POLICIES: Partial<Record<TaskId, Omit<AiTaskRoutingPolicy, 'task'>>> = {
	'narrative.generate': { qualityTier: 'CREATIVE', cadence: 'PER_TURN', reason: 'Final narration requires creative-writing capability on every resolved turn.' },
	'character.dialogue': { qualityTier: 'CREATIVE', cadence: 'PER_TURN', reason: 'Character speech requires expressive creative-writing capability when dialogue is requested.' },
	'narrative.review': { qualityTier: 'REVIEW', cadence: 'CONDITIONAL', reason: 'Narrative review is invoked only when the existing review flow requests it.' },
	'intent.interpret': { qualityTier: 'FAST', cadence: 'PER_TURN', reason: 'Intent interpretation is latency-sensitive classification/extraction.' },
	'memory.extract': { qualityTier: 'STANDARD', cadence: 'CONDITIONAL', reason: 'Memory extraction is bounded and conditional on an accepted turn requiring extraction.' },
	'research.query': { qualityTier: 'STANDARD', cadence: 'CONDITIONAL', reason: 'Research expansion is conditional and should prefer reliable context handling over prose flourish.' },
	'research.world-brief': { qualityTier: 'STANDARD', cadence: 'PERIODIC', reason: 'World-brief work is consolidation-oriented rather than a mandatory every-turn operation.' },
	'summary.scene': { qualityTier: 'STANDARD', cadence: 'PERIODIC', reason: 'Scene summaries are compression/consolidation work.' },
	'world.generate': { qualityTier: 'PREMIUM_CREATIVE', cadence: 'CONDITIONAL', reason: 'World generation benefits from stronger creative synthesis but is not a per-turn requirement.' },
	'character.capability.propose': { qualityTier: 'STANDARD', cadence: 'CONDITIONAL', reason: 'Capability proposals must prioritize structured reasoning and canonical safety over prose quality.' },
	'capability.synthesize': { qualityTier: 'STANDARD', cadence: 'CONDITIONAL', reason: 'Capability synthesis is a bounded reasoning operation.' },
	'capability.explain': { qualityTier: 'STANDARD', cadence: 'CONDITIONAL', reason: 'Capability explanations should remain clear and grounded rather than maximize creative style.' },
};

function categoryDefault(task: TaskId): Omit<AiTaskRoutingPolicy, 'task'> {
	const category = getAiTaskContract(task).category;
	switch (category) {
		case 'narration':
		case 'dialogue':
			return {
				qualityTier: 'CREATIVE',
				cadence: 'PER_TURN',
				reason: 'Narrative/dialogue category defaults to creative-capability routing.',
			};
		case 'research':
		case 'research_world_brief':
		case 'memory':
		case 'summarization':
			return {
				qualityTier: 'STANDARD',
				cadence: category === 'research_world_brief' || category === 'summarization' ? 'PERIODIC' : 'CONDITIONAL',
				reason: 'Context/retrieval category defaults to standard-quality bounded routing.',
			};
		case 'intent_interpretation':
			return {
				qualityTier: 'FAST',
				cadence: 'PER_TURN',
				reason: 'Intent interpretation defaults to low-latency routing.',
			};
		default:
			return {
				qualityTier: 'STANDARD',
				cadence: 'CONDITIONAL',
				reason: 'Task has no specialized N19 policy; standard bounded routing is used.',
			};
	}
}

export function getAiTaskRoutingPolicy(task: TaskId): AiTaskRoutingPolicy {
	const override = TASK_POLICIES[task];
	return {
		task,
		...(override || categoryDefault(task)),
	};
}

function capabilityScore(model: ModelRegistryRecord, capability: string): number {
	return (model.capabilities || []).includes(capability) ? 1 : 0;
}

function poolScore(model: ModelRegistryRecord, pool: ModelPool): number {
	return model.pool === pool ? 1 : 0;
}

export function scoreModelForQualityTier(model: ModelRegistryRecord, tier: AiQualityTier): number {
	if (model.isEmergencyFloor) return -100000;
	const latency = Math.max(0, Math.min(20, 1500 - Math.max(0, model.latencyMs)) / 75);
	const context = model.contextWindow > 0 ? Math.min(20, model.contextWindow / 65536) : 0;
	const output = Math.min(10, (model.outputTokenLimit || 0) / 800);
	switch (tier) {
		case 'FAST':
			return capabilityScore(model, 'fast') * 60 + poolScore(model, 'fast') * 35 + latency;
		case 'STANDARD':
			return capabilityScore(model, 'text_generation') * 20 + capabilityScore(model, 'long_context') * 20 + latency;
		case 'CREATIVE':
			return capabilityScore(model, 'creative_writing') * 70 + poolScore(model, 'creative') * 35 + capabilityScore(model, 'long_context') * 10 + context + output;
		case 'PREMIUM_CREATIVE':
			return capabilityScore(model, 'creative_writing') * 70 + capabilityScore(model, 'reasoning') * 35 + capabilityScore(model, 'long_context') * 20 + poolScore(model, 'creative') * 25 + context + output;
		case 'REVIEW':
			return poolScore(model, 'review') * 70 + capabilityScore(model, 'reasoning') * 45 + capabilityScore(model, 'creative_writing') * 20 + context;
	}
}

export function compareModelsForQualityTier(
	a: ModelRegistryRecord,
	b: ModelRegistryRecord,
	tier: AiQualityTier,
): number {
	const tierDiff = scoreModelForQualityTier(b, tier) - scoreModelForQualityTier(a, tier);
	if (tierDiff !== 0) return tierDiff;
	return (a.modelId + '::' + a.providerId).localeCompare(b.modelId + '::' + b.providerId);
}
