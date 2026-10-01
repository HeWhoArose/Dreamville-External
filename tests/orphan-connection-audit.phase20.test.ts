import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';

describe('Phase 20 — orphan and connection audit', () => {
	it('contains a source-level audit of the release-critical producer/consumer chain', async () => {
		const audit = await fs.readFile(new URL('../docs/DREAMVILLE_ORPHAN_CONNECTION_AUDIT_PHASE20.md', import.meta.url), 'utf8');
		for (const phrase of [
			'No known Phase 11–16 orphaned subsystem',
			'CurrentSituationBuilder → VisualSceneContext → buildComicScenePromptFromVisualContext',
			'canonical state adjudicator requires independently verified changes before commit',
		]) {
			assert.ok(audit.includes(phrase), phrase);
		}
		const [storyView, routes] = await Promise.all([
			fs.readFile(new URL('../src/components/StoryView.tsx', import.meta.url), 'utf8'),
			fs.readFile(new URL('../server/api/gameRoutes.ts', import.meta.url), 'utf8'),
		]);
		assert.match(storyView, /sceneSourceActionId/);
		assert.match(storyView, /sourceActionId/);
		assert.match(routes, /sourceActionId/);
	});

	it('keeps the release audit honest about the remaining runtime gate', async () => {
		const audit = await fs.readFile(new URL('../docs/DREAMVILLE_ORPHAN_CONNECTION_AUDIT_PHASE20.md', import.meta.url), 'utf8');
		assert.match(audit, /npm run lint.*npm test.*npm run build/s);
		assert.match(audit, /GitHub CI has now executed.*full test gate remains red/s);
	});
});
