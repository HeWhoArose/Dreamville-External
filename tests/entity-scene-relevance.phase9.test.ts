import test from 'node:test';
import assert from 'node:assert/strict';
import { EntitySceneRelevanceEngine } from '../server/domain/entitySceneRelevance';

function situation() {
	return {
		storyId: 'scene-story',
		turnId: 'turn',
		worldId: 'world',
		worldTime: 'now',
		worldTimestamp: {} as any,
		player: { actorId: 'player', name: 'Hero', locationId: 'loc', currentActivity: 'idle', isTraveling: false, isDead: false, isTransformed: false, isPossessed: false, injuries: [] },
		location: { id: 'loc', name: 'Archive', regionId: 'citadel', description: '', connectedLocations: [] },
		nearbyEntities: [
			{ id: 'guard', name: 'Guard', kind: 'NPC', locationId: 'loc', presence: 'present', isAlive: true, distanceBand: 'SAME_LOCATION', importance: 1, explicitlyReferenced: false, visibleToPlayer: true },
			{ id: 'distant', name: 'Distant Mage', kind: 'NPC', locationId: 'far', presence: 'present', isAlive: true, distanceBand: 'REFERRED', importance: 0.4, explicitlyReferenced: false, visibleToPlayer: false },
			{ id: 'merchant', name: 'Merchant', kind: 'NPC', locationId: 'loc', presence: 'present', isAlive: true, distanceBand: 'SAME_LOCATION', importance: 0.5, explicitlyReferenced: true, visibleToPlayer: true },
		],
		visibleEvents: [],
		activeDialogue: { speakerId: 'guard', speakerName: 'Guard', text: 'State your business.' },
		recentTurns: [],
		currentAction: { action: 'ask', interactionMode: 'DIALOGUE', speechIntent: true, movementIntent: false, observationIntent: false, explicitTargets: [], impliedTargets: [], confidence: 1, source: 'DETERMINISTIC', originalText: 'I ask the guard.' },
		plot: { currentArc: 'OPENING', summary: '', recentBeats: [] },
		openThreads: [],
		relevantMemories: [],
		relevantLore: [],
		playerKnowledge: { viewerActorId: 'player', knownFacts: [] },
		worldFacts: [],
		activeConditions: [],
		availableInteractions: [],
	} as any;
}

test('Phase 9 ranks same-location and explicitly referenced entities consistently', () => {
	const result = EntitySceneRelevanceEngine.rank(situation(), situation().currentAction);
	assert.equal(result[0].entityId, 'merchant');
	assert.ok(result.find((entry) => entry.entityId === 'guard')!.score >= 50);
});

test('Phase 9 excludes hidden/distant unrelated entities from top visible projection', () => {
	const top = EntitySceneRelevanceEngine.topVisible(situation(), situation().currentAction, 8);
	assert.ok(top.some((entity) => entity.id === 'guard'));
	assert.ok(top.some((entity) => entity.id === 'merchant'));
	assert.ok(!top.some((entity) => entity.id === 'distant'));
});

test('Phase 9 active dialogue is a shared relevance signal', () => {
	const result = EntitySceneRelevanceEngine.rank(situation(), situation().currentAction);
	const guard = result.find((entry) => entry.entityId === 'guard')!;
	assert.ok(guard.reasons.includes('active dialogue speaker'));
	assert.ok(guard.bands.includes('ACTIVE_DIALOGUE'));
});


test('Phase 9 uses explicit open-thread entity links even when the thread title omits the entity name', () => {
	const scene = situation() as any;
	scene.openThreads = [{
		id: 'thread-1',
		title: 'Recover the stolen archive seal',
		summary: 'The missing seal is still unresolved.',
		relatedEntityIds: ['guard'],
		status: 'OPEN',
		priority: 90,
	}];
	const result = EntitySceneRelevanceEngine.rank(scene, scene.currentAction);
	const guard = result.find((entry) => entry.entityId === 'guard')!;
	assert.ok(guard.reasons.includes('explicit open-thread entity link'));
	assert.ok(guard.bands.includes('ACTIVE_THREAD'));
	assert.ok(guard.score >= 75);
});
