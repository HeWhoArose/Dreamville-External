import type { TaskId } from './aiOrchestrator';

export type AiCallPolicyMode =
	| 'NARRATION_ONLY'
	| 'DETERMINISTIC_MECHANICS'
	| 'INTERPRETATION'
	| 'NOVEL_CAPABILITY';

export type AiHelperStrategy =
	| 'NONE'
	| 'INTERPRET_ONCE'
	| 'INTERPRET_SYNTHESIZE_AND_REPAIR';

export type AiHelperRole =
	| 'INTENT_INTERPRET'
	| 'CAPABILITY_SYNTHESIZE'
	| 'SEMANTIC_REPAIR'
	| 'ALTERNATIVE_SYNTHESIZE';

export interface AiCallPolicyDecision {
	allowed: boolean;
	reason: string;
	maxTokens: number;
}

export interface AiHelperNeedDecision {
	strategy: AiHelperStrategy;
	mode: AiCallPolicyMode;
	reason: string;
	maxHelperCalls: number;
}

export interface AiCallPolicyCallRecord {
	task: TaskId | string;
	role?: AiHelperRole;
	allowed: boolean;
	reason: string;
	maxTokens: number;
}

export interface AiCallPolicySnapshot {
	mode: AiCallPolicyMode;
	maxHelperCalls: number;
	helperCallsUsed: number;
	helperOutputTokensUsed: number;
	maxHelperOutputTokens: number;
	blockedTasks: Array<{ task: TaskId | string; role?: AiHelperRole; reason: string }>;
	allowedTasks: string[];
	allowedRoles: AiHelperRole[];
	usedRoles: AiHelperRole[];
	callHistory: AiCallPolicyCallRecord[];
}

const MAX_ADAPTIVE_HELPER_CALLS = 4;

const TASK_OUTPUT_CAPS: Record<string, number> = {
	'intent.interpret': 400,
	'capability.synthesize': 900,
};

const MODE_POLICIES: Record<AiCallPolicyMode, {
	maxHelperCalls: number;
	maxHelperOutputTokens: number;
	allowedTasks: string[];
	allowedRoles: AiHelperRole[];
	expectedRoles: AiHelperRole[];
}> = {
	NARRATION_ONLY: {
		maxHelperCalls: 0,
		maxHelperOutputTokens: 0,
		allowedTasks: [],
		allowedRoles: [],
		expectedRoles: [],
	},
	DETERMINISTIC_MECHANICS: {
		maxHelperCalls: 0,
		maxHelperOutputTokens: 0,
		allowedTasks: [],
		allowedRoles: [],
		expectedRoles: [],
	},
	INTERPRETATION: {
		maxHelperCalls: 2,
		maxHelperOutputTokens: 800,
		allowedTasks: ['intent.interpret'],
		allowedRoles: ['INTENT_INTERPRET', 'SEMANTIC_REPAIR'],
		expectedRoles: ['INTENT_INTERPRET', 'SEMANTIC_REPAIR'],
	},
	NOVEL_CAPABILITY: {
		maxHelperCalls: MAX_ADAPTIVE_HELPER_CALLS,
		maxHelperOutputTokens: 3000,
		allowedTasks: ['intent.interpret', 'capability.synthesize'],
		allowedRoles: [
			'INTENT_INTERPRET',
			'CAPABILITY_SYNTHESIZE',
			'SEMANTIC_REPAIR',
			'ALTERNATIVE_SYNTHESIZE',
		],
		expectedRoles: [
			'INTENT_INTERPRET',
			'CAPABILITY_SYNTHESIZE',
			'SEMANTIC_REPAIR',
			'ALTERNATIVE_SYNTHESIZE',
		],
	},
};

function blocked(
	reason: string,
	task: TaskId | string,
	role: AiHelperRole | undefined,
	blockedTasks: Array<{ task: TaskId | string; role?: AiHelperRole; reason: string }>,
	callHistory: AiCallPolicyCallRecord[],
): AiCallPolicyDecision {
	blockedTasks.push({ task, role, reason });
	callHistory.push({ task, role, allowed: false, reason, maxTokens: 0 });
	return { allowed: false, reason, maxTokens: 0 };
}

export function decideAiHelperNeed(params: {
	hasCanonicalCapability?: boolean;
	itemKnown?: boolean;
	requiresCheckOrHazardInterpretation?: boolean;
	explicitCapabilitySyntax?: boolean;
	unknownUseTarget?: boolean;
	ambiguousLanguage?: boolean;
	compoundAction?: boolean;
	semanticNoveltyRequested?: boolean;
}): AiHelperNeedDecision {
	if (params.hasCanonicalCapability) {
		return {
			strategy: 'NONE',
			mode: 'DETERMINISTIC_MECHANICS',
			reason: 'A canonical capability is already known; deterministic capability execution is authoritative.',
			maxHelperCalls: 0,
		};
	}

	if (params.explicitCapabilitySyntax || params.unknownUseTarget || params.semanticNoveltyRequested) {
		return {
			strategy: 'INTERPRET_SYNTHESIZE_AND_REPAIR',
			mode: 'NOVEL_CAPABILITY',
			reason: params.compoundAction
				? 'The action is compound and semantically novel; use the minimum helper stages required and reserve repair/alternative stages only after canonical validation requires them.'
				: 'The player expressed a capability-like or unresolved use request without a canonical match.',
			maxHelperCalls: MAX_ADAPTIVE_HELPER_CALLS,
		};
	}

	if (params.itemKnown && !params.ambiguousLanguage && !params.compoundAction) {
		return {
			strategy: 'NONE',
			mode: 'DETERMINISTIC_MECHANICS',
			reason: 'The requested item is canonically identified; inventory resolution does not need an LLM.',
			maxHelperCalls: 0,
		};
	}

	if (params.requiresCheckOrHazardInterpretation || params.ambiguousLanguage || params.compoundAction) {
		return {
			strategy: 'INTERPRET_ONCE',
			mode: 'INTERPRETATION',
			reason: params.compoundAction
				? 'The action has multiple semantic stages; interpretation is available, with one repair pass only if the first interpretation remains insufficient.'
				: 'The action may require a semantic check/hazard interpretation before canonical resolution; one repair pass is available only if required.',
			maxHelperCalls: 2,
		};
	}

	return {
		strategy: 'NONE',
		mode: 'NARRATION_ONLY',
		reason: 'The action is sufficiently clear for deterministic resolution plus narration.',
		maxHelperCalls: 0,
	};
}

export function inferAiCallPolicyMode(params: {
	hasCanonicalCapability?: boolean;
	itemKnown?: boolean;
	requiresCheckOrHazardInterpretation?: boolean;
	explicitCapabilitySyntax?: boolean;
	unknownUseTarget?: boolean;
	ambiguousLanguage?: boolean;
	compoundAction?: boolean;
	semanticNoveltyRequested?: boolean;
}): AiCallPolicyMode {
	return decideAiHelperNeed(params).mode;
}

export class AiCallBudget {
	private readonly mode: AiCallPolicyMode;
	private readonly maxHelperCalls: number;
	private readonly maxHelperOutputTokens: number;
	private readonly allowedTasks: Set<string>;
	private readonly allowedRoles: Set<AiHelperRole>;
	private readonly expectedRoles: AiHelperRole[];
	private helperCallsUsed = 0;
	private helperOutputTokensUsed = 0;
	private readonly blockedTasks: Array<{ task: TaskId | string; role?: AiHelperRole; reason: string }> = [];
	private readonly usedRoles: AiHelperRole[] = [];
	private readonly callHistory: AiCallPolicyCallRecord[] = [];

	public constructor(mode: AiCallPolicyMode) {
		const policy = MODE_POLICIES[mode];
		this.mode = mode;
		this.maxHelperCalls = policy.maxHelperCalls;
		this.maxHelperOutputTokens = policy.maxHelperOutputTokens;
		this.allowedTasks = new Set(policy.allowedTasks);
		this.allowedRoles = new Set(policy.allowedRoles);
		this.expectedRoles = [...policy.expectedRoles];
	}

	private isRoleCompatibleWithTask(task: string, role: AiHelperRole): boolean {
		if (role === 'INTENT_INTERPRET') return task === 'intent.interpret';
		return task === 'capability.synthesize';
	}

	public authorize(task: TaskId | string, requestedMaxTokens: number, role?: AiHelperRole): AiCallPolicyDecision {
		const normalizedTask = String(task);
		const expectedRole = this.expectedRoles[this.helperCallsUsed];

		if (this.maxHelperCalls === 0) {
			return blocked(
				`Task "${normalizedTask}" is not permitted in ${this.mode} mode. Canonical mechanics and F&F-style context retrieval must handle this path without another LLM call.`,
				task,
				role,
				this.blockedTasks,
				this.callHistory,
			);
		}

		if (!this.allowedTasks.has(normalizedTask)) {
			return blocked(
				`Task "${normalizedTask}" is not permitted in ${this.mode} mode.`,
				task,
				role,
				this.blockedTasks,
				this.callHistory,
			);
		}

		if (!role || !this.allowedRoles.has(role)) {
			return blocked(
				`Helper role "${role || 'UNSPECIFIED'}" is not permitted in ${this.mode} mode.`,
				task,
				role,
				this.blockedTasks,
				this.callHistory,
			);
		}

		if (!this.isRoleCompatibleWithTask(normalizedTask, role)) {
			return blocked(
				`Task "${normalizedTask}" cannot execute helper role "${role}".`,
				task,
				role,
				this.blockedTasks,
				this.callHistory,
			);
		}

		if (this.helperCallsUsed >= this.maxHelperCalls) {
			return blocked(
				`Strict AI call budget exhausted: ${this.helperCallsUsed}/${this.maxHelperCalls} helper calls used.`,
				task,
				role,
				this.blockedTasks,
				this.callHistory,
			);
		}

		if (role !== expectedRole) {
			return blocked(
				`Helper stage "${role}" is not permitted yet; the next authorized stage is "${expectedRole || 'NONE'}".`,
				task,
				role,
				this.blockedTasks,
				this.callHistory,
			);
		}

		const remainingOutputBudget = this.maxHelperOutputTokens - this.helperOutputTokensUsed;
		if (remainingOutputBudget <= 0) {
			return blocked(
				'Strict AI output-token budget exhausted for this action.',
				task,
				role,
				this.blockedTasks,
				this.callHistory,
			);
		}

		const taskCap = TASK_OUTPUT_CAPS[normalizedTask] ?? remainingOutputBudget;
		const maxTokens = Math.max(1, Math.min(requestedMaxTokens || taskCap, taskCap, remainingOutputBudget));
		const reason = `Authorized ${normalizedTask} as ${role} under ${this.mode} policy.`;
		this.helperCallsUsed += 1;
		this.helperOutputTokensUsed += maxTokens;
		this.usedRoles.push(role);
		this.callHistory.push({ task, role, allowed: true, reason, maxTokens });
		return { allowed: true, reason, maxTokens };
	}

	public snapshot(): AiCallPolicySnapshot {
		const policy = MODE_POLICIES[this.mode];
		return {
			mode: this.mode,
			maxHelperCalls: this.maxHelperCalls,
			helperCallsUsed: this.helperCallsUsed,
			helperOutputTokensUsed: this.helperOutputTokensUsed,
			maxHelperOutputTokens: this.maxHelperOutputTokens,
			blockedTasks: [...this.blockedTasks],
			allowedTasks: [...policy.allowedTasks],
			allowedRoles: [...policy.allowedRoles],
			usedRoles: [...this.usedRoles],
			callHistory: [...this.callHistory],
		};
	}
}
