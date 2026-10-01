import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';

describe('Phase 21 — release gate', () => {
	it('defines all release commands and the automated workflow', async () => {
		const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
		assert.equal(typeof pkg.scripts?.['verify:contracts'], 'string');
		assert.equal(typeof pkg.scripts?.lint, 'string');
		assert.equal(typeof pkg.scripts?.test, 'string');
		assert.equal(typeof pkg.scripts?.build, 'string');

		const workflow = await fs.readFile(new URL('../.github/workflows/dreamville-release-gate.yml', import.meta.url), 'utf8');
		assert.match(workflow, /npm run verify:contracts/);
		assert.match(workflow, /npm run lint/);
		assert.match(workflow, /npm test/);
		assert.match(workflow, /npm run build/);
	});

	it('defines the manual release scenarios and honest environment status', async () => {
		const doc = await fs.readFile(new URL('../docs/DREAMVILLE_RELEASE_GATE_PHASE21.md', import.meta.url), 'utf8');
		for (const phrase of [
			'I move closer to hear the rumors.',
			'primary model unavailable with fallback',
			'all providers unavailable with deterministic emergency floor',
			'malformed model JSON',
			'stale opening text after a committed turn',
			'UI retry of only a failed CUSTOM_ACTION',
			'Environment status for this implementation session',
		]) {
			assert.ok(doc.includes(phrase), phrase);
		}
	});
});
