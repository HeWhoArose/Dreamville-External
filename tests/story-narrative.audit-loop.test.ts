import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('Narration, action-routing, suggestions, portrait prompts, and scene prompts survive ten audit passes', () => {
	const advisor = read('server/services/storyActionAdvisor.ts');
	const authority = read('server/mockEngine/serverMockAuthority.ts');
	const orchestrator = read('server/domain/aiOrchestrator.ts');
	const continuity = read('server/domain/narrativeContinuityEngine.ts');
	const combat = read('src/components/TacticalCombatView.tsx');
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
		assert.match(orchestrator, /validateNarrativeActionContinuity/, `pass ${pass}: current-action continuity guard missing`);
		assert.match(orchestrator, /validateNarrativeTemporalContinuity/, `pass ${pass}: temporal continuity guard missing`);
		assert.match(orchestrator, /Canonical world time:/, `pass ${pass}: canonical world-time lock missing`);
		assert.match(orchestrator, /Never use phrases such as "the outcome unfolds in the narrative"/, `pass ${pass}: implementation-language prohibition missing`);
		assert.match(orchestrator, /Narrative Research|narrativeContinuityEngine\.research/, `pass ${pass}: pre-narration research context missing`);
		assert.match(orchestrator, /narrativeContinuityEngine\.research/, `pass ${pass}: continuity research is not connected to narration`);
		assert.match(orchestrator, /NarrativePacingEngine\.outputTokenBudget/, `pass ${pass}: adaptive narration output budget is not connected`);
		assert.match(orchestrator, /maxTokens:/, `pass ${pass}: narration provider output budget option is missing`);
		assert.match(orchestrator, /Vary sentence rhythm|sensory detail/, `pass ${pass}: narrative diversity contract missing`);
		assert.match(orchestrator, /Substance has priority over flourish/, `pass ${pass}: narrative substance contract missing`);
		assert.match(orchestrator, /validateNarrativeInformationContinuity/, `pass ${pass}: information-seeking continuity guard missing`);
		assert.match(orchestrator, /This is an information-seeking action/, `pass ${pass}: inquiry-specific narration guidance missing`);
		assert.match(continuity, /NarrativeResearchPacket/, `pass ${pass}: narrative research packet contract missing`);
		assert.match(continuity, /plot: state\.plot/, `pass ${pass}: plot is not returned through narrative research`);
		assert.match(continuity, /plan: state\.plan/, `pass ${pass}: plan is not returned through narrative research`);
		assert.match(continuity, /usageGuidance:/, `pass ${pass}: research usage guidance is missing`);
		assert.match(continuity, /relationships: 'Use to shape believable reactions/, `pass ${pass}: relationship guidance is missing`);
		assert.match(orchestrator, /contextAudit/, `pass ${pass}: exact narration context audit is not exposed`);
		assert.match(authority, /narrativeContextHistory/, `pass ${pass}: narrative context history is not persisted`);
		assert.match(routes, /AI_UNAVAILABLE/, `pass ${pass}: player-facing AI-unavailable error contract is missing`);
		assert.match(routes, /attemptsTrail/, `pass ${pass}: model failure trail is not exposed`);
		assert.match(routes, /contextAudit: generated\.contextAudit/, `pass ${pass}: regeneration context audit is not persisted`);
		assert.match(story, /Narration fallback route/, `pass ${pass}: narration model picker does not expose its fallback route`);
		assert.match(story, /actionInputRef/, `pass ${pass}: suggestion insertion does not return focus to the action input`);
		assert.match(portrait, /'character.extract'/, `pass ${pass}: Character Genesis progression inference is not routed through character extraction category`);
		assert.match(orchestrator, /'character.extract',/, `pass ${pass}: default AI model registry does not expose Character Genesis eligibility`);
		assert.match(authority, /narrativeResearchPacket/, `pass ${pass}: live action research packet is not retained`);
		assert.match(authority, /run\?\.openingScene\?\.narrativeText/, `pass ${pass}: opening-scene facts are not fed into live narration`);
		assert.match(combat, /bg-\[#100b2f\]/, `pass ${pass}: combat resolution background visual refresh missing`);
		assert.match(authority, /narrativeContinuityEngine\.recordTurn/, `pass ${pass}: committed freeform turns are not returned to continuity`);
		assert.match(authority, /narrativeTurnPackage/, `pass ${pass}: validated\/fallback narrative package is not retained for continuity`);
		assert.match(authority, /narrativeContinuityEngine\.getState/, `pass ${pass}: fallback narration is not continuity-aware`);
		assert.match(combat, /DiceRollAnimation/, `pass ${pass}: combat resolution is disconnected from shared dice presentation`);
		assert.match(combat, /What happened/, `pass ${pass}: combat narrative presentation hierarchy missing`);

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
