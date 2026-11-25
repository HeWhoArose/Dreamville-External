import fs from 'node:fs';
import path from 'node:path';
import { CharacterCanonSteward } from './characterCanonSteward';
import { WorldClock } from './worldClock';
import type { ImprovisableSource } from './locationArchetypes';
import type { ScheduledEventKind } from './livingWorldSimulation';
import { WorldDirectorPreparationService } from '../services/worldDirectorPreparationService';
import { saveAuthoredTerrain, validateAuthoredTerrain, type AuthoredTerrain } from './combatTerrain';
import type { BossPhaseDefinition } from './bossPhaseEngine';

/**
 * Authored world pack: everything a story needs to be playable without an LLM inventing its world.
 * Locations, routes, NPCs (with what they know, share and refuse), facts (who holds them, how they are
 * discovered), clues and a premise-appropriate kit. Applied to a story through the same repository APIs
 * the rest of the engine already uses, so no new authority is introduced.
 */
export interface WorldPackLocation {
	id: string; name: string; region: string; archetype: string; description: string; ambient?: string;
	discovered?: boolean; tags?: string[];
	/** What the scene lets a player improvise into items ("snap a branch", "pull a spear from the debris"). */
	improvisable?: ImprovisableSource[];
	/** The battlefield for a fight at this location: bounds, cover, pits, bridges, traps and start positions. */
	terrain?: AuthoredTerrain;
}
/** A weapon, shield, armour piece or tool lying in a location, wieldable once picked up. */
export interface WorldPackItem {
	id: string; locationId: string; name: string; description: string;
	category: 'Weapon' | 'Shield' | 'Armor' | 'Tool' | 'Miscellaneous';
	maxDurability: number;
	/** Fraction of maxDurability it has left (0 = already broken). Default 1. */
	durabilityFraction?: number;
	attackBonus?: number; armorBonus?: number; damageDice?: string;
	visible?: boolean;
}
/** Gear an NPC carries. It is dropped where they fall when they are defeated. */
export interface WorldPackCarriedItem {
	name: string; category: string; quantity?: number;
	/** Equipment slot if worn or wielded. */
	slot?: string;
	attackBonus?: number; armorBonus?: number; maxDurability?: number;
}
/** A timed event on the world clock, relative to the start of the story. */
export interface WorldPackEvent {
	id: string; kind: ScheduledEventKind; name: string; locationId: string;
	startsAfterMinutes: number; deadlineAfterMinutes?: number;
}
/** What an NPC brings to a fight. Without it the encounter falls back to generic creature numbers. */
export interface WorldPackCombat {
	level?: number; hp: number; armorClass: number;
	/** Speed in feet. */
	speed?: number;
	attackBonus: number; damageFormula: string; damageType?: string;
	/** Boss phases: health thresholds that change how the fight goes. */
	phases?: BossPhaseDefinition[];
}
export interface WorldPackNpc {
	id: string; name: string; role: string; locationId: string; description: string; dialogueStyle?: string;
	motivations?: string[]; knownToProtagonist?: boolean; carries?: WorldPackCarriedItem[]; combat?: WorldPackCombat; knows: string[]; sharing: 'FREE' | 'GUARDED' | 'SECRET'; secrets: string[]; refuses: string[];
}
export interface WorldPackFact {
	id: string; statement: string; subject: string; predicate: string; object: string; knownAtStart: boolean; clueId?: string;
}
export interface WorldPackClue {
	id: string; locationId: string; name: string; description: string; visible: boolean; discoverable: boolean;
}
export interface WorldPack {
	packVersion: 1; id: string; title: string; premise: string; openingScene: string;
	protagonist: { name: string; startLocationId: string; kit: Array<{ name: string; category: string; quantity: number }> };
	/** A prepared opening investigation. Omit for worlds that are not a mystery (an arena, a journey). */
	incident?: { locationId: string };
	locations: WorldPackLocation[];
	items?: WorldPackItem[];
	events?: WorldPackEvent[];
	routes: Array<[string, string, number, string]>;
	npcs: WorldPackNpc[];
	facts: WorldPackFact[];
	clues: WorldPackClue[];
}

const MAX_DESCRIPTION_CHARS = 400;

export function loadWorldPack(file: string): WorldPack {
	const resolved = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
	return JSON.parse(fs.readFileSync(resolved, 'utf8')) as WorldPack;
}

/** Completeness checks. Returns problems; an empty list means the pack is playable and answerable. */
export function validateWorldPack(pack: WorldPack): string[] {
	const problems: string[] = [];
	const dup = (label: string, ids: string[]) => {
		const seen = new Set<string>();
		for (const id of ids) { if (seen.has(id)) problems.push(`${label} id "${id}" is duplicated`); seen.add(id); }
	};
	dup('location', pack.locations.map((l) => l.id));
	dup('npc', pack.npcs.map((n) => n.id));
	dup('fact', pack.facts.map((f) => f.id));
	dup('clue', pack.clues.map((c) => c.id));

	const locations = new Set(pack.locations.map((l) => l.id));
	const facts = new Map(pack.facts.map((f) => [f.id, f]));
	const clues = new Map(pack.clues.map((c) => [c.id, c]));
	if (!pack.premise?.trim()) problems.push('premise is empty');
	if (!pack.openingScene?.trim()) problems.push('openingScene is empty');
	if (!locations.has(pack.protagonist.startLocationId)) problems.push(`start location "${pack.protagonist.startLocationId}" does not exist`);
	if (pack.incident && !locations.has(pack.incident.locationId)) problems.push(`incident location "${pack.incident.locationId}" does not exist`);

	// Reachability from the start location over bidirectional routes.
	const adjacent = new Map<string, Set<string>>();
	for (const [from, to] of pack.routes) {
		if (!locations.has(from)) problems.push(`route starts at unknown location "${from}"`);
		if (!locations.has(to)) problems.push(`route ends at unknown location "${to}"`);
		if (!adjacent.has(from)) adjacent.set(from, new Set());
		if (!adjacent.has(to)) adjacent.set(to, new Set());
		adjacent.get(from)!.add(to); adjacent.get(to)!.add(from);
	}
	const reached = new Set<string>([pack.protagonist.startLocationId]);
	const queue = [pack.protagonist.startLocationId];
	while (queue.length) {
		for (const next of adjacent.get(queue.shift()!) || []) if (!reached.has(next)) { reached.add(next); queue.push(next); }
	}
	for (const id of locations) if (!reached.has(id)) problems.push(`location "${id}" is unreachable from the start`);

	for (const location of pack.locations) {
		if (!location.description?.trim()) problems.push(`location "${location.id}" has no description`);
		if ((location.description || '').length > MAX_DESCRIPTION_CHARS) problems.push(`location "${location.id}" description exceeds ${MAX_DESCRIPTION_CHARS} characters`);
	}

	dup('item', (pack.items || []).map((i) => i.id));
	dup('event', (pack.events || []).map((e) => e.id));
	for (const item of pack.items || []) {
		if (!locations.has(item.locationId)) problems.push(`item "${item.id}" is placed at unknown location "${item.locationId}"`);
		if (!(item.maxDurability >= 1)) problems.push(`item "${item.id}" needs a maxDurability of at least 1`);
	}
	for (const event of pack.events || []) {
		if (!locations.has(event.locationId)) problems.push(`event "${event.id}" is at unknown location "${event.locationId}"`);
		if (!(event.startsAfterMinutes >= 0)) problems.push(`event "${event.id}" has no valid start time`);
		if (event.deadlineAfterMinutes !== undefined && event.deadlineAfterMinutes < event.startsAfterMinutes) problems.push(`event "${event.id}" has a deadline before it starts`);
	}
	for (const location of pack.locations) {
		if (location.terrain) problems.push(...validateAuthoredTerrain(location.terrain, `location "${location.id}" terrain`));
	}
	for (const npc of pack.npcs) {
		const combat = npc.combat;
		if (!combat) continue;
		if (!(combat.hp >= 1)) problems.push(`npc "${npc.id}" combat needs hp of at least 1`);
		if (!(combat.armorClass >= 1)) problems.push(`npc "${npc.id}" combat needs an armor class`);
		if (!combat.damageFormula?.trim()) problems.push(`npc "${npc.id}" combat needs a damage formula`);
		const phaseIds = (combat.phases || []).map((phase) => phase.id);
		if (new Set(phaseIds).size !== phaseIds.length) problems.push(`npc "${npc.id}" has duplicate boss phase ids`);
	}
	for (const location of pack.locations) {
		const keys = (location.improvisable || []).map((source) => source.key);
		if (new Set(keys).size !== keys.length) problems.push(`location "${location.id}" has duplicate improvisable keys`);
	}

	const holdersByFact = new Map<string, string[]>();
	for (const npc of pack.npcs) {
		if (!locations.has(npc.locationId)) problems.push(`npc "${npc.id}" is placed at unknown location "${npc.locationId}"`);
		if (!npc.description?.trim()) problems.push(`npc "${npc.id}" has no description`);
		if ((npc.description || '').length > MAX_DESCRIPTION_CHARS) problems.push(`npc "${npc.id}" description exceeds ${MAX_DESCRIPTION_CHARS} characters`);
		if (!npc.knows?.length) problems.push(`npc "${npc.id}" knows nothing`);
		if (npc.sharing !== 'FREE' && !npc.secrets.length && !npc.refuses.length) problems.push(`npc "${npc.id}" is ${npc.sharing} but names no secret or refusal`);
		for (const factId of npc.knows || []) {
			if (!facts.has(factId)) problems.push(`npc "${npc.id}" knows unknown fact "${factId}"`);
			holdersByFact.set(factId, [...(holdersByFact.get(factId) || []), npc.id]);
		}
	}
	for (const clue of pack.clues) {
		if (!locations.has(clue.locationId)) problems.push(`clue "${clue.id}" is at unknown location "${clue.locationId}"`);
		if (!clue.discoverable) problems.push(`clue "${clue.id}" is not discoverable`);
	}
	for (const fact of pack.facts) {
		if (fact.clueId && !clues.has(fact.clueId)) problems.push(`fact "${fact.id}" cites unknown clue "${fact.clueId}"`);
		const hasRoute = fact.knownAtStart || Boolean(fact.clueId) || (holdersByFact.get(fact.id) || []).length > 0;
		if (!hasRoute) problems.push(`fact "${fact.id}" cannot be learned: not known at start, no clue, no holder`);
	}
	if (!pack.facts.some((f) => f.knownAtStart)) problems.push('no fact is known at the start, so the opening cannot answer any question');
	return problems;
}

/** Applies a validated pack to a story. Throws if the pack is incomplete. */
export async function applyWorldPack(repository: any, storyId: string, pack: WorldPack): Promise<{ preparation: string }> {
	const problems = validateWorldPack(pack);
	if (problems.length) throw new Error(`World pack "${pack.id}" is incomplete: ${problems.join('; ')}`);

	repository.seedStory(storyId);
	CharacterCanonSteward.resetStory(storyId);
	const graph = repository.getGeographyGraph(storyId);

	for (const location of pack.locations) {
		graph.addNode({
			id: location.id, name: location.name, regionId: location.region, description: location.description,
			ambientSensory: location.ambient, archetype: location.archetype, accessible: true,
			discovered: Boolean(location.discovered), sceneObjects: [], tags: location.tags || [],
			...(location.improvisable?.length ? { environment: { features: [], improvisable: location.improvisable } } : {}),
		} as any);
		if (location.terrain) saveAuthoredTerrain(repository, storyId, location.id, location.terrain);
	}
	for (const [from, to, distanceKm, terrain] of pack.routes) {
		for (const [a, b] of [[from, to], [to, from]]) {
			graph.addEdge({
				id: `edge_${a}_to_${b}`, fromLocationId: a, toLocationId: b, distanceKm, terrain,
				allowedModes: ['Foot', 'Coach', 'Horse'], hazardRisk: 0, isBlocked: false, provenance: 'authored',
			});
		}
	}
	for (const clue of pack.clues) {
		const result = graph.addSceneObject(clue.locationId, {
			id: clue.id, name: clue.name, kind: 'OTHER', description: clue.description, visible: clue.visible,
			interactable: clue.discoverable, tags: ['clue'], properties: { discoverable: clue.discoverable, presence: 'PRESENT', sourcePack: pack.id },
		});
		if (result && result.success === false) throw new Error(`Could not place clue ${clue.id}: ${result.errorReason}`);
	}

	for (const item of pack.items || []) {
		const result = graph.addSceneObject(item.locationId, {
			id: item.id, name: item.name, kind: 'ITEM', description: item.description, visible: item.visible !== false, interactable: true,
			tags: ['pack_item', item.category.toLowerCase()],
			properties: {
				takeable: true, itemCategory: item.category, maxDurability: item.maxDurability, durabilityFraction: item.durabilityFraction ?? 1,
				attackBonus: item.attackBonus, armorBonus: item.armorBonus, damageDice: item.damageDice, sourcePack: pack.id,
			},
			provenance: 'WORLD_PACK',
		});
		if (result && result.success === false) throw new Error(`Could not place item ${item.id}: ${result.errorReason}`);
	}

	const player = repository.getPlayerLifecycle(storyId);
	const discovered = pack.locations.filter((l) => l.discovered).map((l) => l.id);
	if (player) {
		repository.updatePlayerLifecycle(storyId, player.copyWith({
			name: pack.protagonist.name, locationId: pack.protagonist.startLocationId, discoveredLocationIds: Array.from(new Set([pack.protagonist.startLocationId, ...discovered])),
		}));
	}
	const run = repository.getStoryRun(storyId);
	if (run) {
		run.protagonist = { ...(run.protagonist || {}), characterId: player?.actorId || `char_${storyId}`, name: pack.protagonist.name };
		run.startingSituation = pack.premise as any;
		repository.saveStoryRun(run);
	}
	if (pack.protagonist.kit.length && player) {
		repository.getInventoryEngine(storyId).seedFromGenesisEquipment(player.actorId, { inventory: pack.protagonist.kit });
	}

	const timestamp = repository.getWorldClock(storyId).getTimestamp();
	for (const event of pack.events || []) {
		const at = (minutes: number) => new WorldClock({ timestamp: { ...timestamp } }).advanceSeconds(Math.max(1, minutes * 60)).timestamp;
		repository.getLivingWorldSimulation(storyId).scheduleEvent({
			id: event.id, kind: event.kind, name: event.name, locationId: event.locationId,
			triggerTimestamp: event.startsAfterMinutes > 0 ? at(event.startsAfterMinutes) : { ...timestamp },
			...(event.deadlineAfterMinutes !== undefined ? { deadlineTimestamp: at(event.deadlineAfterMinutes) } : {}),
			isResolved: false, status: 'pending',
		});
	}
	for (const fact of pack.facts) {
		repository.saveWorldFact(storyId, {
			id: fact.id, factId: fact.id, statement: fact.statement, category: 'AUTHORED_PACK', subjectEntityId: fact.subject,
			predicate: fact.predicate, objectValue: fact.object, provenanceClass: 'AUTHORED', provenanceSummary: `World pack ${pack.id}`,
			sourceSegmentIds: [], confidence: 1, acquiredAtTimestamp: timestamp, truthState: 'TRUE', canonical: true,
		});
		if (fact.knownAtStart) {
			repository.addKnowledgeFact(storyId, {
				id: fact.id, subjectEntityId: fact.subject, predicate: fact.predicate, objectValue: fact.object, sourceType: 'document',
				confidence: 1, secretLevel: 'public', scope: 'exact', provenanceSummary: fact.statement, acquiredAtTimestamp: timestamp,
			});
		}
	}

	const sharingGate = { FREE: undefined, GUARDED: { minTrust: 50 }, SECRET: { minTrust: 90, intimidationRequired: true } } as const;
	for (const npc of pack.npcs) {
		const card = repository.saveEntityCard(storyId, {
			id: npc.id, storyId, name: npc.name, kind: 'NPC', isTemplate: false,
			identity: { aliases: [] }, classification: { role: npc.role, tags: [npc.role.toLowerCase()] },
			personality: {
				traits: [], values: [], motivations: npc.motivations || [], fears: [], desires: [],
				dialogueStyle: npc.dialogueStyle, canonicalSecrets: npc.secrets,
			},
			behavior: { priorities: [], routines: [] }, social: { factionIds: [], reputation: {}, relationships: {} },
			background: { origin: npc.description, importantEvents: [], canonicalSecrets: npc.secrets },
			worldState: { locationId: npc.locationId, currentActivity: 'present', isAlive: true, presence: 'present' },
			lifecycle: { status: 'ACTIVE' },
			...(npc.combat ? { coreStats: { level: npc.combat.level ?? 1, hpCurrent: npc.combat.hp, hpMax: npc.combat.hp, armorClass: npc.combat.armorClass, speed: npc.combat.speed ?? 30, abilityScores: {} } } : {}),
			metadata: {
				sourcePack: pack.id, sharing: npc.sharing, refuses: npc.refuses,
				...(npc.combat ? { attackBonus: npc.combat.attackBonus, damageFormula: npc.combat.damageFormula, ...(npc.combat.damageType ? { damageType: npc.combat.damageType } : {}), combat: { bossPhases: npc.combat.phases || [] } } : {}),
			},
			provenance: { source: 'WORLD_PACK', createdBy: 'SYSTEM' },
		});
		CharacterCanonSteward.initializeCharacterFromCard(card);
		if (npc.carries?.length) {
			const gear = npc.carries.map((c, n) => ({
				id: `${npc.id}_gear_${n}`, name: c.name, category: c.category, quantity: c.quantity ?? 1, rarity: 'Common', properties: {},
				provenance: 'CHARACTER_GENESIS', isEquipped: Boolean(c.slot), ...(c.slot ? { slot: c.slot } : {}),
				...(c.maxDurability ? { maxDurability: c.maxDurability } : {}),
				modifiers: [
					...(c.attackBonus ? [{ id: `${npc.id}_atk_${n}`, target: 'combat.attackBonus', mode: 'ADD' as const, value: c.attackBonus, precedence: 60, stackGroup: 'WEAPON_ATTACK' }] : []),
					...(c.armorBonus ? [{ id: `${npc.id}_ac_${n}`, target: 'coreStats.armorClass', mode: 'ADD' as const, value: c.armorBonus, precedence: 60, stackGroup: c.category === 'Shield' || c.slot === 'offHand' ? 'SHIELD_AC' : 'ARMOR_AC' }] : []),
				],
			}));
			repository.getInventoryEngine(storyId).seedFromGenesisEquipment(npc.id, {
				equipped: gear.filter((g) => g.isEquipped), inventory: gear.filter((g) => !g.isEquipped),
			} as any);
		}
		if (npc.knownToProtagonist && player) repository.grantEntityIdentityKnowledge(storyId, player.actorId, npc.id, npc.name, 'told');
		for (const factId of npc.knows) {
			const fact = pack.facts.find((f) => f.id === factId)!;
			CharacterCanonSteward.grantRestrictedFactsMentionedIn(storyId, npc.id, fact.statement);
			CharacterCanonSteward.grantFact(storyId, npc.id, {
				factId, subjectEntityId: fact.subject, predicate: fact.predicate, objectValue: fact.object,
				sourceType: 'AUTHORED_BACKGROUND', acquiredAtTimestamp: String(timestamp?.totalElapsedSeconds ?? 0), acquiredAtTurn: 0, confidence: 1,
				isSecret: npc.sharing === 'SECRET',
				...(sharingGate[npc.sharing] ? { shareThreshold: { ...sharingGate[npc.sharing] } } : {}),
			});
		}
	}

	const preparation = pack.incident
		? await WorldDirectorPreparationService.prepareOpeningInvestigation(repository, storyId, pack.incident.locationId)
		: { status: 'NOT_APPLICABLE' };

	// Restricted investigation facts exist only after preparation, so reconcile authored NPC knowledge with them now.
	for (const npc of pack.npcs) {
		for (const factId of npc.knows) {
			const fact = pack.facts.find((candidate) => candidate.id === factId);
			if (fact) CharacterCanonSteward.grantRestrictedFactsMentionedIn(storyId, npc.id, fact.statement);
		}
	}

	// The opening briefing names people (victim, finder, client). The protagonist read it, so those names are
	// known; without this the epistemic name-masking strips every briefing fact that mentions them.
	if (player) {
		const briefing = pack.facts.filter((fact) => fact.knownAtStart).map((fact) => fact.statement).join(' ');
		for (const card of repository.getEntityCards(storyId)) {
			if (card.kind === 'PLAYER' || !card.name || !briefing.includes(card.name)) continue;
			repository.grantEntityIdentityKnowledge(storyId, player.actorId, card.id, card.name, 'told');
		}
	}
	return { preparation: preparation.status };
}
