import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import type { WorldRepository } from '../repositories/worldRepository';
import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { StructuredTurnPackage } from './aiOrchestrator';
import type { NarrativeReview } from './semanticNarrativeReview';
import type { StateAdjudicationResult } from './narrativeStateAdjudicator';
import { recordCanonicalNarrativeEvent, type CanonicalNarrativeEventRecord } from './canonicalNarrativeEvent';
import { synthesizeNpcReflections } from './npcReflectionEngine';
import { NarrativeContinuityStateEngine } from './narrativeContinuityState';
import { NarrativeNoveltyEngine } from './narrativeNoveltyEngine';

export interface NarrativeOpenThreadRecord {
	id: string;
	title: string;
	summary: string;
	sourceTurnId: string;
	relatedEntityIds: string[];
	relatedLocationId?: string;
	status: 'OPEN' | 'RESOLVED' | 'STALE';
	priority: number;
	lastTouchedAt: string;
}

export interface NarrativeMemoryLifecycleResult {
	promotedMemoryIds: string[];
	updatedThreadIds: string[];
	resolvedThreadIds: string[];
	plotBeatId?: string;
	plotSummary: string;
	contextHistoryRecorded: boolean;
	/** Phase C (GAP-3): ids of NPC reflection inferences synthesized this turn. */
	npcReflectionIds?: string[];
}

function normalize(value: unknown): string {
	return String(value ?? '').trim();
}

function lower(value: unknown): string {
	return normalize(value).toLowerCase();
}

function isDecorative(candidate: string): boolean {
	return /\b(?:beautiful|glorious|stunning|lovely|golden|orange|majestic|breathtaking|poetic|serene|atmospheric|cinematic|dramatic light)\b/i.test(candidate) &&
		! /\b(?:learned|discovered|heard|saw|found|met|told|revealed|confirmed|injured|attacked|opened|closed|moved|arrived|left|obtained|lost)\b/i.test(candidate);
}

function containsUnauthorizedWorldFact(candidate: string, situation: CurrentSituation): boolean {
	const value = lower(candidate);
	const known = new Set(situation.playerKnowledge.knownFacts.map((fact) => lower(JSON.stringify(fact))));
	return situation.worldFacts
		.filter((fact) => !known.has(lower(JSON.stringify(fact))))
		.some((fact) => {
			const anchors = [fact.subjectEntityId, fact.predicate, fact.objectValue]
				.map(lower)
				.filter((anchor) => anchor.length >= 8);
			return anchors.some((anchor) => value.includes(anchor));
		});
}

function isDurableCandidate(candidate: string, situation: CurrentSituation, turnPackage: StructuredTurnPackage): boolean {
	const value = normalize(candidate);
	if (value.length < 12 || value.length > 900 || isDecorative(value)) return false;
	if (containsUnauthorizedWorldFact(value, situation)) return false;
	const canonicalAnchors = [
		situation.location.name,
		...situation.nearbyEntities.filter((entity) => entity.visibleToPlayer).map((entity) => entity.name),
		...situation.visibleEvents.map((event) => event.summary),
		...turnPackage.events,
		...turnPackage.stateChanges.map((change) => String(change.targetId || '') + ' ' + String(change.kind || '')),
	].filter(Boolean).map(lower);
	return canonicalAnchors.some((anchor) => {
		const words = anchor.split(/[^a-z0-9]+/).filter((word) => word.length >= 5);
		return words.some((word) => lower(value).includes(word));
	});
}

function relatedEntities(candidate: string, situation: CurrentSituation): string[] {
	const value = lower(candidate);
	return situation.nearbyEntities
		.filter((entity) => entity.visibleToPlayer)
		.filter((entity) => {
			const name = lower(entity.name);
			return Boolean(name) && value.includes(name);
		})
		.map((entity) => entity.id)
		.slice(0, 6);
}

/**
 * Phase C (GAP-5 / S-5) — thread detection was vocabulary-gated: a thread phrased as
 * "The mirror shard pulses" could never become OPEN because it lacked a magic word.
 * The vocabulary is now a *modifier* signal rather than the only gate: a candidate
 * also qualifies when it carries an NPC attitude verb (pursue/seek/await/verify/...)
 * that targets a canonically anchored entity or place. Explicit thread/promise/quest
 * commit kinds from the state adjudication are honoured outright.
 */
const THREAD_INTENT_MODIFIER_PATTERN =
	/\b(?:unresolved|pending|investigate|find|learn|discover|follow up|missing|unknown|rumou?r|rumor|threat|danger|question|ask|look for|still|await)\b/i;

const THREAD_ATTITUDE_VERB_PATTERN =
	/\b(?:pursue|pursues|pursuing|seek|seeks|seeking|awaits?|awaiting|verif(?:y|ies|ying)|track(?:s|ing)?|hunts?|hunted|hunting|protect(?:s|ing)?|guards?(?:ing|ed)?|aveng(?:e|es|ing|ed)|warn(?:s|ed|ing)?|recover(?:s|ing|ed)?|retriev(?:e|es|ing|ed)|owe(?:s|d)?|swore|swear|vow(?:s|ed)?|promis(?:e|es|ed|ing)|intend(?:s|ed)?|plan(?:s|ned|ning)?|debt|obligat(?:e|ed|ion)|vow)\b/i;

// Phase ABCD system audit (C-FIND-5): the adjudicator only ever emits the eight
// canonical StateChangeProposal kinds (INVENTORY, CAPABILITY, LOCATION, COMBAT,
// CHRONICLE, PHYSIOLOGY, HEALTH, ALIGNMENT), so a pattern limited to
// THREAD/PROMISE/QUEST/GOAL/OBLIGATION/CONTRACT could never fire in production —
// the explicit-commit branch below was dead. CHRONICLE is the one committed kind
// that denotes a recorded narrative commitment, so it is the reachable signal;
// the narrative-only kinds are retained for forward compatibility.
const THREAD_COMMIT_KIND_PATTERN = /(?:THREAD|PROMISE|QUEST|GOAL|OBLIGATION|CONTRACT|CHRONICLE)/i;

function hasCanonicalAnchorForThread(value: string, situation: CurrentSituation): boolean {
	const anchors = [
		situation.location?.name,
		...(situation.nearbyEntities || []).filter((entity) => entity.visibleToPlayer).map((entity) => entity.name),
		...(situation.visibleEvents || []).map((event) => event.summary),
	].filter(Boolean).map((entry) => String(entry).toLowerCase());
	const lowered = value.toLowerCase();
	return anchors.some((anchor) => {
		if (lowered.includes(anchor)) return true;
		const words = anchor.split(/[^a-z0-9]+/).filter((word) => word.length >= 5);
		return words.some((word) => lowered.includes(word));
	});
}

function deriveThreadCandidate(
	candidate: string,
	situation: CurrentSituation,
	turnId: string,
	timestamp: string,
	explicitThreadFlag = false,
): NarrativeOpenThreadRecord | undefined {
	const value = normalize(candidate);
	if (!value) return undefined;
	const modifierMatch = THREAD_INTENT_MODIFIER_PATTERN.test(value);
	const attitudeWithAnchor = THREAD_ATTITUDE_VERB_PATTERN.test(value) && hasCanonicalAnchorForThread(value, situation);
	if (!modifierMatch && !attitudeWithAnchor && !explicitThreadFlag) {
		return undefined;
	}
	const related = relatedEntities(value, situation);
	const id = deterministicId('narrative_thread', situation.storyId, value);
	return {
		id,
		title: value.slice(0, 180),
		summary: value.slice(0, 500),
		sourceTurnId: turnId,
		relatedEntityIds: related,
		relatedLocationId: situation.location.id,
		status: 'OPEN',
		priority: related.length > 0 ? 80 : 65,
		lastTouchedAt: timestamp,
	};
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

export class NarrativeMemoryLifecycle {
	public static processTurn(params: {
		repository: WorldRepository;
		storyId: string;
		turnId: string;
		playerAction?: string;
		playerIntent?: PlayerIntent;
		currentSituation: CurrentSituation;
		turnPackage: StructuredTurnPackage;
		narrativeReview?: NarrativeReview;
		stateAdjudication?: StateAdjudicationResult;
	}): NarrativeMemoryLifecycleResult {
		const run = params.repository.getStoryRun(params.storyId);
		if (!run) {
			return { promotedMemoryIds: [], updatedThreadIds: [], resolvedThreadIds: [], plotSummary: '', contextHistoryRecorded: false };
		}
		const timestamp = formatCanonicalTimestamp(params.repository.getWorldClock(params.storyId).getTimestamp());
		const runtime = { ...(run.runtimeState || {}) } as Record<string, any>;
		const threadMap = new Map<string, NarrativeOpenThreadRecord>(
			(Array.isArray(runtime.openNarrativeThreads) ? runtime.openNarrativeThreads : [])
				.map((thread: NarrativeOpenThreadRecord) => [thread.id, clone(thread)]),
		);

		const promotedMemoryIds: string[] = [];
		const memoryEligible = !params.narrativeReview || params.narrativeReview.decision === 'ACCEPT';
		// S-5: an explicit thread/promise/quest commitment is authoritative for OPEN threads
		// even when the candidate text carries none of the intent vocabulary.
		const explicitThreadFlag = (params.stateAdjudication?.commitRecords || [])
			.some((record) => THREAD_COMMIT_KIND_PATTERN.test(String(record?.kind || '')));
		const memoryEngine = params.repository.getMemoryEngine(params.storyId);
		const playerActorId = params.currentSituation.player.actorId;
		const currentTurn = params.repository.getCanonicalCommandEventCount(params.storyId);
		// Reverse-lookup of a single turn's event only needs the recent tail.
		const canonicalEvents = params.repository.getRecentCanonicalCommandEvents(params.storyId, 12);
		const canonicalEvent = [...canonicalEvents].reverse().find((event) =>
			event.commandId === params.turnId ||
			event.eventId === params.turnId ||
			String(event.commandId || '').includes(params.turnId),
		);
		const canonicalNarrativeEvent: CanonicalNarrativeEventRecord | undefined = canonicalEvent
			? recordCanonicalNarrativeEvent(params.repository, {
				storyId: params.storyId,
				turnId: params.turnId,
				canonicalEventId: canonicalEvent.eventId,
				commandId: canonicalEvent.commandId,
				summary: canonicalEvent.summary,
				mutationPaths: canonicalEvent.mutationPaths,
			})
			: undefined;
		for (const candidate of (memoryEligible ? (params.turnPackage.memoryCandidates || []) : [])) {
			const value = normalize(candidate);
			if (!value) continue;
			// S-5: an explicit commitment only widens detection for a *durable* candidate, so a
			// PROMISE commit cannot turn every incidental observation of that turn into a thread.
			const durable = isDurableCandidate(value, params.currentSituation, params.turnPackage);
			const thread = deriveThreadCandidate(value, params.currentSituation, params.turnId, timestamp, explicitThreadFlag && durable);
			if (thread) threadMap.set(thread.id, thread);
			if (!durable) continue;
			const id = deterministicId('narrative_memory', params.storyId, value);
			if (memoryEngine.getMemory(id)) {
				memoryEngine.retrieveMemories({
					storyId: params.storyId,
					viewerActorId: playerActorId,
					queryKeywords: value.toLowerCase().split(/\W+/).filter((token) => token.length >= 4).slice(0, 8),
					currentTurn,
					maxResults: 1,
				});
				continue;
			}
			const entityIds = relatedEntities(value, params.currentSituation);
			memoryEngine.storeMemory({				id,
				storyId: params.storyId,
				memoryClass: 'EPISODIC',
				subjectEntityId: playerActorId,
				relatedEntityIds: entityIds,
				relatedLocationId: params.currentSituation.location.id,
				relatedThreadId: thread?.id,
				content: value,
				importance: thread ? 70 : 55,
				confidence: params.narrativeReview?.decision === 'ACCEPT' ? 0.85 : 0.65,
				status: 'active',
				visibility: 'PRIVATE',
				accessibleToEntityIds: [playerActorId],
				isPersistentCritical: false,
				provenance: 'narrative_memory_lifecycle',
				perspective: 'SUBJECTIVE',
				sourceEventId: canonicalNarrativeEvent?.id,
				validFromTurn: currentTurn,
				lastRecalledTurn: currentTurn,
				createdAtTimestamp: params.repository.getWorldClock(params.storyId).getTimestamp(),
				lastRecalledTimestamp: params.repository.getWorldClock(params.storyId).getTimestamp(),
				triggerConditionTags: ['narrative_memory', ...value.toLowerCase().split(/\W+/).filter((token) => token.length >= 4).slice(0, 8)],
			});
			promotedMemoryIds.push(id);
		}

		const resolvedThreadIds: string[] = [];
		const narrative = lower(params.turnPackage.narrative.join(' '));
		for (const thread of threadMap.values()) {
			if (thread.status !== 'OPEN') continue;
			const titleTokens = thread.title.toLowerCase().split(/\W+/).filter((token) => token.length >= 5).slice(0, 8);
			const matched = titleTokens.filter((token) => narrative.includes(token)).length;
			const negativeResolution = /\b(?:not|never|still|cannot|could not|couldn't|has not|hasn't|have not|haven't|no longer)\s+(?:resolved|settled|answered|confirmed|found|completed|finished|closed)\b/i.test(narrative);
			const positiveResolution = /\b(?:resolved|settled|answered|confirmed|found|completed|finished|closed|was resolved|has been resolved)\b/i.test(narrative);
			if (matched >= Math.min(2, titleTokens.length) && positiveResolution && !negativeResolution) {
				thread.status = 'RESOLVED';
				thread.lastTouchedAt = timestamp;
				resolvedThreadIds.push(thread.id);
			}
		}

		const updatedThreadIds = Array.from(threadMap.values()).filter((thread) => thread.status === 'OPEN').map((thread) => thread.id);
		// S-6: rank OPEN threads by priority then last-touched, *before* capping. The
		// previous sort-then-filter order could cap out OPEN threads in favour of
		// already-RESOLVED ones, and the trailing slice(-40) re-selected the
		// lowest-priority tail of a descending sort.
		runtime.openNarrativeThreads = Array.from(threadMap.values())
			.filter((thread: NarrativeOpenThreadRecord) => thread.status === 'OPEN')
			.sort((a, b) =>
				b.priority - a.priority ||
				String(b.lastTouchedAt).localeCompare(String(a.lastTouchedAt)) ||
				String(a.id).localeCompare(String(b.id)),
			)
			.slice(0, 40);

		const plot = { ...(runtime.plot || {}) } as Record<string, any>;
		// Only committed canonical consequences can create durable plot beats. AI-generated
		// prose/events remain presentation-layer claims and are intentionally excluded here.
		const canonicalBeatFacts = (params.stateAdjudication?.commitRecords || [])
			.map((record) => String(record.kind) + ' committed for ' + String(record.targetId))
			.filter(Boolean)
			.slice(-6);
		const factualBeatParts = canonicalBeatFacts;
		const plotSummary = factualBeatParts.length > 0
			? factualBeatParts.join('; ').slice(0, 900)
			: (normalize(plot.summary) || 'No new canonical development.');
		let plotBeatId: string | undefined;
		if (factualBeatParts.length > 0) {
			plotBeatId = deterministicId('plot_beat', params.storyId, params.turnId, plotSummary);
			const beats = Array.isArray(plot.beats) ? [...plot.beats] : [];
			if (!beats.some((beat: any) => beat?.id === plotBeatId)) {
				beats.push({ id: plotBeatId, turnId: params.turnId, text: plotSummary, tags: canonicalBeatFacts.slice(0, 8), timestamp });
			}
			plot.beats = beats.slice(-40);
		}
		plot.summary = plotSummary;
		plot.updatedAt = timestamp;
		plot.openThreads = runtime.openNarrativeThreads.map((thread: NarrativeOpenThreadRecord) => thread.title).slice(-24);
		runtime.plot = plot;

		const noveltyState = NarrativeNoveltyEngine.recordAcceptedTurn({
			repository: params.repository,
			storyId: params.storyId,
			narration: params.turnPackage.narrative.join(' '),
			turnNumber: currentTurn + 1,
		});

		const continuityState = NarrativeContinuityStateEngine.recordAcceptedTurn({
			repository: params.repository,
			storyId: params.storyId,
			turnId: params.turnId,
			situation: params.currentSituation,
			intent: params.playerIntent || {
				action: 'continue',
				interactionMode: 'OTHER',
				speechIntent: false,
				movementIntent: false,
				observationIntent: false,
				explicitTargets: [],
				impliedTargets: [],
				confidence: 0,
				source: 'DETERMINISTIC',
				originalText: params.playerAction || '',
			},
			narration: params.turnPackage.narrative.join(' '),
			plan: undefined,
			review: params.narrativeReview,
		});

		// The lifecycle owns accepted-turn presentation state. Keep the local runtime
		// snapshot in sync before the final save so it cannot overwrite the just-persisted
		// N7/N4 updates with the stale pre-turn runtime object.
		runtime.narrativeNovelty = noveltyState;
		runtime.narrativeContinuity = continuityState;

		const history = Array.isArray(runtime.narrativeContextHistory) ? [...runtime.narrativeContextHistory] : [];
		history.push({
			turnId: params.turnId,
			turnNumber: currentTurn + 1,
			playerAction: params.playerAction,
			narration: params.turnPackage.narrative.join(' '),
			worldTime: timestamp,
			locationId: params.currentSituation.location.id,
			stateChanges: params.stateAdjudication?.commitRecords?.map((record) => record.kind + ':' + record.targetId) || [],
			unresolvedConsequence: runtime.openNarrativeThreads?.[0]?.summary,
			isOpeningScene: false,
		});
		runtime.narrativeContextHistory = history.slice(-40);
		run.runtimeState = runtime;
		params.repository.saveStoryRun(run);

		// Phase C (GAP-3 / S-3): consolidate each NPC's viewer-related memories into at
		// most one tagged inference. Deliberately after the canonical save: the agency
		// engine persists through its own mutation listener, and the stale `runtime`
		// snapshot above would otherwise revert the new reflections.
		let npcReflectionIds: string[] = [];
		try {
			npcReflectionIds = synthesizeNpcReflections({
				repository: params.repository,
				storyId: params.storyId,
				viewerActorId: playerActorId,
			}).reflectionIds;
		} catch {
			npcReflectionIds = [];
		}

		return {
			promotedMemoryIds,
			updatedThreadIds,
			resolvedThreadIds,
			plotBeatId,
			plotSummary,
			contextHistoryRecorded: true,
			npcReflectionIds,
		};
	}
}

export const narrativeMemoryLifecycle = NarrativeMemoryLifecycle;
