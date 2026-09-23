export type SituationStatus = 'OPEN' | 'ACTIVE' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'ABANDONED' | 'TRANSFORMED';
export type SituationOutcomeType = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE' | 'ABANDON' | 'TRANSFORM';

export interface SituationObjective { id: string; description: string; hidden: boolean; completed: boolean; failed: boolean; }
export interface SituationParticipant { entityId: string; role: string; active: boolean; }
export interface SituationOutcome { id: string; type: SituationOutcomeType; description: string; nextSituationId?: string; consequenceTags?: string[]; }
export interface SituationState {
	schemaVersion: number;
	id: string;
	storyId: string;
	title: string;
	status: SituationStatus;
	publicObjectives: SituationObjective[];
	hiddenObjectives: SituationObjective[];
	participants: SituationParticipant[];
	preconditions: string[];
	outcomes: SituationOutcome[];
	npcGoalIds: string[];
	environmentState: Record<string, unknown>;
	secretFactIds: string[];
	consequenceTags: string[];
	history: Array<{ eventId: string; outcome?: SituationOutcomeType; timestampSeconds: number }>;
}

export class SituationEngine {
	public create(input: Omit<SituationState, 'schemaVersion' | 'status' | 'history'>): SituationState {
		return { schemaVersion: 1, status: 'OPEN', history: [], ...JSON.parse(JSON.stringify(input)) };
	}
	public completeObjective(state: SituationState, objectiveId: string): boolean {
		const objective = [...state.publicObjectives, ...state.hiddenObjectives].find((o) => o.id === objectiveId);
		if (!objective) return false;
		objective.completed = true; objective.failed = false;
		return true;
	}
	public failObjective(state: SituationState, objectiveId: string): boolean {
		const objective = [...state.publicObjectives, ...state.hiddenObjectives].find((o) => o.id === objectiveId);
		if (!objective) return false;
		objective.failed = true;
		return true;
	}
	public resolve(state: SituationState, outcomeId: string, eventId: string, nowSeconds: number): SituationOutcome {
		const outcome = state.outcomes.find((o) => o.id === outcomeId);
		if (!outcome) throw new Error(`Unknown situation outcome '${outcomeId}'.`);
		state.status = outcome.type === 'SUCCESS' ? 'SUCCEEDED' : outcome.type === 'PARTIAL_SUCCESS' ? 'PARTIAL' : outcome.type === 'FAILURE' ? 'FAILED' : outcome.type === 'ABANDON' ? 'ABANDONED' : 'TRANSFORMED';
		state.consequenceTags.push(...(outcome.consequenceTags || []).filter((tag) => !state.consequenceTags.includes(tag)));
		state.history.push({ eventId, outcome: outcome.type, timestampSeconds: nowSeconds });
		return JSON.parse(JSON.stringify(outcome));
	}
	public canResolve(state: SituationState, outcomeId: string, satisfiedPreconditions: string[]): boolean {
		const outcome = state.outcomes.find((o) => o.id === outcomeId);
		return !!outcome && state.preconditions.every((p) => satisfiedPreconditions.includes(p));
	}
	public serialize(state: SituationState): SituationState { return JSON.parse(JSON.stringify(state)); }
}
