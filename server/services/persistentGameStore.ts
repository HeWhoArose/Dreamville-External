import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
	CURRENT_PERSISTENCE_VERSION,
	CURRENT_SCHEMA_VERSIONS,
	PersistenceMigrationService,
	type PersistenceInspection,
	type PersistenceRepairResult,
	migratePersistenceData,
	type VersionedPersistenceData,
} from './persistenceMigrationService';

export interface PersistentGameStoreData {
	version: typeof CURRENT_PERSISTENCE_VERSION;
	schemaVersions: typeof CURRENT_SCHEMA_VERSIONS;
	worldTemplates: Record<string, any>;
	storyRuns: Record<string, any>;
	confirmedCharacters?: Record<string, any>;
}

const EMPTY_STORE: PersistentGameStoreData = {
	version: CURRENT_PERSISTENCE_VERSION,
	schemaVersions: { ...CURRENT_SCHEMA_VERSIONS },
	worldTemplates: {},
	storyRuns: {},
	confirmedCharacters: {},
};

function isRunningUnderTests(): boolean {
	return Boolean(
		process.env.NODE_TEST_CONTEXT ||
		process.env.npm_lifecycle_event === 'test' ||
		process.argv.some((arg) => arg.includes('--test'))
	);
}

export class PersistentGameStore {
	private readonly filePath?: string;
	private readonly isEnabled: boolean;

	constructor(filePath = process.env.DREAMBOOK_PERSISTENCE_PATH) {
		if (filePath) {
			this.filePath = resolve(filePath);
			this.isEnabled = true;
		} else if (isRunningUnderTests()) {
			this.filePath = undefined;
			this.isEnabled = false;
		} else {
			this.filePath = resolve(process.cwd(), '.dreambook', 'data.json');
			this.isEnabled = true;
		}
	}

	load(): PersistentGameStoreData {
		if (!this.isEnabled || !this.filePath || !existsSync(this.filePath)) {
			return structuredClone(EMPTY_STORE);
		}

		try {
			const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
			const migrated = migratePersistenceData(parsed);
			return {
				version: migrated.version,
				schemaVersions: migrated.schemaVersions,
				worldTemplates: migrated.worldTemplates,
				storyRuns: migrated.storyRuns,
				confirmedCharacters: migrated.confirmedCharacters,
			};
		} catch (error) {
			console.error('[PersistentGameStore] Persistence load/migration failed; source file was not modified.', error);
			throw error;
		}
	}

	save(data: PersistentGameStoreData): void {
		if (!this.isEnabled || !this.filePath) {
			return;
		}

		const directory = dirname(this.filePath);
		mkdirSync(directory, { recursive: true });

		const temporaryPath = `${this.filePath}.tmp`;
		const serialized = JSON.stringify(data, null, 2);
		writeFileSync(temporaryPath, serialized, 'utf8');
		renameSync(temporaryPath, this.filePath);
	}

	getPath(): string | undefined {
		return this.filePath;
	}

	inspectPersistence(): PersistenceInspection {
		return PersistenceMigrationService.inspectFile(this.filePath);
	}

	migratePersistence(): PersistenceInspection {
		return PersistenceMigrationService.migrateFile(this.filePath);
	}

	repairPersistence(): PersistenceRepairResult {
		return PersistenceMigrationService.repairFile(this.filePath);
	}
}
