import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DeveloperDiagnosticsService } from '../server/domain/developerDiagnosticsService';

describe('Phase 14: Developer Diagnostics', () => {
	it('paginates canonical timeline results for large Chronicles', () => {
		const events = Array.from({ length: 325 }, (_, index) => ({
			eventId: `evt_${index + 1}`,
			commandId: `cmd_${index + 1}`,
			commandType: 'CORE_ACTION',
			source: 'PLAYER',
			actorId: 'player_1',
			committedAt: 'Y0001-M01-D01T00:00:00',
			summary: `Event ${index + 1}`,
			mutationPaths: ['player'],
			mutationCount: 1,
			replay: {
				canonicalSequence: index + 1,
				preStateHash: 'pre',
				postStateHash: 'post',
				resolvedDataHash: 'data',
				rngState: {},
			},
		}));

		const fakeRepository = {
			getCanonicalCommandEvents: () => events,
		} as any;

		const first = DeveloperDiagnosticsService.getTimeline(fakeRepository, 'story_1', 50, 0);
		const middle = DeveloperDiagnosticsService.getTimeline(fakeRepository, 'story_1', 50, 150);
		const last = DeveloperDiagnosticsService.getTimeline(fakeRepository, 'story_1', 50, 300);

		assert.equal(first.total, 325);
		assert.equal(first.items.length, 50);
		assert.equal(first.items[0].eventId, 'evt_1');
		assert.equal(first.hasMore, true);
		assert.equal(middle.items[0].eventId, 'evt_151');
		assert.equal(last.items.length, 25);
		assert.equal(last.hasMore, false);
	});

	it('redacts provider credentials, secrets and raw response fields from diagnostics', () => {
		const fakeRepository = {
			getCanonicalCommandEvents: () => [{
				eventId: 'evt_secret',
				commandId: 'cmd_secret',
				commandType: 'CORE_ACTION',
				source: 'PLAYER',
				summary: 'Secret-bearing event',
				mutationPaths: [],
				mutationCount: 0,
				apiKey: 'DO_NOT_EXPOSE',
				authorization: 'Bearer DO_NOT_EXPOSE',
				nested: {
					password: 'DO_NOT_EXPOSE',
					clientSecret: 'DO_NOT_EXPOSE',
					rawResponse: 'DO_NOT_EXPOSE',
					safeField: 'visible',
				},
				replay: {
					canonicalSequence: 1,
					preStateHash: 'pre',
					postStateHash: 'post',
					resolvedDataHash: 'data',
					rngState: {},
				},
			}],
		} as any;

		const result = DeveloperDiagnosticsService.getTimeline(fakeRepository, 'story_1', 50, 0);
		const serialized = JSON.stringify(result);

		assert.equal(serialized.includes('DO_NOT_EXPOSE'), false);
		assert.equal(serialized.includes('[REDACTED]'), true);
		assert.equal(serialized.includes('visible'), true);
	});

	it('does not expose an AI-generated explanation path', () => {
		const fakeRepository = {
			getCanonicalCommandEvents: () => [{
				eventId: 'evt_1',
				commandId: 'cmd_1',
				commandType: 'CORE_ACTION',
				source: 'PLAYER',
				actorId: 'player_1',
				summary: 'Opened the gate',
				mutationPaths: ['worldFacts'],
				replay: {
					canonicalSequence: 1,
					preStateHash: 'pre',
					postStateHash: 'post',
					resolvedDataHash: 'data',
					rngState: {},
				},
			}],
			getHistoricalChronicleEngine: () => ({
				exportState: () => ({ evidenceStore: [] }),
			}),
			getStoryRun: () => undefined,
		} as any;

		const result = DeveloperDiagnosticsService.explainEvent(fakeRepository, 'story_1', 'evt_1');
		assert.ok(result);
		assert.equal(result?.deterministic, true);
		assert.equal(result?.aiUsed, false);
	});
});
