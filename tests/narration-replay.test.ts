import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNarrationBaseline } from '../scripts/narration-baseline';

/**
 * Replays real model replies (recorded from live Gemini/Groq runs on the Ren world pack) through the full /action pipeline
 * with a scripted provider. No network. Scores prompt, gate and rewrite changes against actual model output.
 * Re-record with: BASELINE_MODE=live BASELINE_RECORD=... npm run narration:baseline (see scripts/narration-baseline.ts).
 */
const CORPUS = 'tests/fixtures/narration-replay/ren_gemini_groq.json';
const ACCEPTED_OUTCOMES = new Set(['quiet', 'rewritten', 'cut', 'kept_soft', 'none']);
const REJECTED_OUTCOMES = new Set(['rejected_hard', 'unavailable']);

test('replay of recorded real replies is deterministic, keeps answering facts in the prompt, and holds the acceptance floor', { timeout: 280000 }, async () => {
	const first = await runNarrationBaseline({ mode: 'replay', replayFrom: CORPUS, outFile: null });
	const second = await runNarrationBaseline({ mode: 'replay', replayFrom: CORPUS, outFile: null });

	const signature = (result: typeof first) => result.report.map((turn) => `${turn.accepted}:${turn.guardOutcome}:${(turn.reason || '').slice(0, 60)}`).join('|');
	assert.equal(signature(first), signature(second), 'replay must be deterministic');
	assert.equal(first.summary.informationTurnsWithFactInPrompt, '5/5', 'every information question must carry its answering fact');
	assert.ok((first.summary.scorableTurns as number) >= 5, 'the corpus must cover most turns');

	// Fail-open on soft findings plus a repair from the reserved call (reference-study guard policy): measured 6 of 7 scorable
	// turns when the policy was introduced, against 3 of 7 with fail-closed gates. Raise the floor as the gates improve.
	assert.ok((first.summary.acceptedOfScorable as number) >= 6, `accepted ${first.summary.acceptedOfScorable} of ${first.summary.scorableTurns}`);

	// Every turn carries a guard outcome, and the outcome agrees with whether the turn was narrated.
	for (const turn of first.report) {
		assert.ok(turn.guardOutcome, `turn "${turn.action}" has no guard outcome`);
		if (turn.accepted) assert.ok(ACCEPTED_OUTCOMES.has(turn.guardOutcome!), `accepted turn "${turn.action}" has outcome ${turn.guardOutcome}`);
		else assert.ok(REJECTED_OUTCOMES.has(turn.guardOutcome!), `rejected turn "${turn.action}" has outcome ${turn.guardOutcome}`);
	}
	const outcomes = first.summary.guardOutcomes as Record<string, number>;
	assert.ok((outcomes.kept_soft || 0) + (outcomes.rewritten || 0) + (outcomes.cut || 0) > 0, 'the guard must have acted on at least one recorded reply');

	// Safety: kept prose must still answer. Every accepted information turn states one of its expected facts.
	const expectations: Record<string, string[]> = {
		'Who found the body?': ['okafor'],
		'So who found the body again?': ['okafor'],
	};
	for (const turn of first.report) {
		const expected = expectations[turn.action];
		if (turn.accepted && expected) assert.ok(expected.some((fact) => turn.narration.toLowerCase().includes(fact)), `"${turn.action}" was accepted without its answer: ${turn.narration.slice(0, 120)}`);
	}
});
