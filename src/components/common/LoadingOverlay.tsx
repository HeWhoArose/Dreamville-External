import React from 'react';

export interface LoadingOverlayProps {
  title?: string;
  subtitle?: string;
  fullScreen?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  title = 'Processing...',
  subtitle,
  fullScreen = false,
}) => {
  const container = fullScreen
    ? 'fixed inset-0 z-50 bg-[var(--db-bg-overlay)] backdrop-blur-sm'
    : 'w-full py-16 bg-transparent';

  return (
    <div className={`flex flex-col items-center justify-center p-6 text-center ${container}`}>
      <div className="relative w-12 h-12 mb-4 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-[var(--db-purple-500)]/20 animate-ping" />
        <div className="w-8 h-8 rounded-full border-2 border-[var(--db-gold-400)] border-t-transparent animate-spin" />
      </div>
      <h3 className="font-serif font-bold text-base text-[var(--db-text-primary)] mb-1">
        {title}
      </h3>
      {subtitle && (
        <p className="text-xs text-[var(--db-text-secondary)] max-w-sm">
          {subtitle}
        </p>
      )}
    </div>
  );
};
