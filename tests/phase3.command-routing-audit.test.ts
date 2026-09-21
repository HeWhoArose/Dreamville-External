import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const routeSource = readFileSync(
	resolve(process.cwd(), 'server/api/gameRoutes.ts'),
	'utf8'
);

function routeBlock(route: string): string {
	const start = routeSource.indexOf(`gameRouter.post('${route}'`);
	assert.ok(start >= 0, `Route ${route} must exist.`);
	const next = routeSource.indexOf('gameRouter.', start + 1);
	return routeSource.slice(start, next >= 0 ? next : routeSource.length);
}

test('Phase 3 — core authoritative action routes all use the canonical command engine', () => {
	const requiredRoutes = [
		'/action',
		'/inventory/equip',
		'/inventory/unequip',
		'/inventory/craft',
		'/inventory/transfer',
		'/inventory/repair',
		'/inventory/degrade',
		'/capabilities/adjudicate',
		'/capabilities/interpret',
		'/combat/encounter/start',
		'/combat/move',
		'/combat/action',
		'/combat/attack',
		'/combat/cast',
		'/combat/interrupt',
		'/combat/end-turn',
		'/combat/npc-turn',
		'/worlds/runs/:storyId/story-director/step',
		'/worlds/runs/:storyId/story-director/choice',
		'/worlds/runs/:storyId/story-director/offscreen',
		'/worlds/runs/:storyId/actions/execute',
		'/worlds/runs/:storyId/actions/apply-ability',
		'/worlds/runs/:storyId/dice-clash/resolve',
		'/orchestrator/turn',
	];

	for (const route of requiredRoutes) {
		assert.match(
			routeBlock(route),
			/canonicalCommandEngine\.execute/,
			`Core authoritative route ${route} bypasses the canonical command engine.`
		);
	}
});

test('Phase 3 — the AI orchestrator turn route uses the canonical command engine', () => {
	const block = routeBlock('/orchestrator/turn');
	assert.match(block, /canonicalCommandEngine\.execute/);
	assert.match(block, /source: 'AI'/);
});


test('Phase 3 — migrated core action routes use true staged transactions', () => {
	const stagedRoutes = [
		'/inventory/equip',
		'/inventory/unequip',
		'/inventory/craft',
		'/inventory/transfer',
		'/inventory/repair',
		'/inventory/degrade',
		'/combat/move',
		'/combat/action',
		'/combat/attack',
		'/combat/cast',
		'/combat/interrupt',
		'/combat/end-turn',
		'/combat/npc-turn',
		'/capabilities/adjudicate',
		'/worlds/runs/:storyId/dice-clash/resolve',
	];

	for (const route of stagedRoutes) {
		assert.match(
			routeBlock(route),
			/transactionMode:\s*'STAGED'/,
			`Core route ${route} must execute against a staged transaction repository.`
		);
	}
});

test('Phase 3 — legacy action endpoint maps movement/equipment/time intent to canonical command types', () => {
	const block = routeBlock('/action');
	assert.match(block, /canonicalActionType\s*=\s*\n\s*actionRequest\.type === 'TRAVEL_REQUEST'\n\s*\? 'MOVE'/);
	assert.match(block, /actionRequest\.type === 'EQUIP_REQUEST'/);
	assert.match(block, /actionRequest\.type === 'UNEQUIP_REQUEST'/);
	assert.match(block, /actionRequest\.type === 'ADVANCE_TIME'/);
	assert.match(block, /transactionMode: 'ROLLBACK'/);
	assert.match(block, /serverMockAuthority\.exportTransactionalState\(storyId\)/);
	assert.match(block, /serverMockAuthority\.importTransactionalState\(storyId, mockStateBefore\)/);
});
