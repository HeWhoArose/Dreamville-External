import type { NarrativeProfile } from '../../src/types';

export interface NarratorVoiceControls {
	enabled: boolean;
	voiceProfileId?: string;
	cadence?: 'MEASURED' | 'BRISK' | 'LYRICAL' | 'CONVERSATIONAL';
	descriptiveDensity?: 'LEAN' | 'BALANCED' | 'RICH';
	emotionalDistance?: 'INTIMATE' | 'CLOSE' | 'OBSERVATIONAL' | 'DISTANT';
	metaphorDensity?: 'LOW' | 'MODERATE' | 'HIGH';
	humorLevel?: 'NONE' | 'SUBTLE' | 'PLAYFUL';
	intensity?: 'CALM' | 'GROUNDED' | 'DARK' | 'HIGH_STAKES';
	sensoryPreference?: 'BALANCED' | 'VISUAL' | 'AUDITORY' | 'TACTILE' | 'ENVIRONMENTAL';
	formality?: 'PLAIN' | 'LITERARY' | 'ELEVATED';
	forbiddenPatterns?: string[];
}

export interface NarratorVoiceState {
	version: 1;
	profileId: string;
	cadence: NonNullable<NarratorVoiceControls['cadence']>;
	descriptiveDensity: NonNullable<NarratorVoiceControls['descriptiveDensity']>;
	emotionalDistance: NonNullable<NarratorVoiceControls['emotionalDistance']>;
	metaphorDensity: NonNullable<NarratorVoiceControls['metaphorDensity']>;
	humorLevel: NonNullable<NarratorVoiceControls['humorLevel']>;
	intensity: NonNullable<NarratorVoiceControls['intensity']>;
	sensoryPreference: NonNullable<NarratorVoiceControls['sensoryPreference']>;
	formality: NonNullable<NarratorVoiceControls['formality']>;
	forbiddenPatterns: string[];
}

export interface NarratorVoiceStore {
	getUserData(namespace: string, key: string): any | null;
	saveUserData(namespace: string, key: string, value: any): void;
}

const NAMESPACE = 'narrative.voice';
const DEFAULTS: Omit<NarratorVoiceState, 'profileId'> = {
	version: 1,
	cadence: 'MEASURED',
	descriptiveDensity: 'BALANCED',
	emotionalDistance: 'CLOSE',
	metaphorDensity: 'LOW',
	humorLevel: 'SUBTLE',
	intensity: 'GROUNDED',
	sensoryPreference: 'BALANCED',
	formality: 'LITERARY',
	forbiddenPatterns: [],
};

function defaultProfileId(profile?: NarrativeProfile | null): string {
	return profile?.profileId ? 'voice.' + profile.profileId : 'voice.dreamville.default.v1';
}

function sanitizeList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 24);
}

export class NarratorVoiceEngine {
	public static readonly NAMESPACE = NAMESPACE;

	public static resolve(
		store: NarratorVoiceStore,
		storyId: string,
		profile?: NarrativeProfile | null,
		controls: NarratorVoiceControls = { enabled: true },
	): NarratorVoiceState {
		const persisted = store.getUserData(NAMESPACE, storyId);
		const persistedState = persisted && typeof persisted === 'object' ? persisted as Partial<NarratorVoiceState> : {};
		return {
			...DEFAULTS,
			...persistedState,
			profileId: controls.voiceProfileId || persistedState.profileId || defaultProfileId(profile),
			cadence: controls.cadence || persistedState.cadence || DEFAULTS.cadence,
			descriptiveDensity: controls.descriptiveDensity || persistedState.descriptiveDensity || DEFAULTS.descriptiveDensity,
			emotionalDistance: controls.emotionalDistance || persistedState.emotionalDistance || DEFAULTS.emotionalDistance,
			metaphorDensity: controls.metaphorDensity || persistedState.metaphorDensity || DEFAULTS.metaphorDensity,
			humorLevel: controls.humorLevel || persistedState.humorLevel || DEFAULTS.humorLevel,
			intensity: controls.intensity || persistedState.intensity || DEFAULTS.intensity,
			sensoryPreference: controls.sensoryPreference || persistedState.sensoryPreference || DEFAULTS.sensoryPreference,
			formality: controls.formality || persistedState.formality || DEFAULTS.formality,
			forbiddenPatterns: controls.forbiddenPatterns ? sanitizeList(controls.forbiddenPatterns) : sanitizeList(persistedState.forbiddenPatterns),
		};
	}

	public static persist(store: NarratorVoiceStore, storyId: string, state: NarratorVoiceState): void {
		store.saveUserData(NAMESPACE, storyId, { ...state, forbiddenPatterns: sanitizeList(state.forbiddenPatterns) });
	}

	public static toPromptContext(state: NarratorVoiceState): string {
		const forbidden = state.forbiddenPatterns.length ? '; avoid these configured patterns: ' + state.forbiddenPatterns.join(', ') : '';
		return [
			'NARRATOR VOICE CONTRACT v' + state.version,
			'Voice profile: ' + state.profileId,
			'Cadence: ' + state.cadence,
			'Descriptive density: ' + state.descriptiveDensity,
			'Emotional distance: ' + state.emotionalDistance,
			'Metaphor density: ' + state.metaphorDensity,
			'Humor: ' + state.humorLevel,
			'Intensity: ' + state.intensity,
			'Sensory preference: ' + state.sensoryPreference,
			'Formality: ' + state.formality + forbidden,
			'Keep this voice stable across model/provider fallback; provider choice must not redefine the narrator personality.',
		].join('\n');
	}

	public static compactPromptContext(state: NarratorVoiceState): string {
		return 'N2 voice=' + state.profileId + '; cadence=' + state.cadence + '; density=' + state.descriptiveDensity + '; distance=' + state.emotionalDistance + '; metaphor=' + state.metaphorDensity + '; humor=' + state.humorLevel + '; intensity=' + state.intensity + '; sensory=' + state.sensoryPreference + '; formality=' + state.formality + '. Preserve this voice across fallback providers.';
	}
}
