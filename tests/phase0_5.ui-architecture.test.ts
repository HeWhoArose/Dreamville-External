import assert from 'node:assert/strict';
import test from 'node:test';
import {
	CANONICAL_NAV_ITEMS,
	getMobileDrawerNavigation,
	getMobilePrimaryNavigation,
} from '../src/components/shell/navigationModel';
import { compileProviderNeutralPrompt } from '../src/components/common/imageAssetTypes';

test('Phase 0.5 navigation exposes Story Library consistently', () => {
	const desktop = CANONICAL_NAV_ITEMS.filter((item) => item.desktop).map((item) => item.route);
	const mobilePrimary = getMobilePrimaryNavigation().map((item) => item.route);

	assert.ok(desktop.includes('story-library'));
	assert.ok(mobilePrimary.includes('story-library'));
	assert.equal(new Set([...desktop, ...mobilePrimary]).size, new Set([...desktop, ...mobilePrimary]).size);
});

test('Phase 0.5 mobile drawer contains only canonical secondary destinations', () => {
	const drawer = getMobileDrawerNavigation();
	assert.ok(drawer.some((item) => item.route === 'settings'));
	assert.ok(drawer.some((item) => item.route === 'ops.archive'));
	assert.ok(drawer.every((item) => !item.mobilePrimary));
});

test('Phase 0.5 world poster prompt incorporates canonical world metadata', () => {
	const prompt = compileProviderNeutralPrompt({
		slotId: 'world_cover_test',
		slotType: 'world_cover',
		title: 'The Glass Moon',
		worldSummary: 'A flooded lunar kingdom powered by tidal magic.',
		genreTags: ['Dark Fantasy', 'Science Fantasy'],
		toneTags: ['Mysterious', 'Melancholic'],
		era: 'Age of Tides',
		factions: ['Moon Court', 'Drowned Guild'],
		magicOrTechnology: 'Tidal resonance engines',
		geography: 'Submerged citadels beneath a glass ocean',
		visualMotifs: ['silver moons', 'bioluminescent towers'],
	});
	assert.match(prompt, /A flooded lunar kingdom powered by tidal magic/);
	assert.match(prompt, /Moon Court/);
	assert.match(prompt, /Tidal resonance engines/);
	assert.match(prompt, /silver moons/);
	assert.match(prompt, /DREAMBOOK OUTPUT SPECIFICATION/);
});
