import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { EphemeralNarrativePlan } from './narrativeDirector';
import type { StructuredTurnPackage } from './aiOrchestrator';

export type NarrativeReviewDecision = 'ACCEPT' | 'REWRITE' | 'REJECT';

export interface NarrativeViolation {
\tcode:
\t\t| 'SEMANTIC_MISMATCH'
\t\t| 'MISSING_MOVEMENT'
\t\t| 'MISSING_OBSERVATION'
\t\t| 'MISSING_INFORMATION'
\t\t| 'UNAUTHORIZED_SPEECH'
\t\t| 'PLAYER_AGENCY'
\t\t| 'UNSUPPORTED_CLAIM'
\t\t| 'UNSUPPORTED_STATE_PROPOSAL'
\t\t| 'CANONICAL_CONTRADICTION';
\tmessage: string;
\tseverity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface NarrativeReview {
\tdecision: NarrativeReviewDecision;
\tviolations: NarrativeViolation[];
\tmissingRequirements: string[];
\tunsupportedClaims: string[];
\tplayerAgencyViolation: boolean;
\tsemanticMismatch: boolean;
\tsource: 'DETERMINISTIC' | 'AI' | 'HYBRID';
\tconfidence: number;
}

function normalize(value: unknown): string {
\treturn String(value ?? '').trim().toLowerCase();
}

function tokens(value: unknown): string[] {
\treturn Array.from(new Set(
\t\tnormalize(value)
\t\t\t.split(/[^a-z0-9]+/)
\t\t\t.filter((token) => token.length >= 5),
\t));
}

function overlap(a: string, b: string): number {
\tconst left = new Set(tokens(a));
\tconst right = tokens(b);
\tif (!left.size || !right.length) return 0;
\treturn right.filter((token) => left.has(token)).length / Math.min(left.size, right.length, 12);
}

function containsAny(text: string, pattern: RegExp): boolean {
\treturn pattern.test(text);
}

function buildForbiddenKnowledgeSet(situation: CurrentSituation): string[] {
\tconst authorized = new Set(
\t\tsituation.playerKnowledge.knownFacts
\t\t\t.map((fact) => normalize(JSON.stringify(fact)))
\t\t\t.filter(Boolean),
\t);
\treturn situation.worldFacts
\t\t.filter((fact) => !authorized.has(normalize(JSON.stringify(fact))))
\t\t.flatMap((fact) => [
\t\t\tString(fact.subjectEntityId || ''),
\t\t\tString(fact.predicate || ''),
\t\t\tString(fact.objectValue || ''),
\t\t])
\t\t.map(normalize)
\t\t.filter((value) => value.length >= 6);
}

function hasMajorAgencyTakeover(narration: string): boolean {
\treturn containsAny(
\t\tnarration,
\t\t/\\b(?:you|the protagonist|your character)\\s+(?:decide|decides|decided|choose|chooses|chose|agree|agrees|agreed|follow|follows|followed|leave|leaves|left|attack|attacks|attacked|kill|kills|killed)\\b/i,
\t);
}

export class SemanticNarrativeReview {
\tpublic static review(params: {
\t\tintent: PlayerIntent;
\t\tsituation: CurrentSituation;
\t\tplan: EphemeralNarrativePlan;
\t\tturnPackage: StructuredTurnPackage;
\t}): NarrativeReview {
\t\tconst { intent, situation, plan, turnPackage } = params;
\t\tconst narration = turnPackage.narrative.join(' ').trim();
\t\tconst violations: NarrativeViolation[] = [];
\t\tconst missingRequirements: string[] = [];
\t\tconst unsupportedClaims: string[] = [];

\t\tif (!narration) {
\t\t\tviolations.push({ code: 'SEMANTIC_MISMATCH', message: 'Narrative output is empty.', severity: 'HIGH' });
\t\t\treturn {
\t\t\t\tdecision: 'REJECT',
\t\t\t\tviolations,
\t\t\t\tmissingRequirements: ['A non-empty player-facing narrative is required.'],
\t\t\t\tunsupportedClaims,
\t\t\t\tplayerAgencyViolation: false,
\t\t\t\tsemanticMismatch: true,
\t\t\t\tsource: 'DETERMINISTIC',
\t\t\t\tconfidence: 1,
\t\t\t};
\t\t}

\t\tconst lower = normalize(narration);

\t\tif (intent.speechIntent === false && intent.observationIntent) {
\t\t\tif (containsAny(lower, /\\b(?:you|the protagonist|your character)\\s+(?:ask|asks|asked|say|says|said|speak|speaks|spoke|tell|tells|told|reply|replies|replied|shout|shouts|shouted|call out|calls out)\\b/i)) {
\t\t\t\tviolations.push({ code: 'UNAUTHORIZED_SPEECH', message: 'Narration converted a non-speaking observation/listening action into protagonist speech.', severity: 'HIGH' });
\t\t\t}
\t\t}

\t\tif (intent.movementIntent && !containsAny(lower, /\\b(?:move|moves|moved|approach|approaches|approached|step|steps|stepped|walk|walks|walked|head|heads|headed|travel|travels|traveled|enter|enters|entered|leave|leaves|left|closer|toward|towards|nearer)\\b/i)) {
\t\t\tmissingRequirements.push('The immediate physical movement/position change should be represented.');
\t\t\tviolations.push({ code: 'MISSING_MOVEMENT', message: 'The player requested movement, but the narration does not depict a corresponding movement or position change.', severity: 'MEDIUM' });
\t\t}

\t\tif (intent.observationIntent && !containsAny(lower, /\\b(?:hear|hears|heard|listen|listens|listened|overhear|overheard|notice|notices|noticed|observe|observes|observed|watch|watches|watched|see|sees|saw|look|looks|looked|spot|spots|inspect|inspects|examines|examined|sense|senses|detected|detects)\\b/i)) {
\t\t\tmissingRequirements.push('The requested observation should produce an observable result or limitation.');
\t\t\tviolations.push({ code: 'MISSING_OBSERVATION', message: 'The player requested observation/listening, but no observable result or grounded limitation was narrated.', severity: 'MEDIUM' });
\t\t}

\t\tif (intent.informationGoal) {
\t\t\tconst researchAnchors = [
\t\t\t\t...situation.visibleEvents.map((event) => event.summary),
\t\t\t\t...situation.relevantLore.map((fact) => [fact.predicate, fact.objectValue].join(' ')),
\t\t\t\t...plan.informationToReveal.map((reveal) => reveal.content),
\t\t\t].join(' ');
\t\t\tif (overlap(narration, researchAnchors) < 0.08 && !/\\b(?:nothing|no one|nobody|unclear|uncertain|unknown|unverified|could not|couldn't|refused|silent|silence)\\b/i.test(lower)) {
\t\t\t\tmissingRequirements.push('The information-seeking action should resolve against the established scene lead or clearly state that no reliable information was obtained.');
\t\t\t\tviolations.push({ code: 'MISSING_INFORMATION', message: 'The narration did not visibly connect the information-seeking action to the current researched scene.', severity: 'MEDIUM' });
\t\t\t}
\t\t}

\t\tconst forbidden = buildForbiddenKnowledgeSet(situation);
\t\tconst likelyForbidden = forbidden.filter((value) => value && lower.includes(value));
\t\tif (likelyForbidden.length > 0) {
\t\t\tunsupportedClaims.push(...likelyForbidden.slice(0, 6));
\t\t\tviolations.push({ code: 'UNSUPPORTED_CLAIM', message: 'Narration appears to expose canonical facts outside the viewer knowledge boundary.', severity: 'HIGH' });
\t\t}

\t\tif (hasMajorAgencyTakeover(narration) && !/\\b(?:you must|you cannot|you can|you may|you are able)\\b/i.test(lower)) {
\t\t\tviolations.push({ code: 'PLAYER_AGENCY', message: 'Narration appears to decide a consequential player choice rather than present the consequence and leave the decision open.', severity: 'MEDIUM' });
\t\t}

\t\tconst proposedStateKinds = new Set((turnPackage.stateChanges || []).map((change) => normalize(change.kind)));
\t\tif (proposedStateKinds.has('location') && !intent.movementIntent) {
\t\t\tviolations.push({ code: 'UNSUPPORTED_STATE_PROPOSAL', message: 'The generated package proposes a location mutation even though the player intent contains no movement.', severity: 'HIGH' });
\t\t}

\t\tfor (const forbiddenAssumption of plan.forbiddenAssumptions) {
\t\t\tif (forbiddenAssumption && lower.includes(normalize(forbiddenAssumption))) {
\t\t\t\tviolations.push({ code: 'UNSUPPORTED_CLAIM', message: 'Narration directly repeats a forbidden assumption from the one-turn narrative plan.', severity: 'HIGH' });
\t\t\t}
\t\t}

\t\tconst high = violations.filter((violation) => violation.severity === 'HIGH').length;
\t\tconst medium = violations.filter((violation) => violation.severity === 'MEDIUM').length;
\t\tconst semanticMismatch = violations.some((violation) =>
\t\t\t['SEMANTIC_MISMATCH', 'MISSING_MOVEMENT', 'MISSING_OBSERVATION', 'MISSING_INFORMATION', 'UNAUTHORIZED_SPEECH'].includes(violation.code)
\t\t);
\t\tconst playerAgencyViolation = violations.some((violation) => violation.code === 'PLAYER_AGENCY');

\t\treturn {
\t\t\tdecision: high > 0 ? 'REJECT' : (medium > 0 || missingRequirements.length > 0 ? 'REWRITE' : 'ACCEPT'),
\t\t\tviolations,
\t\t\tmissingRequirements,
\t\t\tunsupportedClaims,
\t\t\tplayerAgencyViolation,
\t\t\tsemanticMismatch,
\t\t\tsource: 'DETERMINISTIC',
\t\t\tconfidence: high > 0 ? 0.98 : medium > 0 ? 0.9 : 0.82,
\t\t};
\t}

\tpublic static buildRewritePrompt(params: {
\t\tintent: PlayerIntent;
\t\tsituation: CurrentSituation;
\t\tplan: EphemeralNarrativePlan;
\t\tturnPackage: StructuredTurnPackage;
\t\treview: NarrativeReview;
\t}): string {
\t\treturn [
\t\t\t'Rewrite the following Dreamville narrative turn once.',
\t\t\t'Preserve canonical facts and the player agency boundary.',
\t\t\t'Fix only the listed semantic review violations; do not introduce new facts or a new plot direction.',
\t\t\t'Player intent: ' + JSON.stringify(params.intent),
\t\t\t'Narrative plan: ' + JSON.stringify(params.plan),
\t\t\t'Review: ' + JSON.stringify(params.review),
\t\t\t'Current situation: ' + JSON.stringify({
\t\t\t\tlocation: params.situation.location,
\t\t\t\tnearbyEntities: params.situation.nearbyEntities.filter((entity) => entity.visibleToPlayer).slice(0, 8),
\t\t\t\tvisibleEvents: params.situation.visibleEvents.slice(0, 6),
\t\t\t\tactiveDialogue: params.situation.activeDialogue,
\t\t\t}),
\t\t\t'Original structured turn: ' + JSON.stringify(params.turnPackage),
\t\t\t'Return the complete structured turn package as JSON only with narrative, dialogue, events, stateChanges, memoryCandidates, audioCues, and visualCues.',
\t\t].join('\\n');
\t}
}
