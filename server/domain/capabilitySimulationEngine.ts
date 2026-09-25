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
  canonicalCapabilities?: any[];
  powerSystem?: any;
  powerSystems?: any[];
  metaphysics?: any;
  magicSystems?: any[];
  worldRules?: any[];
  rules?: any[];
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
    conditions?: string[];
    description?: string;
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
  internalOnly: boolean;\n  /** True only when the dry-run found a valid path for canonical acquisition. */\n  creationAllowed?: boolean;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

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

function collectWorldText(world: CapabilitySimulationWorld, customRules: any[] = []): string {
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
    ...(customRules || []),
    world.capabilities,
    world.canonicalCapabilities,
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
    ['PHYSICAL', /\b(strike|slash|punch|kick|grapple|jump|climb|shoot|attack)\b/],
  ];

  for (const [domain, pattern] of patterns) {
    if (pattern.test(text)) return domain;
  }
  return candidate?.category ? normalize(candidate.category).toUpperCase() : undefined;
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

function hasAny(text: string, terms: string[]): boolean {\n  const normalized = normalize(text);\n  return terms.some((term) => normalized.includes(normalize(term)));\n}\n\nfunction worldSystemIsStructured(world: CapabilitySimulationWorld): boolean {\n  return Boolean(\n    (world.canonicalCapabilities || []).length ||\n    (world.capabilities || []).length ||\n    (world.worldRules || []).length ||\n    (world.rules || []).length ||\n    (world.powerSystem != null) ||\n    (world.powerSystems || []).length ||\n    (world.metaphysics != null) ||\n    (world.magicSystems || []).length ||\n    (world.forbiddenContradictions || []).length ||\n    (world.ruleConstraints || []).length ||\n    world.magicRules != null\n  );\n}\n\nfunction domainTerms(domain?: string): string[] {\n  const map: Record<string, string[]> = {\n    TEMPORAL: ['time', 'temporal', 'chronomancy', 'time manipulation'],\n    DIMENSIONAL: ['dimension', 'dimensional', 'reality', 'realm', 'world split', 'tear reality'],\n    SPATIAL_TRANSIT: ['teleport', 'teleportation', 'blink', 'warp', 'portal', 'spatial travel'],\n    LIGHTNING: ['lightning', 'electricity', 'electric', 'thunderbolt', 'storm'],\n    FIRE: ['fire', 'flame', 'pyromancy', 'fire magic', 'firebending'],\n    WATER: ['water', 'water magic', 'waterbending', 'hydromancy', 'ice', 'frost'],\n    EARTH: ['earth magic', 'earthbending', 'geomancy', 'stone magic', 'seismic'],\n    AIR: ['air magic', 'airbending', 'aeromancy', 'wind magic'],\n    SHADOW: ['shadow', 'darkness', 'void', 'umbral', 'oblivion'],\n    HEALING: ['healing', 'restoration', 'regeneration', 'rejuvenation', 'healing magic'],\n    MAGIC: ['magic', 'spell', 'spellcasting', 'sorcery', 'arcane', 'mage', 'wizard', 'mana'],\n  };\n  return domain ? map[domain] || [normalize(domain)] : [];\n}\n\nfunction worldAllows(\n  domain: string | undefined,\n  worldText: string,\n  world: CapabilitySimulationWorld,\n  candidate?: CapabilityDefinition,\n): { allowed: boolean; reason?: string } {\n  if (hasExplicitForbidden(worldText, domain)) {\n    return { allowed: false, reason: 'The active world rules explicitly forbid this capability family.' };\n  }\n\n  const canonicalText = normalize([\n    ...(world.canonicalCapabilities || []),\n    ...(world.capabilities || []),\n  ].map(flattenText).join(' '));\n\n  if (candidate && canonicalText.includes(normalize(candidate.name))) {\n    return { allowed: true };\n  }\n\n  if (isBendingWorld(worldText)) {\n    if (domain === 'SPATIAL_TRANSIT' || domain === 'DIMENSIONAL' || domain === 'TEMPORAL' || domain === 'MAGIC') {\n      return {\n        allowed: false,\n        reason: 'This world is governed by an elemental-bending power system and has no canonical mechanism for this capability family; the requested skill cannot be created in the current world.',\n      };\n    }\n    if (domain === 'LIGHTNING' && !hasAny(canonicalText, domainTerms('LIGHTNING'))) {\n      return { allowed: true };\n    }\n  }\n\n  if (domain === 'MAGIC' && /\b(no magic|magic does not exist|non-magical world|mundane world|no spellcasting)\b/.test(worldText)) {\n    return {\n      allowed: false,\n      reason: 'The active world does not contain a usable magic/spellcasting system; this skill or spell cannot be created here.',\n    };\n  }\n\n  if (domain === 'PHYSICAL' || !domain) return { allowed: true };\n\n  const terms = domainTerms(domain);\n  const explicitDomainSupport = hasAny(worldText, terms) || hasAny(canonicalText, terms);\n  const broadMagicSupport = /\b(magic|spellcasting|sorcery|arcane|mana|wizard|mage|caster)\b/.test(worldText);\n  const dndMagicSupport = world.dndRulesMode === 'FULL_DND' || world.rulesetId === 'DND_5E';\n\n  if (domain === 'MAGIC') {\n    if (explicitDomainSupport || dndMagicSupport) return { allowed: true };\n  } else if (explicitDomainSupport || (broadMagicSupport && ['FIRE', 'WATER', 'EARTH', 'AIR', 'LIGHTNING', 'HEALING', 'SHADOW'].includes(domain))) {\n    return { allowed: true };\n  }\n\n  if (worldSystemIsStructured(world)) {\n    return {\n      allowed: false,\n      reason: 'The active world has an authored power system, but no canonical mechanism for this capability family; the requested skill cannot be created in the current world.',\n    };\n  }\n\n  return { allowed: true };\n}\n\nfunction characterAllows(\n  domain: string | undefined,\n  characterText: string,\n  worldText: string,\n  ownedCapabilities: CapabilityDefinition[],\n  candidate?: CapabilityDefinition,\n): { allowed: boolean; reason?: string; alternate?: string } {\n  if (!domain || domain === 'PHYSICAL') return { allowed: true };\n\n  const actorText = normalize(characterText);\n  const ownedText = normalize(ownedCapabilities.map((cap) => `${cap.name} ${cap.description} ${cap.provenance}`).join(' '));\n  const candidateText = normalize(candidate ? `${candidate.name} ${candidate.description} ${candidate.provenance} ${(candidate.restrictions || []).join(' ')}` : '');\n  const mechanismText = actorText + ' ' + ownedText + ' ' + candidateText;\n\n  if (isBendingWorld(worldText)) {\n    const isAvatar = /\bavatar\b/.test(actorText);\n    const domains = new Set<string>();\n    if (isAvatar) ['EARTH', 'WATER', 'FIRE', 'AIR', 'LIGHTNING'].forEach((entry) => domains.add(entry));\n    if (/\bearthbender\b|\bearth bending\b/.test(actorText)) domains.add('EARTH');\n    if (/\bwaterbender\b|\bwater bending\b/.test(actorText)) domains.add('WATER');\n    if (/\bfirebender\b|\bfire bending\b/.test(actorText)) {\n      domains.add('FIRE');\n      domains.add('LIGHTNING');\n    }\n    if (/\bairbender\b|\bair bending\b/.test(actorText)) domains.add('AIR');\n\n    if (domains.has(domain)) return { allowed: true };\n\n    if (domain === 'LIGHTNING') {\n      return {\n        allowed: false,\n        reason: 'The character has no firebending or Avatar-level basis for lightning generation; the requested lightning technique cannot be learned by this character.',\n        alternate: domains.has('EARTH') ? 'Develop a higher-order earthbending technique instead.' : undefined,\n      };\n    }\n    if (['EARTH', 'WATER', 'FIRE', 'AIR'].includes(domain)) {\n      return { allowed: false, reason: `The character is not established as a ${domain.toLowerCase()}-bender, so this technique cannot be created for the character.` };\n    }\n    if (domain === 'HEALING' && !domains.has('WATER')) {\n      return { allowed: false, reason: 'In this bending world, the established healing mechanism requires a waterbending basis.' };\n    }\n    return { allowed: false, reason: 'The character has no compatible mechanism within this world’s bending system.' };\n  }\n\n  if (candidate?.restrictions?.length) {\n    const missing = candidate.restrictions.filter((restriction) => !actorText.includes(normalize(restriction)));\n    if (missing.length) {\n      return { allowed: false, reason: `The character lacks the required established trait/domain: ${missing.join(', ')}.` };\n    }\n  }\n\n  const hasExplicitMechanism = (terms: string[]) => hasAny(mechanismText, terms);\n  if (domain === 'MAGIC' && !hasExplicitMechanism(domainTerms('MAGIC'))) return { allowed: false, reason: 'The character has no established magic/spellcasting mechanism from which this technique could be learned.' };\n  if (domain === 'TEMPORAL' && !hasExplicitMechanism(domainTerms('TEMPORAL'))) return { allowed: false, reason: 'The character has no established temporal mechanism or prerequisite power for this technique.' };\n  if (domain === 'DIMENSIONAL' && !hasExplicitMechanism(domainTerms('DIMENSIONAL'))) return { allowed: false, reason: 'The character has no established dimensional/reality-manipulation mechanism for this technique.' };\n  if (domain === 'SPATIAL_TRANSIT' && !hasExplicitMechanism(domainTerms('SPATIAL_TRANSIT'))) return { allowed: false, reason: 'The character has no established spatial-transit mechanism such as teleportation, portals, or an equivalent existing technique.' };\n  if (domain === 'LIGHTNING' && !hasExplicitMechanism(domainTerms('LIGHTNING')) && !/\b(firebender|avatar)\b/.test(mechanismText)) return { allowed: false, reason: 'The character has no established lightning-compatible affinity or mechanism.' };\n  if (domain === 'FIRE' && !hasExplicitMechanism(['fire', 'flame', 'pyromancy', 'fire magic', 'firebender'])) return { allowed: false, reason: 'The character has no established fire-manipulation mechanism for this technique.' };\n  if (domain === 'WATER' && !hasExplicitMechanism(domainTerms('WATER'))) return { allowed: false, reason: 'The character has no established water/ice manipulation mechanism for this technique.' };\n  if (domain === 'EARTH' && !hasExplicitMechanism(domainTerms('EARTH'))) return { allowed: false, reason: 'The character has no established earth/stone manipulation mechanism for this technique.' };\n  if (domain === 'AIR' && !hasExplicitMechanism(domainTerms('AIR'))) return { allowed: false, reason: 'The character has no established air/wind manipulation mechanism for this technique.' };\n  if (domain === 'SHADOW' && !hasExplicitMechanism(domainTerms('SHADOW'))) return { allowed: false, reason: 'The character has no established shadow/void/darkness mechanism for this technique.' };\n  if (domain === 'HEALING' && !hasExplicitMechanism(domainTerms('HEALING')) && !/\b(cleric|paladin|priest|medic|healer|divine|holy)\b/.test(mechanismText)) return { allowed: false, reason: 'The character has no established healing mechanism or compatible progression basis.' };\n\n  const candidateTokens = candidateText.split(/\s+/).filter((token) => token.length > 5);\n  if (candidateTokens.some((token) => ownedText.includes(token))) return { allowed: true };\n  if (hasExplicitMechanism(domainTerms(domain))) return { allowed: true };\n\n  return {\n    allowed: false,\n    reason: 'The character record does not establish a compatible mechanism, affinity, or progression route for this capability.',\n  };\n}\nfunction estimateCost(candidate: CapabilityDefinition | undefined, scale: CapabilityDefinition['powerTier']): { energy: number; vessel: number } {
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
    domain === 'PHYSICAL' ? 'Physical' :
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
      };
    }

    const domain = requestedDomain(actionText, candidateCapability);
    const scale = detectScale(actionText, candidateCapability);
    const worldText = collectWorldText(context.world, context.customRules);
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
      20
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
    };
  }
}
