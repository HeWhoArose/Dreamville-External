import React, { useState } from 'react';
import { ImageAssetControl } from './ImageAssetControl';
import { ImageAssetMeta } from './imageAssetTypes';

export interface WorldArtCoverProps {
  imageUrl?: string;
  worldName: string;
  genre?: string;
  aspectRatio?: 'banner' | 'card' | 'compact' | 'square';
  className?: string;
  showOverlay?: boolean;
  altText?: string;
  assetMeta?: ImageAssetMeta;
  onAssetChange?: (newUrl?: string, provenance?: string) => void;
}

export const WorldArtCover: React.FC<WorldArtCoverProps> = ({
  imageUrl,
  worldName,
  genre = 'Fantasy',
  aspectRatio = 'card',
  className = '',
  showOverlay = true,
  altText,
  assetMeta,
  onAssetChange,
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const ratioClass = {
    banner: 'aspect-[21/9] sm:aspect-[16/6]',
    card: 'aspect-[16/9]',
    compact: 'aspect-[4/3]',
    square: 'aspect-square',
  }[aspectRatio];

  // Genre-themed vector icon generator for placeholder
  const renderGenreSigil = (genreName: string) => {
    const g = genreName.toLowerCase();
    if (g.includes('cyber') || g.includes('sci-fi') || g.includes('space')) {
      return (
        <svg className="w-8 h-8 text-[var(--db-blue-400)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9z" />
          <path d="M2.5 12h19" />
        </svg>
      );
    }
    if (g.includes('horror') || g.includes('dark') || g.includes('eldritch')) {
      return (
        <svg className="w-8 h-8 text-[var(--db-purple-400)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2a10 10 0 1 0 10 10c0-4.42-3.58-8-8-8a8.03 8.03 0 0 0-5.83 2.5A8.003 8.003 0 0 0 12 2z" />
          <path d="M12 12v6" />
          <circle cx="12" cy="8" r="1" />
        </svg>
      );
    }
    if (g.includes('post-apoc') || g.includes('wasteland') || g.includes('survival')) {
      return (
        <svg className="w-8 h-8 text-[var(--db-gold-400)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="12 2 2 22 22 22" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <circle cx="12" cy="17" r="1" />
        </svg>
      );
    }
    // Default Fantasy / Mythic Sigil
    return (
      <svg className="w-8 h-8 text-[var(--db-gold-400)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  };

  const hasValidImage = imageUrl && imageUrl.trim() !== '' && !imageError;

  return (
    <div
      className={`relative w-full overflow-hidden bg-[var(--db-bg-subtle)] ${ratioClass} ${className}`}
      data-testid="world-art-cover"
    >
      {hasValidImage ? (
        <>
          <img
            src={imageUrl}
            alt={altText || `World artwork for ${worldName}`}
            referrerPolicy="no-referrer"
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
          {!imageLoaded && (
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--db-surface-purple)] via-[var(--db-bg-raised)] to-[var(--db-surface-blue)] animate-pulse" />
          )}
        </>
      ) : (
        /* Thematic Atmospheric DreamBook Vector Cover Placeholder */
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-[#1b1430] via-[#101426] to-[#09070f] border-b border-[var(--db-border-subtle)]">
          {/* Subtle celestial rings background effect */}
          <div className="absolute w-40 h-40 rounded-full border border-[var(--db-purple-500)]/10 animate-pulse pointer-events-none" />
          <div className="absolute w-28 h-28 rounded-full border border-[var(--db-blue-500)]/15 pointer-events-none" />
          
          <div className="relative z-10 w-12 h-12 rounded-xl bg-[var(--db-bg-card)]/80 border border-[var(--db-border-default)] flex items-center justify-center mb-2 shadow-[var(--db-shadow-glow-purple)]">
            {renderGenreSigil(genre)}
          </div>
          
          <span className="relative z-10 text-xs font-serif font-semibold text-[var(--db-text-secondary)] tracking-wide text-center line-clamp-1 max-w-[85%]">
            {worldName}
          </span>
          <span className="relative z-10 text-[10px] uppercase font-medium text-[var(--db-text-muted)] tracking-wider mt-0.5">
            {genre}
          </span>
        </div>
      )}

      {/* Atmospheric Vignette Overlay */}
      {showOverlay && (
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--db-bg-card)] via-transparent to-black/20 pointer-events-none" />
      )}

      {/* Optional Universal Image Asset Control */}
      {assetMeta && (
        <ImageAssetControl
          meta={{
            ...assetMeta,
            currentImageUrl: imageUrl || assetMeta.currentImageUrl,
          }}
          onAssetChange={onAssetChange}
        />
      )}
    </div>
  );
};
