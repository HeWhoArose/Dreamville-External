import React from 'react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

export interface StoryContextHeaderProps {
  worldTitle: string;
  storyTitle: string;
  currentLocationName?: string;
  worldClockTime?: string;
  statusLabel?: string;
  isCombatActive?: boolean;
  onExitToLibrary: () => void;
  onOpenSettings?: () => void;
  className?: string;
}

export const StoryContextHeader: React.FC<StoryContextHeaderProps> = ({
  worldTitle,
  storyTitle,
  currentLocationName,
  worldClockTime,
  statusLabel = 'Active Session',
  isCombatActive = false,
  onExitToLibrary,
  onOpenSettings,
  className = '',
}) => {
  return (
    <header
      className={`border-b border-[var(--db-border-purple)] bg-[var(--db-bg-raised)]/95 backdrop-blur-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 select-none shadow-[var(--db-shadow-sm)] ${className}`}
      data-testid="story-context-header"
    >
      {/* 1. Left: Back Button & World / Story Identity */}
      <div className="flex items-center gap-3">
        <Button
          variant="subtle"
          size="sm"
          onClick={onExitToLibrary}
          className="gap-1 text-xs px-2.5 py-1 text-[var(--db-purple-300)] hover:text-white"
          title="Exit to Story Library"
        >
          <span className="text-sm">←</span>
          <span className="hidden sm:inline">Library</span>
        </Button>

        <div className="h-5 w-px bg-[var(--db-border-default)]" />

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-[var(--db-blue-400)] uppercase tracking-wider truncate max-w-[140px] sm:max-w-[200px]">
              {worldTitle}
            </span>
            <Badge variant={isCombatActive ? 'rose' : 'purple'} size="sm">
              {isCombatActive ? '⚔️ TACTICAL COMBAT' : statusLabel}
            </Badge>
          </div>
          <h1 className="font-serif font-bold text-sm sm:text-base text-[var(--db-text-primary)] truncate max-w-[200px] sm:max-w-[360px]">
            {storyTitle}
          </h1>
        </div>
      </div>

      {/* 2. Right: Active Context Badges (Location & Time) + Settings */}
      <div className="flex items-center gap-2 text-xs">
        {currentLocationName && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--db-radius-md)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] text-[var(--db-text-secondary)]">
            <span className="text-[var(--db-gold-400)]">📍</span>
            <span className="font-medium text-[var(--db-text-primary)] truncate max-w-[160px]">
              {currentLocationName}
            </span>
          </div>
        )}

        {worldClockTime && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--db-radius-md)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] text-[var(--db-text-muted)] font-mono text-[11px]">
            <span className="text-[var(--db-blue-400)]">⌛</span>
            <span>{worldClockTime}</span>
          </div>
        )}

        {onOpenSettings && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
            className="p-1.5 text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)]"
            title="Audio & Audio Engine Settings"
          >
            ⚙️
          </Button>
        )}
      </div>
    </header>
  );
};
