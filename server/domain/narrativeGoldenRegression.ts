import type { PlayerIntent } from './playerIntentInterpreter';
import type { NarrativeTurnProfile } from './narrativeQualityContract';
import type { NarrativePacingProfile } from './narrativePacingEngine';
import type { NarrativeProviderHandoffContract } from './narrativeProviderHandoff';

export interface NarrativeGoldenScenario {
	id: string;
	title: string;
	playerAction: string;
	expectedQualityProfile: NarrativeTurnProfile;
	expectedPacingProfile: NarrativePacingProfile;
	requiredIntent: Partial<Pick<PlayerIntent, 'movementIntent' | 'observationIntent' | 'speechIntent'>>;
	requiredAnchors: RegExp[];
	forbiddenPatterns?: RegExp[];
	requireNoStateChanges: boolean;
}

export interface NarrativeGoldenObservation {
	providerId: string;
	source: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK';
	narrative: string;
	intent: PlayerIntent;
	qualityProfile: NarrativeTurnProfile;
	qualityEnforcement?: 'ADVISORY' | 'REWRITE' | 'REJECT';
	pacingProfile: NarrativePacingProfile;
	pacingMaxWords?: number;
	handoff?: NarrativeProviderHandoffContract;
	stateChangeCount: number;
	approvedChangeCount: number;
}

export interface NarrativeGoldenEvaluation {
	scenarioId: string;
	providerId: string;
	source: NarrativeGoldenObservation['source'];
	passed: boolean;
	failures: string[];
	signature: {
		qualityProfile: NarrativeTurnProfile;
		pacingProfile: NarrativePacingProfile;
		voiceProfileId?: string;
		continuityTemperature?: string;
		sceneMomentum?: string;
		noveltyGuidance?: string;
	};
}

export interface NarrativeGoldenCompatibility {
	passed: boolean;
	failures: string[];
}

export const NARRATIVE_GOLDEN_SCENARIOS: readonly NarrativeGoldenScenario[] = [
	{
		id: 'G01_OBSERVATION',
		title: 'Quiet scene observation',
		playerAction: 'I observe the archivists.',
		expectedQualityProfile: 'MICRO_ACTION',
		expectedPacingProfile: 'MICRO',
		requiredIntent: { observationIntent: true, movementIntent: false, speechIntent: false },
		requiredAnchors: [/observew*|watchw*|noticew*/i, /whispering orrery/i, /archivist/i],
		forbiddenPatterns: [/I decide to/i, /you decide to/i, /you choose to/i],
		requireNoStateChanges: true,
	},
	{
		id: 'G02_INFORMATION',
		title: 'Information-seeking uncertainty',
		playerAction: 'I ask Archivist Maren about the starlight fissures.',
		expectedQualityProfile: 'INFORMATION_SEEKING',
		expectedPacingProfile: 'COMPACT',
		requiredIntent: { observationIntent: false, movementIntent: false, speechIntent: true },
		requiredAnchors: [/starlight fissures/i, /uncertain|hearsay|unverified|unknown|no reliable/i],
		forbiddenPatterns: [/the fissures are definitely/i, /without doubt/i],
		requireNoStateChanges: true,
	},
	{
		id: 'G03_MOVEMENT',
		title: 'Scene-bound movement',
		playerAction: 'I move closer to Archivist Maren.',
		expectedQualityProfile: 'MOVEMENT',
		expectedPacingProfile: 'COMPACT',
		requiredIntent: { movementIntent: true, speechIntent: false },
		requiredAnchors: [/movew*|approachw*|closer/i, /archivist maren/i, /whispering orrery/i],
		forbiddenPatterns: [/you decide to leave/i, /you enter a new/i],
		requireNoStateChanges: true,
	},
	{
		id: 'G04_COMBAT',
		title: 'Kinetic immediate action',
		playerAction: 'I strike at the creature.',
		expectedQualityProfile: 'COMBAT',
		expectedPacingProfile: 'KINETIC',
		requiredIntent: { speechIntent: false },
		requiredAnchors: [/strikw*|attackw*|creature/i],
		forbiddenPatterns: [/you decide to/i, /you choose to/i],
		requireNoStateChanges: true,
	},
];

function containsAll(text: string, patterns: RegExp[]): RegExp[] {
	return patterns.filter((pattern) => !pattern.test(text));
}

export class NarrativeGoldenRegressionEngine {
	public static evaluate(scenario: NarrativeGoldenScenario, observation: NarrativeGoldenObservation): NarrativeGoldenEvaluation {
		const failures: string[] = [];
		if (observation.qualityProfile !== scenario.expectedQualityProfile) {
			failures.push('N1 quality profile expected ' + scenario.expectedQualityProfile + ' but received ' + observation.qualityProfile + '.');
		}
		if (observation.pacingProfile !== scenario.expectedPacingProfile) {
			failures.push('N8 pacing profile expected ' + scenario.expectedPacingProfile + ' but received ' + observation.pacingProfile + '.');
		}
		for (const [key, expected] of Object.entries(scenario.requiredIntent)) {
			if (expected !== undefined && observation.intent[key as keyof PlayerIntent] !== expected) {
				failures.push('Player intent ' + key + ' expected ' + String(expected) + ' but received ' + String(observation.intent[key as keyof PlayerIntent]) + '.');
			}
		}
		const missingAnchors = containsAll(observation.narrative, scenario.requiredAnchors);
		for (const pattern of missingAnchors) failures.push('Required narrative anchor missing: ' + pattern.source + '.');
		for (const pattern of scenario.forbiddenPatterns || []) {
			if (pattern.test(observation.narrative)) failures.push('Forbidden player-agency/epistemic pattern detected: ' + pattern.source + '.');
		}
		if (scenario.requireNoStateChanges && (observation.stateChangeCount > 0 || observation.approvedChangeCount > 0)) {
			failures.push('Golden scenario expected no canonical state mutation, but state changes were proposed/approved.');
		}
		if (!observation.handoff) failures.push('N9 provider handoff contract missing from the observed narration result.');
		else if (!observation.handoff.providerIndependentInstruction.includes('interchangeable provider')) {
			failures.push('N9 provider handoff contract is missing provider-independent narrator identity guidance.');
		}
		return {
			scenarioId: scenario.id,
			providerId: observation.providerId,
			source: observation.source,
			passed: failures.length === 0,
			failures,
			signature: {
				qualityProfile: observation.quality.profile,
				pacingProfile: observation.pacing.profile,
				voiceProfileId: observation.handoff?.voiceProfileId,
				continuityTemperature: observation.handoff?.continuity.emotionalTemperature,
				sceneMomentum: observation.handoff?.continuity.sceneMomentum,
				noveltyGuidance: observation.handoff?.noveltyGuidance,
			},
		};
	}

	public static comparePresentation(a: NarrativeGoldenObservation, b: NarrativeGoldenObservation): NarrativeGoldenCompatibility {
		const failures: string[] = [];
		if (a.qualityProfile !== b.qualityProfile) failures.push('N1 quality profile changed across providers.');
		if (a.qualityEnforcement !== b.qualityEnforcement) failures.push('N1 enforcement mode changed across providers.');
		if (a.pacingProfile !== b.pacingProfile) failures.push('N8 pacing profile changed across providers.');
		if (a.pacingMaxWords !== b.pacingMaxWords) failures.push('N8 pacing ceiling changed across providers.');
		if (a.intent.movementIntent !== b.intent.movementIntent || a.intent.observationIntent !== b.intent.observationIntent || a.intent.speechIntent !== b.intent.speechIntent) {
			failures.push('Semantic player intent changed across providers.');
		}
		if (a.handoff && b.handoff) {
			if (a.handoff.voiceProfileId !== b.handoff.voiceProfileId) failures.push('N2 narrator voice profile changed across providers.');
			if (a.handoff.qualityProfile !== b.handoff.qualityProfile) failures.push('N9 handoff quality profile changed across providers.');
			if (a.handoff.pacingProfile !== b.handoff.pacingProfile) failures.push('N9 handoff pacing profile changed across providers.');
			if (a.handoff.pacingRange.maxWords !== b.handoff.pacingRange.maxWords) failures.push('N9 handoff pacing range changed across providers.');
			if (a.handoff.continuity.emotionalTemperature !== b.handoff.continuity.emotionalTemperature) failures.push('N4 emotional temperature changed across providers.');
			if (a.handoff.continuity.sceneMomentum !== b.handoff.continuity.sceneMomentum) failures.push('N4 scene momentum changed across providers.');
			if (a.handoff.noveltyGuidance !== b.handoff.noveltyGuidance) failures.push('N7 novelty guidance changed across providers.');
		} else {
			failures.push('Cannot compare provider presentation contracts because one provider did not expose N9 handoff state.');
		}
		return { passed: failures.length === 0, failures };
	}
}
