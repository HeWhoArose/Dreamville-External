import type { CapabilityDefinition, SkillInstance, PowerState } from './capabilityEngine';

export type CapabilitySimulationStatus =
  | 'ALREADY_OWNED'
  | 'CURRENTLY_EXECUTABLE'
  | 'DEVELOPABLE'
  | 'CONDITIONALLY_DEVELOPABLE'
  | 'ALTERNATE_ROUTE'
  | 'CHARACTER_INCOMPATIBLE'
  | 'CURRENTLY_BLOCKED'
  | 'WORLD_FORBIDDEN'
  | 'UNSUPPORTED_REQUEST';

export interface CapabilitySimulationWorld {
  id?: string;
  title?: string;
  description?: string;
  summary?: string;
  genreTags?: string[];
  lore?: string[];
  capabilities?: any[];
  customRules?: any[];
  canonicalCapabilities?: any[];
  powerSystem?: any;
  powerSystems?: any[];
  metaphysics?: any;
  magicSystems?: any[];
  worldRules?: any[];
  rules?: any[];
  ruleConstraints?: string[];
  forbiddenContradictions?: string[];
  magicRules?: any;
  progressionPolicy?: any;
  [key: string]: unknown;
}

export interface CapabilitySimulationContext {
  actorId: string;
  character?: any;
  world: CapabilitySimulationWorld;
  rulesProfile?: any;
  customRules?: any[];
  progressionPolicy?: {
    progressionAllowed?: boolean;
    acquisitionAllowed?: boolean;
    maxLevel?: number;
  };
  progressionState?: {
    currentLevel?: number;
    maxCharacterLevel?: number;
    allowLevelUp?: boolean;
    [key: string]: unknown;
  };
  powerState?: PowerState;
  ownedCapabilities: CapabilityDefinition[];
  skillInstances?: SkillInstance[];
  allWorldCapabilities?: CapabilityDefinition[];
  environment?: {
    locationId?: string;
    locationName?: string;
    conditions?: string[];
    description?: string;
    ambientSensory?: string;
    [key: string]: unknown;
  };
}

export interface CapabilitySimulationResult {
  status: CapabilitySimulationStatus;
  actionText: string;
  requestedDomain?: string;
  candidateCapability?: CapabilityDefinition;
  mechanism?: string;
  scale?: CapabilityDefinition['powerTier'];
  worldAllowed: boolean;
  characterCompatible: boolean;
  currentlyExecutable: boolean;
  progressionPossible: boolean;
  acquisitionAllowed: boolean;
  explanation: string;
  blockers: string[];
  requiredConditions: string[];
  developmentPath: string[];
  alternateRoutes: string[];
  estimatedEnergyCost?: number;
  estimatedVesselCapacityRequired?: number;
  internalOnly: boolean;
  /** True only when the dry-run found a valid path for canonical acquisition. */
  creationAllowed?: boolean;
}

const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function flattenText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(flattenText).filter(Boolean).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(flattenText).filter(Boolean).join(' ');
  return '';
}

function collectWorldText(
  world: CapabilitySimulationWorld,
  customRules: any[] = [],
  environment?: CapabilitySimulationContext['environment'],
): string {
  return normalize([
    world.title,
    world.description,
    world.summary,
    ...(world.genreTags || []),
    ...(world.lore || []),
    world.powerSystem,
    ...(world.powerSystems || []),
    world.metaphysics,
    ...(world.magicSystems || []),
    ...(world.worldRules || []),
    ...(world.rules || []),
    ...(world.ruleConstraints || []),
    ...(world.forbiddenContradictions || []),
    world.magicRules,
    ...(world.customRules || []),
    ...(customRules || []),
    world.capabilities,
    world.canonicalCapabilities,
    environment?.locationName,
    environment?.description,
    environment?.ambientSensory,
    ...(environment?.conditions || []),
  ].map(flattenText).join(' '));
}

function collectCharacterText(character: any, ownedCapabilities: CapabilityDefinition[]): string {
  if (!character) {
    return normalize(ownedCapabilities.map((cap) => `${cap.name} ${cap.description} ${cap.provenance}`).join(' '));
  }

  const explicit = [
    character.name,
    character.title,
    character.role,
    character.role?.profession,
    character.role?.archetype,
    character.identity?.species,
    character.identity?.lineage,
    character.background?.history,
    character.background?.summary,
    character.background?.origin,
    ...(character.personality?.traits || []),
    ...(character.motivations?.goals || []),
    ...(character.traits || []),
    ...(character.capabilities || []),
    ...(character.generatedSkills || []),
    ...(character.attributes || []),
    ...(character.stats || []),
  ];

  return normalize([
    ...explicit,
    ...ownedCapabilities.map((cap) => `${cap.name} ${cap.description} ${cap.provenance}`),
  ].map(flattenText).join(' '));
}

function requestedDomain(actionText: string, candidate?: CapabilityDefinition): string | undefined {
  const text = normalize(actionText + ' ' + (candidate ? `${candidate.name} ${candidate.description}` : ''));
  const patterns: Array<[string, RegExp]> = [
    ['TEMPORAL', /\b(time|temporal|stop time|rewind|accelerate time)\b/],
    ['DIMENSIONAL', /\b(dimension|dimensional|world[- ]split|tear reality|sever reality)\b/],
    ['SPATIAL_TRANSIT', /\b(teleport|teleportation|blink|warp|instant travel|spatial travel)\b/],
    ['LIGHTNING', /\b(lightning|electricity|thunder bolt|thunderbolt)\b/],
    ['FIRE', /\b(fire|flame|fireball|pyromancy)\b/],
    ['WATER', /\b(water|wave|ice|frost|hydro)\b/],
    ['EARTH', /\b(earth|rock|stone|metal|sand|seismic)\b/],
    ['AIR', /\b(air|wind|storm|gust|airbender)\b/],
    ['SHADOW', /\b(shadow|darkness|void|umbral|oblivion)\b/],
    ['HEALING', /\b(heal|healing|restore|regenerate|rejuvenate)\b/],
    ['MAGIC', /\b(spell|magic|sorcery|wizard|mage|arcane|mana)\b/],
    ['BIOLOGICAL', /\b(poison|venom|toxin|fang|claw|natural weapon|biological)\b/],
    ['PERCEPTION', /\b(perception|notice|observe|sense|track|awareness|detect|vision|hearing)\b/],
    ['SOCIAL', /\b(persuade|intimidate|deceive|charm|negotiate|leadership|social)\b/],
    ['COMBAT', /\b(strike|slash|punch|kick|grapple|jump|climb|shoot|attack|sword|blade|weapon)\b/],
    ['PHYSICAL', /\b(strike|slash|punch|kick|grapple|jump|climb|shoot|attack)\b/],
  ];

  for (const [domain, pattern] of patterns) {
    if (pattern.test(text)) return domain;
  }
  if (candidate?.category) {
    const category = normalize(candidate.category).toUpperCase();
    if (category === 'MOVEMENT') return 'PHYSICAL';
    if (category === 'COMBAT' || category === 'BIOLOGICAL' || category === 'PERCEPTION' || category === 'SOCIAL') return category;
    return category;
  }
  return undefined;
}

function detectScale(actionText: string, candidate?: CapabilityDefinition): CapabilityDefinition['powerTier'] {
  const text = normalize(actionText);
  if (candidate?.powerTier) return candidate.powerTier as CapabilityDefinition['powerTier'];
  if (/\b(world|planet|realm|continent|sky|horizon|reality|split the world)\b/.test(text)) return 'WorldScale';
  if (/\b(city|mountain|fortress|army|massive|major)\b/.test(text)) return 'Major';
  if (/\b(room|group|several|large)\b/.test(text)) return 'Moderate';
  return 'Minor';
}

function hasExplicitForbidden(text: string, domain?: string): boolean {
  const domainWords: Record<string, string[]> = {
    SPATIAL_TRANSIT: ['teleport', 'teleportation', 'spatial travel', 'warping'],
    LIGHTNING: ['lightning', 'electricity'],
    MAGIC: ['magic', 'spell', 'sorcery', 'arcane'],
    DIMENSIONAL: ['dimension', 'dimensional', 'tear reality'],
    TEMPORAL: ['time manipulation', 'temporal magic'],
  };
  const candidates = [domain, ...(domain ? domainWords[domain] || [] : [])].filter(Boolean).map(normalize);
  if (candidates.length === 0) return false;
  return candidates.some((term) =>
    text.includes(`forbidden ${term}`) ||
    text.includes(`${term} is forbidden`) ||
    text.includes(`${term} is impossible`) ||
    text.includes(`cannot ${term}`) ||
    text.includes(`no ${term}`) ||
    text.includes(`does not allow ${term}`) ||
    text.includes(`doesn't allow ${term}`)
  );
}

function isBendingWorld(worldText: string): boolean {
  return /\bbending\b/.test(worldText) && (
    /\bavatar\b/.test(worldText) ||
    /\belemental bending\b/.test(worldText) ||
    /\bbending world\b/.test(worldText) ||
    /\bfour nations\b/.test(worldText) ||
    /\bonly bending\b/.test(worldText) ||
    /\bbending-only\b/.test(worldText)
  );
}

function hasAny(text: string, terms: string[]): boolean {
  const normalized = normalize(text);
  return terms.some((term) => {
    const normalizedTerm = normalize(term).replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${normalizedTerm}\\b`, 'i').test(normalized);
  });
}

function worldSystemIsStructured(world: CapabilitySimulationWorld): boolean {
  return Boolean(
    (world.canonicalCapabilities || []).length ||
    (world.capabilities || []).length ||
    (world.worldRules || []).length ||
    (world.rules || []).length ||
    (world.powerSystem != null) ||
    (world.powerSystems || []).length ||
    (world.metaphysics != null) ||
    (world.magicSystems || []).length ||
    (world.forbiddenContradictions || []).length ||
    (world.ruleConstraints || []).length ||
    world.magicRules != null
  );
}

function domainTerms(domain?: string): string[] {
  const map: Record<string, string[]> = {
    TEMPORAL: ['time', 'temporal', 'chronomancy', 'time manipulation'],
    DIMENSIONAL: ['dimension', 'dimensional', 'reality', 'realm', 'world split', 'tear reality'],
    SPATIAL_TRANSIT: ['teleport', 'teleportation', 'blink', 'warp', 'portal', 'spatial travel'],
    LIGHTNING: ['lightning', 'electricity', 'electric', 'thunderbolt', 'storm'],
    FIRE: ['fire', 'flame', 'pyromancy', 'fire magic', 'firebending'],
    WATER: ['water', 'water magic', 'waterbending', 'hydromancy', 'ice', 'frost'],
    EARTH: ['earth magic', 'earthbending', 'geomancy', 'stone magic', 'seismic'],
    AIR: ['air magic', 'airbending', 'aeromancy', 'wind magic'],
    SHADOW: ['shadow', 'darkness', 'void', 'umbral', 'oblivion'],
    HEALING: ['healing', 'restoration', 'regeneration', 'rejuvenation', 'healing magic'],
    MAGIC: ['magic', 'spell', 'spellcasting', 'sorcery', 'arcane', 'mage', 'wizard', 'mana'],
    BIOLOGICAL: ['poison', 'venom', 'toxin', 'fang', 'claw', 'natural weapon', 'mutation', 'biological'],
    PERCEPTION: ['perception', 'sense', 'sight', 'hearing', 'tracking', 'awareness', 'detection'],
    SOCIAL: ['persuasion', 'intimidation', 'deception', 'charm', 'negotiation', 'leadership', 'social'],
    COMBAT: ['combat', 'fight', 'sword', 'blade', 'weapon', 'martial', 'warrior', 'knight'],
  };
  return domain ? map[domain] || [normalize(domain)] : [];
}

function worldAllows(
  domain: string | undefined,
  worldText: string,
  world: CapabilitySimulationWorld,
  candidate?: CapabilityDefinition,
): { allowed: boolean; reason?: string } {
  if (hasExplicitForbidden(worldText, domain)) {
    return { allowed: false, reason: 'The active world rules explicitly forbid this capability family.' };
  }

  const canonicalText = normalize([
    ...(world.canonicalCapabilities || []),
    ...(world.capabilities || []),
  ].map(flattenText).join(' '));

  if (candidate && canonicalText.includes(normalize(candidate.name))) {
    return { allowed: true };
  }

  if (isBendingWorld(worldText)) {
    if (domain === 'SPATIAL_TRANSIT' || domain === 'DIMENSIONAL' || domain === 'TEMPORAL' || domain === 'MAGIC') {
      return {
        allowed: false,
        reason: 'This world is governed by an elemental-bending power system and has no canonical mechanism for this capability family; the requested skill cannot be created in the current world.',
      };
    }
    if (domain === 'LIGHTNING' && !hasAny(canonicalText, domainTerms('LIGHTNING'))) {
      return { allowed: true };
    }
  }

  if (domain === 'MAGIC' && /\b(no magic|magic does not exist|non-magical world|mundane world|no spellcasting)\b/.test(worldText)) {
    return {
      allowed: false,
      reason: 'The active world does not contain a usable magic/spellcasting system; this skill or spell cannot be created here.',
    };
  }

  if (
    domain === 'PHYSICAL' ||
    domain === 'COMBAT' ||
    domain === 'BIOLOGICAL' ||
    domain === 'PERCEPTION' ||
    domain === 'SOCIAL' ||
    !domain
  ) return { allowed: true };

  const terms = domainTerms(domain);
  const explicitDomainSupport = hasAny(worldText, terms) || hasAny(canonicalText, terms);
  const broadMagicSupport = /\b(magic|spellcasting|sorcery|arcane|mana|wizard|mage|caster)\b/.test(worldText);
  const dndMagicSupport = world.dndRulesMode === 'FULL_DND' || world.rulesetId === 'DND_5E';

  if (domain === 'MAGIC') {
    if (explicitDomainSupport || dndMagicSupport) return { allowed: true };
  } else if (explicitDomainSupport || (broadMagicSupport && ['FIRE', 'WATER', 'EARTH', 'AIR', 'LIGHTNING', 'HEALING', 'SHADOW'].includes(domain))) {
    return { allowed: true };
  }

  if (worldSystemIsStructured(world)) {
    return {
      allowed: false,
      reason: 'The active world has an authored power system, but no canonical mechanism for this capability family; the requested skill cannot be created in the current world.',
    };
  }

  return { allowed: true };
}

function characterAllows(
  domain: string | undefined,
  characterText: string,
  worldText: string,
  ownedCapabilities: CapabilityDefinition[],
  candidate?: CapabilityDefinition,
): { allowed: boolean; reason?: string; alternate?: string } {
  if (!domain || ['PHYSICAL', 'COMBAT', 'BIOLOGICAL', 'PERCEPTION', 'SOCIAL'].includes(domain)) return { allowed: true };

  const actorText = normalize(characterText);
  const ownedText = normalize(ownedCapabilities.map((cap) => `${cap.name} ${cap.description} ${cap.provenance}`).join(' '));
  // Candidate metadata describes what is being evaluated; it must never become evidence
  // that the character already possesses the candidate's supernatural mechanism.
  const candidateText = normalize(candidate ? `${candidate.name} ${candidate.description} ${candidate.provenance}` : '');
  const mechanismText = actorText + ' ' + ownedText;
  const isGenericMagicUser =
    /\b(mage|wizard|sorcerer|spellcaster|warlock|archmage|magus|witch|cleric|paladin|priest)\b/.test(mechanismText);
  const isDarkMagicSpecialist =
    /\b(dark mage|shadow mage|necromancer|void mage|curse|shadow magic|void magic)\b/.test(mechanismText);

  if (isBendingWorld(worldText)) {
    const isAvatar = /\bavatar\b/.test(actorText);
    const domains = new Set<string>();
    if (isAvatar) ['EARTH', 'WATER', 'FIRE', 'AIR', 'LIGHTNING'].forEach((entry) => domains.add(entry));
    if (/\bearthbender\b|\bearth bending\b/.test(actorText)) domains.add('EARTH');
    if (/\bwaterbender\b|\bwater bending\b/.test(actorText)) domains.add('WATER');
    if (/\bfirebender\b|\bfire bending\b/.test(actorText)) {
      domains.add('FIRE');
      domains.add('LIGHTNING');
    }
    if (/\bairbender\b|\bair bending\b/.test(actorText)) domains.add('AIR');

    if (domains.has(domain)) return { allowed: true };

    if (domain === 'LIGHTNING') {
      return {
        allowed: false,
        reason: 'The character has no firebending or Avatar-level basis for lightning generation; the requested lightning technique cannot be learned by this character.',
        alternate: domains.has('EARTH') ? 'Develop a higher-order earthbending technique instead.' : undefined,
      };
    }
    if (['EARTH', 'WATER', 'FIRE', 'AIR'].includes(domain)) {
      return { allowed: false, reason: `The character is not established as a ${domain.toLowerCase()}-bender, so this technique cannot be created for the character.` };
    }
    if (domain === 'HEALING' && !domains.has('WATER')) {
      return { allowed: false, reason: 'In this bending world, the established healing mechanism requires a waterbending basis.' };
    }
    return { allowed: false, reason: 'The character has no compatible mechanism within this world’s bending system.' };
  }

  if (candidate?.restrictions?.length) {
    const missing = candidate.restrictions.filter((restriction) => !actorText.includes(normalize(restriction)));
    if (missing.length) {
      return { allowed: false, reason: `The character lacks the required established trait/domain: ${missing.join(', ')}.` };
    }
  }

  const hasExplicitMechanism = (terms: string[]) => hasAny(mechanismText, terms);
  if (domain === 'MAGIC' && !hasExplicitMechanism(domainTerms('MAGIC')) && !isGenericMagicUser) return { allowed: false, reason: 'The character has no established magic/spellcasting mechanism from which this technique could be learned.' };
  if (domain === 'TEMPORAL' && !hasExplicitMechanism(domainTerms('TEMPORAL'))) return { allowed: false, reason: 'The character has no established temporal mechanism or prerequisite power for this technique.' };
  if (domain === 'DIMENSIONAL' && !hasExplicitMechanism(domainTerms('DIMENSIONAL'))) return { allowed: false, reason: 'The character has no established dimensional/reality-manipulation mechanism for this technique.' };
  if (domain === 'SPATIAL_TRANSIT' && !hasExplicitMechanism(domainTerms('SPATIAL_TRANSIT'))) return { allowed: false, reason: 'The character has no established spatial-transit mechanism such as teleportation, portals, or an equivalent existing technique.' };
  if (domain === 'LIGHTNING' && !hasExplicitMechanism(domainTerms('LIGHTNING')) && !/\b(firebender|avatar)\b/.test(mechanismText) && !isGenericMagicUser) return { allowed: false, reason: 'The character has no established lightning-compatible affinity or mechanism.' };
  if (domain === 'FIRE' && !hasExplicitMechanism(['fire', 'flame', 'pyromancy', 'fire magic', 'firebender'])) {
    if (!isGenericMagicUser || isDarkMagicSpecialist) {
      return { allowed: false, reason: 'The character has no established fire-manipulation mechanism for this technique.' };
    }
  }
  if (domain === 'WATER' && !hasExplicitMechanism(domainTerms('WATER')) && !isGenericMagicUser) return { allowed: false, reason: 'The character has no established water/ice manipulation mechanism for this technique.' };
  if (domain === 'EARTH' && !hasExplicitMechanism(domainTerms('EARTH')) && !isGenericMagicUser) return { allowed: false, reason: 'The character has no established earth/stone manipulation mechanism for this technique.' };
  if (domain === 'AIR' && !hasExplicitMechanism(domainTerms('AIR')) && !isGenericMagicUser) return { allowed: false, reason: 'The character has no established air/wind manipulation mechanism for this technique.' };
  if (domain === 'SHADOW' && !hasExplicitMechanism(domainTerms('SHADOW')) && !isGenericMagicUser) return { allowed: false, reason: 'The character has no established shadow/void/darkness mechanism for this technique.' };
  if (domain === 'HEALING' && !hasExplicitMechanism(domainTerms('HEALING')) && !/\b(cleric|paladin|priest|medic|healer|divine|holy)\b/.test(mechanismText)) return { allowed: false, reason: 'The character has no established healing mechanism or compatible progression basis.' };
  if (domain === 'BIOLOGICAL' && !hasExplicitMechanism(domainTerms('BIOLOGICAL'))) return { allowed: false, reason: 'The character has no established biological, venom, poison, mutation, or natural-weapon mechanism for this technique.' };
  if (domain === 'PERCEPTION' && !hasExplicitMechanism(domainTerms('PERCEPTION'))) return { allowed: false, reason: 'The character has no established perception, sensory, tracking, or detection mechanism for this technique.' };
  if (domain === 'SOCIAL' && !hasExplicitMechanism(domainTerms('SOCIAL'))) return { allowed: false, reason: 'The character has no established social or influence mechanism for this technique.' };
  if (domain === 'COMBAT' && !hasExplicitMechanism(domainTerms('COMBAT')) && !/\b(fighter|warrior|knight|soldier|swordsman|blade|weapon|martial)\b/.test(mechanismText)) return { allowed: false, reason: 'The character has no established combat discipline or compatible weapon mechanism for this technique.' };

  const candidateTokens = candidateText.split(/\s+/).filter((token) => token.length > 5);
  if (candidateTokens.some((token) => actorText.includes(token) || ownedText.includes(token))) return { allowed: true };
  if (hasExplicitMechanism(domainTerms(domain))) return { allowed: true };

  return {
    allowed: false,
    reason: 'The character record does not establish a compatible mechanism, affinity, or progression route for this capability.',
  };
}
function estimateCost(candidate: CapabilityDefinition | undefined, scale: CapabilityDefinition['powerTier']): { energy: number; vessel: number } {
  if (candidate) {
    return {
      energy: Math.max(0, Number(candidate.baseEnergyCost || 0)),
      vessel: Math.max(0, Number(candidate.minVesselCapacityRequired || 0)),
    };
  }
  const base = scale === 'WorldScale' ? 40 : scale === 'Major' ? 24 : scale === 'Moderate' ? 12 : 4;
  return {
    energy: base,
    vessel: scale === 'WorldScale' ? 60 : scale === 'Major' ? 40 : scale === 'Moderate' ? 20 : 5,
  };
}

function buildPreviewCapability(actionText: string, domain: string | undefined, scale: CapabilityDefinition['powerTier']): CapabilityDefinition {
  const clean = actionText.trim().replace(/^i\s+/i, '');
  const name = clean.length > 42 ? clean.slice(0, 42).trimEnd() : clean;
  const category =
    domain === 'PHYSICAL' ? 'Combat' :
    domain === 'SPATIAL_TRANSIT' ? 'Movement' :
    domain === 'LIGHTNING' || domain === 'FIRE' || domain === 'WATER' || domain === 'EARTH' || domain === 'AIR' || domain === 'MAGIC' || domain === 'TEMPORAL' || domain === 'DIMENSIONAL' || domain === 'SHADOW' ? 'Magic' :
    'Domain';
  const cost = estimateCost(undefined, scale);
  return {
    id: `preview_${Buffer.from(normalize(actionText)).toString('base64url').slice(0, 24)}`,
    name: name || 'Unresolved Technique',
    category,
    activationMode: 'immediate',
    powerTier: scale,
    baseEnergyCost: cost.energy,
    baseStrainCost: scale === 'WorldScale' ? 30 : scale === 'Major' ? 12 : scale === 'Moderate' ? 6 : 1,
    minVesselCapacityRequired: cost.vessel,
    description: `Dry-run proposal derived from the player's requested action: ${actionText.trim()}.`,
    provenance: 'SIMULATION_PREVIEW',
    restrictions: [],
    actionType: 'action',
    targetType: 'single_target',
    rangeScope: scale === 'WorldScale' ? 'global' : scale === 'Major' ? 'realm' : 'close',
  };
}

export class CapabilitySimulationEngine {
  public simulate(actionText: string, context: CapabilitySimulationContext, candidateCapability?: CapabilityDefinition): CapabilitySimulationResult {
    const normalizedAction = normalize(actionText);
    if (!normalizedAction) {
      return {
        status: 'UNSUPPORTED_REQUEST',
        actionText,
        worldAllowed: false,
        characterCompatible: false,
        currentlyExecutable: false,
        progressionPossible: false,
        acquisitionAllowed: false,
        explanation: 'No capability request was supplied.',
        blockers: ['Empty action text.'],
        requiredConditions: [],
        developmentPath: [],
        alternateRoutes: [],
        internalOnly: true,
        creationAllowed: false,
      };
    }

    const owned = context.ownedCapabilities.some((cap) => normalize(cap.name) === normalizedAction || normalizedAction.includes(normalize(cap.name)));
    if (owned) {
      return {
        status: 'ALREADY_OWNED',
        actionText,
        candidateCapability,
        worldAllowed: true,
        characterCompatible: true,
        currentlyExecutable: true,
        progressionPossible: true,
        acquisitionAllowed: false,
        explanation: 'The character already owns a matching capability; use canonical execution adjudication.',
        blockers: [],
        requiredConditions: [],
        developmentPath: [],
        alternateRoutes: [],
        internalOnly: true,
        creationAllowed: false,
      };
    }

    const domain = requestedDomain(actionText, candidateCapability);
    const scale = detectScale(actionText, candidateCapability);
    const worldText = collectWorldText(context.world, context.customRules, context.environment);
    const characterText = collectCharacterText(context.character, context.ownedCapabilities);
    const worldCheck = worldAllows(domain, worldText, context.world, candidateCapability);
    const characterCheck = characterAllows(domain, characterText, worldText, context.ownedCapabilities, candidateCapability);
    const power = context.powerState;
    const cost = estimateCost(candidateCapability, scale);
    const acquisitionAllowed =
      context.progressionPolicy?.acquisitionAllowed !== false &&
      context.progressionPolicy?.progressionAllowed !== false &&
      context.progressionState?.allowLevelUp !== false &&
      context.rulesProfile?.enabledMechanics?.includes('character_progression') !== false &&
      context.world.progressionPolicy?.acquisitionAllowed !== false;

    const currentLevel = Number(context.progressionState?.currentLevel || 1);
    const configuredMaxLevel = Number(
      context.progressionState?.maxCharacterLevel ??
      context.progressionPolicy?.maxLevel ??
      10
    );
    const hasProgressionHeadroom = currentLevel < configuredMaxLevel;

    const blockers: string[] = [];
    const requiredConditions: string[] = [];
    const developmentPath: string[] = [];
    const alternateRoutes: string[] = [];

    if (!worldCheck.allowed) {
      blockers.push(worldCheck.reason || 'World rules do not support this capability.');
      return {
        status: 'WORLD_FORBIDDEN',
        actionText,
        requestedDomain: domain,
        candidateCapability: clone(candidateCapability),
        mechanism: 'No canonical mechanism exists under the active world metaphysics.',
        scale,
        worldAllowed: false,
        characterCompatible: false,
        currentlyExecutable: false,
        progressionPossible: false,
        acquisitionAllowed: false,
        explanation: blockers[0],
        blockers,
        requiredConditions,
        developmentPath,
        alternateRoutes,
        estimatedEnergyCost: cost.energy,
        estimatedVesselCapacityRequired: cost.vessel,
        internalOnly: true,
        creationAllowed: false,
      };
    }

    if (!characterCheck.allowed) {
      blockers.push(characterCheck.reason || 'The character has no compatible capability mechanism.');
      if (characterCheck.alternate) alternateRoutes.push(characterCheck.alternate);
      return {
        status: characterCheck.alternate ? 'ALTERNATE_ROUTE' : 'CHARACTER_INCOMPATIBLE',
        actionText,
        requestedDomain: domain,
        candidateCapability: clone(candidateCapability),
        mechanism: characterCheck.alternate || 'No compatible character mechanism exists for the requested effect.',
        scale,
        worldAllowed: true,
        characterCompatible: false,
        currentlyExecutable: false,
        progressionPossible: Boolean(characterCheck.alternate),
        acquisitionAllowed: Boolean(characterCheck.alternate && acquisitionAllowed),
        explanation: blockers[0],
        blockers,
        requiredConditions,
        developmentPath,
        alternateRoutes,
        estimatedEnergyCost: cost.energy,
        estimatedVesselCapacityRequired: cost.vessel,
        internalOnly: true,
        creationAllowed: false,
      };
    }

    if (!acquisitionAllowed) {
      blockers.push('The active world progression rules do not permit capability acquisition.');
      return {
        status: 'CURRENTLY_BLOCKED',
        actionText,
        requestedDomain: domain,
        candidateCapability: clone(candidateCapability),
        mechanism: 'The world can describe this mechanism, but progression is locked.',
        scale,
        worldAllowed: true,
        characterCompatible: true,
        currentlyExecutable: false,
        progressionPossible: false,
        acquisitionAllowed: false,
        explanation: blockers[0],
        blockers,
        requiredConditions,
        developmentPath,
        alternateRoutes,
        estimatedEnergyCost: cost.energy,
        estimatedVesselCapacityRequired: cost.vessel,
        internalOnly: true,
        creationAllowed: false,
      };
    }

    if (!candidateCapability) {
      candidateCapability = buildPreviewCapability(actionText, domain, scale);
    }

    if (power) {
      if (power.vesselCapacity < cost.vessel) {
        blockers.push(`Current vessel capacity (${power.vesselCapacity}) is below the estimated requirement (${cost.vessel}).`);
        requiredConditions.push(`Increase vessel capacity to at least ${cost.vessel}.`);
      }
      if (power.magicalEnergy < cost.energy) {
        blockers.push(`Current energy (${power.magicalEnergy}) is below the estimated cost (${cost.energy}).`);
        requiredConditions.push(`Reach at least ${cost.energy} available energy.`);
      }
      if (power.sealState === 'absolute') {
        blockers.push('The character\'s current seal state prevents active capability access.');
        requiredConditions.push('Advance or relax the relevant seal condition.');
      }
    }

    const hasCurrentResourceBlock = blockers.length > 0;
    let progressionPossible = acquisitionAllowed && hasProgressionHeadroom;
    const currentlyExecutable = false; // A capability not owned by the actor is never directly executable.

    if (Array.isArray(candidateCapability.prerequisites) && candidateCapability.prerequisites.length > 0) {
      const characterAndOwned = normalize([
        characterText,
        ...context.ownedCapabilities.map((cap) => cap.name),
      ].join(' '));
      const missingPrerequisites = candidateCapability.prerequisites.filter(
        (prerequisite) => !characterAndOwned.includes(normalize(prerequisite))
      );
      if (missingPrerequisites.length > 0) {
        blockers.push(`Missing prerequisites: ${missingPrerequisites.join(', ')}.`);
        requiredConditions.push(...missingPrerequisites.map((item) => `Establish prerequisite: ${item}`));
      }
    }

    if (!acquisitionAllowed) {
      progressionPossible = false;
      blockers.push('The active progression rules do not permit acquiring new capabilities.');
    } else if (!hasProgressionHeadroom) {
      progressionPossible = false;
      blockers.push(`Character is at the configured progression ceiling (level ${configuredMaxLevel}).`);
    }

    if (progressionPossible) {
      developmentPath.push('Acquire the candidate capability through an explicit progression/learning decision.');
    }

    if (hasCurrentResourceBlock || !progressionPossible || requiredConditions.length > 0) {
      developmentPath.push(...requiredConditions.map((condition) => `Prerequisite: ${condition}`));

      if (hasCurrentResourceBlock) {
        if (/\b(ritual|ceremony|sacrifice|binding vow|binding-vow)\b/.test(worldText)) {
          alternateRoutes.push('A world-sanctioned ritual or binding-vow mechanism may provide an alternate development route.');
        }
        if (/\b(artifact|relic|equipment|weapon|external source|energy source|crystal|core)\b/.test(worldText)) {
          alternateRoutes.push('An external catalyst, artifact, or energy source may reduce the current vessel/resource requirement.');
        }
        if (/\b(transformation|ascension|true form|awakening)\b/.test(worldText)) {
          alternateRoutes.push('A sanctioned transformation or awakening may raise the character\'s usable power ceiling.');
        }
      }

      return {
        status: !progressionPossible ? 'CURRENTLY_BLOCKED' : 'CONDITIONALLY_DEVELOPABLE',
        actionText,
        requestedDomain: domain,
        candidateCapability: clone(candidateCapability),
        mechanism: `Develop through the character's established ${domain || 'power'} pathway.`,
        scale,
        worldAllowed: true,
        characterCompatible: true,
        currentlyExecutable,
        progressionPossible,
        acquisitionAllowed,
        explanation: !progressionPossible
          ? 'The requested effect is compatible in principle, but the current progression state or world progression rules do not permit acquisition now.'
          : 'The world and character support this capability in principle, but current resources, prerequisites, or vessel limits prevent immediate use.',
        blockers,
        requiredConditions,
        developmentPath,
        alternateRoutes,
        estimatedEnergyCost: cost.energy,
        estimatedVesselCapacityRequired: cost.vessel,
        internalOnly: true,
        creationAllowed: false,
      };
    }

    return {
      status: 'DEVELOPABLE',
      actionText,
      requestedDomain: domain,
      candidateCapability: clone(candidateCapability),
      mechanism: `Develop through the character's established ${domain || 'power'} pathway.`,
      scale,
      worldAllowed: true,
      characterCompatible: true,
      currentlyExecutable,
      progressionPossible,
      acquisitionAllowed,
      explanation: 'The requested effect is compatible with the current world and character, but the character does not currently own the technique.',
      blockers: [],
      requiredConditions: [],
      developmentPath,
      alternateRoutes,
      estimatedEnergyCost: cost.energy,
      estimatedVesselCapacityRequired: cost.vessel,
      internalOnly: true,
      creationAllowed: true,
    };
  }
}
