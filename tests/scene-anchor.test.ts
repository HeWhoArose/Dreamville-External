import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { applyWorldPack, loadWorldPack } from '../server/domain/worldPack';

/**
 * Live runs logged 14 spurious "no distinctive lexical anchor for canonical location" failures: a reply that names the person
 * present in the scene ("Mei") could not anchor, because character names were matched on 5+ letter words.
 */
async function setup() {
	const repo = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'scene_anchor_story';
	await applyWorldPack(repo, storyId, loadWorldPack('data/worlds/ren_crimson_eye.pack.json'));
	return { repo, storyId, orchestrator: new MultiModelOrchestrator() as any };
}

test('a reply that names a short-named character in the scene is anchored', async () => {
	const { repo, storyId, orchestrator } = await setup();
	const result = orchestrator.validateNarrativeSceneContinuity('Mei taps her pen. "Silas found him," she says.', repo, storyId);
	assert.equal(result.valid, true, result.errorReason);
});

test('a reply that names the location is anchored', async () => {
	const { repo, storyId, orchestrator } = await setup();
	assert.equal(orchestrator.validateNarrativeSceneContinuity('Inside the Crimson Eye Agency Office, the kettle never quite boils.', repo, storyId).valid, true);
});

test('a reply with no anchor to the scene at all is still rejected', async () => {
	const { repo, storyId, orchestrator } = await setup();
	const result = orchestrator.validateNarrativeSceneContinuity('A dragon circles the burning citadel as thunder rolls across the plains.', repo, storyId);
	assert.equal(result.valid, false);
	assert.match(result.errorReason || '', /no distinctive lexical anchor/);
});
