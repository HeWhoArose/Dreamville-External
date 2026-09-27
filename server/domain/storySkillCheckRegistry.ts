import { STANDARD_DND_SKILLS_CATALOG, type StandardDndSkillDef } from '../../src/data/dndSkillsCatalog';

export interface StorySkillCheckDefinition extends StandardDndSkillDef {
	defaultDc: number;
	keywords: string[];
	requiresSight?: boolean;
}

const KEYWORDS: Record<string, { keywords: string[]; defaultDc: number; requiresSight?: boolean }> = {
	acrobatics: {
		keywords: ['balance', 'acrobat', 'dodge', 'tumble', 'flip', 'squeeze'],
		defaultDc: 13,
	},
	animal_handling: {
		keywords: [
			'calm the horse',
			'calm the frightened horse',
			'calm a horse',
			'handle the beast',
			'handle the animal',
			'soothe the animal',
			'calm the animal',
			'animal handling',
			'tame the animal',
			'tame the beast',
			'control the mount',
			'calm the mount',
		],
		defaultDc: 11,
	},
	arcana: {
		keywords: ['arcane', 'magic', 'rune', 'spell', 'ritual', 'enchantment', 'magical', 'arcana'],
		defaultDc: 13,
	},
	athletics: {
		keywords: ['climb', 'jump', 'swim', 'grapple', 'force open', 'break open', 'lift', 'push', 'pull'],
		defaultDc: 13,
	},
	deception: {
		keywords: ['lie', 'deceive', 'mislead', 'bluff', 'pretend', 'disguise'],
		defaultDc: 13,
	},
	history: {
		keywords: ['history', 'historical', 'ancient', 'remember', 'records', 'ruins'],
		defaultDc: 13,
	},
	insight: {
		keywords: [
			'read them',
			'read him',
			'read her',
			'read the room',
			'detect lie',
			'detect lies',
			'motive',
			'motives',
			'intuition',
			'sense their intent',
			'sense his intent',
			'sense her intent',
			'insight',
		],
		defaultDc: 12,
	},
	intimidation: {
		keywords: ['intimidate', 'threaten', 'coerce', 'scare'],
		defaultDc: 12,
	},
	investigation: {
		keywords: ['investigate', 'examine', 'inspect', 'analyze', 'study', 'deduce', 'figure out', 'search the room'],
		defaultDc: 12,
	},
	medicine: {
		keywords: ['treat', 'stabilize', 'diagnose', 'first aid', 'medicine', 'wound'],
		defaultDc: 12,
	},
	nature: {
		keywords: ['flora', 'fauna', 'beast', 'natural', 'nature', 'wildlife', 'plants'],
		defaultDc: 12,
	},
	perception: {
		keywords: ['look around', 'look', 'observe', 'notice', 'spot', 'scan', 'search', 'survey', 'watch', 'listen', 'hear', 'detect'],
		defaultDc: 12,
		requiresSight: true,
	},
	performance: {
		keywords: ['perform', 'performance', 'sing', 'dance', 'act', 'play music', 'play an instrument', 'entertain', 'entertaining', 'recite', 'stage'],
		defaultDc: 12,
	},
	persuasion: {
		keywords: ['persuade', 'convince', 'negotiate', 'bargain', 'reason with'],
		defaultDc: 12,
	},
	religion: {
		keywords: ['religion', 'deity', 'god', 'temple', 'holy', 'sacred', 'divine'],
		defaultDc: 13,
	},
	sleight_of_hand: {
		keywords: ['pickpocket', 'palming', 'sleight', 'lift the coin', 'conceal the item'],
		defaultDc: 13,
	},
	stealth: {
		keywords: ['sneak', 'hide', 'conceal', 'move quietly', 'stay hidden', 'creep'],
		defaultDc: 12,
	},
	survival: {
		keywords: ['track', 'tracks', 'footprints', 'trail', 'forage', 'navigate', 'survive', 'follow the trail'],
		defaultDc: 12,
	},
};

const definitions: StorySkillCheckDefinition[] = STANDARD_DND_SKILLS_CATALOG.map((skill) => {
	const config = KEYWORDS[skill.id];
	if (!config) {
		throw new Error(`Missing story-check registration for standard skill '${skill.id}'.`);
	}
	return {
		...skill,
		defaultDc: config.defaultDc,
		keywords: [...config.keywords],
		requiresSight: config.requiresSight,
	};
});

export const STORY_SKILL_CHECK_REGISTRY = definitions as readonly StorySkillCheckDefinition[];

const BY_ID = new Map(STORY_SKILL_CHECK_REGISTRY.map((definition) => [definition.id, definition]));
const BY_NAME = new Map(STORY_SKILL_CHECK_REGISTRY.map((definition) => [definition.name.toLowerCase(), definition]));

export function getStorySkillCheckDefinition(skillIdOrName: string): StorySkillCheckDefinition | undefined {
	const normalized = String(skillIdOrName || '').trim().toLowerCase();
	return BY_ID.get(normalized) || BY_NAME.get(normalized);
}

export function getAllStorySkillCheckDefinitions(): StorySkillCheckDefinition[] {
	return STORY_SKILL_CHECK_REGISTRY.map((definition) => ({
		...definition,
		keywords: [...definition.keywords],
	}));
}
