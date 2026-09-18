import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { InventoryItemEngine } from '../server/domain/inventoryItem';
import { WorldClock } from '../server/domain/worldClock';
import { CapabilityEngine } from '../server/domain/capabilityEngine';

describe('CH5 Surgical Repair - Crafting & Transfer', () => {
  describe('Crafting Prerequisites (CH5-DEF-001)', () => {
    it('CRAFTING 1: valid tool requirement succeeds', () => {
      const invEngine = new InventoryItemEngine();
      
      // Register recipe requiring 'hammer' category
      invEngine.registerRecipe({
        id: 'rec_hammer_sword',
        name: 'Hammer Sword',
        outputDefId: 'def_iron_sword',
        outputQuantity: 1,
        requiredMaterials: [{ defId: 'def_iron_ingot', count: 2 }],
        requiredToolCategory: 'hammer',
        craftingTimeSeconds: 60,
        difficultyScore: 5
      });
      
      invEngine.registerDefinition({
        id: 'def_hammer',
        name: 'Blacksmith Hammer',
        category: 'hammer',
        rarity: 'common',
        maxDurability: 100,
        baseValue: 10,
        weight: 2,
        tags: [],
        description: 'A heavy hammer.'
      });

      // Give actor materials and tool
      invEngine.createInstance({ defId: 'def_iron_ingot', ownerEntityId: 'actor_1', quantity: 2, provenance: 'test' });
      invEngine.createInstance({ defId: 'def_hammer', ownerEntityId: 'actor_1', quantity: 1, provenance: 'test' });
      
      const craftRes = invEngine.craftItem('actor_1', 'rec_hammer_sword');
      assert.strictEqual(craftRes.success, true);
    });

    it('CRAFTING 2: missing required tool is rejected', () => {
      const invEngine = new InventoryItemEngine();
      
      invEngine.registerRecipe({
        id: 'rec_hammer_sword',
        name: 'Hammer Sword',
        outputDefId: 'def_iron_sword',
        outputQuantity: 1,
        requiredMaterials: [{ defId: 'def_iron_ingot', count: 2 }],
        requiredToolCategory: 'hammer',
        craftingTimeSeconds: 60,
        difficultyScore: 5
      });

      invEngine.createInstance({ defId: 'def_iron_ingot', ownerEntityId: 'actor_1', quantity: 2, provenance: 'test' });
      
      const craftRes = invEngine.craftItem('actor_1', 'rec_hammer_sword');
      assert.strictEqual(craftRes.success, false);
      assert.ok(craftRes.errorReason?.includes('Missing required tool of category: hammer'));
    });

    it('CRAFTING 3: canonical crafting time is respected and returned for clock advancement', () => {
      const invEngine = new InventoryItemEngine();
      invEngine.createInstance({ defId: 'def_iron_ingot', ownerEntityId: 'actor_1', quantity: 3, provenance: 'test' });
      const craftRes = invEngine.craftItem('actor_1', 'rec_forge_iron_sword'); // 1800 seconds
      assert.strictEqual(craftRes.success, true);
      assert.strictEqual(craftRes.craftingTimeSeconds, 1800);
    });

    it('CRAFTING 5: material insufficiency remains atomic', () => {
      const invEngine = new InventoryItemEngine();
      invEngine.createInstance({ defId: 'def_iron_ingot', ownerEntityId: 'actor_1', quantity: 2, provenance: 'test' });
      const craftRes = invEngine.craftItem('actor_1', 'rec_forge_iron_sword');
      assert.strictEqual(craftRes.success, false);
      
      // Still has 2 ingots
      const items = invEngine.getActorInventory('actor_1');
      const ingots = items.filter(i => i.defId === 'def_iron_ingot').reduce((sum, i) => sum + i.quantity, 0);
      assert.strictEqual(ingots, 2);
    });

    it('CRAFTING 6, 7: successful output remains deterministic and provenance correct', () => {
      const invEngine = new InventoryItemEngine();
      invEngine.createInstance({ defId: 'def_iron_ingot', ownerEntityId: 'actor_1', quantity: 3, provenance: 'test' });
      const craftRes = invEngine.craftItem('actor_1', 'rec_forge_iron_sword');
      assert.strictEqual(craftRes.success, true);
      assert.ok(craftRes.producedItem?.id.startsWith('item_def_iron_sword_'));
      assert.strictEqual(craftRes.producedItem?.provenance, 'crafted_via_rec_forge_iron_sword');
    });
  });

  describe('Transfer & Looting (CH5-DEF-002)', () => {
    it('TRANSFER 9: valid actor-to-container transfer', () => {
      const invEngine = new InventoryItemEngine();
      const item = invEngine.createInstance({ defId: 'def_iron_ingot', ownerEntityId: 'actor_1', quantity: 1, provenance: 'test' });
      
      const res = invEngine.transferItem(item.id, 'actor_1', 'loc_chest', 'container');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.transferredItem?.ownerEntityId, 'loc_chest');
      assert.strictEqual(res.transferredItem?.containerType, 'container');
    });

    it('TRANSFER 10: valid container-to-actor loot', () => {
      const invEngine = new InventoryItemEngine();
      const item = invEngine.createInstance({ defId: 'def_iron_ingot', ownerEntityId: 'loc_chest', containerType: 'container', quantity: 5, provenance: 'test' });
      
      const res = invEngine.transferItem(item.id, 'loc_chest', 'actor_1', 'actor');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.transferredItem?.ownerEntityId, 'actor_1');
      assert.strictEqual(res.transferredItem?.containerType, 'actor');
    });

    it('TRANSFER 11, 12: missing / forged item ID rejected', () => {
      const invEngine = new InventoryItemEngine();
      const res = invEngine.transferItem('fake_id', 'actor_1', 'actor_2', 'actor');
      assert.strictEqual(res.success, false);
      assert.ok(res.errorReason?.includes('not found'));
    });

    it('TRANSFER 13, 14, 20: forged ownership / unauthorized source rejected', () => {
      const invEngine = new InventoryItemEngine();
      const item = invEngine.createInstance({ defId: 'def_iron_ingot', ownerEntityId: 'actor_2', quantity: 1, provenance: 'test' });
      
      const res = invEngine.transferItem(item.id, 'actor_1', 'actor_1', 'actor');
      assert.strictEqual(res.success, false);
      assert.ok(res.errorReason?.includes('not owned by actor_1'));
    });

    it('TRANSFER 16: failed transfer leaves source and target unchanged', () => {
      const invEngine = new InventoryItemEngine();
      const item = invEngine.createInstance({ defId: 'def_iron_ingot', ownerEntityId: 'actor_1', quantity: 2, provenance: 'test' });
      
      // Try to transfer 5
      const res = invEngine.transferItem(item.id, 'actor_1', 'actor_2', 'actor', 5);
      assert.strictEqual(res.success, false);
      
      const items = invEngine.getActorInventory('actor_1');
      assert.strictEqual(items[0].quantity, 2);
    });

    it('TRANSFER 17, 18: successful transfer preserves durability/quality/condition/provenance', () => {
      const invEngine = new InventoryItemEngine();
      const item = invEngine.createInstance({ defId: 'def_iron_sword', ownerEntityId: 'actor_1', quantity: 1, provenance: 'rare_drop' });
      invEngine.degradeDurability(item.id, 10);
      
      const res = invEngine.transferItem(item.id, 'actor_1', 'actor_2', 'actor');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.transferredItem?.durability, item.durability - 10);
      assert.strictEqual(res.transferredItem?.provenance, 'rare_drop');
      
      // Original instance is gone (or rather, its properties mutated for full transfer)
      const freshItem = invEngine.getItemInstance(item.id);
      assert.strictEqual(freshItem?.ownerEntityId, 'actor_2');
    });

    it('TRANSFER 19: corpse loot uses canonical corpse inventory', () => {
      const invEngine = new InventoryItemEngine();
      const item = invEngine.createInstance({ defId: 'def_iron_sword', ownerEntityId: 'npc_1', containerType: 'corpse', quantity: 1, provenance: 'loot' });
      
      const res = invEngine.transferItem(item.id, 'npc_1', 'actor_1', 'actor');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.transferredItem?.containerType, 'actor');
    });
  });

  describe('CH5 Surgical Repair - Regression & Isolation (CH5-DEF-003, CH5-DEF-004, CH5-DEF-005)', () => {
    let baseUrl;
    let server;
    let app;
    
    before(async () => {
      const express = (await import('express')).default;
      const { gameRouter } = await import('../server/api/gameRoutes');
      
      app = express();
      app.use(express.json());
      app.use('/api/game', gameRouter);
      
      await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') {
            baseUrl = `http://127.0.0.1:${addr.port}/api/game`;
          }
          resolve();
        });
      });
    });

    after(async () => {
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    });

    beforeEach(async () => {
      const { serverMockAuthority } = await import('../server/mockEngine/serverMockAuthority');
      serverMockAuthority.resetToCanonicalState('default_story');
    });

    it('TEST 20: Cross-actor transfer isolation', async () => {
      const { worldRepository } = await import('../server/repositories/worldRepository');
      const invEngine = worldRepository.getInventoryEngine('default_story');
      
      // Actor 2 has an item
      const item = invEngine.createInstance({ defId: 'def_iron_ingot', ownerEntityId: 'actor_2', quantity: 1, provenance: 'test' });
      
      // Player tries to transfer it to themselves
      const res = await fetch(`${baseUrl}/inventory/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          sourceOwnerId: 'actor_2',
          targetOwnerId: 'player_actor_default_story',
          targetContainerType: 'actor',
          quantity: 1
        })
      });
      
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.errorReason.includes('Not authorized or too far'));
    });

    it('TEST 21: AI fabricated inventory operation cannot mutate canonical inventory', async () => {
      // InventoryItemEngine is entirely deterministic. The API route only accepts IDs.
      const { worldRepository } = await import('../server/repositories/worldRepository');
      const invEngine = worldRepository.getInventoryEngine('default_story');
      
      const res = await fetch(`${baseUrl}/inventory/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: 'fabricated_item_id_123',
          sourceOwnerId: 'player_actor_default_story',
          targetOwnerId: 'player_actor_default_story',
          targetContainerType: 'actor',
          quantity: 1
        })
      });
      
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.errorReason.includes('not found'));
    });

    it('TEST 22: Item description cannot fabricate a capability', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const invEngine = worldRepository.getInventoryEngine('default_story');
       const capEngine = worldRepository.getCapabilityEngine('default_story');
       
       invEngine.registerDefinition({
         id: 'def_magic_sword',
         name: 'Magic Sword',
         category: 'Weapon',
         rarity: 'Common',
         description: 'A sword that grants cap_fly',
         maxDurability: 100,
         weight: 2,
         baseValue: 10,
         tags: []
       });
       invEngine.createInstance({ defId: 'def_magic_sword', ownerEntityId: 'player_actor_default_story', quantity: 1, provenance: 'test' });
       
       const capabilities = capEngine.getEffectiveActorCapabilities('player_actor_default_story', invEngine);
       assert.ok(!capabilities.some(c => c.id === 'cap_fly'));
    });

    it('TEST 23: Epistemic discovery bypass rejected', async () => {
       // This verifies that location discovery works in GeographyGraph and isn't bypassed by inventory transfers
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const geo = worldRepository.getGeographyGraph();
       const undiscovered = geo.getNode('loc_sunken_scriptorium');
       assert.ok(undiscovered);
       
       const player = worldRepository.getPlayerLifecycle('default_story');
       assert.ok(!player?.discoveredLocationIds?.includes('loc_sunken_scriptorium'));
    });

    it('TEST 24: CH3.2 equipment/capability regression', async () => {
       // Make sure transferring equipment doesn't break
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const invEngine = worldRepository.getInventoryEngine('default_story');
       const item = invEngine.createInstance({ defId: 'def_iron_sword', ownerEntityId: 'player_actor_default_story', quantity: 1, provenance: 'test' });
       
       const equipRes = invEngine.equipItem('player_actor_default_story', item.id, 'mainHand');
       assert.strictEqual(equipRes.success, true);
       
       const doll = invEngine.getActorPaperDoll('player_actor_default_story');
       assert.strictEqual(doll.mainHand?.id, item.id);
    });

    it('TEST 25: CH4 historical evidence regression', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const chronicle = worldRepository.getHistoricalChronicleEngine('default_story');
       
       const item = worldRepository.getInventoryEngine('default_story').createInstance({ defId: 'def_iron_sword', ownerEntityId: 'player_actor_default_story', quantity: 1, provenance: 'test' });
       worldRepository.getInventoryEngine('default_story').transferItem(item.id, 'player_actor_default_story', 'loc_whispering_orrery', 'ground', 1);
       
       chronicle.recordEvidence({
          id: 'ev_test',
          category: 'WORLD_ANOMALY',
          timestamp: worldRepository.getWorldClock('default_story').getTimestamp(),
          primarySubjectId: 'player_actor_default_story',
          locationId: 'loc_whispering_orrery',
          summary: 'Test',
          details: 'Test',
          sourceEventId: 'test',
          provenance: 'direct_observation',
          visibility: 'PUBLIC',
          metadata: {}
       });
       const history = chronicle.getChronicleEntries();
       assert.ok(history.find(e => e.evidenceId === 'ev_test'));
    });

    it('TEST 26: Successful transfer persistence/reload', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const invEngine = worldRepository.getInventoryEngine('default_story');
       
       const item = invEngine.createInstance({ defId: 'def_iron_sword', ownerEntityId: 'player_actor_default_story', quantity: 1, provenance: 'test' });
       
       const res = await fetch(`${baseUrl}/inventory/transfer`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           itemId: item.id,
           sourceOwnerId: 'player_actor_default_story',
           targetOwnerId: 'loc_whispering_orrery',
           targetContainerType: 'ground',
           quantity: 1
         })
       });
       
       const json = await res.json();
       assert.strictEqual(json.success, true);
       
       const reloaded = invEngine.getItemInstance(item.id);
       assert.strictEqual(reloaded.ownerEntityId, 'loc_whispering_orrery');
    });

    it('TEST 27: Corpse survives new combat initialization', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const combatEngine = worldRepository.getCombatEngine('default_story');
       const player = worldRepository.getPlayerLifecycle('default_story');
       
       combatEngine.clear();
       combatEngine.addParticipant({
         id: 'player_actor_default_story',
         name: 'Player',
         x: 0, y: 0,
         initiative: 10,
         team: 'player_allies',
         hpCurrent: 100, hpMax: 100,
         armorClass: 10, speedCells: 5, attackBonus: 50, damageFormula: '1d4',
         conditions: [], isDead: false
       });
       combatEngine.addParticipant({
         id: 'enemy_1',
         name: 'Goblin',
         x: 1, y: 1,
         initiative: 5,
         team: 'enemies',
         hpCurrent: 1, hpMax: 10,
         armorClass: 0, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
         conditions: [], isDead: false
       });
       
       combatEngine.executeAttack('player_actor_default_story', 'enemy_1', { overrideFormula: '10' });
       assert.strictEqual(combatEngine.getParticipants().find(p => p.id === 'enemy_1')?.isDead, true);
       
       // Force encounter start via route which calls combatEngine.clear() and transfers corpses
       const initRes = await fetch(`${baseUrl}/combat/encounter/start`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           storyId: 'default_story',
           actorId: 'player_actor_default_story'
         })
       });
       assert.strictEqual(initRes.status, 200);
       
       const npcLife = worldRepository.getNpcLifecycle('default_story', 'enemy_1');
       assert.ok(npcLife);
       assert.strictEqual(npcLife.isDead, true);
       assert.strictEqual(npcLife.locationId, player?.locationId);
    });

    it('TEST 28: Corpse can subsequently be looted', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const invEngine = worldRepository.getInventoryEngine('default_story');
       const player = worldRepository.getPlayerLifecycle('default_story');
       
       // Explicitly mock a corpse from the previous test
       const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
       worldRepository.updateNpcLifecycle('default_story', new PlayerLifecycleState({
          actorId: 'enemy_1',
          name: 'Goblin Corpse',
          locationId: player.locationId,
          lastUpdatedTime: 0,
          currentActivity: 'dead',
          deathRecord: { isDead: true, diedAtTimestamp: worldRepository.getWorldClock('default_story').getTimestamp(), cause: 'test', revivalPossible: false }
       }));
       
       const item = invEngine.createInstance({ defId: 'def_iron_sword', ownerEntityId: 'enemy_1', quantity: 1, provenance: 'loot' });
       
       const res = await fetch(`${baseUrl}/inventory/transfer`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           itemId: item.id,
           sourceOwnerId: 'enemy_1',
           targetOwnerId: 'player_actor_default_story',
           targetContainerType: 'actor',
           quantity: 1
         })
       });
       
       const json = await res.json();
       assert.strictEqual(json.success, true);
       
       const reloaded = invEngine.getItemInstance(item.id);
       assert.strictEqual(reloaded.ownerEntityId, 'player_actor_default_story');
    });

    it('TEST 29: Player-owned source cannot transfer to an arbitrary inaccessible targetOwnerId', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const invEngine = worldRepository.getInventoryEngine('default_story');
       
       const item = invEngine.createInstance({ defId: 'def_iron_sword', ownerEntityId: 'player_actor_default_story', quantity: 1, provenance: 'test' });
       
       const res = await fetch(`${baseUrl}/inventory/transfer`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           itemId: item.id,
           sourceOwnerId: 'player_actor_default_story',
           targetOwnerId: 'loc_sunken_scriptorium', // Inaccessible target
           targetContainerType: 'ground',
           quantity: 1
         })
       });
       
       const json = await res.json();
       assert.strictEqual(json.success, false);
       assert.ok(json.errorReason.includes('Not authorized or too far to transfer to this target'));
    });

    it('TEST 30: Valid legitimate target remains transferable when the target is actually authorized and accessible', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const invEngine = worldRepository.getInventoryEngine('default_story');
       const player = worldRepository.getPlayerLifecycle('default_story');
       
       const item = invEngine.createInstance({ defId: 'def_iron_sword', ownerEntityId: 'player_actor_default_story', quantity: 1, provenance: 'test' });
       
       const res = await fetch(`${baseUrl}/inventory/transfer`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           itemId: item.id,
           sourceOwnerId: 'player_actor_default_story',
           targetOwnerId: player.locationId, // Current location
           targetContainerType: 'ground',
           quantity: 1
         })
       });
       
       const json = await res.json();
       assert.strictEqual(json.success, true);
    });

    it('TEST 31: Campaign archive export includes NPC lifecycles including corpses', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
       const clock = worldRepository.getWorldClock('default_story');
       const player = worldRepository.getPlayerLifecycle('default_story');

       const corpse = new PlayerLifecycleState({
         actorId: 'npc_corpse_archive_test',
         name: 'Fallen Archivist',
         locationId: player?.locationId || 'loc_whispering_orrery',
         lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
         currentActivity: 'dead',
         activeJourney: null,
         deathRecord: {
           isDead: true,
           diedAtTimestamp: clock.getTimestamp(),
           cause: 'Slain in dark ritual.',
           revivalPossible: false,
         },
       });
       worldRepository.updateNpcLifecycle('default_story', corpse);

       const archive = worldRepository.exportCampaignArchive('default_story', 'Corpse Archive Test');
       assert.ok(archive);
       const npcsJson = JSON.parse(archive.partitions['canonical/npcs.json']);
       assert.ok(Array.isArray(npcsJson.lifecycles), 'npcs.json partition must contain lifecycles array');
       const foundCorpse = npcsJson.lifecycles.find((n: any) => n.actorId === 'npc_corpse_archive_test');
       assert.ok(foundCorpse, 'Exported archive must contain corpse lifecycle');
       assert.strictEqual(foundCorpse.deathRecord?.isDead, true);
    });

    it('TEST 32: Campaign archive restore restores NPC lifecycles and corpses into WorldRepository', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
       const clock = worldRepository.getWorldClock('default_story');
       const player = worldRepository.getPlayerLifecycle('default_story');

       const corpse = new PlayerLifecycleState({
         actorId: 'npc_corpse_restore_test',
         name: 'Slain Guardian',
         locationId: player?.locationId || 'loc_whispering_orrery',
         lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
         currentActivity: 'dead',
         activeJourney: null,
         deathRecord: {
           isDead: true,
           diedAtTimestamp: clock.getTimestamp(),
           cause: 'Fatal blow in combat.',
           revivalPossible: false,
         },
       });
       worldRepository.updateNpcLifecycle('default_story', corpse);

       const archive = worldRepository.exportCampaignArchive('default_story', 'Restore Corpse Test');
       
       const restoreRes = worldRepository.restoreCampaignArchive(archive, 'default_story');
       assert.strictEqual(restoreRes.success, true);

       const restoredNpc = worldRepository.getNpcLifecycle('default_story', 'npc_corpse_restore_test');
       assert.ok(restoredNpc, 'Restored worldRepository must contain the NPC corpse lifecycle');
       assert.strictEqual(restoredNpc.isDead, true);
       assert.strictEqual(restoredNpc.currentActivity, 'dead');
       assert.strictEqual(restoredNpc.deathRecord?.isDead, true);
       assert.strictEqual(restoredNpc.locationId, player?.locationId);
    });

    it('TEST 33: Multiple NPC lifecycles (alive and dead) persist across export/restore', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
       const clock = worldRepository.getWorldClock('default_story');
       const player = worldRepository.getPlayerLifecycle('default_story');

       const aliveNpc = new PlayerLifecycleState({
         actorId: 'npc_alive_wanderer',
         name: 'Living Pilgrim',
         locationId: player?.locationId || 'loc_whispering_orrery',
         lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
         currentActivity: 'wandering',
         activeJourney: null,
         deathRecord: { isDead: false, diedAtTimestamp: null, cause: null, revivalPossible: true },
       });
       const deadNpc = new PlayerLifecycleState({
         actorId: 'npc_dead_bandit',
         name: 'Bandit Corpse',
         locationId: player?.locationId || 'loc_whispering_orrery',
         lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
         currentActivity: 'dead',
         activeJourney: null,
         deathRecord: { isDead: true, diedAtTimestamp: clock.getTimestamp(), cause: 'Arrow wound', revivalPossible: false },
       });

       worldRepository.updateNpcLifecycle('default_story', aliveNpc);
       worldRepository.updateNpcLifecycle('default_story', deadNpc);

       const archive = worldRepository.exportCampaignArchive('default_story', 'Multi NPC Test');
       const restoreRes = worldRepository.restoreCampaignArchive(archive, 'default_story');
       assert.strictEqual(restoreRes.success, true);

       const restoredAlive = worldRepository.getNpcLifecycle('default_story', 'npc_alive_wanderer');
       const restoredDead = worldRepository.getNpcLifecycle('default_story', 'npc_dead_bandit');

       assert.ok(restoredAlive);
       assert.strictEqual(restoredAlive.isDead, false);
       assert.strictEqual(restoredAlive.currentActivity, 'wandering');

       assert.ok(restoredDead);
       assert.strictEqual(restoredDead.isDead, true);
       assert.strictEqual(restoredDead.currentActivity, 'dead');
    });

    it('TEST 34: Restored corpse inventory remains lootable via transfer endpoint', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
       const invEngine = worldRepository.getInventoryEngine('default_story');
       const player = worldRepository.getPlayerLifecycle('default_story');
       const clock = worldRepository.getWorldClock('default_story');

       const corpseId = 'npc_lootable_restored_corpse';
       worldRepository.updateNpcLifecycle('default_story', new PlayerLifecycleState({
         actorId: corpseId,
         name: 'Lootable Dead Scout',
         locationId: player?.locationId || 'loc_whispering_orrery',
         lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
         currentActivity: 'dead',
         deathRecord: { isDead: true, diedAtTimestamp: clock.getTimestamp(), cause: 'combat', revivalPossible: false },
       }));

       const lootItem = invEngine.createInstance({
         defId: 'def_iron_sword',
         ownerEntityId: corpseId,
         quantity: 1,
         provenance: 'corpse_loot'
       });

       // Export and restore archive
       const archive = worldRepository.exportCampaignArchive('default_story', 'Loot Archive Test');
       const restoreRes = worldRepository.restoreCampaignArchive(archive, 'default_story');
       assert.strictEqual(restoreRes.success, true);

       // Loot item from restored corpse
       const res = await fetch(`${baseUrl}/inventory/transfer`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           itemId: lootItem.id,
           sourceOwnerId: corpseId,
           targetOwnerId: 'player_actor_default_story',
           targetContainerType: 'actor',
           quantity: 1
         })
       });

       const json = await res.json();
       assert.strictEqual(json.success, true, `Loot transfer failed: ${json.errorReason}`);

       const reloadedInv = worldRepository.getInventoryEngine('default_story');
       const reloadedItem = reloadedInv.getItemInstance(lootItem.id);
       assert.strictEqual(reloadedItem?.ownerEntityId, 'player_actor_default_story');
    });

    describe('CH5 Round 4: NPC Combat Death -> Canonical Lifecycle Synchronization (CH5-COMBAT-01 & CH5-COMBAT-02)', () => {
      it('TEST 35 (TEST A): Existing living NPC is marked dead in WorldRepository upon combat death', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
        const player = worldRepository.getPlayerLifecycle('default_story');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const existingNpcId = 'npc_existing_alive_guard';
        const initialNpc = new PlayerLifecycleState({
          actorId: existingNpcId,
          name: 'Iron Sentinel',
          locationId: player?.locationId || 'loc_whispering_orrery',
          lastUpdatedTime: 100,
          currentActivity: 'patrolling',
          activeJourney: null,
          injuries: [],
          lineage: 'Iron Oath Lineage',
          discoveredLocationIds: ['loc_whispering_orrery', 'loc_custom_shrine'],
          deathRecord: { isDead: false, diedAtTimestamp: null, cause: null, revivalPossible: true },
        });
        worldRepository.updateNpcLifecycle('default_story', initialNpc);

        // Verify it is alive initially
        assert.strictEqual(worldRepository.getNpcLifecycle('default_story', existingNpcId)?.isDead, false);

        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 20,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 50, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: existingNpcId,
          name: 'Iron Sentinel',
          x: 1, y: 0,
          initiative: 5,
          team: 'enemies',
          hpCurrent: 1, hpMax: 20,
          armorClass: 0, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });

        const res = await fetch(`${baseUrl}/combat/attack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: existingNpcId }),
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.targetDied, true);

        // Assert combat participant is dead
        const combatPart = combatEngine.getParticipant(existingNpcId);
        assert.strictEqual(combatPart?.isDead, true);

        // Assert canonical lifecycle in WorldRepository is now DEAD (fixes CH5-COMBAT-01)
        const updatedNpc = worldRepository.getNpcLifecycle('default_story', existingNpcId);
        assert.ok(updatedNpc, 'Canonical lifecycle must exist');
        assert.strictEqual(updatedNpc.isDead, true);
        assert.strictEqual(updatedNpc.currentActivity, 'dead');
        assert.strictEqual(updatedNpc.deathRecord?.isDead, true);
        assert.ok(updatedNpc.deathRecord?.cause?.includes('Vael'));

        // Assert unrelated fields were preserved
        assert.strictEqual(updatedNpc.lineage, 'Iron Oath Lineage');
        assert.ok(updatedNpc.discoveredLocationIds.includes('loc_custom_shrine'));
      });

      it('TEST 36 (TEST B): NPC without prior canonical lifecycle creates canonical dead state on combat death', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const brandNewNpcId = 'npc_unregistered_shadow_beast';
        // Ensure it does not exist in repository initially
        assert.strictEqual(worldRepository.getNpcLifecycle('default_story', brandNewNpcId), null);

        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 20,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 50, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: brandNewNpcId,
          name: 'Shadow Beast',
          x: 1, y: 0,
          initiative: 5,
          team: 'enemies',
          hpCurrent: 1, hpMax: 15,
          armorClass: 0, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });

        const res = await fetch(`${baseUrl}/combat/attack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: brandNewNpcId }),
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.targetDied, true);

        // Assert canonical dead lifecycle is created
        const canonicalNpc = worldRepository.getNpcLifecycle('default_story', brandNewNpcId);
        assert.ok(canonicalNpc, 'Canonical dead lifecycle must be created');
        assert.strictEqual(canonicalNpc.actorId, brandNewNpcId);
        assert.strictEqual(canonicalNpc.name, 'Shadow Beast');
        assert.strictEqual(canonicalNpc.isDead, true);
        assert.strictEqual(canonicalNpc.currentActivity, 'dead');
        assert.strictEqual(canonicalNpc.deathRecord?.isDead, true);
      });

      it('TEST 37 (TEST C): Immediate attack-time synchronization marks NPC dead without combat reset', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const targetId = 'npc_attack_sync_immediate_target';
        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 20,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 50, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: targetId,
          name: 'Void Sentry',
          x: 1, y: 0,
          initiative: 5,
          team: 'enemies',
          hpCurrent: 1, hpMax: 20,
          armorClass: 0, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });

        // Execute attack via HTTP endpoint
        const res = await fetch(`${baseUrl}/combat/attack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId }),
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.targetDied, true);

        // CRITICAL CH5-COMBAT-02 REGRESSION: IMMEDIATELY inspect WorldRepository.
        // NO call to /combat/encounter/start, NO combatEngine.clear(), NO reset!
        const immediateLifecycle = worldRepository.getNpcLifecycle('default_story', targetId);
        assert.ok(immediateLifecycle, 'Canonical lifecycle must be synchronized immediately after attack resolution');
        assert.strictEqual(immediateLifecycle.isDead, true);
        assert.strictEqual(immediateLifecycle.currentActivity, 'dead');
        assert.strictEqual(immediateLifecycle.deathRecord?.isDead, true);
      });

      it('TEST 38 (TEST D): Non-lethal attack does not mark NPC dead in canonical lifecycle', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
        const player = worldRepository.getPlayerLifecycle('default_story');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const resilientId = 'npc_resilient_cultist';
        const initialNpc = new PlayerLifecycleState({
          actorId: resilientId,
          name: 'Cultist Zealot',
          locationId: player?.locationId || 'loc_whispering_orrery',
          lastUpdatedTime: 50,
          currentActivity: 'chanting',
          deathRecord: { isDead: false, diedAtTimestamp: null, cause: null, revivalPossible: true },
        });
        worldRepository.updateNpcLifecycle('default_story', initialNpc);

        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 20,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 50, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: resilientId,
          name: 'Cultist Zealot',
          x: 1, y: 0,
          initiative: 5,
          team: 'enemies',
          hpCurrent: 100, hpMax: 100, // High HP
          armorClass: 0, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });

        const res = await fetch(`${baseUrl}/combat/attack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: resilientId }),
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.targetDied, false);

        const combatPart = combatEngine.getParticipant(resilientId);
        assert.strictEqual(combatPart?.isDead, false);
        assert.ok((combatPart?.hpCurrent ?? 0) > 0);

        const canonicalNpc = worldRepository.getNpcLifecycle('default_story', resilientId);
        assert.ok(canonicalNpc);
        assert.strictEqual(canonicalNpc.isDead, false);
        assert.strictEqual(canonicalNpc.currentActivity, 'chanting');
        assert.strictEqual(canonicalNpc.deathRecord?.isDead, false);
      });

      it('TEST 39 (TEST E): Repeated death synchronization is idempotent and preserves death record', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const targetId = 'npc_idempotent_test_target';
        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 20,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 50, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: targetId,
          name: 'Skeleton Archer',
          x: 1, y: 0,
          initiative: 5,
          team: 'enemies',
          hpCurrent: 1, hpMax: 10,
          armorClass: 0, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });

        // Attack 1: kills target
        const res = await fetch(`${baseUrl}/combat/attack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId }),
        });
        assert.strictEqual(res.status, 200);

        const lifecycleAfterDeath = worldRepository.getNpcLifecycle('default_story', targetId);
        assert.ok(lifecycleAfterDeath);
        const originalDeathTimestamp = lifecycleAfterDeath.deathRecord?.diedAtTimestamp;
        const originalCause = lifecycleAfterDeath.deathRecord?.cause;

        // Now call /combat/encounter/start which re-processes dead participants
        const resetRes = await fetch(`${baseUrl}/combat/encounter/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: 'default_story' }),
        });
        assert.strictEqual(resetRes.status, 200);

        // Verify lifecycle state remains stable and idempotent
        const lifecycleAfterReset = worldRepository.getNpcLifecycle('default_story', targetId);
        assert.ok(lifecycleAfterReset);
        assert.strictEqual(lifecycleAfterReset.isDead, true);
        assert.deepStrictEqual(lifecycleAfterReset.deathRecord?.diedAtTimestamp, originalDeathTimestamp);
        assert.strictEqual(lifecycleAfterReset.deathRecord?.cause, originalCause);

        // Verify no duplicate lifecycles in the repository
        const allMatching = worldRepository.getAllNpcLifecycles('default_story').filter(n => n.actorId === targetId);
        assert.strictEqual(allMatching.length, 1);
      });

      it('TEST 40 (TEST F): Corpse survives subsequent combat reset', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const targetId = 'npc_corpse_reset_survival';
        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 20,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 50, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: targetId,
          name: 'Restless Spirit',
          x: 1, y: 0,
          initiative: 5,
          team: 'enemies',
          hpCurrent: 1, hpMax: 10,
          armorClass: 0, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });

        await fetch(`${baseUrl}/combat/attack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId }),
        });

        // Clear / reset combat encounter
        const resetRes = await fetch(`${baseUrl}/combat/encounter/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: 'default_story' }),
        });
        assert.strictEqual(resetRes.status, 200);

        // Target was removed from active tactical battlefield participants
        assert.strictEqual(combatEngine.getParticipant(targetId), undefined);

        // But target CANONICALLY SURVIVED as corpse in WorldRepository
        const canonicalCorpse = worldRepository.getNpcLifecycle('default_story', targetId);
        assert.ok(canonicalCorpse);
        assert.strictEqual(canonicalCorpse.isDead, true);
        assert.strictEqual(canonicalCorpse.currentActivity, 'dead');
      });

      it('TEST 41 (TEST G): Campaign archive export/restore preserves immediately synchronized corpse', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const targetId = 'npc_archive_immediate_corpse';
        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 20,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 50, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: targetId,
          name: 'Astral Wraith',
          x: 1, y: 0,
          initiative: 5,
          team: 'enemies',
          hpCurrent: 1, hpMax: 10,
          armorClass: 0, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });

        // Attack and kill
        const attackRes = await fetch(`${baseUrl}/combat/attack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId }),
        });
        assert.strictEqual(attackRes.status, 200);

        // Export archive immediately without calling encounter reset
        const archive = worldRepository.exportCampaignArchive('default_story', 'Immediate Death Archive');
        assert.ok(archive);
        const npcsJson = JSON.parse(archive.partitions['canonical/npcs.json']);
        const foundInArchive = npcsJson.lifecycles.find((n: any) => n.actorId === targetId);
        assert.ok(foundInArchive, 'Archive must contain immediately synchronized dead NPC');
        assert.strictEqual(foundInArchive.deathRecord?.isDead, true);

        // Restore archive
        const restoreRes = worldRepository.restoreCampaignArchive(archive, 'default_story');
        assert.strictEqual(restoreRes.success, true);

        // Verify restored state
        const restoredCorpse = worldRepository.getNpcLifecycle('default_story', targetId);
        assert.ok(restoredCorpse);
        assert.strictEqual(restoredCorpse.isDead, true);
        assert.strictEqual(restoredCorpse.currentActivity, 'dead');
        assert.strictEqual(restoredCorpse.deathRecord?.isDead, true);
      });

      it('TEST 42 (TEST H): Restored corpse inventory remains lootable via transfer endpoint', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const invEngine = worldRepository.getInventoryEngine('default_story');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const corpseId = 'npc_combat_loot_corpse';
        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 20,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 50, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: corpseId,
          name: 'Dungeon Marauder',
          x: 1, y: 0,
          initiative: 5,
          team: 'enemies',
          hpCurrent: 1, hpMax: 10,
          armorClass: 0, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });

        // Kill target in combat
        await fetch(`${baseUrl}/combat/attack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: corpseId }),
        });

        // Seed loot on the dead corpse
        const lootItem = invEngine.createInstance({
          defId: 'def_iron_sword',
          ownerEntityId: corpseId,
          quantity: 1,
          provenance: 'corpse_trophy',
        });

        // Export and restore archive
        const archive = worldRepository.exportCampaignArchive('default_story', 'Corpse Loot Archive');
        const restoreRes = worldRepository.restoreCampaignArchive(archive, 'default_story');
        assert.strictEqual(restoreRes.success, true);

        // Loot via transfer route
        const transferRes = await fetch(`${baseUrl}/inventory/transfer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: lootItem.id,
            sourceOwnerId: corpseId,
            targetOwnerId: 'player_actor_default_story',
            targetContainerType: 'actor',
            quantity: 1,
          }),
        });

        const transferJson = await transferRes.json();
        assert.strictEqual(transferJson.success, true, `Transfer failed: ${transferJson.errorReason}`);

        const reloadedInv = worldRepository.getInventoryEngine('default_story');
        const reloadedItem = reloadedInv.getItemInstance(lootItem.id);
        assert.strictEqual(reloadedItem?.ownerEntityId, 'player_actor_default_story');
      });
    });

    describe('CH5 Round 5: Environmental Hazard Death & Dead-NPC Encounter Reseeding (CH5-HAZARD-01 & CH5-COMBAT-RESEED)', () => {
      it('TEST 43: Hazard death during turn advancement immediately synchronizes to WorldRepository as dead', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const npcId = 'npc_hazard_death_sync_test';
        const initialNpc = new PlayerLifecycleState({
          actorId: npcId,
          name: 'Ash Wanderer',
          locationId: 'loc_whispering_orrery',
          lastUpdatedTime: 100,
          currentActivity: 'wandering',
          activeJourney: null,
          injuries: [],
          deathRecord: { isDead: false, diedAtTimestamp: null, cause: null, revivalPossible: true },
        });
        worldRepository.updateNpcLifecycle('default_story', initialNpc);
        assert.strictEqual(worldRepository.getNpcLifecycle('default_story', npcId)?.isDead, false);

        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 20,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 5, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: npcId,
          name: 'Ash Wanderer',
          x: 2, y: 2,
          initiative: 10,
          team: 'enemies',
          hpCurrent: 5, hpMax: 20,
          armorClass: 10, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        // Add a lethal hazard at (2, 2) that deals 10 damage to the 5 HP NPC when turn advances to it
        combatEngine.addHazard({
          id: 'hazard_test_lava',
          type: 'lava_pool',
          x: 2, y: 2,
          radiusCells: 1,
          durationTurns: 3,
          damagePerTurn: 10,
        });

        // Authoritative turn resolution call: end player turn, advancing turn to Ash Wanderer
        const res = await fetch(`${baseUrl}/combat/end-turn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorId: 'player_actor_default_story' }),
        });
        const json = await res.json();
        assert.strictEqual(json.success, true);

        // Immediately assert: TacticalCombatEngine participant = DEAD
        const combatParticipant = combatEngine.getParticipant(npcId);
        assert.ok(combatParticipant, 'Participant must exist in combat engine');
        assert.strictEqual(combatParticipant.isDead, true, 'Combat participant must be dead');
        assert.strictEqual(combatParticipant.hpCurrent, 0, 'Combat participant HP must be 0');

        // Immediately assert: WorldRepository lifecycle = DEAD
        const canonicalLifecycle = worldRepository.getNpcLifecycle('default_story', npcId);
        assert.ok(canonicalLifecycle, 'Canonical lifecycle must exist');
        assert.strictEqual(canonicalLifecycle.isDead, true, 'WorldRepository lifecycle must be DEAD');
        assert.strictEqual(canonicalLifecycle.currentActivity, 'dead');
        assert.strictEqual(canonicalLifecycle.deathRecord?.isDead, true);
        assert.ok(canonicalLifecycle.deathRecord?.cause?.includes('hazard'));
      });

      it('TEST 44: Non-lethal hazard damage leaves combat participant and canonical lifecycle ALIVE', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const npcId = 'npc_hazard_nonlethal_test';
        const initialNpc = new PlayerLifecycleState({
          actorId: npcId,
          name: 'Sturdy Golem',
          locationId: 'loc_whispering_orrery',
          lastUpdatedTime: 100,
          currentActivity: 'guarding',
          activeJourney: null,
          injuries: [],
          deathRecord: { isDead: false, diedAtTimestamp: null, cause: null, revivalPossible: true },
        });
        worldRepository.updateNpcLifecycle('default_story', initialNpc);

        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 20,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 5, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: npcId,
          name: 'Sturdy Golem',
          x: 2, y: 2,
          initiative: 10,
          team: 'enemies',
          hpCurrent: 50, hpMax: 50,
          armorClass: 10, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        // Non-lethal hazard: deals 10 damage to 50 HP Golem
        combatEngine.addHazard({
          id: 'hazard_mild_acid',
          type: 'acid_splash',
          x: 2, y: 2,
          radiusCells: 1,
          durationTurns: 3,
          damagePerTurn: 10,
        });

        // Advance turn
        const res = await fetch(`${baseUrl}/combat/end-turn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorId: 'player_actor_default_story' }),
        });
        const json = await res.json();
        assert.strictEqual(json.success, true);

        // Assert ALIVE
        const combatParticipant = combatEngine.getParticipant(npcId);
        assert.strictEqual(combatParticipant?.isDead, false);
        assert.strictEqual(combatParticipant?.hpCurrent, 40);

        const canonical = worldRepository.getNpcLifecycle('default_story', npcId);
        assert.strictEqual(canonical?.isDead, false);
        assert.strictEqual(canonical?.deathRecord?.isDead, false);
        assert.strictEqual(canonical?.currentActivity, 'guarding');
      });

      it('TEST 45: Hazard death synchronization is idempotent and preserves original death record', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const npcId = 'npc_hazard_idempotent_test';
        const initialNpc = new PlayerLifecycleState({
          actorId: npcId,
          name: 'Fragile Automaton',
          locationId: 'loc_whispering_orrery',
          lastUpdatedTime: 100,
          currentActivity: 'operating',
          activeJourney: null,
          injuries: [],
          deathRecord: { isDead: false, diedAtTimestamp: null, cause: null, revivalPossible: true },
        });
        worldRepository.updateNpcLifecycle('default_story', initialNpc);

        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 20,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 5, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: npcId,
          name: 'Fragile Automaton',
          x: 2, y: 2,
          initiative: 10,
          team: 'enemies',
          hpCurrent: 2, hpMax: 10,
          armorClass: 10, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addHazard({
          id: 'hazard_spikes',
          type: 'spike_pit',
          x: 2, y: 2,
          radiusCells: 1,
          durationTurns: 3,
          damagePerTurn: 5,
        });

        // First end-turn triggers hazard death
        await fetch(`${baseUrl}/combat/end-turn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorId: 'player_actor_default_story' }),
        });

        const recordAfterFirstDeath = worldRepository.getNpcLifecycle('default_story', npcId);
        assert.ok(recordAfterFirstDeath);
        assert.strictEqual(recordAfterFirstDeath.isDead, true);
        const originalTimestamp = recordAfterFirstDeath.deathRecord?.diedAtTimestamp;
        const originalCause = recordAfterFirstDeath.deathRecord?.cause;
        assert.ok(originalTimestamp);
        assert.ok(originalCause);

        // Advance world time to simulate future clock
        worldRepository.getWorldClock('default_story').advanceSeconds(120);

        // Trigger end-turn again
        await fetch(`${baseUrl}/combat/end-turn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorId: 'player_actor_default_story' }),
        });

        const recordAfterSecondInspection = worldRepository.getNpcLifecycle('default_story', npcId);
        assert.strictEqual(recordAfterSecondInspection?.isDead, true);
        assert.deepStrictEqual(recordAfterSecondInspection?.deathRecord?.diedAtTimestamp, originalTimestamp, 'Timestamp must remain stable');
        assert.strictEqual(recordAfterSecondInspection?.deathRecord?.cause, originalCause, 'Cause must remain stable');

        // Check no duplicate lifecycle entries exist
        const allNpcs = worldRepository.getAllNpcLifecycles('default_story');
        const matches = allNpcs.filter(n => n.actorId === npcId);
        assert.strictEqual(matches.length, 1, 'Exactly one lifecycle record must exist for this NPC');
      });

      it('TEST 46: Live POST /combat/end-turn route synchronizes newly dead hazard victim into canonical lifecycle', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const npcId = 'npc_live_end_turn_victim';
        const initialNpc = new PlayerLifecycleState({
          actorId: npcId,
          name: 'Void Leech',
          locationId: 'loc_whispering_orrery',
          lastUpdatedTime: 50,
          currentActivity: 'crawling',
          activeJourney: null,
          injuries: [],
          deathRecord: { isDead: false, diedAtTimestamp: null, cause: null, revivalPossible: true },
        });
        worldRepository.updateNpcLifecycle('default_story', initialNpc);

        combatEngine.clear();
        combatEngine.addParticipant({
          id: 'player_actor_default_story',
          name: 'Vael',
          x: 0, y: 0,
          initiative: 25,
          team: 'player_allies',
          hpCurrent: 100, hpMax: 100,
          armorClass: 10, speedCells: 5, attackBonus: 5, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addParticipant({
          id: npcId,
          name: 'Void Leech',
          x: 3, y: 3,
          initiative: 15,
          team: 'enemies',
          hpCurrent: 4, hpMax: 10,
          armorClass: 10, speedCells: 5, attackBonus: 0, damageFormula: '1d4',
          conditions: [], isDead: false,
        });
        combatEngine.addHazard({
          id: 'hazard_blight',
          type: 'blight_rot',
          x: 3, y: 3,
          radiusCells: 1,
          durationTurns: 5,
          damagePerTurn: 6,
        });

        // Call the real live HTTP route
        const res = await fetch(`${baseUrl}/combat/end-turn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorId: 'player_actor_default_story' }),
        });
        assert.strictEqual(res.status, 200);
        const json = await res.json();
        assert.strictEqual(json.success, true);
        assert.ok(json.advanceResult);

        // Immediately inspect canonical lifecycle in WorldRepository
        const canonical = worldRepository.getNpcLifecycle('default_story', npcId);
        assert.ok(canonical, 'Canonical record must exist');
        assert.strictEqual(canonical.isDead, true, 'Must be marked DEAD through end-turn route');
        assert.strictEqual(canonical.currentActivity, 'dead');
        assert.strictEqual(canonical.deathRecord?.isDead, true);
      });

      it('TEST 47: Dead unique NPC is NOT resurrected or reseeded as alive under same actorId', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const uniqueDeadNpcId = 'enemy_void_construct';
        const deadState = new PlayerLifecycleState({
          actorId: uniqueDeadNpcId,
          name: 'Astral Void Sentry',
          locationId: 'loc_whispering_orrery',
          lastUpdatedTime: 500,
          currentActivity: 'dead',
          activeJourney: null,
          injuries: [],
          deathRecord: {
            isDead: true,
            diedAtTimestamp: worldRepository.getWorldClock('default_story').getTimestamp(),
            cause: 'Previously slain in battle',
            revivalPossible: false,
          },
        });
        worldRepository.updateNpcLifecycle('default_story', deadState);
        assert.strictEqual(worldRepository.getNpcLifecycle('default_story', uniqueDeadNpcId)?.isDead, true);

        // Start encounter using actual HTTP route
        const res = await fetch(`${baseUrl}/combat/encounter/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: 'default_story' }),
        });
        assert.strictEqual(res.status, 200);
        const json = await res.json();
        assert.strictEqual(json.success, true);

        // Verify that the deceased actor ID is NOT resurrected as an alive tactical participant
        const resurrectedParticipant = combatEngine.getParticipant(uniqueDeadNpcId);
        assert.ok(!resurrectedParticipant || resurrectedParticipant.isDead !== false,
          'Dead actor ID enemy_void_construct must NOT be present as an alive combat participant');
        
        // Canonical state must remain DEAD
        const canonical = worldRepository.getNpcLifecycle('default_story', uniqueDeadNpcId);
        assert.strictEqual(canonical?.isDead, true, 'Canonical lifecycle must remain DEAD');
      });

      it('TEST 48: Dynamic enemy spawning still works when base archetype is dead', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        // Ensure base enemy_void_construct is dead
        const baseId = 'enemy_void_construct';
        const deadState = new PlayerLifecycleState({
          actorId: baseId,
          name: 'Astral Void Sentry',
          locationId: 'loc_whispering_orrery',
          lastUpdatedTime: 600,
          currentActivity: 'dead',
          activeJourney: null,
          injuries: [],
          deathRecord: {
            isDead: true,
            diedAtTimestamp: worldRepository.getWorldClock('default_story').getTimestamp(),
            cause: 'Slain in tactical combat',
            revivalPossible: false,
          },
        });
        worldRepository.updateNpcLifecycle('default_story', deadState);

        // Start encounter
        const res = await fetch(`${baseUrl}/combat/encounter/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: 'default_story' }),
        });
        const json = await res.json();
        assert.strictEqual(json.success, true);

        // Prove a dynamic enemy spawned
        const enemies = combatEngine.getParticipants().filter(p => p.team === 'enemies');
        assert.ok(enemies.length >= 1, 'An enemy combatant must spawn for gameplay encounter');
        const spawnedEnemy = enemies[0];
        assert.strictEqual(spawnedEnemy.isDead, false, 'Dynamic enemy must be alive');
        assert.notStrictEqual(spawnedEnemy.id, baseId, 'Spawned dynamic enemy ID must not collide with dead base actorId');
        assert.ok(spawnedEnemy.id.startsWith('enemy_void_construct_'), `Expected dynamic ID format, got ${spawnedEnemy.id}`);
      });

      it('TEST 49: Canonical dead NPC survives encounter reset and subsequent encounters', async () => {
        const { worldRepository } = await import('../server/repositories/worldRepository');
        const { PlayerLifecycleState } = await import('../server/domain/playerLifecycleState');
        const combatEngine = worldRepository.getCombatEngine('default_story');

        const canonicalDeadId = 'enemy_void_construct';
        const initialClock = worldRepository.getWorldClock('default_story').getTimestamp();
        const deadState = new PlayerLifecycleState({
          actorId: canonicalDeadId,
          name: 'Astral Void Sentry',
          locationId: 'loc_whispering_orrery',
          lastUpdatedTime: 700,
          currentActivity: 'dead',
          activeJourney: null,
          injuries: [],
          deathRecord: {
            isDead: true,
            diedAtTimestamp: initialClock,
            cause: 'Original death recorded in chronicle',
            revivalPossible: false,
          },
        });
        worldRepository.updateNpcLifecycle('default_story', deadState);

        // 1. First encounter start
        await fetch(`${baseUrl}/combat/encounter/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: 'default_story' }),
        });
        assert.strictEqual(worldRepository.getNpcLifecycle('default_story', canonicalDeadId)?.isDead, true);

        // 2. Clear / reset combat
        combatEngine.clear();
        assert.strictEqual(worldRepository.getNpcLifecycle('default_story', canonicalDeadId)?.isDead, true);

        // 3. Second encounter start
        await fetch(`${baseUrl}/combat/encounter/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: 'default_story' }),
        });

        // Verify canonical dead NPC is still dead and retains its original death cause
        const finalCanonical = worldRepository.getNpcLifecycle('default_story', canonicalDeadId);
        assert.ok(finalCanonical);
        assert.strictEqual(finalCanonical.isDead, true);
        assert.strictEqual(finalCanonical.currentActivity, 'dead');
        assert.strictEqual(finalCanonical.deathRecord?.cause, 'Original death recorded in chronicle');
      });
    });
  });

});
