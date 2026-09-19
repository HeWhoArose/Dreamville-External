import React from 'react';

export interface FilterChipProps {
  label: string;
  count?: number;
  isSelected?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: 'purple' | 'gold' | 'blue';
}

export const FilterChip: React.FC<FilterChipProps> = ({
  label,
  count,
  isSelected = false,
  onClick,
  icon,
  variant = 'purple',
}) => {
  const activeStyle = {
    purple: 'bg-[var(--db-purple-600)] text-[#ffffff] border-[var(--db-purple-400)] shadow-[var(--db-shadow-glow-purple)]',
    gold: 'bg-[var(--db-gold-500)] text-[var(--db-text-on-accent)] font-semibold border-[var(--db-gold-400)] shadow-[var(--db-shadow-glow)]',
    blue: 'bg-[var(--db-blue-600)] text-[#ffffff] border-[var(--db-blue-400)] shadow-[var(--db-shadow-glow-blue)]',
  }[variant];

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--db-radius-full)] text-xs font-medium border transition-all cursor-pointer select-none ${
        isSelected
          ? activeStyle
          : 'bg-[var(--db-bg-card)] text-[var(--db-text-secondary)] border-[var(--db-border-default)] hover:border-[var(--db-border-purple)] hover:text-[var(--db-text-primary)] hover:bg-[var(--db-bg-raised)]'
      }`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{label}</span>
      {typeof count === 'number' && (
        <span
          className={`text-[10px] px-1.5 py-0.2 rounded-full ${
            isSelected
              ? 'bg-black/25 text-white'
              : 'bg-[var(--db-bg-raised)] text-[var(--db-text-muted)]'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};
