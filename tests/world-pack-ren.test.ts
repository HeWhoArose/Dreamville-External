import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { applyWorldPack, loadWorldPack, validateWorldPack } from '../server/domain/worldPack';

const PACK = 'data/worlds/ren_crimson_eye.pack.json';

test('the Ren world pack passes its completeness checks', () => {
	assert.deepEqual(validateWorldPack(loadWorldPack(PACK)), []);
});

test('completeness checks catch an unreachable location, an unlearnable fact and a knowledge-less NPC', () => {
	const pack = loadWorldPack(PACK);
	pack.locations.push({ id: 'loc_island', name: 'Island', region: 'r', archetype: 'URBAN_DISTRICT', description: 'Alone.' });
	pack.facts.push({ id: 'fact_orphan', statement: 's', subject: 'x', predicate: 'p', object: 'o', knownAtStart: false });
	pack.npcs[0].knows = [];
	const problems = validateWorldPack(pack).join(' | ');
	assert.match(problems, /location "loc_island" is unreachable/);
	assert.match(problems, /fact "fact_orphan" cannot be learned/);
	assert.match(problems, /npc "npc_mei_sato" knows nothing/);
});

test('applying the pack builds the world: map, people, clues, knowledge, kit and the incident', async () => {
	const pack = loadWorldPack(PACK);
	const repo = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'pack_ren_apply';
	const { preparation } = await applyWorldPack(repo, storyId, pack);
	assert.equal(preparation, 'PREPARED');

	const graph = repo.getGeographyGraph(storyId);
	for (const location of pack.locations) assert.ok(graph.getNode(location.id), `${location.id} exists`);
	assert.equal(repo.getPlayerLifecycle(storyId)!.locationId, 'loc_crimson_eye_office');

	for (const npc of pack.npcs) {
		const card = repo.getEntityCard(storyId, npc.id);
		assert.ok(card, `${npc.id} exists`);
		assert.equal(card!.worldState.locationId, npc.locationId);
	}
	const docks = graph.getNode('loc_warehouse_docks')!;
	assert.ok(docks.sceneObjects.some((o: any) => o.id === 'clue_tyre_tracks'), 'authored clue is placed');
	assert.ok(docks.sceneObjects.length > pack.clues.filter((c) => c.locationId === 'loc_warehouse_docks').length, 'incident evidence was also prepared');

	const playerActor = repo.getPlayerLifecycle(storyId)!.actorId;
	const known = repo.getAuthorizedKnowledgeFacts(storyId, playerActor).map((f: any) => f.id);
	assert.ok(known.includes('fact_victim') && known.includes('fact_casing_38'), 'briefing facts are known at the start');
	assert.ok(!known.includes('fact_lang_killed_pendelton'), 'the solution is not handed to the player');

	const engine = repo.getInventoryEngine(storyId);
	const inventory = engine.getActorInventory(playerActor).map((i: any) => String(i.customName || engine.getItemDefinition(i.defId)?.name || ""));
	assert.ok(inventory.includes('Leather notebook'));
	assert.ok(!inventory.some((name: string) => /sword|cuirass|astrolabe/i.test(String(name))), 'no fantasy gear');
});

test('the facts that answer the player\'s question survive research selection and epistemic masking, while the solution stays hidden', async () => {
	const { CurrentSituationBuilder } = await import('../server/domain/currentSituation');
	const { NarrativeResearchPipeline } = await import('../server/domain/narrativeResearchPipeline');
	const { EpistemicBoundaryEnforcer } = await import('../server/domain/epistemicBoundary');
	const repo = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'pack_ren_research';
	await applyWorldPack(repo, storyId, loadWorldPack(PACK));
	const actor = repo.getPlayerLifecycle(storyId)!.actorId;
	const action = 'Where exactly was he found?';
	const situation: any = CurrentSituationBuilder.build({ storyId, viewerActorId: actor, playerAction: action, worldRepo: repo } as any);
	const research: any = NarrativeResearchPipeline.research({ repository: repo, storyId, currentSituation: situation, playerAction: action, viewerActorId: actor } as any);
	const safe = EpistemicBoundaryEnforcer.sanitizeResearch(research, situation).result.promptContext;
	assert.match(safe, /Pier 4/, 'the known answer must reach the narrator');
	assert.doesNotMatch(safe, /Victor Lang/, 'the hidden solution must not');
	assert.doesNotMatch(safe, /10:45/, 'hidden forensic findings must not');
});

test('an NPC authored to know the casing is not flagged as leaking it', async () => {
	const { CharacterCanonSteward } = await import('../server/domain/characterCanonSteward');
	const repo = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'pack_ren_leak_audit';
	await applyWorldPack(repo, storyId, loadWorldPack(PACK));
	const audit = (speakerId: string, speakerName: string) => CharacterCanonSteward.auditSpeakerDialogue({
		storyId, speakerId, speakerName, currentLocationId: 'loc_crimson_eye_office',
		dialogueText: 'A spent .38 bullet casing was lying beside the body.',
	});
	assert.equal(audit('npc_mei_sato', 'Mei Sato').valid, true, 'Mei is authored to know the casing');
	assert.equal(audit('npc_hollis_brandt', 'Hollis Brandt').valid, false, 'the bar owner never saw the scene and must still be flagged');
});
