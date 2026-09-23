import type { InMemoryWorldRepository } from '../repositories/worldRepository';
import { FacilitySimulationEngine, FacilityState } from './facilitySimulationEngine';
import { NpcAutonomyEngine, NpcAgentState } from './npcAutonomyEngine';
import { SituationEngine, SituationState } from './situationEngine';
import { KnowledgeEngine, KnowledgeState } from './knowledgeEngine';
import { CausalProvenanceGraph, CausalGraphState } from './causalProvenanceGraph';
import { ConsequenceEngine, ConsequenceState } from './consequenceEngine';

export interface Phase8RuntimeState {
	schemaVersion: number;
	facilities: Record<string, FacilityState>;
	npcs: Record<string, NpcAgentState>;
	situations: Record<string, SituationState>;
	knowledge: Record<string, KnowledgeState>;
	causal: CausalGraphState;
	consequences: ConsequenceState;
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
		return { schemaVersion: 1, facilities: {}, npcs: {}, situations: {}, knowledge: {}, causal: this.causal.create(), consequences: this.consequence.create() };
	}

	public save(repository: InMemoryWorldRepository, storyId: string, state: Phase8RuntimeState): void {
		const run = repository.getStoryRun(storyId) as any;
		if (!run) throw new Error(`Story run '${storyId}' does not exist.`);
		run.runtimeState = { ...(run.runtimeState || {}), phase8: JSON.parse(JSON.stringify(state)) };
		repository.saveStoryRun(run);
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
