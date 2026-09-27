import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { UniverseRuntimeService } from '../server/domain/universeRuntimeService';

test('S5 reuses persistent world bindings and carries player state across worlds', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const sourceStoryId = 'default_story';
	const sourceRun = repository.getStoryRun(sourceStoryId);
	assert.ok(sourceRun);
	sourceRun.currentHp = 17;
	repository.saveStoryRun(sourceRun);

	const universe = UniverseRuntimeService.ensureUniverse(repository, sourceStoryId);
	const firstTravel = await UniverseRuntimeService.travel(repository, {
		storyId: sourceStoryId,
		universeId: universe.universeId,
		worldId: 'world_shadow_depths',
		travelDurationSeconds: 3600,
	});
	assert.equal(firstTravel.createdWorld, false);
	assert.equal(firstTravel.createdSession, true);

	const shadowStoryId = firstTravel.storyId;
	const secondTravel = await UniverseRuntimeService.travel(repository, {
		storyId: shadowStoryId,
		universeId: universe.universeId,
		worldId: 'world_solar_archive',
		travelDurationSeconds: 7200,
	});

	assert.equal(secondTravel.storyId, sourceStoryId);
	assert.equal(secondTravel.createdSession, false);
	assert.equal(repository.getStoryRun(sourceStoryId)?.currentHp, 17);

	const restoredUniverse = repository.getUniverse(universe.universeId)!;
	assert.equal(restoredUniverse.currentStoryId, sourceStoryId);
	assert.equal(restoredUniverse.currentWorldId, 'world_solar_archive');
	assert.equal(restoredUniverse.worldBindings.length, 2);
	assert.ok(repository.getWorldClock(sourceStoryId).getTimestamp().totalElapsedSeconds >= 7200);

	const deletedWorld = repository.deleteWorldTemplate('world_shadow_depths');
	assert.equal(deletedWorld.success, true);
	const afterDeletion = repository.getUniverse(universe.universeId);
	assert.ok(afterDeletion);
	assert.equal(afterDeletion?.currentStoryId, sourceStoryId);
	assert.equal(afterDeletion?.worldBindings.length, 1);
});

test('S5 dormant-world catch-up advances the existing Story Run rather than creating a new one', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const sourceStoryId = 'default_story';
	const universe = UniverseRuntimeService.ensureUniverse(repository, sourceStoryId);

	const firstTravel = await UniverseRuntimeService.travel(repository, {
		storyId: sourceStoryId,
		universeId: universe.universeId,
		worldId: 'world_shadow_depths',
		travelDurationSeconds: 1800,
	});
	const shadowStoryId = firstTravel.storyId;
	const returned = await UniverseRuntimeService.travel(repository, {
		storyId: shadowStoryId,
		universeId: universe.universeId,
		worldId: 'world_solar_archive',
		travelDurationSeconds: 5400,
	});

	assert.equal(returned.storyId, sourceStoryId);
	const finalUniverse = repository.getUniverse(universe.universeId)!;
	const solarBinding = finalUniverse.worldBindings.find((binding) => binding.worldId === 'world_solar_archive')!;
	assert.equal(solarBinding.storyId, sourceStoryId);
	assert.equal(solarBinding.status, 'CURRENT');
	assert.equal(solarBinding.lastSimulatedUniverseSeconds, finalUniverse.universeElapsedSeconds);
	assert.equal(repository.getAllStoryRuns().filter((run) => run.worldId === 'world_solar_archive').length, 1);
});

test('S5 travel rollback restores the prior universe when destination activation fails', async () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const sourceStoryId = 'default_story';
	const universe = UniverseRuntimeService.ensureUniverse(repository, sourceStoryId);
	const firstTravel = await UniverseRuntimeService.travel(repository, {
		storyId: sourceStoryId,
		universeId: universe.universeId,
		worldId: 'world_shadow_depths',
		travelDurationSeconds: 900,
	});
	const shadowStoryId = firstTravel.storyId;
	const before = repository.getUniverse(universe.universeId)!;

	const originalSeedStory = repository.seedStory.bind(repository);
	let failOnce = true;
	(repository as any).seedStory = (storyId: string) => {
		if (failOnce && storyId === sourceStoryId) {
			failOnce = false;
			throw new Error('forced destination activation failure');
		}
		return originalSeedStory(storyId);
	};

	await assert.rejects(
		() => UniverseRuntimeService.travel(repository, {
			storyId: shadowStoryId,
			universeId: universe.universeId,
			worldId: 'world_solar_archive',
			travelDurationSeconds: 600,
		}),
		/forced destination activation failure/,
	);

	const after = repository.getUniverse(universe.universeId)!;
	assert.equal(after.currentStoryId, before.currentStoryId);
	assert.equal(after.currentWorldId, before.currentWorldId);
	assert.deepEqual(after.worldBindings, before.worldBindings);
	assert.ok(repository.getStoryRun(sourceStoryId));
	assert.ok(repository.getStoryRun(shadowStoryId));
});

test('S5 universe and cross-world memory survive a real persistence restart', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'dreambook-s5-'));
	const persistencePath = join(directory, 'data.json');
	const previous = process.env.DREAMBOOK_PERSISTENCE_PATH;
	process.env.DREAMBOOK_PERSISTENCE_PATH = persistencePath;

	try {
		const firstRepository = new InMemoryWorldRepository();
		const universe = UniverseRuntimeService.ensureUniverse(firstRepository, 'default_story');
		await UniverseRuntimeService.travel(firstRepository, {
			storyId: 'default_story',
			universeId: universe.universeId,
			worldId: 'world_shadow_depths',
			travelDurationSeconds: 1200,
		});
		UniverseRuntimeService.captureAction(firstRepository, {
			storyId: firstRepository.getUniverse(universe.universeId)!.currentStoryId,
			actionType: 'PLAYER_ACTION',
			actionText: 'I mark the entrance so I can remember this place.',
			commandId: 's5-memory-test',
			authoritativeFeedback: 'The entrance is marked.',
		});

		const persistedUniverse = firstRepository.getUniverse(universe.universeId)!;
		const firstBindingIds = persistedUniverse.worldBindings.map((binding) => binding.storyId).sort();

		const secondRepository = new InMemoryWorldRepository();
		const restored = secondRepository.getUniverse(universe.universeId);
		assert.ok(restored);
		assert.deepEqual(restored?.worldBindings.map((binding) => binding.storyId).sort(), firstBindingIds);
		assert.ok(restored?.memories.some((memory) => memory.content.includes('mark the entrance')));
		assert.ok(secondRepository.getStoryRun(restored!.currentStoryId));
		assert.equal(secondRepository.getUniverseForStory(restored!.currentStoryId)?.universeId, universe.universeId);
	} finally {
		if (previous === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
		else process.env.DREAMBOOK_PERSISTENCE_PATH = previous;
		rmSync(directory, { recursive: true, force: true });
	}
});
