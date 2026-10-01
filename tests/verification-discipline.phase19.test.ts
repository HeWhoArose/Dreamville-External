import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';

describe('Phase 19 — verification discipline', () => {
	it('publishes a repeatable edit-audit-test-release loop', async () => {
		const doc = await fs.readFile(new URL('../docs/DREAMVILLE_VERIFICATION_DISCIPLINE_PHASE19.md', import.meta.url), 'utf8');
		for (const phrase of [
			'Audit the current implementation and contracts.',
			'Add or update focused regression tests.',
			'Re-audit producer → consumer and consumer → producer connections.',
			'npm run verify:contracts',
			'npm run lint',
			'npm test',
			'npm run build',
		]) {
			assert.ok(doc.includes(phrase), phrase);
		}
	});

	it('exposes the executable verification command through package scripts', async () => {
		const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
		assert.equal(pkg.scripts['verify:contracts'], 'node scripts/verify-release-contract.mjs');
	});
});
