import type { CurrentSituation, RecentTurnContext } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { NarrativeResearchResult } from './narrativeResearchPipeline';
import type { NarrativeContinuityState } from './narrativeContinuityState';

export type NarrativeEpisodePhase =
	| 'OPENING'
	| 'DEVELOPMENT'
	| 'COMPLICATION'
	| 'ESCALATION'
	| 'TURNING_POINT'
	| 'RESOLUTION'
	| 'AFTERMATH'
	| 'PAUSED';

export type NarrativeEpisodeTrajectory =
	| 'ESTABLISH'
	| 'BUILD'
	| 'ESCALATE'
	| 'TURN'
	| 'RELEASE'
	| 'HOLD';

export interface NarrativeEpisodeProjection {
	version: 1;
	storyId: string;
	turnId: string;
	windowTurnCount: number;
	phase: NarrativeEpisodePhase;
	trajectory: NarrativeEpisodeTrajectory;
	centralQuestion: string;
	latestBeat: string;
	recentBeats: string[];
	activeThreadIds: string[];
	activeThreadSummaries: string[];
	keyEntities: string[];
	continuityAnchors: string[];
	pressurePoints: string[];
	resolutionSignals: string[];
	narrativeOpportunity: string;
	avoidForcing: string[];
	confidence: number;
	fallbackReason?: string;
	expiresAfterNarration: true;
}

function normalize(value: unknown): string {
	return String(value ?? '').replace(/s+/g, ' ').trim();
}

function lower(value: unknown): string {
	return normalize(value).toLowerCase();
}

function unique(values: string[], limit: number): string[] {
	return Array.from(new Set(values.map(normalize).filter(Boolean))).slice(-Math.max(1, limit));
}

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function recentHistory(situation: CurrentSituation, limit = 6): RecentTurnContext[] {
	return (Array.isArray(situation.recentTurns) ? situation.recentTurns : []).slice(-limit);
}

function unresolvedThreads(situation: CurrentSituation): Array<{ id: string; title: string; summary?: string; priority: number }> {
	return (Array.isArray(situation.openThreads) ? situation.openThreads : [])
		.filter((thread) => !thread.status || !/resolved|stale/i.test(String(thread.status)))
		.map((thread) => ({
			id: String(thread.id || ''),
			title: normalize(thread.title),
			summary: normalize(thread.summary),
			priority: Number(thread.priority || 0),
		}))
		.filter((thread) => thread.title)
		.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title))
		.slice(0, 5);
}

function containsAny(text: string, terms: string[]): boolean {
	return terms.some((term) => text.includes(term));
}

function classifyPhase(
	situation: CurrentSituation,
	intent: PlayerIntent,
	continuity: NarrativeContinuityState,
	history: RecentTurnContext[],
	threads: Array<{ id: string; title: string; summary?: string; priority: number }>,
): { phase: NarrativeEpisodePhase; trajectory: NarrativeEpisodeTrajectory; reason: string } {
	const allRecent = lower(history.map((turn) => [turn.playerAction, turn.narration, turn.unresolvedConsequence].filter(Boolean).join(' ')).join(' '));
	const latest = lower(history.at(-1)?.narration || '');
	const hasHistory = history.length > 0;
	const hasOpenThread = threads.length > 0;
	const hasResolutionLanguage = containsAny(latest, ['resolved', 'answered', 'confirmed', 'found', 'completed', 'finished', 'safe', 'reassured', 'settled']);
	const hasComplicationLanguage = containsAny(allRecent, ['but', 'however', 'uncertain', 'unknown', 'refused', 'failed', 'missing', 'still', 'rumor', 'rumour', 'warning', 'danger']);
	const highPressure = continuity.tension >= 65 || continuity.sceneMomentum === 'ESCALATING';
	const building = continuity.sceneMomentum === 'BUILDING';

	if (!hasHistory || situation.currentAction?.action === 'start' || situation.turnId === 'opening') {
		return { phase: 'OPENING', trajectory: 'ESTABLISH', reason: 'There is insufficient prior accepted-turn history to justify a later episode phase.' };
	}
	if (hasResolutionLanguage && !hasOpenThread && continuity.sceneMomentum === 'RELEASING') {
		return { phase: 'AFTERMATH', trajectory: 'RELEASE', reason: 'Recent narration contains resolution signals and no active thread requires continuation.' };
	}
	if (hasResolutionLanguage && hasOpenThread && !highPressure) {
		return { phase: 'RESOLUTION', trajectory: 'RELEASE', reason: 'A recent beat appears resolved while another bounded thread remains available for continuation.' };
	}
	if (highPressure && hasComplicationLanguage) {
		return { phase: 'ESCALATION', trajectory: 'ESCALATE', reason: 'Canonical continuity shows elevated tension or momentum alongside a recent complication signal.' };
	}
	if (intent.informationGoal && hasComplicationLanguage) {
		return { phase: 'COMPLICATION', trajectory: 'BUILD', reason: 'The current information objective remains shaped by uncertainty, refusal, or an unresolved complication.' };
	}
	if (building || hasOpenThread) {
		return { phase: 'DEVELOPMENT', trajectory: 'BUILD', reason: 'An active unresolved thread or building continuity state gives the current episode a developing direction.' };
	}
	if (continuity.sceneMomentum === 'RELEASING') {
		return { phase: 'AFTERMATH', trajectory: 'RELEASE', reason: 'Continuity state is releasing after a recent narrative development.' };
	}
	if (continuity.sceneMomentum === 'STALLING') {
		return { phase: 'PAUSED', trajectory: 'HOLD', reason: 'Continuity state indicates a stalled scene without enough evidence for a stronger episode phase.' };
	}
	return { phase: 'DEVELOPMENT', trajectory: 'BUILD', reason: 'The current episode remains in development based on accepted-turn continuity.' };
}

function centralQuestion(
	situation: CurrentSituation,
	intent: PlayerIntent,
	threads: Array<{ id: string; title: string; summary?: string; priority: number }>,
): string {
	if (intent.informationGoal) return normalize(intent.informationGoal);
	if (threads[0]?.title) return threads[0].title;
	if (situation.plot?.summary) return normalize(situation.plot.summary).slice(0, 240);
	if (intent.goal) return normalize(intent.goal);
	return 'What does the current player action change or reveal in this scene?';
}

function latestBeat(history: RecentTurnContext[], situation: CurrentSituation): string {
	const recent = normalize(history.at(-1)?.narration);
	if (recent) return recent.slice(0, 280);
	const plotBeat = normalize(situation.plot?.recentBeats?.at(-1)?.text);
	return plotBeat ? plotBeat.slice(0, 280) : 'No accepted narrative beat is available for projection.';
}

function buildRecentBeats(history: RecentTurnContext[], situation: CurrentSituation): string[] {
	const historyBeats = history
		.map((turn) => normalize(turn.narration || turn.playerAction || turn.unresolvedConsequence || ''))
		.filter(Boolean)
		.map((value) => value.slice(0, 220));
	const plotBeats = (situation.plot?.recentBeats || [])
		.slice(-4)
		.map((beat) => normalize(beat.text).slice(0, 220));
	return unique([...plotBeats, ...historyBeats], 6);
}

function keyEntities(situation: CurrentSituation, intent: PlayerIntent): string[] {
	const targetNames = [
		...(intent.explicitTargets || []).map((target) => target.name),
		intent.target?.name,
	].filter((name): name is string => Boolean(name));
	const visibleNames = (situation.nearbyEntities || [])
		.filter((entity) => entity.visibleToPlayer)
		.filter((entity) => targetNames.some((name) => String(name || '').toLowerCase() === String(entity.name || '').toLowerCase()))
		.map((entity) => entity.name)
		.filter((name): name is string => Boolean(name));
	return unique([...targetNames, ...visibleNames], 5);
}

function continuityAnchors(
	situation: CurrentSituation,
	continuity: NarrativeContinuityState,
	threads: Array<{ id: string; title: string; summary?: string; priority: number }>,
): string[] {
	return unique([
		'Location: ' + situation.location.name,
		'World time: ' + situation.worldTime,
		continuity.sceneMomentum ? 'Momentum: ' + continuity.sceneMomentum : '',
		continuity.emotionalTemperature ? 'Emotional temperature: ' + continuity.emotionalTemperature : '',
		...threads.slice(0, 2).map((thread) => 'Thread: ' + thread.title),
	], 6);
}

function pressurePoints(
	history: RecentTurnContext[],
	continuity: NarrativeContinuityState,
	threads: Array<{ id: string; title: string; summary?: string; priority: number }>,
): string[] {
	const points = [
		continuity.tension >= 65 ? 'Elevated scene tension (' + continuity.tension + '/100).' : '',
		continuity.sceneMomentum === 'ESCALATING' ? 'Scene momentum is escalating.' : '',
		...threads.slice(0, 3).map((thread) => 'Unresolved thread: ' + thread.title),
		...history.slice(-3)
			.map((turn) => normalize(turn.unresolvedConsequence))
			.filter(Boolean)
			.map((value) => 'Unresolved consequence: ' + value.slice(0, 180)),
	];
	return unique(points, 6);
}

function resolutionSignals(history: RecentTurnContext[], situation: CurrentSituation): string[] {
	const values = [
		...history.slice(-3).map((turn) => normalize(turn.narration)),
		...((situation.plot?.recentBeats || []).slice(-3).map((beat) => normalize(beat.text))),
	];
	return unique(
		values
			.filter((value) => containsAny(lower(value), ['resolved', 'answered', 'confirmed', 'found', 'completed', 'finished', 'safe', 'reassured', 'settled']))
			.map((value) => value.slice(0, 180)),
		4,
	);
}

export class NarrativeEpisodeProjectionEngine {
	public static resolve(params: {
		situation: CurrentSituation;
		intent: PlayerIntent;
		continuityState?: NarrativeContinuityState;
		research?: NarrativeResearchResult;
		historyWindow?: number;
	}): NarrativeEpisodeProjection {
		const continuity = params.continuityState || {
			version: 1,
			storyId: params.situation.storyId,
			turnCount: 0,
			tension: 0,
			emotionalTemperature: 'CALM' as const,
			sceneMomentum: 'STEADY' as const,
			unresolvedSubtext: [],
			activeConversationalTension: [],
			relationshipTrajectories: [],
			recentSensoryMotifs: [],
			recentNarrativeBeats: [],
			recentResponseShapes: [],
			narrativeFocus: [],
			updatedAt: params.situation.worldTime,
		};

		const history = recentHistory(params.situation, Math.max(3, Math.min(10, params.historyWindow ?? 6)));
		const threads = unresolvedThreads(params.situation);
		const classification = classifyPhase(params.situation, params.intent, continuity, history, threads);
		const beats = buildRecentBeats(history, params.situation);
		const entities = keyEntities(params.situation, params.intent);
		const anchors = continuityAnchors(params.situation, continuity, threads);
		const pressures = pressurePoints(history, continuity, threads);
		const resolutions = resolutionSignals(history, params.situation);
		const memoryEvidence = (params.research?.blocks || [])
			.filter((block) => block.kind === 'MEMORY')
			.slice(0, 3)
			.map((block) => normalize(block.content).slice(0, 180))
			.filter(Boolean);

		const fallbackReason = history.length === 0
			? 'No accepted recent-turn history was available; projection is limited to current canonical scene and continuity state.'
			: undefined;

		const narrativeOpportunity =
			classification.phase === 'OPENING'
				? 'Establish the immediate scene and the episode question without inventing a future beat.'
				: classification.phase === 'COMPLICATION'
					? 'Clarify the current uncertainty or complication through the player-authorized action.'
					: classification.phase === 'ESCALATION'
						? 'Give the current pressure a concrete observable consequence without forcing a new player decision.'
						: classification.phase === 'RESOLUTION'
							? 'Land the supported consequence while preserving any still-open thread.'
							: classification.phase === 'AFTERMATH'
								? 'Let the supported result settle and preserve the next open possibility for the player.'
								: classification.phase === 'PAUSED'
									? 'Preserve the current situation and avoid manufacturing escalation merely to create motion.'
									: 'Advance the current episode by one grounded beat, staying inside the supplied canonical scene and player intent.';

		const confidence = clamp(
			(history.length >= 3 ? 0.45 : 0.2) +
			(threads.length > 0 ? 0.2 : 0) +
			(continuity.sceneMomentum !== 'STEADY' ? 0.15 : 0) +
			(params.research && memoryEvidence.length > 0 ? 0.1 : 0) +
			(entities.length > 0 ? 0.1 : 0),
		);

		return {
			version: 1,
			storyId: params.situation.storyId,
			turnId: params.situation.turnId,
			windowTurnCount: history.length,
			phase: classification.phase,
			trajectory: classification.trajectory,
			centralQuestion: centralQuestion(params.situation, params.intent, threads).slice(0, 260),
			latestBeat: latestBeat(history, params.situation),
			recentBeats: beats,
			activeThreadIds: threads.map((thread) => thread.id).filter(Boolean),
			activeThreadSummaries: threads.map((thread) => thread.summary || thread.title).slice(0, 4),
			keyEntities: entities,
			continuityAnchors: anchors,
			pressurePoints: pressures,
			resolutionSignals: resolutions,
			narrativeOpportunity,
			avoidForcing: [
				'Do not create a canonical plot beat from this projection.',
				'Do not close or mutate an open thread.',
				'Do not decide the player's future action.',
				'Do not treat narrative research memories or rumors as new canonical events.',
				'Do not force escalation or resolution merely to satisfy the projected phase.',
			],
			confidence,
			fallbackReason,
			expiresAfterNarration: true,
		};
	}

	public static toPromptContext(projection?: NarrativeEpisodeProjection): string {
		if (!projection) {
			return 'N17 NARRATIVE EPISODE PROJECTION: unavailable; preserve current canonical continuity without inventing an episode arc.';
		}
		return [
			'N17 NARRATIVE EPISODE PROJECTION v' + projection.version + ' (EPHEMERAL — PRESENTATION ONLY)',
			'Phase: ' + projection.phase,
			'Trajectory: ' + projection.trajectory,
			'Episode question: ' + projection.centralQuestion,
			'Latest beat: ' + projection.latestBeat,
			projection.recentBeats.length ? 'Recent beats:\n- ' + projection.recentBeats.join('\n- ') : 'Recent beats: none.',
			projection.activeThreadSummaries.length ? 'Active threads:\n- ' + projection.activeThreadSummaries.join('\n- ') : 'Active threads: none.',
			projection.keyEntities.length ? 'Key entities: ' + projection.keyEntities.join(', ') : 'Key entities: none.',
			projection.pressurePoints.length ? 'Pressure points:\n- ' + projection.pressurePoints.join('\n- ') : 'Pressure points: none.',
			projection.resolutionSignals.length ? 'Resolution signals:\n- ' + projection.resolutionSignals.join('\n- ') : 'Resolution signals: none.',
			'Continuity anchors: ' + projection.continuityAnchors.join('; '),
			'Current narrative opportunity: ' + projection.narrativeOpportunity,
			'Confidence: ' + projection.confidence.toFixed(2),
			projection.fallbackReason ? 'Fallback: ' + projection.fallbackReason : 'Fallback: not required.',
			'Hard boundary: this projection describes the shape of the existing episode; it does not create canon, mutate threads, reveal hidden facts, or choose the player’s future action.',
		].join('\n');
	}

	public static toCompactPromptContext(projection?: NarrativeEpisodeProjection): string {
		if (!projection) return 'N17 episode: unavailable; preserve current continuity.';
		return 'N17 episode: Phase: ' + projection.phase + '; Trajectory: ' + projection.trajectory + '; Question: ' + projection.centralQuestion + '; Active threads: ' + (projection.activeThreadSummaries.join(' / ') || 'none') + '; Opportunity: ' + projection.narrativeOpportunity;
	}
}

