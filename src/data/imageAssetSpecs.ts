import type { ImageAssetSlotType } from '../components/common/imageAssetTypes';

export type ImageAssetFitMode = 'contain' | 'cover';

export interface ImageAssetSpec {
  slotType: ImageAssetSlotType;
  width: number;
  height: number;
  aspectRatio: string;
  fitMode: ImageAssetFitMode;
  outputMimeType: 'image/png' | 'image/webp';
  quality: number;
  safeMarginPercent: number;
  allowTransparency: boolean;
  imageSize: '1K' | '2K' | '4K';
}

export const IMAGE_ASSET_SPECS: Record<ImageAssetSlotType, ImageAssetSpec> = {
  world_cover: { slotType: 'world_cover', width: 1200, height: 900, aspectRatio: '4:3', fitMode: 'cover', outputMimeType: 'image/webp', quality: 0.9, safeMarginPercent: 6, allowTransparency: false, imageSize: '1K' },
  story_run_cover: { slotType: 'story_run_cover', width: 1280, height: 720, aspectRatio: '16:9', fitMode: 'cover', outputMimeType: 'image/webp', quality: 0.9, safeMarginPercent: 5, allowTransparency: false, imageSize: '1K' },
  character_portrait: { slotType: 'character_portrait', width: 1024, height: 1024, aspectRatio: '1:1', fitMode: 'contain', outputMimeType: 'image/webp', quality: 0.9, safeMarginPercent: 8, allowTransparency: false, imageSize: '1K' },
  npc_portrait: { slotType: 'npc_portrait', width: 1024, height: 1024, aspectRatio: '1:1', fitMode: 'contain', outputMimeType: 'image/webp', quality: 0.9, safeMarginPercent: 8, allowTransparency: false, imageSize: '1K' },
  equipment: { slotType: 'equipment', width: 1024, height: 1024, aspectRatio: '1:1', fitMode: 'contain', outputMimeType: 'image/png', quality: 1, safeMarginPercent: 10, allowTransparency: true, imageSize: '1K' },
  item: { slotType: 'item', width: 1024, height: 1024, aspectRatio: '1:1', fitMode: 'contain', outputMimeType: 'image/png', quality: 1, safeMarginPercent: 10, allowTransparency: true, imageSize: '1K' },
  skill_icon: { slotType: 'skill_icon', width: 1024, height: 1024, aspectRatio: '1:1', fitMode: 'contain', outputMimeType: 'image/png', quality: 1, safeMarginPercent: 10, allowTransparency: true, imageSize: '1K' },
  spell_icon: { slotType: 'spell_icon', width: 1024, height: 1024, aspectRatio: '1:1', fitMode: 'contain', outputMimeType: 'image/png', quality: 1, safeMarginPercent: 10, allowTransparency: true, imageSize: '1K' },
  creature: { slotType: 'creature', width: 1200, height: 900, aspectRatio: '4:3', fitMode: 'contain', outputMimeType: 'image/webp', quality: 0.9, safeMarginPercent: 6, allowTransparency: false, imageSize: '1K' },
  location: { slotType: 'location', width: 1280, height: 720, aspectRatio: '16:9', fitMode: 'cover', outputMimeType: 'image/webp', quality: 0.9, safeMarginPercent: 5, allowTransparency: false, imageSize: '1K' },
  scene: { slotType: 'scene', width: 1280, height: 720, aspectRatio: '16:9', fitMode: 'cover', outputMimeType: 'image/webp', quality: 0.9, safeMarginPercent: 5, allowTransparency: false, imageSize: '1K' },
};

export function getImageAssetSpec(slotType: ImageAssetSlotType): ImageAssetSpec {
  return IMAGE_ASSET_SPECS[slotType];
}

export const PROVIDER_SUPPORTED_IMAGE_ASPECT_RATIOS = new Set([
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
]);

export function isProviderSupportedImageAspectRatio(aspectRatio: string): boolean {
  return PROVIDER_SUPPORTED_IMAGE_ASPECT_RATIOS.has(aspectRatio);
}

export function appendImageOutputSpecification(prompt: string, slotType: ImageAssetSlotType): string {
  const spec = getImageAssetSpec(slotType);
  const base = (prompt || '').trim();
  if (base.includes('DREAMBOOK OUTPUT SPECIFICATION')) return base;

  const fitInstruction = spec.fitMode === 'contain'
    ? 'Keep the entire subject visible inside the frame; do not crop important content.'
    : 'Compose for full-bleed framing while keeping all critical content inside the safe margin.';

  return [
    base || ('DreamBook ' + slotType + ' image'),
    '',
    'DREAMBOOK OUTPUT SPECIFICATION',
    'Dimensions: ' + spec.width + ' × ' + spec.height + ' pixels',
    'Aspect ratio: ' + spec.aspectRatio,
    'Fit policy: ' + spec.fitMode,
    'Safe margin: ' + spec.safeMarginPercent + '%',
    fitInstruction,
    'Do not place important faces, heads, silhouettes, weapons, text, or object edges against the canvas boundary.',
    'No watermarks, no UI framing, no unintended borders, no text unless explicitly requested by the visual concept.',
  ].join('\n');
}
