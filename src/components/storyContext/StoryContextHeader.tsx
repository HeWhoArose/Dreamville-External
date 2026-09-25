import React from 'react';

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
      className={`sticky top-0 z-30 border-b border-violet-400/15 bg-[#090611]/92 px-4 py-3 backdrop-blur-xl select-none ${className}`}
      data-testid="story-context-header"
    >
      <div className="mx-auto flex max-w-[1480px] items-center gap-3">
        <button
          type="button"
          onClick={onExitToLibrary}
          className="shrink-0 rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2 text-xs font-medium text-stone-300 transition hover:border-violet-400/30 hover:bg-violet-500/10 hover:text-white"
          title="Return to Story Library"
        >
          ← <span className="hidden sm:inline">Library</span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-300/75">{worldTitle}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] ${isCombatActive ? 'border-rose-400/30 bg-rose-500/10 text-rose-300' : 'border-violet-400/20 bg-violet-500/10 text-violet-200'}`}>
              {isCombatActive ? 'Combat' : statusLabel}
            </span>
          </div>
          <h1 className="truncate font-serif text-lg font-semibold text-white sm:text-xl">{storyTitle}</h1>
        </div>

        <div className="hidden items-center gap-2 text-[11px] text-stone-500 sm:flex">
          {currentLocationName && <span className="max-w-[190px] truncate text-violet-200/70">{currentLocationName}</span>}
          {currentLocationName && worldClockTime && <span className="text-stone-700">·</span>}
          {worldClockTime && <span>{worldClockTime}</span>}
        </div>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] text-stone-400 transition hover:border-violet-400/30 hover:bg-violet-500/10 hover:text-white"
            title="Story settings"
            aria-label="Story settings"
          >
            ⚙
          </button>
        )}
      </div>
    </header>
  );
};
