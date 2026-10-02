import test from 'node:test';
import assert from 'node:assert/strict';
import { EntitySceneRelevanceEngine, type SocialConversationTopology } from '../server/domain/entitySceneRelevance';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';

function makeSituation(overrides: Record<string, any> = {}) {
	return {
		storyId: 'n15-story',
		turnId: 'n15-turn',
		worldId: 'world',
		worldTime: 'now',
		worldTimestamp: {} as any,
		player: {
			actorId: 'player',
			name: 'Hero',
			locationId: 'loc',
			currentActivity: 'talking',
			isTraveling: false,
			isDead: false,
			isTransformed: false,
			isPossessed: false,
			injuries: [],
			spatial: {} as any,
		},
		location: { id: 'loc', name: 'Hall', regionId: 'region', description: '', connectedLocations: [] },
		nearbyEntities: [
			{ id: 'speaker', name: 'Captain', kind: 'NPC', locationId: 'loc', presence: 'present', isAlive: true, currentActivity: 'speaking', distanceBand: 'CONTACT', importance: 1, explicitlyReferenced: true, visibleToPlayer: true },
			{ id: 'listener', name: 'Archivist', kind: 'NPC', locationId: 'loc', presence: 'present', isAlive: true, currentActivity: 'listening', distanceBand: 'NEAR', importance: 0.7, explicitlyReferenced: false, visibleToPlayer: true },
			{ id: 'background', name: 'Servant', kind: 'NPC', locationId: 'loc', presence: 'present', isAlive: true, currentActivity: 'sorting cups', distanceBand: 'SAME_LOCATION', importance: 0.2, explicitlyReferenced: false, visibleToPlayer: true },
			{ id: 'absent', name: 'Absent Guard', kind: 'NPC', locationId: 'elsewhere', presence: 'absent', isAlive: true, currentActivity: 'patrolling', distanceBand: 'REFERRED', importance: 0.2, explicitlyReferenced: false, visibleToPlayer: true },
		],
		visibleEvents: [],
		activeDialogue: { nodeId: 'dialogue-1', speakerId: 'speaker', speakerName: 'Captain', text: 'Tell me what happened.' },
		recentTurns: [],
		currentAction: undefined,
		plot: { currentArc: 'OPENING', summary: '', recentBeats: [] },
		openThreads: [],
		relevantMemories: [],
		relevantLore: [],
		playerKnowledge: { viewerActorId: 'player', knownFacts: [] },
		worldFacts: [],
		activeConditions: [],
		availableInteractions: [],
		...overrides,
	} as any;
}

function dialogueIntent() {
	return {
		action: 'answer',
		goal: 'answer the Captain',
		interactionMode: 'DIALOGUE' as const,
		speechIntent: true,
		movementIntent: false,
		observationIntent: false,
		informationGoal: undefined,
		explicitTargets: [{ id: 'speaker', name: 'Captain', kind: 'NPC' as const, source: 'EXPLICIT' as const }],
		impliedTargets: [],
		confidence: 1,
		source: 'DETERMINISTIC' as const,
		originalText: 'I answer the Captain.',
	};
}

test('N15 projects a multi-NPC conversation topology without creating canonical state', () => {
	const scene = makeSituation();
	const topology = EntitySceneRelevanceEngine.toConversationTopology(scene, dialogueIntent());
	assert.equal(topology.version, 1);
	assert.equal(topology.conversationActive, true);
	assert.equal(topology.activeSpeakerId, 'speaker');
	assert.equal(topology.participants.find((entry) => entry.entityId === 'speaker')?.role, 'PRIMARY_SPEAKER');
	assert.equal(topology.participants.find((entry) => entry.entityId === 'listener')?.role, 'OVERHEARER');
	assert.equal(topology.participants.find((entry) => entry.entityId === 'background')?.role, 'OVERHEARER');
	const absent = topology.participants.find((entry) => entry.entityId === 'absent');
	assert.equal(absent?.role, 'EXCLUDED');
	assert.equal(absent?.signals.canHear, false);
	assert.equal(absent?.signals.canSee, false);
});

test('N15 preserves explicit interruption semantics deterministically', () => {
	const scene = makeSituation();
	const intent = { ...dialogueIntent(), originalText: 'I interrupt the Captain.' };
	const topology = EntitySceneRelevanceEngine.toConversationTopology(scene, intent);
	assert.equal(topology.participants.find((entry) => entry.entityId === 'speaker')?.role, 'INTERRUPTER');
});

test('N15 fallback is bounded with no visible entities', () => {
	const scene = makeSituation({ nearbyEntities: [] });
	const topology = EntitySceneRelevanceEngine.toConversationTopology(scene, dialogueIntent());
	assert.deepEqual(topology.participants, []);
	assert.match(topology.fallbackReason || '', /No visible non-player entities/);
	assert.equal(topology.expiresAfterNarration, true);
});

test('N15 prompt projection excludes hidden participants and keeps canonical boundary explicit', () => {
	const scene = makeSituation();
	const topology: SocialConversationTopology = EntitySceneRelevanceEngine.toConversationTopology(scene, dialogueIntent());
	const prompt = EntitySceneRelevanceEngine.toConversationPromptContext(topology);
	assert.match(prompt, /N15 SOCIAL ATTENTION/);
	assert.match(prompt, /PRIMARY_SPEAKER/);
	assert.match(prompt, /OVERHEARER/);
	assert.match(prompt, /does not mutate canonical social state/);
});

test('N15 integrates through NarrativeDirector without persistence', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n15-director';
	repository.seedStory(storyId);
	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I ask the Lantern Guard what happened at the gate.',
		worldRepo: repository,
	});
	const intent = {
		action: 'ask',
		goal: 'learn what happened',
		interactionMode: 'DIALOGUE' as const,
		speechIntent: true,
		movementIntent: false,
		observationIntent: false,
		explicitTargets: [],
		impliedTargets: [],
		informationGoal: 'what happened at the gate',
		confidence: 1,
		source: 'DETERMINISTIC' as const,
		originalText: 'I ask the Lantern Guard what happened at the gate.',
	};
	const research = NarrativeResearchPipeline.research({
		repository,
		storyId,
		currentSituation: situation,
		playerIntent: intent,
		playerAction: intent.originalText,
	});
	const before = repository.getCanonicalCommandEvents(storyId).length;
	const plan = NarrativeDirector.create({ repository, storyId, situation, intent, research });
	const after = repository.getCanonicalCommandEvents(storyId).length;
	assert.equal(after, before);
	assert.equal(plan.socialTopology?.version, 1);
	assert.match(NarrativeDirector.toPromptContext(plan), /N15 SOCIAL ATTENTION/);
});

test('N15 is safe when dialogue and topic context are absent', () => {
	const scene = makeSituation({ activeDialogue: undefined, nearbyEntities: [
		{ id: 'observer', name: 'Observer', kind: 'NPC', locationId: 'loc', presence: 'present', isAlive: true, distanceBand: 'SAME_LOCATION', importance: 0.1, explicitlyReferenced: false, visibleToPlayer: true },
	] });
	const intent = {
		...dialogueIntent(),
		speechIntent: false,
		interactionMode: 'PASSIVE_OBSERVATION' as const,
		originalText: 'I observe the room.',
		explicitTargets: [],
	};
	const topology = EntitySceneRelevanceEngine.toConversationTopology(scene, intent);
	assert.equal(topology.conversationActive, false);
	assert.equal(topology.participants[0]?.role, 'OBSERVER');
});
