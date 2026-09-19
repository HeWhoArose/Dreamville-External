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
  const parts: string[] = [];

  // 1. Subject and core identity
  const subjectDesc = meta.subject || meta.title;
  if (meta.slotType === 'character_portrait' || meta.slotType === 'npc_portrait') {
    parts.push(`High-fidelity character portrait of ${subjectDesc}`);
    if (meta.role) parts.push(`Role: ${meta.role}`);
    if (meta.traits && meta.traits.length > 0) {
      parts.push(`Key visual traits: ${meta.traits.join(', ')}`);
    }
    if (meta.equipment) parts.push(`Attire and gear: ${meta.equipment}`);
  } else if (meta.slotType === 'world_cover' || meta.slotType === 'story_run_cover') {
    parts.push(`Epic concept art landscape depicting the setting of "${meta.title}"`);
    if (meta.setting) parts.push(`Setting details: ${meta.setting}`);
    if (meta.environment) parts.push(`Atmosphere: ${meta.environment}`);
  } else if (meta.slotType === 'equipment' || meta.slotType === 'item') {
    parts.push(`Detailed fantasy equipment illustration of "${meta.title}"`);
    if (meta.role) parts.push(`Category: ${meta.role}`);
    if (meta.traits && meta.traits.length > 0) {
      parts.push(`Forging and craft characteristics: ${meta.traits.join(', ')}`);
    }
  } else if (meta.slotType === 'skill_icon' || meta.slotType === 'spell_icon') {
    parts.push(`Iconic mystical ability emblem for "${meta.title}"`);
    if (meta.traits && meta.traits.length > 0) {
      parts.push(`Manifestation elements: ${meta.traits.join(', ')}`);
    }
  } else if (meta.slotType === 'creature') {
    parts.push(`Bestiary field illustration of ${subjectDesc}`);
    if (meta.traits && meta.traits.length > 0) {
      parts.push(`Anatomy and features: ${meta.traits.join(', ')}`);
    }
    if (meta.environment) parts.push(`Natural habitat: ${meta.environment}`);
  } else {
    parts.push(`Atmospheric narrative illustration of "${meta.title}"`);
  }

  // 2. Setting & Mood
  if (meta.mood) parts.push(`Tone & mood: ${meta.mood}`);
  if (meta.artDirection) parts.push(`Artistic style: ${meta.artDirection}`);
  else parts.push('Artistic style: Painterly fantasy realism, intricate textures, rich atmospheric depth');

  // 3. Lighting & Composition
  if (meta.lightingColor) parts.push(`Lighting: ${meta.lightingColor}`);
  else parts.push('Lighting: Dramatic chiaroscuro with ambient rim lighting in purple, blue, and gold tones');

  if (meta.composition) parts.push(`Composition: ${meta.composition}`);
  else parts.push(`Framing: Cinematic centered focal framing, aspect ratio ${meta.aspectRatio || '16:9'}`);

  // 4. Provider-neutral negative constraints
  parts.push('Constraints: No modern artifacts, no digital UI text or watermarks, maintain clean anatomical clarity.');

  return parts.join('. \n');
}
