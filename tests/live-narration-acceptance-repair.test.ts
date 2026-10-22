import test from 'node:test';
import assert from 'node:assert/strict';
import { OpeningSceneService } from '../server/services/openingSceneService';

function openingFacts(ambientSensory: string) {
	return {
		world: {
			id: 'world_narration_repair',
			title: 'Elysium',
			narrativeProfile: { mode: 'PROTAGONIST' },
		},
		character: {
			name: 'Aelion Vane',
			role: 'Wanderer',
			background: 'A seeker who left a dangerous past behind.',
			startingSituation: 'A distress beacon from a nearby settlement suggests the void corruption has returned.',
			capabilities: ['Tracking'],
			conditions: [],
			equipment: [],
		},
		location: {
			id: 'loc_threshold',
			name: 'Threshold of the Radiance',
			region: 'Elysium Solar Citadel Outskirts',
			description: 'A broad stone threshold beyond the outer citadel.',
			ambientSensory,
			visibleEntities: [],
			sceneObjects: [],
		},
		time: {
			cycle: 42,
			period: 'Afternoon',
			era: 'Autumn',
			formattedHeader: 'Cycle 42 • Month 10, Day 14 • 17:42 • Afternoon • Autumn',
		},
		knowledge: [],
	} as any;
}

test('deterministic opening does not leak sensory labels or internal occupancy diagnostics', () => {
	const facts = openingFacts(
		'Visual: First light over Elysium Solar Citadel. Sounds: Distant atmosphere. Scent: Native vegetation. Tactile: Firm earth.',
	);
	const opening = OpeningSceneService.synthesizeDeterministicOpening(facts, 'opening_repair');

	assert.doesNotMatch(opening.narrativeText, /Visual:|Sounds:|Scent:|Tactile:/i);
	assert.doesNotMatch(opening.narrativeText, /first light/i);
	assert.doesNotMatch(opening.narrativeText, /canonical scene projection|visible occupants are currently established/i);
	assert.match(opening.narrativeText, /No one is immediately visible nearby/i);
	assert.doesNotMatch(opening.structuredEvents.map((event) => event.text).join(' '), /Visual:|first light|canonical scene projection/i);
});

test('deterministic opening drops a contradictory sensory sentence but keeps compatible scene evidence', () => {
	const facts = openingFacts('First light spills across the threshold. A distant beacon pulses against the dark stone.');
	const opening = OpeningSceneService.synthesizeDeterministicOpening(facts, 'opening_time_repair');

	assert.doesNotMatch(opening.narrativeText, /first light/i);
	assert.match(opening.narrativeText, /A distant beacon pulses against the dark stone/i);
	assert.match(opening.narrativeText, /17:42 • Afternoon/i);
});

test('narration prompt preserves clock and bounded-answer rules in full and compact variants', async () => {
	const fs = await import('node:fs/promises');
	const source = await fs.readFile(new URL('../server/domain/narrativePromptBuilder.ts', import.meta.url), 'utf8');

	assert.match(source, /Match every time-of-day claim to the canonical current time/);
	assert.match(source, /observation or information-seeking actions, answer the actual question/);
	assert.match(source, /Atmosphere alone is not an answer/);
	assert.match(source, /bounded lack of answer/);
	assert.match(source, /never introduce an incompatible dawn\/morning\/afternoon\/night claim/);
});

test('narrative richness recognises bounded investigative limits as an action result', async () => {
	const fs = await import('node:fs/promises');
	const source = await fs.readFile(new URL('../server/domain/narrativeRichnessEvaluation.ts', import.meta.url), 'utf8');

	assert.match(source, /cannot determine/);
	assert.match(source, /insufficient evidence/);
	assert.match(source, /the reason is unclear/);
});

test('story action network retry reuses the original idempotency identity', async () => {
	const fs = await import('node:fs/promises');
	const app = await fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
	const route = await fs.readFile(new URL('../server/api/gameRoutes.ts', import.meta.url), 'utf8');

	assert.match(app, /failedStoryActionCommandId/);
	assert.match(app, /const commandId = retryCommandId \|\|/);
	assert.match(app, /idempotencyKey: commandId/);
	assert.match(app, /handleCustomAction\(failedStoryAction, failedStoryActionCommandId \|\| undefined\)/);
	assert.match(route, /const requestedCommandId =\s*\(req\.headers\['x-command-id'\][\s\S]*?req\.body\?\.commandId/);
	assert.match(route, /idempotencyKey: req\.body\?\.idempotencyKey/);
});

test('narration retry remains presentation-only for an existing committed action', async () => {
	const fs = await import('node:fs/promises');
	const view = await fs.readFile(new URL('../src/components/StoryView.tsx', import.meta.url), 'utf8');
	const route = await fs.readFile(new URL('../server/api/gameRoutes.ts', import.meta.url), 'utf8');
	const start = route.indexOf("gameRouter.post('/action/narrate/regenerate'");
	const end = route.indexOf("gameRouter.post('/action/advice'", start);
	assert.ok(start >= 0 && end > start, 'narration regeneration route boundaries should exist');
	const regenerateRoute = route.slice(start, end);

	assert.match(view, /apiClient\.regenerateNarration\(\s*\{\s*storyId,\s*actionId: entry\.id/);
	assert.match(regenerateRoute, /state\.actionHistory\.find\(\(entry: any\) => entry\.id === actionId\)/);
	assert.doesNotMatch(regenerateRoute, /processCustomAction|processAction\(/);
	assert.match(regenerateRoute, /action\.narrativeResponse = generated\.turnPackage\.narrative\.join/);
});
