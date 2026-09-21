import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { WorldVisualIdentityService } from '../server/services/worldVisualIdentityService';

test('Phase 0.5 persistence: worlds and Story Runs survive repository rehydration', () => {
	const directory = mkdtempSync(join(tmpdir(), 'dreambook-persistence-'));
	const persistencePath = join(directory, 'data.json');
	const previousPath = process.env.DREAMBOOK_PERSISTENCE_PATH;
	process.env.DREAMBOOK_PERSISTENCE_PATH = persistencePath;

	try {
		const firstRepository = new InMemoryWorldRepository();
		const world = {
			worldId: 'world_persistence_acceptance',
			title: 'Persistence Acceptance World',
			summary: 'A world used to verify restart persistence.',
			description: 'Persistence acceptance fixture.',
			genreTags: ['Sci-Fi'],
			toneTags: ['Technical'],
			defaultEra: 'Stardate 9000',
			setting: 'Orbital Habitat',
			rulesetId: 'CUSTOM_HOMEBREW_DND',
			dndRulesMode: 'CUSTOM_HOMEBREW_DND',
			imageAsset: 'data:image/png;base64,world-art',
			imageMetadata: { provenance: 'acceptance-test' },
			worldManifestVersion: 1,
		};
		firstRepository.saveWorldTemplate(world);
		firstRepository.saveStoryRun({
			id: 'story_persistence_acceptance',
			storyId: 'story_persistence_acceptance',
			worldId: world.worldId,
			title: 'A Persistent Chronicle',
			characterName: 'Test Pilot',
			storyMode: 'FREE_ROAM',
			dndRulesMode: 'CUSTOM_HOMEBREW_DND',
			imageAsset: 'data:image/png;base64:story-art',
			imageMetadata: { provenance: 'story-acceptance-test' },
			openingScene: {
				storyId: 'story_persistence_acceptance',
				narrativeText: 'The persisted opening.',
			},
		});

		const secondRepository = new InMemoryWorldRepository();
		const restoredWorld = secondRepository.getWorldTemplate(world.worldId);
		const restoredRun = secondRepository.getStoryRun('story_persistence_acceptance');

		assert.equal(restoredWorld?.imageAsset, world.imageAsset);
		assert.equal(restoredWorld?.imageMetadata?.provenance, 'acceptance-test');
		assert.equal(restoredRun?.imageAsset, 'data:image/png;base64:story-art');
		assert.equal(restoredRun?.openingScene?.narrativeText, 'The persisted opening.');
		assert.equal(restoredRun?.storyMode, 'FREE_ROAM');
		assert.equal(restoredRun?.dndRulesMode, 'CUSTOM_HOMEBREW_DND');
	} finally {
		if (previousPath === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
		else process.env.DREAMBOOK_PERSISTENCE_PATH = previousPath;
		rmSync(directory, { recursive: true, force: true });
	}
});

test('Phase 0.5 visual identity: Story Run artwork context remains distinct from world identity', () => {
	const world = {
		worldId: 'world_visual_identity',
		title: 'Neon Meridian',
		summary: 'A cyberpunk city-world.',
		description: 'Dense vertical megacity.',
		genreTags: ['Cyberpunk'],
		toneTags: ['Noir'],
		defaultEra: '2088',
		setting: 'Vertical Megacity',
		factions: [{ name: 'Meridian Syndicate' }],
		magicRules: { technology: 'Neural implants' },
		geography: { nodes: [{ id: 'district_dock', name: 'Dock Nine' }] },
		artConfig: { visualMotifs: ['rain', 'neon signage'] },
	};
	const run = {
		storyId: 'story_visual_identity',
		worldId: world.worldId,
		title: 'The Dock Nine Heist',
		characterName: 'Rin Vale',
		storyMode: 'PROTAGONIST',
		dndRulesMode: 'HYBRID_DND',
		startingLocation: { name: 'Dock Nine' },
		startingSituation: { summary: 'A stolen data shard must be recovered before dawn.' },
	};

	const identity = WorldVisualIdentityService.buildStoryRunIdentity(run, world);
	assert.equal(identity.kind, 'STORY_RUN');
	assert.equal(identity.title, 'The Dock Nine Heist');
	assert.equal(identity.characterName, 'Rin Vale');
	assert.match(identity.adventureContext, /Dock Nine/);
	assert.match(identity.adventureContext, /stolen data shard/i);
	assert.equal(identity.dndRulesMode, 'HYBRID_DND');
	assert.deepEqual(identity.visualMotifs, ['rain', 'neon signage']);
});
