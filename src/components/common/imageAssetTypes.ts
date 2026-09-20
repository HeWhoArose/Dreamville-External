import { appendImageOutputSpecification, getImageAssetSpec } from '../../data/imageAssetSpecs';

export type ImageAssetSlotType =
  | 'world_cover'
  | 'story_run_cover'
  | 'character_portrait'
  | 'npc_portrait'
  | 'equipment'
  | 'item'
  | 'skill_icon'
  | 'spell_icon'
  | 'creature'
  | 'location'
  | 'scene';

export interface ImageAssetMeta {
  slotId: string;
  slotType: ImageAssetSlotType;
  title: string;
  subject?: string;
  traits?: string[];
  role?: string;
  equipment?: string;
  setting?: string;
  environment?: string;
  mood?: string;
  artDirection?: string;
  composition?: string;
  lightingColor?: string;
  aspectRatio?: '16:9' | '4:3' | '1:1' | '3:4' | '21:9' | string;
  width?: number;
  height?: number;
  fitMode?: 'contain' | 'cover';
  currentImageUrl?: string;
  previousImageUrls?: string[];
  provenance?: string;
  isEditable?: boolean;
}

/**
 * Compiles a complete, structured, provider-neutral image generation prompt
 * from domain asset metadata. Incorporates subject, traits, environment, lighting,
 * composition, and negative styling constraints without vendor lock-in.
 */
export function compileProviderNeutralPrompt(meta: ImageAssetMeta): string {
  const spec = getImageAssetSpec(meta.slotType);
  const parts: string[] = [];
  const subjectDesc = meta.subject || meta.title;

  if (meta.slotType === 'character_portrait' || meta.slotType === 'npc_portrait') {
    parts.push('High-fidelity character portrait of ' + subjectDesc);
    if (meta.role) parts.push('Role: ' + meta.role);
    if (meta.traits?.length) parts.push('Key visual traits: ' + meta.traits.join(', '));
    if (meta.equipment) parts.push('Attire and gear: ' + meta.equipment);
  } else if (meta.slotType === 'world_cover' || meta.slotType === 'story_run_cover') {
    parts.push('Epic concept art landscape depicting the setting of "' + meta.title + '"');
    if (meta.setting) parts.push('Setting details: ' + meta.setting);
    if (meta.environment) parts.push('Atmosphere: ' + meta.environment);
  } else if (meta.slotType === 'equipment' || meta.slotType === 'item') {
    parts.push('Detailed fantasy equipment illustration of "' + meta.title + '"');
    if (meta.role) parts.push('Category: ' + meta.role);
    if (meta.traits?.length) parts.push('Craft characteristics: ' + meta.traits.join(', '));
  } else if (meta.slotType === 'skill_icon' || meta.slotType === 'spell_icon') {
    parts.push('Iconic ability emblem for "' + meta.title + '"');
    if (meta.traits?.length) parts.push('Manifestation elements: ' + meta.traits.join(', '));
  } else if (meta.slotType === 'creature') {
    parts.push('Bestiary field illustration of ' + subjectDesc);
    if (meta.traits?.length) parts.push('Anatomy and features: ' + meta.traits.join(', '));
    if (meta.environment) parts.push('Natural habitat: ' + meta.environment);
  } else {
    parts.push('Atmospheric narrative illustration of "' + meta.title + '"');
  }

  if (meta.mood) parts.push('Tone & mood: ' + meta.mood);
  parts.push('Artistic style: ' + (meta.artDirection || 'Painterly fantasy realism, intricate textures, rich atmospheric depth'));
  parts.push('Lighting: ' + (meta.lightingColor || 'Dramatic chiaroscuro with ambient rim lighting in purple, blue, and gold tones'));
  parts.push('Framing: ' + (meta.composition || ('Cinematic centered focal framing for ' + spec.aspectRatio)));
  parts.push('Constraints: No modern artifacts, no digital UI text or watermarks, maintain clean anatomical clarity.');

  return appendImageOutputSpecification(parts.join('.\n'), meta.slotType);
}
