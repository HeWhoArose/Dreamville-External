import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';

const ROOTS = [
	'../server/domain/currentSituation.ts',
	'../server/domain/playerIntentInterpreter.ts',
	'../server/domain/narrativeResearchPipeline.ts',
	'../server/domain/narrativeDirector.ts',
	'../server/domain/semanticNarrativeReview.ts',
	'../server/domain/narrativeStateAdjudicator.ts',
	'../server/domain/narrativeMemoryLifecycle.ts',
	'../server/domain/entitySceneRelevance.ts',
	'../server/domain/epistemicBoundary.ts',
	'../server/domain/aiTurnCallBudget.ts',
	'../server/domain/visualSceneContext.ts',
	'../server/services/comicSceneGenerator.ts',
	'../server/services/mediaAdapterService.ts',
	'../server/api/gameRoutes.ts',
	'../src/components/StoryView.tsx',
	'../src/services/apiClient.ts',
];

describe('Phase 17 — cross-system integration matrix', () => {
	it('has a real source file for every release-critical subsystem', async () => {
		for (const root of ROOTS) {
			const stat = await fs.stat(new URL(root, import.meta.url));
			assert.equal(stat.isFile(), true, root);
		}
	});

	it('documents the canonical narrative dependency chain and visual dependency chain', async () => {
		const matrix = await fs.readFile(
			new URL('../docs/DREAMVILLE_INTEGRATION_MATRIX_PHASE17.md', import.meta.url),
			'utf8',
		);
		assert.match(matrix, /PLAYER INPUT.*PlayerIntent.*CurrentSituation.*NarrativeResearch.*NarrativePlan/s);
		assert.match(matrix, /CurrentSituation \+ latest committed ActionLog.*VisualSceneContext.*comic prompt.*MediaAdapterService/s);
		assert.match(matrix, /Every row must have a real producer, a typed\/structured boundary, a real consumer/s);
	});

	it('keeps visual presentation separate from canonical mutation', async () => {
		const matrix = await fs.readFile(
			new URL('../docs/DREAMVILLE_INTEGRATION_MATRIX_PHASE17.md', import.meta.url),
			'utf8',
		);
		assert.match(matrix, /presentation-only/);
		assert.match(matrix, /cannot authorize canonical state mutation/);
		assert.match(matrix, /canonical commit failure must not be hidden/);
	});

	it('connects Phase 16 route, UI, and media boundaries', async () => {
		const [routes, storyView, apiClient, media] = await Promise.all([
			fs.readFile(new URL('../server/api/gameRoutes.ts', import.meta.url), 'utf8'),
			fs.readFile(new URL('../src/components/StoryView.tsx', import.meta.url), 'utf8'),
			fs.readFile(new URL('../src/services/apiClient.ts', import.meta.url), 'utf8'),
			fs.readFile(new URL('../server/services/mediaAdapterService.ts', import.meta.url), 'utf8'),
		]);
		assert.match(routes, /buildVisualSceneContext/);
		assert.match(routes, /mediaAdapterService\.generateImage/);
		assert.match(storyView, /generateCurrentSceneImage/);
		assert.match(storyView, /sceneSourceActionId/);
		assert.match(apiClient, /\/scene\/generate-image/);
		assert.match(media, /presentation-only/);
	});
});
