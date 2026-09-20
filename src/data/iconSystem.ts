import { CharacterSkill, StartingEquipmentItem, ItemOrSkillIcon } from '../types';
import { getEquipmentClass } from './equipmentRulesEngine';

/**
  * Icon System Module
  * Deterministic defaults, prompt generation for AI image studio, provenance & state tracking.
  */

export function getDefaultIconForSkill(skill: CharacterSkill): ItemOrSkillIcon {
  if (skill.icon && skill.icon.url) {
    return skill.icon;
  }

  const name = (skill.name || '').toLowerCase();

  // Ability / Skill specific default emojis or category tags
  let emoji = '✨';
  if (name.includes('acrobat') || name.includes('athletics')) emoji = '🏃';
  else if (name.includes('arcana') || name.includes('magic')) emoji = '🪄';
  else if (name.includes('stealth') || name.includes('shadow')) emoji = '🥷';
  else if (name.includes('history') || name.includes('investigation')) emoji = '📜';
  else if (name.includes('nature') || name.includes('survival') || name.includes('animal')) emoji = '🌿';
  else if (name.includes('medicine') || name.includes('heal')) emoji = '🩺';
  else if (name.includes('deception') || name.includes('persuasion') || name.includes('intimidation')) emoji = '🗣️';
  else if (name.includes('perception') || name.includes('insight')) emoji = '👁️';
  else if (name.includes('religion')) emoji = '🛐';
  else if (name.includes('sleight')) emoji = '🤏';

  return {
    source: 'DEFAULT',
    status: 'DEFAULT',
    emoji,
    alt: `${skill.name} Icon`,
  };
}

export function getDefaultIconForEquipment(item: StartingEquipmentItem): ItemOrSkillIcon {
  if (item.icon && item.icon.url) {
    return item.icon;
  }

  const eqClass = getEquipmentClass(item);
  const name = (item.name || '').toLowerCase();

  let emoji = '📦';
  if (eqClass === 'WEAPON') {
    if (name.includes('bow')) emoji = '🏹';
    else if (name.includes('dagger') || name.includes('kunai')) emoji = '🗡️';
    else if (name.includes('staff')) emoji = '🧹';
    else if (name.includes('gun') || name.includes('pistol')) emoji = '🔫';
    else emoji = '⚔️';
  } else if (eqClass === 'ARMOR') {
    if (name.includes('helmet') || name.includes('cap')) emoji = '🪖';
    else if (name.includes('boots')) emoji = '👢';
    else if (name.includes('gloves')) emoji = '🧤';
    else emoji = '🛡️';
  } else if (eqClass === 'SHIELD') {
    emoji = '🛡️';
  } else if (eqClass === 'ACCESSORY') {
    if (name.includes('ring')) emoji = '💍';
    else if (name.includes('necklace') || name.includes('pendant')) emoji = '📿';
    else emoji = '👑';
  } else if (eqClass === 'POTION') {
    emoji = '🧪';
  } else if (eqClass === 'FOOD') {
    emoji = '🍎';
  } else if (eqClass === 'CONSUMABLE') {
    emoji = '💊';
  } else if (eqClass === 'TOOL') {
    if (name.includes('compass')) emoji = '🧭';
    else if (name.includes('map')) emoji = '🗺️';
    else emoji = '🔧';
  } else if (eqClass === 'DOCUMENT') {
    emoji = '📜';
  }

  return {
    source: 'DEFAULT',
    status: 'DEFAULT',
    emoji,
    alt: `${item.name} Icon`,
  };
}

export function generateIconPrompt(
  itemOrSkill: CharacterSkill | StartingEquipmentItem,
  type: 'SKILL' | 'EQUIPMENT',
  worldTitle?: string
): string {
  const name = itemOrSkill.name;
  const desc = itemOrSkill.description || '';
  const context = worldTitle ? `in the style of ${worldTitle}` : 'high-fantasy tabletop RPG style';

  if (type === 'SKILL') {
    const skill = itemOrSkill as CharacterSkill;
    return `Game skill icon badge for "${name}", governing ability ${skill.governingAbility}. ${desc}. Clean square vector icon, vibrant colors, dark background, ${context}.`;
  } else {
    const item = itemOrSkill as StartingEquipmentItem;
    const eqClass = getEquipmentClass(item);
    return `Game equipment icon badge for "${name}" (${eqClass}). ${desc}. Detailed inventory item art, crisp object lighting, dark square frame, ${context}.`;
  }
}
