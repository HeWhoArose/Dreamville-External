import test from 'node:test';
import assert from 'node:assert/strict';
import { NarratorVoiceEngine } from '../server/domain/narratorVoiceEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

test('N2 resolves a stable persisted narrator voice per story and profile', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const first = NarratorVoiceEngine.resolve(repository, 'voice_story', { profileId: 'narrative.protagonist.v1', version: 1, mode: 'PROTAGONIST', camera: 'PLAYER_CENTRIC', playerAgency: 'PRIMARY_PLAYER', description: 'test' }, {
		enabled: true,
		voiceProfileId: 'voice.test.v1',
		cadence: 'LYRICAL',
		descriptiveDensity: 'RICH',
		metaphorDensity: 'MODERATE',
	});
	NarratorVoiceEngine.persist(repository, 'voice_story', first);
	const second = NarratorVoiceEngine.resolve(repository, 'voice_story', undefined, { enabled: true });
	assert.equal(second.profileId, 'voice.test.v1');
	assert.equal(second.cadence, 'LYRICAL');
	assert.equal(second.descriptiveDensity, 'RICH');
	assert.equal(second.metaphorDensity, 'MODERATE');
});

test('N2 controls override persisted voice without replacing unrelated persisted settings', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const persisted = NarratorVoiceEngine.resolve(repository, 'voice_override', undefined, { enabled: true, cadence: 'MEASURED', humorLevel: 'NONE' });
	NarratorVoiceEngine.persist(repository, 'voice_override', persisted);
	const resolved = NarratorVoiceEngine.resolve(repository, 'voice_override', undefined, { enabled: true, cadence: 'BRISK' });
	assert.equal(resolved.cadence, 'BRISK');
	assert.equal(resolved.humorLevel, 'NONE');
});

test('N2 prompt contract is provider-neutral and explicitly survives fallback', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const voice = NarratorVoiceEngine.resolve(repository, 'voice_prompt', undefined, { enabled: true, voiceProfileId: 'voice.canonical.v1', formality: 'PLAIN' });
	const prompt = NarratorVoiceEngine.toPromptContext(voice);
	assert.match(prompt, /NARRATOR VOICE CONTRACT v1/);
	assert.match(prompt, /Voice profile: voice\.canonical\.v1/);
	assert.match(prompt, /Formality: PLAIN/);
	assert.match(prompt, /stable across model\/provider fallback/i);
	assert.match(NarratorVoiceEngine.compactPromptContext(voice), /N2 voice=voice\.canonical\.v1/);
});

test('N2 forbidden patterns are bounded and persisted as controls, not canonical world facts', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const voice = NarratorVoiceEngine.resolve(repository, 'voice_forbidden', undefined, {
		enabled: true,
		forbiddenPatterns: Array.from({ length: 40 }, (_, index) => 'pattern-' + index),
	});
	assert.equal(voice.forbiddenPatterns.length, 24);
	NarratorVoiceEngine.persist(repository, 'voice_forbidden', voice);
	assert.equal(NarratorVoiceEngine.resolve(repository, 'voice_forbidden').forbiddenPatterns.length, 24);
});
