/**
 * DREAMVILLE CORE DOMAIN CONTRACTS
 * Sourced directly from DreamBook v10.8 (v4.0 World Geography & Time, v5.0 Epistemics, v10.8 Decision 1)
 */

export type DayPhase = 'Dawn' | 'Morning' | 'Afternoon' | 'Dusk' | 'Night' | 'Predawn';

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export interface WorldTimestamp {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  totalElapsedSeconds: number;
}

export interface WorldClockState {
  calendarSystemId: string;
  timestamp: WorldTimestamp;
  timeScale: number; // 1.0 = real-time, or accelerated multiplier
  currentSeason: Season;
  currentDayPhase: DayPhase;
  timezoneOrRegion: string;
}

export type TerrainType = 'Road' | 'Trail' | 'Forest' | 'Hills' | 'Mountains' | 'Swamp' | 'Water';
export type TravelMode = 'Foot' | 'Horse' | 'Coach' | 'Boat' | 'Flight' | 'Teleport';

export interface GeographicCoordinates {
  x: number;
  y: number;
  elevation?: number;
}

export interface LocationNode {
  id: string;
  name: string;
  regionId: string;
  description: string;
  coordinates: GeographicCoordinates;
  accessible: boolean;
  ambientSensory: string;
  discovered: boolean;
  parentLocationId?: string | null;
}

export interface RouteEdge {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  distanceKm: number;
  terrain: TerrainType;
  allowedModes: TravelMode[];
  hazardRisk: number; // 0.0 to 1.0
  isBlocked: boolean;
  blockReason?: string;
}

export type JourneyStatus = 'in_progress' | 'interrupted' | 'completed' | 'cancelled';

export interface TravelJourney {
  id: string;
  actorId: string;
  originLocationId: string;
  destinationLocationId: string;
  routeLocationIds: string[];
  currentWaypointIndex: number;
  totalDistanceKm: number;
  traveledDistanceKm: number;
  speedKmPerHour: number;
  departureTime: WorldTimestamp;
  estimatedArrivalTime: WorldTimestamp;
  status: JourneyStatus;
}

export interface InjuryRecord {
  id: string;
  type: string;
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Critical';
  location: string;
  description: string;
  acquiredAtTimestamp: WorldTimestamp;
  healed: boolean;
}

export interface TransformationRecord {
  id: string;
  formName: string;
  vesselType: string;
  active: boolean;
  beganAtTimestamp: WorldTimestamp;
  expiresAtTimestamp?: WorldTimestamp | null;
}

export interface DeathRecord {
  isDead: boolean;
  diedAtTimestamp: WorldTimestamp;
  cause: string;
  revivalPossible: boolean;
}

export interface PossessionRecord {
  isPossessed: boolean;
  entityName: string;
  beganAtTimestamp: WorldTimestamp;
}

/**
 * IActorLifecycle
 * The minimal shared contract genuinely common to both Player and NPC actors
 * (DreamBook v10.8 Architecture Decision 1)
 */
export interface IActorLifecycle {
  actorId: string;
  name: string;
  locationId: string; // Canonical current position (anchored to origin while traveling)
  lastUpdatedTime: number; // Elapsed seconds timestamp
  currentActivity: string;
  activeJourney: TravelJourney | null;

  isTraveling: boolean;
  isDead: boolean;
  isTransformed: boolean;
  isPossessed: boolean;

  injuries: readonly InjuryRecord[];
  transformationRecord: TransformationRecord | null;
  deathRecord: DeathRecord | null;
  possessionRecord: PossessionRecord | null;
  lineage?: string | null;
}

export type KnowledgeSourceType =
  | 'witnessed'
  | 'told'
  | 'document'
  | 'rumor'
  | 'inference'
  | 'supernatural'
  | 'system_grant';

export interface KnowledgeFact {
  id: string;
  subjectEntityId: string;
  predicate: string;
  objectValue: string;
  sourceType: KnowledgeSourceType;
  sourceEventId?: string;
  acquiredAtTimestamp: WorldTimestamp;
  confidence: number; // 0.0 to 1.0
  secretLevel: 'public' | 'faction' | 'private' | 'cosmic_secret';
  scope: 'exact' | 'general' | 'uncertain';
  provenanceSummary: string;
}

export interface ObservationRecord {
  id: string;
  observerEntityId: string;
  targetEntityId: string;
  actionObserved: string;
  timestamp: WorldTimestamp;
  consequenceDeduced: string;
}

export type RequirementStatus = 'DOCUMENTED' | 'FOUNDATION' | 'IMPLEMENTED' | 'VERIFIED' | 'BLOCKED' | 'DEFERRED';

export interface LivingBibleRequirement {
  id: string;
  area: string;
  title: string;
  requirementText: string;
  dreamBookRef: string;
  status: RequirementStatus;
  codeEvidence: string;
  testEvidence: string;
  notes: string;
}

export interface WorkstationState {
  currentPhase: string;
  phaseObjective: string;
  lastAuditDate: string;
  nextTask: string;
  blockers: string[];
  counts: {
    verified: number;
    implemented: number;
    foundation: number;
    documented: number;
    planned: number;
  };
  iterationHistory: {
    iteration: number;
    date: string;
    description: string;
    outcome: string;
  }[];
}
