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

export function projectPlayerCapabilities(
  input: PlayerCapabilityProjectionInput,
): PlayerCapabilityProjection {
  const skillInstances = clone(input.skillInstances || []);
  const learnedIds = new Set(skillInstances.map((instance) => instance.capabilityId));

  // Defense in depth: learnedCapabilities must agree with actor SkillInstances.
  // The projection never promotes an arbitrary global definition into a learned skill.
  const learnedCapabilities = clone(
    (input.learnedCapabilities || []).filter((capability) => learnedIds.has(capability.id)),
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
    learnedCapabilities,
    skillInstances,
  };
}
