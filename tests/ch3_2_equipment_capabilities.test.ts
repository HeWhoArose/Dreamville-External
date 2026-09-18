import { describe, it, beforeEach, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { Server } from 'http';
import { InventoryItemEngine } from '../server/domain/inventoryItem';
import { CapabilityEngine } from '../server/domain/capabilityEngine';
import { InMemoryWorldRepository, WorldRepository, worldRepository } from '../server/repositories/worldRepository';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { CampaignArchiveService } from '../server/domain/campaignArchive';
import { gameRouter } from '../server/api/gameRoutes';

describe('CH3.2 Item-Bound Capabilities & Equipment-Granted Skills Suite', () => {
  let invEngine: InventoryItemEngine;
  let capEngine: CapabilityEngine;
  let testRepo: WorldRepository;
  const actorId = 'actor_vael_test';

  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/game', gameRouter);

    await new Promise<void>((resolve) => {
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
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    invEngine = new InventoryItemEngine();
    capEngine = new CapabilityEngine();
    testRepo = new InMemoryWorldRepository();
    capEngine.seedStarterPowerStateForActor(actorId);
  });

  // TEST 1: Benchmark Item Definitions
  it('TEST 1: Canonical item definitions declare grantedCapabilities correctly', () => {
    const shoes = invEngine.getItemDefinition('def_flying_shoes');
    const staff = invEngine.getItemDefinition('def_flame_staff');
    const monocle = invEngine.getItemDefinition('def_oracle_monocle');

    assert.ok(shoes, 'def_flying_shoes must exist');
    assert.deepStrictEqual(shoes.grantedCapabilities, ['cap_flight']);
    assert.ok(shoes.allowedSlots?.includes('feet'));

    assert.ok(staff, 'def_flame_staff must exist');
    assert.deepStrictEqual(staff.grantedCapabilities, ['cap_fireball']);
    assert.ok(staff.allowedSlots?.includes('mainHand'));

    assert.ok(monocle, 'def_oracle_monocle must exist');
    assert.deepStrictEqual(monocle.grantedCapabilities, ['cap_analyze']);
    assert.ok(monocle.allowedSlots?.includes('head'));
  });

  // TEST 2: Benchmark Capability Definitions
  it('TEST 2: Canonical capability definitions are registered in CapabilityEngine', () => {
    const flight = capEngine.getCapability('cap_flight');
    const fireball = capEngine.getCapability('cap_fireball');
    const analyze = capEngine.getCapability('cap_analyze');

    assert.ok(flight, 'cap_flight must exist');
    assert.strictEqual(flight.category, 'Movement');
    assert.strictEqual(flight.powerTier, 'Minor');

    assert.ok(fireball, 'cap_fireball must exist');
    assert.strictEqual(fireball.category, 'Magic');
    assert.strictEqual(fireball.powerTier, 'Moderate');

    assert.ok(analyze, 'cap_analyze must exist');
    assert.strictEqual(analyze.category, 'Perception');
    assert.strictEqual(analyze.powerTier, 'Minor');
  });

  // TEST 3: Equipping Item Dynamically Grants Capability
  it('TEST 3: Equipping an item dynamically surfaces granted capability in getEffectiveActorCapabilities', () => {
    // Initial state: no flight
    const initialCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    assert.strictEqual(initialCaps.some((c) => c.id === 'cap_flight'), false);

    // Instantiate & equip flying shoes
    const shoesInstance = invEngine.createInstance({
      defId: 'def_flying_shoes',
      ownerEntityId: actorId,
      containerType: 'actor',
      provenance: 'starter_grant',
    });
    const equipResult = invEngine.equipItem(actorId, shoesInstance.id, 'feet');
    assert.strictEqual(equipResult.success, true);

    // Resolved state: flight is granted with source metadata
    const equippedCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    const flightCap = equippedCaps.find((c) => c.id === 'cap_flight');
    assert.ok(flightCap, 'cap_flight should be granted');
    assert.strictEqual(flightCap.isEquippedItemGrant, true);
    assert.strictEqual(flightCap.isLearned, false);
    assert.strictEqual(flightCap.sources.length, 1);
    assert.strictEqual(flightCap.sources[0].type, 'EQUIPMENT');
    assert.strictEqual(flightCap.sources[0].itemDefId, 'def_flying_shoes');
    assert.strictEqual(flightCap.sources[0].slot, 'feet');
  });

  // TEST 4: Unequipping Item Dynamically Revokes Capability
  it('TEST 4: Unequipping an item dynamically revokes the granted capability', () => {
    const shoesInstance = invEngine.createInstance({
      defId: 'def_flying_shoes',
      ownerEntityId: actorId,
      containerType: 'actor',
      provenance: 'starter_grant',
    });
    invEngine.equipItem(actorId, shoesInstance.id, 'feet');
    assert.strictEqual(capEngine.getEffectiveActorCapabilities(actorId, invEngine).some((c) => c.id === 'cap_flight'), true);

    // Unequip
    const unequipResult = invEngine.unequipItem(actorId, 'feet');
    assert.strictEqual(unequipResult.success, true);

    // Resolved state: flight is gone
    const updatedCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    assert.strictEqual(updatedCaps.some((c) => c.id === 'cap_flight'), false);
  });

  // TEST 5: Innate / Learned Capability Unaffected by Items
  it('TEST 5: Innate/learned capabilities persist regardless of item equip/unequip', () => {
    capEngine.learnCapability(actorId, 'cap_shadow_step');
    assert.strictEqual(capEngine.hasLearnedCapability(actorId, 'cap_shadow_step'), true);

    const capsBefore = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    assert.strictEqual(capsBefore.some((c) => c.id === 'cap_shadow_step'), true);

    // Equip and unequip unrelated item
    const shoesInstance = invEngine.createInstance({
      defId: 'def_flying_shoes',
      ownerEntityId: actorId,
      containerType: 'actor',
      provenance: 'starter_grant',
    });
    invEngine.equipItem(actorId, shoesInstance.id, 'feet');
    invEngine.unequipItem(actorId, 'feet');

    const capsAfter = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    const shadowStep = capsAfter.find((c) => c.id === 'cap_shadow_step');
    assert.ok(shadowStep, 'cap_shadow_step must persist');
    assert.strictEqual(shadowStep.isLearned, true);
  });

  // TEST 6: Dual Source Deduplication & Multi-Provenance
  it('TEST 6: Dual source (Learned + Equipment) produces exactly ONE merged capability entry with multiple sources', () => {
    // 1. Actor learns fireball
    capEngine.learnCapability(actorId, 'cap_fireball');

    // 2. Actor equips Flame Staff (which also grants fireball)
    const staffInstance = invEngine.createInstance({
      defId: 'def_flame_staff',
      ownerEntityId: actorId,
      containerType: 'actor',
      provenance: 'crafted',
    });
    invEngine.equipItem(actorId, staffInstance.id, 'mainHand');

    // 3. Resolve effective capabilities
    const effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    const fireballEntries = effectiveCaps.filter((c) => c.id === 'cap_fireball');

    assert.strictEqual(fireballEntries.length, 1, 'There must be exactly ONE merged entry, no duplicates');
    const entry = fireballEntries[0];
    assert.strictEqual(entry.isLearned, true);
    assert.strictEqual(entry.isEquippedItemGrant, true);
    assert.strictEqual(entry.sources.length, 2, 'Must have 2 provenance source records');

    const sourceTypes = entry.sources.map((s) => s.type);
    assert.ok(sourceTypes.includes('LEARNED'));
    assert.ok(sourceTypes.includes('EQUIPMENT'));
  });

  // TEST 7: Unequipping Dual Source Retains Learned Status
  it('TEST 7: Unequipping dual-source item retains the learned capability without loss', () => {
    capEngine.learnCapability(actorId, 'cap_fireball');
    const staffInstance = invEngine.createInstance({
      defId: 'def_flame_staff',
      ownerEntityId: actorId,
      containerType: 'actor',
      provenance: 'crafted',
    });
    invEngine.equipItem(actorId, staffInstance.id, 'mainHand');
    invEngine.unequipItem(actorId, 'mainHand');

    const effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    const fireball = effectiveCaps.find((c) => c.id === 'cap_fireball');

    assert.ok(fireball, 'Fireball must remain present as learned capability');
    assert.strictEqual(fireball.isLearned, true);
    assert.strictEqual(fireball.isEquippedItemGrant, false);
    assert.strictEqual(fireball.sources.length, 1);
    assert.strictEqual(fireball.sources[0].type, 'LEARNED');
  });

  // TEST 8: Multi-Equipment Stacking Deduplication
  it('TEST 8: Two equipped items granting the same capability merge into one entry with multiple equipment sources', () => {
    const ring1 = invEngine.createInstance({
      defId: 'def_ring_light',
      ownerEntityId: actorId,
      containerType: 'actor',
      provenance: 'starter_grant',
    });
    const ring2 = invEngine.createInstance({
      defId: 'def_ring_light',
      ownerEntityId: actorId,
      containerType: 'actor',
      provenance: 'looted',
    });

    invEngine.equipItem(actorId, ring1.id, 'ring1');
    invEngine.equipItem(actorId, ring2.id, 'ring2');

    const effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    const lightEntries = effectiveCaps.filter((c) => c.id === 'cap_light');

    assert.strictEqual(lightEntries.length, 1, 'Must have exactly one merged entry for cap_light');
    const entry = lightEntries[0];
    assert.strictEqual(entry.sources.length, 2);
    assert.strictEqual(entry.sources[0].slot, 'ring1');
    assert.strictEqual(entry.sources[1].slot, 'ring2');
  });

  // TEST 9: Broken Item Suppresses Grant
  it('TEST 9: Broken item (isBroken=true) does NOT grant capability', () => {
    const shoesInstance = invEngine.createInstance({
      defId: 'def_flying_shoes',
      ownerEntityId: actorId,
      containerType: 'actor',
      provenance: 'starter_grant',
    });
    invEngine.equipItem(actorId, shoesInstance.id, 'feet');

    // Degrade durability until broken
    invEngine.degradeDurability(shoesInstance.id, 100);
    const brokenItem = invEngine.getItemInstance(shoesInstance.id);
    assert.strictEqual(brokenItem?.isBroken, true);

    const effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    assert.strictEqual(effectiveCaps.some((c) => c.id === 'cap_flight'), false, 'Broken item must not grant capability');
  });

  // TEST 10: Durability Zero Suppresses Grant
  it('TEST 10: Item with 0 durability immediately loses capability grant', () => {
    capEngine.unlearnCapability(actorId, 'cap_fireball');

    const staffInstance = invEngine.createInstance({
      defId: 'def_flame_staff',
      ownerEntityId: actorId,
      containerType: 'actor',
      provenance: 'looted',
    });
    invEngine.equipItem(actorId, staffInstance.id, 'mainHand');

    assert.strictEqual(capEngine.getEffectiveActorCapabilities(actorId, invEngine).some((c) => c.id === 'cap_fireball'), true);

    invEngine.degradeDurability(staffInstance.id, 100);

    assert.strictEqual(capEngine.getEffectiveActorCapabilities(actorId, invEngine).some((c) => c.id === 'cap_fireball'), false);
  });

  // TEST 11: Unidentified Item Server-Authoritative Grant
  it('TEST 11: Unidentified item masks client projection but server resolves capability grant accurately', () => {
    const monocleInstance = invEngine.createInstance({
      defId: 'def_oracle_monocle',
      ownerEntityId: actorId,
      containerType: 'actor',
      provenance: 'looted',
    });
    // Mark unidentified
    const engineMap = (invEngine as any).itemInstances as Map<string, any>;
    const raw = engineMap.get(monocleInstance.id);
    if (raw) raw.identified = false;

    invEngine.equipItem(actorId, monocleInstance.id, 'head');

    // Client projection masks the item name
    const projected = invEngine.projectActorInventory(actorId);
    assert.strictEqual(projected.paperDoll.head?.name, 'Unidentified Item');

    // Server-side canonical resolution still grants cap_analyze
    const effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    const analyzeCap = effectiveCaps.find((c) => c.id === 'cap_analyze');
    assert.ok(analyzeCap, 'Server authoritative engine must grant cap_analyze even if unidentified');
  });

  // TEST 12: Unauthorized Capability Rejection at API Route
  it('TEST 12: Live API rejects unequipped/unlearned capability cast with HTTP 403', async () => {
    // Start encounter first to establish participants
    await fetch(`${baseUrl}/combat/encounter/start`, { method: 'POST' });

    // Attempt to cast cap_flight when shoes are NOT equipped
    const res = await fetch(`${baseUrl}/combat/cast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetId: 'npc_goblin_scout',
        capabilityId: 'cap_flight',
      }),
    });

    assert.strictEqual(res.status, 403, 'Should reject unauthorized capability invocation with 403');
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.errorReason.includes('does not possess or have active equipment'));
  });

  // TEST 13: Epistemic Boundary Enforcement with Analyze Capability
  it('TEST 13: Epistemic boundary blocks target analysis on unperceived/concealed entities', async () => {
    await fetch(`${baseUrl}/combat/encounter/start`, { method: 'POST' });

    // Equip oracle monocle on default story player
    const player = worldRepository.getPlayerLifecycle('default_story');
    const serverActorId = player?.actorId || 'player_actor_default_story';
    const inv = worldRepository.getInventoryEngine('default_story');
    const monocle = inv.createInstance({
      defId: 'def_oracle_monocle',
      ownerEntityId: serverActorId,
      containerType: 'actor',
      provenance: 'starter_grant',
    });
    inv.equipItem(serverActorId, monocle.id, 'head');

    // Attempt to target a non-existent / out-of-perception concealed entity
    const target = {
      id: 'entity_unperceived_shadow_99',
      name: 'Hidden Shadow',
      team: 'hostile' as any,
      hp: 10,
      maxHp: 10,
      initiative: 0,
      position: { x: 0, y: 0 },
      conditions: ['Hidden']
    };
    worldRepository.getCombatEngine('default_story').addParticipant(target);

    const res = await fetch(`${baseUrl}/combat/cast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetId: 'entity_unperceived_shadow_99',
        capabilityId: 'cap_analyze',
      }),
    });

    assert.strictEqual(res.status, 403, 'Epistemic checker must block analysis of unperceived target');
  });

  // TEST 14: WorkingContextEngine Projection Integration
  it('TEST 14: WorkingContextEngine includes equipped capabilities and provenance in turn context', async () => {
    const player = testRepo.getPlayerLifecycle('default_story');
    assert.ok(player);

    const caps = testRepo.getCapabilityEngine('default_story');
    caps.seedStarterPowerStateForActor(player.actorId);

    const inv = testRepo.getInventoryEngine('default_story');
    const staff = inv.createInstance({
      defId: 'def_flame_staff',
      ownerEntityId: player.actorId,
      containerType: 'actor',
      provenance: 'starter_grant',
    });
    inv.equipItem(player.actorId, staff.id, 'mainHand');

    const context = await WorkingContextEngine.assembleTurnContext({
      storyId: 'default_story',
      playerAction: 'Prepare battle spell',
      recentTurnHistory: [],
      worldRepo: testRepo,
    });

    assert.ok(context.packet.relevantCapabilities.some((c) => c.includes('Fireball')));
    assert.ok(context.packet.relevantCapabilities.some((c) => c.includes('Granted by Pyromancer Cinder Staff')));
  });

  // TEST 15: Lossless Campaign Archive Preservation
  it('TEST 15: Lossless archive serialization and atomic restore preserves equipment capability dynamic state', () => {
    const storyId = 'test_archive_story';
    const clock = testRepo.getWorldClock(storyId);
    const inv = testRepo.getInventoryEngine(storyId);
    const caps = testRepo.getCapabilityEngine(storyId);

    // Equip flying shoes
    const shoes = inv.createInstance({
      defId: 'def_flying_shoes',
      ownerEntityId: `player_actor_${storyId}`,
      containerType: 'actor',
      provenance: 'starter_grant',
    });
    inv.equipItem(`player_actor_${storyId}`, shoes.id, 'feet');

    // Verify before export
    assert.strictEqual(caps.getEffectiveActorCapabilities(`player_actor_${storyId}`, inv).some((c) => c.id === 'cap_flight'), true);

    // Export archive
    const archive = testRepo.exportCampaignArchive(storyId, 'Test Archive');
    assert.ok(archive);

    // Restore into a fresh repository
    const freshRepo = new InMemoryWorldRepository();
    const restoreResult = freshRepo.restoreCampaignArchive(archive, 'restored_story');
    assert.strictEqual(restoreResult.success, true);

    const restoredInv = freshRepo.getInventoryEngine('restored_story');
    const restoredCaps = freshRepo.getCapabilityEngine('restored_story');

    const restoredEffective = restoredCaps.getEffectiveActorCapabilities(`player_actor_${storyId}`, restoredInv);
    assert.strictEqual(restoredEffective.some((c) => c.id === 'cap_flight'), true, 'Restored state must dynamically yield cap_flight from equipped item');
  });

  // TEST 16: Client Fabrication Rejection
  it('TEST 16: Adjudication rejects client-fabricated capability invocation without valid equipment or learned grant', async () => {
    const res = await fetch(`${baseUrl}/capabilities/adjudicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intendedCapabilityId: 'cap_flight',
        requestedScale: 'Moderate',
        actionDescription: 'Fly without shoes',
      }),
    });

    assert.strictEqual(res.status, 403, 'Must reject fabricated capability grant with 403');
    const data = await res.json();
    assert.strictEqual(data.approved, false);
    assert.ok(data.rejectionReason.includes('does not possess or have active equipment'));
  });
});
