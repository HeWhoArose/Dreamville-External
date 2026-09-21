import {
	StoryRunVisualIdentity,
	WorldTemplate,
	WorldVisualIdentity,
} from '../../src/types';

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => {
			if (typeof entry === 'string') return entry;
			if (entry && typeof entry === 'object') {
				const candidate = entry as Record<string, unknown>;
				return String(candidate.name || candidate.title || candidate.id || '');
			}
			return '';
		})
		.map((value) => value.trim())
		.filter(Boolean);
}

function stringifyIfStructured(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value);
	} catch {
		return undefined;
	}
}

export class WorldVisualIdentityService {
	static buildWorldIdentity(world: WorldTemplate | any): WorldVisualIdentity {
		const geography = world?.geography;
		const visualMotifs = asStringArray(world?.artConfig?.visualMotifs);

		return {
			version: 1,
			kind: 'WORLD',
			worldId: String(world.worldId),
			title: String(world.title || 'Untitled World'),
			worldSummary: String(world.summary || world.description || ''),
			setting: world.setting || undefined,
			environment: world.environment || world.description || undefined,
			genreTags: asStringArray(world.genreTags),
			toneTags: asStringArray(world.toneTags),
			era: world.era || world.defaultEra || undefined,
			factions: asStringArray(world.factions),
			magicOrTechnology: stringifyIfStructured(world.magicRules),
			geography: stringifyIfStructured(geography),
			visualMotifs,
		};
	}

	static buildStoryRunIdentity(run: any, world: WorldTemplate | any): StoryRunVisualIdentity {
		const worldIdentity = this.buildWorldIdentity(world);
		const startingSituation =
			run?.startingSituation?.summary ||
			run?.startingSituation?.hook ||
			run?.startingSituation ||
			run?.initialScene ||
			'';
		const locationName =
			run?.startingLocation?.name ||
			run?.currentLocationName ||
			run?.currentLocation?.name ||
			'';
		const characterName = run?.characterName || run?.protagonist?.identity?.name || 'Protagonist';
		const storyTitle =
			run?.title ||
			run?.storyTitle ||
			run?.initialSceneTitle ||
			`Chronicle of ${worldIdentity.title}`;

		return {
			...worldIdentity,
			kind: 'STORY_RUN',
			storyId: String(run.storyId),
			worldId: worldIdentity.worldId,
			title: String(storyTitle),
			adventureContext: [
				locationName && `Starting location: ${locationName}`,
				characterName && `Protagonist: ${characterName}`,
				startingSituation && `Immediate situation: ${startingSituation}`,
			].filter(Boolean).join('. '),
			characterName,
			storyMode:
				run?.narrativeProfile?.mode ||
				run?.storyMode ||
				world?.narrativeProfile?.mode ||
				world?.storyMode ||
				'PROTAGONIST',
			dndRulesMode: run?.dndRulesMode || world?.dndRulesMode || world?.rulesetId || 'FULL_DND',
		};
	}
}

export const worldVisualIdentityService = WorldVisualIdentityService;
