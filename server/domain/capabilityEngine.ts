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

export type CapabilityActivationMode = 'immediate' | 'passive' | 'reaction' | 'charged' | 'channelled';

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

  constructor() {
    this.seedDefaultCapabilities();
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
  }

  public seedStarterPowerStateForActor(actorId: string): PowerState {
    const existing = this.powerStates.get(actorId);
    if (existing) {
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
    return JSON.parse(JSON.stringify(starterState));
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
  } {
    const powerStatesRecord: Record<string, PowerState> = {};
    for (const [id, s] of this.powerStates.entries()) {
      powerStatesRecord[id] = JSON.parse(JSON.stringify(s));
    }
    return {
      capabilities: Array.from(this.capabilities.values()),
      powerStates: powerStatesRecord,
      capabilityGraph: Array.from(this.capabilityGraph.values()),
    };
  }

  public importState(state: {
    capabilities?: CapabilityDefinition[];
    powerStates?: Record<string, PowerState>;
    capabilityGraph?: CapabilityGraphNode[];
  }): void {
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
  }

  /**
   * Deterministically adjudicates capability execution per DreamBook §388–§393 (V10.0, V10.7 Exemplar)
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

    // Check Hard Constraints (V10.9)
    if (power.sealState === 'absolute') {
      return {
        approved: false,
        rejectionReason: 'Absolute seal prevents invoking primordial powers.',
        hpDelta: 0,
        energyDelta: 0,
        strainDelta: 0,
        appliedConditions: [],
        emittedObservation: {
          visibleToNearby: true,
          sensoryDescription: 'A faint ripple of darkness flared then abruptly shattered against binding golden glyphs.',
        },
        narrativeDirective: 'The seal rejected the action completely; runes flamed violently.',
      };
    }

    // Evaluate Vessel Capacity Overload (DreamBook §390–§391)
    const isMortalVessel = power.vesselType === 'mortal_human';
    const isWorldScale = proposal.requestedScale === 'WorldScale' || cap.powerTier === 'WorldScale';

    let hpCost = 0;
    let strainCost = cap.baseStrainCost;
    let energyCost = cap.baseEnergyCost;
    const appliedConditions: string[] = [];

    if (isWorldScale && isMortalVessel) {
      // Overload penalty: vessel cannot safely channel world-scale power without severe physical cost
      const capacityDeficit = Math.max(0, cap.minVesselCapacityRequired - power.vesselCapacity);
      hpCost = Math.min(power.healthCurrent - 1, Math.max(5, Math.floor(capacityDeficit / 4))); // Never drops below 1 HP automatically
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
          : `${cap.name} manifested with a sudden pulse of force.`,
      },
      narrativeDirective: `Approved: ${cap.name} manifested. Cost: ${hpCost} HP, +${strainCost} physical strain. Vessel strain visible.`,
    };
  }

  /**
   * Helper: Deterministically infer category and activation mode from concept tags.
   * Enforces strict schema enums and precedence rules. (CH7 / DreamBook §394.1)
   */
  private inferCategoryAndMode(tags: string[]): {
    category: 'Combat' | 'Magic' | 'Movement' | 'Domain' | 'Perception' | 'Biological' | 'Social';
    activationMode: CapabilityActivationMode;
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

    return { category, activationMode };
  }

  /**
   * Custom Power Synthesis (Challenge 7, Phase 6A, DreamBook §394–§396)
   * Converts natural-language concept into structured capabilities, derived techniques, and graph linkages.
   * Registers both primary and derived techniques as first-class invocable capabilities.
   */
  public synthesizeCustomPower(params: {
    actorId: string;
    conceptName: string;
    description: string;
    tags: string[];
    powerTier: 'Minor' | 'Moderate' | 'Major' | 'WorldScale';
  }): {
    primaryCapability: CapabilityDefinition;
    derivedSkills: string[];
    graphNode: CapabilityGraphNode;
  } {
    const { category, activationMode } = this.inferCategoryAndMode(params.tags);

    let baseEnergyCost = 12;
    let baseStrainCost = 5;
    let minVesselCapacityRequired = 15;

    switch (params.powerTier) {
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

    const capId = `cap_synth_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const primaryCapability: CapabilityDefinition = {
      id: capId,
      name: params.conceptName,
      category,
      activationMode,
      powerTier: params.powerTier,
      baseEnergyCost,
      baseStrainCost,
      minVesselCapacityRequired,
      description: params.description,
      provenance: `player_custom_synthesis:${params.conceptName}`,
    };

    this.registerCapability(primaryCapability);

    // Generate and register derived child techniques as first-class invocable capabilities (DEF-CH7-01)
    const techTier: 'Minor' | 'Moderate' | 'Major' =
      params.powerTier === 'WorldScale' ? 'Major' : params.powerTier === 'Major' ? 'Moderate' : 'Minor';

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

    return { primaryCapability, derivedSkills: derivedSkillNames, graphNode };
  }
}
