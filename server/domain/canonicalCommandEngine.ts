import { captureCanonicalStateSnapshot, compareCanonicalSnapshots, CanonicalStateSnapshot } from './canonicalSnapshot';
import { InMemoryWorldRepository } from '../repositories/worldRepository';

export type CanonicalCommandType =
	| 'MOVE'
	| 'CORE_ACTION'
	| 'ATTACK'
	| 'CAST'
	| 'USE_ITEM'
	| 'INTERACT'
	| 'EQUIP'
	| 'UNEQUIP'
	| 'ADVANCE_TIME'
	| 'APPLY_ABILITY';

export type CanonicalCommandSource = 'PLAYER' | 'AI' | 'SYSTEM';

export interface CanonicalCommand<TPayload = Record<string, unknown>> {
	commandId: string;
	storyId: string;
	actorId?: string;
	type: CanonicalCommandType;
	payload: TPayload;
	source: CanonicalCommandSource;
	idempotencyKey?: string;
	issuedAt?: string;
}

export interface CanonicalCommandEvent {
	eventId: string;
	commandId: string;
	storyId: string;
	actorId?: string;
	commandType: CanonicalCommandType;
	source: CanonicalCommandSource;
	committedAt: string;
	success: true;
	summary: string;
	mutationPaths: string[];
	mutationCount: number;
}

export interface CanonicalCommandResult<T = unknown> {
	success: boolean;
	commandId: string;
	event?: CanonicalCommandEvent;
	data?: T;
	errorReason?: string;
	rolledBack: boolean;
	mutationPaths: string[];
}

export interface CanonicalCommandHandlerResult<T = unknown> {
	success: boolean;
	data?: T;
	errorReason?: string;
	summary?: string;
}

export type CanonicalCommandHandler<TPayload = Record<string, unknown>, TResult = unknown> = (
	command: CanonicalCommand<TPayload>,
	context: {
		snapshot: CanonicalStateSnapshot;
		repository: InMemoryWorldRepository;
	}
) => Promise<CanonicalCommandHandlerResult<TResult>> | CanonicalCommandHandlerResult<TResult>;

function clone<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
	const record = value as Record<string, unknown>;
	return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(record[key])).join(',') + '}';
}

export class CanonicalCommandEngine {
	private static readonly instance = new CanonicalCommandEngine();
	private readonly inFlight = new Map<string, Promise<CanonicalCommandResult>>();

	public static getInstance(): CanonicalCommandEngine {
		return CanonicalCommandEngine.instance;
	}

	private validateEnvelope(command: CanonicalCommand): string | undefined {
		if (!command.commandId?.trim()) return 'commandId is required.';
		if (!command.storyId?.trim()) return 'storyId is required.';
		if (!command.type) return 'command type is required.';
		if (!command.source) return 'command source is required.';
		if (command.type !== 'INTERACT' && !command.actorId?.trim()) return 'actorId is required for authoritative actor commands.';
		return undefined;
	}

	public async execute<TPayload extends Record<string, unknown>, TResult>(
		repository: InMemoryWorldRepository,
		command: CanonicalCommand<TPayload>,
		handler: CanonicalCommandHandler<TPayload, TResult>
	): Promise<CanonicalCommandResult<TResult>> {
		const envelopeError = this.validateEnvelope(command);
		if (envelopeError) {
			return {
				success: false,
				commandId: command.commandId || '',
				errorReason: envelopeError,
				rolledBack: false,
				mutationPaths: [],
			};
		}

		const key = `${command.storyId}::${command.commandId}`;
		const fingerprint = stableStringify({
			storyId: command.storyId,
			actorId: command.actorId,
			type: command.type,
			source: command.source,
			payload: command.payload,
		});

		for (const existingEvent of repository.getCanonicalCommandEvents(command.storyId)) {
			if (existingEvent?.commandId !== command.commandId) continue;
			if (existingEvent?.fingerprint && existingEvent.fingerprint !== fingerprint) {
				return {
					success: false,
					commandId: command.commandId,
					errorReason: 'A canonical command with this commandId already exists with a different payload.',
					rolledBack: false,
					mutationPaths: [],
				};
			}
			return {
				success: true,
				commandId: command.commandId,
				event: existingEvent,
				data: existingEvent.resultData,
				rolledBack: false,
				mutationPaths: existingEvent.mutationPaths || [],
			};
		}

		const existingFlight = this.inFlight.get(key);
		if (existingFlight) {
			return clone(await existingFlight) as CanonicalCommandResult<TResult>;
		}

		const promise = this.executeFresh(repository, command, handler, fingerprint);
		this.inFlight.set(key, promise as Promise<CanonicalCommandResult>);
		try {
			return await promise;
		} finally {
			this.inFlight.delete(key);
		}
	}

	private async executeFresh<TPayload extends Record<string, unknown>, TResult>(
		repository: InMemoryWorldRepository,
		command: CanonicalCommand<TPayload>,
		handler: CanonicalCommandHandler<TPayload, TResult>,
		fingerprint: string
	): Promise<CanonicalCommandResult<TResult>> {
		const before = captureCanonicalStateSnapshot(command.storyId, repository);

		try {
			const resolved = await handler(command, { snapshot: before, repository });
			if (!resolved.success) {
				repository.restoreCanonicalStateSnapshot(before);
				return {
					success: false,
					commandId: command.commandId,
					errorReason: resolved.errorReason || 'Canonical command rejected.',
					rolledBack: true,
					mutationPaths: [],
				};
			}

			const after = captureCanonicalStateSnapshot(command.storyId, repository);
			const comparison = compareCanonicalSnapshots(before, after);
			const mutationPaths = comparison.differences.map((difference) => {
				const match = difference.match(/(?:at|in )((?:worldClock|geography|worldFacts|player|inventory|equipment|craftingRecipes|npcs|chronicle|narrativeHistory|capabilities|conditions|combat|memories|livingWorld|sensory|adaptation)[^:]*):?/);
				return match?.[1] || difference;
			});

			const event: CanonicalCommandEvent & { fingerprint: string; resultData?: unknown } = {
				eventId: `evt_cmd_${command.storyId}_${command.commandId}`,
				commandId: command.commandId,
				storyId: command.storyId,
				actorId: command.actorId,
				commandType: command.type,
				source: command.source,
				committedAt: new Date().toISOString(),
				success: true,
				summary: resolved.summary || `${command.type} committed successfully.`,
				mutationPaths,
				mutationCount: mutationPaths.length,
				fingerprint,
				resultData: clone(resolved.data),
			};

			repository.appendCanonicalCommandEvent(command.storyId, event);
			return {
				success: true,
				commandId: command.commandId,
				event,
				data: clone(resolved.data),
				rolledBack: false,
				mutationPaths,
			};
		} catch (error: any) {
			repository.restoreCanonicalStateSnapshot(before);
			return {
				success: false,
				commandId: command.commandId,
				errorReason: error?.message || 'Canonical command failed during resolution.',
				rolledBack: true,
				mutationPaths: [],
			};
		}
	}
}

export const canonicalCommandEngine = CanonicalCommandEngine.getInstance();
