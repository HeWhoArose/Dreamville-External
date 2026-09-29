import type { TaskId } from './aiOrchestrator';

export type AiCallPolicyMode =
	| 'NARRATION_ONLY'
	| 'DETERMINISTIC_MECHANICS'
	| 'INTERPRETATION'
	| 'NOVEL_CAPABILITY';

export type AiHelperStrategy =
	| 'NONE'
	| 'INTERPRET_ONCE'
	| 'INTERPRET_THEN_SYNTHESIZE'
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
}> = {
	NARRATION_ONLY: {
		maxHelperCalls: 0,
		maxHelperOutputTokens: 0,
		allowedTasks: [],
		allowedRoles: [],
	},
	DETERMINISTIC_MECHANICS: {
		maxHelperCalls: 0,
		maxHelperOutputTokens: 0,
		allowedTasks: [],
		allowedRoles: [],
	},
	INTERPRETATION: {
		maxHelperCalls: 1,
		maxHelperOutputTokens: 400,
		allowedTasks: ['intent.interpret'],
		allowedRoles: ['INTENT_INTERPRET'],
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
	},
};

function blocked(reason: string, task: TaskId | string, role: AiHelperRole | undefined, blockedTasks: Array<{ task: TaskId | string; role?: AiHelperRole; reason: string }>): AiCallPolicyDecision {
	blockedTasks.push({ task, role, reason });
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
}): AiHelperNeedDecision {
	if (params.hasCanonicalCapability) {
		return {
			strategy: 'NONE',
			mode: 'DETERMINISTIC_MECHANICS',
			reason: 'A canonical capability is already known; deterministic capability execution is authoritative.',
			maxHelperCalls: 0,
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

	if (params.explicitCapabilitySyntax || params.unknownUseTarget) {
		return {
			strategy: 'INTERPRET_SYNTHESIZE_AND_REPAIR',
			mode: 'NOVEL_CAPABILITY',
			reason: 'The player expressed a capability-like or unresolved use request without a canonical match; helper roles may expand only when canonical validation requires repair or an alternative route.',
			maxHelperCalls: MAX_ADAPTIVE_HELPER_CALLS,
		};
	}

	if (params.requiresCheckOrHazardInterpretation || params.ambiguousLanguage) {
		return {
			strategy: params.compoundAction ? 'INTERPRET_SYNTHESIZE_AND_REPAIR' : 'INTERPRET_ONCE',
			mode: params.compoundAction ? 'NOVEL_CAPABILITY' : 'INTERPRETATION',
			reason: params.compoundAction
				? 'The action contains ambiguity plus multiple semantic stages; interpretation is required and additional helper roles are available only after deterministic validation identifies a real gap.'
				: 'The action may require a semantic check/hazard interpretation before canonical resolution.',
			maxHelperCalls: params.compoundAction ? MAX_ADAPTIVE_HELPER_CALLS : 1,
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
	compoundAction?: boolean;
}): AiCallPolicyMode {
	if (params.hasCanonicalCapability || (params.itemKnown && !params.compoundAction)) {
		return 'DETERMINISTIC_MECHANICS';
	}

	if ((params.explicitCapabilitySyntax || params.compoundAction) && !params.hasCanonicalCapability) {
		return 'NOVEL_CAPABILITY';
	}

	if (params.requiresCheckOrHazardInterpretation) {
		return 'INTERPRETATION';
	}

	return 'NARRATION_ONLY';
}

export class AiCallBudget {
	private readonly mode: AiCallPolicyMode;
	private readonly maxHelperCalls: number;
	private readonly maxHelperOutputTokens: number;
	private readonly allowedTasks: Set<string>;
	private readonly allowedRoles: Set<AiHelperRole>;
	private helperCallsUsed = 0;
	private helperOutputTokensUsed = 0;
	private readonly blockedTasks: Array<{ task: TaskId | string; role?: AiHelperRole; reason: string }> = [];
	private readonly usedRoles: AiHelperRole[] = [];

	public constructor(mode: AiCallPolicyMode) {
		const policy = MODE_POLICIES[mode];
		this.mode = mode;
		this.maxHelperCalls = policy.maxHelperCalls;
		this.maxHelperOutputTokens = policy.maxHelperOutputTokens;
		this.allowedTasks = new Set(policy.allowedTasks);
		this.allowedRoles = new Set(policy.allowedRoles);
	}

	public authorize(task: TaskId | string, requestedMaxTokens: number, role?: AiHelperRole): AiCallPolicyDecision {
		const normalizedTask = String(task);

		if (this.maxHelperCalls === 0) {
			return blocked(
				`Task "${normalizedTask}" is not permitted in ${this.mode} mode. Canonical mechanics and F&F-style context retrieval must handle this path without another LLM call.`,
				task,
				role,
				this.blockedTasks,
			);
		}

		if (!this.allowedTasks.has(normalizedTask)) {
			return blocked(
				`Task "${normalizedTask}" is not permitted in ${this.mode} mode.`,
				task,
				role,
				this.blockedTasks,
			);
		}

		if (!role || !this.allowedRoles.has(role)) {
			return blocked(
				`Helper role "${role || 'UNSPECIFIED'}" is not permitted in ${this.mode} mode.`,
				task,
				role,
				this.blockedTasks,
			);
		}

		if (this.helperCallsUsed >= this.maxHelperCalls) {
			return blocked(
				`Strict AI call budget exhausted: ${this.helperCallsUsed}/${this.maxHelperCalls} helper calls used.`,
				task,
				role,
				this.blockedTasks,
			);
		}

		if (this.usedRoles.includes(role) && role !== 'CAPABILITY_SYNTHESIZE') {
			return blocked(
				`Helper role "${role}" may only execute once per action.`,
				task,
				role,
				this.blockedTasks,
			);
		}

		if (role === 'CAPABILITY_SYNTHESIZE') {
			const hasIntent = this.usedRoles.includes('INTENT_INTERPRET');
			if (!hasIntent) {
				return blocked(
					'Capability synthesis requires a completed intent interpretation first.',
					task,
					role,
					this.blockedTasks,
				);
			}
			if (this.usedRoles.filter((value) => value === 'CAPABILITY_SYNTHESIZE').length >= 1) {
				return blocked(
					'Initial capability synthesis is already complete; a second synthesis must be explicitly routed as repair or alternative synthesis.',
					task,
					role,
					this.blockedTasks,
				);
			}
		}

		if (role === 'SEMANTIC_REPAIR' || role === 'ALTERNATIVE_SYNTHESIZE') {
			const hasSynthesis = this.usedRoles.includes('CAPABILITY_SYNTHESIZE');
			if (!hasSynthesis) {
				return blocked(
					`Helper role "${role}" requires a completed initial capability synthesis first.`,
					task,
					role,
					this.blockedTasks,
				);
			}
		}

		const remainingOutputBudget = this.maxHelperOutputTokens - this.helperOutputTokensUsed;
		if (remainingOutputBudget <= 0) {
			return blocked(
				'Strict AI output-token budget exhausted for this action.',
				task,
				role,
				this.blockedTasks,
			);
		}

		const taskCap = TASK_OUTPUT_CAPS[normalizedTask] ?? remainingOutputBudget;
		const maxTokens = Math.max(1, Math.min(requestedMaxTokens || taskCap, taskCap, remainingOutputBudget));
		this.helperCallsUsed += 1;
		this.helperOutputTokensUsed += maxTokens;
		this.usedRoles.push(role);
		return {
			allowed: true,
			reason: `Authorized ${normalizedTask} as ${role} under ${this.mode} policy.`,
			maxTokens,
		};
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
		};
	}
}
