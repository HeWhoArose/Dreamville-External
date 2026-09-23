export type NpcGoalVisibility = 'PUBLIC' | 'PRIVATE';
export interface NpcGoal { id: string; description: string; priority: number; visibility: NpcGoalVisibility; targetEntityId?: string; targetLocationId?: string; requiredKnowledgeIds?: string[]; blockedByKnowledgeIds?: string[]; active: boolean; }
export interface NpcBelief { id: string; factId: string; confidence: number; source: string; }
export interface NpcPlanStep { id: string; action: string; targetEntityId?: string; targetLocationId?: string; utility: number; deception?: boolean; }
export interface NpcAgentState {
	schemaVersion: number;
	actorId: string;
	goals: NpcGoal[];
	fears: string[];
	desires: string[];
	loyalties: Record<string, number>;
	beliefs: NpcBelief[];
	secrets: string[];
	plan: NpcPlanStep[];
	resources: Record<string, number>;
	constraints: string[];
	riskTolerance: number;
	deception: number;
	updatedAtSeconds: number;
}

export interface NpcDecisionContext {
	actorId: string;
	availableActions: Array<{ id: string; description: string; targetEntityId?: string; targetLocationId?: string; baseUtility?: number; risk?: number; requiredKnowledgeIds?: string[]; enablesDeception?: boolean }>;
	knownFactIds: string[];
	opportunityScore?: number;
	nowSeconds: number;
}

export interface NpcDecision { actionId: string; rationale: string; utility: number; deception: boolean; goalId?: string; }

export class NpcAutonomyEngine {
	public createState(actorId: string, now = 0): NpcAgentState {
		return { schemaVersion: 1, actorId, goals: [], fears: [], desires: [], loyalties: {}, beliefs: [], secrets: [], plan: [], resources: {}, constraints: [], riskTolerance: 50, deception: 0, updatedAtSeconds: now };
	}

	public decide(state: NpcAgentState, context: NpcDecisionContext): NpcDecision | undefined {
		const activeGoals = state.goals.filter((g) => g.active);
		const ranked = context.availableActions.map((action) => {
			const compatibleGoal = activeGoals.find((goal) => !goal.requiredKnowledgeIds?.some((id) => !context.knownFactIds.includes(id)) && !goal.blockedByKnowledgeIds?.some((id) => context.knownFactIds.includes(id)));
			const goalUtility = compatibleGoal ? compatibleGoal.priority : 0;
			const opportunity = context.opportunityScore ?? 0;
			const riskPenalty = Math.max(0, (action.risk ?? 0) - state.riskTolerance) * 0.5;
			const utility = (action.baseUtility ?? 0) + goalUtility + opportunity - riskPenalty;
			return { action, utility, goal: compatibleGoal };
		}).sort((a, b) => b.utility - a.utility || a.action.id.localeCompare(b.action.id));
		const winner = ranked[0];
		if (!winner) return undefined;
		const deception = !!winner.action.enablesDeception && state.deception >= 50;
		const decision = {
			actionId: winner.action.id,
			rationale: `Selected from active goals, known facts, opportunity and risk tolerance; utility=${winner.utility}.`,
			utility: winner.utility,
			deception,
			goalId: winner.goal?.id,
		};
		state.plan = [{ id: winner.action.id, action: winner.action.description, targetEntityId: winner.action.targetEntityId, targetLocationId: winner.action.targetLocationId, utility: winner.utility, deception }];
		state.updatedAtSeconds = context.nowSeconds;
		return decision;
	}

	public validateGoal(goal: NpcGoal): string[] {
		const errors: string[] = [];
		if (!goal.id) errors.push('NPC goal id is required.');
		if (!goal.description) errors.push('NPC goal description is required.');
		if (!Number.isFinite(goal.priority)) errors.push('NPC goal priority must be finite.');
		return errors;
	}

	public serialize(state: NpcAgentState): NpcAgentState { return JSON.parse(JSON.stringify(state)); }
}
