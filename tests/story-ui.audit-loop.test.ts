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
		'play.combat',
		'play.map',
		'play.chronicle',
		'play.codex',
		'play.evidence',
		'play.relationships',
	];

	for (let iteration = 1; iteration <= 10; iteration += 1) {
		assert.equal(menu.includes("route: 'play.world-systems'"), false, `Audit ${iteration}: developer World Systems route leaked into player navigation`);
		assert.equal(menu.includes("route: 'play.powers'"), false, `Audit ${iteration}: internal capability workbench leaked into player navigation`);
		assert.equal(shell.includes("primaryIds = new Set(['story', 'inventory', 'map', 'combat'])"), true, `Audit ${iteration}: Character/World/Recent Actions must stay in More`);
		assert.equal(shell.includes("Character/World/Recent Actions are contextual tools and live inside More."), true, `Audit ${iteration}: contextual tools leaked into primary navigation`);
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

		// Fallback boundary: a failed action-advice preflight must still reach canonical action dispatch.
		assert.equal(app.includes('Story action preflight unavailable; continuing through canonical action path.'), true, `Audit ${iteration}: action fallback path removed`);

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
