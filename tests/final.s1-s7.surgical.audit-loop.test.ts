import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
	return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function requireText(relativePath: string, pattern: RegExp, message: string): void {
	assert.match(source(relativePath), pattern, message);
}

test('final S1-S7 surgical architecture audit passes ten consecutive passes', () => {
	for (let pass = 1; pass <= 10; pass += 1) {
		const suffix = `Pass ${pass}`;

		// S1 — capability / skill / check authority
		requireText('server/domain/storySkillCheckRegistry.ts', /STANDARD_DND_SKILLS_CATALOG/, `${suffix}: S1 registry is not bound to the canonical D&D skill catalog`);
		requireText('server/domain/storyCheckAuthority.ts', /class StoryCheckAuthority/, `${suffix}: S1 check authority is missing`);
		requireText('server/mockEngine/serverMockAuthority.ts', /storyCheckAuthority/, `${suffix}: S1 story action path does not consume StoryCheckAuthority`);

		// S2 — story runtime / player interaction
		requireText('src/components/StoryView.tsx', /inputMode.*STORY.*OOC|inputMode/, `${suffix}: S2 Story/OOC interaction mode is missing`);
		requireText('src/components/StoryView.tsx', /Continue/, `${suffix}: S2 Continue control is missing`);
		requireText('src/components/StoryView.tsx', /protagonistPortraitUrl|protagonistPortraitEmoji/, `${suffix}: S2 player portrait projection is missing`);
		requireText('docs/STORY_RUNTIME_AND_PLAYER_INTERACTION_SPEC_V1.md', /exact persisted StoryRun/i, `${suffix}: S2 resume contract is not documented as exact-run resume`);

		// S3 — narration context / OOC boundary
		requireText('server/domain/workingContextEngine.ts', /NarrativeContinuityEngine/, `${suffix}: S3 WorkingContextEngine lost its continuity source`);
		requireText('server/domain/oocToolRegistry.ts', /OocToolMode = 'READ' \| 'MUTATE'/, `${suffix}: S3 OOC tool mode contract is missing`);
		requireText('server/domain/oocToolRegistry.ts', /canonical active player actor/, `${suffix}: S3 OOC actor boundary is missing`);
		assert.equal(source('server/api/gameRoutes.ts').includes('tryExecuteOocCanonicalAction'), false, `${suffix}: S3 forbidden regex/direct OOC mutation path is present`);

		// S4 — AI orchestration consolidation
		requireText('server/domain/aiTaskContracts.ts', /evaluateAiTaskReadiness/, `${suffix}: S4 task readiness authority is missing`);
		requireText('server/domain/aiOrchestrator.ts', /evaluateAiTaskReadiness/, `${suffix}: S4 orchestrator does not consume centralized readiness`);
		requireText('server/domain/aiOrchestrator.ts', /WorkingContextEngine/, `${suffix}: S4 orchestrator lost canonical context assembly integration`);

		// S5 — persistent multi-world
		requireText('server/domain/universeRuntimeService.ts', /ensureUniverse/, `${suffix}: S5 universe binding authority is missing`);
		requireText('server/domain/universeRuntimeService.ts', /static .*travel/, `${suffix}: S5 cross-world travel authority is missing`);
		requireText('server/repositories/worldRepository.ts', /getUniverseForStory/, `${suffix}: S5 repository universe lookup boundary is missing`);
		requireText('server/domain/workingContextEngine.ts', /getRelevantUniverseMemories/, `${suffix}: S5 universe memory is disconnected from context assembly`);

		// S6 — spatial authority
		requireText('server/domain/spatialAuthority.ts', /export class SpatialAuthority/, `${suffix}: S6 spatial authority is missing`);
		requireText('server/repositories/worldRepository.ts', /getSpatialAuthority/, `${suffix}: S6 spatial authority is not exposed by the canonical repository`);
		requireText('server/simulation/worldSimulationService.ts', /getSpatialAuthority/, `${suffix}: S6 macro travel is not consuming spatial authority`);
		requireText('server/domain/combatEngine.ts', /resolveSpatialLineOfSight/, `${suffix}: S6 tactical LOS is disconnected from the spatial authority`);
		requireText('server/domain/canonicalSnapshot.ts', /geography: any/, `${suffix}: S6 spatial state is absent from canonical snapshots`);

		// S7 — one canonical integration path
		requireText('server/api/gameRoutes.ts', /canonicalCommandEngine\.execute/, `${suffix}: S7 API action boundary bypasses the canonical command engine`);
		requireText('server/domain/canonicalCommandEngine.ts', /processCanonicalEvent/, `${suffix}: S7 canonical commands are not entering the simulation event path`);
		requireText('docs/SURGICAL_ARCHITECTURE_REGISTRY_V1.md', /Master Plan.*COMPLETE \/ FROZEN/, `${suffix}: S7 surgical work is no longer anchored to the frozen Master Plan baseline`);
	}
});
