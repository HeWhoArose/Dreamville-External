import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStoryMenu } from '../src/components/storyContext/storyNavigationModel';

const PLAYER_RENDERED_ROUTES = new Set([
	'play.story',
	'play.character',
	'play.inventory',
	'play.world',
	'play.recent-actions',
	'play.combat',
	'play.map',
	'play.quests',
	'play.journal',
	'play.codex',
	'play.evidence',
	'play.relationships',
]);

test('story navigation exposes only player-facing routes with real viewports', () => {
	const menu = deriveStoryMenu({
		rules: 'FULL_DND',
		genre: 'Fantasy',
		hasTacticalCombatRule: true,
	});

	assert.equal(menu.some((entry) => entry.route === 'play.world-systems'), false);
	for (const entry of menu) {
		assert.equal(entry.visible, true);
		assert.equal(PLAYER_RENDERED_ROUTES.has(entry.route), true, `Missing player viewport for ${entry.route}`);
	}
});

test('mystery navigation exposes evidence and relationships only through player-facing routes', () => {
	const menu = deriveStoryMenu({
		rules: 'INVESTIGATION',
		storyMode: 'MYSTERY',
		hasActiveCombat: false,
	});
	const routes = new Set(menu.map((entry) => entry.route));
	assert.equal(routes.has('play.evidence'), true);
	assert.equal(routes.has('play.relationships'), true);
	assert.equal(routes.has('play.world-systems'), false);
	assert.equal(PLAYER_RENDERED_ROUTES.has('play.evidence'), true);
	assert.equal(PLAYER_RENDERED_ROUTES.has('play.relationships'), true);
});

test('developer capability workbench stays internal while Character/World stay player-facing', () => {
	const menu = deriveStoryMenu({ rules: 'FULL_DND', genre: 'Fantasy' });
	const routes = new Set(menu.map((entry) => entry.route));
	assert.equal(routes.has('play.world'), true);
	assert.equal(routes.has('play.recent-actions'), true);
	assert.equal(routes.has('play.powers'), false);
	assert.equal(routes.has('play.world-systems'), false);
});

test('mystery mode retains World and Recent Actions in secondary navigation', () => {
	const menu = deriveStoryMenu({
		rules: 'INVESTIGATION',
		storyMode: 'MYSTERY',
	});
	const routes = new Set(menu.map((entry) => entry.route));
	assert.equal(routes.has('play.world'), true);
	assert.equal(routes.has('play.recent-actions'), true);
});
