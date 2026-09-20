import { CharacterSkill, CharacterCoreStats } from '../types';

export interface StandardDndSkillDef {
  id: string;
  name: string;
  governingAbility: 'Strength' | 'Dexterity' | 'Constitution' | 'Intelligence' | 'Wisdom' | 'Charisma';
  description: string;
}

export const STANDARD_DND_SKILLS_CATALOG: StandardDndSkillDef[] = [
  {
    id: 'acrobatics',
    name: 'Acrobatics',
    governingAbility: 'Dexterity',
    description: 'Balancing on tight ropes, staying upright on icy surfaces, performing flips or gymnastic maneuvers.',
  },
  {
    id: 'animal_handling',
    name: 'Animal Handling',
    governingAbility: 'Wisdom',
    description: 'Calming down a domesticated or wild animal, intuiting an animal’s intentions, controlling a mount.',
  },
  {
    id: 'arcana',
    name: 'Arcana',
    governingAbility: 'Intelligence',
    description: 'Recalling lore about spells, magic items, eldritch symbols, magical traditions, and planes of existence.',
  },
  {
    id: 'athletics',
    name: 'Athletics',
    governingAbility: 'Strength',
    description: 'Climbing steep cliffs, jumping long distances, swimming in turbulent waters, grappling or shoving opponents.',
  },
  {
    id: 'deception',
    name: 'Deception',
    governingAbility: 'Charisma',
    description: 'Hiding the truth through lie telling, misleading statements, fast-talking, or maintaining a disguise.',
  },
  {
    id: 'history',
    name: 'History',
    governingAbility: 'Intelligence',
    description: 'Recalling lore about historical events, legendary figures, ancient kingdoms, past disputes, and warfare.',
  },
  {
    id: 'insight',
    name: 'Insight',
    governingAbility: 'Wisdom',
    description: 'Determining the true intentions or motives of a creature, picking up on lies, sensing empathy or nervous tics.',
  },
  {
    id: 'intimidation',
    name: 'Intimidation',
    governingAbility: 'Charisma',
    description: 'Influencing someone through overt threats, hostile actions, physical presence, or psychological pressure.',
  },
  {
    id: 'investigation',
    name: 'Investigation',
    governingAbility: 'Intelligence',
    description: 'Searching for hidden clues, deducing the sequence of events from crime scenes, analyzing complex puzzles.',
  },
  {
    id: 'medicine',
    name: 'Medicine',
    governingAbility: 'Wisdom',
    description: 'Diagnosing illnesses, stabilizing dying companions, treating wounds, determining cause of death.',
  },
  {
    id: 'nature',
    name: 'Nature',
    governingAbility: 'Intelligence',
    description: 'Recalling lore about terrain, flora and fauna, weather patterns, ecosystems, and natural hazards.',
  },
  {
    id: 'perception',
    name: 'Perception',
    governingAbility: 'Wisdom',
    description: 'Noticing sensory details, spotting hidden ambushers, hearing faint whispers or footsteps, subtle environmental shifts.',
  },
  {
    id: 'performance',
    name: 'Performance',
    governingAbility: 'Charisma',
    description: 'Engaging an audience through music, dance, acting, storytelling, or theatrical presentation.',
  },
  {
    id: 'persuasion',
    name: 'Persuasion',
    governingAbility: 'Charisma',
    description: 'Influencing someone with tact, grace, good nature, diplomacy, or convincing well-reasoned arguments.',
  },
  {
    id: 'religion',
    name: 'Religion',
    governingAbility: 'Intelligence',
    description: 'Recalling lore about deities, sacred rites, holy symbols, religious hierarchies, cults, and divine mythologies.',
  },
  {
    id: 'sleight_of_hand',
    name: 'Sleight of Hand',
    governingAbility: 'Dexterity',
    description: 'Performing manual trickery, pickpocketing small objects, concealing weapons or tools on your person.',
  },
  {
    id: 'stealth',
    name: 'Stealth',
    governingAbility: 'Dexterity',
    description: 'Moving silently, slipping into shadows, hiding behind cover, avoiding visual and auditory detection.',
  },
  {
    id: 'survival',
    name: 'Survival',
    governingAbility: 'Wisdom',
    description: 'Tracking quarry, guiding a party through wilderness, identifying edible plants, predicting weather.',
  },
];

export function getInitialDndSkills(existingSkills: CharacterSkill[] = []): CharacterSkill[] {
  const existingMap = new Map<string, CharacterSkill>();
  existingSkills.forEach((s) => {
    existingMap.set(s.id.toLowerCase(), s);
    existingMap.set(s.name.toLowerCase(), s);
  });

  const standardList: CharacterSkill[] = STANDARD_DND_SKILLS_CATALOG.map((def) => {
    const existing = existingMap.get(def.id.toLowerCase()) || existingMap.get(def.name.toLowerCase());
    if (existing) {
      return {
        ...existing,
        id: def.id,
        name: def.name,
        governingAbility: def.governingAbility,
        description: def.description,
        proficiency: existing.proficiency || (existing.isProficient ? 'PROFICIENT' : 'NONE'),
        isProficient: existing.proficiency === 'PROFICIENT' || existing.isProficient || false,
        isExpertise: existing.proficiency === 'EXPERTISE' || existing.isExpertise || false,
        isCustom: false,
        provenance: existing.provenance || 'SYSTEM_DERIVED',
      };
    }

    return {
      id: def.id,
      name: def.name,
      governingAbility: def.governingAbility,
      proficiency: 'NONE',
      isProficient: false,
      isExpertise: false,
      isCustom: false,
      description: def.description,
      provenance: 'SYSTEM_DERIVED',
    };
  });

  // Keep any custom skills the user created
  const customSkills = existingSkills.filter(
    (s) => s.isCustom || (!STANDARD_DND_SKILLS_CATALOG.some((d) => d.id === s.id || d.name.toLowerCase() === s.name.toLowerCase()))
  );

  return [...standardList, ...customSkills];
}

export function calculateAbilityModifier(abilityScore: number = 10): number {
  return Math.floor((abilityScore - 10) / 2);
}

export function calculateProficiencyBonus(level: number = 1): number {
  return Math.ceil(level / 4) + 1;
}

export function calculateSkillModifier(skill: CharacterSkill, coreStats?: CharacterCoreStats): { modNumber: number; modString: string } {
  if (!coreStats) {
    return { modNumber: 0, modString: '+0' };
  }

  const abilityName = (skill.governingAbility || 'Strength').toLowerCase();
  let abilityVal = 10;
  if (abilityName.includes('str')) abilityVal = coreStats.strength ?? 10;
  else if (abilityName.includes('dex')) abilityVal = coreStats.dexterity ?? 10;
  else if (abilityName.includes('con')) abilityVal = coreStats.constitution ?? 10;
  else if (abilityName.includes('int')) abilityVal = coreStats.intelligence ?? 10;
  else if (abilityName.includes('wis')) abilityVal = coreStats.wisdom ?? 10;
  else if (abilityName.includes('cha')) abilityVal = coreStats.charisma ?? 10;

  const baseMod = calculateAbilityModifier(abilityVal);
  const profBonus = calculateProficiencyBonus(coreStats.level || 1);

  let totalMod = baseMod;
  if (skill.proficiency === 'EXPERTISE' || skill.isExpertise) {
    totalMod += profBonus * 2;
  } else if (skill.proficiency === 'PROFICIENT' || skill.isProficient) {
    totalMod += profBonus;
  }

  const modString = totalMod >= 0 ? `+${totalMod}` : `${totalMod}`;
  return { modNumber: totalMod, modString };
}
