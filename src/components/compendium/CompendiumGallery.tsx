import React, { useState } from 'react';
import { CompendiumItem, CompendiumCategory } from './compendiumTypes';
import { CompendiumCard } from './CompendiumCard';
import { Button } from '../common/Button';

export interface CompendiumGalleryProps {
  items: CompendiumItem[];
  selectedCategory: CompendiumCategory;
  onSelectItem: (item: CompendiumItem) => void;
  onAssetChange?: (itemId: string, newUrl?: string, provenance?: string) => void;
}

export type SortOption = 'title-asc' | 'title-desc' | 'discovered-newest' | 'rarity';

export const CompendiumGallery: React.FC<CompendiumGalleryProps> = ({
  items,
  selectedCategory,
  onSelectItem,
  onAssetChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('title-asc');

  // Filter items by current category
  const categoryItems = items.filter((item) => item.category === selectedCategory);

  // Extract all unique tags in this category
  const allCategoryTags = Array.from(
    new Set(categoryItems.flatMap((item) => item.tags))
  );

  // Filter by search query and tag
  const filteredItems = categoryItems.filter((item) => {
    const matchesSearch =
      searchQuery.trim() === '' ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesTag = !selectedTag || item.tags.includes(selectedTag);

    return matchesSearch && matchesTag;
  });

  // Sort items
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortBy === 'title-asc') {
      return a.title.localeCompare(b.title);
    }
    if (sortBy === 'title-desc') {
      return b.title.localeCompare(a.title);
    }
    if (sortBy === 'discovered-newest') {
      return (b.discoveredAt || '').localeCompare(a.discoveredAt || '');
    }
    if (sortBy === 'rarity') {
      return (a.rarityOrThreat || '').localeCompare(b.rarityOrThreat || '');
    }
    return 0;
  });

  return (
    <div className="space-y-6" data-testid="compendium-gallery">
      {/* Search, Filter, Sort Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)]">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search items, titles, or descriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3.5 py-2 pl-9 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)] placeholder-[var(--db-text-muted)] focus:outline-none focus:border-[var(--db-purple-500)]"
          />
          <svg
            className="w-4 h-4 text-[var(--db-text-muted)] absolute left-3 top-2.5 pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>

        {/* Sort & Quick Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--db-text-muted)]">
            <span className="font-medium">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-2.5 py-1.5 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)] focus:outline-none focus:border-[var(--db-purple-500)] cursor-pointer"
            >
              <option value="title-asc">Title (A-Z)</option>
              <option value="title-desc">Title (Z-A)</option>
              <option value="discovered-newest">Recently Acquired</option>
              <option value="rarity">Rarity / Classification</option>
            </select>
          </div>

          <span className="text-xs text-[var(--db-text-muted)] font-mono border-l border-[var(--db-border-default)] pl-3">
            {sortedItems.length} {sortedItems.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      {/* Filter Tag Chips */}
      {allCategoryTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-[var(--db-text-muted)] mr-1">Filter Tag:</span>
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
              selectedTag === null
                ? 'bg-[var(--db-purple-500)] text-white'
                : 'bg-[var(--db-bg-card)] text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)] border border-[var(--db-border-default)]'
            }`}
          >
            All ({categoryItems.length})
          </button>
          {allCategoryTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                selectedTag === tag
                  ? 'bg-[var(--db-purple-500)] text-white'
                  : 'bg-[var(--db-bg-card)] text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)] border border-[var(--db-border-default)]'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Gallery Grid */}
      {sortedItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {sortedItems.map((item) => (
            <CompendiumCard
              key={item.id}
              item={item}
              onClick={() => onSelectItem(item)}
              onAssetChange={(newUrl, prov) => onAssetChange?.(item.id, newUrl, prov)}
            />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)]">
          <span className="text-3xl block mb-2">🔍</span>
          <h3 className="text-base font-serif font-bold text-[var(--db-text-primary)] mb-1">
            No collection items found
          </h3>
          <p className="text-xs text-[var(--db-text-muted)] max-w-sm mx-auto mb-4">
            No items in your personal collection match the current search or tag filters in this category.
          </p>
          {(searchQuery || selectedTag) && (
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSelectedTag(null);
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
