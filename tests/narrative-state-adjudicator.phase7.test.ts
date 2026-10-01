import test from 'node:test';
import assert from 'node:assert/strict';
import { NarrativeStateAdjudicator } from '../server/domain/narrativeStateAdjudicator';
import { WorldRepository } from '../server/repositories/worldRepository';

function setup() {
	const repository = new WorldRepository({ disablePersistence: true });
	repository.seedStory('state-story');
	const player = repository.getPlayerLifecycle('state-story')!;
	const conditionEngine = repository.getConditionEngine('state-story');
	conditionEngine.seedActor(player.actorId, { healthCurrent: 20, healthMax: 30 });
	return { repository, player };
}

function baseParams(repository: WorldRepository, player: any, stateChanges: any[]) {
	return {
		repository,
		storyId: 'state-story',
		turnId: 'turn-1',
		actorId: player.actorId,
		playerIntent: {
			action: 'attack_or_defend',
			interactionMode: 'COMBAT',
			speechIntent: false,
			movementIntent: false,
			observationIntent: false,
			explicitTargets: [],
			impliedTargets: [],
			confidence: 0.9,
			source: 'DETERMINISTIC',
			originalText: 'I attack.',
		},
		currentSituation: { player: { actorId: player.actorId } },
		turnPackage: {
			narrative: ['The attack lands.'],
			dialogue: [],
			events: [],
			stateChanges,
			memoryCandidates: [],
			audioCues: [],
		},
	} as any;
}

test('Phase 7 rejects AI health mutation without canonical mechanic authorization', () => {
	const { repository, player } = setup();
	const result = NarrativeStateAdjudicator.adjudicate(baseParams(repository, player, [
		{ kind: 'HEALTH', targetId: player.actorId, value: 30 },
	]));
	assert.equal(result.approvedCount, 0);
	assert.equal(result.rejectedCount, 1);
	assert.equal(result.outcomes[0].committed, false);
});

test('Phase 7 approves a bounded canonical health proposal and commits it transactionally', () => {
	const { repository, player } = setup();
	const proposal = {
		kind: 'HEALTH',
		targetId: player.actorId,
		value: 25,
	};
	const adjudication = NarrativeStateAdjudicator.adjudicate({
		...baseParams(repository, player, [proposal]),
		verifiedCanonicalChanges: [proposal],
	});
	assert.equal(adjudication.approvedCount, 1);
	const committed = NarrativeStateAdjudicator.commit(repository, adjudication);
	assert.equal(committed.committedCount, 1);
	assert.equal(repository.getConditionEngine('state-story').getActorState(player.actorId)?.healthCurrent, 25);
	assert.equal(committed.commitRecords[0].transactionMode, 'OUTER_STAGED_TRANSACTION');
});

test('Phase 7 rejects out-of-bounds canonical health and does not mutate state', () => {
	const { repository, player } = setup();
	const adjudication = NarrativeStateAdjudicator.adjudicate(baseParams(repository, player, [
		{ kind: 'HEALTH', targetId: player.actorId, value: 999 },
	]));
	assert.equal(adjudication.approvedCount, 0);
	const committed = NarrativeStateAdjudicator.commit(repository, adjudication);
	assert.equal(committed.committedCount, 0);
	assert.equal(repository.getConditionEngine('state-story').getActorState(player.actorId)?.healthCurrent, 20);
});

test('Phase 7 keeps rejected location proposals from mutating canonical state', () => {
	const { repository, player } = setup();
	const before = player.locationId;
	const adjudication = NarrativeStateAdjudicator.adjudicate(baseParams(repository, player, [
		{ kind: 'LOCATION', targetId: 'somewhere-else', value: 'move' },
	]));
	NarrativeStateAdjudicator.commit(repository, adjudication);
	assert.equal(repository.getPlayerLifecycle('state-story')?.locationId, before);
});
