import type { TaskId } from './aiOrchestrator';

export interface AiTurnCallBudgetSnapshot {
	logicalCallsByTask: Record<string, number>;
	providerAttemptsByTask: Record<string, number>;
	limitsByTask: Record<string, number>;
	blockedTasks: Array<{ task: string; reason: string }>;
	totalLogicalCalls: number;
	totalProviderAttempts: number;
}

const DEFAULT_TASK_LIMITS: Record<string, number> = {
	'intent.interpret': 1,
	'research.query': 1,
	'research.world-brief': 1,
	'narrative.generate': 1,
	'narrative.review': 1,
	'character.dialogue': 1,
	'memory.extract': 1,
	'summary.scene': 1,
	'combat.tactics': 1,
	'tactical.reason': 1,
	'utility.inspect': 1,
};

/**
 * Real network attempts allowed per task in one turn (failover and retries included).
 * The logical-call limits above cap *tasks*; these cap the provider requests a task may
 * spend. Without them a configured fallback chain is walked end to end, so one weak
 * chain can cost 8+ requests per task per turn (observed live, 2026-11-23).
 */
const DEFAULT_PROVIDER_ATTEMPT_LIMITS: Record<string, number> = {
	'narrative.generate': 4,
};
const DEFAULT_PROVIDER_ATTEMPTS_PER_TASK = 3;
const DEFAULT_PROVIDER_ATTEMPTS_PER_TURN = 10;
/**
 * One correction call per turn is held outside every cap above. The turns most likely to need repair are the busy ones, which
 * are also the turns that end with their budget spent (reference study: Open Game Master's narration guard holds its rewrite
 * outside the turn's four-call budget for the same reason).
 */
const DEFAULT_RESERVED_CORRECTIONS = 1;

export interface AiTurnProviderAttemptCaps {
	perTask?: Record<string, number>;
	defaultPerTask?: number;
	perTurn?: number;
	/** Correction calls held in reserve outside the caps above (default 1). */
	reservedCorrections?: number;
}

export class AiTurnCallBudget {
	private readonly logicalCallsByTask = new Map<string, number>();
	private readonly providerAttemptsByTask = new Map<string, number>();
	private readonly blockedTasks: Array<{ task: string; reason: string }> = [];

	private readonly attemptCaps: Required<AiTurnProviderAttemptCaps>;
	private reservedCorrectionsLeft: number;
	private reserveActive = false;
	private reserveAttemptUsed = false;

	public constructor(
		private readonly limitsByTask: Record<string, number> = DEFAULT_TASK_LIMITS,
		attemptCaps: AiTurnProviderAttemptCaps = {},
	) {
		this.attemptCaps = {
			perTask: { ...DEFAULT_PROVIDER_ATTEMPT_LIMITS, ...(attemptCaps.perTask || {}) },
			defaultPerTask: attemptCaps.defaultPerTask ?? DEFAULT_PROVIDER_ATTEMPTS_PER_TASK,
			perTurn: attemptCaps.perTurn ?? DEFAULT_PROVIDER_ATTEMPTS_PER_TURN,
			reservedCorrections: attemptCaps.reservedCorrections ?? DEFAULT_RESERVED_CORRECTIONS,
		};
		this.reservedCorrectionsLeft = this.attemptCaps.reservedCorrections;
	}

	/** Maximum real provider requests (or, for retrying callers, distinct models) for a task this turn. */
	public providerAttemptCap(task: TaskId | string): number {
		return this.attemptCaps.perTask[String(task)] ?? this.attemptCaps.defaultPerTask;
	}

	/**
	 * Whether one more real provider request may be made for this task this turn.
	 * Callers must not apply this to the zero-cost deterministic emergency floor.
	 */
	public canAttemptProvider(task: TaskId | string, options: { reserved?: boolean } = {}): { allowed: boolean; reason?: string; usedReserve?: boolean } {
		const normal = this.canAttemptProviderWithinCaps(task);
		if (normal.allowed) return normal;
		if (options.reserved && this.reserveActive && !this.reserveAttemptUsed) {
			this.reserveAttemptUsed = true;
			return { allowed: true, usedReserve: true };
		}
		return normal;
	}

	private canAttemptProviderWithinCaps(task: TaskId | string): { allowed: boolean; reason?: string } {
		const key = String(task);
		const usedForTask = this.providerAttemptsByTask.get(key) || 0;
		const taskCap = this.attemptCaps.perTask[key] ?? this.attemptCaps.defaultPerTask;
		if (usedForTask >= taskCap) {
			const reason = `Per-turn provider attempt cap reached for ${key}: ${usedForTask}/${taskCap} requests.`;
			this.blockedTasks.push({ task: key, reason });
			return { allowed: false, reason };
		}
		const usedForTurn = Array.from(this.providerAttemptsByTask.values()).reduce((sum, value) => sum + value, 0);
		if (usedForTurn >= this.attemptCaps.perTurn) {
			const reason = `Per-turn provider attempt cap reached: ${usedForTurn}/${this.attemptCaps.perTurn} requests across all tasks.`;
			this.blockedTasks.push({ task: key, reason });
			return { allowed: false, reason };
		}
		return { allowed: true };
	}

	/**
	 * Starts a correction (repair/rewrite) task: normally counted against its own task limit, but it may spend the reserved
	 * correction once when that limit is already used.
	 */
	public beginCorrection(task: TaskId | string): { allowed: boolean; reason?: string; reserved: boolean } {
		const normal = this.beginTask(task);
		if (normal.allowed) return { ...normal, reserved: false };
		if (this.reservedCorrectionsLeft > 0) {
			this.reservedCorrectionsLeft -= 1;
			this.reserveActive = true;
			this.reserveAttemptUsed = false;
			return { allowed: true, reserved: true };
		}
		return { ...normal, reserved: false };
	}

	public reservedCorrectionsRemaining(): number {
		return this.reservedCorrectionsLeft;
	}

	public beginTask(task: TaskId | string): { allowed: boolean; reason?: string } {
		const key = String(task);
		const used = this.logicalCallsByTask.get(key) || 0;
		const limit = this.limitsByTask[key] ?? 1;
		if (used >= limit) {
			const reason = `Per-turn AI call budget exhausted for ${key}: ${used}/${limit} logical calls.`;
			this.blockedTasks.push({ task: key, reason });
			return { allowed: false, reason };
		}
		this.logicalCallsByTask.set(key, used + 1);
		return { allowed: true };
	}

	public recordProviderAttempt(task: TaskId | string): void {
		const key = String(task);
		this.providerAttemptsByTask.set(key, (this.providerAttemptsByTask.get(key) || 0) + 1);
	}

	public snapshot(): AiTurnCallBudgetSnapshot {
		return {
			logicalCallsByTask: Object.fromEntries(this.logicalCallsByTask.entries()),
			providerAttemptsByTask: Object.fromEntries(this.providerAttemptsByTask.entries()),
			limitsByTask: { ...this.limitsByTask },
			blockedTasks: [...this.blockedTasks],
			totalLogicalCalls: Array.from(this.logicalCallsByTask.values()).reduce((sum, value) => sum + value, 0),
			totalProviderAttempts: Array.from(this.providerAttemptsByTask.values()).reduce((sum, value) => sum + value, 0),
		};
	}
}
