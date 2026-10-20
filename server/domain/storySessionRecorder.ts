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
	schemaVersion: '1.0.0' | '1.1.0' | '1.2.0';
	recorderVersion: '1.1.0' | '1.2.0';
	recordingId: string;
	/** Identifies the concrete StoryRun incarnation; storyId alone can be reused. */
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

/**
 * Insertion-order-sensitive hash used by schema 1.0.0 and 1.1.0 recordings.
 * Kept only so those recordings still validate and extend exactly as before.
 *
 * Its weakness: `JSON.stringify` depends on object key order, while the
 * positional array diff used for patches can legitimately rebuild an object
 * with the same content in a different key order (for example when a new
 * action-log entry becomes index 0 and a field is added in the middle). The
 * reconstructed state then hashes differently from the live state even though
 * the data is identical, and export validation fails.
 */
function legacyHash(value: unknown): string {
	// Session-recording integrity hashes cover the entire lossless snapshot,
	// including denormalized runtimeState fields. Intervening changes are
	// represented by explicit AUXILIARY bridge interactions rather than omitted
	// from the hash and made invisible to tamper detection.
	return crypto.createHash('sha256').update(JSON.stringify(value ?? null), 'utf8').digest('hex');
}

/**
 * JSON-equivalent serialization with object keys sorted, so equal data hashes
 * equally regardless of key insertion order. Matches `JSON.stringify` semantics
 * for undefined, functions, symbols, NaN and `toJSON`, so tamper detection still
 * covers every value `JSON.stringify` would cover.
 */
function canonicalStringify(value: unknown): string | undefined {
	if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	const withToJson = value as { toJSON?: () => unknown };
	if (typeof withToJson.toJSON === 'function') return canonicalStringify(withToJson.toJSON());
	if (Array.isArray(value)) {
		let out = '[';
		for (let i = 0; i < value.length; i += 1) {
			if (i > 0) out += ',';
			const item = value[i];
			// Primitives are the bulk of any snapshot; skip the recursive call for them.
			out += item !== null && typeof item === 'object' ? (canonicalStringify(item) ?? 'null') : (JSON.stringify(item) ?? 'null');
		}
		return out + ']';
	}
	const record = value as Record<string, unknown>;
	let out = '{';
	let first = true;
	for (const key of Object.keys(record).sort()) {
		const child = record[key];
		const serialized = child !== null && typeof child === 'object' ? canonicalStringify(child) : JSON.stringify(child);
		if (serialized === undefined) continue; // undefined, functions and symbols are omitted, as in JSON.stringify
		out += (first ? '' : ',') + JSON.stringify(key) + ':' + serialized;
		first = false;
	}
	return out + '}';
}

function canonicalHash(value: unknown): string {
	return crypto.createHash('sha256').update(canonicalStringify(value ?? null) ?? 'null', 'utf8').digest('hex');
}

/** Schema 1.2.0 and later use the key-order-independent hash; older schemas keep the legacy one. */
function hashFor(recording: { schemaVersion?: string }): (value: unknown) => string {
	return recording.schemaVersion === '1.2.0' ? canonicalHash : legacyHash;
}

interface ReconstructedRecordingTail {
	state: unknown;
	interactionCount: number;
	lastStateAfterHash: string;
	lastPatchHash: string;
}

const reconstructedRecordingTails = new WeakMap<StorySessionRecording, ReconstructedRecordingTail>();

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
	public static readonly SCHEMA_VERSION = '1.2.0' as const;
	public static readonly RECORDER_VERSION = '1.2.0' as const;

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

	private static reconstructedTail(recording: StorySessionRecording): unknown {
		const hash = hashFor(recording);
		const interactions = recording.interactions;
		const last = interactions[interactions.length - 1];
		const lastPatchHash = last ? hash(last.statePatch) : '';
		const cached = reconstructedRecordingTails.get(recording);
		if (
			cached &&
			cached.interactionCount === interactions.length &&
			cached.lastStateAfterHash === (last?.stateAfterHash || hash(recording.initialState)) &&
			cached.lastPatchHash === lastPatchHash
		) {
			return clone(cached.state);
		}

		// A loaded recording is reconstructed once and then cached. If its tail was
		// edited outside the recorder, validate the existing chain before extending it.
		const validation = this.validate(recording);
		if (!validation.valid) {
			throw new Error('Existing story session recording integrity failure: ' + validation.errorReason);
		}
		const state = this.applyPatches(recording);
		const tailHash = hash(state);
		const expectedTailHash = last?.stateAfterHash || hash(recording.initialState);
		if (tailHash !== expectedTailHash) {
			throw new Error('Existing story session recording tail does not match its stored integrity hash.');
		}
		reconstructedRecordingTails.set(recording, {
			state: clone(state),
			interactionCount: interactions.length,
			lastStateAfterHash: expectedTailHash,
			lastPatchHash,
		});
		return state;
	}

	/**
	 * Preserve state changes observed between interaction recorder boundaries.
	 * This does not relax append-time hash checks: the gap becomes its own,
	 * explicitly labelled AUXILIARY interaction with a normal before/after hash
	 * and patch. It must never be attributed silently to the next command.
	 */
	public static appendBoundaryTransitionIfNeeded(
		recording: StorySessionRecording,
		params: {
			storyId: string;
			stateBefore: unknown;
			nextInteractionKind: StorySessionInteractionKind;
			nextInteractionSource: string;
		},
	): boolean {
		if (recording.interactions.length === 0 || recording.endedAt) return false;
		const hash = hashFor(recording);
		const candidate = params.stateBefore as any;
		const isCanonicalSnapshot = Boolean(
			candidate &&
			typeof candidate === 'object' &&
			typeof candidate.storyId === 'string' &&
			candidate.storyId === params.storyId &&
			Object.prototype.hasOwnProperty.call(candidate, 'worldClock') &&
			Object.prototype.hasOwnProperty.call(candidate, 'player') &&
			candidate.adaptation &&
			typeof candidate.adaptation === 'object',
		);
		if (!isCanonicalSnapshot) return false;

		const previousState = this.reconstructedTail(recording);
		if (hash(previousState) === hash(params.stateBefore)) return false;

		const stateBefore = clone(previousState);
		const stateAfter = clone(params.stateBefore);
		const changedPaths = diff(stateBefore, stateAfter).map((operation) => operation.path);
		const timestamp = new Date().toISOString();
		this.append(recording, {
			storyId: params.storyId,
			kind: 'AUXILIARY',
			source: 'STORY_SESSION_BOUNDARY_RECONCILIATION',
			startedAt: timestamp,
			completedAt: timestamp,
			success: true,
			rolledBack: false,
			request: {
				nextInteractionKind: params.nextInteractionKind,
				nextInteractionSource: params.nextInteractionSource,
			},
			result: {
				kind: 'OUT_OF_BAND_STATE_TRANSITION',
				note: 'Observed state changes between recorder boundaries were preserved as a separate AUXILIARY interaction and are not attributed to the next command.',
				changedPathCount: changedPaths.length,
			},
			stateBefore,
			stateAfter,
			mutationPaths: changedPaths.slice(0, 128),
		});
		return true;
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
		const hash = hashFor(recording);
		// StateRun.runtimeState is an ignored/denormalized projection for canonical
		// hash purposes, but its latest value still belongs in the reconstructable
		// snapshot. Patch from the previous recorded post-state so intervening cache
		// reserialization is captured instead of breaking the next interaction chain.
		const previousState = this.reconstructedTail(recording);
		const expectedBeforeHash = recording.interactions.length
			? recording.interactions[recording.interactions.length - 1].stateAfterHash
			: hash(recording.initialState);
		if (hash(previousState) !== expectedBeforeHash) {
			throw new Error('Existing story session recording tail has an invalid integrity hash.');
		}
		const suppliedBeforeHash = hash(params.stateBefore);
		if (suppliedBeforeHash !== expectedBeforeHash) {
			throw new Error(
				`Story session state-before mismatch at interaction ${recording.interactions.length + 1}: expected ${expectedBeforeHash}, got ${suppliedBeforeHash}.`,
			);
		}
		const sequence = recording.interactions.length + 1;
		const before = clone(params.stateBefore);
		const after = clone(params.stateAfter);
		const statePatch = diff(previousState, after);
		// `before` is a clone of params.stateBefore, so its hash is the one already verified above.
		const afterHash = hash(after);
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
			stateBeforeHash: suppliedBeforeHash,
			stateAfterHash: afterHash,
			statePatch,
			...(params.mutationPaths ? { mutationPaths: [...params.mutationPaths] } : {}),
		};
		recording.interactions.push(interaction);
		recording.finalStateHash = afterHash;
		reconstructedRecordingTails.set(recording, {
			state: clone(after),
			interactionCount: recording.interactions.length,
			lastStateAfterHash: interaction.stateAfterHash,
			lastPatchHash: hash(interaction.statePatch),
		});
		delete recording.finalState;
	}

	public static stop(recording: StorySessionRecording): void {
		const hash = hashFor(recording);
		recording.endedAt = new Date().toISOString();
		recording.finalState = this.applyPatches(recording);
		recording.finalStateHash = hash(recording.finalState);
	}

	public static validate(recording: unknown): { valid: boolean; errorReason?: string; interactionCount?: number } {
		if (!recording || typeof recording !== 'object') return { valid: false, errorReason: 'Recording root must be an object.' };
		const value = recording as Partial<StorySessionRecording>;
		if (value.format !== this.FORMAT) return { valid: false, errorReason: 'Unsupported story session recording format.' };
		if (value.schemaVersion !== this.SCHEMA_VERSION && value.schemaVersion !== '1.1.0' && value.schemaVersion !== '1.0.0') {
			return { valid: false, errorReason: 'Unsupported story session recording schema version.' };
		}
		if (value.schemaVersion !== '1.0.0' && (typeof value.runSessionId !== 'string' || !value.runSessionId.trim())) {
			return { valid: false, errorReason: 'Recording is missing runSessionId.' };
		}
		if (!value.storyId || !value.recordingId) return { valid: false, errorReason: 'Recording metadata is incomplete.' };
		if (!value.initialState) return { valid: false, errorReason: 'Recording is missing initialState.' };
		if (!Array.isArray(value.interactions)) return { valid: false, errorReason: 'Recording interactions must be an array.' };
		const hash = hashFor(value);

		let reconstructed = clone(value.initialState);
		for (let index = 0; index < value.interactions.length; index += 1) {
			const interaction = value.interactions[index];
			if (!interaction || typeof interaction !== 'object') return { valid: false, errorReason: 'Recording contains an invalid interaction.' };
			if (interaction.sequence !== index + 1) {
				return { valid: false, errorReason: `Recording sequence is not contiguous at interaction ${index + 1}.` };
			}
			const beforeHash = hash(reconstructed);
			if (interaction.stateBeforeHash !== beforeHash) {
				if (interaction.sequence === 1 && interaction.stateAfterHash === beforeHash) {
					// Legacy compatibility: initial state was captured immediately after interaction 1 resolved.
					continue;
				}
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
		runSessionId: string;
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
			runSessionId: recording.runSessionId,
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
