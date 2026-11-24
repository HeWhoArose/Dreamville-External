import fs from 'node:fs';
import path from 'node:path';
import { CharacterCanonSteward } from './characterCanonSteward';
import { WorldDirectorPreparationService } from '../services/worldDirectorPreparationService';

/**
 * Authored world pack: everything a story needs to be playable without an LLM inventing its world.
 * Locations, routes, NPCs (with what they know, share and refuse), facts (who holds them, how they are
 * discovered), clues and a premise-appropriate kit. Applied to a story through the same repository APIs
 * the rest of the engine already uses, so no new authority is introduced.
 */
export interface WorldPackLocation {
	id: string; name: string; region: string; archetype: string; description: string; ambient?: string;
	discovered?: boolean; tags?: string[];
}
export interface WorldPackNpc {
	id: string; name: string; role: string; locationId: string; description: string; dialogueStyle?: string;
	motivations?: string[]; knownToProtagonist?: boolean; knows: string[]; sharing: 'FREE' | 'GUARDED' | 'SECRET'; secrets: string[]; refuses: string[];
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
	incident: { locationId: string };
	locations: WorldPackLocation[];
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
	if (!locations.has(pack.incident.locationId)) problems.push(`incident location "${pack.incident.locationId}" does not exist`);

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
		} as any);
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
			metadata: { sourcePack: pack.id, sharing: npc.sharing, refuses: npc.refuses },
			provenance: { source: 'WORLD_PACK', createdBy: 'SYSTEM' },
		});
		CharacterCanonSteward.initializeCharacterFromCard(card);
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

	const preparation = await WorldDirectorPreparationService.prepareOpeningInvestigation(repository, storyId, pack.incident.locationId);

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
