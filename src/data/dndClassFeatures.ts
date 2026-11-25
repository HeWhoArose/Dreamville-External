/**
 * A starter library of D&D class and species features as progression modules, each feature tagged with the rules-catalogue id
 * it belongs to. A world opts in by registering these modules; while a feature's rule is switched off in the story's rules
 * profile, the feature is hidden, its passive modifiers do not apply, and its abilities cannot be used.
 *
 * What is real here: limited-use abilities carry charges that the progression engine enforces (consumeTriggeredAbility), and
 * passive modifiers use targets the combat engine already reads (armor class, speed, hit points, spell numbers).
 * What is descriptive: riders that add damage (Sneak Attack, Rage damage, Divine Smite) are listed as abilities with their rule
 * text; the combat engine does not roll them itself.
 */

export interface ClassFeatureAbility {
  id: string;
  name: string;
  description: string;
  trigger: 'PASSIVE' | 'ON_LEVEL_UP' | 'ON_ATTACK' | 'ON_DAMAGE_TAKEN' | 'ON_CAST' | 'ON_REST_START' | 'REACTION';
  activationMode: 'PASSIVE' | 'ACTIVE' | 'REACTION';
  charges?: number;
  cooldownTurns?: number;
}

export interface ClassFeatureModifier {
  id: string;
  target: string;
  mode: 'ADD' | 'MULTIPLY' | 'SET' | 'MIN' | 'MAX';
  value: number;
  precedence: number;
  stackGroup?: string;
}

export interface ClassFeatureDefinition {
  id: string;
  name: string;
  description: string;
  level: number;
  enabled: boolean;
  ruleId: string;
  passiveModifiers?: ClassFeatureModifier[];
  triggeredAbilities?: ClassFeatureAbility[];
}

export interface ClassFeatureModule {
  id: string;
  type: 'CLASS' | 'SUBCLASS' | 'SPECIES';
  name: string;
  version: number;
  enabled: boolean;
  features: ClassFeatureDefinition[];
  provenance: string;
}

const ability = (
  id: string,
  name: string,
  description: string,
  extra: Partial<Pick<ClassFeatureAbility, 'trigger' | 'activationMode' | 'charges' | 'cooldownTurns'>> = {},
): ClassFeatureAbility => ({
  id,
  name,
  description,
  trigger: extra.trigger || 'REACTION',
  activationMode: extra.activationMode || 'ACTIVE',
  ...(extra.charges !== undefined ? { charges: extra.charges } : {}),
  ...(extra.cooldownTurns !== undefined ? { cooldownTurns: extra.cooldownTurns } : {}),
});

const feature = (
  id: string,
  name: string,
  description: string,
  level: number,
  ruleId: string,
  extra: Pick<ClassFeatureDefinition, 'passiveModifiers' | 'triggeredAbilities'> = {},
): ClassFeatureDefinition => ({ id, name, description, level, enabled: true, ruleId, ...extra });

const SOURCE = 'dreamville:dnd-class-feature-library';

/** Sneak Attack grows by one d6 at every odd rogue level: 1d6 at level 1, 10d6 at level 19. */
const sneakDiceFeatures = (): ClassFeatureDefinition[] =>
  Array.from({ length: 10 }, (_, index) => {
    const level = index * 2 + 1;
    return feature(`dnd_rogue_sneak_dice_${level}`, `Sneak Attack dice (${index + 1}d6)`, `Sneak Attack deals an extra d6 at rogue level ${level}.`, level, 'class.sneak_attack', {
      passiveModifiers: [{ id: `dnd_rogue_sneak_dice_${level}_mod`, target: 'combat.sneakAttackDice', mode: 'ADD', value: 1, precedence: 10, stackGroup: `dnd_rogue_sneak_dice_${level}` }],
    });
  });

export const DND_CLASS_FEATURE_MODULES: readonly ClassFeatureModule[] = [
  {
    id: 'dnd_class_barbarian',
    type: 'CLASS',
    name: 'Barbarian',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      feature('dnd_barbarian_rage', 'Rage', 'In a rage: advantage on Strength checks and saves, bonus damage with Strength attacks, resistance to bludgeoning, piercing and slashing. Two uses before a long rest.', 1, 'class.rage', {
        triggeredAbilities: [ability('dnd_barbarian_rage_use', 'Rage', 'Enter a rage as a bonus action.', { charges: 2 })],
      }),
      feature('dnd_barbarian_extra_attack', 'Extra Attack', 'You can attack twice when you take the Attack action (two attacks).', 5, 'combat.extra_attack', {
        passiveModifiers: [{ id: 'dnd_barbarian_extra_attack_mod', target: 'combat.extraAttacks', mode: 'ADD', value: 1, precedence: 10, stackGroup: 'dnd_barbarian_extra_attack' }],
      }),
      feature('dnd_barbarian_rage_damage', 'Rage damage', 'While raging, melee attacks deal +2 damage.', 1, 'class.rage', {
        passiveModifiers: [{ id: 'dnd_barbarian_rage_damage_mod', target: 'combat.rageDamage', mode: 'ADD', value: 2, precedence: 10, stackGroup: 'dnd_rage_damage_1' }],
      }),
      feature('dnd_barbarian_rage_damage_9', 'Rage damage (level 9)', 'The rage damage bonus rises to +3.', 9, 'class.rage', {
        passiveModifiers: [{ id: 'dnd_barbarian_rage_damage_9_mod', target: 'combat.rageDamage', mode: 'ADD', value: 1, precedence: 10, stackGroup: 'dnd_rage_damage_9' }],
      }),
      feature('dnd_barbarian_rage_damage_16', 'Rage damage (level 16)', 'The rage damage bonus rises to +4.', 16, 'class.rage', {
        passiveModifiers: [{ id: 'dnd_barbarian_rage_damage_16_mod', target: 'combat.rageDamage', mode: 'ADD', value: 1, precedence: 10, stackGroup: 'dnd_rage_damage_16' }],
      }),
      feature('dnd_barbarian_fast_movement', 'Fast Movement', 'Your speed increases by 10 feet while you are not wearing heavy armor.', 5, 'class.rage', {
        passiveModifiers: [{ id: 'dnd_barbarian_fast_movement_speed', target: 'coreStats.speed', mode: 'ADD', value: 2, precedence: 10, stackGroup: 'dnd_fast_movement' }],
      }),
    ],
  },
  {
    id: 'dnd_class_rogue',
    type: 'CLASS',
    name: 'Rogue',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      ...sneakDiceFeatures(),
      feature('dnd_rogue_sneak_attack', 'Sneak Attack', 'Once per turn, extra damage on a hit when you have advantage or an ally is next to the target. 1d6 per two rogue levels, rounded up.', 1, 'class.sneak_attack', {
        triggeredAbilities: [ability('dnd_rogue_sneak_attack_rider', 'Sneak Attack', 'Extra damage rider on a qualifying hit, once per turn.', { trigger: 'ON_ATTACK', activationMode: 'PASSIVE' })],
      }),
    ],
  },
  {
    id: 'dnd_class_paladin',
    type: 'CLASS',
    name: 'Paladin',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      feature('dnd_paladin_divine_smite', 'Divine Smite', 'When you hit with a melee weapon you may spend a spell slot for 2d8 radiant damage, plus 1d8 per slot level above 1st (maximum 5d8).', 2, 'class.divine_smite', {
        triggeredAbilities: [ability('dnd_paladin_divine_smite_rider', 'Divine Smite', 'Spend a spell slot on a melee hit for extra radiant damage.', { trigger: 'ON_ATTACK', activationMode: 'ACTIVE' })],
      }),
      feature('dnd_paladin_extra_attack', 'Extra Attack', 'You can attack twice when you take the Attack action (two attacks).', 5, 'combat.extra_attack', {
        passiveModifiers: [{ id: 'dnd_paladin_extra_attack_mod', target: 'combat.extraAttacks', mode: 'ADD', value: 1, precedence: 10, stackGroup: 'dnd_paladin_extra_attack' }],
      }),
      feature('dnd_paladin_channel_divinity', 'Channel Divinity', 'Channel divine energy for an oath effect. One use per short or long rest.', 3, 'class.channel_divinity', {
        triggeredAbilities: [ability('dnd_paladin_channel_divinity_use', 'Channel Divinity', 'Use your oath’s Channel Divinity.', { charges: 1 })],
      }),
    ],
  },
  {
    id: 'dnd_class_cleric',
    type: 'CLASS',
    name: 'Cleric',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      feature('dnd_cleric_channel_divinity', 'Channel Divinity', 'Turn Undead and a domain effect. One use per short or long rest.', 2, 'class.channel_divinity', {
        triggeredAbilities: [ability('dnd_cleric_channel_divinity_use', 'Channel Divinity', 'Channel divine energy.', { charges: 1 })],
      }),
    ],
  },
  {
    id: 'dnd_class_fighter',
    type: 'CLASS',
    name: 'Fighter',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      feature('dnd_fighter_defense_style', 'Fighting Style: Defense', 'While wearing armor you gain +1 to armor class.', 1, 'class.fighter_features', {
        passiveModifiers: [{ id: 'dnd_fighter_defense_ac', target: 'coreStats.armorClass', mode: 'ADD', value: 1, precedence: 10, stackGroup: 'dnd_fighting_style_defense' }],
      }),
      feature('dnd_fighter_second_wind', 'Second Wind', 'As a bonus action, regain 1d10 plus your fighter level in hit points. One use per short or long rest.', 1, 'class.fighter_features', {
        triggeredAbilities: [ability('dnd_fighter_second_wind_use', 'Second Wind', 'Regain hit points as a bonus action.', { charges: 1 })],
      }),
      feature('dnd_fighter_extra_attack', 'Extra Attack', 'You can attack twice when you take the Attack action (two attacks).', 5, 'combat.extra_attack', {
        passiveModifiers: [{ id: 'dnd_fighter_extra_attack_mod', target: 'combat.extraAttacks', mode: 'ADD', value: 1, precedence: 10, stackGroup: 'dnd_fighter_extra_attack' }],
      }),
      feature('dnd_fighter_extra_attack_two', 'Extra Attack', 'You can attack again when you take the Attack action (an additional attack at this level).', 11, 'combat.extra_attack', {
        passiveModifiers: [{ id: 'dnd_fighter_extra_attack_two_mod', target: 'combat.extraAttacks', mode: 'ADD', value: 1, precedence: 10, stackGroup: 'dnd_fighter_extra_attack_two' }],
      }),
      feature('dnd_fighter_action_surge', 'Action Surge', 'Take one additional action on your turn. One use per short or long rest.', 2, 'class.fighter_features', {
        triggeredAbilities: [ability('dnd_fighter_action_surge_use', 'Action Surge', 'Take an additional action this turn.', { charges: 1 })],
      }),
    ],
  },
  {
    id: 'dnd_class_monk',
    type: 'CLASS',
    name: 'Monk',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      feature('dnd_monk_martial_arts', 'Martial Arts', 'Unarmed strikes and monk weapons use the martial arts die and Dexterity.', 1, 'class.ki_and_martial_arts'),
      feature('dnd_monk_ki', 'Ki', 'A pool of ki points fuels Flurry of Blows, Patient Defense and Step of the Wind. Two points at level 2.', 2, 'class.ki_and_martial_arts', {
        triggeredAbilities: [ability('dnd_monk_ki_spend', 'Spend ki', 'Spend a ki point on a monk feature.', { charges: 2 })],
      }),
      feature('dnd_monk_extra_attack', 'Extra Attack', 'You can attack twice when you take the Attack action (two attacks).', 5, 'combat.extra_attack', {
        passiveModifiers: [{ id: 'dnd_monk_extra_attack_mod', target: 'combat.extraAttacks', mode: 'ADD', value: 1, precedence: 10, stackGroup: 'dnd_monk_extra_attack' }],
      }),
      feature('dnd_monk_unarmored_movement', 'Unarmored Movement', 'Your speed increases by 10 feet while you wear no armor and no shield.', 2, 'class.ki_and_martial_arts', {
        passiveModifiers: [{ id: 'dnd_monk_unarmored_movement_speed', target: 'coreStats.speed', mode: 'ADD', value: 2, precedence: 10, stackGroup: 'dnd_unarmored_movement' }],
      }),
    ],
  },
  {
    id: 'dnd_class_sorcerer',
    type: 'CLASS',
    name: 'Sorcerer',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      feature('dnd_sorcerer_font_of_magic', 'Font of Magic', 'Sorcery points can be spent on metamagic or converted into spell slots. Two points at level 2.', 2, 'class.sorcery_points', {
        triggeredAbilities: [ability('dnd_sorcerer_sorcery_spend', 'Spend sorcery points', 'Spend a sorcery point on metamagic or a created slot.', { charges: 2 })],
      }),
    ],
  },
  {
    id: 'dnd_class_druid',
    type: 'CLASS',
    name: 'Druid',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      feature('dnd_druid_wild_shape', 'Wild Shape', 'Transform into a beast you have seen. Two uses per short or long rest.', 2, 'class.wild_shape', {
        triggeredAbilities: [ability('dnd_druid_wild_shape_use', 'Wild Shape', 'Assume the shape of a beast.', { charges: 2 })],
      }),
    ],
  },
  {
    id: 'dnd_class_bard',
    type: 'CLASS',
    name: 'Bard',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      feature('dnd_bard_inspiration', 'Bardic Inspiration', 'Give an ally an inspiration die to add to one roll. Uses equal your Charisma modifier (three here).', 1, 'class.bardic_inspiration', {
        triggeredAbilities: [ability('dnd_bard_inspiration_use', 'Bardic Inspiration', 'Grant an inspiration die as a bonus action.', { charges: 3 })],
      }),
    ],
  },
  {
    id: 'dnd_class_warlock',
    type: 'CLASS',
    name: 'Warlock',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      feature('dnd_warlock_pact_magic', 'Pact Magic', 'Few spell slots, all of one level, that return on a short rest.', 1, 'class.warlock_pacts', {
        triggeredAbilities: [ability('dnd_warlock_pact_slot', 'Pact slot', 'Spend a pact slot on a spell.', { charges: 1 })],
      }),
    ],
  },
  {
    id: 'dnd_species_dwarf',
    type: 'SPECIES',
    name: 'Dwarf',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      feature('dnd_dwarf_darkvision', 'Darkvision', 'You see in dim light within 60 feet as if it were bright, and in darkness as if it were dim.', 1, 'class.racial_traits'),
      feature('dnd_dwarf_toughness', 'Dwarven Toughness', 'Your hit point maximum increases by 1 and again each time you gain a level.', 1, 'class.racial_traits', {
        passiveModifiers: [{ id: 'dnd_dwarf_toughness_hp', target: 'coreStats.hpMax', mode: 'ADD', value: 1, precedence: 10, stackGroup: 'dnd_dwarven_toughness' }],
      }),
    ],
  },
  {
    id: 'dnd_species_wood_elf',
    type: 'SPECIES',
    name: 'Wood Elf',
    version: 1,
    enabled: true,
    provenance: SOURCE,
    features: [
      feature('dnd_wood_elf_fleet_of_foot', 'Fleet of Foot', 'Your base walking speed increases by 5 feet.', 1, 'class.racial_traits', {
        passiveModifiers: [{ id: 'dnd_wood_elf_speed', target: 'coreStats.speed', mode: 'ADD', value: 1, precedence: 10, stackGroup: 'dnd_fleet_of_foot' }],
      }),
    ],
  },
];

/** Every catalogue rule id used by the library, for coverage checks. */
export function classFeatureRuleIds(): string[] {
  return Array.from(new Set(DND_CLASS_FEATURE_MODULES.flatMap((module) => module.features.map((entry) => entry.ruleId))));
}

/** A deep copy of the library, safe to register as progression modules. */
export function getDndClassFeatureModules(): ClassFeatureModule[] {
  return JSON.parse(JSON.stringify(DND_CLASS_FEATURE_MODULES));
}
