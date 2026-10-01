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


test('Phase 8 does not promote memory candidates from a rejected narrative review', () => {
	const { repository, situation } = setup();
	const result = NarrativeMemoryLifecycle.processTurn({
		repository,
		storyId: 'memory-story',
		turnId: 'turn-rejected',
		playerAction: 'I investigate.',
		currentSituation: situation,
		narrativeReview: {
			decision: 'REJECT',
			violations: [],
			missingRequirements: [],
			unsupportedClaims: [],
			playerAgencyViolation: false,
			semanticMismatch: true,
			source: 'DETERMINISTIC',
			confidence: 1,
		},
		turnPackage: {
			narrative: ['Rejected narrative.'],
			dialogue: [],
			events: ['A rejected event.'],
			stateChanges: [],
			memoryCandidates: ['The fissure definitely opened a hidden passage beneath the archive.'],
			audioCues: [],
		},
	});
	assert.equal(result.promotedMemoryIds.length, 0);
});

test('Phase 8 rejects durable candidates that contain unauthorized world-truth anchors', () => {
	const { repository, situation } = setup();
	situation.worldFacts = [{
		subjectEntityId: 'villain',
		predicate: 'location',
		objectValue: 'beneath the hidden city',
	}];
	situation.playerKnowledge.knownFacts = [];
	const result = NarrativeMemoryLifecycle.processTurn({
		repository,
		storyId: 'memory-story',
		turnId: 'turn-hidden-memory',
		playerAction: 'I investigate.',
		currentSituation: situation,
		turnPackage: {
			narrative: ['You search for clues.'],
			dialogue: [],
			events: [],
			stateChanges: [],
			memoryCandidates: ['You discovered that the villain is beneath the hidden city.'],
			audioCues: [],
		},
	});
	assert.equal(result.promotedMemoryIds.length, 0);
});

test('Phase 8 does not turn an uneventful player action into a plot transcript beat', () => {
	const { repository, situation } = setup();
	const before = repository.getStoryRun('memory-story')?.runtimeState?.plot?.beats?.length || 0;
	NarrativeMemoryLifecycle.processTurn({
		repository,
		storyId: 'memory-story',
		turnId: 'turn-no-canon',
		playerAction: 'I walk around the courtyard.',
		currentSituation: situation,
		turnPackage: {
			narrative: ['You walk around the courtyard.'],
			dialogue: [],
			events: [],
			stateChanges: [],
			memoryCandidates: [],
			audioCues: [],
		},
	});
	const after = repository.getStoryRun('memory-story')?.runtimeState?.plot?.beats?.length || 0;
	assert.equal(after, before);
});


test('Phase 8 does not resolve an open thread from a negated resolution statement', () => {
	const { repository, situation } = setup();
	NarrativeMemoryLifecycle.processTurn({
		repository,
		storyId: 'memory-story',
		turnId: 'turn-open-thread',
		playerAction: 'I investigate.',
		currentSituation: situation,
		turnPackage: {
			narrative: ['The origin of the fissure was not resolved and remains unknown.'],
			dialogue: [],
			events: [],
			stateChanges: [],
			memoryCandidates: ['The origin of the fissure remains unknown and requires investigation.'],
			audioCues: [],
		},
	});
	const run = repository.getStoryRun('memory-story');
	const threads = run?.runtimeState?.openNarrativeThreads || [];
	assert.ok(threads.some((thread: any) => thread.status === 'OPEN' && thread.title.includes('origin of the fissure')));
});


test('Phase 8 never promotes AI event text into a durable plot beat without a committed canonical consequence', () => {
	const { repository, situation } = setup();
	const before = repository.getStoryRun('memory-story')?.runtimeState?.plot?.beats?.length || 0;
	const result = NarrativeMemoryLifecycle.processTurn({
		repository,
		storyId: 'memory-story',
		turnId: 'turn-ai-event-only',
		playerAction: 'I inspect the fissure.',
		currentSituation: situation,
		turnPackage: {
			narrative: ['You inspect the fissure.'],
			dialogue: [],
			events: ['The hidden chamber opens beneath the archive.'],
			stateChanges: [],
			memoryCandidates: [],
			audioCues: [],
		},
	});
	const after = repository.getStoryRun('memory-story')?.runtimeState?.plot?.beats?.length || 0;
	assert.equal(result.plotBeatId, undefined);
	assert.equal(after, before);
});

test('Phase 8 creates a plot beat only from a committed canonical state consequence', () => {
	const { repository, situation } = setup();
	const result = NarrativeMemoryLifecycle.processTurn({
		repository,
		storyId: 'memory-story',
		turnId: 'turn-canonical-consequence',
		playerAction: 'I use the authorized mechanism.',
		currentSituation: situation,
		stateAdjudication: {
			turnId: 'turn-canonical-consequence',
			storyId: 'memory-story',
			actorId: situation.player.actorId,
			allApproved: true,
			approvedCount: 1,
			rejectedCount: 0,
			committedCount: 1,
			rolledBack: false,
			outcomes: [],
			commitRecords: [{
				commandId: 'canonical-1',
				kind: 'HEALTH',
				targetId: situation.player.actorId,
				transactionMode: 'OUTER_STAGED_TRANSACTION',
				source: 'AI_PROPOSAL',
			}],
		},
		turnPackage: {
			narrative: ['The authorized effect takes hold.'],
			dialogue: [],
			events: ['Decorative AI event claim.'],
			stateChanges: [],
			memoryCandidates: [],
			audioCues: [],
		},
	});
	assert.ok(result.plotBeatId);
	const beats = repository.getStoryRun('memory-story')?.runtimeState?.plot?.beats || [];
	assert.ok(beats.some((beat: any) => beat.id === result.plotBeatId));
});

test('Phase 8 does not close a thread when the narration says it is no longer resolved', () => {
	const { repository, situation } = setup();
	NarrativeMemoryLifecycle.processTurn({
		repository,
		storyId: 'memory-story',
		turnId: 'turn-no-longer-resolved',
		playerAction: 'I investigate.',
		currentSituation: situation,
		turnPackage: {
			narrative: ['The origin of the fissure is no longer resolved; the evidence is uncertain.'],
			dialogue: [],
			events: [],
			stateChanges: [],
			memoryCandidates: ['The origin of the fissure remains unknown and requires investigation.'],
			audioCues: [],
		},
	});
	const threads = repository.getStoryRun('memory-story')?.runtimeState?.openNarrativeThreads || [];
	assert.ok(threads.some((thread: any) => thread.status === 'OPEN' && thread.title.includes('origin of the fissure')));
});
