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
  internalOnly: boolean;
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

function worldAllows(domain: string | undefined, worldText: string, world: CapabilitySimulationWorld, candidate?: CapabilityDefinition): { allowed: boolean; reason?: string } {
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
      return { allowed: false, reason: 'This world is governed by an elemental-bending power system and has no canonical mechanism for this capability family.' };
    }
    if (domain === 'LIGHTNING' && !/\b(lightning|lightning generation)\b/.test(canonicalText)) {
      // Lightning is a bending expression, not a free spell, so character compatibility
      // still has to authorize it below.
      return { allowed: true };
    }
  }

  if (domain === 'MAGIC' && /\b(no magic|magic does not exist|non-magical world|mundane world|no spellcasting)\b/.test(worldText)) {
    return { allowed: false, reason: 'The active world does not contain a usable magic/spellcasting system.' };
  }

  return { allowed: true };
}

function characterAllows(domain: string | undefined, characterText: string, worldText: string, ownedCapabilities: CapabilityDefinition[], candidate?: CapabilityDefinition): { allowed: boolean; reason?: string; alternate?: string } {
  if (!domain) return { allowed: true };

  if (isBendingWorld(worldText)) {
    const isAvatar = /\bavatar\b/.test(characterText);
    const domains = new Set<string>();
    if (isAvatar) {
      ['EARTH', 'WATER', 'FIRE', 'AIR', 'LIGHTNING'].forEach((entry) => domains.add(entry));
    }
    if (/\bearthbender\b|\bearth bending\b/.test(characterText)) domains.add('EARTH');
    if (/\bwaterbender\b|\bwater bending\b/.test(characterText)) domains.add('WATER');
    if (/\bfirebender\b|\bfire bending\b/.test(characterText)) {
      domains.add('FIRE');
      domains.add('LIGHTNING');
    }
    if (/\bairbender\b|\bair bending\b/.test(characterText)) domains.add('AIR');

    if (domains.has(domain)) return { allowed: true };
    if (domain === 'LIGHTNING') {
      return {
        allowed: false,
        reason: 'The character has no firebending or Avatar-level basis for lightning generation.',
        alternate: domains.has('EARTH') ? 'Develop a higher-order earthbending technique instead.' : undefined,
      };
    }
    if (['EARTH', 'WATER', 'FIRE', 'AIR'].includes(domain)) {
      return {
        allowed: false,
        reason: `The character is not established as a ${domain.toLowerCase()}-bender.`,
      };
    }
  }

  const actorText = characterText;
  const candidateText = normalize(candidate ? `${candidate.name} ${candidate.description} ${candidate.provenance} ${(candidate.restrictions || []).join(' ')}` : '');
  if (candidate?.restrictions?.length) {
    const missing = candidate.restrictions.filter((restriction) => !actorText.includes(normalize(restriction)));
    if (missing.length) {
      return {
        allowed: false,
        reason: `The character lacks the required established trait/domain: ${missing.join(', ')}.`,
      };
    }
  }

  const ownedText = normalize(ownedCapabilities.map((cap) => `${cap.name} ${cap.description}`).join(' '));

  if (domain === 'SHADOW' && !/(shadow|void|dark|curse|oblivion)/.test(actorText)) {
    return { allowed: false, reason: 'No established shadow/void/darkness mechanism exists in the character record.' };
  }
  if (domain === 'LIGHTNING' && !/(lightning|electric|storm|firebender|avatar)/.test(actorText + ' ' + ownedText)) {
    return { allowed: false, reason: 'No established lightning-compatible affinity or mechanism exists for this character.' };
  }
  if (domain === 'FIRE' && candidate && normalize(candidate.category) === 'magic' && !/(fire|flame|mage|magic|pyromanc|elemental)/.test(actorText + ' ' + ownedText)) {
    return { allowed: false, reason: 'The character has no established mechanism for magical fire manipulation.' };
  }

  const mechanismText = actorText + ' ' + ownedText;

  if (domain === 'BIOLOGICAL' || normalize(candidate?.category) === 'biological') {
    if (!/(venom|toxin|poison|fang|bite|claw|predator|serpent|draconic|insect|beast|mutant|biological)/.test(mechanismText)) {
      return { allowed: false, reason: 'The character has no established biological mechanism for this technique.' };
    }
  }

  if (
    normalize(candidate?.name).includes('flight') ||
    normalize(candidate?.name).includes('aerial')
  ) {
    if (!/(wing|flight|flying|levitat|aerial|airbender|flying shoes|winged|feather)/.test(mechanismText)) {
      return { allowed: false, reason: 'The character has no established flight mechanism, equipment, or compatible progression basis.' };
    }
  }

  if (domain === 'MAGIC' && normalize(candidate?.category) === 'magic' &&
      !/(magic|spell|sorcer|wizard|mage|mana|arcane|caster|warlock|cleric|ritual|bending)/.test(mechanismText)) {
    return { allowed: false, reason: 'The character has no established magic or spellcasting mechanism for this technique.' };
  }

  if (domain === 'SPATIAL_TRANSIT' && candidate && normalize(candidate.category) !== 'movement' && !/(teleport|blink|spatial|dimensional)/.test(actorText + ' ' + ownedText)) {
    return { allowed: false, reason: 'The character has no established spatial-transit mechanism.' };
  }

  if (candidateText && ownedText && candidateText.split(/\s+/).some((token) => token.length > 5 && ownedText.includes(token))) {
    return { allowed: true };
  }

  // A novel physical technique may remain learnable through normal progression when
  // it does not demand a new supernatural mechanism.
  if (domain === 'PHYSICAL') return { allowed: true };

  return { allowed: true };
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
    const acquisitionAllowed = context.rulesProfile?.allowCharacterProgression !== false &&
      context.rulesProfile?.enabledMechanics?.includes('character_progression') !== false &&
      context.world.progressionPolicy?.acquisitionAllowed !== false;

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
    const progressionPossible = true;
    const currentlyExecutable = !hasCurrentResourceBlock && false; // not learned, therefore never directly executable.

    developmentPath.push('Acquire the candidate capability through an explicit progression/learning decision.');
    if (hasCurrentResourceBlock) {
      developmentPath.push(...requiredConditions.map((condition) => `Prerequisite: ${condition}`));
      return {
        status: 'CONDITIONALLY_DEVELOPABLE',
        actionText,
        requestedDomain: domain,
        candidateCapability: clone(candidateCapability),
        mechanism: `Develop through the character's established ${domain || 'power'} pathway.`,
        scale,
        worldAllowed: true,
        characterCompatible: true,
        currentlyExecutable,
        progressionPossible,
        acquisitionAllowed: true,
        explanation: 'The world and character support this capability in principle, but current resources or vessel limits prevent immediate use.',
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
      acquisitionAllowed: true,
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
