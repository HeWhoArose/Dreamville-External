import React from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { WorldArtCover } from '../common/WorldArtCover';

export interface ActiveStoryCardProps {
  storyId?: string;
  runId?: string;
  title: string;
  worldName?: string;
  genre?: string;
  imageUrl?: string;
  characterName?: string;
  currentLocation?: string;
  turnCount?: number;
  lastPlayed?: string;
  excerpt?: string;
  onResume: () => void;
  onViewDetails?: () => void;
}

export const ActiveStoryCard: React.FC<ActiveStoryCardProps> = ({
  title,
  worldName = 'Living World',
  genre = 'Fantasy',
  imageUrl,
  characterName,
  currentLocation,
  turnCount = 1,
  lastPlayed = 'Just now',
  excerpt,
  onResume,
  onViewDetails,
}) => {
  return (
    <Card variant="raised" className="overflow-hidden flex flex-col md:flex-row border-[var(--db-border-purple)] shadow-[var(--db-shadow-md)]">
      {/* Visual Cover Banner / Column */}
      <div className="md:w-5/12 lg:w-4/12 relative flex-shrink-0">
        <WorldArtCover
          imageUrl={imageUrl}
          worldName={worldName}
          genre={genre}
          aspectRatio="banner"
          className="h-full min-h-[220px]"
        />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-20">
          <Badge variant="gold" size="sm">
            Active Story Run
          </Badge>
          <Badge variant="blue" size="sm">
            {genre}
          </Badge>
        </div>
      </div>

      {/* Story Content & Controls */}
      <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <Badge variant="purple" size="sm">
              {worldName}
            </Badge>
            <span className="text-xs text-[var(--db-text-muted)] font-mono">
              Last played: {lastPlayed}
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[var(--db-text-primary)] mb-2">
            {title}
          </h2>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--db-text-secondary)] mb-4">
            {characterName && (
              <span>
                Protagonist: <strong className="text-[var(--db-text-primary)]">{characterName}</strong>
              </span>
            )}
            {currentLocation && (
              <span>
                Location: <strong className="text-[var(--db-text-blue)]">{currentLocation}</strong>
              </span>
            )}
            <span>
              Chronicle Turn: <strong className="text-[var(--db-gold-400)]">{turnCount}</strong>
            </span>
          </div>

          {excerpt && (
            <div className="p-3.5 rounded-[var(--db-radius-md)] bg-[var(--db-bg-card)] border border-[var(--db-border-subtle)] text-xs text-[var(--db-text-secondary)] italic font-serif leading-relaxed mb-6 line-clamp-3">
              "{excerpt}"
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button variant="primary" size="lg" onClick={onResume} className="px-6">
            <svg className="w-5 h-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Resume Story
          </Button>
          {onViewDetails && (
            <Button variant="subtle" size="lg" onClick={onViewDetails}>
              Story Details
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
