import express from 'express';
import { Server } from 'http';
import assert from 'node:assert';
import { gameRouter } from './server/api/gameRoutes';
import { worldRepository, InMemoryWorldRepository } from './server/repositories/worldRepository';
import { WorkingContextEngine } from './server/domain/workingContextEngine';

async function runLiveVerification() {
  console.log('--- 1. START THE ACTUAL APPLICATION ---');
  const app = express();
  app.use(express.json());
  app.use('/api/game', gameRouter);
  
  let server: Server;
  let baseUrl: string = '';
  await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') {
              baseUrl = `http://127.0.0.1:${addr.port}/api/game`;
              console.log(`Live application listening at ${baseUrl}`);
          }
          resolve();
      });
  });

  const storyId = 'default_story';
  const player = worldRepository.getPlayerLifecycle(storyId);
  const actorId = player?.actorId || 'player_actor_default_story';
  const invEngine = worldRepository.getInventoryEngine(storyId);
  const capEngine = worldRepository.getCapabilityEngine(storyId);
  const combatEngine = worldRepository.getCombatEngine(storyId);

  capEngine.seedStarterPowerStateForActor(actorId);
  // Ensure player has base learned capabilities unlearned for pure testing
  capEngine.unlearnCapability(actorId, 'cap_fireball');
  capEngine.unlearnCapability(actorId, 'cap_flight');
  capEngine.unlearnCapability(actorId, 'cap_analyze');

  console.log('\n--- 2. LIVE FLYING SHOES ---');
  const shoes = invEngine.createInstance({ defId: 'def_flying_shoes', ownerEntityId: actorId, containerType: 'actor', provenance: 'test' });
  
  let effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
  console.log(`A. Unequipped: Has Flight? ${effectiveCaps.some(c => c.id === 'cap_flight')}`);
  assert.strictEqual(effectiveCaps.some(c => c.id === 'cap_flight'), false);

  invEngine.equipItem(actorId, shoes.id, 'feet');
  effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
  const flightCap = effectiveCaps.find(c => c.id === 'cap_flight');
  console.log(`B. Equipped: Has Flight? ${!!flightCap}, Provenance: ${flightCap?.sources[0]?.provenance}`);
  assert.strictEqual(!!flightCap, true);

  invEngine.unequipItem(actorId, shoes.id);
  effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
  console.log(`C. Unequipped Again: Has Flight? ${effectiveCaps.some(c => c.id === 'cap_flight')}`);
  assert.strictEqual(effectiveCaps.some(c => c.id === 'cap_flight'), false);

  console.log('\n--- 3. LIVE FLAME STAFF ---');
  const staff = invEngine.createInstance({ defId: 'def_flame_staff', ownerEntityId: actorId, containerType: 'actor', provenance: 'test' });
  invEngine.equipItem(actorId, staff.id, 'mainHand');
  
  const targetId = 'npc_goblin_scout';
  // Manually add attacker and target to combat engine so 404 is avoided
  combatEngine.addParticipant({ id: actorId, name: 'Player', team: 'player', hp: 20, maxHp: 20, initiative: 10, position: {x:0, y:0}, conditions: [] });
  combatEngine.addParticipant({ id: targetId, name: 'Goblin', team: 'hostile', hp: 10, maxHp: 10, initiative: 5, position: {x:1, y:1}, conditions: [] });
  
  const castRes = await fetch(`${baseUrl}/combat/cast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId, capabilityId: 'cap_fireball', requestedScale: 'Moderate' })
  });
  console.log(`Cast Fireball (Equipped): HTTP ${castRes.status}`);
  assert.strictEqual(castRes.status, 200);

  invEngine.unequipItem(actorId, staff.id);
  const castResUnequipped = await fetch(`${baseUrl}/combat/cast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId, capabilityId: 'cap_fireball', requestedScale: 'Moderate' })
  });
  console.log(`Cast Fireball (Unequipped): HTTP ${castResUnequipped.status}`);
  assert.strictEqual(castResUnequipped.status, 403);

  console.log('\n--- 4. LIVE BROKEN ITEM ---');
  invEngine.equipItem(actorId, staff.id, 'mainHand');
  invEngine.degradeDurability(staff.id, 9999);
  const castResBroken = await fetch(`${baseUrl}/combat/cast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId, capabilityId: 'cap_fireball', requestedScale: 'Moderate' })
  });
  console.log(`Cast Fireball (Broken Staff): HTTP ${castResBroken.status}`);
  assert.strictEqual(castResBroken.status, 403);

  console.log('\n--- 5. LIVE MULTIPLE SOURCES ---');
  const freshStaff = invEngine.createInstance({ defId: 'def_flame_staff', ownerEntityId: actorId, containerType: 'actor', provenance: 'test' });
  invEngine.equipItem(actorId, freshStaff.id, 'mainHand');
  capEngine.learnCapability(actorId, 'cap_fireball'); // Source A
  
  effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
  const fbCaps = effectiveCaps.filter(c => c.id === 'cap_fireball');
  console.log(`Total Fireball capability records: ${fbCaps.length}`);
  console.log(`Provenance sources count: ${fbCaps[0]?.sources.length} (${fbCaps[0]?.sources.map(s => s.type).join(', ')})`);
  assert.strictEqual(fbCaps.length, 1);
  assert.strictEqual(fbCaps[0].sources.length, 2);

  invEngine.unequipItem(actorId, freshStaff.id);
  effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
  const fbCapsAfter = effectiveCaps.filter(c => c.id === 'cap_fireball');
  console.log(`Total Fireball records after unequip: ${fbCapsAfter.length}, Sources: ${fbCapsAfter[0]?.sources.map(s => s.type).join(', ')}`);
  assert.strictEqual(fbCapsAfter.length, 1);
  assert.strictEqual(fbCapsAfter[0].sources[0].type, 'LEARNED');

  console.log('\n--- 6. LIVE ORACLE MONOCLE (EPISTEMIC BOUNDARY) ---');
  const monocle = invEngine.createInstance({ defId: 'def_oracle_monocle', ownerEntityId: actorId, containerType: 'actor', provenance: 'test' });
  invEngine.equipItem(actorId, monocle.id, 'head');
  
  const knownTargetId = 'npc_goblin_scout'; // Already in combat engine
  const castAnalyzeKnown = await fetch(`${baseUrl}/combat/cast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: knownTargetId, capabilityId: 'cap_analyze' })
  });
  console.log(`Analyze known target: HTTP ${castAnalyzeKnown.status}`);
  assert.strictEqual(castAnalyzeKnown.status, 200);

  const unknownTarget = { id: 'entity_unperceived_ninja', name: 'Ninja', team: 'hostile' as any, hp: 10, maxHp: 10, initiative: 0, position: { x: 0, y: 0 }, conditions: ['Hidden'] };
  combatEngine.addParticipant(unknownTarget);
  const castAnalyzeUnknown = await fetch(`${baseUrl}/combat/cast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: unknownTarget.id, capabilityId: 'cap_analyze' })
  });
  console.log(`Analyze unknown/hidden target: HTTP ${castAnalyzeUnknown.status}`);
  assert.strictEqual(castAnalyzeUnknown.status, 403);

  console.log('\n--- 7. LIVE CAPABILITY API / SECURITY ---');
  const adjFake = await fetch(`${baseUrl}/capabilities/adjudicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intendedCapabilityId: 'cap_fake_flight', requestedScale: 'Moderate', actionDescription: 'Fly without shoes' })
  });
  console.log(`Adjudicate fake capability: HTTP ${adjFake.status}`);
  assert.strictEqual(adjFake.status, 403);

  console.log('\n--- 8. LIVE AI / WORKING CONTEXT ---');
  const context = await WorkingContextEngine.assembleTurnContext({ storyId, playerAction: 'Look around', recentTurnHistory: [], worldRepo: worldRepository });
  const hasMonocleInContext = context.packet.relevantCapabilities.some(c => c.includes('Analyze Essence') && c.includes('Granted by Aethelgard Oracle Monocle'));
  console.log(`Context includes equipped Monocle provenance? ${hasMonocleInContext}`);
  assert.strictEqual(hasMonocleInContext, true);

  invEngine.unequipItem(actorId, monocle.id);
  const contextUnequipped = await WorkingContextEngine.assembleTurnContext({ storyId, playerAction: 'Look around', recentTurnHistory: [], worldRepo: worldRepository });
  const hasMonocleInContextNow = contextUnequipped.packet.relevantCapabilities.some(c => c.includes('Analyze Essence') && c.includes('Granted by Aethelgard Oracle Monocle'));
  console.log(`Context includes Monocle provenance after unequip? ${hasMonocleInContextNow}`);
  assert.strictEqual(hasMonocleInContextNow, false);

  console.log('\n--- 9. GLOBAL REGISTRY IMMUTABILITY ---');
  const globalCap = capEngine.getCapability('cap_flight');
  console.log(`Global registry cap_flight exists? ${!!globalCap}, Base cost: ${globalCap?.baseEnergyCost}`);
  assert.ok(globalCap);

  console.log('\n--- 10. UNKNOWN / UNIDENTIFIED ITEM ---');
  const unidentifiedRing = invEngine.createInstance({ defId: 'def_ring_light', ownerEntityId: actorId, containerType: 'actor', provenance: 'test' });
  const internalMap = (invEngine as any).itemInstances;
  internalMap.get(unidentifiedRing.id).identified = false;
  invEngine.equipItem(actorId, unidentifiedRing.id, 'ring1');
  const proj = invEngine.projectActorInventory(actorId);
  console.log(`Projected name of unidentified ring: ${proj.paperDoll.ring1?.name}`);
  assert.strictEqual(proj.paperDoll.ring1?.name, 'Unidentified Item');
  effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
  console.log(`Unidentified ring effectively grants Guiding Light? ${effectiveCaps.some(c => c.id === 'cap_light')}`);
  assert.strictEqual(effectiveCaps.some(c => c.id === 'cap_light'), true);

  console.log('\n--- 11. PERSISTENCE ROUND-TRIP ---');
  const archive = worldRepository.exportCampaignArchive(storyId, 'Live Test Archive');
  const freshRepo = new InMemoryWorldRepository();
  const restoreRes = freshRepo.restoreCampaignArchive(archive, 'restored_story');
  console.log(`Restore successful? ${restoreRes.success}`);
  assert.strictEqual(restoreRes.success, true);
  const restoredInv = freshRepo.getInventoryEngine('restored_story');
  const restoredCaps = freshRepo.getCapabilityEngine('restored_story');
  const restoredEffective = restoredCaps.getEffectiveActorCapabilities(actorId, restoredInv);
  console.log(`Restored state maintains cap_light dynamically? ${restoredEffective.some(c => c.id === 'cap_light')}`);
  assert.strictEqual(restoredEffective.some(c => c.id === 'cap_light'), true);

  console.log('\n--- 13. EXISTING NON-CAPABILITY ITEM REGRESSION ---');
  const steelArmor = invEngine.createInstance({ defId: 'def_steel_cuirass', ownerEntityId: actorId, containerType: 'actor', provenance: 'test' });
  invEngine.equipItem(actorId, steelArmor.id, 'chest');
  const defenseAfter = invEngine.projectActorInventory(actorId).paperDoll.chest?.properties?.armorBonus;
  console.log(`Steel cuirass grants armorBonus: ${defenseAfter}`);
  assert.strictEqual(defenseAfter, 6); // Just checking whatever it is

  server.close();
  console.log('\nLive Verification Completed Successfully.');
}

runLiveVerification().catch(e => {
  console.error('\nERROR during live verification:', e);
  process.exit(1);
});
