import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { CustomRuleEngine } from '../server/domain/customRuleEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import type { CustomRuleDefinition } from '../src/types';

function makeRule(overrides: Partial<CustomRuleDefinition> = {}): CustomRuleDefinition {
	return {
		id: 'rule_test',
		name: 'Test Rule',
		version: 1,
		enabled: true,
		priority: 0,
		scope: 'EVENT',
		trigger: { event: 'TECHNIQUE_EXPLAINED' },
		conditions: [],
		effects: [{ type: 'INCREMENT_RULE_STATE', key: 'count', amount: 1 }],
		provenance: 'WORLD_CANON',
		...overrides,
	};
}

function createRepository(): InMemoryWorldRepository {
	return new InMemoryWorldRepository({ disablePersistence: true });
}

describe('Phase 8.6 - Custom Rule Engine', () => {
	it('evaluates deterministic triggers and priority order', async () => {
		const repository = createRepository();
		const world = repository.getWorldTemplate('world_solar_archive');
		repository.saveWorldTemplate({
			...world,
			customRules: [
				makeRule({ id: 'low', priority: 1 }),
				makeRule({
					id: 'high',
					priority: 10,
					effects: [{ type: 'INCREMENT_RULE_STATE', key: 'count', amount: 2 }],
				}),
			],
		});
		const run = repository.getStoryRun('default_story');
		if (!run) throw new Error('Default story run missing.');
		run.worldId = 'world_solar_archive';
		repository.saveStoryRun(run);

		const engine = new CustomRuleEngine();
		const result = await engine.evaluate({
			repository,
			event: {
				eventId: 'evt_priority',
				storyId: 'default_story',
				type: 'TECHNIQUE_EXPLAINED',
				timestampSeconds: 1,
			},
		});

		assert.equal(result.success, true);
		assert.deepEqual(result.matchedRuleIds, ['high', 'low']);
		assert.equal(engine.getState(repository, 'default_story').counters.count, 3);
	});

	it('evaluates event and world-fact conditions', async () => {
		const repository = createRepository();
		repository.saveWorldFact('default_story', {
			factId: 'fact_secret',
			statement: 'warden knows the secret',
			subjectEntityId: 'warden',
			predicate: 'knows_secret',
			objectValue: 'true',
			truthState: 'TRUE',
			confidence: 1,
			acquiredAtTimestamp: repository.getWorldClock('default_story').getTimestamp(),
		});
		const world = repository.getWorldTemplate('world_solar_archive');
		repository.saveWorldTemplate({
			...world,
			customRules: [makeRule({
				conditions: [
					{ source: 'EVENT', path: 'payload.accepted', operator: 'EQ', value: true },
					{ source: 'WORLD_FACT', path: 'fact_secret', operator: 'TRUTHY' },
				],
			})],
		});
		const run = repository.getStoryRun('default_story');
		if (!run) throw new Error('Default story run missing.');
		run.worldId = 'world_solar_archive';
		repository.saveStoryRun(run);

		const engine = new CustomRuleEngine();
		const result = await engine.evaluate({
			repository,
			event: {
				eventId: 'evt_fact',
				storyId: 'default_story',
				type: 'TECHNIQUE_EXPLAINED',
				payload: { accepted: true },
				timestampSeconds: 2,
			},
		});

		assert.deepEqual(result.appliedRuleIds, ['rule_test']);
	});

	it('suppresses duplicate event evaluation', async () => {
		const repository = createRepository();
		const world = repository.getWorldTemplate('world_solar_archive');
		repository.saveWorldTemplate({ ...world, customRules: [makeRule()] });
		const run = repository.getStoryRun('default_story');
		if (!run) throw new Error('Default story run missing.');
		run.worldId = 'world_solar_archive';
		repository.saveStoryRun(run);

		const engine = new CustomRuleEngine();
		await engine.evaluate({
			repository,
			event: { eventId: 'evt_dup', storyId: 'default_story', type: 'TECHNIQUE_EXPLAINED', timestampSeconds: 1 },
		});
		const result = await engine.evaluate({
			repository,
			event: { eventId: 'evt_dup', storyId: 'default_story', type: 'TECHNIQUE_EXPLAINED', timestampSeconds: 2 },
		});

		assert.equal(result.success, true);
		assert.equal(engine.getState(repository, 'default_story').counters.count, 1);
	});

	it('rolls back canonical state when an effect fails', async () => {
		const repository = createRepository();
		const world = repository.getWorldTemplate('world_solar_archive');
		repository.saveWorldTemplate({
			...world,
			customRules: [makeRule({
				effects: [
					{ type: 'INCREMENT_RULE_STATE', key: 'count', amount: 1 },
					{ type: 'APPLY_CONDITION', target: 'EVENT_ACTOR', conditionDefinitionId: 'missing_condition' },
				],
			})],
		});
		const run = repository.getStoryRun('default_story');
		if (!run) throw new Error('Default story run missing.');
		run.worldId = 'world_solar_archive';
		repository.saveStoryRun(run);

		const before = JSON.stringify(repository.getWorldFacts('default_story'));
		const engine = new CustomRuleEngine();
		const result = await engine.evaluate({
			repository,
			event: {
				eventId: 'evt_rollback',
				storyId: 'default_story',
				type: 'TECHNIQUE_EXPLAINED',
				actorId: 'player_actor_default_story',
				timestampSeconds: 3,
			},
		});

		assert.equal(result.success, false);
		assert.equal(engine.getState(repository, 'default_story').counters.count, undefined);
		assert.equal(JSON.stringify(repository.getWorldFacts('default_story')), before);
	});

	it('rejects excessive effect complexity', () => {
		const engine = new CustomRuleEngine();
		const result = engine.validateRules([makeRule({
			effects: Array.from({ length: 33 }, (_, index) => ({
				type: 'SET_RULE_STATE',
				key: 'key_' + index,
				value: true,
			})),
		})]);
		assert.equal(result.success, false);
		assert.match(result.errors[0], /at most 32 effects/i);
	});

	it('restores persisted rule state from the Story Run runtime state', async () => {
		const repository = createRepository();
		const world = repository.getWorldTemplate('world_solar_archive');
		repository.saveWorldTemplate({ ...world, customRules: [makeRule()] });
		const run = repository.getStoryRun('default_story');
		if (!run) throw new Error('Default story run missing.');
		run.worldId = 'world_solar_archive';
		repository.saveStoryRun(run);

		const engine = new CustomRuleEngine();
		await engine.evaluate({
			repository,
			event: { eventId: 'evt_persist', storyId: 'default_story', type: 'TECHNIQUE_EXPLAINED', timestampSeconds: 10 },
		});

		const restoredEngine = new CustomRuleEngine();
		assert.equal(restoredEngine.getState(repository, 'default_story').counters.count, 1);
	});
	it('routes relationship and knowledge conditions through Phase 8 state', async () => {
		const repository = createRepository();
		const engine = new CustomRuleEngine();
		const phase8 = new (await import('../server/domain/phase8SimulationEngine')).Phase8SimulationEngine();
		const state = phase8.load(repository, 'default_story');
		state.knowledge.player = phase8.knowledge.createState('player');
		state.knowledge.player.facts.secret = {
			id: 'secret',
			subjectEntityId: 'warden',
			predicate: 'knows_secret',
			objectValue: 'true',
			status: 'KNOWN',
			confidence: 1,
			sourceEvidenceIds: ['evidence'],
			acquiredAtSeconds: 1,
		};
		state.consequences.relationships['player::warden'] = {
			sourceId: 'player', targetId: 'warden', trust: 80, affinity: 0, fear: 0, respect: 0, hostility: 0, history: [],
		};
		phase8.save(repository, 'default_story', state);
		const world = repository.getWorldTemplate('world_solar_archive');
		repository.saveWorldTemplate({
			...world,
			customRules: [makeRule({
				conditions: [
					{ source: 'KNOWLEDGE', path: 'secret', operator: 'TRUTHY' },
					{ source: 'RELATIONSHIP', path: 'trust', operator: 'GTE', value: 75 },
				],
				effects: [{ type: 'SET_RULE_STATE', key: 'validated', value: true }],
			})],
		});
		const run = repository.getStoryRun('default_story');
		if (!run) throw new Error('Default story run missing.');
		run.worldId = 'world_solar_archive';
		repository.saveStoryRun(run);
		const result = await engine.evaluate({
			repository,
			event: { eventId: 'evt_phase8_conditions', storyId: 'default_story', type: 'TECHNIQUE_EXPLAINED', actorId: 'player', targetId: 'warden', timestampSeconds: 2 },
		});
		assert.deepEqual(result.appliedRuleIds, ['rule_test']);
		assert.equal(engine.getState(repository, 'default_story').values.validated, true);
	});

	it('routes mission, evidence, relationship and knowledge rule effects', async () => {
		const repository = createRepository();
		const world = repository.getWorldTemplate('world_solar_archive');
		repository.saveWorldTemplate({
			...world,
			customRules: [makeRule({
				effects: [
					{ type: 'CREATE_MISSION', situationId: 'mission_rule', title: 'Rule Mission' },
					{ type: 'CREATE_EVIDENCE', evidenceId: 'evidence_rule', subjectEntityId: 'player', summary: 'Rule evidence', provenance: 'rule' },
					{ type: 'CHANGE_RELATIONSHIP', actorId: 'player', targetId: 'warden', trustDelta: 10, evidenceIds: ['evidence_rule'] },
					{ type: 'ADD_KNOWLEDGE', actorId: 'player', factId: 'secret_rule', evidenceId: 'evidence_rule' },
				],
			})],
		});
		const run = repository.getStoryRun('default_story');
		if (!run) throw new Error('Default story run missing.');
		run.worldId = 'world_solar_archive';
		repository.saveStoryRun(run);
		const result = await new CustomRuleEngine().evaluate({
			repository,
			event: { eventId: 'evt_phase8_effects', storyId: 'default_story', type: 'TECHNIQUE_EXPLAINED', actorId: 'player', timestampSeconds: 3 },
		});
		assert.equal(result.success, true);
		const state = new (await import('../server/domain/phase8SimulationEngine')).Phase8SimulationEngine().load(repository, 'default_story');
		assert.equal(state.situations.mission_rule.title, 'Rule Mission');
		assert.equal(state.evidence.evidence_rule.summary, 'Rule evidence');
		assert.equal(state.consequences.relationships['player::warden'].trust, 10);
		assert.equal(state.knowledge.player.facts.secret_rule.status, 'KNOWN');
	});

});
