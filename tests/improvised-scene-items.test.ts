import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SceneInteractionAuthority } from '../server/domain/sceneInteractionAuthority';
import { dropDefeatedActorLoot } from '../server/domain/lootDrop';
import { worldRepository } from '../server/repositories/worldRepository';

function setup(env: Record<string, unknown>, sceneObjects: unknown[] = []) {
	const storyId = `improv_${Date.now()}_${Math.random().toString(36).slice(2)}`;
	worldRepository.seedStory(storyId);
	const locationId = 'loc_test';
	worldRepository.getGeographyGraph(storyId).addNode({
		id: locationId, name: 'Test Ground', description: 'A place.', archetype: 'WILDERNESS',
		environment: { features: [], ...env }, sceneObjects,
	} as any);
	return { storyId, locationId, actorId: 'hero' };
}
const act = (c: ReturnType<typeof setup>, actionText: string) =>
	SceneInteractionAuthority.resolve({ repository: worldRepository, storyId: c.storyId, actorId: c.actorId, locationId: c.locationId, actionText });

const BRANCH = { key: 'branch', sources: ['branch', 'tree', 'limb'], name: 'Heavy Branch', description: 'A stout branch snapped from the tree.', category: 'Weapon', maxDurability: 12, attackBonus: 1, limit: 2 };

describe('improvised scene items', () => {
	it('lets a scene that allows it turn a branch into a wieldable weapon', () => {
		const c = setup({ improvisable: [BRANCH] });
		const result = act(c, 'I snap a branch off the tree');
		assert.equal(result.committed, true, result.feedback);
		const inv = worldRepository.getInventoryEngine(c.storyId);
		const item = inv.getActorInventory(c.actorId).find((i) => i.name === 'Heavy Branch')!;
		assert.ok(item, 'the branch is in inventory');
		assert.equal(item.maxDurability, 12);
		assert.equal(inv.equipItem(c.actorId, item.id, 'mainHand').success, true);
		assert.equal(inv.getEquipmentModifiers(c.actorId)[0]?.value, 1);
	});

	it('is capped by the scene limit and then refuses', () => {
		const c = setup({ improvisable: [BRANCH] });
		assert.equal(act(c, 'I snap a branch off the tree').committed, true);
		assert.equal(act(c, 'I snap another branch off the tree').committed, true);
		const third = act(c, 'I snap one more branch off the tree');
		assert.equal(third.committed, false);
		assert.match(third.feedback || '', /nothing more here/i);
	});

	it('does not conjure weapons in a scene that does not allow them', () => {
		const c = setup({});
		const result = act(c, 'I snap a branch off the tree');
		assert.equal(result.committed, false);
		assert.equal(worldRepository.getInventoryEngine(c.storyId).getActorInventory(c.actorId).length, 0);
	});

	it('does not offer sources the scene never authored', () => {
		const c = setup({ improvisable: [BRANCH] });
		const result = act(c, 'I pull a sword from the rubble');
		assert.equal(result.committed, false);
	});

	it('picks up a scattered broken weapon in its broken condition', () => {
		const c = setup({}, [{
			id: 'obj_broken_spear', name: 'Broken Spear', kind: 'ITEM', description: 'A snapped spear.', visible: true, interactable: true,
			tags: ['weapon'], properties: { takeable: true, itemCategory: 'Weapon', maxDurability: 20, durabilityFraction: 0, attackBonus: 4 },
		}]);
		assert.equal(act(c, 'I grab the broken spear').committed, true);
		const inv = worldRepository.getInventoryEngine(c.storyId);
		const spear = inv.getActorInventory(c.actorId).find((i) => i.name === 'Broken Spear')!;
		assert.equal(spear.isBroken, true);
		assert.equal(inv.equipItem(c.actorId, spear.id, 'mainHand').success, true, 'broken gear can still be wielded');
		assert.equal(inv.getEquipmentModifiers(c.actorId)[0]?.value, 1, 'but only a quarter of its +4');
	});

	it('lets the player pick up what a defeated enemy dropped, equipped gear included', () => {
		const c = setup({});
		const inv = worldRepository.getInventoryEngine(c.storyId);
		inv.seedFromGenesisEquipment('rival', {
			equipped: [{ id: 'r_axe', name: 'Rival Axe', category: 'Weapon', isEquipped: true, slot: 'mainHand', quantity: 1, rarity: 'Common', properties: {}, provenance: 'CHARACTER_GENESIS' }],
		});
		dropDefeatedActorLoot(inv, 'rival', c.locationId);
		assert.equal(act(c, 'I pick up the rival axe').committed, true);
		assert.ok(inv.getActorInventory(c.actorId).some((i) => i.name === 'Rival Axe'));
	});
});
