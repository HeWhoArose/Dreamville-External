import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { NarrativeReview } from './semanticNarrativeReview';
import type { EphemeralNarrativePlan } from './narrativeDirector';

export type NarrativeEmotionalTemperature = 'CALM' | 'STEADY' | 'UNEASY' | 'TENSE' | 'CRISIS';
export type NarrativeSceneMomentum = 'STALLING' | 'STEADY' | 'BUILDING' | 'ESCALATING' | 'RELEASING';
export type NarrativeRelationshipTrajectory = 'WARMING' | 'STRAINING' | 'HOSTILE' | 'FRIENDLY' | 'UNCERTAIN' | 'UNCHANGED';

export interface NarrativeContinuityControls {
	enabled: boolean;
	tensionDecayPerTurn: number;
	maxSubtextEntries: number;
	maxConversationalTensionEntries: number;
	maxRecentMotifs: number;
	maxRecentBeats: number;
	maxRecentResponseShapes: number;
	maxNarrativeFocusEntries: number;
}

export interface NarrativeRelationshipTrajectoryState {
	entityId: string;
	entityName: string;
	trajectory: NarrativeRelationshipTrajectory;
	source: 'CANONICAL_STANCE' | 'NARRATIVE_EVIDENCE';
}

export interface NarrativeContinuityState {
	version: 1;
	storyId: string;
	turnCount: number;
	sourceTurnId?: string;
	tension: number;
	emotionalTemperature: NarrativeEmotionalTemperature;
	sceneMomentum: NarrativeSceneMomentum;
	unresolvedSubtext: string[];
	activeConversationalTension: string[];
	relationshipTrajectories: NarrativeRelationshipTrajectoryState[];
	recentSensoryMotifs: string[];
	recentNarrativeBeats: string[];
	recentResponseShapes: string[];
	narrativeFocus: string[];
	updatedAt: string;
}

export const DEFAULT_NARRATIVE_CONTINUITY_CONTROLS: NarrativeContinuityControls = {
	enabled: true,
	tensionDecayPerTurn: 4,
	maxSubtextEntries: 6,
	maxConversationalTensionEntries: 6,
	maxRecentMotifs: 8,
	maxRecentBeats: 8,
	maxRecentResponseShapes: 8,
	maxNarrativeFocusEntries: 6,
};

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function clamp(value: number): number {
	return Math.max(0, Math.min(100, value));
}

function normalize(value: unknown): string {
	return String(value ?? '').trim();
}

function unique(values: string[], limit: number): string[] {
	return Array.from(new Set(values.map(normalize).filter(Boolean))).slice(-Math.max(1, limit));
}

function temperatureForTension(tension: number): NarrativeEmotionalTemperature {
	if (tension >= 85) return 'CRISIS';
	if (tension >= 65) return 'TENSE';
	if (tension >= 40) return 'UNEASY';
	if (tension >= 18) return 'STEADY';
	return 'CALM';
}

function momentumForTurn(intent: PlayerIntent, review?: NarrativeReview, plan?: EphemeralNarrativePlan, previous?: NarrativeContinuityState): NarrativeSceneMomentum {
	if (review?.decision === 'REJECT') return previous?.sceneMomentum || 'STALLING';
	if (intent.interactionMode === 'COMBAT') return 'ESCALATING';
	if (plan?.unresolvedThread) return 'BUILDING';
	if (intent.informationGoal) {
		const answered = Boolean(plan?.informationToReveal?.some((item) => item.requirement === 'REVEAL'));
		return answered ? 'RELEASING' : 'BUILDING';
	}
	if (intent.movementIntent || intent.observationIntent || intent.speechIntent) return 'STEADY';
	return previous?.sceneMomentum || 'STEADY';
}

function tensionDelta(intent: PlayerIntent, narration: string, plan?: EphemeralNarrativePlan): number {
	const text = narration.toLowerCase();
	let delta = 0;
	if (intent.interactionMode === 'COMBAT') delta += 12;
	if (intent.interactionMode === 'DIALOGUE') delta += 2;
	if (intent.informationGoal) delta += /(?:unknown|uncertain|mystery|rumor|rumour|cannot|can't|could not|no reliable|unanswered)/.test(text) ? 4 : -2;
	if (intent.movementIntent) delta -= 1;
	if (plan?.unresolvedThread) delta += 3;
	if (/(?:resolved|answered|confirmed|reassured|safe|calmed|relief)/.test(text)) delta -= 6;
	if (/(?:threat|danger|blood|attack|wound|alarm|urgent|panic|scream|chase)/.test(text)) delta += 6;
	return Math.max(-10, Math.min(15, delta));
}

function focusFrom(intent: PlayerIntent, situation: CurrentSituation, plan?: EphemeralNarrativePlan): string[] {
	return unique([
		intent.informationGoal || '',
		...((intent.explicitTargets || []).map((target) => target.name)),
		intent.locationTarget?.name || '',
		plan?.unresolvedThread || '',
		situation.location?.name || '',
	], 6);
}

function sensoryMotifsFrom(narration: string): string[] {
	const patterns = [
		'light', 'shadow', 'darkness', 'wind', 'rain', 'water', 'smoke', 'dust', 'metal',
		'stone', 'fire', 'heat', 'cold', 'sound', 'silence', 'echo', 'voice', 'scent', 'smell',
		'blood', 'glass', 'wood', 'fog', 'mist', 'thunder',
	];
	const lowerText = narration.toLowerCase();
	return patterns.filter((pattern) => lowerText.includes(pattern));
}

function responseShape(narration: string, intent: PlayerIntent): string {
	const paragraphs = narration.split(/\n\s*\n/).filter(Boolean).length;
	const hasDialogue = /["“”]/.test(narration);
	const shape = [
		intent.interactionMode.toLowerCase(),
		paragraphs <= 1 ? 'compact' : paragraphs <= 3 ? 'moderate' : 'expanded',
		hasDialogue ? 'dialogue' : 'narrative',
	].join(':');
	return shape;
}

function narrativeBeat(narration: string, intent: PlayerIntent): string {
	const compact = narration.replace(/\s+/g, ' ').trim();
	return (intent.action ? intent.action + ': ' : '') + compact.slice(0, 220);
}

function deriveSubtext(intent: PlayerIntent, plan?: EphemeralNarrativePlan): string[] {
	const values: string[] = [];
	if (intent.informationGoal) values.push('The player is still seeking: ' + intent.informationGoal);
	if (plan?.unresolvedThread) values.push('Unresolved thread remains active: ' + plan.unresolvedThread);
	if (intent.speechIntent && plan?.entitiesToReact?.length) values.push('The current exchange may carry unanswered conversational intent.');
	return values;
}

function deriveConversationalTension(intent: PlayerIntent, narration: string, plan?: EphemeralNarrativePlan): string[] {
	if (!intent.speechIntent && intent.interactionMode !== 'DIALOGUE') return [];
	const target = plan?.entitiesToReact?.[0]?.name;
	if (!target) return [];
	const text = narration.toLowerCase();
	if (/\?/.test(narration) || /\b(?:refused|hesitated|avoided|warned|doubted|disagreed|accused|threatened)\b/.test(text)) {
		return ['Conversation with ' + target + ' contains unresolved tension or a withheld answer.'];
	}
	return ['Conversation with ' + target + ' remains active.'];
}

export class NarrativeContinuityStateEngine {
	public static readonly NAMESPACE = 'runtimeState.narrativeContinuity';

	public static resolve(repository: { getStoryRun(storyId: string): any; getWorldClock(storyId: string): { getTimestamp(): any } }, storyId: string, controls: Partial<NarrativeContinuityControls> = {}): NarrativeContinuityState {
		const effective = { ...DEFAULT_NARRATIVE_CONTINUITY_CONTROLS, ...controls };
		const run = repository.getStoryRun(storyId);
		const persisted = run?.runtimeState?.narrativeContinuity;
		const base: NarrativeContinuityState = persisted && typeof persisted === 'object'
			? { ...this.defaultState(storyId), ...clone(persisted) }
			: this.defaultState(storyId);
		if (!effective.enabled) return base;
		const decayed = Math.max(0, Number(base.tension || 0) - Math.max(0, effective.tensionDecayPerTurn));
		return {
			...base,
			tension: decayed,
			emotionalTemperature: temperatureForTension(decayed),
			updatedAt: repository.getWorldClock(storyId).getTimestamp().toISOString(),
		};
	}

	public static recordAcceptedTurn(params: {
		repository: { getStoryRun(storyId: string): any; saveStoryRun(run: any): void; getWorldClock(storyId: string): { getTimestamp(): any }; getDynamicCharacterAgencyEngine?: (storyId: string) => any };
		storyId: string;
		turnId: string;
		situation: CurrentSituation;
		intent: PlayerIntent;
		narration: string;
		plan?: EphemeralNarrativePlan;
		review?: NarrativeReview;
		controls?: Partial<NarrativeContinuityControls>;
	}): NarrativeContinuityState {
		const effective = { ...DEFAULT_NARRATIVE_CONTINUITY_CONTROLS, ...(params.controls || {}) };
		const previous = this.resolve(params.repository, params.storyId, effective);
		if (!effective.enabled) return previous;
		const narration = normalize(params.narration);
		const tension = clamp(previous.tension + tensionDelta(params.intent, narration, params.plan));
		const timestamp = params.repository.getWorldClock(params.storyId).getTimestamp().toISOString();
		const state: NarrativeContinuityState = {
			version: 1,
			storyId: params.storyId,
			turnCount: previous.turnCount + 1,
			sourceTurnId: params.turnId,
			tension,
			emotionalTemperature: temperatureForTension(tension),
			sceneMomentum: momentumForTurn(params.intent, params.review, params.plan, previous),
			unresolvedSubtext: unique([
				...previous.unresolvedSubtext,
				...deriveSubtext(params.intent, params.plan),
			], effective.maxSubtextEntries),
			activeConversationalTension: unique([
				...deriveConversationalTension(params.intent, narration, params.plan),
			], effective.maxConversationalTensionEntries),
			relationshipTrajectories: params.situation.nearbyEntities
				.filter((entity) => entity.visibleToPlayer && params.intent.explicitTargets.some((target) => target.id === entity.id))
				.slice(0, 6)
				.map((entity) => {
					const relation = params.repository.getDynamicCharacterAgencyEngine?.(params.storyId)?.getRelationship(params.storyId, params.situation.player.actorId, entity.id);
					const stance = String(relation?.stance || '').toUpperCase();
					const trajectory: NarrativeRelationshipTrajectory = stance === 'FRIENDLY' ? 'FRIENDLY' : stance === 'HOSTILE' ? 'HOSTILE' : stance === 'WARMING' ? 'WARMING' : stance === 'STRAINING' ? 'STRAINING' : 'UNCHANGED';
					return { entityId: entity.id, entityName: entity.name, trajectory, source: 'CANONICAL_STANCE' as const };
				}),
			recentSensoryMotifs: unique([...previous.recentSensoryMotifs, ...sensoryMotifsFrom(narration)], effective.maxRecentMotifs),
			recentNarrativeBeats: unique([...previous.recentNarrativeBeats, narrativeBeat(narration, params.intent)], effective.maxRecentBeats),
			recentResponseShapes: unique([...previous.recentResponseShapes, responseShape(narration, params.intent)], effective.maxRecentResponseShapes),
			narrativeFocus: focusFrom(params.intent, params.situation, params.plan).slice(-effective.maxNarrativeFocusEntries),
			updatedAt: timestamp,
		};
		const run = params.repository.getStoryRun(params.storyId);
		if (run) {
			run.runtimeState = { ...(run.runtimeState || {}), narrativeContinuity: state };
			params.repository.saveStoryRun(run);
		}
		return state;
	}

	public static toPromptContext(state: NarrativeContinuityState): string {
		return [
			'NARRATIVE CONTINUITY STATE v' + state.version,
			'Emotional temperature: ' + state.emotionalTemperature,
			'Scene tension: ' + state.tension + '/100',
			'Scene momentum: ' + state.sceneMomentum,
			state.narrativeFocus.length ? 'Narrative focus: ' + state.narrativeFocus.join('; ') : '',
			state.unresolvedSubtext.length ? 'Unresolved subtext: ' + state.unresolvedSubtext.join(' | ') : '',
			state.activeConversationalTension.length ? 'Active conversational tension: ' + state.activeConversationalTension.join(' | ') : '',
			state.relationshipTrajectories.length ? 'Relationship trajectories: ' + state.relationshipTrajectories.map((item) => item.entityName + '=' + item.trajectory).join('; ') : '',
			state.recentSensoryMotifs.length ? 'Recent sensory motifs: ' + state.recentSensoryMotifs.join(', ') : '',
			state.recentResponseShapes.length ? 'Recent response shapes: ' + state.recentResponseShapes.join(', ') : '',
			state.recentNarrativeBeats.length ? 'Recent narrative beats: ' + state.recentNarrativeBeats.slice(-4).join(' | ') : '',
			'Use continuity as presentation guidance, not as canonical mechanics. Do not force a scene change merely to satisfy continuity state.',
		].filter(Boolean).join('\n');
	}

	public static compactPromptContext(state: NarrativeContinuityState): string {
		return 'N4 continuity: temperature=' + state.emotionalTemperature + '; tension=' + state.tension + '; momentum=' + state.sceneMomentum + '; focus=' + (state.narrativeFocus.join(', ') || 'none') + '; subtext=' + (state.unresolvedSubtext.join(' / ') || 'none') + '; preserve continuity without overriding canonical truth.';
	}

	public static defaultState(storyId: string): NarrativeContinuityState {
		return {
			version: 1,
			storyId,
			turnCount: 0,
			tension: 0,
			emotionalTemperature: 'CALM',
			sceneMomentum: 'STEADY',
			unresolvedSubtext: [],
			activeConversationalTension: [],
			relationshipTrajectories: [],
			recentSensoryMotifs: [],
			recentNarrativeBeats: [],
			recentResponseShapes: [],
			narrativeFocus: [],
			updatedAt: new Date(0).toISOString(),
		};
	}
}
