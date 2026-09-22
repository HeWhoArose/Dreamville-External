import React, { useState, useEffect } from 'react';
import { CompendiumCategory, CompendiumItem, COMPENDIUM_CATEGORIES } from './compendiumTypes';
import { INITIAL_COMPENDIUM_ITEMS } from './compendiumData';
import { CompendiumGallery } from './CompendiumGallery';
import { CompendiumDetail } from './CompendiumDetail';
import { Badge } from '../common/Badge';
import { apiClient } from '../../services/apiClient';

export const COMPENDIUM_STORAGE_KEY = 'dreambook_compendium_collection_v1';

export const loadStoredCompendiumItems = (): CompendiumItem[] => {
  if (typeof window === 'undefined') return INITIAL_COMPENDIUM_ITEMS;
  try {
    const raw = localStorage.getItem(COMPENDIUM_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load compendium items from localStorage', e);
  }
  return INITIAL_COMPENDIUM_ITEMS;
};

export const saveCompendiumItems = (items: CompendiumItem[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COMPENDIUM_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('Failed to save compendium items to localStorage', e);
  }
};

export interface CompendiumViewProps {
  initialCategory?: CompendiumCategory;
  onNavigateCategory?: (category: CompendiumCategory) => void;
  className?: string;
  activeStoryId?: string;
}

export const CompendiumView: React.FC<CompendiumViewProps> = ({
  initialCategory = 'characters',
  onNavigateCategory,
  className = '',
  activeStoryId,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<CompendiumCategory>(initialCategory);
  const [selectedItem, setSelectedItem] = useState<CompendiumItem | null>(null);
  const [items, setItems] = useState<CompendiumItem[]>(() => loadStoredCompendiumItems());

  useEffect(() => {
    saveCompendiumItems(items);
  }, [items]);

  useEffect(() => {
    if (!activeStoryId) return;
    apiClient.getEntities(activeStoryId, { includeTemplates: false })
      .then((res) => {
        const entities = Array.isArray(res?.entities) ? res.entities : [];
        if (!entities.length) return;
        const generated: CompendiumItem[] = entities.map((entity: any) => {
          const category = entity.kind === 'CREATURE' || entity.kind === 'ANIMAL' || entity.kind === 'MONSTER' || entity.kind === 'BOSS'
            ? 'creatures'
            : entity.kind === 'PLAYER' || entity.kind === 'CHARACTER'
              ? 'characters'
              : 'npcs';
          const stats = entity.coreStats
            ? {
                Level: entity.coreStats.level ?? entity.progression?.level ?? 1,
                HP: `${entity.coreStats.hpCurrent ?? 0}/${entity.coreStats.hpMax ?? 0}`,
                AC: entity.coreStats.armorClass ?? 0,
                Speed: entity.coreStats.speed ?? 0,
              }
            : {};
          return {
            id: `entity_${entity.id}`,
            category,
            title: entity.name,
            subtitle: entity.classification?.profession || entity.classification?.role || entity.identity?.species,
            description: entity.background?.history || entity.behavior?.defaultBehavior || `${entity.kind} entity`,
            tags: [...(entity.classification?.tags || []), entity.identity?.species].filter(Boolean),
            worldOrigin: entity.worldId,
            imageUrl: undefined,
            stats,
            classification: entity.classification?.role || entity.kind,
            rarityOrThreat: entity.classification?.threat,
            traits: entity.traits || entity.personality?.traits || [],
            equipment: (entity.equipment || []).join(', '),
            loreSnippet: entity.background?.history,
            provenance: entity.provenance?.source || 'Canonical Entity Registry',
            originType: 'encountered',
            canonicalEntityId: entity.id,
            sourceRun: activeStoryId,
            discoveredAt: entity.updatedAt,
            entityCard: entity,
          } as CompendiumItem;
        });
        setItems((prev) => {
          const withoutOldEntities = prev.filter((item) => !item.canonicalEntityId);
          return [...withoutOldEntities, ...generated];
        });
      })
      .catch(() => {
        // The local compendium remains usable if the story registry is unavailable.
      });
  }, [activeStoryId]);

  const handleCategoryChange = (category: CompendiumCategory) => {
    setSelectedCategory(category);
    onNavigateCategory?.(category);
  };

  const handleAssetChange = (itemId: string, newUrl?: string, provenance?: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              imageUrl: newUrl,
              provenance: provenance || item.provenance,
            }
          : item
      )
    );
    if (selectedItem && selectedItem.id === itemId) {
      setSelectedItem((prev) =>
        prev
          ? {
              ...prev,
              imageUrl: newUrl,
              provenance: provenance || prev.provenance,
            }
          : null
      );
    }
  };

  const currentCategoryMeta = COMPENDIUM_CATEGORIES.find((c) => c.id === selectedCategory);

  return (
    <div className={`space-y-8 animate-in fade-in duration-200 ${className}`} data-testid="compendium-view">
      {/* 1. Compendium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--db-border-default)] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="purple" size="sm">
              Personal Collection & Reference
            </Badge>
            <Badge variant="blue" size="sm">
              Cross-World Archive
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[var(--db-text-primary)]">
            COMPENDIUM
          </h1>
          <p className="text-xs text-[var(--db-text-secondary)] mt-1 max-w-2xl leading-relaxed">
            Your personal collection of worlds, characters, powers, equipment, creatures and discoveries.
          </p>
        </div>

        <div className="p-3 rounded-[var(--db-radius-md)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] text-[11px] text-[var(--db-text-muted)] max-w-sm">
          <span className="font-semibold text-[var(--db-gold-400)] block mb-0.5">✦ Epistemic Separation</span>
          This personal compendium is your player reference layer. In-story worlds maintain their own living canon.
        </div>
      </div>

      {/* 2. Internal Category Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[var(--db-border-subtle)]">
        {COMPENDIUM_CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const count = items.filter((i) => i.category === cat.id).length;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryChange(cat.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--db-radius-md)] text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[var(--db-surface-purple)] text-[var(--db-purple-200)] border border-[var(--db-purple-500)]/40 shadow-[var(--db-shadow-glow-purple)]'
                  : 'text-[var(--db-text-secondary)] hover:text-[var(--db-text-primary)] hover:bg-[var(--db-bg-card)] border border-transparent'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected
                    ? 'bg-[var(--db-purple-500)]/40 text-[var(--db-purple-100)]'
                    : 'bg-[var(--db-bg-card)] text-[var(--db-text-muted)]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Category Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-serif font-bold text-[var(--db-text-primary)]">
            {currentCategoryMeta?.label}
          </h2>
          <p className="text-xs text-[var(--db-text-muted)] mt-0.5">
            {currentCategoryMeta?.description}
          </p>
        </div>
      </div>

      {/* 3. Gallery Architecture */}
      <CompendiumGallery
        items={items}
        selectedCategory={selectedCategory}
        onSelectItem={(item) => setSelectedItem(item)}
        onAssetChange={handleAssetChange}
      />

      {/* 4. Detail Modal */}
      <CompendiumDetail
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onAssetChange={handleAssetChange}
      />
    </div>
  );
};
