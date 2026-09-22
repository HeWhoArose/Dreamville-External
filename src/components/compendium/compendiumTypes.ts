export type CompendiumCategory =
  | 'characters'
  | 'equipment'
  | 'powers'
  | 'npcs'
  | 'creatures'
  | 'worlds'
  | 'visuals';

export interface CompendiumItem {
  id: string;
  category: CompendiumCategory;
  title: string;
  subtitle?: string;
  description: string;
  tags: string[];
  worldOrigin?: string;
  imageUrl?: string;
  stats?: Record<string, string | number>;
  classification?: string; // e.g., Weapon, Spell, Martial, Companion, Bestiary
  rarityOrThreat?: string; // e.g., Common, Legendary, Artifact, Tier III
  loreSnippet?: string;
  traits?: string[];
  provenance?: string;
  equipment?: string;
  aspectRatio?: '1:1' | '3:4' | '16:9' | '4:3';
  
  // Personal Collection & Provenance Tracking
  sourceWorld?: string;
  sourceRun?: string;
  originType?: 'discovered' | 'generated' | 'encountered' | 'approved' | 'collected' | 'created';
  canonicalEntityId?: string;
  assetId?: string;
  discoveredAt?: string;
  entityCard?: import('../../types').EntityCardProjection;
}

export const COMPENDIUM_CATEGORIES: Array<{
  id: CompendiumCategory;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    id: 'characters',
    label: 'Characters',
    description: 'Player personas, archetypes, and protagonist dossiers across all runs.',
    icon: '👤',
  },
  {
    id: 'equipment',
    label: 'Equipment',
    description: 'Weapons, armor, artifacts, tools, and forged relics.',
    icon: '⚔️',
  },
  {
    id: 'powers',
    label: 'Skills & Powers',
    description: 'Mystical spells, martial disciplines, tech abilities, and traits.',
    icon: '⚡',
  },
  {
    id: 'npcs',
    label: 'Key NPCs',
    description: 'Notable allies, rivals, mentors, faction leaders, and contacts.',
    icon: '👥',
  },
  {
    id: 'creatures',
    label: 'Creatures',
    description: 'Bestiary field reports, mythical entities, and cosmic fauna.',
    icon: '🐉',
  },
  {
    id: 'worlds',
    label: 'Worlds Archive',
    description: 'Catalog of explored, generated, and archived world settings.',
    icon: '🪐',
  },
  {
    id: 'visuals',
    label: 'Visual Collection',
    description: 'Curated gallery of all approved character portraits, covers, and relics.',
    icon: '🎨',
  },
];
