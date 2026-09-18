import {
  CapabilityDefinition,
  SkillInstance,
  VisualIdentityRef,
  CapabilityEngine,
  WorldProgressionPolicy,
  DEFAULT_PROGRESSION_POLICY,
} from './capabilityEngine';

export interface ReusableSkillProgressionSnapshot {
  level: number;
  xp: number;
  xpToNext: number | null;
  evolutionPoints: number;
}

export interface ReusableSkillCompatibility {
  requiredWorldModes?: string[];
  prerequisites?: string[];
  forbiddenTraits?: string[];
  minVesselCapacity?: number;
  allowedTargetRealms?: string[];
  permittedCategories?: string[];
  maxTierAllowed?: 'Minor' | 'Moderate' | 'Major' | 'WorldScale';
}

export interface ReusableSkillProvenance {
  sourceStoryIds: string[];
  registeredAtSeconds: number;
  approvedBy: 'CANONICAL_AUTHORITY' | 'WORLD_COORDINATOR';
  version: string;
}

/**
 * ReusableSkill (DreamBook §§V10.5.8.1–V10.5.8.9)
 * Portable approved skill library record for cross-story capability reuse.
 * Encapsulates immutable mechanical definition and progression snapshot.
 * Strict Epistemic Boundary: NEVER stores or leaks narrative relationships,
 * memories, secrets, geography, factions, or source-story chronology.
 */
export interface ReusableSkill {
  id: string; // Stable portable library ID (e.g., 'lib_skill_fireball')
  definitionId: string;
  definition: CapabilityDefinition;
  progressionSnapshot: ReusableSkillProgressionSnapshot;
  evolutionLineage: string[];
  visualIdentityRef?: VisualIdentityRef;
  compatibility: ReusableSkillCompatibility;
  provenance: ReusableSkillProvenance;
}

export interface TargetWorldContext {
  storyId: string;
  worldMode: string; // e.g. 'standard', 'high_magic', 'low_magic', 'grounded'
  allowProgressionTransfer: boolean; // if false, resets to level 1 baseline in target
  permittedCategories?: string[];
  maxAllowedTier?: 'Minor' | 'Moderate' | 'Major' | 'WorldScale';
  forbiddenTraits?: string[];
  actorVesselCapacity?: number;
  actorTraits?: string[];
}

export interface CompatibilityCheckResult {
  compatible: boolean;
  reason?: string;
  allowProgressionTransfer: boolean;
  violations: string[];
}

/**
 * Tier ranking order for deterministic compatibility comparisons.
 */
const TIER_ORDER: Record<'Minor' | 'Moderate' | 'Major' | 'WorldScale', number> = {
  Minor: 1,
  Moderate: 2,
  Major: 3,
  WorldScale: 4,
};

export class ReusableSkillRegistry {
  private skills: Map<string, ReusableSkill> = new Map(); // id -> ReusableSkill
  private definitionToLibraryId: Map<string, string> = new Map(); // definitionId -> libraryId

  constructor() {
    this.seedDefaultReusableSkills();
  }

  private seedDefaultReusableSkills(): void {
    // Seed canonical baseline reusable skill (e.g. Fireball)
    const fireballCap: CapabilityDefinition = {
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
      visualIdentityRef: {
        assetId: 'asset_fx_fireball',
        relativeUri: '/assets/skills/fireball.webp',
        promptFallback: 'A radiant ball of blazing orange flame streaking forward.',
      },
    };

    this.registerApprovedSkill({
      id: 'lib_skill_fireball',
      definitionId: fireballCap.id,
      definition: fireballCap,
      progressionSnapshot: {
        level: 3,
        xp: 150,
        xpToNext: 300,
        evolutionPoints: 2,
      },
      evolutionLineage: ['cap_fire_spark', 'cap_fireball'],
      visualIdentityRef: fireballCap.visualIdentityRef,
      compatibility: {
        requiredWorldModes: [],
        minVesselCapacity: 20,
        permittedCategories: ['Magic', 'Combat'],
        forbiddenTraits: ['anti_magic_curse'],
      },
      provenance: {
        sourceStoryIds: ['story_origin_prime'],
        registeredAtSeconds: 0,
        approvedBy: 'CANONICAL_AUTHORITY',
        version: '1.0.0',
      },
    });
  }

  /**
   * Registers an approved reusable skill in the library.
   * Deterministically validates schema and records provenance.
   */
  public registerApprovedSkill(skill: ReusableSkill): boolean {
    if (!skill.id || !skill.definitionId || !skill.definition) {
      throw new Error('Invalid ReusableSkill schema: id, definitionId, and definition are required.');
    }

    // Clone to ensure deep encapsulation and isolation
    const cloned: ReusableSkill = JSON.parse(JSON.stringify(skill));
    this.skills.set(cloned.id, cloned);
    this.definitionToLibraryId.set(cloned.definitionId, cloned.id);
    return true;
  }

  public getSkill(id: string): ReusableSkill | undefined {
    const s = this.skills.get(id);
    return s ? JSON.parse(JSON.stringify(s)) : undefined;
  }

  public getSkillByDefinitionId(definitionId: string): ReusableSkill | undefined {
    const libId = this.definitionToLibraryId.get(definitionId);
    if (!libId) return undefined;
    return this.getSkill(libId);
  }

  public getAllSkills(): ReusableSkill[] {
    return Array.from(this.skills.values()).map((s) => JSON.parse(JSON.stringify(s)));
  }

  /**
   * Deterministic Matching Hierarchy (DreamBook §§V10.5.8.5, V10.5.8.8)
   * 1. Exact canonical definition ID
   * 2. Explicit effect / capability lineage
   * 3. Semantic similarity (discovery ONLY; normalized order; cannot override mechanical compatibility)
   */
  public findCandidateSkills(criteria: {
    definitionId?: string;
    lineageId?: string;
    semanticQuery?: string;
  }): ReusableSkill[] {
    // 1. Exact canonical definition ID match
    if (criteria.definitionId) {
      const match = this.getSkillByDefinitionId(criteria.definitionId);
      if (match) {
        return [match];
      }
      return [];
    }

    // 2. Explicit lineage or declared equivalence match
    if (criteria.lineageId) {
      const lineageMatches: ReusableSkill[] = [];
      for (const skill of this.skills.values()) {
        if (skill.evolutionLineage.includes(criteria.lineageId)) {
          lineageMatches.push(JSON.parse(JSON.stringify(skill)));
        }
      }
      return lineageMatches.sort((a, b) => a.id.localeCompare(b.id));
    }

    // 3. Semantic similarity (Candidate discovery ONLY; never authority)
    if (criteria.semanticQuery) {
      const queryTokens = criteria.semanticQuery.toLowerCase().split(/\s+/).filter(Boolean);
      const scoredCandidates: { skill: ReusableSkill; score: number }[] = [];

      for (const skill of this.skills.values()) {
        const nameTokens = skill.definition.name.toLowerCase().split(/\s+/);
        const descTokens = skill.definition.description.toLowerCase().split(/\s+/);
        let tokenMatches = 0;

        for (const token of queryTokens) {
          if (nameTokens.some((t) => t.includes(token))) {
            tokenMatches += 3;
          } else if (descTokens.some((t) => t.includes(token))) {
            tokenMatches += 1;
          }
        }

        if (tokenMatches > 0) {
          scoredCandidates.push({
            skill: JSON.parse(JSON.stringify(skill)),
            score: tokenMatches,
          });
        }
      }

      // Sort by score descending, then tie-break deterministically by ID ascending
      scoredCandidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.skill.id.localeCompare(b.skill.id);
      });

      return scoredCandidates.map((c) => c.skill);
    }

    // Default: all skills sorted by ID when no specific criteria is provided
    return this.getAllSkills().sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Deterministic Compatibility Evaluation (DreamBook §§V10.5.8.4, V10.5.8.8)
   * Validates target world mode, permissions, max tier, forbidden traits, and vessel capacity.
   * Semantic near-match CANNOT override mechanical incompatibility.
   */
  public evaluateCompatibility(
    reusableSkill: ReusableSkill,
    targetWorld: TargetWorldContext
  ): CompatibilityCheckResult {
    const violations: string[] = [];

    // 1. World Mode Check
    if (
      reusableSkill.compatibility.requiredWorldModes &&
      reusableSkill.compatibility.requiredWorldModes.length > 0
    ) {
      if (!reusableSkill.compatibility.requiredWorldModes.includes(targetWorld.worldMode)) {
        violations.push(
          `Target world mode '${targetWorld.worldMode}' does not satisfy required world modes [${reusableSkill.compatibility.requiredWorldModes.join(', ')}].`
        );
      }
    }

    // 2. Permitted Categories Check
    if (targetWorld.permittedCategories && targetWorld.permittedCategories.length > 0) {
      if (!targetWorld.permittedCategories.includes(reusableSkill.definition.category)) {
        violations.push(
          `Capability category '${reusableSkill.definition.category}' is forbidden in target world.`
        );
      }
    }

    // 3. Maximum Power Tier Check
    if (targetWorld.maxAllowedTier) {
      const allowedRank = TIER_ORDER[targetWorld.maxAllowedTier];
      const skillRank = TIER_ORDER[reusableSkill.definition.powerTier];
      if (skillRank > allowedRank) {
        violations.push(
          `Capability tier '${reusableSkill.definition.powerTier}' exceeds target world maximum allowed tier '${targetWorld.maxAllowedTier}'.`
        );
      }
    }

    // 4. Forbidden Traits Check
    if (targetWorld.forbiddenTraits && targetWorld.forbiddenTraits.length > 0) {
      if (
        reusableSkill.compatibility.forbiddenTraits &&
        reusableSkill.compatibility.forbiddenTraits.some((t) => targetWorld.forbiddenTraits!.includes(t))
      ) {
        violations.push(
          `Capability possesses traits forbidden in target world: [${targetWorld.forbiddenTraits.join(', ')}].`
        );
      }
    }

    // 5. Actor Vessel Capacity Check (if provided)
    if (targetWorld.actorVesselCapacity !== undefined) {
      const minReq = reusableSkill.compatibility.minVesselCapacity ?? reusableSkill.definition.minVesselCapacityRequired;
      if (targetWorld.actorVesselCapacity < minReq) {
        violations.push(
          `Actor vessel capacity ${targetWorld.actorVesselCapacity} is lower than required minimum ${minReq}.`
        );
      }
    }

    const compatible = violations.length === 0;
    return {
      compatible,
      reason: compatible ? undefined : violations.join('; '),
      allowProgressionTransfer: compatible && targetWorld.allowProgressionTransfer,
      violations,
    };
  }

  /**
   * Instantiates a ReusableSkill into a Target Story (DreamBook §§V10.5.8.3–V10.5.8.7)
   * 1. Rejects incompatible targets BEFORE invalid state is created.
   * 2. Clones definition into target CapabilityEngine.
   * 3. Creates completely INDEPENDENT SkillInstance. Target progression never mutates source.
   * 4. Enforces progression rules (target baseline vs transfer).
   * 5. Preserves evolution lineage.
   * 6. Reuses visual identity reference without binary embedding.
   * 7. Enforces Epistemic Firewall: ZERO narrative memories, relationships, or secrets leaked.
   */
  public instantiateInTargetStory(
    reusableSkill: ReusableSkill,
    targetStoryId: string,
    targetActorId: string,
    targetCapEngine: CapabilityEngine,
    targetWorld: TargetWorldContext
  ): SkillInstance {
    // 1. Validate Compatibility
    const check = this.evaluateCompatibility(reusableSkill, targetWorld);
    if (!check.compatible) {
      throw new Error(`Cannot instantiate skill '${reusableSkill.id}' in target story: ${check.reason}`);
    }

    // 2. Ensure Capability Definition is registered in target engine (deep clone)
    const defClone: CapabilityDefinition = JSON.parse(JSON.stringify(reusableSkill.definition));
    targetCapEngine.registerCapability(defClone);

    // 3. Determine Initial Level and XP according to target world progression policy
    const shouldTransferProgression = check.allowProgressionTransfer;
    const initialLevel = shouldTransferProgression ? reusableSkill.progressionSnapshot.level : 1;
    const initialXp = shouldTransferProgression ? reusableSkill.progressionSnapshot.xp : 0;
    const xpToNext = shouldTransferProgression ? reusableSkill.progressionSnapshot.xpToNext : 100;
    const initialPoints = shouldTransferProgression ? reusableSkill.progressionSnapshot.evolutionPoints : 0;

    // 4. Create New, Isolated SkillInstance for target actor
    const newInstance: SkillInstance = {
      instanceId: `inst_${targetActorId}_${reusableSkill.definitionId}`,
      actorId: targetActorId,
      capabilityId: reusableSkill.definitionId,
      currentLevel: initialLevel,
      currentXp: initialXp,
      xpToNextLevel: xpToNext,
      evolutionPoints: initialPoints,
      evolutionLineage: [...reusableSkill.evolutionLineage],
      progressionHistory: [
        {
          entryIndex: 0,
          timestampSeconds: 0,
          changeType: 'ACQUIRED',
          details: `Reused from library entry ${reusableSkill.id} (${shouldTransferProgression ? 'progression transferred' : 'target world baseline progression'})`,
          newLevel: initialLevel,
          newXp: initialXp,
        },
      ],
      unlockedAtSeconds: 0,
      libraryEntryId: reusableSkill.id,
      libraryStatus: 'REUSED',
      librarySourceStoryIds: [...reusableSkill.provenance.sourceStoryIds],
    };

    // 5. Register in Target Engine
    targetCapEngine.registerSkillInstance(targetActorId, newInstance);

    // 6. Record Target Story ID in Provenance without leaking secrets
    if (!reusableSkill.provenance.sourceStoryIds.includes(targetStoryId)) {
      reusableSkill.provenance.sourceStoryIds.push(targetStoryId);
    }

    return JSON.parse(JSON.stringify(newInstance));
  }

  /**
   * Automatic Reuse Pipeline (DreamBook §V10.5.8.2)
   * When an actor seeks to acquire or reuse a capability across stories:
   * 1. Finds compatible approved reusable skill in library.
   * 2. If found & compatible: reuses existing entry and instantiates new target instance (C6-REUSE-01).
   * 3. If none found: automatically registers canonical definition as approved reusable entry (C6-REUSE-02),
   *    then instantiates new target instance.
   */
  public autoAcquireOrReuse(
    sourceStoryId: string,
    sourceActorId: string,
    capabilityId: string,
    targetStoryId: string,
    targetActorId: string,
    sourceCapEngine: CapabilityEngine,
    targetCapEngine: CapabilityEngine,
    targetWorld: TargetWorldContext
  ): SkillInstance {
    // 1. Search candidate library entries
    const candidates = this.findCandidateSkills({ definitionId: capabilityId });
    let selectedSkill: ReusableSkill | undefined;

    for (const cand of candidates) {
      const evalResult = this.evaluateCompatibility(cand, targetWorld);
      if (evalResult.compatible) {
        selectedSkill = cand;
        break;
      }
    }

    // 2. If no compatible reusable skill exists, automatically register from source
    if (!selectedSkill) {
      const sourceDef = sourceCapEngine.getCapability(capabilityId);
      if (!sourceDef) {
        throw new Error(`Capability '${capabilityId}' not found in source engine for reusable registration.`);
      }

      const sourceInst = sourceCapEngine.getSkillInstance(sourceActorId, capabilityId);
      const snapshot: ReusableSkillProgressionSnapshot = sourceInst
        ? {
            level: sourceInst.currentLevel,
            xp: sourceInst.currentXp,
            xpToNext: sourceInst.xpToNextLevel,
            evolutionPoints: sourceInst.evolutionPoints,
          }
        : {
            level: 1,
            xp: 0,
            xpToNext: 100,
            evolutionPoints: 0,
          };

      const newLibSkill: ReusableSkill = {
        id: `lib_skill_${sourceDef.id}`,
        definitionId: sourceDef.id,
        definition: JSON.parse(JSON.stringify(sourceDef)),
        progressionSnapshot: snapshot,
        evolutionLineage: sourceInst ? [...sourceInst.evolutionLineage] : [sourceDef.id],
        visualIdentityRef: sourceDef.visualIdentityRef,
        compatibility: {
          minVesselCapacity: sourceDef.minVesselCapacityRequired,
        },
        provenance: {
          sourceStoryIds: [sourceStoryId],
          registeredAtSeconds: 0,
          approvedBy: 'CANONICAL_AUTHORITY',
          version: '1.0.0',
        },
      };

      this.registerApprovedSkill(newLibSkill);
      selectedSkill = newLibSkill;
    }

    // 3. Instantiate into target story
    return this.instantiateInTargetStory(
      selectedSkill,
      targetStoryId,
      targetActorId,
      targetCapEngine,
      targetWorld
    );
  }

  public exportState(): ReusableSkill[] {
    return Array.from(this.skills.values()).map((s) => JSON.parse(JSON.stringify(s)));
  }

  public importState(skills: ReusableSkill[]): void {
    if (Array.isArray(skills)) {
      for (const skill of skills) {
        this.registerApprovedSkill(skill);
      }
    }
  }
}
