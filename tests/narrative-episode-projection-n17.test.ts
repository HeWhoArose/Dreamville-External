import test from 'node:test';
import assert from 'node:assert/strict';

import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeEpisodeProjectionEngine } from '../server/domain/narrativeEpisodeProjection';
import { NarrativeContinuityStateEngine } from '../server/domain/narrativeContinuityState';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function intent(overrides: Record<string, any> = {}) {
	return {
		action: 'investigate',
		goal: 'investigate the fissure',
		interactionMode: 'EXPLORATION',
		speechIntent: false,
		movementIntent: false,
		observationIntent: true,
		informationGoal: undefined,
		explicitTargets: [],
		impliedTargets: [],
		confidence: 1,
		source: 'DETERMINISTIC',
		originalText: 'I investigate the fissure.',
		...overrides,
	};
}

function continuity(situation: any, overrides: Record<string, any> = {}) {
	return {
		...NarrativeContinuityStateEngine.defaultState(situation.storyId),
		tension: 30,
		sceneMomentum: 'BUILDING',
		emotionalTemperature: 'STEADY',
		...overrides,
	};
}

test('N17 projects development from accepted-turn history and active thread without mutating canonical state', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n17-projection';
	repository.seedStory(storyId);
	const player = repository.getPlayerLifecycle(storyId)!;
	const run = repository.getStoryRun(storyId)!;

	run.runtimeState = {
		...(run.runtimeState || {}),
		openNarrativeThreads: [{
			id: 'thread-fissure',
			title: 'Determine the origin of the fissure',
			summary: 'The fissure source remains unknown.',
			status: 'OPEN',
			priority: 85,
			lastTouchedAt: 'cycle-1',
		}],
		narrativeContextHistory: [
			{
				turnId: 'turn-1',
				turnNumber: 1,
				playerAction: 'I approach the fissure.',
				narration: 'You reach the fractured stone and notice a pulse beneath the surface.',
				worldTime: 'Afternoon',
				locationId: player.locationId,
				stateChanges: [],
				unresolvedConsequence: 'The source of the pulse remains unknown.',
				isOpeningScene: false,
			},
			{
				turnId: 'turn-2',
				turnNumber: 2,
				playerAction: 'I inspect the fissure.',
				narration: 'The pulse deepens, revealing a second fracture beneath the first.',
				worldTime: 'Afternoon',
				locationId: player.locationId,
				stateChanges: [],
				unresolvedConsequence: 'The lower fracture remains unexplored.',
				isOpeningScene: false,
			},
		],
	};
	repository.saveStoryRun(run);

	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I investigate the fissure.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});
	situation.recentTurns = run.runtimeState.narrativeContextHistory;
	situation.openThreads = [{
		id: 'thread-fissure',
		title: 'Determine the origin of the fissure',
		summary: 'The fissure source remains unknown.',
		status: 'OPEN',
		priority: 85,
		lastUpdatedAt: 'cycle-1',
	}];

	const before = JSON.stringify(repository.getStoryRun(storyId)?.runtimeState);
	const projection = NarrativeEpisodeProjectionEngine.resolve({
		situation,
		intent: intent(),
		continuityState: continuity(situation),
	});
	const after = JSON.stringify(repository.getStoryRun(storyId)?.runtimeState);

	assert.equal(after, before);
	assert.equal(projection.phase, 'DEVELOPMENT');
	assert.equal(projection.trajectory, 'BUILD');
	assert.ok(projection.activeThreadIds.includes('thread-fissure'));
	assert.ok(projection.recentBeats.length >= 2);
	assert.match(projection.centralQuestion, /fissure/i);
	assert.equal(projection.expiresAfterNarration, true);
});

test('N17 identifies escalation from high-pressure continuity and unresolved complication', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n17-escalation';
	repository.seedStory(storyId);
	const player = repository.getPlayerLifecycle(storyId)!;

	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I continue toward the fissure.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});
	situation.recentTurns = [{
		turnId: 'turn-pressure',
		turnNumber: 4,
		playerAction: 'I continue toward the fissure.',
		narration: 'The alarm sounds again, but no one can explain where the pulse is coming from.',
		worldTime: situation.worldTime,
		locationId: situation.location.id,
		stateChanges: [],
		unresolvedConsequence: 'The source remains unknown.',
		isOpeningScene: false,
	}];
	situation.openThreads = [{
		id: 'thread-pressure',
		title: 'Find the source of the alarm',
		summary: 'The source remains unknown.',
		status: 'OPEN',
		priority: 90,
	}];

	const projection = NarrativeEpisodeProjectionEngine.resolve({
		situation,
		intent: intent(),
		continuityState: continuity(situation, { tension: 82, sceneMomentum: 'ESCALATING', emotionalTemperature: 'TENSE' }),
	});

	assert.equal(projection.phase, 'ESCALATION');
	assert.equal(projection.trajectory, 'ESCALATE');
	assert.ok(projection.pressurePoints.some((value) => /tension|escalating|thread|unresolved/i.test(value)));
});

test('N17 identifies aftermath only when resolution signals and release are supported', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n17-aftermath';
	repository.seedStory(storyId);
	const player = repository.getPlayerLifecycle(storyId)!;

	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I leave the archive.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});
	situation.recentTurns = [{
		turnId: 'turn-resolution',
		turnNumber: 8,
		playerAction: 'I resolve the dispute.',
		narration: 'The dispute is resolved and both archivists are reassured before the room falls quiet.',
		worldTime: situation.worldTime,
		locationId: situation.location.id,
		stateChanges: [],
		isOpeningScene: false,
	}];
	situation.openThreads = [];

	const projection = NarrativeEpisodeProjectionEngine.resolve({
		situation,
		intent: intent({ action: 'continue', goal: 'continue', originalText: 'I leave the archive.' }),
		continuityState: continuity(situation, { tension: 22, sceneMomentum: 'RELEASING', emotionalTemperature: 'STEADY' }),
	});

	assert.equal(projection.phase, 'AFTERMATH');
	assert.equal(projection.trajectory, 'RELEASE');
	assert.ok(projection.resolutionSignals.length > 0);
});

test('N17 bounded fallback does not invent an episode when history is absent', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n17-empty';
	repository.seedStory(storyId);
	const player = repository.getPlayerLifecycle(storyId)!;
	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I look around.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});

	const projection = NarrativeEpisodeProjectionEngine.resolve({
		situation,
		intent: intent({ action: 'observe', goal: 'observe', originalText: 'I look around.' }),
		continuityState: NarrativeContinuityStateEngine.defaultState(storyId),
	});

	assert.equal(projection.phase, 'OPENING');
	assert.match(projection.fallbackReason || '', /No accepted recent-turn history/i);
	assert.ok(projection.activeThreadIds.length >= 0);
	assert.match(projection.narrativeOpportunity, /Establish the immediate scene/i);
});

test('N17 integrates through NarrativeDirector and preserves prompt visibility under compact budgets', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n17-director';
	repository.seedStory(storyId);
	const player = repository.getPlayerLifecycle(storyId)!;
	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I inspect the fissure.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});
	const playerIntent = intent();
	situation.currentAction = playerIntent as any;

	const research = NarrativeResearchPipeline.research({
		repository,
		storyId,
		currentSituation: situation,
		playerIntent: playerIntent as any,
		playerAction: playerIntent.originalText,
		viewerActorId: player.actorId,
	});
	const before = JSON.stringify(repository.getStoryRun(storyId)?.runtimeState);
	const plan = NarrativeDirector.create({
		repository,
		storyId,
		situation,
		intent: playerIntent as any,
		research,
	});
	const after = JSON.stringify(repository.getStoryRun(storyId)?.runtimeState);

	assert.equal(after, before);
	assert.equal(plan.episodeProjection?.version, 1);
	assert.equal(plan.episodeProjection?.expiresAfterNarration, true);

	const promptResult = buildNarrationPrompt({
		situation,
		intent: playerIntent as any,
		research,
		plan,
		maxPromptTokens: 2000,
	});
	assert.match(promptResult.prompt, /N17 NARRATIVE EPISODE PROJECTION/);
	assert.match(promptResult.prompt, /Phase:/i);
	assert.ok(promptResult.totalTokens <= 2000);
});

test('N17 keeps future player agency outside the projection boundary', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n17-agency';
	repository.seedStory(storyId);
	const player = repository.getPlayerLifecycle(storyId)!;
	const situation = CurrentSituationBuilder.build({
		storyId,
		playerAction: 'I ask what caused the fissure.',
		viewerActorId: player.actorId,
		worldRepo: repository,
	});
	const projection = NarrativeEpisodeProjectionEngine.resolve({
		situation,
		intent: intent({
			action: 'ask',
			goal: 'learn what caused the fissure',
			interactionMode: 'INFORMATION_SEEKING',
			speechIntent: true,
			observationIntent: false,
			informationGoal: 'what caused the fissure',
			originalText: 'I ask what caused the fissure.',
		}),
		continuityState: NarrativeContinuityStateEngine.defaultState(storyId),
	});

	assert.ok(projection.avoidForcing.some((value) => /player.*future action/i.test(value)));
	assert.ok(projection.avoidForcing.some((value) => /close.*thread|mutate.*thread/i.test(value)));
});
