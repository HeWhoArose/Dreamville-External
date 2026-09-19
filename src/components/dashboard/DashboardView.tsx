import React from 'react';
import { ActiveStoryCard } from './ActiveStoryCard';
import { QuickActionGrid } from './QuickActionGrid';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { LoadingOverlay } from '../common/LoadingOverlay';
import { WorldArtCover } from '../common/WorldArtCover';
import { WorldTemplate } from '../../types';

export interface StorySummary {
  storyId: string;
  runId: string;
  title: string;
  worldName: string;
  genre?: string;
  imageUrl?: string;
  characterName?: string;
  currentLocation?: string;
  turnCount?: number;
  lastPlayed?: string;
  excerpt?: string;
}

export interface DashboardViewProps {
  activeStory?: StorySummary | null;
  recentStories?: StorySummary[];
  curatedWorlds?: WorldTemplate[];
  isLoading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onResumeStory: (runId: string) => void;
  onNewStory: () => void;
  onExploreWorlds: () => void;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
  onSelectWorld?: (worldId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  activeStory,
  recentStories = [],
  curatedWorlds = [],
  isLoading = false,
  errorMessage,
  onRetry,
  onResumeStory,
  onNewStory,
  onExploreWorlds,
  onOpenLibrary,
  onOpenSettings,
  onSelectWorld,
}) => {
  if (isLoading) {
    return (
      <LoadingOverlay
        title="Loading DreamBook Dashboard"
        subtitle="Gathering your active stories, worlds, and narrative progress"
      />
    );
  }

  if (errorMessage) {
    return (
      <div className="py-12">
        <EmptyState
          icon={<span className="text-2xl">⚠️</span>}
          title="Unable to Load Dashboard"
          description={errorMessage}
          actionLabel="Retry"
          onAction={onRetry}
        />
      </div>
    );
  }

  const hasStories = Boolean(activeStory || (recentStories && recentStories.length > 0));

  return (
    <div className="space-y-10 animate-in fade-in duration-200" data-testid="dashboard-view">
      {/* SECTION 1: CONTINUE YOUR STORIES (Image-First Active Story Runs) */}
      <section aria-labelledby="active-stories-heading">
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <h2 id="active-stories-heading" className="text-xs font-semibold tracking-wider text-[var(--db-text-muted)] uppercase">
              Continue Your Stories
            </h2>
          </div>
          {activeStory && (
            <span
              className="text-xs text-[var(--db-gold-400)] hover:underline cursor-pointer"
              onClick={onOpenLibrary}
            >
              Story Library ({recentStories.length > 0 ? recentStories.length : 1}) →
            </span>
          )}
        </div>

        {activeStory ? (
          <ActiveStoryCard
            storyId={activeStory.storyId}
            runId={activeStory.runId}
            title={activeStory.title}
            worldName={activeStory.worldName}
            genre={activeStory.genre}
            imageUrl={activeStory.imageUrl}
            characterName={activeStory.characterName}
            currentLocation={activeStory.currentLocation}
            turnCount={activeStory.turnCount}
            lastPlayed={activeStory.lastPlayed}
            excerpt={activeStory.excerpt}
            onResume={() => onResumeStory(activeStory.runId)}
            onViewDetails={onOpenLibrary}
          />
        ) : (
          <EmptyState
            icon={
              <svg className="w-7 h-7 text-[var(--db-gold-400)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M6 6h10M6 10h10" />
              </svg>
            }
            title="Begin Your First Story"
            description="You have no active story runs. Create a new bespoke narrative or explore curated persistent worlds."
            actionLabel="Create New Story"
            onAction={onNewStory}
          />
        )}
      </section>

      {/* SECTION 2: DISCOVER WORLDS (Substantial Setting Cards with Art & Ruleset) */}
      <section aria-labelledby="discover-worlds-heading">
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <h2 id="discover-worlds-heading" className="text-xs font-semibold tracking-wider text-[var(--db-text-muted)] uppercase">
              Discover Worlds
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onExploreWorlds} className="text-xs text-[var(--db-gold-400)]">
            Explore All Worlds ({curatedWorlds.length}) →
          </Button>
        </div>

        {curatedWorlds.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {curatedWorlds.slice(0, 3).map((world) => {
              const primaryGenre = world.genreTags?.[0] || 'Fantasy';
              const eraLabel = world.era || world.defaultEra || 'Living World';
              const rulesetLabel =
                (world as any).ruleset || (world as any).rules || 'Full D&D';

              return (
                <Card
                  key={world.worldId}
                  variant="interactive"
                  onClick={() => onSelectWorld?.(world.worldId)}
                  className="flex flex-col justify-between overflow-hidden group border-[var(--db-border-default)] hover:border-[var(--db-border-purple)]"
                >
                  <div>
                    <WorldArtCover
                      imageUrl={(world as any).imageAsset || (world as any).coverImage}
                      worldName={world.title || 'Untitled World'}
                      genre={primaryGenre}
                      aspectRatio="compact"
                      assetMeta={{
                        slotId: `world_${world.worldId}`,
                        slotType: 'world_cover',
                        title: world.title || 'World Setting',
                        setting: world.description || world.summary,
                        currentImageUrl: (world as any).imageAsset || (world as any).coverImage,
                      }}
                    />

                    <div className="p-4">
                      <div className="flex items-center justify-between gap-1.5 mb-2">
                        <Badge variant="blue" size="sm">
                          {eraLabel}
                        </Badge>
                        <Badge variant="purple" size="sm">
                          {primaryGenre}
                        </Badge>
                      </div>
                      <h3 className="font-serif font-bold text-base text-[var(--db-text-primary)] group-hover:text-[var(--db-gold-400)] transition-colors mb-1.5 line-clamp-1">
                        {world.title || 'Untitled World'}
                      </h3>
                      <p className="text-xs text-[var(--db-text-secondary)] line-clamp-2 leading-relaxed">
                        {world.description || world.summary}
                      </p>
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-2 flex items-center justify-between border-t border-[var(--db-border-subtle)] text-xs">
                    <span className="text-[11px] text-[var(--db-text-muted)] font-mono">
                      {rulesetLabel}
                    </span>
                    <span className="text-[var(--db-gold-400)] font-medium group-hover:translate-x-0.5 transition-transform">
                      Explore World →
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="p-6 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] text-center text-xs text-[var(--db-text-muted)]">
            World repository ready. Launch World Discovery to generate fresh simulation templates.
          </div>
        )}
      </section>

      {/* SECTION 3: LAUNCHPAD & RECENT CHRONICLES */}
      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="text-xs font-semibold tracking-wider text-[var(--db-text-muted)] uppercase mb-3 px-1">
          Launchpad & Creation
        </h2>
        <QuickActionGrid
          onNewStory={onNewStory}
          onExploreWorlds={onExploreWorlds}
          onOpenLibrary={onOpenLibrary}
          onOpenSettings={onOpenSettings}
        />
      </section>

      {/* Recent Stories (if multiple) */}
      {hasStories && recentStories.length > 1 && (
        <section aria-labelledby="recent-stories-heading">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 id="recent-stories-heading" className="text-xs font-semibold tracking-wider text-[var(--db-text-muted)] uppercase">
              Recent Chronicles
            </h2>
            <Button variant="ghost" size="sm" onClick={onOpenLibrary} className="text-xs">
              View All
            </Button>
          </div>
          <div className="space-y-2">
            {recentStories.slice(0, 4).map((story) => (
              <div
                key={story.runId}
                onClick={() => onResumeStory(story.runId)}
                className="flex items-center justify-between p-3.5 rounded-[var(--db-radius-md)] bg-[var(--db-bg-card)] hover:bg-[var(--db-bg-raised)] border border-[var(--db-border-default)] hover:border-[var(--db-border-purple)] transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[var(--db-surface-purple)] border border-[var(--db-purple-500)]/30 flex items-center justify-center text-xs font-serif text-[var(--db-gold-400)] shrink-0">
                    📖
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium text-[var(--db-text-primary)] group-hover:text-[var(--db-gold-400)] transition-colors truncate">
                      {story.title}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--db-text-muted)]">
                      <span className="text-[var(--db-text-blue)]">{story.worldName}</span>
                      <span>•</span>
                      <span>Turn {story.turnCount || 1}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-[var(--db-text-muted)] hidden sm:inline font-mono">
                    {story.lastPlayed || 'Recent'}
                  </span>
                  <Button variant="subtle" size="sm" onClick={(e) => { e.stopPropagation(); onResumeStory(story.runId); }}>
                    Resume
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
