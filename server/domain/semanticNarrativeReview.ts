import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { EphemeralNarrativePlan } from './narrativeDirector';
import type { StructuredTurnPackage } from './aiOrchestrator';

export type NarrativeReviewDecision = 'ACCEPT' | 'REWRITE' | 'REJECT';

export interface NarrativeViolation {
	code:
		| 'SEMANTIC_MISMATCH'
		| 'MISSING_MOVEMENT'
		| 'MISSING_OBSERVATION'
		| 'MISSING_INFORMATION'
		| 'UNAUTHORIZED_SPEECH'
		| 'PLAYER_AGENCY'
		| 'UNSUPPORTED_CLAIM'
		| 'UNSUPPORTED_STATE_PROPOSAL'
		| 'CANONICAL_CONTRADICTION';
	message: string;
	severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface NarrativeReview {
	decision: NarrativeReviewDecision;
	violations: NarrativeViolation[];
	missingRequirements: string[];
	unsupportedClaims: string[];
	playerAgencyViolation: boolean;
	semanticMismatch: boolean;
	source: 'DETERMINISTIC' | 'AI' | 'HYBRID';
	confidence: number;
}

function normalize(value: unknown): string {
	return String(value ?? '').trim().toLowerCase();
}

function tokens(value: unknown): string[] {
	return Array.from(new Set(
		normalize(value)
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length >= 5),
	));
}

function overlap(a: string, b: string): number {
	const left = new Set(tokens(a));
	const right = tokens(b);
	if (!left.size || !right.length) return 0;
	return right.filter((token) => left.has(token)).length / Math.min(left.size, right.length, 12);
}

function containsAny(text: string, pattern: RegExp): boolean {
	return pattern.test(text);
}

function buildForbiddenKnowledgeSet(situation: CurrentSituation): string[] {
	const authorized = new Set(
		situation.playerKnowledge.knownFacts
			.map((fact) => normalize(JSON.stringify(fact)))
			.filter(Boolean),
	);
	return situation.worldFacts
		.filter((fact) => !authorized.has(normalize(JSON.stringify(fact))))
		.flatMap((fact) => [
			String(fact.subjectEntityId || ''),
			String(fact.predicate || ''),
			String(fact.objectValue || ''),
		])
		.map(normalize)
		.filter((value) => value.length >= 6);
}

function hasMajorAgencyTakeover(narration: string): boolean {
	return containsAny(
		narration,
		/\b(?:you|the protagonist|your character)\s+(?:decide|decides|decided|choose|chooses|chose|agree|agrees|agreed|follow|follows|followed|leave|leaves|left|attack|attacks|attacked|kill|kills|killed)\b/i,
	);
}

export class SemanticNarrativeReview {
	public static review(params: {
		intent: PlayerIntent;
		situation: CurrentSituation;
		plan: EphemeralNarrativePlan;
		turnPackage: StructuredTurnPackage;
	}): NarrativeReview {
		const { intent, situation, plan, turnPackage } = params;
		const narration = turnPackage.narrative.join(' ').trim();
		const violations: NarrativeViolation[] = [];
		const missingRequirements: string[] = [];
		const unsupportedClaims: string[] = [];

		if (!narration) {
			violations.push({ code: 'SEMANTIC_MISMATCH', message: 'Narrative output is empty.', severity: 'HIGH' });
			return {
				decision: 'REJECT',
				violations,
				missingRequirements: ['A non-empty player-facing narrative is required.'],
				unsupportedClaims,
				playerAgencyViolation: false,
				semanticMismatch: true,
				source: 'DETERMINISTIC',
				confidence: 1,
			};
		}

		const lower = normalize(narration);

		if (intent.speechIntent === false && intent.observationIntent) {
			if (containsAny(lower, /\b(?:you|the protagonist|your character)\s+(?:(?!\b(?:them|him|her|they|someone|someone else)\b)[a-z'-]+\s+){0,6}(?:ask|asks|asked|say|says|said|speak|speaks|spoke|tell|tells|told|reply|replies|replied|shout|shouts|shouted|call out|calls out)\b/i)) {
				violations.push({ code: 'UNAUTHORIZED_SPEECH', message: 'Narration converted a non-speaking observation/listening action into protagonist speech.', severity: 'HIGH' });
			}
		}

		if (intent.movementIntent && !containsAny(lower, /\b(?:move|moves|moved|approach|approaches|approached|step|steps|stepped|walk|walks|walked|head|heads|headed|travel|travels|traveled|enter|enters|entered|leave|leaves|left|closer|toward|towards|nearer)\b/i)) {
			missingRequirements.push('The immediate physical movement/position change should be represented.');
			violations.push({ code: 'MISSING_MOVEMENT', message: 'The player requested movement, but the narration does not depict a corresponding movement or position change.', severity: 'MEDIUM' });
		}

		if (intent.observationIntent && !containsAny(lower, /\b(?:hear|hears|heard|listen|listens|listened|overhear|overheard|notice|notices|noticed|observe|observes|observed|watch|watches|watched|see|sees|saw|look|looks|looked|spot|spots|inspect|inspects|examines|examined|sense|senses|detected|detects)\b/i)) {
			missingRequirements.push('The requested observation should produce an observable result or limitation.');
			violations.push({ code: 'MISSING_OBSERVATION', message: 'The player requested observation/listening, but no observable result or grounded limitation was narrated.', severity: 'MEDIUM' });
		}

		if (intent.informationGoal && !intent.speechIntent) {
			const researchAnchors = [
				...situation.visibleEvents.map((event) => event.summary),
				...situation.relevantLore.map((fact) => [fact.predicate, fact.objectValue].join(' ')),
				...plan.informationToReveal.map((reveal) => reveal.topic),
			].join(' ');
			if (overlap(narration, researchAnchors) < 0.08 && !/\b(?:nothing|no one|nobody|unclear|uncertain|unknown|unverified|could not|couldn't|refused|silent|silence)\b/i.test(lower)) {
				missingRequirements.push('The information-seeking action should resolve against the established scene lead or clearly state that no reliable information was obtained.');
				violations.push({ code: 'MISSING_INFORMATION', message: 'The narration did not visibly connect the information-seeking action to the current researched scene.', severity: 'MEDIUM' });
			}
		}

		const forbidden = buildForbiddenKnowledgeSet(situation);
		const likelyForbidden = forbidden.filter((value) => value && lower.includes(value));
		if (likelyForbidden.length > 0) {
			unsupportedClaims.push(...likelyForbidden.slice(0, 6));
			violations.push({ code: 'UNSUPPORTED_CLAIM', message: 'Narration appears to expose canonical facts outside the viewer knowledge boundary.', severity: 'HIGH' });
		}

		if (hasMajorAgencyTakeover(narration) && !/\b(?:you must|you cannot|you can|you may|you are able)\b/i.test(lower)) {
			violations.push({ code: 'PLAYER_AGENCY', message: 'Narration appears to decide a consequential player choice rather than present the consequence and leave the decision open.', severity: 'MEDIUM' });
		}

		const proposedStateKinds = new Set((turnPackage.stateChanges || []).map((change) => normalize(change.kind)));
		if (proposedStateKinds.has('location') && !intent.movementIntent) {
			violations.push({ code: 'UNSUPPORTED_STATE_PROPOSAL', message: 'The generated package proposes a location mutation even though the player intent contains no movement.', severity: 'HIGH' });
		}

		for (const forbiddenAssumption of plan.forbiddenAssumptions) {
			if (forbiddenAssumption && lower.includes(normalize(forbiddenAssumption))) {
				violations.push({ code: 'UNSUPPORTED_CLAIM', message: 'Narration directly repeats a forbidden assumption from the one-turn narrative plan.', severity: 'HIGH' });
			}
		}

		const high = violations.filter((violation) => violation.severity === 'HIGH').length;
		const medium = violations.filter((violation) => violation.severity === 'MEDIUM').length;
		const semanticMismatch = violations.some((violation) =>
			['SEMANTIC_MISMATCH', 'MISSING_MOVEMENT', 'MISSING_OBSERVATION', 'MISSING_INFORMATION', 'UNAUTHORIZED_SPEECH'].includes(violation.code)
		);
		const playerAgencyViolation = violations.some((violation) => violation.code === 'PLAYER_AGENCY');

		return {
			decision: high > 0 ? 'REJECT' : (medium > 0 || missingRequirements.length > 0 ? 'REWRITE' : 'ACCEPT'),
			violations,
			missingRequirements,
			unsupportedClaims,
			playerAgencyViolation,
			semanticMismatch,
			source: 'DETERMINISTIC',
			confidence: high > 0 ? 0.98 : medium > 0 ? 0.9 : 0.82,
		};
	}

	public static buildRewritePrompt(params: {
		intent: PlayerIntent;
		situation: CurrentSituation;
		plan: EphemeralNarrativePlan;
		turnPackage: StructuredTurnPackage;
		review: NarrativeReview;
	}): string {
		return [
			'Rewrite the following Dreamville narrative turn once.',
			'Preserve canonical facts and the player agency boundary.',
			'Fix only the listed semantic review violations; do not introduce new facts or a new plot direction.',
			'Player intent: ' + JSON.stringify(params.intent),
			'Narrative plan: ' + JSON.stringify(params.plan),
			'Review: ' + JSON.stringify(params.review),
			'Current situation: ' + JSON.stringify({
				location: params.situation.location,
				nearbyEntities: params.situation.nearbyEntities.filter((entity) => entity.visibleToPlayer).slice(0, 8),
				visibleEvents: params.situation.visibleEvents.slice(0, 6),
				activeDialogue: params.situation.activeDialogue,
			}),
			'Original structured turn: ' + JSON.stringify(params.turnPackage),
			'Return the complete structured turn package as JSON only with narrative, dialogue, events, stateChanges, memoryCandidates, audioCues, and visualCues.',
		].join('\n');
	}
}
