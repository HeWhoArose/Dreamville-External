#!/usr/bin/env node
/**
 * Phase D2 (GAP-7 / S-7) — golden-set narrative judge eval.
 *
 * Scores the golden fixture set against the rubric in
 * `server/domain/narrativeJudgeEval.ts` (anchored to the project's own
 * validators) and prints a report.
 *
 * Non-blocking by default: it always exits 0 so the release gate can print the
 * result as a warning. Pass `--blocking` to enforce JUDGE_BLOCKING_THRESHOLDS —
 * only after the D3 human calibration pass, per the plan.
 *
 * Run:  npx tsx scripts/narrative-judge-eval.mjs [--blocking] [--json]
 */
import {
	runNarrativeJudgeEval,
	judgeReportFails,
	JUDGE_BLOCKING_THRESHOLDS,
	JUDGE_DIMENSIONS,
} from '../server/domain/narrativeJudgeEval.ts';

const args = new Set(process.argv.slice(2));
const blocking = args.has('--blocking');
const asJson = args.has('--json');

const report = runNarrativeJudgeEval({ blocking });

if (asJson) {
	console.log(JSON.stringify(report, null, 2));
	process.exit(judgeReportFails(report) ? 1 : 0);
}

const verdict = (entry) => (entry.dimensionScores.some((s) => s.score < JUDGE_BLOCKING_THRESHOLDS[s.dimension]) || entry.overall < JUDGE_BLOCKING_THRESHOLDS.overall ? 'FAIL' : 'PASS');

console.log('Narrative judge eval (golden set) — ' + report.fixtures.length + ' fixtures');
console.log('aggregate: overall ' + report.aggregate.overall.toFixed(2) + ' | ' + JUDGE_DIMENSIONS.map((d) => d + ' ' + report.aggregate[d].toFixed(2)).join(' | '));
console.log('agreement with human labels: ' + (report.agreementRate * 100).toFixed(0) + '%');
console.log('thresholds: overall >= ' + JUDGE_BLOCKING_THRESHOLDS.overall + ', agreement >= ' + (JUDGE_BLOCKING_THRESHOLDS.agreementRate * 100) + '%');
console.log('');
for (const entry of report.fixtures) {
	const line = '[' + verdict(entry).padEnd(4) + '] ' + entry.id.padEnd(26) + ' overall ' + entry.overall.toFixed(2).padStart(4) +
		'  (' + entry.dimensionScores.map((s) => s.dimension[0] + ':' + s.score).join(' ') + ')';
	console.log(line);
	for (const s of entry.dimensionScores) {
		for (const issue of s.issues) console.log('        - ' + s.dimension + ': ' + issue);
	}
}
if (report.mismatches.length > 0) {
	console.log('');
	console.log('MISMATCHES vs human labels:');
	for (const m of report.mismatches) console.log('  ' + m.id + ': expected ' + m.expected + ', judge said ' + m.judged + ' (overall ' + m.overall + ')');
}
console.log('');
console.log(report.blocking ? 'Mode: BLOCKING (D3)' : 'Mode: non-blocking warning (D2 default)');
console.log(judgeReportFails(report) ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(judgeReportFails(report) ? 1 : 0);
