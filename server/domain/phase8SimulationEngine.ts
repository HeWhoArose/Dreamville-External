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
		if (existing) return {
			schemaVersion: 1,
			facilities: existing.facilities || {},
			npcs: existing.npcs || {},
			situations: existing.situations || {},
			knowledge: existing.knowledge || {},
			causal: existing.causal || this.causal.create(),
			consequences: existing.consequences || this.consequence.create(),
			scheduledEvents: existing.scheduledEvents || [],
			evidence: existing.evidence || {},
		};
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
			case 'ALTER_WORLD_FACT': {
				const timestamp = repository.getWorldClock(storyId).getTimestamp();
				repository.saveWorldFact(storyId, {
					factId: 'rule_' + eventId + '_' + effect.subjectEntityId + '_' + effect.predicate,
					statement: effect.subjectEntityId + ' ' + effect.predicate + ' ' + effect.objectValue,
					category: 'custom_rule',
					subjectEntityId: effect.subjectEntityId,
					predicate: effect.predicate,
					objectValue: effect.objectValue,
					provenanceClass: 'SYSTEM_DERIVED',
					provenanceSummary: 'custom_rule',
					sourceSegmentIds: [eventId],
					confidence: effect.confidence ?? 1,
					acquiredAtTimestamp: timestamp,
					truthState: effect.truthState || 'TRUE',
				});
				break;
			}
			case 'APPLY_DAMAGE': {
				const actorId = effect.target === 'EVENT_TARGET' ? undefined : effect.actorId;
				const targetId = actorId || effect.target === 'EVENT_ACTOR' ? (effect.target === 'EVENT_TARGET' ? undefined : actorId) : undefined;
				const participantId = effect.target === 'EVENT_TARGET' ? undefined : targetId;
				const combat = repository.getCombatEngine(storyId);
				const participant = participantId ? combat.getParticipant(participantId) : undefined;
				if (!participant) throw new Error('APPLY_DAMAGE requires an active combat participant target.');
				const hpCurrent = Math.max(0, participant.hpCurrent - Math.max(0, effect.amount));
				combat.updateParticipant(participant.id, { hpCurrent, isDead: hpCurrent <= 0 });
				break;
			}
			case 'MODIFY_RESOURCE': {
				const actorId = effect.actorId;
				if (!actorId) throw new Error('MODIFY_RESOURCE requires actorId.');
				const combat = repository.getCombatEngine(storyId);
				const participant = combat.getParticipant(actorId);
				if (!participant) throw new Error('MODIFY_RESOURCE requires an active combat participant.');
				const resources = { ...(participant.combatResources || {}) };
				resources[effect.resourceId] = Math.max(0, (resources[effect.resourceId] || 0) + effect.amount);
				combat.updateParticipant(actorId, { combatResources: resources });
				break;
			}
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
					if (detection.alarmRaised && detection.zoneId) facility.securityZones[detection.zoneId].alarmState = 'ALERT';
				}
			}
		}
		if (event.type === 'MISSION_STATE_CHANGED') {
			const situationId = String(payload.situationId || '');
			const situation = state.situations[situationId];
			if (situation && payload.objectiveId) this.situation.completeObjective(situation, String(payload.objectiveId));
			if (situation && payload.outcomeId) this.situation.resolve(situation, String(payload.outcomeId), event.eventId, event.timestampSeconds);
		}
		if (event.type === 'FACT_CHANGED' && event.actorId && payload.factId && payload.evidenceId && payload.knowledgeAcquisitionSuccess === true) {
			const knowledge = state.knowledge[event.actorId] || this.knowledge.createState(event.actorId);
			state.knowledge[event.actorId] = knowledge;
			this.knowledge.acquire(knowledge, {
				id: String(payload.factId),
				subjectEntityId: String(payload.subjectEntityId || event.actorId),
				predicate: String(payload.predicate || 'fact'),
				objectValue: String(payload.objectValue || 'true'),
				status: 'KNOWN',
				confidence: Number(payload.confidence ?? 1),
				sourceEvidenceIds: [String(payload.evidenceId)],
				acquiredAtSeconds: event.timestampSeconds,
			}, {
				actorId: event.actorId,
				factId: String(payload.factId),
				evidenceId: String(payload.evidenceId),
				method: (payload.method as any) || 'SYSTEM',
				success: true,
				confidence: Number(payload.confidence ?? 1),
				nowSeconds: event.timestampSeconds,
			});
		}
		if (payload.causalFromId && payload.causalToId && payload.causalRelation) {
			this.causal.upsertNode(state.causal, { id: String(payload.causalFromId), kind: String(payload.causalFromKind || 'ENTITY'), label: String(payload.causalFromId), metadata: {} });
			this.causal.upsertNode(state.causal, { id: String(payload.causalToId), kind: String(payload.causalToKind || 'ENTITY'), label: String(payload.causalToId), metadata: {} });
			this.causal.addEdge(state.causal, {
				id: event.eventId + ':causal',
				fromId: String(payload.causalFromId),
				toId: String(payload.causalToId),
				relation: String(payload.causalRelation) as any,
				eventId: event.eventId,
				timestampSeconds: event.timestampSeconds,
				confidence: Number(payload.causalConfidence ?? 1),
				metadata: {},
			});
		}
		if (payload.relationshipActorId && payload.relationshipTargetId) {
			this.consequence.applyDelta(state.consequences, event.eventId, String(payload.relationshipActorId), String(payload.relationshipTargetId), {
				trust: Number(payload.trustDelta || 0),
				affinity: Number(payload.affinityDelta || 0),
				fear: Number(payload.fearDelta || 0),
				respect: Number(payload.respectDelta || 0),
				hostility: Number(payload.hostilityDelta || 0),
			}, Array.isArray(payload.evidenceIds) ? payload.evidenceIds.map(String) : [], String(payload.relationshipDescription || 'Canonical event changed relationship.'), event.timestampSeconds);
		}
		this.save(repository, storyId, state);
		return state;
	}

	public serialize(state: Phase8RuntimeState): Phase8RuntimeState { return JSON.parse(JSON.stringify(state)); }
}
