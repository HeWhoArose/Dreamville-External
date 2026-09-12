import React, { useState } from 'react';
import { Item } from '../types';
import { Shield, Sparkles, Box, Check, ArrowDownToLine, ArrowUpFromLine, Info } from 'lucide-react';

interface InventoryViewProps {
  inventory: Item[];
  equipment: Record<string, Item | null>;
  onEquipItem: (item: Item) => void;
  onUnequipSlot: (slot: 'Head' | 'Cloak' | 'Hands' | 'Relic' | 'Footwear') => void;
  onInspectItem: (item: Item) => void;
  isProcessingAction: boolean;
}

const EQUIPMENT_SLOTS: ('Head' | 'Cloak' | 'Hands' | 'Relic' | 'Footwear')[] = [
  'Head',
  'Cloak',
  'Hands',
  'Relic',
  'Footwear',
];

export const InventoryView: React.FC<InventoryViewProps> = ({
  inventory,
  equipment,
  onEquipItem,
  onUnequipSlot,
  onInspectItem,
  isProcessingAction,
}) => {
  const [selectedItem, setSelectedItem] = useState<Item | null>(inventory[0] || null);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  const totalWeight = inventory
    .reduce((sum, item) => sum + item.weight * item.quantity, 0)
    .toFixed(1);

  const filteredInventory = inventory.filter((item) => {
    if (activeFilter === 'ALL') return true;
    return item.category.toUpperCase() === activeFilter;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Equipment Slots & Inventory Grid (8 cols) */}
      <div className="lg:col-span-8 space-y-6">
        {/* Equipment Rig Section */}
        <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-5">
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-800">
            <div>
              <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200 font-semibold flex items-center gap-2">
                <span>🛡️</span>
                <span>Active Equipment Rig</span>
              </h3>
              <p className="text-xs text-stone-400">
                Bound to deterministic protagonist state
              </p>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              State Synchronized
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {EQUIPMENT_SLOTS.map((slot) => {
              const equipped = equipment[slot];
              return (
                <div
                  key={slot}
                  className={`rounded-xl p-3 border transition flex flex-col justify-between min-h-[110px] ${
                    equipped
                      ? 'bg-amber-500/5 border-amber-500/30'
                      : 'bg-stone-950/60 border-stone-850'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-stone-400 uppercase">
                    <span>{slot}</span>
                    {equipped && (
                      <span className="text-amber-400 text-xs">✓</span>
                    )}
                  </div>

                  {equipped ? (
                    <div className="my-1.5 text-center">
                      <div className="text-2xl mb-1">{equipped.icon}</div>
                      <div className="text-xs font-semibold text-stone-200 truncate" title={equipped.name}>
                        {equipped.name}
                      </div>
                    </div>
                  ) : (
                    <div className="my-1.5 text-center text-stone-600 text-xs italic">
                      Empty Slot
                    </div>
                  )}

                  {equipped ? (
                    <button
                      id={`unequip-${slot}`}
                      disabled={isProcessingAction}
                      onClick={() => onUnequipSlot(slot)}
                      className="w-full text-[10px] font-mono py-1 rounded bg-stone-850 hover:bg-stone-800 text-stone-300 hover:text-amber-300 border border-stone-750 transition flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <ArrowDownToLine className="w-2.5 h-2.5" />
                      <span>Unequip</span>
                    </button>
                  ) : (
                    <span className="text-[10px] font-mono text-stone-600 text-center block">
                      —
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Inventory Bag Section */}
        <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-800">
            <div>
              <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200 font-semibold flex items-center gap-2">
                <Box className="w-4 h-4 text-amber-400" />
                <span>Player-Visible Inventory ({inventory.length})</span>
              </h3>
              <p className="text-xs text-stone-400">
                Authoritative weight load: <span className="text-stone-200 font-mono font-medium">{totalWeight} / 25.0 kg</span>
              </p>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {['ALL', 'ARTIFACT', 'KEY', 'REAGENT'].map((filter) => (
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
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-amber-400/20" title="Currently equipped" />
                  )}
                  <div>
                    <div className="text-2xl mb-1.5">{item.icon}</div>
                    <div className="text-xs font-semibold text-stone-100 truncate font-serif">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                      {item.category}
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-stone-850 flex items-center justify-between text-[10px] font-mono text-stone-500">
                    <span>Qty: {item.quantity}</span>
                    <span>{item.weight} kg</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Column: Selected Item Detail Inspector (4 cols) */}
      <div className="lg:col-span-4">
        {selectedItem ? (
          <div className="bg-stone-900/80 rounded-2xl border border-stone-800 p-5 sticky top-24 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl shadow-inner">
                {selectedItem.icon}
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-stone-800 text-amber-400 border border-stone-700">
                  {selectedItem.rarity}
                </span>
                <h4 className="text-base font-serif font-bold text-stone-100 mt-1">
                  {selectedItem.name}
                </h4>
                <p className="text-xs text-stone-400 font-mono">
                  {selectedItem.category} • Slot: {selectedItem.equippableSlot || 'Not Equippable'}
                </p>
              </div>
            </div>

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
                <span className="text-stone-200">{selectedItem.weight} kg</span>
              </div>
              <div className="bg-stone-950/50 p-2 rounded-lg border border-stone-850">
                <span className="text-[10px] text-stone-500 block">Quantity</span>
                <span className="text-stone-200">{selectedItem.quantity}</span>
              </div>
            </div>

            {/* Action Buttons for this item */}
            <div className="space-y-2 pt-2">
              {selectedItem.equippableSlot && (
                <button
                  id="equip-selected-item-btn"
                  disabled={isProcessingAction}
                  onClick={() => onEquipItem(selectedItem)}
                  className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs transition flex items-center justify-center gap-2 disabled:opacity-50 font-mono font-semibold"
                >
                  <ArrowUpFromLine className="w-3.5 h-3.5" />
                  <span>Request Equip to {selectedItem.equippableSlot}</span>
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
              Item action requests are validated by the authoritative engine.
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
