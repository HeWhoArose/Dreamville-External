import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
	expandDiceGroups,
	expandDiceTerms,
	getDieVisualType,
} from '../src/components/common/DiceRollAnimation';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('S2 dice presentation preserves authoritative group structure across eleven audit passes', () => {
	for (let iteration = 1; iteration <= 11; iteration += 1) {
		const simple = expandDiceGroups(
			{ formula: '2d20+5', diceTerms: undefined },
			[7, 13],
		);
		assert.deepEqual(simple, [
			{ count: 2, sides: 20, values: [7, 13] },
		], `Audit ${iteration}: 2d20 must remain one physical D20 group with two canonical values`);

		const mixed = expandDiceGroups(
			{ formula: '1d20+2d6+1d4', diceTerms: undefined },
			[17, 4, 2, 3],
		);
		assert.deepEqual(
			mixed.map((group) => ({ count: group.count, sides: group.sides, values: group.values })),
			[
				{ count: 1, sides: 20, values: [17] },
				{ count: 2, sides: 6, values: [4, 2] },
				{ count: 1, sides: 4, values: [3] },
			],
			`Audit ${iteration}: mixed dice formulas must preserve every authoritative die group`,
		);

		const termDriven = expandDiceTerms({
			formula: '1d20+2d6+1d4',
			diceTerms: [
				{ count: 1, sides: 20 },
				{ count: 2, sides: 6 },
				{ count: 1, sides: 4 },
			],
		});
		assert.deepEqual(termDriven, [20, 6, 6, 4], `Audit ${iteration}: canonical diceTerms must remain one visual die per authoritative die`);

		assert.deepEqual(
			[4, 6, 8, 10, 12, 20, 100].map(getDieVisualType),
			['D4', 'D6', 'D8', 'D10', 'D12', 'D20', 'D100'],
			`Audit ${iteration}: supported physical die families must remain explicitly identified`,
		);
	}
});

test('S2 story timeline renders newest-first server history in chronological player order', () => {
	const story = read('src/components/StoryView.tsx');
	const authority = read('server/mockEngine/serverMockAuthority.ts');

	for (let iteration = 1; iteration <= 11; iteration += 1) {
		assert.match(
			story,
			/const history = \(actionHistory \|\| \[\]\)[\s\S]*?\.slice\(\)[\s\S]*?\.reverse\(\)/,
			`Audit ${iteration}: StoryView must reverse the server's newest-first action history before rendering`,
		);
		assert.match(
			authority,
			/state\.actionHistory = \[logEntry, \.\.\.state\.actionHistory\]/,
			`Audit ${iteration}: server action history must remain explicitly newest-first at the storage boundary`,
		);
		assert.match(
			story,
			/history\.slice\(Math\.max\(0, history\.length - visibleTurnCount\)\)/,
			`Audit ${iteration}: visible-turn pagination must operate on chronological history`,
		);
	}
});

test('S2 narration turn labels use action turn ordinals rather than world calendar cycles', () => {
	const types = read('src/types.ts');
	const story = read('src/components/StoryView.tsx');
	const authority = read('server/mockEngine/serverMockAuthority.ts');

	for (let iteration = 1; iteration <= 11; iteration += 1) {
		assert.match(types, /turnNumber\?: number/, `Audit ${iteration}: ActionLog turnNumber contract missing`);
		assert.match(story, /fallbackTurnNumbers/, `Audit ${iteration}: story view turn-number fallback missing`);
		assert.match(story, /fallbackTurnNumbers\.get\(entry\.id\)/, `Audit ${iteration}: story view must render action turn ordinals`);
		assert.match(authority, /completedTurns = state\.actionHistory\.reduce/, `Audit ${iteration}: server turn-number sequencing missing`);
	}
});

test('S2 Story/OOC/Continue and player portrait remain connected to canonical story state', () => {
	const story = read('src/components/StoryView.tsx');
	const inventory = read('src/components/InventoryView.tsx');
	const app = read('src/App.tsx');
	const library = read('src/components/library/StoryLibraryView.tsx');
	const routes = read('server/api/gameRoutes.ts');

	for (let iteration = 1; iteration <= 11; iteration += 1) {
		assert.doesNotMatch(inventory, /onInspectItem/, `Audit ${iteration}: inventory UI still exposes obsolete narrative-inspection click wiring`);
		assert.doesNotMatch(app, /handleInspectItem|onInspectItem=/, `Audit ${iteration}: App still wires inventory clicks into INSPECT_ITEM`);
		assert.equal(story.includes("useState<'STORY' | 'OOC'>('STORY')"), true, `Audit ${iteration}: Story/OOC input mode missing`);
		assert.equal(story.includes('apiClient.sendOocMessage(actionText, storyId)'), true, `Audit ${iteration}: OOC requests are not routed through the OOC service`);
		assert.equal(story.includes('const handleContinueStory = () =>'), true, `Audit ${iteration}: Continue interaction missing`);
		assert.equal(story.includes('onCustomAction?.(\'Continue the story naturally from the current moment'), true, `Audit ${iteration}: Continue is not connected to the canonical story action path`);
		assert.equal(story.includes('protagonistPortraitUrl ?'), true, `Audit ${iteration}: active player portrait projection missing`);
		assert.equal(story.includes('protagonistPortraitEmoji || \'🧙\''), true, `Audit ${iteration}: player portrait fallback missing`);
		assert.equal(library.includes('onResumeStory(story.runId)'), true, `Audit ${iteration}: Story Library does not resume the exact Story Run ID`);
		assert.equal(app.includes("apiClient.getStoryRuns()"), true, `Audit ${iteration}: dashboard/library does not refresh from canonical Story Runs`);
		assert.equal(routes.includes("req.body?.confirm !== true"), true, `Audit ${iteration}: destructive route confirmation flag is not enforced`);
		assert.equal(routes.includes('confirmationText !== expectedConfirmation'), true, `Audit ${iteration}: destructive route exact-title confirmation is not enforced`);
		assert.equal(app.includes("requestExactDeletionConfirmation('Story Run', story.title)"), true, `Audit ${iteration}: Story Run deletion does not use exact-title confirmation`);
		assert.equal(app.includes("requestExactDeletionConfirmation('World', world.title)"), true, `Audit ${iteration}: World deletion does not use exact-title confirmation`);
	}
});
