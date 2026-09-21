import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface PersistentGameStoreData {
	version: 1;
	worldTemplates: Record<string, any>;
	storyRuns: Record<string, any>;
}

const EMPTY_STORE: PersistentGameStoreData = {
	version: 1,
	worldTemplates: {},
	storyRuns: {},
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
			if (!parsed || typeof parsed !== 'object') {
				return structuredClone(EMPTY_STORE);
			}

			return {
			version: 1,
			worldTemplates: parsed.worldTemplates && typeof parsed.worldTemplates === 'object' ? parsed.worldTemplates : {},
			storyRuns: parsed.storyRuns && typeof parsed.storyRuns === 'object' ? parsed.storyRuns : {},
		};
		} catch (error) {
			console.warn('[PersistentGameStore] Unable to load persistence file; starting with an empty store.', error);
			return structuredClone(EMPTY_STORE);
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
}
