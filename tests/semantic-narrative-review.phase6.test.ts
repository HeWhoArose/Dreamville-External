import test from 'node:test';
import assert from 'node:assert/strict';
import { SemanticNarrativeReview } from '../server/domain/semanticNarrativeReview';
import type { PlayerIntent } from '../server/domain/playerIntentInterpreter';

function intent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
	return {
		action: 'approach_and_listen',
		goal: 'gather_information',
		interactionMode: 'PASSIVE_OBSERVATION',
		speechIntent: false,
		movementIntent: true,
		observationIntent: true,
		informationGoal: 'hear the rumors about the starlight fissures',
		explicitTargets: [],
		impliedTargets: [],
		confidence: 0.9,
		source: 'DETERMINISTIC',
		originalText: 'I move closer to hear the rumors.',
		...overrides,
	};
}

function situation(overrides: Record<string, unknown> = {}): any {
	return {
		storyId: 'story',
		turnId: 'turn-1',
		worldId: 'world',
		worldTime: 'Y0001-M01-D01T14:00:00',
		player: { actorId: 'player', name: 'Aelion', locationId: 'archive', currentActivity: 'idle', isTraveling: false, isDead: false, isTransformed: false, isPossessed: false, injuries: [] },
		location: { id: 'archive', name: 'Archive Periphery', regionId: 'citadel', description: 'A stone courtyard.', ambientSensory: 'Dry autumn air.', connectedLocations: [] },
		nearbyEntities: [],
		visibleEvents: [{ id: 'rumor', summary: 'People whisper that unstable starlight fissures have appeared beyond the lower terraces.' }],
		activeDialogue: undefined,
		recentTurns: [],
		currentAction: undefined,
		plot: { currentArc: 'ANOMALY', summary: 'Investigate the strange fissures.', recentBeats: [] },
		openThreads: [],
		relevantMemories: [],
		relevantLore: [],
		playerKnowledge: { viewerActorId: 'player', knownFacts: [] },
		worldFacts: [],
		activeConditions: [],
		availableInteractions: [],
		...overrides,
	};
}

function plan(overrides: Record<string, unknown> = {}): any {
	return {
		turnId: 'turn-1',
		objective: 'Let the player approach and overhear the established rumor.',
		immediateSteps: ['Move closer without speaking.', 'Resolve what can be overheard.'],
		informationToReveal: [{ id: 'r1', content: 'unstable starlight fissures have appeared beyond the lower terraces', source: 'visible scene rumor' }],
		entitiesToReact: [],
		continuityRequirements: ['Stay in the current scene.'],
		forbiddenAssumptions: ['trade caravan delays'],
		stateEffectsExpected: [],
		...overrides,
	};
}

function pkg(narrative: string, stateChanges: any[] = []): any {
	return { narrative: [narrative], dialogue: [], events: [], stateChanges, memoryCandidates: [], audioCues: [] };
}

test('Phase 6 accepts faithful passive listening with movement and observation', () => {
	const review = SemanticNarrativeReview.review({
		intent: intent(),
		situation: situation(),
		plan: plan(),
		turnPackage: pkg('You step closer to the murmuring group and hear that people are whispering about unstable starlight fissures beyond the lower terraces.'),
	});
	assert.equal(review.decision, 'ACCEPT');
});

test('Phase 6 rejects protagonist speech when the player only listens', () => {
	const review = SemanticNarrativeReview.review({
		intent: intent(),
		situation: situation(),
		plan: plan(),
		turnPackage: pkg('You raise your voice and ask the crowd what happened to the trade caravan.'),
	});
	assert.equal(review.decision, 'REJECT');
	assert.ok(review.violations.some((v) => v.code === 'UNAUTHORIZED_SPEECH'));
});

test('Phase 6 requests one rewrite when movement is silently skipped', () => {
	const review = SemanticNarrativeReview.review({
		intent: intent(),
		situation: situation(),
		plan: plan(),
		turnPackage: pkg('You remain in the courtyard and hear a vague murmur.'),
	});
	assert.equal(review.decision, 'REWRITE');
	assert.ok(review.violations.some((v) => v.code === 'MISSING_MOVEMENT'));
});

test('Phase 6 permits explicit dialogue intent', () => {
	const review = SemanticNarrativeReview.review({
		intent: intent({
			action: 'ask',
			goal: 'communicate_with_target',
			interactionMode: 'DIALOGUE',
			speechIntent: true,
			movementIntent: false,
			observationIntent: false,
			informationGoal: 'what happened',
			originalText: 'I ask the guard what happened.',
		}),
		situation: situation(),
		plan: plan({ objective: 'Ask the guard what happened.' }),
		turnPackage: pkg('You ask the guard what happened, and he explains that the eastern gate was closed before dawn.'),
	});
	assert.equal(review.decision, 'ACCEPT');
});

test('Phase 6 rejects unsupported location mutation from a non-movement intent', () => {
	const review = SemanticNarrativeReview.review({
		intent: intent({ movementIntent: false, observationIntent: true, interactionMode: 'PASSIVE_OBSERVATION' }),
		situation: situation(),
		plan: plan(),
		turnPackage: pkg('You inspect the courtyard.', [{ kind: 'LOCATION', targetId: 'hidden-city', value: 'moved' }]),
	});
	assert.equal(review.decision, 'REJECT');
	assert.ok(review.violations.some((v) => v.code === 'UNSUPPORTED_STATE_PROPOSAL'));
});
