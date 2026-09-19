import React from 'react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { ImageAssetControl } from '../common/ImageAssetControl';
import { CompendiumItem } from './compendiumTypes';

export interface CompendiumCardProps {
  item: CompendiumItem;
  onClick: () => void;
  onAssetChange?: (newUrl?: string, provenance?: string) => void;
}

export const CompendiumCard: React.FC<CompendiumCardProps> = ({
  item,
  onClick,
  onAssetChange,
}) => {
  const isPortrait = item.category === 'characters' || item.category === 'npcs';
  const isBanner = item.category === 'worlds' || item.category === 'visuals';

  const aspectClass = isPortrait ? 'aspect-[3/4]' : isBanner ? 'aspect-[16/9]' : 'aspect-square';

  return (
    <Card
      variant="interactive"
      onClick={onClick}
      className="flex flex-col justify-between overflow-hidden group cursor-pointer border-[var(--db-border-default)] hover:border-[var(--db-border-purple)]"
      data-testid={`compendium-card-${item.id}`}
    >
      <div>
        {/* Visual Frame */}
        <div className={`relative w-full overflow-hidden bg-[var(--db-bg-subtle)] ${aspectClass}`}>
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-gradient-to-br from-[#1b1430] via-[#101426] to-[#09070f] text-center">
              <span className="text-2xl mb-1">
                {item.category === 'characters' ? '👤' :
                 item.category === 'equipment' ? '⚔️' :
                 item.category === 'powers' ? '⚡' :
                 item.category === 'npcs' ? '👥' :
                 item.category === 'creatures' ? '🐉' :
                 item.category === 'worlds' ? '🪐' : '🎨'}
              </span>
              <span className="text-xs font-serif font-semibold text-[var(--db-text-secondary)] line-clamp-1">
                {item.title}
              </span>
            </div>
          )}

          {/* Universal Image Asset Control affordance */}
          <ImageAssetControl
            meta={{
              slotId: item.id,
              slotType:
                item.category === 'characters' ? 'character_portrait' :
                item.category === 'npcs' ? 'npc_portrait' :
                item.category === 'equipment' ? 'equipment' :
                item.category === 'powers' ? 'skill_icon' :
                item.category === 'creatures' ? 'creature' :
                item.category === 'worlds' ? 'world_cover' : 'scene',
              title: item.title,
              subject: item.title,
              traits: item.traits,
              equipment: item.equipment,
              setting: item.worldOrigin,
              currentImageUrl: item.imageUrl,
              aspectRatio: isPortrait ? '3:4' : isBanner ? '16:9' : '1:1',
            }}
            onAssetChange={onAssetChange}
          />

          <div className="absolute top-2 left-2 flex flex-wrap gap-1 pointer-events-none">
            {item.rarityOrThreat && (
              <Badge variant="purple" size="sm">
                {item.rarityOrThreat}
              </Badge>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] uppercase font-semibold text-[var(--db-text-blue)] tracking-wider truncate">
              {item.classification || item.worldOrigin || 'Compendium Entry'}
            </span>
          </div>
          <h3 className="font-serif font-bold text-base text-[var(--db-text-primary)] group-hover:text-[var(--db-gold-400)] transition-colors mb-1 truncate">
            {item.title}
          </h3>
          {item.subtitle && (
            <p className="text-xs text-[var(--db-text-muted)] truncate mb-2">
              {item.subtitle}
            </p>
          )}
          <p className="text-xs text-[var(--db-text-secondary)] line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        </div>
      </div>

      {/* Footer Tags */}
      <div className="px-4 pb-3 pt-2 border-t border-[var(--db-border-subtle)] flex items-center justify-between text-xs">
        <div className="flex flex-wrap gap-1 max-w-[75%]">
          {item.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--db-bg-raised)] text-[var(--db-text-muted)]">
              #{tag}
            </span>
          ))}
        </div>
        <span className="text-[var(--db-gold-400)] text-xs font-medium group-hover:translate-x-0.5 transition-transform">
          Inspect →
        </span>
      </div>
    </Card>
  );
};
