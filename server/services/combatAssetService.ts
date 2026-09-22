import type { WorldRepository } from '../repositories/worldRepository';
import { mediaAdapterService } from './mediaAdapterService';

export interface CombatAssetRecord {
  assetId: string;
  storyId: string;
  effectId: string;
  prompt: string;
  imageUrl?: string;
  fallback: boolean;
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
      generatedAt: new Date().toISOString(),
    };
    this.cache.set(assetId, record);
    params.repository.saveActiveEffect({
      id: `combat_asset_${params.storyId}_${assetId}`,
      type: 'COMBAT_ASSET_REFERENCE',
      storyId: params.storyId,
      assetId,
      effectId: params.effectId,
      imageUrl: record.imageUrl,
      fallback: record.fallback,
      presentationOnly: true,
      cacheDisposable: true,
    });
    return JSON.parse(JSON.stringify(record));
  }

  public clearMemoryCache(): void { this.cache.clear(); }
}

export const combatAssetService = new CombatAssetService();
