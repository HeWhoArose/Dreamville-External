import type { WorldRepository } from '../repositories/worldRepository';
import type { EntityCard, EntityKind } from './entityCard';
import { deterministicId, hashStringToSeed } from './deterministicRng';

export interface WorldActivityEvent {
	id: string;
	type: 'AMBIENT_ACTIVITY' | 'SOCIAL_OPPORTUNITY' | 'POTENTIAL_ENCOUNTER' | 'NPC_INITIATED_INTERACTION';
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
		{ name: 'Ivara Pell', kind: 'NPC' as EntityKind, role: 'courier', activity: 'checking delivery slips and searching for the right street', motivations: ['deliver a sealed parcel', 'avoid missing a deadline'], traits: ['brisk', 'resourceful'] },
		{ name: 'Beren Ashdown', kind: 'NPC' as EntityKind, role: 'guard', activity: 'checking the flow of people at a public entrance', motivations: ['keep the entrance orderly', 'spot trouble early'], traits: ['alert', 'direct'] },
		{ name: 'Nemi Oris', kind: 'NPC' as EntityKind, role: 'street performer', activity: 'performing a quick tune for passersby', motivations: ['earn a few coins', 'draw a larger audience'], traits: ['expressive', 'playful'] },
		{ name: 'Calder Voss', kind: 'NPC' as EntityKind, role: 'craftsworker', activity: 'delivering a repaired tool to a waiting customer', motivations: ['keep customers satisfied', 'finish the next repair'], traits: ['patient', 'practical'] },
		{ name: 'Yara Sen', kind: 'NPC' as EntityKind, role: 'healer', activity: 'checking a traveler\'s bandage and supplies', motivations: ['help the injured', 'restock medical supplies'], traits: ['kind', 'focused'] },
		{ name: 'Oren Vale', kind: 'NPC' as EntityKind, role: 'messenger', activity: 'asking directions while carrying a folded dispatch', motivations: ['deliver an important message', 'find the quickest route'], traits: ['hurried', 'polite'] },
	];

	private static locationSupportsPublicActivity(name: string, description: string): boolean {
		return /citadel|market|bazaar|inn|tavern|guild|town|city|village|settlement|harbour|harbor|station|plaza|square|academy|temple district|capital|alley/i.test(name + ' ' + description);
	}

	private static peopleForLocation(storyId: string, locationId: string, name: string, description: string) {
		const place = (name + ' ' + description).toLowerCase();
		const variant = hashStringToSeed(storyId + '|' + locationId) % (/alley/.test(place) ? 8 : 5);
		const selectPeople = (pool: any[], count: number) => {
			const start = hashStringToSeed(storyId + '|' + locationId + '|roster') % pool.length;
			const chosen: any[] = [];
			for (let offset = 0; offset < pool.length && chosen.length < count; offset++) {
				chosen.push(pool[(start + offset) % pool.length]);
			}
			return chosen;
		};
		if (/guild/.test(place)) {
			return variant === 0 ? [
				{ name: 'Rook Halvern', kind: 'NPC' as EntityKind, role: 'guild challenger', activity: 'arguing with another adventurer over a disputed contract', motivations: ['claim a lucrative contract', 'protect a hard-won reputation'], traits: ['proud', 'short-tempered'] },
				{ name: 'Edda Marr', kind: 'NPC' as EntityKind, role: 'guild clerk', activity: 'sorting posted contracts and answering adventurers’ questions', motivations: ['keep the guild orderly', 'match capable adventurers to jobs'], traits: ['organized', 'sharp-eyed'] },
			] : [
				{ name: 'Edda Marr', kind: 'NPC' as EntityKind, role: 'guild clerk', activity: 'sorting posted contracts and answering adventurers’ questions', motivations: ['keep the guild orderly', 'match capable adventurers to jobs'], traits: ['organized', 'sharp-eyed'] },
				{ name: 'Rook Halvern', kind: 'NPC' as EntityKind, role: 'guild adventurer', activity: 'comparing a contract notice with a travel-worn map', motivations: ['prepare for a dangerous contract', 'find reliable companions'], traits: ['wary', 'experienced'] },
			];
		}
		if (/inn|tavern/.test(place)) {
			const innkeepers = [
				{ name: 'Mira Fen', kind: 'NPC' as EntityKind, role: 'innkeeper', activity: 'checking the common room and serving waiting guests', motivations: ['keep guests safe', 'earn a living'], traits: ['observant', 'practical'] },
				{ name: 'Dara Quill', kind: 'NPC' as EntityKind, role: 'innkeeper', activity: 'settling a room dispute and checking the guest ledger', motivations: ['keep the inn profitable', 'prevent trouble'], traits: ['firm', 'fair'] },
				{ name: 'Pavel Norr', kind: 'NPC' as EntityKind, role: 'innkeeper', activity: 'carrying a tray between tables and listening for requests', motivations: ['serve guests well', 'save for a new kitchen'], traits: ['warm', 'busy'] },
				{ name: 'Suri Venn', kind: 'NPC' as EntityKind, role: 'innkeeper', activity: 'checking arrivals and asking a tired courier about the road', motivations: ['keep travellers safe', 'learn about road conditions'], traits: ['curious', 'careful'] },
				{ name: 'Halwen Marr', kind: 'NPC' as EntityKind, role: 'innkeeper', activity: 'counting the evening takings and speaking with a regular', motivations: ['keep the inn afloat', 'protect local friendships'], traits: ['wry', 'experienced'] },
			];
			const innkeeper = innkeepers[variant % innkeepers.length];
			const guest = variant === 0
				? { name: 'The Grey Stranger', kind: 'NPC' as EntityKind, role: 'shady contact', activity: 'sitting alone in a shadowed corner, watching who enters and keeping a folded map close', motivations: ['find a discreet buyer for a map', 'avoid drawing attention'], traits: ['guarded', 'calculating'] }
				: selectPeople(this.PEOPLE.filter((person) => person.role !== 'worker'), 1)[0];
			return [innkeeper, guest];
		}
		if (/alley/.test(place)) {
			if (variant === 0) {
				return [
					{ name: 'Kest Varr', kind: 'NPC' as EntityKind, role: 'alley robber', activity: 'trying to wrench a satchel from a passerby in the alley', motivations: ['take valuables quickly', 'escape before witnesses intervene'], traits: ['aggressive', 'evasive'] },
					{ name: 'Nera Sol', kind: 'NPC' as EntityKind, role: 'robbery victim', activity: 'struggling to keep hold of a satchel and calling for help', motivations: ['protect personal belongings', 'get to safety'], traits: ['frightened', 'determined'] },
				];
			}
			if (variant === 1) {
				return [
					{ name: 'Veyr Dask', kind: 'NPC' as EntityKind, role: 'kidnapper', activity: 'trying to force a frightened traveller toward a waiting carriage', motivations: ['remove the captive before anyone intervenes', 'avoid witnesses'], traits: ['coercive', 'calculating'] },
					{ name: 'Ilyan Mer', kind: 'NPC' as EntityKind, role: 'kidnapping target', activity: 'pulling away from a stranger and shouting for help', motivations: ['escape the captor', 'attract help'], traits: ['frightened', 'resilient'] },
				];
			}
			return [
				{ name: 'Dain Orrel', kind: 'NPC' as EntityKind, role: 'local worker', activity: 'carrying supplies through the side passage', motivations: ['finish a work shift', 'get home safely'], traits: ['hardworking', 'reserved'] },
			];
		}
		if (/market|bazaar/.test(place)) {
			const merchants = [
				{ name: 'Mira Fen', kind: 'MERCHANT' as EntityKind, role: 'merchant', activity: 'calling out wares to passersby', motivations: ['earn a living', 'find reliable customers'], traits: ['outgoing', 'observant'] },
				{ name: 'Jori Kett', kind: 'MERCHANT' as EntityKind, role: 'merchant', activity: 'demonstrating a hand-made gadget to curious shoppers', motivations: ['sell the day’s best work', 'find a skilled apprentice'], traits: ['inventive', 'talkative'] },
				{ name: 'Amara Doss', kind: 'MERCHANT' as EntityKind, role: 'merchant', activity: 'bargaining with a customer over a basket of rare fruit', motivations: ['earn a fair profit', 'keep regular customers'], traits: ['sharp', 'good-humoured'] },
				{ name: 'Fenrik Sol', kind: 'MERCHANT' as EntityKind, role: 'merchant', activity: 'laying out maps, inks and travel supplies on a cloth-covered stall', motivations: ['sell useful travel goods', 'hear news from the roads'], traits: ['observant', 'patient'] },
				{ name: 'Tessa Vey', kind: 'MERCHANT' as EntityKind, role: 'merchant', activity: 'calling customers over to inspect a new shipment of cloth', motivations: ['sell the shipment before dusk', 'maintain her supplier contacts'], traits: ['confident', 'quick-witted'] },
			];
			const merchant = merchants[variant % merchants.length];
			const supporting = selectPeople(this.PEOPLE.filter((person) => person.name !== merchant.name), 2);
			return [merchant, ...supporting];
		}
		return selectPeople(this.PEOPLE, 3);
	}

	private static refreshDailyActivity(
		repository: WorldRepository,
		storyId: string,
		locationId: string,
		existing: EntityCard[],
	): boolean {
		const ambientCards = existing.filter((card) => card.metadata?.ambientPopulation === true);
		if (ambientCards.length === 0) return false;
		const hour = repository.getWorldClock(storyId).getTimestamp().hour;
		let changed = false;
		for (const card of ambientCards) {
			const role = String(card.metadata?.activityRole || card.classification?.role || '').toLowerCase();
			let activity = card.worldState.currentActivity || card.behavior.defaultBehavior || 'going about daily business';
			let presence: 'present' | 'absent' = 'present';
			if (role === 'merchant') {
				if (hour >= 7 && hour < 19) activity = String(card.metadata?.ambientActivity || 'calling out wares to passersby');
				else if (hour >= 19 && hour < 22) activity = 'packing unsold goods and counting the day’s takings';
				else { activity = 'resting away from the market'; presence = 'absent'; }
			} else if (role === 'market porter' || role === 'worker') {
				if (hour >= 6 && hour < 18) activity = 'carrying supplies between nearby buildings';
				else { activity = 'off duty and away from the market'; presence = 'absent'; }
			} else if (role === 'local resident') {
				if (hour >= 7 && hour < 20) activity = 'chatting with neighbours and going about daily errands';
				else { activity = 'at home for the night'; presence = 'absent'; }
			} else if (role === 'traveller') {
				activity = hour >= 6 && hour < 20 ? 'checking a route map and watching the crowd' : 'resting beside their travel pack';
			} else if (role === 'innkeeper') {
				if (hour >= 6 && hour < 23) activity = 'checking the common room and serving waiting guests';
				else { activity = 'closing the inn for the night'; presence = 'absent'; }
			} else if (role === 'guild clerk') {
				if (hour >= 8 && hour < 19) activity = 'sorting posted contracts and answering adventurers’ questions';
				else { activity = 'off duty; the contract desk is unattended'; presence = 'absent'; }
			} else if (role === 'guild adventurer' || role === 'guild challenger') {
				if (hour >= 7 && hour < 22) {
					activity = role === 'guild challenger'
						? 'arguing with another adventurer over a disputed contract'
						: 'comparing a contract notice with a travel-worn map';
				} else { activity = 'away from the guild hall'; presence = 'absent'; }
			} else if (role === 'courier' || role === 'messenger') {
				if (hour >= 6 && hour < 18) activity = hour < 10
					? 'checking delivery slips and searching for the right street'
					: 'hurrying between destinations with a sealed parcel or dispatch';
				else { activity = 'off duty and delivering no messages'; presence = 'absent'; }
			} else if (role === 'guard') {
				if (hour >= 6 && hour < 22) activity = hour < 14
					? 'checking the flow of people at a public entrance'
					: 'speaking with a colleague while keeping watch';
				else { activity = 'off duty at the guard post'; presence = 'absent'; }
			} else if (role === 'street performer') {
				if (hour >= 10 && hour < 20) activity = hour < 16
					? 'performing a quick tune for passersby'
					: 'taking requests from a small gathering and collecting coins';
				else { activity = 'packing away the instrument for the day'; presence = 'absent'; }
			} else if (role === 'craftsworker') {
				if (hour >= 7 && hour < 19) activity = hour < 13
					? 'delivering a repaired tool to a waiting customer'
					: 'checking a tool and discussing a repair with a customer';
				else { activity = 'back at the workshop after the day’s work'; presence = 'absent'; }
			} else if (role === 'healer') {
				if (hour >= 7 && hour < 21) activity = hour < 15
					? 'checking a traveler’s bandage and supplies'
					: 'sorting remedies and asking after an injured local';
				else { activity = 'resting after tending to patients'; presence = 'absent'; }
			} else if (role === 'suspicious passerby') {
				if (hour >= 17 && hour < 24) activity = 'lingering near a side passage and watching the flow of pedestrians';
				else { activity = 'no longer in the alley'; presence = 'absent'; }
			}
			if (card.worldState.currentActivity === activity && card.worldState.presence === presence) continue;
			repository.saveEntityCard(storyId, {
				...card,
				worldState: { ...card.worldState, locationId, currentActivity: activity, presence },
				metadata: { ...card.metadata, ambientActivity: activity },
			});
			changed = true;
		}
		return changed;
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
		const people = this.peopleForLocation(storyId, locationId, location.name, location.description || '');
		const explicitlyInhabited = population?.status === 'INHABITED';
		if (!explicitlyInhabited && !publicPlace) return [];

		const existing = repository.getEntityCards(storyId, { status: 'ACTIVE' }).filter((card) =>
			card.worldState.locationId === locationId &&
			card.worldState.isAlive &&
			['NPC', 'MERCHANT', 'CHARACTER', 'FACTION_MEMBER'].includes(card.kind)
		);
		const existingIds = new Set(existing.map((card) => card.id));
		let activitiesChanged = this.refreshDailyActivity(repository, storyId, locationId, existing);
		const placeText = (location.name + ' ' + (location.description || '')).toLowerCase();
		const alleyVariant = hashStringToSeed(storyId + '|' + locationId) % 8;
		const desiredCount = /alley/.test(placeText) ? (alleyVariant >= 2 ? 1 : 2)
			: population?.expectedPopulation === 'DENSE' ? 4
			: population?.expectedPopulation === 'MODERATE' ? 3
			: population?.expectedPopulation === 'SPARSE' ? 1
			: explicitlyInhabited ? 2
			: /citadel|market|bazaar|guild|inn|tavern|town|city|village|settlement|plaza|square/i.test(location.name) ? 2
			: 1;
		if (existing.length >= desiredCount) {
			if (activitiesChanged) {
				const run = repository.getStoryRun(storyId);
				if (run) repository.saveStoryRun(run);
			}
			return [];
		}

		const created: EntityCard[] = [];
		for (let index = 0; index < people.length && existing.length + created.length < desiredCount; index++) {
			const person = people[index];
			const id = deterministicId('ambient_npc', storyId, locationId, person.role, person.name);
			if (existingIds.has(id) || repository.getEntityCard(storyId, id)) continue;
			const card = repository.saveEntityCard(storyId, {
				id,
				name: person.name,
				kind: person.kind,
				isTemplate: false,
				identity: { aliases: [] },
				classification: {
					role: person.role,
					profession: person.role,
					threat: /robber|kidnapper/i.test(person.role) ? 'hostile' : undefined,
					tags: ['ambient_population', 'world_activity', ...(/robber|kidnapper/i.test(person.role) ? ['hostile', 'aggressive'] : [])],
				},
				personality: { traits: person.traits, values: ['self-preservation'], motivations: person.motivations, fears: [], desires: person.motivations, dialogueStyle: person.role === 'merchant' ? 'warm, brisk sales patter' : 'natural everyday speech' },
				behavior: {
					defaultBehavior: person.activity,
					combatBehavior: /robber|kidnapper/i.test(person.role) ? 'attempt to escape if overwhelmed; otherwise continue hostile action' : undefined,
					threatResponse: /robber|kidnapper/i.test(person.role) ? 'hostile' : undefined,
					priorities: person.motivations,
					routines: [person.activity],
				},
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
		// EntityRegistry is included in StoryRun persistence snapshots. Saving the
		// existing run here makes generated population survive reloads instead of
		// existing only in the current process.
		if (created.length > 0 || activitiesChanged) {
			const run = repository.getStoryRun(storyId);
			if (run) repository.saveStoryRun(run);
		}
		return created;
	}

	public static buildAmbientEvents(entities: Array<{
		id: string;
		name: string;
		kind?: string;
		role?: string;
		locationId?: string;
		currentActivity?: string;
		presence?: string;
		isAlive?: boolean;
		visibleToPlayer?: boolean;
	}>, locationId: string, turnNumber: number = 1): WorldActivityEvent[] {
		const events: WorldActivityEvent[] = [];
		for (const entity of entities) {
			if (
				entity.visibleToPlayer === false ||
				entity.isAlive === false ||
				entity.presence === 'absent' ||
				entity.locationId !== locationId ||
				!entity.currentActivity
			) continue;
			const activity = String(entity.currentActivity).trim();
			if (!activity) continue;
			const role = String(entity.role || '').toLowerCase();
			const isSocialOpportunity = /calling out wares|merchant|arguing with another adventurer|folded map|shady contact/i.test(activity + ' ' + role);
			const isPotentialEncounter = /suspicious passerby|guild challenger|shady contact|alley robber|kidnapper|bully|prejudiced|racial tension|lineage supremacist/i.test(role);
			events.push({
				id: deterministicId('ambient_activity', locationId, entity.id, activity),
				type: isPotentialEncounter ? 'POTENTIAL_ENCOUNTER' : isSocialOpportunity ? 'SOCIAL_OPPORTUNITY' : 'AMBIENT_ACTIVITY',
				summary: entity.name + ' is ' + activity + '.',
				locationId,
				source: 'WORLD_ACTIVITY_DIRECTOR',
				entityId: entity.id,
			});

			// NPCs sometimes initiate contact without being addressed. This is a
			// deterministic, low-frequency scene beat, not a mandatory quest/fight.
			// Its evidence exists for this turn only and names the visible initiator.
			const canInitiate = /merchant|shady contact|guild challenger|traveller|traveler/i.test(role);
			const initiationSlot = Math.trunc(Math.max(1, turnNumber)) % 5 === 0;
			const initiationRoll = hashStringToSeed(entity.id + '|init|' + Math.trunc(Math.max(1, turnNumber))) % 3;
			if (canInitiate && initiationSlot && initiationRoll === 0) {
				const initiation = role.includes('merchant')
					? entity.name + ' calls out to you, inviting you to look over the wares.'
					: role.includes('shady contact')
						? entity.name + ' catches your eye and quietly beckons you over, keeping a folded map close.'
						: role.includes('guild challenger')
							? entity.name + ' turns from the disputed contract and challenges you to explain what business you have here.'
							: entity.name + ' approaches with a cautious question about the road ahead.';
				events.push({
					id: deterministicId('npc_initiated_interaction', locationId, entity.id, turnNumber),
					type: 'NPC_INITIATED_INTERACTION',
					summary: initiation,
					locationId,
					source: 'WORLD_ACTIVITY_DIRECTOR',
					entityId: entity.id,
				});
			}
		}
		return events.slice(0, 8);
	}
}
