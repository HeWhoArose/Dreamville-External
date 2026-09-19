import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  iconPosition = 'left',
  isLoading = false,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--db-purple-500)]/60 cursor-pointer';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 rounded-[var(--db-radius-sm)] gap-1.5 min-h-[32px]',
    md: 'text-sm px-4 py-2 rounded-[var(--db-radius-md)] gap-2 min-h-[40px]',
    lg: 'text-base px-6 py-3 rounded-[var(--db-radius-md)] gap-2.5 min-h-[48px]',
  };

  const variantStyles = {
    // Primary: Gold CTA
    primary: 'bg-[var(--db-gold-500)] hover:bg-[var(--db-gold-400)] active:bg-[var(--db-gold-600)] text-[var(--db-text-on-accent)] font-semibold shadow-[var(--db-shadow-sm)] hover:shadow-[var(--db-shadow-glow)]',
    // Secondary: Deep purple-slate raised surface
    secondary: 'bg-[var(--db-bg-raised)] hover:bg-[var(--db-surface-purple-raised)] text-[var(--db-text-primary)] border border-[var(--db-border-default)] hover:border-[var(--db-border-purple)]',
    // Subtle: Dark card surface
    subtle: 'bg-[var(--db-bg-card)] hover:bg-[var(--db-bg-raised)] text-[var(--db-text-secondary)] hover:text-[var(--db-text-primary)] border border-[var(--db-border-subtle)]',
    // Outline: Transparent border
    outline: 'bg-transparent hover:bg-[var(--db-bg-subtle)] text-[var(--db-text-primary)] border border-[var(--db-border-strong)] hover:border-[var(--db-border-purple)]',
    // Ghost: Seamless text button
    ghost: 'bg-transparent hover:bg-[var(--db-bg-raised)] text-[var(--db-text-secondary)] hover:text-[var(--db-text-primary)]',
    // Danger: Rose warning button
    danger: 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-200 border border-rose-800/50',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon && iconPosition === 'left' && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
      {!isLoading && icon && iconPosition === 'right' && <span className="shrink-0">{icon}</span>}
    </button>
  );
};
