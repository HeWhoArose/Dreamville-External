import React, { useState } from 'react';
import { Item, CraftingRecipe } from '../types';
import {
  Shield,
  Sparkles,
  Box,
  Check,
  ArrowDownToLine,
  ArrowUpFromLine,
  Info,
  Wrench,
  Hammer,
  AlertTriangle,
  Flame,
} from 'lucide-react';

interface InventoryViewProps {
  inventory: Item[];
  equipment: Record<string, Item | null>;
  onEquipItem: (item: Item, targetSlot?: string) => void;
  onUnequipSlot: (slot: string) => void;
  onInspectItem: (item: Item) => void;
  recipes?: CraftingRecipe[];
  onCraftRecipe?: (recipeId: string) => void;
  onRepairItem?: (itemId: string) => void;
  isProcessingAction: boolean;
}

interface EquipmentSlotDef {
  key: string;
  label: string;
  icon: string;
  group: 'combat' | 'attire' | 'accessories';
}

const CANONICAL_PAPER_DOLL_SLOTS: EquipmentSlotDef[] = [
  { key: 'head', label: 'Head', icon: '👑', group: 'attire' },
  { key: 'cloak', label: 'Cloak', icon: '🧣', group: 'attire' },
  { key: 'body', label: 'Body', icon: '🛡️', group: 'attire' },
  { key: 'hands', label: 'Hands', icon: '🧤', group: 'attire' },
  { key: 'waist', label: 'Waist', icon: '🎗️', group: 'attire' },
  { key: 'legs', label: 'Legs', icon: '👖', group: 'attire' },
  { key: 'feet', label: 'Footwear', icon: '👢', group: 'attire' },
  { key: 'mainHand', label: 'Main Hand', icon: '⚔️', group: 'combat' },
  { key: 'offHand', label: 'Off Hand', icon: '🛡️', group: 'combat' },
  { key: 'relic', label: 'Relic', icon: '🔮', group: 'accessories' },
  { key: 'neck', label: 'Necklace', icon: '📿', group: 'accessories' },
  { key: 'ring1', label: 'Ring I', icon: '💍', group: 'accessories' },
  { key: 'ring2', label: 'Ring II', icon: '💍', group: 'accessories' },
];

export const InventoryView: React.FC<InventoryViewProps> = ({
  inventory,
  equipment,
  onEquipItem,
  onUnequipSlot,
  onInspectItem,
  recipes = [],
  onCraftRecipe,
  onRepairItem,
  isProcessingAction,
}) => {
  const [selectedItem, setSelectedItem] = useState<Item | null>(inventory[0] || null);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'BAG' | 'WORKSHOP'>('BAG');

  const totalWeight = inventory
    .reduce((sum, item) => sum + (item.weight || 0) * (item.quantity || 1), 0)
    .toFixed(1);

  const filteredInventory = inventory.filter((item) => {
    if (activeFilter === 'ALL') return true;
    return item.category?.toUpperCase() === activeFilter;
  });

  const getEquippedItemForSlot = (slotKey: string): Item | null => {
    const directMatch = equipment[slotKey];
    if (directMatch) return directMatch;
    const capitalized = slotKey.charAt(0).toUpperCase() + slotKey.slice(1);
    return equipment[capitalized] || null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: 13-Slot Paper-Doll Rig + Bag/Workshop Tabs (8 cols) */}
      <div className="lg:col-span-8 space-y-6">
        {/* Canonical 13-Slot Paper-Doll Rig */}
        <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-5">
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-800">
            <div>
              <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200 font-semibold flex items-center gap-2">
                <span>🛡️</span>
                <span>Canonical Equipment Rig (13 Slots)</span>
              </h3>
              <p className="text-xs text-stone-400">
                Server-authoritative paper-doll state & active bonuses
              </p>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Authoritative Rig
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
            {CANONICAL_PAPER_DOLL_SLOTS.map((slot) => {
              const equipped = getEquippedItemForSlot(slot.key);
              const durabilityPct =
                equipped && equipped.maxDurability && equipped.maxDurability > 0
                  ? Math.round(((equipped.durability ?? equipped.maxDurability) / equipped.maxDurability) * 100)
                  : 100;

              return (
                <div
                  key={slot.key}
                  className={`rounded-xl p-2.5 border transition flex flex-col justify-between min-h-[110px] ${
                    equipped
                      ? equipped.isBroken
                        ? 'bg-red-950/20 border-red-500/40'
                        : 'bg-amber-500/5 border-amber-500/30'
                      : 'bg-stone-950/60 border-stone-850'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-stone-400 uppercase">
                    <span className="truncate" title={slot.label}>
                      {slot.label}
                    </span>
                    {equipped && !equipped.isBroken && (
                      <span className="text-amber-400 text-xs">✓</span>
                    )}
                    {equipped?.isBroken && (
                      <span className="text-red-400 text-xs font-bold">!</span>
                    )}
                  </div>

                  {equipped ? (
                    <div className="my-1 text-center">
                      <div className="text-xl mb-0.5">{equipped.icon || slot.icon}</div>
                      <div
                        className="text-[11px] font-semibold text-stone-200 truncate font-serif"
                        title={equipped.name}
                      >
                        {equipped.name}
                      </div>
                      {/* Durability Meter */}
                      <div className="mt-1 w-full bg-stone-950 rounded-full h-1 overflow-hidden border border-stone-800">
                        <div
                          className={`h-full ${
                            equipped.isBroken
                              ? 'bg-red-500'
                              : durabilityPct < 30
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${durabilityPct}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="my-1 text-center text-stone-600 text-xs italic flex flex-col items-center justify-center flex-1">
                      <span className="text-base opacity-40">{slot.icon}</span>
                      <span className="text-[10px]">Empty</span>
                    </div>
                  )}

                  {equipped ? (
                    <button
                      id={`unequip-${slot.key}`}
                      disabled={isProcessingAction}
                      onClick={() => onUnequipSlot(slot.key)}
                      className="w-full text-[10px] font-mono py-0.5 rounded bg-stone-850 hover:bg-stone-800 text-stone-300 hover:text-amber-300 border border-stone-750 transition flex items-center justify-center gap-1 disabled:opacity-50 mt-1"
                    >
                      <ArrowDownToLine className="w-2.5 h-2.5" />
                      <span>Unequip</span>
                    </button>
                  ) : (
                    <span className="text-[9px] font-mono text-stone-700 text-center block mt-1">
                      —
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Navigation Tabs for Bag vs Workshop */}
        <div className="flex items-center gap-2 border-b border-stone-800 pb-2">
          <button
            id="tab-inventory-bag"
            onClick={() => setActiveTab('BAG')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-medium transition flex items-center gap-2 ${
              activeTab === 'BAG'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-stone-400 hover:text-stone-200 bg-stone-900/40 border border-transparent'
            }`}
          >
            <Box className="w-4 h-4" />
            <span>Inventory Bag ({inventory.length})</span>
          </button>

          <button
            id="tab-inventory-workshop"
            onClick={() => setActiveTab('WORKSHOP')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-medium transition flex items-center gap-2 ${
              activeTab === 'WORKSHOP'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-stone-400 hover:text-stone-200 bg-stone-900/40 border border-transparent'
            }`}
          >
            <Hammer className="w-4 h-4" />
            <span>Crafting Workshop ({recipes.length})</span>
          </button>
        </div>

        {/* Tab 1: Inventory Bag Section */}
        {activeTab === 'BAG' && (
          <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-800">
              <div>
                <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200 font-semibold flex items-center gap-2">
                  <Box className="w-4 h-4 text-amber-400" />
                  <span>Item Roster</span>
                </h3>
                <p className="text-xs text-stone-400">
                  Total load: <span className="text-stone-200 font-mono font-medium">{totalWeight} / 35.0 kg</span>
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {['ALL', 'WEAPON', 'ARMOR', 'ARTIFACT', 'MATERIAL', 'REAGENT', 'TOME'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                      activeFilter === filter
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-850'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Item Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredInventory.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const isEquipped = Object.values(equipment).some(
                  (eq) => eq?.id === item.id
                );
                const durabilityPct =
                  item.maxDurability && item.maxDurability > 0
                    ? Math.round(((item.durability ?? item.maxDurability) / item.maxDurability) * 100)
                    : 100;

                return (
                  <button
                    key={item.id}
                    id={`item-${item.id}`}
                    onClick={() => {
                      setSelectedItem(item);
                      onInspectItem(item);
                    }}
                    className={`p-3 rounded-xl border text-left transition relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                        : 'bg-stone-950/70 border-stone-850 hover:border-stone-700 hover:bg-stone-900/60'
                    }`}
                  >
                    {isEquipped && (
                      <span
                        className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-amber-400/20"
                        title="Currently equipped"
                      />
                    )}
                    <div>
                      <div className="text-2xl mb-1.5">{item.icon || '📦'}</div>
                      <div className="text-xs font-semibold text-stone-100 truncate font-serif">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-stone-400 font-mono mt-0.5 flex items-center justify-between">
                        <span>{item.category}</span>
                        {item.isBroken && (
                          <span className="text-red-400 font-semibold">BROKEN</span>
                        )}
                      </div>
                    </div>

                    {/* Durability gauge if applicable */}
                    {item.maxDurability && item.maxDurability > 0 && (
                      <div className="mt-2 w-full bg-stone-950 rounded-full h-1 overflow-hidden border border-stone-800">
                        <div
                          className={`h-full ${
                            item.isBroken
                              ? 'bg-red-500'
                              : durabilityPct < 30
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${durabilityPct}%` }}
                        />
                      </div>
                    )}

                    <div className="mt-2 pt-2 border-t border-stone-850 flex items-center justify-between text-[10px] font-mono text-stone-500">
                      <span>Qty: {item.quantity}</span>
                      <span>{item.weight || 0} kg</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Crafting Workshop Section */}
        {activeTab === 'WORKSHOP' && (
          <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div>
                <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200 font-semibold flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>Authoritative Forging & Crafting</span>
                </h3>
                <p className="text-xs text-stone-400">
                  Deterministic consumption of raw materials via recipes
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recipes.map((recipe) => {
                // Check if protagonist has all required materials
                const canCraft = recipe.requiredMaterials.every((req) => {
                  const matchingItem = inventory.find((i) => i.defId === req.defId);
                  return matchingItem && matchingItem.quantity >= req.count;
                });

                return (
                  <div
                    key={recipe.id}
                    id={`recipe-${recipe.id}`}
                    className="p-4 rounded-xl border border-stone-800 bg-stone-950/70 space-y-3 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-serif font-bold text-sm text-stone-100">
                          {recipe.name}
                        </h4>
                        <span className="text-[10px] font-mono text-stone-400 bg-stone-850 px-2 py-0.5 rounded border border-stone-750">
                          Diff: {recipe.difficultyScore}
                        </span>
                      </div>
                      <p className="text-xs text-stone-400 mt-1">
                        Produces: <span className="text-amber-300 font-medium">{recipe.outputDefId}</span> (x{recipe.outputQuantity})
                      </p>

                      <div className="mt-3 space-y-1">
                        <span className="text-[10px] font-mono uppercase text-stone-500 block">
                          Required Materials:
                        </span>
                        {recipe.requiredMaterials.map((req) => {
                          const matchingItem = inventory.find((i) => i.defId === req.defId);
                          const availableCount = matchingItem ? matchingItem.quantity : 0;
                          const hasEnough = availableCount >= req.count;

                          return (
                            <div
                              key={req.defId}
                              className="text-xs font-mono flex items-center justify-between text-stone-300 bg-stone-900/60 px-2 py-1 rounded"
                            >
                              <span>{req.defId}</span>
                              <span className={hasEnough ? 'text-emerald-400' : 'text-red-400'}>
                                {availableCount} / {req.count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      id={`craft-btn-${recipe.id}`}
                      disabled={!canCraft || isProcessingAction || !onCraftRecipe}
                      onClick={() => onCraftRecipe && onCraftRecipe(recipe.id)}
                      className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs transition flex items-center justify-center gap-2 disabled:opacity-40 font-mono font-semibold"
                    >
                      <Hammer className="w-3.5 h-3.5" />
                      <span>{canCraft ? 'Forge Artifact' : 'Missing Materials'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Selected Item Detail Inspector (4 cols) */}
      <div className="lg:col-span-4">
        {selectedItem ? (
          <div className="bg-stone-900/80 rounded-2xl border border-stone-800 p-5 sticky top-24 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl shadow-inner">
                {selectedItem.icon || '📦'}
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-stone-800 text-amber-400 border border-stone-700">
                  {selectedItem.rarity || 'Common'}
                </span>
                <h4 className="text-base font-serif font-bold text-stone-100 mt-1">
                  {selectedItem.name}
                </h4>
                <p className="text-xs text-stone-400 font-mono">
                  {selectedItem.category} • Slot: {selectedItem.equippableSlot || 'Non-Equippable'}
                </p>
              </div>
            </div>

            {/* Durability Status */}
            {selectedItem.maxDurability && selectedItem.maxDurability > 0 && (
              <div className="bg-stone-950/70 rounded-xl p-3 border border-stone-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-stone-400">Durability Integrity:</span>
                  <span
                    className={`font-semibold ${
                      selectedItem.isBroken
                        ? 'text-red-400'
                        : selectedItem.durability! < 30
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {selectedItem.durability ?? selectedItem.maxDurability} / {selectedItem.maxDurability}
                  </span>
                </div>
                <div className="w-full bg-stone-900 rounded-full h-1.5 overflow-hidden border border-stone-800">
                  <div
                    className={`h-full ${
                      selectedItem.isBroken
                        ? 'bg-red-500'
                        : (selectedItem.durability ?? 100) < 30
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{
                      width: `${Math.round(
                        ((selectedItem.durability ?? selectedItem.maxDurability) / selectedItem.maxDurability) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="bg-stone-950/70 rounded-xl p-3 border border-stone-850">
              <span className="text-[10px] font-mono uppercase text-stone-500 block mb-1">
                Item Lore & Contract Record
              </span>
              <p className="text-xs text-stone-300 leading-relaxed font-serif">
                {selectedItem.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-stone-950/50 p-2 rounded-lg border border-stone-850">
                <span className="text-[10px] text-stone-500 block">Unit Weight</span>
                <span className="text-stone-200">{selectedItem.weight || 0} kg</span>
              </div>
              <div className="bg-stone-950/50 p-2 rounded-lg border border-stone-850">
                <span className="text-[10px] text-stone-500 block">Quantity</span>
                <span className="text-stone-200">{selectedItem.quantity || 1}</span>
              </div>
            </div>

            {/* Action Buttons for this item */}
            <div className="space-y-2 pt-2">
              {selectedItem.equippableSlot && (
                <button
                  id="equip-selected-item-btn"
                  disabled={isProcessingAction || selectedItem.isBroken}
                  onClick={() => onEquipItem(selectedItem, selectedItem.equippableSlot)}
                  className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs transition flex items-center justify-center gap-2 disabled:opacity-50 font-mono font-semibold"
                >
                  <ArrowUpFromLine className="w-3.5 h-3.5" />
                  <span>
                    {selectedItem.isBroken
                      ? 'Cannot Equip (Broken)'
                      : `Request Equip to ${selectedItem.equippableSlot}`}
                  </span>
                </button>
              )}

              {/* Repair button if degraded or broken */}
              {selectedItem.maxDurability &&
                (selectedItem.isBroken || (selectedItem.durability ?? 100) < selectedItem.maxDurability) && (
                  <button
                    id="repair-selected-item-btn"
                    disabled={isProcessingAction || !onRepairItem}
                    onClick={() => onRepairItem && onRepairItem(selectedItem.id)}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-stone-100 font-medium text-xs transition flex items-center justify-center gap-2 disabled:opacity-50 font-mono"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Repair Item Integrity</span>
                  </button>
                )}

              <button
                id="inspect-item-btn"
                disabled={isProcessingAction}
                onClick={() => onInspectItem(selectedItem)}
                className="w-full py-2 px-3 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Info className="w-3.5 h-3.5 text-amber-400" />
                <span>Submit Detailed Inspection Request</span>
              </button>
            </div>

            <div className="text-[10px] font-mono text-stone-500 bg-stone-950/40 p-2.5 rounded-lg border border-stone-850/60 text-center">
              Item state mutations are validated authoritatively on the server.
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-800 bg-stone-900/30 p-8 text-center text-stone-500 text-xs">
            Select an item from the inventory grid to inspect its provenance and properties.
          </div>
        )}
      </div>
    </div>
  );
};
