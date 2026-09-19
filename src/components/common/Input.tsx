import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  errorMessage?: string;
}

export const Input: React.FC<InputProps> = ({
  icon,
  errorMessage,
  className = '',
  ...props
}) => {
  return (
    <div className="w-full">
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3.5 text-[var(--db-text-muted)] pointer-events-none flex items-center">
            {icon}
          </div>
        )}
        <input
          className={`w-full bg-[var(--db-bg-raised)] text-[var(--db-text-primary)] placeholder-[var(--db-text-muted)] text-sm rounded-[var(--db-radius-md)] border border-[var(--db-border-default)] ${
            icon ? 'pl-10' : 'pl-3.5'
          } pr-3.5 py-2.5 transition-all outline-none focus:border-[var(--db-purple-400)] focus:ring-2 focus:ring-[var(--db-purple-500)]/20 ${
            errorMessage ? 'border-rose-500/80 focus:border-rose-400' : ''
          } ${className}`}
          {...props}
        />
      </div>
      {errorMessage && (
        <p className="mt-1 text-xs text-rose-400 pl-1">{errorMessage}</p>
      )}
    </div>
  );
};
