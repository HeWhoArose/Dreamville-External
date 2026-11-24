import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIgnoredKnownFacts } from '../server/domain/semanticNarrativeReview';

/**
 * Live run (2026-11-24, Gemini 3.1 Flash Lite): "Where exactly was he found?" was answered with an invented
 * maintenance tunnel although the player's authorized facts said Pier 4, and the review accepted it.
 */
const FACTS = [
	{ id: 'fact_victim', subjectEntityId: 'Arthur Pendelton', predicate: 'was_found_dead_at', objectValue: 'Pier 4', provenanceSummary: 'Arthur Pendelton, a 54-year-old harbor customs ledger clerk, was found shot dead on Pier 4.' },
	{ id: 'fact_found_by_watchman', subjectEntityId: 'Silas Okafor', predicate: 'found_body_at', objectValue: 'just after midnight', provenanceSummary: 'Night watchman Silas Okafor found the body shortly after midnight.' },
	{ id: 'fact_casing_38', subjectEntityId: 'bullet casing', predicate: 'is_caliber', objectValue: '.38', provenanceSummary: 'A spent .38 bullet casing lay beside the body.' },
];

test('an answer that invents a location instead of the known one is flagged', () => {
	const narration = "Mei gestures toward the map. 'We found him in the maintenance access tunnel beneath the Neon Ward transit hub,' she says.";
	const ignored = findIgnoredKnownFacts(narration, 'Where exactly was he found?', FACTS);
	assert.ok(ignored.length > 0);
	assert.match(ignored.join(' '), /Pier 4/);
});

test('an answer that uses the known fact passes', () => {
	assert.deepEqual(findIgnoredKnownFacts('Mei pulls the folder closer. "Pier 4, behind the stacked crates," she says.', 'Where exactly was he found?', FACTS), []);
});

test('a visible refusal is allowed (a claim that nobody knows is covered in known-fact-strictness)', () => {
	assert.deepEqual(findIgnoredKnownFacts("Mei clams up and refuses to say.", 'Where exactly was he found?', FACTS), []);
});

test('a who-question needs the known finder, not an invented one', () => {
	assert.ok(findIgnoredKnownFacts('A dockworker found him and called it in.', 'Who found the body?', FACTS).length > 0);
	assert.deepEqual(findIgnoredKnownFacts('Silas Okafor found him, Mei says, just after midnight.', 'Who found the body?', FACTS), []);
});

test('questions unrelated to any known fact are not constrained', () => {
	assert.deepEqual(findIgnoredKnownFacts('Mei pours two cups of tea and hands you one.', 'I ask Mei to make tea.', FACTS), []);
});

import { analyzeKnownFactUse } from '../server/domain/knownFactUse';

test('a plain, correct statement of the known fact counts as using it (no speech verb required)', () => {
	const use = analyzeKnownFactUse('Night watchman Silas Okafor found the body shortly after midnight.', 'Who found the body?', FACTS);
	assert.equal(use.used, true);
	assert.equal(use.bounded, false);
});

test('a scenery-only reply does not count as using the known fact', () => {
	const use = analyzeKnownFactUse('Rain patters on the frosted glass while the desk lamp hums.', 'Who found the body?', FACTS);
	assert.equal(use.used, false);
	assert.ok(use.matched.length > 0);
});
