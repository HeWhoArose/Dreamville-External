import test from 'node:test';
import assert from 'node:assert/strict';

import { SceneCompositionEngine } from '../server/domain/sceneComposition';
import { NarrativePacingEngine } from '../server/domain/narrativePacingEngine';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function minimalSituation(overrides: any = {}): any {
	return {
		storyId: 'n13_direct',
		turnId: 'turn-n13',
		worldId: 'world-n13',
		worldTime: '09:00',
		location: { id: 'hall', name: 'The Brass Hall', description: 'A brass-lined hall.', regionId: 'castle', ambientSensory: 'Warm metal and clockwork clicks fill the air.' },
		nearbyEntities: [{ id: 'npc-1', name: 'Mara', kind: 'NPC', distanceBand: 'NEAR', visibleToPlayer: true, presence: 'present', explicitlyReferenced: true }],
		activeDialogue: undefined,
		currentAction: undefined,
		recentTurns: [],
		plot: { currentArc: 'The Watch', summary: 'A guarded negotiation.' },
		activeConditions: [],
		availableInteractions: [],
		visibleEvents: [],
		player: { actorId: 'player-1' },
		...overrides,
	};
}

function intent(overrides: any = {}): any {
	return {
		action: 'observe Mara',
		originalText: 'I observe Mara.',
		interactionMode: 'PASSIVE_OBSERVATION',
		observationIntent: true,
		speechIntent: false,
		movementIntent: false,
		goal: undefined,
		informationGoal: undefined,
		explicitTargets: [{ id: 'npc-1', name: 'Mara', kind: 'NPC', source: 'EXPLICIT' }],
		impliedTargets: [],
		target: undefined,
		...overrides,
	};
}

function pacing(situation: any, playerIntent: any) {
	return NarrativePacingEngine.resolve({ situation, intent: playerIntent });
}

test('N13 deterministically stages observation, dialogue, combat, and movement beats', () => {
	const situation = minimalSituation();
	const observations = SceneCompositionEngine.resolve({
		situation,
		intent: intent(),
		informationToReveal: [],
		entitiesToReact: [{ id: 'npc-1', name: 'Mara' }],
		pacingContract: pacing(situation, intent()),
		continuityState: {
			storyId: 'n13_direct',
			tension: 4,
			emotionalTemperature: 'UNEASY',
			sceneMomentum: 'BUILDING',
			relationshipTrajectories: [],
			unresolvedSubtext: ['Mara is withholding something.'],
			recentSensoryMotifs: [],
			recentNarrativeBeats: [],
			narrativeFocus: [],
			lastAcceptedTurnId: undefined,
			updatedAt: '09:00',
		},
	});
	assert.equal(observations.beatType, 'OBSERVATION');
	assert.equal(observations.dialogueAct, 'OBSERVE');
	assert.equal(observations.focalEntityId, 'npc-1');
	assert.equal(observations.emotionalMovement, 'RISE');
	assert.equal(observations.pacingShape, 'MICRO_BEAT');

	const combatIntent = intent({
		action: 'attack Mara',
		originalText: 'I attack Mara.',
		interactionMode: 'COMBAT',
		observationIntent: false,
		explicitTargets: [{ id: 'npc-1', name: 'Mara', kind: 'NPC', source: 'EXPLICIT' }],
	});
	const combat = SceneCompositionEngine.resolve({
		situation,
		intent: combatIntent,
		informationToReveal: [],
		entitiesToReact: [{ id: 'npc-1', name: 'Mara' }],
		pacingContract: pacing(situation, combatIntent),
	});
	assert.equal(combat.beatType, 'CONFLICT');
	assert.equal(combat.dialogueAct, 'NONE');
	assert.equal(combat.pacingShape, 'KINETIC_BEATS');

	const movementIntent = intent({
		action: 'move closer',
		originalText: 'I move closer.',
		interactionMode: 'MOVEMENT',
		observationIntent: false,
		movementIntent: true,
	});
	const movement = SceneCompositionEngine.resolve({
		situation,
		intent: movementIntent,
		informationToReveal: [],
		entitiesToReact: [],
		pacingContract: pacing(situation, movementIntent),
	});
	assert.equal(movement.beatType, 'TRANSITION');
	assert.equal(movement.physicalBeat.includes('physical movement'), true);
});

test('N13 preserves reveal versus uncertainty and does not invent missing sensory data', () => {
	const situation = minimalSituation({ location: { id: 'hall', name: 'The Hall', description: 'A hall.', regionId: 'castle' } });
	const playerIntent = intent({ interactionMode: 'INFORMATION_SEEKING', informationGoal: 'what happened here', action: 'find out what happened' });
	const value = SceneCompositionEngine.resolve({
		situation,
		intent: playerIntent,
		informationToReveal: [
			{ topic: 'A sealed gate failed', sourceBlockIds: ['b1'], presentation: 'FACT', requirement: 'REVEAL' },
			{ topic: 'Someone may have tampered with it', sourceBlockIds: ['b2'], presentation: 'UNCERTAIN', requirement: 'PRESERVE_UNCERTAINTY' },
		],
		entitiesToReact: [{ id: 'npc-1', name: 'Mara' }],
		unresolvedThread: 'The missing key has not been found.',
		pacingContract: pacing(situation, playerIntent),
	});
	assert.deepEqual(value.reveal, ['A sealed gate failed']);
	assert.ok(value.withhold.some((entry) => /tampered/i.test(entry)));
	assert.ok(value.withhold.some((entry) => /missing key/i.test(entry)));
	assert.equal(value.sensoryAnchor, undefined);
	assert.match(value.fallbackReason || '', /no ambient sensory anchor/i);
});

test('N13 is ephemeral presentation guidance and reaches the real narration prompt', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n13_prompt_integration';
	repository.seedStory(storyId);
	const action = 'I move closer to hear the rumors.';
	const initial = CurrentSituationBuilder.build({ storyId, playerAction: action, worldRepo: repository });
	const playerIntent = PlayerIntentInterpreter.deterministic(action, initial);
	const situation = CurrentSituationBuilder.build({ storyId, playerAction: action, currentAction: playerIntent, worldRepo: repository });
	const research = NarrativeResearchPipeline.research({ repository, storyId, currentSituation: situation, playerIntent, playerAction: action });
	const plan = NarrativeDirector.create({ situation, intent: playerIntent, research });
	const result = buildNarrationPrompt({ situation, intent: playerIntent, research, plan, maxPromptTokens: 2500 });
	assert.ok(result.sceneComposition);
	assert.equal(result.sceneComposition?.turnId, situation.turnId);
	assert.match(result.prompt, /N13 SCENE COMPOSITION CONTRACT v1/);
	assert.match(result.prompt, /Hard boundary: this contract cannot mutate canonical state/);
	assert.match(result.prompt, /Pacing shape:/);
	assert.match(result.prompt, /Closing beat:/);
});

test('N13 fallback remains deterministic when optional inputs are absent', () => {
	const situation = minimalSituation({ location: { id: 'hall', name: 'The Hall', description: 'A hall.', regionId: 'castle' } });
	const playerIntent = intent();
	const a = SceneCompositionEngine.resolve({ situation, intent: playerIntent, informationToReveal: [], entitiesToReact: [], pacingContract: pacing(situation, playerIntent) });
	const b = SceneCompositionEngine.resolve({ situation, intent: playerIntent, informationToReveal: [], entitiesToReact: [], pacingContract: pacing(situation, playerIntent) });
	assert.deepEqual(a, b);
	assert.equal(a.expiresAfterNarration, true);
	assert.ok(a.fallbackReason);
	assert.match(a.fallbackReason || '', /continuity unavailable|no ambient sensory anchor|no explicit reaction/i);
});
