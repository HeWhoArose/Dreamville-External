import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { FacilitySimulationEngine } from '../server/domain/facilitySimulationEngine';
import { NpcAutonomyEngine } from '../server/domain/npcAutonomyEngine';
import { SituationEngine } from '../server/domain/situationEngine';
import { KnowledgeEngine } from '../server/domain/knowledgeEngine';
import { CausalProvenanceGraph } from '../server/domain/causalProvenanceGraph';
import { ConsequenceEngine } from '../server/domain/consequenceEngine';

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
