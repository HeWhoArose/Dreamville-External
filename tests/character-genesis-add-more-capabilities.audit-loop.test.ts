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

	assert.match(view, /id="btn-add-more-capabilities"/);
	assert.match(view, /onClick={handleSuggestAdditionalCapabilities}/);
	assert.match(view, /<span>Add More</span>/);
	assert.match(view, /additionalCapabilitySuggestions.slice(0, 4)/);
	assert.match(view, /handleAcceptAdditionalCapability/);
	assert.match(view, /handleAcceptAllAdditionalCapabilities/);
	assert.match(view, /markFieldEdited('capabilities')/);
	assert.match(view, /markFieldEdited('generatedSkills')/);

	assert.match(client, /suggestAdditionalCharacterCapabilities/);
	assert.match(client, /additional-capabilities/);

	assert.match(route, /post('/worlds/:worldId/characters/additional-capabilities'/);
	assert.match(route, /suggestAdditionalCapabilities/);

	assert.match(service, /public async suggestAdditionalCapabilities/);
	assert.match(service, /Math.min(Number(input.desiredCount) || 4, 4)/);
	assert.match(service, /'character.capability.propose'/);
	assert.match(service, /maxTokens: 4200/);
});
