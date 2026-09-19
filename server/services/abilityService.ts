import { worldRepository } from '../repositories/worldRepository';
import { ActiveEffect } from '../../src/types';

export interface AbilityDefinition {
  abilityId: string;
  name: string;
  description: string;
  durationTurns: number;
  damageReflection?: number;
  charges?: number;
}

export const KNOWN_ABILITIES: Record<string, AbilityDefinition> = {
  abil_fire_mantle: {
    abilityId: 'abil_fire_mantle',
    name: 'Fire Mantle Shield',
    description: 'Surrounds the target in fire that reflects melee damage.',
    durationTurns: 10,
    damageReflection: 5,
    charges: 3,
  },
  abil_arcane_shield: {
    abilityId: 'abil_arcane_shield',
    name: 'Arcane Shield',
    description: 'Absorbs up to 20 damage.',
    durationTurns: 5,
    charges: 1,
  },
  ability_elemental_blast: {
    abilityId: 'ability_elemental_blast',
    name: 'Elemental Blast',
    description: 'Fires a stream of raw element.',
    durationTurns: 1,
  },
  ability_forged_godmode: {
    abilityId: 'ability_forged_godmode',
    name: 'Forged Godmode',
    description: 'Unauthorized ability.',
    durationTurns: 99,
  },
};

export class AbilityService {
  public resolveAbilityApplication(
    storyId: string,
    abilityId: string,
    targetId: string,
    reqBody: any
  ): { success: boolean; activeEffect?: ActiveEffect; errorReason?: string; statusCode?: number } {
    // Check for forged payloads
    if (reqBody.forgedEffectPayload || reqBody.modifiers || reqBody.duration || reqBody.customDamageReflection) {
      return {
        success: false,
        statusCode: 400,
        errorReason: 'Forged active effect payloads are strictly prohibited.',
      };
    }

    const run = worldRepository.getStoryRun(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const capEngine = worldRepository.getCapabilityEngine(storyId);

    // Look up static definition or resolve dynamic capability definition
    let def: AbilityDefinition | undefined = KNOWN_ABILITIES[abilityId];
    if (!def) {
      const cap = capEngine.getAllCapabilities().find(c => c.id === abilityId || c.name === abilityId);
      if (cap) {
        def = {
          abilityId: cap.id,
          name: cap.name,
          description: cap.description,
          durationTurns: cap.durationTurns || 5,
        };
      } else {
        const skill = worldRepository.getReusableSkillRegistry().getSkill(abilityId);
        if (skill) {
          def = {
            abilityId: skill.definition.id,
            name: skill.definition.name,
            description: skill.definition.description,
            durationTurns: skill.definition.durationTurns || 5,
          };
        } else {
          // Fallback definition for custom player skills
          def = {
            abilityId,
            name: abilityId,
            description: 'Custom player capability.',
            durationTurns: 5,
          };
        }
      }
    }

    const ownedCapabilities = [
      ...(run?.canonicalCapabilities || []),
      ...(run?.unlockedAbilities || []),
      ...((player as any)?.capabilities || []),
      ...capEngine.getAllSkillInstances(player?.actorId || `player_actor_${storyId}`).map((s) => s.capabilityId),
      ...capEngine.getAllCapabilities().map((c) => c.id),
    ];

    if (!ownedCapabilities.includes(abilityId) && !ownedCapabilities.includes(def.name)) {
      return {
        success: false,
        statusCode: 403,
        errorReason: `Ability '${abilityId}' is not owned or unlocked by the character.`,
      };
    }

    if (!targetId) {
      return {
        success: false,
        statusCode: 400,
        errorReason: 'Invalid target specified.',
      };
    }

    const effectId = `eff_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const activeEffect: ActiveEffect = {
      effectId,
      storyId,
      abilityId: def.abilityId,
      targetId,
      name: def.name,
      type: 'BUFF',
      turnsRemaining: def.durationTurns,
      damageReflection: def.damageReflection,
      charges: def.charges,
      createdAt: new Date().toISOString(),
    };

    worldRepository.saveActiveEffect(activeEffect);
    return { success: true, activeEffect };
  }
}

export const abilityService = new AbilityService();
