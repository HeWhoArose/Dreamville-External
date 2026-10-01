import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ActionLog } from '../src/types';
import type { CurrentSituation } from '../server/domain/currentSituation';
import {
	assertVisualSceneFreshness,
	buildVisualSceneContext,
	resolveCanonicalVisualOutcome,
	selectLatestVisualTurn,
} from '../server/domain/visualSceneContext';
import { buildComicScenePromptFromVisualContext } from '../server/services/comicSceneGenerator';
import { promises as fs } from 'node:fs';

function makeAction(overrides: Partial<ActionLog> = {}): ActionLog {
	return {
		id: 'turn_1',
		timestamp: 'Cycle 1',
		cycle: 1,
		turnNumber: 1,
		actionType: 'CUSTOM_ACTION',
		description: 'I move closer to hear the rumors.',
		epistemicValidation: 'MOCK_ENGINE_COMMITTED',
		authoritativeFeedback: 'The movement is valid.',
		narrativeResponse: 'You move closer to the gathered voices.',
		visualCues: ['The protagonist closes the distance without speaking.'],
		...overrides,
	};
}

function makeSituation(overrides: Partial<CurrentSituation> = {}): CurrentSituation {
	return {
		storyId: 'story_1',
		turnId: 'turn_2',
		worldId: 'world_1',
		worldTime: 'Cycle 42 — late afternoon',
		worldTimestamp: {} as any,
		player: {
			actorId: 'player_1',
			name: 'Aelion',
			locationId: 'hall_1',
			currentActivity: 'listening',
			isTraveling: false,
			isDead: false,
			isTransformed: false,
			isPossessed: false,
			injuries: [],
		},
		location: {
			id: 'hall_1',
			name: 'Archive Hall',
			regionId: 'citadel',
			description: 'A brass-lined archive hall filled with quiet voices.',
			ambientSensory: 'Dry autumn air and low conversation.',
			accessible: true,
			discovered: true,
			connectedLocations: [],
		},
		nearbyEntities: [
			{
				id: 'npc_1',
				name: 'Archivist Maren',
				kind: 'NPC',
				locationId: 'hall_1',
				presence: 'present',
				isAlive: true,
				currentActivity: 'whispering',
				role: 'Archivist',
				distanceBand: 'SAME_LOCATION',
				importance: 1,
				explicitlyReferenced: false,
				visibleToPlayer: true,
			},
			{
				id: 'npc_hidden',
				name: 'Hidden Spy',
				kind: 'NPC',
				locationId: 'vault_2',
				presence: 'present',
				isAlive: true,
				distanceBand: 'REFERRED',
				importance: 0.1,
				explicitlyReferenced: false,
				visibleToPlayer: false,
			},
			{
				id: 'npc_dead',
				name: 'Fallen Guard',
				kind: 'NPC',
				locationId: 'hall_1',
				presence: 'absent',
				isAlive: false,
				distanceBand: 'SAME_LOCATION',
				importance: 0.5,
				explicitlyReferenced: false,
				visibleToPlayer: true,
			},
		],
		visibleEvents: [],
		activeDialogue: undefined,
		recentTurns: [],
		currentAction: undefined,
		plot: { currentArc: '', summary: '', recentBeats: [] },
		openThreads: [],
		relevantMemories: [],
		relevantLore: [],
		playerKnowledge: { viewerActorId: 'player_1', knownFacts: [], authorizedFactIds: [], note: '' },
		worldFacts: [],
		activeConditions: [],
		availableInteractions: [],
		...overrides,
	};
}

describe('Phase 16 — visual scene context', () => {
	it('selects the newest player turn rather than stale opening notes', () => {
		const newest = makeAction({ id: 'turn_2', turnNumber: 2, description: 'I inspect the fissure.' });
		const oldest = makeAction({ id: 'turn_1', turnNumber: 1 });
		const opening = makeAction({ id: 'open', turnNumber: undefined, actionType: 'NOTE_RECORD', description: 'Old opening scene.' });

		assert.equal(selectLatestVisualTurn([oldest, opening, newest])?.id, 'turn_2');
	});

	it('keeps canonical failure outcomes as failures for visual generation', () => {
		const failed = makeAction({
			id: 'turn_fail',
			epistemicValidation: 'REJECTED_BY_ENGINE',
			checkResult: {
				success: false,
			} as any,
		});
		assert.equal(resolveCanonicalVisualOutcome(failed), 'FAILURE');
		assert.equal(resolveCanonicalVisualOutcome(makeAction({ checkResult: { success: true } as any })), 'SUCCESS');
	});

	it('projects only visible, alive entities from the current location', () => {
		const context = buildVisualSceneContext({
			storyId: 'story_1',
			currentSituation: makeSituation(),
			actionHistory: [makeAction({ id: 'turn_2', turnNumber: 2 })],
		});
		assert.deepEqual(context.visibleCharacters.map((entry) => entry.name), ['Archivist Maren']);
	});

	it('keeps passive observation distinct from dialogue', () => {
		const context = buildVisualSceneContext({
			storyId: 'story_1',
			currentSituation: makeSituation(),
			presentationAction: makeAction({
				description: 'I move closer to hear the rumors.',
				actionType: 'CUSTOM_ACTION',
			}),
		});
		assert.equal(context.latestDialogue, undefined);
		assert.match(context.latestPlayerAction || '', /hear the rumors/i);
	});

	it('only injects active dialogue for an actual dialogue turn', () => {
		const situation = makeSituation({
			activeDialogue: {
				nodeId: 'node_1',
				speakerId: 'npc_1',
				speakerName: 'Archivist Maren',
				text: 'The fissures moved again.',
			},
		});
		const context = buildVisualSceneContext({
			storyId: 'story_1',
			currentSituation: situation,
			presentationAction: makeAction({ actionType: 'DIALOGUE_CHOICE', description: 'I ask about the fissures.' }),
		});
		assert.equal(context.latestDialogue?.speakerName, 'Archivist Maren');
	});

	it('uses the latest turn instead of stale opening prose', () => {
		const context = buildVisualSceneContext({
			storyId: 'story_1',
			currentSituation: makeSituation(),
			presentationAction: makeAction({
				id: 'turn_current',
				turnNumber: 7,
				description: 'I crouch beside the fissure.',
				narrativeResponse: 'The fissure pulses once beneath the stone.',
			}),
		});
		const prompt = buildComicScenePromptFromVisualContext(context).prompt;
		assert.match(prompt, /crouch beside the fissure/i);
		assert.doesNotMatch(prompt, /old opening scene/i);
		assert.match(prompt, /exact current visual moment/i);
	});

	it('preserves failure in the prompt instead of depicting success', () => {
		const situation = makeSituation();
		const context = buildVisualSceneContext({
			storyId: 'story_1',
			currentSituation: situation,
			presentationAction: makeAction({
				id: 'turn_fail',
				turnNumber: 8,
				description: 'I force the sealed archive door.',
				epistemicValidation: 'REJECTED_BY_ENGINE',
				checkResult: { success: false, consequence: { summary: 'The seal holds.' } } as any,
			}),
		});
		const prompt = buildComicScenePromptFromVisualContext(context).prompt;
		assert.match(prompt, /action failed/i);
		assert.match(prompt, /never convert the failure into a success/i);
		assert.match(prompt, /The seal holds/i);
	});


	it('keeps the actual game route wired to the canonical visual-context adapter', async () => {
		const routeSource = await fs.readFile(new URL('../server/api/gameRoutes.ts', import.meta.url), 'utf8');
		assert.match(routeSource, /buildVisualSceneContext\(/);
		assert.match(routeSource, /buildComicScenePromptFromVisualContext\(/);
		assert.doesNotMatch(routeSource, /buildComicScenePrompt\(context\)/);
		assert.match(routeSource, /assertVisualSceneFreshness\(/);
	});

	it('binds generated scene artwork to the backend sourceActionId', async () => {
		const storyView = await fs.readFile(new URL('../src/components/StoryView.tsx', import.meta.url), 'utf8');
		assert.match(storyView, /setSceneSourceActionId\(result\.sourceActionId \|\| null\)/);
		assert.match(storyView, /sceneSourceActionId && sceneSourceActionId !== latestTurnId/);
	});

	it('fails closed when the visual context freshness invariant is broken', () => {
		const context = buildVisualSceneContext({
			storyId: 'story_1',
			currentSituation: makeSituation(),
			presentationAction: makeAction({ id: 'turn_fresh', turnNumber: 3 }),
		});
		(context as any).visualFreshnessToken = 'stale';
		assert.throws(() => assertVisualSceneFreshness(context), /freshness token/);
	});
});
