import test from 'node:test';
import assert from 'node:assert/strict';

import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { formatCanonicalTimestamp } from '../server/domain/deterministicRng';
import { PlayerLifecycleState } from '../server/domain/playerLifecycleState';
import type { KnowledgeFact, WorldTimestamp } from '../server/domain/types';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function makeKnowledgeFact(
	id: string,
	secretLevel: KnowledgeFact['secretLevel'],
	timestamp: WorldTimestamp,
): KnowledgeFact {
	return {
		id,
		subjectEntityId: 'entity_test_subject',
		predicate: 'knows',
		objectValue: id === 'fact_public' ? 'The archive gate is open.' : 'The sealed vault contains a hidden star map.',
		sourceType: id === 'fact_public' ? 'witnessed' : 'system_grant',
		acquiredAtTimestamp: timestamp,
		confidence: 1,
		secretLevel,
		scope: 'exact',
		provenanceSummary: 'Phase 1 regression fixture',
	};
}

test('current situation uses canonical current location, nearby NPCs, and world time', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase1_location_regression';
	repository.seedStory(storyId);

	const player = repository.getPlayerLifecycle(storyId);
	assert.ok(player);

	const npc = new PlayerLifecycleState({
		actorId: 'npc_phase1_visible',
		name: 'Visible Archivist',
		locationId: player.locationId,
		lastUpdatedTime: player.lastUpdatedTime,
		currentActivity: 'working',
	});
	repository.updateNpcLifecycle(storyId, npc);

	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I look around the archive.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});

	assert.equal(situation.location.id, player.locationId);
	assert.equal(situation.player.locationId, player.locationId);
	assert.ok(situation.nearbyEntities.some((entity) => entity.id === 'npc_phase1_visible'));
	assert.equal(
		situation.worldTime,
		formatCanonicalTimestamp(repository.getWorldClock(storyId).getTimestamp()),
	);
});

test('current situation excludes hidden and non-present entities from visible nearby context', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase1_entity_visibility_regression';
	repository.seedStory(storyId);

	const player = repository.getPlayerLifecycle(storyId);
	assert.ok(player);

	const hidden = repository.getEntityCards(storyId)[0];
	assert.ok(hidden, 'Seed story should contain at least one entity card for this regression.');
	repository.saveEntityCard(storyId, {
		...hidden,
		id: 'entity_phase1_hidden',
		name: 'Hidden Observer',
		worldState: {
			...hidden.worldState,
			locationId: player.locationId,
			presence: 'present',
			isAlive: true,
		},
		lifecycle: {
			...hidden.lifecycle,
			status: 'ACTIVE',
		},
		metadata: {
			...hidden.metadata,
			hidden: true,
		},
	});

	const otherLocationNpc = new PlayerLifecycleState({
		actorId: 'npc_phase1_elsewhere',
		name: 'Distant Guard',
		locationId: 'loc_lantern_vault',
		lastUpdatedTime: player.lastUpdatedTime,
		currentActivity: 'patrolling',
	});
	repository.updateNpcLifecycle(storyId, otherLocationNpc);

	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I observe the area.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});

	assert.equal(situation.nearbyEntities.some((entity) => entity.id === 'entity_phase1_hidden'), false);
	assert.equal(situation.nearbyEntities.some((entity) => entity.id === 'npc_phase1_elsewhere'), false);
});

test('current situation keeps player knowledge separate from authoritative world facts', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase1_epistemic_boundary_regression';
	repository.seedStory(storyId);

	const player = repository.getPlayerLifecycle(storyId);
	assert.ok(player);
	const timestamp = repository.getWorldClock(storyId).getTimestamp();

	repository.addKnowledgeFact(storyId, makeKnowledgeFact('fact_public', 'public', timestamp));
	repository.addKnowledgeFact(storyId, makeKnowledgeFact('fact_secret', 'cosmic_secret', timestamp));

	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I inspect what I already know.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});

	assert.ok(situation.playerKnowledge.knownFacts.some((fact) => fact.id === 'fact_public'));
	assert.equal(situation.playerKnowledge.knownFacts.some((fact) => fact.id === 'fact_secret'), false);
	assert.ok(situation.worldFacts.some((fact) => fact.id === 'fact_secret'));
});

test('current situation uses active dialogue and bounded recent turns instead of stale opening narration', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase1_temporal_context_regression';
	repository.seedStory(storyId);

	const run = repository.getStoryRun(storyId);
	assert.ok(run);
	run.openingScene = {
		...(run.openingScene || {}),
		narrativeText: 'STALE OPENING SCENE THAT MUST NOT BECOME CURRENT TURN CONTEXT',
	};
	run.runtimeState = {
		...(run.runtimeState || {}),
		activeDialogue: {
			nodeId: 'dialogue_phase1',
			speakerId: 'npc_phase1_dialogue',
			speakerName: 'Maren',
			text: 'The archivists are still discussing the fissures.',
			epistemicNote: 'Observed directly.',
		},
		narrativeContextHistory: [
			{
				actionId: 'turn_1',
				turnNumber: 1,
				playerAction: 'I entered the archive.',
				narration: { response: 'The archive doors close behind you.' },
				capturedAt: 'cycle-42-turn-1',
			},
			{
				actionId: 'turn_2',
				turnNumber: 2,
				playerAction: 'I move closer and listen.',
				narration: { response: 'You hear the archivists speaking in low voices.' },
				capturedAt: 'cycle-42-turn-2',
			},
		],
		plot: {
			storyId,
			version: 2,
			currentArc: 'WHISPERING_SPORE_SEA',
			summary: 'The player is investigating rumors.',
			beats: [],
			openThreads: ['Investigate the starlight fissures'],
			updatedAt: 'cycle-42-turn-2',
		},
	};
	repository.saveStoryRun(run);
	repository.saveStoryThread({
		storyId,
		threadId: 'thread_fissures',
		title: 'Starlight fissure rumors',
		summary: 'Determine whether the reported fissures are real.',
		status: 'OPEN',
		priority: 'HIGH',
	});

	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I move closer to hear the rumors.',
		worldRepo: repository,
	});

	assert.equal(situation.activeDialogue?.speakerName, 'Maren');
	assert.match(situation.activeDialogue?.text || '', /fissures/i);
	assert.deepEqual(
		situation.recentTurns.map((turn) => turn.turnNumber),
		[1, 2],
	);
	assert.equal(
		situation.recentTurns.some((turn) => (turn.narration || '').includes('STALE OPENING SCENE')),
		false,
	);
	assert.ok(situation.openThreads.some((thread) => thread.id === 'thread_fissures'));
	assert.ok(situation.openThreads.some((thread) => thread.title.includes('Investigate the starlight fissures')));
});

test('working context exposes the same current situation object used by downstream narrative consumers', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase1_working_context_integration';
	repository.seedStory(storyId);

	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I inspect the current archive.',
		worldRepo: repository,
	});

	const { WorkingContextEngine } = require('../server/domain/workingContextEngine') as typeof import('../server/domain/workingContextEngine');
	const workingContext = WorkingContextEngine.assembleTurnContext({
		storyId,
		playerAction: 'I inspect the current archive.',
		worldRepo: repository,
		hardTokenBudget: 900,
	});

	assert.equal(workingContext.currentSituation.location.id, situation.location.id);
	assert.equal(workingContext.currentSituation.player.locationId, situation.player.locationId);
	assert.ok(workingContext.chunks.some((chunk) => chunk.id === 'b1_current_situation'));
	assert.match(workingContext.assembledText, /CURRENT SITUATION/i);
});
