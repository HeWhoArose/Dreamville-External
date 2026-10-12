import test from 'node:test';
import assert from 'node:assert/strict';

import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';
import {
	JUDGE_BLOCKING_THRESHOLDS,
	NARRATIVE_JUDGE_FIXTURES,
	buildJudgePrompt,
	judgeReportFails,
	parseJudgeResponse,
	runNarrativeJudgeEval,
	scoreNarrativeJudgeFixture,
	structuralTurnPackageCheck,
	type NarrativeJudgeFixture,
} from '../server/domain/narrativeJudgeEval';

test('D2 golden fixture set stays within the S-7 size band of 15-25 canonical turns', () => {
	assert.ok(NARRATIVE_JUDGE_FIXTURES.length >= 15, 'expected >= 15 fixtures');
	assert.ok(NARRATIVE_JUDGE_FIXTURES.length <= 25, 'expected <= 25 fixtures');
	const ids = new Set(NARRATIVE_JUDGE_FIXTURES.map((fixture) => fixture.id));
	assert.equal(ids.size, NARRATIVE_JUDGE_FIXTURES.length, 'fixture ids must be unique');
	assert.ok(NARRATIVE_JUDGE_FIXTURES.some((fixture) => fixture.id === 'F20_INCIDENT_SOCIAL'), 'incident repro fixture must be present');
});

test('D2 deterministic judge agrees with every human label across the golden set', () => {
	const report = runNarrativeJudgeEval();
	assert.equal(report.fixtures.length, NARRATIVE_JUDGE_FIXTURES.length);
	assert.deepEqual(report.mismatches, []);
	assert.equal(report.agreementRate, 1);
});

test('D2 judge classifies negative controls as FAIL and positive controls as PASS', () => {
	const byId = new Map(runNarrativeJudgeEval().fixtures.map((result) => [result.id, result]));
	const failDimension = (id: string, dimension: string) => byId.get(id)!.dimensionScores.find((entry) => entry.dimension === dimension)!.score;

	// A well-formed but boundary-violating response is failed on Consistency.
	assert.equal(failDimension('F06_SOCIAL_BAD', 'Consistency'), 1);
	assert.equal(failDimension('F18_OMNISCIENT_BAD', 'Consistency'), 1);
	// A malformed non-JSON response is failed on Reliability.
	assert.equal(failDimension('F08_MALFORMED_JSON', 'Reliability'), 1);
	// A thin-but-valid response is failed on Interest.
	assert.equal(failDimension('F16_TERSE_VALID', 'Interest'), 1);
	// A response missing canonical anchors is failed on CanonFidelity.
	assert.ok(failDimension('F19_UNKNOWN_LOCATION_BAD', 'CanonFidelity') < JUDGE_BLOCKING_THRESHOLDS.CanonFidelity);
	// The canonical observation passes every dimension.
	const observation = byId.get('G01_OBSERVATION')!;
	assert.ok(observation.dimensionScores.every((entry) => entry.score >= JUDGE_BLOCKING_THRESHOLDS[entry.dimension]));
});

test('D2 structural check is anchored to the real turn-package validator', () => {
	const orchestrator = new MultiModelOrchestrator();
	for (const fixture of NARRATIVE_JUDGE_FIXTURES) {
		const ours = structuralTurnPackageCheck(fixture.raw).valid;
		const real = orchestrator.validateTurnPackage(fixture.raw).valid;
		assert.equal(ours, real, `structural check disagreed with validateTurnPackage for ${fixture.id}`);
	}
});

test('D2 judge dimensions discriminate on a single altered fixture', () => {
	const scenarioFixture: NarrativeJudgeFixture = {
		id: 'X_COMBAT_GOOD', title: 'Combat good', scenarioId: 'G04_COMBAT', playerAction: 'I strike at the creature.', expect: 'PASS',
		raw: JSON.stringify({
			narrative: ['You strike at the creature inside the Whispering Orrery, committing only to the immediate attack as the archivists draw back.', 'The impact lands and the recoil is sharp, but no follow-through is chosen for you and the next decision stays yours.'],
			dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [],
		}),
	};
	const good = scoreNarrativeJudgeFixture(scenarioFixture);
	assert.equal(good.dimensionScores.find((entry) => entry.dimension === 'Consistency')!.score, 5);

	const bad = scoreNarrativeJudgeFixture({ ...scenarioFixture, id: 'X_COMBAT_BAD', raw: scenarioFixture.raw.replace('committing only to the immediate attack', 'and then you decide to finish it off') });
	assert.ok(bad.dimensionScores.find((entry) => entry.dimension === 'Consistency')!.score < 5);
});

test('D2 judgeReportFails is inert unless blocking, and flags a mismatch when blocking', () => {
	const nonBlocking = runNarrativeJudgeEval({ blocking: false });
	assert.equal(judgeReportFails(nonBlocking), false);

	// The default set has perfect agreement, so even blocking passes.
	assert.equal(judgeReportFails(runNarrativeJudgeEval({ blocking: true })), false);

	// Inject a deliberately mislabelled fixture to prove the blocking gate reacts.
	const mislabelled: NarrativeJudgeFixture = {
		id: 'X_MISLABELLED', title: 'Mislabelled control', playerAction: 'I observe.', expect: 'PASS',
		raw: '{"narrative": []}',
	};
	const blocking = runNarrativeJudgeEval({ fixtures: [...NARRATIVE_JUDGE_FIXTURES, mislabelled], blocking: true });
	assert.equal(blocking.mismatches.length, 1);
	assert.equal(blocking.mismatches[0].id, 'X_MISLABELLED');
	assert.equal(judgeReportFails(blocking), true);
	assert.equal(judgeReportFails(runNarrativeJudgeEval({ fixtures: [...NARRATIVE_JUDGE_FIXTURES, mislabelled], blocking: false })), false);
});

test('D2 live REVIEW-pool judge helpers build a rubric prompt and parse strict JSON', () => {
	const fixture = NARRATIVE_JUDGE_FIXTURES[0];
	const prompt = buildJudgePrompt(fixture);
	assert.ok(prompt.includes(fixture.playerAction));
	assert.ok(prompt.includes('Reliability') && prompt.includes('CanonFidelity'));

	const parsed = parseJudgeResponse(JSON.stringify({ Reliability: 4, Consistency: 3, CanonFidelity: 5, Interest: 2 }));
	assert.deepEqual(parsed, { Reliability: 4, Consistency: 3, CanonFidelity: 5, Interest: 2 });
	assert.equal(parseJudgeResponse('not json'), undefined);
	assert.equal(parseJudgeResponse(JSON.stringify({ Reliability: 4 })), undefined);
	assert.equal(parseJudgeResponse(JSON.stringify({ Reliability: 9, Consistency: 3, CanonFidelity: 5, Interest: 2 })), undefined);
});
