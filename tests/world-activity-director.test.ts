import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldActivityDirector } from '../server/domain/worldActivityDirector';
import { hashStringToSeed } from '../server/domain/deterministicRng';
import { CombatEncounterService } from '../server/domain/combatEncounterService';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function makeRepository(location: any) {
	const cards = new Map<string, any>();
	let hour = 12;
	return {
		cards,
		setHour: (value: number) => { hour = value; },
		repository: {
			getGeographyGraph: () => ({ getNode: (id: string) => id === location.id ? location : undefined }),
			getWorldClock: () => ({ getTimestamp: () => ({ hour }) }),
			getEntityCards: (_storyId: string, query: any = {}) => Array.from(cards.values()).filter((card: any) =>
				(!query.status || card.lifecycle?.status === query.status) &&
				(!query.kind || card.kind === query.kind)
			),
			getEntityCard: (_storyId: string, id: string) => cards.get(id) || null,
			saveEntityCard: (_storyId: string, card: any) => {
				cards.set(card.id, { ...card });
				return { ...card };
			},
			getStoryRun: () => null,
			saveStoryRun: () => undefined,
		} as any,
	};
}

test('WorldActivityDirector creates deterministic ambient people for an inhabited public location', () => {
	const { repository, cards } = makeRepository({
		id: 'loc_market', name: 'Sunrise Market', description: 'A busy open market.',
		population: { status: 'INHABITED', expectedPopulation: 'MODERATE', provenance: 'AUTHORED' },
	});
	const first = WorldActivityDirector.ensureAmbientPopulation(repository, 'story_activity_test', 'loc_market');
	const second = WorldActivityDirector.ensureAmbientPopulation(repository, 'story_activity_test', 'loc_market');

	assert.equal(first.length, 3);
	assert.equal(second.length, 0, 'repeated turns must not duplicate ambient people');
	assert.equal(cards.size, 3);
	assert.ok(first.some((person: any) => person.kind === 'MERCHANT'));
	assert.ok(first.every((person: any) => person.worldState.locationId === 'loc_market'));
	assert.ok(first.every((person: any) => person.worldState.isAlive && person.worldState.presence === 'present'));
});

test('WorldActivityDirector does not populate authored abandoned or restricted locations', () => {
	for (const status of ['ABANDONED', 'RESTRICTED']) {
		const { repository, cards } = makeRepository({
			id: 'loc_closed', name: 'Closed Citadel', description: 'A citadel.',
			population: { status, expectedPopulation: 'DENSE', provenance: 'AUTHORED' },
		});
		assert.deepEqual(WorldActivityDirector.ensureAmbientPopulation(repository, 'story_closed', 'loc_closed'), []);
		assert.equal(cards.size, 0);
	}
});

test('WorldActivityDirector does not treat arbitrary UNKNOWN occupancy as proof of a settlement', () => {
	const { repository, cards } = makeRepository({
		id: 'loc_ruin', name: 'Silent Ruin', description: 'Broken stone and wind.',
		population: { status: 'UNKNOWN', provenance: 'UNKNOWN' },
	});
	assert.deepEqual(WorldActivityDirector.ensureAmbientPopulation(repository, 'story_unknown', 'loc_ruin'), []);
	assert.equal(cards.size, 0);
});

test('WorldActivityDirector can seed a public citadel with unknown occupancy without declaring it abandoned', () => {
	const { repository, cards } = makeRepository({
		id: 'loc_citadel', name: 'Elysium Solar Citadel', description: 'A vast citadel of pale stone.',
		population: { status: 'UNKNOWN', provenance: 'UNKNOWN' },
	});
	const people = WorldActivityDirector.ensureAmbientPopulation(repository, 'story_citadel', 'loc_citadel');
	assert.equal(people.length, 2);
	assert.equal(cards.size, 2);
	assert.ok(people.every((person: any) => person.metadata.ambientPopulation === true));
});

test('WorldActivityDirector projects local activities as grounded scene events only', () => {
	const events = WorldActivityDirector.buildAmbientEvents([
		{ id: 'merchant-1', name: 'Mira Fen', kind: 'MERCHANT', locationId: 'loc_market', currentActivity: 'calling out wares to passersby', visibleToPlayer: true },
		{ id: 'guard-1', name: 'A Guard', kind: 'NPC', locationId: 'loc_market', currentActivity: 'patrolling the gate', visibleToPlayer: true },
		{ id: 'bully-1', name: 'A Racial Bully', kind: 'NPC', role: 'racial bully', locationId: 'loc_market', currentActivity: 'taunting a traveller over their lineage', visibleToPlayer: true },
		{ id: 'off-duty-1', name: 'Off-Duty Merchant', kind: 'NPC', role: 'merchant', locationId: 'loc_market', currentActivity: 'resting away from the market', presence: 'absent', isAlive: true, visibleToPlayer: true },
		{ id: 'dead-1', name: 'Dead Guard', kind: 'NPC', role: 'guard', locationId: 'loc_market', currentActivity: 'patrolling the gate', presence: 'present', isAlive: false, visibleToPlayer: true },
		{ id: 'hidden-1', name: 'Hidden Stranger', kind: 'NPC', locationId: 'loc_market', currentActivity: 'watching silently', visibleToPlayer: false },
		{ id: 'away-1', name: 'A Traveller', kind: 'NPC', locationId: 'loc_inn', currentActivity: 'packing a bag', visibleToPlayer: true },
	], 'loc_market');

	assert.equal(events.length, 3);
	assert.ok(events.some((event) => event.type === 'SOCIAL_OPPORTUNITY' && event.entityId === 'merchant-1'));
	assert.ok(events.some((event) => event.type === 'POTENTIAL_ENCOUNTER' && event.entityId === 'bully-1'));
	assert.ok(events.every((event) => event.locationId === 'loc_market'));
	assert.ok(!events.some((event) => ['hidden-1', 'away-1', 'off-duty-1', 'dead-1'].includes(event.entityId || '')));
});

test('WorldActivityDirector supports deterministic robbery and kidnapping encounters in alleys', () => {
	for (const variant of [0, 1]) {
		let storyId = 'story_alley_' + variant;
		let attempts = 0;
		while (hashStringToSeed(storyId + '|loc_alley') % 8 !== variant && attempts < 100) {
			storyId = 'story_alley_' + variant + '_' + attempts;
			attempts++;
		}
		assert.ok(attempts < 100, 'a deterministic scenario seed should be found');
		const { repository } = makeRepository({
			id: 'loc_alley', name: 'Lantern Alley', description: 'A narrow alley behind the market.',
			population: { status: 'UNKNOWN', provenance: 'UNKNOWN' },
		});
		const people = WorldActivityDirector.ensureAmbientPopulation(repository, storyId, 'loc_alley');
		assert.equal(people.length, 2);
		const roles = people.map((person: any) => person.classification.role);
		if (variant === 0) {
			assert.ok(roles.includes('alley robber'));
			assert.ok(roles.includes('robbery victim'));
		} else {
			assert.ok(roles.includes('kidnapper'));
			assert.ok(roles.includes('kidnapping target'));
		}
		assert.ok(people.every((person: any) => person.worldState.locationId === 'loc_alley'));
	}
});

test('WorldActivityDirector supplies guild and inn social encounter archetypes without forcing a fight or quest', () => {
	let guildStoryId = 'story_guild';
	while (hashStringToSeed(guildStoryId + '|loc_guild') % 3 !== 0) guildStoryId += '_x';
	const guild = makeRepository({
		id: 'loc_guild', name: 'Adventurers Guild', description: 'A public guild hall.',
		population: { status: 'UNKNOWN', provenance: 'UNKNOWN' },
	});
	const guildPeople = WorldActivityDirector.ensureAmbientPopulation(guild.repository, guildStoryId, 'loc_guild');
	assert.ok(guildPeople.some((person: any) => person.classification.role === 'guild challenger'));
	assert.ok(guildPeople.some((person: any) => person.currentActivity || person.worldState.currentActivity));

	let innStoryId = 'story_inn';
	while (hashStringToSeed(innStoryId + '|loc_inn') % 5 !== 0) innStoryId += '_x';
	const inn = makeRepository({
		id: 'loc_inn', name: 'The Silver Lantern Inn', description: 'A public inn.',
		population: { status: 'UNKNOWN', provenance: 'UNKNOWN' },
	});
	const innPeople = WorldActivityDirector.ensureAmbientPopulation(inn.repository, innStoryId, 'loc_inn');
	assert.ok(innPeople.some((person: any) => person.classification.role === 'shady contact'));
	assert.ok(innPeople.some((person: any) => person.worldState.currentGoal));
});

test('WorldActivityDirector changes ambient routines with world time and restores them without duplication', () => {
	const { repository, cards, setHour } = makeRepository({
		id: 'loc_market', name: 'Sunrise Market', description: 'A busy open market.',
		population: { status: 'INHABITED', expectedPopulation: 'MODERATE', provenance: 'AUTHORED' },
	});
	WorldActivityDirector.ensureAmbientPopulation(repository, 'story_daily_routine', 'loc_market');
	assert.equal(cards.size, 3);
	const merchant = Array.from(cards.values()).find((card: any) => card.classification.role === 'merchant');
	assert.ok(merchant);
	assert.equal(merchant.worldState.presence, 'present');
	assert.match(merchant.worldState.currentActivity, /calling out wares/);

	setHour(23);
	WorldActivityDirector.ensureAmbientPopulation(repository, 'story_daily_routine', 'loc_market');
	const nightMerchant = cards.get(merchant.id);
	assert.equal(nightMerchant.worldState.presence, 'absent');
	assert.match(nightMerchant.worldState.currentActivity, /resting away/);
	assert.equal(cards.size, 3, 'off-duty NPCs must not be duplicated');

	setHour(10);
	WorldActivityDirector.ensureAmbientPopulation(repository, 'story_daily_routine', 'loc_market');
	const dayMerchant = cards.get(merchant.id);
	assert.equal(dayMerchant.worldState.presence, 'present');
	assert.match(dayMerchant.worldState.currentActivity, /calling out wares/);
	assert.equal(cards.size, 3);
});

test('CombatEncounterService recognizes intervention actions for active crimes', () => {
	const service = new CombatEncounterService();
	assert.equal(service.isHostileAction('I tackle the robber to stop the robbery'), true);
	assert.equal(service.isHostileAction('I punch the kidnapper'), true);
	assert.equal(service.isHostileAction('I stop the kidnapping and rescue the victim'), false, 'non-attack rescue actions must use the ordinary action/check path');
	assert.equal(service.isHostileAction('I ask the merchant about the price'), false);
});

test('WorldActivityDirector allows visible NPCs to initiate occasional, grounded interactions', () => {
	const merchant = { id: 'merchant-init', name: 'Mira Fen', kind: 'MERCHANT', role: 'merchant', locationId: 'loc_market', currentActivity: 'calling out wares to passersby', visibleToPlayer: true };
	let qualifyingTurn = 5;
	while (qualifyingTurn < 200 && hashStringToSeed(merchant.id + '|init|' + qualifyingTurn) % 3 !== 0) qualifyingTurn += 5;
	assert.ok(qualifyingTurn < 200, 'a deterministic interaction turn should be found');
	const events = WorldActivityDirector.buildAmbientEvents([merchant], 'loc_market', qualifyingTurn);
	assert.ok(events.some((event) => event.type === 'NPC_INITIATED_INTERACTION' && /calls out to you/i.test(event.summary)));

	const hiddenEvents = WorldActivityDirector.buildAmbientEvents([
		{ ...merchant, visibleToPlayer: false },
	], 'loc_market', qualifyingTurn);
	assert.equal(hiddenEvents.length, 0, 'hidden NPCs must not initiate player-visible interactions');
});

test('WorldActivityDirector persists generated NPCs in the story runtime entity registry', () => {
	const storyId = 'story_ambient_persistence';
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const geography = repository.getGeographyGraph(storyId);
	const base = geography.getNode('loc_whispering_orrery');
	assert.ok(base);
	geography.addNode({
		...base!,
		id: 'loc_persistent_market',
		name: 'Persistent Market',
		description: 'A public market with daily trade.',
		population: { status: 'INHABITED', expectedPopulation: 'SPARSE', provenance: 'AUTHORED' },
	});
	repository.saveStoryRun({
		storyId,
		id: storyId,
		worldId: 'world_solar_archive',
		characterName: 'Test Adventurer',
		storyMode: 'PROTAGONIST',
		currentLocationId: 'loc_persistent_market',
		startingLocationId: 'loc_persistent_market',
		canonicalEvents: [],
	} as any);

	const created = WorldActivityDirector.ensureAmbientPopulation(repository, storyId, 'loc_persistent_market');
	assert.equal(created.length, 1);
	const run = repository.getStoryRun(storyId);
	assert.ok(run?.runtimeState?.entities?.cards?.some((card: any) => card.id === created[0].id));
});


test('WorldActivityDirector varies public market NPC identities across story seeds but preserves them per story', () => {
	const rosterFor = (storyId: string) => {
		const { repository } = makeRepository({
			id: 'loc_market', name: 'Sunrise Market', description: 'A busy open market.',
			population: { status: 'INHABITED', expectedPopulation: 'MODERATE', provenance: 'AUTHORED' },
		});
		return WorldActivityDirector.ensureAmbientPopulation(repository, storyId, 'loc_market')
			.map((person: any) => ({ id: person.id, name: person.name, role: person.classification.role }));
	};
	const first = rosterFor('market_roster_alpha');
	const sameStoryAgain = rosterFor('market_roster_alpha');
	assert.deepEqual(sameStoryAgain, first, 'the same story/location must reproduce the same roster');
	const alternatives = ['market_roster_beta', 'market_roster_gamma', 'market_roster_delta', 'market_roster_epsilon']
		.map(rosterFor);
	assert.ok(alternatives.some((roster) => roster.map((person) => person.name).join('|') !== first.map((person) => person.name).join('|')),
		'different stories should not all receive the same fixed NPC roster');
});
