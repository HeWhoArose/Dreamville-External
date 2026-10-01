import type { ActionLog, StoryCheckResult } from '../../src/types';
import type { CurrentSituation, NearbyEntityContext } from './currentSituation';

export type VisualOutcome = 'SUCCESS' | 'FAILURE';

export interface VisualCharacterContext {
	id: string;
	name: string;
	kind: string;
	role?: string;
	title?: string;
	presence: NearbyEntityContext['presence'];
	isAlive: boolean;
	currentActivity?: string;
	distanceBand: NearbyEntityContext['distanceBand'];
}

export interface VisualSceneContext {
	storyId: string;
	turnId: string;
	currentSituation: CurrentSituation;
	latestTurn?: ActionLog;
	latestTurnId?: string;
	latestPlayerAction?: string;
	latestNarrative?: string;
	latestVisualCues: string[];
	latestDialogue?: {
		speakerId?: string;
		speakerName: string;
		text: string;
	};
	checkResult?: StoryCheckResult;
	canonicalOutcome?: VisualOutcome;
	visibleCharacters: VisualCharacterContext[];
	visualFreshnessToken: string;
	openingState: boolean;
}

function normalize(value: unknown): string {
	return String(value ?? '').trim();
}

function uniqueNonEmpty(values: string[]): string[] {
	return Array.from(new Set(values.map(normalize).filter(Boolean)));
}

function actionTurnNumber(action: ActionLog): number {
	return Number.isFinite(Number(action.turnNumber)) ? Number(action.turnNumber) : -1;
}

/**
 * Returns the latest player-action turn from the presentation-safe action history.
 * NOTE_RECORD entries are setup/state notes, not player turns and must never become
 * the source image once a real player action exists.
 *
 * The normal server projection is newest-first, but this helper deliberately derives
 * the latest turn by turnNumber when available so visual freshness does not depend
 * on array ordering.
 */
export function selectLatestVisualTurn(actionHistory: readonly ActionLog[]): ActionLog | undefined {
	const candidates = actionHistory.filter((action) => action.actionType !== 'NOTE_RECORD');
	if (candidates.length === 0) return undefined;

	return [...candidates]
		.sort((left, right) => {
			const turnDelta = actionTurnNumber(right) - actionTurnNumber(left);
			if (turnDelta !== 0) return turnDelta;
			return String(right.timestamp || '').localeCompare(String(left.timestamp || ''));
		})[0];
}

export function resolveCanonicalVisualOutcome(action?: ActionLog): VisualOutcome | undefined {
	if (!action) return undefined;
	if (typeof action.checkResult?.success === 'boolean') {
		return action.checkResult.success ? 'SUCCESS' : 'FAILURE';
	}
	if (action.epistemicValidation === 'REJECTED_BY_ENGINE') return 'FAILURE';
	return undefined;
}

function projectVisibleCharacters(situation: CurrentSituation): VisualCharacterContext[] {
	return situation.nearbyEntities
		.filter((entity) =>
			entity.visibleToPlayer &&
			entity.locationId === situation.location.id &&
			entity.id !== situation.player.actorId &&
			entity.isAlive !== false &&
			(entity.kind === 'NPC' || entity.kind === 'CHARACTER' || entity.kind === 'CREATURE'),
		)
		.slice(0, 8)
		.map((entity) => ({
			id: entity.id,
			name: entity.name,
			kind: entity.kind,
			role: entity.role,
			presence: entity.presence,
			isAlive: entity.isAlive,
			currentActivity: entity.currentActivity,
			distanceBand: entity.distanceBand,
		}));
}

function projectDialogue(situation: CurrentSituation, action?: ActionLog): VisualSceneContext['latestDialogue'] {
	if (!action || action.actionType !== 'DIALOGUE_CHOICE' || !situation.activeDialogue) return undefined;
	return {
		speakerId: situation.activeDialogue.speakerId,
		speakerName: situation.activeDialogue.speakerName,
		text: situation.activeDialogue.text,
	};
}

export interface BuildVisualSceneContextInput {
	storyId: string;
	currentSituation: CurrentSituation;
	actionHistory?: readonly ActionLog[];
	presentationAction?: ActionLog;
}

export function buildVisualSceneContext(input: BuildVisualSceneContextInput): VisualSceneContext {
	const latestTurn = input.presentationAction || selectLatestVisualTurn(input.actionHistory || []);
	const latestVisualCues = uniqueNonEmpty(latestTurn?.visualCues || []).slice(0, 4);
	const latestPlayerAction = normalize(latestTurn?.description);
	const latestNarrative = normalize(latestTurn?.narrativeResponse || latestTurn?.presentationFeedback || latestTurn?.authoritativeFeedback);
	const outcome = resolveCanonicalVisualOutcome(latestTurn);
	const openingState = !latestTurn;

	return {
		storyId: input.storyId,
		turnId: input.currentSituation.turnId,
		currentSituation: input.currentSituation,
		latestTurn,
		latestTurnId: latestTurn?.id,
		latestPlayerAction: latestPlayerAction || undefined,
		latestNarrative: latestNarrative || undefined,
		latestVisualCues,
		latestDialogue: projectDialogue(input.currentSituation, latestTurn),
		checkResult: latestTurn?.checkResult,
		canonicalOutcome: outcome,
		visibleCharacters: projectVisibleCharacters(input.currentSituation),
		visualFreshnessToken: latestTurn?.id || input.currentSituation.turnId || 'opening-state',
		openingState,
	};
}

export function assertVisualSceneFreshness(context: VisualSceneContext): void {
	if (context.latestTurn && context.openingState) {
		throw new Error('VISUAL_SCENE_CONTEXT_INVARIANT_FAILED: latest turn cannot coexist with opening state');
	}
	if (context.latestTurnId && context.visualFreshnessToken !== context.latestTurnId) {
		throw new Error('VISUAL_SCENE_CONTEXT_INVARIANT_FAILED: freshness token does not match latest turn');
	}
	if (!context.currentSituation.location.id) {
		throw new Error('VISUAL_SCENE_CONTEXT_INVARIANT_FAILED: current location is required');
	}
}
