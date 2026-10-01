import type { StructuredTurnPackage, AdjudicationResult } from './aiOrchestrator';
import { CurrentSituationBuilder, type CurrentSituation } from './currentSituation';
import { EpistemicBoundaryEnforcer } from './epistemicBoundary';
import { NarrativeDirector, type EphemeralNarrativePlan } from './narrativeDirector';
import { NarrativeResearchPipeline, type NarrativeResearchResult } from './narrativeResearchPipeline';
import { NarrativeStateAdjudicator, type StateAdjudicationResult } from './narrativeStateAdjudicator';
import { NarrativeContinuityEngine } from './narrativeContinuityEngine';
import { PlayerIntentInterpreter, type PlayerIntent } from './playerIntentInterpreter';
import { SemanticNarrativeReview, type NarrativeReview } from './semanticNarrativeReview';
import type { WorldRepository } from '../repositories/worldRepository';

export type TurnHarnessNarrationMode = 'DETERMINISTIC' | 'EMPTY' | 'MALFORMED';

export type TurnHarnessProviderMode =
	| 'PRIMARY_AVAILABLE'
	| 'PRIMARY_UNAVAILABLE_FALLBACK'
	| 'ALL_UNAVAILABLE_EMERGENCY';

export type TurnHarnessCommitMode = 'SUCCESS' | 'FAILURE';

export interface TurnHarnessTrace {
	storyId: string;
	playerAction: string;
	intent: PlayerIntent;
	initialSituation: CurrentSituation;
	currentSituation: CurrentSituation;
	research: NarrativeResearchResult;
	plan: EphemeralNarrativePlan;
	turnPackage?: StructuredTurnPackage;
	narrativeReview?: NarrativeReview;
	stateAdjudication?: StateAdjudicationResult;
	continuity?: ReturnType<typeof NarrativeContinuityEngine.recordTurn>;
	nextSituation?: CurrentSituation;
	stages: Array<{
		name: string;
		status: 'PASS' | 'FAIL' | 'FALLBACK';
		detail: string;
	}>;
	failure?: string;
	providerMode?: TurnHarnessProviderMode;
	commitMode?: TurnHarnessCommitMode;
	commitAttempted?: boolean;
	continuityRecorded?: boolean;
}

function buildDeterministicNarration(
	intent: PlayerIntent,
	plan: EphemeralNarrativePlan,
	research: NarrativeResearchResult,
): string {
	const firstReveal = plan.informationToReveal[0];
	const firstResearchBlock = firstReveal
		? research.blocks.find((block) => firstReveal.sourceBlockIds.includes(block.id))
		: undefined;
	const evidence = String(firstResearchBlock?.content || firstReveal?.topic || '').trim();

	const parts: string[] = [];
	if (intent.movementIntent) {
		parts.push('You move closer to the relevant source without changing the action into a conversation.');
	}
	if (intent.speechIntent) {
		parts.push('You speak only the question or statement you explicitly intended.');
	} else if (intent.observationIntent) {
		parts.push('You listen and observe without speaking.');
	}
	if (intent.interactionMode === 'COMBAT') {
		parts.push('You make the requested combat attempt and wait for the canonical result.');
	} else if (intent.interactionMode === 'MANIPULATION') {
		parts.push('You handle the requested object only as far as the current scene permits.');
	} else if (intent.interactionMode === 'DIALOGUE') {
		parts.push('The interaction remains within the current conversational context.');
	}
	if (intent.informationGoal) {
		parts.push(evidence ? 'The available context indicates: ' + evidence.slice(0, 260) : 'No reliable information is established by the available context.');
	}
	if (!parts.length) {
		parts.push('You act within the current scene and observe the immediate result.');
	}
	return parts.join(' ');
}

function makeTurnPackage(narrative: string, intent: PlayerIntent, plan: EphemeralNarrativePlan): StructuredTurnPackage {
	return {
		narrative: narrative ? [narrative] : [],
		dialogue: intent.speechIntent ? [{ speaker: 'Player', text: intent.originalText }] : [],
		events: ['HARNESS_TURN_NARRATED'],
		stateChanges: [],
		memoryCandidates: [
			plan.informationToReveal[0]?.topic
				? 'The player learned about ' + plan.informationToReveal[0].topic + '.'
				: 'The player completed a canon-grounded action in the current scene.',
		],
		audioCues: [],
		visualCues: [narrative.slice(0, 180)],
	};
}

export class TurnIntegrationHarness {
	public static run(params: {
		repository: WorldRepository;
		storyId: string;
		playerAction: string;
		narrationMode?: TurnHarnessNarrationMode;
		providerMode?: TurnHarnessProviderMode;
		commitMode?: TurnHarnessCommitMode;
	}): TurnHarnessTrace {
		const stages: TurnHarnessTrace['stages'] = [];
		try {
			const initialSituation = CurrentSituationBuilder.build({
				storyId: params.storyId,
				playerAction: params.playerAction,
				viewerActorId: params.repository.getPlayerLifecycle(params.storyId)?.actorId,
				worldRepo: params.repository,
			});
			const intent = PlayerIntentInterpreter.deterministic(params.playerAction, initialSituation);
			stages.push({ name: 'intent', status: 'PASS', detail: intent.action });

			const currentSituation = CurrentSituationBuilder.build({
				storyId: params.storyId,
				playerAction: params.playerAction,
				currentAction: intent,
				viewerActorId: initialSituation.player.actorId,
				worldRepo: params.repository,
			});
			stages.push({ name: 'current-situation', status: 'PASS', detail: currentSituation.location.name });

			const rawResearch = NarrativeResearchPipeline.research({
				repository: params.repository,
				storyId: params.storyId,
				currentSituation,
				playerIntent: intent,
				playerAction: params.playerAction,
				viewerActorId: currentSituation.player.actorId,
			});
			const research = EpistemicBoundaryEnforcer.sanitizeResearch(rawResearch, currentSituation).result;
			stages.push({ name: 'research', status: rawResearch.failures.length ? 'FALLBACK' : 'PASS', detail: research.blocks.length + ' bounded blocks' });

			const plan = NarrativeDirector.create({ situation: currentSituation, intent, research });
			stages.push({ name: 'plan', status: 'PASS', detail: plan.immediateSteps.join(' | ') || plan.objective });

			const mode = params.narrationMode || 'DETERMINISTIC';
			const providerMode = params.providerMode || 'PRIMARY_AVAILABLE';
			const commitMode = params.commitMode || 'SUCCESS';

			if (providerMode === 'PRIMARY_UNAVAILABLE_FALLBACK') {
				stages.push({
					name: 'ai-provider',
					status: 'FALLBACK',
					detail: 'Simulated primary provider outage; deterministic fallback retained the same turn contract.',
				});
			} else if (providerMode === 'ALL_UNAVAILABLE_EMERGENCY') {
				stages.push({
					name: 'ai-provider',
					status: 'FALLBACK',
					detail: 'Simulated total provider outage; deterministic emergency floor retained the same turn contract.',
				});
			} else {
				stages.push({
					name: 'ai-provider',
					status: 'PASS',
					detail: 'Simulated primary provider available; harness remains external-AI free.',
				});
			}
			if (mode === 'EMPTY') {
				throw new Error('HARNESS_EMPTY_NARRATION');
			}
			if (mode === 'MALFORMED') {
				throw new Error('HARNESS_MALFORMED_NARRATION');
			}

			const narrative = buildDeterministicNarration(intent, plan, research);
			const turnPackage = makeTurnPackage(narrative, intent, plan);
			stages.push({ name: 'narration', status: 'FALLBACK', detail: 'Deterministic mock narrator; no external model call.' });

			const narrativeReview = SemanticNarrativeReview.review({
				intent,
				situation: currentSituation,
				plan,
				turnPackage,
			});
			stages.push({ name: 'semantic-review', status: narrativeReview.decision === 'ACCEPT' ? 'PASS' : 'FAIL', detail: narrativeReview.decision });
			if (narrativeReview.decision !== 'ACCEPT') {
				throw new Error('HARNESS_NARRATIVE_REVIEW_' + narrativeReview.decision);
			}

			const emptyCanonicalAdjudication: AdjudicationResult = {
				allApproved: true,
				approvedCount: 0,
				rejectedCount: 0,
				outcomes: [],
				disapprovedChanges: [],
			};
			const stateAdjudication = NarrativeStateAdjudicator.adjudicate({
				repository: params.repository,
				storyId: params.storyId,
				turnId: currentSituation.turnId,
				actorId: currentSituation.player.actorId,
				playerIntent: intent,
				currentSituation,
				turnPackage,
				canonicalAdjudication: emptyCanonicalAdjudication,
				verifiedCanonicalChanges: [],
			});
			const commitAttempted = true;
			if (commitMode === 'FAILURE') {
				stages.push({
					name: 'state-commit',
					status: 'FAIL',
					detail: 'Simulated canonical commit failure; continuity/memory promotion is intentionally not entered.',
				});
				throw new Error('HARNESS_CANONICAL_COMMIT_FAILURE');
			}

			const committedAdjudication = NarrativeStateAdjudicator.commit(params.repository, stateAdjudication);
			stages.push({ name: 'state-adjudication', status: committedAdjudication.allApproved ? 'PASS' : 'FALLBACK', detail: 'approved=' + committedAdjudication.approvedCount + ', committed=' + committedAdjudication.committedCount });
			stages.push({ name: 'state-commit', status: 'PASS', detail: 'Canonical adjudication commit completed before continuity lifecycle.' });

			const continuity = NarrativeContinuityEngine.recordTurn(params.repository, {
				storyId: params.storyId,
				turnId: currentSituation.turnId,
				playerAction: params.playerAction,
				playerIntent: intent,
				turnPackage,
				currentSituation,
				narrativeReview,
				stateAdjudication: committedAdjudication,
			});
			stages.push({ name: 'plot-memory-threads', status: 'PASS', detail: 'plot version=' + continuity.plot.version });

			const nextSituation = CurrentSituationBuilder.build({
				storyId: params.storyId,
				playerAction: params.playerAction,
				currentAction: intent,
				viewerActorId: currentSituation.player.actorId,
				worldRepo: params.repository,
			});
			stages.push({ name: 'next-situation', status: 'PASS', detail: nextSituation.turnId });

			return {
				storyId: params.storyId,
				playerAction: params.playerAction,
				intent,
				initialSituation,
				currentSituation,
				research,
				plan,
				turnPackage,
				narrativeReview,
				stateAdjudication: committedAdjudication,
				continuity,
				nextSituation,
				stages,
				providerMode,
				commitMode,
				commitAttempted: true,
				continuityRecorded: true,
			};
		} catch (error: any) {
			stages.push({ name: 'failure', status: 'FAIL', detail: String(error?.message || error) });
			throw Object.assign(new Error(String(error?.message || error)), { trace: { storyId: params.storyId, playerAction: params.playerAction, stages } });
		}
	}
}
