import React, { useState } from 'react';
import { AppRoute } from '../../routes';

export interface MobileNavProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  hasActiveStory?: boolean;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentRoute,
  onNavigate,
  hasActiveStory: _hasActiveStory = true,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleNav = (route: AppRoute) => {
    onNavigate(route);
    setIsDrawerOpen(false);
  };

  return (
    <>
      {/* Primary Bottom Navigation Bar (Mobile only) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[var(--db-bg-canvas)]/95 backdrop-blur-lg border-t border-[var(--db-border-default)] px-2 flex items-center justify-around z-40 select-none"
        role="navigation"
        aria-label="Mobile Navigation"
      >
        <button
          type="button"
          onClick={() => handleNav('dashboard')}
          className={`flex flex-col items-center justify-center gap-1 p-1 min-w-[56px] min-h-[44px] cursor-pointer ${
            currentRoute === 'dashboard' ? 'text-[var(--db-purple-400)]' : 'text-[var(--db-text-muted)]'
          }`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
          </svg>
          <span className="text-[10px] font-medium">Home</span>
        </button>

        <button
          type="button"
          onClick={() => handleNav('worlds')}
          className={`flex flex-col items-center justify-center gap-1 p-1 min-w-[56px] min-h-[44px] cursor-pointer ${
            currentRoute === 'worlds' ? 'text-[var(--db-blue-400)]' : 'text-[var(--db-text-muted)]'
          }`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
          <span className="text-[10px] font-medium">Worlds</span>
        </button>

        <button
          type="button"
          onClick={() => handleNav('create')}
          className={`flex flex-col items-center justify-center gap-1 p-1 min-w-[56px] min-h-[44px] cursor-pointer ${
            currentRoute.startsWith('create') ? 'text-[var(--db-gold-400)]' : 'text-[var(--db-text-muted)]'
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-[var(--db-gold-500)]/20 border border-[var(--db-gold-500)]/40 flex items-center justify-center text-[var(--db-gold-400)] shadow-[var(--db-shadow-glow)]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className="text-[10px] font-medium">Create</span>
        </button>

        <button
          type="button"
          onClick={() => handleNav('compendium')}
          className={`flex flex-col items-center justify-center gap-1 p-1 min-w-[56px] min-h-[44px] cursor-pointer ${
            currentRoute.startsWith('compendium') ? 'text-[var(--db-purple-400)]' : 'text-[var(--db-text-muted)]'
          }`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10M6 10h10" />
          </svg>
          <span className="text-[10px] font-medium">Compendium</span>
        </button>

        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 p-1 min-w-[56px] min-h-[44px] cursor-pointer ${
            isDrawerOpen ? 'text-[var(--db-purple-400)]' : 'text-[var(--db-text-muted)]'
          }`}
          aria-label="More Navigation Options"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* Secondary Mobile Navigation Drawer */}
      {isDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="relative ml-auto w-4/5 max-w-xs bg-[var(--db-bg-canvas)] border-l border-[var(--db-border-strong)] h-full p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-[var(--db-border-default)]">
                <span className="font-serif font-semibold text-base text-[var(--db-text-primary)]">
                  DreamBook Menu
                </span>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)] cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Main Navigation Destinations */}
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-[var(--db-text-muted)] uppercase tracking-wider mb-2">
                  Destinations
                </div>
                {[
                  { route: 'compendium', label: 'Compendium' },
                  { route: 'settings', label: 'Settings' },
                ].map((item) => (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => handleNav(item.route as AppRoute)}
                    className="w-full text-left px-3 py-2 rounded-[var(--db-radius-md)] text-xs text-[var(--db-text-secondary)] hover:bg-[var(--db-bg-raised)] hover:text-[var(--db-text-primary)]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Creation Options */}
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-[var(--db-text-muted)] uppercase tracking-wider mb-2">
                  Creation Studio
                </div>
                {[
                  { route: 'create', label: 'Create World / Story' },
                ].map((item) => (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => handleNav(item.route as AppRoute)}
                    className="w-full text-left px-3 py-2 rounded-[var(--db-radius-md)] text-xs text-[var(--db-text-secondary)] hover:bg-[var(--db-bg-raised)] hover:text-[var(--db-text-primary)]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Engine & Operations */}
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-[var(--db-text-muted)] uppercase tracking-wider mb-2">
                  Engine & Operations
                </div>
                {[
                  { route: 'engine.settings', label: 'Settings' },
                  { route: 'engine.routing', label: 'Model Routing' },
                  { route: 'engine.voice', label: 'Voice Studio' },
                  { route: 'engine.audio', label: 'Audio & Haptics' },
                  { route: 'ops.archive', label: 'Archive & Backup' },
                  { route: 'ops.bible', label: 'Living Bible' },
                  { route: 'ops.debug', label: 'Debug & Context' },
                ].map((item) => (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => handleNav(item.route as AppRoute)}
                    className="w-full text-left px-3 py-2 rounded-[var(--db-radius-md)] text-xs text-[var(--db-text-secondary)] hover:bg-[var(--db-bg-raised)] hover:text-[var(--db-text-primary)]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-[var(--db-border-default)] text-[10px] text-[var(--db-text-muted)] text-center">
              DreamBook Story Engine v10.8.35
            </div>
          </div>
        </div>
      )}
    </>
  );
};
