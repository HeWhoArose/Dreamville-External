import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { PersistentGameStore } from '../server/services/persistentGameStore';
import { CURRENT_PERSISTENCE_VERSION, migratePersistenceData } from '../server/services/persistenceMigrationService';
import { UserDataArchiveService } from '../server/domain/userDataArchive';

function withPersistence<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'dreambook-durable-'));
  const previous = process.env.DREAMBOOK_PERSISTENCE_PATH;
  process.env.DREAMBOOK_PERSISTENCE_PATH = join(root, 'data.json');
  try {
    return fn(root);
  } finally {
    if (previous === undefined) delete process.env.DREAMBOOK_PERSISTENCE_PATH;
    else process.env.DREAMBOOK_PERSISTENCE_PATH = previous;
    rmSync(root, { recursive: true, force: true });
  }
}

test('Phase 19: worlds, runs, confirmed characters, drafts and generic user data survive repository reconstruction', () => {
  withPersistence(() => {
    const first = new InMemoryWorldRepository();
    first.saveWorldTemplate({
      worldId: 'durable_world',
      title: 'Durable World',
      storyMode: 'PROTAGONIST',
      rulesetId: 'FULL_DND',
      dndRulesMode: 'FULL_DND',
      worldManifestVersion: 1,
    });

    const draft = {
      draftId: 'draft_dark_knight',
      characterName: 'Unknown Dark Knight',
      identity: { name: 'Unknown Dark Knight' },
      worldId: 'durable_world',
      customMarker: 'draft-survives',
    };
    first.saveCharacterDraft('durable_world', draft);

    const character = {
      characterId: 'char_dark_knight',
      identity: { name: 'Unknown Dark Knight' },
      name: 'Unknown Dark Knight',
      worldId: 'durable_world',
      customMarker: 'confirmed-survives',
    };
    first.saveConfirmedCharacter('durable_world', character);

    first.saveStoryRun({
      storyId: 'run_shadow_depths',
      worldId: 'durable_world',
      title: 'Shadow Depths',
      characterName: 'Unknown Dark Knight',
      protagonist: character,
      runtimeState: { durableMarker: 'run-survives' },
    });

    first.saveUserData('forms', 'character-genesis-progress', {
      field: 'survives',
      nested: { value: 42 },
    });

    const second = new InMemoryWorldRepository();
    assert.equal(second.getWorldTemplate('durable_world')?.title, 'Durable World');
    assert.equal(second.getCharacterDrafts('durable_world')[0]?.customMarker, 'draft-survives');
    assert.equal(second.getConfirmedCharacters('durable_world')[0]?.customMarker, 'confirmed-survives');
    assert.equal(second.getStoryRun('run_shadow_depths')?.runtimeState?.durableMarker, 'run-survives');
    assert.equal(second.getUserData('forms', 'character-genesis-progress')?.nested?.value, 42);

    const health = second.getPersistenceHealth();
    assert.equal(health.enabled, true);
    assert.ok(health.snapshotCount >= 1);
  });
});

test('Phase 19: migrations are additive and preserve unknown data while upgrading drafts', () => {
  const legacy = {
    version: 2,
    schemaVersions: { world: 2, character: 2, rules: 2, content: 2 },
    worldTemplates: { world_a: { title: 'A' } },
    storyRuns: { run_a: { storyId: 'run_a' } },
    confirmedCharacters: { world_a: [{ characterId: 'char_a' }] },
    futureExtension: { preserveMe: true },
  };

  const migrated = migratePersistenceData(legacy);
  assert.equal(migrated.version, CURRENT_PERSISTENCE_VERSION);
  assert.equal(migrated.schemaVersions.character, 3);
  assert.deepEqual(migrated.characterDrafts, {});
  assert.deepEqual(migrated.userData, {});
  assert.deepEqual(migrated.deletionTombstones, []);
  assert.deepEqual(migrated.futureExtension, { preserveMe: true });
});

test('Phase 19: explicit deletion creates durable tombstones and deleted data does not resurrect on restart', () => {
  withPersistence((root) => {
    const repository = new InMemoryWorldRepository();
    repository.saveWorldTemplate({
      worldId: 'delete_me',
      title: 'Delete Me',
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND',
    });
    repository.saveCharacterDraft('delete_me', {
      draftId: 'draft_delete_me',
      characterName: 'Temporary',
      identity: { name: 'Temporary' },
    });
    repository.saveStoryRun({
      storyId: 'run_delete_me',
      worldId: 'delete_me',
      title: 'Delete Me Run',
      characterName: 'Temporary',
    });

    const dataPath = join(root, 'data.json');
    assert.ok(existsSync(dataPath));

    const beforeDelete = JSON.parse(readFileSync(dataPath, 'utf8'));
    assert.ok(beforeDelete.storyRuns.run_delete_me);

    repository.deleteWorldTemplate('delete_me');

    const afterDelete = JSON.parse(readFileSync(dataPath, 'utf8'));
    assert.equal(afterDelete.worldTemplates.delete_me, undefined);
    assert.equal(afterDelete.storyRuns.run_delete_me, undefined);
    assert.ok(afterDelete.deletionTombstones.some((t: any) => t.entityType === 'WORLD' && t.entityId === 'delete_me'));

    const restarted = new InMemoryWorldRepository();
    assert.equal(restarted.getWorldTemplate('delete_me'), null);
    assert.equal(restarted.getStoryRun('run_delete_me'), null);

    const store = new PersistentGameStore();
    const snapshots = store.getSnapshots();
    assert.ok(snapshots.length >= 1);
    assert.ok(readdirSync(join(root, 'history')).length >= 1);
  });
});

test('Phase 19: user-data archive is integrity-protected and merge-restorable', () => {
  withPersistence(() => {
    const original = new InMemoryWorldRepository();
    original.saveWorldTemplate({
      worldId: 'archive_world',
      title: 'Archive World',
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND',
    });
    original.saveCharacterDraft('archive_world', {
      draftId: 'archive_draft',
      characterName: 'Archive Knight',
      identity: { name: 'Archive Knight' },
    });
    original.saveUserData('forms', 'draft-state', { step: 7 });

    const archive = original.exportUserDataArchive();
    const validation = UserDataArchiveService.validate(archive);
    assert.equal(validation.valid, true);

    const tampered = structuredClone(archive);
    tampered.payload.worldTemplates.archive_world.title = 'TAMPERED';
    assert.equal(UserDataArchiveService.validate(tampered).valid, false);

    const restored = new InMemoryWorldRepository({ disablePersistence: true });
    const result = restored.restoreUserDataArchive(archive, { mode: 'MERGE' });
    assert.equal(result.success, true);
    assert.equal(restored.getWorldTemplate('archive_world')?.title, 'Archive World');
    assert.equal(restored.getCharacterDrafts('archive_world')[0]?.characterName, 'Archive Knight');
    assert.equal(restored.getUserData('forms', 'draft-state')?.step, 7);
  });
});

test('Phase 19: corrupted primary persistence can recover from the latest durable snapshot', () => {
  withPersistence((root) => {
    const first = new InMemoryWorldRepository();
    first.saveWorldTemplate({
      worldId: 'recoverable_world',
      title: 'Recoverable World',
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND',
    });
    first.saveUserData('recovery', 'marker', { value: 'recoverable' });

    const dataPath = join(root, 'data.json');
    assert.ok(existsSync(dataPath));

    first.saveUserData('recovery', 'marker', { value: 'newer' });
    writeFileSync(dataPath, '{ this is not valid json', 'utf8');

    const recovered = new InMemoryWorldRepository();
    assert.equal(recovered.getWorldTemplate('recoverable_world')?.title, 'Recoverable World');
    assert.equal(recovered.getUserData('recovery', 'marker')?.value, 'recoverable');
  });
});
