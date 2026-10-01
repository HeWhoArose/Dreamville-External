import type {
  CharacterCoreStats,
  CharacterSkill,
  CharacterStartingConditionState,
  StoryCheckModifierSource,
  StoryCheckAbility,
  StoryCheckResult,
  StoryD20AdvantageState,
  StoryTestType,
  StoryCheckChallenge,
  StoryCheckNarrativeGuidance,
} from '../../src/types';
import { LocalDiceEngine } from './combatEngine';
import { rulesProfileEngine } from './rulesProfileEngine';
import { resolveSkillCheckFormula, normalizeDiceFormula } from '../../src/data/rulesDice';
import type { RulesProfile } from '../../src/types';
import { getAllStorySkillCheckDefinitions, getStorySkillCheckDefinition } from './storySkillCheckRegistry';
import { DEFAULT_DICE_THEME, getCanonicalDiceTheme, type DiceThemeId } from '../../src/data/diceThemes';

interface StoryCheckCharacter {
  coreStats?: CharacterCoreStats;
  skills?: CharacterSkill[];
  conditionState?: CharacterStartingConditionState;
  sceneText?: string;
}

interface StoryCheckResolutionHint {
  check?: {
    kind: 'ABILITY_CHECK' | 'SAVING_THROW' | 'NONE';
    skillId?: string;
    ability?: string;
  };
}

interface SaveProfile {
  ability: StoryCheckAbility;
  explicitKeywords: string[];
  sceneHazards: string[];
  actionTriggers: string[];
  dc: number;
  reason: string;
  triggerReason: string;
}

const SAVE_PROFILES: SaveProfile[] = [
  {
    ability: 'Dexterity',
    explicitKeywords: ['dodge', 'duck', 'evade', 'avoid the blast', 'leap clear', 'jump clear', 'roll away', 'get out of the way'],
    sceneHazards: [
      'collapsing',
      'collapse',
      'falling debris',
      'explosion',
      'blast',
      'trap',
      'fall',
      'cave-in',
      'slippery',
      'slick',
      'unstable',
      'unstable footing',
      'loose ground',
      'broken pavement',
      'treacherous terrain',
      'hazardous footing',
    ],
    actionTriggers: ['open', 'touch', 'step', 'walk', 'move', 'enter', 'approach', 'toward', 'towards', 'forward'],
    dc: 13,
    reason: 'Maintaining balance and control while traversing a physical hazard.',
    triggerReason: 'The current scene presents a physical hazard that makes ordinary traversal hazardous or uncertain, requiring a reflexive movement response.',
  },
  {
    ability: 'Constitution',
    explicitKeywords: ['resist poison', 'fight the poison', 'withstand the toxin', 'endure the fumes', 'hold my breath', 'breathe the gas', 'resist the disease', 'fight the venom'],
    sceneHazards: ['poison gas', 'toxic gas', 'fumes', 'venom', 'poison', 'disease', 'toxin', 'smoke'],
    actionTriggers: ['breathe', 'inhale', 'enter', 'walk', 'remain', 'endure'],
    dc: 13,
    reason: 'Withstanding a harmful physical or biological effect.',
    triggerReason: 'The scene exposes the character to a harmful physical or biological threat.',
  },
  {
    ability: 'Wisdom',
    explicitKeywords: ['resist fear', 'resist being charmed', 'resist the charm', 'resist the voice', 'resist possession', 'shake off the fear', 'fight the compulsion'],
    sceneHazards: ['terror', 'fear', 'dread', 'charm', 'compulsion', 'possession', 'supernatural voice'],
    actionTriggers: ['look', 'listen', 'hear', 'enter', 'approach', 'touch'],
    dc: 14,
    reason: 'Resisting a mental or supernatural influence.',
    triggerReason: 'The scene exerts a mental or supernatural influence that calls for resistance.',
  },
  {
    ability: 'Intelligence',
    explicitKeywords: ['resist the illusion', 'see through the illusion', 'break the illusion', 'resist the mind trick'],
    sceneHazards: ['illusion', 'mind trick', 'mental puzzle', 'memory attack'],
    actionTriggers: ['look', 'inspect', 'observe', 'touch'],
    dc: 14,
    reason: 'Resisting or recognizing a hostile mental distortion.',
    triggerReason: 'The scene contains a mental distortion that threatens to mislead or overwhelm the character.',
  },
  {
    ability: 'Charisma',
    explicitKeywords: ['resist banishment', 'resist possession', 'resist being displaced', 'assert my identity'],
    sceneHazards: ['banishment', 'possession', 'planar pull', 'soul pull'],
    actionTriggers: ['enter', 'touch', 'approach', 'resist'],
    dc: 15,
    reason: 'Resisting a force that attempts to displace or possess the character.',
    triggerReason: 'The scene contains a force attempting to displace, bind, or possess the character.',
  },
];

const CHECK_PROFILES = getAllStorySkillCheckDefinitions().map((definition) => ({
  skill: definition.name,
  skillId: definition.id,
  ability: definition.governingAbility,
  keywords: definition.keywords,
  dc: definition.defaultDc,
  reason: definition.description,
  requiresSight: definition.requiresSight,
}));

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
  const found = (skills || []).find((skill) =>
    skill.name.toLowerCase() === wanted ||
    skill.id.toLowerCase() === wanted
  );
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

function phraseMatches(normalizedText: string, keyword: string): boolean {
  const normalizedKeyword = normalize(keyword);
  if (!normalizedKeyword) return false;
  return (' ' + normalizedText + ' ').includes(' ' + normalizedKeyword + ' ');
}

function actionSupportsSkill(
  text: string,
  definition: { id: string; keywords: string[] },
): boolean {
  const normalizedText = normalize(text);
  return definition.keywords.some((keyword) => {
    const normalizedKeyword = normalize(keyword);
    return Boolean(normalizedKeyword) && phraseMatches(normalizedText, normalizedKeyword);
  });
}

function buildNarrativeGuidance(
  skillId: string | undefined,
  skillName: string,
  ability: string,
  challenge: StoryCheckChallenge | undefined,
  saveSelection: { profile: SaveProfile; worldTriggered: boolean } | null,
): StoryCheckNarrativeGuidance {
  if (challenge) {
    return {
      checkJustification:
        challenge.triggerReason ||
        challenge.reason ||
        'An authored ' + challenge.label + ' challenge applies to the attempted action.',
      successGuidance:
        challenge.onSuccess?.summary ||
        'The attempted action achieves its intended objective to the extent established by the canonical challenge.',
      failureGuidance:
        challenge.onFailure?.summary ||
        'The attempted action does not achieve its intended objective; establish an immediate setback without inventing damage or conditions not supplied by the challenge.',
      consequenceMode: challenge.onSuccess || challenge.onFailure ? 'AUTHORED_CANONICAL' : 'NARRATIVE_ONLY',
    };
  }

  if (saveSelection?.worldTriggered) {
    return {
      checkJustification: saveSelection.profile.triggerReason,
      successGuidance:
        'The character keeps control and gets through the immediate environmental or supernatural hazard.',
      failureGuidance:
        'The character does not cleanly overcome the hazard. Establish a scene-supported physical setback such as lost footing, slowed progress, or a brief stumble; do not invent damage, conditions, or a forced destination unless a canonical mechanic supplies them.',
      consequenceMode: 'NARRATIVE_ONLY',
    };
  }

  switch (skillId) {
    case 'acrobatics':
      return {
        checkJustification:
          'The action requires controlled balance, body placement, or a precise maneuver rather than ordinary movement.',
        successGuidance:
          'The maneuver is executed cleanly and the character maintains control of their intended movement toward the target.',
        failureGuidance:
          'The maneuver does not resolve cleanly: the character may misjudge a landing, lose balance, collide with nearby terrain, or lose forward progress. Do not invent injury or damage unless canonical mechanics supply it.',
        consequenceMode: 'NARRATIVE_ONLY',
      };
    case 'athletics':
      return {
        checkJustification:
          'The action requires meaningful physical exertion, leverage, climbing, jumping, swimming, or force against an object.',
        successGuidance:
          'The physical exertion achieves the attempted result with the intended momentum or leverage.',
        failureGuidance:
          'The physical effort does not achieve the intended result; the character may lose leverage, stall, or be forced to stop. Do not invent damage or object destruction unless canonical mechanics supply it.',
        consequenceMode: 'NARRATIVE_ONLY',
      };
    case 'stealth':
      return {
        checkJustification: 'The action deliberately relies on remaining concealed or moving without drawing notice.',
        successGuidance: 'The movement remains concealed to the extent supported by the current scene.',
        failureGuidance: 'The attempt creates a detectable sound, movement, or exposure risk, but do not invent an NPC reaction unless the current scene supports one.',
        consequenceMode: 'NARRATIVE_ONLY',
      };
    case 'perception':
    case 'investigation':
      return {
        checkJustification:
          'The action is an information-gathering attempt that uses ' + skillName + ' rather than ordinary observation.',
        successGuidance:
          'The character obtains a useful, scene-grounded observation without inventing hidden truth.',
        failureGuidance:
          'The intended information is not reliably obtained; preserve uncertainty and fall back to only what can be directly observed.',
        consequenceMode: 'NARRATIVE_ONLY',
      };
    default:
      return {
        checkJustification:
          'The attempted action materially relies on ' + skillName + ' (' + ability + ') and therefore has meaningful uncertainty.',
        successGuidance:
          'The intended objective is achieved to the extent supported by the current scene.',
        failureGuidance:
          'The attempted objective is not achieved cleanly. Establish the smallest immediate setback supported by the current scene without inventing unrelated consequences.',
        consequenceMode: 'NARRATIVE_ONLY',
      };
  }
}

export class StoryCheckEngine {
  private diceByStory = new Map<string, LocalDiceEngine>();

  public exportState(): Record<string, ReturnType<LocalDiceEngine['exportState']>> {
    const state: Record<string, ReturnType<LocalDiceEngine['exportState']>> = {};
    for (const [storyId, engine] of this.diceByStory.entries()) {
      state[storyId] = engine.exportState();
    }
    return state;
  }

  public importState(state: Record<string, Partial<ReturnType<LocalDiceEngine['exportState']>> | undefined>): void {
    this.diceByStory.clear();
    for (const [storyId, diceState] of Object.entries(state || {})) {
      const engine = this.dice(storyId);
      if (diceState) engine.importState(diceState);
    }
  }

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
    character: StoryCheckCharacter,
    challenge?: StoryCheckChallenge,
    rulesProfile?: RulesProfile,
    resolutionHint?: StoryCheckResolutionHint,
    diceThemeId?: DiceThemeId
  ): StoryCheckResult | null {
    const text = normalize(actionText);
    if (!text) return null;

    const effectiveRulesProfile = rulesProfile || rulesProfileEngine.createDefault('FULL_DND');
    const canonicalDiceTheme = getCanonicalDiceTheme(diceThemeId || DEFAULT_DICE_THEME);
    const hasAuthoredChallenge = Boolean(challenge);
    if (
      effectiveRulesProfile.requireAuthoredChallengeForCustomChecks &&
      !hasAuthoredChallenge
    ) {
      return null;
    }

    if (effectiveRulesProfile.mode === 'CUSTOM_HOMEBREW_DND' && challenge) {
      const resolutionMode = challenge.resolutionMode;
      if (resolutionMode === 'CUSTOM_D20') {
        return this.resolveCustomD20(storyId, challenge, diceThemeId);
      }
      if (resolutionMode === 'NARRATIVE') {
        return null;
      }
      if (resolutionMode !== 'DND_STANDARD') {
        // Custom challenges must explicitly opt into a resolution system. The
        // engine must never silently apply D&D mechanics in a custom world.
        return null;
      }
    }

    const sceneText = normalize(character.sceneText || '');
    const hintedCheck = resolutionHint?.check;
    const hintedAbility = hintedCheck?.ability && ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'].includes(hintedCheck.ability)
      ? hintedCheck.ability as StoryCheckAbility
      : undefined;
    const rawHintedSkillDefinition = hintedCheck?.skillId
      ? getStorySkillCheckDefinition(String(hintedCheck.skillId))
      : undefined;
    const hintedSkillDefinition =
      rawHintedSkillDefinition && actionSupportsSkill(text, rawHintedSkillDefinition)
        ? rawHintedSkillDefinition
        : undefined;
    const inferredSaveSelection = this.pickSaveProfile(text, sceneText);
    const hintedSaveProfile = hintedCheck?.kind === 'SAVING_THROW' && hintedAbility && inferredSaveSelection
      ? SAVE_PROFILES.find((profile) => profile.ability === hintedAbility)
      : undefined;
    let saveSelection = challenge?.savingThrowAbility
      ? {
          profile: {
            ability: challenge.savingThrowAbility,
            explicitKeywords: [],
            sceneHazards: [],
            actionTriggers: [],
            dc: challenge.difficultyClass,
            reason: challenge.reason || challenge.label,
            triggerReason: challenge.triggerReason || ('Authored challenge: ' + challenge.label + '.'),
          },
          worldTriggered: true,
        }
      : hintedSaveProfile
      ? {
          profile: {
            ...hintedSaveProfile,
            ability: hintedSaveProfile.ability,
            dc: hintedSaveProfile.dc,
            reason: hintedSaveProfile.reason,
            triggerReason: 'Action-resolution hint identified a saving-throw-shaped hazard; canonical save profile supplied the mechanics.',
          },
          worldTriggered: true,
        }
      : inferredSaveSelection;

    // A routine action remains narration-only unless the current world context
    // creates a real saving-throw trigger or an authored challenge requires one.
    if (
      !challenge &&
      !rulesProfileEngine.allowsImplicitSavingThrows(effectiveRulesProfile)
    ) {
      // An implicit save may not be invented when the active rules profile disables it.
      saveSelection = null;
    }

    if (
      !challenge &&
      !rulesProfileEngine.allowsImplicitAbilityChecks(effectiveRulesProfile)
    ) {
      // An implicit ability check may not be invented when the active rules profile disables it.
      return null;
    }

    if (!saveSelection && this.isRoutine(text)) return null;

    const explicitSkillDefinition = !saveSelection && challenge?.skill
      ? getStorySkillCheckDefinition(String(challenge.skill))
      : undefined;
    const normalizedExplicitSkillProfile = explicitSkillDefinition
      ? {
          skill: explicitSkillDefinition.name,
          skillId: explicitSkillDefinition.id,
          ability: explicitSkillDefinition.governingAbility,
          keywords: explicitSkillDefinition.keywords,
          dc: explicitSkillDefinition.defaultDc,
          reason: explicitSkillDefinition.description,
          requiresSight: explicitSkillDefinition.requiresSight,
        }
      : undefined;
    const normalizedHintedSkillProfile = hintedSkillDefinition
      ? {
          skill: hintedSkillDefinition.name,
          skillId: hintedSkillDefinition.id,
          ability: hintedSkillDefinition.governingAbility,
          keywords: hintedSkillDefinition.keywords,
          dc: hintedSkillDefinition.defaultDc,
          reason: hintedSkillDefinition.description,
          requiresSight: hintedSkillDefinition.requiresSight,
        }
      : undefined;
    const profile = saveSelection
      ? null
      : normalizedExplicitSkillProfile || normalizedHintedSkillProfile || this.pickProfile(text);
    if (!saveSelection && !profile) return null;

    const testType: StoryTestType = challenge?.testType
      || (hintedCheck?.kind === 'SAVING_THROW' ? 'SAVING_THROW' : saveSelection ? 'SAVING_THROW' : 'ABILITY_CHECK');
    const ability: StoryCheckAbility = ((challenge?.ability as StoryCheckAbility | undefined)
      || hintedAbility
      || (saveSelection ? saveSelection.profile.ability : profile?.ability)
      || 'STR') as StoryCheckAbility;
    const skillName = challenge?.skill || (saveSelection ? 'Saving Throw' : profile!.skill);
    const authoredSkill = !saveSelection
      ? (character.skills || []).find((skill) =>
          skill.name.toLowerCase() === String(skillName).toLowerCase() ||
          skill.id.toLowerCase() === String(skillName).toLowerCase()
        )
      : undefined;
    const rollFormula = challenge?.rollFormula
      ? normalizeDiceFormula(challenge.rollFormula, '1d20')
      : resolveSkillCheckFormula(
          effectiveRulesProfile.mode,
          authoredSkill?.checkFormula
        );

    const characterLevel = Math.max(1, Number(character.coreStats?.level ?? 1));
    const abilityMod = modifier(abilityScore(character.coreStats, ability));
    const levelProficiencyBonus = proficiencyBonus(characterLevel);
    const saveProficient = Boolean(
      saveSelection &&
      character.coreStats?.savingThrowProficiencies?.includes(ability)
    );
    const proficiencyLevelValue = saveSelection
      ? (saveProficient ? 'PROFICIENT' : 'NONE')
      : proficiencyLevel(character.skills, profile!.skill);
    const prof = proficiencyLevelValue === 'EXPERTISE'
      ? levelProficiencyBonus * 2
      : proficiencyLevelValue === 'PROFICIENT'
      ? levelProficiencyBonus
      : 0;
    const totalModifier = abilityMod + prof;
    const dc = challenge?.difficultyClass !== undefined
      ? challenge.difficultyClass
      : applyDcHint(text, saveSelection ? saveSelection.profile.dc : profile!.dc);

    const modifierSources: StoryCheckModifierSource[] = [
      { label: `${ability} modifier`, value: abilityMod, kind: 'ABILITY' },
    ];
    if (proficiencyLevelValue === 'EXPERTISE') {
      modifierSources.push({ label: 'Proficiency (Expertise)', value: prof, kind: 'EXPERTISE' });
    } else if (proficiencyLevelValue === 'PROFICIENT') {
      modifierSources.push({
        label: saveSelection ? 'Saving Throw Proficiency' : 'Proficiency',
        value: prof,
        kind: 'PROFICIENCY',
      });
    }

    const contextNotes: string[] = [];
    if (challenge) {
      contextNotes.push('Authored challenge: ' + challenge.label + '.');
    }
    if (saveSelection?.worldTriggered) {
      contextNotes.push(saveSelection.profile.triggerReason);
    }

    let advantage = false;
    let disadvantage = false;
    let forcedFailure = false;

    if (!saveSelection && profile!.requiresSight && containsCondition(character.conditionState, 'Blinded')) {
      forcedFailure = true;
      contextNotes.push('Blinded: sight-dependent checks automatically fail.');
    }
    if (!saveSelection && containsCondition(character.conditionState, 'Poisoned')) {
      disadvantage = true;
      contextNotes.push('Poisoned: Disadvantage on ability checks.');
    }

    if (
      !saveSelection &&
      profile!.skill === 'Perception' &&
      /\b(dark|darkness|dim light|fog|smoke|heavily obscured)\b/.test(sceneText)
    ) {
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

    const firstRoll = {
      ...this.dice(storyId).roll(rollFormula, totalModifier),
      diceThemeId: canonicalDiceTheme.id,
    };
    let roll = firstRoll;
    let selectedDieIndex = 0;

    // D&D advantage/disadvantage is defined for d20 tests. Hybrid authored
    // formulas such as 2d6 or 1d8 are still authoritative, but do not inherit
    // an invented d20 advantage mechanic.
    if (advantageState !== 'NORMAL' && rollFormula === '1d20') {
      const secondRoll = this.dice(storyId).roll('1d20', totalModifier);
      const firstValue = firstRoll.individualDice[0];
      const secondValue = secondRoll.individualDice[0];
      const keepFirst = advantageState === 'ADVANTAGE'
        ? firstValue >= secondValue
        : firstValue <= secondValue;
      selectedDieIndex = keepFirst ? 0 : 1;
      const selected = keepFirst ? firstValue : secondValue;
      roll = {
        ...firstRoll,
        diceThemeId: canonicalDiceTheme.id,
        rollId: `${firstRoll.rollId}_${secondRoll.rollId}`,
        formula: '2d20' + (totalModifier > 0 ? `+${totalModifier}` : totalModifier < 0 ? `${totalModifier}` : ''),
        diceTerms: [{ count: 2, sides: 20 }],
        individualDice: [firstValue, secondValue],
        modifier: totalModifier,
        total: selected + totalModifier,
        isCriticalSuccess: false,
        isCriticalFailure: false,
      };
    } else if (advantageState !== 'NORMAL' && rollFormula !== '1d20') {
      contextNotes.push(`${advantageState === 'ADVANTAGE' ? 'Advantage' : 'Disadvantage'} is not applied to authored ${rollFormula} resolution.`);
    }

    const success = forcedFailure ? false : roll.total >= dc;
    const criticalSuccess = false;
    const criticalFailure = false;
    const narrativeGuidance = buildNarrativeGuidance(
      profile?.skillId,
      skillName,
      String(ability),
      challenge,
      saveSelection,
    );

    return {
      checkId: `check_${storyId}_${roll.rollId}`,
      testType,
      skill: skillName,
      ability,

      difficultyClass: dc,
      proficiencyBonus: prof,
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
      reason: challenge?.reason || (saveSelection ? saveSelection.profile.reason : profile!.reason),
      contextNotes,
      worldTriggered: Boolean(challenge || saveSelection?.worldTriggered),
      triggerReason: challenge?.triggerReason || saveSelection?.profile.triggerReason,
      challengeId: challenge?.id,
      challengeLabel: challenge?.label,
      narrativeGuidance,
    };
  }

  private resolveCustomD20(
    storyId: string,
    challenge: StoryCheckChallenge,
    diceThemeId: DiceThemeId = DEFAULT_DICE_THEME
  ): StoryCheckResult {
    const rawModifier = Number((challenge as any).customModifier ?? 0);
    const customModifier = Number.isFinite(rawModifier) ? rawModifier : 0;
    const roll = {
      ...this.dice(storyId).roll('1d20', customModifier),
      diceThemeId: getCanonicalDiceTheme(diceThemeId).id,
    };
    const difficultyClass = challenge.difficultyClass;
    const success = roll.total >= difficultyClass;

    return {
      checkId: `custom_check_${storyId}_${roll.rollId}`,
      testType: 'CUSTOM_CHECK',
      skill: 'Custom Rule',
      ability: 'CUSTOM',
      difficultyClass,
      proficiencyBonus: 0,
      proficiencyLevel: 'NONE',
      abilityModifier: 0,
      totalModifier: customModifier,
      modifierSources: [
        { label: 'Custom rule modifier', value: customModifier, kind: 'CUSTOM_RULE' },
      ],
      advantageState: 'NORMAL',
      selectedDieIndex: 0,
      roll,
      total: roll.total,
      success,
      criticalSuccess: false,
      criticalFailure: false,
      reason: challenge.reason || challenge.label,
      contextNotes: [
        'CUSTOM_D20 resolution: no D&D ability, proficiency, saving-throw, or spell-slot rules were applied.',
      ],
      worldTriggered: true,
      triggerReason: challenge.triggerReason || `Authored custom challenge: ${challenge.label}.`,
      challengeId: challenge.id,
      challengeLabel: challenge.label,
      narrativeGuidance: buildNarrativeGuidance(
        undefined,
        'Custom Rule',
        'CUSTOM',
        challenge,
        null,
      ),
    };
  }

  private pickSaveProfile(
    text: string,
    sceneText: string
  ): { profile: SaveProfile; worldTriggered: boolean } | null {
    const explicit = SAVE_PROFILES
      .map((profile) => ({
        profile,
        score: profile.explicitKeywords.reduce(
          (score, keyword) => score + (phraseMatches(text, keyword) ? keyword.length + 2 : 0),
          0
        ),
        worldTriggered: false,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)[0];

    if (explicit) return explicit;

    const triggered = SAVE_PROFILES
      .map((profile) => {
        const hazardScore = profile.sceneHazards.reduce(
          (score, hazard) => score + (phraseMatches(sceneText, hazard) ? hazard.length + 2 : 0),
          0
        );
        const actionScore = profile.actionTriggers.reduce(
          (score, trigger) => score + (phraseMatches(text, trigger) ? trigger.length : 0),
          0
        );
        return {
          profile,
          score: hazardScore > 0 ? hazardScore + actionScore : 0,
          worldTriggered: true,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)[0];

    return triggered || null;
  }

  private pickProfile(text: string): (typeof CHECK_PROFILES)[number] | null {
    const candidates = CHECK_PROFILES
      .map((profile) => ({
        profile,
        score: profile.keywords.reduce(
          (score, keyword) => score + (phraseMatches(text, keyword) ? keyword.length + 1 : 0),
          0
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.profile.skillId.localeCompare(b.profile.skillId);
      });
    return candidates[0]?.profile || null;
  }

  private isRoutine(text: string): boolean {
    return /\b(inhale|breathe|breath|sit|stand up|rest|wait|look at the sky|walk forward|walk slowly|take a step|drink water|draw|sheathe)\b/.test(text)
      && !/\b(inspect|search|notice|avoid|hide|sneak|track|persuade|deceive|intimidate)\b/.test(text);
  }
}

export const storyCheckEngine = new StoryCheckEngine();
