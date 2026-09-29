import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { oocToolRegistry } from '../server/domain/oocToolRegistry';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { narrativeContinuityEngine } from '../server/domain/narrativeContinuityEngine';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

function seed() {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 's3_narration_context_ooc';
	repository.seedStory(storyId);
	const actorId = repository.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;
	return { repository, storyId, actorId };
}

test('S3 OOC boundary exposes canonical tools, enforces the active actor, and rejects malformed calls across eleven audit passes', async () => {
	const { repository, storyId, actorId } = seed();
	const impostorActorId = 'player_actor_not_canonical';

	for (let iteration = 1; iteration <= 11; iteration += 1) {
		const tools = oocToolRegistry.listTools();
		assert.ok(tools.some((tool) => tool.name === 'search_memory' && tool.mode === 'READ'), `Audit ${iteration}: canonical OOC memory read tool missing`);
		assert.ok(tools.some((tool) => tool.name === 'equip_item' && tool.mode === 'MUTATE'), `Audit ${iteration}: canonical OOC equip tool missing`);

		const unauthorized = await oocToolRegistry.execute(repository, {
			storyId,
			actorId: impostorActorId,
			call: { name: 'get_character_state' },
		});
		assert.equal(unauthorized.success, false, `Audit ${iteration}: non-canonical actor crossed OOC boundary`);

		const malformed = await oocToolRegistry.execute(repository, {
			storyId,
			actorId,
			call: { name: 'equip_item', arguments: { itemId: 'only-one-field' } },
		});
		assert.equal(malformed.success, false, `Audit ${iteration}: malformed mutation call did not fail closed`);

		const unknown = await oocToolRegistry.execute(repository, {
			storyId,
			actorId,
			call: { name: 'not_a_real_tool' },
		});
		assert.equal(unknown.success, false, `Audit ${iteration}: unknown OOC tool was accepted`);
	}
});

test('S3 OOC research strips private relationship internals and planner/evidence context', async () => {
	const { repository, storyId, actorId } = seed();
	const entity = repository.saveEntityCard(storyId, {
		id: 's3_known_npc',
		worldId: repository.getStoryRun(storyId)?.worldId || storyId,
		name: 'S3 Known NPC',
		kind: 'NPC',
		isTemplate: false,
		identity: { aliases: [] },
		classification: { tags: [] },
		personality: { traits: [], values: [], motivations: [], fears: [], desires: [] },
		behavior: { priorities: [], routines: [] },
		social: { factionIds: [], reputation: {}, relationships: {} },
		worldState: { isAlive: true, presence: 'present' },
		traits: [],
		capabilities: [],
		feats: [],
		equipment: [],
		memoryRefs: [],
		provenance: { source: 'S3_TEST', createdBy: 'SYSTEM' },
		lifecycle: { status: 'ACTIVE' },
		metadata: {},
	});
	assert.ok(entity && entity.id !== actorId, 'Test must create a non-player entity card');

	const agency = repository.getDynamicCharacterAgencyEngine(storyId);
	agency.setRelationship(storyId, {
		id: 's3_private_relationship',
		worldId: storyId,
		sourceId: actorId,
		targetId: entity.id,
		trust: 12,
		affection: 94,
		respect: 91,
		fear: 18,
		hostility: 87,
		activeCause: 'FALSE_INFORMATION',
		lastChangedAtSeconds: 1,
	});

	const rawResearch = narrativeContinuityEngine.research(
		repository,
		storyId,
		entity.name,
		actorId,
		{ persist: false },
	);
	assert.ok(rawResearch.relationships.length >= 1, 'Seeded relationship must exist in canonical narrative research');

	const result = await oocToolRegistry.execute(repository, {
		storyId,
		actorId,
		call: { name: 'research_context', arguments: { query: entity.name } },
	});
	assert.equal(result.success, true);
	const serialized = JSON.stringify(result.data);

	assert.doesNotMatch(serialized, /FALSE_INFORMATION/, 'OOC research leaked the canonical relationship cause');
	assert.doesNotMatch(serialized, /hiddenRelationshipSignals/, 'OOC research leaked narrator-only hidden relationship guidance');
	assert.doesNotMatch(serialized, /"trust":94/, 'OOC research leaked relationship metrics');
	assert.doesNotMatch(serialized, /"affection":94/, 'OOC research leaked relationship metrics');
	assert.doesNotMatch(serialized, /"hostility":87/, 'OOC research leaked relationship metrics');
	assert.doesNotMatch(serialized, /"plan":\{/,'OOC research leaked the internal narrative plan object');
	assert.doesNotMatch(serialized, /causalProvenance/, 'OOC research leaked internal causal provenance data');
});

test('S3 OOC combat read is actor-projected rather than a raw canonical export', async () => {
	const { repository, storyId, actorId } = seed();
	const result = await oocToolRegistry.execute(repository, {
		storyId,
		actorId,
		call: { name: 'get_combat_state' },
	});
	assert.equal(result.success, true);
	const serialized = JSON.stringify(result.data);
	assert.doesNotMatch(serialized, /rollCounter|seed/, 'OOC combat read exposed raw engine internals');
	assert.ok(result.data && typeof result.data === 'object', 'Actor-scoped combat projection must be returned');
});

test('S3 working context does not bypass epistemic knowledge with raw world-bible character/faction/timeline data', () => {
	const { repository, storyId } = seed();
	const run = repository.getStoryRun(storyId);
	assert.ok(run?.worldId, 'Seed Story Run must have a world');
	const world = repository.getWorldTemplate(run!.worldId);
	assert.ok(world, 'Seed Story Run must have a WorldTemplate');

	const mutatedWorld = {
		...world,
		characters: [{ name: 'PRIVATE_CHARACTER', description: 'DO_NOT_LEAK_PRIVATE_CHARACTER' }],
		factions: [{ name: 'PRIVATE_FACTION', description: 'DO_NOT_LEAK_PRIVATE_FACTION' }],
		timeline: [{ title: 'PRIVATE_EVENT', description: 'DO_NOT_LEAK_PRIVATE_EVENT' }],
	};
	repository.saveWorldTemplate(mutatedWorld);

	const context = WorkingContextEngine.assembleTurnContext({
		storyId,
		hardTokenBudget: 1800,
		worldRepo: repository,
		playerAction: 'Inspect the ancient archive and explain what is happening here.',
	});

	assert.doesNotMatch(context.assembledText, /PRIVATE_CHARACTER|DO_NOT_LEAK_PRIVATE_CHARACTER/);
	assert.doesNotMatch(context.assembledText, /PRIVATE_FACTION|DO_NOT_LEAK_PRIVATE_FACTION/);
	assert.doesNotMatch(context.assembledText, /PRIVATE_EVENT|DO_NOT_LEAK_PRIVATE_EVENT/);
	assert.match(context.assembledText, /Authorized world facts|World Bible Snapshot|World:/);
});

test('S3 narration/OOC source architecture remains singular and tool-mediated across eleven audit passes', () => {
	const routes = read('server/api/gameRoutes.ts');
	const registry = read('server/domain/oocToolRegistry.ts');
	const context = read('server/domain/workingContextEngine.ts');
	const continuity = read('server/domain/narrativeContinuityEngine.ts');
	const orchestrator = read('server/domain/aiOrchestrator.ts');

	for (let iteration = 1; iteration <= 11; iteration += 1) {
		assert.match(routes, /Canonical OOC Tool Registry/, `Audit ${iteration}: OOC tool registry is not supplied to the OOC context`);
		assert.match(routes, /oocToolRegistry\.listTools\(\)/, `Audit ${iteration}: OOC endpoint does not bind to canonical tool definitions`);
		assert.match(routes, /MUTATE tools may be used only when the player explicitly requests/, `Audit ${iteration}: OOC mutation-intent contract is missing`);
		assert.match(routes, /Only use the exact canonical OOC tools listed/, `Audit ${iteration}: OOC cannot be instructed to invent tools`);

		assert.match(registry, /canonical active player actor/, `Audit ${iteration}: OOC registry actor boundary is missing`);
		assert.match(registry, /validateToolArguments/, `Audit ${iteration}: OOC registry argument validation is missing`);
		assert.match(registry, /getPlayerFacingGuidance/, `Audit ${iteration}: OOC relationship projection is not player-facing`);
		assert.match(registry, /projectCombatForActor/, `Audit ${iteration}: OOC combat read is not actor-projected`);

		assert.match(context, /Authorized world facts/, `Audit ${iteration}: working context is missing authorized world-lore projection`);
		assert.doesNotMatch(context, /Named world characters:/, `Audit ${iteration}: raw world character bible projection remains`);
		assert.doesNotMatch(context, /Factions:/, `Audit ${iteration}: raw faction bible projection remains`);
		assert.doesNotMatch(context, /Timeline:/, `Audit ${iteration}: raw timeline bible projection remains`);

		assert.match(continuity, /getAuthorizedKnowledgeFacts/, `Audit ${iteration}: narrative continuity does not use authorized knowledge projection`);
		assert.match(orchestrator, /narrativeContinuityEngine\.research/, `Audit ${iteration}: narration is disconnected from continuity research`);
		assert.match(orchestrator, /WorkingContextEngine\.assembleTurnContext/, `Audit ${iteration}: narration is disconnected from the singular working-context authority`);
		assert.doesNotMatch(orchestrator, /new .*NarrationContextEngine/, `Audit ${iteration}: duplicate narration context authority was introduced`);
	}
});
