import * as crypto from 'node:crypto';

export type StorySessionInteractionKind =
	| 'CANONICAL_COMMAND'
	| 'DIRECT_TURN'
	| 'OPENING_SCENE'
	| 'AUXILIARY';

export interface StorySessionJsonPatchOperation {
	op: 'add' | 'remove' | 'replace';
	path: string;
	value?: unknown;
}

export interface StorySessionInteraction {
	sequence: number;
	interactionId: string;
	kind: StorySessionInteractionKind;
	source: string;
	startedAt: string;
	completedAt: string;
	durationMs: number;
	success: boolean;
	rolledBack: boolean;
	command?: unknown;
	request?: unknown;
	result?: unknown;
	error?: string;
	turn?: {
		turnId?: string;
		task?: string;
		playerAction?: string;
		playerIntent?: unknown;
		currentSituation?: unknown;
		narrativePlan?: unknown;
		researchPacket?: unknown;
		researchAudit?: unknown;
		contextAudit?: unknown;
		narrativeProviderHandoff?: unknown;
		narratorVoiceState?: unknown;
		narrativePacingContract?: unknown;
		narrativeContinuityState?: unknown;
		narrativeNoveltyState?: unknown;
		narrationPrompt?: string;
		narrationStyleInstruction?: string;
		workingContext?: string;
		turnPackage?: unknown;
		narrativeReview?: unknown;
		literaryReview?: unknown;
		narrativeRichnessEvaluation?: unknown;
		stateAdjudication?: unknown;
		telemetry?: unknown;
		attemptsTrail?: unknown[];
	};
	canonicalEvent?: unknown;
	stateBeforeHash: string;
	stateAfterHash: string;
	statePatch: StorySessionJsonPatchOperation[];
	mutationPaths?: string[];
};

export interface StorySessionRecording {
	format: 'DREAMVILLE_STORY_SESSION_RECORDING';
	schemaVersion: '1.1.0';
	recorderVersion: '1.1.0';
	recordingId: string;
	/** Identifies the concrete StoryRun incarnation. A reused storyId may have many sessions. */
	runSessionId: string;
	storyId: string;
	title: string;
	startedAt: string;
	endedAt?: string;
	engineVersion: string;
	mode: 'FORENSIC';
	includes: {
		worldState: true;
		playerState: true;
		npcState: true;
		relationships: true;
		memories: true;
		livingWorld: true;
		chronicle: true;
		narrativeHistory: true;
		canonicalEvents: true;
		playerInputs: true;
		aiPipelineContext: true;
		aiPrompts: true;
		providerProvenance: true;
		attemptsAndFallbacks: true;
		adjudication: true;
		beforeAfterStateHashes: true;
		losslessStatePatches: true;
	};
	initialState: unknown;
	interactions: StorySessionInteraction[];
	finalState?: unknown;
	finalStateHash?: string;
};

function clone<T>(value: T): T {
	if (value === undefined) return value;
	return JSON.parse(JSON.stringify(value)) as T;
}

function escapePointerSegment(value: string): string {
	return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function hash(value: unknown): string {
	return crypto.createHash('sha256').update(JSON.stringify(value ?? null), 'utf8').digest('hex');
}

function diff(before: unknown, after: unknown, path = ''): StorySessionJsonPatchOperation[] {
	if (Object.is(before, after)) return [];

	if (Array.isArray(before) && Array.isArray(after)) {
		const operations: StorySessionJsonPatchOperation[] = [];
		const common = Math.min(before.length, after.length);
		for (let i = 0; i < common; i += 1) {
			operations.push(...diff(before[i], after[i], path + '/' + i));
		}
		for (let i = before.length - 1; i >= after.length; i -= 1) {
			operations.push({ op: 'remove', path: path + '/' + i });
		}
		for (let i = common; i < after.length; i += 1) {
			operations.push({ op: 'add', path: path + '/-', value: clone(after[i]) });
		}
		return operations;
	}

	if (
		before !== null &&
		after !== null &&
		typeof before === 'object' &&
		typeof after === 'object' &&
		!Array.isArray(before) &&
		!Array.isArray(after)
	) {
		const operations: StorySessionJsonPatchOperation[] = [];
		const beforeRecord = before as Record<string, unknown>;
		const afterRecord = after as Record<string, unknown>;
		const beforeKeys = Object.keys(beforeRecord);
		const afterKeys = Object.keys(afterRecord);
		for (const key of beforeKeys) {
			if (!Object.prototype.hasOwnProperty.call(afterRecord, key)) {
				operations.push({ op: 'remove', path: path + '/' + escapePointerSegment(key) });
			}
		}
		for (const key of afterKeys) {
			const childPath = path + '/' + escapePointerSegment(key);
			if (!Object.prototype.hasOwnProperty.call(beforeRecord, key)) {
				operations.push({ op: 'add', path: childPath, value: clone(afterRecord[key]) });
			} else {
				operations.push(...diff(beforeRecord[key], afterRecord[key], childPath));
			}
		}
		return operations;
	}

	return [{ op: 'replace', path: path || '/', value: clone(after) }];
}

function applyPatch(root: any, operations: StorySessionJsonPatchOperation[]): any {
	const result = clone(root);
	const decode = (path: string) =>
		path
			.split('/')
			.slice(1)
			.map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

	for (const operation of operations) {
		if (operation.path === '/') {
			if (operation.op === 'remove') return undefined;
			return clone(operation.value);
		}

		const parts = decode(operation.path);
		const last = parts.pop();
		if (last === undefined) continue;
		let cursor: any = result;
		for (const part of parts) {
			cursor = cursor[part];
		}

		if (Array.isArray(cursor)) {
			if (operation.op === 'add') {
				if (last === '-') cursor.push(clone(operation.value));
				else cursor.splice(Number(last), 0, clone(operation.value));
			} else if (operation.op === 'remove') {
				cursor.splice(Number(last), 1);
			} else {
				cursor[Number(last)] = clone(operation.value);
			}
		} else if (operation.op === 'remove') {
			delete cursor[last];
		} else {
			cursor[last] = clone(operation.value);
		}
	}
	return result;
}


export interface StartStorySessionRecordingParams {
	storyId: string;
	runSessionId?: string;
	title?: string;
	initialState: unknown;
	engineVersion?: string;
}

export interface RecordStorySessionInteractionParams {
	storyId: string;
	kind: StorySessionInteractionKind;
	source: string;
	startedAt: string;
	completedAt: string;
	success: boolean;
	rolledBack: boolean;
	command?: unknown;
	request?: unknown;
	result?: unknown;
	error?: string;
	turn?: StorySessionInteraction['turn'];
	canonicalEvent?: unknown;
	stateBefore: unknown;
	stateAfter: unknown;
	mutationPaths?: string[];
}

export class StorySessionRecorder {
	public static readonly FORMAT = 'DREAMVILLE_STORY_SESSION_RECORDING' as const;
	public static readonly SCHEMA_VERSION = '1.0.0';
	public static readonly RECORDER_VERSION = '1.0.0';

	public static start(params: StartStorySessionRecordingParams): StorySessionRecording {
		const now = new Date().toISOString();
		return {
			format: this.FORMAT,
			schemaVersion: this.SCHEMA_VERSION,
			recorderVersion: this.RECORDER_VERSION,
			recordingId: crypto.randomUUID(),
			runSessionId: params.runSessionId || `legacy:${params.storyId}`,
			storyId: params.storyId,
			title: params.title?.trim() || 'Dreamville Story Session',
			startedAt: now,
			engineVersion: params.engineVersion || 'unknown',
			mode: 'FORENSIC',
			includes: {
				worldState: true,
				playerState: true,
				npcState: true,
				relationships: true,
				memories: true,
				livingWorld: true,
				chronicle: true,
				narrativeHistory: true,
				canonicalEvents: true,
				playerInputs: true,
				aiPipelineContext: true,
				aiPrompts: true,
				providerProvenance: true,
				attemptsAndFallbacks: true,
				adjudication: true,
				beforeAfterStateHashes: true,
				losslessStatePatches: true,
			},
			initialState: clone(params.initialState),
			interactions: [],
		};
	}

	public static append(
		recording: StorySessionRecording,
		params: RecordStorySessionInteractionParams,
	): void {
		if (recording.storyId !== params.storyId) {
			throw new Error('Story session recording storyId mismatch.');
		}
		if (recording.endedAt) {
			throw new Error('Cannot append to a stopped story session recording.');
		}
		const expectedBeforeHash = recording.interactions.length
			? recording.interactions[recording.interactions.length - 1].stateAfterHash
			: hash(recording.initialState);
		const suppliedBeforeHash = hash(params.stateBefore);
		if (suppliedBeforeHash !== expectedBeforeHash) {
			throw new Error(
				`Story session state-before mismatch at interaction ${recording.interactions.length + 1}: expected ${expectedBeforeHash}, got ${suppliedBeforeHash}.`,
			);
		}
		const sequence = recording.interactions.length + 1;
		const before = clone(params.stateBefore);
		const after = clone(params.stateAfter);
		const statePatch = diff(before, after);
		const interaction: StorySessionInteraction = {
			sequence,
			interactionId: crypto.randomUUID(),
			kind: params.kind,
			source: params.source,
			startedAt: params.startedAt,
			completedAt: params.completedAt,
			durationMs: Math.max(0, new Date(params.completedAt).getTime() - new Date(params.startedAt).getTime()),
			success: params.success,
			rolledBack: params.rolledBack,
			...(params.command !== undefined ? { command: clone(params.command) } : {}),
			...(params.request !== undefined ? { request: clone(params.request) } : {}),
			...(params.result !== undefined ? { result: clone(params.result) } : {}),
			...(params.error ? { error: params.error } : {}),
			...(params.turn ? { turn: clone(params.turn) } : {}),
			...(params.canonicalEvent !== undefined ? { canonicalEvent: clone(params.canonicalEvent) } : {}),
			stateBeforeHash: hash(before),
			stateAfterHash: hash(after),
			statePatch,
			...(params.mutationPaths ? { mutationPaths: [...params.mutationPaths] } : {}),
		};
		recording.interactions.push(interaction);
		recording.finalStateHash = hash(after);
		delete recording.finalState;
	}

	public static stop(recording: StorySessionRecording): void {
		recording.endedAt = new Date().toISOString();
		recording.finalState = this.applyPatches(recording);
		recording.finalStateHash = hash(recording.finalState);
	}

	public static validate(recording: unknown): { valid: boolean; errorReason?: string; interactionCount?: number } {
		if (!recording || typeof recording !== 'object') return { valid: false, errorReason: 'Recording root must be an object.' };
		const value = recording as Partial<StorySessionRecording>;
		if (value.format !== this.FORMAT) return { valid: false, errorReason: 'Unsupported story session recording format.' };
		if (value.schemaVersion !== this.SCHEMA_VERSION && value.schemaVersion !== '1.0.0') return { valid: false, errorReason: 'Unsupported story session recording schema version.' };
		if (value.schemaVersion === this.SCHEMA_VERSION && !value.runSessionId) return { valid: false, errorReason: 'Recording is missing runSessionId.' };
		if (!value.storyId || !value.recordingId) return { valid: false, errorReason: 'Recording metadata is incomplete.' };
		if (!value.initialState) return { valid: false, errorReason: 'Recording is missing initialState.' };
		if (!Array.isArray(value.interactions)) return { valid: false, errorReason: 'Recording interactions must be an array.' };

		let reconstructed = clone(value.initialState);
		for (let index = 0; index < value.interactions.length; index += 1) {
			const interaction = value.interactions[index];
			if (!interaction || typeof interaction !== 'object') return { valid: false, errorReason: 'Recording contains an invalid interaction.' };
			if (interaction.sequence !== index + 1) return { valid: false, errorReason: `Recording sequence is not contiguous at interaction ${index + 1}.` };
			const beforeHash = hash(reconstructed);
			if (interaction.stateBeforeHash !== beforeHash) {
				return {
					valid: false,
					errorReason: `State-before integrity failure at interaction ${interaction.sequence}: expected ${interaction.stateBeforeHash}, got ${beforeHash}.`,
				};
			}
			reconstructed = applyPatch(reconstructed, interaction.statePatch || []);
			const reconstructedHash = hash(reconstructed);
			if (reconstructedHash !== interaction.stateAfterHash) {
				return {
					valid: false,
					errorReason: `State patch integrity failure at interaction ${interaction.sequence}: expected ${interaction.stateAfterHash}, got ${reconstructedHash}.`,
				};
			}
		}

		if (value.finalStateHash) {
			const finalHash = hash(reconstructed);
			if (finalHash !== value.finalStateHash) {
				return { valid: false, errorReason: `Final state integrity failure: expected ${value.finalStateHash}, got ${finalHash}.` };
			}
		}

		return { valid: true, interactionCount: value.interactions.length };
	}

	public static export(recording: StorySessionRecording): StorySessionRecording {
		return clone(recording);
	}

	public static summarize(recording: StorySessionRecording): {
		recordingId: string;
		storyId: string;
		title: string;
		startedAt: string;
		endedAt?: string;
		interactionCount: number;
		successfulInteractions: number;
		failedInteractions: number;
		rolledBackInteractions: number;
		aiBackedInteractions: number;
		generatedTurns: number;
		providers: Record<string, number>;
		tasks: Record<string, number>;
	} {
		const providers: Record<string, number> = {};
		const tasks: Record<string, number> = {};
		let aiBackedInteractions = 0;
		let generatedTurns = 0;
		for (const interaction of recording.interactions) {
			const turn = interaction.turn;
			if (!turn) continue;
			aiBackedInteractions += 1;
			if (turn.turnPackage || turn.telemetry) generatedTurns += 1;
			const telemetry = turn.telemetry as any;
			if (telemetry?.selectedProviderId) {
				providers[telemetry.selectedProviderId] = (providers[telemetry.selectedProviderId] || 0) + 1;
			}
			if (telemetry?.taskId) tasks[telemetry.taskId] = (tasks[telemetry.taskId] || 0) + 1;
		}
		return {
			recordingId: recording.recordingId,
			storyId: recording.storyId,
			title: recording.title,
			startedAt: recording.startedAt,
			...(recording.endedAt ? { endedAt: recording.endedAt } : {}),
			interactionCount: recording.interactions.length,
			successfulInteractions: recording.interactions.filter((i) => i.success).length,
			failedInteractions: recording.interactions.filter((i) => !i.success).length,
			rolledBackInteractions: recording.interactions.filter((i) => i.rolledBack).length,
			aiBackedInteractions,
			generatedTurns,
			providers,
			tasks,
		};
	}

	public static applyPatches(recording: StorySessionRecording): unknown {
		let state = clone(recording.initialState);
		for (const interaction of recording.interactions) {
			state = applyPatch(state, interaction.statePatch);
		}
		return state;
	}
}
