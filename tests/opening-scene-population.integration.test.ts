import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { OpeningSceneService } from '../server/services/openingSceneService';

test('opening scene initializes and supplies canonically visible ambient population before narration', async () => {
	const storyId = 'opening_population_integration';
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);

	const run = repository.getStoryRun(storyId);
	assert.ok(run, 'seedStory must create a run');
	const player = repository.getPlayerLifecycle(storyId);
	assert.ok(player, 'seedStory must create a player lifecycle');
	const originalLocationId = run.startingLocationId || run.currentLocationId || player.locationId;
	const originalLocation = repository.getGeographyGraph(storyId).getNode(originalLocationId);
	assert.ok(originalLocation, 'the seeded run must have a canonical starting location');

	const locationId = 'loc_opening_solar_citadel';
	repository.getGeographyGraph(storyId).addNode({
		...originalLocation,
		id: locationId,
		name: 'Elysium Solar Citadel',
		regionId: 'Solar Citadel',
		description: 'A working citadel with public concourses and civic halls.',
		population: { status: 'UNKNOWN', expectedPopulation: 'MODERATE', provenance: 'UNKNOWN' },
	} as any);
	repository.updatePlayerLifecycle(storyId, player.copyWith({
		locationId,
		discoveredLocationIds: Array.from(new Set([...(player.discoveredLocationIds || []), locationId])),
	}));
	repository.saveStoryRun({
		...run,
		currentLocationId: locationId,
		startingLocationId: locationId,
	});

	let generationPrompt = '';
	(repository as any).getAiOrchestrator = () => ({
		executeTaskGeneration: async (task: string, prompt: string) => {
			if (task === 'narrative.generate') generationPrompt = prompt;
			return {
				source: 'DETERMINISTIC_FALLBACK',
				text: '',
				fallbackReason: 'Deterministic fallback supplied by the isolated test fixture.',
				attemptsTrail: [],
			};
		},
	});

	const opening = await OpeningSceneService.generateOpeningScene({ storyId, worldRepo: repository });
	const ambientPeople = repository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card: any) =>
		card.metadata?.ambientPopulation === true &&
		card.worldState?.locationId === locationId &&
		card.worldState?.isAlive === true &&
		card.worldState?.presence !== 'absent'
	);

	assert.ok(ambientPeople.length > 0, 'an authored public citadel should be populated before opening context is composed');
	assert.ok(generationPrompt.length > 0, 'the opening model should receive an assembled prompt');
	assert.ok(
		ambientPeople.some((person: any) => generationPrompt.includes(person.name)),
		'the actual opening generation prompt must include at least one canonically visible generated person'
	);
	assert.equal(opening.storyId, storyId);
});
