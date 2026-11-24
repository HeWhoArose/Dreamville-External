import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyNarrationFailure, cutOffendingSentences, repairImproves } from '../server/domain/narrationGuardPolicy';

/**
 * Policy ported from the reference study (Open Game Master narration guard): findings are classified, only HARD ones reject,
 * offending sentences are cut when enough text remains, and a repair counts only if it strictly reduces findings.
 */
test('style, pacing and scene-anchor findings are SOFT', () => {
	for (const reason of [
		'Narration failed the action-substance gate: environmental description outweighs the current-turn action.',
		'Task response schema validation failed: Micro beat is too long.',
		'Narration continuity guard rejected output: no distinctive lexical anchor for canonical location "Crimson Eye Agency Office".',
	]) assert.equal(classifyNarrationFailure(reason), 'SOFT', reason);
});

test('secret leaks, invented canon, false ignorance, movement claims and agency violations stay HARD', () => {
	for (const reason of [
		'Narration appears to expose canonical facts outside the viewer knowledge boundary.',
		'NPC "Mei Sato" leaked unobserved facts outside their knowledge boundary: spent bullet casing.',
		'Narration answers an information-seeking question without using the known fact that answers it: "Pier 4".',
		'Narration claims arrival at "docks" before canonical movement was committed by the engine.',
		'Narration appears to decide a consequential player choice rather than present the consequence.',
		'Narration omits required canonical consequence(s): the guard turns toward the impact.',
		'Narration failed the action-substance gate: the information-seeking turn has no grounded answer or bounded lack of answer.',
		// A reply that does not respond to the player's action at all is not a style problem.
		'Narration acknowledges too little of the player action or fails to show a concrete consequence/reaction beat.',
		// Content-free scenery and repeated prose are not style preferences.
		'N18 environment/substance gate rejected final narration: environment-only description remained after the available rewrite budget was skipped or exhausted.',
		'Narration freshness guard rejected near-duplicate prose; retain canonical facts but make the current action or result meaningfully advance.',
	]) assert.equal(classifyNarrationFailure(reason), 'HARD', reason);
});

test('an unrecognised or empty reason fails closed', () => {
	assert.equal(classifyNarrationFailure('Something nobody has seen before went wrong.'), 'HARD');
	assert.equal(classifyNarrationFailure(''), 'HARD');
	assert.equal(classifyNarrationFailure(undefined), 'HARD');
});

test('the validator prefix does not change the severity of a reason', () => {
	assert.equal(classifyNarrationFailure('Task response schema validation failed: Micro beat is too long.'), 'SOFT');
	assert.equal(classifyNarrationFailure('Task response schema validation failed: Narration appears to expose canonical facts outside the viewer knowledge boundary.'), 'HARD');
});

const STORY = 'Rain taps the glass of the office. Mei sets the folder down and watches you. The lab will have results by noon tomorrow. You open the file and read the first page carefully.';

test('offending sentences are cut and the rest is kept', () => {
	const cut = cutOffendingSentences(STORY, ['lab will have results']);
	assert.deepEqual(cut.removed, ['The lab will have results by noon tomorrow.']);
	assert.doesNotMatch(cut.text, /lab will/i);
	assert.match(cut.text, /Mei sets the folder down/);
});

test('nothing is cut when too little would remain to read', () => {
	const long = 'The lab will have results by noon tomorrow and the coroner will confirm it by dusk, with a full report on every desk.';
	const cut = cutOffendingSentences(`${long} Ok.`, ['lab will have results']);
	assert.deepEqual(cut.removed, [], 'the original must stand');
	assert.match(cut.text, /Ok\./);
});

test('no match, empty claims and very short needles leave the narration untouched', () => {
	assert.deepEqual(cutOffendingSentences(STORY, ['nonexistent phrase']).removed, []);
	assert.deepEqual(cutOffendingSentences(STORY, []).removed, []);
	assert.deepEqual(cutOffendingSentences(STORY, ['the']).removed, [], 'needles under 4 characters are ignored');
});

test('a repair only counts when it strictly reduces the findings', () => {
	assert.equal(repairImproves(2, 1), true);
	assert.equal(repairImproves(1, 1), false);
	assert.equal(repairImproves(1, 2), false);
});
