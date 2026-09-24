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
		if (existing) {
			const facilities = existing.facilities || {};
			for (const facility of Object.values(facilities) as any[]) {
				facility.discoveredNodeIds = Array.isArray(facility.discoveredNodeIds) ? facility.discoveredNodeIds : [];
				facility.discoveredDeviceIds = Array.isArray(facility.discoveredDeviceIds) ? facility.discoveredDeviceIds : [];
			}
			return {
				schemaVersion: 1,
				facilities,
				npcs: existing.npcs || {},
				situations: existing.situations || {},
				knowledge: existing.knowledge || {},
				causal: existing.causal || this.causal.create(),
				consequences: existing.consequences || this.consequence.create(),
				scheduledEvents: existing.scheduledEvents || [],
				evidence: existing.evidence || {},
			};
		}
		return { schemaVersion: 1, facilities: {}, npcs: {}, situations: {}, knowledge: {}, causal: this.causal.create(), consequences: this.consequence.create(), scheduledEvents: [], evidence: {} };
	}

	public save(repository: InMemoryWorldRepository, storyId: string, state: Phase8RuntimeState): void {
		const run = repository.getStoryRun(storyId) as any;
		if (!run) throw new Error(`Story run '${storyId}' does not exist.`);
		run.runtimeState = { ...(run.runtimeState || {}), phase8: JSON.parse(JSON.stringify(state)) };
		repository.saveStoryRun(run);
	}


	public applyRuleEffect(repository: InMemoryWorldRepository, storyId: string, eventId: string, timestampSeconds: number, effect: CustomRuleEffect, eventActorId?: string, eventTargetId?: string): void {
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
				const participantId = effect.target === 'EVENT_TARGET' ? eventTargetId : effect.target === 'EVENT_ACTOR' ? eventActorId : effect.actorId;
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

	public resolveNpcDecision(
		repository: InMemoryWorldRepository,
		storyId: string,
		npcId: string,
		availableActions: Array<{ id: string; description: string; targetEntityId?: string; targetLocationId?: string; baseUtility?: number; risk?: number; requiredKnowledgeIds?: string[]; enablesDeception?: boolean }>,
		nowSeconds: number,
		opportunityScore = 0
	): ReturnType<NpcAutonomyEngine['decide']> {
		const state = this.load(repository, storyId);
		const npcState = state.npcs[npcId];
		if (!npcState) return undefined;
		const knowledgeState = state.knowledge[npcId] || this.knowledge.createState(npcId);
		state.knowledge[npcId] = knowledgeState;
		const knownFactIds = Object.values(knowledgeState.facts)
			.filter((fact) => fact.status === 'KNOWN' || fact.status === 'SUSPECTED')
			.map((fact) => fact.id);
		const decision = this.npc.decide(npcState, {
			actorId: npcId,
			availableActions,
			knownFactIds,
			opportunityScore,
			nowSeconds,
		});
		this.save(repository, storyId, state);
		return decision;
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
		if (event.type === 'NPC_DECISION_REQUESTED' && event.actorId && Array.isArray(payload.availableActions)) {
			this.resolveNpcDecision(
				repository,
				storyId,
				event.actorId,
				payload.availableActions as Array<{ id: string; description: string; targetEntityId?: string; targetLocationId?: string; baseUtility?: number; risk?: number; requiredKnowledgeIds?: string[]; enablesDeception?: boolean }>,
				event.timestampSeconds,
				Number(payload.opportunityScore || 0)
			);
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
			const chronicle = repository.getHistoricalChronicleEngine(storyId);
			chronicle.recordEvidence({
				id: 'relationship_' + event.eventId,
				category: 'RELATIONSHIP_MUTATION',
				timestamp: repository.getWorldClock(storyId).getTimestamp(),
				primarySubjectId: String(payload.relationshipActorId),
				secondarySubjectId: String(payload.relationshipTargetId),
				locationId: event.locationId || 'unknown',
				summary: String(payload.relationshipDescription || 'Relationship changed.'),
				details: String(payload.relationshipDescription || 'Canonical relationship mutation.'),
				sourceEventId: event.eventId,
				provenance: 'canonical_relationship_engine',
				visibility: 'PUBLIC',
			});
		}
		this.save(repository, storyId, state);
		return state;
	}

	public getPlayerProjection(repository: InMemoryWorldRepository, storyId: string, actorId: string): Record<string, unknown> {
		const state = this.load(repository, storyId);
		const run = repository.getStoryRun(storyId);
		const playerLocationId = repository.getPlayerLifecycle(storyId)?.locationId || run?.startingLocationId || 'loc_whispering_orrery';
		const playerKnowledge = state.knowledge[actorId] || this.knowledge.createState(actorId);
		const knownFactIds = new Set(Object.values(playerKnowledge.facts).filter((fact) => fact.status === 'KNOWN' || fact.status === 'SUSPECTED').map((fact) => fact.id));
		const evidenceIds = new Set(Object.values(playerKnowledge.facts).flatMap((fact) => fact.sourceEvidenceIds || []));

		const facilities = Object.values(state.facilities)
			.filter((facility) => {
				const discoveredNodes = new Set(facility.discoveredNodeIds || []);
				const discoveredDevices = new Set(facility.discoveredDeviceIds || []);
				const isCurrentLocation = facility.facilityId === playerLocationId
					|| facility.facilityId === run?.currentLocationId;
				const isKnownByEvidence = knownFactIds.has(facility.facilityId);
				const hasPlayerDiscovery = discoveredNodes.size > 0 || discoveredDevices.size > 0;
				return isCurrentLocation || isKnownByEvidence || hasPlayerDiscovery;
			})
			.map((facility) => {
			const discoveredNodes = new Set(facility.discoveredNodeIds || []);
			const discoveredDevices = new Set(facility.discoveredDeviceIds || []);
			const nodes = Object.values(facility.nodes)
				.filter((node) => !node.hidden || discoveredNodes.has(node.id))
				.map((node) => ({
					...node,
					connectedNodeIds: node.connectedNodeIds.filter((id) => {
						const linked = facility.nodes[id];
						return !!linked && (!linked.hidden || discoveredNodes.has(id));
					}),
				}));
			const devices = Object.values(facility.devices)
				.filter((device) => !device.hidden || discoveredDevices.has(device.id))
				.map((device) => ({ ...device }));
			return {
				facilityId: facility.facilityId,
				nodes,
				devices,
				securityZones: Object.values(facility.securityZones)
					.filter((zone) => nodes.some((node) => node.securityZoneId === zone.id))
					.map((zone) => ({ ...zone, guardEntityIds: [...zone.guardEntityIds] })),
				power: { ...facility.power },
				communications: { ...facility.communications },
				updatedAtSeconds: facility.updatedAtSeconds,
			};
		});

		const situations = Object.values(state.situations).map((situation) => ({
			id: situation.id,
			storyId: situation.storyId,
			title: situation.title,
			status: situation.status,
			objectives: situation.publicObjectives.map((objective) => ({ ...objective })),
			participants: situation.participants.map((participant) => ({ ...participant })),
			consequenceTags: [...situation.consequenceTags],
			history: situation.history.map((entry) => ({ ...entry })),
		}));

		const npcs = Object.values(state.npcs).map((npc) => ({
			actorId: npc.actorId,
			goals: npc.goals.filter((goal) => goal.visibility === 'PUBLIC').map((goal) => ({ ...goal })),
			updatedAtSeconds: npc.updatedAtSeconds,
		}));

		const causalVisibleNodeIds = new Set<string>([
			actorId,
			playerLocationId,
			...Object.values(playerKnowledge.facts).map((fact) => fact.subjectEntityId),
			...Array.from(evidenceIds),
		]);
		const causalEdges = Object.values(state.causal.edges)
			.filter((edge) => (
				(causalVisibleNodeIds.has(edge.fromId) && causalVisibleNodeIds.has(edge.toId))
				|| evidenceIds.has(edge.id)
				|| evidenceIds.has(edge.eventId)
			))
			.map((edge) => ({ ...edge, metadata: { ...edge.metadata } }));
		const causalNodes = Object.values(state.causal.nodes)
			.filter((node) => causalVisibleNodeIds.has(node.id))
			.map((node) => ({ ...node, metadata: { ...node.metadata } }));

		const relationships = Object.values(state.consequences.relationships)
			.filter((relationship) => relationship.sourceId === actorId || relationship.targetId === actorId)
			.map((relationship) => ({ ...relationship, history: [...relationship.history] }));

		const knownFacts = Object.values(playerKnowledge.facts)
			.filter((fact) => fact.status !== 'UNKNOWN')
			.map((fact) => ({ ...fact, sourceEvidenceIds: [...fact.sourceEvidenceIds] }));

		return {
			storyId,
			worldId: run?.worldId || null,
			playerLocationId,
			npcs,
			facilities,
			situations,
			knowledge: { actorId, facts: knownFacts },
			causality: { nodes: causalNodes, edges: causalEdges },
			relationships,
			summary: {
				activeSituations: situations.filter((s) => ['OPEN', 'ACTIVE'].includes(s.status)).length,
				transformedSituations: situations.filter((s) => s.status === 'TRANSFORMED').length,
				knownFacts: knownFacts.length,
				knownRelationships: relationships.length,
			},
		};
	}

	public serialize(state: Phase8RuntimeState): Phase8RuntimeState { return JSON.parse(JSON.stringify(state)); }
}
