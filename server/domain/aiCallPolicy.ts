import type { TaskId } from './aiOrchestrator';

export type AiCallPolicyMode =
	| 'NARRATION_ONLY'
	| 'DETERMINISTIC_MECHANICS'
	| 'INTERPRETATION'
	| 'NOVEL_CAPABILITY';

export type AiHelperStrategy =
	| 'NONE'
	| 'INTERPRET_ONCE'
	| 'INTERPRET_THEN_SYNTHESIZE';

export type AiHelperCallRole =
	| 'INTENT_INTERPRET'
	| 'CAPABILITY_SYNTHESIZE'
	| 'SEMANTIC_REPAIR';

export interface AiCallPolicyDecision {
	allowed: boolean;
	reason: string;
	maxTokens: number;
	role: AiHelperCallRole | null;
}

export interface AiHelperNeedDecision {
	strategy: AiHelperStrategy;
	mode: AiCallPolicyMode;
	reason: string;
	maxHelperCalls: number;
}

export interface AiCallPolicyCallRecord {
	task: TaskId | string;
	role: AiHelperCallRole | null;
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
	blockedTasks: Array<{ task: TaskId | string; reason: string }>;
	allowedTasks: string[];
	callHistory: AiCallPolicyCallRecord[];
}

const TASK_OUTPUT_CAPS: Record<string, number> = {
	'intent.interpret': 400,
	'capability.synthesize': 850,
};

const MODE_POLICIES: Record<AiCallPolicyMode, {
	maxHelperCalls: number;
	maxHelperOutputTokens: number;
	allowedTasks: string[];
	expectedRoles: AiHelperCallRole[];
}> = {
	NARRATION_ONLY: {
		maxHelperCalls: 0,
		maxHelperOutputTokens: 0,
		allowedTasks: [],
		expectedRoles: [],
	},
	DETERMINISTIC_MECHANICS: {
		maxHelperCalls: 0,
		maxHelperOutputTokens: 0,
		allowedTasks: [],
		expectedRoles: [],
	},
	INTERPRETATION: {
		maxHelperCalls: 2,
		maxHelperOutputTokens: 800,
		allowedTasks: ['intent.interpret'],
		expectedRoles: ['INTENT_INTERPRET', 'SEMANTIC_REPAIR'],
	},
	NOVEL_CAPABILITY: {
		maxHelperCalls: 4,
		maxHelperOutputTokens: 2500,
		allowedTasks: ['intent.interpret', 'capability.synthesize'],
		expectedRoles: ['INTENT_INTERPRET', 'CAPABILITY_SYNTHESIZE', 'SEMANTIC_REPAIR', 'CAPABILITY_SYNTHESIZE'],
	},
};

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
			strategy: 'INTERPRET_THEN_SYNTHESIZE',
			mode: 'NOVEL_CAPABILITY',
			reason: params.compoundAction
				? 'The action is compound and semantically novel; use the minimum helper stages required and reserve bounded repair only after canonical validation rejects the proposal.'
				: 'The player expressed a capability-like or unresolved use request without a canonical match.',
			maxHelperCalls: 4,
		};
	}

	if (params.itemKnown && !params.ambiguousLanguage && !params.compoundAction) {
		return {
			strategy: 'NONE',
			mode: 'DETERMINISTIC_MECHANICS',
			reason: 'The requested item is canonically identified and the action is not semantically ambiguous; inventory resolution does not need an LLM.',
			maxHelperCalls: 0,
		};
	}

	if (params.requiresCheckOrHazardInterpretation || params.ambiguousLanguage || params.compoundAction) {
		return {
			strategy: 'INTERPRET_ONCE',
			mode: 'INTERPRETATION',
			reason: 'The action may require semantic interpretation before canonical resolution; one repair pass is available only when the first interpretation remains insufficient.',
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
	private readonly expectedRoles: AiHelperCallRole[];
	private helperCallsUsed = 0;
	private helperOutputTokensUsed = 0;
	private readonly blockedTasks: Array<{ task: TaskId | string; reason: string }> = [];
	private readonly callHistory: AiCallPolicyCallRecord[] = [];

	public constructor(mode: AiCallPolicyMode) {
		const policy = MODE_POLICIES[mode];
		this.mode = mode;
		this.maxHelperCalls = policy.maxHelperCalls;
		this.maxHelperOutputTokens = policy.maxHelperOutputTokens;
		this.allowedTasks = new Set(policy.allowedTasks);
		this.expectedRoles = [...policy.expectedRoles];
	}

	private isRoleCompatibleWithTask(task: string, role: AiHelperCallRole): boolean {
		if (role === 'INTENT_INTERPRET' || role === 'SEMANTIC_REPAIR') return task === 'intent.interpret';
		if (role === 'CAPABILITY_SYNTHESIZE') return task === 'capability.synthesize';
		return false;
	}

	public authorize(
		task: TaskId | string,
		requestedMaxTokens: number,
		role?: AiHelperCallRole,
	): AiCallPolicyDecision {
		const normalizedTask = String(task);
		const expectedRole = this.expectedRoles[this.helperCallsUsed] || null;
		const normalizedRole = role || expectedRole;

		if (this.expectedRoles.length === 0) {
			const reason = 'No helper calls are permitted in ' + this.mode + ' mode.';
			this.blockedTasks.push({ task, reason });
			this.callHistory.push({ task, role: normalizedRole, allowed: false, reason, maxTokens: 0 });
			return { allowed: false, reason, maxTokens: 0, role: normalizedRole };
		}

		if (!normalizedRole || !this.isRoleCompatibleWithTask(normalizedTask, normalizedRole)) {
			const reason = 'Task/role mismatch: "' + normalizedTask + '" cannot perform helper role "' + String(normalizedRole) + '" in ' + this.mode + ' mode.';
			this.blockedTasks.push({ task, reason });
			this.callHistory.push({ task, role: normalizedRole, allowed: false, reason, maxTokens: 0 });
			return { allowed: false, reason, maxTokens: 0, role: normalizedRole };
		}

		if (normalizedRole !== expectedRole) {
			const reason = 'Helper stage "' + normalizedRole + '" is not permitted yet; the next authorized stage is "' + String(expectedRole) + '".';
			this.blockedTasks.push({ task, reason });
			this.callHistory.push({ task, role: normalizedRole, allowed: false, reason, maxTokens: 0 });
			return { allowed: false, reason, maxTokens: 0, role: normalizedRole };
		}

		if (!this.allowedTasks.has(normalizedTask)) {
			const reason = 'Task "' + normalizedTask + '" is not permitted in ' + this.mode + ' mode.';
			this.blockedTasks.push({ task, reason });
			this.callHistory.push({ task, role: normalizedRole, allowed: false, reason, maxTokens: 0 });
			return { allowed: false, reason, maxTokens: 0, role: normalizedRole };
		}

		if (this.helperCallsUsed >= this.maxHelperCalls) {
			const reason = 'Strict AI call budget exhausted: ' + this.helperCallsUsed + '/' + this.maxHelperCalls + ' helper calls used.';
			this.blockedTasks.push({ task, reason });
			this.callHistory.push({ task, role: normalizedRole, allowed: false, reason, maxTokens: 0 });
			return { allowed: false, reason, maxTokens: 0, role: normalizedRole };
		}

		const remainingOutputBudget = this.maxHelperOutputTokens - this.helperOutputTokensUsed;
		if (remainingOutputBudget <= 0) {
			const reason = 'Strict AI output-token budget exhausted for this action.';
			this.blockedTasks.push({ task, reason });
			this.callHistory.push({ task, role: normalizedRole, allowed: false, reason, maxTokens: 0 });
			return { allowed: false, reason, maxTokens: 0, role: normalizedRole };
		}

		const taskCap = TASK_OUTPUT_CAPS[normalizedTask] ?? remainingOutputBudget;
		const maxTokens = Math.max(1, Math.min(requestedMaxTokens || taskCap, taskCap, remainingOutputBudget));
		const reason = 'Authorized ' + normalizedTask + ' for helper role ' + normalizedRole + ' under ' + this.mode + ' policy.';
		this.helperCallsUsed += 1;
		this.helperOutputTokensUsed += maxTokens;
		this.callHistory.push({ task, role: normalizedRole, allowed: true, reason, maxTokens });
		return { allowed: true, reason, maxTokens, role: normalizedRole };
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
			callHistory: [...this.callHistory],
		};
	}
}
