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
		if (entry.isFile() && /\\.(ts|tsx)$/.test(entry.name)) {
			files.push(absolute);
		}
	}
	return files;
}

describe('P0 — NPC authority hardening', () => {
	it('prevents the legacy NpcAutonomyEngine from becoming a production authority', async () => {
		const sourceFiles = await listSourceFiles(productionRoot);
		const legacyPath = join(productionRoot, 'domain', 'npcAutonomyEngine.ts');
		const productionReferences: string[] = [];

		for (const file of sourceFiles) {
			if (file === legacyPath) continue;
			const source = await fs.readFile(file, 'utf8');
			if (/NpcAutonomyEngine|npcAutonomyEngine/i.test(source)) {
				productionReferences.push(relative(repoRoot, file));
			}
		}

		assert.deepEqual(productionReferences, [], 'Legacy NpcAutonomyEngine must remain disconnected from production source.');
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
});
