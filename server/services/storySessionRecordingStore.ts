import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { StorySessionInteraction, StorySessionRecording } from '../domain/storySessionRecorder';
import { StorySessionRecorder } from '../domain/storySessionRecorder';

export class StorySessionRecordingStore {
	private readonly directory: string;
	private readonly enabled: boolean;
	private readonly lastPersistedSequence = new Map<string, number>();

	constructor(baseDirectory = process.env.DREAMBOOK_RECORDINGS_PATH) {
		this.directory = resolve(baseDirectory || resolve(process.cwd(), '.dreambook', 'recordings'));
		this.enabled = process.env.NODE_ENV !== 'test' && process.env.DREAMBOOK_DISABLE_RECORDING_PERSISTENCE !== '1';
	}

	private safeStoryId(storyId: string): string {
		return String(storyId).replace(/[^a-zA-Z0-9._-]/g, '_');
	}

	private storyDirectory(storyId: string): string {
		return resolve(this.directory, this.safeStoryId(storyId));
	}

	private manifestPath(storyId: string): string {
		return resolve(this.storyDirectory(storyId), 'manifest.json');
	}

	private interactionsDirectory(storyId: string): string {
		return resolve(this.storyDirectory(storyId), 'interactions');
	}

	private interactionPath(storyId: string, sequence: number): string {
		return resolve(this.interactionsDirectory(storyId), String(sequence).padStart(8, '0') + '.json');
	}

	private writeAtomic(path: string, value: unknown): void {
		const temporaryPath = path + '.tmp';
		writeFileSync(temporaryPath, JSON.stringify(value), 'utf8');
		renameSync(temporaryPath, path);
	}

	load(storyId: string): StorySessionRecording | null {
		if (!this.enabled) return null;
		const manifestPath = this.manifestPath(storyId);
		if (!existsSync(manifestPath)) return null;
		try {
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as StorySessionRecording;
			const interactionsPath = this.interactionsDirectory(storyId);
			const interactions: StorySessionInteraction[] = existsSync(interactionsPath)
				? readdirSync(interactionsPath)
					.filter((name) => name.endsWith('.json'))
					.sort()
					.map((name) => JSON.parse(readFileSync(resolve(interactionsPath, name), 'utf8')) as StorySessionInteraction)
				: [];
			const recording: StorySessionRecording = { ...manifest, interactions };
			const validation = StorySessionRecorder.validate(recording);
			if (!validation.valid) throw new Error(validation.errorReason || 'Invalid story session recording.');
			this.lastPersistedSequence.set(storyId, interactions.length);
			return recording;
		} catch (error) {
			// A damaged/legacy recording must never be silently reused. Preserve it as
			// forensic evidence, then allow the next explicit recording bootstrap to
			// start from the live canonical state rather than exporting an empty or
			// mismatched session.
			const quarantineSuffix = '.invalid-' + new Date().toISOString().replace(/[:.]/g, '-');
			const sourceDirectory = this.storyDirectory(storyId);
			if (existsSync(sourceDirectory)) {
				try {
					renameSync(sourceDirectory, sourceDirectory + quarantineSuffix);
				} catch (quarantineError) {
					console.error('[StorySessionRecordingStore] Failed to quarantine invalid recording.', { storyId, quarantineError });
				}
			}
			this.lastPersistedSequence.delete(storyId);
			console.error('[StorySessionRecordingStore] Quarantined invalid recording.', { storyId, error });
			return null;
		}
	}

	save(recording: StorySessionRecording): void {
		if (!this.enabled) return;
		const storyDir = this.storyDirectory(recording.storyId);
		const interactionsDir = this.interactionsDirectory(recording.storyId);
		mkdirSync(interactionsDir, { recursive: true });

		const persistedSequence = this.lastPersistedSequence.get(recording.storyId) || 0;
		for (const interaction of recording.interactions.slice(persistedSequence)) {
			this.writeAtomic(this.interactionPath(recording.storyId, interaction.sequence), interaction);
		}

		// The manifest is intentionally compact: the growing per-turn evidence lives
		// in individual interaction records, avoiding O(N^2) rewrites during long stories.
		const manifest: StorySessionRecording = {
			...recording,
			interactions: [],
			finalState: undefined,
		};
		this.writeAtomic(this.manifestPath(recording.storyId), manifest);
		this.lastPersistedSequence.set(recording.storyId, recording.interactions.length);
	}

	delete(storyId: string): void {
		// Recordings are forensic evidence and are never deleted implicitly.
		void storyId;
	}
}

export const storySessionRecordingStore = new StorySessionRecordingStore();
