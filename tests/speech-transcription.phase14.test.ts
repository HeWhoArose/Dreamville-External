import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTranscriptionProviderText, validateAudioBase64 } from '../server/domain/aiOrchestrator';

test('Phase 14 accepts a valid base64 audio payload shape', () => {
	const result = validateAudioBase64('AAAAAAAAAAAAAAAAAAAAAA==');
	assert.equal(result.valid, true);
	assert.equal(result.errorCode, undefined);
});

test('Phase 14 rejects empty transcription audio before provider selection', () => {
	const result = validateAudioBase64('');
	assert.equal(result.valid, false);
	assert.equal(result.errorCode, 'INPUT_EMPTY');
});

test('Phase 14 rejects malformed base64 audio before provider selection', () => {
	const result = validateAudioBase64('not base64 $$$');
	assert.equal(result.valid, false);
	assert.equal(result.errorCode, 'INPUT_INVALID_BASE64');
});

test('Phase 14 accepts plain-text provider transcripts', () => {
	const result = normalizeTranscriptionProviderText('I move closer to the lantern.');
	assert.deepEqual(result, { valid: true, text: 'I move closer to the lantern.' });
});

test('Phase 14 extracts transcript text from common JSON provider envelopes', () => {
	assert.equal(
		normalizeTranscriptionProviderText(JSON.stringify({ transcript: 'I lower my voice.' })).text,
		'I lower my voice.',
	);
	assert.equal(
		normalizeTranscriptionProviderText(JSON.stringify({ text: 'I listen for movement.' })).text,
		'I listen for movement.',
	);
	assert.equal(
		normalizeTranscriptionProviderText(JSON.stringify({ narrative: ['I search the archive.'] })).text,
		'I search the archive.',
	);
});

test('Phase 14 rejects HTML and malformed JSON as transcript payloads', () => {
	const html = normalizeTranscriptionProviderText('<!doctype html><html><body>Starting Server</body></html>');
	assert.equal(html.valid, false);
	assert.match(html.reason || '', /HTML/i);

	const malformed = normalizeTranscriptionProviderText('{"transcript":');
	assert.equal(malformed.valid, false);
	assert.match(malformed.reason || '', /malformed JSON/i);
});

test('Phase 14 rejects empty JSON envelopes instead of treating them as a transcript', () => {
	const result = normalizeTranscriptionProviderText(JSON.stringify({ choices: [] }));
	assert.equal(result.valid, false);
	assert.match(result.reason || '', /did not contain transcript/i);
});
