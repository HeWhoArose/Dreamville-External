import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSuggestionCacheKey } from '../server/services/storyActionAdvisor';
import type { CurrentSituation } from '../server/domain/currentSituation';
import type { PlayerIntent } from '../server/domain/playerIntentInterpreter';

function situation(overrides: Partial<CurrentSituation> = {}): CurrentSituation {
	return {
		storyId: 'story_1',
		turnId: 'turn_1',
		worldId: 'world_1',
		worldTime: 'Cycle 1 · Dawn',
		worldTimestamp: {} as any,
		player: {
			actorId: 'actor_1',
			name: 'Hero',
			locationId: 'loc_1',
			currentActivity: 'idle',
			isTraveling: false,
			isDead: false,
			isTransformed: false,
			isPossessed: false,
			injuries: [],
		},
		location: {
			id: 'loc_1',
			name: 'Archive Periphery',
			regionId: 'citadel',
			description: 'Stone flags and brass conduits.',
			accessible: true,
			discovered: true,
			connectedLocations: [
				{
					id: 'loc_2',
					name: 'Hall',
					regionId: 'citadel',
					discovered: true,
					accessible: true,
					routeId: 'route_1',
					distanceKm: 0.2,
					terrain: 'stone',
					allowedModes: ['Foot'],
					isBlocked: false,
				},
			],
		},
		nearbyEntities: [
			{
				id: 'npc_1',
				name: 'Archivist Maren',
				kind: 'NPC',
				locationId: 'loc_1',
				presence: 'present',
				isAlive: true,
				distanceBand: 'SAME_LOCATION',
				importance: 1,
				explicitlyReferenced: false,
				visibleToPlayer: true,
			},
		],
		visibleEvents: [],
		recentTurns: [],
		plot: { currentArc: 'Archive', summary: 'Unstable signals are being investigated.', recentBeats: [] },
		openThreads: [{ id: 'thread_1', title: 'Investigate the signals', status: 'OPEN', priority: 5 }],
		relevantMemories: [],
		relevantLore: [],
		playerKnowledge: { viewerActorId: 'actor_1', knownFacts: [], authorizedFactIds: [], note: 'safe' },
		worldFacts: [],
		activeConditions: [],
		availableInteractions: [],
		...overrides,
	} as CurrentSituation;
}

const passiveIntent: PlayerIntent = {
	action: 'approach_and_listen',
	goal: 'gather_information',
	target: { id: 'npc_1', name: 'Archivist Maren', kind: 'NPC' },
	locationTarget: undefined,
	interactionMode: 'PASSIVE_OBSERVATION',
	speechIntent: false,
	movementIntent: true,
	observationIntent: true,
	informationGoal: 'hear rumors',
	explicitTargets: [{ id: 'npc_1', name: 'Archivist Maren', kind: 'NPC' }],
	impliedTargets: [],
	confidence: 1,
	source: 'DETERMINISTIC',
	originalText: 'I move closer to hear the rumors.',
};

test('Phase 11 suggestion cache key stays stable for an unchanged canonical situation', () => {
	const s = situation();
	const relevance = [{ entityId: 'npc_1', score: 90, rank: 1, reasons: ['same current location'], bands: ['CURRENT_LOCATION'], visible: true }];
	const first = buildSuggestionCacheKey(s, passiveIntent, relevance);
	const second = buildSuggestionCacheKey(s, passiveIntent, relevance);
	assert.equal(first, second);
});

test('Phase 11 suggestion cache key changes when the canonical turn changes', () => {
	const relevance = [{ entityId: 'npc_1', score: 90, rank: 1, reasons: ['same current location'], bands: ['CURRENT_LOCATION'], visible: true }];
	const first = buildSuggestionCacheKey(situation({ turnId: 'turn_1' }), passiveIntent, relevance);
	const second = buildSuggestionCacheKey(situation({ turnId: 'turn_2' }), passiveIntent, relevance);
	assert.notEqual(first, second);
});

test('Phase 11 suggestion cache key changes when relevant route availability changes', () => {
	const relevance = [{ entityId: 'npc_1', score: 90, rank: 1, reasons: ['same current location'], bands: ['CURRENT_LOCATION'], visible: true }];
	const blocked = situation({
		location: {
			...situation().location,
			connectedLocations: [{ ...situation().location.connectedLocations[0], isBlocked: true }],
		},
	});
	assert.notEqual(
		buildSuggestionCacheKey(situation(), passiveIntent, relevance),
		buildSuggestionCacheKey(blocked, passiveIntent, relevance),
	);
});

test('Phase 11 suggestion cache key changes when an open thread changes lifecycle state', () => {
	const relevance = [{ entityId: 'npc_1', score: 90, rank: 1, reasons: ['same current location'], bands: ['CURRENT_LOCATION'], visible: true }];
	const openKey = buildSuggestionCacheKey(situation(), passiveIntent, relevance);
	const resolved = situation({
		openThreads: [{ id: 'thread_1', title: 'Investigate the signals', status: 'RESOLVED', priority: 5 }],
	});
	const resolvedKey = buildSuggestionCacheKey(resolved, passiveIntent, relevance);
	assert.notEqual(openKey, resolvedKey);
});

test('Phase 11 suggestion cache key changes when relevant entity ranking changes', () => {
	const base = situation();
	const first = buildSuggestionCacheKey(
		base,
		passiveIntent,
		[{ entityId: 'npc_1', score: 90, rank: 1, reasons: ['same current location'], bands: ['CURRENT_LOCATION'], visible: true }],
	);
	const second = buildSuggestionCacheKey(
		base,
		passiveIntent,
		[{ entityId: 'npc_1', score: 60, rank: 1, reasons: ['recent interaction'], bands: ['RECENT_INTERACTION'], visible: true }],
	);
	assert.notEqual(first, second);
});
