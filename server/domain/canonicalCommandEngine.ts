import { captureCanonicalStateSnapshot, compareCanonicalSnapshots, CanonicalStateSnapshot } from './canonicalSnapshot';
import { InMemoryWorldRepository } from '../repositories/worldRepository';
import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import { CustomRuleEngine } from './customRuleEngine';
import { Phase8SimulationEngine } from './phase8SimulationEngine';

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
	| 'REST'
	| 'APPLY_ABILITY'
	| 'COMBAT_EFFECT'
	| 'BOSS_PHASE'
	| 'PROGRESSION';

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
	transactionMode?: 'STAGED' | 'ROLLBACK';
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
	/** Internal deduplication fingerprint; contains command metadata only. */
	fingerprint?: string;
	transactionMode: 'STAGED' | 'ROLLBACK';
	replay: {
		preStateHash: string;
		postStateHash: string;
		canonicalSequence: number;
		resolvedDataHash: string;
		rngState: {
			combat: {
				before: { seed: number; rollCounter: number };
				after: { seed: number; rollCounter: number };
			};
			storyChecks: {
				before: Record<string, unknown>;
				after: Record<string, unknown>;
			};
		};
	};
}

export interface CanonicalCommandResult<T = unknown> {
	success: boolean;
	commandId: string;
	event?: CanonicalCommandEvent;
	data?: T;
	errorReason?: string;
	statusCode?: number;
	rolledBack: boolean;
	mutationPaths: string[];
}

export interface CanonicalCommandHandlerResult<T = unknown> {
	success: boolean;
	data?: T;
	errorReason?: string;
	statusCode?: number;
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

const REPLAY_VOLATILE_KEYS = new Set([
	'createdAt',
	'updatedAt',
	'confirmedAt',
	'startedAt',
	'testedAt',
	'latencyMs',
	'checkpointId',
	'turnId',
	'rawResponse',
	'audioResultBase64',
]);

function normalizeForReplay(value: unknown, key?: string): unknown {
	if (key === 'narrative' || key === 'narrativeHistory') return undefined;
	if (REPLAY_VOLATILE_KEYS.has(key || '')) return undefined;
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		return value
			.map((item) => normalizeForReplay(item))
			.filter((item) => item !== undefined);
	}
	const record = value as Record<string, unknown>;
	const normalized: Record<string, unknown> = {};
	for (const childKey of Object.keys(record).sort()) {
		const child = normalizeForReplay(record[childKey], childKey);
		if (child !== undefined) normalized[childKey] = child;
	}
	return normalized;
}

function stableHash(value: unknown): string {
	const normalized = normalizeForReplay(value);
	const serialized = normalized === undefined
		? 'undefined'
		: typeof normalized === 'string'
			? normalized
			: stableStringify(normalized);
	let hash = 2166136261 >>> 0;
	for (let i = 0; i < serialized.length; i++) {
		hash ^= serialized.charCodeAt(i);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

const phase8SimulationEngine = new Phase8SimulationEngine();

export class CanonicalCommandEngine {
	private static readonly instance = new CanonicalCommandEngine();
	private readonly inFlight = new Map<string, Promise<CanonicalCommandResult>>();
	private readonly storyQueues = new Map<string, Promise<void>>();
	private readonly completedResults = new Map<string, { fingerprint: string; data?: unknown }>();

	public static getInstance(): CanonicalCommandEngine {
		return CanonicalCommandEngine.instance;
	}

	private validateEnvelope(command: CanonicalCommand): string | undefined {
		if (!command.commandId?.trim()) return 'commandId is required.';
		if (!command.storyId?.trim()) return 'storyId is required.';
		if (!command.type) return 'command type is required.';
		if (!command.source) return 'command source is required.';
		if (command.type !== 'INTERACT' && !command.actorId?.trim()) return 'actorId is required for authoritative actor commands.';

		const payload = (command.payload || {}) as Record<string, unknown>;
		switch (command.type) {
			case 'MOVE':
				if (
					!(
						typeof payload.targetLocationId === 'string' ||
						(typeof payload.targetX === 'number' && typeof payload.targetY === 'number')
					)
				) {
					return 'MOVE command requires targetLocationId or numeric targetX and targetY.';
				}
				break;
			case 'ADVANCE_TIME':
				if (typeof payload.seconds !== 'number' || !Number.isFinite(payload.seconds) || payload.seconds <= 0) {
					return 'ADVANCE_TIME command requires a positive numeric seconds value.';
				}
				break;
			case 'REST': {
				const action = payload.action;
				if (!['BEGIN', 'ADVANCE', 'COMPLETE', 'INTERRUPT', 'PERFORM'].includes(String(action))) {
					return 'REST command requires a valid action.';
				}
				if (['BEGIN', 'PERFORM'].includes(String(action))) {
					if (payload.restType !== 'SHORT_REST' && payload.restType !== 'LONG_REST') {
						return 'REST BEGIN/PERFORM requires SHORT_REST or LONG_REST.';
					}
				}
				if (action === 'ADVANCE' && (typeof payload.seconds !== 'number' || !Number.isFinite(payload.seconds) || payload.seconds <= 0)) {
					return 'REST ADVANCE requires positive numeric seconds.';
				}
				if (action === 'INTERRUPT' && payload.interruptionReason !== undefined && typeof payload.interruptionReason !== 'string') {
					return 'REST interruptionReason must be a string when provided.';
				}
				break;
			}
			case 'CORE_ACTION':
				if (typeof payload.action !== 'string' || !payload.action.trim()) {
					return 'CORE_ACTION command requires a non-empty action.';
				}
				break;
			case 'ATTACK':
				if (payload.npcTurn !== true && typeof payload.targetId !== 'string') {
					return 'ATTACK command requires targetId.';
				}
				break;
			case 'CAST':
				if (
					typeof payload.capabilityId !== 'string' &&
					typeof payload.intendedCapabilityId !== 'string' &&
					typeof payload.actionText !== 'string' &&
					typeof payload.spellId !== 'string'
				) {
					return 'CAST command requires capabilityId, intendedCapabilityId, spellId, or actionText.';
				}
				break;
			case 'EQUIP':
				if (typeof payload.itemId !== 'string' || typeof payload.slot !== 'string') {
					return 'EQUIP command requires itemId and slot.';
				}
				break;
			case 'UNEQUIP':
				if (typeof payload.slot !== 'string') {
					return 'UNEQUIP command requires slot.';
				}
				break;
			case 'USE_ITEM':
				if (
					typeof payload.itemId !== 'string' &&
					typeof payload.recipeId !== 'string'
				) {
					return 'USE_ITEM command requires itemId or recipeId.';
				}
				break;
			case 'PROGRESSION': {
				const operation = payload.operation;
				if (!['SELECT_CLASS', 'SELECT_SUBCLASS', 'SELECT_SPECIES', 'ACQUIRE_FEAT', 'LEVEL_UP', 'ENABLE_MODULE', 'DISABLE_MODULE', 'TRIGGER_ABILITY', 'REGISTER_MODULE', 'ACQUIRE_CAPABILITY', 'AWARD_XP', 'EVOLVE_CAPABILITY', 'DOWNGRADE_CAPABILITY', 'RELEARN_CAPABILITY'].includes(String(operation))) {
					return 'PROGRESSION command requires a valid operation.';
				}
				if (['SELECT_CLASS', 'SELECT_SUBCLASS', 'SELECT_SPECIES', 'ACQUIRE_FEAT', 'ENABLE_MODULE', 'DISABLE_MODULE', 'EVOLVE_CAPABILITY', 'ACQUIRE_CAPABILITY', 'AWARD_XP', 'DOWNGRADE_CAPABILITY', 'RELEARN_CAPABILITY'].includes(String(operation))
					&& typeof payload.moduleId !== 'string') {
					return 'PROGRESSION module operations require moduleId.';
				}
				if (operation === 'REGISTER_MODULE' && (!payload.module || typeof payload.module !== 'object')) {
					return 'REGISTER_MODULE requires a module definition.';
				}
				if (operation === 'TRIGGER_ABILITY' && typeof payload.abilityId !== 'string') {
					return 'PROGRESSION trigger requires abilityId.';
				}
				break;
			}
			case 'APPLY_ABILITY':
				if (typeof payload.abilityId !== 'string' || typeof payload.targetId !== 'string') {
					return 'APPLY_ABILITY command requires abilityId and targetId.';
				}
				break;
			case 'COMBAT_EFFECT':
				if (typeof payload.effectId !== 'string' || typeof payload.resolutionMode !== 'string') {
					return 'COMBAT_EFFECT command requires effectId and resolutionMode.';
				}
				if (payload.targetIds !== undefined && !Array.isArray(payload.targetIds)) {
					return 'COMBAT_EFFECT targetIds must be an array when provided.';
				}
				break;
			case 'BOSS_PHASE':
				if (typeof payload.bossId !== 'string' || !Array.isArray(payload.phases)) {
					return 'BOSS_PHASE command requires bossId and phases.';
				}
				break;

			case 'INTERACT':
				if (typeof payload !== 'object' || payload === null) {
					return 'INTERACT command requires an object payload.';
				}
				break;
			default:
				break;
		}
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

		if (!repository.getStoryRun(command.storyId)) {
			repository.seedStory(command.storyId);
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
			const replay = this.completedResults.get(key);
			const replayData = replay && replay.fingerprint === fingerprint ? clone(replay.data) as any : undefined;
			if (replayData && replayData.telemetry) {
				replayData.telemetry.idempotencyReplayed = true;
			}
			return {
				success: true,
				commandId: command.commandId,
				event: existingEvent,
				data: replayData,
				rolledBack: false,
				mutationPaths: existingEvent.mutationPaths || [],
			};
		}

		const existingFlight = this.inFlight.get(key);
		if (existingFlight) {
			return clone(await existingFlight) as CanonicalCommandResult<TResult>;
		}

		const promise = this.enqueueStoryCommand(
			command.storyId,
			() => this.executeFresh(repository, command, handler, fingerprint)
		);
		this.inFlight.set(key, promise as Promise<CanonicalCommandResult>);
		try {
			return await promise;
		} finally {
			this.inFlight.delete(key);
		}
	}

	private async enqueueStoryCommand<T>(
		storyId: string,
		work: () => Promise<T>
	): Promise<T> {
		const previous = this.storyQueues.get(storyId) || Promise.resolve();
		const next = previous.then(work, work);
		const queueTail = next.then(
			() => undefined,
			() => undefined
		);
		this.storyQueues.set(storyId, queueTail);
		try {
			return await next;
		} finally {
			if (this.storyQueues.get(storyId) === queueTail) {
				this.storyQueues.delete(storyId);
			}
		}
	}

	private async executeFresh<TPayload extends Record<string, unknown>, TResult>(
		repository: InMemoryWorldRepository,
		command: CanonicalCommand<TPayload>,
		handler: CanonicalCommandHandler<TPayload, TResult>,
		fingerprint: string
	): Promise<CanonicalCommandResult<TResult>> {
		const before = captureCanonicalStateSnapshot(command.storyId, repository);
		const stagedRepository =
			command.transactionMode === 'STAGED'
				? (() => {
					const staged = new InMemoryWorldRepository({ disablePersistence: true });
					staged.restoreCanonicalStateSnapshot(before, { persist: false });
					return staged;
				})()
				: repository;
		const transactionalRepository = stagedRepository;
		transactionalRepository.beginCanonicalCommandTransaction(command.storyId, command.commandId);

		try {
			const resolved = await handler(command, {
				snapshot: before,
				repository: transactionalRepository,
			});

			// STAGED handlers must mutate only the isolated transaction repository. A hidden dependency
			// on the live singleton repository would otherwise bypass the staged boundary and could leak
			// speculative state before validation/commit. Treat that as a transaction violation.
			if (command.transactionMode === 'STAGED') {
				const liveAfterHandler = captureCanonicalStateSnapshot(command.storyId, repository);
				const liveComparison = compareCanonicalSnapshots(before, liveAfterHandler, { ignoreNarrativeHistory: true });
				if (!liveComparison.identical) {
					repository.restoreCanonicalStateSnapshot(before);
					return {
						success: false,
						commandId: command.commandId,
						errorReason: 'STAGED transaction handler mutated live canonical state instead of the transaction repository.',
						rolledBack: true,
						mutationPaths: liveComparison.differences,
					};
				}
			}

			if (!resolved.success) {
				if (command.transactionMode !== 'STAGED') {
					transactionalRepository.rollbackCanonicalCommandTransaction(command.storyId);
					repository.restoreCanonicalStateSnapshot(before);
				} else {
					transactionalRepository.rollbackCanonicalCommandTransaction(command.storyId);
				}
				return {
					success: false,
					commandId: command.commandId,
					errorReason: resolved.errorReason || 'Canonical command rejected.',
					statusCode: resolved.statusCode,
					rolledBack: true,
					mutationPaths: [],
				};
			}

			const canonicalSequence = repository.getCanonicalCommandEvents(command.storyId).length + 1;
			const eventId = deterministicId('evt_cmd', command.storyId, canonicalSequence, fingerprint);

			// Custom rules are evaluated inside the same authoritative transaction as the command.
			// Their mutations therefore become part of the command's canonical post-state hash.
			const ruleCommandPayload = clone(command.payload) as Record<string, unknown>;
			// Never trust item rule definitions supplied by the caller. They are discarded from
			// the command payload and, for USE_ITEM, re-hydrated only from the authoritative
			// server-side item definition returned by the handler.
			delete ruleCommandPayload.itemCustomRules;
			if (command.type === 'USE_ITEM') {
				const resolvedData = resolved.data as any;
				const serverRules = resolvedData?.definition?.customRules;
				if (Array.isArray(serverRules)) {
					ruleCommandPayload.itemCustomRules = clone(serverRules);
				}
			}

			const customRuleResult = await new CustomRuleEngine().evaluate({
				repository: transactionalRepository,
				event: {
					eventId,
					storyId: command.storyId,
					type: 'CANONICAL_COMMAND',
					actorId: command.actorId,
					actionText: typeof (command.payload as any)?.actionText === 'string'
						? String((command.payload as any).actionText)
						: resolved.summary,
					payload: {
						commandType: command.type,
						command: ruleCommandPayload,
						result: clone(resolved.data),
					},
					timestampSeconds: transactionalRepository.getWorldClock(command.storyId).getTimestamp().totalElapsedSeconds,
				},
			});
			if (!customRuleResult.success) {
				if (command.transactionMode !== 'STAGED') {
					transactionalRepository.rollbackCanonicalCommandTransaction(command.storyId);
					repository.restoreCanonicalStateSnapshot(before);
				} else {
					transactionalRepository.rollbackCanonicalCommandTransaction(command.storyId);
				}
				return {
					success: false,
					commandId: command.commandId,
					rolledBack: true,
					mutationPaths: [],
					errorReason: customRuleResult.errorReason || 'Custom rule evaluation rejected the command.',
				};
			}

			// Phase 8.7-8.12 simulation domains consume the same canonical event identity.
			// Their state is persisted inside the transactional Story Run runtime state,
			// so rollback/replay remains under canonical authority.
			phase8SimulationEngine.processCanonicalEvent(transactionalRepository, command.storyId, {
				eventId,
				type: 'CANONICAL_COMMAND',
				actorId: command.actorId,
				locationId: transactionalRepository.getStoryRun(command.storyId)?.currentLocationId,
				timestampSeconds: transactionalRepository.getWorldClock(command.storyId).getTimestamp().totalElapsedSeconds,
				payload: {
					commandType: command.type,
					command: clone(command.payload),
					result: clone(resolved.data),
				},
			});

			// Finalize staged Chronicle evidence against the deterministic canonical event identity
			// before constructing the committed snapshot. The event itself is appended to the staged
			// repository immediately afterward, then both are transferred to live state together.
			transactionalRepository.commitCanonicalCommandTransaction(command.storyId, eventId);

			const after = captureCanonicalStateSnapshot(command.storyId, transactionalRepository);
			const comparison = compareCanonicalSnapshots(before, after);
			const mutationPaths = comparison.differences.map((difference) => {
				const match = difference.match(/(?:at|in )((?:worldClock|geography|worldFacts|player|inventory|equipment|craftingRecipes|npcs|chronicle|narrativeHistory|capabilities|conditions|rest|combat|storyChecks|memories|livingWorld|progression|sensory|adaptation)[^:]*):?/);
				return match?.[1] || difference;
			});

			const event: CanonicalCommandEvent = {
				eventId,
				commandId: command.commandId,
				storyId: command.storyId,
				actorId: command.actorId,
				commandType: command.type,
				source: command.source,
				committedAt: after.worldClock?.timestamp ? formatCanonicalTimestamp(after.worldClock.timestamp) : 'Y0000-M00-D00T00:00:00',
				success: true,
				summary: resolved.summary || `${command.type} committed successfully.`,
				mutationPaths,
				mutationCount: mutationPaths.length,
				fingerprint,
				transactionMode: command.transactionMode || 'ROLLBACK',
				replay: {
					preStateHash: stableHash(before),
					postStateHash: stableHash(after),
					canonicalSequence,
					resolvedDataHash: stableHash(resolved.data),
					rngState: {
						combat: {
						before: {
							seed: Number(before.combat?.seed ?? 0),
							rollCounter: Number(before.combat?.rollCounter ?? 0),
						},
						after: {
							seed: Number(after.combat?.seed ?? 0),
							rollCounter: Number(after.combat?.rollCounter ?? 0),
						},
					},
					storyChecks: {
						before: clone(before.storyChecks || {}),
						after: clone(after.storyChecks || {}),
					},
					},
				},
			};

			if (command.transactionMode === 'STAGED') {
				transactionalRepository.appendCanonicalCommandEvent(command.storyId, event);
				const committedAfter = captureCanonicalStateSnapshot(command.storyId, transactionalRepository);
				repository.restoreCanonicalStateSnapshot(committedAfter, { persist: true });
				
				// Propagate all newly created checkpoints, stats, and telemetry to the live orchestrator
				const stagedOrch = transactionalRepository.getAiOrchestrator();
				const liveOrch = repository.getAiOrchestrator();
				liveOrch.commitTransactionState(stagedOrch);

				repository.appendCanonicalCommandEvent(command.storyId, event);
			} else {
				repository.appendCanonicalCommandEvent(command.storyId, event);
			}
			this.completedResults.set(
				`${command.storyId}::${command.commandId}`,
				{ fingerprint, data: clone(resolved.data) }
			);

			return {
				success: true,
				commandId: command.commandId,
				event,
				data: clone(resolved.data),
				rolledBack: false,
				mutationPaths,
			};
		} catch (error: any) {
			try {
				transactionalRepository.rollbackCanonicalCommandTransaction(command.storyId);
			} catch {
				// Preserve the original resolution error while still attempting to clear transaction state.
			}
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
