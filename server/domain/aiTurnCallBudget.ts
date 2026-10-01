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

export class AiTurnCallBudget {
	private readonly logicalCallsByTask = new Map<string, number>();
	private readonly providerAttemptsByTask = new Map<string, number>();
	private readonly blockedTasks: Array<{ task: string; reason: string }> = [];

	public constructor(private readonly limitsByTask: Record<string, number> = DEFAULT_TASK_LIMITS) {}

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
