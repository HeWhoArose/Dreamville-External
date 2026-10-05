import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { StorySessionRecording } from '../domain/storySessionRecorder';
import { StorySessionRecorder } from '../domain/storySessionRecorder';

export class StorySessionRecordingStore {
	private readonly directory?: string;
	private readonly enabled: boolean;

	constructor(baseDirectory = process.env.DREAMBOOK_RECORDINGS_PATH) {
		this.directory = resolve(baseDirectory || resolve(process.cwd(), '.dreambook', 'recordings'));
		this.enabled = process.env.DREAMBOOK_DISABLE_RECORDING_PERSISTENCE !== '1';
	}

	private filePath(storyId: string): string {
		const safe = String(storyId).replace(/[^a-zA-Z0-9._-]/g, '_');
		return resolve(this.directory!, safe + '.json');
	}

	load(storyId: string): StorySessionRecording | null {
		if (!this.enabled || !this.directory) return null;
		const path = this.filePath(storyId);
		if (!existsSync(path)) return null;
		try {
			const parsed = JSON.parse(readFileSync(path, 'utf8'));
			const validation = StorySessionRecorder.validate(parsed);
			if (!validation.valid) throw new Error(validation.errorReason || 'Invalid story session recording.');
			return parsed as StorySessionRecording;
		} catch (error) {
			console.error('[StorySessionRecordingStore] Failed to load recording.', { storyId, error });
			return null;
		}
	}

	save(recording: StorySessionRecording): void {
		if (!this.enabled || !this.directory) return;
		mkdirSync(dirname(this.filePath(recording.storyId)), { recursive: true });
		const path = this.filePath(recording.storyId);
		const temporaryPath = path + '.tmp';
		writeFileSync(temporaryPath, JSON.stringify(recording), 'utf8');
		renameSync(temporaryPath, path);
	}

	delete(storyId: string): void {
		if (!this.enabled || !this.directory) return;
		const path = this.filePath(storyId);
		try {
			if (existsSync(path)) {
				// Keep deletion explicit and conservative; the runtime never calls this implicitly.
				writeFileSync(path, JSON.stringify({ deleted: true, storyId, deletedAt: new Date().toISOString() }), 'utf8');
			}
		} catch {}
	}
}

export const storySessionRecordingStore = new StorySessionRecordingStore();
