import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { UniverseRuntimeService } from '../server/domain/universeRuntimeService';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { worldSynthesisService } from '../server/services/worldSynthesisService';

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
		trigger: 'PLAYER',
	});
	assert.equal(travelToB.createdWorld, false);
	assert.notEqual(travelToB.storyId, created.storyId);
	assert.equal(travelToB.universe.currentWorldId, worldB.worldId);

	const travelBack = await UniverseRuntimeService.travel(repo, {
		storyId: travelToB.storyId,
		universeId: universe.universeId,
		worldId: worldA.worldId,
		trigger: 'PLAYER',
	});
	assert.equal(travelBack.storyId, created.storyId);
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
