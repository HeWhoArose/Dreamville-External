import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { applyWorldPack, loadWorldPack, validateWorldPack } from '../server/domain/worldPack';
import { SceneInteractionAuthority } from '../server/domain/sceneInteractionAuthority';
import { dropDefeatedActorLoot } from '../server/domain/lootDrop';

const PACK = 'data/worlds/ashen_cup.pack.json';

async function build(storyId: string) {
	const pack = loadWorldPack(PACK);
	const repo = new InMemoryWorldRepository({ disablePersistence: true });
	const { preparation } = await applyWorldPack(repo, storyId, pack);
	const player = repo.getPlayerLifecycle(storyId)!;
	const act = (locationId: string, actionText: string) =>
		SceneInteractionAuthority.resolve({ repository: repo, storyId, actorId: player.actorId, locationId, actionText });
	return { pack, repo, preparation, player, act };
}

test('the Ashen Cup pack passes its completeness checks and needs no investigation', async () => {
	assert.deepEqual(validateWorldPack(loadWorldPack(PACK)), []);
	const { preparation } = await build('cup_prep');
	assert.equal(preparation, 'NOT_APPLICABLE');
});

test('the player starts in the waiting room with fighters to talk to', async () => {
	const { repo, player } = await build('cup_start');
	assert.equal(player.locationId, 'loc_fighters_hold');
	const inHold = repo.getEntityCards('cup_start').filter((c: any) => c.kind === 'NPC' && c.worldState?.locationId === 'loc_fighters_hold');
	assert.ok(inHold.length >= 4, `expected 4+ fighters in the hold, got ${inHold.length}`);
});

test('three bouts are scheduled on the world clock and bout three forfeits if missed', async () => {
	const { repo } = await build('cup_events');
	const sim = repo.getLivingWorldSimulation('cup_events');
	const now = repo.getWorldClock('cup_events').getTimestamp();
	assert.equal(sim.getScheduledEvents().length, 3);
	assert.deepEqual(sim.evaluateScheduledEvents(now).triggeredEvents, [], 'nothing is due at the start');

	const clock = repo.getWorldClock('cup_events');
	clock.advanceMinutes(45);
	const mid = sim.evaluateScheduledEvents(clock.getTimestamp());
	assert.deepEqual(mid.triggeredEvents.map((e) => e.id).sort(), ['evt_bout_one', 'evt_bout_three', 'evt_bout_two']);
	clock.advanceMinutes(30);
	const late = sim.evaluateScheduledEvents(clock.getTimestamp());
	assert.deepEqual(late.missedEvents.map((e) => e.id), ['evt_bout_three'], 'bout three lapses past its deadline; bouts without a deadline never do');
});

test('the armoury issues weapons that can be wielded', async () => {
	const { repo, player, act } = await build('cup_armoury');
	assert.equal(act('loc_armoury_cage', 'I take the house gladius').committed, true);
	const inv = repo.getInventoryEngine('cup_armoury');
	const sword = inv.getActorInventory(player.actorId).find((i) => i.name === 'House Gladius')!;
	assert.equal(inv.equipItem(player.actorId, sword.id, 'mainHand').success, true);
	assert.ok(inv.getEquipmentModifiers(player.actorId).some((m) => m.target === 'combat.attackBonus' && m.value === 2));
});

test('weapons scattered in the pit come in their real condition', async () => {
	const { repo, player, act } = await build('cup_pit');
	assert.equal(act('loc_weapon_pit', 'I grab the snapped sword').committed, true);
	assert.equal(act('loc_weapon_pit', 'I grab the cracked spear').committed, true);
	const inv = repo.getInventoryEngine('cup_pit');
	const mine = inv.getActorInventory(player.actorId);
	assert.equal(mine.find((i) => i.name === 'Snapped Sword')?.isBroken, true);
	const spear = mine.find((i) => i.name === 'Cracked Spear')!;
	assert.equal(spear.isBroken, false);
	assert.equal(spear.durability, 12, '30% of 40');
});

test('the scene lets you improvise from rubble and a bench, but not from nothing', async () => {
	const { repo, player, act } = await build('cup_improv');
	assert.equal(act('loc_broken_colonnade', 'I pull a broken shaft from the rubble').committed, true);
	assert.equal(act('loc_fighters_hold', 'I break a leg off the bench').committed, true);
	const names = repo.getInventoryEngine('cup_improv').getActorInventory(player.actorId).map((i) => i.name);
	assert.ok(names.includes('Broken Shaft') && names.includes('Bench Leg'), names.join(', '));
	assert.equal(act('loc_ring_gate', 'I snap a branch off the tree').committed, false, 'no improvisable profile in the tunnel');
});

test('defeating Gravus drops his champion gear where he fell and it can be taken', async () => {
	const { repo, player, act } = await build('cup_drop');
	const inv = repo.getInventoryEngine('cup_drop');
	assert.equal(inv.getEquippedItems('npc_gravus_thorne').length, 3, 'he starts armed and armoured');
	dropDefeatedActorLoot(inv, 'npc_gravus_thorne', 'loc_arena_sand');
	assert.equal(inv.getActorInventory('npc_gravus_thorne').length, 0);
	assert.equal(act('loc_arena_sand', "I take the champion's broadsword").committed, true);
	assert.ok(inv.getActorInventory(player.actorId).some((i) => i.name === "Champion's Broadsword"));
});
