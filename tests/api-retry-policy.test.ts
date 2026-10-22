import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldRetryTransientHttpResponse } from '../src/services/apiRetryPolicy';

test('structured JSON 503 responses are returned rather than silently replayed', () => {
	assert.equal(
		shouldRetryTransientHttpResponse(
			503,
			'application/json; charset=utf-8',
			'{"success":false,"code":"NARRATION_AI_UNAVAILABLE"}',
			'POST',
		),
		false,
	);
});

test('gateway failures retry safe reads but never automatically replay mutating requests', () => {
	assert.equal(shouldRetryTransientHttpResponse(502, 'text/html', '<html>bad gateway</html>', 'GET'), true);
	assert.equal(shouldRetryTransientHttpResponse(504, 'application/json', '{"timeout":true}', 'GET'), true);
	assert.equal(shouldRetryTransientHttpResponse(502, 'text/html', '<html>bad gateway</html>', 'POST'), false);
	assert.equal(shouldRetryTransientHttpResponse(504, 'application/json', '{"timeout":true}', 'POST'), false);
});

test('explicit startup HTML remains retryable without retrying generic application 503s', () => {
	assert.equal(
		shouldRetryTransientHttpResponse(503, 'text/html', '<!doctype html><title>Starting Server</title>', 'POST'),
		true,
	);
	assert.equal(
		shouldRetryTransientHttpResponse(503, 'text/html', '<html><body>Service unavailable</body></html>', 'POST'),
		false,
	);
	assert.equal(
		shouldRetryTransientHttpResponse(503, 'text/html', '<!doctype html><title>Starting Server</title>', 'GET'),
		true,
	);
	assert.equal(shouldRetryTransientHttpResponse(503, 'text/plain', 'NARRATION_AI_UNAVAILABLE', 'POST'), false);
});

test('ordinary application responses are not considered retryable', () => {
	assert.equal(shouldRetryTransientHttpResponse(400, 'application/json', '{"error":"bad request"}'), false);
	assert.equal(shouldRetryTransientHttpResponse(503, 'text/plain', 'NARRATION_AI_UNAVAILABLE'), false);
});
