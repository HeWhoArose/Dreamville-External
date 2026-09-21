import assert from 'node:assert/strict';
import test from 'node:test';

import { Dnd521RulesetAdapter, TacticalCombatEngine } from '../server/domain/combatEngine';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';

function actor(overrides: Partial<Parameters<TacticalCombatEngine['addParticipant']>[0]> = {}) {
	return {
		id: 'hero',
		name: 'Hero',
		x: 0,
		y: 0,
		initiative: 20,
		team: 'player_allies' as const,
		hpCurrent: 30,
		hpMax: 30,
		armorClass: 12,
		speedCells: 6,
		attackBonus: 8,
		damageFormula: '1d6+2',
		conditions: [],
		saveModifiers: { STR: 2, DEX: 2 },
		isDead: false,
		...overrides,
	};
}

test('Phase 5: multiple eligible opportunity attackers resolve deterministically and consume each Reaction', () => {
	const engine = new TacticalCombatEngine(1337);
	engine.addParticipant(actor());
	engine.addParticipant(actor({ id: 'enemy_b', name: 'Enemy B', x: 1, y: 1, team: 'enemies', initiative: 10, attackBonus: 20 }));
	engine.addParticipant(actor({ id: 'enemy_a', name: 'Enemy A', x: 0, y: 1, team: 'enemies', initiative: 9, attackBonus: 20 }));
	engine.rollInitiative();

	assert.equal(engine.moveActor('hero', 3, 0).success, true);
	assert.equal(engine.getTurnResources('enemy_a')?.reactionAvailable, false);
	assert.equal(engine.getTurnResources('enemy_b')?.reactionAvailable, false);

	const reactions = engine.getBattleEvents().filter((event) => (event.metadata as any)?.reaction === true);
	assert.equal(reactions.length, 2);
	assert.deepEqual(reactions.map((event) => event.actorId).sort(), ['enemy_a', 'enemy_b']);
});

test('Phase 5: Ready Action consumes Action, fires on its configured trigger, and consumes Reaction', () => {
	const engine = new TacticalCombatEngine(1337);
	engine.addParticipant(actor());
	engine.addParticipant(actor({ id: 'enemy', name: 'Enemy', x: 3, y: 0, team: 'enemies', initiative: 10 }));
	engine.rollInitiative();

	assert.equal(engine.armReadyAction('hero', 'Attack', 'When enemy moves', {
		triggerType: 'ACTOR_MOVED',
		triggerActorId: 'enemy',
		targetId: 'enemy',
	}).success, true);
	assert.equal(engine.getTurnResources('hero')?.actionAvailable, false);

	// Make the enemy the active actor without granting the hero a new turn.
	engine.advanceTurn();
	assert.equal(engine.getCurrentActor()?.id, 'enemy');
	assert.equal(engine.moveActor('enemy', 4, 0).success, true);

	assert.equal(engine.getTurnResources('hero')?.reactionAvailable, false);
	assert.equal(engine.getTurnResources('hero')?.readyAction, undefined);
	assert.ok(engine.getBattleEvents().some((event) => (event.metadata as any)?.reason === 'Ready Action trigger.'));
});

test('Phase 5: movement validates the traversed path and difficult terrain cost', () => {
	const engine = new TacticalCombatEngine(1337);
	engine.addParticipant(actor({ speedCells: 6 }));
	engine.addParticipant(actor({ id: 'enemy', x: 20, y: 20, team: 'enemies', initiative: 1 }));
	engine.addObstacle({ x: 2, y: 0, isImpassable: true });
	engine.rollInitiative();

	assert.equal(engine.moveActor('hero', 3, 0).success, false);

	const terrainEngine = new TacticalCombatEngine(1337);
	terrainEngine.addParticipant(actor({ speedCells: 4 }));
	terrainEngine.addParticipant(actor({ id: 'enemy', x: 20, y: 20, team: 'enemies', initiative: 1 }));
	terrainEngine.addHazard({ id: 'ice', type: 'ice_patch', x: 1, y: 0, radiusCells: 0, durationTurns: 5, damagePerTurn: 0 });
	terrainEngine.rollInitiative();
	assert.equal(terrainEngine.moveActor('hero', 4, 0).success, false);
});

test('Phase 5: Grapple and Shove are canonical Action-consuming control effects', () => {
	const engine = new TacticalCombatEngine(1337);
	engine.addParticipant(actor({ saveModifiers: { STR: 8 } }));
	engine.addParticipant(actor({ id: 'enemy', name: 'Enemy', x: 1, y: 0, team: 'enemies', initiative: 1, saveModifiers: { STR: -10 } }));
	engine.rollInitiative();

	const grapple = engine.executeGrapple('hero', 'enemy');
	assert.equal(grapple.success, true);
	assert.equal(grapple.applied, true);
	assert.ok(engine.getParticipant('enemy')?.conditions.includes('Grappled'));

	engine.advanceTurn();
	engine.advanceTurn();
	assert.equal(engine.getCurrentActor()?.id, 'hero');

	const shove = engine.executeShove('hero', 'enemy', true);
	assert.equal(shove.success, true);
	assert.equal(shove.applied, true);
	assert.ok(engine.getParticipant('enemy')?.conditions.includes('Prone'));
});

test('Phase 5: Grappled creatures can spend an Action to escape using the grapple escape DC', () => {
	const engine = new TacticalCombatEngine(1337);
	engine.addParticipant(actor({ saveModifiers: { STR: 20 } }));
	engine.addParticipant(actor({ id: 'enemy', name: 'Enemy', x: 1, y: 0, team: 'enemies', initiative: 1, saveModifiers: { STR: -10 } }));
	engine.rollInitiative();

	assert.equal(engine.executeGrapple('hero', 'enemy').applied, true);
	engine.advanceTurn();
	assert.equal(engine.getCurrentActor()?.id, 'enemy');

	engine.updateParticipant('enemy', { saveModifiers: { STR: 25 } });
	const escape = engine.escapeGrapple('enemy', 'STR');
	assert.equal(escape.success, true);
	assert.equal(escape.escaped, true);
	assert.equal(engine.getParticipant('enemy')?.conditions.includes('Grappled'), false);
	assert.equal(engine.getParticipant('enemy')?.grappledBy, undefined);
});

test('Phase 5: cover modifies canonical attack defense and persists through export/import', () => {
	const engine = new TacticalCombatEngine(1337, new Dnd521RulesetAdapter());
	engine.addParticipant(actor());
	engine.addParticipant(actor({ id: 'enemy', name: 'Enemy', x: 1, y: 0, team: 'enemies', initiative: 1, armorClass: 10 }));
	engine.rollInitiative();

	assert.equal(engine.setCover('enemy', 'THREE_QUARTERS').success, true);
	assert.equal(engine.getCoverLevel('enemy'), 'THREE_QUARTERS');
	const before = engine.exportState();
	assert.equal(before.participants.find((p) => p.id === 'enemy')?.cover, 'THREE_QUARTERS');

	const restored = new TacticalCombatEngine();
	restored.importState(before);
	assert.equal(restored.getCoverLevel('enemy'), 'THREE_QUARTERS');
});

test('Phase 5: Total Cover blocks direct attacks without consuming the Action', () => {
	const engine = new TacticalCombatEngine(1337);
	engine.addParticipant(actor({ attackBonus: 20 }));
	engine.addParticipant(actor({ id: 'enemy', team: 'enemies', x: 1, y: 0, initiative: 1, cover: 'TOTAL' }));
	engine.rollInitiative();

	const result = engine.executeAttack('hero', 'enemy');
	assert.equal(result.success, false);
	assert.match(result.errorReason || '', /Total Cover/i);
	assert.equal(engine.getTurnResources('hero')?.actionAvailable, true);
});

test('Phase 5: opportunity attacks share normal attack condition modifiers', () => {
	const engine = new TacticalCombatEngine(1337);
	engine.addParticipant(actor());
	engine.addParticipant(actor({ id: 'enemy', name: 'Invisible Enemy', x: 0, y: 1, team: 'enemies', initiative: 10, attackBonus: 8, conditions: ['Invisible'] }));
	engine.rollInitiative();

	assert.equal(engine.moveActor('hero', 2, 0).success, true);
	const reaction = engine.getBattleEvents().find((event) => event.actionType === 'ATTACK' && (event.metadata as any)?.reaction === true);
	assert.ok(reaction);
	assert.equal(reaction?.rollRecord?.individualDice?.length, 2);
});

test('Phase 5: zero-HP combatants cannot move or provoke opportunity reactions', () => {
	const engine = new TacticalCombatEngine(1337);
	engine.addParticipant(actor({ hpCurrent: 0 }));
	engine.addParticipant(actor({ id: 'enemy', x: 1, y: 0, team: 'enemies', initiative: 1, attackBonus: 20 }));
	engine.rollInitiative();

	assert.equal(engine.moveActor('hero', 2, 0).success, false);
	assert.equal(engine.getTurnResources('enemy')?.reactionAvailable, true);
});

test('Phase 5: tactical combat respects the canonical rules profile', () => {
	const engine = new TacticalCombatEngine(1337);
	engine.setRulesProfile(rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND'));
	engine.addParticipant(actor());
	engine.addParticipant(actor({ id: 'enemy', team: 'enemies', x: 5, y: 0, initiative: 1 }));
	engine.rollInitiative();

	const result = engine.moveActor('hero', 1, 0);
	assert.equal(result.success, false);
	assert.match(result.errorReason || '', /disabled by the active rules profile/i);
});