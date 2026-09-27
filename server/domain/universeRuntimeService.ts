import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import type { WorldRepository } from '../repositories/worldRepository';
import { worldSynthesisService } from '../services/worldSynthesisService';
import type { DurableMemory } from './memoryOpportunityEngine';

export interface UniverseWorldBinding {
	worldId: string;
	storyId: string;
	firstVisitedAt: string;
	lastVisitedAt: string;
	visitCount: number;
	pinnedWorldVersion: number;
	status: 'CURRENT' | 'VISITED' | 'DORMANT';
	lastSimulatedUniverseSeconds: number;
}

export interface UniverseTravelRecord {
	id: string;
	fromWorldId?: string;
	toWorldId: string;
	fromStoryId?: string;
	toStoryId: string;
	timestamp: string;
	mode: 'WORLD_TRAVEL' | 'WORLD_CREATED';
	trigger: 'PLAYER' | 'AI_TOOL' | 'SYSTEM';
}

export interface UniverseMemoryRecord extends Omit<DurableMemory, 'storyId'> {
	universeId: string;
	storyId: string;
	sourceWorldId: string;
}

export interface UniverseCampaignState {
	universeId: string;
	title: string;
	playerIdentity: {
		characterId: string;
		name: string;
		universeActorId: string;
	};
	currentWorldId: string;
	currentStoryId: string;
	worldBindings: UniverseWorldBinding[];
	travelHistory: UniverseTravelRecord[];
	memories: UniverseMemoryRecord[];
	universeElapsedSeconds: number;
	createdAt: string;
	updatedAt: string;
	portablePlayerState?: {
		identity: {
			name: string;
			characterId: string;
			injuries: any[];
			transformation: any;
		};
		currentHp?: number;
		inventory: any;
		capabilities: any;
		progression: any;
	};
}

export class UniverseRuntimeService {
	public static ensureUniverse(repository: WorldRepository, storyId: string, title?: string): UniverseCampaignState {
		const existing = repository.getUniverseForStory(storyId);
		if (existing) return existing;

		const run = repository.getStoryRun(storyId);
		if (!run?.worldId) throw new Error('Cannot create a universe without an active Story Run and worldId.');

		const player = repository.getPlayerLifecycle(storyId);
		const characterId = String(run.protagonist?.characterId || player?.actorId || deterministicId('universe_character', storyId));
		const name = String(run.characterName || run.protagonist?.identity?.name || player?.name || 'Protagonist');
		const timestamp = formatCanonicalTimestamp(repository.getWorldClock(storyId).getTimestamp());
		const universeId = String(run.universeId || deterministicId('universe', characterId, name));

		const universe: UniverseCampaignState = {
			universeId,
			title: title || String(run.universeTitle || 'Universe of ' + name),
			playerIdentity: {
				characterId,
				name,
				universeActorId: deterministicId('universe_actor', universeId, characterId),
			},
			currentWorldId: run.worldId,
			currentStoryId: storyId,
			worldBindings: [{
				worldId: run.worldId,
				storyId,
				firstVisitedAt: timestamp,
				lastVisitedAt: timestamp,
				visitCount: 1,
				pinnedWorldVersion: Number(run.worldVersion || repository.getWorldTemplate(run.worldId)?.worldManifestVersion || 1),
				status: 'CURRENT',
				lastSimulatedUniverseSeconds: 0,
			}],
			travelHistory: [],
			memories: [],
			universeElapsedSeconds: 0,
			createdAt: timestamp,
			updatedAt: timestamp,
		};

		repository.saveUniverse(universe);
		repository.saveStoryRun({
			...run,
			universeId,
			universeActorId: universe.playerIdentity.universeActorId,
			universeTitle: universe.title,
		});
		this.syncPortablePlayerState(repository, universeId, storyId);
		return repository.getUniverse(universeId) || universe;
	}

	public static getUniverse(repository: WorldRepository, universeId: string): UniverseCampaignState | null {
		return repository.getUniverse(universeId);
	}

	/**
	 * Parses an explicitly cross-world player action into a canonical travel intent.
	 * This is deliberately narrow: ordinary local travel never creates a new world.
	 */
	public static inferCrossWorldTravelIntent(
		repository: WorldRepository,
		storyId: string,
		actionText: string,
	): {
		worldId?: string;
		worldPremise?: string;
		worldTitle?: string;
	} | null {
		const text = String(actionText || '').trim();
		if (!text) return null;

		const normalized = text.toLowerCase();
		const travelVerb = /\b(fly|travel|warp|jump|cross|journey|leave|depart|go|head|teleport)\b/i.test(text);
		const worldMarker = /\b(another world|new world|other world|planet|planets|dimension|dimensions|realm|realms|universe|galaxy)\b/i.test(text);
		if (!travelVerb || !worldMarker) return null;

		const knownWorld = repository.getAllWorldTemplates()
			.slice()
			.sort((a, b) => String(b?.title || '').length - String(a?.title || '').length)
			.find((world: any) => {
				const title = String(world?.title || '').trim().toLowerCase();
				return title.length >= 3 && normalized.includes(title);
			});

		if (knownWorld?.worldId) {
			return { worldId: knownWorld.worldId, worldTitle: knownWorld.title };
		}

		const titleMatch =
			text.match(/\b(?:planet|world|dimension|realm)\s+(?:called|named)\s+["']?([^"'!?.,]+)["']?/i) ||
			text.match(/\b(?:planet|world|dimension|realm)\s+([A-Za-z0-9][^!?.,;]*)/i);

		const title = titleMatch?.[1]?.trim().replace(/\s+/g, ' ');
		const premise = title
			? `A world or planet known as ${title}, reached by an interworld traveler.`
			: `A new world reached by the protagonist through the following intent: ${text}`;

		return {
			worldPremise: premise,
			worldTitle: title || undefined,
		};
	}

	public static async ensureWorldAsync(
		repository: WorldRepository,
		universeId: string,
		input: { worldId?: string; premise?: string; title?: string; generationSeed?: string; trigger?: 'PLAYER' | 'AI_TOOL' | 'SYSTEM' },
	): Promise<{ worldId: string; world: any; created: boolean }> {
		const existingWorld = input.worldId ? repository.getWorldTemplate(input.worldId) : null;
		if (existingWorld) return { worldId: existingWorld.worldId, world: existingWorld, created: false };

		const premise = String(input.premise || '').trim();
		if (!premise) throw new Error('A worldId or world premise is required.');

		const world = await worldSynthesisService.synthesizeWorldFromPremise({
			naturalLanguagePremise: premise,
			title: input.title,
			generationSeed: input.generationSeed || deterministicId('universe_world_seed', universeId, premise),
			canonMode: 'ORIGINAL',
		});
		repository.saveWorldTemplate(world);
		return { worldId: world.worldId, world, created: true };
	}

	public static async travel(
		repository: WorldRepository,
		params: {
			storyId: string;
			universeId?: string;
			worldId?: string;
			worldPremise?: string;
			worldTitle?: string;
			trigger?: 'PLAYER' | 'AI_TOOL' | 'SYSTEM';
			travelDurationSeconds?: number;
		},
	): Promise<{ universe: UniverseCampaignState; world: any; storyId: string; createdWorld: boolean; createdSession: boolean }> {
		let universe = params.universeId ? repository.getUniverse(params.universeId) : repository.getUniverseForStory(params.storyId);
		if (!universe) universe = this.ensureUniverse(repository, params.storyId);

		const sourceRun = repository.getStoryRun(params.storyId);
		if (!sourceRun?.worldId) throw new Error('Source Story Run has no worldId.');

		const ensured = await this.ensureWorldAsync(repository, universe.universeId, {
			worldId: params.worldId,
			premise: params.worldPremise,
			title: params.worldTitle,
			trigger: params.trigger,
		});

		this.syncPortablePlayerState(repository, universe.universeId, params.storyId);

		const timestamp = formatCanonicalTimestamp(repository.getWorldClock(params.storyId).getTimestamp());
		const travelDurationSeconds = Math.max(0, Math.min(30 * 86400, Number(params.travelDurationSeconds || 0)));
		universe.universeElapsedSeconds = Number(universe.universeElapsedSeconds || 0) + travelDurationSeconds;
		const sourceBinding = universe.worldBindings.find((binding) => binding.storyId === params.storyId);
		if (sourceBinding) {
			sourceBinding.status = 'VISITED';
			sourceBinding.lastVisitedAt = timestamp;
			sourceBinding.lastSimulatedUniverseSeconds = universe.universeElapsedSeconds;
		}
		const existingBinding = universe.worldBindings.find((binding) => binding.worldId === ensured.worldId);
		let targetStoryId = existingBinding?.storyId;
		let createdSession = false;

		if (!targetStoryId) {
			targetStoryId = deterministicId('universe_story', universe.universeId, ensured.worldId);
			const sourceCharacter = this.buildPortableCharacterSnapshot(repository, params.storyId, ensured.worldId, ensured.world);
			const created = repository.createStoryRunFromConfirmedCharacter({
				worldId: ensured.worldId,
				confirmedCharacter: sourceCharacter,
				storyId: targetStoryId,
				storyMode: sourceRun.storyMode,
				narrativeProfile: sourceRun.narrativeProfile,
				dndRulesMode: sourceRun.dndRulesMode,
			});
			created.run.universeId = universe.universeId;
			created.run.universeActorId = universe.playerIdentity.universeActorId;
			created.run.universeTitle = universe.title;
			repository.saveStoryRun(created.run);
			this.applyPortablePlayerState(repository, universe.universeId, targetStoryId);
			targetStoryId = created.storyId;
			createdSession = true;
			universe.worldBindings.push({
				worldId: ensured.worldId,
				storyId: targetStoryId,
				firstVisitedAt: timestamp,
				lastVisitedAt: timestamp,
				visitCount: 1,
				pinnedWorldVersion: Number(ensured.world.worldManifestVersion || 1),
				status: 'CURRENT',
				lastSimulatedUniverseSeconds: universe.universeElapsedSeconds,
			});
		} else {
			repository.seedStory(targetStoryId);
			const binding = universe.worldBindings.find((entry) => entry.worldId === ensured.worldId);
			if (binding) {
				const dormantSeconds = Math.max(
					0,
					universe.universeElapsedSeconds - Number(binding.lastSimulatedUniverseSeconds || 0),
				);
				if (dormantSeconds > 0) {
					try {
						const { WorldSimulationService } = await import('../simulation/worldSimulationService');
						new WorldSimulationService(repository).advanceTime(targetStoryId, dormantSeconds);
					} catch (simulationError) {
						console.warn('[UniverseRuntime] Dormant-world simulation failed:', simulationError);
					}
				}
				binding.lastVisitedAt = timestamp;
				binding.visitCount += 1;
				binding.status = 'CURRENT';
				binding.lastSimulatedUniverseSeconds = universe.universeElapsedSeconds;
			}
			this.applyPortablePlayerState(repository, universe.universeId, targetStoryId);
		}

		// Destination time is authoritative for the binding's last-visited timestamp.
		const destinationTimestamp = formatCanonicalTimestamp(
			repository.getWorldClock(targetStoryId).getTimestamp(),
		);
		const destinationBinding = universe.worldBindings.find((binding) => binding.storyId === targetStoryId);
		if (destinationBinding) {
			destinationBinding.lastVisitedAt = destinationTimestamp;
			destinationBinding.lastSimulatedUniverseSeconds = universe.universeElapsedSeconds;
		}

		for (const binding of universe.worldBindings) {
			if (binding.storyId === targetStoryId) binding.status = 'CURRENT';
			else if (binding.status === 'CURRENT') binding.status = 'VISITED';
		}

		universe.currentWorldId = ensured.worldId;
		universe.currentStoryId = targetStoryId;
		universe.updatedAt = timestamp;
		const travelRecord: UniverseTravelRecord = {
			id: deterministicId('universe_travel', universe.universeId, sourceRun.worldId, ensured.worldId, targetStoryId, timestamp),
			fromWorldId: sourceRun.worldId,
			toWorldId: ensured.worldId,
			fromStoryId: params.storyId,
			toStoryId: targetStoryId,
			timestamp,
			mode: ensured.created ? 'WORLD_CREATED' : 'WORLD_TRAVEL',
			trigger: params.trigger || 'PLAYER',
		};
		universe.travelHistory.push(travelRecord);
		universe.travelHistory = universe.travelHistory.slice(-200);

		this.storeUniverseMemory(repository, universe.universeId, {
			id: deterministicId('universe_memory_travel', universe.universeId, travelRecord.id),
			storyId: targetStoryId,
			sourceWorldId: ensured.worldId,
			memoryClass: 'EPISODIC',
			subjectEntityId: universe.playerIdentity.universeActorId,
			relatedEntityIds: [],
			content: ensured.created
				? 'Entered a newly generated world: ' + (ensured.world.title || ensured.world.worldId) + '.'
				: 'Traveled from ' + (repository.getWorldTemplate(sourceRun.worldId)?.title || sourceRun.worldId) + ' to ' + (ensured.world.title || ensured.worldId) + '.',
			importance: 75,
			confidence: 1,
			status: 'active',
			visibility: 'PRIVATE',
			accessibleToEntityIds: [universe.playerIdentity.universeActorId],
			isPersistentCritical: true,
			provenance: 'automatic_universe_travel_memory',
			sourceEventId: travelRecord.id,
			validFromTurn: repository.getCanonicalCommandEvents(targetStoryId).length,
			lastRecalledTurn: repository.getCanonicalCommandEvents(targetStoryId).length,
			createdAtTimestamp: repository.getWorldClock(targetStoryId).getTimestamp(),
			lastRecalledTimestamp: repository.getWorldClock(targetStoryId).getTimestamp(),
			triggerConditionTags: ['world', 'travel', 'planet', (ensured.world.title || ensured.world.worldId).toLowerCase()],
		});

		repository.saveUniverse(universe);
		const targetRun = repository.getStoryRun(targetStoryId);
		if (targetRun) {
			repository.saveStoryRun({
				...targetRun,
				universeId: universe.universeId,
				universeActorId: universe.playerIdentity.universeActorId,
				universeTitle: universe.title,
			});
		}

		return {
			universe: repository.getUniverse(universe.universeId) || universe,
			world: ensured.world,
			storyId: targetStoryId,
			createdWorld: ensured.created,
			createdSession,
		};
	}

	public static captureAction(
		repository: WorldRepository,
		params: {
			storyId: string;
			actionType: string;
			actionText: string;
			commandId?: string;
			authoritativeFeedback?: string;
			narrativeResponse?: string;
			memoryCandidates?: string[];
			beforeInventoryState?: any;
			beforeWorldElapsedSeconds?: number;
		},
	): UniverseCampaignState | null {
		const universe = repository.getUniverseForStory(params.storyId);
		if (!universe) return null;

		const run = repository.getStoryRun(params.storyId);
		const player = repository.getPlayerLifecycle(params.storyId);
		const actorId = player?.actorId || 'player_actor_' + params.storyId;
		const worldId = run?.worldId;
		const clock = repository.getWorldClock(params.storyId);
		const timestamp = formatCanonicalTimestamp(clock.getTimestamp());
		const beforeWorldElapsed = Number(params.beforeWorldElapsedSeconds ?? clock.getTimestamp().totalElapsedSeconds);
		const afterWorldElapsed = clock.getTimestamp().totalElapsedSeconds;
		const elapsedDelta = Math.max(0, afterWorldElapsed - beforeWorldElapsed);
		universe.universeElapsedSeconds = Number(universe.universeElapsedSeconds || 0) + elapsedDelta;
		const beforeItems = new Map<string, any>(
			Array.isArray(params.beforeInventoryState?.itemInstances)
				? params.beforeInventoryState.itemInstances.map((item: any) => [String(item.id), item])
				: [],
		);
		const afterState = repository.getInventoryEngine(params.storyId).exportState();
		const gainedItems = afterState.itemInstances.filter((item: any) => {
			if (item.ownerEntityId !== actorId) return false;
			const before = beforeItems.get(String(item.id));
			return !before || Number(item.quantity) > Number(before.quantity);
		});
		const lostItems = afterState.itemInstances.filter((item: any) => {
			if (item.ownerEntityId !== actorId) return false;
			const before = beforeItems.get(String(item.id));
			return before && Number(item.quantity) < Number(before.quantity);
		});

		const actionLabel = String(params.actionText || '').trim().slice(0, 500);
		const feedback = String(params.authoritativeFeedback || '').trim();
		const narration = String(params.narrativeResponse || '').trim();
		const memoryCandidates = Array.from(
			new Map(
				(Array.isArray(params.memoryCandidates) ? params.memoryCandidates : [])
					.map((candidate) => String(candidate || '').trim())
					.filter((candidate) => candidate.length >= 8)
					.map((candidate) => [candidate.toLowerCase(), candidate]),
			).values(),
		).slice(0, 6);

		if (actionLabel) {
			this.storeUniverseMemory(repository, universe.universeId, {
				id: deterministicId('universe_memory_action', universe.universeId, params.commandId || timestamp, actionLabel),
				storyId: params.storyId,
				sourceWorldId: String(worldId || 'unknown'),
				memoryClass: 'EPISODIC',
				subjectEntityId: universe.playerIdentity.universeActorId,
				relatedEntityIds: [],
				content: 'In ' + (repository.getWorldTemplate(String(worldId || ''))?.title || 'the current world') + ', the protagonist attempted: ' + actionLabel + '. ' + (feedback || narration || 'The action was resolved canonically.'),
				importance: 45,
				confidence: 1,
				status: 'active',
				visibility: 'PRIVATE',
				accessibleToEntityIds: [universe.playerIdentity.universeActorId],
				isPersistentCritical: false,
				provenance: 'automatic_action_memory',
				sourceEventId: params.commandId,
				validFromTurn: repository.getCanonicalCommandEvents(params.storyId).length,
				lastRecalledTurn: repository.getCanonicalCommandEvents(params.storyId).length,
				createdAtTimestamp: clock.getTimestamp(),
				lastRecalledTimestamp: clock.getTimestamp(),
				triggerConditionTags: ['action'].concat(actionLabel.toLowerCase().split(/\W+/).filter((token) => token.length >= 3).slice(0, 8)),
			});
		}

		for (const candidate of memoryCandidates) {
			this.storeUniverseMemory(repository, universe.universeId, {
				id: deterministicId(
					'universe_memory_ai_candidate',
					universe.universeId,
					params.commandId || timestamp,
					candidate,
				),
				storyId: params.storyId,
				sourceWorldId: String(worldId || 'unknown'),
				memoryClass: 'EPISODIC',
				subjectEntityId: universe.playerIdentity.universeActorId,
				relatedEntityIds: [],
				content: candidate,
				importance: 50,
				confidence: 0.7,
				status: 'active',
				visibility: 'PRIVATE',
				accessibleToEntityIds: [universe.playerIdentity.universeActorId],
				isPersistentCritical: false,
				provenance: 'automatic_ai_turn_memory_candidate',
				sourceEventId: params.commandId,
				validFromTurn: repository.getCanonicalCommandEvents(params.storyId).length,
				lastRecalledTurn: repository.getCanonicalCommandEvents(params.storyId).length,
				createdAtTimestamp: clock.getTimestamp(),
				lastRecalledTimestamp: clock.getTimestamp(),
				triggerConditionTags: [
					'ai_turn_memory',
					...candidate.toLowerCase().split(/\W+/).filter((token) => token.length >= 3).slice(0, 8),
				],
			});
		}

		for (const item of gainedItems) {
			const def = afterState.itemDefinitions.find((entry: any) => entry.id === item.defId);
			this.storeUniverseMemory(repository, universe.universeId, {
				id: deterministicId('universe_memory_item_gain', universe.universeId, params.commandId || timestamp, item.id, item.quantity),
				storyId: params.storyId,
				sourceWorldId: String(worldId || 'unknown'),
				memoryClass: 'ATOMIC_FACT',
				subjectEntityId: universe.playerIdentity.universeActorId,
				relatedEntityIds: [],
				content: 'Acquired item: ' + (item.customName || def?.name || item.defId) + '. Quantity now ' + String(item.quantity) + '.',
				importance: 80,
				confidence: 1,
				status: 'active',
				visibility: 'PRIVATE',
				accessibleToEntityIds: [universe.playerIdentity.universeActorId],
				isPersistentCritical: true,
				provenance: 'automatic_inventory_memory',
				sourceEventId: params.commandId,
				validFromTurn: repository.getCanonicalCommandEvents(params.storyId).length,
				lastRecalledTurn: repository.getCanonicalCommandEvents(params.storyId).length,
				createdAtTimestamp: clock.getTimestamp(),
				lastRecalledTimestamp: clock.getTimestamp(),
				triggerConditionTags: ['inventory', 'item', 'acquired', String(item.customName || def?.name || item.defId).toLowerCase()],
			});
		}

		if (lostItems.length > 0) {
			this.storeUniverseMemory(repository, universe.universeId, {
				id: deterministicId('universe_memory_item_loss', universe.universeId, params.commandId || timestamp, lostItems.map((item: any) => String(item.id) + ':' + String(item.quantity)).join(',')),
				storyId: params.storyId,
				sourceWorldId: String(worldId || 'unknown'),
				memoryClass: 'ATOMIC_FACT',
				subjectEntityId: universe.playerIdentity.universeActorId,
				relatedEntityIds: [],
				content: 'Inventory changed: ' + lostItems.map((item: any) => item.customName || item.id).slice(0, 8).join(', ') + '.',
				importance: 65,
				confidence: 1,
				status: 'active',
				visibility: 'PRIVATE',
				accessibleToEntityIds: [universe.playerIdentity.universeActorId],
				isPersistentCritical: false,
				provenance: 'automatic_inventory_memory',
				sourceEventId: params.commandId,
				validFromTurn: repository.getCanonicalCommandEvents(params.storyId).length,
				lastRecalledTurn: repository.getCanonicalCommandEvents(params.storyId).length,
				createdAtTimestamp: clock.getTimestamp(),
				lastRecalledTimestamp: clock.getTimestamp(),
				triggerConditionTags: ['inventory', 'item', 'lost'],
			});
		}

		const currentBinding = universe.worldBindings.find((binding) => binding.storyId === params.storyId);
		if (currentBinding) {
			currentBinding.lastVisitedAt = timestamp;
			currentBinding.status = 'CURRENT';
			currentBinding.lastSimulatedUniverseSeconds = universe.universeElapsedSeconds;
		}
		universe.currentWorldId = String(worldId || universe.currentWorldId);
		universe.currentStoryId = params.storyId;
		universe.updatedAt = timestamp;
		repository.saveUniverse(universe);

		this.syncPortablePlayerState(repository, universe.universeId, params.storyId);
		return repository.getUniverse(universe.universeId);
	}

	private static storeUniverseMemory(repository: WorldRepository, universeId: string, memory: UniverseMemoryRecord): void {
		repository.saveUniverseMemory(universeId, memory);
	}

	public static getRelevantUniverseMemories(
		repository: WorldRepository,
		storyId: string,
		viewerActorId?: string,
		queryKeywords: string[] = [],
		maxResults = 6,
	): UniverseMemoryRecord[] {
		const universe = repository.getUniverseForStory(storyId);
		if (!universe) return [];
		const viewer = viewerActorId || universe.playerIdentity.universeActorId;
		return universe.memories
			.filter((memory) => {
				const isSubject = memory.subjectEntityId === viewer;
				const isShared = memory.visibility === 'SHARED' &&
					(memory.relatedEntityIds?.includes(viewer) || memory.accessibleToEntityIds?.includes(viewer));
				return isSubject || memory.visibility === 'PUBLIC' || isShared;
			})
			.map((memory) => {
				const value = (memory.content + ' ' + memory.triggerConditionTags.join(' ')).toLowerCase();
				const relevance = queryKeywords.reduce((score, keyword) => score + (value.includes(keyword.toLowerCase()) ? 15 : 0), 0);
				const score = memory.importance + relevance;
				return { memory, score };
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, maxResults)
			.map((entry) => JSON.parse(JSON.stringify(entry.memory)));
	}

	private static buildPortableCharacterSnapshot(repository: WorldRepository, storyId: string, targetWorldId: string, targetWorld: any): any {
		const run = repository.getStoryRun(storyId);
		const player = repository.getPlayerLifecycle(storyId);
		const inventory = repository.getInventoryEngine(storyId);
		const items = inventory.getActorInventory(player?.actorId || 'player_actor_' + storyId);
		const definitions = inventory.exportState().itemDefinitions;
		const byDef = new Map(definitions.map((definition: any) => [String(definition.id), definition]));
		const inventoryEntries = items.map((item: any) => {
			const def = byDef.get(String(item.defId));
			return {
				id: item.id,
				name: item.customName || def?.name || item.defId,
				category: def?.category || 'Miscellaneous',
				description: def?.description || 'Portable inventory item.',
				quantity: item.quantity || 1,
				properties: def?.properties || {},
				rarity: def?.rarity || 'Common',
			};
		});
		const protagonist = JSON.parse(JSON.stringify(run?.protagonist || {}));
		protagonist.worldId = targetWorldId;
		protagonist.worldVersion = targetWorld?.worldManifestVersion || 1;
		protagonist.characterId = protagonist.characterId || deterministicId('universe_character', storyId, protagonist.identity?.name || player?.name || 'protagonist');
		protagonist.identity = {
			...(protagonist.identity || {}),
			name: protagonist.identity?.name || player?.name || 'Protagonist',
		};
		protagonist.condition = {
			...(protagonist.condition || {}),
			injuries: (player?.injuries || []).map((injury: any) => injury.description || injury.name || String(injury)),
		};
		protagonist.startingEquipment = {
			equipped: [],
			inventory: inventoryEntries,
			weapons: [],
			armor: [],
			tools: [],
			consumables: [],
		};
		protagonist.startingLocation = {
			locationId: targetWorld?.geography?.nodes?.[0]?.id || targetWorld?.geography?.locations?.[0]?.id,
			name: targetWorld?.geography?.nodes?.[0]?.name || targetWorld?.setting || targetWorld?.title,
		};
		protagonist.startingSituation = {
			summary: 'Arriving in ' + (targetWorld?.title || 'a new world') + ' from another world.',
		};
		return protagonist;
	}

	public static syncPortablePlayerState(repository: WorldRepository, universeId: string, storyId: string): void {
		const universe = repository.getUniverse(universeId);
		if (!universe) return;
		const run = repository.getStoryRun(storyId);
		const player = repository.getPlayerLifecycle(storyId);
		if (!run || !player) return;
		const actorId = player.actorId;
		universe.portablePlayerState = {
			identity: {
				name: player.name,
				characterId: universe.playerIdentity.characterId,
				injuries: JSON.parse(JSON.stringify(player.injuries || [])),
				transformation: JSON.parse(JSON.stringify(player.transformationRecord || null)),
			},
			currentHp: run.currentHp,
			inventory: repository.getInventoryEngine(storyId).exportState(),
			capabilities: repository.getCapabilityEngine(storyId).exportState(),
			progression: repository.getCharacterProgressionEngine(storyId).exportState(),
		};
		universe.playerIdentity.name = player.name;
		universe.updatedAt = formatCanonicalTimestamp(repository.getWorldClock(storyId).getTimestamp());
		repository.saveUniverse(universe);
	}

	private static remapInventoryState(snapshot: any, targetActorId: string): any {
		const state = JSON.parse(JSON.stringify(snapshot || {}));
		state.itemInstances = Array.isArray(state.itemInstances)
			? state.itemInstances.map((item: any) => ({ ...item, ownerEntityId: targetActorId }))
			: [];
		return state;
	}

	private static remapCapabilityState(snapshot: any, sourceActorId: string, targetActorId: string): any {
		const state = JSON.parse(JSON.stringify(snapshot || {}));
		const remapActorMap = (input: Record<string, any> | undefined) => {
			const out: Record<string, any> = {};
			for (const [actorId, value] of Object.entries(input || {})) {
				if (actorId === sourceActorId) out[targetActorId] = value;
			}
			return out;
		};
		state.powerStates = remapActorMap(state.powerStates);
		state.actorLearnedCapabilities = remapActorMap(state.actorLearnedCapabilities);
		state.skillInstances = remapActorMap(state.skillInstances);

		const ownedIds = new Set<string>([
			...(state.actorLearnedCapabilities?.[targetActorId] || []).map((id: any) => String(id)),
			...(state.skillInstances?.[targetActorId] || []).map((instance: any) => String(instance.capabilityId)),
		]);

		// Carry only player-owned capability definitions. The destination world keeps
		// its own world capability registry, rules and unrelated capability graph.
		if (Array.isArray(state.capabilities)) {
			state.capabilities = state.capabilities.filter((cap: any) => ownedIds.has(String(cap.id || cap.capabilityId)));
		}
		if (Array.isArray(state.capabilityGraph)) {
			state.capabilityGraph = state.capabilityGraph.filter((node: any) => ownedIds.has(String(node.capabilityId)));
		}
		if (Array.isArray(state.skillInstances?.[targetActorId])) {
			state.skillInstances[targetActorId] = state.skillInstances[targetActorId].map((instance: any) => ({ ...instance, actorId: targetActorId }));
		}
		if (state.powerStates?.[targetActorId]) state.powerStates[targetActorId] = { ...state.powerStates[targetActorId], actorId: targetActorId };
		return state;
	}

	private static remapProgressionState(snapshot: any, sourceActorId: string, targetActorId: string): any {
		const state = JSON.parse(JSON.stringify(snapshot || {}));
		state.actors = Array.isArray(state.actors)
			? state.actors.map((actor: any) => actor?.actorId === sourceActorId ? { ...actor, actorId: targetActorId } : actor)
			: [];
		return state;
	}

	public static applyPortablePlayerState(repository: WorldRepository, universeId: string, storyId: string): void {
		const universe = repository.getUniverse(universeId);
		if (!universe) return;
		const portable = universe.portablePlayerState;
		if (!portable) return;
		const player = repository.getPlayerLifecycle(storyId);
		const run = repository.getStoryRun(storyId);
		if (!player || !run) return;

		const capabilityActors = portable.capabilities?.powerStates || portable.capabilities?.actorLearnedCapabilities || {};
		const sourceActorId = Object.keys(capabilityActors)[0] || '';
		const targetActorId = player.actorId;
		player.name = portable.identity?.name || player.name;
		if (Array.isArray(portable.identity?.injuries)) player.injuries = JSON.parse(JSON.stringify(portable.identity.injuries));
		if (portable.identity?.transformation) player.transformationRecord = JSON.parse(JSON.stringify(portable.identity.transformation));
		repository.updatePlayerLifecycle(storyId, player);
		if (portable.currentHp !== undefined) run.currentHp = portable.currentHp;

		// Inventory is portable and remains owned by the player.
		repository.getInventoryEngine(storyId).importState(this.remapInventoryState(portable.inventory, targetActorId));

		// Only player-owned capabilities cross worlds; the destination retains its own world registry.
		repository.getCapabilityEngine(storyId).importState(this.remapCapabilityState(portable.capabilities, sourceActorId, targetActorId));

		// Merge progression into the destination world without replacing its module registry.
		const sourceActor = Array.isArray(portable.progression?.actors)
			? portable.progression.actors.find((actor: any) => actor?.actorId === sourceActorId) ||
				portable.progression.actors[0]
			: undefined;
		if (sourceActor) {
			repository.getCharacterProgressionEngine(storyId).importPortableActorState(
				sourceActor,
				targetActorId,
			);
		}

		repository.saveStoryRun(run);
		universe.updatedAt = formatCanonicalTimestamp(repository.getWorldClock(storyId).getTimestamp());
		repository.saveUniverse(universe);
	}
}

export const universeRuntimeService = UniverseRuntimeService;
