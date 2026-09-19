import React from 'react';
import { AppRoute } from '../../routes';

export interface SidebarNavProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  isCollapsed: boolean;
  hasActiveStory?: boolean;
}

interface NavItem {
  route: AppRoute;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const GLOBAL_NAV_SECTIONS: NavSection[] = [
  {
    title: 'HOME',
    items: [
      {
        route: 'dashboard',
        label: 'Dashboard',
        icon: ({ className }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
      {
        route: 'story-library',
        label: 'Story Library',
        icon: ({ className }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10M6 10h10" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'WORLDS',
    items: [
      {
        route: 'worlds',
        label: 'World Library',
        icon: ({ className }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'CREATE',
    items: [
      {
        route: 'create',
        label: 'Create World / Story',
        icon: ({ className }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'COMPENDIUM',
    items: [
      {
        route: 'compendium',
        label: 'Compendium',
        icon: ({ className }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10M6 10h10" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      {
        route: 'settings',
        label: 'Settings',
        icon: ({ className }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      {
        route: 'ops.archive',
        label: 'Archive & Export',
        icon: ({ className }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        ),
      },
      {
        route: 'ops.bible',
        label: 'Living Bible',
        icon: ({ className }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        ),
      },
      {
        route: 'ops.debug',
        label: 'Debug & Context',
        icon: ({ className }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
        ),
      },
    ],
  },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({
  currentRoute,
  onNavigate,
  isCollapsed,
  hasActiveStory: _hasActiveStory = true,
}) => {
  return (
    <aside
      className={`hidden md:flex flex-col border-r border-[var(--db-border-default)] bg-[var(--db-bg-canvas)] transition-all duration-200 select-none overflow-y-auto ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
      role="navigation"
      aria-label="Sidebar Navigation"
    >
      <div className="p-3 space-y-5">
        {GLOBAL_NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-[var(--db-text-muted)] uppercase">
                {section.title}
              </div>
            )}
            {section.items.map((item) => {
              const isSelected = currentRoute === item.route;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-[var(--db-radius-md)] text-xs font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--db-purple-500)]/50 ${
                    isSelected
                      ? 'bg-[var(--db-surface-purple)] text-[var(--db-purple-300)] border border-[var(--db-purple-500)]/40 shadow-[var(--db-shadow-glow-purple)]'
                      : 'text-[var(--db-text-secondary)] hover:text-[var(--db-text-primary)] hover:bg-[var(--db-bg-raised)] border border-transparent'
                  }`}
                  aria-current={isSelected ? 'page' : undefined}
                >
                  <item.icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isSelected ? 'text-[var(--db-purple-400)]' : 'text-[var(--db-text-muted)]'
                    }`}
                  />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                  {!isCollapsed && item.badge && (
                    <span className="ml-auto text-[10px] bg-[var(--db-gold-500)]/15 text-[var(--db-gold-400)] px-1.5 py-0.5 rounded border border-[var(--db-gold-500)]/30 font-medium">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
};
