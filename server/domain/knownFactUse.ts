/**
 * Does a narration use the player's authorized facts that answer the player's question?
 *
 * Shared by the semantic review (reject answers that ignore or contradict a known fact) and the richness
 * evaluator (count a correct, fact-bearing statement as an information response; a lexical "said/told"
 * check rejected plain correct answers such as "Night watchman Silas Okafor found the body shortly after midnight").
 */
const QUERY_STOPWORDS = new Set(['where', 'exactly', 'what', 'which', 'there', 'about', 'with', 'that', 'this', 'have', 'been', 'said', 'tell', 'does', 'would', 'could', 'from', 'they', 'them', 'were', 'anything', 'again', 'ask', 'asks', 'know', 'think', 'please', 'then', 'when', 'whom', 'whose', 'your', 'some', 'much', 'many', 'more', 'also', 'just']);

/** A character visibly withholds the answer. Legitimate when the answering character is guarded about it. */
export const REFUSAL_PATTERN = /\b(?:refuses?|refused|declines?|declined|won['’]?t (?:say|tell|answer|share|discuss)|wouldn['’]?t (?:say|tell|answer|share|discuss)|will not (?:say|tell|answer|share|discuss)|would not (?:say|tell|answer|share|discuss)|clams? up|changes? the subject|deflects?|stays? silent|falls? silent|keeps? (?:it|that|quiet)|shakes? (?:her|his|their) head)\b/i;

/**
 * A claim that nobody knows. When the player already holds a fact that answers the question this is simply false
 * ("the notes do not detail where he was found" when the player knows it was Pier 4), so it is not an acceptable answer.
 */
export const IGNORANCE_PATTERN = /\b(?:doesn['’]?t|does not|don['’]?t|do not|didn['’]?t|did not|isn['’]?t|aren['’]?t|hasn['’]?t|haven['’]?t|has not|have not|no one|nobody|not sure|unsure|unclear|unknown|can['’]?t say|cannot say|no record|nothing (?:on|about|to))\b/i;

function contentTokens(value: string, minLength = 4): string[] {
	return Array.from(new Set(String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= minLength)));
}

function answerAnchors(fact: any, question: string): string[] {
	const subject = String(fact?.subjectEntityId || '');
	const object = String(fact?.objectValue || '');
	const asksWho = /\bwho(?:m|se)?\b/i.test(question);
	const asksPlaceOrTime = /\bwhere\b|\bwhen\b|\bwhat time\b/i.test(question);
	const distinctive = (text: string) => (text.match(/\b(?:[A-Z][a-z]{2,}|\d+)\b/g) || []).map((token) => token.toLowerCase());
	const fromObject = [...distinctive(object), ...contentTokens(object, 5)];
	const fromSubject = [...distinctive(subject), ...contentTokens(subject.replace(/_/g, ' '), 5)];
	const anchors = asksPlaceOrTime && !asksWho ? fromObject : [...fromSubject, ...fromObject];
	return Array.from(new Set(anchors.filter((token) => token && !/^(?:loc|npc|ent|char|actor|item)$/.test(token))));
}

export interface KnownFactUse {
	/** Known facts whose wording overlaps the question. */
	matched: any[];
	/** True when the narration contains an answer anchor of at least one matched fact. */
	used: boolean;
	/** True when a character visibly withholds the answer (allowed). */
	refusal: boolean;
	/** True when the narration claims nobody knows (not allowed when a known fact answers the question). */
	ignorance: boolean;
	/** Either of the above. */
	bounded: boolean;
}

export function analyzeKnownFactUse(narration: string, question: string, knownFacts: unknown[]): KnownFactUse {
	const text = String(narration || '');
	const refusal = REFUSAL_PATTERN.test(text);
	const ignorance = IGNORANCE_PATTERN.test(text);
	const bounded = refusal || ignorance;
	const queryTokens = contentTokens(question).filter((token) => !QUERY_STOPWORDS.has(token));
	if (!text.trim() || queryTokens.length === 0) return { matched: [], used: false, refusal, ignorance, bounded };
	const matched = (knownFacts || [])
		.filter((fact: any) => fact && (fact.objectValue || fact.predicate))
		.filter((fact: any) => {
			const factTokens = new Set(contentTokens([fact.predicate, fact.objectValue, String(fact.subjectEntityId || '').replace(/_/g, ' ')].join(' ')));
			return queryTokens.some((token) => factTokens.has(token));
		});
	const lowerNarration = text.toLowerCase();
	const used = matched.some((fact: any) => answerAnchors(fact, question).some((anchor) => lowerNarration.includes(anchor)));
	return { matched, used, refusal, ignorance, bounded };
}
