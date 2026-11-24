import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNarrationBaseline } from '../scripts/narration-baseline';

/**
 * Replays real model replies (recorded from live Gemini/Groq runs on the Ren world pack) through the full /action pipeline
 * with a scripted provider. No network. Scores prompt, gate and rewrite changes against actual model output.
 * Re-record with: BASELINE_MODE=live BASELINE_RECORD=... npm run narration:baseline (see scripts/narration-baseline.ts).
 */
const CORPUS = 'tests/fixtures/narration-replay/ren_gemini_groq.json';

test('replay of recorded real replies is deterministic, keeps answering facts in the prompt, and holds the acceptance floor', { timeout: 280000 }, async () => {
	const first = await runNarrationBaseline({ mode: 'replay', replayFrom: CORPUS, outFile: null });
	const second = await runNarrationBaseline({ mode: 'replay', replayFrom: CORPUS, outFile: null });

	const signature = (result: typeof first) => result.report.map((turn) => `${turn.accepted}:${(turn.reason || '').slice(0, 60)}`).join('|');
	assert.equal(signature(first), signature(second), 'replay must be deterministic');
	assert.equal(first.summary.informationTurnsWithFactInPrompt, '5/5', 'every information question must carry its answering fact');
	assert.ok((first.summary.scorableTurns as number) >= 5, 'the corpus must cover most turns');
	// Measured 3 of 7 scorable turns when this corpus was introduced. Raise the floor as the gates improve.
	assert.ok((first.summary.acceptedOfScorable as number) >= 2, `accepted ${first.summary.acceptedOfScorable} of ${first.summary.scorableTurns}`);
});
