import type { NarratorVoiceState } from './narratorVoiceEngine';
import type { NarrativeQualityContract } from './narrativeQualityContract';
import type { NarrativePacingContract } from './narrativePacingEngine';
import type { NarrativeContinuityState } from './narrativeContinuityState';
import type { NarrativeNoveltyState } from './narrativeNoveltyEngine';

export interface NarrativeProviderHandoffContract {
	version: 1;
	handoffId: string;
	storyId: string;
	turnId: string;
	voiceProfileId: string;
	qualityProfile: NarrativeQualityContract['profile'];
	qualityEnforcement: NarrativeQualityContract['controls']['enforcement'];
	pacingProfile: NarrativePacingContract['profile'];
	pacingRange: { minWords: number; maxWords: number; maxParagraphs: number };
	continuity: { emotionalTemperature: NarrativeContinuityState['emotionalTemperature']; tension: number; sceneMomentum: NarrativeContinuityState['sceneMomentum'] };
	noveltyGuidance: string;
	providerIndependentInstruction: string;
}

function stableKey(value: string): string {
	return value.replace(/[^a-zA-Z0-9._:-]+/g, '_').slice(0, 160);
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

export class NarrativeProviderHandoffEngine {
	public static readonly VERSION = 1;

	public static resolve(params: {
		storyId: string;
		turnId: string;
		voice: NarratorVoiceState;
		quality: NarrativeQualityContract;
		pacing: NarrativePacingContract;
		continuity: NarrativeContinuityState;
		novelty: NarrativeNoveltyState;
	}): NarrativeProviderHandoffContract {
		const noveltyGuidance = NarrativeNoveltyState
			? 'Provider-independent novelty guidance: ' + (
				params.novelty.items
					.filter((item) => item.count >= 2)
					.sort((a, b) => b.count - a.count || b.lastSeenTurn - a.lastSeenTurn)
					.slice(0, 8)
					.map((item) => item.category + ':' + item.text + ' (count=' + item.count + ')')
					.join(', ') || 'no tracked repetition'
			)
			: 'Provider-independent novelty guidance: no tracked repetition';

		const fingerprintSource = [
			params.storyId,
			params.turnId,
			params.voice.profileId,
			params.voice.cadence,
			params.voice.descriptiveDensity,
			params.voice.emotionalDistance,
			params.voice.metaphorDensity,
			params.voice.humorLevel,
			params.voice.intensity,
			params.voice.sensoryPreference,
			params.voice.formality,
			params.quality.profile,
			params.quality.controls.enforcement,
			params.pacing.profile,
			params.pacing.controls.minWords,
			params.pacing.controls.maxWords,
			params.pacing.controls.maxParagraphs,
			params.continuity.emotionalTemperature,
			params.continuity.tension,
			params.continuity.sceneMomentum,
			].join('|');

		const handoffId = 'n9.' + stableKey(fingerprintSource);

		return {
			version: 1,
			handoffId,
			storyId: params.storyId,
			turnId: params.turnId,
			voiceProfileId: params.voice.profileId,
			qualityProfile: params.quality.profile,
			qualityEnforcement: params.quality.controls.enforcement,
			pacingProfile: params.pacing.profile,
			pacingRange: {
				minWords: params.pacing.controls.minWords,
				maxWords: params.pacing.controls.maxWords,
				maxParagraphs: params.pacing.controls.maxParagraphs,
			},
			continuity: {
				emotionalTemperature: params.continuity.emotionalTemperature,
				tension: params.continuity.tension,
				sceneMomentum: params.continuity.sceneMomentum,
			},
			noveltyGuidance,
			providerIndependentInstruction: [
				'N9 PROVIDER HANDOFF CONTRACT v1.',
				'The selected model is an interchangeable provider, not a new narrator identity.',
				'Preserve the supplied narrator voice exactly: profile=' + params.voice.profileId + '; cadence=' + params.voice.cadence + '; density=' + params.voice.descriptiveDensity + '; emotional distance=' + params.voice.emotionalDistance + '; metaphor=' + params.voice.metaphorDensity + '; humor=' + params.voice.humorLevel + '; intensity=' + params.voice.intensity + '; sensory=' + params.voice.sensoryPreference + '; formality=' + params.voice.formality + '.',
				'Preserve the N8 pacing contract: profile=' + params.pacing.profile + '; target=' + params.pacing.controls.minWords + '-' + params.pacing.controls.maxWords + ' words; maximum ' + params.pacing.controls.maxParagraphs + ' paragraphs.',
				'Preserve N4 continuity: temperature=' + params.continuity.emotionalTemperature + '; tension=' + params.continuity.tension + '; momentum=' + params.continuity.sceneMomentum + '.',
				'Preserve N7 novelty guidance and do not replace repeated patterns with another stock cliché.',
				'Do not use provider-specific default tone, persona, verbosity, formatting, or role instructions when they conflict with this contract.',
				'Provider/model changes must alter implementation only; they must not alter narrator identity, pacing policy, continuity policy, novelty policy, canonical boundaries, or player agency.',
				'Fallback or emergency providers must produce the same presentation role as the primary provider.',
				noveltyGuidance,
			].join(' '),
		};
	}

	public static toPromptContext(contract: NarrativeProviderHandoffContract): string {
		return [
			'N9 PROVIDER HANDOFF CONTRACT v' + contract.version,
			'Handoff ID: ' + contract.handoffId,
			'Provider-independent narrator identity: ' + contract.voiceProfileId,
			'Quality profile: ' + contract.qualityProfile + ' (' + contract.qualityEnforcement + ')',
			'Pacing profile: ' + contract.pacingProfile + '; range=' + contract.pacingRange.minWords + '-' + contract.pacingRange.maxWords + ' words; max paragraphs=' + contract.pacingRange.maxParagraphs,
			'Continuity: ' + contract.continuity.emotionalTemperature + '; tension=' + contract.continuity.tension + '; momentum=' + contract.continuity.sceneMomentum,
			contract.noveltyGuidance,
			'Never let a provider/model change redefine the narrator voice or scene presentation contract.',
		].join('\n');
	}

	public static snapshot(contract: NarrativeProviderHandoffContract): NarrativeProviderHandoffContract {
		return clone(contract);
	}

	public static samePresentationContract(a: NarrativeProviderHandoffContract, b: NarrativeProviderHandoffContract): boolean {
		return a.handoffId === b.handoffId &&
			a.voiceProfileId === b.voiceProfileId &&
			a.qualityProfile === b.qualityProfile &&
			a.qualityEnforcement === b.qualityEnforcement &&
			a.pacingProfile === b.pacingProfile &&
			a.pacingRange.minWords === b.pacingRange.minWords &&
			a.pacingRange.maxWords === b.pacingRange.maxWords &&
			a.pacingRange.maxParagraphs === b.pacingRange.maxParagraphs &&
			a.continuity.emotionalTemperature === b.continuity.emotionalTemperature &&
			a.continuity.tension === b.continuity.tension &&
			a.continuity.sceneMomentum === b.continuity.sceneMomentum &&
			a.noveltyGuidance === b.noveltyGuidance;
	}
}
