import { MediaGenerationResult } from '../../src/types';

export interface ImageGenerationOptions {
  storyId: string;
  prompt: string;
  assetId?: string;
  aspectRatio?: string;
  tags?: string[];
}

/**
 * MediaAdapterService
 * Implements DreamBook Image & Media Generation Abstraction.
 *
 * Rules:
 * 1. Images and media assets are PRESENTATION ONLY and never canonical world truth.
 * 2. If provider fails (HTTP 500, timeout, quota, disconnect), gameplay MUST continue seamlessly.
 * 3. Graceful fallback presentation data (prompt fallback, deterministic placeholder) is returned.
 * 4. Failure injection is supported for automated reliability verification.
 */
export class MediaAdapterService {
  private failureMode: 'NONE' | 'HTTP_500' | 'TIMEOUT' | 'RATE_LIMIT' | 'CORRUPT_PAYLOAD' | 'FALLBACK_GENERATION' | 'PROVIDER_UNAVAILABLE' = 'NONE';

  public setFailureMode(mode: 'NONE' | 'HTTP_500' | 'TIMEOUT' | 'RATE_LIMIT' | 'CORRUPT_PAYLOAD' | 'FALLBACK_GENERATION' | 'PROVIDER_UNAVAILABLE'): void {
    this.failureMode = mode;
  }

  public getFailureMode(): string {
    return this.failureMode;
  }

  public async generateImage(options: ImageGenerationOptions): Promise<MediaGenerationResult> {
    const fallbackText = options.prompt || 'Atmospheric scene in Dreamville realm';

    // Check for simulated provider failure modes
    if (this.failureMode === 'TIMEOUT') {
      return {
        success: false,
        isFallback: true,
        failureModeInjected: 'TIMEOUT',
        promptFallback: `[Visual Description Fallback: ${fallbackText}]`,
        errorReason: 'Media generation request timed out after 30000ms',
      };
    }

    if (this.failureMode === 'RATE_LIMIT') {
      return {
        success: false,
        isFallback: true,
        failureModeInjected: 'RATE_LIMIT',
        promptFallback: `[Visual Description Fallback: ${fallbackText}]`,
        errorReason: 'Provider rate limit or quota exceeded (HTTP 429)',
      };
    }

    if (this.failureMode === 'CORRUPT_PAYLOAD') {
      return {
        success: false,
        isFallback: true,
        failureModeInjected: 'CORRUPT_PAYLOAD',
        promptFallback: `[Visual Description Fallback: ${fallbackText}]`,
        errorReason: 'Provider returned corrupted unparseable image binary payload',
      };
    }

    if (this.failureMode === 'HTTP_500' || this.failureMode === 'PROVIDER_UNAVAILABLE') {
      return {
        success: false,
        isFallback: true,
        failureModeInjected: this.failureMode,
        promptFallback: `[Visual Description Fallback: ${fallbackText}]`,
        errorReason: `Media provider service error: ${this.failureMode}`,
      };
    }

    if (this.failureMode === 'FALLBACK_GENERATION') {
      const fallbackAssetKey = `asset_fallback_${Date.now()}`;
      return {
        success: true,
        isFallback: true,
        failureModeInjected: 'FALLBACK_GENERATION',
        imageUrl: `/assets/placeholders/${fallbackAssetKey}.png`,
        mediaAsset: {
          assetId: fallbackAssetKey,
          url: `/assets/placeholders/${fallbackAssetKey}.png`,
          format: 'png',
          aspectRatio: options.aspectRatio || '1:1',
          tags: options.tags || ['fallback', 'placeholder'],
        },
        promptFallback: fallbackText,
        assetMetadata: {
          assetId: fallbackAssetKey,
          storyId: options.storyId,
          mediaSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          promptFallback: fallbackText,
          rightsStatus: 'generated_fallback_free',
          generatedAt: new Date().toISOString(),
        },
      };
    }

    // Normal provider generation
    const assetKey = options.assetId || `asset_gen_${Date.now()}`;
    const generatedUrl = `/assets/generated/${assetKey}.png`;
    return {
      success: true,
      isFallback: false,
      failureModeInjected: 'NONE',
      imageUrl: generatedUrl,
      mediaAsset: {
        assetId: assetKey,
        url: generatedUrl,
        format: 'png',
        aspectRatio: options.aspectRatio || '1:1',
        tags: options.tags || ['generated', 'scene'],
      },
      promptFallback: fallbackText,
      assetMetadata: {
        assetId: assetKey,
        storyId: options.storyId,
        mediaSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        promptFallback: fallbackText,
        rightsStatus: 'generated_canonical_free',
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

export const mediaAdapterService = new MediaAdapterService();
