import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { StoryActionAdvisor } from '../server/services/storyActionAdvisor';

test('scene-aware suggestions use current rumors, visible NPCs, and reachable discovered locations', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'scene_aware_suggestions';
	repository.seedStory(storyId);

	const graph = repository.getGeographyGraph(storyId);
	graph.clear();
	graph.addNode({
		id: 'rootspire',
		name: 'Rootspire Citadel',
		regionId: 'verdant',
		description: 'A bastion where exiles gather beneath an immense fossilized canopy.',
		coordinates: { x: 0, y: 0 },
		accessible: true,
		ambientSensory: 'Crowds gather around smoky taverns.',
		discovered: true,
		provenance: 'authored',
	});
	graph.addNode({
		id: 'tervan',
		name: 'Tervan',
		regionId: 'verdant',
		description: 'A known trading quarter where travelers exchange news and supplies.',
		coordinates: { x: 1, y: 0 },
		accessible: true,
		ambientSensory: 'Market noise and traders.',
		discovered: true,
		provenance: 'authored',
	});
	graph.addEdge({
		id: 'rootspire_to_tervan',
		fromLocationId: 'rootspire',
		toLocationId: 'tervan',
		distanceKm: 3,
		terrain: 'Road',
		allowedModes: ['Foot'],
		hazardRisk: 0.01,
		isBlocked: false,
		provenance: 'authored',
	});

	const player = repository.getPlayerLifecycle(storyId);
	assert.ok(player);
	repository.updatePlayerLifecycle(storyId, player!.copyWith({
		locationId: 'rootspire',
		discoveredLocationIds: ['rootspire', 'tervan'],
	}));

	const run = repository.getStoryRun(storyId);
	assert.ok(run);
	repository.saveStoryRun({
		...run,
		openingScene: {
			...(run as any).openingScene,
			narrativeText: 'Whispers in the Citadel speak of unstable starlight fissures deeper within the Whispering Spore-Sea.',
		},
	});

	repository.getLivingWorldSimulation(storyId).registerNpcSchedule({
		npcId: 'npc_tervan',
		name: 'Tervan',
		currentLocationId: 'rootspire',
		currentActivity: 'working',
		entries: [],
		fallbackActivity: 'working',
		fallbackLocationId: 'rootspire',
	});

	const advisor = new StoryActionAdvisor(repository);
	const tips = await advisor.getTipsForAction(storyId, '');
	const serialized = JSON.stringify(tips);

	assert.match(serialized, /Ask Tervan about the lead/i);
	assert.match(serialized, /starlight fissures|Whispering Spore-Sea/i);
	assert.match(serialized, /Follow the lead to Tervan|travel to Tervan/i);
	assert.doesNotMatch(serialized, /Listen for change.*Change your vantage.*Test the environment/s);
});

test('recent canonical narration becomes part of suggestion context after a turn', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'scene_aware_recent_context';
	repository.seedStory(storyId);

	const run = repository.getStoryRun(storyId);
	assert.ok(run);
	repository.saveStoryRun({
		...run,
		runtimeState: {
			...(run as any).runtimeState,
			narrativeContextHistory: [
				{
					actionId: 'turn_1',
					playerAction: 'I question the root-trappers about the fissures.',
					narration: {
						response: 'A root-trapper warns that a sealed eastern archive may contain an old route chart.',
					},
				},
			],
		},
	});

	const advisor = new StoryActionAdvisor(repository);
	const tips = await advisor.getTipsForAction(storyId, '');
	assert.ok(tips.length > 0);
});
