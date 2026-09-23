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
 * Invariant: Combat is strictly conditional and hidden if tactical combat is not enabled.
 */
export function deriveStoryMenu(config: StoryNavigationConfig = {}): StoryMenuEntry[] {
  const {
    rules = 'FULL_DND',
    storyMode = 'PROTAGONIST',
    genre = 'Fantasy',
    hasActiveCombat = false,
    hasTacticalCombatRule = rules === 'FULL_DND',
    hasSpellbook = rules === 'FULL_DND',
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

  // 1. Story Narrative (Always present and primary)
  menu.push({
    id: 'story',
    label: 'Story',
    iconType: 'story',
    enabled: true,
    visible: true,
    route: 'play.story',
  });

  // 2. Character / Protagonist Dossier
  menu.push({
    id: 'character',
    label: isMystery ? 'Detective Dossier' : 'Character',
    iconType: 'character',
    enabled: true,
    visible: true,
    route: 'play.character',
  });

  // 3. Narrative Mystery / Investigation Branch
  if (isMystery) {
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
      id: 'journal',
      label: 'Case Journal',
      iconType: 'journal',
      enabled: true,
      visible: true,
      route: 'play.chronicle',
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
      id: 'map',
      label: 'Crime Scenes & Map',
      iconType: 'map',
      enabled: true,
      visible: true,
      route: 'play.map',
    });

    menu.push({
      id: 'codex',
      label: 'World Codex',
      iconType: 'codex',
      enabled: true,
      visible: true,
      route: 'play.codex',
    });

    menu.push({
      id: 'world-systems',
      label: 'World Systems',
      iconType: 'locations',
      enabled: true,
      visible: true,
      route: 'play.world-systems',
    });

    // Mystery stories do not expose tactical combat by default unless combat explicitly activates
    if (hasActiveCombat) {
      menu.push({
        id: 'combat',
        label: 'Combat Encounter',
        iconType: 'combat',
        enabled: true,
        visible: true,
        route: 'play.combat',
        badge: 'ACTIVE',
      });
    }

    return menu;
  }

  // 4. D&D / Tactical Fantasy Branch
  if (isDnD) {
    menu.push({
      id: 'inventory',
      label: 'Inventory',
      iconType: 'inventory',
      enabled: true,
      visible: true,
      route: 'play.inventory',
    });

    menu.push({
      id: 'powers',
      label: hasSpellbook ? 'Spellbook & Skills' : 'Abilities & Skills',
      iconType: hasSpellbook ? 'spellbook' : 'powers',
      enabled: true,
      visible: true,
      route: 'play.powers',
    });

    menu.push({
      id: 'journal',
      label: 'Quests & Journal',
      iconType: 'quests',
      enabled: true,
      visible: true,
      route: 'play.chronicle',
    });

    menu.push({
      id: 'map',
      label: 'World Map',
      iconType: 'map',
      enabled: true,
      visible: true,
      route: 'play.map',
    });

    // Combat is strictly conditional
    if (hasTacticalCombatRule || hasActiveCombat) {
      menu.push({
        id: 'combat',
        label: 'Tactical Combat',
        iconType: 'combat',
        enabled: true,
        visible: true,
        route: 'play.combat',
        badge: hasActiveCombat ? 'COMBAT' : undefined,
      });
    }

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

  // 5. Default / Freeform Story Branch
  menu.push({
    id: 'inventory',
    label: 'Inventory',
    iconType: 'inventory',
    enabled: true,
    visible: true,
    route: 'play.inventory',
  });

  menu.push({
    id: 'powers',
    label: 'Capabilities',
    iconType: 'powers',
    enabled: true,
    visible: true,
    route: 'play.powers',
  });

  menu.push({
    id: 'journal',
    label: 'Chronicle & Memory',
    iconType: 'journal',
    enabled: true,
    visible: true,
    route: 'play.chronicle',
  });

  menu.push({
    id: 'map',
    label: 'World Map',
    iconType: 'map',
    enabled: true,
    visible: true,
    route: 'play.map',
  });

  if (hasActiveCombat) {
    menu.push({
      id: 'combat',
      label: 'Active Encounter',
      iconType: 'combat',
      enabled: true,
      visible: true,
      route: 'play.combat',
      badge: 'ACTIVE',
    });
  }

  menu.push({
    id: 'codex',
    label: 'World Codex',
    iconType: 'codex',
    enabled: true,
    visible: true,
    route: 'play.codex',
  });

  menu.push({
    id: 'world-systems',
    label: 'World Systems',
    iconType: 'locations',
    enabled: true,
    visible: true,
    route: 'play.world-systems',
  });

  return menu;
}
