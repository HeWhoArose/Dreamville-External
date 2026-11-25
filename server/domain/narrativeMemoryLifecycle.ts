import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import type { WorldRepository } from '../repositories/worldRepository';
import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { StructuredTurnPackage } from './aiOrchestrator';
import type { NarrativeReview } from './semanticNarrativeReview';
import type { StateAdjudicationResult } from './narrativeStateAdjudicator';
import { recordCanonicalNarrativeEvent, type CanonicalNarrativeEventRecord } from './canonicalNarrativeEvent';
import { NarrativeContinuityStateEngine } from './narrativeContinuityState';
import { NarrativeNoveltyEngine } from './narrativeNoveltyEngine';
import type { MemoryVisibility } from './memoryOpportunityEngine';
import { CharacterCanonSteward } from './characterCanonSteward';

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
	const known = new Set((situation.playerKnowledge?.knownFacts || []).map((fact) => lower(JSON.stringify(fact))));
	return (situation.worldFacts || [])
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
		situation.location?.name,
		...(situation.nearbyEntities || []).filter((entity) => entity.visibleToPlayer).map((entity) => entity.name),
		...(situation.visibleEvents || []).map((event) => event.summary),
		...(turnPackage.events || []),
		...(turnPackage.stateChanges || []).map((change) => String(change.targetId || '') + ' ' + String(change.kind || '')),
	].filter(Boolean).map(lower);
	return canonicalAnchors.some((anchor) => {
		const words = anchor.split(/[^a-z0-9]+/).filter((word) => word.length >= 5);
		return words.some((word) => lower(value).includes(word));
	});
}

function relatedEntities(candidate: string, situation: CurrentSituation): string[] {
	const value = lower(candidate);
	return (situation.nearbyEntities || [])
		.filter((entity) => entity.visibleToPlayer)
		.filter((entity) => {
			const name = lower(entity.name);
			return Boolean(name) && value.includes(name);
		})
		.map((entity) => entity.id)
		.slice(0, 6);
}

function deriveThreadCandidate(
	candidate: string,
	situation: CurrentSituation,
	turnId: string,
	timestamp: string,
): NarrativeOpenThreadRecord | undefined {
	const value = normalize(candidate);
	if (!value || !/\b(?:unresolved|pending|investigate|find|learn|discover|follow up|missing|unknown|rumou?r|rumor|threat|danger|question|ask|look for|still|await)\b/i.test(value)) {
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
		narrativePlan?: import('./narrativeDirector').EphemeralNarrativePlan;
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
		const memoryEngine = params.repository.getMemoryEngine(params.storyId);
		const playerActorId = params.currentSituation.player.actorId;
		const currentTurn = params.repository.getCanonicalCommandEventCount(params.storyId);

		// Deterministic turn-driven memory decay (DEF-CH9-02)
		memoryEngine.decayMemories({
			storyId: params.storyId,
			currentTurn,
			currentTimestamp: params.repository.getWorldClock(params.storyId).getTimestamp(),
		});

		const coLocatedWitnessIds = (params.currentSituation.nearbyEntities || [])
			.filter((e) => e.visibleToPlayer && e.id !== playerActorId)
			.map((e) => e.id);

		const isDialogueOrPublic = Boolean(
			params.playerIntent?.speechIntent ||
			params.playerIntent?.interactionMode === 'DIALOGUE' ||
			(params.turnPackage.dialogue && params.turnPackage.dialogue.length > 0) ||
			(params.turnPackage.events && params.turnPackage.events.length > 0)
		);

		const accessibleToEntityIds = isDialogueOrPublic
			? Array.from(new Set([playerActorId, ...coLocatedWitnessIds]))
			: [playerActorId];

		const visibility: MemoryVisibility = isDialogueOrPublic
			? (coLocatedWitnessIds.length > 0 ? 'SHARED' : 'PRIVATE')
			: 'PRIVATE';

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
			const thread = deriveThreadCandidate(value, params.currentSituation, params.turnId, timestamp);
			if (thread) threadMap.set(thread.id, thread);
			if (!isDurableCandidate(value, params.currentSituation, params.turnPackage)) continue;
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
			memoryEngine.storeMemory({
				id,
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
				visibility,
				accessibleToEntityIds,
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

			// Synchronize EntityCard.memoryRefs bounded by a 50-entry LRU window
			const registry = params.repository.getEntityRegistry(params.storyId);
			const entitiesToSync = Array.from(new Set([
				playerActorId,
				...entityIds,
				...(isDialogueOrPublic ? coLocatedWitnessIds : []),
			]));

			for (const entityId of entitiesToSync) {
				const card = registry.get(entityId);
				if (card) {
					const refs = Array.isArray(card.memoryRefs) ? card.memoryRefs : [];
					if (!refs.includes(id)) {
						card.memoryRefs = [...refs, id].slice(-50);
						registry.upsert(card);
					}
				}
			}
		}

		const resolvedThreadIds: string[] = [];
		const joinedNarration = params.turnPackage.narrative.join(' ').trim();
		const narrative = lower(joinedNarration);
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

		// Consolidate resolved threads from episodic into semantic memories
		for (const resolvedId of resolvedThreadIds) {
			const thread = threadMap.get(resolvedId);
			if (!thread) continue;
			const relatedMemories = memoryEngine.getAllMemories(params.storyId)
				.filter((m) => m.relatedThreadId === resolvedId && m.memoryClass === 'EPISODIC');

			if (relatedMemories.length >= 2) {
				const consolidatedId = deterministicId('consolidated_thread', params.storyId, resolvedId);
				if (!memoryEngine.getMemory(consolidatedId)) {
					memoryEngine.storeMemory({
						id: consolidatedId,
						storyId: params.storyId,
						memoryClass: 'SEMANTIC',
						subjectEntityId: playerActorId,
						relatedEntityIds: thread.relatedEntityIds,
						relatedLocationId: thread.relatedLocationId,
						relatedThreadId: resolvedId,
						content: `Resolved Investigation: ${thread.title}. Findings: ${thread.summary}`,
						importance: 75,
						confidence: 0.95,
						status: 'active',
						visibility: 'PRIVATE',
						accessibleToEntityIds: [playerActorId],
						isPersistentCritical: false,
						provenance: 'thread_resolution_consolidation',
						validFromTurn: currentTurn,
						lastRecalledTurn: currentTurn,
						createdAtTimestamp: params.repository.getWorldClock(params.storyId).getTimestamp(),
						lastRecalledTimestamp: params.repository.getWorldClock(params.storyId).getTimestamp(),
						triggerConditionTags: ['resolved_thread', ...thread.title.toLowerCase().split(/\W+/).filter((t: string) => t.length >= 4)],
					});
					for (const sourceMem of relatedMemories) {
						sourceMem.importance = Math.min(sourceMem.importance, 30);
						sourceMem.consolidatedIntoId = consolidatedId;
						memoryEngine.storeMemory(sourceMem);
					}
				}
			}
		}

		const updatedThreadIds = Array.from(threadMap.values()).filter((thread) => thread.status === 'OPEN').map((thread) => thread.id);
		runtime.openNarrativeThreads = Array.from(threadMap.values())
			.sort((a, b) => b.priority - a.priority || b.lastTouchedAt.localeCompare(a.lastTouchedAt))
			.slice(0, 40);
		runtime.openNarrativeThreads = runtime.openNarrativeThreads.filter((thread: NarrativeOpenThreadRecord) => thread.status === 'OPEN').slice(-40);

		const plot = { ...(runtime.plot || {}) } as Record<string, any>;
		// Only committed canonical consequences can create durable plot beats. AI-generated
		// prose/events remain presentation-layer claims and are intentionally excluded here.
		const canonicalBeatFacts = (params.stateAdjudication?.commitRecords || [])
			.map((record: any) => record.summary || (String(record.kind) + ' committed for ' + String(record.targetId)))
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

			// Persist plot beat as durable critical CAUSAL memory in MemoryOpportunityEngine
			const plotMemoryId = deterministicId('plot_beat_memory', params.storyId, plotBeatId);
			if (!memoryEngine.getMemory(plotMemoryId)) {
				memoryEngine.storeMemory({
					id: plotMemoryId,
					storyId: params.storyId,
					memoryClass: 'CAUSAL',
					subjectEntityId: playerActorId,
					relatedEntityIds: coLocatedWitnessIds,
					relatedLocationId: params.currentSituation.location.id,
					content: plotSummary,
					importance: 85,
					confidence: 1.0,
					status: 'active',
					visibility: coLocatedWitnessIds.length > 0 ? 'SHARED' : 'PRIVATE',
					accessibleToEntityIds: Array.from(new Set([playerActorId, ...coLocatedWitnessIds])),
					isPersistentCritical: true, // Floor protection against eviction
					provenance: 'canonical_plot_beat',
					sourceEventId: plotBeatId,
					validFromTurn: currentTurn,
					lastRecalledTurn: currentTurn,
					createdAtTimestamp: params.repository.getWorldClock(params.storyId).getTimestamp(),
					lastRecalledTimestamp: params.repository.getWorldClock(params.storyId).getTimestamp(),
					triggerConditionTags: [
						'plot_beat',
						...canonicalBeatFacts.flatMap((f: string) => f.toLowerCase().split(/\W+/).filter((w: string) => w.length >= 4)).slice(0, 8),
					],
				});
			}
		}
		plot.summary = plotSummary;
		plot.updatedAt = timestamp;
		plot.openThreads = runtime.openNarrativeThreads.map((thread: NarrativeOpenThreadRecord) => thread.title).slice(-24);
		runtime.plot = plot;

		// Record witnessed actions for living co-located entities
		if (params.stateAdjudication?.commitRecords && params.stateAdjudication.commitRecords.length > 0) {
			for (const record of params.stateAdjudication.commitRecords) {
				const factId = deterministicId('witness_fact', params.storyId, params.turnId, String(record.commandId || record.kind));
				CharacterCanonSteward.recordWitnessedAction({
					repository: params.repository,
					storyId: params.storyId,
					locationId: params.currentSituation.location.id,
					turnNumber: currentTurn + 1,
					timestamp,
					actorId: playerActorId,
					factId,
					predicate: record.kind,
					objectValue: record.targetId,
					summary: record.summary || `${record.kind} on ${record.targetId}`,
					excludedEntityIds: [playerActorId],
				});
			}
		}

		if (joinedNarration.length > 0 && memoryEligible) {
			const noveltyState = NarrativeNoveltyEngine.recordAcceptedTurn({
				repository: params.repository,
				storyId: params.storyId,
				narration: joinedNarration,
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
				narration: joinedNarration,
				plan: params.narrativePlan,
				review: params.narrativeReview,
			});

			// The lifecycle owns accepted-turn presentation state. Keep the local runtime
			// snapshot in sync before the final save so it cannot overwrite the just-persisted
			// N7/N4 updates with the stale pre-turn runtime object.
			runtime.narrativeNovelty = noveltyState;
			runtime.narrativeContinuity = continuityState;
		}

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

		return {
			promotedMemoryIds,
			updatedThreadIds,
			resolvedThreadIds,
			plotBeatId,
			plotSummary,
			contextHistoryRecorded: true,
		};
	}
}

export const narrativeMemoryLifecycle = NarrativeMemoryLifecycle;
