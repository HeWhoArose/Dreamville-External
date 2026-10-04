import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const productionRoot = join(repoRoot, 'server');

async function listSourceFiles(directory: string): Promise<string[]> {
	const entries = await fs.readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const absolute = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...await listSourceFiles(absolute));
			continue;
		}
		if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
			files.push(absolute);
		}
	}
	return files;
}

// Explicit, documented allowlist of production files that may reference the
// legacy NpcAutonomyEngine. Any reference outside this set fails the guard.
// See docs/P0_NPC_AUTHORITY_AUDIT.md for the full authority analysis.
const ALLOWED_LEGACY_REFERENCES = new Set([
	// Advisory-only utility projection: builds a transient NpcAgentState from the
	// canonical DynamicCharacterAgencyEngine and attaches its utility ranking to
	// the AI tactics prompt as `npcAutonomy` metadata. It never persists
	// NpcAgentState and never issues a canonical NPC decision.
	join(productionRoot, 'domain', 'combatTacticsService.ts'),
	// Dormant decision utility retained for phase-11 epistemic-decision tests.
	// Unreachable from the canonical command flow: production never writes
	// phase8 runtimeState.npcs and never emits NPC_DECISION_REQUESTED.
	join(productionRoot, 'domain', 'phase8SimulationEngine.ts'),
]);

describe('P0 — NPC authority hardening', () => {
	it('prevents the legacy NpcAutonomyEngine from becoming a production authority', async () => {
		const sourceFiles = await listSourceFiles(productionRoot);
		const legacyPath = join(productionRoot, 'domain', 'npcAutonomyEngine.ts');

		// Guard-the-guard: the scanner must actually find production sources.
		// (A previous regex bug scanned zero files and passed vacuously.)
		assert.ok(sourceFiles.length > 100, `Authority guard scanned only ${sourceFiles.length} production files; scanner is broken.`);
		assert.ok(sourceFiles.includes(legacyPath), 'Guard must be able to see the legacy engine file itself.');

		const productionReferences: string[] = [];

		for (const file of sourceFiles) {
			if (file === legacyPath) continue;
			const source = await fs.readFile(file, 'utf8');
			if (/NpcAutonomyEngine|npcAutonomyEngine/i.test(source)) {
				productionReferences.push(relative(repoRoot, file));
			}
		}

		const unexpected = productionReferences.filter((file) => !ALLOWED_LEGACY_REFERENCES.has(join(productionRoot, file.replace(/^server[\\/]/, 'server/').replace('server/', ''))) && !ALLOWED_LEGACY_REFERENCES.has(file) && !ALLOWED_LEGACY_REFERENCES.has(join(repoRoot, file)));
		assert.deepEqual(unexpected, [], 'Legacy NpcAutonomyEngine must not gain new production references outside the documented allowlist.');

		// The advisory projection in combatTacticsService must remain non-authoritative:
		// it may derive prompt metadata from canonical agency, but must never persist
		// NpcAgentState or persist through the autonomy engine.
		const tacticsSource = await fs.readFile(join(productionRoot, 'domain', 'combatTacticsService.ts'), 'utf8');
		assert.doesNotMatch(tacticsSource, /saveStoryRun|persist.*[Aa]utonomy|autonomy.*persist/i, 'combatTacticsService must not persist autonomy state.');
	});

	it('keeps DynamicCharacterAgencyEngine as the live NPC authority path', async () => {
		const [repository, planningSlice, narrativeDirector] = await Promise.all([
			fs.readFile(join(productionRoot, 'repositories', 'worldRepository.ts'), 'utf8'),
			fs.readFile(join(productionRoot, 'domain', 'npcPlanningSlice.ts'), 'utf8'),
			fs.readFile(join(productionRoot, 'domain', 'narrativeDirector.ts'), 'utf8'),
		]);

		assert.match(repository, /DynamicCharacterAgencyEngine/);
		assert.match(repository, /getDynamicCharacterAgencyEngine/);
		assert.match(planningSlice, /getDynamicCharacterAgencyEngine/);
		assert.match(narrativeDirector, /getDynamicCharacterAgencyEngine/);
		assert.match(narrativeDirector, /buildNpcPlanningSlice/);
	});

	it('keeps phase8 NPC autonomy unreachable from the canonical command flow', async () => {
		const [commandEngine, phase8Engine] = await Promise.all([
			fs.readFile(join(productionRoot, 'domain', 'canonicalCommandEngine.ts'), 'utf8'),
			fs.readFile(join(productionRoot, 'domain', 'phase8SimulationEngine.ts'), 'utf8'),
		]);

		// No production emitter for the decision-requested event: the only canonical
		// event type pushed into phase8 processCanonicalEvent is CANONICAL_COMMAND.
		assert.doesNotMatch(commandEngine, /NPC_DECISION_REQUESTED/, 'Canonical command engine must not trigger legacy autonomy decisions.');

		// Production never seeds phase8 NPC agent state (tests inject it manually).
		const writerMatches = phase8Engine.match(/npcs\[[^\]]+\]\s*=/g) || [];
		assert.deepEqual(writerMatches, [], 'Production must not write phase8 NpcAgentState; the store is test-injected only.');
	});
});
