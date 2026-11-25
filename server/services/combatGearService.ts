import type { WorldRepository } from '../repositories/worldRepository';
import type { ItemDefinition, ItemInstance } from '../domain/inventoryItem';
import { dropDefeatedActorLoot } from '../domain/lootDrop';

/**
 * Gear in a fight: drawing or changing a weapon (the free object interaction, then an action), throwing the wielded weapon, and
 * keeping the fighter's numbers in step with what they actually hold. Everything runs through the combat engine's own action
 * economy and attack pipeline, and moves the item through the inventory, so the sword that leaves a hand really lands on the sand.
 */

export interface WeaponProfile {
  name: string;
  damageFormula: string;
  damageType: string;
  thrownProperty: boolean;
}

const THROWN_NAME = /dagger|spear|javelin|handaxe|hand axe|dart|net|throwing/i;

function weaponProfile(item: ItemInstance, def?: ItemDefinition): WeaponProfile {
  const props = (def?.properties || {}) as Record<string, unknown>;
  const tags = (def?.tags || []).map((tag) => tag.toLowerCase());
  const name = item.name || def?.name || 'weapon';
  const formula = String(props.damageFormula || props.damageDice || '').trim();
  const type = String(props.damageType || '').trim()
    || (/spear|dagger|javelin|dart|rapier|pick/i.test(name) ? 'piercing' : /mace|club|hammer|staff|bench|leg/i.test(name) ? 'bludgeoning' : 'slashing');
  const fallback = /dagger|dart/i.test(name) ? '1d4' : /spear|javelin|handaxe|hand axe/i.test(name) ? '1d6' : /greatsword|maul|broadsword/i.test(name) ? '2d6' : '1d6';
  return {
    name,
    damageFormula: /\d*d\d+/.test(formula) ? formula : fallback,
    damageType: type,
    thrownProperty: Boolean(props.thrown) || tags.includes('thrown') || THROWN_NAME.test(name),
  };
}

function abilityMod(score: unknown): number {
  return Math.floor((Number(score ?? 10) - 10) / 2);
}

/** A weapon's damage includes the wielder's ability modifier unless the formula already states a modifier. */
export function withAbilityModifier(formula: string, modifier: number): string {
  const base = String(formula || '').trim() || '1d4';
  if (/[+-]s*d+s*$/.test(base)) return base;
  return modifier === 0 ? base : `${base}${modifier > 0 ? '+' : '-'}${Math.abs(modifier)}`;
}

/** Which ability a weapon swings with: finesse and ranged weapons use the better of Strength and Dexterity. */
export function attackAbilityModifier(strength: unknown, dexterity: unknown, def?: ItemDefinition): number {
  const props = (def?.properties || {}) as Record<string, unknown>;
  const tags = (def?.tags || []).map((tag) => tag.toLowerCase());
  const explicit = typeof props.attackAbility === 'string' ? props.attackAbility.toLowerCase() : '';
  const ranged = explicit === 'dexterity' || explicit === 'dex' || tags.some((tag) => tag.includes('ranged'));
  const finesse = tags.includes('finesse') || Boolean(props.finesse);
  const str = abilityMod(strength);
  return ranged || finesse ? Math.max(str, abilityMod(dexterity)) : str;
}

/** Armor class from the paper doll, the same way an encounter is built. */
function armorClassFromDoll(repository: WorldRepository, storyId: string, actorId: string): number {
  const inv = repository.getInventoryEngine(storyId);
  const stats = (repository.getStoryRun(storyId) as any)?.protagonist?.coreStats || {};
  const doll = inv.getActorPaperDoll(actorId);
  let ac = 10 + abilityMod(stats.dexterity);
  if (doll.body) {
    const def = inv.getItemDefinition(doll.body.defId);
    ac += (doll.body.defId === 'def_steel_cuirass' || def?.properties?.armorBonus) ? (Number(def?.properties?.armorBonus) || 4) : 2;
  }
  if (doll.offHand) {
    const def = inv.getItemDefinition(doll.offHand.defId);
    ac += Number(def?.properties?.armorBonus) || 2;
  }
  return ac;
}

/** What the fighter fights with right now: the wielded weapon, or fists. */
export function refreshLoadout(repository: WorldRepository, storyId: string, actorId: string): void {
  const engine = repository.getCombatEngine(storyId);
  const inv = repository.getInventoryEngine(storyId);
  const main = inv.getActorPaperDoll(actorId).mainHand;
  const stats = (repository.getStoryRun(storyId) as any)?.protagonist?.coreStats || {};
  if (main) {
    const def = inv.getItemDefinition(main.defId);
    const profile = weaponProfile(main, def);
    const modifier = attackAbilityModifier(stats.strength, stats.dexterity, def);
    engine.setCombatLoadout(actorId, { damageFormula: withAbilityModifier(profile.damageFormula, modifier), damageType: profile.damageType, weaponName: profile.name, armorClass: armorClassFromDoll(repository, storyId, actorId) });
  } else {
    engine.setCombatLoadout(actorId, { damageFormula: '1d4+0', damageType: 'bludgeoning', weaponName: null, armorClass: armorClassFromDoll(repository, storyId, actorId) });
  }
}

const SLOT_FOR_CATEGORY: Record<string, string> = { Weapon: 'mainHand', Shield: 'offHand', Armor: 'body' };

export function equipInCombat(params: { repository: WorldRepository; storyId: string; actorId: string; itemId: string; slot?: string }): { success: boolean; errorReason?: string; cost?: 'OBJECT_INTERACTION' | 'ACTION'; equipped?: string } {
  const { repository, storyId, actorId } = params;
  const engine = repository.getCombatEngine(storyId);
  const inv = repository.getInventoryEngine(storyId);
  const item = inv.getActorInventory(actorId).find((entry) => entry.id === params.itemId);
  if (!item) return { success: false, errorReason: 'You are not carrying that.' };
  if (item.isBroken) return { success: false, errorReason: `${item.name} is broken and cannot be wielded.` };
  const slot = params.slot || SLOT_FOR_CATEGORY[item.category] || 'mainHand';

  // The first swap each turn is the free object interaction; a second one costs the action.
  let cost: 'OBJECT_INTERACTION' | 'ACTION' = 'OBJECT_INTERACTION';
  const interaction = engine.consumeObjectInteraction(actorId);
  if (!interaction.success) {
    const action = engine.consumeCombatAction(actorId, 'ACTION');
    if (!action.success) return { success: false, errorReason: `Changing gear again this turn costs an action, and ${action.errorReason || 'none is available'}` };
    cost = 'ACTION';
  }
  const result = inv.equipItem(actorId, item.id, slot as any);
  if (!result.success) return { success: false, errorReason: (result as any).errorReason || (result as any).reason || `${item.name} cannot be equipped in the ${slot} slot.` };
  refreshLoadout(repository, storyId, actorId);
  engine.recordStageEvent('GEAR_EQUIPPED', actorId, undefined, `${engine.getParticipant(actorId)?.name || actorId} took up ${item.name}.`, { item: item.name, slot, cost });
  return { success: true, cost, equipped: item.name };
}

export function throwWeapon(params: { repository: WorldRepository; storyId: string; actorId: string; targetId: string; itemId?: string }): {
  success: boolean; errorReason?: string; weapon?: string; hits?: boolean; damage?: number; targetDied?: boolean; roll?: unknown; rangeBand?: string; disadvantage?: boolean; improvised?: boolean; landedAt?: string;
} {
  const { repository, storyId, actorId, targetId } = params;
  const engine = repository.getCombatEngine(storyId);
  const inv = repository.getInventoryEngine(storyId);
  const doll = inv.getActorPaperDoll(actorId);
  const item = params.itemId ? inv.getActorInventory(actorId).find((entry) => entry.id === params.itemId) : doll.mainHand;
  if (!item) return { success: false, errorReason: 'You have nothing to throw.' };
  const profile = weaponProfile(item, inv.getItemDefinition(item.defId));

  const attacker = engine.getParticipant(actorId);
  if (!attacker) return { success: false, errorReason: 'You are not in this fight.' };
  const level = Number((repository.getStoryRun(storyId) as any)?.protagonist?.coreStats?.level ?? 1);
  const proficiency = Math.ceil(Math.max(1, level) / 4) + 1;
  const improvised = !profile.thrownProperty;
  // A weapon that was not made to be thrown is an improvised missile: 1d4, and no proficiency bonus.
  const result = engine.executeThrownAttack(actorId, targetId, {
    name: profile.name,
    damageFormula: improvised ? '1d4' : profile.damageFormula,
    damageType: improvised ? 'bludgeoning' : profile.damageType,
    attackBonusOverride: improvised ? attacker.attackBonus - proficiency : attacker.attackBonus,
  });
  if (!result.success) return { success: false, errorReason: result.errorReason };

  // The weapon leaves the hand and lands where it fell.
  const locationId = repository.getPlayerLifecycle(storyId)?.locationId;
  let landedAt: string | undefined;
  if (item.equippedSlot) inv.unequipItem(actorId, item.id);
  if (locationId) {
    const moved = inv.transferItem(item.id, actorId, locationId, 'ground');
    if (moved.success) landedAt = locationId;
  }
  refreshLoadout(repository, storyId, actorId);

  const target = engine.getParticipant(targetId);
  if (target?.isDead && target.id !== actorId && locationId) dropDefeatedActorLoot(inv, target.id, locationId);

  return {
    success: true,
    weapon: profile.name,
    hits: result.hits,
    damage: result.damage,
    targetDied: Boolean(target?.isDead),
    roll: result.roll,
    rangeBand: result.rangeBand,
    disadvantage: result.disadvantage,
    improvised,
    landedAt,
  };
}
