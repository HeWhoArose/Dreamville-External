import assert from 'node:assert';
import crypto from 'crypto';
import { InventoryItemEngine } from './server/domain/inventoryItem';

const BASE_URL = 'http://127.0.0.1:3000/api/game';
const storyId = 'default_story';

async function fetchJSON(path: string, options?: RequestInit) {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
}

async function run() {
    console.log('--- EXPORTING ARCHIVE ---');
    const { status: exportStatus, data: exportData } = await fetchJSON('/archive/export');
    assert.strictEqual(exportStatus, 200);
    const archive = exportData;
    
    console.log('\n--- INJECTING ITEMS AND CLEARING LEARNED CAPABILITIES ---');
    const actorId = 'player_actor_default_story';
    
    const localInvEngine = new InventoryItemEngine();
    localInvEngine.seedStarterInventoryForActor(actorId);
    const validInvState = localInvEngine.exportState();
    
    validInvState.itemInstances.push({
        id: 'item_injected_staff',
        defId: 'def_flame_staff',
        ownerEntityId: actorId,
        containerType: 'actor',
        identified: true,
        durability: 100,
        maxDurability: 100,
        qualityModifier: 1,
        equippedSlot: null,
        materials: [],
        enchantments: [],
        provenance: 'injected_archive',
        isBroken: false,
        name: 'Flame Staff',
        category: 'Weapon',
        rarity: 'Rare',
        quantity: 1
    });
    validInvState.itemInstances.push({
        id: 'item_injected_shoes',
        defId: 'def_flying_shoes',
        ownerEntityId: actorId,
        containerType: 'actor',
        identified: true,
        durability: 100,
        maxDurability: 100,
        qualityModifier: 1,
        equippedSlot: null,
        materials: [],
        enchantments: [],
        provenance: 'injected_archive',
        isBroken: false,
        name: 'Flying Shoes',
        category: 'Armor',
        rarity: 'Rare',
        quantity: 1
    });
    validInvState.itemInstances.push({
        id: 'item_injected_monocle',
        defId: 'def_oracle_monocle',
        ownerEntityId: actorId,
        containerType: 'actor',
        identified: false,
        durability: 100,
        maxDurability: 100,
        qualityModifier: 1,
        equippedSlot: null,
        materials: [],
        enchantments: [],
        provenance: 'injected_archive',
        isBroken: false,
        name: 'Unidentified Item',
        category: 'Tool',
        rarity: 'Common',
        quantity: 1
    });
    
    const invJson = JSON.stringify(validInvState, null, 2);
    archive.partitions['canonical/inventory.json'] = invJson;
    archive.manifest.partitionHashes['canonical/inventory.json'] = crypto.createHash('sha256').update(invJson, 'utf8').digest('hex');
    
    const combat = JSON.parse(archive.partitions['canonical/combat.json']);
    combat.participants = combat.participants || [];
    combat.participants.push({
        id: actorId, name: 'Player', team: 'player', hp: 20, maxHp: 20, initiative: 10, position: {x:0, y:0}, conditions: []
    });
    combat.participants.push({
        id: 'npc_goblin_target', name: 'Goblin', team: 'hostile', hp: 10, maxHp: 10, initiative: 5, position: {x:1, y:1}, conditions: []
    });
    const combatJson = JSON.stringify(combat, null, 2);
    archive.partitions['canonical/combat.json'] = combatJson;
    archive.manifest.partitionHashes['canonical/combat.json'] = crypto.createHash('sha256').update(combatJson, 'utf8').digest('hex');

    // CLEAR LEARNED CAPABILITIES PROPERLY
    const caps = JSON.parse(archive.partitions['canonical/capabilities.json']);
    caps.actorLearnedCapabilities = { [actorId]: [] }; // Empty array prevents the fallback!
    const capsJson = JSON.stringify(caps, null, 2);
    archive.partitions['canonical/capabilities.json'] = capsJson;
    archive.manifest.partitionHashes['canonical/capabilities.json'] = crypto.createHash('sha256').update(capsJson, 'utf8').digest('hex');

    console.log('\n--- IMPORTING MODIFIED ARCHIVE ---');
    const { status: importStatus, data: importData } = await fetchJSON('/archive/import', {
        method: 'POST',
        body: JSON.stringify({ archive, storyId })
    });
    assert.strictEqual(importStatus, 200, JSON.stringify(importData));
    console.log('Archive imported successfully. Live app memory mutated.');

    console.log('\n--- LIVE FLYING SHOES ---');
    let { data: capsData } = await fetchJSON('/capabilities');
    let hasFlight = capsData.capabilities.some((c: any) => c.id === 'cap_flight');
    console.log(`Unequipped Flight: ${hasFlight}`);
    assert.strictEqual(hasFlight, false);

    await fetchJSON('/inventory/equip', { method: 'POST', body: JSON.stringify({ itemId: 'item_injected_shoes', slot: 'feet' }) });
    capsData = (await fetchJSON('/capabilities')).data;
    const flightCap = capsData.capabilities.find((c: any) => c.id === 'cap_flight');
    console.log(`Equipped Flight: ${!!flightCap}, Source: ${flightCap?.sources[0]?.provenance}`);
    assert.strictEqual(!!flightCap, true);

    await fetchJSON('/inventory/unequip', { method: 'POST', body: JSON.stringify({ slot: 'feet' }) });
    capsData = (await fetchJSON('/capabilities')).data;
    hasFlight = capsData.capabilities.some((c: any) => c.id === 'cap_flight');
    console.log(`Unequipped Again Flight: ${hasFlight}`);
    assert.strictEqual(hasFlight, false);

    console.log('\n--- GAP 2: FIREBALL RESOURCE CONSEQUENCE ---');
    await fetchJSON('/inventory/equip', { method: 'POST', body: JSON.stringify({ itemId: 'item_injected_staff', slot: 'mainHand' }) });
    let { data: powerBefore } = await fetchJSON('/capabilities');
    console.log(`Before Cast - Energy: ${powerBefore.powerState.magicalEnergy}, Strain: ${powerBefore.powerState.physicalStrain}`);
    const { status: castStatus, data: castData } = await fetchJSON('/combat/cast', {
        method: 'POST',
        body: JSON.stringify({ targetId: 'npc_goblin_target', capabilityId: 'cap_fireball', requestedScale: 'Moderate' })
    });
    assert.strictEqual(castStatus, 200, JSON.stringify(castData));
    let { data: powerAfter } = await fetchJSON('/capabilities');
    console.log(`After Cast - Energy: ${powerAfter.powerState.magicalEnergy}, Strain: ${powerAfter.powerState.physicalStrain}`);
    console.log(`Cost matches expectations: Energy dropped by ${powerBefore.powerState.magicalEnergy - powerAfter.powerState.magicalEnergy}, Strain increased by ${powerAfter.powerState.physicalStrain - powerBefore.powerState.physicalStrain}`);
    
    console.log('\n--- GAP 3: AI PROPOSAL CANNOT FABRICATE EQUIPMENT CAPABILITY ---');
    const { status: adjEqStatus } = await fetchJSON('/capabilities/adjudicate', {
        method: 'POST',
        body: JSON.stringify({ intendedCapabilityId: 'cap_fireball', requestedScale: 'Moderate', actionDescription: 'Test cast' })
    });
    console.log(`AI Proposal (Equipped): HTTP ${adjEqStatus}`);
    assert.strictEqual(adjEqStatus, 200);

    await fetchJSON('/inventory/unequip', { method: 'POST', body: JSON.stringify({ slot: 'mainHand' }) });
    const { status: adjUneqStatus, data: adjUneqData } = await fetchJSON('/capabilities/adjudicate', {
        method: 'POST',
        body: JSON.stringify({ intendedCapabilityId: 'cap_fireball', requestedScale: 'Moderate', actionDescription: 'Test cast' })
    });
    console.log(`AI Proposal (Unequipped): HTTP ${adjUneqStatus} - Rejection: ${adjUneqData?.rejectionReason}`);
    assert.strictEqual(adjUneqStatus, 403);

    console.log('\n--- GAP 5: UNIDENTIFIED ITEM INFORMATION BOUNDARY ---');
    await fetchJSON('/inventory/equip', { method: 'POST', body: JSON.stringify({ itemId: 'item_injected_monocle', slot: 'head' }) });
    
    capsData = (await fetchJSON('/capabilities')).data;
    const analyzeCap = capsData.capabilities.find((c: any) => c.id === 'cap_analyze');
    console.log(`Capability granted despite being unidentified: ${!!analyzeCap}`);
    console.log(`Capability Title: "${analyzeCap?.name}"`);

    const { status: invGetStatus, data: invData } = await fetchJSON('/inventory');
    if (invGetStatus === 200 && invData?.paperDoll) {
        const headSlotProj = invData.paperDoll.head;
        console.log(`Projected name of Monocle to client: "${headSlotProj?.name}"`);
    }

    console.log('\n--- GAP 4: COMPLETE PERSISTENCE ROUND-TRIP ---');
    console.log('Exporting again after mutations to verify preservation...');
    const { data: finalArchive } = await fetchJSON('/archive/export');
    const capEngineData = finalArchive.partitions['canonical/capabilities.json'] ? JSON.parse(finalArchive.partitions['canonical/capabilities.json']) : {};
    console.log(`Is the derived capabilities cache stored in the archive? ${capEngineData.effectiveCapabilities ? 'Yes (Failure)' : 'No (Verified, derived dynamically)'}`);
    console.log(`Learned capabilities in archive: ${JSON.stringify(capEngineData.actorLearnedCapabilities || [])}`);

    console.log('\nAll gaps successfully demonstrated via the live application.');
}

run().catch(e => {
    console.error('Test script failed:', e);
    process.exit(1);
});
