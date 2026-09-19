import React from 'react';
import { AppRoute } from '../../routes';
import { StoryContextHeader } from './StoryContextHeader';
import { StoryMenuEntry, StoryNavigationConfig, deriveStoryMenu } from './storyNavigationModel';

export interface StoryConfigProps {
  storyId?: string;
  runId?: string;
  title: string;
  worldName: string;
  ruleset?: string;
  genre?: string;
  characterName?: string;
  currentLocation?: string;
  currentCycle?: string;
  turnCount?: number;
  hasCombatActive?: boolean;
}

export interface StoryContextShellProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onExitToLibrary: () => void;
  onOpenSettings?: () => void;
  worldTitle?: string;
  storyTitle?: string;
  currentLocationName?: string;
  worldClockTime?: string;
  isCombatActive?: boolean;
  config?: StoryNavigationConfig;
  storyConfig?: StoryConfigProps;
  children: React.ReactNode;
}

export const StoryContextShell: React.FC<StoryContextShellProps> = ({
  currentRoute,
  onNavigate,
  onExitToLibrary,
  onOpenSettings,
  worldTitle,
  storyTitle,
  currentLocationName,
  worldClockTime,
  isCombatActive = false,
  config,
  storyConfig,
  children,
}) => {
  const effectiveWorldTitle = worldTitle || storyConfig?.worldName || 'Living World';
  const effectiveStoryTitle = storyTitle || storyConfig?.title || 'Active Chronicle';
  const effectiveLocation = currentLocationName || storyConfig?.currentLocation || 'Sanctum';
  const effectiveTime = worldClockTime || storyConfig?.currentCycle || 'Cycle 1';
  const effectiveCombat = isCombatActive || Boolean(storyConfig?.hasCombatActive);

  const storyMenu = deriveStoryMenu({
    ...config,
    hasActiveCombat: effectiveCombat || config?.hasActiveCombat,
  });

  const renderIcon = (type: StoryMenuEntry['iconType']) => {
    switch (type) {
      case 'story':
        return (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        );
      case 'character':
        return (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        );
      case 'inventory':
      case 'equipment':
        return (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        );
      case 'powers':
      case 'spellbook':
        return (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        );
      case 'combat':
        return (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
            <line x1="13" y1="19" x2="19" y2="13" />
            <line x1="16" y1="16" x2="20" y2="20" />
            <line x1="19" y1="21" x2="21" y2="19" />
          </svg>
        );
      case 'map':
      case 'locations':
        return (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
        );
      case 'journal':
      case 'codex':
      case 'evidence':
      case 'quests':
      case 'relationships':
      default:
        return (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 14 14" />
          </svg>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--db-bg-canvas)] text-[var(--db-text-primary)]">
      {/* Contextual Story Header */}
      <StoryContextHeader
        worldTitle={effectiveWorldTitle}
        storyTitle={effectiveStoryTitle}
        currentLocationName={effectiveLocation}
        worldClockTime={effectiveTime}
        onExitToLibrary={onExitToLibrary}
        onOpenSettings={onOpenSettings}
      />

      {/* Story-Context Navigation Bar */}
      <nav
        className="sticky top-14 z-20 bg-[var(--db-bg-card)]/90 backdrop-blur-md border-b border-[var(--db-border-default)] px-4 py-2"
        role="navigation"
        aria-label="Story Subsystems Navigation"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center gap-1 sm:gap-2 min-w-max">
            {storyMenu.map((entry) => {
              const isSelected = currentRoute === entry.route;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onNavigate(entry.route)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-[var(--db-radius-md)] text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-[var(--db-surface-purple)] text-[var(--db-purple-200)] border border-[var(--db-purple-500)]/40 shadow-[var(--db-shadow-glow-purple)]'
                      : 'text-[var(--db-text-secondary)] hover:text-[var(--db-text-primary)] hover:bg-[var(--db-bg-raised)] border border-transparent'
                  }`}
                >
                  <span
                    className={isSelected ? 'text-[var(--db-purple-400)]' : 'text-[var(--db-text-muted)]'}
                  >
                    {renderIcon(entry.iconType)}
                  </span>
                  <span>{entry.label}</span>
                  {entry.badge && (
                    <span className="text-[10px] bg-[var(--db-purple-500)]/20 text-[var(--db-purple-300)] px-1.5 py-0.2 rounded font-mono">
                      {entry.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Return to Story View if on another subsystem */}
          {currentRoute !== 'play.story' && (
            <button
              type="button"
              onClick={() => onNavigate('play.story')}
              className="text-xs text-[var(--db-gold-400)] hover:underline flex items-center gap-1 shrink-0 font-medium"
            >
              <span>Return to Narrative</span>
              <span>→</span>
            </button>
          )}
        </div>
      </nav>

      {/* Main Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
};
