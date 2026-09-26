import { AppRoute } from '../../routes';

export interface StoryMenuEntry {
  id: string;
  label: string;
  iconType:
    | 'story'
    | 'character'
    | 'inventory'
    | 'equipment'
    | 'powers'
    | 'spellbook'
    | 'quests'
    | 'journal'
    | 'map'
    | 'combat'
    | 'codex'
    | 'evidence'
    | 'relationships'
    | 'locations';
  enabled: boolean;
  visible: boolean;
  route: AppRoute;
  badge?: string;
  reason?: string;
}

export interface StoryNavigationConfig {
  rules?: 'FULL_DND' | 'STORY_LIGHT' | 'FREEFORM' | 'INVESTIGATION' | string;
  storyMode?: 'PROTAGONIST' | 'PARTY' | 'MYSTERY' | 'FREEFORM' | string;
  genre?: string;
  hasActiveCombat?: boolean;
  hasTacticalCombatRule?: boolean;
  hasSpellbook?: boolean;
  hasPartyMembers?: boolean;
  activeLocationName?: string;
  unresolvedCluesCount?: number;
}

/**
 * Derives the contextual in-story navigation menu from the active story/world ruleset and mode.
 * Character, World, Inventory, Map, and Tactics are the core in-scene destinations.
 * Quests, Journal, Recent Actions, Codex, and investigation tools remain contextual.
 */
export function deriveStoryMenu(config: StoryNavigationConfig = {}): StoryMenuEntry[] {
  const {
    rules = 'FULL_DND',
    storyMode = 'PROTAGONIST',
    genre = 'Fantasy',
    hasActiveCombat = false,
    hasTacticalCombatRule = rules === 'FULL_DND',
    unresolvedCluesCount = 0,
  } = config;

  const normalizedGenre = genre.toLowerCase();
  const isMystery =
    rules === 'INVESTIGATION' ||
    storyMode === 'MYSTERY' ||
    normalizedGenre.includes('mystery') ||
    normalizedGenre.includes('detective') ||
    normalizedGenre.includes('noir');

  const isDnD = rules === 'FULL_DND' || normalizedGenre.includes('fantasy');

  const menu: StoryMenuEntry[] = [];

  menu.push({
    id: 'story',
    label: 'Story',
    iconType: 'story',
    enabled: true,
    visible: true,
    route: 'play.story',
  });

  menu.push({
    id: 'character',
    label: isMystery ? 'Detective Dossier' : 'Character',
    iconType: 'character',
    enabled: true,
    visible: true,
    route: 'play.character',
  });

  if (isMystery) {
    menu.push({
      id: 'inventory',
      label: 'Inventory',
      iconType: 'inventory',
      enabled: true,
      visible: true,
      route: 'play.inventory',
    });

    menu.push({
      id: 'world',
      label: 'World',
      iconType: 'locations',
      enabled: true,
      visible: true,
      route: 'play.world',
      reason: 'Characters and places in the active world',
    });

    menu.push({
      id: 'map',
      label: 'Crime Scenes & Map',
      iconType: 'map',
      enabled: true,
      visible: true,
      route: 'play.map',
    });

    if (hasActiveCombat) {
      menu.push({
        id: 'combat',
        label: 'Tactics',
        iconType: 'combat',
        enabled: true,
        visible: true,
        route: 'play.combat',
        badge: 'ACTIVE',
      });
    }

    menu.push({
      id: 'quests',
      label: 'Quests',
      iconType: 'quests',
      enabled: true,
      visible: true,
      route: 'play.quests',
    });

    menu.push({
      id: 'journal',
      label: 'Journal',
      iconType: 'journal',
      enabled: true,
      visible: true,
      route: 'play.journal',
    });

    menu.push({
      id: 'recent-actions',
      label: 'Recent Actions',
      iconType: 'journal',
      enabled: true,
      visible: true,
      route: 'play.recent-actions',
    });

    menu.push({
      id: 'evidence',
      label: 'Evidence & Clues',
      iconType: 'evidence',
      enabled: true,
      visible: true,
      route: 'play.evidence',
      badge: unresolvedCluesCount > 0 ? `${unresolvedCluesCount}` : undefined,
    });

    menu.push({
      id: 'relationships',
      label: 'Suspects & Leads',
      iconType: 'relationships',
      enabled: true,
      visible: true,
      route: 'play.relationships',
    });

    menu.push({
      id: 'codex',
      label: 'World Codex',
      iconType: 'codex',
      enabled: true,
      visible: true,
      route: 'play.codex',
    });

    return menu;
  }

  menu.push({
    id: 'inventory',
    label: 'Inventory',
    iconType: 'inventory',
    enabled: true,
    visible: true,
    route: 'play.inventory',
  });

  menu.push({
    id: 'world',
    label: 'World',
    iconType: 'locations',
    enabled: true,
    visible: true,
    route: 'play.world',
    reason: 'Characters and places in the active world',
  });

  menu.push({
    id: 'map',
    label: 'World Map',
    iconType: 'map',
    enabled: true,
    visible: true,
    route: 'play.map',
  });

  if (hasTacticalCombatRule || hasActiveCombat) {
    menu.push({
      id: 'combat',
      label: 'Tactics',
      iconType: 'combat',
      enabled: true,
      visible: true,
      route: 'play.combat',
      badge: hasActiveCombat ? 'COMBAT' : undefined,
    });
  }

  menu.push({
    id: 'quests',
    label: 'Quests',
    iconType: 'quests',
    enabled: true,
    visible: true,
    route: 'play.quests',
  });

  menu.push({
    id: 'journal',
    label: 'Journal',
    iconType: 'journal',
    enabled: true,
    visible: true,
    route: 'play.journal',
  });

  menu.push({
    id: 'recent-actions',
    label: 'Recent Actions',
    iconType: 'journal',
    enabled: true,
    visible: true,
    route: 'play.recent-actions',
  });

  menu.push({
    id: 'codex',
    label: 'World Codex',
    iconType: 'codex',
    enabled: true,
    visible: true,
    route: 'play.codex',
  });

  return menu;
}
