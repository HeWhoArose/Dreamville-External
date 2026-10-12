import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

function read(relativePath) {
	return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireText(relativePath, pattern, label) {
	const source = read(relativePath);
	if (!pattern.test(source)) {
		throw new Error(`Verification contract failed: ${label} (${relativePath})`);
	}
}

const packageJson = JSON.parse(read('package.json'));
for (const script of ['lint', 'test', 'build']) {
	if (!packageJson.scripts?.[script]) {
		throw new Error(`Missing required release script: npm run ${script}`);
	}
}

const requiredFiles = [
	'docs/DREAMVILLE_DEEP_IMPLEMENTATION_SPECIFICATION.md',
	'docs/DREAMVILLE_RELEASE_STABILIZATION_PHASE22.md',
	'docs/DREAMVILLE_INTEGRATION_MATRIX_PHASE17.md',
	'server/domain/currentSituation.ts',
	'server/domain/playerIntentInterpreter.ts',
	'server/domain/narrativeResearchPipeline.ts',
	'server/domain/narrativeDirector.ts',
	'server/domain/semanticNarrativeReview.ts',
	'server/domain/narrativeStateAdjudicator.ts',
	'server/domain/narrativeMemoryLifecycle.ts',
	'server/domain/entitySceneRelevance.ts',
	'server/domain/epistemicBoundary.ts',
	'server/domain/visualSceneContext.ts',
	'server/domain/turnIntegrationHarness.ts',
	'server/services/comicSceneGenerator.ts',
	'server/services/mediaAdapterService.ts',
	'server/api/gameRoutes.ts',
	'src/components/StoryView.tsx',
	'src/services/apiClient.ts',
	'tests/phase22-release-stabilization.test.ts',
	'tests/system-wide-phase-audit.phase24.test.ts',
	'tests/story-beat-director.test.ts',
	'docs/DREAMVILLE_SYSTEM_WIDE_PHASE_AUDIT_PHASE24.md',
];

for (const file of requiredFiles) {
	if (!fs.existsSync(path.join(root, file))) {
		throw new Error(`Missing release-critical file: ${file}`);
	}
}

requireText(
	'server/api/gameRoutes.ts',
	/buildVisualSceneContext\([\s\S]*buildComicScenePromptFromVisualContext\(/,
	'Phase 16 visual route must consume canonical visual context',
);
requireText(
	'server/api/gameRoutes.ts',
	/assertVisualSceneFreshness\(/,
	'Phase 16 route must fail closed on stale visual context',
);
requireText(
	'src/components/StoryView.tsx',
	/sceneSourceActionId/,
	'Phase 16 UI must track visual source action',
);
requireText(
	'server/domain/turnIntegrationHarness.ts',
	/PlayerIntentInterpreter\.deterministic[\s\S]*NarrativeResearchPipeline\.research[\s\S]*NarrativeDirector\.create[\s\S]*SemanticNarrativeReview\.review[\s\S]*NarrativeStateAdjudicator\.adjudicate[\s\S]*NarrativeContinuityEngine\.recordTurn/,
	'Phase 18 harness must contain the full narrative dependency chain',
);
requireText(
	'docs/DREAMVILLE_INTEGRATION_MATRIX_PHASE17.md',
	/PLAYER INPUT.*PlayerIntent.*CurrentSituation.*NarrativeResearch.*NarrativePlan/s,
	'Phase 17 matrix must contain the canonical chain',
);
requireText(
	'docs/DREAMVILLE_INTEGRATION_MATRIX_PHASE17.md',
	/CurrentSituation \+ latest committed ActionLog.*VisualSceneContext.*MediaAdapterService/s,
	'Phase 17 matrix must contain the visual chain',
);

console.log('Dreamville release contract verification: PASS');

// Phase D2 (GAP-7/S-7): golden-set narrative judge eval.
// Printed as a NON-BLOCKING warning until the D3 human calibration pass promotes
// it. Set DREAMVILLE_JUDGE_BLOCKING=1 to enforce the thresholds now.
const judgeBlocking = process.env.DREAMVILLE_JUDGE_BLOCKING === '1';
try {
	const tsxBin = path.join(root, 'node_modules', '.bin', 'tsx');
	const judgeArgs = ['scripts/narrative-judge-eval.mjs'];
	if (judgeBlocking) judgeArgs.push('--blocking');
	const judge = spawnSync(tsxBin, judgeArgs, { cwd: root, encoding: 'utf8', timeout: 120000 });
	console.log('\n--- Narrative judge eval (golden set) ---');
	if (judge.stdout) process.stdout.write(judge.stdout);
	if (judge.stderr) process.stdout.write(judge.stderr);
	if (judge.error) {
		console.log('Narrative judge eval could not run (non-blocking): ' + judge.error.message);
	} else if (judge.status !== 0) {
		const label = judgeBlocking ? 'FAILED' : 'reported below-threshold fixtures (non-blocking)';
		console.log('Narrative judge eval ' + label + '.');
		if (judgeBlocking) throw new Error('Narrative judge eval gate failed (DREAMVILLE_JUDGE_BLOCKING=1).');
	}
} catch (judgeError) {
	if (judgeBlocking) throw judgeError;
	console.log('Narrative judge eval skipped (non-blocking): ' + (judgeError && judgeError.message ? judgeError.message : String(judgeError)));
}
