import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'gold' | 'purple' | 'blue' | 'emerald' | 'rose' | 'amber' | 'stone';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'stone',
  size = 'sm',
  icon,
  className = '',
}) => {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 rounded-[var(--db-radius-xs)] gap-1 tracking-wide font-medium',
    md: 'text-xs px-2.5 py-1 rounded-[var(--db-radius-sm)] gap-1.5 tracking-wide font-medium',
  };

  const variantStyles = {
    gold: 'bg-[var(--db-gold-500)]/15 text-[var(--db-gold-400)] border border-[var(--db-gold-500)]/30',
    purple: 'bg-[var(--db-purple-500)]/15 text-[var(--db-purple-300)] border border-[var(--db-purple-500)]/35',
    blue: 'bg-[var(--db-blue-500)]/15 text-[var(--db-blue-300)] border border-[var(--db-blue-500)]/35',
    emerald: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    stone: 'bg-[var(--db-bg-raised)] text-[var(--db-text-secondary)] border border-[var(--db-border-default)]',
  };

  return (
    <span
      className={`inline-flex items-center select-none ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
