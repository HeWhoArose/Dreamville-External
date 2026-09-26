import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('Story UI audit-implementation-regression-fallback loop completes ten deterministic passes', () => {
	const shell = read('src/components/storyContext/StoryContextShell.tsx');
	const menu = read('src/components/storyContext/storyNavigationModel.ts');
	const app = read('src/App.tsx');
	const story = read('src/components/StoryView.tsx');
	const header = read('src/components/storyContext/StoryContextHeader.tsx');

	const playerRoutes = [
		'play.story',
		'play.character',
		'play.inventory',
		'play.world',
		'play.recent-actions',
		'play.quests',
		'play.journal',
		'play.combat',
		'play.map',
		'play.codex',
		'play.evidence',
		'play.relationships',
	];

	for (let iteration = 1; iteration <= 10; iteration += 1) {
		assert.equal(menu.includes("route: 'play.world-systems'"), false, `Audit ${iteration}: developer World Systems route leaked into player navigation`);
		assert.equal(menu.includes("route: 'play.powers'"), false, `Audit ${iteration}: internal capability workbench leaked into player navigation`);
		assert.equal(shell.includes("primaryIds = new Set(['story', 'character', 'inventory', 'world', 'map', 'combat'])"), true, `Audit ${iteration}: Character and World must remain primary gameplay navigation entries`);
		assert.equal(shell.includes("The core story bar is deliberately fixed to the player's most-used destinations."), true, `Audit ${iteration}: primary gameplay navigation comment no longer matches the actual menu`);
		for (const route of playerRoutes) {
			assert.equal(menu.includes(`route: '${route}'`), true, `Audit ${iteration}: navigation lost ${route}`);
			assert.equal(app.includes(`currentRoute === '${route}'`), true, `Audit ${iteration}: ${route} has no real viewport`);
		}

		assert.equal(story.includes('StoryHUDDrawer'), false, `Audit ${iteration}: legacy HUD remains embedded in StoryView`);
		assert.equal(story.includes('getOrchestratorOperations'), false, `Audit ${iteration}: AI operations leaked into StoryView`);
		assert.equal(story.includes('getOrchestratorModels'), false, `Audit ${iteration}: model catalog leaked into StoryView`);
		assert.equal(story.includes('setOrchestratorCategoryModel'), false, `Audit ${iteration}: narration model selector remains in player UI`);

		assert.equal(shell.includes('Story tools'), true, `Audit ${iteration}: secondary story tools drawer missing`);
		assert.equal(shell.includes('primaryIds'), true, `Audit ${iteration}: primary/secondary navigation separation missing`);
		assert.equal(shell.includes('lg:hidden'), true, `Audit ${iteration}: mobile story navigation missing`);
		assert.equal(header.includes('bg-[#090611]/92'), true, `Audit ${iteration}: story header visual refresh missing`);

		assert.equal(app.includes('StoryCodexView'), true, `Audit ${iteration}: codex viewport disconnected`);
		assert.equal(app.includes('StoryEvidenceView'), true, `Audit ${iteration}: evidence viewport disconnected`);
		assert.equal(app.includes('StoryRelationshipsView'), true, `Audit ${iteration}: relationship viewport disconnected`);

		// Action boundary: typed actions now enter the canonical /action path directly;
		// the server performs capability preflight and returns advice only when required.
		assert.equal(app.includes("type: 'CUSTOM_ACTION'"), true, `Audit ${iteration}: custom action dispatch removed`);
		assert.equal(app.includes('canonical /action endpoint performs capability preflight itself.'), true, `Audit ${iteration}: canonical action preflight boundary removed`);

		// Regression boundary: speaker themes remain world-scoped.
		assert.equal(story.includes('getCharacterSpeakerTheme'), true, `Audit ${iteration}: world-scoped speaker color system disconnected`);
		assert.equal(story.includes('Latest turn'), true, `Audit ${iteration}: immediate turn result disappeared`);
		assert.equal(story.includes('Generate Scene'), true, `Audit ${iteration}: scene generation entry disappeared`);
		assert.equal(story.includes('Generate Image'), true, `Audit ${iteration}: scene image action disappeared`);
		assert.equal(story.includes('Generate Prompt'), true, `Audit ${iteration}: scene prompt action disappeared`);
		assert.equal(story.includes('Capability DAG & Derived Skills'), false, `Audit ${iteration}: internal capability graph leaked into player UI`);
		assert.equal(story.includes('Adjudication Outcome'), false, `Audit ${iteration}: internal adjudication panel leaked into player UI`);
	}
});


test('Story library persistence and canonical-source audit completes ten deterministic passes', () => {
	const app = read('src/App.tsx');
	const library = read('src/components/StoryLibraryModal.tsx');
	const routes = read('server/api/gameRoutes.ts');

	for (let iteration = 1; iteration <= 10; iteration += 1) {
		assert.equal(app.includes("const ACTIVE_STORY_STORAGE_KEY = 'dreambook.activeStoryId';"), true, `Audit ${iteration}: active story persistence key missing`);
		assert.equal(app.includes("useState<string>(() => readPersistedActiveStoryId())"), true, `Audit ${iteration}: active story is not restored on remount`);
		assert.equal(app.includes("localStorage.setItem(ACTIVE_STORY_STORAGE_KEY, activeStoryId)"), true, `Audit ${iteration}: active story is not persisted`);
		assert.equal(app.includes("apiClient.setActiveStoryId(activeStoryId);"), true, `Audit ${iteration}: API active-story authority is not synchronized`);
		assert.equal(app.includes("initializeApp(activeStoryId);"), true, `Audit ${iteration}: remount falls back to an implicit dummy story`);
		assert.equal(app.includes("const runs = await apiClient.getStoryRuns();"), true, `Audit ${iteration}: main library is not using canonical Story Runs`);

		assert.equal(library.includes("const list = await apiClient.getStoryRuns();"), true, `Audit ${iteration}: legacy adaptation-only library source remains`);
		assert.equal(library.includes("apiClient.listAdaptedStories()"), false, `Audit ${iteration}: decoy adapted-story endpoint remains connected to Story Library`);
		assert.equal(library.includes("story.isAdapted"), true, `Audit ${iteration}: adaptation-only branch action is not guarded`);

		assert.equal(routes.includes("isAdapted: Boolean(worldRepository.getAdaptedStoryBible(run.storyId))"), true, `Audit ${iteration}: canonical Story Run projection lacks adaptation metadata`);
	}
});


test('Quest journal surface uses canonical quest projection and player-facing journal data', () => {
	const app = read('src/App.tsx');
	const apiClient = read('src/services/apiClient.ts');
	const route = read('server/api/gameRoutes.ts');
	const chronicle = read('src/components/ChronicleView.tsx');

	for (let iteration = 1; iteration <= 10; iteration += 1) {
		assert.equal(app.includes('storyId={activeStoryId}'), true, `Audit ${iteration}: Quest Journal is not scoped to the active story`);
		assert.equal(app.includes('dialogueHistory={viewState.dialogueHistory}'), true, `Audit ${iteration}: journal dialogue history is disconnected`);
		assert.equal(apiClient.includes('getRunCanonicalState'), true, `Audit ${iteration}: canonical quest projection client method missing`);
		assert.equal(route.includes('const isQuestEvent = (event: any): boolean =>'), true, `Audit ${iteration}: world events are still being treated as quests without classification`);
		assert.equal(route.includes('questCategories = new Set'), true, `Audit ${iteration}: quest classification categories are not explicit`);
		assert.equal(chronicle.includes("section === 'quests' ? 'Quests' : 'Journal'"), true, `Audit ${iteration}: contextual Quest/Journal title missing`);
		assert.equal(chronicle.includes('Engine diagnostics and validation data stay out of this player-facing page.'), false, `Audit ${iteration}: legacy diagnostic copy remains in the player journal`);
		const questProjectionStart = route.indexOf('const isQuestEvent');
		const questProjectionEnd = route.indexOf('const questEvents', questProjectionStart);
		const questProjection = route.slice(questProjectionStart, questProjectionEnd);
		assert.equal(questProjection.includes("'MISSION'"), false, `Audit ${iteration}: generic world MISSION events are leaking into Quests`);
		assert.equal(questProjection.includes("'OBJECTIVE'"), false, `Audit ${iteration}: generic OBJECTIVE events are leaking into Quests`);
		assert.equal(questProjection.includes('explicitQuest'), true, `Audit ${iteration}: explicit quest classification is missing`);
		assert.equal(chronicle.includes('No active quests'), true, `Audit ${iteration}: explicit empty quest state missing`);
		assert.equal(chronicle.includes('Story action'), true, `Audit ${iteration}: journal does not show player actions`);
		assert.equal(chronicle.includes('Remembered'), true, `Audit ${iteration}: journal does not show player-visible memories`);
		assert.equal(chronicle.includes('setMemories(Array.isArray(data?.memory?.facts)'), true, `Audit ${iteration}: canonical memory projection is disconnected`);
		assert.equal(chronicle.includes('Outcome'), true, `Audit ${iteration}: journal does not show narrative consequences`);
		assert.equal(chronicle.includes('Objectives'), true, `Audit ${iteration}: quest objective section missing`);
		assert.equal(chronicle.includes('Origin'), false, `Audit ${iteration}: quest provenance/debug metadata leaked into player UI`);
		assert.equal(chronicle.includes('Last updated'), false, `Audit ${iteration}: quest timestamp metadata leaked into player UI`);
	}
});


test('Story navigation keeps Character primary and separates Quests and Journal destinations across ten audit passes', () => {
	const shell = read('src/components/storyContext/StoryContextShell.tsx');
	const menu = read('src/components/storyContext/storyNavigationModel.ts');
	const app = read('src/App.tsx');
	const routes = read('src/routes.ts');
	const chronicle = read('src/components/ChronicleView.tsx');

	for (let iteration = 1; iteration <= 10; iteration += 1) {
		assert.equal(shell.includes("const primaryIds = new Set(['story', 'character', 'inventory', 'world', 'map', 'combat']);"), true, `Audit ${iteration}: Character is not in the primary story menu`);
		assert.equal(menu.includes("id: 'character'"), true, `Audit ${iteration}: Character menu entry missing`);
		assert.equal(menu.includes("route: 'play.quests'"), true, `Audit ${iteration}: Quests is not a dedicated destination`);
		assert.equal(menu.includes("route: 'play.journal'"), true, `Audit ${iteration}: Journal is not a dedicated destination`);
		assert.equal(menu.includes("label: 'Tactics'"), true, `Audit ${iteration}: Tactics label missing`);
		assert.equal(menu.includes("label: 'Quests & Journal'"), false, `Audit ${iteration}: combined Quests & Journal label remains`);
		assert.equal(routes.includes("  | 'play.quests'"), true, `Audit ${iteration}: Quests route missing`);
		assert.equal(routes.includes("  | 'play.journal'"), true, `Audit ${iteration}: Journal route missing`);
		assert.equal(app.includes("currentRoute === 'play.quests'"), true, `Audit ${iteration}: Quests viewport disconnected`);
		assert.equal(app.includes("currentRoute === 'play.journal'"), true, `Audit ${iteration}: Journal viewport disconnected`);
		assert.equal(chronicle.includes("initialSection?: 'quests' | 'journal'"), true, `Audit ${iteration}: section-aware ChronicleView contract missing`);
		assert.equal(chronicle.includes("section === 'quests' ? 'Quests' : 'Journal'"), true, `Audit ${iteration}: contextual title missing`);
	}
});


test('story suggestion selection inserts text without executing the action', () => {
	const view = read('src/components/StoryView.tsx');
	const composer = read('src/utils/storyActionComposer.ts');
	assert.equal(composer.includes('export function mergeSuggestedActionText'), true);
	assert.equal(view.includes('onClick={() => insertSuggestedAction(tip.actionText)}'), true);
	assert.equal(view.includes('onCustomAction?.(tip.actionText)'), false);
});
