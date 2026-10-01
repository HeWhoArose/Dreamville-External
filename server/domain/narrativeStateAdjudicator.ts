import { deterministicId } from './deterministicRng';
import type { WorldRepository } from '../repositories/worldRepository';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { CurrentSituation } from './currentSituation';
import type { StructuredTurnPackage, StateChangeProposal } from './aiOrchestrator';

export interface StateAdjudicationOutcome {
	proposal: StateChangeProposal;
	commandId: string;
	approved: boolean;
	reason?: string;
	canonicalEngine: string;
	committed: boolean;
	rollbackSafe: boolean;
}

export interface StateAdjudicationResult {
	turnId: string;
	storyId: string;
	actorId: string;
	allApproved: boolean;
	approvedCount: number;
	rejectedCount: number;
	committedCount: number;
	rolledBack: boolean;
	outcomes: StateAdjudicationOutcome[];
	commitRecords: Array<{
		commandId: string;
		kind: string;
		targetId: string;
		transactionMode: 'OUTER_STAGED_TRANSACTION';
		source: 'AI_PROPOSAL';
	}>;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function normalize(value: unknown): string {
	return String(value ?? '').trim().toLowerCase();
}

function authorizedHealthProposal(
	proposal: StateChangeProposal,
	actorId: string,
): boolean {
	return normalize(proposal.kind) === 'health' &&
		proposal.targetId === actorId &&
		proposal.metadata?.['authorizedByCanonicalMechanic'] === true;
}

export class NarrativeStateAdjudicator {
	public static adjudicate(params: {
		repository: WorldRepository;
		storyId: string;
		turnId: string;
		actorId: string;
		playerIntent: PlayerIntent;
		currentSituation: CurrentSituation;
		turnPackage: StructuredTurnPackage;
	}): StateAdjudicationResult {
		const outcomes: StateAdjudicationOutcome[] = [];
		const proposals = Array.isArray(params.turnPackage.stateChanges) ? params.turnPackage.stateChanges : [];

		proposals.forEach((proposal, index) => {
			const commandId = deterministicId('narrative_state', params.storyId, params.turnId, index, proposal.kind, proposal.targetId);
			const kind = normalize(proposal.kind);

			if (authorizedHealthProposal(proposal, params.actorId)) {
				const value = Number(proposal.value);
				const state = params.repository.getConditionEngine(params.storyId).getActorState(params.actorId);
				if (!state) {
					outcomes.push({
						proposal,
						commandId,
						approved: false,
						reason: 'Canonical condition state for the actor does not exist.',
						canonicalEngine: 'ConditionEngine',
						committed: false,
						rollbackSafe: true,
					});
					return;
				}
				if (!Number.isFinite(value) || value < 0 || value > state.healthMax) {
					outcomes.push({
						proposal,
						commandId,
						approved: false,
						reason: 'Health proposal is outside the canonical actor health bounds.',
						canonicalEngine: 'ConditionEngine',
						committed: false,
						rollbackSafe: true,
					});
					return;
				}
				outcomes.push({
					proposal,
					commandId,
					approved: true,
					canonicalEngine: 'ConditionEngine',
					committed: false,
					rollbackSafe: true,
				});
				return;
			}

			const reason =
				kind === 'location' && !params.playerIntent.movementIntent
					? 'Location mutation is not authorized because the player intent contains no movement.'
					: 'AI state proposals require an explicit canonical mechanic authorization; narration alone cannot mutate canonical state.';
			outcomes.push({
				proposal,
				commandId,
				approved: false,
				reason,
				canonicalEngine: kind === 'location' ? 'GeographyGraph' : 'AuthoritativeCanonicalStateBoundary',
				committed: false,
				rollbackSafe: true,
			});
		});

		const approved = outcomes.filter((outcome) => outcome.approved);
		return {
			turnId: params.turnId,
			storyId: params.storyId,
			actorId: params.actorId,
			allApproved: outcomes.every((outcome) => outcome.approved),
			approvedCount: approved.length,
			rejectedCount: outcomes.length - approved.length,
			committedCount: 0,
			rolledBack: false,
			outcomes,
			commitRecords: [],
		};
	}

	public static commit(
		repository: WorldRepository,
		adjudication: StateAdjudicationResult,
	): StateAdjudicationResult {
		const approved = adjudication.outcomes.filter((outcome) => outcome.approved);
		const before = repository.getConditionEngine(adjudication.storyId).getActorState(adjudication.actorId);
		const committed: StateAdjudicationOutcome[] = [];
		try {
			for (const outcome of approved) {
				if (authorizedHealthProposal(outcome.proposal, adjudication.actorId)) {
					repository.getConditionEngine(adjudication.storyId).setHealth(
						adjudication.actorId,
						Number(outcome.proposal.value),
						before?.healthMax,
					);
					committed.push({ ...outcome, committed: true });
				}
			}
			const records = committed.map((outcome) => ({
				commandId: outcome.commandId,
				kind: normalize(outcome.proposal.kind).toUpperCase(),
				targetId: outcome.proposal.targetId,
				transactionMode: 'OUTER_STAGED_TRANSACTION' as const,
				source: 'AI_PROPOSAL' as const,
			}));
		return {
			...clone(adjudication),
			committedCount: committed.length,
			outcomes: adjudication.outcomes.map((outcome) => committed.find((item) => item.commandId === outcome.commandId) || outcome),
			commitRecords: records,
		};
		} catch (error) {
			if (before) {
				try {
					repository.getConditionEngine(adjudication.storyId).setHealth(adjudication.actorId, before.healthCurrent, before.healthMax);
				} catch {
					// The outer STAGED canonical transaction remains the final rollback authority.
				}
			}
			return {
				...clone(adjudication),
				committedCount: 0,
				rolledBack: true,
				outcomes: adjudication.outcomes.map((outcome) => ({ ...outcome, committed: false })),
				commitRecords: [],
			};
		}
	}
}

export const narrativeStateAdjudicator = NarrativeStateAdjudicator;
