import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import { WorldActivityDirector } from './worldActivityDirector';
import type { DurableMemory } from './memoryOpportunityEngine';
import type { EntityCard, EntityKind } from './entityCard';
import type { KnowledgeFact, RouteEdge, WorldTimestamp, LocationSceneObject } from './types';
import type { WorldRepository } from '../repositories/worldRepository';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { LocalSpatialState } from './playerLifecycleState';


export interface CurrentLocationContext {
	id: string;
	name: string;
	regionId: string;
	description: string;
	ambientSensory?: string;
	accessible: boolean;
	discovered: boolean;
	parentLocationId?: string | null;
	connectedLocations: Array<{
		id: string;
		name: string;
		regionId: string;
		discovered: boolean;
		accessible: boolean;
		routeId: string;
		distanceKm: number;
		terrain: string;
		allowedModes: string[];
		isBlocked: boolean;
		blockReason?: string;
	}>;
}

export type EntityDistanceBand = 'SAME_LOCATION' | 'NEAR' | 'ADJACENT' | 'CONTACT' | 'REFERRED';

export interface NearbyEntityContext {
	id: string;
	name: string;
	kind: EntityKind | string;
	locationId?: string;
	presence: 'present' | 'absent' | 'unknown';
	isAlive: boolean;
	currentActivity?: string;
	role?: string;
	factionIds?: string[];
	distanceBand: EntityDistanceBand;
	importance: number;
	explicitlyReferenced: boolean;
	visibleToPlayer: boolean;
}

export interface SceneObjectContext {
	id: string;
	name: string;
	kind: LocationSceneObject['kind'];
	description?: string;
	visibleToPlayer: boolean;
	interactable: boolean;
	tags: string[];
	properties: Record<string, unknown>;
	source: 'LOCATION_SCENE_OBJECT' | 'GROUND_ITEM';
}

export interface VisibleEventContext {
	id: string;
	type: string;
	summary: string;
	turnNumber?: number;
	timestamp?: string;
	locationId?: string;
	source?: string;
}

export interface ActiveDialogueContext {
	nodeId?: string;
	speakerId: string;
	speakerName: string;
	text: string;
	epistemicNote?: string;
}

export interface RecentTurnContext {
	turnId: string;
	turnNumber?: number;
	playerAction?: string;
	narration?: string;
	worldTime?: string;
	locationId?: string;
	stateChanges: string[];
	unresolvedConsequence?: string;
	isOpeningScene: boolean;
}

export interface PlotContext {
	currentArc: string;
	summary: string;
	recentBeats: Array<{
		id: string;
		turnId?: string;
		text: string;
		tags: string[];
		timestamp: string;
	}>;
}

export interface OpenThread {
	id: string;
	title: string;
	relatedEntityIds?: string[];
	summary?: string;
	status?: string;
	priority?: string | number;
	lastUpdatedAt?: string;
}

export interface RelevantMemory {
	id: string;
	content: string;
	memoryClass: string;
	importance: number;
	confidence: number;
	status: string;
	subjectEntityId: string;
	relatedEntityIds: string[];
	sourceEventId?: string;
	provenance: string;
}

export interface RelevantLore {
	id: string;
	subjectEntityId: string;
	predicate: string;
	objectValue: string;
	sourceType: string;
	confidence: number;
	scope: string;
	provenanceSummary: string;
}

export interface KnowledgeBoundary {
	viewerActorId: string;
	knownFacts: RelevantLore[];
	/** Fact IDs authorized for this viewer, independent of current-turn retrieval relevance. */
	authorizedFactIds: string[];
	note: string;
}

export interface AuthoritativeFact {
	id: string;
	subjectEntityId: string;
	predicate: string;
	objectValue: string;
	sourceType?: string;
	confidence?: number;
	secretLevel?: string;
	scope?: string;
	provenanceSummary?: string;
}

export interface ActiveCondition {
	id: string;
	label: string;
	source?: string;
	targetId?: string;
	severity?: number;
	expiresAt?: string | number | null;
}

export interface InteractionContext {
	id: string;
	type: 'MOVE' | 'TALK' | 'INSPECT' | 'INTERACT';
	label: string;
	targetId?: string;
	targetName?: string;
	enabled: boolean;
	reason?: string;
}

export interface CurrentSituation {
	storyId: string;
	turnId: string;
	worldId: string;
	worldTime: string;
	worldTimestamp: WorldTimestamp;
	player: {
		actorId: string;
		name: string;
		locationId: string;
		currentActivity: string;
		isTraveling: boolean;
		isDead: boolean;
		isTransformed: boolean;
		isPossessed: boolean;
		injuries: string[];
		spatial: LocalSpatialState;
	};
	location: CurrentLocationContext;
	nearbyEntities: NearbyEntityContext[];
	sceneObjects: SceneObjectContext[];
	/**
	 * Canonical, player-visible evidence categories. Narration may describe these
	 * categories, but may not manufacture new concrete scene facts from prose.
	 */
	sceneEvidence: {
		objects: SceneObjectContext[];
		entities: NearbyEntityContext[];
		events: VisibleEventContext[];
		sensory: string[];
		structures: string[];
		occupancy: {
			status: 'INHABITED' | 'RESTRICTED' | 'ABANDONED' | 'UNKNOWN';
			expectedPopulation?: 'NONE' | 'SPARSE' | 'MODERATE' | 'DENSE' | 'VARIABLE';
			explanation?: string;
			accessControlled: boolean;
			provenance: 'AUTHORED' | 'GENERATED' | 'SIMULATED' | 'UNKNOWN';
		};
	};
	visibleEvents: VisibleEventContext[];
	activeDialogue?: ActiveDialogueContext;
	recentTurns: RecentTurnContext[];
	currentAction?: PlayerIntent;
	plot: PlotContext;
	openThreads: OpenThread[];
	relevantMemories: RelevantMemory[];
	relevantLore: RelevantLore[];
	playerKnowledge: KnowledgeBoundary;
	worldFacts: AuthoritativeFact[];
	activeConditions: ActiveCondition[];
	availableInteractions: InteractionContext[];
}

export interface BuildCurrentSituationParams {
	storyId: string;
	turnId?: string;
	viewerActorId?: string;
	playerAction?: string;
	currentAction?: PlayerIntent;
	worldRepo?: WorldRepository;
	maxRecentTurns?: number;
	maxNearbyEntities?: number;
}

function clone<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function normalizeText(value: unknown): string {
	return String(value ?? '').trim();
}

function tokenize(value: unknown): string[] {
	return Array.from(
		new Set(
			normalizeText(value)
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter((token) => token.length >= 4),
		),
	);
}

function safeNumber(value: unknown, fallback = 0): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function eventText(event: any): string {
	return normalizeText(
		event?.summary ||
		event?.description ||
		event?.narrativeResponse ||
		event?.message ||
		event?.payload?.actionText ||
		event?.payload?.action ||
		event?.type ||
		'',
	);
}

function eventTurnNumber(event: any, index: number): number | undefined {
	const value = event?.turnNumber ?? event?.turn ?? event?.sequence ?? event?.ordinal;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : index + 1;
}

function normalizeThread(raw: any, index: number): OpenThread | null {
	if (!raw || typeof raw !== 'object') return null;
	const id = normalizeText(raw.threadId || raw.id || raw.key || `thread_${index + 1}`);
	const title = normalizeText(raw.title || raw.name || raw.summary || raw.description || id);
	if (!title) return null;
	return {
		id,
		title,
		relatedEntityIds: Array.isArray(raw.relatedEntityIds) ? raw.relatedEntityIds.map(normalizeText).filter(Boolean).slice(0, 8) : undefined,
		summary: normalizeText(raw.summary || raw.description || raw.details || '') || undefined,
		status: normalizeText(raw.status || raw.state || '') || undefined,
		priority: raw.priority ?? raw.importance ?? undefined,
		lastUpdatedAt: normalizeText(raw.updatedAt || raw.lastUpdatedAt || raw.timestamp || '') || undefined,
	};
}

function entityCardIsVisible(
  card: EntityCard,
  currentLocationId: string,
  playerAction: string,
  viewerActorId: string,
  repository: WorldRepository,
  localSpatialState?: LocalSpatialState,
): { visible: boolean; explicitlyReferenced: boolean; distanceBand: EntityDistanceBand } {
	const text = playerAction.toLowerCase();
	const names = [card.name, ...(card.identity?.aliases || [])]
		.map((value) => normalizeText(value).toLowerCase())
		.filter((value) => value.length >= 3);
	const explicitlyReferenced = names.some((name) => text.includes(name));
	const sameLocation = card.worldState?.locationId === currentLocationId;
	const localFocus = localSpatialState?.focusEntityId === card.id;
	const localDistanceBand = localSpatialState?.proximityBand;
	const projectedLocalBand: EntityDistanceBand =
		localFocus && localDistanceBand === 'CONTACT' ? 'CONTACT' :
		localFocus && localDistanceBand === 'ADJACENT' ? 'ADJACENT' :
		localFocus && localDistanceBand === 'NEAR' ? 'NEAR' :
		'SAME_LOCATION';
	const lifecycleStatus = normalizeText(card.lifecycle?.status).toUpperCase();
	const hidden = Boolean(
		card.metadata?.hidden === true ||
		card.metadata?.isHidden === true ||
		String(card.metadata?.visibility || '').toUpperCase() === 'HIDDEN',
	);
	if (hidden) return { visible: false, explicitlyReferenced, distanceBand: 'REFERRED' };
	if (card.isTemplate || lifecycleStatus === 'ARCHIVED' || lifecycleStatus === 'TEMPLATE') {
		return { visible: false, explicitlyReferenced, distanceBand: sameLocation ? 'SAME_LOCATION' : 'REFERRED' };
	}
	if (sameLocation) return { visible: true, explicitlyReferenced, distanceBand: projectedLocalBand };
	if (explicitlyReferenced && repository.isEntityEpistemicallyKnown(
		card.storyId,
		viewerActorId,
		card.id,
	)) {
		return { visible: true, explicitlyReferenced: true, distanceBand: 'REFERRED' };
	}
	return { visible: false, explicitlyReferenced, distanceBand: 'REFERRED' };
}

function projectEntityCard(card: EntityCard, explicitlyReferenced: boolean, distanceBand: EntityDistanceBand): NearbyEntityContext {
	return {
		id: card.id,
		name: card.name,
		kind: card.kind,
		locationId: card.worldState?.locationId,
		presence: card.worldState?.presence || 'unknown',
		isAlive: card.worldState?.isAlive !== false,
		currentActivity: card.worldState?.currentActivity,
		role: card.classification?.role || card.social?.role,
		factionIds: clone(card.social?.factionIds || []),
		distanceBand,
		importance: distanceBand === 'SAME_LOCATION' ? 1 : explicitlyReferenced ? 0.9 : 0.5,
		explicitlyReferenced,
		visibleToPlayer: true,
	};
}

function projectLifecycleEntity(
	state: any,
	currentLocationId: string,
	explicitlyReferenced: boolean,
	localSpatialState?: LocalSpatialState,
): NearbyEntityContext {
	return {
		id: String(state.actorId),
		name: String(state.name || state.actorId),
		kind: 'NPC',
		locationId: state.locationId,
		presence: state.isDead ? 'absent' : 'present',
		isAlive: !state.isDead,
		currentActivity: state.currentActivity,
		distanceBand: (() => {
			const focusedProximity =
				state.locationId === currentLocationId && localSpatialState?.focusEntityId === state.actorId
					? localSpatialState?.proximityBand
					: undefined;
			if (state.locationId !== currentLocationId) return 'REFERRED' as const;
			if (focusedProximity === 'CONTACT') return 'CONTACT' as const;
			if (focusedProximity === 'ADJACENT') return 'ADJACENT' as const;
			if (focusedProximity === 'NEAR') return 'NEAR' as const;
			return 'SAME_LOCATION' as const;
		})(),
		importance: state.locationId === currentLocationId ? 1 : explicitlyReferenced ? 0.9 : 0.4,
		explicitlyReferenced,
		visibleToPlayer: true,
	};
}

function projectSceneObject(object: LocationSceneObject): SceneObjectContext {
	return {
		id: normalizeText(object.id),
		name: normalizeText(object.name),
		kind: object.kind || 'OTHER',
		description: normalizeText(object.description) || undefined,
		visibleToPlayer: object.visible !== false,
		interactable: object.interactable === true,
		tags: Array.isArray(object.tags) ? object.tags.map(normalizeText).filter(Boolean).slice(0, 12) : [],
		properties: object.properties && typeof object.properties === 'object' ? clone(object.properties) : {},
		source: 'LOCATION_SCENE_OBJECT',
	};
}

function projectMemory(memory: DurableMemory): RelevantMemory {
	return {
		id: memory.id,
		content: memory.content,
		memoryClass: memory.memoryClass,
		importance: memory.importance,
		confidence: memory.confidence,
		status: memory.status,
		subjectEntityId: memory.subjectEntityId,
		relatedEntityIds: [...memory.relatedEntityIds],
		sourceEventId: memory.sourceEventId,
		provenance: memory.provenance,
	};
}

function projectKnowledgeFact(fact: KnowledgeFact): RelevantLore {
	return {
		id: fact.id,
		subjectEntityId: fact.subjectEntityId,
		predicate: fact.predicate,
		objectValue: fact.objectValue,
		sourceType: fact.sourceType,
		confidence: fact.confidence,
		scope: fact.scope,
		provenanceSummary: fact.provenanceSummary,
	};
}

function projectAuthoritativeFact(fact: any): AuthoritativeFact {
	return {
		id: normalizeText(fact?.id),
		subjectEntityId: normalizeText(fact?.subjectEntityId || fact?.subject || ''),
		predicate: normalizeText(fact?.predicate || fact?.type || ''),
		objectValue: normalizeText(fact?.objectValue || fact?.object || fact?.value || fact?.summary || ''),
		sourceType: fact?.sourceType,
		confidence: typeof fact?.confidence === 'number' ? fact.confidence : undefined,
		secretLevel: fact?.secretLevel,
		scope: fact?.scope,
		provenanceSummary: fact?.provenanceSummary || fact?.provenance,
	};
}

function projectActiveCondition(raw: any, index: number): ActiveCondition | null {
	if (!raw) return null;
	const label = normalizeText(raw.label || raw.name || raw.type || raw.effect || raw.summary);
	if (!label) return null;
	return {
		id: normalizeText(raw.id) || `condition_${index + 1}`,
		label,
		source: normalizeText(raw.source || raw.provenance || '') || undefined,
		targetId: normalizeText(raw.targetId || raw.actorId || '') || undefined,
		severity: raw.severity === undefined ? undefined : safeNumber(raw.severity),
		expiresAt: raw.expiresAt ?? raw.expiresAtTurn ?? raw.durationEndsAt ?? null,
	};
}

function projectActiveDialogue(raw: any): ActiveDialogueContext | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const speakerId = normalizeText(raw.speakerId || raw.speaker?.id);
	const speakerName = normalizeText(raw.speakerName || raw.speaker?.name);
	const text = normalizeText(raw.text || raw.message || raw.dialogue);
	if (!speakerId && !speakerName && !text) return undefined;
	return {
		nodeId: normalizeText(raw.nodeId || raw.id) || undefined,
		speakerId: speakerId || speakerName || 'unknown_speaker',
		speakerName: speakerName || speakerId || 'Unknown speaker',
		text,
		epistemicNote: normalizeText(raw.epistemicNote || raw.epistemicContext || '') || undefined,
	};
}

function buildRecentTurns(run: any, canonicalEvents: any[], maxRecentTurns: number): RecentTurnContext[] {
	const runtimeHistory = Array.isArray(run?.runtimeState?.narrativeContextHistory)
		? run.runtimeState.narrativeContextHistory
		: [];
	const runtimeTurns = runtimeHistory
		.map((entry: any, index: number) => ({
			turnId: normalizeText(entry?.turnId || entry?.actionId || '') || deterministicId('situation_history', String(index), normalizeText(entry?.playerAction || '')),
			turnNumber: Number.isFinite(Number(entry?.turnNumber)) ? Number(entry.turnNumber) : undefined,
			playerAction: normalizeText(entry?.playerAction || entry?.actionText || '') || undefined,
			narration: normalizeText(entry?.narration?.response || entry?.narration || '') || undefined,
			worldTime: normalizeText(entry?.worldTime || entry?.capturedAt || '') || undefined,
			locationId: normalizeText(entry?.locationId || '') || undefined,
			stateChanges: Array.isArray(entry?.stateChanges)
				? entry.stateChanges.map(normalizeText).filter(Boolean).slice(0, 8)
				: [],
			unresolvedConsequence: normalizeText(entry?.unresolvedConsequence || '') || undefined,
			isOpeningScene: Boolean(entry?.isOpeningScene),
		}))
		.filter((turn: RecentTurnContext) => turn.playerAction || turn.narration);

	if (runtimeTurns.length > 0) {
		return runtimeTurns.slice(-maxRecentTurns);
	}

	const fallbackTurns = canonicalEvents
		.map((event: any, index: number) => ({
			turnId: normalizeText(event?.id) || deterministicId('situation_event_turn', String(index)),
			turnNumber: eventTurnNumber(event, index),
			playerAction: normalizeText(event?.payload?.actionText || event?.payload?.action || event?.actionText || '') || undefined,
			narration: normalizeText(event?.narrativeResponse || event?.narrative || '') || undefined,
			worldTime: normalizeText(event?.worldTime || event?.timestamp || '') || undefined,
			locationId: normalizeText(event?.locationId || '') || undefined,
			stateChanges: Array.isArray(event?.stateChanges)
				? event.stateChanges.map(normalizeText).filter(Boolean).slice(0, 8)
				: [],
			unresolvedConsequence: normalizeText(event?.unresolvedConsequence || event?.pendingConsequence || '') || undefined,
			isOpeningScene: false,
		}))
		.filter((turn) => turn.playerAction || turn.narration);

	return fallbackTurns.slice(-maxRecentTurns);
}

export class CurrentSituationBuilder {
	public static build(params: BuildCurrentSituationParams): CurrentSituation {
		const repository = params.worldRepo;
		if (!repository) {
			throw new Error('CurrentSituationBuilder requires a WorldRepository.');
		}

		const run = repository.getStoryRun(params.storyId);
		const player = repository.getPlayerLifecycle(params.storyId);
		const viewerActorId = params.viewerActorId || player?.actorId || run?.protagonist?.characterId || `player_actor_${params.storyId}`;
		const locationId = player?.locationId || run?.currentLocationId || run?.startingLocationId;
		const timestamp = repository.getWorldClock(params.storyId).getTimestamp();
		const worldId = String(run?.worldId || '');
		const geography = repository.getGeographyGraph(params.storyId);
		const location = locationId ? geography.getNode(locationId) : undefined;
		const hasCanonicalLocation = Boolean(locationId && location);

		// The situation model is a read projection. It must not mutate the repository
		// merely because a caller is an early/minimal turn fixture. When canonical
		// location state is unavailable, expose a bounded unknown location instead of
		// inventing a real location or throwing before fallback orchestration can run.
		const safeLocation = location || {
			id: locationId || `location_unknown_${params.storyId}`,
			name: 'Unknown Location',
			regionId: 'UNKNOWN',
			description: 'The current canonical location has not been established.',
			ambientSensory: undefined,
			accessible: false,
			discovered: false,
			parentLocationId: null,
		} as any;

		const playerKnowledgeFacts = repository.getAuthorizedKnowledgeFacts(params.storyId, viewerActorId);
		const authoritativeFacts = repository.getWorldFacts(params.storyId)
			.map(projectAuthoritativeFact)
			.filter((fact) => Boolean(fact.id || fact.objectValue));

		const actionText = normalizeText(params.playerAction);
		const keywords = tokenize([
			actionText,
			safeLocation.name,
			safeLocation.regionId,
			
		].filter(Boolean).join(' '));

		const memoryKeywords = keywords.slice(0, 16);
		const relevantMemories = repository.getMemoryEngine(params.storyId)
			.retrieveMemories({
				storyId: params.storyId,
				viewerActorId,
				queryKeywords: memoryKeywords,
				currentTurn: repository.getCanonicalCommandEventCount(params.storyId) + 1,
				currentTimestamp: timestamp,
				maxResults: 6,
				includeDormant: false,
				includeArchived: false,
			})
			.map(projectMemory);

		const relevantLore = playerKnowledgeFacts
			.map(projectKnowledgeFact)
			.filter((fact) => {
				const searchable = tokenize([
					fact.subjectEntityId,
					fact.predicate,
					fact.objectValue,
					fact.provenanceSummary,
				].join(' '));
				if (memoryKeywords.length === 0) return true;
				return searchable.some((token) => memoryKeywords.includes(token));
			})
			.slice(0, 8);

		const connectedLocations = (locationId ? geography.getOutgoingEdges(locationId) : [])
			.map((edge: RouteEdge) => {
				const destination = geography.getNode(edge.toLocationId);
				if (!destination) return null;
				const discovered = player
					? player.discoveredLocationIds.includes(destination.id)
					: destination.discovered;
				if (!discovered) return null;
				return {
					id: destination.id,
					name: destination.name,
					regionId: destination.regionId,
					discovered,
					accessible: destination.accessible,
					routeId: edge.id,
					distanceKm: edge.distanceKm,
					terrain: edge.terrain,
					allowedModes: [...edge.allowedModes],
					isBlocked: edge.isBlocked,
					blockReason: edge.blockReason,
				};
			})
			.filter(Boolean) as CurrentLocationContext['connectedLocations'];

		const sceneObjects: SceneObjectContext[] = [];

		// Build a bounded canonical scene-evidence ledger. This is intentionally
		// separate from prose: descriptive location text may explain atmosphere,
		// but it does not create concrete environmental facts.


		// Explicit authored/generated scene objects are the only location-level
		// source of discrete environmental props. Location prose is never parsed
		// into objects because prose such as "brass architecture" must not create
		// a canonical brass lamp or chair.
		for (const object of Array.isArray(safeLocation.sceneObjects) ? safeLocation.sceneObjects : []) {
			if (!object?.id || !object?.name || object.visible === false) continue;
			sceneObjects.push(projectSceneObject(object));
		}

		// Ground item instances are canonical objects too. Their ownerEntityId is
		// the location/container authority, while their item definition supplies
		// the concrete identity and mechanical properties.
		const inventory = repository.getInventoryEngine(params.storyId);
		for (const item of inventory.getItemInstancesByOwner(safeLocation.id)) {
			if (item.containerType !== 'ground' || item.destroyedAtSeconds !== undefined) continue;
			const definition = inventory.getItemDefinition(item.defId);
			sceneObjects.push({
				id: item.id,
				name: item.name || definition?.name || item.defId,
				kind: 'ITEM',
				description: definition?.description,
				visibleToPlayer: true,
				interactable: true,
				tags: definition?.tags ? [...definition.tags] : [],
				properties: clone(definition?.properties || {}),
				source: 'GROUND_ITEM',
			});
		}

		const currentLocation: CurrentLocationContext = {
			id: safeLocation.id,
			name: safeLocation.name,
			regionId: safeLocation.regionId,
			description: safeLocation.description,
			ambientSensory: safeLocation.ambientSensory,
			accessible: hasCanonicalLocation ? safeLocation.accessible : false,
			discovered: hasCanonicalLocation ? (player ? true : safeLocation.discovered) : false,
			parentLocationId: safeLocation.parentLocationId,
			connectedLocations,
		};

		const nearbyEntities: NearbyEntityContext[] = [];
		if (player) {
			nearbyEntities.push({
				id: player.actorId,
				name: player.name,
				kind: 'PLAYER',
				locationId: player.locationId,
				presence: 'present',
				isAlive: !player.isDead,
				currentActivity: player.currentActivity,
				distanceBand: 'SAME_LOCATION',
				importance: 1,
				explicitlyReferenced: false,
				visibleToPlayer: true,
			});
		}

		const canonicalNpcs = repository.getAllNpcLifecycles(params.storyId);
		for (const npc of canonicalNpcs) {
			if (nearbyEntities.some((entity) => entity.id === npc.actorId)) continue;
			const explicit = Boolean(actionText) && normalizeText(actionText).toLowerCase().includes(normalizeText(npc.name).toLowerCase());
			if (npc.locationId !== safeLocation.id && !explicit) continue;
			if (npc.isDead) continue;
			nearbyEntities.push(projectLifecycleEntity(npc, safeLocation.id, explicit, player?.localSpatialState));
		}

		for (const card of repository.getEntityCards(params.storyId)) {
			if (nearbyEntities.some((entity) => entity.id === card.id)) continue;
			const visibility = entityCardIsVisible(
				card,
				safeLocation.id,
				actionText,
				viewerActorId,
				repository,
				player?.localSpatialState,
			);
			if (!visibility.visible) continue;
			const projected = projectEntityCard(card, visibility.explicitlyReferenced, visibility.distanceBand);
			if (projected.presence === 'absent' || !projected.isAlive) continue;
			nearbyEntities.push(projected);
		}

		nearbyEntities.sort((a, b) => {
			if (a.distanceBand !== b.distanceBand) {
				const distanceRank: Record<EntityDistanceBand, number> = {
					CONTACT: 0,
					ADJACENT: 1,
					NEAR: 2,
					SAME_LOCATION: 3,
					REFERRED: 4,
				};
				return distanceRank[a.distanceBand] - distanceRank[b.distanceBand];
			}
			if (a.explicitlyReferenced !== b.explicitlyReferenced) return a.explicitlyReferenced ? -1 : 1;
			if (a.importance !== b.importance) return b.importance - a.importance;
			return a.id.localeCompare(b.id);
		});

		const limitedNearbyEntities = nearbyEntities.slice(0, params.maxNearbyEntities ?? 24);
		const activeDialogue = projectActiveDialogue(
			run?.runtimeState?.activeDialogue ||
			run?.activeDialogue ||
			run?.runtimeState?.dialogue ||
			run?.dialogue,
		);

		// Tail-only read: recent-turn reconstruction and the last six events are all
		// this projection needs, and the full log grows unboundedly over a campaign.
		const canonicalEvents = repository.getRecentCanonicalCommandEvents(params.storyId, Math.max(6, params.maxRecentTurns ?? 8));
		const recentTurns = buildRecentTurns(run, canonicalEvents, params.maxRecentTurns ?? 8);
		const lastEvents = canonicalEvents
			.slice(-6)
			.map((event: any, index: number) => ({
				id: normalizeText(event?.id) || deterministicId('situation_event', String(index), eventText(event)),
				type: normalizeText(event?.type || event?.commandType || 'EVENT'),
				summary: eventText(event),
				turnNumber: eventTurnNumber(event, canonicalEvents.length - 6 + index),
				timestamp: normalizeText(event?.timestamp || event?.worldTime || '') || undefined,
				locationId: normalizeText(event?.locationId || locationId) || undefined,
				source: 'CANONICAL_COMMAND_EVENT',
			}))
			.filter((event) => event.summary);

		const ambientActivityEvents = WorldActivityDirector.buildAmbientEvents(
			nearbyEntities.map((entity) => ({
				id: entity.id,
				name: entity.name,
				kind: entity.kind,
				locationId: entity.locationId,
				currentActivity: entity.currentActivity,
				visibleToPlayer: entity.visibleToPlayer,
			})).filter((entity) => entity.kind !== 'PLAYER'),
			locationId,
		);
		const visibleEvents = activeDialogue
			? [
				{
					id: activeDialogue.nodeId || deterministicId('dialogue_event', params.storyId, activeDialogue.speakerId, activeDialogue.text),
					type: 'DIALOGUE',
					summary: `${activeDialogue.speakerName}: ${activeDialogue.text}`,
					locationId,
					source: 'CANONICAL_ACTIVE_DIALOGUE',
				},
				...ambientActivityEvents,
				...lastEvents,
			]
			: [...ambientActivityEvents, ...lastEvents];

		const runtime = (run.runtimeState || {}) as Record<string, any>;
		const plotRaw = runtime.plot || {};
		const recentBeats = Array.isArray(plotRaw.beats)
			? plotRaw.beats.slice(-8).map((beat: any, index: number) => ({
				id: normalizeText(beat?.id) || deterministicId('plot_beat', String(index), normalizeText(beat?.text)),
				turnId: normalizeText(beat?.turnId) || undefined,
				text: normalizeText(beat?.text),
				tags: Array.isArray(beat?.tags) ? beat.tags.map(normalizeText).filter(Boolean) : [],
				timestamp: normalizeText(beat?.timestamp),
			})).filter((beat: any) => beat.text)
			: [];

		const plot: PlotContext = {
			currentArc: normalizeText(plotRaw.currentArc) || 'OPENING',
			summary: normalizeText(plotRaw.summary),
			recentBeats,
		};

		const threadCandidates = [
			...(Array.isArray(runtime.openNarrativeThreads) ? runtime.openNarrativeThreads : []),
			...(Array.isArray(plotRaw.openThreads)
				? plotRaw.openThreads.map((thread: any, index: number) => typeof thread === 'string' ? { id: `plot_thread_${index + 1}`, title: thread } : thread)
				: []),
			...repository.getStoryThreads(params.storyId),
		];
		const openThreads = Array.from(
			new Map(
				threadCandidates
					.map(normalizeThread)
					.filter((thread): thread is OpenThread => Boolean(thread))
					.map((thread) => [thread.id, thread]),
			).values(),
		).slice(0, 24);

		const activeConditions = [
			...(Array.isArray(player?.injuries)
				? player.injuries
					.filter((injury) => !injury.healed)
					.map((injury: any, index: number) => projectActiveCondition({
						id: injury.id || `injury_${index + 1}`,
						label: injury.description || injury.type || 'Injury',
						source: 'PlayerLifecycleState',
						targetId: player.actorId,
						severity: injury.severity,
					}, index))
					.filter(Boolean)
				: []),
			...repository.getActiveEffects(params.storyId)
				.map(projectActiveCondition)
				.filter(Boolean),
		] as ActiveCondition[];

		const availableInteractions: InteractionContext[] = [
			...connectedLocations.map((destination) => ({
				id: `move:${destination.id}`,
				type: 'MOVE' as const,
				label: `Travel to ${destination.name}`,
				targetId: destination.id,
				targetName: destination.name,
				enabled: destination.accessible && !destination.isBlocked,
				reason: destination.isBlocked
					? destination.blockReason || 'Route is blocked.'
					: destination.accessible
						? undefined
						: 'Destination is inaccessible.',
			})),
			...limitedNearbyEntities
				.filter((entity) =>
					entity.kind !== 'PLAYER' &&
					entity.presence === 'present' &&
					entity.distanceBand !== 'REFERRED'
				)
				.map((entity) => ({
					id: `talk:${entity.id}`,
					type: 'TALK' as const,
					label: `Talk to ${entity.name}`,
					targetId: entity.id,
					targetName: entity.name,
					enabled: true,
				})),
			...limitedNearbyEntities
				.filter((entity) =>
					entity.kind !== 'PLAYER' &&
					entity.presence === 'present' &&
					entity.distanceBand !== 'REFERRED'
				)
				.map((entity) => ({
					id: `inspect:${entity.id}`,
					type: 'INSPECT' as const,
					label: `Inspect ${entity.name}`,
					targetId: entity.id,
					targetName: entity.name,
					enabled: true,
				})),
		];

		const currentAction: PlayerIntent | undefined = params.currentAction || (actionText
			? {
				action: actionText,
				interactionMode: 'OTHER',
				speechIntent: false,
				movementIntent: false,
				observationIntent: false,
				explicitTargets: [],
				impliedTargets: [],
				confidence: 0.2,
				source: 'DETERMINISTIC',
				originalText: actionText,
			}
			: undefined);

		const situationTurnId = params.turnId ||
			(canonicalEvents.at(-1)?.id
				? String(canonicalEvents.at(-1).id)
				: deterministicId('situation_turn', params.storyId, String(canonicalEvents.length + 1), actionText));

		return {
			storyId: params.storyId,
			turnId: situationTurnId,
			worldId,
			worldTime: formatCanonicalTimestamp(timestamp),
			worldTimestamp: clone(timestamp),
			player: {
				actorId: viewerActorId,
				name: player?.name || run?.characterName || 'Protagonist',
				locationId,
				currentActivity: player?.currentActivity || 'idle',
				isTraveling: Boolean(player?.isTraveling),
				isDead: Boolean(player?.isDead),
				isTransformed: Boolean(player?.isTransformed),
				isPossessed: Boolean(player?.isPossessed),
				injuries: Array.isArray(player?.injuries)
					? player.injuries.filter((injury) => !injury.healed).map((injury) => normalizeText(injury.description || injury.type)).filter(Boolean)
					: [],
				spatial: player?.localSpatialState || { proximityBand: 'SAME_AREA', areaId: locationId },
			},
			location: currentLocation,
			nearbyEntities: limitedNearbyEntities,
			sceneObjects: sceneObjects.slice(0, 32),
			sceneEvidence: {
				objects: sceneObjects.slice(0, 32),
				entities: limitedNearbyEntities.filter((entity) => entity.visibleToPlayer).slice(0, 16),
				events: visibleEvents.slice(0, 16),
				sensory: [
					safeLocation.ambientSensory,
				].map(normalizeText).filter(Boolean).slice(0, 8),
				structures: sceneObjects
					.filter((object) => object.kind === 'STRUCTURE' || object.kind === 'ENVIRONMENTAL_FEATURE')
					.map((object) => object.name)
					.slice(0, 16),
				occupancy: {
					status: safeLocation.population?.status || 'UNKNOWN',
					expectedPopulation: safeLocation.population?.expectedPopulation,
					explanation: safeLocation.population?.explanation,
					accessControlled: safeLocation.population?.accessControlled === true,
					provenance: safeLocation.population?.provenance || 'UNKNOWN',
				},
			},
			visibleEvents,
			activeDialogue,
			recentTurns,
			currentAction,
			plot,
			openThreads,
			relevantMemories,
			relevantLore,
			playerKnowledge: {
				viewerActorId,
				knownFacts: relevantLore,
				authorizedFactIds: playerKnowledgeFacts.map((fact) => String(fact.id || '')).filter(Boolean),
				note: 'Player knowledge contains only facts authorized for this viewer. Canonical world facts are kept separately.',
			},
			worldFacts: authoritativeFacts,
			activeConditions,
			availableInteractions,
		};
	}

	public static toPromptContext(situation: CurrentSituation): string {
		const visibleEntities = situation.nearbyEntities
			.filter((entity) => entity.visibleToPlayer)
			.slice(0, 8)
			.map((entity) => `${entity.name} [${entity.kind}; ${entity.distanceBand}]`)
			.join('; ') || 'None';

		const recentTurns = situation.recentTurns
			.slice(-4)
			.map((turn) => {
				const parts = [
					turn.turnNumber !== undefined ? `Turn ${turn.turnNumber}` : '',
					turn.playerAction ? `Player: ${turn.playerAction}` : '',
					turn.narration ? `Narration: ${turn.narration}` : '',
					turn.stateChanges.length ? `State changes: ${turn.stateChanges.join('; ')}` : '',
					turn.unresolvedConsequence ? `Unresolved consequence: ${turn.unresolvedConsequence}` : '',
				].filter(Boolean);
				return parts.join(' | ');
			})
			.join('\n') || 'No recent turn history.';

		const openThreads = situation.openThreads
			.slice(0, 4)
			.map((thread) => `[${thread.status || 'OPEN'}] ${thread.title}${thread.summary ? `: ${thread.summary}` : ''}`)
			.join('\n') || 'None.';

		const memories = situation.relevantMemories
			.slice(0, 4)
			.map((memory) => `[${memory.memoryClass}] ${memory.content.slice(0, 420)}`)
			.join('\n') || 'None retrieved.';

		const lore = situation.relevantLore
			.slice(0, 4)
			.map((fact) => `[${fact.sourceType}] ${fact.subjectEntityId} ${fact.predicate} -> ${fact.objectValue}`)
			.join('\n') || 'None retrieved.';

		return [
			`CURRENT SITUATION — canonical turn ${situation.turnId}`,
			`World: ${situation.worldId}`,
			`Time: ${situation.worldTime}`,
			`Location: ${situation.location.name} (${situation.location.id})`,
			`Region: ${situation.location.regionId}`,
			`Location description: ${situation.location.description}`,
			situation.location.ambientSensory ? `Ambient: ${situation.location.ambientSensory}` : '',
			`Visible entities: ${visibleEntities}`,
			situation.activeDialogue ? `Active dialogue: ${situation.activeDialogue.speakerName}: ${situation.activeDialogue.text}` : '',
			`Current action: ${situation.currentAction?.action || 'None'}`,
			`Plot: ${situation.plot.currentArc} — ${situation.plot.summary || 'No compressed plot summary.'}`,
			`Open threads:\n${openThreads}`,
			`Recent turns:\n${recentTurns}`,
			`Relevant memories:\n${memories}`,
			`Relevant authorized lore:\n${lore}`,
			`Active conditions: ${situation.activeConditions.map((condition) => condition.label).join('; ') || 'None'}`,
			`Available interactions: ${situation.availableInteractions.filter((interaction) => interaction.enabled).map((interaction) => interaction.label).join('; ') || 'None'}`,
			'Knowledge boundary: canonical world facts may be stricter than player knowledge. Never present worldFacts as player-known unless matching playerKnowledge evidence exists.',
		].filter(Boolean).join('\n');
	}

	public static toPlayerSafeProjection(situation: CurrentSituation): Omit<CurrentSituation, 'worldFacts'> & { worldFactsOmitted: true } {
		const safe = clone(situation) as any;
		delete safe.worldFacts;
		if (safe.activeDialogue) {
			delete safe.activeDialogue.epistemicNote;
		}
		return {
			...safe,
			worldFactsOmitted: true,
		};
	}
}
