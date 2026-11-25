/**
 * The D&D rules catalogue.
 *
 * Full D&D keeps every rule on. Custom Homebrew starts with every rule off. Hybrid D&D keeps the CORE, CONDITIONS, EQUIPMENT
 * and EXPLORATION groups locked on and lets each rule in the COMBAT, CASTING, REST and CLASS groups be switched on or off.
 *
 * `status` is honest about enforcement: 'wired' means the engine reads the switch today; 'pending' means the switch is stored
 * and shown but no engine path reads it yet, so the checklist labels it "not yet enforced".
 *
 * Source for the list: the rule inventory of the Open Game Master reference study (docs/rules-coverage.md), regrouped for
 * Dreamville. Ids are stable: stored profiles refer to them.
 */

export type RuleGroupId =
  | 'CORE'
  | 'CONDITIONS'
  | 'EQUIPMENT'
  | 'EXPLORATION'
  | 'COMBAT'
  | 'CASTING'
  | 'REST'
  | 'CLASS';

export type RuleEnforcement = 'wired' | 'pending';

export interface RuleGroup {
  id: RuleGroupId;
  label: string;
  /** Locked groups are always on in Hybrid and cannot be toggled. */
  locked: boolean;
  description: string;
}

export interface CatalogueRule {
  id: string;
  group: RuleGroupId;
  label: string;
  description: string;
  status: RuleEnforcement;
  /** Parent rule: this rule is effectively off whenever its parent is off. */
  requires?: string;
  /** Legacy RulesProfile mechanic this rule drives (kept in sync for Hybrid). */
  mechanic?: string;
  /** Optional variants start off in Full D&D and Hybrid (default true). */
  defaultOn?: boolean;
}

export const RULE_GROUPS: readonly RuleGroup[] = [
  { id: 'CORE', label: 'Core resolution', locked: true, description: 'Dice, the d20, hit points and death. Always on in Hybrid.' },
  { id: 'CONDITIONS', label: 'Conditions', locked: true, description: 'Condition effects, durations and exhaustion. Always on in Hybrid.' },
  { id: 'EQUIPMENT', label: 'Equipment', locked: true, description: 'Armor class, weapons, attunement and gear. Always on in Hybrid.' },
  { id: 'EXPLORATION', label: 'Exploration and survival', locked: true, description: 'Travel, hazards, food, water and light. Always on in Hybrid.' },
  { id: 'COMBAT', label: 'Combat', locked: false, description: 'Tactical combat rules you can switch on or off.' },
  { id: 'CASTING', label: 'Casting', locked: false, description: 'Spell slots, concentration and casting rules you can switch on or off.' },
  { id: 'REST', label: 'Rest and recovery', locked: false, description: 'Short rests, long rests and recovery you can switch on or off.' },
  { id: 'CLASS', label: 'Class features', locked: false, description: 'Class resources and signature abilities you can switch on or off.' },
];

const rule = (
  id: string,
  group: RuleGroupId,
  label: string,
  description: string,
  extra: Partial<Pick<CatalogueRule, 'status' | 'requires' | 'mechanic' | 'defaultOn'>> = {},
): CatalogueRule => ({ id, group, label, description, status: extra.status || 'pending', ...(extra.requires ? { requires: extra.requires } : {}), ...(extra.mechanic ? { mechanic: extra.mechanic } : {}), ...(extra.defaultOn === false ? { defaultOn: false } : {}) });

export const RULES_CATALOGUE: readonly CatalogueRule[] = [
  // CORE (locked)
  rule('core.dice', 'CORE', 'Dice are rolled by the engine', 'Every die is rolled in code; the narrator never states a roll.', { status: 'wired' }),
  rule('core.d20_resolution', 'CORE', 'd20 checks, saves and attacks', 'Roll d20 plus modifier against a difficulty or armor class.', { status: 'wired', mechanic: 'implicit_ability_checks' }),
  rule('core.attack_vs_ac', 'CORE', 'Attack roll against armor class', 'A hit needs a total that meets armor class; natural 20 hits, natural 1 misses.'),
  rule('core.ability_modifiers', 'CORE', 'Ability scores and proficiency', 'Modifiers from ability scores and the proficiency bonus by level.'),
  rule('core.hit_points', 'CORE', 'Hit points and damage', 'Damage reduces hit points; healing restores them up to the maximum.'),
  rule('core.death_at_zero', 'CORE', 'Falling at 0 hit points', 'Reaching 0 hit points drops a creature; death follows the dying rules.'),

  // CONDITIONS (locked)
  rule('conditions.effects', 'CONDITIONS', 'Condition effects', 'Blinded, charmed, frightened, poisoned, prone, stunned and the rest apply their listed effects.'),
  rule('conditions.durations', 'CONDITIONS', 'Durations and save-ends', 'Timed conditions count down and save-ends conditions allow repeat saves.'),
  rule('conditions.exhaustion', 'CONDITIONS', 'Exhaustion levels', 'Six exhaustion levels with cumulative penalties.'),
  rule('conditions.advantage_disadvantage', 'CONDITIONS', 'Advantage and disadvantage', 'Two d20s, take higher or lower; they never stack and cancel each other.'),

  // EQUIPMENT (locked)
  rule('equipment.armor_class', 'EQUIPMENT', 'Armor class from armor, shield and Dexterity', 'Worn armor, shield, Dexterity cap and magic bonuses set armor class.'),
  rule('equipment.weapon_properties', 'EQUIPMENT', 'Weapon properties', 'Finesse, light, heavy, reach, thrown, versatile and two-handed.'),
  rule('equipment.attunement', 'EQUIPMENT', 'Attunement', 'A character attunes to a limited number of magic items.'),
  rule('equipment.inventory_weight', 'EQUIPMENT', 'Carrying capacity', 'What a character can carry and the cost of carrying too much.'),
  rule('equipment.ammunition', 'EQUIPMENT', 'Ammunition is counted', 'Ranged weapons spend ammunition and recovery is limited.'),
  rule('equipment.commerce', 'EQUIPMENT', 'Coins and purchases', 'Prices, coin types and purchases through the inventory.'),

  // EXPLORATION (locked)
  rule('exploration.travel_pace', 'EXPLORATION', 'Travel pace and distance', 'Travel time depends on pace, terrain and mount.'),
  rule('exploration.light_and_vision', 'EXPLORATION', 'Light and vision', 'Darkness, dim light, darkvision and obscured areas.'),
  rule('exploration.hazards', 'EXPLORATION', 'Environmental hazards', 'Falling, fire, cold, heat, drowning and suffocation.'),
  rule('exploration.food_and_water', 'EXPLORATION', 'Food and water', 'Daily supplies and the cost of going without.'),
  rule('exploration.skill_checks', 'EXPLORATION', 'Skill checks and passive scores', 'Skills, passive Perception and group checks.'),

  // COMBAT
  rule('combat.tactical_combat', 'COMBAT', 'Tactical combat', 'Initiative, rounds, turns and positions on the board.', { status: 'wired', mechanic: 'dnd_tactical_combat' }),
  rule('combat.initiative', 'COMBAT', 'Initiative order', 'Roll initiative; act in order each round.', { requires: 'combat.tactical_combat', status: 'wired' }),
  rule('combat.action_economy', 'COMBAT', 'Action economy', 'One action, one bonus action, one reaction and movement per turn.', { requires: 'combat.tactical_combat', status: 'wired' }),
  rule('combat.opportunity_attacks', 'COMBAT', 'Opportunity attacks', 'Leaving a hostile creature’s reach provokes a reaction attack.', { requires: 'combat.action_economy', status: 'wired' }),
  rule('combat.cover', 'COMBAT', 'Cover', 'Half and three-quarters cover raise armor class and saves.', { requires: 'combat.tactical_combat', status: 'wired' }),
  rule('combat.flanking', 'COMBAT', 'Flanking', 'Flanking an enemy grants advantage on melee attacks (optional rule).', { requires: 'combat.tactical_combat', defaultOn: false, status: 'wired' }),
  rule('combat.surprise', 'COMBAT', 'Surprise', 'Surprised creatures lose their first turn.', { requires: 'combat.tactical_combat', status: 'wired' }),
  rule('combat.grapple_shove', 'COMBAT', 'Grapple and shove', 'Contested Athletics checks to hold or push a creature.', { requires: 'combat.action_economy', status: 'wired' }),
  rule('combat.two_weapon_fighting', 'COMBAT', 'Two-weapon fighting', 'An off-hand attack as a bonus action.', { requires: 'combat.action_economy', status: 'wired' }),
  rule('combat.extra_attack', 'COMBAT', 'Extra Attack', 'Multiple attacks when a character takes the Attack action.', { requires: 'combat.action_economy', status: 'wired' }),
  rule('combat.critical_extras', 'COMBAT', 'Critical hit extras', 'Doubled dice, improved critical range and brutal critical.', { status: 'wired' }),
  rule('combat.death_saves', 'COMBAT', 'Death saving throws', 'Three successes stabilise, three failures kill; natural 20 revives.', { status: 'wired' }),
  rule('combat.massive_damage', 'COMBAT', 'Massive damage', 'Damage equal to maximum hit points beyond 0 kills outright.', { requires: 'combat.death_saves', status: 'wired' }),
  rule('combat.falling_damage', 'COMBAT', 'Falling damage', '1d6 per 10 feet fallen, to a maximum of 20d6.', { status: 'wired' }),
  rule('combat.underwater', 'COMBAT', 'Underwater combat', 'Penalties for weapons and spells in water.', { status: 'wired' }),
  rule('combat.reactions', 'COMBAT', 'Reactions', 'Shield, Uncanny Dodge, Deflect Missiles and readied actions.', { requires: 'combat.action_economy', status: 'wired' }),

  // CASTING
  rule('casting.dnd_spell_rules', 'CASTING', 'Standard D&D spell rules', 'Spell levels, casting rules and spell lists follow D&D.', { status: 'wired', mechanic: 'standard_dnd_spell_rules' }),
  rule('casting.spell_slots', 'CASTING', 'Spell slots', 'Casting a leveled spell spends a slot of that level or higher.', { requires: 'casting.dnd_spell_rules', status: 'wired' }),
  rule('casting.cantrip_scaling', 'CASTING', 'Cantrip scaling', 'Cantrips grow stronger at levels 5, 11 and 17.', { requires: 'casting.dnd_spell_rules', status: 'wired' }),
  rule('casting.upcasting', 'CASTING', 'Upcasting', 'Higher slots strengthen spells that scale.', { requires: 'casting.spell_slots', status: 'wired' }),
  rule('casting.concentration', 'CASTING', 'Concentration', 'One concentration spell at a time; damage forces a Constitution save.', { requires: 'casting.dnd_spell_rules', status: 'wired' }),
  rule('casting.components', 'CASTING', 'Components and materials', 'Verbal, somatic and material components are required.', { requires: 'casting.dnd_spell_rules', status: 'wired' }),
  rule('casting.rituals', 'CASTING', 'Rituals and casting time', 'Ritual spells take ten extra minutes; long spells take time.', { requires: 'casting.dnd_spell_rules', status: 'wired' }),
  rule('casting.save_dc_attack_bonus', 'CASTING', 'Spell save DC and attack bonus', 'Computed from the caster’s ability score and proficiency.', { requires: 'casting.dnd_spell_rules' }),
  rule('casting.prepared_known_limits', 'CASTING', 'Spells known and prepared', 'Limits on spells known or prepared by class and level.', { requires: 'casting.dnd_spell_rules', status: 'wired' }),
  rule('casting.counterspell_dispel', 'CASTING', 'Counterspell and dispel magic', 'Spells that end or block other spells.', { requires: 'casting.dnd_spell_rules', status: 'wired' }),
  rule('casting.max_spell_level', 'CASTING', 'Spell level cap by character level', 'The highest spell level a caster can reach.', { requires: 'casting.dnd_spell_rules', status: 'wired' }),

  // REST
  rule('rest.recovery', 'REST', 'Rest and recovery rules', 'Rests restore hit points, slots and abilities.', { status: 'wired', mechanic: 'rest_recovery_rules' }),
  rule('rest.short_rest', 'REST', 'Short rest', 'One hour; spend hit dice to heal; some abilities return.', { requires: 'rest.recovery', status: 'wired' }),
  rule('rest.long_rest', 'REST', 'Long rest', 'Eight hours; restores hit points, spell slots and half your hit dice.', { requires: 'rest.recovery', status: 'wired' }),
  rule('rest.hit_dice', 'REST', 'Hit dice', 'Spend hit dice during rests to recover hit points.', { requires: 'rest.recovery', status: 'wired' }),
  rule('rest.slot_recovery', 'REST', 'Spell slots return on long rest', 'Turn off for casters who must find another way to recover.', { requires: 'rest.long_rest', status: 'wired' }),
  rule('rest.once_per_day_limit', 'REST', 'One long rest per day', 'A character benefits from only one long rest in 24 hours.', { requires: 'rest.long_rest', status: 'wired' }),
  rule('rest.gritty_realism', 'REST', 'Gritty realism rests', 'Short rest is a night, long rest is a week (variant).', { requires: 'rest.recovery', defaultOn: false, status: 'wired' }),

  // CLASS
  rule('class.rage', 'CLASS', 'Rage', 'Barbarian resistance and bonus damage while raging.', { status: 'wired' }),
  rule('class.sneak_attack', 'CLASS', 'Sneak Attack', 'Rogue extra damage with advantage or an ally nearby, once per turn.', { status: 'wired' }),
  rule('class.divine_smite', 'CLASS', 'Divine Smite', 'Paladin spends a slot for extra radiant damage on a hit.', { requires: 'casting.spell_slots', status: 'wired' }),
  rule('class.ki_and_martial_arts', 'CLASS', 'Ki and Martial Arts', 'Monk ki points, flurry of blows and the martial arts die.', { status: 'wired' }),
  rule('class.sorcery_points', 'CLASS', 'Sorcery points', 'Sorcerer points and metamagic.', { requires: 'casting.dnd_spell_rules', status: 'wired' }),
  rule('class.wild_shape', 'CLASS', 'Wild Shape', 'Druid transforms into beasts.', { status: 'wired' }),
  rule('class.channel_divinity', 'CLASS', 'Channel Divinity', 'Cleric and paladin channelled divine power.', { status: 'wired' }),
  rule('class.bardic_inspiration', 'CLASS', 'Bardic Inspiration', 'Bard dice granted to allies.', { status: 'wired' }),
  rule('class.fighter_features', 'CLASS', 'Fighter features', 'Second Wind, Action Surge, fighting styles and maneuvers.', { status: 'wired' }),
  rule('class.warlock_pacts', 'CLASS', 'Warlock pact magic', 'Few slots of one level that recover on a short rest.', { requires: 'casting.spell_slots', status: 'wired' }),
  rule('class.racial_traits', 'CLASS', 'Species traits', 'Darkvision, resistances, breath weapons and other species features.', { status: 'wired' }),
];

const BY_ID: ReadonlyMap<string, CatalogueRule> = new Map(RULES_CATALOGUE.map((entry) => [entry.id, entry]));
const GROUP_BY_ID: ReadonlyMap<RuleGroupId, RuleGroup> = new Map(RULE_GROUPS.map((group) => [group.id, group]));

export type RuleModeId = 'FULL_DND' | 'HYBRID_DND' | 'CUSTOM_HOMEBREW_DND';

export function getCatalogueRule(id: string): CatalogueRule | undefined {
  return BY_ID.get(id);
}

/** A rule is locked in Hybrid when its group is locked. */
export function isRuleLocked(id: string): boolean {
  const entry = BY_ID.get(id);
  return Boolean(entry && GROUP_BY_ID.get(entry.group)?.locked);
}

export function listRulesInGroup(group: RuleGroupId): CatalogueRule[] {
  return RULES_CATALOGUE.filter((entry) => entry.group === group);
}

/**
 * Keeps only known catalogue ids with boolean values. In Hybrid, locked rules are dropped (they cannot be changed).
 * Full D&D accepts no switches.
 */
export function sanitizeRuleToggles(raw: unknown, mode: RuleModeId): Record<string, boolean> {
  if (mode === 'FULL_DND' || !raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'boolean') continue;
    if (!BY_ID.has(id)) continue;
    if (mode === 'HYBRID_DND' && isRuleLocked(id)) continue;
    out[id] = value;
  }
  return out;
}

/**
 * Whether a rule applies under a mode and its switches.
 * - Full D&D: every standard rule; optional variants (defaultOn: false) stay off.
 * - Hybrid: locked groups always; others on unless switched off (variants start off).
 * - Custom Homebrew: off unless switched on.
 * A rule whose parent (`requires`) is off is off. An id outside the catalogue is on except in Custom Homebrew.
 */
export function isRuleEnabled(mode: RuleModeId, toggles: Record<string, boolean> | undefined, id: string, depth = 0): boolean {
  const entry = BY_ID.get(id);
  if (mode === 'FULL_DND') return entry?.defaultOn !== false;
  if (!entry) return mode !== 'CUSTOM_HOMEBREW_DND';
  if (depth > 8) return false;
  if (mode === 'HYBRID_DND' && isRuleLocked(id)) return true;
  const own = toggles && typeof toggles[id] === 'boolean' ? toggles[id] : mode === 'HYBRID_DND' && entry.defaultOn !== false;
  if (!own) return false;
  return entry.requires ? isRuleEnabled(mode, toggles, entry.requires, depth + 1) : true;
}
