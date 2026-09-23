import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { Phase8SimulationEngine } from '../server/domain/phase8SimulationEngine';

describe('Phase 8 cross-system canonical integration', () => {
	it('persists facility, knowledge, mission, causality and relationship state in StoryRun runtime state', () => {
		const repository = new InMemoryWorldRepository({ disablePersistence: true });
		const storyId = 'default_story';
		const engine = new Phase8SimulationEngine();
		const state = engine.load(repository, storyId);
		state.facilities.vault = engine.facility.createState('vault');
		engine.facility.addNode(state.facilities.vault, { id: 'room', kind: 'ROOM', name: 'Vault', hidden: false, state: {} });
		engine.facility.addDevice(state.facilities.vault, { id: 'camera22', kind: 'CAMERA', nodeId: 'room', hidden: true, active: true, difficulty: 80, state: {} });
		state.knowledge.player = engine.knowledge.createState('player');
		state.situations.ruin = engine.situation.create({ id: 'ruin', storyId, title: 'Ruin', publicObjectives: [], hiddenObjectives: [], participants: [], preconditions: [], outcomes: [], npcGoalIds: [], environmentState: {}, secretFactIds: [], consequenceTags: [] });
		engine.causal.upsertNode(state.causal, { id: 'player', kind: 'ACTOR', label: 'player', metadata: {} });
		engine.causal.upsertNode(state.causal, { id: 'data', kind: 'DATA', label: 'data', metadata: {} });
		engine.consequence.upsertRelationship(state.consequences, { sourceId: 'npc', targetId: 'player', trust: 0, affinity: 0, fear: 0, respect: 0, hostility: 0, history: [] });
		engine.save(repository, storyId, state);

		const restored = engine.load(repository, storyId);
		assert.equal(restored.facilities.vault.devices.camera22.hidden, true);
		assert.equal(restored.situations.ruin.title, 'Ruin');
		assert.ok(restored.causal.nodes.data);
		assert.ok(restored.consequences.relationships['npc::player']);
	});

	it('failed facility discovery does not alter canonical hidden state', () => {
		const repository = new InMemoryWorldRepository({ disablePersistence: true });
		const engine = new Phase8SimulationEngine();
		const state = engine.load(repository, 'default_story');
		state.facilities.facility = engine.facility.createState('facility');
		engine.facility.addNode(state.facilities.facility, { id: 'room', kind: 'ROOM', name: 'Room', hidden: false, state: {} });
		engine.facility.addDevice(state.facilities.facility, { id: 'hidden_camera', kind: 'CAMERA', nodeId: 'room', hidden: true, active: true, difficulty: 90, state: {} });
		const result = engine.facility.searchNode(state.facilities.facility, 'room', 10);
		assert.deepEqual(result.foundDeviceIds, []);
		assert.equal(state.facilities.facility.devices.hidden_camera.hidden, true);
	});
});
