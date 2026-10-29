import test from 'node:test';
import assert from 'node:assert/strict';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';

function situation() {
	return {
		storyId: 'live_gate_fixture',
		turnId: 'turn_3',
		worldId: 'world_fixture',
		worldTime: 'Cycle 42 • Month 10 • Day 14 • 17:42',
		worldTimestamp: { year: 1, month: 10, day: 14, hour: 17, minute: 42, second: 0, totalElapsedSeconds: 0 },
		player: {
			actorId: 'player_fixture',
			name: 'Vane',
			locationId: 'arena',
			currentActivity: 'infiltrating the arena',
			isTraveling: false,
			isDead: false,
			isTransformed: false,
			isPossessed: false,
			injuries: [],
			spatial: { proximityBand: 'SAME_LOCATION' },
		},
		location: {
			id: 'arena',
			name: 'The Grand Colosseum',
			region: 'Castigatia',
			description: 'A sand-and-iron arena.',
			ambientSensory: 'Heat and iron hang in the air.',
		},
		nearbyEntities: [
			{ id: 'guard_1', name: 'Caste Enforcer', visibleToPlayer: true },
			{ id: 'door_1', name: 'Guarded Door', visibleToPlayer: true },
		],
		visibleEvents: [],
		activeDialogue: undefined,
		relationships: [],
	};
}

function resolution() {
	return {
		resolutionId: 'resolution_3',
		storyId: 'live_gate_fixture',
		turnId: 'turn_3',
		playerAction: 'I throw my dagger at the guarded door.',
		playerIntent: {},
		attemptedEffect: 'strike the guarded door',
		targetEntityIds: ['door_1', 'guard_1'],
		resolutionMethod: 'DETERMINISTIC',
		outcomeTier: 'NO_CHECK',
		actualEffect: 'The dagger strikes the guarded door.',
		canonicalStateChanges: [],
		physicalConsequences: ['The dagger strikes and lodges in the guarded door.'],
		playerVisibleConsequences: ['The impact draws the nearby guard’s attention.'],
		evidenceIds: [],
		uncertainty: [],
		provenance: { source: 'CANONICAL_ENGINE' },
	};
}

test('live narration gate rejects scenery-only narration for an active action', () => {
	const result = serverMockAuthority.evaluateLiveNarrativeQuality({
		narrativeText: 'Basalt walls rise around the arena while heat shimmers above the sand and iron.',
		playerAction: 'I throw my dagger at the guarded door.',
		actionResolution: resolution() as any,
		situation: situation() as any,
		intent: { action: 'attack', interactionMode: 'WORLD_ACTION', speechIntent: false } as any,
	});
	assert.equal(result.actionFidelity.valid, false);
	assert.equal(result.accepted, false);
});

test('live narration gate rejects sound-only narration without a consequence beat', () => {
	const result = serverMockAuthority.evaluateLiveNarrativeQuality({
		narrativeText: 'The dagger flies across the arena and clangs against the guarded door.',
		playerAction: 'I throw my dagger at the guarded door.',
		actionResolution: resolution() as any,
		situation: situation() as any,
		intent: { action: 'attack', interactionMode: 'WORLD_ACTION', speechIntent: false } as any,
	});
	assert.equal(result.actionFidelity.valid, false);
	assert.equal(result.accepted, false);
});

test('live narration gate accepts an action with a concrete consequence and reaction', () => {
	const result = serverMockAuthority.evaluateLiveNarrativeQuality({
		narrativeText: 'The dagger strikes the guarded door and lodges deep in the wood. The impact catches the nearby guard’s attention; the Caste Enforcer turns sharply toward the impact, one hand leaving his weapon.',
		playerAction: 'I throw my dagger at the guarded door.',
		actionResolution: resolution() as any,
		situation: situation() as any,
		intent: { action: 'attack', interactionMode: 'WORLD_ACTION', speechIntent: false } as any,
	});
	assert.equal(result.actionFidelity.valid, true);
	assert.equal(result.accepted, true);
});


test('live narration gate rejects a physical result when a separate visible reaction is omitted', () => {
	const result = serverMockAuthority.evaluateLiveNarrativeQuality({
		narrativeText: 'The dagger strikes the guarded door and lodges deep in the wood. Splinters scatter around the blade.',
		playerAction: 'I throw my dagger at the guarded door.', actionResolution: resolution() as any,
		situation: situation() as any, intent: { action: 'attack', interactionMode: 'WORLD_ACTION', speechIntent: false } as any,
	});
	assert.equal(result.actionFidelity.valid, false);
	assert.ok(result.actionFidelity.missingConsequences.some(value => /guard/i.test(value) || /attention/i.test(value)));
	assert.equal(result.accepted, false);
});

test('live narration gate rejects a reaction when the physical object consequence is omitted', () => {
	const result = serverMockAuthority.evaluateLiveNarrativeQuality({
		narrativeText: 'The nearby guard’s attention snaps toward the sound; the Caste Enforcer reaches for his weapon.',
		playerAction: 'I throw my dagger at the guarded door.', actionResolution: resolution() as any,
		situation: situation() as any, intent: { action: 'attack', interactionMode: 'WORLD_ACTION', speechIntent: false } as any,
	});
	assert.equal(result.actionFidelity.valid, false);
	assert.ok(result.actionFidelity.missingConsequences.some(value => /dagger/i.test(value) || /lodges/i.test(value)));
	assert.equal(result.accepted, false);
});

test('multi-effect spell narration must cover every canonical visible consequence without mutating the resolution', () => {
	const spellResolution = {
		...resolution(), playerAction: 'I cast Fireball at two goblins beside dry brush.',
		attemptedEffect: 'cast Fireball at two goblins beside dry brush',
		actualEffect: 'Fireball detonates beside two goblins and dry brush.',
		physicalConsequences: ['The fireball engulfs the front goblin in flame.', 'The blast sets the dry brush alight.'],
		playerVisibleConsequences: ['The shockwave knocks the second goblin prone.'],
	};
	const originalResolution = JSON.parse(JSON.stringify(spellResolution));
	const spellSituation = { ...situation(), nearbyEntities: [
		{id:'goblin_1',name:'Front Goblin',visibleToPlayer:true},
		{id:'goblin_2',name:'Second Goblin',visibleToPlayer:true},
		{id:'brush_1',name:'Dry Brush',visibleToPlayer:true},
	]};
	const intent = { action: 'cast_spell', interactionMode: 'WORLD_ACTION', speechIntent: false } as any;
	const evaluate = (narrativeText: string) => serverMockAuthority.evaluateLiveNarrativeQuality({
		narrativeText, playerAction: spellResolution.playerAction, actionResolution: spellResolution as any,
		situation: spellSituation as any, intent,
	});
	const complete = evaluate('The fireball engulfs the front goblin in flame. The blast sets the dry brush alight, and smoke curls upward. The shockwave knocks the second goblin prone.');
	assert.equal(complete.actionFidelity.valid, true);
	assert.deepEqual(complete.actionFidelity.missingConsequences, []);
	const missingFirst = evaluate('The blast sets the dry brush alight, and smoke curls upward. The shockwave knocks the second goblin prone.');
	assert.equal(missingFirst.actionFidelity.valid, false);
	assert.ok(missingFirst.actionFidelity.missingConsequences.some(value => /engulfs/i.test(value)));
	const missingSecond = evaluate('The fireball engulfs the front goblin in flame. The shockwave knocks the second goblin prone.');
	assert.equal(missingSecond.actionFidelity.valid, false);
	assert.ok(missingSecond.actionFidelity.missingConsequences.some(value => /brush/i.test(value)));
	const missingThird = evaluate('The fireball engulfs the front goblin in flame. The blast sets the dry brush alight, and smoke curls upward.');
	assert.equal(missingThird.actionFidelity.valid, false);
	assert.ok(missingThird.actionFidelity.missingConsequences.some(value => /shockwave/i.test(value)));
	assert.deepEqual(spellResolution, originalResolution, 'Narrative quality evaluation must not mutate committed mechanics.');
});
