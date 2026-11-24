import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNarrationQualityReport, clearNarrationQuality, getNarrationQuality, isCleanTurn, recordNarrationQuality, type NarrationQualityRecord } from '../server/domain/narrationQualityLedger';

function row(overrides: Partial<NarrationQualityRecord>): NarrationQualityRecord {
	return { at: '2026-11-24T00:00:00.000Z', accepted: true, outcome: 'quiet', findings: [], providerAttempts: 1, repairUsed: false, reservedRepairUsed: false, ...overrides };
}

test('records are stored per story, newest last, and bounded', () => {
	clearNarrationQuality();
	for (let i = 0; i < 230; i++) recordNarrationQuality('story_a', row({ actionId: `a${i}` }));
	recordNarrationQuality('story_b', row({ actionId: 'b0' }));
	const a = getNarrationQuality('story_a');
	assert.equal(a.length, 200);
	assert.equal(a[a.length - 1].actionId, 'a229');
	assert.equal(getNarrationQuality('story_b').length, 1);
	clearNarrationQuality('story_a');
	assert.equal(getNarrationQuality('story_a').length, 0);
	assert.equal(getNarrationQuality('story_b').length, 1, 'clearing one story leaves the others');
	clearNarrationQuality();
});

test('a turn is clean only when it was narrated and the guard stayed quiet', () => {
	assert.equal(isCleanTurn(row({})), true);
	assert.equal(isCleanTurn(row({ outcome: 'none' })), true);
	assert.equal(isCleanTurn(row({ outcome: 'kept_soft' })), false);
	assert.equal(isCleanTurn(row({ outcome: 'rewritten' })), false);
	assert.equal(isCleanTurn(row({ accepted: false, outcome: 'quiet' })), false);
});

test('the report counts outcomes, repairs and the most frequent reasons', () => {
	const rows = [
		row({}),
		row({ outcome: 'kept_soft', repairUsed: true, providerAttempts: 3, findings: [{ severity: 'SOFT', reason: 'environment-only description remained' }] }),
		row({ outcome: 'rewritten', repairUsed: true, reservedRepairUsed: true, providerAttempts: 2, findings: [{ severity: 'SOFT', reason: 'environment-only description remained' }] }),
		row({ accepted: false, outcome: 'rejected_hard', providerAttempts: 2, findings: [{ severity: 'HARD', reason: 'exposes canonical facts' }] }),
		row({ accepted: false, outcome: 'unavailable', providerAttempts: 4 }),
	];
	const report = buildNarrationQualityReport(rows);
	assert.equal(report.turns, 5);
	assert.equal(report.accepted, 3);
	assert.equal(report.clean, 1);
	assert.equal(report.cleanRate, 0.2);
	assert.equal(report.acceptedRate, 0.6);
	assert.deepEqual(report.byOutcome, { quiet: 1, kept_soft: 1, rewritten: 1, rejected_hard: 1, unavailable: 1 });
	assert.equal(report.repairUsed, 2);
	assert.equal(report.reservedRepairUsed, 1);
	assert.equal(report.averageProviderAttempts, 12 / 5);
	assert.deepEqual(report.topReasons[0], { reason: 'environment-only description remained', count: 2 });
});

test('an empty ledger reports null rates, not zeros', () => {
	const report = buildNarrationQualityReport([]);
	assert.equal(report.turns, 0);
	assert.equal(report.cleanRate, null);
	assert.equal(report.acceptedRate, null);
	assert.equal(report.averageProviderAttempts, null);
});
