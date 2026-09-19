/**
 * DreamBook Route & Viewport Coordinator
 * Typed route definitions and navigation model.
 */

export type AppRoute =
  // Boot & Onboarding
  | 'splash'
  | 'onboarding'
  // Home
  | 'dashboard'
  | 'story-library'
  // Worlds
  | 'worlds'
  // Create
  | 'create'
  | 'create.bring-to-life'
  | 'create.genesis'
  // Compendium (Personal Collection / Reference)
  | 'compendium'
  | 'compendium.characters'
  | 'compendium.equipment'
  | 'compendium.powers'
  | 'compendium.npcs'
  | 'compendium.creatures'
  | 'compendium.worlds'
  | 'compendium.visuals'
  // Play Experiences (Active Story Context)
  | 'play.story'
  | 'play.character'
  | 'play.inventory'
  | 'play.powers'
  | 'play.combat'
  | 'play.map'
  | 'play.chronicle'
  | 'play.codex'
  | 'play.evidence'
  | 'play.relationships'
  // Engine & Operations
  | 'settings'
  | 'engine.settings'
  | 'engine.routing'
  | 'engine.voice'
  | 'engine.audio'
  | 'ops.archive'
  | 'ops.bible'
  | 'ops.debug';

export interface RouteMeta {
  route: AppRoute;
  title: string;
  category: 'BOOT' | 'HOME' | 'WORLDS' | 'CREATE' | 'COMPENDIUM' | 'PLAY' | 'ENGINE' | 'OPERATIONS';
  requiresActiveStory?: boolean;
}

export const ROUTE_REGISTRY: Record<AppRoute, RouteMeta> = {
  splash: { route: 'splash', title: 'Booting DreamBook', category: 'BOOT' },
  onboarding: { route: 'onboarding', title: 'Welcome to DreamBook', category: 'BOOT' },
  dashboard: { route: 'dashboard', title: 'Dashboard', category: 'HOME' },
  'story-library': { route: 'story-library', title: 'Story Library', category: 'HOME' },
  worlds: { route: 'worlds', title: 'World Library', category: 'WORLDS' },
  create: { route: 'create', title: 'Create World / Story', category: 'CREATE' },
  'create.bring-to-life': { route: 'create.bring-to-life', title: 'Bring a Story to Life', category: 'CREATE' },
  'create.genesis': { route: 'create.genesis', title: 'Character Genesis', category: 'CREATE' },
  compendium: { route: 'compendium', title: 'Compendium', category: 'COMPENDIUM' },
  'compendium.characters': { route: 'compendium.characters', title: 'Characters', category: 'COMPENDIUM' },
  'compendium.equipment': { route: 'compendium.equipment', title: 'Equipment', category: 'COMPENDIUM' },
  'compendium.powers': { route: 'compendium.powers', title: 'Skills & Powers', category: 'COMPENDIUM' },
  'compendium.npcs': { route: 'compendium.npcs', title: 'Key NPCs', category: 'COMPENDIUM' },
  'compendium.creatures': { route: 'compendium.creatures', title: 'Creatures', category: 'COMPENDIUM' },
  'compendium.worlds': { route: 'compendium.worlds', title: 'Worlds Archive', category: 'COMPENDIUM' },
  'compendium.visuals': { route: 'compendium.visuals', title: 'Visual Collection', category: 'COMPENDIUM' },
  'play.story': { route: 'play.story', title: 'Story Narrative', category: 'PLAY', requiresActiveStory: true },
  'play.character': { route: 'play.character', title: 'Character Dossier', category: 'PLAY', requiresActiveStory: true },
  'play.inventory': { route: 'play.inventory', title: 'Inventory & Equipment', category: 'PLAY', requiresActiveStory: true },
  'play.powers': { route: 'play.powers', title: 'Powers & Capabilities', category: 'PLAY', requiresActiveStory: true },
  'play.combat': { route: 'play.combat', title: 'Tactical Combat', category: 'PLAY', requiresActiveStory: true },
  'play.map': { route: 'play.map', title: 'World Map', category: 'PLAY', requiresActiveStory: true },
  'play.chronicle': { route: 'play.chronicle', title: 'Chronicle & Memory', category: 'PLAY', requiresActiveStory: true },
  'play.codex': { route: 'play.codex', title: 'World Codex', category: 'PLAY', requiresActiveStory: true },
  'play.evidence': { route: 'play.evidence', title: 'Evidence & Clues', category: 'PLAY', requiresActiveStory: true },
  'play.relationships': { route: 'play.relationships', title: 'Relationships & Factions', category: 'PLAY', requiresActiveStory: true },
  settings: { route: 'settings', title: 'Settings', category: 'ENGINE' },
  'engine.settings': { route: 'engine.settings', title: 'Settings', category: 'ENGINE' },
  'engine.routing': { route: 'engine.routing', title: 'Model Routing', category: 'ENGINE' },
  'engine.voice': { route: 'engine.voice', title: 'Voice Studio', category: 'ENGINE' },
  'engine.audio': { route: 'engine.audio', title: 'Audio & Haptics', category: 'ENGINE' },
  'ops.archive': { route: 'ops.archive', title: 'Archive & Export', category: 'OPERATIONS' },
  'ops.bible': { route: 'ops.bible', title: 'Living Bible', category: 'OPERATIONS' },
  'ops.debug': { route: 'ops.debug', title: 'Debug & Context', category: 'OPERATIONS' },
};
