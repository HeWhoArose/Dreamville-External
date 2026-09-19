import React from 'react';
import { Button } from '../common/Button';

export interface SplashScreenProps {
  status: 'loading' | 'restoring' | 'ready' | 'error';
  errorMessage?: string;
  onRetry?: () => void;
  onContinue?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  status = 'loading',
  errorMessage,
  onRetry,
  onContinue,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--db-bg-canvas)] flex flex-col items-center justify-center p-6 text-center select-none dreambook-ambient-glow"
      role="status"
      aria-label="DreamBook Boot Screen"
    >
      {/* Centered Brand Emblem & Wordmark */}
      <div className="flex flex-col items-center max-w-md w-full animate-in fade-in duration-500">
        <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
          {/* Subtle atmospheric PBG glow */}
          <div className="absolute inset-0 rounded-2xl bg-[var(--db-purple-500)]/20 blur-xl animate-pulse" />
          <div className="absolute inset-2 rounded-xl bg-[var(--db-gold-500)]/15 blur-lg" />
          
          {/* Logo Frame */}
          <div className="relative w-16 h-16 rounded-2xl bg-[var(--db-surface-purple)] border border-[var(--db-purple-500)]/50 flex items-center justify-center shadow-[var(--db-shadow-glow-purple)]">
            <svg
              className="w-9 h-9 text-[var(--db-gold-400)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <path d="M6 6h10" />
              <path d="M6 10h10" />
              <path d="M6 14h6" />
              <circle cx="18" cy="18" r="3" className="fill-[var(--db-gold-500)]/20 stroke-[var(--db-gold-400)]" />
            </svg>
          </div>
        </div>

        {/* Wordmark */}
        <h1 className="text-3xl sm:text-4xl font-serif font-semibold tracking-tight text-[var(--db-text-primary)] mb-1.5">
          DreamBook
        </h1>
        <p className="text-xs sm:text-sm text-[var(--db-text-secondary)] font-medium tracking-wide uppercase mb-8">
          Personal AI Story Engine
        </p>

        {/* Status / Loading Area */}
        <div className="w-full max-w-xs flex flex-col items-center min-h-[80px]">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-[var(--db-gold-400)] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[var(--db-text-secondary)]">Preparing DreamBook engine...</p>
            </div>
          )}

          {status === 'restoring' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-[var(--db-purple-400)] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[var(--db-purple-300)]">Restoring world state and narrative threads...</p>
            </div>
          )}

          {status === 'ready' && (
            <div className="flex flex-col items-center gap-3 animate-in fade-in duration-300 w-full">
              <p className="text-xs text-emerald-400 font-medium">✦ Story Engine Ready</p>
              {onContinue && (
                <Button variant="primary" size="md" onClick={onContinue} className="w-full">
                  Enter DreamBook
                </Button>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 p-4 rounded-[var(--db-radius-md)] bg-rose-950/30 border border-rose-900/50 w-full animate-in fade-in duration-300">
              <p className="text-xs text-rose-300 leading-snug">
                {errorMessage || 'Unable to connect to the DreamBook story service.'}
              </p>
              {onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry} className="w-full text-xs">
                  Retry Connection
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer subtle brand tag */}
      <div className="absolute bottom-6 text-[11px] text-[var(--db-text-muted)] tracking-wider uppercase">
        v10.8.35 Unified Canonical
      </div>
    </div>
  );
};
