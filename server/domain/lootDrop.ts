import type { InventoryItemEngine } from './inventoryItem';

export interface DroppedLoot {
  itemId: string;
  name: string;
  wasEquipped: boolean;
  isBroken: boolean;
}

/**
 * Moves everything a defeated actor carried, equipped gear included, onto the ground of the location where it fell.
 * Dropped items keep their condition (a broken blade stays broken) and are then ordinary ground items, so the
 * existing scene pickup and search authority can find and hand them over. Safe to call twice: a second call finds
 * nothing left to drop.
 */
export function dropDefeatedActorLoot(inventory: InventoryItemEngine, actorId: string, locationId: string): DroppedLoot[] {
  const dropped: DroppedLoot[] = [];
  if (!actorId || !locationId || actorId === locationId) return dropped;
  for (const item of inventory.getActorInventory(actorId)) {
    if (item.destroyedAtSeconds !== undefined) continue;
    const wasEquipped = Boolean(item.equippedSlot);
    if (wasEquipped) inventory.unequipItem(actorId, item.id);
    const moved = inventory.transferItem(item.id, actorId, locationId, 'ground');
    if (!moved.success) continue;
    dropped.push({
      itemId: moved.transferredItem?.id || item.id,
      name: item.name,
      wasEquipped,
      isBroken: item.isBroken,
    });
  }
  return dropped;
}
