import type {
  CapabilityDefinition,
  EffectiveCapability,
  SkillInstance,
} from '../domain/capabilityEngine';

/**
 * Player-safe capability projection.
 *
 * This is the single boundary contract used by player-facing capability endpoints.
 * It deliberately accepts already-resolved actor data instead of consulting the
 * global capability registry itself. The global registry, capability graph,
 * simulation traces, and adjudication internals therefore cannot accidentally
 * become player data merely because they exist in CapabilityEngine.
 *
 * IMPORTANT:
 * - `skillbookCapabilities` are learned Skillbook entries.
 * - `capabilities` are currently effective actor abilities and may include
 *   equipment grants.
 * - Equipment grants are deliberately NOT promoted into the Skillbook.
 */
export interface PlayerCapabilityProjection {
  /** Capabilities that are currently effective for the actor, including equipment grants. */
  capabilities: EffectiveCapability[];
  /** Definitions for capabilities that the actor has actually learned. */
  learnedCapabilities: CapabilityDefinition[];
  /** Actor-scoped mutable progression records for learned skills. */
  skillInstances: SkillInstance[];
}

export interface PlayerCapabilityProjectionInput {
  effectiveCapabilities: EffectiveCapability[];
  learnedCapabilities: CapabilityDefinition[];
  skillInstances: SkillInstance[];
}

const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

/**
 * Canonical Skillbook projection.
 *
 * A capability definition existing in the engine registry is NOT enough to enter
 * the player Skillbook. A matching actor-owned SkillInstance is mandatory.
 */
export function projectPlayerSkillbook(
  learnedCapabilities: CapabilityDefinition[],
  skillInstances: SkillInstance[],
): {
  learnedCapabilities: CapabilityDefinition[];
  skillInstances: SkillInstance[];
} {
  const projectedInstances = clone(skillInstances || []);
  const learnedIds = new Set(projectedInstances.map((instance) => instance.capabilityId));

  return {
    learnedCapabilities: clone(
      (learnedCapabilities || []).filter((capability) => learnedIds.has(capability.id)),
    ),
    skillInstances: projectedInstances,
  };
}

export function projectPlayerCapabilities(
  input: PlayerCapabilityProjectionInput,
): PlayerCapabilityProjection {
  const skillbook = projectPlayerSkillbook(
    input.learnedCapabilities || [],
    input.skillInstances || [],
  );

  // Effective capabilities are already actor-resolved by CapabilityEngine. Keep only
  // actual learned abilities or active equipment grants; never accept a registry-only item.
  const capabilities = clone(
    (input.effectiveCapabilities || []).filter(
      (capability) => capability.isLearned || capability.isEquippedItemGrant,
    ),
  );

  return {
    capabilities,
    learnedCapabilities: skillbook.learnedCapabilities,
    skillInstances: skillbook.skillInstances,
  };
}
