import { InventoryItemEngine } from './server/domain/inventoryItem';
import { CapabilityEngine } from './server/domain/capabilityEngine';

const inv = new InventoryItemEngine();
const cap = new CapabilityEngine();
const ACTOR = 'actor1';

cap.powerStates.set(ACTOR, { vesselCapacity: 50 } as any);
cap.actorLearnedCapabilities.set(ACTOR, new Set());

function checkHas(capId: string) {
  const eff = cap.getEffectiveActorCapabilities(ACTOR, inv);
  return eff.some(c => c.id === capId);
}

function check(name: string, act: () => void, expectedHas: string, expect: boolean) {
  act();
  const has = checkHas(expectedHas);
  console.log(`${name}: ${has === expect ? 'PASS' : 'FAIL'} (Expected ${expect}, got ${has})`);
}

console.log("=== A. Flying Shoes ===");
const shoes = inv.createInstance({ defId: 'def_flying_shoes', ownerEntityId: ACTOR, containerType: 'actor' });
check("Unequipped -> Flight unavailable", () => {}, 'cap_flight', false);
check("Equipped -> Flight available", () => inv.equipItem(ACTOR, shoes.id, 'feet'), 'cap_flight', true);
check("Unequipped again -> Flight unavailable", () => inv.unequipItem(ACTOR, shoes.id), 'cap_flight', false);

console.log("\n=== B. Flame Staff ===");
const staff = inv.createInstance({ defId: 'def_flame_staff', ownerEntityId: ACTOR, containerType: 'actor' });
check("Equipped -> Fireball available", () => inv.equipItem(ACTOR, staff.id, 'mainHand'), 'cap_fireball', true);
check("Unequipped -> Fireball unavailable", () => inv.unequipItem(ACTOR, staff.id), 'cap_fireball', false);

console.log("\n=== C. Multiple Sources ===");
check("Learned Fireball + Flame Staff -> EXACTLY ONE EFFECTIVE FIREBALL, BOTH PROVENANCES", () => {
  cap.learnCapability(ACTOR, 'cap_fireball');
  inv.equipItem(ACTOR, staff.id, 'mainHand');
  const eff = cap.getEffectiveActorCapabilities(ACTOR, inv);
  const fb = eff.filter(c => c.id === 'cap_fireball');
  console.log(`  Count of fireball capabilities: ${fb.length} (Expected 1)`);
  if (fb.length === 1) {
    console.log(`  Sources:`, fb[0].sources.map(s => s.type));
  }
}, 'cap_fireball', true);
check("Unequip Flame Staff -> Fireball survives through learned source", () => {
  inv.unequipItem(ACTOR, staff.id);
}, 'cap_fireball', true);

console.log("\n=== D. Broken Item ===");
check("Equip Flame Staff -> Fireball available", () => {
  cap.unlearnCapability(ACTOR, 'cap_fireball'); // reset
  inv.equipItem(ACTOR, staff.id, 'mainHand');
}, 'cap_fireball', true);
check("Break staff -> item-sourced Fireball unavailable immediately", () => {
  inv.degradeDurability(staff.id, 9999);
}, 'cap_fireball', false);

