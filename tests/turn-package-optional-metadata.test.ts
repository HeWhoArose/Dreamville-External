import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

/**
 * Observed live (2026-11-24): a small free model returned good prose but a scalar `audioCues`, and the
 * whole candidate was rejected ("audioCues must be an array"). Optional presentation metadata must never
 * discard a valid narrative; authoritative `stateChanges` stay strictly validated.
 */
const orchestrator = new MultiModelOrchestrator();

test('scalar audioCues / visualCues / memoryCandidates do not reject an otherwise valid turn', () => {
	const result = orchestrator.validateTurnPackage(JSON.stringify({
		narrative: ['Mei slides the folder across the desk.'],
		dialogue: [], events: [], stateChanges: [],
		memoryCandidates: 'Mei handed over the folder', audioCues: 'rain on glass', visualCues: { prompt: 'rain-streaked office' },
	}));
	assert.equal(result.valid, true, result.errorReason);
	assert.deepEqual(result.turnPackage!.audioCues, ['rain on glass']);
	assert.deepEqual(result.turnPackage!.memoryCandidates, ['Mei handed over the folder']);
});

test('a malformed stateChanges proposal is still rejected', () => {
	const result = orchestrator.validateTurnPackage(JSON.stringify({ narrative: ['x'], stateChanges: 'give sword' }));
	assert.equal(result.valid, false);
});
