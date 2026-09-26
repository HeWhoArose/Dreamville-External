import type { InMemoryWorldRepository } from '../repositories/worldRepository';
import { deterministicId } from './deterministicRng';
import { canonicalCommandEngine, type CanonicalCommandType } from './canonicalCommandEngine';

export type OocToolMode = 'READ' | 'MUTATE';

export interface OocToolDefinition {
	name: string;
	description: string;
	mode: OocToolMode;
	input: Record<string, string>;
}

export interface OocToolCall {
	name: string;
	arguments?: Record<string, unknown>;
}

export interface OocToolResult {
	name: string;
	success: boolean;
	message: string;
	data?: unknown;
	commandId?: string;
	canonicalEvent?: unknown;
}

const TOOL_DEFINITIONS: OocToolDefinition[] = [
	{
		name: 'get_character_state',
		description: 'Read the active player character state, including location, health, conditions and current activity.',
		mode: 'READ',
		input: {},
	},
	{
		name: 'get_inventory',
		description: 'Read the active player inventory and paper-doll equipment.',
		mode: 'READ',
		input: {},
	},
	{
		name: 'search_memory',
		description: 'Search memories available to the active player using canonical epistemic filtering.',
		mode: 'READ',
		input: { query: 'text' },
	},
	{
		name: 'get_world_state',
		description: 'Read the player-safe Phase 8 world projection.',
		mode: 'READ',
		input: {},
	},
	{
		name: 'equip_item',
		description: 'Equip an owned item into a valid equipment slot through canonical authority.',
		mode: 'MUTATE',
		input: { itemId: 'string', slot: 'string' },
	},
	{
		name: 'unequip_item',
		description: 'Unequip an equipment slot through canonical authority.',
		mode: 'MUTATE',
		input: { slot: 'string' },
	},
	{
		name: 'use_item',
		description: 'Use an owned item through canonical authority.',
		mode: 'MUTATE',
		input: { itemId: 'string' },
	},
	{
		name: 'use_ability',
		description: 'Apply an already-authorized ability to an explicit target through canonical authority.',
		mode: 'MUTATE',
		input: { abilityId: 'string', targetId: 'string' },
	},
	{
		name: 'rest',
		description: 'Begin, advance, complete or interrupt an authoritative rest.',
		mode: 'MUTATE',
		input: { action: 'BEGIN|ADVANCE|COMPLETE|INTERRUPT|PERFORM', restType: 'SHORT_REST|LONG_REST', seconds: 'positive number', hitDiceToSpend: 'non-negative integer' },
	},
	{
		name: 'advance_time',
		description: 'Advance canonical world time for a bounded interval. This may trigger world simulation.',
		mode: 'MUTATE',
		input: { seconds: 'positive number <= 86400' },
	},
];

function clone<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function normalizeArguments(call: OocToolCall): Record<string, unknown> {
	return isRecord(call.arguments) ? call.arguments : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function commandId(storyId: string, actorId: string, tool: string, args: Record<string, unknown>, nextSequence: number): string {
	return deterministicToolId('ooc_tool', storyId, actorId, tool, args, nextSequence);
}

function deterministicToolId(namespace: string, ...parts: unknown[]): string {
	const text = parts.map((part) => typeof part === 'string' ? part : JSON.stringify(part)).join('|');
	let hash = 2166136261;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return `${namespace}_${(hash >>> 0).toString(16)}`;
}

export class OocToolRegistry {
	public listTools(): OocToolDefinition[] {
		return TOOL_DEFINITIONS.map(clone);
	}

	public async execute(
		repository: InMemoryWorldRepository,
		params: { storyId: string; actorId: string; call: OocToolCall; sequence?: number }
	): Promise<OocToolResult> {
		const { storyId, actorId, call } = params;
		const args = normalizeArguments(call);
		const tool = TOOL_DEFINITIONS.find((entry) => entry.name === call.name);
		if (!tool) return { name: call.name, success: false, message: 'Unknown OOC tool.' };

		try {
			switch (call.name) {
				case 'get_character_state': {
					const player = repository.getPlayerLifecycle(storyId);
					if (!player) return { name: call.name, success: false, message: 'The active character is unavailable.' };
					return {
						name: call.name,
						success: true,
						message: 'Canonical character state retrieved.',
						data: {
							actorId: player.actorId,
							name: player.name,
							locationId: player.locationId,
							currentActivity: player.currentActivity,
							isDead: player.isDead,
							hpCurrent: (player as any).hpCurrent,
							hpMax: (player as any).hpMax,
							injuries: clone(player.injuries || []),
							discoveredLocationIds: clone(player.discoveredLocationIds || []),
						},
					};
				}

				case 'get_inventory': {
					const inventory = repository.getInventoryEngine(storyId);
					return {
						name: call.name,
						success: true,
						message: 'Canonical inventory state retrieved.',
						data: {
							items: clone(inventory.getActorInventory(actorId)),
							paperDoll: clone(inventory.getActorPaperDoll(actorId)),
						},
					};
				}

				case 'search_memory': {
					const query = typeof args.query === 'string' ? args.query.trim() : '';
					const keywords = query.toLowerCase().split(/\W+/).filter((token) => token.length >= 3).slice(0, 12);
					const memories = repository.getMemoryEngine(storyId).retrieveMemories({
						storyId,
						viewerActorId: actorId,
						queryKeywords: keywords,
						currentTurn: repository.getCanonicalCommandEvents(storyId).length + 1,
						currentTimestamp: repository.getWorldClock(storyId).getTimestamp(),
						maxResults: 8,
						includeDormant: false,
						includeArchived: false,
					});
					return {
						name: call.name,
						success: true,
						message: `Found ${memories.length} player-visible memories.`,
						data: clone(memories),
					};
				}

				case 'get_world_state': {
					return {
						name: call.name,
						success: true,
						message: 'Player-safe world state retrieved.',
						data: clone(repository.getPhase8Projection(storyId, actorId)),
					};
				}

				case 'equip_item':
					return this.executeCanonicalMutation({
		repository,
						storyId,
						actorId,
						toolName: call.name,
						commandType: 'EQUIP',
						payload: {
							itemId: String(args.itemId || ''),
							slot: String(args.slot || ''),
						},
						sequence: params.sequence,
					});

				case 'unequip_item':
					return this.executeCanonicalMutation({
		repository,
						storyId,
						actorId,
						toolName: call.name,
						commandType: 'UNEQUIP',
						payload: { slot: String(args.slot || '') },
						sequence: params.sequence,
					});

				case 'use_item':
					return this.executeCanonicalMutation({
		repository,
						storyId,
						actorId,
						toolName: call.name,
						commandType: 'USE_ITEM',
						payload: { itemId: String(args.itemId || '') },
						sequence: params.sequence,
					});

				case 'use_ability':
					return this.executeCanonicalMutation({
		repository,
						storyId,
						actorId,
						toolName: call.name,
						commandType: 'APPLY_ABILITY',
						payload: {
							abilityId: String(args.abilityId || ''),
							targetId: String(args.targetId || ''),
						},
						sequence: params.sequence,
					});

				case 'rest': {
					const restType = args.restType === 'LONG_REST' ? 'LONG_REST' : args.restType === 'SHORT_REST' ? 'SHORT_REST' : undefined;
					const action = ['BEGIN', 'ADVANCE', 'COMPLETE', 'INTERRUPT', 'PERFORM'].includes(String(args.action))
						? String(args.action)
						: 'BEGIN';
					const seconds = args.seconds === undefined ? undefined : Number(args.seconds);
					const hitDiceToSpend = args.hitDiceToSpend === undefined ? undefined : Number(args.hitDiceToSpend);
					if (seconds !== undefined && (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400)) {
						return { name: call.name, success: false, message: 'Rest seconds must be between 1 and 86400.' };
					}
					if (hitDiceToSpend !== undefined && (!Number.isInteger(hitDiceToSpend) || hitDiceToSpend < 0 || hitDiceToSpend > 20)) {
						return { name: call.name, success: false, message: 'hitDiceToSpend must be an integer from 0 to 20.' };
					}
					return this.executeCanonicalMutation({
		repository,
						storyId,
						actorId,
						toolName: call.name,
						commandType: 'REST',
						payload: {
							action,
							restType,
							seconds,
							hitDiceToSpend,
							interruptionReason: typeof args.interruptionReason === 'string' ? args.interruptionReason : undefined,
						},
						sequence: params.sequence,
					});
				}

				case 'advance_time': {
					const seconds = Number(args.seconds);
					if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) {
						return { name: call.name, success: false, message: 'seconds must be between 1 and 86400.' };
					}
					return this.executeCanonicalMutation({
		repository,
						storyId,
						actorId,
						toolName: call.name,
						commandType: 'ADVANCE_TIME',
						payload: { seconds },
						sequence: params.sequence,
					});
				}

				default:
					return { name: call.name, success: false, message: 'Unsupported OOC tool.' };
			}
		} catch (error: any) {
			return {
				name: call.name,
				success: false,
				message: error?.message || 'OOC tool execution failed.',
			};
		}
	}

	private async executeCanonicalMutation(params: {
		repository: InMemoryWorldRepository;
		storyId: string;
		actorId: string;
		toolName: string;
		commandType: CanonicalCommandType;
		payload: Record<string, unknown>;
		sequence?: number;
	}): Promise<OocToolResult> {
		const commandSequence = params.sequence ?? params.repository.getCanonicalCommandEvents(params.storyId).length + 1;
		const id = commandId(
			params.storyId,
			params.actorId,
			params.toolName,
			params.payload,
			commandSequence,
		);

		const result = await canonicalCommandEngine.execute<Record<string, unknown>, any>(
			params.repository,
			{
				commandId: id,
				storyId: params.storyId,
				actorId: params.actorId,
				type: params.commandType as any,
				payload: params.payload,
				source: 'AI',
				transactionMode: 'STAGED',
			},
			async (command, context) => {
				switch (command.type) {
					case 'EQUIP': {
						const inventory = context.repository.getInventoryEngine(params.storyId);
						const outcome = inventory.equipItem(params.actorId, String(command.payload.itemId), String(command.payload.slot) as any);
						return outcome.success
							? { success: true, data: outcome, summary: `OOC equipped ${String(command.payload.itemId)}.` }
							: { success: false, errorReason: outcome.errorReason || 'Equip rejected.' };
					}
					case 'UNEQUIP': {
						const inventory = context.repository.getInventoryEngine(params.storyId);
						const outcome = inventory.unequipItem(params.actorId, String(command.payload.slot));
						return outcome.success
							? { success: true, data: outcome, summary: `OOC unequipped ${String(command.payload.slot)}.` }
							: { success: false, errorReason: outcome.errorReason || 'Unequip rejected.' };
					}
					case 'USE_ITEM': {
						const inventory = context.repository.getInventoryEngine(params.storyId);
						const outcome = inventory.consumeItem(params.actorId, String(command.payload.itemId));
						return outcome.success
							? { success: true, data: outcome, summary: `OOC used ${String(command.payload.itemId)}.` }
							: { success: false, errorReason: outcome.errorReason || 'Item use rejected.' };
					}
					case 'APPLY_ABILITY': {
						const abilityEngine = context.repository.getCapabilityEngine(params.storyId);
						const actor = context.repository.getPlayerLifecycle(params.storyId);
						const outcome = abilityEngine.adjudicate({
							actionDescription: `OOC ability activation against ${String(command.payload.targetId)}`,
							intendedCapabilityId: String(command.payload.abilityId),
							requestedScale: 'Local',
							actorId: params.actorId,
							actorConditions: actor?.injuries?.map((injury) => injury.description) || [],
						});
						return outcome.approved
							? { success: true, data: outcome, summary: `OOC used ability ${String(command.payload.abilityId)}.` }
							: { success: false, errorReason: outcome.rejectionReason || 'Ability use rejected.' };
					}
					case 'REST': {
						const result = context.repository.getRestRecoveryEngine(params.storyId).execute({
							storyId: params.storyId,
							actorId: params.actorId,
							action: String(command.payload.action) as any,
							restType: command.payload.restType as any,
							seconds: command.payload.seconds as any,
							hitDiceToSpend: command.payload.hitDiceToSpend as any,
							interruptionReason: command.payload.interruptionReason as any,
						});
						return {
							success: result.success,
							data: result,
							errorReason: result.errorReason,
							summary: result.success ? 'OOC rest command resolved.' : result.errorReason || 'Rest rejected.',
						};
					}
					case 'ADVANCE_TIME': {
						const { WorldSimulationService } = await import('../simulation/worldSimulationService');
						const result = new WorldSimulationService(context.repository).advanceTime(
							params.storyId,
							Number(command.payload.seconds),
						);
						return {
							success: true,
							data: result,
							summary: `OOC advanced world time by ${Number(command.payload.seconds)} seconds.`,
						};
					}
					default:
						return { success: false, errorReason: 'OOC tool is not mapped to a canonical executor.' };
				}
			},
		);

		return {
			name: params.toolName,
			success: result.success,
			message: result.success
				? String(result.errorReason || (result.data as any)?.message || 'Canonical OOC tool completed.')
				: String(result.errorReason || 'Canonical OOC tool was rejected.'),
			data: result.data,
			commandId: result.commandId,
			canonicalEvent: result.event,
		};
	}
}

export const oocToolRegistry = new OocToolRegistry();
