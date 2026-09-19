export type EpistemicLayer =
  | 'CANONICAL_WORLD_TRUTH'
  | 'PLAYER_KNOWLEDGE'
  | 'NPC_KNOWLEDGE'
  | 'AI_CONTEXT';

export interface WorldTime {
  cycle: number;
  period: 'Dawn' | 'Morning' | 'Zenith' | 'Dusk' | 'Starlight';
  era: string;
}

export interface Location {
  id: string;
  name: string;
  region: string;
  description: string;
  coordinates: { x: number; y: number };
  accessible: boolean;
  ambientSensory: string;
  discovered: boolean;
}

/**
 * Epistemically sanitized character representation for downstream external presentation.
 * Hidden canonical context is strictly withheld by the server authority.
 */
export interface ExternalCharacter {
  id: string;
  name: string;
  title: string;
  role: string;
  locationId: string;
  presence: 'present' | 'absent' | 'unknown';
  disposition: 'Friendly' | 'Cautious' | 'Enigmatic' | 'Reverent';
  playerVisibleKnowledge: string[];
  portraitEmoji: string;
}

export interface DialogueChoice {
  id: string;
  label: string;
  intent: string;
  targetNodeId: string;
  requiredItem?: string;
  epistemicContext?: string;
}

export interface DialogueNode {
  nodeId: string;
  speakerId: string;
  speakerName: string;
  text: string;
  epistemicNote: string;
  choices: DialogueChoice[];
  rewardKnowledge?: {
    id: string;
    category: 'Lore' | 'Clue' | 'Person' | 'Location';
    title: string;
    summary: string;
    source: string;
  };
}

export interface Item {
  id: string;
  name: string;
  category: string;
  description: string;
  quantity: number;
  weight: number;
  rarity: string;
  equippableSlot?: string;
  icon?: string;
  durability?: number;
  maxDurability?: number;
  isBroken?: boolean;
  defId?: string;
  materials?: string[];
  provenance?: string;
  equippedSlot?: string | null;
}

export type PaperDollSlotKey =
  | 'head'
  | 'cloak'
  | 'body'
  | 'hands'
  | 'waist'
  | 'legs'
  | 'feet'
  | 'mainHand'
  | 'offHand'
  | 'relic'
  | 'ring1'
  | 'ring2'
  | 'neck';

export interface CanonicalPaperDoll {
  head: Item | null;
  cloak: Item | null;
  body: Item | null;
  hands: Item | null;
  waist: Item | null;
  legs: Item | null;
  feet: Item | null;
  mainHand: Item | null;
  offHand: Item | null;
  relic: Item | null;
  ring1: Item | null;
  ring2: Item | null;
  neck: Item | null;
  [key: string]: Item | null;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  outputDefId: string;
  outputQuantity: number;
  requiredMaterials: { defId: string; count: number }[];
  craftingTimeSeconds: number;
  difficultyScore: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  category: string;
  rarity: string;
  description: string;
  allowedSlots: string[];
  weightKg: number;
  baseValueGold: number;
  maxDurability: number;
  tags: string[];
  properties: Record<string, any>;
}

export interface InventoryStateResponse {
  actorId: string;
  items: Item[];
  paperDoll: CanonicalPaperDoll;
  definitions?: ItemDefinition[];
}

export interface PlayerKnowledge {
  id: string;
  category: 'Lore' | 'Clue' | 'Person' | 'Location';
  title: string;
  acquiredAtCycle: number;
  summary: string;
  source: string;
}

export type EpistemicValidationStatus =
  | 'MOCK_ENGINE_COMMITTED'
  | 'PROPOSAL_VALIDATED'
  | 'REJECTED_BY_ENGINE';

export interface ActionLog {
  id: string;
  timestamp: string;
  cycle: number;
  actionType: 'MOVEMENT' | 'DIALOGUE_CHOICE' | 'INSPECTION' | 'EQUIP_REQUEST' | 'NOTE_RECORD';
  description: string;
  epistemicValidation: EpistemicValidationStatus;
  authoritativeFeedback: string;
}

export interface ProtagonistProfile {
  name: string;
  title: string;
  vitality: string;
  currentFocus: string;
  status?: string;
  actorId?: string;
  currentActivity?: string;
  injuries?: any[];
  transformation?: any;
  isDead?: boolean;
  isPossessed?: boolean;
}

/**
 * External View State: The sanitized projection of the world delivered to the React presentation layer.
 * Strictly free of server-side canonical secrets.
 */
export interface ExternalViewState {
  worldTime: WorldTime;
  activeLocationId: string;
  activeLocation: Location;
  protagonist: ProtagonistProfile;
  locations: Record<string, Location>;
  routeEdges?: any[];
  characters: Record<string, ExternalCharacter>;
  activeDialogue: DialogueNode | null;
  dialogueHistory: { speaker: string; text: string; cycle: number }[];
  inventory: Item[];
  equipment: Record<string, Item | null>;
  knowledgeBase: PlayerKnowledge[];
  actionHistory: ActionLog[];
  engineContractVersion: string;
  activeJourney?: any | null;
  isTraveling?: boolean;
  playerLifecycle?: any | null;
}

/**
 * Action Requests submitted by the external client to the HTTP API boundary.
 */
export type ActionRequest =
  | {
      type: 'DIALOGUE_CHOICE';
      choiceId: string;
      targetNodeId: string;
      intent: string;
      label: string;
    }
  | {
      type: 'TRAVEL_REQUEST';
      targetLocationId: string;
      mode?: 'Foot' | 'Horse' | 'Coach' | 'Boat' | 'Flight' | 'Teleport';
    }
  | {
      type: 'CANCEL_TRAVEL';
    }
  | {
      type: 'DISCOVER_LOCATION';
      targetLocationId: string;
    }
  | {
      type: 'ADVANCE_TIME';
      seconds: number;
    }
  | {
      type: 'EQUIP_REQUEST';
      itemId: string;
      slot: string;
    }
  | {
      type: 'UNEQUIP_REQUEST';
      slot: string;
    }
  | {
      type: 'INSPECT_ITEM';
      itemId: string;
    }
  | {
      type: 'INSPECT_SURROUNDINGS';
    }
  | {
      type: 'ADVANCE_CYCLE';
    }
  | {
      type: 'ENGAGE_DIALOGUE';
      characterId: string;
    }
  | {
      type: 'APPLY_INJURY';
      injuryType: string;
      severity: 'Minor' | 'Moderate' | 'Severe' | 'Critical';
      location: string;
      description: string;
    }
  | {
      type: 'HEAL_INJURY';
      injuryId: string;
    }
  | {
      type: 'APPLY_TRANSFORMATION';
      formName: string;
      vesselType: string;
    }
  | {
      type: 'REVERT_TRANSFORMATION';
    }
  | {
      type: 'RECORD_DEATH';
      cause: string;
      revivalPossible?: boolean;
    }
  | {
      type: 'REVIVE_PLAYER';
    };

/**
 * Result returned by POST /api/game/action after validating and processing an action request.
 */
export interface ActionResult {
  success: boolean;
  actionId: string;
  requestType: ActionRequest['type'];
  status: 'MOCK_ENGINE_COMMITTED' | 'MOCK_ENGINE_REJECTED';
  message: string;
  authoritativeFeedback: string;
  viewState: ExternalViewState;
}

export interface BoundaryAuditDiagnostics {
  serverHoldsCanonicalSecrets: boolean;
  countSecretsHeld: number;
  testSecretPresentOnServer: boolean;
  externalProjectionClean: boolean;
  boundaryStatus: 'PASS' | 'FAIL';
  architectureMode: string;
}

export type EvidenceCategory =
  | 'LIFECYCLE_TRANSITION'
  | 'INJURY_OR_RECOVERY'
  | 'FACTION_ALIGNMENT'
  | 'RELATIONSHIP_MUTATION'
  | 'WORLD_ANOMALY'
  | 'TERRITORIAL_TRANSIT'
  | 'SACRED_OR_HISTORIC';

export type SignificanceLevel =
  | 'TRIVIAL'
  | 'NOTABLE'
  | 'SIGNIFICANT'
  | 'HISTORIC';

export type EvidenceVisibility = 'PUBLIC' | 'FACTION' | 'OBSERVERS_ONLY' | 'SECRET';

export interface WorldTimestamp {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  totalElapsedSeconds: number;
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
  subjectId: string;
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

export interface PowerState {
  originId: string;
  originTier: 'Mortal' | 'Grounded' | 'Heroic' | 'Transcendent' | 'Primordial';
  currentFormId: string;
  vesselType: 'mortal_human' | 'ascended_avatar' | 'primordial_form' | 'ethereal_spirit';
  vesselCapacity: number; // 0–100 safe capacity limit
  sealState: 'absolute' | 'partial' | 'dormant' | 'broken';
  sealStrength: number; // 0–100
  powerAccessLevel: number; // 0.0 to 1.0 multiplier
  trueFormAccess: boolean;
  healthCurrent: number;
  healthMax: number;
  fatigue: number; // 0–100
  stress: number; // 0–100
  magicalEnergy: number; // 0–100
  physicalStrain: number; // accumulated strain points
  activeConditions: string[];
}

export interface CapabilityDefinition {
  id: string;
  name: string;
  category: 'Physical' | 'Magic' | 'Biological' | 'Social' | 'Domain' | 'Movement';
  activationMode: 'immediate' | 'passive' | 'reaction' | 'charged' | 'channelled';
  powerTier: 'Minor' | 'Moderate' | 'Major' | 'WorldScale';
  baseEnergyCost: number;
  baseStrainCost: number;
  chargeTurnsRequired?: number;
  isInterruptible?: boolean;
  minVesselCapacityRequired: number;
  description: string;
  provenance: string;
}

export interface CapabilityGraphNode {
  capabilityId: string;
  name: string;
  derivedSkills: string[];
  prerequisites: string[];
  transformsInto?: string[];
  enhances?: string[];
}

export interface ApprovedConsequence {
  approved: boolean;
  rejectionReason?: string;
  hpDelta: number;
  energyDelta: number;
  strainDelta: number;
  appliedConditions: string[];
  emittedObservation: {
    visibleToNearby: boolean;
    sensoryDescription: string;
  };
  narrativeDirective: string;
}

export interface CapabilitiesResponse {
  actorId: string;
  powerState?: PowerState;
  capabilities: CapabilityDefinition[];
  graph: CapabilityGraphNode[];
}

export interface AdjudicationResponse extends ApprovedConsequence {
  powerState?: PowerState;
  capabilities?: CapabilityDefinition[];
  graph?: CapabilityGraphNode[];
}

export interface SynthesisResponse {
  success: boolean;
  errorReason?: string;
  primaryCapability?: CapabilityDefinition;
  derivedSkills?: string[];
  graphNode?: CapabilityGraphNode;
  powerState?: PowerState;
  capabilities?: CapabilityDefinition[];
  graph?: CapabilityGraphNode[];
}

export interface RollRecord {
  rollId: string;
  rulesetVersion: string;
  formula: string;
  individualDice: number[];
  modifier: number;
  total: number;
  isCriticalSuccess: boolean;
  isCriticalFailure: boolean;
  timestamp: number;
}

export interface BattlefieldParticipant {
  id: string;
  name: string;
  x: number;
  y: number;
  initiative: number;
  team: 'player_allies' | 'enemies' | 'neutral';
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
  speedCells: number;
  attackBonus: number;
  damageFormula: string;
  conditions: string[];
  isDead: boolean;
}

export interface DynamicHazardZone {
  id: string;
  type: 'fire_zone' | 'ice_patch' | 'poison_cloud' | 'barricade';
  x: number;
  y: number;
  radiusCells: number;
  durationTurns: number;
  damagePerTurn: number;
}

export interface BattleEvent {
  turnNumber: number;
  actorId: string;
  targetId?: string;
  actionType: 'MOVE' | 'ATTACK' | 'CAST' | 'CONDITION_TICK';
  headline: string;
  damageInflicted?: number;
  rollRecord?: RollRecord;
  metadata?: Record<string, unknown>;
}

export interface CombatStateResponse {
  participants: BattlefieldParticipant[];
  currentActor?: BattlefieldParticipant;
  hazards: DynamicHazardZone[];
  turnQueue: string[];
  currentRound: number;
  currentTurnIndex: number;
  eventLog: BattleEvent[];
  isEncounterActive: boolean;
  victory: boolean;
  defeat: boolean;
  isPlayerTurn: boolean;
}

export interface CombatActionResponse {
  success: boolean;
  errorReason?: string;
  combatState: CombatStateResponse;
  hits?: boolean;
  damage?: number;
  targetDied?: boolean;
  isCritical?: boolean;
  roll?: RollRecord;
  adjudication?: ApprovedConsequence;
  castResult?: {
    success: boolean;
    damage: number;
    targetDied: boolean;
    headline: string;
  };
  powerState?: PowerState;
}

export type MemoryClass =
  | 'ATOMIC_FACT'
  | 'EPISODIC'
  | 'SEMANTIC'
  | 'CAUSAL'
  | 'CAPABILITY'
  | 'PERSISTENT_IDENTITY'
  | 'SOURCE_CANON';

export type MemoryStatus = 'active' | 'dormant' | 'archived';
export type MemoryVisibility = 'PRIVATE' | 'SHARED' | 'PUBLIC';

export interface StructuredTriggerCondition {
  keywords?: string[];
  requiredTags?: string[];
  tokenIntersections?: string[][];
  latentCapabilityId?: string;
  detectedOpportunityTemplate?: string;
  suggestedStateMutation?: {
    kind: string;
    targetRole?: 'target' | 'actor' | 'location';
    targetId?: string;
    effect: string;
  };
}

export interface DurableMemory {
  id: string;
  storyId: string;
  memoryClass: MemoryClass;
  subjectEntityId: string;
  relatedEntityIds: string[];
  content: string;
  importance: number;
  confidence: number;
  status: MemoryStatus;
  visibility?: MemoryVisibility;
  accessibleToEntityIds?: string[];
  isPersistentCritical: boolean;
  isLocked?: boolean;
  lockedReason?: string;
  lockedBy?: string;
  lockedAtTimestamp?: WorldTimestamp;
  provenance: string;
  sourceEventId?: string;
  validFromTurn: number;
  lastRecalledTurn: number;
  createdAtTimestamp?: WorldTimestamp;
  lastRecalledTimestamp?: WorldTimestamp;
  triggerConditionTags: string[];
  structuredTriggers?: StructuredTriggerCondition[];
}

export interface OpportunityMatch {
  matchedMemoryId: string;
  triggerTag: string;
  detectedOpportunity: string;
  latentCapabilityId?: string;
  suggestedStateMutation: {
    kind: string;
    targetId: string;
    effect: string;
  };
}

export interface MemoryRetrievalResponse {
  success: boolean;
  count: number;
  memories: DurableMemory[];
}

export interface OpportunityScanResponse {
  success: boolean;
  count: number;
  opportunities: OpportunityMatch[];
}

export interface MemoryStoreResponse {
  success: boolean;
  memory: DurableMemory;
  errorReason?: string;
}

export interface MemoryLockResponse {
  success: boolean;
  memory?: DurableMemory;
  errorReason?: string;
}

export interface MemoryDecayResponse {
  success: boolean;
  decaySummary: {
    decayedCount: number;
    transitionedToDormant: string[];
    transitionedToArchived: string[];
    protectedByLock: string[];
    protectedByCritical: string[];
  };
}

// ============================================================================
// CHALLENGE 11: WORKING CONTEXT & TOKEN BUDGETING TYPES
// ============================================================================

export type PriorityBand =
  | 'B1_CRITICAL'
  | 'B2_IMMEDIATE'
  | 'B3_CAUSAL_OPPORTUNITY'
  | 'B4_EPISODIC'
  | 'B5_SEMANTIC_LORE';

export interface ContextChunk {
  id?: string;
  band: PriorityBand;
  label: string;
  content: string;
  estimatedTokens: number;
  sourceAuthority?: string;
  relevanceScore?: number;
  epistemicVisibility?: 'PUBLIC' | 'SHARED' | 'PRIVATE';
  isProtected?: boolean;
}

export interface WorkingContextPacket {
  scene: string;
  time: string;
  playerState: string;
  visibleEntities: string[];
  activeConditions: string[];
  relevantCapabilities: string[];
  relevantMemories: string[];
  relationships: string[];
  quests: string[];
  inventory: string[];
  pendingEvents: string[];
  playerAction: string;
  committedStateChanges: string[];
}

export interface WorkingContextResponse {
  success: boolean;
  packet: WorkingContextPacket;
  assembledText: string;
  totalTokens: number;
  hardTokenBudget: number;
  includedChunks: ContextChunk[];
  evictedChunkLabels: string[];
  evictionReasons: Record<string, string>;
  epistemicallySanitized: boolean;
}

export interface ContextAssembleResponse extends WorkingContextResponse {
  chunks: ContextChunk[];
}

export interface ContextInspectionResponse {
  success: boolean;
  storyId: string;
  hardTokenBudget: number;
  totalTokensUsed: number;
  headroomTokens: number;
  candidateChunkCount: number;
  includedChunkCount: number;
  evictedChunkCount: number;
  bandBreakdown: Record<
    string,
    { totalCandidateCount: number; includedCount: number; evictedCount: number }
  >;
  includedChunks: Array<{
    id?: string;
    band: PriorityBand;
    label: string;
    estimatedTokens: number;
    sourceAuthority?: string;
    isProtected?: boolean;
  }>;
  evictedChunkLabels: string[];
  evictionReasons: Record<string, string>;
  epistemicallySanitized: boolean;
}

export interface ActiveEffect {
  effectId: string;
  storyId: string;
  abilityId?: string;
  targetId: string;
  name: string;
  type: string;
  turnsRemaining: number;
  damageReflection?: number;
  charges?: number;
  createdAt: string;
}

export interface StoryThread {
  threadId: string;
  storyId: string;
  title: string;
  status: 'OPEN' | 'ACTIVE' | 'ESCALATED' | 'RESOLVED' | 'ABANDONED' | string;
  stage?: number;
  locationId?: string;
  description?: string;
  category?: string;
  sourceEventId?: string;
  evidenceItems?: string[];
  evidenceGathered?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface CanonicalGameplayEvent {
  eventId: string;
  storyId: string;
  eventType: string;
  actorId: string;
  locationId: string;
  details: string;
  evidenceItems?: string[];
  timestamp: string;
}

export interface WorldFact {
  factId: string;
  statement: string;
  category: string;
  subjectEntityId: string;
  predicate: string;
  objectValue: string;
  provenanceClass: string;
  provenanceSummary: string;
  sourceSegmentIds: string[];
  confidence: number;
  acquiredAtTimestamp: any;
}

export interface WorldTemplate {
  worldId: string;
  title: string;
  summary: string;
  description: string;
  genreTags: string[];
  toneTags: string[];
  mediumTags: string[];
  canonMode: string;
  rulesetId: string;
  visibility: string;
  creatorId: string;
  sourcePolicy: string;
  defaultEra: string;
  worldManifestVersion: number;
  versionHash: string;
  canonicalCapabilities: any[];
  capabilities: any[];
  worldRules: any[];
  ruleConstraints: string[];
  worldFacts: WorldFact[];
  createdAt: string;
  updatedAt: string;
}

export interface NpcDialogueContextResponse {
  success: boolean;
  npcName: string;
  sanitizedPrompt: string;
  estimatedTokens: number;
  epistemicallySanitized: boolean;
}




