import test from 'node:test';
import assert from 'node:assert/strict';

import {
	isConsequenceCovered,
	buildRequiredConsequences,
} from '../server/domain/narrativeConsequenceCoverage';

/**
 * Unit contract for the shared narrative consequence-coverage module (Phase 1A).
 *
 * The module judges whether a narration *conveys the meaning* of a canonical
 * required consequence through calibrated semantic word-families (knockdown,
 * impact, lodging, movement, obstacle, reaction, fire), NOT through schema
 * bookkeeping nouns (applied/condition/resolved/remains/target/...).
 * Rule principle: the gate is a deterministic safety floor — phrasing that
 * maps to no known family is rejected; known families accept any honest
 * human phrasing of the same outcome.
 */

function covered(narration: string, consequence: string): boolean {
	return isConsequenceCovered(narration, consequence).covered;
}

test('knockdown outcome is conveyed by human knockdown phrasing, without schema bookkeeping words', () => {
	const consequence = 'Applied condition: Prone.';
	assert.equal(covered('he is knocked sprawling prone across the floor', consequence), true);
	assert.equal(covered('he crumples to the ground face-down and unmoving', consequence), true);
	// Genuine omission: consequence words without any knockdown family member.
	assert.equal(
		covered('you drive your palm into his breastplate, bruising his ribs with the impact', consequence),
		false,
	);
});

test('underscore entity ids tokenize into name tokens; entity-state outcome follows the entity mention', () => {
	const consequence = 'Target enemy_warden remains at 23 HP.';
	assert.equal(covered('You drive your Shockwave Palm into the Warden’s breastplate', consequence), true);
	assert.equal(covered('You knock the Warden back and he staggers', consequence), true);
	// A different entity should not satisfy this consequence.
	assert.equal(
		covered('You drive your Shockwave Palm into the Goblin’s breastplate', consequence),
		false,
	);
});

test('obstacle collision is conveyed by movement-into-obstacle phrasing', () => {
	const consequence = 'Target collided with Impassable obstacle for 2 collision damage.';
	assert.equal(covered('you hurl him backward into the stone barrier', consequence), true);
	assert.equal(covered('the blast shoves him stumbling against the crate', consequence), true);
	// Genuine omission: impact without any obstacle/movement-into-obstacle phrasing.
	assert.equal(covered('you score a clean hit and he bleeds', consequence), false);
});

test('a sound-only clang does not satisfy a lodge requirement (impact and lodging are separate outcomes)', () => {
	const consequence = 'The dagger strikes and lodges in the guarded door.';
	assert.equal(covered('The dagger strikes the guarded door and lodges deep in the wood', consequence), true);
	assert.equal(covered('The dagger clangs loudly against the guarded door', consequence), false);
	// Lodged with the wrong object still misses the named object.
	assert.equal(covered('The dagger lodges deep in a distant beam instead', consequence), false);
});

test('reaction outcome requires reaction-family words, not just shared impact vocabulary', () => {
	const consequence = 'The impact draws the nearby guard’s attention.';
	assert.equal(covered('The dagger strikes home; the guard turns sharply, one hand leaving his weapon.', consequence), true);
	assert.equal(
		covered('The dagger strikes the guarded door and lodges deep in the wood; splinters scatter around the blade.', consequence),
		false,
	);
});

test('per-effect fire outcomes require their own target noun (knockdown does not cover a fireball effect)', () => {
	const consequence = 'The fireball engulfs the front goblin in flame.';
	assert.equal(covered('The fireball engulfs the front goblin in flame', consequence), true);
	assert.equal(covered('The shockwave knocks the second goblin prone', consequence), false);
});

test('bare impact phrasing satisfies a standalone damage outcome', () => {
	assert.equal(covered('you smash your knee into his gut', 'Damage: 12.'), true);
	assert.equal(covered('he stands there unperturbed', 'Damage: 12.'), false);
});

test('buildRequiredConsequences dedupes and drops composite summary lines that subsume their own per-effect strings', () => {
	const list = buildRequiredConsequences({
		physicalConsequences: [
			'Shockwave Palm: resolved successfully. Damage: 12. Applied condition: Prone. Target collided with Impassable obstacle for 2 collision damage.',
			'Applied condition: Prone.',
			'Target collided with Impassable obstacle for 2 collision damage.',
		],
		playerVisibleConsequences: [
			'Target enemy_warden remains at 23 HP.',
			'The character is now canonically positioned at (0, 0).',
			'',
			'Target enemy_warden remains at 23 HP.',
		],
	});
	assert.deepEqual(
		new Set(list),
		new Set([
			'Applied condition: Prone.',
			'Target collided with Impassable obstacle for 2 collision damage.',
			'Target enemy_warden remains at 23 HP.',
		]),
	);
	// The canonical-position filler and empty entries must never enter the list.
	assert.ok(list.every((value) => value.trim().length > 0));
	assert.ok(!list.some((value) => /^the character is now canonically positioned/i.test(value)));
});

test('buildRequiredConsequences keeps every per-effect string that no other string subsumes', () => {
	const list = buildRequiredConsequences({
		physicalConsequences: ['The fireball engulfs the front goblin in flame.'],
		playerVisibleConsequences: ['The blast sets the dry brush alight.', 'The shockwave knocks the second goblin prone.'],
	});
	assert.deepEqual(new Set(list), new Set([
		'The fireball engulfs the front goblin in flame.',
		'The blast sets the dry brush alight.',
		'The shockwave knocks the second goblin prone.',
	]));
});
