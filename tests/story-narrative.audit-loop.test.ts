import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('Narration, action-routing, suggestions, portrait prompts, and scene prompts survive ten audit passes', () => {
	const advisor = read('server/services/storyActionAdvisor.ts');
	const authority = read('server/mockEngine/serverMockAuthority.ts');
	const orchestrator = read('server/domain/aiOrchestrator.ts');
	const comic = read('server/services/comicSceneGenerator.ts');
	const routes = read('server/api/gameRoutes.ts');
	const story = read('src/components/StoryView.tsx');
	const portrait = read('server/services/characterGenesisService.ts');
	const portraitCompiler = read('src/components/common/imageAssetTypes.ts');

	for (let pass = 1; pass <= 10; pass += 1) {
		assert.match(advisor, /ordinaryActionPattern/, `pass ${pass}: ordinary-action gate missing`);
		assert.match(advisor, /mode: 'NORMAL_ACTION'/, `pass ${pass}: normal action route missing`);
		assert.match(advisor, /Every suggestion MUST be grounded/, `pass ${pass}: contextual suggestion contract missing`);

		assert.match(authority, /advice\.mode === 'NORMAL_ACTION'/, `pass ${pass}: normal action bypass missing`);
		assert.match(authority, /preventCapabilityExecution = true/, `pass ${pass}: capability execution guard missing`);
		assert.match(authority, /Ordinary story action recorded for narrative resolution/, `pass ${pass}: technical action message leak remains`);
		assert.doesNotMatch(authority, /message = `Attempted action:/, `pass ${pass}: old attempted-action leak remains`);

		assert.match(orchestrator, /immersive tabletop-RPG narrator response/, `pass ${pass}: immersive narration contract missing`);
		assert.match(orchestrator, /Do not tell the player what they attempted/, `pass ${pass}: attempted-action prohibition missing`);
		assert.match(orchestrator, /Never use phrases such as "the outcome unfolds in the narrative"/, `pass ${pass}: implementation-language prohibition missing`);

		assert.match(comic, /CURRENT SCENE VISUAL BRIEF/, `pass ${pass}: visual brief missing`);
		assert.match(comic, /context\.currentSituation/, `pass ${pass}: current situation disconnected`);
		assert.match(comic, /context\.latestVisibleNarrative/, `pass ${pass}: latest visible narration disconnected`);
		assert.match(comic, /PANEL LOGIC/, `pass ${pass}: adaptive panel logic missing`);

		assert.match(routes, /currentSituation:/, `pass ${pass}: route does not feed current situation`);
		assert.match(routes, /latestVisibleNarrative:/, `pass ${pass}: route does not feed latest narration`);

		assert.match(story, /insertSuggestedAction/, `pass ${pass}: suggestion composer insertion missing`);
		assert.doesNotMatch(story, /onCustomAction\?\.\(tip\.actionText\)/, `pass ${pass}: suggestion still executes immediately`);

		assert.match(portrait, /Character identity poster portrait/, `pass ${pass}: Character Genesis poster prompt missing`);
		assert.match(portrait, /1024 x 1024 pixels, 1:1 square/, `pass ${pass}: Character Genesis portrait size missing`);
		assert.match(portraitCompiler, /CHARACTER POSTER/, `pass ${pass}: shared portrait compiler missing character-poster guardrail`);
		assert.match(portraitCompiler, /face, eyes, hairstyle, facial structure/, `pass ${pass}: face-focused portrait detail missing`);
	}
});
