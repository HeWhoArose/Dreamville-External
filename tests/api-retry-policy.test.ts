import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldRetryTransientHttpResponse } from '../src/services/apiRetryPolicy';

test('structured JSON 503 responses are returned to the caller rather than auto-replayed', () => {
	assert.equal(
		shouldRetryTransientHttpResponse(
			503,
			'application/json; charset=utf-8',
			'{"success":false,"code":"NARRATION_AI_UNAVAILABLE"}',
		),
		false,
	);
});

test('gateway errors and HTML server-start pages remain retryable', () => {
	assert.equal(shouldRetryTransientHttpResponse(502, 'text/html', '<html>bad gateway</html>'), true);
	assert.equal(shouldRetryTransientHttpResponse(504, 'application/json', '{"timeout":true}'), true);
	assert.equal(
		shouldRetryTransientHttpResponse(503, 'text/html', '<!doctype html><title>Starting Server</title>'),
		true,
	);
});

test('ordinary application responses are not considered retryable', () => {
	assert.equal(shouldRetryTransientHttpResponse(400, 'application/json', '{"error":"bad request"}'), false);
	assert.equal(shouldRetryTransientHttpResponse(503, 'text/plain', 'NARRATION_AI_UNAVAILABLE'), false);
});
