import React from 'react';
import { Card } from '../common/Card';

export interface QuickActionGridProps {
  onNewStory: () => void;
  onExploreWorlds: () => void;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
}

export const QuickActionGrid: React.FC<QuickActionGridProps> = ({
  onNewStory,
  onExploreWorlds,
  onOpenLibrary,
  onOpenSettings,
}) => {
  const actions = [
    {
      id: 'new-story',
      title: 'Create New Story',
      description: 'Adapt literature, historical bibles, or create a fresh bespoke narrative run.',
      icon: (
        <svg className="w-5 h-5 text-[var(--db-gold-400)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
      iconBg: 'bg-[var(--db-surface-gold)] border-[var(--db-gold-500)]/30',
      onClick: onNewStory,
    },
    {
      id: 'explore-worlds',
      title: 'Explore Worlds',
      description: 'Discover curated world settings with unique causal laws, factions, and maps.',
      icon: (
        <svg className="w-5 h-5 text-[var(--db-blue-400)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
      iconBg: 'bg-[var(--db-surface-blue)] border-[var(--db-blue-500)]/30',
      onClick: onExploreWorlds,
    },
    {
      id: 'story-library',
      title: 'Story Library',
      description: 'Browse all saved narrative timelines, branching chronicles, and completed sagas.',
      icon: (
        <svg className="w-5 h-5 text-[var(--db-purple-300)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
          <path d="M6 6h10M6 10h10" />
        </svg>
      ),
      iconBg: 'bg-[var(--db-surface-purple)] border-[var(--db-purple-500)]/30',
      onClick: onOpenLibrary,
    },
    {
      id: 'settings',
      title: 'Engine & Settings',
      description: 'Configure provider API keys, model routing, voice studio, and audio mixing.',
      icon: (
        <svg className="w-5 h-5 text-[var(--db-text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      iconBg: 'bg-[var(--db-bg-card)] border-[var(--db-border-default)]',
      onClick: onOpenSettings,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {actions.map((act) => (
        <Card
          key={act.id}
          variant="interactive"
          onClick={act.onClick}
          className="p-5 flex flex-col justify-between min-h-[140px]"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              act.onClick();
            }
          }}
        >
          <div className="mb-4">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${act.iconBg}`}>
              {act.icon}
            </div>
            <h3 className="font-serif font-semibold text-sm text-[var(--db-text-primary)] mb-1 group-hover:text-[var(--db-gold-400)] transition-colors">
              {act.title}
            </h3>
            <p className="text-xs text-[var(--db-text-secondary)] leading-relaxed">
              {act.description}
            </p>
          </div>
          <div className="flex items-center text-xs text-[var(--db-gold-400)] font-medium group-hover:translate-x-1 transition-transform">
            <span>Launch</span>
            <span className="ml-1">→</span>
          </div>
        </Card>
      ))}
    </div>
  );
};
