import { WorldTimestamp } from './types';

export type ItemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Relic';

export type ItemCategory =
  | 'Weapon'
  | 'Armor'
  | 'Shield'
  | 'Potion'
  | 'Scroll'
  | 'Quest'
  | 'Material'
  | 'Document'
  | 'Food'
  | 'Accessory'
  | 'Tool'
  | 'Miscellaneous';

export type EquipmentSlot =
  | 'head'
  | 'cloak'
  | 'body'
  | 'hands'
  | 'waist'
  | 'legs'
  | 'feet'
  | 'mainHand'
  | 'offHand'
  | 'relic'
  | 'ring1'
  | 'ring2'
  | 'neck';

export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  description: string;
  allowedSlots?: EquipmentSlot[];
  weightKg: number;
  baseValueGold: number;
  maxDurability: number;
  tags: string[];
  properties: Record<string, unknown>;
  defaultAssetId?: string;
}

export interface ItemInstance {
  id: string; // Unique instance ID
  defId: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  quantity: number;
  durability: number;
  maxDurability: number;
  qualityModifier: number; // 1.0 = normal, 1.2 = superior, etc.
  equippedSlot?: EquipmentSlot | null;
  ownerEntityId: string; // Actor ID, container ID, location ID
  containerType: 'actor' | 'container' | 'corpse' | 'shop' | 'armory' | 'ground';
  materials: string[];
  enchantments: string[];
  provenance: string; // 'starter_grant' | 'crafted' | 'looted' | 'merchant'
  isBroken: boolean;
  identified: boolean;
  notes?: string;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  outputDefId: string;
  outputQuantity: number;
  requiredMaterials: { defId: string; count: number }[];
  requiredToolCategory?: string;
  craftingTimeSeconds: number;
  difficultyScore: number;
}

export interface PaperDollSlots {
  head: ItemInstance | null;
  cloak: ItemInstance | null;
  body: ItemInstance | null;
  hands: ItemInstance | null;
  waist: ItemInstance | null;
  legs: ItemInstance | null;
  feet: ItemInstance | null;
  mainHand: ItemInstance | null;
  offHand: ItemInstance | null;
  relic: ItemInstance | null;
  ring1: ItemInstance | null;
  ring2: ItemInstance | null;
  neck: ItemInstance | null;
}

/**
 * InventoryItemEngine
 * Implements Challenge 5 & Addenda V10.3A, V10.3B.
 * Deterministic authority over items, durability degradation, repair, equipment paper-doll, and crafting.
 */
export class InventoryItemEngine {
  private itemDefinitions: Map<string, ItemDefinition> = new Map();
  private itemInstances: Map<string, ItemInstance> = new Map();
  private recipes: Map<string, CraftingRecipe> = new Map();

  constructor() {
    this.seedDefaultDefinitions();
  }

  private seedDefaultDefinitions(): void {
    this.registerDefinition({
      id: 'def_iron_sword',
      name: 'Iron Longsword',
      category: 'Weapon',
      rarity: 'Common',
      description: 'A standard forged iron blade with leather-wrapped hilt.',
      allowedSlots: ['mainHand', 'offHand'],
      weightKg: 1.4,
      baseValueGold: 15,
      maxDurability: 100,
      tags: ['melee', 'slashing', 'iron'],
      properties: { damageDice: '1d8', damageType: 'slashing' },
    });

    this.registerDefinition({
      id: 'def_steel_cuirass',
      name: 'Steel Cuirass',
      category: 'Armor',
      rarity: 'Uncommon',
      description: 'Solid breastplate buffed to a dull grey sheen.',
      allowedSlots: ['body'],
      weightKg: 7.0,
      baseValueGold: 50,
      maxDurability: 150,
      tags: ['heavy_armor', 'steel'],
      properties: { armorBonus: 5 },
    });

    this.registerDefinition({
      id: 'def_iron_ingot',
      name: 'Iron Ingot',
      category: 'Material',
      rarity: 'Common',
      description: 'Smelted iron bar suitable for forge working.',
      weightKg: 0.5,
      baseValueGold: 2,
      maxDurability: 1000,
      tags: ['metal', 'crafting'],
      properties: {},
    });

    this.registerDefinition({
      id: 'def_healing_salve',
      name: 'Alchemical Healing Salve',
      category: 'Potion',
      rarity: 'Common',
      description: 'Potent restorative balm made from crushed mountain moss.',
      weightKg: 0.1,
      baseValueGold: 10,
      maxDurability: 1,
      tags: ['consumable', 'healing'],
      properties: { healAmount: 12 },
    });

    this.registerDefinition({
      id: 'def_brass_astrolabe',
      name: 'Chancery Brass Astrolabe',
      category: 'Tool',
      rarity: 'Rare',
      description: 'A precision-engraved navigational instrument showing meridian angles.',
      allowedSlots: ['hands', 'mainHand', 'offHand', 'relic'],
      weightKg: 1.2,
      baseValueGold: 40,
      maxDurability: 80,
      tags: ['tool', 'astral', 'brass'],
      properties: { observationBonus: 2 },
    });

    this.registerDefinition({
      id: 'def_luminary_veil',
      name: 'Tallow-Treated Luminary Veil',
      category: 'Armor',
      rarity: 'Uncommon',
      description: 'A gossamer cowl treated with mineral oil to filter noxious subterranean vapors.',
      allowedSlots: ['head', 'cloak'],
      weightKg: 0.4,
      baseValueGold: 25,
      maxDurability: 60,
      tags: ['headwear', 'cloth'],
      properties: { hazardResistance: 3 },
    });

    this.registerDefinition({
      id: 'def_leather_boots',
      name: 'Sturdy Trail Boots',
      category: 'Armor',
      rarity: 'Common',
      description: 'Durable leather boots with iron-buckled straps.',
      allowedSlots: ['feet'],
      weightKg: 1.1,
      baseValueGold: 12,
      maxDurability: 120,
      tags: ['footwear', 'leather'],
      properties: { speedBonus: 1 },
    });

    this.registerDefinition({
      id: 'def_iron_shield',
      name: 'Reinforced Iron Buckler',
      category: 'Armor',
      rarity: 'Common',
      description: 'A compact round shield faced with iron banding.',
      allowedSlots: ['offHand'],
      weightKg: 2.8,
      baseValueGold: 20,
      maxDurability: 120,
      tags: ['shield', 'iron'],
      properties: { armorBonus: 2 },
    });

    // Register canonical crafting recipes
    this.registerRecipe({
      id: 'rec_forge_iron_sword',
      name: 'Forge Iron Sword',
      outputDefId: 'def_iron_sword',
      outputQuantity: 1,
      requiredMaterials: [{ defId: 'def_iron_ingot', count: 3 }],
      craftingTimeSeconds: 1800, // 30 minutes
      difficultyScore: 10,
    });

    this.registerRecipe({
      id: 'rec_forge_iron_shield',
      name: 'Forge Iron Buckler',
      outputDefId: 'def_iron_shield',
      outputQuantity: 1,
      requiredMaterials: [{ defId: 'def_iron_ingot', count: 2 }],
      craftingTimeSeconds: 1200,
      difficultyScore: 8,
    });

    this.registerRecipe({
      id: 'recipe_forge_iron_shield',
      name: 'Forge Iron Buckler',
      outputDefId: 'def_iron_shield',
      outputQuantity: 1,
      requiredMaterials: [{ defId: 'def_iron_ingot', count: 2 }],
      craftingTimeSeconds: 1200,
      difficultyScore: 8,
    });

    this.registerRecipe({
      id: 'recipe_forge_iron_sword',
      name: 'Forge Iron Sword',
      outputDefId: 'def_iron_sword',
      outputQuantity: 1,
      requiredMaterials: [{ defId: 'def_iron_ingot', count: 3 }],
      craftingTimeSeconds: 1800,
      difficultyScore: 10,
    });
  }

  public registerDefinition(def: ItemDefinition): void {
    this.itemDefinitions.set(def.id, def);
  }

  public registerRecipe(recipe: CraftingRecipe): void {
    this.recipes.set(recipe.id, recipe);
  }

  public getRecipes(): CraftingRecipe[] {
    return Array.from(this.recipes.values()).map((r) => JSON.parse(JSON.stringify(r)));
  }

  public getItemInstance(itemId: string): ItemInstance | undefined {
    const item = this.itemInstances.get(itemId);
    return item ? JSON.parse(JSON.stringify(item)) : undefined;
  }

  public getItemDefinition(defId: string): ItemDefinition | undefined {
    const def = this.itemDefinitions.get(defId);
    return def ? JSON.parse(JSON.stringify(def)) : undefined;
  }

  public getAllDefinitions(): ItemDefinition[] {
    return Array.from(this.itemDefinitions.values()).map((d) => JSON.parse(JSON.stringify(d)));
  }

  public seedStarterInventoryForActor(actorId: string): void {
    const existing = this.getActorInventory(actorId);
    if (existing.length === 0) {
      this.createInstance({
        defId: 'def_iron_sword',
        ownerEntityId: actorId,
        provenance: 'starter_grant',
        customName: 'Chancery Iron Longsword',
      });
      this.createInstance({
        defId: 'def_steel_cuirass',
        ownerEntityId: actorId,
        provenance: 'starter_grant',
        customName: 'Scribe Steel Cuirass',
      });
      this.createInstance({
        defId: 'def_brass_astrolabe',
        ownerEntityId: actorId,
        provenance: 'starter_grant',
        customName: 'Chancery Brass Astrolabe',
      });
      this.createInstance({
        defId: 'def_luminary_veil',
        ownerEntityId: actorId,
        provenance: 'starter_grant',
        customName: 'Tallow-Treated Luminary Veil',
      });
      this.createInstance({
        defId: 'def_iron_ingot',
        ownerEntityId: actorId,
        quantity: 5,
        provenance: 'starter_grant',
      });
      this.createInstance({
        defId: 'def_healing_salve',
        ownerEntityId: actorId,
        quantity: 2,
        provenance: 'starter_grant',
      });
    }
  }

  public createInstance(params: {
    defId: string;
    ownerEntityId: string;
    containerType?: 'actor' | 'container' | 'corpse' | 'shop' | 'armory' | 'ground';
    quantity?: number;
    provenance: string;
    customName?: string;
  }): ItemInstance {
    const def = this.itemDefinitions.get(params.defId);
    if (!def) {
      throw new Error(`Item definition '${params.defId}' not found.`);
    }

    const instanceId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const instance: ItemInstance = {
      id: instanceId,
      defId: def.id,
      name: params.customName || def.name,
      category: def.category,
      rarity: def.rarity,
      quantity: params.quantity ?? 1,
      durability: def.maxDurability,
      maxDurability: def.maxDurability,
      qualityModifier: 1.0,
      equippedSlot: null,
      ownerEntityId: params.ownerEntityId,
      containerType: params.containerType ?? 'actor',
      materials: [...(def.tags.filter((t) => ['iron', 'steel', 'wood', 'leather'].includes(t)))],
      enchantments: [],
      provenance: params.provenance,
      isBroken: false,
      identified: true,
    };

    this.itemInstances.set(instanceId, instance);
    return JSON.parse(JSON.stringify(instance));
  }

  public getActorInventory(actorId: string): ItemInstance[] {
    const items: ItemInstance[] = [];
    for (const item of this.itemInstances.values()) {
      if (item.ownerEntityId === actorId && item.containerType === 'actor') {
        items.push(JSON.parse(JSON.stringify(item)));
      }
    }
    return items;
  }

  public getActorPaperDoll(actorId: string): PaperDollSlots {
    const doll: PaperDollSlots = {
      head: null,
      cloak: null,
      body: null,
      hands: null,
      waist: null,
      legs: null,
      feet: null,
      mainHand: null,
      offHand: null,
      relic: null,
      ring1: null,
      ring2: null,
      neck: null,
    };

    for (const item of this.itemInstances.values()) {
      if (item.ownerEntityId === actorId && item.equippedSlot) {
        doll[item.equippedSlot] = JSON.parse(JSON.stringify(item));
      }
    }
    return doll;
  }

  /**
   * Equips an item to a designated slot with deterministic checks
   */
  public equipItem(actorId: string, itemId: string, targetSlot: EquipmentSlot): {
    success: boolean;
    errorReason?: string;
    equippedItem?: ItemInstance;
    displacedItem?: ItemInstance;
  } {
    const item = this.itemInstances.get(itemId);
    if (!item) {
      return { success: false, errorReason: `Item ${itemId} not found.` };
    }
    if (item.ownerEntityId !== actorId) {
      return { success: false, errorReason: 'Item is not owned by this actor.' };
    }
    if (item.isBroken) {
      return { success: false, errorReason: 'Cannot equip a broken item.' };
    }

    const def = this.itemDefinitions.get(item.defId);
    if (!def?.allowedSlots?.includes(targetSlot)) {
      return { success: false, errorReason: `Item cannot be equipped in slot ${targetSlot}.` };
    }

    // Unequip currently equipped item in targetSlot if any
    let displaced: ItemInstance | undefined;
    for (const existing of this.itemInstances.values()) {
      if (existing.ownerEntityId === actorId && existing.equippedSlot === targetSlot) {
        existing.equippedSlot = null;
        displaced = JSON.parse(JSON.stringify(existing));
        break;
      }
    }

    item.equippedSlot = targetSlot;
    return {
      success: true,
      equippedItem: JSON.parse(JSON.stringify(item)),
      displacedItem: displaced,
    };
  }

  public unequipItem(
    actorId: string,
    target: string
  ): { success: boolean; errorReason?: string; unequippedItem?: ItemInstance } {
    // 1. Check if target matches an item id directly
    const directItem = this.itemInstances.get(target);
    if (directItem && directItem.ownerEntityId === actorId) {
      if (!directItem.equippedSlot) {
        return { success: false, errorReason: 'Item is not equipped in any slot.' };
      }
      const unequipped = JSON.parse(JSON.stringify(directItem));
      directItem.equippedSlot = null;
      return { success: true, unequippedItem: unequipped };
    }

    // 2. Check if target matches a slot name (case-insensitive or camelCase)
    const slotMapping: Record<string, EquipmentSlot> = {
      head: 'head',
      cloak: 'cloak',
      hands: 'hands',
      relic: 'relic',
      footwear: 'feet',
      feet: 'feet',
      body: 'body',
      waist: 'waist',
      legs: 'legs',
      mainhand: 'mainHand',
      offhand: 'offHand',
      ring1: 'ring1',
      ring2: 'ring2',
      neck: 'neck',
    };
    const mappedSlot = slotMapping[target.toLowerCase()] || (target as EquipmentSlot);

    for (const inst of this.itemInstances.values()) {
      if (inst.ownerEntityId === actorId && inst.equippedSlot === mappedSlot) {
        const unequipped = JSON.parse(JSON.stringify(inst));
        inst.equippedSlot = null;
        return { success: true, unequippedItem: unequipped };
      }
    }

    return { success: false, errorReason: `No equipped item found in slot '${target}'.` };
  }

  /**
   * Applies durability wear to an equipped item (e.g. from combat or environmental strain)
   */
  public degradeDurability(itemId: string, wearAmount: number): {
    currentDurability: number;
    becameBroken: boolean;
  } {
    const item = this.itemInstances.get(itemId);
    if (!item) throw new Error(`Item ${itemId} not found.`);

    item.durability = Math.max(0, item.durability - wearAmount);
    let becameBroken = false;
    if (item.durability === 0 && !item.isBroken) {
      item.isBroken = true;
      item.equippedSlot = null; // Immediately unequipped when broken
      becameBroken = true;
    }

    return { currentDurability: item.durability, becameBroken };
  }

  /**
   * Repairs an item
   */
  public repairItem(itemId: string, repairAmount: number): {
    currentDurability: number;
    restored: boolean;
  } {
    const item = this.itemInstances.get(itemId);
    if (!item) throw new Error(`Item ${itemId} not found.`);

    item.durability = Math.min(item.maxDurability, item.durability + repairAmount);
    if (item.durability > 0 && item.isBroken) {
      item.isBroken = false;
    }

    return { currentDurability: item.durability, restored: !item.isBroken };
  }

  /**
   * Executes Crafting using deterministic material consumption
   */
  public craftItem(actorId: string, recipeId: string): {
    success: boolean;
    errorReason?: string;
    producedItem?: ItemInstance;
  } {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) return { success: false, errorReason: `Recipe ${recipeId} not found.` };

    const actorItems = Array.from(this.itemInstances.values()).filter(
      (i) => i.ownerEntityId === actorId && i.containerType === 'actor'
    );

    // Verify all materials
    for (const req of recipe.requiredMaterials) {
      const availableCount = actorItems
        .filter((i) => i.defId === req.defId)
        .reduce((sum, i) => sum + i.quantity, 0);

      if (availableCount < req.count) {
        return {
          success: false,
          errorReason: `Missing required materials: need ${req.count} of ${req.defId}, have ${availableCount}.`,
        };
      }
    }

    // Consume materials
    for (const req of recipe.requiredMaterials) {
      let remainingToConsume = req.count;
      for (const item of actorItems.filter((i) => i.defId === req.defId)) {
        if (remainingToConsume <= 0) break;
        if (item.quantity <= remainingToConsume) {
          remainingToConsume -= item.quantity;
          this.itemInstances.delete(item.id);
        } else {
          item.quantity -= remainingToConsume;
          remainingToConsume = 0;
        }
      }
    }

    // Create produced instance
    const produced = this.createInstance({
      defId: recipe.outputDefId,
      ownerEntityId: actorId,
      quantity: recipe.outputQuantity,
      provenance: `crafted_via_${recipe.id}`,
    });

    return { success: true, producedItem: produced };
  }

  /**
   * Lossless Campaign Archive Export (DEF-CH13-03)
   */
  public exportState(): {
    itemDefinitions: ItemDefinition[];
    itemInstances: ItemInstance[];
    recipes: CraftingRecipe[];
  } {
    return {
      itemDefinitions: Array.from(this.itemDefinitions.values()).map((d) => ({ ...d })),
      itemInstances: Array.from(this.itemInstances.values()).map((i) => ({ ...i })),
      recipes: Array.from(this.recipes.values()).map((r) => ({ ...r })),
    };
  }

  /**
   * Lossless Campaign Archive Restore (DEF-CH13-03)
   */
  public importState(state: {
    itemDefinitions?: ItemDefinition[];
    itemInstances?: ItemInstance[];
    recipes?: CraftingRecipe[];
  }): void {
    if (!state) return;
    this.itemDefinitions.clear();
    this.itemInstances.clear();
    this.recipes.clear();

    if (Array.isArray(state.itemDefinitions)) {
      for (const def of state.itemDefinitions) {
        this.registerDefinition(def);
      }
    }
    if (Array.isArray(state.itemInstances)) {
      for (const inst of state.itemInstances) {
        this.itemInstances.set(inst.id, { ...inst });
      }
    }
    if (Array.isArray(state.recipes)) {
      for (const rec of state.recipes) {
        this.registerRecipe(rec);
      }
    }
  }
}
