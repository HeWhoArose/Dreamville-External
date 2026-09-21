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

export class PersistentGameStore {
	private readonly filePath: string;

	constructor(filePath = process.env.DREAMBOOK_PERSISTENCE_PATH || resolve(process.cwd(), '.dreambook', 'data.json')) {
		this.filePath = resolve(filePath);
	}

	load(): PersistentGameStoreData {
		if (!existsSync(this.filePath)) {
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
		const directory = dirname(this.filePath);
		mkdirSync(directory, { recursive: true });

		const temporaryPath = `${this.filePath}.tmp`;
		const serialized = JSON.stringify(data, null, 2);
		writeFileSync(temporaryPath, serialized, 'utf8');
		renameSync(temporaryPath, this.filePath);
	}

	getPath(): string {
		return this.filePath;
	}
}
