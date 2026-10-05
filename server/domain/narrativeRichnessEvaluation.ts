import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { EphemeralNarrativePlan } from './narrativeDirector';
import type { StructuredTurnPackage } from './aiOrchestrator';

export type NarrativeRichnessDecision = 'PASS' | 'IMPROVE';
export type NarrativeRichnessSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type NarrativeRichnessDimension =
	| 'ACTION_SUBSTANCE'
	| 'SPECIFICITY'
	| 'CHARACTER_DIALOGUE_INDIVIDUALITY'
	| 'SUBTEXT'
	| 'EMOTIONAL_PROGRESSION'
	| 'SENSORY_VARIETY'
	| 'BEAT_PROGRESSION'
	| 'DRAMATIC_TENSION'
	| 'MEANINGFUL_REACTION'
	| 'FRESHNESS'
	| 'SETUP_PAYOFF'
	| 'CLOSURE'
	| 'PLAYER_AGENCY';

export interface NarrativeRichnessDimensionResult {
	dimension: NarrativeRichnessDimension;
	score: number;
	status: 'STRONG' | 'ADEQUATE' | 'WEAK';
	evidence: string[];
}

export interface NarrativeRichnessIssue {
	dimension: NarrativeRichnessDimension;
	severity: NarrativeRichnessSeverity;
	message: string;
	evidence?: string;
}

export interface NarrativeRichnessEvaluation {
	version: 1;
	decision: NarrativeRichnessDecision;
	overallScore: number;
	dimensions: NarrativeRichnessDimensionResult[];
	issues: NarrativeRichnessIssue[];
	strengths: string[];
	source: 'DETERMINISTIC';
	confidence: number;
	fallbackReason?: string;
	presentationOnly: true;
}

const WEIGHTS: Record<NarrativeRichnessDimension, number> = {
	ACTION_SUBSTANCE: 0.16,
	SPECIFICITY: 0.09,
	CHARACTER_DIALOGUE_INDIVIDUALITY: 0.09,
	SUBTEXT: 0.08,
	EMOTIONAL_PROGRESSION: 0.08,
	SENSORY_VARIETY: 0.05,
	BEAT_PROGRESSION: 0.10,
	DRAMATIC_TENSION: 0.08,
	MEANINGFUL_REACTION: 0.08,
	FRESHNESS: 0.08,
	SETUP_PAYOFF: 0.04,
	CLOSURE: 0.02,
	PLAYER_AGENCY: 0.03,
};

const STOP_WORDS = new Set([
	'the', 'and', 'that', 'this', 'with', 'from', 'into', 'then', 'than', 'they', 'their', 'there',
	'were', 'was', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'your', 'you', 'for',
	'are', 'but', 'not', 'his', 'her', 'him', 'she', 'its', 'our', 'out', 'over', 'under', 'after',
	'before', 'about', 'what', 'when', 'where', 'which', 'while', 'just', 'only', 'very', 'some',
]);

const SENSORY_LEXICONS: Record<string, RegExp> = {
	SIGHT: /\b(?:bright|dark|shadow|light|glow|gleam|red|blue|green|pale|silver|black|white|color|colour|shape|outline|glimpse|see|saw|watch|stare|look|visible|shimmer|flicker)\b/i,
	SOUND: /\b(?:sound|sounds|heard|hear|listen|whisper|whispers|voice|voices|clang|crack|rumble|hum|hiss|ring|silence|echo|echoes|thud|creak|song|music)\b/i,
	TOUCH: /\b(?:cold|warm|hot|heat|chill|rough|smooth|wet|dry|sharp|soft|hard|skin|fingers|grip|touch|pressure|sting|burn|ache|shiver)\b/i,
	SMELL: /\b(?:smell|scent|scented|odor|odour|stink|fragrance|smoke|musty|bitter|earthy|ozone|blood)\b/i,
	TASTE: /\b(?:taste|tasted|salty|sweet|bitter|sour|metallic|tongue|mouth)\b/i,
	MOTION: /\b(?:step|steps|stepped|move|moves|moved|turn|turns|turned|reach|reaches|reached|fall|falls|fell|rise|rises|rose|cross|crosses|crossed|rush|rushes|rushed|stumble|stumbles|stumbled|approach|approaches|approached)\b/i,
};

const EMOTION_PATTERNS: Record<string, RegExp> = {
	FEAR: /\b(?:fear|afraid|dread|uneasy|nervous|tense|tremble|trembled|flinch|panic|wary|hesitat|alarmed)\w*/i,
	ANGER: /\b(?:anger|angry|rage|furious|snarl|snarled|bitter|resent|hostile|scowl|frown)\w*/i,
	RELIEF: /\b(?:relief|relieved|reassured|exhale|exhaled|ease|eased|calm|settle|settled|soothed)\w*/i,
	JOY: /\b(?:joy|glad|delight|delighted|smile|smiled|laugh|laughed|warmth|pleased)\w*/i,
	GRIEF: /\b(?:grief|grief-stricken|sorrow|sorrowful|mourn|mourned|tears|wept|sad|loss)\w*/i,
	CURIOSITY: /\b(?:curious|wonder|wondered|intrigue|intrigued|puzzled|question|fascinat)\w*/i,
};

const REACTION_PATTERN = /\b(?:hesitat|flinch|blink|stare|glance|recoil|step back|swallow|tighten|relax|shudder|smile|frown|laugh|snarl|whisper|gasp|freeze|turn|lean|brace|tense|soften)\w*/i;
const TENSION_PATTERN = /\b(?:danger|threat|warning|risk|uncertain|unknown|watch|watched|corner|trap|blade|weapon|alarm|tense|silence|refuse|refused|hesitat|blood|shadow|pursu|deadline|breach|dangerous)\w*/i;
const PROGRESSION_PATTERN = /\b(?:then|but|however|before|after|until|suddenly|instead|revealed|reveals|discovered|discover|answered|changed|change|shifted|shifts|opened|closed|stopped|started|returned|remained|remains|finally|now)\b/i;
const CLOSURE_PATTERN = /\b(?:settled|lingered|remained|remains|faded|fades|quiet|silence|still|now|afterward|afterwards|left|leaves|closed|ended|finished|reassured|waiting|watching)\b/i;
const AGENCY_TAKEOVER_PATTERN = /\b(?:you|the protagonist|your character)\s+(?:decide|decides|decided|choose|chooses|chose|agree|agrees|agreed|follow|follows|followed|leave|leaves|left|attack|attacks|attacked|kill|kills|killed|promise|promises|promised)\b/i;

function normalize(value: unknown): string {
	return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function lower(value: unknown): string {
	return normalize(value).toLowerCase();
}

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function words(value: unknown): string[] {
	return Array.from(new Set(
		lower(value)
			.split(/[^a-z0-9'-]+/)
			.map((token) => token.replace(/^['-]+|['-]+$/g, ''))
			.filter((token) => token.length >= 4 && !STOP_WORDS.has(token)),
	));
}

function sentences(value: string): string[] {
	return normalize(value).split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
}

function overlap(left: string, right: string): number {
	const a = new Set(words(left));
	const b = words(right);
	if (!a.size || !b.length) return 0;
	return b.filter((token) => a.has(token)).length / Math.min(a.size, b.length, 12);
}

function dimensionStatus(score: number): NarrativeRichnessDimensionResult['status'] {
	if (score >= 0.78) return 'STRONG';
	if (score >= 0.58) return 'ADEQUATE';
	return 'WEAK';
}

function dimension(
	dimensionName: NarrativeRichnessDimension,
	score: number,
	evidence: string[] = [],
): NarrativeRichnessDimensionResult {
	const normalizedScore = clamp(score);
	return {
		dimension: dimensionName,
		score: Number(normalizedScore.toFixed(3)),
		status: dimensionStatus(normalizedScore),
		evidence: evidence.filter(Boolean).slice(0, 4),
	};
}

function isMicroTurn(intent: PlayerIntent, plan: EphemeralNarrativePlan): boolean {
	return (
		intent.interactionMode === 'PASSIVE_OBSERVATION' ||
		intent.action === 'observe' ||
		plan.sceneComposition?.pacingShape === 'MICRO_BEAT'
	);
}

function scoreActionSubstance(
	text: string,
	intent: PlayerIntent,
	plan: EphemeralNarrativePlan,
): NarrativeRichnessDimensionResult {
	const actionSignals = (text.match(/\b(?:ask(?:s|ed)?|answer(?:s|ed)?|reply(?:s|ied)?|respond(?:s|ed)?|report(?:s|ed)?|tell(?:s|told)?|say(?:s|said)?|speak(?:s|spoke)?|question(?:s|ed)?|explain(?:s|ed)?|reveal(?:s|ed)?|confirm(?:s|ed)?|refuse(?:s|d)?|listen(?:s|ed)?|hear(?:s|d)?|observe(?:s|d)?|inspect(?:s|ed)?|check(?:s|ed)?|draw(?:s|ew)?|grip(?:s|ped)?|tighten(?:s|ed)?|open(?:s|ed)?|close(?:s|d)?|touch(?:es|ed)?|reach(?:es|ed)?|move(?:s|d)?|step(?:s|ped)?|cross(?:es|ed)?|approach(?:es|ed)?|turn(?:s|ed)?|take(?:s|ook)?|pick(?:s|ed)?|enter(?:s|ed)?|leave(?:s|ft)?|hand(?:s|ed)?|give(?:s|ave)?|receive(?:s|d)?|notice(?:s|d)?|discover(?:s|ed)?|find(?:s|ound)?|learn(?:s|ed)?|wait(?:s|ed)?|prepare(?:s|d)?|ready(?:s|ied)?|settle(?:s|d)?|brace(?:s|d)?|raise(?:s|d)?|lower(?:s|ed)?|draw(?:s|ew)?|unsheath(?:s|ed)?|sheath(?:s|ed)?)\b/gi) || []).length;
	const reactionSignals = (text.match(/\b(?:nod(?:s|ded)?|flinch(?:es|ed)?|hesitat(?:es|ed)?|glance(?:s|d)?|stare(?:s|d)?|recoil(?:s|ed)?|smile(?:s|d)?|frown(?:s|ed)?|laugh(?:s|ed)?|gasp(?:s|ed)?|freeze(?:s|d)?|watch(?:es|ed)?|acknowledge(?:s|d)?|gesture(?:s|d)?|pause(?:s|d)?|turn(?:s|ed)?|answer(?:s|ed)?|reply(?:s|ied)?|respond(?:s|ed)?|refuse(?:s|d)?|warn(?:s|ed)?|explain(?:s|ed)?|tell(?:s|told)?|say(?:s|said)?)\b/gi) || []).length;
	const informationSignals = (text.match(/\b(?:learn(?:s|ed)?|discover(?:s|ed)?|reveal(?:s|ed)?|explain(?:s|ed)?|confirm(?:s|ed)?|report(?:s|ed)?|answer(?:s|ed)?|reply(?:s|ied)?|respond(?:s|ed)?|state(?:s|d)?|mention(?:s|ed)?|admit(?:s|ted)?|warn(?:s|ed)?|nothing|unknown|uncertain|unclear|refuse(?:s|d)? to answer|no reliable answer)\b/gi) || []).length;
	const sensorySignals = (text.match(/\b(?:shadow|light|glow|dark|sky|stone|air|dust|smell|scent|sound|echo|murmur|roar|wind|cold|warm|autumn|brass|iron|earth|floor|wall|arch)\b/gi) || []).length;
	const sentenceCount = sentences(text).length;
	const isInformationTurn = intent.interactionMode === 'DIALOGUE' || intent.interactionMode === 'INFORMATION_SEEKING' || Boolean(intent.informationGoal);
	const hasResolution = reactionSignals > 0 || informationSignals > 0 || Boolean(plan.sceneComposition?.closingBeat && overlap(text, plan.sceneComposition.closingBeat) > 0.05);
	const actionCoverage = actionSignals > 0 ? Math.min(1, 0.42 + Math.min(0.38, actionSignals * 0.08)) : 0.18;
	const resolutionCoverage = hasResolution ? 0.22 : isInformationTurn ? 0 : 0.10;
	const sensoryPenalty = sensorySignals > actionSignals * 1.5 && sentenceCount >= 2 ? 0.24 : sensorySignals > actionSignals && sentenceCount >= 3 ? 0.12 : 0;
	const score = clamp(actionCoverage + resolutionCoverage - sensoryPenalty);
	const evidence = [
		actionSignals ? actionSignals + ' concrete action/resolution signals detected.' : 'No concrete current-turn action signal detected.',
		hasResolution ? 'The narration contains a response, consequence, information result, or closing beat.' : 'The narration does not clearly provide a response, consequence, information result, or closing beat.',
		sensoryPenalty ? 'Decorative/environmental detail outweighs substantive action signals.' : 'Environmental detail remains subordinate to the current-turn action.',
	];
	return dimension('ACTION_SUBSTANCE', score, evidence);
}

function scoreSpecificity(
	text: string,
	situation: CurrentSituation,
	plan: EphemeralNarrativePlan,
): NarrativeRichnessDimensionResult {
	const anchors = [
		situation.location.name,
		...situation.nearbyEntities.filter((entity) => entity.visibleToPlayer).slice(0, 8).map((entity) => entity.name),
		...situation.visibleEvents.slice(0, 6).map((event) => event.summary),
		situation.activeDialogue?.speakerName,
		situation.location.ambientSensory,
		...(plan.sceneComposition?.narrativeFocus || []),
	].map(normalize).filter((value) => value.length >= 4);
	const lowerText = lower(text);
	const matched = anchors.filter((anchor) => lowerText.includes(anchor.toLowerCase())).length;
	const detailSignals = [
		/\b(?:door|stone|wall|floor|window|cloak|blade|torch|lamp|table|road|arch|book|scroll|stairs|rain|dust|mist|iron|wood|glass|rope|blood|ash)\b/i.test(text),
		/\b(?:red|blue|green|black|white|silver|golden|pale|faint|narrow|broad|cracked|worn|wet|cold|warm|rough|sharp|quiet|loud)\b/i.test(text),
		/\b(?:near|behind|beneath|beside|across|through|inside|outside|under|above)\b/i.test(text),
	].filter(Boolean).length;
	if (!anchors.length) {
		return dimension(
			'SPECIFICITY',
			plan.sceneComposition?.beatType === 'MICRO_ACTION' ? 0.68 : 0.58,
			['No strong scene anchors were available to compare against.'],
		);
	}
	const score = clamp(0.30 + matched * 0.18 + detailSignals * 0.10);
	return dimension('SPECIFICITY', score, [
		matched ? matched + ' supplied scene anchors appear in the narration.' : 'Few supplied scene anchors are echoed in the narration.',
		detailSignals ? detailSignals + ' concrete detail signals are present.' : 'Concrete scene detail is sparse.',
	]);
}

function scoreDialogueIndividuality(
	text: string,
	intent: PlayerIntent,
	turnPackage: StructuredTurnPackage,
): NarrativeRichnessDimensionResult {
	const dialogue = Array.isArray(turnPackage.dialogue)
		? turnPackage.dialogue.filter((entry) => normalize(entry?.text))
		: [];
	if (!intent.speechIntent && intent.interactionMode !== 'DIALOGUE' && dialogue.length === 0) {
		return dimension('CHARACTER_DIALOGUE_INDIVIDUALITY', 0.72, ['No player dialogue or NPC dialogue was required for this turn.']);
	}
	if (dialogue.length === 0) {
		return dimension('CHARACTER_DIALOGUE_INDIVIDUALITY', 0.28, ['A dialogue-shaped turn contains no structured dialogue.']);
	}
	const speakerNames = new Set(dialogue.map((entry) => normalize(entry.speaker)).filter(Boolean));
	const openings = new Set(dialogue.map((entry) => lower(entry.text).split(/\s+/).slice(0, 5).join(' ')).filter(Boolean));
	const genericCount = dialogue.filter((entry) => /\b(?:hello|hi|i don't know|okay|sure|yes|no)\b/i.test(entry.text) && words(entry.text).length <= 5).length;
	const variationBonus = speakerNames.size > 1 ? 0.10 : openings.size > 1 ? 0.06 : 0;
	const genericPenalty = genericCount ? Math.min(0.28, genericCount * 0.12) : 0;
	return dimension('CHARACTER_DIALOGUE_INDIVIDUALITY', clamp(0.58 + variationBonus - genericPenalty + Math.min(0.18, dialogue.length * 0.04)), [
		speakerNames.size > 1 ? 'Multiple speakers have distinct dialogue records.' : 'Dialogue is anchored to a single speaker.',
		genericCount ? 'Some dialogue is extremely generic or under-specified.' : 'Dialogue contains enough lexical material to inspect character voice.',
	]);
}

function scoreSubtext(text: string, plan: EphemeralNarrativePlan): NarrativeRichnessDimensionResult {
	const cues = plan.sceneComposition?.subtext || [];
	if (!cues.length) return dimension('SUBTEXT', 0.66, ['No explicit subtext cue was supplied for this turn.']);
	const cueOverlap = cues.reduce((sum, cue) => sum + overlap(text, cue), 0) / cues.length;
	const indirectSignals = [
		/\b(?:but|though|yet|still|hesitat|avoided|deflect|careful|quietly|without saying|did not answer|looked away|wouldn't|would not)\b/i.test(text),
		/["“].+["”]/.test(text) && /\b(?:pause|hesitat|glance|stare|smile|frown|shrug|silence)\w*\b/i.test(text),
	].filter(Boolean).length;
	return dimension('SUBTEXT', clamp(0.36 + cueOverlap * 0.44 + indirectSignals * 0.10), [
		cueOverlap > 0 ? 'Narration overlaps supplied subtext cues.' : 'Narration does not strongly echo supplied subtext cues.',
		indirectSignals ? indirectSignals + ' indirect/subtext signals are present.' : 'Few indirect behavioral signals are present.',
	]);
}

function scoreEmotionalProgression(text: string, intent: PlayerIntent, plan: EphemeralNarrativePlan): NarrativeRichnessDimensionResult {
	const sentencesList = sentences(text);
	const categories = new Set<string>();
	for (const sentence of sentencesList) {
		for (const [category, pattern] of Object.entries(EMOTION_PATTERNS)) {
			if (pattern.test(sentence)) categories.add(category);
		}
	}
	const movement = plan.sceneComposition?.emotionalMovement || 'HOLD';
	if (isMicroTurn(intent, plan) && sentencesList.length <= 2) {
		return dimension('EMOTIONAL_PROGRESSION', 0.70, ['Micro-turn length does not require a pronounced emotional arc.']);
	}
	const transition = PROGRESSION_PATTERN.test(text) ? 1 : 0;
	const score = movement === 'HOLD'
		? clamp(0.48 + Math.min(0.35, categories.size * 0.12) + transition * 0.06)
		: clamp(0.34 + Math.min(0.42, categories.size * 0.15) + transition * 0.12 + (categories.size >= 2 ? 0.08 : 0));
	return dimension('EMOTIONAL_PROGRESSION', score, [
		categories.size ? 'Detected emotional categories: ' + Array.from(categories).join(', ') + '.' : 'Little explicit emotional evidence detected.',
		movement !== 'HOLD' ? 'The composition requests emotional movement: ' + movement + '.' : 'The composition allows an emotional hold.',
	]);
}

function scoreSensoryVariety(text: string, intent: PlayerIntent, plan: EphemeralNarrativePlan): NarrativeRichnessDimensionResult {
	const detected = Object.entries(SENSORY_LEXICONS)
		.filter(([, pattern]) => pattern.test(text))
		.map(([key]) => key);
	if (isMicroTurn(intent, plan) && detected.length === 0) {
		return dimension('SENSORY_VARIETY', 0.68, ['Micro-turn does not require multiple sensory channels.']);
	}
	const variety = Math.min(1, detected.length / 3);
	const repeatedSingleChannel = detected.length === 1 && Boolean(plan.sceneComposition?.sensoryAnchor);
	return dimension('SENSORY_VARIETY', clamp(0.42 + variety * 0.56 - (repeatedSingleChannel ? 0.08 : 0)), [
		detected.length ? 'Sensory channels present: ' + detected.join(', ') + '.' : 'No clear sensory channel was detected.',
	]);
}

function scoreBeatProgression(text: string, intent: PlayerIntent, plan: EphemeralNarrativePlan): NarrativeRichnessDimensionResult {
	const sentenceCount = sentences(text).length;
	const actionCount = (text.match(/\b(?:move|moved|moves|step|stepped|steps|reach|reached|look|looked|watch|watched|speak|spoke|answer|answered|open|opened|close|closed|turn|turned|take|took|draw|drew|raise|raised|lower|lowered|cross|crossed|notice|noticed|discover|discovered|reveal|revealed|touch|touched|hear|heard)\w*\b/gi) || []).length;
	const progression = PROGRESSION_PATTERN.test(text) ? 1 : 0;
	if (isMicroTurn(intent, plan)) {
		return dimension('BEAT_PROGRESSION', clamp(0.62 + (actionCount > 0 ? 0.16 : 0) + (sentenceCount >= 2 ? 0.08 : 0)), ['Micro-turn profile permits a single focused beat.']);
	}
	return dimension('BEAT_PROGRESSION', clamp(0.38 + Math.min(0.34, actionCount * 0.08) + Math.min(0.20, Math.max(0, sentenceCount - 1) * 0.05) + progression * 0.10), [
		actionCount ? actionCount + ' observable action/change signals detected.' : 'Few observable action/change signals detected.',
	]);
}

function scoreDramaticTension(text: string, plan: EphemeralNarrativePlan): NarrativeRichnessDimensionResult {
	const direction = String(plan.sceneComposition?.tensionDirection || plan.episodeProjection?.trajectory || 'STEADY').toUpperCase();
	const tensionSignals = (text.match(TENSION_PATTERN) || []).length;
	if (/(STEADY|HOLD|ESTABLISH)/.test(direction)) {
		return dimension('DRAMATIC_TENSION', clamp(0.60 + Math.min(0.22, tensionSignals * 0.04)), ['The current turn does not explicitly require escalation.']);
	}
	return dimension('DRAMATIC_TENSION', clamp(0.38 + Math.min(0.50, tensionSignals * 0.07)), [
		tensionSignals ? tensionSignals + ' tension-bearing terms/signals detected.' : 'The turn asks for pressure movement but contains little explicit tension evidence.',
		'Requested tension direction: ' + direction + '.',
	]);
}

function scoreMeaningfulReaction(text: string, plan: EphemeralNarrativePlan): NarrativeRichnessDimensionResult {
	const priorities = plan.sceneComposition?.reactionPriority || [];
	if (!priorities.length) return dimension('MEANINGFUL_REACTION', 0.69, ['No explicit reaction participant was prioritized.']);
	const lowerText = lower(text);
	let hits = 0;
	for (const name of priorities.slice(0, 4)) {
		const normalized = lower(name);
		if (normalized && lowerText.includes(normalized) && REACTION_PATTERN.test(text)) hits += 1;
	}
	const score = clamp(0.34 + Math.min(0.58, hits * 0.18));
	return dimension('MEANINGFUL_REACTION', score, [
		hits ? hits + ' prioritized reaction participant(s) have observable reaction evidence.' : 'Prioritized reaction participants are not accompanied by clear observable reaction cues.',
	]);
}

function scoreFreshness(text: string, previousNarrations: string[] = []): NarrativeRichnessDimensionResult {
	if (!previousNarrations.length) return dimension('FRESHNESS', 0.76, ['No recent narration history was supplied for comparison.']);
	const currentSentences = sentences(text);
	const opening = lower(currentSentences[0] || '').slice(0, 70);
	const previous = previousNarrations.slice(-6)
		.map((item) => sentences(item)[0]?.toLowerCase().slice(0, 70))
		.filter(Boolean);
	const exactOpening = previous.includes(opening);
	const recentOverlap = previousNarrations.slice(-3).reduce((sum, item) => sum + overlap(text, item), 0) / Math.min(3, previousNarrations.length);
	const score = clamp(0.86 - (exactOpening ? 0.44 : 0) - Math.min(0.24, recentOverlap * 0.32));
	return dimension('FRESHNESS', score, [
		exactOpening ? 'The opening closely repeats a recent narration opening.' : 'The opening does not exactly repeat a recent narration opening.',
		recentOverlap > 0.45 ? 'Vocabulary overlap with recent narration is comparatively high.' : 'Recent-turn lexical overlap remains bounded.',
	]);
}

function scoreSetupPayoff(text: string, plan: EphemeralNarrativePlan): NarrativeRichnessDimensionResult {
	const setup = [
		...(plan.episodeProjection?.recentBeats || []).slice(-3),
		...(plan.episodeProjection?.continuityAnchors || []).slice(-3),
		...(plan.sceneComposition?.reveal || []),
	].join(' ');
	if (!setup.trim()) return dimension('SETUP_PAYOFF', 0.64, ['No bounded prior setup or reveal cue was supplied.']);
	const score = clamp(0.42 + overlap(text, setup) * 0.48 + (PROGRESSION_PATTERN.test(text) ? 0.08 : 0));
	return dimension('SETUP_PAYOFF', score, [
		overlap(text, setup) > 0 ? 'The narration reconnects to bounded prior episode/reveal material.' : 'Little explicit lexical connection to prior setup was detected.',
	]);
}

function scoreClosure(text: string, plan: EphemeralNarrativePlan): NarrativeRichnessDimensionResult {
	const last = sentences(text).at(-1) || '';
	if (!last) return dimension('CLOSURE', 0.20, ['No closing sentence is available.']);
	const abrupt = /\b(?:and|but|or|because|while|if|when|though)\s*$/i.test(last) || /\.{3}$/.test(last);
	const closureSignal = CLOSURE_PATTERN.test(last);
	const objectiveSignal = Boolean(plan.sceneComposition?.closingBeat) && overlap(last, plan.sceneComposition?.closingBeat || '') > 0.05;
	return dimension('CLOSURE', clamp(0.50 + (abrupt ? -0.22 : 0.12) + (closureSignal ? 0.14 : 0) + (objectiveSignal ? 0.12 : 0)), [
		abrupt ? 'The narration ends on an unfinished conjunction or trailing construction.' : 'The final sentence is syntactically closed.',
		closureSignal || objectiveSignal ? 'The ending carries an observable closure/landing signal.' : 'The final line has limited closure evidence.',
	]);
}

function scorePlayerAgency(text: string): NarrativeRichnessDimensionResult {
	const takeover = AGENCY_TAKEOVER_PATTERN.test(text);
	return dimension('PLAYER_AGENCY', takeover ? 0.26 : 0.94, [
		takeover ? 'The narration appears to choose a consequential player action.' : 'No major consequential player-choice takeover pattern was detected.',
	]);
}

export class NarrativeRichnessEvaluator {
	public static evaluate(params: {
		intent: PlayerIntent;
		situation: CurrentSituation;
		plan: EphemeralNarrativePlan;
		turnPackage: StructuredTurnPackage;
		previousNarrations?: string[];
	}): NarrativeRichnessEvaluation {
		const text = params.turnPackage.narrative.join(' ').trim();
		if (!text) {
			return {
				version: 1,
				decision: 'IMPROVE',
				overallScore: 0,
				dimensions: [],
				issues: [{
					dimension: 'SPECIFICITY',
					severity: 'HIGH',
					message: 'Narrative output is empty.',
				}],
				strengths: [],
				source: 'DETERMINISTIC',
				confidence: 1,
				fallbackReason: 'No narration text was available for richness evaluation.',
				presentationOnly: true,
			};
		}

		const dimensions = [
			scoreActionSubstance(text, params.intent, params.plan),
			scoreSpecificity(text, params.situation, params.plan),
			scoreDialogueIndividuality(text, params.intent, params.turnPackage),
			scoreSubtext(text, params.plan),
			scoreEmotionalProgression(text, params.intent, params.plan),
			scoreSensoryVariety(text, params.intent, params.plan),
			scoreBeatProgression(text, params.intent, params.plan),
			scoreDramaticTension(text, params.plan),
			scoreMeaningfulReaction(text, params.plan),
			scoreFreshness(text, params.previousNarrations),
			scoreSetupPayoff(text, params.plan),
			scoreClosure(text, params.plan),
			scorePlayerAgency(text),
		];

		const overallScore = Number(
			clamp(
				dimensions.reduce((sum, result) => sum + result.score * WEIGHTS[result.dimension], 0),
			).toFixed(3),
		);
		const weak = dimensions.filter((result) => result.status === 'WEAK');
		const issues: NarrativeRichnessIssue[] = weak.map((result) => ({
			dimension: result.dimension,
			severity: result.dimension === 'PLAYER_AGENCY' ? 'HIGH' : result.score < 0.42 ? 'MEDIUM' : 'LOW',
			message: 'The narration is comparatively weak on ' + result.dimension.toLowerCase().replace(/_/g, ' ') + '.',
			evidence: result.evidence[0],
		}));
		const strengths = dimensions
			.filter((result) => result.status === 'STRONG')
			.sort((a, b) => b.score - a.score)
			.slice(0, 4)
			.map((result) => result.dimension.toLowerCase().replace(/_/g, ' '));

		const substance = dimensions.find((result) => result.dimension === 'ACTION_SUBSTANCE');
		const decision: NarrativeRichnessDecision =
			overallScore >= 0.68 && !weak.some((result) => result.dimension === 'PLAYER_AGENCY' || result.score < 0.32) && Boolean(substance && substance.score >= 0.50)
				? 'PASS'
				: 'IMPROVE';

		return {
			version: 1,
			decision,
			overallScore,
			dimensions,
			issues,
			strengths,
			source: 'DETERMINISTIC',
			confidence: 0.84,
			presentationOnly: true,
		};
	}

	public static toPromptContext(evaluation?: NarrativeRichnessEvaluation): string {
		if (!evaluation) return 'N18 NARRATIVE RICHNESS EVALUATION: unavailable; preserve semantic and canonical safety gates.';
		return [
			'N18 NARRATIVE RICHNESS EVALUATION v' + evaluation.version + ' (DETERMINISTIC — PRESENTATION ONLY)',
			'Decision: ' + evaluation.decision,
			'Overall richness score: ' + evaluation.overallScore.toFixed(2),
			'Dimensions: ' + evaluation.dimensions.map((item) => item.dimension + '=' + item.score.toFixed(2) + '/' + item.status).join('; '),
			evaluation.strengths.length ? 'Strengths: ' + evaluation.strengths.join(', ') : 'Strengths: none identified.',
			evaluation.issues.length ? 'Improvement cues: ' + evaluation.issues.slice(0, 6).map((issue) => issue.message).join(' | ') : 'Improvement cues: none.',
			'Boundary: N18 evaluates presentation richness only. It cannot alter canonical state, choose player actions, reveal hidden facts, or create new plot events.',
		].join('\n');
	}

	public static buildRewriteGuidance(evaluation?: NarrativeRichnessEvaluation): string {
		if (!evaluation || evaluation.decision === 'PASS' || !evaluation.issues.length) return '';
		return [
			'N18 richness improvement guidance:',
			...evaluation.issues.slice(0, 6).map((issue) => '- ' + issue.message + (issue.evidence ? ' Evidence: ' + issue.evidence : '')),
			'Improve presentation richness only. Preserve canonical facts, semantic player intent, knowledge boundaries, state effects, plot direction, and player agency.',
			'For ACTION_SUBSTANCE failures, resolve the player action first: show the concrete attempt, then an immediate observable response, consequence, information result, or clearly bounded unresolved result. Do not substitute environmental description for the action.',
		].join('\n');
	}
}
