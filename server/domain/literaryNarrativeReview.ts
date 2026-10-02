import type { CurrentSituation } from './currentSituation';
import type { EphemeralNarrativePlan } from './narrativeDirector';
import type { StructuredTurnPackage } from './aiOrchestrator';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { NarratorVoiceState } from './narratorVoiceEngine';

export type LiteraryReviewDecision = 'ACCEPT' | 'REWRITE';
export type LiteraryIssueCode =
	| 'EMPTY'
	| 'GENERIC_OPENING'
	| 'REPETITIVE_STRUCTURE'
	| 'REPETITIVE_PHRASE'
	| 'LOW_SCENE_SPECIFICITY'
	| 'VOICE_MISMATCH'
	| 'EMOTIONAL_FLATNESS'
	| 'OVER_EXPOSITION'
	| 'TELLING_INSTEAD_OF_SHOWING'
	| 'PACE_MISMATCH'
	| 'DIALOGUE_FLATNESS';

export interface LiteraryIssue {
	code: LiteraryIssueCode;
	message: string;
	severity: 'LOW' | 'MEDIUM' | 'HIGH';
	evidence?: string;
}

export interface LiteraryReview {
	decision: LiteraryReviewDecision;
	issues: LiteraryIssue[];
	score: number;
	source: 'DETERMINISTIC';
	confidence: number;
}

function normalize(value: unknown): string {
	return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function sentences(value: string): string[] {
	return value.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function words(value: string): string[] {
	return normalize(value).split(/[^a-z0-9']+/).filter((w) => w.length >= 3);
}

function repeatedPhrase(text: string, size = 4): string | undefined {
	const ws = words(text);
	const seen = new Map<string, number>();
	for (let i = 0; i <= ws.length - size; i += 1) {
		const phrase = ws.slice(i, i + size).join(' ');
		const count = (seen.get(phrase) || 0) + 1;
		seen.set(phrase, count);
		if (count >= 2) return phrase;
	}
	return undefined;
}

function genericOpening(text: string): boolean {
	return /^(the (figure|person|man|woman|guard|character|creature) (looks|stands|turns|moves|steps|stares)|you (see|notice|look|find)\b)/i.test(text.trim());
}

function sceneSpecificity(text: string, situation: CurrentSituation): number {
	const anchors = [
		situation.location.name,
		situation.location.description,
		situation.location.ambientSensory,
		...situation.nearbyEntities.filter((e) => e.visibleToPlayer).map((e) => e.name),
		...situation.visibleEvents.map((e) => e.summary),
	].filter(Boolean).map(normalize).filter((v) => v.length >= 4);
	if (!anchors.length) return 0.5;
	const lower = normalize(text);
	return anchors.filter((a) => lower.includes(a)).length / Math.min(anchors.length, 8);
}

function styleMismatch(text: string, voice?: NarratorVoiceState): boolean {
	if (!voice) return false;
	const lower = normalize(text);
	const forbidden = voice.forbiddenPhrases || [];
	return forbidden.some((phrase) => phrase && lower.includes(normalize(phrase)));
}

function estimateEmotionalVariety(text: string): number {
	const emotional = /\b(trembl|hesitat|laugh|laughed|smil|frown|anger|fear|relief|grief|delight|uneasy|tense|quiet|shout|whisper|stare|flinch|reluctant|eager|calm)\w*/i;
	return emotional.test(text) ? 1 : 0;
}

export class LiteraryNarrativeReview {
	public static review(params: {
		intent: PlayerIntent;
		situation: CurrentSituation;
		plan: EphemeralNarrativePlan;
		turnPackage: StructuredTurnPackage;
		voice?: NarratorVoiceState;
		previousNarrations?: string[];
	}): LiteraryReview {
		const text = params.turnPackage.narrative.join(' ').trim();
		const issues: LiteraryIssue[] = [];
		if (!text) return { decision: 'REWRITE', issues: [{ code: 'EMPTY', message: 'Narration is empty.', severity: 'HIGH' }], score: 0, source: 'DETERMINISTIC', confidence: 1 };

		const ss = sentences(text);
		const previous = (params.previousNarrations || []).filter(Boolean).slice(-6);
		if (genericOpening(text)) issues.push({ code: 'GENERIC_OPENING', message: 'Opening uses a generic AI-like character/action construction.', severity: 'MEDIUM', evidence: ss[0] });
		const phrase = repeatedPhrase(text);
		if (phrase) issues.push({ code: 'REPETITIVE_PHRASE', message: 'The same four-word phrase appears more than once in this turn.', severity: 'MEDIUM', evidence: phrase });
		if (sceneSpecificity(text, params.situation) < 0.15 && params.situation.nearbyEntities.some((e) => e.visibleToPlayer)) {
			issues.push({ code: 'LOW_SCENE_SPECIFICITY', message: 'Narration contains few concrete anchors from the current scene.', severity: 'MEDIUM' });
		}
		if (styleMismatch(text, params.voice)) issues.push({ code: 'VOICE_MISMATCH', message: 'Narration uses a forbidden narrator phrase.', severity: 'HIGH' });
		if (ss.length >= 5 && ss.every((s) => s.length > 110)) issues.push({ code: 'REPETITIVE_STRUCTURE', message: 'The turn is a sequence of uniformly long sentences.', severity: 'LOW' });
		if (params.intent.interactionMode === 'INFORMATION_SEEKING' && ss.length >= 6 && /\b(?:because|therefore|this means|which means|in other words)\b/i.test(text)) {
			issues.push({ code: 'OVER_EXPOSITION', message: 'Information-seeking narration may over-explain instead of letting the scene carry the discovery.', severity: 'MEDIUM' });
		}
		if (params.intent.observationIntent && estimateEmotionalVariety(text) === 0 && ss.length >= 3) {
			issues.push({ code: 'TELLING_INSTEAD_OF_SHOWING', message: 'Observation-heavy narration has little observable human/emotional reaction.', severity: 'LOW' });
		}
		if (previous.length > 0) {
			const previousOpenings = new Set(previous.map((n) => sentences(n)[0]?.slice(0, 55).toLowerCase()).filter(Boolean));
			if (previousOpenings.has(ss[0]?.slice(0, 55).toLowerCase())) issues.push({ code: 'REPETITIVE_STRUCTURE', message: 'The opening structure closely repeats a recent narration opening.', severity: 'MEDIUM' });
		}
		const score = Math.max(0, 100 - issues.reduce((sum, issue) => sum + (issue.severity === 'HIGH' ? 30 : issue.severity === 'MEDIUM' ? 15 : 5), 0));
		return { decision: issues.some((i) => i.severity === 'HIGH' || i.severity === 'MEDIUM') ? 'REWRITE' : 'ACCEPT', issues, score, source: 'DETERMINISTIC', confidence: 0.86 };
	}

	public static buildRewritePrompt(params: { review: LiteraryReview; turnPackage: StructuredTurnPackage; intent: PlayerIntent; situation: CurrentSituation; plan: EphemeralNarrativePlan }): string {
		return [
			'Perform one literary polish pass on the existing Dreamville turn.',
			'Do not change canonical facts, state changes, player choices, outcomes, knowledge boundaries, or plot direction.',
			'Fix only the listed literary issues. Preserve all valid dialogue and concrete consequences.',
			'Prefer specific scene details, distinct character behavior, varied sentence rhythm, restrained exposition, and observable emotion.',
			'Never add a fact merely to make prose more interesting.',
			'Literary review: ' + JSON.stringify(params.review),
			'Player intent: ' + JSON.stringify(params.intent),
			'Plan: ' + JSON.stringify(params.plan),
			'Current situation: ' + JSON.stringify({ location: params.situation.location, nearbyEntities: params.situation.nearbyEntities.filter((e) => e.visibleToPlayer).slice(0, 8), activeDialogue: params.situation.activeDialogue }),
			'Original turn: ' + JSON.stringify(params.turnPackage),
			'Return the complete structured turn package as JSON only.',
		].join('\n');
	}
}
