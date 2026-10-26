import { hashStringToSeed } from './deterministicRng';

export type OpeningSituationType =
  | 'ordinary_work'
  | 'travel_or_arrival'
  | 'market_or_social'
  | 'quiet_aftermath'
  | 'small_discovery'
  | 'pressure_event';

export const OPENING_SITUATION_TYPES: readonly OpeningSituationType[] = [
  'ordinary_work',
  'travel_or_arrival',
  'market_or_social',
  'quiet_aftermath',
  'small_discovery',
  'pressure_event',
] as const;

export const ORDINARY_OPENING_SITUATION_TYPES: readonly OpeningSituationType[] = [
  'ordinary_work',
  'travel_or_arrival',
  'market_or_social',
  'quiet_aftermath',
  'small_discovery',
] as const;

export interface RollOpeningSituationParams {
  worldId?: string;
  worldTitle?: string;
  characterId?: string;
  characterName?: string;
  characterRole?: string;
  locationId?: string;
  locationName?: string;
  seedOverride?: string | number;
  explicitSituationType?: OpeningSituationType;
}

/**
 * Deterministic 1-in-6 roll across the six opening situation archetypes.
 * Five of the six outcomes are ordinary-life starts (work, arrival, social/market,
 * quiet aftermath, small discovery); only one in six is a pressure event.
 */
export function rollOpeningSituationType(params: RollOpeningSituationParams): OpeningSituationType {
  if (params.explicitSituationType && OPENING_SITUATION_TYPES.includes(params.explicitSituationType)) {
    return params.explicitSituationType;
  }
  const seedKey =
    params.seedOverride !== undefined
      ? String(params.seedOverride)
      : [
          String(params.worldId || params.worldTitle || 'world').trim().toLowerCase(),
          String(params.characterId || params.characterName || 'character').trim().toLowerCase(),
          String(params.characterRole || 'role').trim().toLowerCase(),
          String(params.locationId || params.locationName || 'location').trim().toLowerCase(),
        ].join('|');

  const hash = typeof params.seedOverride === 'number'
    ? Math.abs(Math.trunc(params.seedOverride))
    : hashStringToSeed(seedKey);
  const index = hash % OPENING_SITUATION_TYPES.length;
  return OPENING_SITUATION_TYPES[index];
}

export function describeOpeningSituationType(type: OpeningSituationType): string {
  switch (type) {
    case 'ordinary_work':
      return 'Ordinary work (handling routine craft, maintenance, or practical tasks in place)';
    case 'travel_or_arrival':
      return 'Travel or arrival (settling in or taking bearings just after reaching the place)';
    case 'market_or_social':
      return 'Market or social (moving among or observing everyday local custom and exchange)';
    case 'quiet_aftermath':
      return 'Quiet aftermath (a calm lull after finishing a task, shift, or small errand)';
    case 'small_discovery':
      return 'Small discovery (noticing a minor, concrete detail slightly out of place during routine activity)';
    case 'pressure_event':
      return 'Pressure event (an immediate complication or pressing development demanding attention)';
  }
}

export interface PlaceSensoryContext {
  locationName: string;
  region?: string;
  description?: string;
  period?: string;
  hour?: number;
  minute?: number;
  archetype?: string;
  genreTags?: string[];
  toneTags?: string[];
}

const BOILERPLATE_SENSORY_PATTERNS: RegExp[] = [
  /\b(?:Visual|Sounds|Auditory|Scent|Smell|Tactile|Touch)\s*:/i,
  /\bFirst light over\b/i,
  /\bDistinct environment of\b/i,
  /\bDistinct landmarks of\b/i,
  /\bDistant atmosphere\b/i,
  /\bNative vegetation\b/i,
  /\bFirm earth\b/i,
  /\bAmbient murmurs\b/i,
  /\bStable terrain\b/i,
  /\bAmbient echoes\b/i,
];

export function isBoilerplateSensoryText(text?: string | null): boolean {
  const raw = String(text || '').trim();
  if (!raw) return true;
  return BOILERPLATE_SENSORY_PATTERNS.some((pattern) => pattern.test(raw));
}

export function stripSensoryLabels(text: string): string {
  return String(text || '')
    .replace(/\b(?:Visual|Visually|Sounds|Sound|Auditory|Audio|Scent|Smell|Olfactory|Tactile|Touch|Feel|Sensory)\s*:\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function resolveTimeOfDayPhrase(period?: string, hour?: number): {
  lightClause: (place: string) => string;
  airNoun: string;
} {
  const normalizedPeriod = String(period || '').trim().toLowerCase();
  const h = typeof hour === 'number' && Number.isFinite(hour) ? hour : undefined;

  if (normalizedPeriod === 'predawn' || (h !== undefined && h >= 4 && h < 6)) {
    return {
      lightClause: (place) => `Cool predawn dimness holds across ${place}`,
      airNoun: 'the still early air',
    };
  }
  if (normalizedPeriod === 'dawn' || (h !== undefined && h >= 6 && h < 8)) {
    return {
      lightClause: (place) => `Low dawn light reaches across ${place}`,
      airNoun: 'the cool morning air',
    };
  }
  if (normalizedPeriod === 'morning' || (h !== undefined && h >= 8 && h < 12)) {
    return {
      lightClause: (place) => `Clear morning light angles through ${place}`,
      airNoun: 'the brisk morning air',
    };
  }
  if (normalizedPeriod === 'dusk' || (h !== undefined && h >= 18 && h < 21)) {
    return {
      lightClause: (place) => `Long dusk shadows gather across ${place}`,
      airNoun: 'the cooling evening air',
    };
  }
  if (normalizedPeriod === 'night' || (h !== undefined && (h >= 21 || h < 4))) {
    return {
      lightClause: (place) => `Night shadows settle across ${place}`,
      airNoun: 'the cool night air',
    };
  }
  // Default / Afternoon (including WorldClock default 17:42 Afternoon)
  if (h !== undefined && h >= 16) {
    return {
      lightClause: (place) => `Slanting late-afternoon light stretches long shadows across ${place}`,
      airNoun: 'the late-day air',
    };
  }
  return {
    lightClause: (place) => `Slanting afternoon light stretches across ${place}`,
    airNoun: 'the afternoon air',
  };
}

/**
 * Generates natural, label-free sensory detail anchored to the specific place
 * and the canonical time of day. Never uses "Visual:/Sounds:" labels and never
 * substitutes the world title for the location name or claims "First light" in the afternoon.
 */
export function buildPlaceSensoryDetail(ctx: PlaceSensoryContext): string {
  const place = String(ctx.locationName || 'the area').trim() || 'the area';
  const desc = String(ctx.description || '').toLowerCase();
  const nameLower = place.toLowerCase();
  const archetype = String(ctx.archetype || '').toUpperCase();
  const genre = (ctx.genreTags || []).join(' ').toLowerCase();
  const { lightClause, airNoun } = resolveTimeOfDayPhrase(ctx.period, ctx.hour);

  if (
    /dock|airlock|station|orbital|reactor|telemetry|deck|hangar|bay|void|sector/.test(nameLower + ' ' + desc) ||
    /sci-fi|cyberpunk|space/.test(genre)
  ) {
    return `Recycled air and the steady hum of deck conduits carry through ${place}, with cool bulkhead metal underfoot.`;
  }

  if (/archive|atheneum|library|study|scriptorium|sanctum|vault/.test(nameLower + ' ' + desc)) {
    return `${lightClause(place)}, where the dry scent of old paper and tallow lingers in ${airNoun}.`;
  }

  if (/market|bazaar|square|plaza|commons|courtyard|crossroads|gate/.test(nameLower + ' ' + desc) || archetype === 'PUBLIC_SQUARE' || archetype === 'MARKET') {
    return `${lightClause(place)}, carrying the low murmur of passing footsteps and everyday activity through ${airNoun}.`;
  }

  if (/tavern|inn|hall|hearth|taproom|lodge/.test(nameLower + ' ' + desc)) {
    return `Warm hearth-smoke and the low murmur of the room drift through ${place} as ${airNoun} cools near the threshold.`;
  }

  if (/forest|woods|grove|trail|wilds|marsh|ridge|valley|camp|snare/.test(nameLower + ' ' + desc) || archetype === 'WILDERNESS') {
    return `${lightClause(place)}, with the rustle of wind through cover and the damp scent of earth in ${airNoun}.`;
  }

  if (/harbor|wharf|pier|quay|port|river|canal|coast/.test(nameLower + ' ' + desc)) {
    return `${lightClause(place)}, carrying damp water-air and the creak of timber and cordage along the footing.`;
  }

  return `${lightClause(place)}, where ${airNoun} carries the quiet cadence of the surroundings and the steady feel of worn ground underfoot.`;
}

export function normalizeLocationSensory(
  rawSensory: string | undefined | null,
  ctx: PlaceSensoryContext,
): string {
  const trimmed = String(rawSensory || '').trim();
  if (!trimmed || isBoilerplateSensoryText(trimmed)) {
    return buildPlaceSensoryDetail(ctx);
  }
  return stripSensoryLabels(trimmed);
}

export interface DeriveStartingActivityParams {
  characterName: string;
  role?: string;
  background?: string;
  equipment?: string[];
  locationName: string;
  locationDescription?: string;
  situationType: OpeningSituationType;
  existingActivity?: string;
  existingSituationSummary?: string;
}

function cleanItemName(raw?: string): string {
  const cleaned = String(raw || '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim();
  return cleaned;
}

function isGenericOrHookLikeActivity(text?: string): boolean {
  const raw = String(text || '').trim();
  if (!raw) return true;
  if (raw.length > 140) return true;
  if (/^(?:idle|none|unknown|present|standing|awakened in)\b/i.test(raw)) return true;
  if (/\b(?:must|quest|destiny|crisis|investigate|uncover|discover the true origin|map the perimeter)\b/i.test(raw)) return true;
  return false;
}

/**
 * Produces a concrete, present-tense starting activity for character genesis and
 * opening scene composition so the character is doing something grounded right now
 * rather than having their character sheet or hook repeated.
 */
export function deriveStartingActivity(params: DeriveStartingActivityParams): string {
  const existing = String(params.existingActivity || '').trim();
  if (existing && !isGenericOrHookLikeActivity(existing)) {
    return existing.replace(/\.+$/, '');
  }

  const roleLower = `${params.role || ''} ${params.background || ''}`.toLowerCase();
  const equip = (params.equipment || []).map(cleanItemName).filter(Boolean);
  const primaryItem = equip[0] || '';
  const loc = params.locationName || 'the area';

  switch (params.situationType) {
    case 'ordinary_work': {
      if (/hunter|ranger|trapper|scout|warden|tracker|forester/.test(roleLower)) {
        return primaryItem
          ? `checking the line and tension of his work gear alongside the ${primaryItem.toLowerCase()}`
          : `checking snares and reading the fresh sign along the edge of ${loc}`;
      }
      if (/scholar|scribe|archivist|researcher|mage|wizard|alchemist|sage/.test(roleLower)) {
        return primaryItem
          ? `cross-checking notes beside the ${primaryItem} and keeping the work table in order`
          : `sorting through working notes and reference folios at ${loc}`;
      }
      if (/pilot|engineer|specialist|commander|navigator|mechanic|tech/.test(roleLower)) {
        return primaryItem
          ? `running a routine check on the ${primaryItem} and verifying local readouts`
          : `running a routine pre-shift check on the local instruments at ${loc}`;
      }
      if (/knight|soldier|guard|mercenary|fighter|warrior|paladin|blade/.test(roleLower)) {
        return primaryItem
          ? `checking the balance and strap of the ${primaryItem} after a routine patrol stretch`
          : `checking the fit of his gear and straps while taking a routine turn through ${loc}`;
      }
      if (/merchant|trader|artisan|smith|healer|herbalist|apothecary|cook/.test(roleLower)) {
        return primaryItem
          ? `taking stock of the ${primaryItem} and setting the day's supplies in order`
          : `sorting through working supplies and tallying what remains on hand`;
      }
      return primaryItem
        ? `checking over the ${primaryItem} and tending to routine upkeep`
        : `tending to routine gear upkeep and practical tasks in ${loc}`;
    }
    case 'travel_or_arrival': {
      return primaryItem
        ? `easing the strap of the pack, checking that the ${primaryItem} rode the way cleanly, and taking first bearings in ${loc}`
        : `easing travel-worn straps and taking stock of ${loc} after the walk in`;
    }
    case 'market_or_social': {
      return primaryItem
        ? `keeping one hand near the ${primaryItem} while pausing amid the everyday give-and-take of ${loc}`
        : `pausing along the edge of ${loc} to watch the ordinary give-and-take of the place`;
    }
    case 'quiet_aftermath': {
      return primaryItem
        ? `setting the ${primaryItem} back in place during a quiet lull after finishing the last stretch of work`
        : `Taking a quiet breath in ${loc} after wrapping up the latest stretch of routine work`.replace(/^Taking/, 'taking');
    }
    case 'small_discovery': {
      return primaryItem
        ? `pausing mid-task with the ${primaryItem} in hand after noticing a small detail out of place`
        : `pausing in the middle of routine work at ${loc} to look closer at an unexpected detail`;
    }
    case 'pressure_event': {
      return primaryItem
        ? `steadying a hand on the ${primaryItem} while weighing an immediate complication in ${loc}`
        : `holding position in ${loc} while weighing an immediate complication`;
    }
  }
}

export interface DeriveUnsettledDetailParams {
  situationType: OpeningSituationType;
  startingSituation?: string;
  startingActivity?: string;
  locationName: string;
  visibleEntitiesCount?: number;
  visibleEventsSummary?: string;
  authoredGoal?: string;
}

/**
 * Determines what, if anything, is unsettled in the opening scene.
 * Leads can be small or absent for ordinary-life starts so the player is not
 * forced into a mandatory quest on every start.
 */
export function deriveUnsettledDetail(params: DeriveUnsettledDetailParams): {
  hasLead: boolean;
  unsettledSentence: string;
} {
  if (params.authoredGoal && params.authoredGoal.trim()) {
    return {
      hasLead: true,
      unsettledSentence: `Your first lead is clear: ${params.authoredGoal.trim().replace(/\.+$/, '')}.`,
    };
  }

  const rawHook = String(params.startingSituation || '').trim().replace(/\.+$/, '');
  const activity = String(params.startingActivity || '').trim().toLowerCase();
  const hookDuplicatesActivity =
    !rawHook ||
    rawHook.toLowerCase() === activity ||
    /^awakened in\b/i.test(rawHook);

  switch (params.situationType) {
    case 'ordinary_work':
    case 'quiet_aftermath': {
      if (!hookDuplicatesActivity && rawHook) {
        return {
          hasLead: false,
          unsettledSentence: `Nothing urgent presses in on the moment, though ${ lowerFirst(rawHook) } remains at the back of your mind; what you do next is open.`,
        };
      }
      return {
        hasLead: false,
        unsettledSentence: `Nothing urgent interrupts the routine at ${params.locationName}, leaving the next step unhurried and entirely yours to choose.`,
      };
    }
    case 'travel_or_arrival':
    case 'market_or_social': {
      if (!hookDuplicatesActivity && rawHook) {
        return {
          hasLead: false,
          unsettledSentence: `There is no immediate crisis demanding your hand, only the lingering matter of ${lowerFirst(rawHook)} whenever you choose to act on it.`,
        };
      }
      return {
        hasLead: false,
        unsettledSentence: `No immediate crisis forces your hand here; the rhythm of ${params.locationName} leaves room to look around, speak, or move on at your own pace.`,
      };
    }
    case 'small_discovery': {
      if (!hookDuplicatesActivity && rawHook) {
        return {
          hasLead: true,
          unsettledSentence: `One small matter sits unsettled in the background—${lowerFirst(rawHook)}—leaving a quiet opening if you decide to look closer.`,
        };
      }
      return {
        hasLead: true,
        unsettledSentence: `A small detail in ${params.locationName} sits slightly out of step with the usual routine, easy to ignore or to examine closer as you see fit.`,
      };
    }
    case 'pressure_event': {
      if (!hookDuplicatesActivity && rawHook) {
        return {
          hasLead: true,
          unsettledSentence: `The unsettled pressure in the scene centers on ${lowerFirst(rawHook)}, waiting on how you choose to respond.`,
        };
      }
      return {
        hasLead: true,
        unsettledSentence: `An unsettled tension hangs over ${params.locationName}, waiting on how you choose to respond.`,
      };
    }
  }
}

function lowerFirst(text: string): string {
  if (!text) return '';
  if (/^[A-Z]{2,}/.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

const INTERNAL_LEAK_PATTERNS: RegExp[] = [
  /No visible occupants are currently established in the canonical scene projection/i,
  /No visible occupants are established by the current canonical entity projection/i,
  /canonical scene projection/i,
  /canonical entity projection/i,
  /this alone does not mean the location is abandoned/i,
  /\[(?:Minor|Moderate|Major|WorldScale)\]\s*:/i,
];

export interface OpeningProseHygieneResult {
  valid: boolean;
  issues: string[];
  cleanedText: string;
}

/**
 * Shared hygiene gate applied to both AI-generated openings and the deterministic
 * fallback composer so leaked internals, raw ability sheet dumps, sensory labels,
 * and duplicated hooks never reach the player.
 */
export function enforceOpeningProseHygiene(
  narrativeText: string,
  options?: {
    startingSituation?: string;
    capabilities?: string[];
  },
): OpeningProseHygieneResult {
  let cleaned = stripSensoryLabels(String(narrativeText || ''));
  const issues: string[] = [];

  for (const pattern of INTERNAL_LEAK_PATTERNS) {
    if (pattern.test(cleaned)) {
      issues.push(`Leaked internal grounding rule matched: ${pattern.source}`);
      cleaned = cleaned
        .replace(/No visible occupants are currently established in the canonical scene projection;?\s*this alone does not mean the location is abandoned\.?/gi, '')
        .replace(/No visible occupants are established by the current canonical entity projection\.?/gi, '');
    }
  }

  // Strip raw character-sheet dumps ("Role: ...", "Capabilities in reach include Name [Tier]: ...")
  if (/\bCapabilities in reach include\b/i.test(cleaned)) {
    issues.push('Raw capability sheet dump detected in opening prose.');
    cleaned = cleaned.replace(/Capabilities in reach include[^.]*\./gi, '');
  }

  if (options?.capabilities && options.capabilities.length > 0) {
    for (const rawCap of options.capabilities) {
      const trimmedCap = String(rawCap || '').trim();
      if (trimmedCap.length >= 18 && cleaned.includes(trimmedCap)) {
        issues.push('Raw capability description pasted verbatim into opening prose.');
        cleaned = cleaned.split(trimmedCap).join('');
      }
    }
  }

  // Check if startingSituation is repeated verbatim more than once across paragraphs
  const hook = String(options?.startingSituation || '').trim().replace(/\.+$/, '');
  if (hook.length >= 20) {
    const escaped = hook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = cleaned.match(new RegExp(escaped, 'gi'));
    if (matches && matches.length > 1) {
      issues.push('Starting situation hook is repeated multiple times in the opening prose.');
    }
  }

  cleaned = cleaned
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    valid: issues.length === 0,
    issues,
    cleanedText: cleaned,
  };
}
