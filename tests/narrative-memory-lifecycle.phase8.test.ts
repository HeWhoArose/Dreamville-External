import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeMemoryLifecycle } from '../server/domain/narrativeMemoryLifecycle';

function setup() {
	const repository = new WorldRepository({ disablePersistence: true });
	repository.seedStory('memory-story');
	const player = repository.getPlayerLifecycle('memory-story')!;
	const situation = CurrentSituationBuilder.build({
		storyId: 'memory-story',
		playerAction: 'I investigate the strange fissure.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});
	return { repository, player, situation };
}

test('Phase 8 promotes durable factual candidates and links them to location', () => {
	const { repository, player, situation } = setup();
	const result = NarrativeMemoryLifecycle.processTurn({
		repository,
		storyId: 'memory-story',
		turnId: 'turn-8',
		playerAction: 'I investigate the strange fissure.',
		currentSituation: situation,
		turnPackage: {
			narrative: ['You inspect the stone edge of the fissure.'],
			dialogue: [],
			events: ['The fissure emits an unstable pulse.'],
			stateChanges: [],
			memoryCandidates: ['You discovered that the fissure emits an unstable pulse.'],
			audioCues: [],
		},
	});
	assert.equal(result.promotedMemoryIds.length, 1);
	const memory = repository.getMemoryEngine('memory-story').getMemory(result.promotedMemoryIds[0]);
	assert.equal(memory?.relatedLocationId, situation.location.id);
	assert.equal(memory?.subjectEntityId, player.actorId);
});

test('Phase 8 does not promote decorative prose as durable memory', () => {
	const { repository, situation } = setup();
	const result = NarrativeMemoryLifecycle.processTurn({
		repository,
		storyId: 'memory-story',
		turnId: 'turn-decorative',
		playerAction: 'I look around.',
		currentSituation: situation,
		turnPackage: {
			narrative: ['The courtyard glows beautifully in golden light.'],
			dialogue: [],
			events: [],
			stateChanges: [],
			memoryCandidates: ['The courtyard is breathtaking and golden.'],
			audioCues: [],
		},
	});
	assert.equal(result.promotedMemoryIds.length, 0);
});

test('Phase 8 records durable context history for the next Current Situation build', () => {
	const { repository, situation } = setup();
	NarrativeMemoryLifecycle.processTurn({
		repository,
		storyId: 'memory-story',
		turnId: 'turn-history',
		playerAction: 'I inspect the fissure.',
		currentSituation: situation,
		turnPackage: {
			narrative: ['You inspect the fissure.'],
			dialogue: [],
			events: ['Fissure inspected.'],
			stateChanges: [],
			memoryCandidates: [],
			audioCues: [],
		},
	});
	const next = CurrentSituationBuilder.build({
		storyId: 'memory-story',
		playerAction: 'I continue investigating.',
		viewerActorId: situation.player.actorId,
		worldRepo: repository,
	});
	assert.ok(next.recentTurns.some((turn) => turn.turnId === 'turn-history'));
});

test('Phase 8 preserves unresolved thread records across turns', () => {
	const { repository, situation } = setup();
	NarrativeMemoryLifecycle.processTurn({
		repository,
		storyId: 'memory-story',
		turnId: 'turn-thread',
		playerAction: 'I investigate.',
		currentSituation: situation,
		turnPackage: {
			narrative: ['You search the area for clues.'],
			dialogue: [],
			events: [],
			stateChanges: [],
			memoryCandidates: ['The origin of the fissure remains unknown and requires investigation.'],
			audioCues: [],
		},
	});
	const next = CurrentSituationBuilder.build({
		storyId: 'memory-story',
		playerAction: 'I keep investigating.',
		viewerActorId: situation.player.actorId,
		worldRepo: repository,
	});
	assert.ok(next.openThreads.some((thread) => thread.title.includes('origin of the fissure')));
});
