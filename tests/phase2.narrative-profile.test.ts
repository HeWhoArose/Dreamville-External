import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { narrativeProfileEngine } from '../server/domain/narrativeProfileEngine';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { WorldSynthesisService } from '../server/services/worldSynthesisService';
import { InMemoryWorldRepository, worldRepository } from '../server/repositories/worldRepository';
import { CharacterStoryMode, DndRulesMode } from '../src/types';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { resolveCanonicalConfirmedCharacter } from '../server/api/gameRoutes';

const NARRATIVE_MODES: CharacterStoryMode[] = [
	'PROTAGONIST',
	'SIDE_CHARACTER',
	'FREE_ROAM',
];

const RULES_MODES: DndRulesMode[] = [
	'FULL_DND',
	'HYBRID_DND',
	'CUSTOM_HOMEBREW_DND',
];

test('Phase 2 — canonical narrative profile definitions validate for all three modes', () => {
	for (const mode of NARRATIVE_MODES) {
		const profile = narrativeProfileEngine.createDefault(mode);
		assert.equal(profile.mode, mode);
		assert.equal(narrativeProfileEngine.validate(profile).length, 0);
	}

	assert.equal(
		narrativeProfileEngine.createDefault('PROTAGONIST').camera,
		'PLAYER_CENTRIC'
	);
	assert.equal(
		narrativeProfileEngine.createDefault('SIDE_CHARACTER').camera,
		'SUPPORTING_CAST'
	);
	assert.equal(
		narrativeProfileEngine.createDefault('FREE_ROAM').camera,
		'WORLD_SANDBOX'
	);
});

test('Phase 2 — explicit narrative mode wins over a mismatched persisted profile', () => {
	const persisted = narrativeProfileEngine.createDefault('PROTAGONIST');
	const resolved = narrativeProfileEngine.resolve({
		mode: 'FREE_ROAM',
		narrativeProfile: persisted,
		source: 'RUN',
	});

	assert.equal(resolved.profile.mode, 'FREE_ROAM');
	assert.equal(resolved.profile.profileId, 'narrative.free_roam.v1');
	assert.ok(resolved.warnings.some((warning) => warning.includes('did not match persisted profile mode')));
});

test('Phase 2 — world synthesis preserves every rules × narrative combination', async () => {
	const service = new WorldSynthesisService(() => ({
		executeTaskGeneration: async () => ({
			source: 'DETERMINISTIC_FALLBACK',
			providerId: 'provider_test',
			modelId: 'model_test',
			fallbackReason: 'Phase 2 test',
			attempts: 1,
		}),
	} as any));

	for (const rulesMode of RULES_MODES) {
		for (const narrativeMode of NARRATIVE_MODES) {
			const world = await service.synthesizeWorldFromPremise({
				naturalLanguagePremise: 'A frontier settlement survives around an ancient observatory.',
				generationSeed: 'phase2-' + rulesMode + '-' + narrativeMode,
				storyMode: narrativeMode,
				dndRulesMode: rulesMode,
			});

			assert.equal(world.storyMode, narrativeMode);
			assert.equal(world.narrativeProfile?.mode, narrativeMode);
			assert.equal(world.dndRulesMode, rulesMode);
			assert.equal(world.rulesProfile?.mode, rulesMode);
			assert.notEqual(world.narrativeProfile?.profileId, undefined);
		}
	}
});

test('Phase 2 — confirmed character narrative mode is authoritative at StoryRun creation', () => {
	const repo = new InMemoryWorldRepository();
	const worldId = 'phase2_confirmed_character_authority_world';

	repo.saveWorldTemplate({
		worldId,
		title: 'Confirmed Character Authority World',
		summary: 'Authority test',
		description: 'Authority test',
		rulesetId: 'FULL_DND',
		dndRulesMode: 'FULL_DND',
		rulesProfile: rulesProfileEngine.createDefault('FULL_DND'),
		storyMode: 'PROTAGONIST',
		narrativeProfile: narrativeProfileEngine.createDefault('PROTAGONIST'),
	});

	const confirmedCharacter = {
		characterId: 'phase2_authority_character',
		worldId,
		worldVersion: 1,
		identity: { name: 'Authority Character' },
		role: { profession: 'Scout', archetype: 'Scout', role: 'Side Character' },
		storyMode: 'SIDE_CHARACTER' as CharacterStoryMode,
		narrativeProfile: narrativeProfileEngine.createDefault('SIDE_CHARACTER'),
	};

	const result = repo.createStoryRunFromConfirmedCharacter({
		worldId,
		confirmedCharacter,
		storyMode: 'FREE_ROAM',
		narrativeProfile: narrativeProfileEngine.createDefault('FREE_ROAM'),
	});

	assert.equal(result.run.storyMode, 'SIDE_CHARACTER');
	assert.equal(result.run.narrativeProfile?.mode, 'SIDE_CHARACTER');
	assert.equal(repo.getNarrativeProfile(result.storyId)?.mode, 'SIDE_CHARACTER');
});

test('Phase 2 — StoryRun API uses the stored confirmed character instead of trusting a submitted character payload', () => {
	const repo = new InMemoryWorldRepository();
	const worldId = 'phase2_api_character_authority_world';

	repo.saveWorldTemplate({
		worldId,
		title: 'API Authority World',
		summary: 'API authority test',
		description: 'API authority test',
		rulesetId: 'FULL_DND',
		dndRulesMode: 'FULL_DND',
		rulesProfile: rulesProfileEngine.createDefault('FULL_DND'),
		storyMode: 'PROTAGONIST',
		narrativeProfile: narrativeProfileEngine.createDefault('PROTAGONIST'),
	});

	const canonicalCharacter = {
		characterId: 'phase2_api_canonical_character',
		worldId,
		worldVersion: 1,
		identity: { name: 'Canonical Character' },
		role: { profession: 'Scout', archetype: 'Scout', role: 'Side Character' },
		storyMode: 'SIDE_CHARACTER' as CharacterStoryMode,
		narrativeProfile: narrativeProfileEngine.createDefault('SIDE_CHARACTER'),
	};

	repo.saveConfirmedCharacter(worldId, canonicalCharacter);

	const previousGlobal = (worldRepository as any).getConfirmedCharacter;
	(worldRepository as any).getConfirmedCharacter = (lookupWorldId: string, lookupCharacterId: string) =>
		repo.getConfirmedCharacter(lookupWorldId, lookupCharacterId);

	try {
		const submittedTamperedCharacter = {
			...canonicalCharacter,
			storyMode: 'FREE_ROAM' as CharacterStoryMode,
			narrativeProfile: narrativeProfileEngine.createDefault('FREE_ROAM'),
		};

		const resolution = resolveCanonicalConfirmedCharacter(
			worldId,
			submittedTamperedCharacter,
			canonicalCharacter.characterId
		);

		assert.equal(resolution.error, undefined);
		assert.equal(resolution.character.storyMode, 'SIDE_CHARACTER');
		assert.equal(resolution.character.narrativeProfile.mode, 'SIDE_CHARACTER');

		const missing = resolveCanonicalConfirmedCharacter(
			worldId,
			{ characterId: 'does_not_exist' },
			'does_not_exist'
		);
		assert.equal(missing.character, null);
		assert.equal(missing.error?.status, 404);

		const missingId = resolveCanonicalConfirmedCharacter(worldId, {
			identity: { name: 'Unbound' },
		});
		assert.equal(missingId.character, null);
		assert.equal(missingId.error?.status, 400);
	} finally {
		(worldRepository as any).getConfirmedCharacter = previousGlobal;
	}
});

test('Phase 2 — repository preserves narrative and rules selections independently across all nine combinations', () => {
	const repo = new InMemoryWorldRepository();

	for (const rulesMode of RULES_MODES) {
		for (const narrativeMode of NARRATIVE_MODES) {
			const worldId = 'phase2_combo_world_' + rulesMode + '_' + narrativeMode;
			const storyId = 'phase2_combo_story_' + rulesMode + '_' + narrativeMode;
			repo.saveWorldTemplate({
				worldId,
				title: 'Phase 2 Test World',
				summary: 'Test',
				description: 'Test',
				rulesetId: rulesMode,
				dndRulesMode: rulesMode,
				rulesProfile: rulesProfileEngine.createDefault(rulesMode),
				storyMode: narrativeMode,
				narrativeProfile: narrativeProfileEngine.createDefault(narrativeMode),
			});

			repo.saveStoryRun({
				storyId,
				id: storyId,
				worldId,
				characterName: 'Test Character',
				storyMode: narrativeMode,
				narrativeProfile: narrativeProfileEngine.createDefault(narrativeMode),
				dndRulesMode: rulesMode,
				rulesProfile: rulesProfileEngine.createDefault(rulesMode),
			});

			assert.equal(repo.getNarrativeProfile(storyId)?.mode, narrativeMode);
			assert.equal(repo.getRulesProfile(storyId)?.mode, rulesMode);
		}
	}
});

test('Phase 2 — legacy worlds and runs are migrated on persistence reload', () => {
	const path = join(tmpdir(), 'dreambook-phase2-migration-' + Date.now() + '.json');
	const oldEnv = process.env.DREAMBOOK_PERSISTENCE_PATH;

	try {
		mkdirSync(tmpdir(), { recursive: true });
		writeFileSync(path, JSON.stringify({
			version: 1,
			worldTemplates: {
				legacy_world: {
					worldId: 'legacy_world',
					title: 'Legacy World',
					rulesetId: 'HYBRID_DND',
					dndRulesMode: 'HYBRID_DND',
					playstyle: 'legacy-playstyle',
				},
				canonical_playstyle_world: {
					worldId: 'canonical_playstyle_world',
					title: 'Canonical Legacy World',
					rulesetId: 'FULL_DND',
					dndRulesMode: 'FULL_DND',
					playstyle: 'FREE_ROAM',
				},
			},
			storyRuns: {
				legacy_story: {
					storyId: 'legacy_story',
					worldId: 'legacy_world',
					characterName: 'Legacy Character',
					dndRulesMode: 'HYBRID_DND',
				},
			},
		}, null, 2));

		process.env.DREAMBOOK_PERSISTENCE_PATH = path;
		const repo = new InMemoryWorldRepository();

		assert.equal(repo.getWorldTemplate('legacy_world')?.storyMode, 'PROTAGONIST');
		assert.equal(repo.getWorldTemplate('legacy_world')?.narrativeProfile?.mode, 'PROTAGONIST');
		assert.equal(repo.getWorldTemplate('canonical_playstyle_world')?.storyMode, 'FREE_ROAM');
		assert.equal(repo.getWorldTemplate('canonical_playstyle_world')?.narrativeProfile?.mode, 'FREE_ROAM');
		assert.equal(repo.getStoryRun('legacy_story')?.storyMode, 'PROTAGONIST');
		assert.equal(repo.getStoryRun('legacy_story')?.narrativeProfile?.mode, 'PROTAGONIST');

		const persistedAfterMigration = JSON.parse(readFileSync(path, 'utf8'));
		assert.equal(persistedAfterMigration.worldTemplates.legacy_world.narrativeProfile.mode, 'PROTAGONIST');
		assert.equal(persistedAfterMigration.storyRuns.legacy_story.narrativeProfile.mode, 'PROTAGONIST');

		const reloadedRepo = new InMemoryWorldRepository();
		assert.equal(reloadedRepo.getNarrativeProfile('legacy_story')?.mode, 'PROTAGONIST');
		assert.equal(reloadedRepo.getRulesProfile('legacy_story')?.mode, 'HYBRID_DND');
	} finally {
		if (oldEnv === undefined) {
			delete process.env.DREAMBOOK_PERSISTENCE_PATH;
		} else {
			process.env.DREAMBOOK_PERSISTENCE_PATH = oldEnv;
		}
		rmSync(path, { force: true });
	}
});

test('Phase 2 — duplicated story branches preserve canonical narrative and rules profiles', () => {
	const repo = new InMemoryWorldRepository();
	const worldId = 'phase2_branch_world';
	const parentStoryId = 'phase2_branch_parent';

	repo.saveWorldTemplate({
		worldId,
		title: 'Branch Test World',
		summary: 'Branch test',
		description: 'Branch test',
		rulesetId: 'CUSTOM_HOMEBREW_DND',
		dndRulesMode: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND'),
		storyMode: 'FREE_ROAM',
		narrativeProfile: narrativeProfileEngine.createDefault('FREE_ROAM'),
	});

	repo.saveStoryRun({
		storyId: parentStoryId,
		id: parentStoryId,
		worldId,
		characterName: 'Branch Parent',
		storyMode: 'FREE_ROAM',
		narrativeProfile: narrativeProfileEngine.createDefault('FREE_ROAM'),
		dndRulesMode: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND'),
	});

	const result = repo.duplicateAdaptationBranch(parentStoryId, 'child');
	assert.equal(result.success, true);

	const childRun = repo.getStoryRun(result.newStoryId);
	assert.equal(childRun?.storyMode, 'FREE_ROAM');
	assert.equal(childRun?.narrativeProfile?.mode, 'FREE_ROAM');
	assert.equal(childRun?.dndRulesMode, 'CUSTOM_HOMEBREW_DND');
	assert.equal(repo.getNarrativeProfile(result.newStoryId)?.mode, 'FREE_ROAM');
	assert.equal(repo.getRulesProfile(result.newStoryId)?.mode, 'CUSTOM_HOMEBREW_DND');
	assert.equal(childRun?.parentStoryId, parentStoryId);
	assert.equal(childRun?.branchId, 'child');
});

test('Phase 2 — normal working context carries canonical campaign modes', () => {
	const worldId = 'phase2_context_world';
	const storyId = 'phase2_context_story';
	worldRepository.saveWorldTemplate({
		worldId,
		title: 'Context Test World',
		summary: 'Context test',
		description: 'Context test',
		rulesetId: 'HYBRID_DND',
		dndRulesMode: 'HYBRID_DND',
		rulesProfile: rulesProfileEngine.createDefault('HYBRID_DND'),
		storyMode: 'SIDE_CHARACTER',
		narrativeProfile: narrativeProfileEngine.createDefault('SIDE_CHARACTER'),
	});
	worldRepository.saveStoryRun({
		storyId,
		id: storyId,
		worldId,
		characterName: 'Context Character',
		storyMode: 'SIDE_CHARACTER',
		narrativeProfile: narrativeProfileEngine.createDefault('SIDE_CHARACTER'),
		dndRulesMode: 'HYBRID_DND',
		rulesProfile: rulesProfileEngine.createDefault('HYBRID_DND'),
	});

	const context = WorkingContextEngine.assembleTurnContext({
		storyId,
		hardTokenBudget: 1000,
		worldRepo: worldRepository,
	});
	const modeChunk = context.chunks.find((chunk) => chunk.id === 'b1_campaign_modes');
	assert.ok(modeChunk);
	assert.match(modeChunk.content, /Rules Mode: HYBRID_DND/);
	assert.match(modeChunk.content, /Narrative Mode: SIDE_CHARACTER/);
	assert.match(modeChunk.content, /SUPPORTING_CAST/);
});

test('Phase 2 — campaign archive round-trip preserves canonical narrative and rules profiles', () => {
	const repo = new InMemoryWorldRepository();
	const worldId = 'phase2_archive_world';
	const storyId = 'phase2_archive_story';

	repo.saveWorldTemplate({
		worldId,
		title: 'Archive Test World',
		summary: 'Archive test',
		description: 'Archive test',
		rulesetId: 'HYBRID_DND',
		dndRulesMode: 'HYBRID_DND',
		rulesProfile: rulesProfileEngine.createDefault('HYBRID_DND'),
		storyMode: 'SIDE_CHARACTER',
		narrativeProfile: narrativeProfileEngine.createDefault('SIDE_CHARACTER'),
	});

	repo.saveStoryRun({
		storyId,
		id: storyId,
		worldId,
		characterName: 'Archive Character',
		storyMode: 'SIDE_CHARACTER',
		narrativeProfile: narrativeProfileEngine.createDefault('SIDE_CHARACTER'),
		dndRulesMode: 'HYBRID_DND',
		rulesProfile: rulesProfileEngine.createDefault('HYBRID_DND'),
	});

	const archive = repo.exportCampaignArchive(storyId, 'Phase 2 Archive Test');
	const restoredRepo = new InMemoryWorldRepository();
	const restore = restoredRepo.restoreCampaignArchive(archive, 'phase2_archive_restored');

	assert.equal(restore.success, true);
	assert.equal(restoredRepo.getNarrativeProfile('phase2_archive_restored')?.mode, 'SIDE_CHARACTER');
	assert.equal(restoredRepo.getRulesProfile('phase2_archive_restored')?.mode, 'HYBRID_DND');
	assert.equal(restoredRepo.getStoryRun('phase2_archive_restored')?.narrativeProfile?.mode, 'SIDE_CHARACTER');
});

test('Phase 2 — runtime projection exposes canonical narrative and rules profiles', () => {
	const worldId = 'phase2_runtime_world';
	const storyId = 'phase2_runtime_story';
	worldRepository.saveWorldTemplate({
		worldId,
		title: 'Runtime Test World',
		summary: 'Runtime test',
		description: 'Runtime test',
		rulesetId: 'CUSTOM_HOMEBREW_DND',
		dndRulesMode: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND'),
		storyMode: 'FREE_ROAM',
		narrativeProfile: narrativeProfileEngine.createDefault('FREE_ROAM'),
	});
	worldRepository.saveStoryRun({
		storyId,
		id: storyId,
		worldId,
		characterName: 'Runtime Character',
		storyMode: 'FREE_ROAM',
		narrativeProfile: narrativeProfileEngine.createDefault('FREE_ROAM'),
		dndRulesMode: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND'),
	});

	assert.equal(worldRepository.getNarrativeProfile(storyId)?.mode, 'FREE_ROAM');
	assert.equal(worldRepository.getRulesProfile(storyId)?.mode, 'CUSTOM_HOMEBREW_DND');
});
