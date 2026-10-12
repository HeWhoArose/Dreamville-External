import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DeterministicMockAdapter,
	MultiModelOrchestrator,
	type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import {
	MAX_REJECTED_SHAPE_ENTRIES_PER_TURN,
	MAX_REJECTED_SHAPE_SAMPLE_CHARS,
	captureRejectedAttempt,
	classifyRejectedResponseShape,
	countCapturedShapes,
	type ProviderAttemptTrailEntry,
} from '../server/domain/providerAttemptTrail';

function createModel(providerId: string, modelId: string): ModelRegistryRecord {
	return {
		providerId,
		modelId,
		displayName: modelId,
		pool: 'fast',
		capabilities: ['text_generation', 'structured_output', 'fast'],
		contextWindow: 32768,
		outputTokenLimit: 2048,
		health: 'Healthy',
		quota: 'Healthy',
		latencyMs: 10,
		userPriority: 100,
		roleEligibility: ['narrative.generate'],
		fallbackEligibility: true,
		isEmergencyFloor: false,
		accessStatus: 'accessible',
		lifecycleState: 'active',
	};
}

const VALID_PACKAGE = JSON.stringify({
	narrative: ['Valid fallback narrative.'],
	dialogue: [],
	events: [],
	stateChanges: [],
	memoryCandidates: [],
	audioCues: [],
});

test('D1 classifyRejectedResponseShape distinguishes empty, normalized, malformed, truncated and prose shapes', () => {
	assert.equal(classifyRejectedResponseShape('', 'empty').kind, 'EMPTY');
	assert.equal(classifyRejectedResponseShape('   ', 'blank').kind, 'EMPTY');

	const normalized = classifyRejectedResponseShape(JSON.stringify({ wrong: 'schema' }), 'Turn package validation failed: missing narrative.');
	assert.equal(normalized.kind, 'JSON_PARSED');
	assert.equal(normalized.marker, 'NORMALIZED');
	assert.equal(normalized.normalized, true);
	assert.equal(normalized.validationErrorReason, 'Turn package validation failed: missing narrative.');

	const malformed = classifyRejectedResponseShape('{"narrative": }', 'parse error');
	assert.equal(malformed.kind, 'MALFORMED_JSON');
	assert.equal(malformed.marker, 'REJECTED');
	assert.equal(malformed.normalized, false);

	// Balanced-looking but never-closed envelope => truncation heuristic.
	const truncated = classifyRejectedResponseShape('{"narrative": ["partial story that never closes', 'truncated stream');
	assert.equal(truncated.kind, 'TRUNCATED_JSON');

	const prose = classifyRejectedResponseShape('This is not valid JSON from the model <<corrupt>>', 'not json');
	assert.equal(prose.kind, 'PLAIN_TEXT');

	const other = classifyRejectedResponseShape('{}', 'x');
	assert.equal(other.kind, 'JSON_PARSED');
	assert.equal(classifyRejectedResponseShape('nope', 'x').kind, 'OTHER');
});

test('D1 classifyRejectedResponseShape bounds the sample to the documented cap', () => {
	const huge = 'x'.repeat(MAX_REJECTED_SHAPE_SAMPLE_CHARS + 500);
	const shape = classifyRejectedResponseShape(huge, 'too big');
	assert.equal(shape.sample.length, MAX_REJECTED_SHAPE_SAMPLE_CHARS);
	assert.equal(shape.sampleTruncated, true);
	assert.equal(shape.rawLength, huge.length);

	const small = classifyRejectedResponseShape('short', 'small');
	assert.equal(small.sampleTruncated, false);
	assert.equal(small.rawLength, 5);
});

test('D1 captureRejectedAttempt caps shape descriptors per turn', () => {
	const trail: ProviderAttemptTrailEntry[] = [];
	for (let i = 0; i < MAX_REJECTED_SHAPE_ENTRIES_PER_TURN + 3; i++) {
		captureRejectedAttempt(trail, {
			providerId: 'p',
			modelId: `m${i}`,
			latencyMs: 1,
			error: 'schema rejected',
		}, '{bad');
	}
	assert.equal(trail.length, MAX_REJECTED_SHAPE_ENTRIES_PER_TURN + 3);
	assert.equal(countCapturedShapes(trail), MAX_REJECTED_SHAPE_ENTRIES_PER_TURN);
	// Excess entries still carry the error, just no shape sample.
	assert.equal(trail[trail.length - 1].rejectedShape, undefined);
	assert.equal(trail[trail.length - 1].error, 'schema rejected');
	assert.equal(trail[trail.length - 1].status, 'FAILED');
});

test('D1 executeTaskGeneration records a NORMALIZED shape for a valid-JSON-but-schema-invalid response', async () => {
	const orchestrator = new MultiModelOrchestrator();

	const invalidAdapter = new DeterministicMockAdapter('phased_invalid');
	const validAdapter = new DeterministicMockAdapter('phased_valid');
	invalidAdapter.cannedResponses.set('narrative.generate', JSON.stringify({ wrong: 'schema' }));
	validAdapter.cannedResponses.set('narrative.generate', VALID_PACKAGE);

	orchestrator.registerAdapter(invalidAdapter);
	orchestrator.registerAdapter(validAdapter);
	orchestrator.registerModel(createModel('phased_invalid', 'invalid'));
	orchestrator.registerModel(createModel('phased_valid', 'valid'));
	orchestrator.setFallbackChain('narrative.generate', [
		'phased_invalid::invalid',
		'phased_valid::valid',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'phased_invalid::invalid');

	const result = await orchestrator.executeTaskGeneration(
		'narrative.generate',
		'Phase D shape capture.',
		undefined,
		{
			timeoutMs: 100,
			validateResponse: (text) => {
				const validation = orchestrator.validateTurnPackage(text);
				return validation.valid ? { valid: true } : { valid: false, errorReason: validation.errorReason };
			},
		},
	);

	const failed = result.attemptsTrail.find((entry) => entry.status === 'FAILED');
	assert.ok(failed, 'expected a failed attempt in the trail');
	assert.equal(failed!.providerId, 'phased_invalid');
	assert.equal(failed!.modelId, 'invalid');
	assert.ok(failed!.rejectedShape, 'expected a captured rejected shape');
	assert.equal(failed!.rejectedShape!.kind, 'JSON_PARSED');
	assert.equal(failed!.rejectedShape!.marker, 'NORMALIZED');
	assert.ok((failed!.rejectedShape!.sample || '').includes('wrong'));
	assert.ok(failed!.rejectedShape!.validationErrorReason);
});

test('D1 executeTaskGeneration records a REJECTED shape for a non-JSON (malformed) response', async () => {
	const orchestrator = new MultiModelOrchestrator();

	const malformedAdapter = new DeterministicMockAdapter('phased_malformed');
	const validAdapter = new DeterministicMockAdapter('phased_valid2');
	malformedAdapter.failureMode = 'malformed_json';
	validAdapter.cannedResponses.set('narrative.generate', VALID_PACKAGE);

	orchestrator.registerAdapter(malformedAdapter);
	orchestrator.registerAdapter(validAdapter);
	orchestrator.registerModel(createModel('phased_malformed', 'malformed'));
	orchestrator.registerModel(createModel('phased_valid2', 'valid'));
	orchestrator.setFallbackChain('narrative.generate', [
		'phased_malformed::malformed',
		'phased_valid2::valid',
	]);
	orchestrator.pinModelForTask('narrative.generate', 'phased_malformed::malformed');

	const result = await orchestrator.executeTaskGeneration(
		'narrative.generate',
		'Phase D malformed shape capture.',
		undefined,
		{
			timeoutMs: 100,
			validateResponse: (text) => {
				const validation = orchestrator.validateTurnPackage(text);
				return validation.valid ? { valid: true } : { valid: false, errorReason: validation.errorReason };
			},
		},
	);

	const failed = result.attemptsTrail.find((entry) => entry.status === 'FAILED');
	assert.ok(failed && failed.rejectedShape);
	assert.equal(failed!.rejectedShape!.kind, 'PLAIN_TEXT');
	assert.equal(failed!.rejectedShape!.marker, 'REJECTED');
	assert.equal(failed!.rejectedShape!.normalized, false);
});
