import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-dashed border-[var(--db-border-default)] ${className}`}
    >
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-[var(--db-surface-purple)] border border-[var(--db-purple-500)]/20 flex items-center justify-center mb-4 text-[var(--db-gold-400)] shadow-[var(--db-shadow-glow-purple)]">
          {icon}
        </div>
      )}
      <h3 className="font-serif font-bold text-base text-[var(--db-text-primary)] mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-[var(--db-text-secondary)] max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button
          variant="primary"
          size="sm"
          onClick={onAction}
          icon={actionIcon}
          className="text-xs"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
