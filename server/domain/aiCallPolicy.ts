import type { TaskId } from './aiOrchestrator';

export type AiCallPolicyMode =
	| 'NARRATION_ONLY'
	| 'DETERMINISTIC_MECHANICS'
	| 'INTERPRETATION'
	| 'NOVEL_CAPABILITY';

export type AiHelperStrategy = 'NONE' | 'INTERPRET_ONCE' | 'INTERPRET_THEN_SYNTHESIZE';

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
	blockedTasks: Array<{ task: TaskId | string; reason: string }>;
	allowedTasks: string[];
}

const TASK_OUTPUT_CAPS: Record<string, number> = {
	'intent.interpret': 400,
	'capability.synthesize': 900,
};

const MODE_POLICIES: Record<AiCallPolicyMode, {
	maxHelperCalls: number;
	maxHelperOutputTokens: number;
	allowedTasks: string[];
}> = {
	NARRATION_ONLY: {
		maxHelperCalls: 0,
		maxHelperOutputTokens: 0,
		allowedTasks: [],
	},
	DETERMINISTIC_MECHANICS: {
		maxHelperCalls: 0,
		maxHelperOutputTokens: 0,
		allowedTasks: [],
	},
	INTERPRETATION: {
		maxHelperCalls: 1,
		maxHelperOutputTokens: 400,
		allowedTasks: ['intent.interpret'],
	},
	NOVEL_CAPABILITY: {
		maxHelperCalls: 2,
		maxHelperOutputTokens: 1300,
		allowedTasks: ['intent.interpret', 'capability.synthesize'],
	},
};

export function decideAiHelperNeed(params: {
	hasCanonicalCapability?: boolean;
	itemKnown?: boolean;
	requiresCheckOrHazardInterpretation?: boolean;
	explicitCapabilitySyntax?: boolean;
	unknownUseTarget?: boolean;
	ambiguousLanguage?: boolean;
}): AiHelperNeedDecision {
	if (params.hasCanonicalCapability) {
		return {
			strategy: 'NONE',
			mode: 'DETERMINISTIC_MECHANICS',
			reason: 'A canonical capability is already known; deterministic capability execution is authoritative.',
			maxHelperCalls: 0,
		};
	}

	if (params.itemKnown && !params.ambiguousLanguage) {
		return {
			strategy: 'NONE',
			mode: 'DETERMINISTIC_MECHANICS',
			reason: 'The requested item is canonically identified; inventory resolution does not need an LLM.',
			maxHelperCalls: 0,
		};
	}

	if (params.explicitCapabilitySyntax || params.unknownUseTarget) {
		return {
			strategy: 'INTERPRET_THEN_SYNTHESIZE',
			mode: 'NOVEL_CAPABILITY',
			reason: 'The player expressed a capability-like or unresolved use request without a canonical match.',
			maxHelperCalls: 2,
		};
	}

	if (params.requiresCheckOrHazardInterpretation || params.ambiguousLanguage) {
		return {
			strategy: 'INTERPRET_ONCE',
			mode: 'INTERPRETATION',
			reason: 'The action may require a semantic check/hazard interpretation before canonical resolution.',
			maxHelperCalls: 1,
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
}): AiCallPolicyMode {
	if (params.hasCanonicalCapability || params.itemKnown) {
		return 'DETERMINISTIC_MECHANICS';
	}

	if (params.explicitCapabilitySyntax && !params.hasCanonicalCapability) {
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
	private helperCallsUsed = 0;
	private helperOutputTokensUsed = 0;
	private readonly blockedTasks: Array<{ task: TaskId | string; reason: string }> = [];

	public constructor(mode: AiCallPolicyMode) {
		const policy = MODE_POLICIES[mode];
		this.mode = mode;
		this.maxHelperCalls = policy.maxHelperCalls;
		this.maxHelperOutputTokens = policy.maxHelperOutputTokens;
		this.allowedTasks = new Set(policy.allowedTasks);
	}

	public authorize(task: TaskId | string, requestedMaxTokens: number): AiCallPolicyDecision {
		const normalizedTask = String(task);
		if (!this.allowedTasks.has(normalizedTask)) {
			const reason = `Task "${normalizedTask}" is not permitted in ${this.mode} mode. Canonical mechanics and F&F-style context retrieval must handle this path without another LLM call.`;
			this.blockedTasks.push({ task, reason });
			return { allowed: false, reason, maxTokens: 0 };
		}

		if (this.helperCallsUsed >= this.maxHelperCalls) {
			const reason = `Strict AI call budget exhausted: ${this.helperCallsUsed}/${this.maxHelperCalls} helper calls used.`;
			this.blockedTasks.push({ task, reason });
			return { allowed: false, reason, maxTokens: 0 };
		}

		const remainingOutputBudget = this.maxHelperOutputTokens - this.helperOutputTokensUsed;
		if (remainingOutputBudget <= 0) {
			const reason = 'Strict AI output-token budget exhausted for this action.';
			this.blockedTasks.push({ task, reason });
			return { allowed: false, reason, maxTokens: 0 };
		}

		const taskCap = TASK_OUTPUT_CAPS[normalizedTask] ?? remainingOutputBudget;
		const maxTokens = Math.max(1, Math.min(requestedMaxTokens || taskCap, taskCap, remainingOutputBudget));
		this.helperCallsUsed += 1;
		this.helperOutputTokensUsed += maxTokens;
		return {
			allowed: true,
			reason: `Authorized ${normalizedTask} under ${this.mode} policy.`,
			maxTokens,
		};
	}

	public snapshot(): AiCallPolicySnapshot {
		return {
			mode: this.mode,
			maxHelperCalls: this.maxHelperCalls,
			helperCallsUsed: this.helperCallsUsed,
			helperOutputTokensUsed: this.helperOutputTokensUsed,
			maxHelperOutputTokens: this.maxHelperOutputTokens,
			blockedTasks: [...this.blockedTasks],
			allowedTasks: [...this.allowedTasks],
		};
	}
}
