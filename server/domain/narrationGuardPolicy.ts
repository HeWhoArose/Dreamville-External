/**
 * Narration guard policy.
 *
 * Reference study (Open Game Master, MIT, `src/lib/dm/narration-guard.ts`): narration never changes mechanical state, so a
 * contradiction in the prose is a prose bug. The reference guard (1) rules the finding against engine state, (2) asks the
 * model to fix its own prose once from a *reserved* call, (3) accepts the rewrite only if it strictly reduces findings,
 * (4) otherwise cuts just the offending sentences from the original when enough remains, (5) otherwise keeps the original and
 * logs the contradiction, and (6) records the outcome per turn.
 *
 * Dreamville was fail-closed everywhere: any rejection lost the turn. This module supplies the missing pieces. Findings are
 * classified; only HARD findings (secret leaks, invented canon, false ignorance of a known fact, movement claims, missing
 * canonical consequences, structurally invalid output) still reject. SOFT findings (scenery, pacing, repetition, style, scene
 * anchor words) are repaired once and then kept, with the outcome recorded.
 */

export type FindingSeverity = 'HARD' | 'SOFT';

/** How the guard ended a turn (mirrors the reference's outcome set, extended for Dreamville's hard rejections). */
export type GuardOutcome =
	| 'quiet' // nothing found
	| 'rewritten' // a repair call fixed it
	| 'cut' // offending sentences were removed and the rest passes
	| 'kept_soft' // soft findings remained after one repair; prose kept and logged
	| 'rejected_hard' // a hard finding remained: the turn is not narrated
	| 'unavailable' // no model produced usable text
	| 'none'; // no narration to check

export interface GuardNote {
	severity: FindingSeverity;
	reason: string;
}

/**
 * Reasons that are never softened. Anything unrecognised is also HARD (fail closed by default).
 * These cover canon, the knowledge boundary, hidden-fact exposure, committed movement, agency and structural validity.
 */
const HARD_PATTERNS: RegExp[] = [
	/knowledge boundary/i,
	/expose canonical facts/i,
	/leaked unobserved facts/i,
	/without using the known fact/i,
	/invents a forensic/i,
	/claims arrival|before canonical movement/i,
	/decide a consequential player choice|decides? the player|speaks? for the player/i,
	/omits required canonical consequence/i,
	/temporal[- ]continuity|canonical world time/i,
	/not valid json|structured validation|must return a valid structured|missing (?:the )?narrative/i,
	/no grounded answer or bounded lack of answer/i,
	/internal test, provider, orchestration|presentation guard rejected output containing/i,
	/unsupported (?:concrete|claim)|not supported by canonical scene evidence/i,
	// A reply that does not respond to the player's action at all is not a style problem.
	/acknowledges too little of the player action|fails to show a concrete consequence/i,
	// Content-free prose is not a style problem: scenery with no action or answer stays rejected.
	/environment-only description remained|environment-only prose/i,
	// Repeating the previous paragraph is a storytelling failure, not a wording preference.
	/near-duplicate|freshness guard|repeats? (?:the )?(?:previous|prior|recent)/i,
];

/** Reasons that are style, pacing or scene-anchoring issues: repair once, then keep. */
const SOFT_PATTERNS: RegExp[] = [
	/environmental description outweighs the current-turn action|environment(?:al)? excess/i,
	/richness|improve\b/i,
	/micro beat|too long|too short|paragraph|word count|pacing/i,
	/no distinctive lexical anchor|scene continuity|continuity guard rejected output: no distinctive/i,
	/storybeat|story beat|did not communicate the meaningful/i,
	/action-substance gate: environmental/i,
];

/**
 * A soft finding may only be kept when the prose is actually readable story text. A provider that returns garbage
 * ("not valid json {{{", an empty stub, a fragment) must still be rejected, whatever the severity of the finding.
 */
export function isReadableNarration(text: string | undefined | null): boolean {
	const value = String(text || '').trim();
	if (value.length < 40) return false;
	if (/[{}]|```|\[\s*\]|\bundefined\b|\bNaN\b/.test(value)) return false;
	const words = value.split(/\s+/).filter((word) => /[A-Za-z]{2,}/.test(word));
	if (words.length < 8) return false;
	const letters = (value.match(/[A-Za-z]/g) || []).length;
	return letters / value.length >= 0.6;
}

export function classifyNarrationFailure(reason: string | undefined | null): FindingSeverity {
	// executeTaskGeneration prefixes validator reasons; classify the reason itself.
	const text = String(reason || '').replace(/^Task response schema validation failed:?\s*/i, '');
	if (!text.trim()) return 'HARD';
	if (HARD_PATTERNS.some((pattern) => pattern.test(text))) return 'HARD';
	if (SOFT_PATTERNS.some((pattern) => pattern.test(text))) return 'SOFT';
	return 'HARD';
}

const OBSERVATION_ACTION = /^\s*(?:i\s+)?(?:carefully\s+|closely\s+)?(?:examine|inspect|study|look|search|check|observe|scan|survey|read)\b/i;
const NON_TARGET_WORDS = new Set(['around', 'closely', 'carefully', 'anything', 'something', 'about', 'there', 'where', 'which', 'while', 'looking', 'searching', 'examine', 'inspect', 'study', 'check', 'search', 'observe', 'survey']);

/**
 * Observation actions ("I examine the bloodstain") are answered by describing the thing observed, which the environment-excess
 * counter reads as scenery. When the reply names what was examined, that description is the answer, not padding.
 * Matches on word stems both ways ("bloodstain" is covered by "stain").
 */
export function describesObservedTarget(narration: string, playerAction: string): boolean {
	if (!OBSERVATION_ACTION.test(String(playerAction || ''))) return false;
	const targets = String(playerAction || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 5 && !NON_TARGET_WORDS.has(word));
	if (targets.length === 0) return false;
	const text = String(narration || '').toLowerCase();
	const words = text.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
	return targets.some((target) => text.includes(target) || words.some((word) => target.includes(word)));
}

/**
 * A travel reply is about the route and the departure, which reads as scenery to the environment counters. When the reply names
 * the destination the player set out for, it is responding to the action.
 */
export function namesTravelDestination(narration: string, destinationName: string | undefined | null): boolean {
	const words = String(destinationName || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
	if (words.length === 0) return false;
	const text = String(narration || '').toLowerCase();
	return words.some((word) => text.includes(word));
}

/** Splits into sentences while keeping the terminating punctuation. */
function splitSentences(text: string): string[] {
	return String(text || '').split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

export interface CutResult {
	text: string;
	removed: string[];
}

/**
 * Removes the sentences that contain an offending claim (case-insensitive substring). Returns the original untouched when
 * nothing matches or when too little would remain to read: at least min(120 characters, a third of the original) must survive,
 * as in the reference guard.
 */
export function cutOffendingSentences(narration: string, claims: readonly string[]): CutResult {
	const needles = claims.map((claim) => String(claim || '').trim().toLowerCase()).filter((claim) => claim.length >= 4);
	if (!needles.length) return { text: narration, removed: [] };
	const kept: string[] = [];
	const removed: string[] = [];
	for (const sentence of splitSentences(narration)) {
		const lower = sentence.toLowerCase();
		if (needles.some((needle) => lower.includes(needle))) removed.push(sentence);
		else kept.push(sentence);
	}
	if (removed.length === 0) return { text: narration, removed: [] };
	const after = kept.join(' ').trim();
	const before = narration.trim();
	if (after.length < Math.min(120, Math.floor(before.length / 3))) return { text: narration, removed: [] };
	return { text: after, removed };
}

/** Whether a repair is an improvement: strictly fewer findings than before (reference rule). */
export function repairImproves(findingsBefore: number, findingsAfter: number): boolean {
	return findingsAfter < findingsBefore;
}
