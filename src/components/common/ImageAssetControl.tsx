import React, { useState } from 'react';
import { Button } from './Button';
import { Badge } from './Badge';
import { ImageAssetMeta, compileProviderNeutralPrompt } from './imageAssetTypes';
import { getImageAssetSpec } from '../../data/imageAssetSpecs';
import { normalizeImageFile, normalizeImageUrl } from '../../utils/imageAssetNormalizer';
import { apiClient } from '../../services/apiClient';

export interface ImageAssetControlProps {
  meta: ImageAssetMeta;
  onAssetChange?: (newUrl?: string, provenance?: string) => void;
  className?: string;
}

export const ImageAssetControl: React.FC<ImageAssetControlProps> = ({
  meta,
  onAssetChange,
  className = '',
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'NONE' | 'PROMPT' | 'IMPORT' | 'CANDIDATE' | 'FAILURE'>('NONE');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [candidateUrl, setCandidateUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpenCreatePrompt = () => {
    const prompt = compileProviderNeutralPrompt(meta);
    setGeneratedPrompt(prompt);
    setCopiedPrompt(false);
    setIsMenuOpen(false);
    setActiveModal('PROMPT');
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    } catch {
      setCopiedPrompt(false);
    }
  };

  const handleOpenImport = () => {
    setImportUrl('');
    setErrorMessage(null);
    setIsMenuOpen(false);
    setActiveModal('IMPORT');
  };

  const handleApplyImport = async () => {
    if (!importUrl.trim()) {
      setErrorMessage('Please enter a valid image URL or upload a file.');
      return;
    }
    setIsNormalizing(true);
    setErrorMessage(null);
    try {
      const normalized = await normalizeImageUrl(importUrl.trim(), getImageAssetSpec(meta.slotType));
      onAssetChange?.(normalized.dataUrl, 'Imported and normalized asset for ' + meta.slotId);
      setActiveModal('NONE');
    } catch (err: any) {
      setErrorMessage(err?.message || 'The remote image could not be normalized. Upload the image file if the host blocks CORS.');
    } finally {
      setIsNormalizing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file.');
      return;
    }
    setIsNormalizing(true);
    setErrorMessage(null);
    try {
      const normalized = await normalizeImageFile(file, getImageAssetSpec(meta.slotType));
      onAssetChange?.(normalized.dataUrl, 'Uploaded and normalized asset (' + file.name + ')');
      setActiveModal('NONE');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not normalize the imported image.');
    } finally {
      setIsNormalizing(false);
    }
  };

  const handleRegenerate = async () => {
    setIsMenuOpen(false);
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const spec = getImageAssetSpec(meta.slotType);
      const res = await apiClient.generateImage({
        prompt: compileProviderNeutralPrompt(meta),
        aspectRatio: spec.aspectRatio,
        slotType: meta.slotType,
        assetId: meta.slotId,
        tags: ['image_asset', meta.slotType],
      });
      if (!res.success || !res.imageUrl) throw new Error(res.errorReason || 'Image generation returned no usable image.');
      setIsNormalizing(true);
      const normalized = await normalizeImageUrl(res.imageUrl, spec);
      setCandidateUrl(normalized.dataUrl);
      setActiveModal('CANDIDATE');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Image generation failed.');
      setActiveModal('FAILURE');
    } finally {
      setIsNormalizing(false);
      setIsGenerating(false);
    }
  };

  const handleApplyCandidate = () => {
    if (candidateUrl) {
      onAssetChange?.(candidateUrl, `Candidate approved for ${meta.slotId}`);
    }
    setActiveModal('NONE');
  };

  const handleRemove = () => {
    onAssetChange?.(undefined, undefined);
    setIsMenuOpen(false);
  };

  return (
    <>
      {/* Subtle floating pencil icon affordance */}
      <div className={`absolute top-2 right-2 z-30 ${className}`}>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen((prev) => !prev);
            }}
            disabled={isGenerating}
            className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/85 text-white/80 hover:text-white border border-white/20 flex items-center justify-center backdrop-blur-md shadow-md cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--db-purple-400)] active:scale-95"
            aria-label={`Image actions for ${meta.title}`}
            title="Image Asset Actions"
          >
            {isGenerating ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            )}
          </button>

          {/* Action Menu Popover */}
          {isMenuOpen && (
            <div
              className="absolute right-0 mt-1 w-52 bg-[var(--db-bg-raised)] border border-[var(--db-border-strong)] rounded-[var(--db-radius-md)] shadow-[var(--db-shadow-lg)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2 py-1 text-[10px] uppercase font-semibold text-[var(--db-text-muted)] border-b border-[var(--db-border-default)] mb-1 truncate">
                {meta.title}
              </div>

              <button
                type="button"
                onClick={handleOpenCreatePrompt}
                className="w-full text-left px-2.5 py-1.5 rounded-[var(--db-radius-sm)] text-xs text-[var(--db-text-primary)] hover:bg-[var(--db-bg-card)] hover:text-[var(--db-gold-300)] flex items-center gap-2 cursor-pointer transition-colors"
              >
                <span>✎</span>
                <span>Create Prompt</span>
              </button>

              <button
                type="button"
                onClick={handleOpenImport}
                className="w-full text-left px-2.5 py-1.5 rounded-[var(--db-radius-sm)] text-xs text-[var(--db-text-primary)] hover:bg-[var(--db-bg-card)] hover:text-[var(--db-blue-300)] flex items-center gap-2 cursor-pointer transition-colors"
              >
                <span>📌</span>
                <span>Import Image</span>
              </button>

              <button
                type="button"
                onClick={handleRegenerate}
                className="w-full text-left px-2.5 py-1.5 rounded-[var(--db-radius-sm)] text-xs text-[var(--db-text-primary)] hover:bg-[var(--db-bg-card)] hover:text-[var(--db-purple-300)] flex items-center gap-2 cursor-pointer transition-colors"
              >
                <span>↻</span>
                <span>Regenerate Candidate</span>
              </button>

              {meta.currentImageUrl && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="w-full text-left px-2.5 py-1.5 rounded-[var(--db-radius-sm)] text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer transition-colors border-t border-[var(--db-border-default)] mt-1 pt-1"
                >
                  <span>🗑</span>
                  <span>Remove Image</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 1. Modal: Create Provider-Neutral Prompt */}
      {activeModal === 'PROMPT' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setActiveModal('NONE')}
        >
          <div
            className="w-full max-w-xl bg-[var(--db-bg-canvas)] border border-[var(--db-border-purple)] rounded-[var(--db-radius-lg)] p-6 shadow-[var(--db-shadow-lg)] space-y-4"
            onClick={(e) => e.stopPropagation()}
            data-testid="image-prompt-dialog"
          >
            <div className="flex items-center justify-between border-b border-[var(--db-border-default)] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-serif font-bold text-[var(--db-text-primary)]">
                  Image Generation Prompt
                </span>
                <Badge variant="purple" size="sm">
                  Provider Neutral
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[var(--db-text-secondary)]">
              This prompt has been synthesized from canonical domain metadata for <strong>{meta.title}</strong>.
              You can copy it to render assets in any external image engine.
            </p>

            <div className="p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-subtle)] border border-[var(--db-border-subtle)] text-xs font-mono text-[var(--db-text-primary)] whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
              {generatedPrompt}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant={copiedPrompt ? 'subtle' : 'primary'}
                size="sm"
                onClick={handleCopyPrompt}
                className="gap-1.5"
              >
                {copiedPrompt ? '✓ Copied to Clipboard' : '📋 Copy Prompt'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setActiveModal('NONE')}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Import Image */}
      {activeModal === 'IMPORT' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setActiveModal('NONE')}
        >
          <div
            className="w-full max-w-md bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] rounded-[var(--db-radius-lg)] p-6 shadow-[var(--db-shadow-lg)] space-y-4"
            onClick={(e) => e.stopPropagation()}
            data-testid="image-import-dialog"
          >
            <div className="flex items-center justify-between border-b border-[var(--db-border-default)] pb-3">
              <h3 className="text-base font-serif font-bold text-[var(--db-text-primary)]">
                Import Visual Asset
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[var(--db-text-secondary)]">
              Assign an image directly to <strong>{meta.title}</strong> ({meta.slotType}).
            </p>

            {errorMessage && (
              <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {errorMessage}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--db-text-secondary)] mb-1">
                  Image Web URL
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-[var(--db-radius-md)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)] focus:border-[var(--db-purple-500)] focus:outline-none"
                />
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-[var(--db-border-default)]" />
                <span className="flex-shrink mx-2 text-[10px] uppercase text-[var(--db-text-muted)]">OR</span>
                <div className="flex-grow border-t border-[var(--db-border-default)]" />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--db-text-secondary)] mb-1">
                  Upload Image File
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-[var(--db-text-muted)] file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-[var(--db-surface-purple)] file:text-[var(--db-purple-300)] hover:file:bg-[var(--db-purple-500)]/30 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--db-border-default)]">
              <Button variant="ghost" size="sm" onClick={() => setActiveModal('NONE')}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleApplyImport}>
                Assign Asset
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Candidate Version Comparison & Approval */}
      {activeModal === 'CANDIDATE' && candidateUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setActiveModal('NONE')}
        >
          <div
            className="w-full max-w-2xl bg-[var(--db-bg-canvas)] border border-[var(--db-border-purple)] rounded-[var(--db-radius-lg)] p-6 shadow-[var(--db-shadow-lg)] space-y-4"
            onClick={(e) => e.stopPropagation()}
            data-testid="image-candidate-dialog"
          >
            <div className="flex items-center justify-between border-b border-[var(--db-border-default)] pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-serif font-bold text-[var(--db-text-primary)]">
                  Manage Image Candidates
                </h3>
                <Badge variant="gold" size="sm">
                  Review Version
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[var(--db-text-secondary)]">
              Compare current approved artwork with the new generated candidate for <strong>{meta.title}</strong>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* Current Asset */}
              <div className="p-3 rounded-[var(--db-radius-md)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] flex flex-col items-center space-y-2">
                <span className="text-xs font-semibold text-[var(--db-text-muted)] uppercase">
                  Current Approved
                </span>
                <div className="w-full aspect-[4/3] rounded bg-black/40 overflow-hidden flex items-center justify-center">
                  {meta.currentImageUrl ? (
                    <img
                      src={meta.currentImageUrl}
                      alt="Current approved"
                      referrerPolicy="no-referrer"
                      className={getImageAssetSpec(meta.slotType).fitMode === 'cover' ? 'w-full h-full object-cover' : 'w-full h-full object-contain'}
                    />
                  ) : (
                    <span className="text-xs text-[var(--db-text-muted)]">No prior image</span>
                  )}
                </div>
                <Button variant="subtle" size="sm" onClick={() => setActiveModal('NONE')} className="w-full">
                  Keep Current
                </Button>
              </div>

              {/* New Candidate */}
              <div className="p-3 rounded-[var(--db-radius-md)] bg-[var(--db-surface-purple)] border border-[var(--db-purple-500)]/40 flex flex-col items-center space-y-2">
                <span className="text-xs font-semibold text-[var(--db-purple-300)] uppercase">
                  New Candidate
                </span>
                <div className="w-full aspect-[4/3] rounded bg-black/40 overflow-hidden flex items-center justify-center">
                  <img
                    src={candidateUrl}
                    alt="New generated candidate"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <Button variant="primary" size="sm" onClick={handleApplyCandidate} className="w-full">
                  Use New Asset
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal: Generation Failure UX */}
      {activeModal === 'FAILURE' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setActiveModal('NONE')}
        >
          <div
            className="w-full max-w-md bg-[var(--db-bg-canvas)] border border-amber-500/40 rounded-[var(--db-radius-lg)] p-6 shadow-[var(--db-shadow-lg)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-amber-400">
              <span className="text-lg">⚠️</span>
              <h3 className="text-base font-serif font-bold text-[var(--db-text-primary)]">
                Image Generation Unavailable
              </h3>
            </div>
            <p className="text-xs text-[var(--db-text-secondary)] leading-relaxed">
              Automated image synthesis is currently offline or unreachable. Existing approved assets remain preserved and gameplay will continue uninterrupted.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="primary" size="sm" onClick={handleOpenCreatePrompt}>
                Create Prompt for External Render
              </Button>
              <Button variant="subtle" size="sm" onClick={handleOpenImport}>
                Import Custom Image
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setActiveModal('NONE')}>
                Keep Current
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
