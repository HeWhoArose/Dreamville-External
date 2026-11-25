import type { RulesProfile } from '../../src/types';
import type { CharacterProgressionEngine, ProgressionAbilityTrigger } from './characterProgressionEngine';
import type { CombatTriggerEvent, TacticalCombatEngine } from './combatEngine';

/**
 * Class and feature abilities that react to combat events subscribe themselves when a fight begins: an unlocked ability whose
 * trigger is a combat event and that carries an effect definition becomes a triggered effect on the combat engine, resolved
 * through the same effect pipeline as everything else. Switching the feature's rule off removes it before it can subscribe
 * (the progression engine hides it), so no switched-off feature fires.
 */
const EVENT_FOR_TRIGGER: Partial<Record<ProgressionAbilityTrigger, CombatTriggerEvent>> = {
  ON_ATTACK: 'ON_ATTACK',
  ON_DAMAGE_TAKEN: 'ON_DAMAGE',
};

export function subscribeProgressionTriggers(
  engine: TacticalCombatEngine,
  progression: CharacterProgressionEngine,
  actorId: string,
  rulesProfile?: RulesProfile | null,
): string[] {
  const subscribed: string[] = [];
  if (!progression.getState(actorId)) return subscribed;
  for (const ability of progression.getTriggeredAbilities(actorId, undefined, rulesProfile)) {
    const event = EVENT_FOR_TRIGGER[ability.trigger];
    const definition = ability.capabilityDefinition?.effectDefinition;
    if (!event || !definition) continue;
    const id = `progression_${actorId}_${ability.id}`;
    const result = engine.registerTriggeredEffect({
      id,
      ownerId: actorId,
      event,
      subject: 'OWNER',
      targeting: 'SELF',
      definition,
      ...(ability.charges !== undefined ? { maxFirings: ability.charges } : {}),
    });
    if (result.success) subscribed.push(id);
  }
  return subscribed;
}
