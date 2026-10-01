import test from 'node:test';
import assert from 'node:assert/strict';

import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeContinuityEngine } from '../server/domain/narrativeContinuityEngine';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { PlayerLifecycleState } from '../server/domain/playerLifecycleState';
import type { KnowledgeFact } from '../server/domain/types';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function publicFact(id: string, objectValue: string, sourceType: KnowledgeFact['sourceType'] = 'rumor'): KnowledgeFact {
	const repositoryTimestamp = new InMemoryWorldRepository({ disablePersistence: true });
	const timestamp = repositoryTimestamp.getWorldClock('default_story').getTimestamp();
	return {
		id,
		subjectEntityId: 'scene_subject',
		predicate: 'reports',
		objectValue,
		sourceType,
		acquiredAtTimestamp: timestamp,
		confidence: 0.8,
		secretLevel: 'public',
		scope: 'uncertain',
		provenanceSummary: 'Phase 3 test fixture',
	};
}

function setupStory(storyId: string) {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);
	const player = repository.getPlayerLifecycle(storyId);
	assert.ok(player);

	const run = repository.getStoryRun(storyId);
	assert.ok(run);
	run.runtimeState = {
		...(run.runtimeState || {}),
		activeDialogue: {
			nodeId: 'phase3_dialogue',
			speakerId: 'phase3_speaker',
			speakerName: 'Archivist Maren',
			text: 'The archivists are whispering about unstable starlight fissures in the lower sea.',
		},
		plot: {
			storyId,
			version: 1,
			currentArc: 'WHISPERING_SPORE_SEA',
			summary: 'Investigate the starlight fissure rumors.',
			beats: [],
			openThreads: ['Investigate the starlight fissures'],
			updatedAt: 'cycle-42',
		},
	};
	repository.saveStoryRun(run);
	repository.saveStoryThread({
		storyId,
		threadId: 'phase3_fissures',
		title: 'Starlight fissure rumors',
		summary: 'Determine whether the reported fissures are real.',
		status: 'OPEN',
		priority: 'HIGH',
	});
	repository.addKnowledgeFact(storyId, publicFact('phase3_rumor_fissures', 'People report unstable starlight fissures in the lower sea.'));
	repository.addKnowledgeFact(storyId, publicFact('phase3_unrelated_trade', 'A trade caravan was delayed three valleys away.'));
	repository.addKnowledgeFact(storyId, {
		...publicFact('phase3_hidden_secret', 'The sealed vault contains the hidden star map.'),
		secretLevel: 'cosmic_secret',
		sourceType: 'system_grant',
	});
	return { repository, player: player };
}

test('Phase 3 retrieves the current rumor and active thread while staying scene-bound', () => {
	const storyId = 'phase3_research_relevance';
	const { repository, player } = setupStory(storyId);
	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I move closer to hear the rumors.',
		currentAction: undefined,
		viewerActorId: player.actorId,
		worldRepo: repository,
	});
	const result = NarrativeResearchPipeline.research({
		repository,
		storyId,
		currentSituation: situation,
		playerAction: 'I move closer to hear the rumors.',
		viewerActorId: player.actorId,
	});

	assert.ok(result.blocks.some((block) => block.kind === 'SCENE' && /fissures/i.test(block.content)));
	assert.ok(result.blocks.some((block) => block.kind === 'THREAD' && /starlight fissure/i.test(block.content)));
	assert.ok(result.blocks.some((block) => block.kind === 'KNOWLEDGE' && /starlight fissures/i.test(block.content)));
	assert.equal(result.blocks.some((block) => /trade caravan was delayed/i.test(block.content)), false);
	assert.equal(result.blocks.some((block) => /hidden star map/i.test(block.content)), false);
});

test('Phase 3 excludes unrelated knowledge with an explicit exclusion reason', () => {
	const storyId = 'phase3_research_exclusion';
	const { repository, player } = setupStory(storyId);
	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I listen for reports about the fissures.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});
	const result = NarrativeResearchPipeline.research({
		repository,
		storyId,
		currentSituation: situation,
		playerAction: 'I listen for reports about the fissures.',
		viewerActorId: player.actorId,
	});

	const unrelated = result.excluded.find((item) => /trade caravan/i.test(item.label));
	assert.ok(unrelated);
	assert.match(unrelated.reason, /not relevant/i);
});

test('Phase 3 gives explicit visible entity references high retrieval priority', () => {
	const storyId = 'phase3_entity_priority';
	const { repository, player } = setupStory(storyId);
	repository.updateNpcLifecycle(storyId, new PlayerLifecycleState({
		actorId: 'phase3_archivist',
		name: 'Archivist Maren',
		locationId: player.locationId,
		lastUpdatedTime: player.lastUpdatedTime,
		currentActivity: 'whispering with the archivists',
	}));
	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I listen to Archivist Maren.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});
	const intent = {
		action: 'listen_and_observe',
		goal: 'gather_information',
		target: {
			id: 'phase3_archivist',
			name: 'Archivist Maren',
			kind: 'NPC',
			source: 'EXPLICIT' as const,
		},
		interactionMode: 'PASSIVE_OBSERVATION' as const,
		speechIntent: false,
		movementIntent: false,
		observationIntent: true,
		informationGoal: 'what Archivist Maren knows about the fissures',
		explicitTargets: [{
			id: 'phase3_archivist',
			name: 'Archivist Maren',
			kind: 'NPC',
			source: 'EXPLICIT' as const,
		}],
		impliedTargets: [],
		confidence: 0.95,
		source: 'DETERMINISTIC' as const,
		originalText: 'I listen to Archivist Maren.',
	};
	const result = NarrativeResearchPipeline.research({
		repository,
		storyId,
		currentSituation: situation,
		playerIntent: intent,
		playerAction: intent.originalText,
		viewerActorId: player.actorId,
	});

	const entity = result.blocks.find((block) => block.kind === 'ENTITY' && block.sourceId === 'phase3_archivist');
	assert.ok(entity);
	assert.equal(entity.relevanceScore >= 0.99, true);
});

test('Phase 3 research failure falls back to bounded Current Situation context', () => {
	const storyId = 'phase3_research_failure';
	const { repository, player } = setupStory(storyId);
	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I listen.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});

	const original = NarrativeContinuityEngine.research;
	try {
		(NarrativeContinuityEngine as any).research = () => {
			throw new Error('simulated research store outage');
		};
		const result = NarrativeResearchPipeline.research({
			repository,
			storyId,
			currentSituation: situation,
			playerAction: 'I listen.',
			viewerActorId: player.actorId,
		});
		assert.equal(result.failures.length, 1);
		assert.match(result.failures[0], /simulated research store outage/i);
		assert.ok(result.blocks.some((block) => block.kind === 'SCENE'));
		assert.match(result.promptContext, /Knowledge boundary/i);
	} finally {
		(NarrativeContinuityEngine as any).research = original;
	}
});
