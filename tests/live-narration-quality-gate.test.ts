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
		playerAction: 'I throw my dagger at the guarded door.',
		actionResolution: resolution() as any,
		situation: situation() as any,
		intent: { action: 'attack', interactionMode: 'WORLD_ACTION', speechIntent: false } as any,
	});
	assert.equal(result.actionFidelity.valid, false);
	assert.ok(result.actionFidelity.missingConsequences.some(value => /guard/i.test(value) || /attention/i.test(value)));
	assert.equal(result.accepted, false);
});

test('live narration gate rejects a reaction when the physical object consequence is omitted', () => {
	const result = serverMockAuthority.evaluateLiveNarrativeQuality({
		narrativeText: 'The nearby guard’s attention snaps toward the sound; the Caste Enforcer reaches for his weapon.',
		playerAction: 'I throw my dagger at the guarded door.',
		actionResolution: resolution() as any,
		situation: situation() as any,
		intent: { action: 'attack', interactionMode: 'WORLD_ACTION', speechIntent: false } as any,
	});
	assert.equal(result.actionFidelity.valid, false);
	assert.ok(result.actionFidelity.missingConsequences.some(value => /dagger/i.test(value) || /lodges/i.test(value)));
	assert.equal(result.accepted, false);
});

test('multi-effect spell narration must cover every canonical visible consequence without mutating the resolution', () => {
	const spellResolution = {
		...resolution(),
		playerAction: 'I cast Fireball at two goblins beside dry brush.',
		attemptedEffect: 'cast Fireball at two goblins beside dry brush',
		actualEffect: 'Fireball detonates beside two goblins and dry brush.',
		physicalConsequences: [
			'The fireball engulfs the front goblin in flame.',
			'The blast sets the dry brush alight.',
		],
		playerVisibleConsequences: ['The shockwave knocks the second goblin prone.'],
	};
	const originalResolution = JSON.parse(JSON.stringify(spellResolution));
	const spellSituation = { ...situation(), nearbyEntities: [
		{ id: 'goblin_1', name: 'Front Goblin', visibleToPlayer: true },
		{ id: 'goblin_2', name: 'Second Goblin', visibleToPlayer: true },
		{ id: 'brush_1', name: 'Dry Brush', visibleToPlayer: true },
	] };
	const intent = { action: 'cast_spell', interactionMode: 'WORLD_ACTION', speechIntent: false } as any;
	const completeNarration = 'The fireball engulfs the front goblin in flame. The blast sets the dry brush alight, and smoke curls upward. The shockwave knocks the second goblin prone.';
	const complete = serverMockAuthority.evaluateLiveNarrativeQuality({
		narrativeText: completeNarration, playerAction: spellResolution.playerAction,
		actionResolution: spellResolution as any, situation: spellSituation as any, intent,
	});
	assert.equal(complete.actionFidelity.valid, true);
	assert.deepEqual(complete.actionFidelity.missingConsequences, []);

	for (const [narrativeText, omitted] of [
		['The blast sets the dry brush alight, and smoke curls upward. The shockwave knocks the second goblin prone.', /engulfs/i],
		['The fireball engulfs the front goblin in flame. The shockwave knocks the second goblin prone.', /brush/i],
		['The fireball engulfs the front goblin in flame. The blast sets the dry brush alight, and smoke curls upward.', /shockwave/i],
	] as const) {
		const result = serverMockAuthority.evaluateLiveNarrativeQuality({
			narrativeText, playerAction: spellResolution.playerAction,
			actionResolution: spellResolution as any, situation: spellSituation as any, intent,
		});
		assert.equal(result.actionFidelity.valid, false);
		assert.ok(result.actionFidelity.missingConsequences.some(value => omitted.test(value)));
	}
	assert.deepEqual(spellResolution, originalResolution, 'Narrative quality evaluation must not mutate committed mechanics.');
});

test('Phase 1A: live narration gate accepts consequence-faithful human phrasing (knockdown/movement/collision without schema vocabulary)', () => {
	const combatResolution = {
		...resolution(),
		playerAction: 'I strike the Warden with Shockwave Palm',
		attemptedEffect: 'strike the Warden with Shockwave Palm',
		targetEntityIds: ['enemy_warden'],
		resolutionMethod: 'COMBAT',
		outcomeTier: 'SUCCESS_WITH_COST',
		actualEffect: 'Shockwave Palm: resolved successfully. Damage: 12. Applied condition: Prone. Target collided with Impassable obstacle for 2 collision damage.',
		physicalConsequences: [
			'Shockwave Palm: resolved successfully. Damage: 12. Applied condition: Prone. Target collided with Impassable obstacle for 2 collision damage.',
			'Applied condition: Prone.',
			'Target collided with Impassable obstacle for 2 collision damage.',
		],
		playerVisibleConsequences: ['Target enemy_warden remains at 23 HP.'],
	};
	const combatSituation = { ...situation(), nearbyEntities: [
		{ id: 'enemy_warden', name: 'Warden', visibleToPlayer: true },
	] };
	const combatIntent = { action: 'attack', interactionMode: 'COMBAT', speechIntent: false } as any;

	// Complete human narration: hit, forced movement + collision, prone — no schema words.
	const complete = serverMockAuthority.evaluateLiveNarrativeQuality({
		narrativeText: 'You drive your Shockwave Palm into the Warden’s breastplate, hurling him backward into the stone barrier and knocking him sprawling prone across the floor.',
		playerAction: combatResolution.playerAction,
		actionResolution: combatResolution as any,
		situation: combatSituation as any,
		intent: combatIntent,
	});
	assert.equal(complete.actionFidelity.valid, true);
	assert.deepEqual(complete.actionFidelity.missingConsequences, []);

	// Incomplete human narration: hit only — knockdown and collision are genuinely omitted.
	const incomplete = serverMockAuthority.evaluateLiveNarrativeQuality({
		narrativeText: 'You drive your Shockwave Palm into the Warden’s breastplate, bruising his ribs with the impact.',
		playerAction: combatResolution.playerAction,
		actionResolution: combatResolution as any,
		situation: combatSituation as any,
		intent: combatIntent,
	});
	assert.equal(incomplete.actionFidelity.valid, false);
	assert.ok(incomplete.actionFidelity.missingConsequences.some(value => /prone/i.test(value)));
	assert.ok(incomplete.actionFidelity.missingConsequences.some(value => /collided/i.test(value) || /obstacle/i.test(value)));
});
