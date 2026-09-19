import React from 'react';
import { AppRoute } from '../../routes';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

export interface TopBarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
  worldClockTime?: string;
  activeStoryTitle?: string;
  isEngineReady?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentRoute: _currentRoute,
  onNavigate,
  onToggleSidebar,
  isSidebarCollapsed: _isSidebarCollapsed,
  worldClockTime,
  activeStoryTitle,
  isEngineReady = true,
}) => {
  return (
    <header
      className="h-14 border-b border-[var(--db-border-default)] bg-[var(--db-bg-canvas)]/95 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-30 select-none"
      role="banner"
    >
      {/* Left: Sidebar Toggle & Brand */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-1.5 rounded-[var(--db-radius-sm)] text-[var(--db-text-secondary)] hover:text-[var(--db-text-primary)] hover:bg-[var(--db-bg-raised)] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--db-purple-500)]/50"
            aria-label="Toggle Navigation Sidebar"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
        )}

        {/* Brand Wordmark (PBG Purple & Gold) */}
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2.5 text-left cursor-pointer group focus-visible:outline-none"
        >
          <div className="w-7 h-7 rounded-lg bg-[var(--db-surface-purple)] border border-[var(--db-purple-500)]/40 flex items-center justify-center text-[var(--db-gold-400)] shadow-[var(--db-shadow-glow-purple)] group-hover:border-[var(--db-purple-400)] transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <path d="M6 6h10" />
              <path d="M6 10h10" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-serif font-semibold tracking-tight text-[var(--db-text-primary)] group-hover:text-[var(--db-gold-400)] transition-colors">
              DreamBook
            </span>
            <span className="text-[9px] text-[var(--db-text-muted)] tracking-wider uppercase leading-none hidden sm:block">
              Personal AI Story Engine
            </span>
          </div>
        </button>
      </div>

      {/* Center: Context Information (Active story / Clock - Blue accents) */}
      <div className="hidden md:flex items-center gap-3">
        {activeStoryTitle && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-[var(--db-radius-md)] bg-[var(--db-bg-card)] border border-[var(--db-border-subtle)] text-xs">
            <span className="text-[var(--db-text-muted)]">Active Run:</span>
            <span className="font-serif font-medium text-[var(--db-text-primary)] truncate max-w-[200px]">
              {activeStoryTitle}
            </span>
          </div>
        )}
        {worldClockTime && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--db-text-blue)] font-mono bg-[var(--db-surface-blue)] px-2.5 py-0.5 rounded-[var(--db-radius-sm)] border border-[var(--db-blue-500)]/20">
            <span className="text-[var(--db-gold-400)]">⏳</span>
            <span>{worldClockTime}</span>
          </div>
        )}
      </div>

      {/* Right: Engine Health & Quick Actions */}
      <div className="flex items-center gap-2.5">
        <Badge
          variant={isEngineReady ? 'emerald' : 'amber'}
          size="sm"
          className="hidden sm:inline-flex"
        >
          {isEngineReady ? 'Engine Online' : 'Connecting'}
        </Badge>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate('story-library')}
          className="text-xs"
        >
          Library
        </Button>

        <Button
          variant="subtle"
          size="sm"
          onClick={() => onNavigate('engine.settings')}
          className="p-2 min-h-[32px]"
          aria-label="Settings"
        >
          <svg className="w-4 h-4 text-[var(--db-text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Button>
      </div>
    </header>
  );
};
