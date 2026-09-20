import type {
  CharacterCoreStats,
  CharacterSkill,
  CharacterStartingConditionState,
  StoryCheckModifierSource,
  StoryCheckAbility,
  StoryCheckResult,
  StoryD20AdvantageState,
} from '../../src/types';
import { LocalDiceEngine } from './combatEngine';

interface StoryCheckCharacter {
  coreStats?: CharacterCoreStats;
  skills?: CharacterSkill[];
  conditionState?: CharacterStartingConditionState;
  sceneText?: string;
}

interface CheckProfile {
  skill: string;
  ability: StoryCheckAbility;
  keywords: string[];
  dc: number;
  reason: string;
  requiresSight?: boolean;
}

const CHECK_PROFILES: CheckProfile[] = [
  { skill: 'Perception', ability: 'Wisdom', keywords: ['look around', 'look', 'observe', 'notice', 'spot', 'scan', 'search', 'survey', 'watch', 'listen', 'hear', 'detect'], dc: 12, reason: 'Noticing something uncertain in the current scene.', requiresSight: true },
  { skill: 'Investigation', ability: 'Intelligence', keywords: ['investigate', 'examine', 'inspect', 'analyze', 'study', 'deduce', 'figure out', 'search the room'], dc: 12, reason: 'Reasoning from physical evidence or clues.' },
  { skill: 'Survival', ability: 'Wisdom', keywords: ['track', 'tracks', 'footprints', 'trail', 'forage', 'navigate', 'survive', 'follow the trail'], dc: 12, reason: 'Reading tracks, terrain, or environmental signs.' },
  { skill: 'Stealth', ability: 'Dexterity', keywords: ['sneak', 'hide', 'conceal', 'move quietly', 'stay hidden', 'creep'], dc: 12, reason: 'Avoiding notice while moving or acting.' },
  { skill: 'Athletics', ability: 'Strength', keywords: ['climb', 'jump', 'swim', 'grapple', 'force open', 'break open', 'lift', 'push', 'pull'], dc: 13, reason: 'Applying physical force or athletic skill.' },
  { skill: 'Acrobatics', ability: 'Dexterity', keywords: ['balance', 'acrobat', 'dodge', 'tumble', 'flip', 'squeeze'], dc: 13, reason: 'Maintaining balance, agility, or controlled movement.' },
  { skill: 'Arcana', ability: 'Intelligence', keywords: ['arcane', 'magic', 'rune', 'spell', 'ritual', 'enchantment', 'magical', 'arcana'], dc: 13, reason: 'Understanding magical phenomena or lore.' },
  { skill: 'Medicine', ability: 'Wisdom', keywords: ['treat', 'stabilize', 'diagnose', 'first aid', 'medicine', 'wound'], dc: 12, reason: 'Diagnosing or treating a physical condition.' },
  { skill: 'Nature', ability: 'Intelligence', keywords: ['plant', 'flora', 'fauna', 'animal', 'beast', 'natural', 'nature'], dc: 12, reason: 'Recognizing natural phenomena or creatures.' },
  { skill: 'History', ability: 'Intelligence', keywords: ['history', 'historical', 'ancient', 'remember', 'records', 'ruins'], dc: 13, reason: 'Recalling historical or cultural knowledge.' },
  { skill: 'Religion', ability: 'Intelligence', keywords: ['religion', 'deity', 'god', 'temple', 'holy', 'sacred', 'divine'], dc: 13, reason: 'Recognizing religious or divine knowledge.' },
  { skill: 'Persuasion', ability: 'Charisma', keywords: ['persuade', 'convince', 'negotiate', 'bargain', 'reason with'], dc: 12, reason: 'Influencing someone through honest persuasion.' },
  { skill: 'Deception', ability: 'Charisma', keywords: ['lie', 'deceive', 'mislead', 'bluff', 'pretend', 'disguise'], dc: 13, reason: 'Convincing others of something untrue or misleading.' },
  { skill: 'Intimidation', ability: 'Charisma', keywords: ['intimidate', 'threaten', 'coerce', 'scare'], dc: 12, reason: 'Using pressure or threat to influence someone.' },
  { skill: 'Animal Handling', ability: 'Wisdom', keywords: ['calm the horse', 'handle the beast', 'handle the animal', 'soothe the animal', 'calm the animal'], dc: 11, reason: 'Handling or calming an animal.' },
  { skill: 'Sleight of Hand', ability: 'Dexterity', keywords: ['pickpocket', 'palming', 'sleight', 'lift the coin', 'conceal the item'], dc: 13, reason: 'Performing precise manual manipulation unnoticed.' },
];

function modifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function abilityScore(core: CharacterCoreStats | undefined, ability: StoryCheckAbility): number {
  if (!core) return 10;
  const map: Record<StoryCheckAbility, number | undefined> = {
    Strength: core.strength,
    Dexterity: core.dexterity,
    Constitution: core.constitution,
    Intelligence: core.intelligence,
    Wisdom: core.wisdom,
    Charisma: core.charisma,
  };
  return Number(map[ability] ?? 10);
}

function proficiencyLevel(
  skills: CharacterSkill[] | undefined,
  skillName: string
): 'NONE' | 'PROFICIENT' | 'EXPERTISE' {
  const wanted = skillName.toLowerCase();
  const found = (skills || []).find((skill) => skill.name.toLowerCase() === wanted);
  if (!found) return 'NONE';
  return found.proficiency || (found.isExpertise ? 'EXPERTISE' : found.isProficient ? 'PROFICIENT' : 'NONE');
}

function proficiencyBonus(level: number): number {
  return Math.ceil(Math.max(1, Math.min(20, level)) / 4) + 1;
}

function applyDcHint(actionText: string, baseDc: number): number {
  const text = normalize(actionText);
  if (/\b(trivial|effortless|obvious|simple)\b/.test(text)) return Math.max(5, baseDc - 5);
  if (/\b(easy)\b/.test(text)) return Math.max(5, baseDc - 2);
  if (/\b(hard|difficult|challenging)\b/.test(text)) return baseDc + 3;
  if (/\b(very hard|extreme|nearly impossible)\b/.test(text)) return baseDc + 6;
  return baseDc;
}

function containsCondition(
  state: CharacterStartingConditionState | undefined,
  ...names: string[]
): boolean {
  if (!state?.instances?.length) return false;
  const wanted = names.map((name) => name.toLowerCase());
  return state.instances.some(
    (instance) =>
      wanted.includes(instance.name.toLowerCase()) ||
      wanted.includes(instance.definitionId.toLowerCase())
  );
}

export class StoryCheckEngine {
  private diceByStory = new Map<string, LocalDiceEngine>();

  private dice(storyId: string): LocalDiceEngine {
    let engine = this.diceByStory.get(storyId);
    if (!engine) {
      let seed = 1337;
      for (let i = 0; i < storyId.length; i++) seed = (seed * 31 + storyId.charCodeAt(i)) % 233280;
      engine = new LocalDiceEngine(seed);
      this.diceByStory.set(storyId, engine);
    }
    return engine;
  }

  public resolve(
    storyId: string,
    actionText: string,
    character: StoryCheckCharacter
  ): StoryCheckResult | null {
    const text = normalize(actionText);
    if (!text || this.isRoutine(text)) return null;

    const profile = this.pickProfile(text);
    if (!profile) return null;

    const characterLevel = Math.max(1, Number(character.coreStats?.level ?? 1));
    const abilityMod = modifier(abilityScore(character.coreStats, profile.ability));
    const levelProficiencyBonus = proficiencyBonus(characterLevel);
    const proficiencyLevelValue = proficiencyLevel(character.skills, profile.skill);
    const prof = proficiencyLevelValue === 'EXPERTISE'
      ? levelProficiencyBonus * 2
      : proficiencyLevelValue === 'PROFICIENT'
      ? levelProficiencyBonus
      : 0;
    const totalModifier = abilityMod + prof;
    const dc = applyDcHint(text, profile.dc);

    const modifierSources: StoryCheckModifierSource[] = [
      { label: `${profile.ability} modifier`, value: abilityMod, kind: 'ABILITY' },
    ];
    if (proficiencyLevelValue === 'EXPERTISE') {
      modifierSources.push({ label: 'Proficiency (Expertise)', value: prof, kind: 'EXPERTISE' });
    } else if (proficiencyLevelValue === 'PROFICIENT') {
      modifierSources.push({ label: 'Proficiency', value: prof, kind: 'PROFICIENCY' });
    }

    const contextNotes: string[] = [];
    let advantage = false;
    let disadvantage = false;
    let forcedFailure = false;

    if (profile.requiresSight && containsCondition(character.conditionState, 'Blinded')) {
      forcedFailure = true;
      contextNotes.push('Blinded: sight-dependent checks automatically fail.');
    }
    if (containsCondition(character.conditionState, 'Poisoned')) {
      disadvantage = true;
      contextNotes.push('Poisoned: Disadvantage on ability checks.');
    }

    const sceneText = normalize(character.sceneText || '');
    if (profile.skill === 'Perception' && /\b(dark|darkness|dim light|fog|smoke|heavily obscured)\b/.test(sceneText)) {
      disadvantage = true;
      contextNotes.push('The scene obscures sight: Disadvantage on this Perception check.');
    }

    if (advantage && disadvantage) {
      contextNotes.push('Advantage and Disadvantage cancel.');
      advantage = false;
      disadvantage = false;
    }

    const advantageState: StoryD20AdvantageState = advantage
      ? 'ADVANTAGE'
      : disadvantage
      ? 'DISADVANTAGE'
      : 'NORMAL';

    const firstRoll = this.dice(storyId).roll('1d20', 0);
    let roll = firstRoll;
    let selectedDieIndex = 0;

    if (advantageState !== 'NORMAL') {
      const secondRoll = this.dice(storyId).roll('1d20', 0);
      const firstValue = firstRoll.individualDice[0];
      const secondValue = secondRoll.individualDice[0];
      const keepFirst = advantageState === 'ADVANTAGE'
        ? firstValue >= secondValue
        : firstValue <= secondValue;
      selectedDieIndex = keepFirst ? 0 : 1;
      const selected = keepFirst ? firstValue : secondValue;
      roll = {
        ...firstRoll,
        rollId: `${firstRoll.rollId}_${secondRoll.rollId}`,
        formula: '2d20',
        diceTerms: [{ count: 2, sides: 20 }],
        individualDice: [firstValue, secondValue],
        modifier: totalModifier,
        total: selected + totalModifier,
        isCriticalSuccess: false,
        isCriticalFailure: false,
      };
    } else {
      roll = {
        ...firstRoll,
        modifier: totalModifier,
        total: firstRoll.individualDice[0] + totalModifier,
        isCriticalSuccess: false,
        isCriticalFailure: false,
      };
    }

    const success = forcedFailure ? false : roll.total >= dc;
    const criticalSuccess = false;
    const criticalFailure = false;

    return {
      checkId: `check_${storyId}_${roll.rollId}`,
      skill: profile.skill,
      ability: profile.ability,
      difficultyClass: dc,
      proficiencyBonus: levelProficiencyBonus,
      proficiencyLevel: proficiencyLevelValue,
      abilityModifier: abilityMod,
      totalModifier,
      modifierSources,
      advantageState,
      selectedDieIndex,
      roll,
      total: roll.total,
      success,
      criticalSuccess,
      criticalFailure,
      reason: profile.reason,
      contextNotes,
    };
  }
  private pickProfile(text: string): CheckProfile | null {
    const candidates = CHECK_PROFILES
      .map((profile) => ({
        profile,
        score: profile.keywords.reduce((score, keyword) => score + (text.includes(normalize(keyword)) ? keyword.length + 1 : 0), 0),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.profile || null;
  }

  private isRoutine(text: string): boolean {
    return /\b(inhale|breathe|breath|sit|stand up|rest|wait|look at the sky|walk forward|walk slowly|take a step|drink water|draw|sheathe)\b/.test(text)
      && !/\b(inspect|search|notice|avoid|hide|sneak|track|persuade|deceive|intimidate)\b/.test(text);
  }
}

export const storyCheckEngine = new StoryCheckEngine();
