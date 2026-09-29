import type { AiTaskCategory, TaskId, ModelRegistryRecord } from './aiOrchestrator';

export type AiTaskContextContract =
	| 'CANONICAL_STATE'
	| 'CHARACTER'
	| 'WORLD'
	| 'RULES'
	| 'COMBAT'
	| 'NARRATIVE'
	| 'MEMORY'
	| 'RESEARCH'
	| 'EPISTEMIC'
	| 'OOC'
	| 'TACTICAL'
	| 'GENERATION'
	| 'MEDIA';

export type AiTaskToolMode = 'READ' | 'MUTATE';

export type AiTaskValidatorKind =
	| 'NONE'
	| 'JSON_OBJECT'
	| 'JSON_ARRAY'
	| 'TEXT_OR_JSON_OBJECT';

export type AiTaskReadinessState =
	| 'DISCOVERED'
	| 'CLASSIFIED'
	| 'CAPABILITY_COMPATIBLE'
	| 'CONFIGURED'
	| 'QUOTA_AVAILABLE'
	| 'TASK_VERIFIED'
	| 'READY'
	| 'THROTTLED'
	| 'COOLDOWN'
	| 'UNAVAILABLE'
	| 'REJECTED'
	| 'UNKNOWN';

export interface AiTaskFallbackPolicy {
	maxPrimaryAttempts: number;
	maxTotalAttempts: number;
	allowEmergencyFloor: boolean;
	retryableFailures: Array<'TIMEOUT' | '429' | '5XX' | 'AUTH' | 'UNAVAILABLE' | 'MALFORMED' | 'OTHER'>;
}

export interface AiTaskReadiness {
	task: TaskId;
	modelId: string;
	providerId: string;
	state: AiTaskReadinessState;
	reason: string;
	capabilityCompatible: boolean;
	contextCompatible: boolean;
	quotaAvailable: boolean;
}

export interface AiTaskContract {
	task: TaskId;
	category: AiTaskCategory;
	requiredCapabilities: string[];
	preferredCapabilities: string[];
	requiredInputTypes: string[];
	requiredOutputTypes: string[];
	requiresStructuredOutput: boolean;
	preferredPools: string[];
	defaultTimeoutMs: number;
	defaultMaxTokens: number;
	contextContracts?: AiTaskContextContract[];
	requiredToolModes?: AiTaskToolMode[];
	validatorKind?: AiTaskValidatorKind;
	fallbackPolicy?: AiTaskFallbackPolicy;
	downstreamConsumer?: string;
}

const OOC_CONTRACT: AiTaskContract = {
	task: 'ooc.respond',
	category: 'gameplay_advice',
	requiredCapabilities: ['text_generation'],
	preferredCapabilities: ['fast', 'reasoning', 'long_context'],
	requiredInputTypes: ['text'],
	requiredOutputTypes: ['text', 'json'],
	requiresStructuredOutput: false,
	preferredPools: ['fast', 'reasoning', 'long_context'],
	defaultTimeoutMs: 8000,
	defaultMaxTokens: 1200,
};

const CONTRACTS: Record<TaskId, AiTaskContract> = {
	'ooc.respond': OOC_CONTRACT,
	'narrative.generate': {
		task: 'narrative.generate',
		category: 'narration',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['creative_writing', 'fast'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text', 'json'],
		requiresStructuredOutput: false,
		preferredPools: ['creative', 'fast'],
		defaultTimeoutMs: 15000,
		defaultMaxTokens: 800,
	},
	'character.dialogue': {
		task: 'character.dialogue',
		category: 'dialogue',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['creative_writing'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text', 'json'],
		requiresStructuredOutput: false,
		preferredPools: ['fast', 'creative'],
		defaultTimeoutMs: 10000,
		defaultMaxTokens: 900,
	},
	'character.extract': {
		task: 'character.extract',
		category: 'character_genesis',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['fast', 'structured_extraction', 'structured_output'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['fast', 'reasoning'],
		defaultTimeoutMs: 20000,
		defaultMaxTokens: 2400,
	},
	'memory.extract': {
		task: 'memory.extract',
		category: 'memory',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['fast', 'structured_extraction', 'structured_output'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['fast', 'long_context'],
		defaultTimeoutMs: 10000,
		defaultMaxTokens: 900,
	},
	'character.capability.propose': {
		task: 'character.capability.propose',
		category: 'capability_synthesis',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['reasoning', 'extended_thinking', 'structured_output'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['reasoning', 'creative'],
		defaultTimeoutMs: 16000,
		defaultMaxTokens: 1800,
	},
	'story.advice': {
		task: 'story.advice',
		category: 'gameplay_advice',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['fast'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['fast'],
		defaultTimeoutMs: 3500,
		defaultMaxTokens: 700,
	},
	'rules.adjudicate': {
		task: 'rules.adjudicate',
		category: 'rules',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['reasoning', 'extended_thinking', 'structured_output'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['reasoning'],
		defaultTimeoutMs: 10000,
		defaultMaxTokens: 1200,
	},
	'rules.analyze': {
		task: 'rules.analyze',
		category: 'rule_analysis',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['reasoning', 'extended_thinking', 'structured_output'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['reasoning', 'review'],
		defaultTimeoutMs: 10000,
		defaultMaxTokens: 1200,
	},
	'summary.scene': {
		task: 'summary.scene',
		category: 'summarization',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['fast', 'long_context'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text', 'json'],
		requiresStructuredOutput: false,
		preferredPools: ['fast', 'long_context'],
		defaultTimeoutMs: 8000,
		defaultMaxTokens: 900,
	},
	'world.generate': {
		task: 'world.generate',
		category: 'world_generation',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['creative_writing', 'reasoning'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['creative', 'reasoning'],
		defaultTimeoutMs: 20000,
		defaultMaxTokens: 3000,
	},

	'speech.generate': {
		task: 'speech.generate',
		category: 'speech',
		requiredCapabilities: ['speech_synthesis'],
		preferredCapabilities: ['tts'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['audio'],
		requiresStructuredOutput: false,
		preferredPools: ['speech'],
		defaultTimeoutMs: 15000,
		defaultMaxTokens: 1200,
	},
	'speech.transcribe': {
		task: 'speech.transcribe',
		category: 'speech',
		requiredCapabilities: ['speech_transcription'],
		preferredCapabilities: ['stt'],
		requiredInputTypes: ['audio'],
		requiredOutputTypes: ['text', 'json'],
		requiresStructuredOutput: false,
		preferredPools: ['transcription'],
		defaultTimeoutMs: 15000,
		defaultMaxTokens: 1000,
	},
	'combat.tactics': {
		task: 'combat.tactics',
		category: 'tactical_reasoning',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['reasoning', 'extended_thinking', 'structured_output'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['json'],
		requiresStructuredOutput: true,
		preferredPools: ['reasoning'],
		defaultTimeoutMs: 7000,
		defaultMaxTokens: 1800,
	},
	'tactical.reason': {
		task: 'tactical.reason',
		category: 'tactical_reasoning',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['reasoning', 'extended_thinking', 'structured_output'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['reasoning'],
		defaultTimeoutMs: 7500,
		defaultMaxTokens: 1500,
	},
	'combat.animation.plan': {
		task: 'combat.animation.plan',
		category: 'tactical_reasoning',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['fast'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['fast'],
		defaultTimeoutMs: 7000,
		defaultMaxTokens: 900,
	},
	'capability.explain': {
		task: 'capability.explain',
		category: 'capability_explanation',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['fast', 'creative_writing'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text', 'json'],
		requiresStructuredOutput: false,
		preferredPools: ['fast', 'creative'],
		defaultTimeoutMs: 5000,
		defaultMaxTokens: 800,
	},
	'intent.interpret': {
		task: 'intent.interpret',
		category: 'intent_interpretation',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['fast', 'structured_extraction', 'structured_output'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['fast'],
		defaultTimeoutMs: 5000,
		defaultMaxTokens: 800,
	},
	'capability.synthesize': {
		task: 'capability.synthesize',
		category: 'capability_synthesis',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['reasoning', 'extended_thinking', 'structured_output'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['reasoning', 'creative'],
		defaultTimeoutMs: 16000,
		defaultMaxTokens: 2200,
	},
	'research.query': {
		task: 'research.query',
		category: 'research',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['reasoning', 'long_context', 'tools'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['long_context', 'reasoning', 'creative'],
		defaultTimeoutMs: 15000,
		defaultMaxTokens: 1800,
	},
	'research.world-brief': {
		task: 'research.world-brief',
		category: 'research_world_brief',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['reasoning', 'long_context'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text'],
		requiresStructuredOutput: false,
		preferredPools: ['long_context', 'reasoning'],
		defaultTimeoutMs: 15000,
		defaultMaxTokens: 2000,
	},
	'narrative.review': {
		task: 'narrative.review',
		category: 'narration',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['reasoning', 'creative_writing'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text', 'json'],
		requiresStructuredOutput: false,
		preferredPools: ['review', 'reasoning'],
		defaultTimeoutMs: 8000,
		defaultMaxTokens: 1200,
	},
	'utility.inspect': {
		task: 'utility.inspect',
		category: 'utility',
		requiredCapabilities: ['text_generation'],
		preferredCapabilities: ['fast'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['text', 'json'],
		requiresStructuredOutput: false,
		preferredPools: ['fast', 'utility'],
		defaultTimeoutMs: 6000,
		defaultMaxTokens: 800,
	},
	'image.generate': {
		task: 'image.generate',
		category: 'image',
		requiredCapabilities: ['image_generation'],
		preferredCapabilities: ['image_generation'],
		requiredInputTypes: ['text'],
		requiredOutputTypes: ['image'],
		requiresStructuredOutput: false,
		preferredPools: ['creative'],
		defaultTimeoutMs: 30000,
		defaultMaxTokens: 1200,
	},
};

function contextContractsFor(task: TaskId, category: AiTaskCategory): AiTaskContextContract[] {
	const byTask: Partial<Record<TaskId, AiTaskContextContract[]>> = {
		'narrative.generate': ['CANONICAL_STATE', 'NARRATIVE', 'CHARACTER', 'WORLD', 'RULES', 'MEMORY', 'EPISTEMIC'],
		'character.dialogue': ['CANONICAL_STATE', 'CHARACTER', 'WORLD', 'MEMORY', 'EPISTEMIC', 'NARRATIVE'],
		'ooc.respond': ['CANONICAL_STATE', 'CHARACTER', 'WORLD', 'RULES', 'MEMORY', 'EPISTEMIC', 'OOC'],
		'character.extract': ['GENERATION', 'CHARACTER', 'WORLD'],
		'memory.extract': ['CANONICAL_STATE', 'NARRATIVE', 'MEMORY', 'EPISTEMIC'],
		'character.capability.propose': ['CHARACTER', 'WORLD', 'RULES', 'RESEARCH'],
		'story.advice': ['CANONICAL_STATE', 'CHARACTER', 'WORLD', 'RULES', 'EPISTEMIC'],
		'rules.adjudicate': ['CANONICAL_STATE', 'CHARACTER', 'RULES', 'EPISTEMIC'],
		'rules.analyze': ['CANONICAL_STATE', 'CHARACTER', 'WORLD', 'RULES', 'EPISTEMIC'],
		'summary.scene': ['CANONICAL_STATE', 'NARRATIVE', 'CHARACTER', 'WORLD', 'MEMORY'],
		'world.generate': ['GENERATION', 'WORLD', 'RULES'],
		'speech.generate': ['CANONICAL_STATE', 'CHARACTER', 'NARRATIVE'],
		'speech.transcribe': ['CANONICAL_STATE'],
		'combat.tactics': ['CANONICAL_STATE', 'CHARACTER', 'COMBAT', 'TACTICAL', 'EPISTEMIC', 'RULES'],
		'tactical.reason': ['CANONICAL_STATE', 'CHARACTER', 'COMBAT', 'TACTICAL', 'EPISTEMIC', 'RULES'],
		'combat.animation.plan': ['COMBAT', 'TACTICAL', 'NARRATIVE'],
		'capability.explain': ['CANONICAL_STATE', 'CHARACTER', 'RULES', 'EPISTEMIC'],
		'intent.interpret': ['CHARACTER', 'WORLD', 'NARRATIVE'],
		'capability.synthesize': ['CHARACTER', 'WORLD', 'RULES', 'RESEARCH'],
		'research.query': ['WORLD', 'RESEARCH', 'MEMORY', 'EPISTEMIC'],
		'research.world-brief': ['WORLD', 'RESEARCH', 'MEMORY', 'EPISTEMIC'],
		'narrative.review': ['CANONICAL_STATE', 'NARRATIVE', 'WORLD', 'RULES', 'EPISTEMIC'],
		'utility.inspect': ['CANONICAL_STATE'],
		'image.generate': ['GENERATION', 'MEDIA'],
	};
	return [...(byTask[task] || []), ...(category === 'tactical_reasoning' ? ['TACTICAL' as AiTaskContextContract] : [])];
}

function toolModesFor(task: TaskId): AiTaskToolMode[] {
	return task === 'ooc.respond' ? ['READ', 'MUTATE'] : [];
}

function fallbackPolicyFor(task: TaskId, category: AiTaskCategory): AiTaskFallbackPolicy {
	const fastTask = task === 'intent.interpret' || task === 'story.advice' || task === 'capability.explain' || task === 'utility.inspect';
	return {
		maxPrimaryAttempts: fastTask ? 2 : category === 'speech' || category === 'image' ? 2 : 3,
		maxTotalAttempts: fastTask ? 4 : category === 'speech' || category === 'image' ? 4 : 5,
		allowEmergencyFloor: true,
		retryableFailures: ['TIMEOUT', '429', '5XX', 'AUTH', 'UNAVAILABLE', 'MALFORMED', 'OTHER'],
	};
}

function validatorKindFor(task: TaskId): AiTaskValidatorKind {
	if (task === 'combat.tactics') return 'JSON_OBJECT';
	return 'NONE';
}

function downstreamConsumerFor(category: AiTaskCategory): string {
	if (category === 'narration') return 'Narration presentation pipeline';
	if (category === 'tactical_reasoning') return 'Deterministic tactical adjudication';
	if (category === 'rules' || category === 'rule_analysis') return 'Canonical rules authority';
	if (category === 'memory') return 'MemoryOpportunityEngine / NarrativeContinuityEngine';
	if (category === 'gameplay_advice') return 'Player-facing advice/OOC presentation';
	if (category === 'world_generation') return 'World synthesis / WorldRepository';
	return 'Task-specific authoritative consumer';
}

export function getAiTaskContract(task: TaskId): AiTaskContract {
	const base = CONTRACTS[task];
	if (!base) throw new Error('Unknown AI task contract: ' + task);
	return {
		...base,
		contextContracts: base.contextContracts || contextContractsFor(task, base.category),
		requiredToolModes: base.requiredToolModes || toolModesFor(task),
		validatorKind: base.validatorKind || validatorKindFor(task),
		fallbackPolicy: base.fallbackPolicy || fallbackPolicyFor(task, base.category),
		downstreamConsumer: base.downstreamConsumer || downstreamConsumerFor(base.category),
	};
}

export function getAllAiTaskContracts(): AiTaskContract[] {
	return Object.keys(CONTRACTS).map((task) => getAiTaskContract(task as TaskId));
}

export function getAiTasksByCategory(category: AiTaskCategory): TaskId[] {
	return Object.values(CONTRACTS)
		.filter((contract) => contract.category === category)
		.map((contract) => contract.task);
}

export function validateAiTaskResponse(task: TaskId, text: string): { valid: boolean; errorReason?: string } {
	const contract = getAiTaskContract(task);
	const kind = contract.validatorKind || 'NONE';
	if (kind === 'NONE') return { valid: Boolean(String(text || '').trim()) };

	let parsed: unknown;
	try {
		parsed = JSON.parse(String(text || '').trim());
	} catch {
		return { valid: false, errorReason: 'Task contract requires valid JSON output.' };
	}

	if (kind === 'JSON_OBJECT' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
		return { valid: false, errorReason: 'Task contract requires a JSON object.' };
	}
	if (kind === 'JSON_ARRAY' && !Array.isArray(parsed)) {
		return { valid: false, errorReason: 'Task contract requires a JSON array.' };
	}
	if (kind === 'TEXT_OR_JSON_OBJECT' && parsed !== undefined && parsed !== null && typeof parsed !== 'object' && typeof parsed !== 'string') {
		return { valid: false, errorReason: 'Task contract requires text or a JSON object.' };
	}
	return { valid: true };
}

export function evaluateAiTaskReadiness(
	task: TaskId,
	model: ModelRegistryRecord,
	contextTokens = 0,
): AiTaskReadiness {
	const contract = getAiTaskContract(task);
	if (!model.roleEligibility.includes(task)) {
		return { task, modelId: model.modelId, providerId: model.providerId, state: 'REJECTED', reason: 'Model is not eligible for the requested task.', capabilityCompatible: false, contextCompatible: true, quotaAvailable: true };
	}
	if (model.isEmergencyFloor) {
		return { task, modelId: model.modelId, providerId: model.providerId, state: 'READY', reason: 'Deterministic emergency floor is available as the final safety path.', capabilityCompatible: true, contextCompatible: true, quotaAvailable: true };
	}
	if (model.health === 'DisabledByUser' || model.health === 'Unavailable' || model.health === 'InvalidAuth') {
		return { task, modelId: model.modelId, providerId: model.providerId, state: 'UNAVAILABLE', reason: 'Model health state does not permit execution.', capabilityCompatible: false, contextCompatible: true, quotaAvailable: false };
	}
	if (model.health === 'Throttled') {
		return { task, modelId: model.modelId, providerId: model.providerId, state: 'THROTTLED', reason: 'Provider health is throttled.', capabilityCompatible: true, contextCompatible: true, quotaAvailable: false };
	}
	if (model.accessStatus === 'not_configured') {
		return { task, modelId: model.modelId, providerId: model.providerId, state: 'UNAVAILABLE', reason: 'Provider/model is not configured.', capabilityCompatible: false, contextCompatible: true, quotaAvailable: false };
	}
	if (model.quota === 'Exhausted' || model.accessStatus === 'quota_limited' || model.accessStatus === 'rate_limited') {
		return { task, modelId: model.modelId, providerId: model.providerId, state: 'UNAVAILABLE', reason: 'Model quota or access is exhausted/limited.', capabilityCompatible: true, contextCompatible: true, quotaAvailable: false };
	}
	if (model.contextWindow > 0 && contextTokens > model.contextWindow) {
		return { task, modelId: model.modelId, providerId: model.providerId, state: 'REJECTED', reason: 'Requested context exceeds the model context window.', capabilityCompatible: true, contextCompatible: false, quotaAvailable: true };
	}
	const capabilities = new Set(model.capabilities || []);
	if (capabilities.size > 0) {
		for (const required of contract.requiredCapabilities) {
			const satisfied = capabilities.has(required)
				|| (required === 'text_generation' && ['creative_writing', 'fast', 'reasoning', 'structured_output', 'deep_reasoning', 'text'].some((value) => capabilities.has(value)))
			|| (required === 'structured_output' && model.hasStructuredOutput === true);
			if (!satisfied) {
				return { task, modelId: model.modelId, providerId: model.providerId, state: 'REJECTED', reason: 'Model lacks a required task capability: ' + required, capabilityCompatible: false, contextCompatible: true, quotaAvailable: true };
			}
		}
	}
	if (Array.isArray(model.supportedInputTypes) && model.supportedInputTypes.length > 0 && contract.requiredInputTypes.some((type) => !model.supportedInputTypes!.includes(type))) {
		return { task, modelId: model.modelId, providerId: model.providerId, state: 'REJECTED', reason: 'Model input modality is incompatible with the task contract.', capabilityCompatible: false, contextCompatible: true, quotaAvailable: true };
	}
	if (Array.isArray(model.supportedOutputTypes) && model.supportedOutputTypes.length > 0 && contract.requiredOutputTypes.some((type) => !model.supportedOutputTypes!.includes(type))) {
		return { task, modelId: model.modelId, providerId: model.providerId, state: 'REJECTED', reason: 'Model output modality is incompatible with the task contract.', capabilityCompatible: false, contextCompatible: true, quotaAvailable: true };
	}
	if (contract.requiresStructuredOutput && capabilities.size > 0 && !model.hasStructuredOutput && !capabilities.has('structured_output')) {
		return { task, modelId: model.modelId, providerId: model.providerId, state: 'REJECTED', reason: 'Structured output is required by the task contract.', capabilityCompatible: false, contextCompatible: true, quotaAvailable: true };
	}
	if (model.quota === 'Low' || model.quota === 'NearExhaustion') {
		return { task, modelId: model.modelId, providerId: model.providerId, state: 'QUOTA_AVAILABLE', reason: 'Model remains runnable but quota headroom is limited.', capabilityCompatible: true, contextCompatible: true, quotaAvailable: true };
	}
	return { task, modelId: model.modelId, providerId: model.providerId, state: 'READY', reason: 'Model satisfies task capability, modality, health, quota and context requirements.', capabilityCompatible: true, contextCompatible: true, quotaAvailable: true };
}


export type AiTaskCandidatePreflightState =
	| 'READY'
	| 'REJECTED'
	| 'COOLDOWN'
	| 'THROTTLED'
	| 'UNAVAILABLE'
	| 'UNKNOWN';

export interface AiTaskCandidatePreflight {
	task: TaskId;
	providerId: string;
	modelId: string;
	state: AiTaskCandidatePreflightState;
	eligible: boolean;
	reason: string;
	readiness: AiTaskReadiness;
	contextTokens: number;
	reservedOutputTokens: number;
	contextCapacityKnown: boolean;
	outputCapacityKnown: boolean;
	taskContractCompatible: boolean;
}

/**
 * Side-effect-free task candidate preflight.
 *
 * This is intentionally additive to the existing routing logic. It does not
 * mutate model health, quota, pins, fallback chains, or provider state.
 *
 * Known metadata is treated as a hard constraint only when the registry
 * explicitly provides it. Missing metadata remains UNKNOWN rather than being
 * guessed. This lets later Auto Arrange work build on a truthful preflight
 * result without changing current production routing behavior.
 */
export function evaluateAiTaskCandidatePreflight(
	task: TaskId,
	model: ModelRegistryRecord,
	contextTokens = 0,
	reservedOutputTokens?: number,
): AiTaskCandidatePreflight {
	const contract = getAiTaskContract(task);
	const safeContextTokens = Math.max(0, Math.trunc(contextTokens));
	const safeReservedOutputTokens = Math.max(
		0,
		Math.trunc(reservedOutputTokens ?? contract.defaultMaxTokens),
	);
	const readiness = evaluateAiTaskReadiness(task, model, safeContextTokens);

	if (readiness.state === 'COOLDOWN') {
		return {
			task,
			providerId: model.providerId,
			modelId: model.modelId,
			state: 'COOLDOWN',
			eligible: false,
			reason: readiness.reason,
			readiness,
			contextTokens: safeContextTokens,
			reservedOutputTokens: safeReservedOutputTokens,
			contextCapacityKnown: model.contextWindow > 0,
			outputCapacityKnown: Number.isFinite(model.outputTokenLimit) && (model.outputTokenLimit || 0) > 0,
			taskContractCompatible: false,
		};
	}

	if (readiness.state === 'THROTTLED') {
		return {
			task,
			providerId: model.providerId,
			modelId: model.modelId,
			state: 'THROTTLED',
			eligible: false,
			reason: readiness.reason,
			readiness,
			contextTokens: safeContextTokens,
			reservedOutputTokens: safeReservedOutputTokens,
			contextCapacityKnown: model.contextWindow > 0,
			outputCapacityKnown: Number.isFinite(model.outputTokenLimit) && (model.outputTokenLimit || 0) > 0,
			taskContractCompatible: false,
		};
	}

	if (
		readiness.state === 'UNAVAILABLE' ||
		readiness.state === 'REJECTED'
	) {
		return {
			task,
			providerId: model.providerId,
			modelId: model.modelId,
			state: readiness.state,
			eligible: false,
			reason: readiness.reason,
			readiness,
			contextTokens: safeContextTokens,
			reservedOutputTokens: safeReservedOutputTokens,
			contextCapacityKnown: model.contextWindow > 0,
			outputCapacityKnown: Number.isFinite(model.outputTokenLimit) && (model.outputTokenLimit || 0) > 0,
			taskContractCompatible: false,
		};
	}

	const contextCapacityKnown = model.contextWindow > 0;
	if (
		contextCapacityKnown &&
		safeContextTokens + safeReservedOutputTokens > model.contextWindow
	) {
		return {
			task,
			providerId: model.providerId,
			modelId: model.modelId,
			state: 'REJECTED',
			eligible: false,
			reason: 'Requested context plus reserved output exceeds the model context window.',
			readiness,
			contextTokens: safeContextTokens,
			reservedOutputTokens: safeReservedOutputTokens,
			contextCapacityKnown: true,
			outputCapacityKnown: Number.isFinite(model.outputTokenLimit) && (model.outputTokenLimit || 0) > 0,
			taskContractCompatible: false,
		};
	}

	const outputCapacityKnown =
		Number.isFinite(model.outputTokenLimit) &&
		(model.outputTokenLimit || 0) > 0;

	if (
		outputCapacityKnown &&
		safeReservedOutputTokens > (model.outputTokenLimit || 0)
	) {
		return {
			task,
			providerId: model.providerId,
			modelId: model.modelId,
			state: 'REJECTED',
			eligible: false,
			reason: 'Reserved output exceeds the model output token limit.',
			readiness,
			contextTokens: safeContextTokens,
			reservedOutputTokens: safeReservedOutputTokens,
			contextCapacityKnown,
			outputCapacityKnown: true,
			taskContractCompatible: false,
		};
	}

	return {
		task,
		providerId: model.providerId,
		modelId: model.modelId,
		state: readiness.state === 'QUOTA_AVAILABLE' ? 'READY' : 'READY',
		eligible: true,
		reason: readiness.state === 'QUOTA_AVAILABLE'
			? 'Model is task-compatible and within known capacity limits; quota headroom is limited.'
			: 'Model is task-compatible and within known capacity limits.',
		readiness,
		contextTokens: safeContextTokens,
		reservedOutputTokens: safeReservedOutputTokens,
		contextCapacityKnown,
		outputCapacityKnown,
		taskContractCompatible: true,
	};
}
