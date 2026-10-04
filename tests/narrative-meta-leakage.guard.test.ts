import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

describe('Narrative presentation metadata boundary', () => {
	it('rejects internal test and canonical-state language before player delivery', () => {
		const orchestrator = new MultiModelOrchestrator();
		const guard = (orchestrator as any).validateNarrativeMetaLeakage.bind(orchestrator);
		const cases = [
			'The 125-turn integration stress test concludes here.',
			'The canonical state report confirms the result.',
			'The active provider is Gemini and the fallback chain remains ready.',
			'The telemetry checkpoint was committed by the orchestrator.',
		];
		for (const narration of cases) {
			const result = guard(narration);
			assert.equal(result.valid, false, narration);
			assert.match(String(result.errorReason), /metadata|internal|player-facing/i);
		}
	});

	it('does not reject ordinary in-world uses of canonical words', () => {
		const orchestrator = new MultiModelOrchestrator();
		const guard = (orchestrator as any).validateNarrativeMetaLeakage.bind(orchestrator);
		assert.equal(guard('The archivist checks the canonical inscription on the old seal.').valid, true);
		assert.equal(guard('The state of the bronze mechanism remains steady.').valid, true);
		assert.equal(guard('The checkpoint marker on the archive map is faded.').valid, true);
	});
});
