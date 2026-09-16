import { WorldTimestamp } from './types';

export type EvidenceCategory =
  | 'LIFECYCLE_TRANSITION'  // Death, revival, transformation, possession, lineage
  | 'INJURY_OR_RECOVERY'   // Severe wounds, lasting afflictions, miraculous recoveries
  | 'FACTION_ALIGNMENT'    // Defection, promotion, oath sworn, exile, betrayal
  | 'RELATIONSHIP_MUTATION'// Deepened bond, blood feud, broken promise, debt paid
  | 'WORLD_ANOMALY'        // Astrolabe stoppage, bedrock rupture, seal breach
  | 'TERRITORIAL_TRANSIT'  // Crossing restricted borders, opening locked gates
  | 'SACRED_OR_HISTORIC';  // Ancient artifacts unearthed, cosmic manifestations

export type SignificanceLevel =
  | 'TRIVIAL'     // 0: Local sensory noise; not promoted
  | 'NOTABLE'     // 1: Local record; eligible for NPC memory / local dossier
  | 'SIGNIFICANT' // 2: Promoted to persistent NPC Dossier milestone
  | 'HISTORIC';   // 3: Promoted to World Chronicle & permanent dossier legacy

export type EvidenceVisibility = 'PUBLIC' | 'FACTION' | 'OBSERVERS_ONLY' | 'SECRET';

export interface HistoricalEvidence {
  id: string;
  category: EvidenceCategory;
  timestamp: WorldTimestamp;
  primarySubjectId: string; // Actor or entity ID
  secondarySubjectId?: string; // Target or collaborator ID
  locationId: string;
  summary: string;
  details: string;
  sourceEventId: string;
  provenance: string; // e.g. 'direct_observation', 'system_simulation', 'witness_report'
  visibility: EvidenceVisibility;
  confidentialToEntityIds?: string[]; // If OBSERVERS_ONLY or SECRET
  rawStateSnapshot?: Record<string, unknown>; // Minimal state delta snapshot
  metadata?: Record<string, unknown>;
}

export interface EvaluatedEvidence {
  evidence: HistoricalEvidence;
  significance: SignificanceLevel;
  promotedToDossier: boolean;
  promotedToChronicle: boolean;
  evaluationReason: string;
}

export interface DossierMilestone {
  id: string;
  evidenceId: string;
  timestamp: WorldTimestamp;
  category: EvidenceCategory;
  significance: SignificanceLevel;
  title: string;
  summary: string;
  visibility: EvidenceVisibility;
  sourceProvenance: string;
}

export interface NpcDossier {
  subjectId: string; // References canonical actorId
  canonicalName: string;
  dossierVersion: number;
  lastEvaluatedTimestamp: WorldTimestamp;
  milestones: DossierMilestone[];
  promotedEvidenceIds: string[];
  knownAliases: string[];
  publicReputationSummary: string;
}

export interface ChronicleEntry {
  id: string;
  evidenceId: string;
  timestamp: WorldTimestamp;
  category: EvidenceCategory;
  significance: SignificanceLevel;
  locationId: string;
  headline: string;
  historicalAccount: string;
  involvedEntityIds: string[];
  visibility: EvidenceVisibility;
  provenance: string;
}
