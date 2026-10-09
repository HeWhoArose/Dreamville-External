import type { WorldRepository } from '../repositories/worldRepository';
import type { EntityCard, EntityKind } from './entityCard';
import { deterministicId } from './deterministicRng';

export interface WorldActivityEvent {
	id: string;
	type: 'AMBIENT_ACTIVITY' | 'SOCIAL_OPPORTUNITY' | 'POTENTIAL_ENCOUNTER';
	summary: string;
	locationId: string;
	source: 'WORLD_ACTIVITY_DIRECTOR';
	entityId?: string;
}

/**
 * Deterministic first-pass population and ambient activity projection.
 *
 * The director only creates ambient people in authored inhabited locations or
 * locations whose names/descriptions clearly imply a public gathering place.
 * Unknown occupancy alone is never treated as proof that a place is abandoned
 * or inhabited. Existing canonical NPCs and player-authored entities are kept.
 */
export class WorldActivityDirector {
	private static readonly PEOPLE = [
		{ name: 'Mira Fen', kind: 'MERCHANT' as EntityKind, role: 'merchant', activity: 'calling out wares to passersby', motivations: ['earn a living', 'find reliable customers'], traits: ['outgoing', 'observant'] },
		{ name: 'Tomas Reed', kind: 'NPC' as EntityKind, role: 'traveller', activity: 'checking a route map and watching the crowd', motivations: ['reach the next settlement safely', 'learn local news'], traits: ['cautious', 'curious'] },
		{ name: 'Sella Vorn', kind: 'NPC' as EntityKind, role: 'local resident', activity: 'chatting with a neighbour while going about daily business', motivations: ['finish daily errands', 'keep informed about local affairs'], traits: ['practical', 'social'] },
		{ name: 'Dain Orrel', kind: 'NPC' as EntityKind, role: 'worker', activity: 'carrying supplies between nearby buildings', motivations: ['finish a work shift', 'provide for family'], traits: ['hardworking', 'reserved'] },
	];

	private static locationSupportsPublicActivity(name: string, description: string): boolean {
		return /citadel|market|bazaar|inn|tavern|guild|town|city|village|settlement|harbour|harbor|station|plaza|square|academy|temple district|capital/i.test(name + ' ' + description);
	}

	public static ensureAmbientPopulation(
		repository: WorldRepository,
		storyId: string,
		locationId: string,
	): EntityCard[] {
		const location = repository.getGeographyGraph(storyId).getNode(locationId);
		if (!location) return [];

		const population = location.population;
		if (population?.status === 'ABANDONED' || population?.status === 'RESTRICTED') return [];
		if (population?.expectedPopulation === 'NONE') return [];

		const publicPlace = this.locationSupportsPublicActivity(location.name, location.description || '');
		const explicitlyInhabited = population?.status === 'INHABITED';
		if (!explicitlyInhabited && !publicPlace) return [];

		const existing = repository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card) =>
			card.worldState.locationId === locationId &&
			card.worldState.isAlive &&
			card.worldState.presence !== 'absent' &&
			['NPC', 'MERCHANT', 'CHARACTER', 'FACTION_MEMBER'].includes(card.kind)
		);
		const existingIds = new Set(existing.map((card) => card.id));
		const desiredCount = population?.expectedPopulation === 'DENSE' ? 4
			: population?.expectedPopulation === 'MODERATE' ? 3
			: population?.expectedPopulation === 'SPARSE' ? 1
			: explicitlyInhabited ? 2
			: /market|bazaar|guild|inn|tavern|town|city|village|settlement|plaza|square/i.test(location.name) ? 2
			: 1;
		if (existing.length >= desiredCount) return [];

		const created: EntityCard[] = [];
		for (let index = 0; index < this.PEOPLE.length && existing.length + created.length < desiredCount; index++) {
			const person = this.PEOPLE[index];
			const id = deterministicId('ambient_npc', storyId, locationId, person.role);
			if (existingIds.has(id) || repository.getEntityCard(storyId, id)) continue;
			const card = repository.saveEntityCard(storyId, {
				id,
				name: person.name,
				kind: person.kind,
				isTemplate: false,
				identity: { species: 'human', aliases: [] },
				classification: { role: person.role, profession: person.role, tags: ['ambient_population', 'world_activity'] },
				personality: { traits: person.traits, values: ['self-preservation'], motivations: person.motivations, fears: [], desires: person.motivations, dialogueStyle: person.role === 'merchant' ? 'warm, brisk sales patter' : 'natural everyday speech' },
				behavior: { defaultBehavior: person.activity, priorities: person.motivations, routines: [person.activity] },
				social: { factionIds: [], reputation: {}, relationships: {} },
				worldState: { locationId, currentActivity: person.activity, currentGoal: person.motivations[0], isAlive: true, presence: 'present' },
				traits: person.traits,
				capabilities: [],
				feats: [],
				equipment: [],
				memoryRefs: [],
				provenance: { source: 'WORLD_ACTIVITY_DIRECTOR', createdBy: 'SYSTEM', confidence: 0.65 },
				lifecycle: { status: 'ACTIVE' },
				metadata: {
					ambientPopulation: true,
					ambientActivity: person.activity,
					activityRole: person.role,
					populationLocationId: locationId,
					encounterInitiativeEligible: true,
				},
			});
			created.push(card);
		}
		return created;
	}

	public static buildAmbientEvents(entities: Array<{
		id: string;
		name: string;
		kind?: string;
		locationId?: string;
		currentActivity?: string;
		visibleToPlayer?: boolean;
	}>, locationId: string): WorldActivityEvent[] {
		const events: WorldActivityEvent[] = [];
		for (const entity of entities) {
			if (entity.visibleToPlayer === false || entity.locationId !== locationId || !entity.currentActivity) continue;
			const activity = String(entity.currentActivity).trim();
			if (!activity) continue;
			events.push({
				id: deterministicId('ambient_activity', locationId, entity.id, activity),
				type: /calling out wares|merchant/i.test(activity) ? 'SOCIAL_OPPORTUNITY' : 'AMBIENT_ACTIVITY',
				summary: entity.name + ' is ' + activity + '.',
				locationId,
				source: 'WORLD_ACTIVITY_DIRECTOR',
				entityId: entity.id,
			});
		}
		return events.slice(0, 8);
	}
}
