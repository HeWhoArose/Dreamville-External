import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldActivityDirector } from '../server/domain/worldActivityDirector';

function makeRepository(location: any) {
	const cards = new Map<string, any>();
	return {
		cards,
		repository: {
			getGeographyGraph: () => ({ getNode: (id: string) => id === location.id ? location : undefined }),
			getEntityCards: (_storyId: string, query: any = {}) => Array.from(cards.values()).filter((card: any) =>
				(!query.status || card.lifecycle?.status === query.status) &&
				(!query.kind || card.kind === query.kind)
			),
			getEntityCard: (_storyId: string, id: string) => cards.get(id) || null,
			saveEntityCard: (_storyId: string, card: any) => {
				cards.set(card.id, { ...card });
				return { ...card };
			},
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
		{ id: 'hidden-1', name: 'Hidden Stranger', kind: 'NPC', locationId: 'loc_market', currentActivity: 'watching silently', visibleToPlayer: false },
		{ id: 'away-1', name: 'A Traveller', kind: 'NPC', locationId: 'loc_inn', currentActivity: 'packing a bag', visibleToPlayer: true },
	], 'loc_market');

	assert.equal(events.length, 2);
	assert.ok(events.some((event) => event.type === 'SOCIAL_OPPORTUNITY' && event.entityId === 'merchant-1'));
	assert.ok(events.every((event) => event.locationId === 'loc_market'));
	assert.ok(!events.some((event) => event.entityId === 'hidden-1' || event.entityId === 'away-1'));
});
