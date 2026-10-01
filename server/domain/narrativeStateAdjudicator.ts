import { deterministicId } from './deterministicRng';
			}
import type { WorldRepository } from '../repositories/worldRepository';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { CurrentSituation } from './currentSituation';
import type { AdjudicationResult, StructuredTurnPackage, StateChangeProposal } from './aiOrchestrator';

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

function sameProposal(left: StateChangeProposal, right: StateChangeProposal): boolean {
	return normalize(left.kind) === normalize(right.kind) &&
		String(left.targetId) === String(right.targetId) &&
		JSON.stringify(left.value) === JSON.stringify(right.value);
}

function isVerifiedCanonicalProposal(
	proposal: StateChangeProposal,
	verifiedCanonicalChanges: StateChangeProposal[],
): boolean {
	return verifiedCanonicalChanges.some((effect) => sameProposal(effect, proposal));
}

function canonicalOutcomeFor(
	proposal: StateChangeProposal,
	canonicalAdjudication?: AdjudicationResult,
): AdjudicationResult['outcomes'][number] | undefined {
	return canonicalAdjudication?.outcomes.find((outcome) => sameProposal(outcome.change, proposal));
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
		canonicalAdjudication?: AdjudicationResult;
		verifiedCanonicalChanges?: StateChangeProposal[];
	}): StateAdjudicationResult {
		const outcomes: StateAdjudicationOutcome[] = [];
		const proposals = Array.isArray(params.turnPackage.stateChanges) ? params.turnPackage.stateChanges : [];
		const verifiedCanonicalChanges = Array.isArray(params.verifiedCanonicalChanges) ? params.verifiedCanonicalChanges : [];

		proposals.forEach((proposal, index) => {
			const commandId = deterministicId('narrative_state', params.storyId, params.turnId, index, proposal.kind, proposal.targetId);
			const kind = normalize(proposal.kind);

			const canonicalOutcome = canonicalOutcomeFor(proposal, params.canonicalAdjudication);
			const verified = isVerifiedCanonicalProposal(proposal, verifiedCanonicalChanges);
			if (verified && canonicalOutcome?.approved) {
				if (kind === 'health') {
					if (proposal.targetId !== params.actorId) {
						outcomes.push({ proposal, commandId, approved: false, reason: 'Verified health mutation targets a different actor.', canonicalEngine: 'ConditionEngine', committed: false, rollbackSafe: true });
						return;
					}
					const value = Number(proposal.value);
					const state = params.repository.getConditionEngine(params.storyId).getActorState(params.actorId);
					if (!state) {
						outcomes.push({ proposal, commandId, approved: false, reason: 'Canonical condition state for the actor does not exist.', canonicalEngine: 'ConditionEngine', committed: false, rollbackSafe: true });
						return;
					}
					if (!Number.isFinite(value) || value < 0 || value > state.healthMax) {
						outcomes.push({ proposal, commandId, approved: false, reason: 'Health proposal is outside the canonical actor health bounds.', canonicalEngine: 'ConditionEngine', committed: false, rollbackSafe: true });
						return;
					}
			}
			outcomes.push({
				proposal,
				commandId,
				approved: Boolean(verified && canonicalOutcome?.approved),
				reason: verified
					? (canonicalOutcome?.reason || (canonicalOutcome?.approved ? undefined : 'The existing canonical adjudication rejected this proposal.'))
					: (kind === 'location' && !params.playerIntent.movementIntent
						? 'Location mutation is not authorized because the player intent contains no movement.'
						: 'AI state proposals require an independently verified canonical mechanic authorization; proposal metadata and narration cannot self-authorize canonical state.'),
				canonicalEngine: canonicalOutcome?.canonicalEngine || (kind === 'location' ? 'GeographyGraph' : 'AuthoritativeCanonicalStateBoundary'),
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
				if (normalize(outcome.proposal.kind) === 'health' && outcome.approved) {
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
