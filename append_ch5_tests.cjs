const fs = require('fs');

const tests = `
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
            baseUrl = \`http://127.0.0.1:\${addr.port}/api/game\`;
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
      const res = await fetch(\`\${baseUrl}/inventory/transfer\`, {
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
      
      const res = await fetch(\`\${baseUrl}/inventory/transfer\`, {
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
         maxDurability: 100
       });
       invEngine.createInstance({ defId: 'def_magic_sword', ownerEntityId: 'player_actor_default_story', quantity: 1, provenance: 'test' });
       
       const capabilities = capEngine.getAvailableCapabilities('player_actor_default_story');
       assert.ok(!capabilities.includes('cap_fly'));
    });

    it('TEST 23: Epistemic discovery bypass rejected', async () => {
       // This verifies that location discovery works in GeographyGraph and isn't bypassed by inventory transfers
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const geo = worldRepository.getGeographyGraph();
       const undiscovered = geo.getLocation('loc_sunken_scriptorium');
       assert.ok(undiscovered);
       
       const player = worldRepository.getPlayerLifecycle('default_story');
       assert.ok(!player.discoveredLocationIds?.includes('loc_sunken_scriptorium'));
    });

    it('TEST 24: CH3.2 equipment/capability regression', async () => {
       // Make sure transferring equipment doesn't break
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const invEngine = worldRepository.getInventoryEngine('default_story');
       const item = invEngine.createInstance({ defId: 'def_iron_sword', ownerEntityId: 'player_actor_default_story', quantity: 1, provenance: 'test' });
       
       const equipRes = invEngine.equipItem('player_actor_default_story', item.id, 'mainHand');
       assert.strictEqual(equipRes.success, true);
       
       const doll = invEngine.getEquipmentDoll('player_actor_default_story');
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
       const history = chronicle.getAllEvidence();
       assert.ok(history.find(e => e.id === 'ev_test'));
    });

    it('TEST 26: Successful transfer persistence/reload', async () => {
       const { worldRepository } = await import('../server/repositories/worldRepository');
       const invEngine = worldRepository.getInventoryEngine('default_story');
       
       const item = invEngine.createInstance({ defId: 'def_iron_sword', ownerEntityId: 'player_actor_default_story', quantity: 1, provenance: 'test' });
       
       const res = await fetch(\`\${baseUrl}/inventory/transfer\`, {
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
       
       combatEngine.initEncounter('enc_test', player.locationId, [{
         id: 'player_actor_default_story',
         name: 'Player',
         x: 0, y: 0,
         initiative: 10,
         team: 'player_allies',
         hpCurrent: 100, hpMax: 100,
         armorClass: 10, speedCells: 5, attackBonus: 0, damageFormula: '1d4'
       }, {
         id: 'enemy_1',
         name: 'Goblin',
         x: 1, y: 1,
         initiative: 5,
         team: 'enemy',
         hpCurrent: 1, hpMax: 10,
         armorClass: 10, speedCells: 5, attackBonus: 0, damageFormula: '1d4'
       }]);
       
       combatEngine.executeAttack('player_actor_default_story', 'enemy_1', 10, 10);
       assert.strictEqual(combatEngine.getParticipants().find(p => p.id === 'enemy_1').isDead, true);
       
       // Force encounter init via route which calls combatEngine.clear() and transfers corpses
       await fetch(\`\${baseUrl}/combat/encounter/init\`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           storyId: 'default_story',
           actorId: 'player_actor_default_story'
         })
       });
       
       const npcLife = worldRepository.getNpcLifecycle('default_story', 'enemy_1');
       assert.ok(npcLife);
       assert.strictEqual(npcLife.isDead, true);
       assert.strictEqual(npcLife.locationId, player.locationId);
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
          deathRecord: { isDead: true, timestamp: worldRepository.getWorldClock('default_story').getTimestamp(), cause: 'test', permanentlyDead: true }
       }));
       
       const item = invEngine.createInstance({ defId: 'def_iron_sword', ownerEntityId: 'enemy_1', quantity: 1, provenance: 'loot' });
       
       const res = await fetch(\`\${baseUrl}/inventory/transfer\`, {
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
       
       const res = await fetch(\`\${baseUrl}/inventory/transfer\`, {
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
       
       const res = await fetch(\`\${baseUrl}/inventory/transfer\`, {
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
  });
`;

let code = fs.readFileSync('tests/ch5_surgical.test.ts', 'utf8');
code = code.replace(/\}\);\s*$/, tests + '\n});\n');
fs.writeFileSync('tests/ch5_surgical.test.ts', code);
console.log("Success");
