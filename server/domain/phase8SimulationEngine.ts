import type { InMemoryWorldRepository } from '../repositories/worldRepository';
import { FacilitySimulationEngine, FacilityState } from './facilitySimulationEngine';
import { NpcAutonomyEngine, NpcAgentState } from './npcAutonomyEngine';
import { SituationEngine, SituationState } from './situationEngine';
import { KnowledgeEngine, KnowledgeState } from './knowledgeEngine';
import { CausalProvenanceGraph, CausalGraphState } from './causalProvenanceGraph';
import { ConsequenceEngine, ConsequenceState } from './consequenceEngine';
import type { CustomRuleEffect } from '../../src/types';

export interface Phase8RuntimeState {
	schemaVersion: number;
	facilities: Record<string, FacilityState>;
	npcs: Record<string, NpcAgentState>;
	situations: Record<string, SituationState>;
	knowledge: Record<string, KnowledgeState>;
	causal: CausalGraphState;
	consequences: ConsequenceState;
	scheduledEvents: Array<{ id: string; eventType: string; executeAtSeconds: number; payload?: Record<string, unknown> }>;
	evidence: Record<string, { id: string; subjectEntityId: string; summary: string; provenance: string; sourceEventId: string; timestampSeconds: number }>;
}

export class Phase8SimulationEngine {
	public readonly facility = new FacilitySimulationEngine();
	public readonly npc = new NpcAutonomyEngine();
	public readonly situation = new SituationEngine();
	public readonly knowledge = new KnowledgeEngine();
	public readonly causal = new CausalProvenanceGraph();
	public readonly consequence = new ConsequenceEngine();

	public load(repository: InMemoryWorldRepository, storyId: string): Phase8RuntimeState {
		const run = repository.getStoryRun(storyId) as any;
		const existing = run?.runtimeState?.phase8;
		if (existing) return JSON.parse(JSON.stringify(existing));
		return { schemaVersion: 1, facilities: {}, npcs: {}, situations: {}, knowledge: {}, causal: this.causal.create(), consequences: this.consequence.create(), scheduledEvents: [], evidence: {} };
	}

	public save(repository: InMemoryWorldRepository, storyId: string, state: Phase8RuntimeState): void {
		const run = repository.getStoryRun(storyId) as any;
		if (!run) throw new Error(`Story run '${storyId}' does not exist.`);
		run.runtimeState = { ...(run.runtimeState || {}), phase8: JSON.parse(JSON.stringify(state)) };
		repository.saveStoryRun(run);
	}


	public applyRuleEffect(repository: InMemoryWorldRepository, storyId: string, eventId: string, timestampSeconds: number, effect: CustomRuleEffect): void {
		const state = this.load(repository, storyId);
		switch (effect.type) {
			case 'CREATE_ENTITY':
				this.causal.upsertNode(state.causal, { id: effect.entityId, kind: effect.entityKind, label: effect.entityId, metadata: effect.metadata || {} });
				break;
			case 'DESTROY_ENTITY':
				if (state.causal.nodes[effect.entityId]) state.causal.nodes[effect.entityId].metadata.destroyedAtSeconds = timestampSeconds;
				break;
			case 'MOVE_ENTITY':
			case 'TELEPORT':
				if (state.causal.nodes[effect.entityId]) state.causal.nodes[effect.entityId].metadata.locationId = effect.locationId;
				break;
			case 'CREATE_MISSION':
				if (!state.situations[effect.situationId]) state.situations[effect.situationId] = this.situation.create({ id: effect.situationId, storyId, title: effect.title, publicObjectives: [], hiddenObjectives: [], participants: [], preconditions: [], outcomes: [], npcGoalIds: [], environmentState: {}, secretFactIds: [], consequenceTags: [] });
				break;
			case 'MODIFY_MISSION': {
				const situation = state.situations[effect.situationId];
				if (!situation) throw new Error('Unknown situation ' + effect.situationId + '.');
				if (effect.status) situation.status = effect.status;
				if (effect.objectiveId) this.situation.completeObjective(situation, effect.objectiveId);
				break;
			}
			case 'CREATE_EVIDENCE':
				state.evidence[effect.evidenceId] = { id: effect.evidenceId, subjectEntityId: effect.subjectEntityId, summary: effect.summary, provenance: effect.provenance, sourceEventId: eventId, timestampSeconds };
				break;
			case 'CHANGE_RELATIONSHIP':
				this.consequence.applyDelta(state.consequences, eventId, effect.actorId, effect.targetId, { trust: effect.trustDelta, affinity: effect.affinityDelta, fear: effect.fearDelta, respect: effect.respectDelta, hostility: effect.hostilityDelta }, effect.evidenceIds || [], 'Custom rule relationship consequence', timestampSeconds);
				break;
			case 'ADD_KNOWLEDGE': {
				const knowledge = state.knowledge[effect.actorId] || this.knowledge.createState(effect.actorId);
				state.knowledge[effect.actorId] = knowledge;
				this.knowledge.acquire(knowledge, { id: effect.factId, subjectEntityId: effect.actorId, predicate: 'known', objectValue: effect.factId, status: 'KNOWN', confidence: 1, sourceEvidenceIds: [], acquiredAtSeconds: timestampSeconds }, { actorId: effect.actorId, factId: effect.factId, evidenceId: effect.evidenceId, method: 'SYSTEM', success: true, confidence: effect.confidence ?? 1, nowSeconds: timestampSeconds });
				break;
			}
			case 'REMOVE_KNOWLEDGE': {
				const knowledge = state.knowledge[effect.actorId];
				if (knowledge) this.knowledge.forget(knowledge, effect.factId);
				break;
			}
			case 'SCHEDULE_EVENT':
				state.scheduledEvents.push({ id: eventId + ':' + state.scheduledEvents.length, eventType: effect.eventType, executeAtSeconds: effect.executeAtSeconds, payload: effect.payload });
				break;
			case 'APPLY_DAMAGE':
			case 'MODIFY_RESOURCE':
			case 'ALTER_WORLD_FACT':
				throw new Error('Rule effect ' + effect.type + ' requires an authoritative resolution adapter.');
			default:
				break;
		}
		this.save(repository, storyId, state);
	}

	public processCanonicalEvent(repository: InMemoryWorldRepository, storyId: string, event: { eventId: string; type: string; actorId?: string; targetId?: string; locationId?: string; timestampSeconds: number; payload?: Record<string, unknown> }): Phase8RuntimeState {
		const state = this.load(repository, storyId);
		const payload = event.payload || {};
		if (event.type === 'ITEM_TRANSFERRED' && event.actorId && event.targetId) {
			const itemId = String(payload.itemId || 'item_unknown');
			this.causal.upsertNode(state.causal, { id: event.actorId, kind: 'ACTOR', label: event.actorId, metadata: {} });
			this.causal.upsertNode(state.causal, { id: event.targetId, kind: 'ACTOR', label: event.targetId, metadata: {} });
			this.causal.upsertNode(state.causal, { id: itemId, kind: 'ITEM', label: itemId, metadata: {} });
			this.causal.addEdge(state.causal, { id: `${event.eventId}:transfer`, fromId: event.actorId, toId: itemId, relation: 'TRANSFERRED', eventId: event.eventId, timestampSeconds: event.timestampSeconds, confidence: 1, metadata: { recipient: event.targetId } });
			this.causal.addEdge(state.causal, { id: `${event.eventId}:recipient`, fromId: itemId, toId: event.targetId, relation: 'TRANSFERRED', eventId: event.eventId, timestampSeconds: event.timestampSeconds, confidence: 1, metadata: {} });
		}
		if (event.type === 'LOCATION_ENTERED' && event.locationId) {
			const facility = state.facilities[event.locationId];
			if (facility) {
				const activeDevices = Object.values(facility.devices).filter((d) => d.active);
				for (const device of activeDevices) {
					const detection = this.facility.detectDevice(facility, device.id, event.timestampSeconds);
					if (detection.alarmRaised && detection.zoneId) {
						const zone = facility.securityZones[detection.zoneId];
						zone.alarmState = 'ALERT';
					}
				}
			}
		}
		this.save(repository, storyId, state);
		return state;
	}

	public serialize(state: Phase8RuntimeState): Phase8RuntimeState { return JSON.parse(JSON.stringify(state)); }
}
