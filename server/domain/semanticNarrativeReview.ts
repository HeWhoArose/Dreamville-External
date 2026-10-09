import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { EphemeralNarrativePlan } from './narrativeDirector';
import type { StructuredTurnPackage } from './aiOrchestrator';
import { NarrativeQualityContractEngine, type NarrativeQualityContract } from './narrativeQualityContract';

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
	const authorized = situation.playerKnowledge.knownFacts.map((fact) => normalize(JSON.stringify(fact)));
	const playerVisibleContext = [
		situation.location.name,
		situation.location.description,
		situation.location.ambientSensory,
		situation.activeDialogue?.text || '',
		...situation.visibleEvents.map((event) => event.summary),
		...situation.relevantLore.map((fact) => [fact.predicate, fact.objectValue].join(' ')),
		...situation.openThreads.map((thread) => [thread.title, thread.summary].filter(Boolean).join(' ')),
		situation.plot.summary,
	]
		.map(normalize)
		.filter(Boolean)
		.join(' ');

	const forbidden: string[] = [];
	for (const fact of situation.worldFacts) {
		if (authorized.includes(normalize(JSON.stringify(fact)))) continue;

		const candidates = [
			String(fact.subjectEntityId || ''),
			String(fact.predicate || ''),
			String(fact.objectValue || ''),
			[String(fact.subjectEntityId || ''), String(fact.predicate || ''), String(fact.objectValue || '')].join(' '),
		]
			.map(normalize)
			.filter((value) => value.length >= 8)
			.filter((value) => value.split(/\s+/).filter(Boolean).length >= 2);

		for (const candidate of candidates) {
			if (playerVisibleContext.includes(candidate)) continue;
			forbidden.push(candidate);
		}
	}

	return Array.from(new Set(forbidden));
}

function extractConcreteObjectClaims(narration: string): string[] {
	const claims: string[] = [];
	const patterns = [
		/\b(?:a|an|the)\s+([a-z][a-z'-]{2,}(?:\s+[a-z][a-z'-]{2,}){0,2})\s+(?:stands?|rests?|lies?|sits?|leans?|hangs?|glows?|flickers?|waits?|is\s+(?:nearby|present|there))\b/gi,
		/\b(?:you|your)\s+(?:gaze|eyes|attention|hands?)\s+(?:settles?|locks?|reaches?|grabs?|finds?)\s+(?:on|for)\s+(?:a|an|the)\s+([a-z][a-z'-]{2,}(?:\s+[a-z][a-z'-]{2,}){0,2})\b/gi,
	];
	for (const pattern of patterns) {
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(narration)) !== null) {
			const claim = normalize(match[1]).replace(/\b(?:nearby|there|present)\b/g, '').trim();
			if (claim && !claims.includes(claim)) claims.push(claim);
		}
	}
	return claims;
}

function extractEnvironmentalClaims(narration: string): string[] {
	const claims: string[] = [];
	const patterns = [
		/\b(?:on|onto|inside|within|beneath|above|beside|behind|near)\s+(?:a|an|the)\s+([a-z][a-z'-]{2,}(?:\s+[a-z][a-z'-]{2,}){0,2})\b/gi,
		/\b(?:a|an|the)\s+([a-z][a-z'-]{2,}(?:\s+[a-z][a-z'-]{2,}){0,2})\s+(?:rises?|stands?|stretches?|spans?|clings?|grows?|hangs?|extends?|runs?|leads?)\b/gi,
	];
	for (const pattern of patterns) {
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(narration)) !== null) {
			const claim = normalize(match[1]).trim();
			if (claim && !claims.includes(claim)) claims.push(claim);
		}
	}
	return claims;
}

function isConcreteClaimSupported(claim: string, situation: CurrentSituation): boolean {
	const normalizedClaim = normalize(claim);
	const visibleObjects = (situation.sceneObjects || [])
		.filter((object) => object.visibleToPlayer)
		.map((object) => normalize(object.name));

	// Discrete physical-object claims must resolve to an explicit canonical
	// scene object. We deliberately do not use location prose, ambient prose,
	// lore, or arbitrary token overlap as object existence evidence.
	if (visibleObjects.some((name) => name === normalizedClaim || normalizedClaim.includes(name) || name.includes(normalizedClaim))) {
		return true;
	}

	// Character/entity claims are separately authoritative through the visible
	// entity projection.
	const visibleEntities = situation.nearbyEntities
		.filter((entity) => entity.visibleToPlayer)
		.map((entity) => normalize(entity.name));
	if (visibleEntities.some((name) => name === normalizedClaim || normalizedClaim.includes(name) || name.includes(normalizedClaim))) {
		return true;
	}

	const structures = (situation.sceneEvidence?.structures || []).map(normalize);
	if (structures.some((name) => name === normalizedClaim || normalizedClaim.includes(name) || name.includes(normalizedClaim))) {
		return true;
	}

	// A location's own canonical name and exact authored environmental phrases
	// are valid evidence for broad environmental claims (e.g. "the bridge" when
	// the location description explicitly names a bridge). Exact phrase matching
	// does not let "brass architecture" authorize a separate "brass lamp".
	const authoredEnvironment = [
		situation.location.name,
		situation.location.description,
		situation.location.ambientSensory,
		...(situation.sceneEvidence?.sensory || []),
	].map(normalize).filter(Boolean);
	if (authoredEnvironment.some((source) =>
		source === normalizedClaim ||
		source.includes(normalizedClaim) ||
		normalizedClaim.includes(source) && source.length >= 8
	)) {
		return true;
	}

	return false;
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
		narrativeQualityContract?: NarrativeQualityContract;
	}): NarrativeReview {
		const { intent, situation, plan, turnPackage } = params;
		const narration = turnPackage.narrative.join(' ').trim();
		const violations: NarrativeViolation[] = [];
		const missingRequirements: string[] = [];
		const unsupportedClaims: string[] = [];
		const qualityContract = params.narrativeQualityContract || NarrativeQualityContractEngine.resolve(intent);
		const qualityValidation = NarrativeQualityContractEngine.validate(narration, qualityContract);

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

		for (const reason of qualityValidation.reasons) {
			if (!violations.some((violation) => violation.message === reason)) {
				violations.push({ code: 'SEMANTIC_MISMATCH', message: 'N1 narrative quality contract: ' + reason, severity: qualityContract.controls.enforcement === 'REJECT' ? 'HIGH' : 'MEDIUM' });
			}
		}

		if (intent.speechIntent === false && intent.observationIntent) {
			if (containsAny(lower, /\b(?:you|the protagonist|your character)\s+(?:(?!\b(?:them|him|her|they|someone|someone else)\b)[a-z'-]+\s+){0,6}(?:ask|asks|asked|say|says|said|speak|speaks|spoke|tell|tells|told|reply|replies|replied|shout|shouts|shouted|call out|calls out)\b/i)) {
				violations.push({ code: 'UNAUTHORIZED_SPEECH', message: 'Narration converted a non-speaking observation/listening action into protagonist speech.', severity: 'HIGH' });
			}
		}

		if (intent.movementIntent && !containsAny(lower, /\b(?:move|moves|moved|approach|approaches|approached|step|steps|stepped|walk|walks|walked|head|heads|headed|travel|travels|traveled|enter|enters|entered|leave|leaves|left|closer|toward|towards|nearer)\b/i)) {
			missingRequirements.push('The immediate physical movement/position change should be represented.');
			violations.push({ code: 'MISSING_MOVEMENT', message: 'The player requested movement, but the narration does not depict a corresponding movement or position change.', severity: 'MEDIUM' });
		}

		if (intent.observationIntent && !containsAny(lower, /\b(?:hear|hears|heard|listen|listens|listened|overhear|overheard|notice|notices|noticed|observe|observes|observed|watch|watches|watched|see|sees|saw|look|looks|looked|spot|spots|inspect|inspects|examines|examined|sense|senses|detected|detects|attend|attended|attention|attentive|focus|focused|conversation|whisper|whispers|whispered|sound|sounds|voice|voices|rumou?r|hearsay)\b/i)) {
			missingRequirements.push('The requested observation should produce an observable result or limitation.');
			violations.push({ code: 'MISSING_OBSERVATION', message: 'The player requested observation/listening, but no observable result or grounded limitation was narrated.', severity: 'MEDIUM' });
		}

		if (intent.informationGoal && !intent.speechIntent) {
			const researchAnchors = [
				...situation.visibleEvents.map((event) => event.summary),
				...situation.relevantLore.map((fact) => [fact.predicate, fact.objectValue].join(' ')),
				...situation.openThreads.map((thread) => [thread.title, thread.summary].filter(Boolean).join(' ')),
				situation.plot.summary,
				situation.activeDialogue?.text || '',
				...plan.informationToReveal.map((reveal) => reveal.topic),
			].join(' ');
			if (overlap(narration, researchAnchors) < 0.08 && !/\b(?:nothing|no one|nobody|unclear|uncertain|unknown|unverified|could not|couldn't|refused|silent|silence)\b/i.test(lower)) {
				missingRequirements.push('The information-seeking action should resolve against the established scene lead or clearly state that no reliable information was obtained.');
				violations.push({ code: 'MISSING_INFORMATION', message: 'The narration did not visibly connect the information-seeking action to the current researched scene.', severity: 'MEDIUM' });
			}
		}

		// Observation turns have an additional grounding requirement: concrete
		// physical props must be supported by the canonical player-visible scene.
		// This prevents a narrator from inventing a lamp/chair/weapon and then
		// treating that invention as world fact on the next turn.
		if (intent.observationIntent) {
			const unsupportedObjects = extractConcreteObjectClaims(narration)
				.filter((claim) => !isConcreteClaimSupported(claim, situation));
			const unsupportedEnvironment = extractEnvironmentalClaims(narration)
				.filter((claim) => !isConcreteClaimSupported(claim, situation));
			const unsupportedConcreteClaims = Array.from(new Set([...unsupportedObjects, ...unsupportedEnvironment])).slice(0, 8);
			if (unsupportedConcreteClaims.length > 0) {
				unsupportedClaims.push(...unsupportedConcreteClaims);
				violations.push({
					code: 'UNSUPPORTED_CLAIM',
					message: 'Observation narration introduced concrete physical/environmental details not supported by canonical scene evidence: ' + unsupportedConcreteClaims.join(', ') + '.',
					severity: 'HIGH',
				});
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
