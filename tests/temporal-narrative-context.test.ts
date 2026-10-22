import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeAmbientSensoryForCurrentPhase } from '../server/domain/temporalNarrativeContext';

test('stale labeled ambient cues cannot override canonical afternoon time', () => {
	const result = sanitizeAmbientSensoryForCurrentPhase(
		'Visual: First light over Elysium. Sounds: Distant atmosphere. Scent: Native vegetation. Tactile: Firm earth.',
		'Afternoon',
	);

	assert.doesNotMatch(result, /first light|dawn|sunrise|morning/i);
	assert.match(result, /Sounds: Distant atmosphere/i);
	assert.match(result, /Scent: Native vegetation/i);
	assert.match(result, /Tactile: Firm earth/i);
});

test('unlabeled authored description remains intact', () => {
	const value = 'Cold rain patters against high leaded glass.';
	assert.equal(sanitizeAmbientSensoryForCurrentPhase(value, 'Afternoon'), value);
});

test('night time removes an obsolete sunset cue while retaining non-temporal sensory details', () => {
	const result = sanitizeAmbientSensoryForCurrentPhase(
		'Visual: Sunset over the old wall. Sounds: Bells ring across town.',
		'Night',
	);
	assert.doesNotMatch(result, /Sunset/i);
	assert.match(result, /Sounds: Bells ring across town/i);
});
