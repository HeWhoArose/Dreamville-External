import type { CharacterAgencyProfile } from './dynamicCharacterAgency';

export type NpcExpressiveCadence = 'MEASURED' | 'BRISK' | 'HALTING' | 'LYRICAL' | 'CONVERSATIONAL';
export type NpcSentenceLength = 'VERY_SHORT' | 'SHORT' | 'MIXED' | 'LONG' | 'FLOWING';
export type NpcVocabularyFormality = 'PLAIN' | 'CASUAL' | 'FORMAL' | 'CEREMONIAL';
export type NpcSilenceStyle = 'LOW' | 'MODERATE' | 'HIGH';
export type NpcHesitationStyle = 'NONE' | 'CONTEXTUAL' | 'NOTICEABLE';
export type NpcHumorStyle = 'NONE' | 'DRY' | 'PLAYFUL' | 'WARM';

export interface NpcExpressiveResponseProfile {
	argument: string;
	deception: string;
	affection: string;
	fear: string;
	anger: string;
	stress: string;
}

export interface NpcExpressiveIdentity {
	version: 1;
	characterId: string;
	name: string;
	cadence: NpcExpressiveCadence;
	sentenceLength: NpcSentenceLength;
	vocabularyFormality: NpcVocabularyFormality;
	vocabularyPreferences: string[];
	favoritePhrases: string[];
	verbalTics: string[];
	silenceStyle: NpcSilenceStyle;
	hesitationStyle: NpcHesitationStyle;
	humorStyle: NpcHumorStyle;
	responseProfile: NpcExpressiveResponseProfile;
	physicalMannerismCues: string[];
	sourceSignals: string[];
	identityConfidence: number;
	fallbackReason?: string;
	expiresAfterNarration: true;
}

function normalized(value: unknown): string {
	return String(value ?? '').trim().toLowerCase();
}

function containsAny(value: string, needles: string[]): boolean {
	return needles.some((needle) => value.includes(needle));
}

function unique(values: string[], limit: number): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function cadence(style: string): NpcExpressiveCadence {
	if (containsAny(style, ['halting', 'hesitant', 'stammer', 'uncertain'])) return 'HALTING';
	if (containsAny(style, ['brisk', 'terse', 'concise', 'clipped', 'direct'])) return 'BRISK';
	if (containsAny(style, ['lyrical', 'poetic', 'ornate', 'flowery'])) return 'LYRICAL';
	if (containsAny(style, ['casual', 'conversational', 'friendly', 'chatty'])) return 'CONVERSATIONAL';
	return 'MEASURED';
}

function sentenceLength(style: string): NpcSentenceLength {
	if (containsAny(style, ['terse', 'concise', 'clipped'])) return 'SHORT';
	if (containsAny(style, ['lyrical', 'poetic', 'ornate', 'flowery'])) return 'FLOWING';
	if (containsAny(style, ['long', 'elaborate', 'verbose'])) return 'LONG';
	if (containsAny(style, ['very short'])) return 'VERY_SHORT';
	return 'MIXED';
}

function vocabularyFormality(style: string): NpcVocabularyFormality {
	if (containsAny(style, ['ceremonial', 'regal', 'ritual'])) return 'CEREMONIAL';
	if (containsAny(style, ['formal', 'professional', 'polished'])) return 'FORMAL';
	if (containsAny(style, ['casual', 'slang', 'colloquial'])) return 'CASUAL';
	return 'PLAIN';
}

function silenceStyle(style: string, profile?: CharacterAgencyProfile): NpcSilenceStyle {
	if (containsAny(style, ['quiet', 'reserved', 'taciturn', 'sparse', 'terse'])) return 'HIGH';
	if (containsAny(style, ['talkative', 'expressive', 'chatty'])) return 'LOW';
	if ((profile?.personality.fearfulness ?? 30) >= 70) return 'HIGH';
	return 'MODERATE';
}

function hesitationStyle(style: string, profile?: CharacterAgencyProfile): NpcHesitationStyle {
	if (containsAny(style, ['hesitant', 'halting', 'uncertain', 'stammer'])) return 'NOTICEABLE';
	if ((profile?.personality.fearfulness ?? 30) >= 65) return 'CONTEXTUAL';
	return 'NONE';
}

function humorStyle(style: string): NpcHumorStyle {
	if (containsAny(style, ['dark humor', 'dry humor', 'dry wit', 'deadpan'])) return 'DRY';
	if (containsAny(style, ['playful', 'witty', 'joking', 'teasing', 'humorous'])) return 'PLAYFUL';
	if (containsAny(style, ['warm', 'gentle humor'])) return 'WARM';
	return 'NONE';
}

function responseProfile(profile?: CharacterAgencyProfile, style = ''): NpcExpressiveResponseProfile {
	const empathy = profile?.personality.empathy ?? 50;
	const courage = profile?.personality.courage ?? 50;
	const ambition = profile?.personality.ambition ?? 50;
	const fearfulness = profile?.personality.fearfulness ?? 30;
	const vengefulness = profile?.personality.vengefulness ?? 25;

	return {
		argument: ambition >= 65 && courage >= 55
			? 'Press the point directly and keep the wording controlled.'
			: empathy >= 70
				? 'Prefer clarification, softening, or compromise before confrontation.'
				: 'Keep disagreement guarded and avoid overexplaining.',
		deception: containsAny(style, ['deceptive', 'evasive', 'secretive', 'misdirect'])
			? 'Use guarded wording and reveal only what is already authorized.'
			: 'Do not invent deception; preserve the established truth boundary.',
		affection: empathy >= 70 || (profile?.personality.loyalty ?? 60) >= 75
			? 'Allow warmth or protective wording to surface when supported by the relationship.'
			: 'Keep affection restrained unless the relationship context explicitly supports openness.',
		fear: fearfulness >= 65
			? 'Shorten responses and increase caution when canonically threatened.'
			: courage >= 75
				? 'Keep delivery comparatively steady under pressure.'
				: 'Show only proportional caution when fear is canonically established.',
		anger: vengefulness >= 60
			? 'Sharper wording may surface when anger is canonically justified.'
			: 'Keep anger controlled and avoid melodramatic escalation.',
		stress: fearfulness >= 65
			? 'Use hesitation or compressed phrasing only when the scene canonically warrants stress.'
			: 'Maintain established cadence unless canonical pressure changes the response.',
	};
}

function mannerismCues(profile?: CharacterAgencyProfile): string[] {
	const traits = (profile?.traits || []).map(normalized);
	const cues: string[] = [];
	if (traits.some((trait) => containsAny(trait, ['vigilant', 'watchful', 'observant', 'alert']))) cues.push('May visibly scan or monitor the immediate environment when attention is relevant.');
	if (traits.some((trait) => containsAny(trait, ['pragmatic', 'disciplined', 'methodical']))) cues.push('Favors economical, purposeful gestures over ornamental movement.');
	if (traits.some((trait) => containsAny(trait, ['stoic', 'reserved', 'guarded']))) cues.push('Keeps outward reactions restrained unless the scene strongly warrants a change.');
	if (traits.some((trait) => containsAny(trait, ['warm', 'empathetic', 'compassionate']))) cues.push('May soften posture or tone during supported moments of care.');
	if ((profile?.personality.fearfulness ?? 30) >= 70) cues.push('May hesitate before high-stakes responses when fear is canonically present.');
	return unique(cues, 4);
}

function extractQuotedPhrases(style: string): string[] {
	const matches = [...style.matchAll(/["“]([^"”]+)["”]/g)].map((match) => match[1] || '');
	return unique(matches, 4);
}

export class NpcExpressiveIdentityEngine {
	public static project(params: {
		characterId: string;
		name: string;
		profile?: CharacterAgencyProfile | null;
		actorRole?: string;
	}): NpcExpressiveIdentity {
		const { characterId, name, profile, actorRole } = params;
		const style = normalized(profile?.dialogueStyle);
		const derivedCadence = cadence(style);
		const derivedSentenceLength = sentenceLength(style);
		const derivedFormality = vocabularyFormality(style);
		const derivedHumor = humorStyle(style);
		const favoritePhrases = extractQuotedPhrases(String(profile?.dialogueStyle || ''));
		const sourceSignals = unique([
			profile?.dialogueStyle ? 'authored dialogueStyle' : '',
			...(profile?.traits || []).slice(0, 4).map((trait) => 'trait:' + trait),
			...(profile?.values || []).slice(0, 3).map((value) => 'value:' + value),
			actorRole ? 'scene role:' + actorRole : '',
			profile ? 'agency personality scores' : '',
		], 8);
		const sparse = !profile?.dialogueStyle && !(profile?.traits || []).length && !(profile?.values || []).length;
		const identityConfidence = sparse ? 0.45 : profile?.dialogueStyle ? 0.86 : 0.68;

		return {
			version: 1,
			characterId,
			name,
			cadence: derivedCadence,
			sentenceLength: derivedSentenceLength,
			vocabularyFormality: derivedFormality,
			vocabularyPreferences: unique([
				derivedFormality === 'CEREMONIAL' ? 'ceremonial or ritual vocabulary' : '',
				derivedFormality === 'FORMAL' ? 'precise professional vocabulary' : '',
				derivedFormality === 'CASUAL' ? 'plain conversational vocabulary' : '',
				derivedCadence === 'LYRICAL' ? 'figurative or image-rich phrasing' : '',
				derivedCadence === 'BRISK' ? 'direct, concrete wording' : '',
			], 4),
			favoritePhrases,
			verbalTics: [],
			silenceStyle: silenceStyle(style, profile || undefined),
			hesitationStyle: hesitationStyle(style, profile || undefined),
			humorStyle: derivedHumor,
			responseProfile: responseProfile(profile || undefined, style),
			physicalMannerismCues: mannerismCues(profile || undefined),
			sourceSignals,
			identityConfidence,
			fallbackReason: sparse
				? 'No expressive authoring signal is present; use conservative generic delivery and do not invent a unique verbal tic or catchphrase.'
				: profile?.dialogueStyle
					? undefined
					: 'No authored dialogueStyle is present; expressive cues are derived conservatively from existing personality/trait data.',
			expiresAfterNarration: true,
		};
	}

	public static toPromptContext(identity: NpcExpressiveIdentity): string {
		return JSON.stringify(identity);
	}
}
