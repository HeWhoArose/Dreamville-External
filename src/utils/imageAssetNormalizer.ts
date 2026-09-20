import type { ImageAssetSpec } from '../data/imageAssetSpecs';

export interface NormalizedImageAsset {
  dataUrl: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  mimeType: string;
  byteLength: number;
}

export interface ImageFitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculateImageFitRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fitMode: ImageAssetSpec['fitMode']
): ImageFitRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    throw new Error('Image dimensions must be positive numbers.');
  }

  const scale = fitMode === 'cover'
    ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);

  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The selected image could not be decoded by the browser.'));
    };
    image.src = objectUrl;
  });
}

export async function normalizeImageBlob(
  blob: Blob,
  spec: ImageAssetSpec
): Promise<NormalizedImageAsset> {
  if (!blob.type.startsWith('image/')) {
    throw new Error('The selected resource is not a supported image.');
  }

  const image = await loadImageFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The browser could not create an image processing canvas.');

  if (!spec.allowTransparency) {
    ctx.fillStyle = '#0b0f18';
    ctx.fillRect(0, 0, spec.width, spec.height);
  } else {
    ctx.clearRect(0, 0, spec.width, spec.height);
  }

  const rect = calculateImageFitRect(
    image.naturalWidth,
    image.naturalHeight,
    spec.width,
    spec.height,
    spec.fitMode
  );

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);

  const dataUrl = canvas.toDataURL(spec.outputMimeType, spec.quality);
  const base64 = dataUrl.split(',')[1] || '';

  return {
    dataUrl,
    width: spec.width,
    height: spec.height,
    sourceWidth: image.naturalWidth,
    sourceHeight: image.naturalHeight,
    mimeType: spec.outputMimeType,
    byteLength: Math.floor((base64.length * 3) / 4),
  };
}

export function normalizeImageFile(file: File, spec: ImageAssetSpec): Promise<NormalizedImageAsset> {
  return normalizeImageBlob(file, spec);
}

export async function normalizeImageUrl(
  url: string,
  spec: ImageAssetSpec
): Promise<NormalizedImageAsset> {
  const response = await fetch(url, { mode: 'cors', credentials: 'same-origin' });
  if (!response.ok) throw new Error('Image URL could not be fetched (HTTP ' + response.status + ').');
  return normalizeImageBlob(await response.blob(), spec);
}
