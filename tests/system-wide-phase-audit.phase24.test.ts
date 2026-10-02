import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
	return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function mustExist(relativePath: string): void {
	assert.equal(fs.existsSync(path.join(process.cwd(), relativePath)), true, 'Missing audit-required path: ' + relativePath);
}

function mustContain(relativePath: string, pattern: RegExp, label: string): void {
	assert.match(source(relativePath), pattern, label);
}

test('Phase 24 — system-wide architecture audit: release-critical phases are represented', () => {
	const requiredPaths = [
		'docs/SURGICAL_ARCHITECTURE_REGISTRY_V1.md',
		'docs/DREAMVILLE_INTEGRATION_MATRIX_PHASE17.md',
		'docs/DREAMVILLE_VERIFICATION_DISCIPLINE_PHASE19.md',
		'docs/DREAMVILLE_ORPHAN_CONNECTION_AUDIT_PHASE20.md',
		'docs/DREAMVILLE_RELEASE_GATE_PHASE21.md',
		'docs/DREAMVILLE_RELEASE_STABILIZATION_PHASE22.md',
		'docs/DREAMVILLE_ARCHITECTURE_CLOSURE_PHASE23.md',
		'docs/DREAMVILLE_SYSTEM_WIDE_PHASE_AUDIT_PHASE24.md',
		'server/domain/currentSituation.ts',
		'server/domain/playerIntentInterpreter.ts',
		'server/domain/narrativeResearchPipeline.ts',
		'server/domain/narrativeDirector.ts',
		'server/domain/narrativePromptBuilder.ts',
		'server/domain/semanticNarrativeReview.ts',
		'server/domain/narrativeStateAdjudicator.ts',
		'server/domain/narrativeMemoryLifecycle.ts',
		'server/domain/visualSceneContext.ts',
		'server/domain/turnIntegrationHarness.ts',
		'server/domain/resolutionGate.ts',
		'server/domain/actionResolution.ts',
		'server/domain/canonicalCommitLedger.ts',
		'server/domain/npcPlanningSlice.ts',
		'server/services/comicSceneGenerator.ts',
		'server/services/mediaAdapterService.ts',
		'server/api/gameRoutes.ts',
		'src/components/StoryView.tsx',
		'src/services/apiClient.ts',
	];

	for (const relativePath of requiredPaths) mustExist(relativePath);
});

test('Phase 24 — canonical turn boundary remains single-owner', () => {
	mustContain('server/api/gameRoutes.ts', /canonicalCommandEngine\.execute/, 'API action path bypasses canonical command engine.');
	mustContain('server/domain/canonicalCommandEngine.ts', /processCanonicalEvent/, 'Canonical command path does not enter simulation event processing.');
	mustContain('server/domain/narrativeStateAdjudicator.ts', /class NarrativeStateAdjudicator/, 'Narrative state adjudicator is missing.');
	mustContain('server/domain/turnIntegrationHarness.ts', /NarrativeStateAdjudicator\.adjudicate/, 'End-to-end harness does not exercise canonical adjudication.');
	mustContain('server/domain/actionResolution.ts', /export interface ActionResolution/, 'Typed ActionResolution boundary is missing.');
	mustContain('server/domain/narrativePromptBuilder.ts', /ACTION RESOLUTION — AUTHORITATIVE/, 'Authoritative action resolution is not projected into narration.');
});

test('Phase 24 — context, epistemic, and NPC boundaries remain connected', () => {
	mustContain('server/domain/workingContextEngine.ts', /NarrativeContinuityEngine/, 'Working context lost the continuity source.');
	mustContain('server/domain/narrativeResearchPipeline.ts', /SemanticNarrativeResearchEngine\.scoreCandidate/, 'Semantic narrative research is not part of candidate selection.');
	mustContain('server/domain/narrativeDirector.ts', /buildNpcCognitionContract/, 'NPC cognition is not part of narrative direction.');
	mustContain('server/domain/npcPlanningSlice.ts', /knowledgeBoundary/, 'NPC knowledge boundary is missing.');
	mustContain('server/domain/epistemicBoundary.ts', /class EpistemicBoundaryEnforcer/, 'Epistemic boundary authority is missing.');
	mustContain('server/domain/aiOrchestrator.ts', /EpistemicBoundaryEnforcer\.sanitizeResearch/, 'Live narration path does not sanitize research before planning.');
});

test('Phase 24 — presentation quality chain is end-to-end connected', () => {
	mustContain('server/domain/aiOrchestrator.ts', /NarratorVoiceEngine\.resolve/, 'N2 voice does not reach orchestration.');
	mustContain('server/domain/aiOrchestrator.ts', /NarrativeNoveltyEngine\.resolve/, 'N7 novelty does not reach orchestration.');
	mustContain('server/domain/aiOrchestrator.ts', /NarrativePacingEngine\.resolve/, 'N8 pacing does not reach orchestration.');
	mustContain('server/domain/aiOrchestrator.ts', /NarrativeProviderHandoffEngine/, 'N9 provider handoff does not reach orchestration.');
	mustContain('server/domain/aiOrchestrator.ts', /validateNarrativePresentation/, 'Final shared presentation validation is missing.');
	mustContain('server/domain/semanticNarrativeReview.ts', /NarrativeQualityContractEngine\.validate/, 'N1 quality contract is not consumed by semantic review.');
	mustContain('server/domain/literaryNarrativeReview.ts', /NarrativeNoveltyEngine\.inspect/, 'N6 does not consume N7 novelty data.');
	mustContain('server/domain/narrativeMemoryLifecycle.ts', /NarrativeNoveltyEngine\.recordAcceptedTurn/, 'N7 accepted-turn persistence is not owned by lifecycle.');
	mustContain('server/domain/narrativeMemoryLifecycle.ts', /NarrativeContinuityStateEngine\.recordAcceptedTurn/, 'N4 accepted-turn persistence is not owned by lifecycle.');
});

test('Phase 24 — visual path cannot become a second canonical authority', () => {
	mustContain('server/api/gameRoutes.ts', /buildVisualSceneContext/, 'Visual route is not using VisualSceneContext.');
	mustContain('server/api/gameRoutes.ts', /assertVisualSceneFreshness/, 'Visual route does not fail closed on stale scene context.');
	mustContain('src/components/StoryView.tsx', /sceneSourceActionId/, 'StoryView does not track visual source action.');
	mustContain('server/services/mediaAdapterService.ts', /presentation-only/, 'Media adapter is missing its presentation-only boundary.');
});

test('Phase 24 — verification/release contracts include the complete executable gate', () => {
	const pkg = JSON.parse(source('package.json'));
	for (const script of ['verify:contracts', 'lint', 'test', 'build']) {
		assert.equal(typeof pkg.scripts?.[script], 'string', 'Missing required npm script: ' + script);
	}
	mustContain('scripts/verify-release-contract.mjs', /DREAMVILLE_INTEGRATION_MATRIX_PHASE17\.md/, 'Release contract does not require Phase 17 integration matrix.');
	mustContain('scripts/verify-release-contract.mjs', /phase22-release-stabilization\.test\.ts/, 'Release contract does not require Phase 22 stabilization test.');
	mustContain('scripts/verify-release-contract.mjs', /system-wide-phase-audit\.phase24\.test\.ts/, 'Release contract does not require the Phase 24 system-wide audit test.');
});

test('Phase 24 — all audited phase-specific regression suites remain present', () => {
	const tests = [
		'tests/final.s1-s7.surgical.audit-loop.test.ts',
		'tests/literary-narrative-review-n6.test.ts',
		'tests/narrative-quality-n1.test.ts',
		'tests/narrator-voice-n2.integration.test.ts',
		'tests/semantic-narrative-research-n3.test.ts',
		'tests/narrative-continuity-state-n4.test.ts',
		'tests/npc-cognition-n5.test.ts',
		'tests/narrative-novelty-n7.test.ts',
		'tests/narrative-pacing-n8.test.ts',
		'tests/narrative-provider-handoff-n9.test.ts',
		'tests/narrative-golden-regression-n10.test.ts',
		'tests/narrative-long-session-n11.test.ts',
		'tests/narrative-final-audit-n12.test.ts',
		'tests/integration-matrix.phase17.test.ts',
		'tests/turn-integration-harness.phase18.test.ts',
		'tests/verification-discipline.phase19.test.ts',
		'tests/orphan-connection-audit.phase20.test.ts',
		'tests/release-gate.phase21.test.ts',
		'tests/phase22-release-stabilization.test.ts',
		'tests/architecture-gap-closure.phase23.test.ts',
	];
	for (const relativePath of tests) mustExist(relativePath);
});

test('Phase 24 — current branch audit record is explicit about merge and manual-test boundaries', () => {
	const audit = source('docs/DREAMVILLE_SYSTEM_WIDE_PHASE_AUDIT_PHASE24.md');
	assert.match(audit, /branch-level verification/i);
	assert.match(audit, /Live third-party provider behavior/i);
	assert.match(audit, /Historical audit documents/i);
});
