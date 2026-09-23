import { deterministicId } from './deterministicRng';

export type EntityKind =
	| 'PLAYER'
	| 'CHARACTER'
	| 'NPC'
	| 'CREATURE'
	| 'ANIMAL'
	| 'MONSTER'
	| 'BOSS'
	| 'COMPANION'
	| 'MERCHANT'
	| 'FACTION_MEMBER'
	| 'OTHER';

export type EntityLifecycleStatus =
	| 'ACTIVE'
	| 'DORMANT'
	| 'ARCHIVED'
	| 'DEAD'
	| 'DESTROYED'
	| 'TEMPLATE';

export interface EntityRelationshipState {
	trust?: number;
	affection?: number;
	respect?: number;
	fear?: number;
}

export interface EntityCard {
	id: string;
	storyId: string;
	worldId?: string;
	name: string;
	kind: EntityKind;
	templateId?: string;
	isTemplate: boolean;

	identity: {
		species?: string;
		lineage?: string;
		age?: number | string;
		gender?: string;
		aliases: string[];
	};
	classification: {
		role?: string;
		archetype?: string;
		profession?: string;
		threat?: string;
		rarity?: string;
		tags: string[];
	};
	progression?: {
		level: number;
		classId?: string;
		subclassId?: string;
		speciesId?: string;
		featIds: string[];
		moduleIds?: string[];
		customModules?: any[];
	};
	coreStats?: {
		level?: number;
		hpCurrent?: number;
		hpMax?: number;
		armorClass?: number;
		speed?: number;
		hitDice?: string;
		abilityScores: Record<string, number>;
	};
	personality: {
		traits: string[];
		temperament?: string;
		values: string[];
		motivations: string[];
		fears: string[];
		desires: string[];
		dialogueStyle?: string;
		canonicalSecrets?: string[];
	};
	behavior: {
		defaultBehavior?: string;
		combatBehavior?: string;
		threatResponse?: string;
		priorities: string[];
		routines: string[];
	};
	social: {
		alignment?: string;
		factionIds: string[];
		role?: string;
		reputation: Record<string, number>;
		relationships: Record<string, EntityRelationshipState>;
	};
	economy?: {
		wealth?: number;
		currency: Record<string, number>;
		inventoryItemIds: string[];
		inventorySummary: string[];
		assets: string[];
	};
	background?: {
		origin?: string;
		upbringing?: string;
		history?: string;
		importantEvents: string[];
		canonicalSecrets?: string[];
	};
	worldState: {
		locationId?: string;
		currentActivity?: string;
		destinationLocationId?: string;
		currentGoal?: string;
		isAlive: boolean;
		presence: 'present' | 'absent' | 'unknown';
	};
	traits: string[];
	capabilities: Array<Record<string, unknown>>;
	feats: Array<Record<string, unknown>>;
	equipment: string[];
	memoryRefs: string[];
	dossierId?: string;
	provenance: {
		source: string;
		createdBy: 'PLAYER' | 'AI' | 'SYSTEM' | 'IMPORTED';
		prompt?: string;
		sourceEventId?: string;
		confidence?: number;
	};
	lifecycle: {
		status: EntityLifecycleStatus;
		lastActiveAt?: string;
		lastSeenAt?: string;
		archivedAt?: string;
		deadAt?: string;
	};
	metadata: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

export interface EntityCardInput extends Partial<Omit<EntityCard, 'id' | 'storyId' | 'createdAt' | 'updatedAt'>> {
	id?: string;
	storyId?: string;
	worldId?: string;
	name: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface EntityQuery {
	status?: EntityLifecycleStatus | EntityLifecycleStatus[];
	kind?: EntityKind | EntityKind[];
	query?: string;
	includeTemplates?: boolean;
}

function clone<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function normalizeArray(values: unknown): string[] {
	return Array.isArray(values)
		? values.map(String).map((value) => value.trim()).filter(Boolean)
		: [];
}

function nowIso(): string {
	return new Date().toISOString();
}

function normalizeKind(value: unknown): EntityKind {
	const normalized = String(value || '').toUpperCase();
	return [
		'PLAYER',
		'CHARACTER',
		'NPC',
		'CREATURE',
		'ANIMAL',
		'MONSTER',
		'BOSS',
		'COMPANION',
		'MERCHANT',
		'FACTION_MEMBER',
	].includes(normalized) ? normalized as EntityKind : 'OTHER';
}

function normalizeStatus(value: unknown, isTemplate: boolean): EntityLifecycleStatus {
	if (isTemplate) return 'TEMPLATE';
	const normalized = String(value || '').toUpperCase();
	return ['ACTIVE', 'DORMANT', 'ARCHIVED', 'DEAD', 'DESTROYED'].includes(normalized)
		? normalized as EntityLifecycleStatus
		: 'ACTIVE';
}

export class EntityRegistry {
	private readonly storyId: string;
	private cards = new Map<string, EntityCard>();
	private sequence = 0;

	constructor(storyId: string) {
		this.storyId = storyId;
	}

	public upsert(input: EntityCardInput | EntityCard): EntityCard {
		const existing = input.id ? this.cards.get(input.id) : undefined;
		const now = nowIso();
		const id = input.id || deterministicId('entity', this.storyId, input.name, ++this.sequence);
		const isTemplate = Boolean(input.isTemplate || input.lifecycle?.status === 'TEMPLATE');
		const base: EntityCard = {
			id,
			storyId: this.storyId,
			worldId: input.worldId,
			name: String(input.name || 'Unnamed Entity').trim(),
			kind: normalizeKind(input.kind),
			templateId: input.templateId,
			isTemplate,
			identity: {
				species: input.identity?.species,
				lineage: input.identity?.lineage,
				age: input.identity?.age,
				gender: input.identity?.gender,
				aliases: normalizeArray(input.identity?.aliases),
			},
			classification: {
				role: input.classification?.role,
				archetype: input.classification?.archetype,
				profession: input.classification?.profession,
				threat: input.classification?.threat,
				rarity: input.classification?.rarity,
				tags: normalizeArray(input.classification?.tags),
			},
			progression: input.progression ? {
				level: Math.max(1, Math.min(20, Math.trunc(Number(input.progression.level) || 1))),
				classId: input.progression.classId,
				subclassId: input.progression.subclassId,
				speciesId: input.progression.speciesId,
				featIds: normalizeArray(input.progression.featIds),
			} : undefined,
			coreStats: input.coreStats ? {
				level: input.coreStats.level,
				hpCurrent: input.coreStats.hpCurrent,
				hpMax: input.coreStats.hpMax,
				armorClass: input.coreStats.armorClass,
				speed: input.coreStats.speed,
				hitDice: input.coreStats.hitDice,
				abilityScores: Object.fromEntries(Object.entries(input.coreStats.abilityScores || {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))),
			} : undefined,
			personality: {
				traits: normalizeArray(input.personality?.traits),
				temperament: input.personality?.temperament,
				values: normalizeArray(input.personality?.values),
				motivations: normalizeArray(input.personality?.motivations),
				fears: normalizeArray(input.personality?.fears),
				desires: normalizeArray(input.personality?.desires),
				dialogueStyle: input.personality?.dialogueStyle,
				canonicalSecrets: normalizeArray(input.personality?.canonicalSecrets),
			},
			behavior: {
				defaultBehavior: input.behavior?.defaultBehavior,
				combatBehavior: input.behavior?.combatBehavior,
				threatResponse: input.behavior?.threatResponse,
				priorities: normalizeArray(input.behavior?.priorities),
				routines: normalizeArray(input.behavior?.routines),
			},
			social: {
				alignment: input.social?.alignment,
				factionIds: normalizeArray(input.social?.factionIds),
				role: input.social?.role,
				reputation: { ...(input.social?.reputation || {}) },
				relationships: clone(input.social?.relationships || {}),
			},
			economy: input.economy ? {
				wealth: typeof input.economy.wealth === 'number' ? input.economy.wealth : undefined,
				currency: { ...(input.economy.currency || {}) },
				inventoryItemIds: normalizeArray(input.economy.inventoryItemIds),
				inventorySummary: normalizeArray(input.economy.inventorySummary),
				assets: normalizeArray(input.economy.assets),
			} : undefined,
			background: input.background ? {
				origin: input.background.origin,
				upbringing: input.background.upbringing,
				history: input.background.history,
				importantEvents: normalizeArray(input.background.importantEvents),
				canonicalSecrets: normalizeArray(input.background.canonicalSecrets),
			} : undefined,
			worldState: {
				locationId: input.worldState?.locationId,
				currentActivity: input.worldState?.currentActivity,
				destinationLocationId: input.worldState?.destinationLocationId,
				currentGoal: input.worldState?.currentGoal,
				isAlive: input.worldState?.isAlive ?? true,
				presence: input.worldState?.presence || 'unknown',
			},
			traits: normalizeArray(input.traits),
			capabilities: clone(input.capabilities || []),
			feats: clone(input.feats || []),
			equipment: normalizeArray(input.equipment),
			memoryRefs: normalizeArray(input.memoryRefs),
			dossierId: input.dossierId,
			provenance: {
				source: input.provenance?.source || 'ENTITY_REGISTRY',
				createdBy: input.provenance?.createdBy || 'SYSTEM',
				prompt: input.provenance?.prompt,
				sourceEventId: input.provenance?.sourceEventId,
				confidence: input.provenance?.confidence,
			},
			lifecycle: {
				status: normalizeStatus(input.lifecycle?.status, isTemplate),
				lastActiveAt: input.lifecycle?.lastActiveAt,
				lastSeenAt: input.lifecycle?.lastSeenAt,
				archivedAt: input.lifecycle?.archivedAt,
				deadAt: input.lifecycle?.deadAt,
			},
			metadata: clone(input.metadata || {}),
			createdAt: existing?.createdAt || input.createdAt || now,
			updatedAt: now,
		};

		const merged: EntityCard = existing ? {
			...existing,
			...base,
			identity: { ...existing.identity, ...base.identity },
			classification: { ...existing.classification, ...base.classification },
			personality: { ...existing.personality, ...base.personality },
			behavior: { ...existing.behavior, ...base.behavior },
			social: { ...existing.social, ...base.social },
			worldState: { ...existing.worldState, ...base.worldState },
			progression: base.progression === undefined ? existing.progression : base.progression,
			coreStats: base.coreStats === undefined ? existing.coreStats : base.coreStats,
			economy: base.economy === undefined ? existing.economy : base.economy,
			background: base.background === undefined ? existing.background : base.background,
			equipment: input.equipment === undefined ? existing.equipment : base.equipment,
			capabilities: input.capabilities === undefined ? existing.capabilities : base.capabilities,
			feats: input.feats === undefined ? existing.feats : base.feats,
			memoryRefs: input.memoryRefs === undefined ? existing.memoryRefs : base.memoryRefs,
			metadata: { ...existing.metadata, ...base.metadata },
			lifecycle: { ...existing.lifecycle, ...base.lifecycle },
			updatedAt: now,
		} : base;

		this.cards.set(merged.id, clone(merged));
		return clone(merged);
	}

	public get(id: string): EntityCard | undefined {
		const card = this.cards.get(id);
		return card ? clone(card) : undefined;
	}

	public list(query: EntityQuery = {}): EntityCard[] {
		const kinds = Array.isArray(query.kind) ? query.kind.map((value) => normalizeKind(value)) : query.kind ? [normalizeKind(query.kind)] : [];
		const statuses = Array.isArray(query.status) ? query.status : query.status ? [query.status] : [];
		const text = String(query.query || '').trim().toLowerCase();
		return Array.from(this.cards.values())
			.filter((card) => query.includeTemplates || !card.isTemplate)
			.filter((card) => kinds.length === 0 || kinds.includes(card.kind))
			.filter((card) => statuses.length === 0 || statuses.includes(card.lifecycle.status))
			.filter((card) => !text || [card.name, card.kind, card.identity.species, card.classification.profession, card.classification.role, ...card.classification.tags, ...card.traits].filter(Boolean).some((value) => String(value).toLowerCase().includes(text)))
			.map(clone);
	}

	public setLifecycleStatus(id: string, status: EntityLifecycleStatus): EntityCard {
		const card = this.cards.get(id);
		if (!card) throw new Error('Entity not found.');
		const now = nowIso();
		card.lifecycle.status = status;
		card.updatedAt = now;
		if (status === 'DEAD') {
			card.worldState.isAlive = false;
			card.worldState.presence = 'absent';
			card.lifecycle.deadAt = now;
		}
		if (status === 'ARCHIVED') card.lifecycle.archivedAt = now;
		if (status === 'ACTIVE') card.lifecycle.lastActiveAt = now;
		return clone(card);
	}

	public createTemplate(input: EntityCardInput): EntityCard {
		return this.upsert({ ...input, isTemplate: true, lifecycle: { ...(input.lifecycle || {}), status: 'TEMPLATE' } });
	}

	public instantiateTemplate(templateId: string, overrides: Partial<EntityCardInput> = {}): EntityCard {
		const template = this.cards.get(templateId);
		if (!template || !template.isTemplate) throw new Error('Entity template not found.');
		const sequence = ++this.sequence;
		const id = deterministicId('entity_instance', this.storyId, templateId, sequence);
		return this.upsert({
			...clone(template),
			...clone(overrides),
			id,
			storyId: this.storyId,
			name: overrides.name || template.name + ' #' + sequence,
			templateId,
			isTemplate: false,
			lifecycle: { status: 'ACTIVE', lastActiveAt: nowIso(), lastSeenAt: nowIso() },
			provenance: { ...(clone(template.provenance) || {}), createdBy: overrides.provenance?.createdBy || 'SYSTEM', source: overrides.provenance?.source || 'INSTANCE_OF:' + template.id },
		});
	}

	public cloneEntity(id: string, overrides: Partial<EntityCardInput> = {}): EntityCard {
		const source = this.cards.get(id);
		if (!source) throw new Error('Entity not found.');
		if (source.isTemplate) return this.instantiateTemplate(source.id, overrides);
		const sequence = ++this.sequence;
		const clonedId = deterministicId('entity_clone', this.storyId, source.id, sequence);
		return this.upsert({
			...clone(source),
			...clone(overrides),
			id: clonedId,
			storyId: this.storyId,
			name: overrides.name || source.name + ' Copy #' + sequence,
			templateId: source.templateId || source.id,
			isTemplate: false,
			lifecycle: { status: 'ACTIVE', lastActiveAt: nowIso(), lastSeenAt: nowIso() },
		});
	}

	public exportState(): { storyId: string; sequence: number; cards: EntityCard[] } {
		return { storyId: this.storyId, sequence: this.sequence, cards: Array.from(this.cards.values()).map(clone) };
	}

	public importState(state?: { storyId?: string; sequence?: number; cards?: EntityCard[] } | null): void {
		this.cards.clear();
		this.sequence = Math.max(0, Math.trunc(Number(state?.sequence) || 0));
		for (const card of state?.cards || []) {
			if (card?.id && card?.name) this.cards.set(card.id, clone(card));
		}
	}

	public projectForViewer(card: EntityCard): Record<string, unknown> {
		const projection = clone(card) as any;
		if (projection.personality) delete projection.personality.canonicalSecrets;
		if (projection.background) delete projection.background.canonicalSecrets;
		if (projection.metadata) {
			delete projection.metadata.canonicalSecrets;
			delete projection.metadata.internalNotes;
		}
		return projection;
	}

	public static fromLifecycle(storyId: string, lifecycle: { actorId: string; name: string; locationId: string; currentActivity: string; isDead: boolean; isTraveling?: boolean }, kind: EntityKind = 'NPC'): EntityCardInput {
		return {
			id: lifecycle.actorId,
			storyId,
			name: lifecycle.name,
			kind,
			classification: { role: kind === 'NPC' ? 'NPC' : kind, tags: [kind.toLowerCase()] },
			worldState: { locationId: lifecycle.locationId, currentActivity: lifecycle.currentActivity, isAlive: !lifecycle.isDead, presence: lifecycle.isDead ? 'absent' : 'present' },
			lifecycle: { status: lifecycle.isDead ? 'DEAD' : 'ACTIVE', lastActiveAt: nowIso(), lastSeenAt: nowIso() },
			provenance: { source: 'NPC_LIFECYCLE_SYNC', createdBy: 'SYSTEM' },
		};
	}

	public static fromConfirmedCharacter(storyId: string, character: any): EntityCardInput {
		const identity = character?.identity || {};
		const role = character?.role || {};
		const progression = character?.progression;
		const coreStats = character?.coreStats;
		const feats = Array.isArray(character?.feats) ? character.feats : [];
		const equipment = [...(character?.startingEquipment?.equipped || []), ...(character?.startingEquipment?.inventory || [])].map((item: any) => item?.name).filter(Boolean);
		return {
			id: character.characterId,
			storyId,
			worldId: character.worldId,
			name: identity.name || 'Unnamed Character',
			kind: character.storyMode === 'PROTAGONIST' ? 'PLAYER' : 'CHARACTER',
			identity: { species: identity.species, age: identity.age, gender: identity.gender, aliases: [] },
			classification: { role: role.role, archetype: role.archetype, profession: role.profession, tags: ['confirmed_character', character.storyMode || 'PROTAGONIST'] },
			progression: progression ? {
				level: Number(coreStats?.level || 1),
				classId: progression.classId,
				subclassId: progression.subclassId,
				speciesId: progression.speciesId,
				featIds: normalizeArray(progression.featIds),
				moduleIds: normalizeArray(progression.moduleIds),
				customModules: clone(progression.customModules || []),
			} : undefined,
			coreStats: coreStats ? { level: Number(coreStats.level || 1), hpCurrent: Number(coreStats.hpCurrent || 0), hpMax: Number(coreStats.hpMax || 0), armorClass: Number(coreStats.armorClass || 0), speed: Number(coreStats.speed || 0), hitDice: coreStats.hitDice, abilityScores: Object.fromEntries(['strength','dexterity','constitution','intelligence','wisdom','charisma'].map((key) => [key, Number(coreStats[key] || 0)])) } : undefined,
			personality: { traits: normalizeArray(character?.personality?.traits), temperament: character?.personality?.temperament, values: normalizeArray(character?.personality?.values), motivations: normalizeArray(character?.motivations?.goals), fears: normalizeArray(character?.motivations?.fears), desires: normalizeArray(character?.motivations?.desires) },
			behavior: { defaultBehavior: 'Follow canonical character motivations and current activity.', priorities: normalizeArray(character?.motivations?.goals), routines: [] },
			social: { factionIds: normalizeArray(character?.relationships?.factions), role: role.role, reputation: { ...(character?.startingState?.reputations || {}) }, relationships: {} },
			economy: { currency: {}, inventoryItemIds: [], inventorySummary: equipment, assets: [] },
			background: { origin: identity.species, history: character?.background?.history, upbringing: character?.background?.upbringing, importantEvents: normalizeArray(character?.background?.importantEvents) },
			worldState: { locationId: character?.startingLocation?.locationId, currentActivity: 'initializing', currentGoal: normalizeArray(character?.motivations?.goals)[0], isAlive: true, presence: 'present' },
			traits: normalizeArray(character?.traits),
			capabilities: clone(character?.capabilities || []),
			feats: clone(feats),
			equipment,
			memoryRefs: [],
			provenance: { source: 'CHARACTER_GENESIS', createdBy: 'SYSTEM', confidence: 1 },
		};
	}
}