import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { NarrativeContinuityEngine } from '../server/domain/narrativeContinuityEngine';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import type { DurableMemory } from '../server/domain/memoryOpportunityEngine';

function memory(overrides: Partial<DurableMemory> = {}): DurableMemory {
	return {
		id: 'memory',
		storyId: 'n16-memory',
		memoryClass: 'EPISODIC',
		subjectEntityId: 'player',
		relatedEntityIds: [],
		content: 'A useful remembered event.',
		importance: 55,
		confidence: 0.8,
		status: 'active',
		visibility: 'PRIVATE',
		accessibleToEntityIds: ['player'],
		isPersistentCritical: false,
		provenance: 'n16_test',
		perspective: 'SUBJECTIVE',
		validFromTurn: 1,
		lastRecalledTurn: 1,
		triggerConditionTags: ['memory'],
		...overrides,
	};
}

test('N16 balances semantic and episodic families instead of letting recency dominate', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n16-memory');
	const engine = repository.getMemoryEngine('n16-memory');

	engine.storeMemory(memory({
		id: 'semantic-fissure-law',
		memoryClass: 'SEMANTIC',
		content: 'The starlight fissure becomes unstable when exposed to deep-sea pressure.',
		importance: 82,
		confidence: 0.95,
		lastRecalledTurn: 1,
		triggerConditionTags: ['fissure', 'pressure', 'law'],
		visibility: 'PUBLIC',
		accessibleToEntityIds: [],
	}));
	engine.storeMemory(memory({
		id: 'episodic-fissure-event',
		memoryClass: 'EPISODIC',
		content: 'I watched the fissure pulse beside Archivist Maren during my earlier visit.',
		importance: 58,
		confidence: 0.9,
		lastRecalledTurn: 1,
		relatedEntityIds: ['archivist_maren'],
		relatedLocationId: 'lower_sea',
		triggerConditionTags: ['fissure', 'archivist', 'pulse'],
	}));
	engine.storeMemory(memory({
		id: 'recent-noise',
		memoryClass: 'EPISODIC',
		content: 'The corridor was quiet a moment ago.',
		importance: 10,
		confidence: 1,
		lastRecalledTurn: 20,
		triggerConditionTags: ['corridor', 'quiet'],
	}));

	const result = engine.retrieveNarrativeMemories({
		storyId: 'n16-memory',
		viewerActorId: 'player',
		queryText: 'What do I remember about the fissure near Archivist Maren?',
		queryKeywords: ['fissure', 'archivist', 'maren'],
		targetEntityIds: ['archivist_maren'],
		targetEntityNames: ['Archivist Maren'],
		locationId: 'lower_sea',
		locationName: 'Lower Sea',
		currentTurn: 40,
		maxResults: 3,
	});

	assert.ok(result.memories.some((item) => item.id === 'semantic-fissure-law'));
	assert.ok(result.memories.some((item) => item.id === 'episodic-fissure-event'));
	assert.equal(result.memories.some((item) => item.id === 'recent-noise'), false);
	assert.equal(result.evidence.some((entry) => entry.memoryId === 'episodic-fissure-event' && entry.entityLinkScore === 1), true);
	assert.equal(result.evidence.some((entry) => entry.family === 'SEMANTIC'), true);
	assert.equal(result.evidence.some((entry) => entry.family === 'EPISODIC'), true);
});

test('N16 keeps epistemic visibility authoritative while retrieving linked memories', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n16-memory');
	const engine = repository.getMemoryEngine('n16-memory');

	engine.storeMemory(memory({
		id: 'private-other',
		subjectEntityId: 'other_actor',
		content: 'The hidden vault is under the north archive.',
		importance: 100,
		confidence: 1,
		visibility: 'PRIVATE',
		accessibleToEntityIds: ['other_actor'],
	}));
	engine.storeMemory(memory({
		id: 'public-fact',
		memoryClass: 'SEMANTIC',
		subjectEntityId: 'other_actor',
		content: 'The archive has a public reading room.',
		importance: 40,
		confidence: 0.9,
		visibility: 'PUBLIC',
		accessibleToEntityIds: [],
	}));

	const result = engine.retrieveNarrativeMemories({
		storyId: 'n16-memory',
		viewerActorId: 'player',
		queryText: 'archive',
		queryKeywords: ['archive'],
		currentTurn: 10,
		maxResults: 5,
	});

	assert.equal(result.memories.some((item) => item.id === 'private-other'), false);
	assert.equal(result.memories.some((item) => item.id === 'public-fact'), true);
});

test('N16 retrieval is deterministic and safe for empty or partial context', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n16-memory');
	const engine = repository.getMemoryEngine('n16-memory');

	engine.storeMemory(memory({
		id: 'partial',
		content: 'A durable memory without optional location, thread, or timestamp links.',
		relatedEntityIds: [],
		triggerConditionTags: [],
		lastRecalledTurn: 2,
	}));
	
	const first = engine.retrieveNarrativeMemories({
		storyId: 'n16-memory',
		viewerActorId: 'player',
		currentTurn: 10,
		maxResults: 5,
	});
	const second = engine.retrieveNarrativeMemories({
		storyId: 'n16-memory',
		viewerActorId: 'player',
		currentTurn: 10,
		maxResults: 5,
	});

	assert.deepEqual(first, second);
	assert.equal(first.memories[0]?.id, 'partial');

	const empty = engine.retrieveNarrativeMemories({
		storyId: 'missing-story',
		viewerActorId: 'player',
		queryText: '',
		queryKeywords: [],
		maxResults: 5,
	});
	assert.deepEqual(empty.memories, []);
	assert.match(empty.fallbackReason || '', /No epistemically authorized memory/i);
});

test('N16 routes entity-linked episodic memory through NarrativeContinuityEngine and carries retrieval evidence forward', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n16-continuity';
	repository.seedStory(storyId);
	const player = repository.getPlayerLifecycle(storyId)!;

	repository.updateNpcLifecycle(storyId, {
		actorId: 'n16_archivist',
		name: 'Archivist Maren',
		locationId: player.locationId,
		lastUpdatedTime: player.lastUpdatedTime,
		currentActivity: 'cataloguing star maps',
	} as any);

	const engine = repository.getMemoryEngine(storyId);
	engine.storeMemory(memory({
		id: 'n16_old_npc_memory',
		storyId,
		memoryClass: 'EPISODIC',
		subjectEntityId: player.actorId,
		relatedEntityIds: ['n16_archivist'],
		relatedLocationId: player.locationId,
		content: 'Years ago I saw the archivist seal the lower sea charts before the fissure expedition.',
		importance: 62,
		confidence: 0.92,
		lastRecalledTurn: 1,
		triggerConditionTags: ['archivist', 'charts', 'fissure'],
	}));
	engine.storeMemory(memory({
		id: 'n16_semantic_memory',
		storyId,
		memoryClass: 'SEMANTIC',
		subjectEntityId: player.actorId,
		relatedEntityIds: [],
		relatedLocationId: player.locationId,
		content: 'The archive keeps expedition charts in a sealed reference collection.',
		importance: 68,
		confidence: 0.95,
		lastRecalledTurn: 1,
		triggerConditionTags: ['archive', 'charts', 'collection'],
	}));

	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I listen to Archivist Maren.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});
	const before = repository.getCanonicalCommandEvents(storyId).length;
	const packet = NarrativeContinuityEngine.research(
		repository,
		storyId,
		'I listen to Archivist Maren.',
		player.actorId,
		{ persist: false, currentSituation: situation },
	);
	const after = repository.getCanonicalCommandEvents(storyId).length;

	assert.equal(after, before);
	assert.ok(packet.memories.some((memory: any) => memory.id === 'n16_old_npc_memory'));
	assert.ok(packet.memories.some((memory: any) => memory.id === 'n16_semantic_memory'));
	const episodic = packet.memories.find((memory: any) => memory.id === 'n16_old_npc_memory') as any;
	assert.equal(typeof episodic.retrievalScore, 'number');
	assert.equal(episodic.continuityScope, 'WORLD');
	assert.ok(Array.isArray(episodic.retrievalReasons));
});
