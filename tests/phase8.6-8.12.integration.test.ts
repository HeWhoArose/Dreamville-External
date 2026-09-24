import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { FacilitySimulationEngine } from '../server/domain/facilitySimulationEngine';
import { NpcAutonomyEngine } from '../server/domain/npcAutonomyEngine';
import { SituationEngine } from '../server/domain/situationEngine';
import { KnowledgeEngine } from '../server/domain/knowledgeEngine';
import { CausalProvenanceGraph } from '../server/domain/causalProvenanceGraph';
import { ConsequenceEngine } from '../server/domain/consequenceEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

describe('Phase 8.6-8.12 regression and fallback contracts', () => {
	it('preserves hidden facility state after a failed search', () => {
		const e = new FacilitySimulationEngine(); const s=e.createState('vault');
		e.addNode(s,{id:'room',kind:'ROOM',name:'Room',hidden:false,state:{}});
		e.addDevice(s,{id:'camera22',kind:'CAMERA',nodeId:'room',hidden:true,active:true,difficulty:80,state:{}});
		assert.deepEqual(e.searchNode(s,'room',20).foundDeviceIds,[]);
		assert.equal(s.devices.camera22.active,true);
	});
	it('derives NPC decisions from state rather than turn scripts', () => {
		const e=new NpcAutonomyEngine(); const s=e.createState('npc'); s.deception=90; s.goals=[{id:'g',description:'Get artifact',priority:80,visibility:'PRIVATE',active:true}];
		const d=e.decide(s,{actorId:'npc',availableActions:[{id:'decoy',description:'Use player as decoy',baseUtility:10,risk:10,enablesDeception:true}],knownFactIds:[],nowSeconds:1});
		assert.equal(d?.deception,true);
	});
	it('supports mission transformation without deleting history', () => {
		const e=new SituationEngine(); const s=e.create({id:'s',storyId:'story',title:'Ruin',publicObjectives:[],hiddenObjectives:[],participants:[],preconditions:[],outcomes:[{id:'x',type:'TRANSFORM',description:'becomes pursuit',nextSituationId:'p2'}],npcGoalIds:[],environmentState:{},secretFactIds:[],consequenceTags:[]});
		e.resolve(s,'x','evt',1); assert.equal(s.status,'TRANSFORMED'); assert.equal(s.history.length,1);
	});
	it('keeps failed knowledge acquisition from changing reality', () => {
		const e=new KnowledgeEngine(); const s=e.createState('player'); const fact={id:'camera',subjectEntityId:'camera22',predicate:'exists',objectValue:'true',status:'UNKNOWN' as const,confidence:1,sourceEvidenceIds:[],acquiredAtSeconds:0};
		assert.equal(e.acquire(s,fact,{actorId:'player',factId:'camera',evidenceId:'none',method:'SEARCH',success:false,confidence:0,nowSeconds:1}),false);
		assert.equal(e.knows(s,'camera'),false);
	});
	it('preserves causal copies and traces forward/backward', () => {
		const e=new CausalProvenanceGraph(); const s=e.create(); e.upsertNode(s,{id:'data',kind:'DATA',label:'Data',metadata:{}}); e.upsertNode(s,{id:'copy',kind:'DATA',label:'Copy',metadata:{}}); e.addEdge(s,{id:'e',fromId:'data',toId:'copy',relation:'COPIED',eventId:'evt',timestampSeconds:1,confidence:1,metadata:{}}); assert.equal(e.traceForward(s,'data')[0].relation,'COPIED');
	});
	it('clamps relationship consequences and preserves evidence linkage', () => {
		const e=new ConsequenceEngine(); const s=e.create(); const r=e.applyDelta(s,'evt','npc','player',{trust:-150},['evidence'],'Discovery changed trust',1); assert.equal(r.trust,-100); assert.deepEqual(s.records.evt.evidenceIds,['evidence']);
	});
});


	it('projects Phase 8 state without leaking hidden facility devices or private NPC motives', () => {
		const repository = new InMemoryWorldRepository({ disablePersistence: true });
		repository.seedStory('phase8_ui_projection');
		const phase8 = repository.getPhase8SimulationEngine('phase8_ui_projection');
		const state = phase8.load(repository, 'phase8_ui_projection');
		const facility = phase8.facility.createState('facility_alpha');
		phase8.facility.addNode(facility, { id: 'visible_room', kind: 'ROOM', name: 'Visible Room', hidden: false, state: {} });
		phase8.facility.addDevice(facility, { id: 'hidden_camera', kind: 'CAMERA', nodeId: 'visible_room', hidden: true, active: true, difficulty: 80, state: {} });
		state.facilities.facility_alpha = facility;

		const npc = phase8.npc.createState('npc_alpha');
		npc.goals.push({ id: 'public_goal', description: 'Help the traveler', priority: 50, visibility: 'PUBLIC', active: true });
		npc.goals.push({ id: 'private_goal', description: 'Steal the artifact', priority: 90, visibility: 'PRIVATE', active: true });
		npc.secrets = ['private-secret'];
		state.npcs.npc_alpha = npc;
		phase8.save(repository, 'phase8_ui_projection', state);

		const player = repository.getPlayerLifecycle('phase8_ui_projection');
		const actorId = player?.actorId || 'player_actor_phase8_ui_projection';
		state.facilities.facility_alpha.facilityId = player?.locationId || 'loc_whispering_orrery';
		phase8.save(repository, 'phase8_ui_projection', state);
		const projection = phase8.getPlayerProjection(repository, 'phase8_ui_projection', actorId) as any;
		const visibleFacility = projection.facilities.find((facility: any) => facility.facilityId === (player?.locationId || 'loc_whispering_orrery'));
		assert.ok(visibleFacility);
		assert.equal(visibleFacility.devices.length, 0);
		assert.equal(projection.npcs[0].goals.some((goal: any) => goal.id === 'private_goal'), false);
		assert.equal(projection.npcs[0].goals.some((goal: any) => goal.id === 'public_goal'), true);
	});

	it('records facility discovery so a discovered hidden device becomes player-visible without changing reality', () => {
		const repository = new InMemoryWorldRepository({ disablePersistence: true });
		repository.seedStory('phase8_facility_projection');
		const phase8 = repository.getPhase8SimulationEngine('phase8_facility_projection');
		const state = phase8.load(repository, 'phase8_facility_projection');
		const facility = phase8.facility.createState('facility_beta');
		phase8.facility.addNode(facility, { id: 'room', kind: 'ROOM', name: 'Room', hidden: false, state: {} });
		phase8.facility.addDevice(facility, { id: 'camera_17', kind: 'CAMERA', nodeId: 'room', hidden: true, active: true, difficulty: 80, state: {} });
		state.facilities.facility_beta = facility;
		phase8.save(repository, 'phase8_facility_projection', state);

		const failed = phase8.facility.searchNode(facility, 'room', 20, 10);
		assert.deepEqual(failed.foundDeviceIds, []);
		const player = repository.getPlayerLifecycle('phase8_facility_projection');
		const before = phase8.getPlayerProjection(repository, 'phase8_facility_projection', player?.actorId || 'player_actor_phase8_facility_projection') as any;
		assert.equal(before.facilities[0].devices.length, 0);

		const found = phase8.facility.searchNode(facility, 'room', 100, 20);
		assert.deepEqual(found.foundDeviceIds, ['camera_17']);
		phase8.save(repository, 'phase8_facility_projection', state);
		const after = phase8.getPlayerProjection(repository, 'phase8_facility_projection', player?.actorId || 'player_actor_phase8_facility_projection') as any;
		assert.deepEqual(after.facilities[0].devices.map((device: any) => device.id), ['camera_17']);
	});

	it('does not expose private knowledge or causal edges outside the player-visible projection', () => {
		const repository = new InMemoryWorldRepository({ disablePersistence: true });
		repository.seedStory('phase8_epistemic_projection');
		const phase8 = repository.getPhase8SimulationEngine('phase8_epistemic_projection');
		const state = phase8.load(repository, 'phase8_epistemic_projection');
		const player = repository.getPlayerLifecycle('phase8_epistemic_projection');
		const actorId = player?.actorId || 'player_actor_phase8_epistemic_projection';
		const knowledge = phase8.knowledge.createState(actorId);
		state.knowledge[actorId] = knowledge;
		phase8.knowledge.acquire(
			knowledge,
			{ id: 'fact_known', subjectEntityId: 'artifact', predicate: 'exists', objectValue: 'true', status: 'KNOWN', confidence: 1, sourceEvidenceIds: ['evidence_known'], acquiredAtSeconds: 10 },
			{ actorId, factId: 'fact_known', evidenceId: 'evidence_known', method: 'SEARCH', success: true, confidence: 1, nowSeconds: 10 }
		);
		phase8.knowledge.acquire(
			knowledge,
			{ id: 'fact_cause_known', subjectEntityId: 'known_cause', predicate: 'visible', objectValue: 'true', status: 'KNOWN', confidence: 1, sourceEvidenceIds: ['evidence_known'], acquiredAtSeconds: 10 },
			{ actorId, factId: 'fact_cause_known', evidenceId: 'evidence_known', method: 'SEARCH', success: true, confidence: 1, nowSeconds: 10 }
		);
		phase8.causal.upsertNode(state.causal, { id: 'artifact', kind: 'ITEM', label: 'Artifact', metadata: {} });
		phase8.causal.upsertNode(state.causal, { id: 'known_cause', kind: 'EVENT', label: 'Known cause', metadata: {} });
		phase8.causal.upsertNode(state.causal, { id: 'secret_node', kind: 'EVENT', label: 'Secret', metadata: {} });
		phase8.causal.addEdge(state.causal, { id: 'known_edge', fromId: 'known_cause', toId: 'artifact', relation: 'DISCOVERED', eventId: 'e1', timestampSeconds: 10, confidence: 1, metadata: {} });
		phase8.causal.addEdge(state.causal, { id: 'secret_edge', fromId: 'secret_node', toId: 'artifact', relation: 'CAUSED', eventId: 'e2', timestampSeconds: 20, confidence: 1, metadata: {} });
		phase8.save(repository, 'phase8_epistemic_projection', state);

		const projection = phase8.getPlayerProjection(repository, 'phase8_epistemic_projection', actorId) as any;
		assert.equal(projection.knowledge.facts.some((fact: any) => fact.id === 'fact_known'), true);
		assert.equal(projection.causality.edges.some((edge: any) => edge.id === 'secret_edge'), false);
		assert.equal(projection.causality.edges.some((edge: any) => edge.id === 'known_edge'), true);
	});


	it('omits an undiscovered remote facility even when it contains visible non-hidden nodes', () => {
		const repository = new InMemoryWorldRepository({ disablePersistence: true });
		repository.seedStory('phase8_remote_facility_projection');
		const phase8 = repository.getPhase8SimulationEngine('phase8_remote_facility_projection');
		const state = phase8.load(repository, 'phase8_remote_facility_projection');
		const facility = phase8.facility.createState('loc_remote_hidden_facility');
		phase8.facility.addNode(facility, { id: 'public_room', kind: 'ROOM', name: 'Public Room', hidden: false, state: {} });
		state.facilities.loc_remote_hidden_facility = facility;
		phase8.save(repository, 'phase8_remote_facility_projection', state);

		const player = repository.getPlayerLifecycle('phase8_remote_facility_projection');
		const projection = phase8.getPlayerProjection(
			repository,
			'phase8_remote_facility_projection',
			player?.actorId || 'player_actor_phase8_remote_facility_projection'
		) as any;

		assert.equal(
			projection.facilities.some((visible: any) => visible.facilityId === 'loc_remote_hidden_facility'),
			false
		);
	});
