import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const viewPath = path.join(repoRoot, 'src/components/characterGenesis/CharacterGenesisView.tsx');
const clientPath = path.join(repoRoot, 'src/services/apiClient.ts');
const routePath = path.join(repoRoot, 'server/api/gameRoutes.ts');
const servicePath = path.join(repoRoot, 'server/services/characterGenesisService.ts');

test('Character Genesis Add More capabilities wiring remains connected end-to-end', () => {
	const view = fs.readFileSync(viewPath, 'utf8');
	const client = fs.readFileSync(clientPath, 'utf8');
	const route = fs.readFileSync(routePath, 'utf8');
	const service = fs.readFileSync(servicePath, 'utf8');

	assert.ok(view.includes('id="btn-add-more-capabilities"'));
	assert.ok(view.includes('onClick={handleSuggestAdditionalCapabilities}'));
	assert.ok(view.includes('<span>Add More</span>'));
	assert.ok(view.includes('res?.capabilities) ? res.capabilities.slice(0, 4) : []'));
	assert.ok(view.includes('handleAcceptAdditionalCapability'));
	assert.ok(view.includes('handleAcceptAllAdditionalCapabilities'));
	assert.ok(view.includes("markFieldEdited('capabilities')"));
	assert.ok(view.includes("markFieldEdited('generatedSkills')"));

	assert.ok(client.includes('suggestAdditionalCharacterCapabilities'));
	assert.ok(client.includes('additional-capabilities'));

	assert.ok(route.includes("post('/worlds/:worldId/characters/additional-capabilities'"));
	assert.ok(route.includes('suggestAdditionalCapabilities'));

	assert.ok(service.includes('public async suggestAdditionalCapabilities'));
	assert.ok(service.includes('Math.min(Number(input.desiredCount) || 4, 4)'));
	assert.ok(service.includes("'character.capability.propose'"));
	assert.ok(service.includes('maxTokens: 4200'));
});

// CI verification branch only.
