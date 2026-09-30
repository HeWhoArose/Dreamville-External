import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository, worldRepository } from '../server/repositories/worldRepository';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

test('narration continuity rejects a current action that is silently replaced by unrelated prose', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'narration_action_regression';
	repository.seedStory(storyId);
	const orchestrator = new MultiModelOrchestrator(repository);

	const missingAction = (orchestrator as any).validateNarrativeActionContinuity(
		'First light washes over the archive as the character considers what might happen next.',
		'I find a place to sit and examine the scroll.',
	);
	assert.equal(missingAction.valid, false);
	assert.match(missingAction.errorReason, /sitting|settling|action-continuity/i);

	const missingTarget = (orchestrator as any).validateNarrativeActionContinuity(
		'You settle into the quiet corner and study the surroundings.',
		'I find a place to sit and examine the scroll.',
	);
	assert.equal(missingTarget.valid, false);
	assert.match(missingTarget.errorReason, /scroll|target/i);

	const correctAction = (orchestrator as any).validateNarrativeActionContinuity(
		'You settle beside the archive shelves, unfolding the scroll and studying the runes across its fragile surface.',
		'I find a place to sit and examine the scroll.',
	);
	assert.equal(correctAction.valid, true);
});

test('narration continuity rejects information-seeking turns that stop at atmosphere', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'narration_information_regression';
	repository.seedStory(storyId);
	const orchestrator = new MultiModelOrchestrator(repository);

	const action = 'I move down to the crowd to inquire about the rumors.';
	const incomplete = (orchestrator as any).validateNarrativeInformationContinuity(
		'Aelion moves into the crowd and asks about the rumors. The amber light settles across the timber as the words fade into the evening air.',
		action,
	);
	assert.equal(incomplete.valid, false);
	assert.match(incomplete.errorReason, /information-continuity|grounded answer|information/i);

	const grounded = (orchestrator as any).validateNarrativeInformationContinuity(
		'Aelion moves into the crowd and asks what people have heard about the rumors. Several root-trappers answer that the reports concern unstable starlight fissures deeper in the Whispering Spore-Sea, though none claims to have seen the phenomenon directly.',
		action,
	);
	assert.equal(grounded.valid, true);

	const groundedNonAnswer = (orchestrator as any).validateNarrativeInformationContinuity(
		'Aelion moves into the crowd and asks about the rumors, but the people nearby offer only conflicting hearsay and no reliable account.',
		action,
	);
	assert.equal(groundedNonAnswer.valid, true);
});

test('narration continuity rejects contradictory time-of-day language', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'narration_time_regression';
	repository.seedStory(storyId);
	const orchestrator = new MultiModelOrchestrator(repository);

	const state = repository.getWorldClock(storyId).getState();
	assert.equal(state.currentDayPhase, 'Afternoon');

	const contradiction = (orchestrator as any).validateNarrativeTemporalContinuity(
		'First light breaks over the archive, and the morning chill settles across the stone.',
		repository,
		storyId,
	);
	assert.equal(contradiction.valid, false);
	assert.match(contradiction.errorReason, /canonical world time|Afternoon|first light/i);

	const valid = (orchestrator as any).validateNarrativeTemporalContinuity(
		'The waning afternoon light stretches long shadows across the archive stones.',
		repository,
		storyId,
	);
	assert.equal(valid.valid, true);
});

test('canonical action turn numbers increment independently from world calendar cycle', async () => {
	const storyId = 'turn_number_regression';
	worldRepository.seedStory(storyId);

	const { serverMockAuthority } = await import('../server/mockEngine/serverMockAuthority');
	serverMockAuthority.processAction({ type: 'CUSTOM_ACTION', actionText: 'I breathe.', storyId } as any);
	serverMockAuthority.processAction({ type: 'CUSTOM_ACTION', actionText: 'I sit.', storyId } as any);
	serverMockAuthority.processAction({ type: 'CUSTOM_ACTION', actionText: 'I examine the scroll.', storyId } as any);

	const history = serverMockAuthority.getSanitizedViewState(storyId).actionHistory;
	assert.equal(history[0].turnNumber, 3);
	assert.equal(history[1].turnNumber, 2);
	assert.equal(history[2].turnNumber, 1);
	assert.equal(history[0].cycle, history[1].cycle);
	assert.equal(history[1].cycle, history[2].cycle);
});
