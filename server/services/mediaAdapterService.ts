import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { MediaGenerationResult } from '../../src/types';
import { getProviderApiKey } from './providerCredentialService';

export interface ImageGenerationOptions {
  storyId: string;
  prompt: string;
  assetId?: string;
  aspectRatio?: string;
  tags?: string[];
  characterName?: string;
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
      const svgBuffer = this.generateFallbackSvgBuffer(fallbackAssetKey, options.prompt);
      const publicDir = path.join(process.cwd(), 'public', 'assets', 'placeholders');
      fs.mkdirSync(publicDir, { recursive: true });
      fs.writeFileSync(path.join(publicDir, `${fallbackAssetKey}.svg`), svgBuffer);

      return {
        success: true,
        isFallback: true,
        failureModeInjected: 'FALLBACK_GENERATION',
        imageUrl: `/assets/placeholders/${fallbackAssetKey}.svg`,
        mediaAsset: {
          assetId: fallbackAssetKey,
          url: `/assets/placeholders/${fallbackAssetKey}.svg`,
          format: 'svg',
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

    // Normal Provider Generation
    const assetKey = options.assetId || `asset_gen_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const apiKey = getProviderApiKey('google_gemini') || process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt: options.prompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: (options.aspectRatio as any) || '1:1',
          },
        });

        const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
        if (imageBytes) {
          const buffer = Buffer.from(imageBytes, 'base64');
          const publicDir = path.join(process.cwd(), 'public', 'assets', 'generated');
          fs.mkdirSync(publicDir, { recursive: true });
          const filePath = path.join(publicDir, `${assetKey}.png`);
          fs.writeFileSync(filePath, buffer);

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
              tags: options.tags || ['generated', 'portrait'],
            },
            promptFallback: fallbackText,
            assetMetadata: {
              assetId: assetKey,
              storyId: options.storyId,
              promptFallback: fallbackText,
              rightsStatus: 'generated_canonical_free',
              generatedAt: new Date().toISOString(),
            },
          };
        }
      } catch (err: any) {
        console.warn('[MediaAdapterService] Imagen API call failed or unavailable:', err?.message || err);
      }
    }

    // Fallback vector portrait file generation when Imagen API is unconfigured or unavailable
    const svgBuffer = this.generateFallbackSvgBuffer(assetKey, options.prompt);
    const publicDir = path.join(process.cwd(), 'public', 'assets', 'generated');
    fs.mkdirSync(publicDir, { recursive: true });
    const filePath = path.join(publicDir, `${assetKey}.svg`);
    fs.writeFileSync(filePath, svgBuffer);

    const generatedUrl = `/assets/generated/${assetKey}.svg`;
    return {
      success: true,
      isFallback: true,
      failureModeInjected: 'NONE',
      imageUrl: generatedUrl,
      mediaAsset: {
        assetId: assetKey,
        url: generatedUrl,
        format: 'svg',
        aspectRatio: options.aspectRatio || '1:1',
        tags: options.tags || ['generated', 'portrait', 'vector_fallback'],
      },
      promptFallback: fallbackText,
      assetMetadata: {
        assetId: assetKey,
        storyId: options.storyId,
        promptFallback: fallbackText,
        rightsStatus: 'generated_vector_fallback',
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private generateFallbackSvgBuffer(assetKey: string, promptText: string): Buffer {
    const cleanPrompt = (promptText || 'Character Portrait').replace(/[<>&"]/g, '');
    const title = cleanPrompt.slice(0, 42);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>
    <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bgGrad)"/>
  <circle cx="200" cy="150" r="65" fill="url(#avatarGrad)" opacity="0.85"/>
  <circle cx="200" cy="125" r="32" fill="#e0e7ff"/>
  <path d="M 125 245 Q 200 175 275 245 L 275 280 Q 200 280 125 280 Z" fill="#e0e7ff"/>
  <rect x="20" y="310" width="360" height="70" rx="10" fill="#020617" opacity="0.8" stroke="#4f46e5" stroke-width="1.5"/>
  <text x="200" y="340" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#f8fafc" text-anchor="middle">${title}</text>
  <text x="200" y="362" font-family="system-ui, sans-serif" font-size="11" fill="#818cf8" text-anchor="middle">DreamBook Character Genesis</text>
</svg>`;

    return Buffer.from(svg, 'utf-8');
  }
}

export const mediaAdapterService = new MediaAdapterService();

