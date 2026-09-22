import type { WorldRepository } from '../repositories/worldRepository';
import { mediaAdapterService } from './mediaAdapterService';

export interface CombatAssetRecord {
  assetId: string;
  storyId: string;
  effectId: string;
  prompt: string;
  imageUrl?: string;
  fallback: boolean;
  provider?: string;
  model?: string;
  format?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  generatedAt: string;
}

export class CombatAssetService {
  private readonly cache = new Map<string, CombatAssetRecord>();

  public get(assetId: string): CombatAssetRecord | undefined {
    const record = this.cache.get(assetId);
    return record ? JSON.parse(JSON.stringify(record)) : undefined;
  }

  public async ensure(params: { repository: WorldRepository; storyId: string; effectId: string; prompt: string; assetId?: string }): Promise<CombatAssetRecord> {
    const assetId = params.assetId || `combat_asset_${params.effectId}`;
    const cached = this.cache.get(assetId);
    if (cached) return JSON.parse(JSON.stringify(cached));

    const persisted = params.repository.getActiveEffects(params.storyId).find(
      (effect: any) =>
        effect?.type === 'COMBAT_ASSET_REFERENCE' &&
        effect?.assetId === assetId &&
        effect?.presentationOnly === true
    );
    if (persisted) {
      const restored: CombatAssetRecord = {
        assetId,
        storyId: params.storyId,
        effectId: params.effectId,
        prompt: String(persisted.prompt || params.prompt),
        imageUrl: persisted.imageUrl,
        fallback: Boolean(persisted.fallback),
        provider: typeof persisted.provider === 'string' ? persisted.provider : undefined,
        model: typeof persisted.model === 'string' ? persisted.model : undefined,
        format: typeof persisted.format === 'string' ? persisted.format : undefined,
        width: typeof persisted.width === 'number' ? persisted.width : undefined,
        height: typeof persisted.height === 'number' ? persisted.height : undefined,
        aspectRatio: typeof persisted.aspectRatio === 'string' ? persisted.aspectRatio : undefined,
        generatedAt: String(persisted.generatedAt || new Date(0).toISOString()),
      };
      this.cache.set(assetId, restored);
      return JSON.parse(JSON.stringify(restored));
    }

    const media = await mediaAdapterService.generateImage({
      storyId: params.storyId,
      prompt: params.prompt,
      assetId,
      aspectRatio: '1:1',
      tags: ['combat', 'phase8.5', params.effectId],
    });
    const record: CombatAssetRecord = {
      assetId,
      storyId: params.storyId,
      effectId: params.effectId,
      prompt: media.promptFallback || params.prompt,
      imageUrl: media.imageUrl,
      fallback: Boolean(media.isFallback),
      provider: typeof media.assetMetadata?.provider === 'string' ? media.assetMetadata.provider : undefined,
      model: typeof media.assetMetadata?.model === 'string' ? media.assetMetadata.model : undefined,
      format: media.mediaAsset?.format,
      width: media.mediaAsset?.width,
      height: media.mediaAsset?.height,
      aspectRatio: media.mediaAsset?.aspectRatio,
      generatedAt: String(media.assetMetadata?.generatedAt || new Date().toISOString()),
    };
    this.cache.set(assetId, record);
    params.repository.saveActiveEffect({
      id: `combat_asset_${params.storyId}_${assetId}`,
      type: 'COMBAT_ASSET_REFERENCE',
      storyId: params.storyId,
      assetId,
      effectId: params.effectId,
      imageUrl: record.imageUrl,
      prompt: record.prompt,
      fallback: record.fallback,
      provider: record.provider,
      model: record.model,
      format: record.format,
      width: record.width,
      height: record.height,
      aspectRatio: record.aspectRatio,
      generatedAt: record.generatedAt,
      presentationOnly: true,
      cacheDisposable: true,
    });
    return JSON.parse(JSON.stringify(record));
  }

  public clearMemoryCache(): void { this.cache.clear(); }
}

export const combatAssetService = new CombatAssetService();
