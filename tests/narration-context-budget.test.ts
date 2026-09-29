import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';

test('budgeted context marks admitted blocks active and preserves deterministic eviction', () => {
	const result = WorkingContextEngine.assembleBudgetedContext(
		[
			{
				id: 'critical',
				band: 'B1_CRITICAL',
				label: 'Critical',
				content: 'canonical scene',
				estimatedTokens: 3,
			},
			{
				id: 'large',
				band: 'B2_IMMEDIATE',
				label: 'Large',
				content: 'x'.repeat(80),
				estimatedTokens: 20,
			},
			{
				id: 'low',
				band: 'B4_EPISODIC',
				label: 'Low',
				content: 'old memory',
				estimatedTokens: 3,
			},
		],
		12,
	);

	assert.ok(result.includedChunks.every((chunk) => chunk.blockStatus === 'ACTIVE'));
	assert.ok(result.evictedChunkLabels.some((label) => label.startsWith('Large')));
});
