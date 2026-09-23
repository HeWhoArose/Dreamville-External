import {
  StartingEquipmentItem,
  EquipmentClass,
  HandUsage,
  EquipmentSlotId,
} from '../types';

/**
  * Client-side equipment metadata mirror.
  * Server-side InventoryItemEngine is authoritative; these functions are for UI preflight, display, and parity checks.
  */

/**
  * Derives or returns the canonical EquipmentClass for an item.
  */
export function getEquipmentClass(item: Partial<StartingEquipmentItem>): EquipmentClass {
  if (item.equipmentClass) {
    return item.equipmentClass;
  }

  const category = (item.category || '').trim().toUpperCase();
  const name = (item.name || '').trim().toLowerCase();

  if (category === 'WEAPON' || name.includes('blade') || name.includes('sword') || name.includes('bow') || name.includes('kunai') || name.includes('dagger') || name.includes('staff') || name.includes('axe') || name.includes('spear')) {
    return 'WEAPON';
  }
  if (category === 'SHIELD' || name.includes('shield')) {
    return 'SHIELD';
  }
  if (category === 'ARMOR' || name.includes('cuirass') || name.includes('plate') || name.includes('robes') || name.includes('helmet') || name.includes('armor') || name.includes('boots')) {
    return 'ARMOR';
  }
  if (category === 'ACCESSORY' || category === 'RING' || category === 'AMULET' || name.includes('ring') || name.includes('amulet') || name.includes('cloak') || name.includes('necklace') || name.includes('pendant')) {
    return 'ACCESSORY';
  }
  if (category === 'POTION' || name.includes('potion') || name.includes('vial') || name.includes('elixir')) {
    return 'POTION';
  }
  if (category === 'FOOD' || name.includes('apple') || name.includes('ration') || name.includes('food') || name.includes('bread') || name.includes('fruit')) {
    return 'FOOD';
  }
  if (category === 'CONSUMABLE' || name.includes('candy') || name.includes('salve') || name.includes('pill') || name.includes('scroll')) {
    return 'CONSUMABLE';
  }
  if (category === 'TOOL' || name.includes('flashlight') || name.includes('shovel') || name.includes('compass') || name.includes('flint') || name.includes('grappling')) {
    return 'TOOL';
  }
  if (category === 'DOCUMENT' || name.includes('map') || name.includes('writ') || name.includes('letter')) {
    return 'DOCUMENT';
  }
  if (category === 'QUEST') {
    return 'QUEST';
  }
  if (category === 'MATERIAL') {
    return 'MATERIAL';
  }

  return 'MISC';
}

/**
  * Determines whether an item is equippable into paper-doll body/hand slots.
  * Non-equippable items (Food, Potions, Tools, Consumables, Documents) cannot be equipped.
  */
export function isEquipable(item: Partial<StartingEquipmentItem>): boolean {
  if (typeof item.equipable === 'boolean') {
    return item.equipable;
  }

  const eqClass = getEquipmentClass(item);
  switch (eqClass) {
    case 'WEAPON':
    case 'ARMOR':
    case 'SHIELD':
    case 'ACCESSORY':
      return true;
    case 'TOOL':
    case 'CONSUMABLE':
    case 'FOOD':
    case 'POTION':
    case 'DOCUMENT':
    case 'QUEST':
    case 'MATERIAL':
    case 'MISC':
    default:
      return false;
  }
}

/**
  * Determines hand usage for an item: NONE, MAIN_HAND, OFF_HAND, ONE_HAND, TWO_HAND.
  */
export function getHandUsage(item: Partial<StartingEquipmentItem>): HandUsage {
  if (item.handUsage) {
    return item.handUsage;
  }

  const eqClass = getEquipmentClass(item);
  if (eqClass === 'SHIELD') {
    return 'OFF_HAND';
  }

  if (eqClass !== 'WEAPON') {
    return 'NONE';
  }

  // Inspect properties/description/name for two-handed indicators
  const propText = JSON.stringify(item.properties || {}).toLowerCase();
  const descText = (item.description || '').toLowerCase();
  const nameText = (item.name || '').toLowerCase();
  const fullText = `${nameText} ${descText} ${propText}`;

  if (
    fullText.includes('two-hand') ||
    fullText.includes('2h') ||
    fullText.includes('greatsword') ||
    fullText.includes('greataxe') ||
    fullText.includes('bow') ||
    fullText.includes('longbow') ||
    fullText.includes('crossbow') ||
    fullText.includes('staff') ||
    fullText.includes('spear') ||
    fullText.includes('polearm') ||
    fullText.includes('halberd')
  ) {
    return 'TWO_HAND';
  }

  return 'ONE_HAND';
}

/**
  * Returns legal paper-doll equipment slots for an item.
  */
export function getCompatibleEquipmentSlots(item: Partial<StartingEquipmentItem>): EquipmentSlotId[] {
  if (!isEquipable(item)) {
    return [];
  }

  if (item.allowedSlots && item.allowedSlots.length > 0) {
    return item.allowedSlots as EquipmentSlotId[];
  }

  const eqClass = getEquipmentClass(item);
  const name = (item.name || '').toLowerCase();

  if (eqClass === 'WEAPON') {
    const usage = getHandUsage(item);
    if (usage === 'TWO_HAND') {
      return ['mainHand', 'offHand'];
    }
    if (usage === 'OFF_HAND') {
      return ['offHand'];
    }
    return ['mainHand', 'offHand'];
  }

  if (eqClass === 'SHIELD') {
    return ['offHand'];
  }

  if (eqClass === 'ARMOR') {
    if (name.includes('helmet') || name.includes('hat') || name.includes('crown') || name.includes('hood') || name.includes('visor') || name.includes('cap')) {
      return ['head'];
    }
    if (name.includes('boots') || name.includes('shoes') || name.includes('greaves') || name.includes('sabatons')) {
      return ['feet'];
    }
    if (name.includes('gloves') || name.includes('gauntlets') || name.includes('bracers')) {
      return ['gloves'];
    }
    if (name.includes('belt') || name.includes('girdle')) {
      return ['belt'];
    }
    if (name.includes('pants') || name.includes('leggings') || name.includes('cuisses')) {
      return ['legs'];
    }
    return ['body'];
  }

  if (eqClass === 'ACCESSORY') {
    if (name.includes('ring')) return ['ring'];
    if (name.includes('neck') || name.includes('amulet') || name.includes('pendant')) return ['neck'];
    if (name.includes('cloak') || name.includes('cape') || name.includes('backpack')) return ['back'];
    if (name.includes('glove')) return ['gloves'];
    if (name.includes('belt')) return ['belt'];
    return ['ring'];
  }

  return [];
}

/**
  * Calculates which slots an item actually occupies when equipped into a target slot.
  * Two-handed weapons occupy both mainHand and offHand.
  */
export function getOccupiedSlots(item: Partial<StartingEquipmentItem>, targetSlot: EquipmentSlotId): EquipmentSlotId[] {
  const usage = getHandUsage(item);
  if (usage === 'TWO_HAND' && (targetSlot === 'mainHand' || targetSlot === 'offHand')) {
    return ['mainHand', 'offHand'];
  }
  return [targetSlot];
}

/**
  * Verifies if an item can be equipped to a specific slot.
  */
export function canEquipItemToSlot(item: Partial<StartingEquipmentItem>, slot: EquipmentSlotId): boolean {
  if (!isEquipable(item)) return false;
  const compatible = getCompatibleEquipmentSlots(item);
  return compatible.includes(slot);
}

/**
  * Filters inventory to ONLY items compatible with a given paper-doll slot.
  */
export function getItemsCompatibleWithSlot(
  inventory: StartingEquipmentItem[],
  slot: EquipmentSlotId
): StartingEquipmentItem[] {
  return inventory.filter((item) => canEquipItemToSlot(item, slot));
}

/**
  * Calculates currently equipped items that conflict with equipping `item` into `targetSlot`.
  */
export function getConflictingEquippedItems(
  item: StartingEquipmentItem,
  targetSlot: EquipmentSlotId,
  equippedItems: StartingEquipmentItem[]
): StartingEquipmentItem[] {
  const targetSlots = getOccupiedSlots(item, targetSlot);
  const conflicts: StartingEquipmentItem[] = [];

  for (const eqItem of equippedItems) {
    if (eqItem.id === item.id) continue;

    // Check if eqItem is equipped in any of the targetSlots
    const eqItemSlots = getOccupiedSlots(eqItem, (eqItem.slot as EquipmentSlotId) || 'mainHand');
    const intersects = targetSlots.some((s) => eqItemSlots.includes(s));

    if (intersects) {
      if (!conflicts.some((c) => c.id === eqItem.id)) {
        conflicts.push(eqItem);
      }
    }
  }

  return conflicts;
}

/**
  * Normalizes an equipment item with authoritative equipment metadata.
  */
export function normalizeItemEquipmentMetadata<T extends Partial<StartingEquipmentItem>>(item: T): T & StartingEquipmentItem {
  const eqClass = getEquipmentClass(item as StartingEquipmentItem);
  const equipable = isEquipable(item as StartingEquipmentItem);
  const handUsage = getHandUsage(item as StartingEquipmentItem);
  const allowedSlots = getCompatibleEquipmentSlots(item as StartingEquipmentItem);

  return {
    id: item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: item.name || 'Unnamed Item',
    category: item.category || 'Miscellaneous',
    equipmentClass: eqClass,
    equipable,
    handUsage,
    allowedSlots,
    isEquipped: !!item.isEquipped,
    quantity: item.quantity ?? 1,
    rarity: item.rarity || 'Common',
    description: item.description || '',
    properties: item.properties || {},
    effects: item.effects || [],
    provenance: item.provenance || 'PLAYER_INPUT',
    icon: item.icon || { source: 'DEFAULT', status: 'DEFAULT' },
    ...item,
  } as T & StartingEquipmentItem;
}
