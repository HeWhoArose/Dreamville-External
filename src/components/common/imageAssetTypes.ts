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
  worldSummary?: string;
  genreTags?: string[];
  toneTags?: string[];
  era?: string;
  factions?: string[];
  magicOrTechnology?: string;
  geography?: string;
  visualMotifs?: string[];
  adventureContext?: string;
  characterName?: string;
  storyMode?: string;
  dndRulesMode?: string;
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
    const isWorldCover = meta.slotType === 'world_cover';
    parts.push(
      (isWorldCover ? 'World identity poster for "' : 'Story adventure poster for "') +
      meta.title +
      '"'
    );

    if (meta.worldSummary) parts.push('World premise: ' + meta.worldSummary);
    if (meta.setting) parts.push('Setting: ' + meta.setting);
    if (meta.environment) parts.push('Environment and atmosphere: ' + meta.environment);
    if (meta.genreTags?.length) parts.push('Genre: ' + meta.genreTags.join(', '));
    if (meta.toneTags?.length) parts.push('Tone: ' + meta.toneTags.join(', '));
    if (meta.era) parts.push('Era: ' + meta.era);
    if (meta.factions?.length) parts.push('Major factions/civilizations: ' + meta.factions.join(', '));
    if (meta.magicOrTechnology) parts.push('Magic/technology: ' + meta.magicOrTechnology);
    if (meta.geography) parts.push('Geography: ' + meta.geography);
    if (meta.visualMotifs?.length) parts.push('Signature visual motifs: ' + meta.visualMotifs.join(', '));
    if (meta.adventureContext) parts.push('Adventure context: ' + meta.adventureContext);
    if (meta.characterName) parts.push('Protagonist: ' + meta.characterName);
    if (meta.storyMode) parts.push('Narrative mode: ' + meta.storyMode);
    if (meta.dndRulesMode) parts.push('Rules mode: ' + meta.dndRulesMode);

    if (isWorldCover) {
      parts.push('Visual goal: communicate the identity, scale, civilization, environment, and defining visual language of the world itself; do not depict a generic fantasy realm.');
    } else {
      parts.push('Visual goal: communicate the specific adventure context while remaining visually consistent with the established world identity.');
    }
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

  const inferredStyle = meta.artDirection ||
    (meta.genreTags?.length
      ? 'Use visual language appropriate to the stated genres (' + meta.genreTags.join(', ') + '); do not impose fantasy aesthetics when the genres indicate science fiction, cyberpunk, modern, post-apocalyptic, or other non-fantasy settings.'
      : 'Cohesive cinematic concept art with a clear visual identity appropriate to the subject and setting.');
  parts.push('Artistic style: ' + inferredStyle);
  parts.push('Lighting: ' + (meta.lightingColor || 'Lighting appropriate to the world tone, environment, and era.'));
  parts.push('Framing: ' + (meta.composition || ('Cinematic centered focal framing for ' + spec.aspectRatio)));
  parts.push('Constraints: No modern artifacts, no UI framing, watermarks, unintended borders, or arbitrary text; preserve the defining visual elements supplied by the world metadata.');

  return appendImageOutputSpecification(parts.join('.\n'), meta.slotType);
}
