import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'raised' | 'interactive' | 'active';
  isMuted?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  isMuted = false,
  className = '',
  ...props
}) => {
  const baseStyles = 'rounded-[var(--db-radius-lg)] transition-all overflow-hidden';

  const variantStyles = {
    default: 'bg-[var(--db-bg-card)] border border-[var(--db-border-default)] shadow-[var(--db-shadow-sm)]',
    raised: 'bg-[var(--db-bg-raised)] border border-[var(--db-border-strong)] shadow-[var(--db-shadow-md)]',
    interactive: 'bg-[var(--db-bg-card)] border border-[var(--db-border-default)] hover:border-[var(--db-border-purple)] hover:bg-[var(--db-bg-raised)] shadow-[var(--db-shadow-sm)] hover:shadow-[var(--db-shadow-glow-purple)] cursor-pointer group',
    active: 'bg-[var(--db-bg-raised)] border border-[var(--db-purple-500)] shadow-[var(--db-shadow-glow-purple)]',
  };

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${isMuted ? 'opacity-60' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
