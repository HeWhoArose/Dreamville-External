import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { join } from 'node:path';
import {
	CURRENT_PERSISTENCE_VERSION,
	CURRENT_SCHEMA_VERSIONS,
	PersistenceMigrationService,
	migratePersistenceData,
} from '../server/services/persistenceMigrationService';

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function makeDir(): string {
	const directory = mkdtempSync(join(tmpdir(), 'dreambook-phase13-'));
	tempDirectories.push(directory);
	return directory;
}

describe('Phase 13: Persistence Versioning, Migration & Repair', () => {
	it('migrates the historical v1 save fixture to the current schema without changing gameplay maps', () => {
		const fixturePath = resolve(dirname(new URL(import.meta.url).pathname), 'fixtures/persistence/v1-legacy-save.json');
		const historicalFixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
		const migrated = migratePersistenceData(historicalFixture);

		assert.equal(migrated.version, CURRENT_PERSISTENCE_VERSION);
		assert.deepEqual(migrated.schemaVersions, CURRENT_SCHEMA_VERSIONS);
		assert.deepEqual(migrated.worldTemplates, historicalFixture.worldTemplates);
		assert.deepEqual(migrated.storyRuns, historicalFixture.storyRuns);
		assert.deepEqual(migrated.confirmedCharacters, historicalFixture.confirmedCharacters);
	});

	it('reports current v2 saves as valid and not needing migration', () => {
		const directory = makeDir();
		const filePath = join(directory, 'data.json');
		writeFileSync(filePath, JSON.stringify({
			version: CURRENT_PERSISTENCE_VERSION,
			schemaVersions: CURRENT_SCHEMA_VERSIONS,
			worldTemplates: {},
			storyRuns: {},
			confirmedCharacters: {},
		}));

		const inspection = PersistenceMigrationService.inspectFile(filePath);
		assert.equal(inspection.valid, true);
		assert.equal(inspection.exists, true);
		assert.equal(inspection.needsMigration, false);
		assert.deepEqual(inspection.schemaVersions, CURRENT_SCHEMA_VERSIONS);
	});

	it('migrates a v1 file transactionally and preserves an exact pre-migration backup', () => {
		const directory = makeDir();
		const filePath = join(directory, 'data.json');
		const historical = {
			version: 1,
			worldTemplates: { world_1: { title: 'Keep Me' } },
			storyRuns: { story_1: { worldId: 'world_1' } },
			confirmedCharacters: {},
		};
		const originalText = JSON.stringify(historical, null, 2);
		writeFileSync(filePath, originalText);

		const result = PersistenceMigrationService.migrateFile(filePath);
		assert.equal(result.valid, true);
		assert.equal(result.needsMigration, false);
		assert.ok(result.backupPath);
		assert.equal(existsSync(result.backupPath!), true);
		assert.equal(readFileSync(result.backupPath!, 'utf8'), originalText);

		const migrated = JSON.parse(readFileSync(filePath, 'utf8'));
		assert.equal(migrated.version, CURRENT_PERSISTENCE_VERSION);
		assert.deepEqual(migrated.schemaVersions, CURRENT_SCHEMA_VERSIONS);
		assert.deepEqual(migrated.worldTemplates, historical.worldTemplates);
	});

	it('refuses an unsupported future version without modifying the source file', () => {
		const directory = makeDir();
		const filePath = join(directory, 'data.json');
		const future = {
			version: 999,
			schemaVersions: { world: 999, character: 999, rules: 999, content: 999 },
			worldTemplates: { future_world: { title: 'Do Not Touch' } },
			storyRuns: {},
			confirmedCharacters: {},
		};
		const originalText = JSON.stringify(future, null, 2);
		writeFileSync(filePath, originalText);

		const inspection = PersistenceMigrationService.inspectFile(filePath);
		assert.equal(inspection.valid, false);
		assert.deepEqual(readFileSync(filePath, 'utf8'), originalText);

		const repair = PersistenceMigrationService.repairFile(filePath);
		assert.equal(repair.success, false);
		assert.equal(repair.changed, false);
		assert.equal(readFileSync(filePath, 'utf8'), originalText);
	});

	it('refuses malformed JSON without replacing the source with an empty save', () => {
		const directory = makeDir();
		const filePath = join(directory, 'data.json');
		const malformed = '{ "version": 1, "worldTemplates": ';
		writeFileSync(filePath, malformed);

		const inspection = PersistenceMigrationService.inspectFile(filePath);
		assert.equal(inspection.valid, false);
		assert.equal(readFileSync(filePath, 'utf8'), malformed);
	});
});
