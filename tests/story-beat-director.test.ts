import test from 'node:test';
import assert from 'node:assert/strict';

import { StoryBeatDirector } from '../server/domain/storyBeatDirector';
import { SceneCompositionEngine } from '../server/domain/sceneComposition';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';
import { actionResolutionFromCombat } from '../server/domain/actionResolution';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import type { ActionResolution } from '../server/domain/actionResolution';
import type { CombatNarrativeResolution } from '../src/types';

function resolution(overrides: Partial<ActionResolution> = {}): ActionResolution {
	return {
		resolutionId: 'resolution_story_beat',
		storyId: 'story_beat',
		turnId: 'turn_1',
		playerAction: 'I move toward the trench.',
		playerIntent: {
			action: 'move',
			interactionMode: 'MOVEMENT',
			movementIntent: true,
			observationIntent: false,
			speechIntent: false,
			targetIds: [],
		},
		attemptedEffect: 'Move toward the trench.',
		targetEntityIds: [],
		resolutionMethod: 'DETERMINISTIC',
		outcomeTier: 'CLEAN_SUCCESS',
		actualEffect: 'The player moves closer to the Trench of Echoes.',
		canonicalStateChanges: [{
			kind: 'SPATIAL',
			targetId: 'player',
			value: { localSpatialState: { proximityBand: 'NEAR', focusEntityId: 'trench', focusLabel: 'Trench of Echoes' } },
		}],
		physicalConsequences: ['The player is now near the Trench of Echoes.'],
		playerVisibleConsequences: ['The player is now near the Trench of Echoes.'],
		evidenceIds: ['event_1'],
		uncertainty: ['The source of the disturbance remains unknown.'],
		provenance: { source: 'CANONICAL_ENGINE' },
		...overrides,
	};
}

function intent(overrides: Partial<ReturnType<typeof PlayerIntentInterpreter.deterministic>> = {}) {
	return {
		action: 'move',
		goal: 'change_position_or_approach_target',
		interactionMode: 'MOVEMENT' as const,
		speechIntent: false,
		movementIntent: true,
		observationIntent: false,
		explicitTargets: [],
		impliedTargets: [],
		confidence: 0.9,
		source: 'DETERMINISTIC' as const,
		originalText: 'I move toward the trench.',
		...overrides,
	};
}

test('StoryBeatDirector turns canonical movement resolution into meaningful change', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('story_beat');
	const situation = CurrentSituationBuilder.build({ storyId: 'story_beat', playerAction: 'I move toward the trench.', worldRepo: repository });
	const beat = StoryBeatDirector.resolve({ situation, intent: intent(), actionResolution: resolution() });

	assert.equal(beat.beatType, 'APPROACH');
	assert.match(beat.meaningfulChange, /near the Trench of Echoes/i);
	assert.ok(beat.mustNotInvent.some((value) => /future player action/i.test(value)));
	assert.deepEqual(beat.evidenceIds, ['event_1']);
});

test('StoryBeatDirector does not invent consequences when resolution has none', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('story_beat_no_delta');
	const situation = CurrentSituationBuilder.build({ storyId: 'story_beat_no_delta', playerAction: 'I move forward.', worldRepo: repository });
	const beat = StoryBeatDirector.resolve({
		situation,
		intent: intent({ originalText: 'I move forward.' }),
		actionResolution: resolution({
			playerAction: 'I move forward.',
			actualEffect: 'The action proceeds as an ordinary deterministic world/narrative action.',
			canonicalStateChanges: [],
			physicalConsequences: [],
			playerVisibleConsequences: [],
			evidenceIds: [],
			uncertainty: [],
		}),
	});

	assert.match(beat.meaningfulChange, /no additional canonical consequence|attempted the requested action/i);
	assert.equal(beat.reactionOpportunities.length, 0);
	assert.ok(beat.mustNotInvent.some((value) => /NPC reaction/i.test(value)));
});

test('quiet turns remain valid beats instead of being forced into drama', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('story_beat_quiet');
	const situation = CurrentSituationBuilder.build({ storyId: 'story_beat_quiet', playerAction: 'I wait.', worldRepo: repository });
	const beat = StoryBeatDirector.resolve({
		situation,
		intent: intent({ action: 'wait', originalText: 'I wait.', movementIntent: false }),
		actionResolution: resolution({
			playerAction: 'I wait.',
			attemptedEffect: 'Wait.',
			actualEffect: 'The player waits.',
			canonicalStateChanges: [],
			physicalConsequences: [],
			playerVisibleConsequences: [],
			evidenceIds: [],
			uncertainty: [],
			outcomeTier: 'NO_CHECK',
		}),
	});

	assert.equal(beat.beatType, 'PAUSED');
});

test('StoryBeatDirector preserves uncertainty and player agency boundaries', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('story_beat_boundary');
	const situation = CurrentSituationBuilder.build({ storyId: 'story_beat_boundary', playerAction: 'I move toward the trench.', worldRepo: repository });
	const beat = StoryBeatDirector.resolve({ situation, intent: intent(), actionResolution: resolution() });

	assert.ok(beat.unresolvedConsequence);
	assert.ok(beat.mustNotInvent.some((value) => /hidden knowledge/i.test(value)));
	assert.ok(beat.mustNotInvent.some((value) => /future player action/i.test(value)));
});

test('NarrativeDirector carries StoryBeat into its ephemeral plan', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('story_beat_plan');
	const situation = CurrentSituationBuilder.build({ storyId: 'story_beat_plan', playerAction: 'I move toward the trench.', worldRepo: repository });
	const playerIntent = PlayerIntentInterpreter.deterministic('I move toward the trench.', situation);
	const research = NarrativeResearchPipeline.research({ repository, storyId: 'story_beat_plan', currentSituation: situation, playerIntent, playerAction: 'I move toward the trench.' });
	const beat = StoryBeatDirector.resolve({ situation, intent: playerIntent, actionResolution: resolution({ storyId: 'story_beat_plan', turnId: situation.turnId }), research });
	const plan = NarrativeDirector.create({ repository, storyId: 'story_beat_plan', situation, intent: playerIntent, research, storyBeat: beat });

	assert.equal(plan.storyBeat?.meaningfulChange, beat.meaningfulChange);
	assert.match(NarrativeDirector.toPromptContext(plan), /Meaningful story beat/i);
});

test('SceneComposition consumes StoryBeat meaning before environment', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('story_beat_scene');
	const situation = CurrentSituationBuilder.build({ storyId: 'story_beat_scene', playerAction: 'I move toward the trench.', worldRepo: repository });
	const playerIntent = PlayerIntentInterpreter.deterministic('I move toward the trench.', situation);
	const beat = StoryBeatDirector.resolve({ situation, intent: playerIntent, actionResolution: resolution({ storyId: 'story_beat_scene', turnId: situation.turnId }) });
	const contract = SceneCompositionEngine.resolve({
		situation,
		intent: playerIntent,
		informationToReveal: [],
		entitiesToReact: [],
		continuityState: undefined,
		pacingContract: { version: 1, profile: 'STANDARD', reason: 'test', controls: { enabled: true }, signals: [], variation: 'standard' } as any,
		storyBeat: beat,
	});

	assert.match(contract.physicalBeat, /meaningful turn change/i);
	assert.match(contract.narrativeFocus.join(' '), /near the Trench|Meaningful change/i);
});

test('NarrativePromptBuilder serializes StoryBeat in full and compact prompts', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('story_beat_prompt');
	const situation = CurrentSituationBuilder.build({ storyId: 'story_beat_prompt', playerAction: 'I move toward the trench.', worldRepo: repository });
	const playerIntent = PlayerIntentInterpreter.deterministic('I move toward the trench.', situation);
	const research = NarrativeResearchPipeline.research({ repository, storyId: 'story_beat_prompt', currentSituation: situation, playerIntent, playerAction: 'I move toward the trench.' });
	const beat = StoryBeatDirector.resolve({ situation, intent: playerIntent, actionResolution: resolution({ storyId: 'story_beat_prompt', turnId: situation.turnId }), research });
	const plan = NarrativeDirector.create({ repository, storyId: 'story_beat_prompt', situation, intent: playerIntent, research, storyBeat: beat });

	const full = buildNarrationPrompt({ situation, intent: playerIntent, research, plan, actionResolution: resolution({ storyId: 'story_beat_prompt', turnId: situation.turnId }), storyBeat: beat, maxPromptTokens: 3000 });
	const compact = buildNarrationPrompt({ situation, intent: playerIntent, research, plan, actionResolution: resolution({ storyId: 'story_beat_prompt', turnId: situation.turnId }), storyBeat: beat, maxPromptTokens: 500 });

	assert.match(full.prompt, /CURRENT STORY BEAT/);
	assert.match(full.prompt, /Meaningful change:/);
	assert.match(compact.prompt, /STORY BEAT:/);
});

test('combat resolution adapter preserves canonical combat outcome for StoryBeat', () => {
	const combat: CombatNarrativeResolution = {
		id: 'combat_1',
		actorId: 'player',
		targetIds: ['guard'],
		actionText: 'I throw the dagger at the guard.',
		actionLabel: 'Throw dagger',
		rolls: [],
		success: true,
		hits: true,
		damage: 7,
		targetHp: [{ targetId: 'guard', hpCurrent: 3, hpMax: 10, targetDied: false }],
		mechanicalSummary: 'Throw dagger: resolved successfully. Damage: 7.',
		narrativeResponse: '',
		canonicalEventIds: ['combat_event_1'],
		createdAt: 'now',
	};
	const resolution = actionResolutionFromCombat(combat, 'combat_story');
	assert.equal(resolution.resolutionMethod, 'COMBAT');
	assert.equal(resolution.outcomeTier, 'SUCCESS_WITH_COST');
	assert.equal(resolution.targetEntityIds[0], 'guard');
	assert.ok(resolution.evidenceIds.includes('combat_event_1'));
});


test('StoryBeatDirector marks movement without canonical spatial change as unresolved transition', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('story_beat_no_movement_delta');
	const situation = CurrentSituationBuilder.build({ storyId: 'story_beat_no_movement_delta', playerAction: 'I move further toward the citadel.', worldRepo: repository });
	const beat = StoryBeatDirector.resolve({
		situation,
		intent: intent({ originalText: 'I move further toward the citadel.' }),
		actionResolution: resolution({
			playerAction: 'I move further toward the citadel.',
			attemptedEffect: 'Move further toward the citadel.',
			actualEffect: 'The action proceeds as an ordinary deterministic world/narrative action.',
			canonicalStateChanges: [],
			physicalConsequences: [],
			playerVisibleConsequences: [],
			evidenceIds: [],
			uncertainty: [],
			outcomeTier: 'NO_CHECK',
		}),
	});
	assert.equal(beat.beatType, 'TRANSITION');
	assert.match(beat.meaningfulChange, /no additional canonical consequence|attempted the requested action/i);
	assert.ok(beat.mustNotInvent.some((value) => /unsupported consequence/i.test(value)));
});
