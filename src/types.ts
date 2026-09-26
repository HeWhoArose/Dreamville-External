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
  worldId?: string;
  presence: 'present' | 'absent' | 'unknown';
  disposition: 'Friendly' | 'Cautious' | 'Enigmatic' | 'Reverent';
  playerVisibleKnowledge: string[];
  portraitEmoji: string;
  portraitUrl?: string;
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
  charges?: number;
  maxCharges?: number;
  equipmentClass?: EquipmentClass;
  handUsage?: HandUsage;
  allowedSlots?: EquipmentSlotId[];
  properties?: Record<string, unknown>;
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
  equipmentClass?: EquipmentClass;
  equipable?: boolean;
  handUsage?: HandUsage;
  modifiers?: Array<Record<string, unknown>>;
  customRules?: CustomRuleDefinition[];
  consumption?: {
    mode: 'QUANTITY' | 'CHARGE' | 'DESTROY';
    amount?: number;
  };
  maxCharges?: number;
  grantedCapabilities?: string[];
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

export type StoryCheckAbility =
  | 'Strength'
  | 'Dexterity'
  | 'Constitution'
  | 'Intelligence'
  | 'Wisdom'
  | 'Charisma';

export type StoryTestType = 'ABILITY_CHECK' | 'SAVING_THROW' | 'CUSTOM_CHECK';
export type StoryCheckResolutionMode = 'DND_STANDARD' | 'CUSTOM_D20' | 'NARRATIVE';
export type ResolvedStoryCheckAbility = StoryCheckAbility | 'CUSTOM';
export type StoryD20AdvantageState = 'NORMAL' | 'ADVANTAGE' | 'DISADVANTAGE';

export interface StoryCheckModifierSource {
  label: string;
  value: number;
  kind: 'ABILITY' | 'PROFICIENCY' | 'EXPERTISE' | 'CONTEXT' | 'CUSTOM_RULE' | 'OTHER';
}

export interface StoryCheckChallenge {
  id: string;
  label: string;
  sourceType?: 'CAPABILITY' | 'HAZARD' | 'EVENT' | 'SCENE' | 'RULE' | string;
  sourceId?: string;
  keywords: string[];
  difficultyClass: number;
  testType?: StoryTestType;
  rollFormula?: string;
  ability?: StoryCheckAbility;
  savingThrowAbility?: StoryCheckAbility;
  skill?: string;
  resolutionMode?: 'DND_STANDARD' | 'CUSTOM_D20' | 'NARRATIVE';
  customModifier?: number;
  reason?: string;
  triggerReason?: string;
  provenance?: string;
  onSuccess?: StoryCheckOutcomeDefinition;
  onFailure?: StoryCheckOutcomeDefinition;
  [key: string]: unknown;
}

export interface StoryCheckChallengeCondition {
  definitionIdOrName: string;
  intensity?: number;
  severity?: number;
  durationSeconds?: number | null;
  affectedBodyRegions?: BodyRegionId[];
}

export interface StoryCheckOutcomeDefinition {
  damageFormula?: string;
  damageType?: string;
  damageMultiplier?: number;
  targetBodyRegionId?: BodyRegionId;
  conditions?: StoryCheckChallengeCondition[];
  removeConditions?: string[];
  summary?: string;
}

export interface StoryCheckDamageOutcome {
  requestedAmount: number;
  rolledAmount: number;
  finalAmount: number;
  damageType: string;
  immune: boolean;
  resisted: boolean;
  vulnerable: boolean;
  healthCurrent: number;
  targetDied: boolean;
  destroyedBodyRegions: BodyRegionId[];
}

export interface StoryCheckConsequenceResult {
  challengeId: string;
  applied: boolean;
  branch: 'SUCCESS' | 'FAILURE';
  summary: string;
  damageRoll?: RollRecord;
  damage?: StoryCheckDamageOutcome;
  appliedConditions: string[];
  removedConditions: string[];
  noEffectReason?: string;
}

export interface StoryCheckResult {
  checkId: string;
  testType: StoryTestType;
  skill: string;
  ability: ResolvedStoryCheckAbility;
  difficultyClass: number;
  proficiencyBonus: number;
  proficiencyLevel: 'NONE' | 'PROFICIENT' | 'EXPERTISE';
  abilityModifier: number;
  totalModifier: number;
  modifierSources: StoryCheckModifierSource[];
  advantageState: StoryD20AdvantageState;
  selectedDieIndex: number;
  roll: RollRecord;
  total: number;
  success: boolean;
  criticalSuccess: boolean;
  criticalFailure: boolean;
  reason: string;
  contextNotes: string[];
  worldTriggered: boolean;
  triggerReason?: string;
  challengeId?: string;
  challengeLabel?: string;
  consequence?: StoryCheckConsequenceResult;
}

export interface ActionTip {
  id: string;
  title: string;
  description: string;
  intent: string;
  actionText: string;
  source: 'DETERMINISTIC' | 'AI';
}

export type CapabilitySimulationStatus =
  | 'ALREADY_OWNED'
  | 'CURRENTLY_EXECUTABLE'
  | 'DEVELOPABLE'
  | 'CONDITIONALLY_DEVELOPABLE'
  | 'ALTERNATE_ROUTE'
  | 'CHARACTER_INCOMPATIBLE'
  | 'CURRENTLY_BLOCKED'
  | 'WORLD_FORBIDDEN'
  | 'UNSUPPORTED_REQUEST';

export interface CapabilitySimulationResult {
  status: CapabilitySimulationStatus;
  actionText: string;
  requestedDomain?: string;
  candidateCapability?: any;
  mechanism?: string;
  scale?: 'Minor' | 'Moderate' | 'Major' | 'WorldScale';
  worldAllowed: boolean;
  characterCompatible: boolean;
  currentlyExecutable: boolean;
  progressionPossible: boolean;
  acquisitionAllowed: boolean;
  explanation: string;
  blockers: string[];
  requiredConditions: string[];
  developmentPath: string[];
  alternateRoutes: string[];
  estimatedEnergyCost?: number;
  estimatedVesselCapacityRequired?: number;
  internalOnly?: boolean;
  /** True only when canonical acquisition may be committed now. */
  creationAllowed?: boolean;
}

export interface ActionCapabilityProposal {
  proposalId: string;
  requestedAction: string;
  requestedCapabilityId?: string;
  requestedCapabilityName?: string;
  reasonRequestedCapabilityUnavailable: string;
  alternative: any;
  simulation?: CapabilitySimulationResult;
  acceptLabel: string;
  rejectLabel: string;
}

export interface ActionAdvice {
  /** Player-facing action state. New capabilities are never silently learned. */
  mode: 'EXECUTE_EXISTING' | 'CAPABILITY_SIMULATION' | 'SUGGEST_ALTERNATIVE' | 'NORMAL_ACTION';
  actionText: string;
  actorId: string;
  tips: ActionTip[];
  proposal?: ActionCapabilityProposal;
  recognizedCapability?: any;
  simulation?: CapabilitySimulationResult;
  canExecuteNow: boolean;
}

export interface ActionLog {
  id: string;
  timestamp: string;
  cycle: number;
  actionType: 'MOVEMENT' | 'DIALOGUE_CHOICE' | 'INSPECTION' | 'EQUIP_REQUEST' | 'CUSTOM_ACTION' | 'NOTE_RECORD';
  description: string;
  epistemicValidation: EpistemicValidationStatus;
  authoritativeFeedback: string;
  /** Player-facing narrator response, separate from internal/mechanical engine feedback. */
  narrativeResponse?: string;
  checkResult?: StoryCheckResult;
  actionAdvice?: ActionAdvice;
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
  portraitUrl?: string;
  portraitEmoji?: string;
  conditionState?: CharacterStartingConditionState;
}

/**
 * External View State: The sanitized projection of the world delivered to the React presentation layer.
 * Strictly free of server-side canonical secrets.
 */
export interface ExternalViewState {
	storyId?: string;
	worldId?: string;
	narrativeProfile?: NarrativeProfile;
	rulesProfile?: RulesProfile;
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
	narrativeProfile?: NarrativeProfile;
	dndRulesMode?: DndRulesMode;
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
      intendedCapabilityId?: string;
      bypassCapabilityAdvisor?: boolean;
      preventCapabilityExecution?: boolean;
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
  narrativeResponse?: string;
  checkResult?: StoryCheckResult;
  actionAdvice?: ActionAdvice;
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

export interface ItemOrSkillIcon {
  source: 'DEFAULT' | 'AI_GENERATED' | 'IMPORTED' | 'EMOJI';
  url?: string;
  prompt?: string;
  alt?: string;
  status?: 'DEFAULT' | 'GENERATING' | 'READY' | 'FAILED';
  emoji?: string;
}

export type EquipmentClass =
  | 'WEAPON'
  | 'ARMOR'
  | 'SHIELD'
  | 'ACCESSORY'
  | 'TOOL'
  | 'CONSUMABLE'
  | 'FOOD'
  | 'POTION'
  | 'DOCUMENT'
  | 'QUEST'
  | 'MATERIAL'
  | 'MISC';

export type HandUsage = 'NONE' | 'MAIN_HAND' | 'OFF_HAND' | 'ONE_HAND' | 'TWO_HAND';

export type EquipmentSlotId =
  | 'head'
  | 'neck'
  | 'back'
  | 'body'
  | 'mainHand'
  | 'offHand'
  | 'gloves'
  | 'belt'
  | 'ring'
  | 'legs'
  | 'feet'
  | 'ammunition';

export interface CharacterStatDefinition {
  id: string;
  name: string;
  value: number;
  baseValue?: number;
  min?: number;
  max?: number;
  description?: string;
  category?: 'custom_attribute' | 'world_stat' | string;
  mechanicalRole?: string;
  worldCompatibility?: string;
  provenance: CharacterProvenanceSource;
}

export interface CharacterSkill {
  id: string;
  name: string;
  governingAbility: 'Strength' | 'Dexterity' | 'Constitution' | 'Intelligence' | 'Wisdom' | 'Charisma' | string;
  proficiency: 'NONE' | 'PROFICIENT' | 'EXPERTISE';
  isProficient?: boolean;
  isExpertise?: boolean;
  isCustom?: boolean;
  description: string;
  mechanicalDescription?: string;
  tags?: string[];
  worldCompatibility?: string;
  provenance: CharacterProvenanceSource;
  icon?: ItemOrSkillIcon;
  checkFormula?: string;
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
  conditionState?: CharacterStartingConditionState;
}

export type CharacterStartingChoiceMode = 'CHOOSE' | 'AI_SUGGEST' | 'SURPRISE_ME';

export type CharacterStoryMode = 'PROTAGONIST' | 'SIDE_CHARACTER' | 'FREE_ROAM';

export type NarrativeCameraMode = 'PLAYER_CENTRIC' | 'SUPPORTING_CAST' | 'WORLD_SANDBOX';
export type NarrativeAgencyMode = 'PRIMARY_PLAYER' | 'SUPPORTING_PLAYER' | 'OPEN_AGENCY';

export interface NarrativeProfile {
	profileId: string;
	version: number;
	mode: CharacterStoryMode;
	camera: NarrativeCameraMode;
	playerAgency: NarrativeAgencyMode;
	description: string;
}

export type DndRulesMode = 'FULL_DND' | 'HYBRID_DND' | 'CUSTOM_HOMEBREW_DND';

export type RulesResolutionPolicy =
  | 'DND_STANDARD'
  | 'DND_WITH_EXPLICIT_OVERRIDES'
  | 'CUSTOM_EXPLICIT_RULES';

export type RuleOverrideOperation = 'ENABLE' | 'DISABLE' | 'SET';

export interface RuleOverride {
  ruleId: string;
  operation: RuleOverrideOperation;
  value?: unknown;
  reason: string;
  provenance?: string;
}

export interface RulesProfile {
  profileId: string;
  version: number;
  mode: DndRulesMode;
  policy: RulesResolutionPolicy;
  baseRuleset: 'DND_5E' | 'NONE';
  allowImplicitAbilityChecks: boolean;
  allowImplicitSavingThrows: boolean;
  allowStandardDndSpellRules: boolean;
  requireAuthoredChallengeForCustomChecks: boolean;
  allowWorldRuleOverrides: boolean;
  allowCapabilityOverrides: boolean;
  enabledMechanics: string[];
  disabledMechanics: string[];
  parameterOverrides: Record<string, unknown>;
  overrides: RuleOverride[];
}

export interface RuleProfileResolution {
  profile: RulesProfile;
  source: 'RUN' | 'WORLD' | 'DEFAULT';
  warnings: string[];
}


export interface CharacterAiExtractionSummary {
  interpretation: string;
  keyFacts: string[];
  proposedHighlights: string[];
  uncertainties?: string[];
  generationSource?: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK';
  activeModel?: string;
  activeProvider?: string;
  fallbackReason?: string;
  attemptsTrail?: Array<{
    providerId: string;
    modelId: string;
    displayName?: string;
    status: 'SUCCESS' | 'FAILED';
    latencyMs?: number;
    error?: string;
  }>;
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
  storyCheckChallenges?: StoryCheckChallenge[];
  checkFormula?: string;
  damageFormula?: string;
  effectDefinition?: CombatEffectDefinition;
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

export interface SkillProgressionHistoryEntry {
  entryIndex: number;
  timestampSeconds: number;
  changeType: 'ACQUIRED' | 'XP_AWARDED' | 'LEVEL_UP' | 'EVOLVED' | 'DOWNGRADED' | 'RELEARNED';
  details: string;
  prevLevel?: number;
  newLevel?: number;
  prevXp?: number;
  newXp?: number;
}

export interface SkillInstance {
  instanceId: string;
  actorId: string;
  capabilityId: string;
  currentLevel: number;
  currentXp: number;
  xpToNextLevel: number | null;
  evolutionPoints: number;
  evolutionLineage: string[];
  progressionHistory: SkillProgressionHistoryEntry[];
  unlockedAtSeconds: number;
  isEquippedGrant?: boolean;
  libraryEntryId?: string;
  libraryStatus?: 'NATIVE' | 'REUSED' | 'APPROVED';
  librarySourceStoryIds?: string[];
}

export interface CapabilitiesResponse {
  actorId: string;
  powerState?: PowerState;
  /**
   * Actor-resolved capabilities that are currently effective, including active
   * equipment grants. This is not the global capability registry.
   */
  capabilities: CapabilityDefinition[];
  /** Actor-owned learned capability definitions derived from SkillInstances. */
  learnedCapabilities: CapabilityDefinition[];
  /** Actor-scoped progression records for learned skills. */
  skillInstances: SkillInstance[];
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

export interface DiceTerm {
  count: number;
  sides: number;
}

export interface DeathSaveState {
  successes: number;
  failures: number;
  stable: boolean;
  lastRoll?: RollRecord;
}

export interface RollRecord {
  rollId: string;
  rulesetVersion: string;
  formula: string;
  diceTerms?: DiceTerm[];
  individualDice: number[];
  modifier: number;
  total: number;
  isCriticalSuccess: boolean;
  isCriticalFailure: boolean;
  timestamp: number;
}

export type CombatMoraleStatus = 'STEADFAST' | 'SHAKEN' | 'FLEEING' | 'SURRENDERED';

export interface CombatMoraleState {
	actorId: string;
	morale: number;
	maxMorale: number;
	fleeThreshold: number;
	surrenderThreshold: number;
	status: CombatMoraleStatus;
	lastChangeReason?: string;
	revision: number;
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
  damageType?: string;
  conditions: string[];
  isDead: boolean;
  usesDeathSaves?: boolean;
  deathSaveState?: DeathSaveState;
  combatResources?: Record<string, number>;
  bossPhaseId?: string;
  bossPhaseAbilities?: string[];
  bossTargetPriority?: string;
  bossPhaseModifiers?: Record<string, number>;
  bossEnvironmentEffects?: string[];
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
  cover?: 'NONE' | 'HALF' | 'THREE_QUARTERS' | 'TOTAL';
  initiativeModifier?: number;
  saveModifiers?: Record<string, number>;
  savingThrowModifiers?: Record<string, number>;
  reachCells?: number;
  spellAttackBonus?: number;
  spellSaveDc?: number;
  grappledBy?: string;
  damageProfile?: CharacterDamageProfile;
  conditionProfile?: CharacterConditionProfile;
  moraleState?: CombatMoraleState;
  spellSlots?: Record<number, { current: number; max: number }>;
  knownSpells?: string[];
  preparedSpells?: string[];
  activeConcentration?: ActiveConcentration | null;
}

export interface ActiveConcentration {
  spellId: string;
  spellName: string;
  slotLevel: number;
  castAtRound: number;
  castAtTurn: number;
  durationRounds: number;
  remainingRounds: number;
  casterId: string;
  targetIds: string[];
  appliedConditions: Array<{ targetId: string; condition: string; conditionInstanceId?: string }>;
  effects?: Record<string, unknown>;
}

export interface PendingActivationState {
  activationId: string;
  actorId: string;
  capabilityId: string;
  activationMode: 'charged' | 'channelled';
  targetId?: string;
  requestedScale?: 'Local' | 'Moderate' | 'WorldScale';
  remainingTurns: number;
  totalTurnsRequired: number;
  isInterruptible: boolean;
  channelSustainedTurns: number;
  startedAtRound: number;
  context?: Record<string, unknown>;
}

export type DestructibleCombatObject = DestructibleEnvironmentObject;

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
  actionType: 'MOVE' | 'ATTACK' | 'CAST' | 'ACTION' | 'CONDITION_TICK' | 'START_ACTIVATION' | 'INTERRUPT';
  headline: string;
  damageInflicted?: number;
  rollRecord?: RollRecord;
  metadata?: Record<string, unknown>;
}

export interface CombatTurnResourceSnapshot {
  actorId: string;
  round: number;
  movementRemainingCells: number;
  movementMaxCells: number;
  actionAvailable: boolean;
  bonusActionAvailable: boolean;
  reactionAvailable: boolean;
  objectInteractionAvailable: boolean;
  dashMovementBonusCells: number;
  disengaging: boolean;
  dodging: boolean;
  readyAction?: {
    actionDescription: string;
    triggerDescription: string;
    expiresOnTurnStart: boolean;
  };
}

export interface CombatStateResponse {
  storyId?: string;
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
  viewerTurnResources?: CombatTurnResourceSnapshot;
  combatEffectEvents?: CombatEventRecord[];
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



/**
 * Phase 8.6 — Universal Custom Rule & World Law contracts.
 * Rules are declarative data. They are never executable AI prose or arbitrary code.
 */
export type CustomRuleEventType =
  | 'CANONICAL_COMMAND'
  | 'TECHNIQUE_EXPLAINED'
  | 'ABILITY_USED'
  | 'ABILITY_HIT'
  | 'ABILITY_MISSED'
  | 'DAMAGE_RECEIVED'
  | 'CONDITION_APPLIED'
  | 'CONDITION_REMOVED'
  | 'ENTITY_CREATED'
  | 'ENTITY_DESTROYED'
  | 'ENTITY_MOVED'
  | 'LOCATION_ENTERED'
  | 'LOCATION_EXITED'
  | 'FACT_CHANGED'
  | 'DIALOGUE_COMPLETED'
  | 'ITEM_TRANSFERRED'
  | 'ITEM_USED'
  | 'MISSION_STATE_CHANGED'
  | 'ALARM_RAISED'
  | 'WORLD_TIME_ADVANCED'
  | 'CUSTOM';

export type CustomRuleScope = 'WORLD' | 'ACTOR' | 'TARGET' | 'LOCATION' | 'EVENT';

export type CustomRulePredicateOperator =
  | 'EQ'
  | 'NEQ'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'TRUTHY'
  | 'FALSY'
  | 'IN'
  | 'NOT_IN';

export interface CustomRuleCondition {
  id?: string;
  source: 'EVENT' | 'RULE_STATE' | 'WORLD_FACT' | 'ACTOR' | 'TARGET' | 'RELATIONSHIP' | 'KNOWLEDGE' | 'ITEM' | 'LOCATION_STATE' | 'TIME' | 'DOMAIN';
  path: string;
  operator: CustomRulePredicateOperator;
  value?: unknown;
  negate?: boolean;
}

export type CustomRuleEffect =
  | {
      type: 'APPLY_DAMAGE';
      target: 'EVENT_ACTOR' | 'EVENT_TARGET' | 'ACTOR' | 'TARGET' | 'EXPLICIT';
      actorId?: string;
      amount: number;
      damageType?: string;
    }
  | {
      type: 'MODIFY_RESOURCE';
      actorId?: string;
      resourceId: string;
      amount: number;
    }
  | {
      type: 'CREATE_ENTITY';
      entityId: string;
      entityKind: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'DESTROY_ENTITY';
      entityId: string;
    }
  | {
      type: 'MOVE_ENTITY';
      entityId: string;
      locationId: string;
    }
  | {
      type: 'TELEPORT';
      entityId: string;
      locationId: string;
    }
  | {
      type: 'ALTER_WORLD_FACT';
      subjectEntityId: string;
      predicate: string;
      objectValue: string;
      truthState?: 'TRUE' | 'FALSE' | 'UNKNOWN';
      confidence?: number;
    }
  | {
      type: 'CREATE_MISSION';
      situationId: string;
      title: string;
    }
  | {
      type: 'MODIFY_MISSION';
      situationId: string;
      objectiveId?: string;
      status?: 'OPEN' | 'ACTIVE' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'ABANDONED' | 'TRANSFORMED';
    }
  | {
      type: 'CREATE_EVIDENCE';
      evidenceId: string;
      subjectEntityId: string;
      summary: string;
      provenance: string;
    }
  | {
      type: 'CHANGE_RELATIONSHIP';
      actorId: string;
      targetId: string;
      trustDelta?: number;
      affinityDelta?: number;
      fearDelta?: number;
      respectDelta?: number;
      hostilityDelta?: number;
      evidenceIds?: string[];
    }
  | {
      type: 'ADD_KNOWLEDGE';
      actorId: string;
      factId: string;
      evidenceId: string;
      confidence?: number;
    }
  | {
      type: 'REMOVE_KNOWLEDGE';
      actorId: string;
      factId: string;
    }
  | {
      type: 'SCHEDULE_EVENT';
      eventType: string;
      executeAtSeconds: number;
      payload?: Record<string, unknown>;
    }
  | {
      type: 'SET_RULE_STATE';
      key: string;
      value: unknown;
    }
  | {
      type: 'INCREMENT_RULE_STATE';
      key: string;
      amount: number;
      min?: number;
      max?: number;
    }
  | {
      type: 'SET_WORLD_FACT';
      subjectEntityId: string;
      predicate: string;
      objectValue: string;
      truthState?: 'TRUE' | 'FALSE' | 'UNKNOWN';
      confidence?: number;
      provenanceSummary?: string;
    }
  | {
      type: 'INVERT_WORLD_FACT';
      subjectEntityId: string;
      predicate: string;
    }
  | {
      type: 'APPLY_CONDITION';
      target: 'EVENT_ACTOR' | 'EVENT_TARGET' | 'ACTOR' | 'TARGET' | 'EXPLICIT';
      actorId?: string;
      conditionDefinitionId: string;
      durationSeconds?: number | null;
      intensity?: number;
    }
  | {
      type: 'REMOVE_CONDITION';
      target: 'EVENT_ACTOR' | 'EVENT_TARGET' | 'ACTOR' | 'TARGET' | 'EXPLICIT';
      actorId?: string;
      conditionDefinitionId: string;
    }
  | {
      type: 'SET_CAPABILITY_MODIFIER';
      actorId?: string;
      capabilityId: string;
      modifier: 'DAMAGE_MULTIPLIER' | 'ENERGY_MULTIPLIER' | 'STRAIN_MULTIPLIER' | 'SCALE_MULTIPLIER';
      value: number;
    }
  | {
      type: 'CLEAR_CAPABILITY_MODIFIER';
      actorId?: string;
      capabilityId: string;
      modifier: 'DAMAGE_MULTIPLIER' | 'ENERGY_MULTIPLIER' | 'STRAIN_MULTIPLIER' | 'SCALE_MULTIPLIER';
    }
  | {
      type: 'ENABLE_RULE';
      ruleId: string;
    }
  | {
      type: 'DISABLE_RULE';
      ruleId: string;
    };

export interface CustomRuleDefinition {
  id: string;
  name: string;
  version: number;
  enabled: boolean;
  priority: number;
  scope: CustomRuleScope;
  trigger: {
    event: CustomRuleEventType | string;
    eventType?: CustomRuleEventType | string;
    actionKeywords?: string[];
    capabilityId?: string;
    subjectEntityId?: string;
  };
  conditions: CustomRuleCondition[];
  effects: CustomRuleEffect[];
  durationSeconds?: number | null;
  tags?: string[];
  description?: string;
  provenance: CharacterProvenanceSource | 'WORLD_CANON' | 'SYSTEM_DERIVED';
}

export interface CustomRuleState {
  schemaVersion: number;
  flags: Record<string, boolean>;
  counters: Record<string, number>;
  values: Record<string, unknown>;
  activeRuleIds: string[];
  capabilityModifiers: Record<string, Record<string, Record<string, number>>>;
  firedEventIds: string[];
  updatedAtSeconds: number;
}

export interface CustomRuleEvent {
  eventId: string;
  storyId: string;
  type: CustomRuleEventType | string;
  actorId?: string;
  targetId?: string;
  locationId?: string;
  capabilityId?: string;
  actionText?: string;
  payload?: Record<string, unknown>;
  timestampSeconds: number;
  sourceEventId?: string;
}

export interface CustomRuleEvaluationResult {
  success: boolean;
  eventId: string;
  matchedRuleIds: string[];
  appliedRuleIds: string[];
  emittedWarnings: string[];
  errorReason?: string;
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
  truthState?: 'TRUE' | 'FALSE' | 'UNKNOWN';
}

export interface WorldVisualIdentity {
  version: number;
  kind: 'WORLD';
  worldId: string;
  title: string;
  worldSummary: string;
  setting?: string;
  environment?: string;
  genreTags: string[];
  toneTags: string[];
  era?: string;
  factions: string[];
  magicOrTechnology?: string;
  geography?: string;
  visualMotifs: string[];
}

export interface StoryRunVisualIdentity extends Omit<WorldVisualIdentity, 'kind' | 'worldId'> {
  kind: 'STORY_RUN';
  storyId: string;
  worldId: string;
  adventureContext: string;
  characterName: string;
  storyMode: string;
  dndRulesMode: string;
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
  dndRulesMode?: DndRulesMode;
  rulesProfile?: RulesProfile;
  visibility: string;
  creatorId: string;
  sourcePolicy: string;
  defaultEra: string;
  worldManifestVersion: number;
  versionHash: string;
  canonicalCapabilities: any[];
  capabilities: any[];
  worldRules: any[];
  customRules?: CustomRuleDefinition[];
  ruleConstraints: string[];
  worldFacts: WorldFact[];
  createdAt: string;
  updatedAt: string;
  // Advanced & Canonical Discovery Fields (CH16)
  setting?: string;
  era?: string;
  source?: string;
  playstyle?: string;
  storyMode?: CharacterStoryMode;
  narrativeProfile?: NarrativeProfile;
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
  hazards?: any[];
  storyCheckChallenges?: StoryCheckChallenge[];
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
  narrativeProfile?: Partial<NarrativeProfile>;
  dndRulesMode?: DndRulesMode;
  rulesProfile?: Partial<RulesProfile>;
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
  hazards?: any[];
  storyCheckChallenges?: StoryCheckChallenge[];
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


export type ConditionAlignment = 'HARMFUL' | 'BENEFICIAL' | 'NEUTRAL' | 'MIXED';
export type ConditionTickUnit = 'ACTION' | 'TURN' | 'ROUND' | 'MINUTE' | 'HOUR' | 'DAY' | 'WORLD_TIME';
export type ConditionStackMode = 'REPLACE' | 'ADD' | 'MAX' | 'REFRESH';
export type BodyRegionId =
  | 'HEAD'
  | 'FACE'
  | 'TORSO'
  | 'HEART'
  | 'LEFT_ARM'
  | 'RIGHT_ARM'
  | 'LEFT_HAND'
  | 'RIGHT_HAND'
  | 'LEFT_LEG'
  | 'RIGHT_LEG'
  | 'LEFT_FOOT'
  | 'RIGHT_FOOT'
  | 'WHOLE_BODY'
  | string;

export interface CharacterDamageProfile {
  damageImmunities: string[];
  damageResistances: string[];
  damageVulnerabilities: string[];
}

export interface CharacterConditionProfile {
  conditionImmunities: string[];
  conditionResistances: string[];
  conditionVulnerabilities: string[];
}

export interface CharacterBodyRegionState {
  id: BodyRegionId;
  label: string;
  integrityCurrent: number;
  integrityMax: number;
  destroyed: boolean;
  conditionIds: string[];
}

export interface CharacterConditionStage {
  id: string;
  name: string;
  minIntensity: number;
  maxIntensity?: number;
  description: string;
  effects: CharacterEffect[];
  bodyEffects?: Array<{
    regionId: BodyRegionId;
    integrityDelta?: number;
    integrityMultiplier?: number;
  }>;
}

export interface CharacterConditionTrigger {
  id: string;
  event:
    | 'ON_APPLY'
    | 'ON_ACTION'
    | 'ON_TICK'
    | 'ON_REMOVE'
    | 'ON_REST'
    | 'ON_ATTACK'
    | 'ON_HIT'
    | 'ON_MISS'
    | 'ON_DAMAGE'
    | 'ON_SAVE'
    | 'ON_MOVE'
    | 'ON_KILL'
    | 'ON_DEATH'
    | 'ON_REACTION'
    | 'ON_ROUND_START'
    | 'ON_ROUND_END';
  actionKeywords?: string[];
  intensityDelta?: number;
  healingAmount?: number;
  addConditionIds?: string[];
  removeConditionIds?: string[];
  description?: string;
}

export interface CharacterConditionInstance {
  id: string;
  definitionId: string;
  name: string;
  alignment: ConditionAlignment;
  severity: number;
  intensity: number;
  maxIntensity?: number;
  source?: string;
  sourceActorId?: string;
  appliedAtSeconds: number;
  durationSeconds?: number | null;
  remainingDurationSeconds?: number | null;
  tickUnit?: ConditionTickUnit;
  tickEvery?: number;
  nextTickAtSeconds?: number;
  stackCount: number;
  stackMode: ConditionStackMode;
  tags: string[];
  affectedBodyRegions?: BodyRegionId[];
  notes?: string;
}

export interface CharacterConditionDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  alignment: ConditionAlignment;
  defaultSeverity: number;
  defaultIntensity: number;
  maxIntensity?: number;
  stackMode?: ConditionStackMode;
  defaultDurationSeconds?: number | null;
  tickUnit?: ConditionTickUnit;
  tickEvery?: number;
  tags?: string[];
  conditionKeywords?: string[];
  damagePerTick?: number;
  damageType?: string;
  healingPerTick?: number;
  intensityDeltaPerTick?: number;
  decayIntensityPerRestTick?: number;
  triggers?: CharacterConditionTrigger[];
  stages?: CharacterConditionStage[];
  bodyRegionDefaults?: BodyRegionId[];
  blocksActions?: string[];
  modifierEffects?: CharacterEffect[];
}

export interface CharacterStartingConditionState {
  instances: CharacterConditionInstance[];
  customDefinitions?: CharacterConditionDefinition[];
  damageProfile: CharacterDamageProfile;
  conditionProfile: CharacterConditionProfile;
  bodyRegions: CharacterBodyRegionState[];
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
  checkFormula?: string;
  damageFormula?: string;
  provenance: CharacterProvenanceSource;
}

export interface StartingEquipmentItem {
  id: string;
  defId?: string;
  name: string;
  category: 'Weapon' | 'Armor' | 'Shield' | 'Potion' | 'Scroll' | 'Quest' | 'Material' | 'Document' | 'Food' | 'Accessory' | 'Tool' | 'Miscellaneous' | string;
  equipmentClass?: EquipmentClass;
  equipable?: boolean;
  allowedSlots?: EquipmentSlotId[];
  handUsage?: HandUsage;
  description?: string;
  slot?: EquipmentSlotId | string;
  isEquipped: boolean;
  quantity: number;
  rarity?: string;
  weightKg?: number;
  durability?: number;
  maxDurability?: number;
  properties?: Record<string, unknown> | string[];
  effects?: CharacterEffect[];
  sourceUserPrompt?: string;
  provenance: CharacterProvenanceSource;
  icon?: ItemOrSkillIcon;
  modifiers?: Array<Record<string, unknown>>;
  customRules?: CustomRuleDefinition[];
  maxCharges?: number;
  consumptionMode?: 'QUANTITY' | 'CHARGE' | 'DESTROY';
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
  source?: 'UPLOAD' | 'AI_GENERATED' | 'BROWSE' | 'EMOJI' | 'DEFAULT';
  pinned?: boolean;
}

export interface CharacterGenesisRevision {
  revision: number;
  savedAt: string;
  label: string;
  snapshot: Partial<CharacterGenesisDraft>;
}

export interface CharacterCoreStats {
  level: number;
  armorClass: number;
  speed: number;
  hitDice: string;
  hpCurrent: number;
  hpMax: number;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  savingThrowProficiencies?: StoryCheckAbility[];
}

export interface CharacterProgressionCustomModule {
  id: string;
  type: 'CLASS' | 'SUBCLASS' | 'SPECIES';
  name: string;
  version: number;
  enabled: boolean;
  aliases?: string[];
  parentClassId?: string;
  minLevel?: number;
  prerequisites?: string[];
  features: Array<{
    id: string;
    name: string;
    description: string;
    level: number;
    enabled: boolean;
    passiveModifiers?: Array<{
      id: string;
      target: string;
      mode: 'ADD' | 'MULTIPLY' | 'SET' | 'MIN' | 'MAX';
      value: number;
      precedence: number;
      stackGroup?: string;
      source?: Record<string, unknown>;
    }>;
    triggeredAbilities?: Array<Record<string, unknown>>;
  }>;
  provenance: string;
}

export interface CharacterProgressionSelection {
  classId?: string;
  subclassId?: string;
  speciesId?: string;
  featIds?: string[];
  moduleIds?: string[];
  customModules?: CharacterProgressionCustomModule[];
}

export interface EntityCardProjection {
	id: string;
	storyId: string;
	worldId?: string;
	name: string;
	kind: string;
	templateId?: string;
	isTemplate: boolean;
	identity: { species?: string; lineage?: string; age?: number | string; gender?: string; aliases: string[] };
	classification: { role?: string; archetype?: string; profession?: string; threat?: string; rarity?: string; tags: string[] };
	progression?: CharacterProgressionSelection & { level: number };
	coreStats?: { level?: number; hpCurrent?: number; hpMax?: number; armorClass?: number; speed?: number; hitDice?: string; abilityScores: Record<string, number> };
	personality: { traits: string[]; temperament?: string; values: string[]; motivations: string[]; fears: string[]; desires: string[]; dialogueStyle?: string };
	behavior: { defaultBehavior?: string; combatBehavior?: string; threatResponse?: string; priorities: string[]; routines?: string[] };
	social: { alignment?: string; factionIds: string[]; role?: string; reputation: Record<string, number>; relationships: Record<string, Record<string, number | undefined>> };
	economy?: { wealth?: number; currency: Record<string, number>; inventoryItemIds: string[]; inventorySummary: string[]; assets: string[] };
	background?: { origin?: string; upbringing?: string; history?: string; importantEvents: string[] };
	worldState: { locationId?: string; currentActivity?: string; destinationLocationId?: string; currentGoal?: string; isAlive: boolean; presence: 'present' | 'absent' | 'unknown' };
	traits: string[];
	capabilities: Array<Record<string, unknown>>;
	feats: Array<Record<string, unknown>>;
	equipment: string[];
	memoryRefs: string[];
	dossierId?: string;
	lifecycle: { status: string; lastActiveAt?: string; lastSeenAt?: string; archivedAt?: string; deadAt?: string };
	provenance: { source: string; createdBy: 'PLAYER' | 'AI' | 'SYSTEM' | 'IMPORTED'; confidence?: number };
	metadata: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
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
  conditionState?: CharacterStartingConditionState;
  coreStats?: CharacterCoreStats;
  attributes: CharacterStatDefinition[];
  stats: CharacterStatDefinition[];
  traits: string[];
  capabilities: CapabilityDefinition[];
  customRules?: CustomRuleDefinition[];
  generatedSkills: GeneratedTechnique[];
  skills?: CharacterSkill[];
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
  narrativeProfile?: NarrativeProfile;
  dndRulesMode?: 'FULL_DND' | 'HYBRID_DND' | 'CUSTOM_HOMEBREW_DND';
  progression?: CharacterProgressionSelection;
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
  conditionState?: CharacterStartingConditionState;
  coreStats?: CharacterCoreStats;
  attributes: CharacterStatDefinition[];
  stats: CharacterStatDefinition[];
  traits: string[];
  capabilities: CapabilityDefinition[];
  customRules?: CustomRuleDefinition[];
  generatedSkills: GeneratedTechnique[];
  skills?: CharacterSkill[];
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
  narrativeProfile?: NarrativeProfile;
  dndRulesMode?: 'FULL_DND' | 'HYBRID_DND' | 'CUSTOM_HOMEBREW_DND';
  progression?: CharacterProgressionSelection;
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

export interface CustomFeatProposalRequest {
  worldId: string;
  featName: string;
  featConcept: string;
  characterContext?: {
    role?: string;
    background?: string;
    species?: string;
  };
}

export interface CustomAttributeProposalRequest {
  worldId: string;
  attributeName: string;
  attributeConcept: string;
  category?: 'custom_attribute' | 'world_stat' | string;
  characterContext?: {
    role?: string;
    background?: string;
    species?: string;
  };
}

export interface CustomSkillProposalRequest {
  worldId: string;
  skillName: string;
  skillConcept: string;
  characterContext?: {
    role?: string;
    background?: string;
    species?: string;
  };
}

export interface CustomEquipmentProposalRequest {
  worldId: string;
  itemName: string;
  itemConcept: string;
  characterContext?: {
    role?: string;
    background?: string;
    species?: string;
  };
}







// Phase 8.5 — Unified combat/effect resolution contracts.
export type CombatResolutionMode =
	| 'SINGLE_ATTACK'
	| 'MULTI_INSTANCE'
	| 'SAVE'
	| 'AREA'
	| 'CHAIN'
	| 'SEQUENCE'
	| 'OUTCOME'
	| 'WORLD_EFFECT';

export type CombatEffectScale =
	| 'PERSON'
	| 'GROUP'
	| 'ENCOUNTER'
	| 'STRUCTURE'
	| 'DISTRICT'
	| 'CITY'
	| 'REGION'
	| 'CONTINENT'
	| 'PLANET'
	| 'COSMIC';

export type CombatTargetingMode =
	| 'SELF'
	| 'ALLY'
	| 'ENEMY'
	| 'ONE_TARGET'
	| 'MULTI_TARGET'
	| 'PER_INSTANCE'
	| 'ALL_IN_AREA'
	| 'CHAIN'
	| 'RANDOM_LEGAL_TARGET';

export type CombatActionCost = 'ACTION' | 'BONUS_ACTION' | 'REACTION' | 'FREE';

export type CombatHitLocationMode = 'NONE' | 'EXPLICIT' | 'DETERMINISTIC';

export type CombatForcedMovementType = 'PUSH' | 'PULL';

export type CombatCollisionKind =
  | 'WALL'
  | 'BOUNDARY'
  | 'DESTRUCTIBLE_OBJECT'
  | 'CREATURE';

export interface CombatCollisionProfile {
  /** Optional formula for secondary damage dealt to the forced-moving creature. */
  damageFormula?: string;
  /** Damage type used for secondary impact damage. Defaults to bludgeoning. */
  damageType?: string;
  /** Optional formula for damage dealt to a destructible environment object. Falls back to damageFormula. */
  objectDamageFormula?: string;
  /** Optional formula for damage dealt to another creature on body collision. */
  creatureDamageFormula?: string;
  /** Stop when the first collision is encountered. Defaults to true. */
  stopOnCollision?: boolean;
  /** Maximum number of collision points that one movement may resolve. */
  maxCollisions?: number;
}

export interface CombatForcedMovementDefinition {
  type: CombatForcedMovementType;
  /** Number of grid cells to attempt to move. Bounded by the combat authority. */
  distanceCells: number;
  collision?: CombatCollisionProfile;
}

export interface CombatMovementCollisionResult {
  kind: CombatCollisionKind;
  blockerId?: string;
  blockerName?: string;
  position: { x: number; y: number };
  attemptedPosition: { x: number; y: number };
  damageToMover: number;
  damageToObject: number;
  damageToCreature: number;
  targetDied: boolean;
  objectDestroyed: boolean;
}

export interface CombatForcedMovementResult {
  moved: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
  requestedDistanceCells: number;
  actualDistanceCells: number;
  collision?: CombatMovementCollisionResult;
  collisions?: CombatMovementCollisionResult[];
  collisionsResolved: number;
}

export type CombatOutcomeType =
	| 'INSTANT_DEFEAT'
	| 'ERASE_FROM_WORLD'
	| 'DOWNED'
	| 'BANISHED'
	| 'TELEPORTED'
	| 'TRANSFORMED'
	| 'SEALED'
	| 'SUMMONED'
	| 'RESOURCE_GRANTED'
	| 'RESOURCE_REMOVED'
	| 'ENVIRONMENT_DAMAGED'
	| 'ENVIRONMENT_DESTROYED'
	| 'WORLD_STATE_CHANGED';

export interface CombatConditionEffectDefinition {
	trigger: 'ON_HIT' | 'ON_MISS' | 'ON_CRITICAL' | 'ON_SAVE_SUCCESS' | 'ON_SAVE_FAILURE' | 'ALWAYS';
	conditionIdOrName: string;
	intensity?: number;
	severity?: number;
	durationSeconds?: number | null;
	notes?: string;
}

export type CombatExecutionMode =
  | 'AUTOMATIC'
  | 'CHECK_REQUIRED'
  | 'CONTEXTUAL'
  | 'CONCENTRATION';

export interface CombatEffectDefinition {
	id: string;
	name: string;
	resolutionMode: CombatResolutionMode;
	scale: CombatEffectScale;
	actionCost?: CombatActionCost;
	executionMode?: CombatExecutionMode;
	executionDifficultyClass?: number;
	executionFormula?: string;
	executionFailureOutcome?: CombatOutcomeType;
	targetingMode?: CombatTargetingMode;
	instanceCount?: number;
	instanceTargetIds?: string[];
	maxTargets?: number;
	attackFormula?: string;
	saveFormula?: string;
	damageFormula?: string;
	areaShape?: 'POINT' | 'LINE' | 'CONE' | 'CIRCLE' | 'SPHERE' | 'RING' | 'WALL';
	areaRadiusCells?: number;
	areaInnerRadiusCells?: number;
	areaWidthCells?: number;
	rangeCells?: number;
	requiresLineOfSight?: boolean;
	chainJumpRangeCells?: number;
	damageType?: string;
	attackBonusOverride?: number;
	advantage?: boolean;
	disadvantage?: boolean;
	savingThrowAbility?: string;
	difficultyClass?: number;
	halfDamageOnSave?: boolean;
	outcome?: CombatOutcomeType;
	outcomeReason?: string;
	outcomePayload?: Record<string, unknown>;
	chainCount?: number;
	sequence?: Array<CombatEffectDefinition>;
	targetIds?: string[];
	rangeValidationMode?: 'AUTO' | 'ORIGIN' | 'EACH_TARGET' | 'BOTH';
	hitLocationMode?: CombatHitLocationMode;
	targetBodyRegionId?: BodyRegionId;
	retargetPolicy?: 'NONE' | 'RETARGET_ON_DEATH';
	forcedMovement?: CombatForcedMovementDefinition;
	animationPlanId?: string;
	conditionEffects?: CombatConditionEffectDefinition[];
	assetRefs?: string[];
	visualStyle?: string;
	aiGenerated?: boolean;
	provenance?: string;
}

export interface DestructibleEnvironmentObject {
	id: string;
	name: string;
	x: number;
	y: number;
	hpCurrent: number;
	hpMax: number;
	isDestroyed: boolean;
	damageTypes?: {
		resistances?: string[];
		immunities?: string[];
		vulnerabilities?: string[];
	};
	tags?: string[];
}

export interface CombatAttackInstanceResult {
	instanceIndex: number;
	targetId: string;
	hits: boolean;
	isCritical: boolean;
	damage: number;
	secondaryDamage?: number;
	targetDied: boolean;
	hitLocation?: BodyRegionId;
	destroyedBodyRegions?: BodyRegionId[];
	roll?: unknown;
	attackRollTotal?: number;
	targetArmorClass?: number;
	damageRoll?: unknown;
	forcedMovement?: CombatForcedMovementResult;
	defense?: {
		immune?: boolean;
		resisted?: boolean;
		vulnerable?: boolean;
	};
}

export interface CombatEffectResult {
	success: boolean;
	errorReason?: string;
	actionConsumed?: boolean;
	effectId?: string;
	effectName?: string;
	instances?: CombatAttackInstanceResult[];
	totalDamage?: number;
	secondaryDamage?: number;
	defeatedTargetIds?: string[];
	outcome?: CombatOutcomeType;
	canonicalEventIds?: string[];
	animationPlan?: CombatAnimationPlan;
	executionResult?: { success: boolean; mode: CombatExecutionMode; roll?: unknown; difficultyClass?: number; reason?: string };
	conditionsApplied?: Array<{ targetId: string; conditionIdOrName: string; trigger: CombatConditionEffectDefinition['trigger']; applied: boolean; immune: boolean }>;
	worldEffectPreview?: {
		scale: CombatEffectScale;
		outcome?: CombatOutcomeType;
		targetIds: string[];
		abstraction: 'TACTICAL' | 'MACRO';
		changedScopes: string[];
	};
}

export interface CombatEventRecord {
	eventId: string;
	actionId: string;
	eventType: string;
	turnNumber: number;
	actorId: string;
	targetId?: string;
	instanceIndex?: number;
	headline: string;
	attackRoll?: unknown;
	saveRoll?: unknown;
	damageRoll?: unknown;
	damage?: number;
	finalDamage?: number;
	isCritical?: boolean;
	metadata?: Record<string, unknown>;
}

export interface TacticalPlanStepState {
	id: string;
	actionType: 'MOVE' | 'ATTACK' | 'CAST' | 'RETREAT' | 'DEFEND_ALLY' | 'END_TURN';
	targetId?: string;
	targetPosition?: { x: number; y: number };
	capabilityId?: string;
	trigger?: string;
	contingency?: string;
}

export interface TacticalPlanState {
	planId: string;
	actorId: string;
	objective: string;
	steps: TacticalPlanStepState[];
	currentStepIndex: number;
	status: 'ACTIVE' | 'REPLANNING' | 'ABORTED' | 'COMPLETED';
	revision: number;
	source: 'AI' | 'DETERMINISTIC_FALLBACK';
	updatedTurn: number;
	updatedAt: string;
}

export interface TacticalCombatStateExport {
	participants: BattlefieldParticipant[];
	hazards: DynamicHazardZone[];
	obstacles?: { x: number; y: number; isImpassable?: boolean }[];
	mapBounds?: { minX: number; maxX: number; minY: number; maxY: number };
	turnQueue: string[];
	currentTurnIndex: number;
	currentRound: number;
	eventLog: BattleEvent[];
	pendingActivations?: PendingActivationState[];
	turnResources?: CombatTurnResourceSnapshot[];
	seed?: number;
	rollCounter?: number;
	rulesProfile?: RulesProfile;
	spellRuntimeState?: any;
	combatEffectEvents?: CombatEventRecord[];
	combatActionSequence?: number;
	destructibleObjects?: DestructibleCombatObject[];
	combatReplayRecords?: CombatReplayRecord[];
	moraleStates?: any;
	bossPhaseStates?: Array<{ bossId: string; phaseId: string; modifiers: Record<string, number>; abilities: string[]; targetPriority?: string; environmentEffects: string[] }>;
	conditionEngineState?: any;
	progressionResolutions?: Record<string, any>;
	tacticalPlans?: Record<string, TacticalPlanState>;
}

export interface CombatReplayRecord {
	id: string;
	actionId: string;
	turnNumber: number;
	actorId: string;
	targetIds: string[];
	definition: CombatEffectDefinition;
	seedBefore: number;
	rollCounterBefore: number;
	beforeState: TacticalCombatStateExport;
	canonicalEventIds: string[];
	resultSignature: {
		success: boolean;
		totalDamage?: number;
		defeatedTargetIds?: string[];
		affectedEntityIds?: string[];
		instanceCount: number;
	};
	consumeAction: boolean;
	replayMode?: 'COMBAT_EFFECT' | 'WORLD_PREVIEW';
	createdAtSequence: number;
}

export interface CombatAnimationTrack {
	id: string;
	trigger: 'ACTION_START' | 'INSTANCE' | 'ACTION_COMPLETE' | 'WORLD_EFFECT';
	visual: string;
	instanceIndex?: number;
	delayMs?: number;
	durationMs?: number;
	condition?: 'ALWAYS' | 'HIT' | 'MISS' | 'CRITICAL';
}

export interface CombatAnimationPlan {
	id: string;
	composition: string;
	sequence: 'INSTANT' | 'SEQUENTIAL' | 'PARALLEL';
	count?: number;
	origin?: string;
	impact?: string;
	criticalImpact?: string;
	missBehavior?: string;
	style?: string;
	assetRefs?: string[];
	assetUrls?: string[];
	tracks?: CombatAnimationTrack[];
	generatedBy?: 'SYSTEM' | 'AI';
	provenance?: string;
}
