import type { CharacterStoryMode, NarrativeProfile } from '../../src/types';

export interface NarrativeProfileResolution {
	profile: NarrativeProfile;
	source: 'RUN' | 'WORLD' | 'DEFAULT';
	warnings: string[];
}

const KNOWN_MODES: CharacterStoryMode[] = [
	'PROTAGONIST',
	'SIDE_CHARACTER',
	'FREE_ROAM',
];

function isNarrativeMode(value: unknown): value is CharacterStoryMode {
	return typeof value === 'string' && KNOWN_MODES.includes(value as CharacterStoryMode);
}

function cloneProfile(profile: NarrativeProfile): NarrativeProfile {
	return { ...profile };
}

export const narrativeProfileEngine = {
	createDefault(mode: CharacterStoryMode = 'PROTAGONIST'): NarrativeProfile {
		switch (mode) {
			case 'SIDE_CHARACTER':
				return {
					profileId: 'narrative.side_character.v1',
					version: 1,
					mode,
					camera: 'SUPPORTING_CAST',
					playerAgency: 'SUPPORTING_PLAYER',
					description: 'The player inhabits a supporting role while the wider world and its principal actors retain independent narrative momentum.',
				};
			case 'FREE_ROAM':
				return {
					profileId: 'narrative.free_roam.v1',
					version: 1,
					mode,
					camera: 'WORLD_SANDBOX',
					playerAgency: 'OPEN_AGENCY',
					description: 'The player has open-ended agency without a fixed protagonist framing; the world can continue to evolve independently.',
				};
			case 'PROTAGONIST':
			default:
				return {
					profileId: 'narrative.protagonist.v1',
					version: 1,
					mode: 'PROTAGONIST',
					camera: 'PLAYER_CENTRIC',
					playerAgency: 'PRIMARY_PLAYER',
					description: 'The player character is the primary narrative focus and major beats are framed around their choices and consequences.',
				};
		}
	},

	validate(profile: NarrativeProfile): string[] {
		const errors: string[] = [];

		if (!profile || typeof profile !== 'object') {
			return ['Narrative profile must be an object.'];
		}

		if (!isNarrativeMode(profile.mode)) {
			errors.push('Unsupported narrative mode: ' + String(profile.mode) + '.');
			return errors;
		}

		const expected = this.createDefault(profile.mode);
		if (profile.profileId !== expected.profileId) {
			errors.push('Narrative profileId "' + profile.profileId + '" does not match mode "' + profile.mode + '".');
		}
		if (profile.version !== expected.version) {
			errors.push('Unsupported narrative profile version: ' + String(profile.version) + '.');
		}
		if (profile.camera !== expected.camera) {
			errors.push('Narrative camera "' + String(profile.camera) + '" does not match mode "' + profile.mode + '".');
		}
		if (profile.playerAgency !== expected.playerAgency) {
			errors.push('Narrative playerAgency "' + String(profile.playerAgency) + '" does not match mode "' + profile.mode + '".');
		}
		if (!profile.description || typeof profile.description !== 'string') {
			errors.push('Narrative profile description is required.');
		}

		return errors;
	},

	resolve(input: {
		mode?: CharacterStoryMode | string | null;
		narrativeProfile?: Partial<NarrativeProfile> | NarrativeProfile | null;
		fallbackMode?: CharacterStoryMode | string;
		source?: 'RUN' | 'WORLD' | 'DEFAULT';
} = {}): NarrativeProfileResolution {
		const warnings: string[] = [];
		const explicitMode = isNarrativeMode(input.mode) ? input.mode : undefined;
		const suppliedProfileMode = isNarrativeMode(input.narrativeProfile?.mode)
			? input.narrativeProfile?.mode
			: undefined;

		if (input.mode !== undefined && input.mode !== null && !isNarrativeMode(input.mode)) {
			warnings.push('Unsupported narrative mode "' + String(input.mode) + '" was ignored.');
		}

		if (input.narrativeProfile && !suppliedProfileMode) {
			warnings.push('Narrative profile did not contain a supported mode and was ignored.');
		}

		if (explicitMode && suppliedProfileMode && explicitMode !== suppliedProfileMode) {
			warnings.push(
				'Explicit narrative mode "' + explicitMode + '" did not match persisted profile mode "' + suppliedProfileMode + '"; canonical mode wins.'
			);
		}

		const fallbackMode = isNarrativeMode(input.fallbackMode) ? input.fallbackMode : undefined;
		if (input.fallbackMode !== undefined && !fallbackMode) {
			warnings.push('Unsupported fallback narrative mode "' + String(input.fallbackMode) + '" was ignored.');
		}

		const mode = explicitMode || suppliedProfileMode || fallbackMode || 'PROTAGONIST';
		const profile = this.createDefault(mode);

		if (input.narrativeProfile) {
			const provided = input.narrativeProfile as Partial<NarrativeProfile>;
			if (provided.profileId && provided.profileId !== profile.profileId) {
				warnings.push(
					'Narrative profile identity "' + provided.profileId + '" was replaced by the canonical profile for mode "' + mode + '".'
				);
			}
			if (provided.camera && provided.camera !== profile.camera) {
				warnings.push('Narrative camera override "' + String(provided.camera) + '" was ignored.');
			}
			if (provided.playerAgency && provided.playerAgency !== profile.playerAgency) {
				warnings.push('Narrative agency override "' + String(provided.playerAgency) + '" was ignored.');
			}
			if (provided.description && provided.description !== profile.description) {
				warnings.push('Narrative profile description override was ignored in favor of the canonical mode description.');
			}
			if (provided.version !== undefined && provided.version !== profile.version) {
				warnings.push('Narrative profile version "' + String(provided.version) + '" was replaced with ' + profile.version + '.');
			}
		}

		return {
			profile: cloneProfile(profile),
			source: input.source || (explicitMode || suppliedProfileMode ? 'WORLD' : 'DEFAULT'),
			warnings,
		};
	},
};
