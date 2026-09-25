import React, { useState } from 'react';
import { BookOpen, Box, ChevronRight, Compass, Feather, Map, Menu, Sparkles, Swords, User, X } from 'lucide-react';
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
  const [moreOpen, setMoreOpen] = useState(false);
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

      {/* Focused Story Navigation — primary tools stay visible, secondary tools live in More. */}
      {(() => {
        const iconFor = (type: StoryMenuEntry['iconType']) => {
          switch (type) {
            case 'story': return <Feather className="h-4 w-4" />;
            case 'character': return <User className="h-4 w-4" />;
            case 'inventory':
            case 'equipment': return <Box className="h-4 w-4" />;
            case 'powers':
            case 'spellbook': return <Sparkles className="h-4 w-4" />;
            case 'map':
            case 'locations': return <Map className="h-4 w-4" />;
            case 'combat': return <Swords className="h-4 w-4" />;
            case 'codex': return <BookOpen className="h-4 w-4" />;
            default: return <Compass className="h-4 w-4" />;
          }
        };
        // Character/World/Recent Actions are contextual tools and live inside More.
        // Story, inventory, map, and active combat remain the primary in-scene tools.
        const primaryIds = new Set(['story', 'inventory', 'map', 'combat']);
        const primaryEntries = storyMenu.filter((entry) => primaryIds.has(entry.id) && entry.visible);
        const moreEntries = storyMenu.filter((entry) => !primaryIds.has(entry.id) && entry.visible);
        const navigate = (route: AppRoute) => {
          setMoreOpen(false);
          onNavigate(route);
        };
        return (
          <>
            <nav className="mx-auto hidden max-w-7xl items-center gap-1 overflow-x-auto border-b border-violet-500/10 px-4 py-2 lg:flex lg:px-6" aria-label="Story navigation">
              {primaryEntries.map((entry) => {
                const selected = currentRoute === entry.route;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => navigate(entry.route)}
                    aria-current={selected ? 'page' : undefined}
                    className={
                      'inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition ' +
                      (selected
                        ? 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/10 text-white ring-1 ring-violet-400/25'
                        : 'text-stone-400 hover:bg-white/[0.035] hover:text-stone-100')
                    }
                  >
                    <span className={selected ? 'text-violet-300' : 'text-stone-500'}>{iconFor(entry.iconType)}</span>
                    <span>{entry.label}</span>
                    {entry.badge && (
                      <span className="rounded-full border border-rose-400/25 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300">
                        {entry.badge}
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-medium text-stone-300 transition hover:border-violet-400/25 hover:bg-violet-500/10 hover:text-white"
              >
                <Menu className="h-4 w-4" />
                More
              </button>
            </nav>

            <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-violet-500/15 bg-[#090611]/92 px-2 py-2 backdrop-blur-xl lg:hidden" aria-label="Mobile story navigation">
              {primaryEntries.slice(0, 4).map((entry) => {
                const selected = currentRoute === entry.route;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => navigate(entry.route)}
                    className={
                      'flex min-w-[58px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] ' +
                      (selected ? 'bg-violet-500/12 text-violet-200' : 'text-stone-500')
                    }
                  >
                    {iconFor(entry.iconType)}
                    <span>{entry.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="flex min-w-[58px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] text-stone-500"
              >
                <Menu className="h-4 w-4" />
                <span>More</span>
              </button>
            </nav>

            {moreOpen && (
              <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Story tools">
                <button
                  type="button"
                  className="absolute inset-0 cursor-default"
                  aria-label="Close story tools"
                  onClick={() => setMoreOpen(false)}
                />
                <aside className="relative h-full w-full max-w-sm border-l border-violet-400/15 bg-[#0a0712]/98 p-5 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-white/8 pb-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300/80">Story tools</p>
                      <h2 className="mt-1 font-serif text-xl text-white">Beyond the scene</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMoreOpen(false)}
                      className="rounded-xl border border-white/8 p-2 text-stone-400 transition hover:bg-white/[0.04] hover:text-white"
                      aria-label="Close story tools"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-5 space-y-2 overflow-y-auto">
                    {moreEntries.map((entry) => {
                      const selected = currentRoute === entry.route;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => navigate(entry.route)}
                          className={
                            'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ' +
                            (selected
                              ? 'border-violet-400/25 bg-violet-500/10 text-white'
                              : 'border-white/7 bg-white/[0.02] text-stone-300 hover:border-violet-400/15 hover:bg-violet-500/[0.06]')
                          }
                        >
                          <span className={selected ? 'text-violet-300' : 'text-stone-500'}>{iconFor(entry.iconType)}</span>
                          <span className="flex-1">
                            <span className="block text-sm font-medium">{entry.label}</span>
                            {entry.reason && <span className="mt-0.5 block text-[10px] text-stone-600">{entry.reason}</span>}
                          </span>
                          <ChevronRight className="h-4 w-4 text-stone-600" />
                        </button>
                      );
                    })}
                  </div>
                  <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-violet-400/10 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/5 p-4 text-xs text-stone-400">
                    The scene stays quiet. Deeper world tools live here.
                  </div>
                </aside>
              </div>
            )}
          </>
        );
      })()}
      {/* Main Viewport */}
      <main className="flex-1 w-full mx-auto px-3 pb-24 pt-4 sm:px-5 sm:pt-6 lg:px-8 lg:pb-10">
        <div className="mx-auto max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
};
