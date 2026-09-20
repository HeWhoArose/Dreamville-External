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
  openingScene?: OpeningScene | null;
}

export type NarrativeEventType =
  | 'normal'
  | 'dialogue'
  | 'action'
  | 'magic'
  | 'damage'
  | 'heal'
  | 'location'
  | 'quest'
  | 'item'
  | 'system';

export interface StructuredNarrativeEvent {
  id: string;
  type: NarrativeEventType;
  text: string;
  speaker?: string;
  metadata?: Record<string, any>;
  timestamp?: string;
}

export interface OpeningScene {
  storyId: string;
  worldId: string;
  worldName: string;
  startingLocationId: string;
  startingLocationName: string;
  characterId: string;
  characterName: string;
  characterRole: string;
  worldTime: {
    cycle: number;
    period: string;
    era: string;
    formattedTime: string;
  };
  startingSituation: string;
  narrativeText: string;
  structuredEvents: StructuredNarrativeEvent[];
  generatedAt: string;
  idempotencyKey: string;
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
    }
  | {
      type: 'CUSTOM_ACTION';
      customText?: string;
      description?: string;
      input?: string;
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

export interface CharacterEffect {
  id: string;
  type: string;
  target?: string;
  scope?: string;
  modifier?: number;
  value?: string | number | boolean;
  condition?: string;
  description: string;
  sourceId?: string;
  provenance: CharacterProvenanceSource;
}

export interface CharacterStatDefinition {
  id: string;
  name: string;
  value: number;
  baseValue?: number;
  min?: number;
  max?: number;
  description?: string;
  provenance: CharacterProvenanceSource;
}

export interface CharacterFeat {
  id: string;
  name: string;
  description: string;
  effects: CharacterEffect[];
  prerequisites?: string[];
  tags?: string[];
  provenance: CharacterProvenanceSource;
  sourceEventId?: string;
  worldId?: string;
}

export interface CharacterTitle {
  id: string;
  name: string;
  description: string;
  effects: CharacterEffect[];
  provenance: CharacterProvenanceSource;
  sourceEventId?: string;
  worldId?: string;
}

export interface CharacterStartingState {
  healthCurrent: number;
  healthMax: number;
  energyCurrent?: number;
  energyMax?: number;
  fatigue?: number;
  stress?: number;
  conditions: string[];
  activeEffects: CharacterEffect[];
  reputations: Record<string, number>;
  relationshipModifiers: Record<string, number>;
}

export type CharacterStartingChoiceMode = 'CHOOSE' | 'AI_SUGGEST' | 'SURPRISE_ME';

export type CharacterStoryMode = 'PROTAGONIST' | 'SIDE_CHARACTER' | 'FREE_ROAM';

export interface CharacterAiExtractionSummary {
  interpretation: string;
  keyFacts: string[];
  proposedHighlights: string[];
  uncertainties?: string[];
  generationSource?: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK';
}

export interface CapabilityDefinition {
  id: string;
  name: string;
  category: 'Physical' | 'Magic' | 'Biological' | 'Social' | 'Domain' | 'Movement' | string;
  activationMode: 'immediate' | 'passive' | 'reaction' | 'charged' | 'channelled' | string;
  powerTier: 'Minor' | 'Moderate' | 'Major' | 'WorldScale' | string;
  baseEnergyCost: number;
  baseStrainCost: number;
  chargeTurnsRequired?: number;
  isInterruptible?: boolean;
  minVesselCapacityRequired: number;
  description: string;
  provenance: string;
  prerequisites?: string[];
  restrictions?: string[];
  cooldownTurns?: number;
  durationTurns?: number;
  targetType?: 'single_target' | 'self' | 'area_of_effect' | 'all_allies' | 'all_enemies' | string;
  rangeScope?: 'melee' | 'close' | 'ranged' | 'realm' | 'global' | string;
  actionType?: 'action' | 'bonus_action' | 'reaction' | 'free' | string;
  sourceUserPrompt?: string;
  effects?: CharacterEffect[];
  generatedSkills?: GeneratedTechnique[];
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
  // Advanced & Canonical Discovery Fields (CH16)
  setting?: string;
  era?: string;
  source?: string;
  playstyle?: string;
  rules?: string;
  supportedPlaystyles?: string[];
  imageAsset?: string;
  imageMetadata?: {
    promptFallback: string;
    rightsStatus: string;
    provenance: string;
    mediaSha256?: string;
  };
  geography?: any;
  timeline?: any[];
  characters?: any[];
  factions?: any[];
  magicRules?: any;
  economy?: any;
  forbiddenContradictions?: string[];
  startingStarts?: any[];
  terminology?: Record<string, string>;
  knowledgeBoundaries?: any;
  artConfig?: any;
  audioConfig?: any;
  narrativeConfig?: any;
  events?: any[];
  generationStatus?: string;
  provenance?: {
    generationSource: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK';
    providerId: string;
    modelId: string;
    task: string;
    attemptCount: number;
    fallbackReason?: string;
    generationSeed?: string;
  };
}

export interface WorldSearchCriteria {
  query?: string;
  genre?: string;
  tone?: string;
  medium?: string;
  era?: string;
  setting?: string;
  source?: string;
  playstyle?: string;
  rules?: string;
}

export interface WorldSynthesisInput {
  naturalLanguagePremise: string;
  title?: string;
  genreTags?: string[];
  toneTags?: string[];
  mediumTags?: string[];
  generationSeed?: string;
  defaultEra?: string;
  canonMode?: string;
  rulesetId?: string;
  storyMode?: CharacterStoryMode;
  dndRulesMode?: 'FULL_DND' | 'HYBRID_DND' | 'CUSTOM_HOMEBREW_DND';
  setting?: string;
  sourcePolicy?: string;
  imageAsset?: string;
  imageMetadata?: {
    promptFallback: string;
    rightsStatus: string;
    provenance: string;
    mediaSha256?: string;
  };
  geography?: any;
  timeline?: any[];
  characters?: any[];
  factions?: any[];
  magicRules?: any;
  economy?: any;
  forbiddenContradictions?: string[];
  startingStarts?: any[];
  terminology?: Record<string, string>;
  knowledgeBoundaries?: any;
  artConfig?: any;
  audioConfig?: any;
  narrativeConfig?: any;
  events?: any[];
}

export interface ResearchEvidenceItem {
  evidenceId: string;
  sourceUri: string;
  sourceTitle: string;
  claimText: string;
  qualification: 'QUALIFIED' | 'UNQUALIFIED' | 'DISPUTED' | 'UNKNOWN';
  provenance: {
    retrievedAt: string;
    lawfulNotice?: string;
    accessibilityMetadata?: string;
    extractorModel?: string;
    isGeneratedProposal: boolean;
  };
  validationStatus: 'PENDING' | 'VALIDATED' | 'REJECTED' | 'UNKNOWN';
  canonicalPromotionTarget?: {
    category: string;
    subjectEntityId: string;
    predicate: string;
    objectValue: string;
  };
}

export interface MediaGenerationResult {
  success: boolean;
  isFallback: boolean;
  imageUrl?: string;
  mediaAsset?: any;
  promptFallback: string;
  assetMetadata?: any;
  errorReason?: string;
  failureModeInjected?: string;
}

export interface NpcDialogueContextResponse {
  success: boolean;
  npcName: string;
  sanitizedPrompt: string;
  estimatedTokens: number;
  epistemicallySanitized: boolean;
}

// ============================================================
// CHARACTER CREATION SLICE 2 — CHARACTER GENESIS TYPES
// ============================================================

export type CharacterProvenanceSource =
  | 'PLAYER_INPUT'
  | 'AI_GENERATED'
  | 'DETERMINISTIC_FALLBACK'
  | 'USER_EDITED'
  | 'WORLD_DERIVED'
  | 'SYSTEM_DERIVED';

export interface CharacterIdentity {
  name: string;
  species: string;
  age: number | string;
  gender?: string;
}

export interface CharacterAppearance {
  physicalDescription: string;
  distinguishingTraits: string[];
}

export interface CharacterPersonality {
  traits: string[];
  temperament: string;
  values: string[];
}

export interface CharacterBackground {
  history: string;
  upbringing: string;
  importantEvents: string[];
}

export interface CharacterRole {
  archetype: string;
  profession: string;
  role: string;
}

export interface CharacterMotivations {
  goals: string[];
  fears: string[];
  desires: string[];
}

export interface CharacterRelationships {
  allies: string[];
  rivals: string[];
  family: string[];
  factions: string[];
}

export interface CharacterCondition {
  injuries: string[];
  curses: string[];
  forms: string[];
  specialStates: string[];
}

export interface GeneratedTechnique {
  id: string;
  name: string;
  description: string;
  parentCapabilityId: string;
  parentCapabilityName: string;
  activationType?: string;
  energyCost?: number;
  cooldownTurns?: number;
  range?: string;
  provenance: CharacterProvenanceSource;
}

export interface StartingEquipmentItem {
  id: string;
  defId?: string;
  name: string;
  category: 'Weapon' | 'Armor' | 'Shield' | 'Potion' | 'Scroll' | 'Quest' | 'Material' | 'Document' | 'Food' | 'Accessory' | 'Tool' | 'Miscellaneous' | string;
  description?: string;
  slot?: string;
  isEquipped: boolean;
  quantity: number;
  rarity?: string;
  weightKg?: number;
  durability?: number;
  maxDurability?: number;
  properties?: Record<string, unknown>;
  effects?: CharacterEffect[];
  sourceUserPrompt?: string;
  provenance: CharacterProvenanceSource;
}

export interface StartingEquipmentConfig {
  equipped: StartingEquipmentItem[];
  inventory: StartingEquipmentItem[];
  weapons: string[];
  armor: string[];
  tools: string[];
  consumables: string[];
}

export interface StartingLocationConfig {
  locationId: string;
  name: string;
  region?: string;
  description?: string;
  coordinates?: { x: number; y: number };
}

export interface StartingSituationConfig {
  summary: string;
  hook: string;
  initialConditions: string;
  whyHereNow: string;
}

export interface CharacterPortraitAsset {
  imageUrl?: string;
  emoji?: string;
  promptFallback: string;
  isFallback: boolean;
  status: 'idle' | 'generating' | 'ready' | 'fallback' | 'failed';
  failureReason?: string;
  source?: 'UPLOAD' | 'AI_GENERATED' | 'BROWSE' | 'EMOJI';
  pinned?: boolean;
}

export interface CharacterGenesisRevision {
  revision: number;
  savedAt: string;
  label: string;
  snapshot: Partial<CharacterGenesisDraft>;
}

export interface CharacterGenesisDraft {
  draftId: string;
  worldId: string;
  worldVersion: number;
  sourceDescription: string;
  identity: CharacterIdentity;
  appearance: CharacterAppearance;
  personality: CharacterPersonality;
  background: CharacterBackground;
  role: CharacterRole;
  motivations: CharacterMotivations;
  relationships: CharacterRelationships;
  condition: CharacterCondition;
  attributes: CharacterStatDefinition[];
  stats: CharacterStatDefinition[];
  traits: string[];
  capabilities: CapabilityDefinition[];
  generatedSkills: GeneratedTechnique[];
  feats: CharacterFeat[];
  titles: CharacterTitle[];
  startingEquipment: StartingEquipmentConfig;
  startingLocation: StartingLocationConfig;
  startingSituation: StartingSituationConfig;
  startingLocationMode: CharacterStartingChoiceMode;
  startingSituationMode: CharacterStartingChoiceMode;
  startingState: CharacterStartingState;
  portraitAsset?: CharacterPortraitAsset;
  aiExtractionSummary?: CharacterAiExtractionSummary;
  provenance: Record<string, CharacterProvenanceSource>;
  fieldLocks: string[];
  validationState: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  revision: number;
  revisionHistory: CharacterGenesisRevision[];
  storyMode?: CharacterStoryMode;
  dndRulesMode?: 'FULL_DND' | 'HYBRID_DND' | 'CUSTOM_HOMEBREW_DND';
  createdAt?: string;
  updatedAt?: string;
}

export interface ConfirmedCharacter {
  characterId: string;
  draftId: string;
  worldId: string;
  worldVersion: number;
  confirmedAt: string;
  sourceDescription: string;
  identity: CharacterIdentity;
  appearance: CharacterAppearance;
  personality: CharacterPersonality;
  background: CharacterBackground;
  role: CharacterRole;
  motivations: CharacterMotivations;
  relationships: CharacterRelationships;
  condition: CharacterCondition;
  attributes: CharacterStatDefinition[];
  stats: CharacterStatDefinition[];
  traits: string[];
  capabilities: CapabilityDefinition[];
  generatedSkills: GeneratedTechnique[];
  feats: CharacterFeat[];
  titles: CharacterTitle[];
  startingEquipment: StartingEquipmentConfig;
  startingLocation: StartingLocationConfig;
  startingSituation: StartingSituationConfig;
  startingLocationMode: CharacterStartingChoiceMode;
  startingSituationMode: CharacterStartingChoiceMode;
  startingState: CharacterStartingState;
  portraitAsset?: CharacterPortraitAsset;
  aiExtractionSummary?: CharacterAiExtractionSummary;
  provenance: Record<string, CharacterProvenanceSource>;
  fieldLocks: string[];
  revision: number;
  storyMode?: CharacterStoryMode;
  dndRulesMode?: 'FULL_DND' | 'HYBRID_DND' | 'CUSTOM_HOMEBREW_DND';
}

export interface CharacterExtractionRequest {
  naturalLanguageConcept: string;
  worldId: string;
  existingDraft?: Partial<CharacterGenesisDraft>;
  userEditedFields?: string[];
  narrativeRole?: CharacterStoryMode;
  allowDeterministicFallback?: boolean;
}

export interface CustomCapabilityProposalRequest {
  worldId: string;
  capabilityConcept: string;
  characterContext?: {
    role?: string;
    background?: string;
    species?: string;
  };
}





