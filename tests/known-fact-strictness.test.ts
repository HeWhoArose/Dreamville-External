import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeKnownFactUse } from '../server/domain/knownFactUse';
import { findIgnoredKnownFacts } from '../server/domain/semanticNarrativeReview';

/**
 * Live run (2026-11-24, Gemini then Groq): the review accepted "the case notes do not detail where he was found"
 * (the player knows: Pier 4), a reply with no answer at all, and an evasion. A visible refusal by a guarded
 * character stays legitimate; a claim that nobody knows does not, when the player already holds the answer.
 */
const FACTS = [
	{ id: 'fact_victim', subjectEntityId: 'Arthur Pendelton', predicate: 'was_found_dead_at', objectValue: 'Pier 4', provenanceSummary: 'Arthur Pendelton was found shot dead on Pier 4.' },
	{ id: 'fact_found_by_watchman', subjectEntityId: 'Silas Okafor', predicate: 'found_body_at', objectValue: 'just after midnight', provenanceSummary: 'Night watchman Silas Okafor found the body shortly after midnight.' },
];

test('a false claim of ignorance is not an answer when the player already knows the fact', () => {
	const narration = 'Mei shifts in her chair. "The case notes do not detail the precise recovery point," she says.';
	assert.ok(findIgnoredKnownFacts(narration, 'Where exactly was he found?', FACTS).length > 0);
	assert.equal(analyzeKnownFactUse(narration, 'Where exactly was he found?', FACTS).ignorance, true);
});

test('"nobody knows" style evasions are also rejected', () => {
	assert.ok(findIgnoredKnownFacts('Nobody has said who found him, Mei admits.', 'Who found the body?', FACTS).length > 0);
});

test('a visible refusal by the asked character is still allowed', () => {
	assert.deepEqual(findIgnoredKnownFacts('Mei clams up and changes the subject, refusing to say where he was found.', 'Where exactly was he found?', FACTS), []);
});

test('using the known fact passes even when the reply also admits other gaps', () => {
	assert.deepEqual(findIgnoredKnownFacts('He was found on Pier 4, Mei says, though she does not know who moved him.', 'Where exactly was he found?', FACTS), []);
});

test('a reply with no answer and no refusal is flagged even if it contains speech verbs', () => {
	const narration = 'Mei said she would look into it, then told you the rain had not stopped all morning.';
	assert.ok(findIgnoredKnownFacts(narration, 'Where exactly was he found?', FACTS).length > 0);
});
