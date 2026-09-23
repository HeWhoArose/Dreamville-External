import { deterministicId } from './deterministicRng';

export type RuleScope = 'WORLD' | 'LOCATION' | 'MISSION' | 'ACTOR' | 'ENTITY' | 'COMBAT';
export type RuleTrigger =
	| 'TECHNIQUE_EXPLAINED'
	| 'ABILITY_USED'
	| 'DAMAGE_RECEIVED'
	| 'ENTITY_ENTERED'
	| 'ENTITY_DETECTED'
	| 'FACT_CHANGED'
	| 'MISSION_STATE_CHANGED'
	| 'ITEM_TRANSFERRED'
	| 'TIME_ELAPSED'
	| 'NPC_TURN'
	| 'CUSTOM_EVENT';

export type RuleCondition =
	| { type: 'EQUALS'; path: string; value: unknown }
	| { type: 'NOT_EQUALS'; path: string; value: unknown }
	| { type: 'AT_LEAST'; path: string; value: number }
	| { type: 'AT_MOST'; path: string; value: number }
	| { type: 'HAS_TAG'; path: string; value: string }
	| { type: 'FACT_TRUE'; factId: string }
	| { type: 'FACT_FALSE'; factId: string }
	| { type: 'KNOWS_FACT'; actorId: string; factId: string };

export type RuleEffect =
	| { type: 'SET'; path: string; value: unknown }
	| { type: 'ADD'; path: string; value: number }
	| { type: 'MULTIPLY'; path: string; value: number }
	| { type: 'SET_FACT'; factId: string; truth: boolean; value?: string }
	| { type: 'GRANT_KNOWLEDGE'; actorId: string; factId: string }
	| { type: 'EMIT_EVENT'; eventType: string; payload?: Record<string, unknown> };

export interface CustomRuleDefinition {
	id: string;
	name: string;
	trigger: RuleTrigger;
	scope: RuleScope;
	conditions: RuleCondition[];
	effects: RuleEffect[];
	priority: number;
	enabled: boolean;
	source: 'AUTHORED' | 'AI_PROPOSAL' | 'IMPORTED';
	provenance: string;
}

export interface WorldFact {
	id: string;
	subjectEntityId: string;
	predicate: string;
	objectValue: string;
	truth: boolean;
	createdAt: number;
	updatedAt: number;
	sourceEventId?: string;
}

export interface KnowledgeEntry {
	id: string;
	actorId: string;
	factId: string;
	sourceType: 'WITNESSED' | 'TOLD' | 'DOCUMENT' | 'RUMOR' | 'INFERENCE' | 'SYSTEM';
	confidence: number;
	acquiredAt: number;
}

export interface FacilityDevice {
	id: string;
	type: 'CAMERA' | 'MOTION_SENSOR' | 'ALARM' | 'LOCK' | 'POWER_NODE';
	locationId: string;
	active: boolean;
	concealment: number;
	detectionRange: number;
	networkId?: string;
}

export interface FacilityLocation {
	id: string;
	name: string;
	parentId?: string;
	adjacentLocationIds: string[];
	hidden: boolean;
	accessible: boolean;
}

export interface FacilityState {
	id: string;
	name: string;
	locations: Record<string, FacilityLocation>;
	devices: Record<string, FacilityDevice>;
	alarmLevel: number;
	networkOnline: Record<string, boolean>;
	hiddenInformation: Record<string, string>;
}

export interface NpcGoal {
	id: string;
	description: string;
	priority: number;
	hidden: boolean;
	completed: boolean;
}

export interface NpcAgentState {
	actorId: string;
	name: string;
	locationId: string;
	goals: NpcGoal[];
	knowledgeFactIds: string[];
	relationshipScores: Record<string, number>;
	trustByActor: Record<string, number>;
	fear: number;
	greed: number;
	deception: number;
	currentPlan?: string;
}

export type MissionStatus = 'ACTIVE' | 'SUCCEEDED' | 'FAILED' | 'ABANDONED' | 'TRANSFORMED';
export interface MissionState {
	id: string;
	title: string;
	status: MissionStatus;
	publicObjectives: string[];
	hiddenObjectives: string[];
	activeObjectiveIndex: number;
	participantIds: string[];
	possibleOutcomes: string[];
	createdAt: number;
	updatedAt: number;
	consequenceEventIds: string[];
}

export interface CausalEvent {
	id: string;
	type: string;
	timestamp: number;
	actorIds: string[];
	entityIds: string[];
	inputEventIds: string[];
	outputEventIds: string[];
	description: string;
	provenance: string;
}

export interface UniversalWorldState {
	worldId: string;
	rules: Record<string, CustomRuleDefinition>;
	facts: Record<string, WorldFact>;
	knowledge: Record<string, KnowledgeEntry>;
	facilities: Record<string, FacilityState>;
	npcs: Record<string, NpcAgentState>;
	missions: Record<string, MissionState>;
	causalEvents: Record<string, CausalEvent>;
	revision: number;
}

export function createUniversalWorldState(worldId: string): UniversalWorldState {
	return { worldId, rules: {}, facts: {}, knowledge: {}, facilities: {}, npcs: {}, missions: {}, causalEvents: {}, revision: 0 };
}

export function cloneUniversalWorldState(state: UniversalWorldState): UniversalWorldState {
	return structuredClone(state);
}

export function createCausalId(type: string, ...parts: unknown[]): string {
	return deterministicId('causal', type, ...parts);
}
