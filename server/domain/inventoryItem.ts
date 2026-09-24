import { WorldTimestamp } from './types';
import { deterministicId } from './deterministicRng';
import type { CustomRuleDefinition } from '../../src/types';
import type { ProgressionModifier } from './characterProgressionEngine';
import {
	canEquipItemToSlot,
	getOccupiedSlots,
	normalizeEquipmentMetadata,
	normalizeEquipmentSlot,
} from './equipmentRulesEngine';
import type {
	EquipmentClass,
	EquipmentSlot,
	HandUsage,
} from './equipmentRulesEngine';

export type { EquipmentSlot } from './equipmentRulesEngine';

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

export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  description: string;
  allowedSlots?: EquipmentSlot[];
  equipmentClass?: EquipmentClass;
  equipable?: boolean;
  handUsage?: HandUsage;
  weightKg: number;
  baseValueGold: number;
  maxDurability: number;
  tags: string[];
  properties: Record<string, unknown>;
  modifiers?: ProgressionModifier[];
  customRules?: CustomRuleDefinition[];
  grantedCapabilities?: string[];
  consumption?: {
    mode: 'QUANTITY' | 'CHARGE' | 'DESTROY';
    amount?: number;
  };
  maxCharges?: number;
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
  charges?: number;
  maxCharges?: number;
  destroyedAtSeconds?: number;
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
  private globalInstanceCounter: number = 0;

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
      modifiers: [{ id: 'iron_sword_attack', target: 'combat.attackBonus', mode: 'ADD', value: 1, precedence: 60, stackGroup: 'WEAPON_ATTACK', source: { moduleId: 'def_iron_sword', moduleType: 'ITEM', featureId: 'iron_sword_attack', sourceId: 'def_iron_sword', sourceName: 'Iron Longsword', precedence: 60, stackGroup: 'WEAPON_ATTACK' } }],
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
      modifiers: [{ id: 'steel_cuirass_ac', target: 'coreStats.armorClass', mode: 'ADD', value: 5, precedence: 60, stackGroup: 'ARMOR_AC', source: { moduleId: 'def_steel_cuirass', moduleType: 'ITEM', featureId: 'steel_cuirass_ac', sourceId: 'def_steel_cuirass', sourceName: 'Steel Cuirass', precedence: 60, stackGroup: 'ARMOR_AC' } }],
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
      consumption: { mode: 'QUANTITY' },
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
      modifiers: [{ id: 'trail_boots_speed', target: 'coreStats.speed', mode: 'ADD', value: 1, precedence: 60, stackGroup: 'ARMOR_SPEED', source: { moduleId: 'def_leather_boots', moduleType: 'ITEM', featureId: 'trail_boots_speed', sourceId: 'def_leather_boots', sourceName: 'Sturdy Trail Boots', precedence: 60, stackGroup: 'ARMOR_SPEED' } }],
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
      modifiers: [{ id: 'iron_shield_ac', target: 'coreStats.armorClass', mode: 'ADD', value: 2, precedence: 60, stackGroup: 'SHIELD_AC', source: { moduleId: 'def_iron_shield', moduleType: 'ITEM', featureId: 'iron_shield_ac', sourceId: 'def_iron_shield', sourceName: 'Reinforced Iron Buckler', precedence: 60, stackGroup: 'SHIELD_AC' } }],
    });

    // CH3.2 Benchmark Item Definitions
    this.registerDefinition({
      id: 'def_flying_shoes',
      name: 'Winged Hermes Greaves',
      category: 'Armor',
      rarity: 'Rare',
      description: 'Enchanted feathered greaves that grant aerial levitation and flight.',
      allowedSlots: ['feet'],
      weightKg: 0.8,
      baseValueGold: 120,
      maxDurability: 80,
      tags: ['footwear', 'enchanted', 'flight'],
      properties: { speedBonus: 2 },
      modifiers: [{ id: 'flying_shoes_speed', target: 'coreStats.speed', mode: 'ADD', value: 2, precedence: 60, stackGroup: 'ARMOR_SPEED', source: { moduleId: 'def_flying_shoes', moduleType: 'ITEM', featureId: 'flying_shoes_speed', sourceId: 'def_flying_shoes', sourceName: 'Winged Hermes Greaves', precedence: 60, stackGroup: 'ARMOR_SPEED' } }],
      grantedCapabilities: ['cap_flight'],
    });

    this.registerDefinition({
      id: 'def_flame_staff',
      name: 'Pyromancer Cinder Staff',
      category: 'Weapon',
      rarity: 'Rare',
      description: 'An ash-wood staff tipped with a smoldering volcanic crystal.',
      allowedSlots: ['mainHand'],
      weightKg: 2.1,
      baseValueGold: 150,
      maxDurability: 100,
      tags: ['weapon', 'staff', 'fire', 'focus'],
      properties: { damageDice: '1d6', damageType: 'fire' },
      grantedCapabilities: ['cap_fireball'],
    });

    this.registerDefinition({
      id: 'def_oracle_monocle',
      name: 'Aethelgard Oracle Monocle',
      category: 'Tool',
      rarity: 'Rare',
      description: 'A ground quartz lens framed in electrum, revealing hidden resonance and entity qualities.',
      allowedSlots: ['head'],
      weightKg: 0.1,
      baseValueGold: 200,
      maxDurability: 50,
      tags: ['accessory', 'optics', 'divination'],
      properties: { observationBonus: 4 },
      grantedCapabilities: ['cap_analyze'],
    });

    this.registerDefinition({
      id: 'def_ring_light',
      name: 'Ring of Luminescence',
      category: 'Armor',
      rarity: 'Uncommon',
      description: 'A silver band set with a radiant sunstone that emits guiding illumination.',
      allowedSlots: ['ring1', 'ring2'],
      weightKg: 0.05,
      baseValueGold: 60,
      maxDurability: 70,
      tags: ['ring', 'jewelry', 'light'],
      properties: { lightRadius: 10 },
      grantedCapabilities: ['cap_light'],
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
    const normalized = normalizeEquipmentMetadata(def);
    const canonical: ItemDefinition = {
      ...JSON.parse(JSON.stringify(def)),
      equipmentClass: normalized.equipmentClass,
      equipable: normalized.equipable,
      handUsage: normalized.handUsage,
      allowedSlots: normalized.allowedSlots.length > 0 ? normalized.allowedSlots : undefined,
      modifiers: Array.isArray(def.modifiers) ? JSON.parse(JSON.stringify(def.modifiers)) : undefined,
      customRules: Array.isArray(def.customRules) ? JSON.parse(JSON.stringify(def.customRules)) : undefined,
    };
    this.itemDefinitions.set(def.id, canonical);
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
    return this.itemDefinitions.get(defId);
  }

  public getAllDefinitions(): ItemDefinition[] {
    return Array.from(this.itemDefinitions.values()).map((d) => JSON.parse(JSON.stringify(d)));
  }

  public seedFromGenesisEquipment(actorId: string, equipment: {
    equipped?: Array<Record<string, unknown>>;
    inventory?: Array<Record<string, unknown>>;
  }): void {
    const existing = this.getActorInventory(actorId);
    if (existing.length > 0) return;

    const allItems = [
      ...(Array.isArray(equipment?.inventory) ? equipment.inventory : []),
      ...(Array.isArray(equipment?.equipped) ? equipment.equipped : []),
    ];

    for (const raw of allItems) {
      const name = String(raw.name || 'Unnamed Item').trim();
      if (!name) continue;
      const rawCategory = String(raw.category || 'Miscellaneous');
      const category = this.toCanonicalCategory(rawCategory);
      const defId = this.ensureGenesisDefinition(raw, category);
      const created = this.createInstance({
        defId,
        ownerEntityId: actorId,
        quantity: Math.max(1, Math.trunc(Number(raw.quantity ?? 1) || 1)),
        provenance: String(raw.provenance || 'CHARACTER_GENESIS'),
        customName: name,
      });

      if (raw.isEquipped || raw.slot) {
        const requestedSlot = normalizeEquipmentSlot(String(raw.slot || ''));
        if (requestedSlot) {
          const equipped = this.equipItem(actorId, created.id, requestedSlot);
          if (!equipped.success) {
            // Preserve the item in inventory rather than silently losing Genesis state.
            const stored = this.itemInstances.get(created.id);
            if (stored) stored.equippedSlot = null;
          }
        }
      }
    }
  }

  private toCanonicalCategory(category: string): ItemCategory {
    const value = category.toLowerCase();
    if (value.includes('weapon') || value.includes('sword') || value.includes('bow') || value.includes('dagger') || value.includes('staff') || value.includes('axe') || value.includes('mace')) return 'Weapon';
    if (value.includes('shield')) return 'Shield';
    if (value.includes('armor') || value.includes('cuirass') || value.includes('robe') || value.includes('helm') || value.includes('boot')) return 'Armor';
    if (value.includes('potion') || value.includes('salve') || value.includes('elixir')) return 'Potion';
    if (value.includes('scroll') || value.includes('tome') || value.includes('book')) return 'Scroll';
    if (value.includes('tool') || value.includes('kit') || value.includes('lockpick')) return 'Tool';
    if (value.includes('food') || value.includes('ration')) return 'Food';
    if (value.includes('ring') || value.includes('amulet') || value.includes('neck') || value.includes('accessory')) return 'Accessory';
    if (value.includes('document') || value.includes('map') || value.includes('letter')) return 'Document';
    if (value.includes('material') || value.includes('ore') || value.includes('ingot') || value.includes('herb')) return 'Material';
    if (value.includes('quest')) return 'Quest';
    return 'Miscellaneous';
  }

  private normalizeGenesisModifiers(
    rawModifiers: unknown,
    defId: string,
    itemName: string
  ): ProgressionModifier[] | undefined {
    if (!Array.isArray(rawModifiers)) return undefined;

    const modifiers: ProgressionModifier[] = [];
    for (const [index, raw] of rawModifiers.entries()) {
      if (!raw || typeof raw !== 'object') continue;
      const record = raw as Record<string, unknown>;
      const target = typeof record.target === 'string' ? record.target.trim() : '';
      const value = typeof record.value === 'number' ? record.value : Number(record.value);
      if (!target || !Number.isFinite(value)) continue;

      const mode = ['ADD', 'MULTIPLY', 'SET', 'MIN', 'MAX'].includes(String(record.mode))
        ? String(record.mode) as ProgressionModifier['mode']
        : 'ADD';
      const precedence = Number.isFinite(Number(record.precedence))
        ? Number(record.precedence)
        : 60;
      const stackGroup = typeof record.stackGroup === 'string' && record.stackGroup.trim()
        ? record.stackGroup.trim()
        : 'ITEM_EFFECT';

      modifiers.push({
        id: deterministicId('genesis_item_mod', defId, index, target, mode, value),
        target,
        mode,
        value,
        precedence,
        stackGroup,
        source: {
          moduleId: `item:${defId}`,
          moduleType: 'ITEM',
          featureId: String(record.id || `item_modifier_${index}`),
          sourceId: String(record.id || `item_source_${index}`),
          sourceName: itemName,
          precedence,
          stackGroup,
        },
      });
    }

    return modifiers.length ? modifiers : undefined;
  }

  private ensureGenesisDefinition(raw: Record<string, unknown>, category: ItemCategory): string {
    const explicit = String(raw.defId || '').trim();
    const defId = explicit || deterministicId('item_def_genesis', String(raw.id || ''), String(raw.name || ''), category);
    if (this.itemDefinitions.has(defId)) return defId;

    const properties = raw.properties && typeof raw.properties === 'object' && !Array.isArray(raw.properties)
      ? JSON.parse(JSON.stringify(raw.properties))
      : {};

    const maxDurability = Math.max(1, Math.trunc(Number(raw.maxDurability ?? raw.durability ?? 100) || 100));
    const maxChargesValue = Number((raw as any).maxCharges ?? properties.maxCharges);
    const maxCharges = Number.isFinite(maxChargesValue) && maxChargesValue > 0 ? Math.trunc(maxChargesValue) : undefined;
    const consumptionMode = typeof (raw as any).consumptionMode === 'string'
      ? String((raw as any).consumptionMode).toUpperCase()
      : undefined;

    this.registerDefinition({
      id: defId,
      name: String(raw.name || 'Unnamed Item'),
      category,
      rarity: String(raw.rarity || 'Common') as ItemRarity,
      description: String(raw.description || ''),
      allowedSlots: Array.isArray(raw.allowedSlots)
        ? raw.allowedSlots.map((slot) => normalizeEquipmentSlot(String(slot))).filter((slot): slot is EquipmentSlot => Boolean(slot))
        : undefined,
      equipmentClass: typeof raw.equipmentClass === 'string' ? raw.equipmentClass as EquipmentClass : undefined,
      equipable: typeof raw.equipable === 'boolean' ? raw.equipable : undefined,
      handUsage: typeof raw.handUsage === 'string' ? raw.handUsage as HandUsage : undefined,
      weightKg: Math.max(0, Number(raw.weightKg ?? 0) || 0),
      baseValueGold: Math.max(0, Number(raw.baseValueGold ?? 0) || 0),
      maxDurability,
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      properties,
      modifiers: this.normalizeGenesisModifiers(raw.modifiers, defId, String(raw.name || 'Unnamed Item')),
      customRules: Array.isArray((raw as any).customRules) ? JSON.parse(JSON.stringify((raw as any).customRules)) : undefined,
      consumption: ['QUANTITY', 'CHARGE', 'DESTROY'].includes(consumptionMode || '')
        ? { mode: consumptionMode as 'QUANTITY' | 'CHARGE' | 'DESTROY' }
        : undefined,
      maxCharges,
      grantedCapabilities: Array.isArray((raw as any).grantedCapabilities)
        ? (raw as any).grantedCapabilities.map(String)
        : undefined,
    });

    return defId;
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

    this.globalInstanceCounter++;
    const instanceId = `item_${def.id}_${this.globalInstanceCounter}`;
    const initialCharges = typeof def.maxCharges === 'number' ? Math.max(0, Math.trunc(def.maxCharges)) : undefined;
    const instance: ItemInstance = {
      id: instanceId,
      defId: def.id,
      name: params.customName || def.name,
      category: def.category,
      rarity: def.rarity,
      quantity: Math.max(1, Math.trunc(params.quantity ?? 1)),
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
      charges: initialCharges,
      maxCharges: initialCharges,
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

  public getEquippedItems(actorId?: string): ItemInstance[] {
    const items: ItemInstance[] = [];
    for (const item of this.itemInstances.values()) {
      if ((!actorId || item.ownerEntityId === actorId) && item.equippedSlot) {
        items.push(JSON.parse(JSON.stringify(item)));
      }
    }
    return items;
  }

  public getInventoryItems(actorId?: string): ItemInstance[] {
    const items: ItemInstance[] = [];
    for (const item of this.itemInstances.values()) {
      if ((!actorId || item.ownerEntityId === actorId) && !item.equippedSlot && item.containerType === 'actor') {
        items.push(JSON.parse(JSON.stringify(item)));
      }
    }
    return items;
  }

	public projectItemInstance(item: ItemInstance): ItemInstance {
		if (item.identified) {
			return JSON.parse(JSON.stringify(item));
		}
		const projected: ItemInstance = JSON.parse(JSON.stringify(item));
		projected.name = 'Unidentified Item';
		projected.enchantments = [];
		projected.materials = [];
		projected.provenance = 'unknown';
		return projected;
	}

	public projectActorInventory(actorId: string): {
		items: ItemInstance[];
		paperDoll: PaperDollSlots;
		definitions: ItemDefinition[];
	} {
		const rawItems = this.getActorInventory(actorId);
		const projectedItems = rawItems.map((item) => this.projectItemInstance(item));

		const rawPaperDoll = this.getActorPaperDoll(actorId);
		const projectedPaperDoll: PaperDollSlots = { ...rawPaperDoll };
		for (const slotKey of Object.keys(projectedPaperDoll) as (keyof PaperDollSlots)[]) {
			const slotItem = projectedPaperDoll[slotKey];
			if (slotItem) {
				projectedPaperDoll[slotKey] = this.projectItemInstance(slotItem);
			}
		}

		const identifiedDefIds = new Set(
			rawItems.filter((i) => i.identified).map((i) => i.defId)
		);
		const projectedDefinitions = Array.from(this.itemDefinitions.values())
			.filter((def) => identifiedDefIds.has(def.id))
			.map((d) => JSON.parse(JSON.stringify(d)));

		return {
			items: projectedItems,
			paperDoll: projectedPaperDoll,
			definitions: projectedDefinitions,
		};
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
      if (item.ownerEntityId !== actorId || !item.equippedSlot) continue;
      const def = this.itemDefinitions.get(item.defId);
      const occupiedSlots = def ? getOccupiedSlots(def, item.equippedSlot) : [item.equippedSlot];
      for (const slot of occupiedSlots) {
        doll[slot] = JSON.parse(JSON.stringify(item));
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
    displacedItems?: ItemInstance[];
  } {
    const item = this.itemInstances.get(itemId);
    if (!item) return { success: false, errorReason: "Item " + itemId + " not found." };
    if (item.ownerEntityId !== actorId) return { success: false, errorReason: "Item is not owned by this actor." };
    if (item.containerType !== "actor") return { success: false, errorReason: "Only items in the actor inventory can be equipped." };
    if (item.isBroken) return { success: false, errorReason: "Cannot equip a broken item." };

    const normalizedSlot = normalizeEquipmentSlot(targetSlot);
    if (!normalizedSlot) return { success: false, errorReason: "Invalid equipment slot '" + String(targetSlot) + "'." };

    const def = this.itemDefinitions.get(item.defId);
    if (!def) return { success: false, errorReason: "Item definition '" + item.defId + "' not found." };
    if (!canEquipItemToSlot(def, normalizedSlot)) {
      return { success: false, errorReason: "Item cannot be equipped in slot " + normalizedSlot + "." };
    }

    const occupiedSlots = getOccupiedSlots(def, normalizedSlot);
    const displacedItems: ItemInstance[] = [];

    for (const existing of Array.from(this.itemInstances.values())) {
      if (existing.ownerEntityId !== actorId || !existing.equippedSlot || existing.id === item.id) continue;
      const existingDef = this.itemDefinitions.get(existing.defId);
      const existingOccupied = existingDef ? getOccupiedSlots(existingDef, existing.equippedSlot) : [existing.equippedSlot];
      if (occupiedSlots.some((slot) => existingOccupied.includes(slot))) {
        existing.equippedSlot = null;
        displacedItems.push(JSON.parse(JSON.stringify(existing)));
      }
    }

    item.equippedSlot = occupiedSlots[0];
    return {
      success: true,
      equippedItem: JSON.parse(JSON.stringify(item)),
      displacedItem: displacedItems[0],
      displacedItems,
    };
  }

  public unequipItem(
    actorId: string,
    target: string
  ): { success: boolean; errorReason?: string; unequippedItem?: ItemInstance } {
    const directItem = this.itemInstances.get(target);
    if (directItem && directItem.ownerEntityId === actorId) {
      if (!directItem.equippedSlot) return { success: false, errorReason: "Item is not equipped in any slot." };
      const unequipped = JSON.parse(JSON.stringify(directItem));
      directItem.equippedSlot = null;
      return { success: true, unequippedItem: unequipped };
    }

    const mappedSlot = normalizeEquipmentSlot(target);
    if (!mappedSlot) return { success: false, errorReason: "Invalid equipment slot '" + target + "'." };

    for (const inst of this.itemInstances.values()) {
      if (inst.ownerEntityId !== actorId || !inst.equippedSlot) continue;
      const def = this.itemDefinitions.get(inst.defId);
      const occupied = def ? getOccupiedSlots(def, inst.equippedSlot) : [inst.equippedSlot];
      if (occupied.includes(mappedSlot)) {
        const unequipped = JSON.parse(JSON.stringify(inst));
        inst.equippedSlot = null;
        return { success: true, unequippedItem: unequipped };
      }
    }

    return { success: false, errorReason: "No equipped item found in slot '" + target + "'." };
  }

  public getEquipmentModifiers(actorId: string): ProgressionModifier[] {
    const modifiers: ProgressionModifier[] = [];
    for (const item of this.getEquippedItems(actorId)) {
      if (item.isBroken || (item.durability !== undefined && item.durability <= 0)) continue;
      const def = this.itemDefinitions.get(item.defId);
      for (const modifier of def?.modifiers || []) {
        if (!Number.isFinite(modifier.value)) continue;
        const precedence = Number.isFinite(modifier.precedence) ? modifier.precedence : 60;
        modifiers.push({
          ...JSON.parse(JSON.stringify(modifier)),
          id: deterministicId("item_mod", item.id, modifier.id),
          precedence,
          source: {
            ...JSON.parse(JSON.stringify(modifier.source)),
            moduleId: "item:" + (def?.id || item.defId),
            moduleType: "ITEM",
            featureId: modifier.source?.featureId || modifier.id,
            sourceId: deterministicId("item_source", item.id, modifier.id),
            sourceName: item.name,
            precedence,
            stackGroup: modifier.stackGroup,
          },
        });
      }
    }
    return modifiers;
  }

  public getCustomRulesForItem(itemId: string): CustomRuleDefinition[] {
    const item = this.itemInstances.get(itemId);
    if (!item) return [];
    const def = this.itemDefinitions.get(item.defId);
    return (def?.customRules || []).map((rule) => JSON.parse(JSON.stringify(rule)));
  }

  public consumeItem(actorId: string, itemId: string, amount = 1): {
    success: boolean;
    errorReason?: string;
    consumedItemId?: string;
    consumedAmount?: number;
    remainingQuantity?: number;
    remainingCharges?: number;
    destroyed?: boolean;
    definition?: ItemDefinition;
  } {
    const item = this.itemInstances.get(itemId);
    if (!item) return { success: false, errorReason: "Item " + itemId + " not found." };
    if (item.ownerEntityId !== actorId) return { success: false, errorReason: "Item is not owned by this actor." };
    if (item.containerType !== "actor") return { success: false, errorReason: "Only items in the actor inventory can be consumed." };
    if (item.isBroken) return { success: false, errorReason: "Cannot consume a broken item." };
    if (!Number.isInteger(amount) || amount <= 0) return { success: false, errorReason: "Consumption amount must be a positive integer." };

    const def = this.itemDefinitions.get(item.defId);
    if (!def) return { success: false, errorReason: "Item definition '" + item.defId + "' not found." };

    const isConsumable = Boolean(
      def.consumption ||
      def.maxCharges !== undefined ||
      def.tags.some((tag) => tag.toLowerCase() === 'consumable') ||
      ['Potion', 'Food', 'Scroll'].includes(def.category)
    );
    if (!isConsumable) {
      return { success: false, errorReason: "Item is not consumable under its server-authored definition." };
    }

    const mode = def.consumption?.mode || (def.maxCharges !== undefined ? "CHARGE" : "QUANTITY");
    if (item.equippedSlot && mode !== 'CHARGE') {
      return { success: false, errorReason: "Unequip the item before consuming it." };
    }
    const configuredAmount = Math.max(1, Math.trunc(def.consumption?.amount || 1));
    const consumeAmount = Math.max(1, Math.trunc(amount * configuredAmount));

    if (mode === "DESTROY") {
      const snapshot = JSON.parse(JSON.stringify(item));
      this.itemInstances.delete(item.id);
      return {
        success: true,
        consumedItemId: snapshot.id,
        consumedAmount: snapshot.quantity,
        remainingQuantity: 0,
        destroyed: true,
        definition: JSON.parse(JSON.stringify(def)),
      };
    }

    if (mode === "CHARGE") {
      const currentCharges = item.charges ?? item.maxCharges ?? def.maxCharges ?? 0;
      if (currentCharges < consumeAmount) {
        return { success: false, errorReason: "Item has insufficient charges: need " + consumeAmount + ", have " + currentCharges + "." };
      }
      const remainingCharges = currentCharges - consumeAmount;
      if (remainingCharges <= 0) this.itemInstances.delete(item.id);
      else item.charges = remainingCharges;
      return {
        success: true,
        consumedItemId: item.id,
        consumedAmount: consumeAmount,
        remainingCharges: Math.max(0, remainingCharges),
        remainingQuantity: remainingCharges <= 0 ? 0 : item.quantity,
        destroyed: remainingCharges <= 0,
        definition: JSON.parse(JSON.stringify(def)),
      };
    }

    if (item.quantity < consumeAmount) {
      return { success: false, errorReason: "Insufficient item quantity: need " + consumeAmount + ", have " + item.quantity + "." };
    }
    const remainingQuantity = item.quantity - consumeAmount;
    if (remainingQuantity <= 0) this.itemInstances.delete(item.id);
    else item.quantity = remainingQuantity;
    return {
      success: true,
      consumedItemId: item.id,
      consumedAmount: consumeAmount,
      remainingQuantity: Math.max(0, remainingQuantity),
      destroyed: remainingQuantity <= 0,
      definition: JSON.parse(JSON.stringify(def)),
    };
  }

  public destroyItem(itemId: string): {
    success: boolean;
    errorReason?: string;
    destroyedItem?: ItemInstance;
    definition?: ItemDefinition;
  } {
    const item = this.itemInstances.get(itemId);
    if (!item) return { success: false, errorReason: "Item " + itemId + " not found." };
    const destroyedItem = JSON.parse(JSON.stringify(item));
    const definition = this.itemDefinitions.get(item.defId);
    this.itemInstances.delete(itemId);
    return {
      success: true,
      destroyedItem,
      definition: definition ? JSON.parse(JSON.stringify(definition)) : undefined,
    };
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
   * Transfers an item between owners/containers atomically.
   */
  public transferItem(
    itemId: string,
    sourceOwnerId: string,
    targetOwnerId: string,
    targetContainerType: 'actor' | 'container' | 'corpse' | 'shop' | 'armory' | 'ground',
    quantity?: number
  ): {
    success: boolean;
    errorReason?: string;
    transferredItem?: ItemInstance;
  } {
    const item = this.itemInstances.get(itemId);
    if (!item) {
      return { success: false, errorReason: `Item ${itemId} not found.` };
    }
    if (item.ownerEntityId !== sourceOwnerId) {
      return { success: false, errorReason: `Item is not owned by ${sourceOwnerId}.` };
    }
    if (item.equippedSlot) {
      return { success: false, errorReason: `Cannot transfer equipped item.` };
    }

    const transferQty = quantity !== undefined ? quantity : item.quantity;
    if (transferQty <= 0 || transferQty > item.quantity) {
      return { success: false, errorReason: `Invalid transfer quantity.` };
    }

    let transferred: ItemInstance;
    if (transferQty === item.quantity) {
      item.ownerEntityId = targetOwnerId;
      item.containerType = targetContainerType;
      transferred = item;
    } else {
      item.quantity -= transferQty;
      
      this.globalInstanceCounter++;
      const instanceId = `item_${item.defId}_${this.globalInstanceCounter}`;
      
      transferred = {
        ...JSON.parse(JSON.stringify(item)),
        id: instanceId,
        ownerEntityId: targetOwnerId,
        containerType: targetContainerType,
        quantity: transferQty
      };
      this.itemInstances.set(instanceId, transferred);
    }

    return { success: true, transferredItem: JSON.parse(JSON.stringify(transferred)) };
  }

  /**
   * Executes Crafting using deterministic material consumption
   */
  public craftItem(actorId: string, recipeId: string): {
    success: boolean;
    errorReason?: string;
    producedItem?: ItemInstance;
    craftingTimeSeconds?: number;
  } {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) return { success: false, errorReason: `Recipe ${recipeId} not found.` };

    const actorItems = Array.from(this.itemInstances.values()).filter(
      (i) => i.ownerEntityId === actorId && i.containerType === 'actor'
    );

    // Verify tool if required
    if (recipe.requiredToolCategory) {
      const hasTool = actorItems.some(i => {
        const def = this.itemDefinitions.get(i.defId);
        return def && def.category === recipe.requiredToolCategory;
      });
      if (!hasTool) {
        return { success: false, errorReason: `Missing required tool of category: ${recipe.requiredToolCategory}.` };
      }
    }

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

    return { 
      success: true, 
      producedItem: produced, 
      craftingTimeSeconds: recipe.craftingTimeSeconds 
    };
  }

  /**
   * Lossless Campaign Archive Export (DEF-CH13-03)
   */
  public exportState(): {
    itemDefinitions: ItemDefinition[];
    itemInstances: ItemInstance[];
    recipes: CraftingRecipe[];
    globalInstanceCounter: number;
  } {
    return {
      itemDefinitions: Array.from(this.itemDefinitions.values()).map((d) => JSON.parse(JSON.stringify(d))),
      itemInstances: Array.from(this.itemInstances.values()).map((i) => JSON.parse(JSON.stringify(i))),
      recipes: Array.from(this.recipes.values()).map((r) => JSON.parse(JSON.stringify(r))),
      globalInstanceCounter: this.globalInstanceCounter,
    };
  }

  /**
   * Lossless Campaign Archive Restore (DEF-CH13-03)
   */
  public importState(state: {
    itemDefinitions?: ItemDefinition[];
    itemInstances?: ItemInstance[];
    recipes?: CraftingRecipe[];
    globalInstanceCounter?: number;
  }): void {
    if (!state) return;

    if (state.globalInstanceCounter !== undefined) {
      this.globalInstanceCounter = state.globalInstanceCounter;
    }
    this.itemDefinitions.clear();
    this.itemInstances.clear();
    this.recipes.clear();

    if (Array.isArray(state.itemDefinitions)) {
      for (const def of state.itemDefinitions) {
        this.registerDefinition(def);
      }
    }
    if (Array.isArray(state.itemInstances)) {
      for (const raw of state.itemInstances) {
        if (!raw?.id || !raw?.defId) continue;
        const def = this.itemDefinitions.get(raw.defId);
        const inst: ItemInstance = {
          ...JSON.parse(JSON.stringify(raw)),
          quantity: Math.max(1, Math.trunc(Number(raw.quantity ?? 1) || 1)),
          equippedSlot: raw.equippedSlot ? normalizeEquipmentSlot(String(raw.equippedSlot)) || null : null,
          charges:
            raw.charges !== undefined
              ? Math.max(0, Math.trunc(Number(raw.charges) || 0))
              : typeof def?.maxCharges === 'number'
                ? Math.max(0, Math.trunc(def.maxCharges))
                : undefined,
          maxCharges:
            raw.maxCharges !== undefined
              ? Math.max(0, Math.trunc(Number(raw.maxCharges) || 0))
              : typeof def?.maxCharges === 'number'
                ? Math.max(0, Math.trunc(def.maxCharges))
                : undefined,
        };
        this.itemInstances.set(inst.id, inst);
      }
    }
    if (Array.isArray(state.recipes)) {
      for (const rec of state.recipes) {
        this.registerRecipe(rec);
      }
    }
  }
}
