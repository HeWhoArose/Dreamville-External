import { WorldTimestamp } from './types';

export type VesselType = 'mortal_human' | 'ascended_avatar' | 'primordial_form' | 'ethereal_spirit';
export type SealState = 'absolute' | 'partial' | 'dormant' | 'broken';

export interface PowerState {
  originId: string;
  originTier: 'Grounded' | 'Heroic' | 'Epic' | 'Mythic' | 'Transcendent' | 'Unbounded';
  currentFormId: string;
  vesselType: VesselType;
  vesselCapacity: number; // 0 to 100
  sealState: SealState;
  sealStrength: number; // 0 to 100
  powerAccessLevel: number; // 0.0 to 1.0 (e.g. 0.35 = 35%)
  trueFormAccess: boolean;

  healthCurrent: number;
  healthMax: number;
  fatigue: number; // 0 to 100
  stress: number; // 0 to 100
  magicalEnergy: number; // Current mana / qi / aura
  physicalStrain: number; // Accumulator
  activeConditions: string[];
}

export type CapabilityActivationMode = 'immediate' | 'passive' | 'reaction' | 'charged' | 'channelled' | 'toggled';

export type CapabilitySourceType = 'LEARNED' | 'EQUIPMENT' | 'ORIGIN' | 'TRAIT';

export interface CapabilitySourceRecord {
  type: CapabilitySourceType;
  itemDefId?: string;
  itemInstanceId?: string;
  itemName?: string;
  slot?: string;
  provenance?: string;
}

export interface EffectiveCapability extends CapabilityDefinition {
  sources: CapabilitySourceRecord[];
  isEquippedItemGrant: boolean;
  isLearned: boolean;
  skillInstance?: SkillInstance;
}

export interface VisualIdentityRef {
  assetId: string;
  relativeUri?: string;
  promptFallback?: string;
  description?: string;
}

export interface CapabilityDefinition {
  id: string;
  name: string;
  category: 'Combat' | 'Magic' | 'Movement' | 'Domain' | 'Perception' | 'Biological' | 'Social';
  activationMode: CapabilityActivationMode;
  powerTier: 'Minor' | 'Moderate' | 'Major' | 'WorldScale';
  baseEnergyCost: number;
  baseStrainCost: number;
  chargeTurnsRequired?: number;
  isInterruptible?: boolean;
  minVesselCapacityRequired: number;
  description: string;
  provenance: string;

  // CH6 Structured Capability Fields (DreamBook §V10.5.5, §V10.8.6)
  prerequisites?: string[];
  restrictions?: string[];
  cooldownTurns?: number;
  durationTurns?: number;
  targetType?: 'single_target' | 'self' | 'area_of_effect' | 'all_allies' | 'all_enemies';
  rangeScope?: 'melee' | 'close' | 'ranged' | 'realm' | 'global';
  actionType?: 'action' | 'bonus_action' | 'reaction' | 'free';
  counters?: string[];
  visualIdentityRef?: VisualIdentityRef;
}

export interface ProgressionHistoryEntry {
  entryIndex: number;
  timestampSeconds: number;
  changeType: 'ACQUIRED' | 'XP_AWARDED' | 'LEVEL_UP' | 'EVOLVED' | 'DOWNGRADED' | 'RELEARNED';
  details: string;
  prevLevel?: number;
  newLevel?: number;
  prevXp?: number;
  newXp?: number;
}

/**
 * SkillInstance (DreamBook §V10.5.5, §V10.5.6)
 * Actor/entity-scoped, independently mutable progression instance.
 * Points to immutable CapabilityDefinition; definitions are NEVER mutated by actor progression.
 */
export interface SkillInstance {
  instanceId: string;
  actorId: string;
  capabilityId: string;
  currentLevel: number;
  currentXp: number;
  xpToNextLevel: number | null;
  evolutionPoints: number;
  evolutionLineage: string[];
  progressionHistory: ProgressionHistoryEntry[];
  unlockedAtSeconds: number;
  isEquippedGrant?: boolean;
  libraryEntryId?: string;
  libraryStatus?: 'NATIVE' | 'REUSED' | 'APPROVED';
  librarySourceStoryIds?: string[];
}

export interface WorldProgressionPolicy {
  progressionAllowed: boolean;
  evolutionAllowed: boolean;
  acquisitionAllowed: boolean;
  progressionTransferAllowed?: boolean;
  calcXpToNext?: (level: number) => number | null;
  maxLevel?: number;
}

export const DEFAULT_PROGRESSION_POLICY: WorldProgressionPolicy = {
  progressionAllowed: true,
  evolutionAllowed: true,
  acquisitionAllowed: true,
  progressionTransferAllowed: true,
  calcXpToNext: (level: number) => level * 100,
  maxLevel: 10,
};

export interface CapabilityModifier {
  id: string;
  name: string;
  modifierType: 'OVERCHARGE' | 'CONCENTRATE' | 'EXPAND_SCOPE' | 'ELEMENTAL_INFUSION' | 'CUSTOM';
  energyCostDelta: number;
  strainCostDelta: number;
  hpCostDelta?: number;
  effectScaleDelta?: number;
  description: string;
  parameters?: Record<string, string | number | boolean>;
}

export type ExecutionGateStatus =
  | 'AUTOMATIC_SUCCESS'
  | 'EXECUTION_CHECK_REQUIRED'
  | 'ELIGIBILITY_BLOCKED'
  | 'FAILED'
  | 'INTERRUPTED';

export interface ExecutionGateProposal {
  actorId: string;
  capabilityId: string;
  environment?: {
    conditions?: string[];
    distortionLevel?: number;
    isSuppressed?: boolean;
  };
  actorConditions?: string[];
  masteryOverride?: number;
  roleOrBackground?: string;
  modifiers?: CapabilityModifier[];
}

export interface ExecutionGateResult {
  status: ExecutionGateStatus;
  eligible: boolean;
  requiresCheck: boolean;
  checkDifficulty?: number;
  rejectionReason?: string;
  masteryLevel?: number;
  environmentalModifiers: string[];
  actorConditionModifiers: string[];
  executionNotes: string;
}

export interface PendingActivationState {
  activationId: string;
  actorId: string;
  capabilityId: string;
  activationMode: 'charged' | 'channelled';
  targetId?: string;
  requestedScale?: 'Local' | 'Moderate' | 'WorldScale';
  remainingTurns: number;
  totalTurnsRequired: number;
  isInterruptible: boolean;
  channelSustainedTurns: number;
  startedAtRound: number;
  context?: Record<string, unknown>;
}

export interface SynthesizeCustomPowerParams {
  actorId: string;
  conceptName: string;
  description: string;
  tags: string[];
  powerTier: 'Minor' | 'Moderate' | 'Major' | 'WorldScale';
  targetType?: 'single_target' | 'self' | 'area_of_effect' | 'all_allies' | 'all_enemies';
  rangeScope?: 'melee' | 'close' | 'ranged' | 'realm' | 'global';
  actionType?: 'action' | 'bonus_action' | 'reaction' | 'free';
  cooldownTurns?: number;
  durationTurns?: number;
  restrictions?: string[];
  counters?: string[];
}

export interface FreeformActionRequest {
  actorId: string;
  actionText: string;
  tags?: string[];
  intendedCapabilityId?: string;
  requestedModifiers?: CapabilityModifier[];
  requestedScale?: 'Local' | 'Moderate' | 'WorldScale';
  environment?: {
    conditions?: string[];
    distortionLevel?: number;
    isSuppressed?: boolean;
  };
  actorConditions?: string[];
  executeIfValid?: boolean;
}

export type FreeformInterpretationType =
  | 'EXISTING_CAPABILITY'
  | 'CONTEXTUAL_MODIFICATION'
  | 'NOVEL_CAPABILITY_PROPOSAL'
  | 'UNSUPPORTED';

export interface FreeformInterpretationResult {
  interpretationType: FreeformInterpretationType;
  actorId: string;
  actionText: string;
  mappedCapability?: CapabilityDefinition;
  appliedModifiers?: CapabilityModifier[];
  proposedCapability?: CapabilityDefinition;
  derivedTechniques?: string[];
  executionGate?: ExecutionGateResult;
  adjudicationConsequence?: ApprovedConsequence;
  validationSuccess: boolean;
  rejectionReason?: string;
  narrativeInterpretation: string;
}

export interface CapabilityGraphNode {
  capabilityId: string;
  name: string;
  derivedSkills: string[];
  prerequisites: string[];
  transformsInto?: string[];
  enhances?: string[];
}

export interface AdjudicationProposal {
  actionDescription: string;
  intendedCapabilityId: string;
  requestedScale: 'Local' | 'Moderate' | 'WorldScale';
  actorId: string;
  modifiers?: CapabilityModifier[];
  environment?: {
    conditions?: string[];
    distortionLevel?: number;
    isSuppressed?: boolean;
  };
  actorConditions?: string[];
  roleOrBackground?: string;
}

export interface ApprovedConsequence {
  approved: boolean;
  rejectionReason?: string;
  hpDelta: number;
  energyDelta: number;
  strainDelta: number;
  appliedConditions: string[];
  emittedObservation: {
    visibleToNearby: boolean;
    sensoryDescription: string;
  };
  narrativeDirective: string;
  executionGate?: ExecutionGateResult;
  appliedModifiers?: CapabilityModifier[];
}

/**
 * CapabilityEngine
 * Implements DreamBook Challenges 6 & 7 (v10.0, v10.1, v10.8.5–v10.8.7).
 * Authority over PowerState, capability resolution, execution checks, and consequence calculation.
 */
export class CapabilityEngine {
  private capabilities: Map<string, CapabilityDefinition> = new Map();
  private powerStates: Map<string, PowerState> = new Map(); // actorId -> PowerState
  private capabilityGraph: Map<string, CapabilityGraphNode> = new Map();
  private actorLearnedCapabilities: Map<string, Set<string>> = new Map();
  private actorSkillInstances: Map<string, Map<string, SkillInstance>> = new Map(); // actorId -> capabilityId -> SkillInstance
  private synthesisCounter: number = 0;
  private progressionPolicy: WorldProgressionPolicy = { ...DEFAULT_PROGRESSION_POLICY };

  constructor() {
    this.seedDefaultCapabilities();
  }

  public getProgressionPolicy(): WorldProgressionPolicy {
    return { ...this.progressionPolicy };
  }

  public setProgressionPolicy(policy: Partial<WorldProgressionPolicy>): void {
    this.progressionPolicy = {
      ...this.progressionPolicy,
      ...policy,
    };
  }

  private seedDefaultCapabilities(): void {
    this.registerCapability({
      id: 'cap_world_darkness',
      name: 'World-Enveloping Darkness',
      category: 'Domain',
      activationMode: 'channelled',
      powerTier: 'WorldScale',
      baseEnergyCost: 40,
      baseStrainCost: 35,
      chargeTurnsRequired: 1,
      isInterruptible: true,
      minVesselCapacityRequired: 60,
      description: 'Shrouds the sky and surrounding realm in primordial metaphysical darkness.',
      provenance: 'origin:embodiment_of_end',
    });

    this.registerCapability({
      id: 'cap_venomous_bite',
      name: 'Venomous Bite',
      category: 'Biological',
      activationMode: 'immediate',
      powerTier: 'Minor',
      baseEnergyCost: 2,
      baseStrainCost: 0,
      minVesselCapacityRequired: 5,
      description: 'Secretes potent contact or injection neurotoxin through dental glands.',
      provenance: 'starter_trait',
    });

    this.registerCapability({
      id: 'cap_shadow_step',
      name: 'Shadow Step',
      category: 'Movement',
      activationMode: 'immediate',
      powerTier: 'Moderate',
      baseEnergyCost: 10,
      baseStrainCost: 5,
      minVesselCapacityRequired: 20,
      description: 'Instantaneous short-range spatial transit between shadows.',
      provenance: 'skill:shadow_sovereign',
    });

    // CH3.2 Benchmark Capabilities
    this.registerCapability({
      id: 'cap_flight',
      name: 'Aerial Flight',
      category: 'Movement',
      activationMode: 'channelled',
      powerTier: 'Minor',
      baseEnergyCost: 5,
      baseStrainCost: 2,
      minVesselCapacityRequired: 10,
      description: 'Allows buoyant aerial levitation and sustained flight across vertical hazards.',
      provenance: 'equipment:def_flying_shoes',
    });

    this.registerCapability({
      id: 'cap_fireball',
      name: 'Fireball',
      category: 'Magic',
      activationMode: 'immediate',
      powerTier: 'Moderate',
      baseEnergyCost: 15,
      baseStrainCost: 5,
      minVesselCapacityRequired: 20,
      description: 'Hurls an explosive sphere of concentrated arcane flame detonating on impact.',
      provenance: 'skill:pyromancy',
    });

    this.registerCapability({
      id: 'cap_analyze',
      name: 'Analyze Essence',
      category: 'Perception',
      activationMode: 'immediate',
      powerTier: 'Minor',
      baseEnergyCost: 4,
      baseStrainCost: 0,
      minVesselCapacityRequired: 10,
      description: 'Focuses deep metaphysical perception on an entity to discern its canonical state within epistemic boundaries.',
      provenance: 'skill:divination',
    });

    this.registerCapability({
      id: 'cap_light',
      name: 'Guiding Light',
      category: 'Magic',
      activationMode: 'immediate',
      powerTier: 'Minor',
      baseEnergyCost: 2,
      baseStrainCost: 0,
      minVesselCapacityRequired: 5,
      description: 'Emits a sustained radiant aura that illuminates darkened corridors.',
      provenance: 'equipment:def_ring_light',
    });

    // Seed capability graph
    this.capabilityGraph.set('cap_world_darkness', {
      capabilityId: 'cap_world_darkness',
      name: 'World-Enveloping Darkness',
      derivedSkills: ['skill_eclipse_curtain', 'skill_void_pulse'],
      prerequisites: [],
      transformsInto: ['cap_true_form_oblivion'],
    });

    this.capabilityGraph.set('cap_shadow_step', {
      capabilityId: 'cap_shadow_step',
      name: 'Shadow Step',
      derivedSkills: ['skill_umbral_blade', 'skill_shadow_veil'],
      prerequisites: [],
    });

    this.capabilityGraph.set('cap_fireball', {
      capabilityId: 'cap_fireball',
      name: 'Fireball',
      derivedSkills: ['skill_flame_burst', 'skill_scorch_wave'],
      prerequisites: [],
    });
  }

  public seedStarterPowerStateForActor(actorId: string): PowerState {
    const existing = this.powerStates.get(actorId);
    if (existing) {
      this.initActorSkillInstances(actorId);
      return JSON.parse(JSON.stringify(existing));
    }
    const starterState: PowerState = {
      originId: 'origin_scribe_vael',
      originTier: 'Grounded',
      currentFormId: 'form_human',
      vesselType: 'mortal_human',
      vesselCapacity: 40,
      sealState: 'partial',
      sealStrength: 25,
      powerAccessLevel: 0.4,
      trueFormAccess: false,
      healthCurrent: 50,
      healthMax: 50,
      fatigue: 0,
      stress: 0,
      magicalEnergy: 80,
      physicalStrain: 0,
      activeConditions: [],
    };
    this.powerStates.set(actorId, starterState);
    this.initActorSkillInstances(actorId);
    return JSON.parse(JSON.stringify(starterState));
  }

  /**
   * Initializes starter skill instances for an actor if not yet present.
   * Ensures every actor has their own independently mutable SkillInstances.
   */
  public initActorSkillInstances(actorId: string): void {
    if (this.actorSkillInstances.has(actorId)) {
      return;
    }
    const instanceMap = new Map<string, SkillInstance>();
    const learnedSet = new Set<string>();

    const starterCaps = ['cap_venomous_bite', 'cap_shadow_step', 'cap_fireball', 'cap_analyze'];
    for (const capId of starterCaps) {
      if (this.capabilities.has(capId)) {
        const instance: SkillInstance = {
          instanceId: `inst_${actorId}_${capId}`,
          actorId,
          capabilityId: capId,
          currentLevel: 1,
          currentXp: 0,
          xpToNextLevel: 100,
          evolutionPoints: 0,
          evolutionLineage: [capId],
          progressionHistory: [
            {
              entryIndex: 0,
              timestampSeconds: 0,
              changeType: 'ACQUIRED',
              details: 'Starter endowment',
              newLevel: 1,
              newXp: 0,
            },
          ],
          unlockedAtSeconds: 0,
        };
        instanceMap.set(capId, instance);
        learnedSet.add(capId);
      }
    }

    this.actorSkillInstances.set(actorId, instanceMap);
    this.actorLearnedCapabilities.set(actorId, learnedSet);
  }

  public registerCapability(cap: CapabilityDefinition): void {
    this.capabilities.set(cap.id, cap);
  }

  public setPowerState(actorId: string, state: PowerState): void {
    this.powerStates.set(actorId, { ...state });
  }

  public getPowerState(actorId: string): PowerState | undefined {
    const s = this.powerStates.get(actorId);
    return s ? JSON.parse(JSON.stringify(s)) : undefined;
  }

  /**
   * Acquires a capability for an actor, creating a new, isolated SkillInstance.
   * DreamBook §§V10.5.5, V10.5.8.
   */
  public acquireSkill(
    actorId: string,
    capabilityId: string,
    options?: {
      worldRules?: WorldProgressionPolicy;
      libraryProvenance?: {
        libraryEntryId?: string;
        libraryStatus?: 'NATIVE' | 'REUSED' | 'APPROVED';
        sourceStoryIds?: string[];
      };
      initialLevel?: number;
      initialXp?: number;
      evolutionPoints?: number;
      lineage?: string[];
    }
  ): SkillInstance {
    const policy = options?.worldRules || this.progressionPolicy;
    if (policy.acquisitionAllowed === false) {
      throw new Error(`Skill acquisition is forbidden by target world progression policy.`);
    }

    const cap = this.capabilities.get(capabilityId);
    if (!cap) {
      throw new Error(`Cannot acquire unknown capability '${capabilityId}'.`);
    }

    if (!this.powerStates.has(actorId)) {
      this.seedStarterPowerStateForActor(actorId);
    }

    let instanceMap = this.actorSkillInstances.get(actorId);
    if (!instanceMap) {
      this.initActorSkillInstances(actorId);
      instanceMap = this.actorSkillInstances.get(actorId)!;
    }

    const existing = instanceMap.get(capabilityId);
    if (existing) {
      return JSON.parse(JSON.stringify(existing));
    }

    const currentLevel = options?.initialLevel ?? 1;
    const currentXp = options?.initialXp ?? 0;
    const xpToNext = policy.calcXpToNext ? policy.calcXpToNext(currentLevel) : 100;

    const newInstance: SkillInstance = {
      instanceId: `inst_${actorId}_${capabilityId}`,
      actorId,
      capabilityId,
      currentLevel,
      currentXp,
      xpToNextLevel: xpToNext,
      evolutionPoints: options?.evolutionPoints ?? 0,
      evolutionLineage: options?.lineage && options.lineage.length > 0 ? [...options.lineage] : [capabilityId],
      progressionHistory: [
        {
          entryIndex: 0,
          timestampSeconds: 0,
          changeType: 'ACQUIRED',
          details: options?.libraryProvenance?.libraryEntryId
            ? `Acquired via reusable library entry ${options.libraryProvenance.libraryEntryId}`
            : 'Acquired into actor progression',
          newLevel: currentLevel,
          newXp: currentXp,
        },
      ],
      unlockedAtSeconds: 0,
      libraryEntryId: options?.libraryProvenance?.libraryEntryId,
      libraryStatus: options?.libraryProvenance?.libraryStatus || 'NATIVE',
      librarySourceStoryIds: options?.libraryProvenance?.sourceStoryIds ? [...options.libraryProvenance.sourceStoryIds] : undefined,
    };

    instanceMap.set(capabilityId, newInstance);

    // Synchronize legacy learned capabilities set
    let learnedSet = this.actorLearnedCapabilities.get(actorId);
    if (!learnedSet) {
      learnedSet = new Set();
      this.actorLearnedCapabilities.set(actorId, learnedSet);
    }
    learnedSet.add(capabilityId);

    return JSON.parse(JSON.stringify(newInstance));
  }

  /**
   * Awards progression XP to a SkillInstance according to target world policy.
   * Handles level-ups and evolution point accrual.
   */
  public awardSkillXp(
    actorId: string,
    capabilityId: string,
    xpAmount: number,
    policyOrReason?: WorldProgressionPolicy | string,
    explicitReason?: string
  ): { instance: SkillInstance; leveledUp: boolean; evolutionsAvailable?: string[] } {
    let policy: WorldProgressionPolicy = this.progressionPolicy;
    let reason = 'Manual progression award';

    if (typeof policyOrReason === 'string') {
      reason = policyOrReason;
    } else if (typeof policyOrReason === 'object' && policyOrReason !== null) {
      policy = policyOrReason;
      if (explicitReason) {
        reason = explicitReason;
      }
    } else if (explicitReason) {
      reason = explicitReason;
    }

    let instanceMap = this.actorSkillInstances.get(actorId);
    if (!instanceMap) {
      this.initActorSkillInstances(actorId);
      instanceMap = this.actorSkillInstances.get(actorId)!;
    }

    let instance = instanceMap.get(capabilityId);
    if (!instance) {
      // Auto-acquire if known
      instance = this.acquireSkill(actorId, capabilityId, { worldRules: policy });
    }

    if (policy.progressionAllowed === false) {
      return { instance: JSON.parse(JSON.stringify(instance)), leveledUp: false };
    }

    const prevLevel = instance.currentLevel;
    const prevXp = instance.currentXp;
    instance.currentXp += xpAmount;

    let leveledUp = false;
    const maxLevel = policy.maxLevel ?? 10;

    while (
      instance.xpToNextLevel !== null &&
      instance.currentXp >= instance.xpToNextLevel &&
      instance.currentLevel < maxLevel
    ) {
      instance.currentXp -= instance.xpToNextLevel;
      instance.currentLevel += 1;
      instance.evolutionPoints += 1;
      leveledUp = true;
      instance.xpToNextLevel = policy.calcXpToNext ? policy.calcXpToNext(instance.currentLevel) : instance.currentLevel * 100;
    }

    if (instance.currentLevel >= maxLevel) {
      instance.xpToNextLevel = null;
    }

    const historyEntry: ProgressionHistoryEntry = {
      entryIndex: instance.progressionHistory.length,
      timestampSeconds: 0,
      changeType: leveledUp ? 'LEVEL_UP' : 'XP_AWARDED',
      details: leveledUp
        ? `${reason}: Leveled up to ${instance.currentLevel} (+${xpAmount} XP)`
        : `${reason}: Awarded ${xpAmount} XP`,
      prevLevel,
      newLevel: instance.currentLevel,
      prevXp,
      newXp: instance.currentXp,
    };
    instance.progressionHistory.push(historyEntry);

    const graphNode = this.capabilityGraph.get(capabilityId);
    const evolutionsAvailable = graphNode ? graphNode.transformsInto || graphNode.derivedSkills : [];

    return {
      instance: JSON.parse(JSON.stringify(instance)),
      leveledUp,
      evolutionsAvailable,
    };
  }

  /**
   * Evolves an existing SkillInstance into a target capability.
   * Preserves progression history and lineage; never mutates base definitions.
   */
  public evolveSkill(
    actorId: string,
    currentCapabilityId: string,
    targetCapabilityId: string,
    policyOrReason?: WorldProgressionPolicy | string,
    explicitReason?: string
  ): SkillInstance {
    let policy: WorldProgressionPolicy = this.progressionPolicy;
    let reason = 'Skill evolution';

    if (typeof policyOrReason === 'string') {
      reason = policyOrReason;
    } else if (typeof policyOrReason === 'object' && policyOrReason !== null) {
      policy = policyOrReason;
      if (explicitReason) {
        reason = explicitReason;
      }
    } else if (explicitReason) {
      reason = explicitReason;
    }

    if (policy.evolutionAllowed === false) {
      throw new Error('Skill evolution is forbidden by world progression policy.');
    }

    const targetCap = this.capabilities.get(targetCapabilityId);
    if (!targetCap) {
      throw new Error(`Target evolution capability '${targetCapabilityId}' does not exist.`);
    }

    let instanceMap = this.actorSkillInstances.get(actorId);
    if (!instanceMap) {
      this.initActorSkillInstances(actorId);
      instanceMap = this.actorSkillInstances.get(actorId)!;
    }

    const currentInstance = instanceMap.get(currentCapabilityId);
    if (!currentInstance) {
      throw new Error(`Actor '${actorId}' does not possess '${currentCapabilityId}' to evolve.`);
    }

    // Remove old capability link
    instanceMap.delete(currentCapabilityId);
    const learnedSet = this.actorLearnedCapabilities.get(actorId);
    if (learnedSet) {
      learnedSet.delete(currentCapabilityId);
      learnedSet.add(targetCapabilityId);
    }

    // Update instance with preserved lineage and history
    currentInstance.capabilityId = targetCapabilityId;
    currentInstance.evolutionLineage.push(targetCapabilityId);
    currentInstance.progressionHistory.push({
      entryIndex: currentInstance.progressionHistory.length,
      timestampSeconds: 0,
      changeType: 'EVOLVED',
      details: `${reason}: Evolved from ${currentCapabilityId} to ${targetCapabilityId}`,
      prevLevel: currentInstance.currentLevel,
      newLevel: currentInstance.currentLevel,
    });

    instanceMap.set(targetCapabilityId, currentInstance);
    return JSON.parse(JSON.stringify(currentInstance));
  }

  /**
   * Downgrades a SkillInstance level or evolution state.
   */
  public downgradeSkill(
    actorId: string,
    capabilityId: string,
    targetLevelOrPolicy: number | WorldProgressionPolicy = 1,
    reasonOrPolicy: string | WorldProgressionPolicy = 'Manual downgrade',
    explicitPolicy?: WorldProgressionPolicy
  ): SkillInstance {
    const policy =
      explicitPolicy ||
      (typeof targetLevelOrPolicy === 'object'
        ? targetLevelOrPolicy
        : typeof reasonOrPolicy === 'object'
        ? reasonOrPolicy
        : this.progressionPolicy);

    if (policy.progressionAllowed === false) {
      throw new Error('Progression modification is forbidden by world progression policy.');
    }

    const instanceMap = this.actorSkillInstances.get(actorId);
    const instance = instanceMap?.get(capabilityId);
    if (!instance) {
      throw new Error(`Actor '${actorId}' does not possess '${capabilityId}'.`);
    }

    const prevLevel = instance.currentLevel;
    const targetLevel = typeof targetLevelOrPolicy === 'number' ? Math.max(1, targetLevelOrPolicy) : Math.max(1, prevLevel - 1);
    const reason = typeof reasonOrPolicy === 'string' ? reasonOrPolicy : 'Manual downgrade';

    if (targetLevel < prevLevel) {
      instance.currentLevel = targetLevel;
      instance.progressionHistory.push({
        entryIndex: instance.progressionHistory.length,
        timestampSeconds: 0,
        changeType: 'DOWNGRADED',
        details: `${reason}: Downgraded from level ${prevLevel} to ${instance.currentLevel}`,
        prevLevel,
        newLevel: instance.currentLevel,
      });
    }

    return JSON.parse(JSON.stringify(instance));
  }

  /**
   * Relearns or re-anchors a skill instance.
   */
  public relearnSkill(
    actorId: string,
    capabilityId: string,
    reasonOrPolicy: string | WorldProgressionPolicy = 'Relearned skill',
    explicitPolicy?: WorldProgressionPolicy
  ): SkillInstance {
    const policy =
      explicitPolicy ||
      (typeof reasonOrPolicy === 'object' ? reasonOrPolicy : this.progressionPolicy);
    const reason = typeof reasonOrPolicy === 'string' ? reasonOrPolicy : 'Relearned skill';

    const instanceMap = this.actorSkillInstances.get(actorId);
    const instance = instanceMap?.get(capabilityId);
    if (!instance) {
      return this.acquireSkill(actorId, capabilityId, { worldRules: policy });
    }

    instance.progressionHistory.push({
      entryIndex: instance.progressionHistory.length,
      timestampSeconds: 0,
      changeType: 'RELEARNED',
      details: reason,
      newLevel: instance.currentLevel,
      newXp: instance.currentXp,
    });

    return JSON.parse(JSON.stringify(instance));
  }

  public getSkillInstance(actorId: string, capabilityId: string): SkillInstance | undefined {
    let instanceMap = this.actorSkillInstances.get(actorId);
    if (!instanceMap) {
      this.initActorSkillInstances(actorId);
      instanceMap = this.actorSkillInstances.get(actorId);
    }
    const inst = instanceMap?.get(capabilityId);
    return inst ? JSON.parse(JSON.stringify(inst)) : undefined;
  }

  public getActorSkillInstances(actorId: string): SkillInstance[] {
    let instanceMap = this.actorSkillInstances.get(actorId);
    if (!instanceMap) {
      this.initActorSkillInstances(actorId);
      instanceMap = this.actorSkillInstances.get(actorId);
    }
    if (!instanceMap) return [];
    return Array.from(instanceMap.values()).map((inst) => JSON.parse(JSON.stringify(inst)));
  }

  public getAllSkillInstances(actorId: string): SkillInstance[] {
    return this.getActorSkillInstances(actorId);
  }

  public registerSkillInstance(actorId: string, instance: SkillInstance): void {
    let instanceMap = this.actorSkillInstances.get(actorId);
    if (!instanceMap) {
      instanceMap = new Map();
      this.actorSkillInstances.set(actorId, instanceMap);
    }
    instanceMap.set(instance.capabilityId, JSON.parse(JSON.stringify(instance)));

    let learnedSet = this.actorLearnedCapabilities.get(actorId);
    if (!learnedSet) {
      learnedSet = new Set();
      this.actorLearnedCapabilities.set(actorId, learnedSet);
    }
    learnedSet.add(instance.capabilityId);
  }

  public learnCapability(actorId: string, capabilityId: string): void {
    this.acquireSkill(actorId, capabilityId);
  }

  public unlearnCapability(actorId: string, capabilityId: string): void {
    const instanceMap = this.actorSkillInstances.get(actorId);
    if (instanceMap) {
      instanceMap.delete(capabilityId);
    }
    const set = this.actorLearnedCapabilities.get(actorId);
    if (set) {
      set.delete(capabilityId);
    }
  }

  public hasLearnedCapability(actorId: string, capabilityId: string): boolean {
    const instanceMap = this.actorSkillInstances.get(actorId);
    if (instanceMap) {
      return instanceMap.has(capabilityId);
    }
    const set = this.actorLearnedCapabilities.get(actorId);
    if (set) {
      return set.has(capabilityId);
    }
    const cap = this.capabilities.get(capabilityId);
    return Boolean(cap && !cap.provenance.startsWith('equipment:'));
  }

  public getActorCapabilities(actorId: string): CapabilityDefinition[] {
    const power = this.powerStates.get(actorId);
    if (!power) {
      return [];
    }
    const set = this.actorLearnedCapabilities.get(actorId);
    if (set) {
      return Array.from(set)
        .map((id) => this.capabilities.get(id))
        .filter((cap): cap is CapabilityDefinition => Boolean(cap && cap.minVesselCapacityRequired <= power.vesselCapacity));
    }
    return Array.from(this.capabilities.values()).filter(
      (cap) => !cap.provenance.startsWith('equipment:') && cap.minVesselCapacityRequired <= power.vesselCapacity
    );
  }

  /**
   * CH3.2 Effective Actor Capabilities Resolver
   * Merges innate/learned capabilities with active, non-broken equipped item grants.
   * Tracks full provenance per capability with zero duplication and zero mutation.
   */
  public getEffectiveActorCapabilities(
    actorId: string,
    inventoryEngine?: import('./inventoryItem').InventoryItemEngine
  ): EffectiveCapability[] {
    const power = this.powerStates.get(actorId);
    if (!power) {
      return [];
    }

    const effectiveMap = new Map<string, EffectiveCapability>();

    // 1. Resolve Innate / Learned Capabilities
    const baseCaps = this.getActorCapabilities(actorId);
    for (const cap of baseCaps) {
      let sourceType: CapabilitySourceType = 'LEARNED';
      if (cap.provenance.startsWith('origin:')) sourceType = 'ORIGIN';
      else if (cap.provenance === 'starter_trait' || cap.provenance.startsWith('trait:')) sourceType = 'TRAIT';

      effectiveMap.set(cap.id, {
        ...cap,
        sources: [
          {
            type: sourceType,
            provenance: cap.provenance,
          },
        ],
        isEquippedItemGrant: false,
        isLearned: true,
        skillInstance: this.getSkillInstance(actorId, cap.id),
      });
    }

    // 2. Resolve Equipment-Granted Capabilities
    if (inventoryEngine) {
      const paperDoll = inventoryEngine.getActorPaperDoll(actorId);
      const equippedItems: import('./inventoryItem').ItemInstance[] = Object.values(paperDoll).filter(
        (item): item is import('./inventoryItem').ItemInstance =>
          Boolean(item && !item.isBroken && (item.durability === undefined || item.durability > 0))
      );

      for (const item of equippedItems) {
        const def = inventoryEngine.getItemDefinition(item.defId);
        if (def && Array.isArray(def.grantedCapabilities) && def.grantedCapabilities.length > 0) {
          for (const capId of def.grantedCapabilities) {
            const capDef = this.capabilities.get(capId);
            if (capDef && capDef.minVesselCapacityRequired <= power.vesselCapacity) {
              const sourceRecord: CapabilitySourceRecord = {
                type: 'EQUIPMENT',
                itemDefId: def.id,
                itemInstanceId: item.id,
                itemName: item.name,
                slot: item.equippedSlot || undefined,
                provenance: `item:${def.id}:${item.id}`,
              };

              const existing = effectiveMap.get(capId);
              if (existing) {
                // Dual source or multi-item grant: merge into single canonical capability entry
                existing.sources.push(sourceRecord);
                existing.isEquippedItemGrant = true;
              } else {
                effectiveMap.set(capId, {
                  ...capDef,
                  sources: [sourceRecord],
                  isEquippedItemGrant: true,
                  isLearned: false,
                });
              }
            }
          }
        }
      }
    }

    return Array.from(effectiveMap.values());
  }

  public getCapability(id: string): CapabilityDefinition | undefined {
    return this.capabilities.get(id);
  }

  public getAllCapabilities(): CapabilityDefinition[] {
    return Array.from(this.capabilities.values());
  }

  public getCapabilityGraph(): CapabilityGraphNode[] {
    return Array.from(this.capabilityGraph.values());
  }

  public exportState(): {
    capabilities: CapabilityDefinition[];
    powerStates: Record<string, PowerState>;
    capabilityGraph: CapabilityGraphNode[];
    actorLearnedCapabilities?: Record<string, string[]>;
    skillInstances?: Record<string, SkillInstance[]>;
    synthesisCounter?: number;
    progressionPolicy?: WorldProgressionPolicy;
  } {
    const powerStatesRecord: Record<string, PowerState> = {};
    for (const [id, s] of this.powerStates.entries()) {
      powerStatesRecord[id] = JSON.parse(JSON.stringify(s));
    }
    const learnedRecord: Record<string, string[]> = {};
    for (const [id, set] of this.actorLearnedCapabilities.entries()) {
      learnedRecord[id] = Array.from(set);
    }
    const skillInstancesRecord: Record<string, SkillInstance[]> = {};
    for (const [actorId, map] of this.actorSkillInstances.entries()) {
      skillInstancesRecord[actorId] = Array.from(map.values()).map((inst) => JSON.parse(JSON.stringify(inst)));
    }
    return {
      capabilities: Array.from(this.capabilities.values()),
      powerStates: powerStatesRecord,
      capabilityGraph: Array.from(this.capabilityGraph.values()),
      actorLearnedCapabilities: learnedRecord,
      skillInstances: skillInstancesRecord,
      synthesisCounter: this.synthesisCounter,
      progressionPolicy: {
        progressionAllowed: this.progressionPolicy.progressionAllowed,
        evolutionAllowed: this.progressionPolicy.evolutionAllowed,
        acquisitionAllowed: this.progressionPolicy.acquisitionAllowed,
        progressionTransferAllowed: this.progressionPolicy.progressionTransferAllowed,
        maxLevel: this.progressionPolicy.maxLevel,
      },
    };
  }

  public importState(state: {
    capabilities?: CapabilityDefinition[];
    powerStates?: Record<string, PowerState>;
    capabilityGraph?: CapabilityGraphNode[];
    actorLearnedCapabilities?: Record<string, string[]>;
    skillInstances?: Record<string, SkillInstance[]>;
    synthesisCounter?: number;
    progressionPolicy?: WorldProgressionPolicy;
  }): void {
    if (state.progressionPolicy) {
      this.progressionPolicy = {
        ...DEFAULT_PROGRESSION_POLICY,
        ...state.progressionPolicy,
      };
    }
    if (state.capabilities) {
      for (const cap of state.capabilities) {
        this.capabilities.set(cap.id, cap);
      }
    }
    if (state.powerStates) {
      for (const [actorId, pState] of Object.entries(state.powerStates)) {
        this.powerStates.set(actorId, JSON.parse(JSON.stringify(pState)));
      }
    }
    if (state.capabilityGraph) {
      for (const node of state.capabilityGraph) {
        this.capabilityGraph.set(node.capabilityId, node);
      }
    }
    if (state.skillInstances) {
      for (const [actorId, list] of Object.entries(state.skillInstances)) {
        const map = new Map<string, SkillInstance>();
        const learnedSet = new Set<string>();
        for (const inst of list) {
          map.set(inst.capabilityId, JSON.parse(JSON.stringify(inst)));
          learnedSet.add(inst.capabilityId);
        }
        this.actorSkillInstances.set(actorId, map);
        this.actorLearnedCapabilities.set(actorId, learnedSet);
      }
    } else if (state.actorLearnedCapabilities) {
      // Automatic backward compatibility migration: legacy archives without SkillInstances
      for (const [actorId, list] of Object.entries(state.actorLearnedCapabilities)) {
        const map = new Map<string, SkillInstance>();
        const learnedSet = new Set<string>(list);
        for (const capId of list) {
          map.set(capId, {
            instanceId: `inst_${actorId}_${capId}`,
            actorId,
            capabilityId: capId,
            currentLevel: 1,
            currentXp: 0,
            xpToNextLevel: 100,
            evolutionPoints: 0,
            evolutionLineage: [capId],
            progressionHistory: [
              {
                entryIndex: 0,
                timestampSeconds: 0,
                changeType: 'ACQUIRED',
                details: 'Migrated from legacy learned capability archive',
                newLevel: 1,
                newXp: 0,
              },
            ],
            unlockedAtSeconds: 0,
          });
        }
        this.actorSkillInstances.set(actorId, map);
        this.actorLearnedCapabilities.set(actorId, learnedSet);
      }
    }

    // CH7.CANONICAL.IDENTITY: restore and reconcile synthesis counter to guarantee collision safety
    if (state.synthesisCounter !== undefined && typeof state.synthesisCounter === 'number') {
      this.synthesisCounter = state.synthesisCounter;
    }
    for (const capId of this.capabilities.keys()) {
      const match = capId.match(/^cap_synth_(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > this.synthesisCounter) {
          this.synthesisCounter = num;
        }
      }
    }
  }

  /**
   * Evaluates capability execution eligibility and execution check requirements
   * (DreamBook §§V10.8.5, V10.8.9 - Cases A, B, C)
   * Separates execution eligibility from execution check requirements and downstream effects.
   */
  public evaluateExecutionGate(proposal: ExecutionGateProposal): ExecutionGateResult {
    const cap = this.capabilities.get(proposal.capabilityId);
    if (!cap) {
      return {
        status: 'ELIGIBILITY_BLOCKED',
        eligible: false,
        requiresCheck: false,
        rejectionReason: `Capability ${proposal.capabilityId} is not in canonical registry.`,
        environmentalModifiers: [],
        actorConditionModifiers: [],
        executionNotes: 'Rejected: capability definition missing.',
      };
    }

    const power = this.getPowerState(proposal.actorId);
    if (!power) {
      return {
        status: 'ELIGIBILITY_BLOCKED',
        eligible: false,
        requiresCheck: false,
        rejectionReason: `Actor ${proposal.actorId} has no established PowerState.`,
        environmentalModifiers: [],
        actorConditionModifiers: [],
        executionNotes: 'Rejected: unanchored actor.',
      };
    }

    if (power.sealState === 'absolute') {
      return {
        status: 'ELIGIBILITY_BLOCKED',
        eligible: false,
        requiresCheck: false,
        rejectionReason: 'Absolute seal prevents invoking primordial powers.',
        environmentalModifiers: [],
        actorConditionModifiers: [],
        executionNotes: 'Rejected: absolute seal active.',
      };
    }

    const envMods: string[] = [];
    const condMods: string[] = [];

    // Actor condition checks
    const activeConds = proposal.actorConditions || power.activeConditions || [];
    for (const cond of activeConds) {
      if (['severe_wound', 'concussion', 'stunned', 'blinded', 'vessel_strain', 'fatigued'].includes(cond)) {
        condMods.push(cond);
      }
    }

    // Evaluate actor vessel capacity constraints (DreamBook §V10.8.5, §388–§393)
    if (cap.minVesselCapacityRequired > power.vesselCapacity) {
      if (power.vesselType === 'mortal_human' && cap.powerTier === 'WorldScale' && power.originTier !== 'Grounded') {
        // Mortal vessel channeling higher/primordial power incurs overload execution check rather than hard block
        if (!condMods.includes('vessel_strain')) {
          condMods.push('vessel_strain');
        }
      } else {
        return {
          status: 'ELIGIBILITY_BLOCKED',
          eligible: false,
          requiresCheck: false,
          rejectionReason: `Insufficient vessel capacity: requires ${cap.minVesselCapacityRequired}, actor has ${power.vesselCapacity}.`,
          environmentalModifiers: [],
          actorConditionModifiers: [],
          executionNotes: 'Rejected: insufficient vessel capacity.',
        };
      }
    }

    // Determine mastery level
    let masteryLevel = 1;
    if (proposal.masteryOverride !== undefined) {
      masteryLevel = proposal.masteryOverride;
    } else if (proposal.roleOrBackground) {
      const roleLower = proposal.roleOrBackground.toLowerCase();
      if (roleLower.includes('archmage') || roleLower.includes('grandmaster')) {
        masteryLevel = 5;
      } else if (roleLower.includes('master') || roleLower.includes('adept')) {
        masteryLevel = 4;
      } else if (roleLower.includes('apprentice') || roleLower.includes('novice')) {
        masteryLevel = 1;
      }
    } else {
      const inst = this.getSkillInstance(proposal.actorId, proposal.capabilityId);
      if (inst) {
        masteryLevel = inst.currentLevel;
      }
    }

    // Environmental checks
    if (proposal.environment) {
      if (proposal.environment.conditions) {
        for (const cond of proposal.environment.conditions) {
          if (['distorted_magic', 'magical_suppression', 'null_magic_field', 'leyline_surge'].includes(cond)) {
            envMods.push(cond);
          }
        }
      }
      if (proposal.environment.distortionLevel && proposal.environment.distortionLevel > 0) {
        if (!envMods.includes('distorted_magic')) {
          envMods.push('distorted_magic');
        }
      }
      if (proposal.environment.isSuppressed) {
        if (!envMods.includes('magical_suppression')) {
          envMods.push('magical_suppression');
        }
      }
    }

    // Execution Gate Rules:
    // Case C: High mastery (e.g. Archmage) in abnormal/distorted environment
    // Mastery alone does NOT bypass abnormal environmental conditions!
    if (envMods.length > 0) {
      const distortion = proposal.environment?.distortionLevel ?? 5;
      return {
        status: 'EXECUTION_CHECK_REQUIRED',
        eligible: true,
        requiresCheck: true,
        checkDifficulty: 12 + distortion,
        masteryLevel,
        environmentalModifiers: envMods,
        actorConditionModifiers: condMods,
        executionNotes: `Environmental distortion (${envMods.join(', ')}) forces execution check despite mastery level ${masteryLevel}.`,
      };
    }

    // Significant actor impairment
    if (condMods.includes('concussion') || condMods.includes('stunned') || condMods.includes('severe_wound')) {
      return {
        status: 'EXECUTION_CHECK_REQUIRED',
        eligible: true,
        requiresCheck: true,
        checkDifficulty: 14,
        masteryLevel,
        environmentalModifiers: envMods,
        actorConditionModifiers: condMods,
        executionNotes: `Physical/mental impairment (${condMods.join(', ')}) requires execution concentration check.`,
      };
    }

    // Case B: Mastered capability (level >= 3 or archmage) in normal conditions
    if (masteryLevel >= 3) {
      return {
        status: 'AUTOMATIC_SUCCESS',
        eligible: true,
        requiresCheck: false,
        masteryLevel,
        environmentalModifiers: envMods,
        actorConditionModifiers: condMods,
        executionNotes: `Mastery level ${masteryLevel} meets automatic execution threshold under standard conditions.`,
      };
    }

    // Case A: Apprentice / novice (mastery < 3) in normal conditions
    return {
      status: 'EXECUTION_CHECK_REQUIRED',
      eligible: true,
      requiresCheck: true,
      checkDifficulty: 10 + (cap.powerTier === 'Major' ? 5 : cap.powerTier === 'WorldScale' ? 10 : 2),
      masteryLevel,
      environmentalModifiers: envMods,
      actorConditionModifiers: condMods,
      executionNotes: `Apprentice/novice mastery level ${masteryLevel} requires standard execution check.`,
    };
  }

  /**
   * Deterministically adjudicates capability execution per DreamBook §388–§393 (V10.0, V10.7 Exemplar)
   * Supports action-time contextual modifiers (Phase E) and evaluates execution gates (Phase D).
   * Base CapabilityDefinitions are NEVER mutated.
   */
  public adjudicate(proposal: AdjudicationProposal): ApprovedConsequence {
    const power = this.powerStates.get(proposal.actorId);
    if (!power) {
      return {
        approved: false,
        rejectionReason: `Actor ${proposal.actorId} has no established PowerState.`,
        hpDelta: 0,
        energyDelta: 0,
        strainDelta: 0,
        appliedConditions: [],
        emittedObservation: { visibleToNearby: false, sensoryDescription: '' },
        narrativeDirective: 'Action failed: unanchored capability entity.',
      };
    }

    const cap = this.capabilities.get(proposal.intendedCapabilityId);
    if (!cap) {
      return {
        approved: false,
        rejectionReason: `Capability ${proposal.intendedCapabilityId} is not in the canonical registry.`,
        hpDelta: 0,
        energyDelta: 0,
        strainDelta: 0,
        appliedConditions: [],
        emittedObservation: { visibleToNearby: false, sensoryDescription: '' },
        narrativeDirective: 'Action failed: unregistered ability.',
      };
    }

    // Snapshot base definition to mathematically guarantee zero mutation
    const definitionSnapshotBefore = JSON.stringify(cap);

    // Evaluate Execution Gate (Phase D)
    const gateResult = this.evaluateExecutionGate({
      actorId: proposal.actorId,
      capabilityId: proposal.intendedCapabilityId,
      environment: proposal.environment,
      actorConditions: proposal.actorConditions,
      roleOrBackground: proposal.roleOrBackground,
      modifiers: proposal.modifiers,
    });

    if (gateResult.status === 'ELIGIBILITY_BLOCKED') {
      return {
        approved: false,
        rejectionReason: gateResult.rejectionReason || 'Capability execution eligibility blocked.',
        hpDelta: 0,
        energyDelta: 0,
        strainDelta: 0,
        appliedConditions: [],
        emittedObservation: {
          visibleToNearby: true,
          sensoryDescription: power.sealState === 'absolute'
            ? 'A faint ripple of darkness flared then abruptly shattered against binding golden glyphs.'
            : 'Invocation failed to manifest.',
        },
        narrativeDirective: power.sealState === 'absolute'
          ? 'The seal rejected the action completely; runes flamed violently.'
          : 'Execution blocked by eligibility gate.',
        executionGate: gateResult,
      };
    }

    // Evaluate Action-Time Contextual Modifiers (Phase E)
    let modifierEnergyCostDelta = 0;
    let modifierStrainCostDelta = 0;
    let modifierHpCostDelta = 0;
    const appliedModifiers: CapabilityModifier[] = [];

    if (proposal.modifiers && proposal.modifiers.length > 0) {
      for (const mod of proposal.modifiers) {
        modifierEnergyCostDelta += mod.energyCostDelta || 0;
        modifierStrainCostDelta += mod.strainCostDelta || 0;
        if (mod.hpCostDelta) {
          modifierHpCostDelta += mod.hpCostDelta;
        }
        appliedModifiers.push({ ...mod });
      }
    }

    // Evaluate Vessel Capacity Overload (DreamBook §390–§391)
    const isMortalVessel = power.vesselType === 'mortal_human';
    const isWorldScale = proposal.requestedScale === 'WorldScale' || cap.powerTier === 'WorldScale';

    let hpCost = modifierHpCostDelta;
    let strainCost = cap.baseStrainCost + modifierStrainCostDelta;
    let energyCost = cap.baseEnergyCost + modifierEnergyCostDelta;
    const appliedConditions: string[] = [];

    if (isWorldScale && isMortalVessel) {
      // Overload penalty: vessel cannot safely channel world-scale power without severe physical cost
      const capacityDeficit = Math.max(0, cap.minVesselCapacityRequired - power.vesselCapacity);
      hpCost += Math.min(power.healthCurrent - 1, Math.max(5, Math.floor(capacityDeficit / 4))); // Never drops below 1 HP automatically
      strainCost += 20;
      energyCost += 15;
      appliedConditions.push('vessel_strain', 'nosebleed');
    }

    // Deduct state deterministically
    power.healthCurrent = Math.max(1, power.healthCurrent - hpCost);
    power.magicalEnergy = Math.max(0, power.magicalEnergy - energyCost);
    power.physicalStrain += strainCost;
    power.fatigue = Math.min(100, power.fatigue + 10);
    for (const cond of appliedConditions) {
      if (!power.activeConditions.includes(cond)) {
        power.activeConditions.push(cond);
      }
    }

    // Verify base capability definition was NOT mutated during adjudication
    const definitionSnapshotAfter = JSON.stringify(this.capabilities.get(proposal.intendedCapabilityId));
    if (definitionSnapshotBefore !== definitionSnapshotAfter) {
      throw new Error('FATAL: Base CapabilityDefinition mutated during adjudication!');
    }

    const modifierDescription = appliedModifiers.length > 0
      ? ` with modifiers [${appliedModifiers.map((m) => m.name).join(', ')}]`
      : '';

    return {
      approved: true,
      hpDelta: -hpCost,
      energyDelta: -energyCost,
      strainDelta: strainCost,
      appliedConditions,
      emittedObservation: {
        visibleToNearby: true,
        sensoryDescription: isWorldScale
          ? 'Sky turned void-black as shadows swept outward across the horizon; blood dripped from the caster\'s nose under intense vessel strain.'
          : `${cap.name}${modifierDescription} manifested with a sudden pulse of force.`,
      },
      narrativeDirective: `Approved: ${cap.name}${modifierDescription} manifested. Cost: ${hpCost} HP, +${strainCost} physical strain. Vessel strain visible.`,
      executionGate: gateResult,
      appliedModifiers: appliedModifiers.length > 0 ? appliedModifiers : undefined,
    };
  }

  /**
   * Helper: Deterministically infer category, activation mode, and structured mechanics from concept tags.
   * Enforces strict schema enums and precedence rules. (CH7 / DreamBook §394.1, §V10.5.5, §V10.8.6)
   */
  public inferStructuredMechanics(tags: string[]): {
    category: 'Combat' | 'Magic' | 'Movement' | 'Domain' | 'Perception' | 'Biological' | 'Social';
    activationMode: CapabilityActivationMode;
    targetType: 'single_target' | 'self' | 'area_of_effect' | 'all_allies' | 'all_enemies';
    rangeScope: 'melee' | 'close' | 'ranged' | 'realm' | 'global';
    actionType: 'action' | 'bonus_action' | 'reaction' | 'free';
  } {
    const normalized = tags.map((t) => t.toLowerCase().trim());

    // Category Inference with strict deterministic precedence
    let category: 'Combat' | 'Magic' | 'Movement' | 'Domain' | 'Perception' | 'Biological' | 'Social' = 'Magic';
    if (normalized.some((t) => ['domain', 'environmental', 'realm', 'cosmic', 'world'].includes(t))) {
      category = 'Domain';
    } else if (normalized.some((t) => ['biological', 'physical', 'body', 'venom', 'poison', 'mutation'].includes(t))) {
      category = 'Biological';
    } else if (normalized.some((t) => ['combat', 'martial', 'weapon', 'strike', 'blade', 'slash', 'offensive', 'attack'].includes(t))) {
      category = 'Combat';
    } else if (normalized.some((t) => ['movement', 'teleport', 'speed', 'mobility', 'transit', 'dash', 'flight'].includes(t))) {
      category = 'Movement';
    } else if (normalized.some((t) => ['perception', 'sensory', 'vision', 'detect', 'scry', 'awareness'].includes(t))) {
      category = 'Perception';
    } else if (normalized.some((t) => ['social', 'speech', 'charm', 'mind', 'influence', 'diplomacy'].includes(t))) {
      category = 'Social';
    }

    // Activation Mode Inference with strict deterministic precedence
    let activationMode: CapabilityActivationMode = 'immediate';
    if (normalized.some((t) => ['passive', 'permanent', 'aura', 'innate', 'always'].includes(t))) {
      activationMode = 'passive';
    } else if (normalized.some((t) => ['reaction', 'counter', 'defensive', 'defense', 'protect', 'ward', 'shield', 'parry', 'trigger', 'barrier'].includes(t))) {
      activationMode = 'reaction';
    } else if (normalized.some((t) => ['channelled', 'channeled', 'sustained', 'continuous', 'beam'].includes(t))) {
      activationMode = 'channelled';
    } else if (normalized.some((t) => ['charged', 'cast', 'delayed', 'ritual', 'prep'].includes(t))) {
      activationMode = 'charged';
    }

    // Target Type Inference
    let targetType: 'single_target' | 'self' | 'area_of_effect' | 'all_allies' | 'all_enemies' = 'single_target';
    if (normalized.some((t) => ['aoe', 'area', 'zone', 'burst', 'explosion', 'cone', 'radius', 'cleave', 'all_enemies'].includes(t))) {
      targetType = 'area_of_effect';
    } else if (normalized.some((t) => ['self', 'buff', 'shield', 'ward', 'barrier', 'meditation', 'heal_self', 'aura'].includes(t))) {
      targetType = 'self';
    } else if (normalized.some((t) => ['allies', 'all_allies', 'party', 'blessing', 'group_heal'].includes(t))) {
      targetType = 'all_allies';
    }

    // Range Scope Inference
    let rangeScope: 'melee' | 'close' | 'ranged' | 'realm' | 'global' = 'close';
    if (normalized.some((t) => ['global', 'omnipresent', 'everywhere'].includes(t))) {
      rangeScope = 'global';
    } else if (normalized.some((t) => ['realm', 'domain', 'worldscale', 'horizon'].includes(t))) {
      rangeScope = 'realm';
    } else if (normalized.some((t) => ['ranged', 'distant', 'snipe', 'projectile', 'beam', 'arrow', 'bolt'].includes(t))) {
      rangeScope = 'ranged';
    } else if (normalized.some((t) => ['melee', 'touch', 'strike', 'slash', 'fist', 'contact', 'blade'].includes(t))) {
      rangeScope = 'melee';
    }

    // Action Type Inference
    let actionType: 'action' | 'bonus_action' | 'reaction' | 'free' = 'action';
    if (activationMode === 'reaction') {
      actionType = 'reaction';
    } else if (activationMode === 'passive') {
      actionType = 'free';
    } else if (normalized.some((t) => ['quick', 'swift', 'instant', 'bonus', 'burst', 'dash'].includes(t))) {
      actionType = 'bonus_action';
    }

    return { category, activationMode, targetType, rangeScope, actionType };
  }

  /**
   * Custom Power Synthesis (Challenge 7, Phase 6A, DreamBook §394–§396)
   * Converts natural-language concept into structured capabilities, derived techniques, and graph linkages.
   * Registers both primary and derived techniques as first-class invocable capabilities.
   */
  public synthesizeCustomPower(params: SynthesizeCustomPowerParams): {
    primaryCapability: CapabilityDefinition;
    derivedSkills: string[];
    graphNode: CapabilityGraphNode;
  } {
    if (!params.conceptName || typeof params.conceptName !== 'string') {
      throw new Error('conceptName string is required for power synthesis.');
    }
    if (!params.description || typeof params.description !== 'string') {
      throw new Error('description string is required for power synthesis.');
    }

    const validTiers = ['Minor', 'Moderate', 'Major', 'WorldScale'];
    if (params.powerTier && !validTiers.includes(params.powerTier)) {
      throw new Error(`Invalid powerTier '${params.powerTier}'. Allowed values: ${validTiers.join(', ')}.`);
    }
    const powerTier = params.powerTier || 'Moderate';

    const tags = Array.isArray(params.tags) ? params.tags : [];
    const inferred = this.inferStructuredMechanics(tags);
    const category = inferred.category;
    const activationMode = inferred.activationMode;

    const validTargetTypes = ['single_target', 'self', 'area_of_effect', 'all_allies', 'all_enemies'];
    const validRangeScopes = ['melee', 'close', 'ranged', 'realm', 'global'];
    const validActionTypes = ['action', 'bonus_action', 'reaction', 'free'];

    const targetType = params.targetType && validTargetTypes.includes(params.targetType)
      ? params.targetType
      : inferred.targetType;
    const rangeScope = params.rangeScope && validRangeScopes.includes(params.rangeScope)
      ? params.rangeScope
      : inferred.rangeScope;
    const actionType = params.actionType && validActionTypes.includes(params.actionType)
      ? params.actionType
      : inferred.actionType;

    const cooldownTurns = typeof params.cooldownTurns === 'number'
      ? Math.max(0, Math.min(10, Math.round(params.cooldownTurns)))
      : undefined;
    const durationTurns = typeof params.durationTurns === 'number'
      ? Math.max(0, Math.min(10, Math.round(params.durationTurns)))
      : undefined;

    let baseEnergyCost = 12;
    let baseStrainCost = 5;
    let minVesselCapacityRequired = 15;

    switch (powerTier) {
      case 'WorldScale':
        baseEnergyCost = 35;
        baseStrainCost = 25;
        minVesselCapacityRequired = 50;
        break;
      case 'Major':
        baseEnergyCost = 20;
        baseStrainCost = 10;
        minVesselCapacityRequired = 30;
        break;
      case 'Moderate':
        baseEnergyCost = 12;
        baseStrainCost = 5;
        minVesselCapacityRequired = 15;
        break;
      case 'Minor':
      default:
        baseEnergyCost = 4;
        baseStrainCost = 1;
        minVesselCapacityRequired = 5;
        break;
    }

    if (activationMode === 'passive') {
      baseStrainCost = 0;
      baseEnergyCost = Math.max(0, Math.floor(baseEnergyCost * 0.2));
    }

    // Step 0: Capture full pre-synthesis state snapshot to guarantee transactional failure atomicity
    const snapshotState = this.exportState();

    try {
      this.synthesisCounter++;
      const capId = `cap_synth_${this.synthesisCounter}`;
      const primaryCapability: CapabilityDefinition = {
        id: capId,
        name: params.conceptName,
        category,
        activationMode,
        powerTier,
        baseEnergyCost,
        baseStrainCost,
        minVesselCapacityRequired,
        description: params.description,
        targetType,
        rangeScope,
        actionType,
        cooldownTurns,
        durationTurns,
        restrictions: params.restrictions,
        counters: params.counters,
        provenance: `player_custom_synthesis:${params.conceptName}`,
      };

      this.registerCapability(primaryCapability);

      // Generate and register derived child techniques as first-class invocable capabilities (DEF-CH7-01)
      const techTier: 'Minor' | 'Moderate' | 'Major' =
        powerTier === 'WorldScale' ? 'Major' : powerTier === 'Major' ? 'Moderate' : 'Minor';

      const tech0Id = `${capId}_tech_surge`;
      const tech0: CapabilityDefinition = {
        id: tech0Id,
        name: `${params.conceptName}: Core Surge`,
        category,
        activationMode: 'immediate',
        powerTier: techTier,
        baseEnergyCost: Math.max(1, Math.round(baseEnergyCost * 0.5)),
        baseStrainCost: Math.max(0, Math.round(baseStrainCost * 0.4)),
        minVesselCapacityRequired: Math.max(1, Math.round(minVesselCapacityRequired * 0.4)),
        targetType: 'self',
        rangeScope: 'close',
        actionType: 'bonus_action',
        description: `Focused concentrated surge technique derived from ${params.conceptName}.`,
        provenance: `derived_technique:${capId}`,
      };
      this.registerCapability(tech0);

      const tech1Id = `${capId}_tech_strike`;
      const tech1: CapabilityDefinition = {
        id: tech1Id,
        name: `${params.conceptName}: Focused Strike`,
        category: category === 'Movement' ? 'Movement' : category === 'Biological' ? 'Biological' : 'Combat',
        activationMode: 'immediate',
        powerTier: techTier,
        baseEnergyCost: Math.max(1, Math.round(baseEnergyCost * 0.6)),
        baseStrainCost: Math.max(1, Math.round(baseStrainCost * 0.6)),
        minVesselCapacityRequired: Math.max(1, Math.round(minVesselCapacityRequired * 0.5)),
        targetType: 'single_target',
        rangeScope: category === 'Movement' ? 'melee' : 'close',
        actionType: 'action',
        description: `Precision kinetic or offensive release derived from ${params.conceptName}.`,
        provenance: `derived_technique:${capId}`,
      };
      this.registerCapability(tech1);

      const tech2Id = `${capId}_tech_ward`;
      const tech2: CapabilityDefinition = {
        id: tech2Id,
        name: `${params.conceptName}: Shielding Ward`,
        category,
        activationMode: 'reaction',
        powerTier: techTier,
        baseEnergyCost: Math.max(1, Math.round(baseEnergyCost * 0.5)),
        baseStrainCost: Math.max(0, Math.round(baseStrainCost * 0.3)),
        minVesselCapacityRequired: Math.max(1, Math.round(minVesselCapacityRequired * 0.4)),
        targetType: 'self',
        rangeScope: 'close',
        actionType: 'reaction',
        description: `Protective or reactive ward technique derived from ${params.conceptName}.`,
        provenance: `derived_technique:${capId}`,
      };
      this.registerCapability(tech2);

      const derivedSkillIds = [tech0Id, tech1Id, tech2Id];
      const derivedSkillNames = [tech0.name, tech1.name, tech2.name];

      const graphNode: CapabilityGraphNode = {
        capabilityId: capId,
        name: params.conceptName,
        derivedSkills: derivedSkillIds,
        prerequisites: [],
        enhances: [],
      };

      this.capabilityGraph.set(capId, graphNode);

      // Register child graph nodes for navigation and prerequisites
      this.capabilityGraph.set(tech0Id, {
        capabilityId: tech0Id,
        name: tech0.name,
        derivedSkills: [],
        prerequisites: [capId],
        enhances: [capId],
      });
      this.capabilityGraph.set(tech1Id, {
        capabilityId: tech1Id,
        name: tech1.name,
        derivedSkills: [],
        prerequisites: [capId],
        enhances: [capId],
      });
      this.capabilityGraph.set(tech2Id, {
        capabilityId: tech2Id,
        name: tech2.name,
        derivedSkills: [],
        prerequisites: [capId],
        enhances: [capId],
      });

      if (params.actorId) {
        if (!this.powerStates.has(params.actorId)) {
          this.seedStarterPowerStateForActor(params.actorId);
        }
        this.acquireSkill(params.actorId, capId);
        this.acquireSkill(params.actorId, tech0Id);
        this.acquireSkill(params.actorId, tech1Id);
        this.acquireSkill(params.actorId, tech2Id);
      }

      return { primaryCapability, derivedSkills: derivedSkillNames, graphNode };
    } catch (err) {
      // Transactional Rollback: Restore exact state prior to synthesis attempt
      this.capabilities.clear();
      this.powerStates.clear();
      this.capabilityGraph.clear();
      this.actorSkillInstances.clear();
      this.actorLearnedCapabilities.clear();
      this.importState(snapshotState);
      throw err;
    }
  }

  /**
   * Freeform Action Interpretation Pipeline (Challenge 7, DreamBook §394–§396)
   * Maps freeform player/NPC action text to either:
   * 1. EXISTING_CAPABILITY (exact match or known capability)
   * 2. CONTEXTUAL_MODIFICATION (known capability + contextual effort/scale/infusion)
   * 3. NOVEL_CAPABILITY_PROPOSAL (synthesized or structured preview)
   * 4. UNSUPPORTED (empty or uninterpretable)
   * Deterministically validates and optionally executes through adjudication without LLM authority.
   */
  public interpretFreeformAction(params: FreeformActionRequest): FreeformInterpretationResult {
    const actorId = params.actorId;
    const actionText = (params.actionText || '').trim();

    if (!actionText) {
      return {
        interpretationType: 'UNSUPPORTED',
        actorId,
        actionText,
        validationSuccess: false,
        rejectionReason: 'Empty or uninterpretable action description.',
        narrativeInterpretation: 'The action could not be understood or resolved into structured intent.',
      };
    }

    // Check if actor has a power state or seed starter
    let power = this.powerStates.get(actorId);
    if (!power) {
      power = this.seedStarterPowerStateForActor(actorId);
    }

    const actorCaps = this.getActorCapabilities(actorId);
    const normalizedText = actionText.toLowerCase();

    // Step 1: Check for exact ID match or direct capability name match
    let matchedCap: CapabilityDefinition | undefined;
    if (params.intendedCapabilityId) {
      matchedCap =
        actorCaps.find((c) => c.id === params.intendedCapabilityId) ||
        this.capabilities.get(params.intendedCapabilityId);
    }

    if (!matchedCap) {
      matchedCap = actorCaps.find(
        (c) =>
          c.name.toLowerCase() === normalizedText ||
          normalizedText.includes(c.name.toLowerCase()) ||
          c.id.toLowerCase() === normalizedText
      );
    }

    // Step 2: If existing capability matched, determine if contextual modifiers apply
    if (matchedCap) {
      const modifiers: CapabilityModifier[] = [...(params.requestedModifiers || [])];

      // Detect common freeform effort descriptions
      if (
        normalizedText.includes('overcharge') ||
        normalizedText.includes('full power') ||
        normalizedText.includes('maximum')
      ) {
        if (!modifiers.some((m) => m.modifierType === 'OVERCHARGE')) {
          modifiers.push({
            id: 'mod_overcharge_auto',
            name: 'Overcharge',
            modifierType: 'OVERCHARGE',
            energyCostDelta: 8,
            strainCostDelta: 5,
            effectScaleDelta: 1.5,
            description: 'Amplified kinetic and energetic output through focused overcharging.',
          });
        }
      }
      if (
        normalizedText.includes('concentrate') ||
        normalizedText.includes('focus') ||
        normalizedText.includes('precise')
      ) {
        if (!modifiers.some((m) => m.modifierType === 'CONCENTRATE')) {
          modifiers.push({
            id: 'mod_concentrate_auto',
            name: 'Concentration',
            modifierType: 'CONCENTRATE',
            energyCostDelta: 4,
            strainCostDelta: 2,
            effectScaleDelta: 1.25,
            description: 'Stabilized focal matrix for enhanced precision.',
          });
        }
      }

      const interpretationType: FreeformInterpretationType =
        modifiers.length > 0 ? 'CONTEXTUAL_MODIFICATION' : 'EXISTING_CAPABILITY';

      const gate = this.evaluateExecutionGate({
        actorId,
        capabilityId: matchedCap.id,
        environment: params.environment,
        actorConditions: params.actorConditions,
        modifiers,
      });

      let adjudication: ApprovedConsequence | undefined;
      if (params.executeIfValid && gate.status !== 'ELIGIBILITY_BLOCKED') {
        adjudication = this.adjudicate({
          actorId,
          intendedCapabilityId: matchedCap.id,
          actionDescription: actionText,
          requestedScale: params.requestedScale || 'Local',
          modifiers,
          environment: params.environment,
          actorConditions: params.actorConditions,
        });
      }

      return {
        interpretationType,
        actorId,
        actionText,
        mappedCapability: matchedCap,
        appliedModifiers: modifiers.length > 0 ? modifiers : undefined,
        executionGate: gate,
        adjudicationConsequence: adjudication,
        validationSuccess:
          gate.status !== 'ELIGIBILITY_BLOCKED' && (!adjudication || adjudication.approved),
        rejectionReason: gate.rejectionReason || adjudication?.rejectionReason,
        narrativeInterpretation: `Mapped to existing capability '${matchedCap.name}'${
          modifiers.length > 0 ? ` with ${modifiers.length} contextual modifier(s)` : ''
        }.`,
      };
    }

    // Step 3: Novel capability proposal
    const tags = params.tags || [];
    // Extract implicit tags from text if none provided
    if (tags.length === 0) {
      const keywords = [
        'strike',
        'shield',
        'ward',
        'teleport',
        'dash',
        'fire',
        'ice',
        'shadow',
        'light',
        'mind',
        'blast',
        'barrier',
        'passive',
        'reaction',
      ];
      for (const kw of keywords) {
        if (normalizedText.includes(kw)) {
          tags.push(kw);
        }
      }
    }

    const powerTier: 'Minor' | 'Moderate' | 'Major' | 'WorldScale' =
      params.requestedScale === 'WorldScale'
        ? 'WorldScale'
        : params.requestedScale === 'Moderate'
        ? 'Moderate'
        : 'Minor';

    if (params.executeIfValid) {
      const synthResult = this.synthesizeCustomPower({
        actorId,
        conceptName: actionText.slice(0, 60),
        description: actionText,
        tags,
        powerTier,
      });

      const gate = this.evaluateExecutionGate({
        actorId,
        capabilityId: synthResult.primaryCapability.id,
        environment: params.environment,
        actorConditions: params.actorConditions,
        modifiers: params.requestedModifiers,
      });

      let adjudication: ApprovedConsequence | undefined;
      if (gate.status !== 'ELIGIBILITY_BLOCKED') {
        adjudication = this.adjudicate({
          actorId,
          intendedCapabilityId: synthResult.primaryCapability.id,
          actionDescription: actionText,
          requestedScale: params.requestedScale || 'Local',
          modifiers: params.requestedModifiers,
          environment: params.environment,
          actorConditions: params.actorConditions,
        });
      }

      return {
        interpretationType: 'NOVEL_CAPABILITY_PROPOSAL',
        actorId,
        actionText,
        proposedCapability: synthResult.primaryCapability,
        derivedTechniques: synthResult.derivedSkills,
        executionGate: gate,
        adjudicationConsequence: adjudication,
        validationSuccess:
          gate.status !== 'ELIGIBILITY_BLOCKED' && (!adjudication || adjudication.approved),
        rejectionReason: gate.rejectionReason || adjudication?.rejectionReason,
        narrativeInterpretation: `Synthesized novel custom power '${synthResult.primaryCapability.name}' with 3 derived techniques.`,
      };
    } else {
      // Preview proposal without mutating canonical state
      const inferred = this.inferStructuredMechanics(tags);
      let baseEnergyCost = 4;
      let baseStrainCost = 1;
      let minVesselCapacityRequired = 5;

      switch (powerTier) {
        case 'WorldScale':
          baseEnergyCost = 35;
          baseStrainCost = 25;
          minVesselCapacityRequired = 50;
          break;
        case 'Moderate':
          baseEnergyCost = 12;
          baseStrainCost = 5;
          minVesselCapacityRequired = 15;
          break;
        case 'Minor':
        default:
          baseEnergyCost = 4;
          baseStrainCost = 1;
          minVesselCapacityRequired = 5;
          break;
      }

      const previewCap: CapabilityDefinition = {
        id: `cap_preview_${Date.now()}`,
        name: actionText.slice(0, 60),
        category: inferred.category,
        activationMode: inferred.activationMode,
        powerTier,
        baseEnergyCost,
        baseStrainCost,
        minVesselCapacityRequired,
        targetType: inferred.targetType,
        rangeScope: inferred.rangeScope,
        actionType: inferred.actionType,
        description: actionText,
        provenance: `freeform_preview:${actionText}`,
      };

      return {
        interpretationType: 'NOVEL_CAPABILITY_PROPOSAL',
        actorId,
        actionText,
        proposedCapability: previewCap,
        validationSuccess: true,
        narrativeInterpretation: `Proposed novel capability preview '${previewCap.name}' (${previewCap.category}, ${previewCap.powerTier}).`,
      };
    }
  }
}
