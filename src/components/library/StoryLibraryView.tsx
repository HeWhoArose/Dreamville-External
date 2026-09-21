import React, { useState, useMemo } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { FilterChip } from '../common/FilterChip';
import { EmptyState } from '../common/EmptyState';
import { LoadingOverlay } from '../common/LoadingOverlay';
import { WorldArtCover } from '../common/WorldArtCover';
import { StorySummary } from '../dashboard/DashboardView';

export interface StoryLibraryViewProps {
  stories: StorySummary[];
  isLoading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onResumeStory: (runId: string) => void;
  onNewStory: () => void;
  onBranchStory?: (runId: string) => void;
  onStoryAssetChange?: (runId: string, newUrl?: string, provenance?: string) => void | Promise<void>;
}

export const StoryLibraryView: React.FC<StoryLibraryViewProps> = ({
  stories = [],
  isLoading = false,
  errorMessage,
  onRetry,
  onResumeStory,
  onNewStory,
  onBranchStory,
  onStoryAssetChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');

  // Extract unique genres for filter chips
  const genres = useMemo(() => {
    const set = new Set<string>();
    stories.forEach((s) => {
      if (s.genre) set.add(s.genre);
    });
    return Array.from(set);
  }, [stories]);

  // Read-only filtered list
  const filteredStories = useMemo(() => {
    return stories.filter((story) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        story.worldName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (story.characterName && story.characterName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesGenre =
        selectedGenre === 'all' ||
        (story.genre && story.genre.toLowerCase() === selectedGenre.toLowerCase());

      return matchesSearch && matchesGenre;
    });
  }, [stories, searchQuery, selectedGenre]);

  if (isLoading) {
    return (
      <LoadingOverlay
        title="Loading Story Library"
        subtitle="Cataloging your timelines, character records, and narrative chronicles"
      />
    );
  }

  if (errorMessage) {
    return (
      <div className="py-12">
        <EmptyState
          icon={<span className="text-2xl">⚠️</span>}
          title="Error Loading Story Library"
          description={errorMessage}
          actionLabel="Retry"
          onAction={onRetry}
        />
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="py-12">
        <EmptyState
          icon={
            <svg className="w-8 h-8 text-[var(--db-gold-400)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <path d="M6 6h10M6 10h10" />
            </svg>
          }
          title="Your Library is Empty"
          description="You have not started any stories yet. Launch a new narrative adventure or explore curated world templates."
          actionLabel="Create New Story"
          onAction={onNewStory}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[var(--db-text-primary)] mb-1">
            Story Library
          </h1>
          <p className="text-xs text-[var(--db-text-secondary)]">
            Explore your active timelines, narrative checkpoints, and chronicle archives.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={onNewStory}>
          <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Story Run
        </Button>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-[var(--db-bg-card)] p-3 rounded-[var(--db-radius-lg)] border border-[var(--db-border-default)]">
        <div className="w-full md:max-w-md">
          <Input
            placeholder="Search stories, protagonists, worlds..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            }
          />
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <FilterChip
            label="All Stories"
            count={stories.length}
            isSelected={selectedGenre === 'all'}
            onClick={() => setSelectedGenre('all')}
            variant="purple"
          />
          {genres.map((genre) => (
            <FilterChip
              key={genre}
              label={genre}
              isSelected={selectedGenre === genre}
              onClick={() => setSelectedGenre(genre)}
              variant="purple"
            />
          ))}
        </div>
      </div>

      {/* Stories Grid */}
      {filteredStories.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStories.map((story) => (
            <Card
              key={story.runId}
              variant="interactive"
              onClick={() => onResumeStory(story.runId)}
              className="flex flex-col justify-between overflow-hidden"
            >
              <div>
                <WorldArtCover
                  imageUrl={story.imageUrl}
                  worldName={story.title}
                  genre={story.genre || 'Fantasy'}
                  aspectRatio="compact"
                  assetSlotType="story_run_cover"
                  assetMeta={{
                    slotId: `story_run_cover_${story.runId}`,
                    slotType: 'story_run_cover',
                    title: story.title,
                    subject: story.title,
                    worldSummary: story.visualIdentity?.worldSummary,
                    setting: story.visualIdentity?.setting,
                    environment: story.visualIdentity?.environment,
                    genreTags: story.visualIdentity?.genreTags || (story.genre ? [story.genre] : []),
                    toneTags: story.visualIdentity?.toneTags || [],
                    era: story.visualIdentity?.era,
                    factions: story.visualIdentity?.factions || [],
                    magicOrTechnology: story.visualIdentity?.magicOrTechnology,
                    geography: story.visualIdentity?.geography,
                    visualMotifs: story.visualIdentity?.visualMotifs || [],
                    mood: (story.visualIdentity?.toneTags || []).join(', '),
                    adventureContext: story.visualIdentity?.adventureContext,
                    characterName: story.characterName,
                    storyMode: story.storyMode,
                    dndRulesMode: story.dndRulesMode,
                    currentImageUrl: story.imageUrl,
                    isEditable: Boolean(onStoryAssetChange),
                  }}
                  onAssetChange={(newUrl, provenance) => onStoryAssetChange?.(story.runId, newUrl, provenance)}
                />

                <div className="p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <Badge variant="purple" size="sm">
                      {story.worldName}
                    </Badge>
                    {story.genre && (
                      <Badge variant="blue" size="sm">
                        {story.genre}
                      </Badge>
                    )}
                  </div>

                  <h3 className="font-serif font-bold text-lg text-[var(--db-text-primary)] mb-2 group-hover:text-[var(--db-gold-400)] transition-colors line-clamp-1">
                    {story.title}
                  </h3>

                  <div className="space-y-1 text-xs text-[var(--db-text-secondary)] mb-4">
                    {story.characterName && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--db-text-muted)]">Protagonist:</span>
                        <span className="font-medium text-[var(--db-text-primary)]">{story.characterName}</span>
                      </div>
                    )}
                    {story.currentLocation && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--db-text-muted)]">Location:</span>
                        <span className="text-[var(--db-text-blue)]">{story.currentLocation}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[var(--db-text-muted)]">Chronicle Turns:</span>
                      <span className="text-[var(--db-gold-400)]">{story.turnCount || 1}</span>
                    </div>
                  </div>

                  {story.excerpt && (
                    <p className="text-xs text-[var(--db-text-muted)] italic line-clamp-2 border-l-2 border-[var(--db-border-purple)] pl-2.5 mb-2">
                      "{story.excerpt}"
                    </p>
                  )}
                </div>
              </div>

              <div className="px-5 pb-5 pt-3 flex items-center justify-between border-t border-[var(--db-border-subtle)]">
                <span className="text-[11px] text-[var(--db-text-muted)] font-mono">
                  {story.lastPlayed || 'Recent'}
                </span>
                <div className="flex items-center gap-2">
                  {onBranchStory && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBranchStory(story.runId);
                      }}
                      className="text-xs p-1.5 min-h-[30px]"
                      title="Branch Timeline"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="6" y1="3" x2="6" y2="15" />
                        <circle cx="18" cy="6" r="3" />
                        <circle cx="6" cy="18" r="3" />
                        <path d="M18 9a9 9 0 0 1-9 9" />
                      </svg>
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResumeStory(story.runId);
                    }}
                    className="text-xs"
                  >
                    Resume
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={
            <svg className="w-6 h-6 text-[var(--db-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          }
          title="No Matching Stories"
          description={`No stories found matching "${searchQuery}". Try a different keyword or clear your filter.`}
          actionLabel="Clear Search"
          onAction={() => {
            setSearchQuery('');
            setSelectedGenre('all');
          }}
        />
      )}
    </div>
  );
};
