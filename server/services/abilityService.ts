import { worldRepository } from '../repositories/worldRepository';
import { deterministicId, formatCanonicalTimestamp } from '../domain/deterministicRng';
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
    reqBody: any,
    repository = worldRepository
  ): { success: boolean; activeEffect?: ActiveEffect; errorReason?: string; statusCode?: number } {
    if (!repository.isCanonicalCommandTransactionActive()) {
      return { success: false, statusCode: 409, errorReason: 'Ability application must execute inside a canonical command transaction.' };
    }

    // Check for forged payloads
    if (reqBody.forgedEffectPayload || reqBody.modifiers || reqBody.duration || reqBody.customDamageReflection) {
      return {
        success: false,
        statusCode: 400,
        errorReason: 'Forged active effect payloads are strictly prohibited.',
      };
    }

    const run = repository.getStoryRun(storyId);
    const player = repository.getPlayerLifecycle(storyId);
    const capEngine = repository.getCapabilityEngine(storyId);

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
        const skill = repository.getReusableSkillRegistry().getSkill(abilityId);
        if (skill) {
          def = {
            abilityId: skill.definition.id,
            name: skill.definition.name,
            description: skill.definition.description,
            durationTurns: skill.definition.durationTurns || 5,
          };
        } else {
          return {
            success: false,
            statusCode: 404,
            errorReason: `Ability '${abilityId}' is not registered or owned by the actor.`,
          };
        }
      }
    }

    const actorId = player?.actorId || `player_actor_${storyId}`;
    const progression = repository.getCharacterProgressionEngine(storyId);
    const triggeredAbilities = progression.getTriggeredAbilities(actorId);
    const ownedCapabilities = [
      ...(run?.canonicalCapabilities || []),
      ...(run?.unlockedAbilities || []),
      ...((player as any)?.capabilities || []),
      ...capEngine.getAllSkillInstances(actorId).map((s) => s.capabilityId),
      ...triggeredAbilities.map((ability) => ability.id),
      ...triggeredAbilities.map((ability) => ability.capabilityId).filter((id): id is string => typeof id === 'string'),
    ];

    const progressionAbility = triggeredAbilities.find((ability) => ability.id === abilityId || ability.capabilityId === abilityId);
    if (progressionAbility?.capabilityDefinition) {
      def = {
        abilityId: progressionAbility.capabilityId || progressionAbility.id,
        name: progressionAbility.name,
        description: progressionAbility.description,
        durationTurns: progressionAbility.capabilityDefinition.durationTurns || 5,
      };
    }

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

    const commandSequence = repository.getCanonicalCommandEvents(storyId).length + 1;
    const effectId = deterministicId('eff', storyId, commandSequence, def.abilityId, targetId);
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
      createdAt: formatCanonicalTimestamp(repository.getWorldClock(storyId).getTimestamp()),
    };

    repository.saveActiveEffect(activeEffect);
    return { success: true, activeEffect };
  }
}

export const abilityService = new AbilityService();
