import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { PlayerLifecycleState } from '../server/domain/playerLifecycleState';
import { UniverseRuntimeService } from '../server/domain/universeRuntimeService';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { worldSynthesisService } from '../server/services/worldSynthesisService';
import { WorldSimulationService } from '../server/simulation/worldSimulationService';

function makeWorld(worldId: string, title: string) {
	return {
		worldId,
		worldManifestVersion: 1,
		title,
		description: title + ' test world.',
		genreTags: ['Test'],
		toneTags: ['Neutral'],
		mediumTags: ['Text'],
		canonMode: 'ORIGINAL',
		rulesetId: 'FULL_DND',
		dndRulesMode: 'FULL_DND',
		defaultEra: 'Test Era',
		setting: title,
		sourcePolicy: 'ORIGINAL_CANON',
		supportedPlaystyles: ['Exploration'],
		worldRules: [],
		ruleConstraints: [],
		canonicalCapabilities: [],
		capabilities: [],
		geography: {
			nodes: [
				{
					id: worldId + '_home',
					name: 'Home',
					description: 'A test starting point.',
					region: title,
					accessible: true,
				},
			],
			connections: [],
		},
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

function makeCharacter(worldId: string) {
	return {
		characterId: 'char_universe_test',
		worldId,
		worldVersion: 1,
		identity: {
			name: 'Astra',
			species: 'Human',
			age: 24,
		},
		role: {
			profession: 'Worldwalker',
			archetype: 'Explorer',
			role: 'PROTAGONIST',
		},
		background: {
			history: 'A traveler who crosses worlds.',
			upbringing: 'Nomadic.',
			importantEvents: [],
		},
		appearance: {
			physicalDescription: 'A traveler in a luminous suit.',
			distinguishingTraits: [],
		},
		personality: {
			traits: ['curious'],
			temperament: 'calm',
			values: ['exploration'],
		},
		motivations: {
			goals: ['discover new worlds'],
			fears: [],
			desires: ['freedom'],
		},
		condition: {
			injuries: [],
			curses: [],
			forms: [],
			specialStates: [],
		},
		capabilities: [],
		generatedSkills: [],
		startingEquipment: {
			equipped: [],
			inventory: [],
			weapons: [],
			armor: [],
			tools: [],
			consumables: [],
		},
		startingLocation: {
			locationId: worldId + '_home',
			name: 'Home',
			region: worldId,
			description: 'Home.',
		},
		startingSituation: {
			summary: 'Beginning a world-hopping campaign.',
		},
	};
}

test('Universe runtime preserves identity, creates worlds, returns to old worlds, and feeds memory into context', async () => {
	const repo = new InMemoryWorldRepository({ disablePersistence: true });
	const worldA = makeWorld('world_universe_a', 'World A');
	const worldB = makeWorld('world_universe_b', 'World B');
	repo.saveWorldTemplate(worldA);
	repo.saveWorldTemplate(worldB);

	const created = repo.createStoryRunFromConfirmedCharacter({
		worldId: worldA.worldId,
		confirmedCharacter: makeCharacter(worldA.worldId),
		storyId: 'story_universe_a',
	});
	const universe = UniverseRuntimeService.ensureUniverse(repo, created.storyId, 'Astra Multiverse');

	assert.ok(universe.universeId);
	assert.equal(universe.currentWorldId, worldA.worldId);
	assert.equal(universe.currentStoryId, created.storyId);

	UniverseRuntimeService.captureAction(repo, {
		storyId: created.storyId,
		actionType: 'INTERACT',
		actionText: 'Astra befriended the lighthouse keeper in World A.',
		commandId: 'cmd_friendship',
		authoritativeFeedback: 'The lighthouse keeper now trusts Astra.',
		beforeInventoryState: repo.getInventoryEngine(created.storyId).exportState(),
	});

	const memoryQuery = UniverseRuntimeService.getRelevantUniverseMemories(
		repo,
		created.storyId,
		universe.playerIdentity.universeActorId,
		['lighthouse', 'keeper'],
		10,
	);
	assert.ok(memoryQuery.some((memory) => memory.content.includes('lighthouse keeper')));

	const travelToB = await UniverseRuntimeService.travel(repo, {
		storyId: created.storyId,
		universeId: universe.universeId,
		worldId: worldB.worldId,
		travelDurationSeconds: 3600,
		trigger: 'PLAYER',
	});
	assert.equal(travelToB.createdWorld, false);
	assert.notEqual(travelToB.storyId, created.storyId);
	assert.equal(travelToB.universe.currentWorldId, worldB.worldId);

	// Time spent in World B becomes universe elapsed time and is caught up in World A
	// when the player returns, without regenerating World A.
	const worldBBefore = repo.getWorldClock(travelToB.storyId).getTimestamp().totalElapsedSeconds;
	const worldAStartElapsed = repo.getWorldClock(created.storyId).getTimestamp().totalElapsedSeconds;
	new WorldSimulationService(repo).advanceTime(travelToB.storyId, 7200);
	UniverseRuntimeService.captureAction(repo, {
		storyId: travelToB.storyId,
		actionType: 'ADVANCE_TIME',
		actionText: 'Spent time exploring World B.',
		commandId: 'cmd_world_b_time',
		authoritativeFeedback: 'World B time advanced.',
		beforeInventoryState: repo.getInventoryEngine(travelToB.storyId).exportState(),
		beforeWorldElapsedSeconds: worldBBefore,
	});

	assert.equal(
		UniverseRuntimeService.getUniverse(repo, universe.universeId)?.universeElapsedSeconds,
		10800,
	);


	const travelBack = await UniverseRuntimeService.travel(repo, {
		storyId: travelToB.storyId,
		universeId: universe.universeId,
		worldId: worldA.worldId,
		trigger: 'PLAYER',
	});
	assert.equal(travelBack.storyId, created.storyId);
	assert.equal(
		repo.getWorldClock(created.storyId).getTimestamp().totalElapsedSeconds,
		worldAStartElapsed + 7200,
	);
	assert.equal(travelBack.universe.currentWorldId, worldA.worldId);
	assert.ok(travelBack.universe.travelHistory.length >= 2);

	const context = WorkingContextEngine.assembleTurnContext({
		storyId: travelBack.storyId,
		playerAction: 'Do you remember the lighthouse?',
		worldRepo: repo,
		hardTokenBudget: 1600,
	});
	assert.ok(context.packet.relevantMemories.some((memory) => memory.includes('lighthouse keeper')));
});

test('Universe runtime can generate a new world from a premise', async () => {
	const repo = new InMemoryWorldRepository({ disablePersistence: true });
	const sourceWorld = makeWorld('world_universe_generate_source', 'Source World');
	repo.saveWorldTemplate(sourceWorld);
	const created = repo.createStoryRunFromConfirmedCharacter({
		worldId: sourceWorld.worldId,
		confirmedCharacter: makeCharacter(sourceWorld.worldId),
		storyId: 'story_universe_generate',
	});
	const universe = UniverseRuntimeService.ensureUniverse(repo, created.storyId);

	const original = worldSynthesisService.synthesizeWorldFromPremise;
	worldSynthesisService.synthesizeWorldFromPremise = async (input: any) => ({
		...makeWorld('world_generated_by_universe', input.title || 'Generated World'),
		summary: input.naturalLanguagePremise,
	});

	try {
		const result = await UniverseRuntimeService.travel(repo, {
			storyId: created.storyId,
			universeId: universe.universeId,
			worldPremise: 'A world of floating cities and orbital oceans.',
			worldTitle: 'The Sky Ocean',
			trigger: 'PLAYER',
		});

		assert.equal(result.createdWorld, true);
		assert.equal(result.world.title, 'The Sky Ocean');
		assert.ok(result.storyId);
		assert.equal(result.universe.currentWorldId, 'world_generated_by_universe');
	} finally {
		worldSynthesisService.synthesizeWorldFromPremise = original;
	}
});

test('Universe and world/NPC continuity survive repository restart', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'dreambook-universe-restart-'));
	const persistencePath = join(tempDir, 'data.json');
	const previousPath = process.env.DREAMBOOK_PERSISTENCE_PATH;
	process.env.DREAMBOOK_PERSISTENCE_PATH = persistencePath;

	try {
		const repo1 = new InMemoryWorldRepository();
		const world = makeWorld('world_restart_persistence', 'Persistent World');
		repo1.saveWorldTemplate(world);
		const created = repo1.createStoryRunFromConfirmedCharacter({
			worldId: world.worldId,
			confirmedCharacter: makeCharacter(world.worldId),
			storyId: 'story_restart_persistence',
		});

		const universe = UniverseRuntimeService.ensureUniverse(repo1, created.storyId);
		const npc = new PlayerLifecycleState({
			actorId: 'npc_restart_friend',
			name: 'Mira',
			locationId: world.worldId + '_home',
			lastUpdatedTime: repo1.getWorldClock(created.storyId).getTimestamp().totalElapsedSeconds,
			currentActivity: 'waiting for the traveler',
			activeJourney: null,
			injuries: [],
		});
		repo1.updateNpcLifecycle(created.storyId, npc);
		repo1.getCharacterAlignmentEngine().setRelationship({
			actorId: 'npc_restart_friend',
			targetId: repo1.getPlayerLifecycle(created.storyId)!.actorId,
			trustScore: 90,
			affectionScore: 85,
			respectScore: 80,
			fearScore: 5,
		});
		repo1.getMemoryEngine(created.storyId).storeMemory({
			id: 'restart_memory_friend',
			storyId: created.storyId,
			memoryClass: 'EPISODIC',
			subjectEntityId: 'npc_restart_friend',
			relatedEntityIds: [repo1.getPlayerLifecycle(created.storyId)!.actorId],
			content: 'Mira remembers that Astra rescued her from the collapsing observatory.',
			importance: 95,
			confidence: 1,
			status: 'active',
			visibility: 'SHARED',
			accessibleToEntityIds: [repo1.getPlayerLifecycle(created.storyId)!.actorId, 'npc_restart_friend'],
			isPersistentCritical: true,
			provenance: 'restart_persistence_test',
			validFromTurn: 1,
			lastRecalledTurn: 1,
			triggerConditionTags: ['mira', 'observatory', 'rescue'],
		});
		const repo2 = new InMemoryWorldRepository();
		assert.equal(repo2.getUniverseForStory(created.storyId)?.universeId, universe.universeId);
		assert.equal(repo2.getNpcLifecycle(created.storyId, 'npc_restart_friend')?.name, 'Mira');
		assert.equal(repo2.getCharacterAlignmentEngine().getRelationship(
			'npc_restart_friend',
			repo2.getPlayerLifecycle(created.storyId)!.actorId,
		)?.trustScore, 90);
		assert.ok(repo2.getMemoryEngine(created.storyId).getMemory('restart_memory_friend'));
		assert.equal(repo2.getStoryRun(created.storyId)?.worldId, world.worldId);

	} finally {
		if (previousPath === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
		else process.env.DREAMBOOK_PERSISTENCE_PATH = previousPath;
		rmSync(tempDir, { recursive: true, force: true });
	}
});
