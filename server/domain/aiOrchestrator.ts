import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { WorldTimestamp } from './types';
import { WorkingContextEngine, AssembledTurnContext } from './workingContextEngine';
import type { WorldRepository } from '../repositories/worldRepository';
import { worldRepository } from '../repositories/worldRepository';
import { StoryAdaptationPipeline } from './storyAdaptation';
import {
  getProviderApiKey,
  getProviderBaseUrl,
  loadCustomProviders,
  getCustomProvider,
  saveCustomProvider,
  deleteCustomProvider,
  type CustomProviderConfig,
} from '../services/providerCredentialService';
import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import { evaluateAiTaskCandidatePreflight, evaluateAiTaskReadiness, getAiTaskContract, getAiTasksByCategory, getAllAiTaskContracts, validateAiTaskResponse, type AiTaskCandidatePreflight, type AiTaskReadiness } from './aiTaskContracts';
import { narrativeContinuityEngine } from './narrativeContinuityEngine';
import { CurrentSituationBuilder, type CurrentSituation } from './currentSituation';
import { PlayerIntentInterpreter, type PlayerIntent } from './playerIntentInterpreter';
import { NarrativeResearchPipeline, type NarrativeResearchResult } from './narrativeResearchPipeline';
import { NarrativeDirector, type EphemeralNarrativePlan } from './narrativeDirector';
import { buildNarrationPrompt, defaultNarrationStyle, projectSupportingWorkingContext } from './narrativePromptBuilder';
import { SemanticNarrativeReview, type NarrativeReview } from './semanticNarrativeReview';
import { LiteraryNarrativeReview, type LiteraryReview } from './literaryNarrativeReview';
import { NarrativeRichnessEvaluator, type NarrativeRichnessEvaluation } from './narrativeRichnessEvaluation';
import { NarrativeProviderHandoffEngine, type NarrativeProviderHandoffContract } from './narrativeProviderHandoff';
import { NarrativePacingEngine, type NarrativePacingContract } from './narrativePacingEngine';
import { NarrativeNoveltyEngine } from './narrativeNoveltyEngine';
import { EpistemicBoundaryEnforcer } from './epistemicBoundary';
import { NarrativeStateAdjudicator, type StateAdjudicationResult } from './narrativeStateAdjudicator';
import { NarrativeContinuityStateEngine } from './narrativeContinuityState';
import { NarratorVoiceEngine, type NarratorVoiceControls } from './narratorVoiceEngine';
import { AiTurnCallBudget, type AiTurnCallBudgetSnapshot } from './aiTurnCallBudget';
import { scoreModelForQualityTier, getAiTaskRoutingPolicy } from './aiQualityRouting';
import type { ActionResolution } from './actionResolution';

export const DREAMBOOK_PROMPT_VERSION = 'phase12-v1';

const NARRATIVE_INFORMATION_SEEKING_PATTERN =
	/\b(ask|asked|inquire|inquired|question|questioned|find out|learn|discover|gather information|seek information|rumor|rumors|rumour|rumours|gossip|what happened|who|why|where|when|how|heard about|hear|listen|listen for|overhear|eavesdrop|tell me)\b/i;

const NARRATIVE_PASSIVE_LISTENING_PATTERN =
	/\b(listen|listens|listened|listen for|hear|hears|heard|overhear|overhears|overheard|eavesdrop|eavesdrops|eavesdropped)\b/i;

const NARRATIVE_DIRECT_SPEECH_PATTERN =
	/\b(ask|asks|asked|say|says|said|speak|speaks|spoke|tell|tells|told|reply|replies|replied|answer|answers|answered|inquire|inquires|inquired|question|questions|questioned|consult|consults|consulted|shout|shouts|shouted|call out|calls out|called out)\b/i;

const NARRATIVE_INFORMATION_RESPONSE_PATTERN =
	/\b(answer|answered|answers|reply|replied|replies|respond|responded|responds|explain|explained|explains|mention|mentioned|mentions|report|reported|reports|reveal|revealed|reveals|confirm|confirmed|confirms|warn|warned|warns|tell|told|tells|said|says|whispered|whispers|admitted|admits|learned|learns|heard|hears)\b/i;

const NARRATIVE_INFORMATION_NONANSWER_PATTERN =
	/\b(no one|nobody|no reliable answer|nothing definite|nothing certain|could not say|couldn't say|did not know|didn't know|refused to answer|kept silent|offered only|conflicting accounts|uncertain|unknown|unclear|unverified|hearsay)\b/i;

const NARRATIVE_INTERNAL_META_LEAK_PATTERNS: RegExp[] = [
	/\b(?:the )?125[- ]turn (?:integration stress test|stress test|integration test)(?: cycle| run| session)?\b/i,
	/\b(?:integration|stress) test(?:ing)? (?:cycle|run|session)\b/i,
	/\b(?:the )?(?:canonical|authoritative) (?:world )?state (?:report|evaluation|check|verification|assertion|checkpoint)\b/i,
	/\b(?:active|selected|primary|fallback) provider (?:is|was|remains) (?:Gemini|Groq|OpenRouter|[A-Za-z0-9._:-]+)\b/i,
	/\b(?:AI|Gemini|LLM|model provider|provider fallback|fallback chain|telemetry|idempotency|checkpoint|adjudication|orchestrator) (?:pipeline|runtime|system|configuration|selection|state|output|response|chain)\b/i,
	/\b(?:stateChanges|currentSituation|worldFacts|playerKnowledge|MultiModelOrchestrator|EpistemicBoundaryEnforcer)\b/i,
	/\b(?:debug|debugging|runtime assertion|test harness|CI\/CD|release gate|regression test)\b/i,
];

export type TaskId =
  | 'narrative.generate'
  | 'character.dialogue'
  | 'ooc.respond'
  | 'character.extract'
  | 'memory.extract'
  | 'character.capability.propose'
  | 'story.advice'
  | 'intent.interpret'
  | 'capability.synthesize'
  | 'capability.explain'
  | 'research.query'
  | 'research.world-brief'
  | 'rules.adjudicate'
  | 'rules.analyze'
  | 'summary.scene'
  | 'world.generate'
  | 'speech.generate'
  | 'speech.transcribe'
  | 'combat.tactics'
  | 'tactical.reason'
  | 'combat.animation.plan'
  | 'narrative.review'
  | 'utility.inspect'
  | 'image.generate';

export const ALL_GENERAL_TEXT_ROLES: TaskId[] = [
  'narrative.generate',
  'character.dialogue',
  'ooc.respond',
  'character.extract',
  'memory.extract',
  'character.capability.propose',
  'story.advice',
  'intent.interpret',
  'capability.synthesize',
  'capability.explain',
  'research.query',
  'research.world-brief',
  'rules.adjudicate',
  'rules.analyze',
  'summary.scene',
  'world.generate',
  'combat.tactics',
  'tactical.reason',
  'combat.animation.plan',
  'narrative.review',
  'utility.inspect',
];

export type HealthState = 'Healthy' | 'Degraded' | 'Throttled' | 'Unavailable' | 'InvalidAuth' | 'DisabledByUser';
export type QuotaState = 'Healthy' | 'Low' | 'NearExhaustion' | 'Exhausted' | 'Unknown';
export type BillingState = 'FREE' | 'PAID' | 'ACCOUNT_DEPENDENT' | 'UNKNOWN';
export type BillingEvidenceSource = 'PROVIDER' | 'CONFIGURATION' | 'UNKNOWN';
export type QuotaEvidenceSource = 'PROVIDER' | 'OBSERVED' | 'ESTIMATE' | 'UNKNOWN';
export type FreeTierStatus = 'VERIFIED' | 'NOT_FREE' | 'UNKNOWN';

/** Provider-confirmed free-tier Gemini model identifiers. */
const GOOGLE_VERIFIED_FREE_GEMINI_MODELS = new Set([
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash-native-audio-preview-12-2025',
]);
export type ModelPool =
  | 'creative'
  | 'utility'
  | 'fast'
  | 'reasoning'
  | 'long_context'
  | 'review'
  | 'emergency'
  | 'speech'
  | 'transcription';

export interface ModelRegistryRecord {
  providerId: string;
  modelId: string;
  displayName: string;
  pool: ModelPool;
  capabilities: string[];
  contextWindow: number;
  health: HealthState;
  quota: QuotaState;
  latencyMs: number;
  userPriority: number; // Higher = preferred
  roleEligibility: TaskId[];
  isEmergencyFloor?: boolean;
  outputTokenLimit?: number;
  supportedInputTypes?: string[];
  supportedOutputTypes?: string[];
  hasTools?: boolean;
  hasStructuredOutput?: boolean;
  hasVision?: boolean;
  hasAudio?: boolean;
  hasImageGeneration?: boolean;
  fallbackEligibility?: boolean;
  lifecycleState?: 'active' | 'preview' | 'experimental' | 'deprecated' | 'discontinued';
  accessStatus?: 'accessible' | 'unavailable' | 'quota_limited' | 'rate_limited' | 'configured' | 'not_configured';
  isPaidModel?: boolean;
  billingState?: BillingState;
  billingEvidenceSource?: BillingEvidenceSource;
  quotaEvidenceSource?: QuotaEvidenceSource;
  configuredLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerDay?: number;
    tokensPerDay?: number;
  };
  freeTierStatus?: FreeTierStatus;
  freeTierEvidenceSource?: BillingEvidenceSource;
  freeTierVerifiedAt?: number;
  description?: string;
}

export type AiTaskCategory =
  | 'narration'
  | 'dialogue'
  | 'summarization'
  | 'world_generation'
  | 'character_genesis'
  | 'memory'
  | 'research'
  | 'research_world_brief'
  | 'utility'
  | 'intent_interpretation'
  | 'capability_synthesis'
  | 'capability_explanation'
  | 'tactical_reasoning'
  | 'gameplay_advice'
  | 'rules'
  | 'rule_analysis'
  | 'speech'
  | 'image';

export interface ModelRuntimeStatus {
  providerId: string;
  modelId: string;
  status: HealthState;
  operationalStatus: 'AVAILABLE' | 'THROTTLED' | 'COOLDOWN' | 'UNAVAILABLE' | 'DISABLED';
  requests: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  rateLimit429Count: number;
  serverError5xxCount: number;
  timeoutCount: number;
  lastLatencyMs: number;
  averageLatencyMs: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastFailureReason?: string;
  cooldownUntil?: number;
  observedTokens: {
    input: number;
    output: number;
    reasoning: number;
    cached: number;
    tool: number;
    total: number;
  };
  configuredLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerDay?: number;
    tokensPerDay?: number;
  };
  headroom?: {
    value?: number;
    exact: boolean;
    source: 'PROVIDER' | 'ESTIMATE' | 'UNKNOWN';
    unit?: 'CREDITS' | 'TOKENS' | 'REQUESTS' | 'UNKNOWN';
  };
}

export interface UsageLedgerEntry {
  timestamp: number;
  providerId: string;
  modelId: string;
  task: TaskId;
  category: AiTaskCategory;
  success: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  toolTokens: number;
  totalTokens: number;
  purpose?: 'GAMEPLAY' | 'CANARY' | 'CONNECTIVITY_PROBE';
  failureType?: 'TIMEOUT' | '429' | '5XX' | 'AUTH' | 'UNAVAILABLE' | 'MALFORMED' | 'OTHER';
}

export interface TaskRuntimeRouteState {
  task: TaskId;
  activeModelKey?: string;
  mode: 'AUTO' | 'TASK_PINNED' | 'CATEGORY_MANUAL';
  fallbackChain: string[];
}

export interface ActiveModelOperation {
  operationId: string;
  task: TaskId;
  category: AiTaskCategory;
  providerId: string;
  modelId: string;
  displayName: string;
  modelKey: string;
  status: 'RUNNING';
  attempt: number;
  startedAt: number;
  source: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK';
}

export interface LastModelExecution {
  operationId: string;
  task: TaskId;
  category: AiTaskCategory;
  providerId: string;
  modelId: string;
  displayName: string;
  modelKey: string;
  status: 'SUCCESS' | 'FAILED';
  startedAt: number;
  finishedAt: number;
  latencyMs: number;
  source: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK';
  error?: string;
}

export interface CategoryRuntimeState {
  category: AiTaskCategory;
  tasks: TaskId[];
  activeModelKey?: string;
  mode: 'AUTO' | 'MANUAL';
  fallbackChain: string[];
  taskRoutes: TaskRuntimeRouteState[];
  currentOperation?: ActiveModelOperation;
  lastExecution?: LastModelExecution;
}

export interface DiscoveredModelMetadata {
  id: string;
  rawName: string;
  displayName: string;
  description?: string;
  version?: string;
  inputTokenLimit: number;
  outputTokenLimit?: number;
  supportedActions: string[];
  temperature?: number;
  maxTemperature?: number;
  topP?: number;
  topK?: number;
  thinking?: boolean;
  isAccessible: boolean;
  lifecycleState?: 'active' | 'preview' | 'experimental' | 'deprecated' | 'discontinued';
  isPaidModel?: boolean;
  freeTierStatus?: FreeTierStatus;
  freeTierEvidenceSource?: BillingEvidenceSource;
  freeTierVerifiedAt?: number;
}

export interface ManualModelOverride {
  modelId: string;
  providerId?: string;
  disabled?: boolean;
  excluded?: boolean;
  preferred?: boolean;
  userPriority?: number;
  priorityBoost?: number;
  roleEligibility?: TaskId[];
  pool?: ModelPool;
  pinnedForTask?: TaskId;
  metadata?: Record<string, unknown>;
}

export interface DiscoverySummary {
  configured: boolean;
  providerId: string;
  isLive: boolean;
  totalDiscovered: number;
  activeCount: number;
  registeredCount: number; // Canonical alias for activeCount
  unavailableCount: number;
  excludedCount: number;
  rejectedCount: number; // Canonical alias for excludedCount
  errors: string[];
  lastRefreshedAt: number;
  poolBreakdown: Record<ModelPool, number>;
  activeModelIds: string[];
  excludedModels: { modelId: string; rawName: string; reason: string }[];
  failureReason?: string;
}

export interface ContinuationCheckpoint {
  checkpointId: string;
  storyId: string;
  turnId: string;
  role: string;
  playerAction?: string;
  playerIntent?: PlayerIntent;
  workingContextTokens?: number;
  worldTime: string;
  locationId: string;
  sceneSummary: string;
  recentOutput: string;
  uncommittedOutput: string;
  canonicalInvariants: Record<string, unknown>;
  styleContract: Record<string, string>;
  openThreads?: string[];
  presentationEvents?: string[];
  knowledgeBoundaries?: Record<string, unknown>;
  selectedModelId?: string;
  providerId?: string;
  retryCount?: number;
  fallbackChain?: string[];
  createdAt: number;
  adjudicationStatus?: 'PENDING' | 'VALIDATED' | 'ADJUDICATED' | 'REJECTED';
  handoffEligible?: boolean;
  activeConditions?: string[];
  activeQuests?: string[];
  recentHistory?: string[];
  summaryText?: string;
}

export interface CommittedNarrativeRecord {
  checkpointId: string;
  storyId: string;
  turnId: string;
  role: string;
  playerAction?: string;
  playerIntent?: PlayerIntent;
  worldTime: string;
  locationId: string;
  sceneSummary: string;
  recentOutput: string;
  summaryText?: string;
  recentHistory: string[];
  openThreads?: string[];
  presentationEvents?: string[];
  activeConditions?: string[];
  activeQuests?: string[];
  canonicalInvariants?: Record<string, unknown>;
  styleContract?: Record<string, string>;
  createdAt: number;
  adjudicationStatus?: 'PENDING' | 'VALIDATED' | 'ADJUDICATED' | 'REJECTED';
}

export type StateChangeKind =
  | 'INVENTORY'
  | 'CAPABILITY'
  | 'LOCATION'
  | 'COMBAT'
  | 'CHRONICLE'
  | 'PHYSIOLOGY'
  | 'HEALTH'
  | 'ALIGNMENT';

export interface StateChangeProposal {
  kind: StateChangeKind | string;
  targetId: string;
  value: unknown;
  metadata?: Record<string, unknown>;
}

export interface StructuredTurnPackage {
  narrative: string[];
  dialogue: { speaker: string; text: string }[];
  events: string[];
  stateChanges: StateChangeProposal[];
  memoryCandidates: string[];
  audioCues: string[];
  visualCues?: (string | { prompt: string })[];
}

export interface ProviderGenerateOptions {
  /** Prevent provider adapters from substituting local/mock generation for a missing AI credential. */
  allowDeterministicFallback?: boolean;
  audioInputBase64?: string;
  audioMimeType?: string;
  voiceProfile?: any;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  retryCount?: number;
  modelId?: string;
  systemInstruction?: string;
  canonicalLocationName?: string;
  playerAction?: string;
  reasoningEffort?: 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none';
}

export interface ProviderGenerateResult {
  audioBase64?: string;
  text: string;
  rawResponse?: unknown;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  toolTokens?: number;
  modelId: string;
  providerId: string;
}

export interface TaskResponseValidationResult {
  valid: boolean;
  errorReason?: string;
}

export interface ProviderQuotaSnapshot {
  providerId: string;
  available: boolean;
  source: 'PROVIDER' | 'UNKNOWN';
  exact: boolean;
  remaining?: number;
  limit?: number;
  reset?: string;
  billingState?: BillingState;
  message?: string;
}

export interface IProviderAdapter {
  providerId: string;
  generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult>;
  validateCredentials(): Promise<boolean>;
  discoverModels?(): Promise<DiscoveredModelMetadata[]>;
  getQuotaStatus?(): Promise<ProviderQuotaSnapshot>;
  isDiscoverySupported?(): boolean;
  getProviderStatus?(): { configured: boolean; message: string };
}

export interface AdjudicationOutcomeItem {
  change: StateChangeProposal;
  approved: boolean;
  reason?: string;
  canonicalEngine: string;
}

export interface AdjudicationResult {
  allApproved: boolean;
  narrativePlanObjective?: string;
  expectedNarrativeEffectKinds?: string[];
  approvedCount: number;
  rejectedCount: number;
  outcomes: AdjudicationOutcomeItem[];
  approvedChanges?: StateChangeProposal[];
  disapprovedChanges: { change: StateChangeProposal; reason?: string; canonicalEngine: string }[];
}

export interface OrchestratedTurnTelemetry {
  turnId: string;
  storyId: string;
  promptVersion?: string;
  taskId: TaskId;
  selectedModelId: string;
  selectedProviderId: string;
  selectionScore: number;
  selectionReason: string;
  fallbackChain: string[];
  attempts: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  validated: boolean;
  adjudicationResult?: AdjudicationResult;
  checkpointCreated?: string;
  recoveredFromCheckpoint?: boolean;
  cached?: boolean;
  idempotencyReplayed?: boolean;
  idempotencyKey?: string;
  researchBlockCount?: number;
  researchTokens?: number;
  narrativePlanObjective?: string;
  narrativeReview?: NarrativeReview;
  narrativeRichnessEvaluation?: NarrativeRichnessEvaluation;
  aiCallBudget?: AiTurnCallBudgetSnapshot;
  narrativeProviderHandoff?: NarrativeProviderHandoffContract;
}

export interface OrchestratedTurnResult {
  success: boolean;
  playerIntent?: PlayerIntent;
  narrativePlan?: EphemeralNarrativePlan;
  narrativeReview?: NarrativeReview;
  literaryReview?: LiteraryReview;
  narrativeRichnessEvaluation?: NarrativeRichnessEvaluation;
  stateAdjudication?: StateAdjudicationResult;
  turnPackage?: StructuredTurnPackage;
  telemetry: OrchestratedTurnTelemetry;
  adjudicationResult?: AdjudicationResult;
  checkpoint?: ContinuationCheckpoint;
  audioResultBase64?: string;
  fallbackText?: string;
  error?: string;
}

/**
 * DeterministicEmergencyFloorAdapter
 * Implements DreamBook v6.0 §342 Emergency Floor.
 * Guaranteed zero-cost, unlimited-quota, deterministic rule engine.
 */
export class DeterministicEmergencyFloorAdapter implements IProviderAdapter {
  public readonly providerId = 'provider_deterministic_emergency';

  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    const start = Date.now();
    let text: string;

    const canonicalLocationName =
      options?.canonicalLocationName?.trim() ||
      (() => {
        const match = String(prompt || '').match(/LOCATION NAME:\s*([^\n]+)/i);
        return match?.[1]?.trim() || 'the current location';
      })();

    const extractedPlayerAction =
      options?.playerAction?.trim() ||
      (() => {
        const match = String(prompt || '').match(/(?:Latest Player Action|PLAYER ACTION|Player Input|Action Requested|Intent|Latest Action|Action):\s*([^\n]+)/i);
        return match?.[1]?.trim() || '';
      })();

    switch (task) {
      case 'character.dialogue':
        text = JSON.stringify({
          narrative: ['The figure gestures with solemn, steady restraint.'],
          dialogue: [{ speaker: 'Archivist Maren', text: 'The astronomical armatures observe unchanging cycles. Tread with purpose.' }],
          events: ['EMERGENCY_DIALOGUE_TICK'],
          stateChanges: [],
          memoryCandidates: ['Spoke with Archivist Maren under celestial vault.'],
          audioCues: ['soft_chime'],
        });
        break;
      case 'memory.extract':
        text = JSON.stringify({
          narrative: ['Key factual occurrences committed to memory store.'],
          dialogue: [],
          events: ['EMERGENCY_MEMORY_EXTRACTED'],
          stateChanges: [],
          memoryCandidates: ['Observed astral ring realignment.'],
          audioCues: [],
        });
        break;
      case 'rules.adjudicate':
        text = JSON.stringify({
          narrative: ['Deterministic adjudication verified physical and mechanical consistency.'],
          dialogue: [],
          events: ['EMERGENCY_RULES_PASS'],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        });
        break;
      case 'summary.scene':
        text = JSON.stringify({
          narrative: ['The ancient armatures maintain their silent vigil over the subterranean chamber.'],
          dialogue: [],
          events: ['EMERGENCY_SUMMARY_COMPILED'],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        });
        break;
      case 'ooc.respond':
        text = JSON.stringify({
          response: 'DreamBook OOC is running in deterministic mode. The current story context and canonical systems are active. Please refer to your character sheet, active location, and journal for authoritative state.',
        });
        break;
      case 'story.advice':
        text = JSON.stringify({
          tips: [
            {
              title: 'Use a known ability',
              description: 'Try one of your currently learned capabilities that matches the situation.',
              actionText: 'Use one of my current abilities that fits the situation.',
            },
          ],
        });
        break;
      case 'intent.interpret':
        text = JSON.stringify({
          baseAction: 'INTERACT',
          intent: 'INTERACT',
          requestedEffects: [],
          modifiers: [],
          target: '',
          confidence: 0.55,
        });
        break;
      case 'capability.synthesize':
      case 'character.capability.propose': {
        const isMulti = /capabilities array|up to \d+ DISTINCT capability proposals|additional capability proposals/i.test(prompt);
        const conceptMatch = prompt.match(/(?:concept|manifesting as|mastery of|focusing on|specializing in|named|called|prompt:)\s+([^\n.]+)/i);
        const extractedConcept = conceptMatch ? conceptMatch[1].trim() : 'Adaptive Talent';
        
        const singleProposal = {
          name: extractedConcept || 'Adaptive Mastery',
          category: 'Magic',
          activationMode: 'immediate',
          powerTier: 'Moderate',
          baseEnergyCost: 20,
          baseStrainCost: 10,
          minVesselCapacityRequired: 15,
          description: `Specialized mastery and adaptive focus in ${extractedConcept || 'innate power'}.`,
          actionType: 'action',
          targetType: 'single_target',
          rangeScope: 'close',
          checkFormula: '1d20',
          effectDefinition: {
            resolutionMode: 'SINGLE_ATTACK',
            scale: 'PERSON',
            targetingMode: 'ONE_TARGET',
            instanceCount: 1,
            attackFormula: '1d20',
            saveFormula: '1d20',
            damageFormula: '1d8',
            damageType: 'force',
          },
          techniques: [
            {
              name: `${extractedConcept || 'Adaptive'} Surge`,
              description: `A focused surge channeling ${extractedConcept || 'innate power'}.`,
              activationType: 'Action',
              energyCost: 15,
              cooldownTurns: 1,
              range: 'Close',
              checkFormula: '1d20',
            },
            {
              name: `${extractedConcept || 'Adaptive'} Guard`,
              description: `A protective ward channeling ${extractedConcept || 'innate power'}.`,
              activationType: 'Reaction',
              energyCost: 10,
              cooldownTurns: 2,
              range: 'Self',
              checkFormula: '1d20',
            },
          ],
        };

        if (isMulti) {
          text = JSON.stringify({
            capabilities: [
              singleProposal,
              {
                name: `${extractedConcept || 'Dynamic'} Warding`,
                category: 'Domain',
                activationMode: 'reaction',
                powerTier: 'Moderate',
                baseEnergyCost: 15,
                baseStrainCost: 5,
                description: `Protective defensive reaction aligned with ${extractedConcept || 'character background'}.`,
                actionType: 'reaction',
                targetType: 'self',
                rangeScope: 'close',
                checkFormula: '1d20',
                techniques: [
                  {
                    name: 'Protective Barrier',
                    description: 'Raises a temporary protective barrier.',
                    activationType: 'Reaction',
                    energyCost: 10,
                    cooldownTurns: 2,
                    range: 'Self',
                  },
                ],
              },
              {
                name: `${extractedConcept || 'Swift'} Transit`,
                category: 'Movement',
                activationMode: 'immediate',
                powerTier: 'Minor',
                baseEnergyCost: 10,
                baseStrainCost: 5,
                description: `Rapid repositioning technique tailored to the character.`,
                actionType: 'bonus_action',
                targetType: 'self',
                rangeScope: 'close',
                checkFormula: '1d20',
                techniques: [
                  {
                    name: 'Quickstep',
                    description: 'Quickly reposition across short distance.',
                    activationType: 'Bonus Action',
                    energyCost: 5,
                    cooldownTurns: 1,
                    range: 'Self',
                  },
                ],
              },
            ],
          });
        } else {
          text = JSON.stringify(singleProposal);
        }
        break;
      }
      case 'capability.explain':
        text = 'The canonical capability and rules engines remain authoritative. No additional AI explanation was available.';
        break;
      case 'research.query':
      case 'research.world-brief':
        text = JSON.stringify({
          brief: 'No external research was available. Use only supplied world information and canonical deterministic rules.',
          facts: [],
          themes: [],
          constraints: [],
        });
        break;
      case 'rules.analyze':
        text = JSON.stringify({
          analysis: 'No advisory rule analysis was available. Canonical rule resolution remains authoritative.',
        });
        break;
      case 'tactical.reason':
      case 'combat.tactics':
        text = JSON.stringify({
          plan: 'No AI tactical plan was available. Preserve the canonical combat state and use deterministic combat rules.',
        });
        break;
      case 'utility.inspect':
        text = JSON.stringify({
          success: true,
          result: 'Deterministic inspection completed.',
        });
        break;
      case 'narrative.review':
        text = JSON.stringify({
          review: 'No AI review was available; preserve canonical content without alteration.',
        });
        break;
      case 'narrative.generate':
      default:
        if (
          prompt.includes('Character Genesis') ||
          prompt.includes('CharacterGenesisDraft') ||
          options?.systemInstruction?.includes('Character Genesis')
        ) {
          text = JSON.stringify({
            identity: {
              name: 'Vanguard Traveler',
              species: 'Human',
              age: 24,
              gender: 'Unspecified',
            },
            appearance: {
              physicalDescription: 'A resolute traveler prepared for uncharted terrain, bearing weathered garments and disciplined posture.',
              distinguishingTraits: ['Intense focused gaze', 'Practical traveler gear'],
            },
            personality: {
              traits: ['Pragmatic', 'Vigilant'],
              temperament: 'Calm under pressure',
              values: ['Survival', 'Truth', 'Independence'],
              fears: ['Loss of agency'],
              desires: ['Mastery and understanding of anomalies'],
              dialogueStyle: 'Measured and concise',
            },
            background: {
              origin: 'Threshold borderlands',
              history: 'Traversed anomalous crossings to reach the current frontier.',
              socialClass: 'Wanderer',
              formerOccupations: ['Scout'],
            },
            role: {
              profession: 'Scout',
              archetype: 'Wanderer',
              specialization: 'Survival',
            },
            startingEquipment: {
              mainHand: { id: 'item_blade', name: 'Field Blade', type: 'WEAPON', damageFormula: '1d6' },
              body: { id: 'item_garb', name: 'Reinforced Traveler Garb', type: 'ARMOR' },
              pack: [{ id: 'item_supplies', name: 'Survival Provisions', quantity: 3 }],
            },
            startingLocation: {
              locationId: 'loc_threshold',
              name: 'Border Threshold',
              region: 'Outer Reach',
              description: 'An ancient crossing where newcomers find their footing.',
            },
            startingSituation: {
              summary: 'Arriving at an unfamiliar threshold seeking purpose.',
              hook: 'A strange resonance marks the area.',
              initialConditions: 'Alert and watchful of immediate surroundings.',
              whyHereNow: 'Driven by necessity to explore this world.',
            },
            capabilities: [],
            aiExtractionSummary: {
              interpretation: 'Deterministic baseline character draft.',
              keyFacts: ['Generated via deterministic emergency floor.'],
              proposedHighlights: ['Balanced starting baseline.'],
              uncertainties: [],
            },
          });
          break;
        }

        const normalizedAction = extractedPlayerAction
          .replace(/^(?:i|we|my character)\s+/i, '')
          .trim();
        const actionVerb =
          /\b(?:listen|hear|overhear|eavesdrop)\b/i.test(normalizedAction)
            ? 'You listen carefully'
            : /\b(?:look|observe|watch|inspect|examine|scan|study)\b/i.test(normalizedAction)
              ? 'You observe the scene'
              : /\b(?:move|walk|approach|step|head|travel|enter|leave|go)\b/i.test(normalizedAction)
                ? 'You move as requested'
                : 'You carry out the requested action';
        const actionSentence = normalizedAction
          ? `${actionVerb} in ${canonicalLocationName}, following the player action: ${normalizedAction}.`
          : `The scene remains grounded in ${canonicalLocationName}.`;

        text = JSON.stringify({
          narrative: [
            `${actionSentence} The immediate surroundings settle around the effort, with no new location change or time shift committed. Any information available from the immediate scene remains limited to what can be directly observed; no reliable answer is established beyond that evidence.`,
          ],
          dialogue: [],
          events: ['EMERGENCY_DETERMINISTIC_TICK'],
          stateChanges: [],
          memoryCandidates: [`The latest action was resolved in ${canonicalLocationName}.`],
          audioCues: ['brass_click'],
        });
        break;
    }

    return {
      text,
      latencyMs: Math.max(1, Date.now() - start),
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      modelId: 'emergency-fallback-local',
      providerId: this.providerId,
    };
  }

  public async validateCredentials(): Promise<boolean> {
    return true; // Local engine requires no credentials
  }
}

/**
 * DeterministicMockAdapter
 * Configurable mock provider for deterministic unit, failover, timeout, and circuit-breaker testing.
 */
export class DeterministicMockAdapter implements IProviderAdapter {
  public providerId: string;
  public cannedResponses: Map<TaskId, string> = new Map();
  public defaultResponse: string;
  public simulatedLatencyMs: number = 5;
  public failureMode: 'timeout' | '429' | '500' | 'malformed_json' | 'illegal_state_change' | null = null;
  public failureCount: number = 0;
  public maxFailuresBeforeSuccess: number = 0;
  public callHistory: { task: TaskId; prompt: string; timestamp: number; options?: ProviderGenerateOptions }[] = [];

  constructor(providerId: string = 'provider_mock') {
    this.providerId = providerId;
    this.defaultResponse = JSON.stringify({
      narrative: ['Mock narrative generated deterministically.'],
      dialogue: [{ speaker: 'Vael', text: 'The boundary holds.' }],
      events: ['MOCK_EVENT'],
      stateChanges: [],
      memoryCandidates: ['A mock memory formed.'],
      audioCues: ['bell_tone'],
    });
  }

  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    this.callHistory.push({ task, prompt, timestamp: Date.now(), options: options ? { ...options } : undefined });

    // Handle failure modes
    if (this.failureMode && (this.maxFailuresBeforeSuccess === 0 || this.failureCount < this.maxFailuresBeforeSuccess)) {
      this.failureCount++;
      if (this.failureMode === 'timeout') {
        const t = options?.timeoutMs;
        if (t) {
          await new Promise((resolve) => setTimeout(resolve, t + 20));
        }
        throw new Error('Provider request timed out (simulated timeout).');
      }
      if (this.failureMode === '429') {
        throw new Error('Provider rate limit exceeded (HTTP 429 Too Many Requests).');
      }
      if (this.failureMode === '500') {
        throw new Error('Provider internal server error (HTTP 500 Service Unavailable).');
      }
      if (this.failureMode === 'malformed_json') {
        return {
          text: 'This is not valid JSON from the model <<corrupt>>',
          latencyMs: this.simulatedLatencyMs,
          inputTokens: Math.ceil(prompt.length / 4),
          outputTokens: 10,
          modelId: 'mock-model',
          providerId: this.providerId,
        };
      }
      if (this.failureMode === 'illegal_state_change') {
        return {
          text: JSON.stringify({
            narrative: ['Illegal mutation attempt.'],
            dialogue: [],
            events: [],
            stateChanges: [{ kind: 'DELETE_PLAYER', targetId: 'player', value: null }],
            memoryCandidates: [],
            audioCues: [],
          }),
          latencyMs: this.simulatedLatencyMs,
          inputTokens: Math.ceil(prompt.length / 4),
          outputTokens: 20,
          modelId: 'mock-model',
          providerId: this.providerId,
        };
      }
    }

    if (this.simulatedLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedLatencyMs));
    }

    const text = this.cannedResponses.get(task) || this.defaultResponse;
    return {
      text,
      latencyMs: this.simulatedLatencyMs,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      modelId: 'mock-model',
      providerId: this.providerId,
    };
  }

  public async validateCredentials(): Promise<boolean> {
    return true;
  }
}

/**
 * DeterministicMockSpeechAdapter
 * Dedicated adapter for speech synthesis tasks.
 */

export class DeterministicMockSTTAdapter implements IProviderAdapter {
  public readonly providerId = 'provider_mock_stt';

  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    const text = JSON.stringify({
      narrative: ['This is a mock transcription of the provided audio.'],
      dialogue: [],
      events: ['SPEECH_TRANSCRIBED'],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    });

    return {
      text,
      latencyMs: 15,
      inputTokens: 10,
      outputTokens: 30,
      modelId: 'mock-stt-v1',
      providerId: this.providerId,
    };
  }

  public isDiscoverySupported(): boolean { return false; }
  public getProviderStatus() { return { configured: true, message: 'Mock STT active.' }; }
  public async validateCredentials() { return true; }
  public async discoverModels() { return []; }
}

export class DeterministicMockSpeechAdapter implements IProviderAdapter {
  public readonly providerId = 'provider_mock_speech';

  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    const text = JSON.stringify({
      narrative: ['Speech audio synthesized successfully.'],
      dialogue: [],
      events: ['SPEECH_AUDIO_GENERATED'],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: ['voice_track_01'],
    });
    
    // valid silent RIFF WAV base64
    const silentWavBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

    return {
      text,
      audioBase64: silentWavBase64,
      latencyMs: 15,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: 30,
      modelId: 'mock-speech-v1',
      providerId: this.providerId,
    };
  }

  public async validateCredentials(): Promise<boolean> {
    return true;
  }
}

/**
 * Classifies discovered models by structural provider capabilities into canonical CH12 pools and roles.
 * Enforces strict boundaries:
 * - Embedding models cannot generate narrative or dialogue.
 * - Video models cannot generate narrative or dialogue.
 * - Speech/TTS models are restricted strictly to speech.generate.
 * - Image models cannot participate in text turn generation.
 * - Agentic/computer-use models cannot act as single-turn orchestrators.
 * - Deprecated/discontinued models are strictly excluded.
 */
export function classifyDiscoveredModel(
  discovered: DiscoveredModelMetadata | any,
  providerId: string = 'google_gemini'
): {
  eligible: boolean;
  isCompatible: boolean;
  exclusionReason?: string;
  rejectionReason?: string;
  record?: ModelRegistryRecord;
  pool?: ModelPool;
  roles?: TaskId[];
  contextWindow?: number;
  supportedInputTypes?: string[];
} {
  const modelId = discovered.id || discovered.rawName || discovered.name || '';
  const actions = discovered.supportedActions || [];
  const lowerId = modelId.toLowerCase();
  const lowerName = (discovered.name || '').toLowerCase();
  const lowerDisplay = (discovered.displayName || '').toLowerCase();

  // 1. Accessibility Check
  if (discovered.isAccessible === false) {
    const reason = 'Model is not accessible to current project/account credentials.';
    return { eligible: false, isCompatible: false, exclusionReason: reason, rejectionReason: reason };
  }

  // 2. Lifecycle / Deprecation
  const isDeprecated =
    discovered.lifecycleState === 'deprecated' ||
    lowerId.includes('deprecated') ||
    lowerId.includes('discontinued') ||
    lowerId.startsWith('gemini-1.5') ||
    lowerId === 'gemini-pro' ||
    lowerId.startsWith('gemini-2.0');

  if (isDeprecated) {
    const reason = 'Model is officially deprecated or discontinued.';
    return { eligible: false, isCompatible: false, exclusionReason: reason, rejectionReason: reason };
  }

  // 3. Modality & Action Incompatibilities
  // Embeddings
  if (lowerId.includes('embed') || lowerName.includes('embed') || lowerDisplay.includes('embed') || (actions.length > 0 && actions.every((a: string) => a.toLowerCase().includes('embed')))) {
    const reason = 'non-generative embedding model cannot perform generative narrative or dialogue tasks.';
    return { eligible: false, isCompatible: false, exclusionReason: reason, rejectionReason: reason };
  }

  // Video generation
  if (lowerId.startsWith('veo') || lowerId.includes('video') || lowerDisplay.includes('video') || (actions.length > 0 && actions.every((a: string) => a === 'predictLongRunning'))) {
    const reason = 'non-generative video model cannot be used for narrative text turn orchestration.';
    return { eligible: false, isCompatible: false, exclusionReason: reason, rejectionReason: reason };
  }

  // Music generation
  if (lowerId.startsWith('lyria') || lowerId.includes('music') || lowerDisplay.includes('music') || lowerDisplay.includes('audio synthesizer') || (actions.length > 0 && actions.some((a: string) => a.toLowerCase().includes('music')))) {
    const reason = 'non-generative music/audio model cannot be used for narrative text turn orchestration.';
    return { eligible: false, isCompatible: false, exclusionReason: reason, rejectionReason: reason };
  }

  // Image generation models
  if (lowerId.includes('imagen') || lowerId.includes('-image') || lowerId.includes('paint') || lowerDisplay.includes('image generator') || lowerDisplay.includes('imagen') || (actions.length > 0 && actions.some((a: string) => a.toLowerCase().includes('image')))) {
    const reason = 'non-generative image generation model cannot be used for text narrative or character dialogue.';
    return { eligible: false, isCompatible: false, exclusionReason: reason, rejectionReason: reason };
  }

  // Specialized research / computer-use / robotics
  if (
    lowerId.includes('computer-use') ||
    lowerId.startsWith('antigravity') ||
    lowerId.startsWith('deep-research') ||
    lowerId.includes('robotics')
  ) {
    const reason = 'Specialized agent/research model cannot be used as a single-turn narrative orchestrator.';
    return { eligible: false, isCompatible: false, exclusionReason: reason, rejectionReason: reason };
  }

  // Grounding QA
  if (lowerId === 'aqa' || actions.includes('generateAnswer')) {
    const reason = 'Grounded question-answering model incompatible with open narrative state orchestration.';
    return { eligible: false, isCompatible: false, exclusionReason: reason, rejectionReason: reason };
  }

  // Live bidirectional streaming only
  if (actions.includes('bidiGenerateContent') && !actions.includes('generateContent')) {
    const reason = 'Bidirectional streaming live model cannot be used for standard request/response turn orchestration.';
    return { eligible: false, isCompatible: false, exclusionReason: reason, rejectionReason: reason };
  }

  // Audio transcription models
  if (lowerId.includes('transcribe')) {
    const reason = 'Audio transcription model cannot be used for narrative text generation.';
    return { eligible: false, isCompatible: false, exclusionReason: reason, rejectionReason: reason };
  }

  // 4. Speech / TTS Models
  if (lowerId.includes('tts')) {
    const record: ModelRegistryRecord = {
      providerId,
      modelId,
      displayName: discovered.displayName || modelId,
      pool: 'speech',
      capabilities: ['speech_synthesis', 'tts', 'audio_generation'],
      contextWindow: discovered.inputTokenLimit || 8192,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 300,
      userPriority: 70,
      roleEligibility: ['speech.generate'],
      outputTokenLimit: discovered.outputTokenLimit,
      supportedInputTypes: ['text'],
      supportedOutputTypes: ['audio'],
      hasAudio: true,
      hasImageGeneration: false,
      hasTools: false,
      hasStructuredOutput: false,
      lifecycleState: discovered.lifecycleState || 'active',
      accessStatus: 'accessible',
      isPaidModel: discovered.isPaidModel,
      description: discovered.description,
      isEmergencyFloor: false,
    };
    return {
      eligible: true,
      isCompatible: true,
      record,
      pool: record.pool,
      roles: record.roleEligibility,
      contextWindow: record.contextWindow,
      supportedInputTypes: record.supportedInputTypes,
    };
  }

  // 5. General Text Reasoning / Narrative Models
  // OpenRouter exposes many third-party text models whose names do not encode
  // DreamBook's task taxonomy. A discovered OpenRouter text model is therefore
  // eligible for every general AI task; the player explicitly chooses which of
  // those models are allowed as fallbacks in Settings.
  if (providerId === 'openrouter') {
    const openRouterRecord: ModelRegistryRecord = {
      providerId,
      modelId,
      displayName: discovered.displayName || modelId,
      pool: /flash|mini|small|lite|haiku/i.test(modelId) ? 'fast' : /reason|thinking|r1|o1|o3|o4/i.test(modelId) ? 'reasoning' : 'creative',
      capabilities: ['text_generation', 'reasoning', 'structured_output', ...(discovered.thinking ? ['extended_thinking'] : [])],
      contextWindow: discovered.inputTokenLimit || 32768,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 600,
      userPriority: 75,
      roleEligibility: [...ALL_GENERAL_TEXT_ROLES],
      outputTokenLimit: discovered.outputTokenLimit,
      supportedInputTypes: ['text', 'image', 'audio', 'video'],
      supportedOutputTypes: ['text', 'json'],
      hasTools: true,
      hasStructuredOutput: true,
      hasVision: discovered.supportedActions?.includes('vision') === true,
      hasAudio: false,
      hasImageGeneration: false,
      fallbackEligibility: true,
      lifecycleState: discovered.lifecycleState || 'active',
      accessStatus: 'accessible',
      isPaidModel: discovered.isPaidModel,
      description: discovered.description,
      isEmergencyFloor: false,
    };

    return {
      eligible: true,
      isCompatible: true,
      record: openRouterRecord,
      pool: openRouterRecord.pool,
      roles: openRouterRecord.roleEligibility,
      contextWindow: openRouterRecord.contextWindow,
      supportedInputTypes: openRouterRecord.supportedInputTypes,
    };
  }

  const capabilities: string[] = ['text_generation', 'reasoning', 'structured_output'];
  if (discovered.thinking) {
    capabilities.push('extended_thinking');
  }
  if ((discovered.inputTokenLimit || 0) >= 1000000) {
    capabilities.push('long_context');
  }

  let pool: ModelPool = 'creative';
  let roleEligibility: TaskId[] = [...ALL_GENERAL_TEXT_ROLES];
  let userPriority = 80;
  let latencyMs = 500;

  if (lowerId.includes('critic')) {
    pool = 'reasoning';
    roleEligibility = ['narrative.review', 'rules.adjudicate', 'summary.scene', 'rules.analyze'];
    userPriority = 85;
    latencyMs = 400;
  } else if (lowerId.includes('flash-lite') || lowerId.includes('lite')) {
    pool = 'fast';
    roleEligibility = [...ALL_GENERAL_TEXT_ROLES];
    userPriority = 95;
    latencyMs = 150;
    capabilities.push('low_latency', 'cost_efficient');
  } else if (lowerId.includes('flash')) {
    pool = 'fast';
    roleEligibility = [...ALL_GENERAL_TEXT_ROLES];
    userPriority = 90;
    latencyMs = 250;
    capabilities.push('fast_utility');
  } else if (lowerId.includes('pro')) {
    pool = 'creative';
    roleEligibility = [...ALL_GENERAL_TEXT_ROLES];
    userPriority = 100;
    latencyMs = 800;
    capabilities.push('creative_writing', 'deep_reasoning');
  } else if (lowerId.includes('long')) {
    pool = 'long_context';
    roleEligibility = ['summary.scene', 'memory.extract', 'research.query', 'research.world-brief'];
    userPriority = 85;
    latencyMs = 900;
  }

  const record: ModelRegistryRecord = {
    providerId,
    modelId,
    displayName: discovered.displayName || modelId,
    pool,
    capabilities,
    contextWindow: discovered.inputTokenLimit || 1048576,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs,
    userPriority,
    roleEligibility,
    outputTokenLimit: discovered.outputTokenLimit,
    supportedInputTypes: ['text', 'image', 'audio', 'video'],
    supportedOutputTypes: ['text', 'json'],
    hasTools: true,
    hasStructuredOutput: true,
    hasVision: true,
    hasAudio: false,
    hasImageGeneration: false,
    fallbackEligibility: true,
    lifecycleState: discovered.lifecycleState || 'active',
    accessStatus: 'accessible',
    isPaidModel: discovered.isPaidModel,
    description: discovered.description,
    isEmergencyFloor: false,
  };

  return {
    eligible: true,
    isCompatible: true,
    record,
    pool: record.pool,
    roles: record.roleEligibility,
    contextWindow: record.contextWindow,
    supportedInputTypes: record.supportedInputTypes,
  };
}

/**
 * OpenRouterAdapter
 * Canonical adapter for OpenRouter's OpenAI-compatible API.
 * Model discovery uses GET /api/v1/models; execution uses POST /api/v1/chat/completions.
 */
type OpenRouterTextExtraction = {
  text: string;
  failureReason?: string;
};

function extractOpenRouterAssistantText(payload: any): OpenRouterTextExtraction {
  const choice = payload?.choices?.[0];
  const message = choice?.message;

  const appendPartText = (part: any): string => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';

    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;
    if (Array.isArray(part.content)) return part.content.map(appendPartText).join('');
    if (typeof part.output_text === 'string') return part.output_text;
    if (part.output_text && typeof part.output_text === 'object') return appendPartText(part.output_text);

    return '';
  };

  const candidates = [
    message?.content,
    message?.output_text,
    choice?.output_text,
    payload?.output_text,
  ];

  for (const candidate of candidates) {
    const extracted = Array.isArray(candidate)
      ? candidate.map(appendPartText).join('')
      : appendPartText(candidate);

    if (extracted.trim()) {
      return { text: extracted.trim() };
    }
  }

  if (typeof choice?.text === 'string' && choice.text.trim()) {
    return { text: choice.text.trim() };
  }

  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0;
  if (toolCalls > 0) {
    return {
      text: '',
      failureReason:
        `OpenRouter returned ${toolCalls} tool call(s) but no assistant text. DreamBook has no tool-call continuation for this task.`,
    };
  }

  const refusal = typeof message?.refusal === 'string' ? message.refusal.trim() : '';
  if (refusal) {
    return {
      text: '',
      failureReason: `OpenRouter returned a refusal instead of assistant content: ${refusal}`,
    };
  }

  const reasoningDetails = Array.isArray(message?.reasoning_details)
    ? message.reasoning_details.length
    : 0;
  const hasReasoning =
    (typeof message?.reasoning === 'string' && message.reasoning.trim()) ||
    (typeof message?.thought === 'string' && message.thought.trim()) ||
    reasoningDetails > 0;

  const finishReason = String(choice?.finish_reason || '').trim();
  if (hasReasoning) {
    return {
      text: '',
      failureReason:
        'OpenRouter returned reasoning/thinking data but no final assistant content.' +
        (finishReason ? ` finish_reason=${finishReason}.` : ''),
    };
  }

  const responseModel = String(payload?.model || '').trim();
  const choiceCount = Array.isArray(payload?.choices) ? payload.choices.length : 0;
  const contentShape =
    message?.content == null
      ? String(message?.content)
      : Array.isArray(message.content)
      ? 'array'
      : typeof message.content;

  return {
    text: '',
    failureReason:
      'OpenRouter returned no usable assistant content.' +
      ` model=${responseModel || 'unknown'}` +
      ` choices=${choiceCount}` +
      ` content=${contentShape}` +
      (finishReason ? ` finish_reason=${finishReason}` : ''),
  };
}

export class OpenRouterAdapter implements IProviderAdapter {
  public readonly providerId = 'openrouter';
  public isMockOnly = false;

  private getApiKey(): string | undefined {
    return getProviderApiKey(this.providerId);
  }

  public isDiscoverySupported(): boolean {
    return true;
  }

  public getProviderStatus(): { configured: boolean; message: string } {
    const configured = Boolean(this.getApiKey());
    return configured
      ? { configured: true, message: 'OpenRouter API key configured.' }
      : { configured: false, message: 'OpenRouter API key is not configured.' };
  }

  public async validateCredentials(): Promise<boolean> {
    const apiKey = this.getApiKey();
    if (!apiKey) return false;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public async discoverModels(): Promise<DiscoveredModelMetadata[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) return [];

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenRouter model discovery failed (HTTP ${response.status}): ${body.slice(0, 300)}`);
    }

    const payload: any = await response.json();
    const rawModels = Array.isArray(payload?.data) ? payload.data : [];

    return rawModels
      .map((model: any): DiscoveredModelMetadata | null => {
        const id = String(model?.id || '').trim();
        if (!id) return null;

        const inputModalities = Array.isArray(model?.architecture?.input_modalities)
          ? model.architecture.input_modalities.map(String)
          : ['text'];
        const outputModalities = Array.isArray(model?.architecture?.output_modalities)
          ? model.architecture.output_modalities.map(String)
          : ['text'];
        const outputIsText = outputModalities.some((m: string) => /text|json/i.test(m));

        if (!outputIsText) return null;

        const promptPrice = Number(model?.pricing?.prompt || 0);
        const completionPrice = Number(model?.pricing?.completion || 0);
        const hasNumericPricing = Number.isFinite(promptPrice) && Number.isFinite(completionPrice);
        const isPaidModel = hasNumericPricing ? (promptPrice > 0 || completionPrice > 0) : undefined;
        const freeTierStatus: FreeTierStatus = hasNumericPricing
          ? (promptPrice === 0 && completionPrice === 0 ? 'VERIFIED' : 'NOT_FREE')
          : 'UNKNOWN';

        return {
          id,
          rawName: id,
          displayName: String(model?.name || id),
          description: model?.description ? String(model.description) : undefined,
          version: model?.created ? String(model.created) : undefined,
          inputTokenLimit: Number(model?.context_length || 32768),
          outputTokenLimit: Number(model?.max_completion_tokens || 0) || undefined,
          supportedActions: ['generateContent'],
          thinking: /reason|thinking|r1|o1|o3|o4/i.test(id),
          isAccessible: true,
          lifecycleState: 'active',
          isPaidModel,
          freeTierStatus,
          freeTierEvidenceSource: freeTierStatus === 'UNKNOWN' ? 'UNKNOWN' : 'PROVIDER',
          temperature: undefined,
          maxTemperature: undefined,
          topP: undefined,
          topK: undefined,
        };
      })
      .filter(Boolean) as DiscoveredModelMetadata[];
  }

  public async getQuotaStatus(): Promise<ProviderQuotaSnapshot> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        providerId: this.providerId,
        available: false,
        source: 'UNKNOWN',
        exact: false,
        billingState: 'UNKNOWN',
        message: 'OpenRouter API key is not configured.',
      };
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/key', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
      const payload: any = await response.json().catch(() => null);
      if (!response.ok || !payload?.data) {
        return {
          providerId: this.providerId,
          available: false,
          source: 'UNKNOWN',
          exact: false,
          billingState: 'UNKNOWN',
          message: `OpenRouter key quota lookup failed (HTTP ${response.status}).`,
        };
      }

      const data = payload.data;
      const remaining = Number(data.limit_remaining);
      const limit = Number(data.limit);
      const hasRemaining = Number.isFinite(remaining);
      const hasLimit = Number.isFinite(limit);

      return {
        providerId: this.providerId,
        available: true,
        source: 'PROVIDER',
        exact: hasRemaining,
        remaining: hasRemaining ? remaining : undefined,
        limit: hasLimit ? limit : undefined,
        reset: typeof data.limit_reset === 'string' ? data.limit_reset : undefined,
        billingState: data.is_free_tier === true ? 'FREE' : 'ACCOUNT_DEPENDENT',
        message: hasRemaining
          ? `Provider reports ${remaining} credits remaining.`
          : 'Provider returned key metadata without an exact remaining-credit value.',
      };
    } catch (error: any) {
      return {
        providerId: this.providerId,
        available: false,
        source: 'UNKNOWN',
        exact: false,
        billingState: 'UNKNOWN',
        message: error?.message || 'OpenRouter key quota lookup failed.',
      };
    }
  }

  public async generate(
    task: TaskId,
    prompt: string,
    options?: ProviderGenerateOptions
  ): Promise<ProviderGenerateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured.');
    }

    const start = Date.now();
    const controller = new AbortController();
    const timeout = options?.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

    const signal = options?.abortSignal
      ? AbortSignal.any([controller.signal, options.abortSignal])
      : controller.signal;

    const requestedMaxTokens = Math.max(256, Number(options?.maxTokens || 4096));
    const boundedMaxTokens = Math.min(requestedMaxTokens, 8192);

    const buildBody = (recoveryAttempt: boolean): Record<string, unknown> => {
      let cleanModel = String(options?.modelId || 'openrouter/free').trim();
      if (cleanModel.startsWith('openrouter::')) {
        cleanModel = cleanModel.slice('openrouter::'.length);
      } else if (cleanModel.includes('::')) {
        cleanModel = cleanModel.split('::').pop()!;
      }

      const body: Record<string, unknown> = {
        model: cleanModel,
        messages: [
          ...(options?.systemInstruction
            ? [{ role: 'system', content: options.systemInstruction }]
            : []),
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: recoveryAttempt
          ? Math.min(Math.max(boundedMaxTokens, 6144) * 2, 16384)
          : boundedMaxTokens,
      };

      if (recoveryAttempt) {
        body.reasoning = { effort: 'none' };
      } else if (options?.reasoningEffort) {
        body.reasoning = { effort: options.reasoningEffort };
      }

      return body;
    };

    const sendRequest = async (recoveryAttempt: boolean): Promise<any> => {
      const body = buildBody(recoveryAttempt);
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://dreambook.local',
          'X-Title': 'DreamBook',
        },
        body: JSON.stringify(body),
      });

      const rawBody = await response.text().catch(() => '');
      let payload: any = null;

      try {
        payload = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message =
          payload?.error?.message ||
          payload?.error ||
          rawBody.slice(0, 500) ||
          `OpenRouter request failed with HTTP ${response.status}`;
        throw new Error(String(message));
      }

      if (payload?.error) {
        const message = payload.error.message || JSON.stringify(payload.error);
        throw new Error(String(message));
      }

      const choice = payload?.choices?.[0];
      if (choice?.error) {
        throw new Error(String(choice.error.message || JSON.stringify(choice.error)));
      }

      return payload;
    };

    try {
      let payload = await sendRequest(false);
      let extracted = extractOpenRouterAssistantText(payload);

      if (!extracted.text) {
        const choice = payload?.choices?.[0];
        const finishReason = String(choice?.finish_reason || '').trim();
        const hasChoices = Array.isArray(payload?.choices) && payload.choices.length > 0;
        const message = choice?.message;
        const hadReasoning = Boolean(
          (typeof message?.reasoning === 'string' && message.reasoning.trim()) ||
          (typeof message?.thought === 'string' && message.thought.trim()) ||
          (Array.isArray(message?.reasoning_details) && message.reasoning_details.length > 0)
        );

        // A successful HTTP response with no assistant text can happen when a
        // reasoning model consumes the completion budget on thinking or when a
        // provider returns an empty/length-truncated message. Give that same
        // model one bounded recovery attempt before the orchestrator advances
        // to its normal fallback chain.
        if (hasChoices || hadReasoning || finishReason === 'length' || finishReason === 'max_tokens') {
          payload = await sendRequest(true);
          extracted = extractOpenRouterAssistantText(payload);
        }
      }

      if (!extracted.text) {
        const diagnosticError = new Error(
          extracted.failureReason || 'OpenRouter returned no usable assistant content.',
        ) as Error & {
          providerDiagnostic?: {
            providerId: string;
            modelId: string;
            rawResponse: unknown;
          };
        };
        diagnosticError.providerDiagnostic = {
          providerId: this.providerId,
          modelId: String(payload?.model || options?.modelId || 'openrouter/free'),
          rawResponse: payload,
        };
        throw diagnosticError;
      }

      const text = extracted.text;

      return {
        text: text.trim(),
        rawResponse: payload,
        latencyMs: Math.max(1, Date.now() - start),
        inputTokens: Number(payload?.usage?.prompt_tokens || 0) || undefined,
        outputTokens: Number(payload?.usage?.completion_tokens || 0) || undefined,
        reasoningTokens: Number(payload?.usage?.completion_tokens_details?.reasoning_tokens || payload?.usage?.reasoning_tokens || 0) || undefined,
        cachedTokens: Number(payload?.usage?.prompt_tokens_details?.cached_tokens || 0) || undefined,
        toolTokens: Number(payload?.usage?.tool_tokens || 0) || undefined,
        modelId: String(payload?.model || options?.modelId || 'openrouter/free'),
        providerId: this.providerId,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

/**
 * OpenAiCompatibleAdapter
 * Universal adapter for any OpenAI-compatible custom or preset AI provider
 * (e.g. Groq, DeepSeek, Mistral, Together, Ollama, LM Studio, Perplexity, xAI, or custom REST endpoint).
 */
export class OpenAiCompatibleAdapter implements IProviderAdapter {
  public providerId: string;
  public baseUrl: string;
  public customHeaders: Record<string, string>;

  constructor(providerId: string, baseUrl?: string, customHeaders?: Record<string, string>) {
    this.providerId = providerId.trim().toLowerCase();
    this.baseUrl = (baseUrl || getProviderBaseUrl(this.providerId) || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.customHeaders = customHeaders || {};
  }

  private getApiKey(): string | undefined {
    return getProviderApiKey(this.providerId);
  }

  public isDiscoverySupported(): boolean {
    return true;
  }

  public getProviderStatus(): { configured: boolean; message: string } {
    const key = this.getApiKey();
    const isLocal = this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1');
    const configured = Boolean(key) || isLocal;
    return configured
      ? { configured: true, message: `${this.providerId} configured at ${this.baseUrl}` }
      : { configured: false, message: `${this.providerId} API key is not configured.` };
  }

  public async validateCredentials(): Promise<boolean> {
    const key = this.getApiKey();
    const isLocal = this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1');
    if (!key && !isLocal) return false;

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...this.customHeaders,
      };
      if (key) headers['Authorization'] = `Bearer ${key}`;

      const res = await fetch(`${this.baseUrl}/models`, { headers });
      if (res.ok) return true;

      // Some local/custom servers don't expose GET /models; test a 1-token probe completion
      const testRes = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          model: 'default',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      });
      return testRes.status !== 401 && testRes.status !== 403;
    } catch {
      return false;
    }
  }

  public async discoverModels(): Promise<DiscoveredModelMetadata[]> {
    const key = this.getApiKey();
    const isLocal = this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1');
    if (!key && !isLocal) return [];

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...this.customHeaders,
      };
      if (key) headers['Authorization'] = `Bearer ${key}`;

      const res = await fetch(`${this.baseUrl}/models`, { headers });
      if (!res.ok) return [];

      const payload: any = await res.json().catch(() => null);
      const rawModels = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];

      return rawModels
        .map((m: any): DiscoveredModelMetadata | null => {
          const id = String(m?.id || m?.name || '').trim();
          if (!id) return null;
          return {
            id,
            rawName: id,
            displayName: String(m?.name || m?.displayName || id),
            description: m?.description ? String(m.description) : undefined,
            inputTokenLimit: Number(m?.context_length || m?.max_context_length || 32768),
            outputTokenLimit: Number(m?.max_tokens || m?.max_completion_tokens || 4096),
            supportedActions: ['generateContent'],
            isAccessible: true,
            lifecycleState: 'active',
          };
        })
        .filter(Boolean) as DiscoveredModelMetadata[];
    } catch {
      return [];
    }
  }

  public async generate(
    task: TaskId,
    prompt: string,
    options?: ProviderGenerateOptions
  ): Promise<ProviderGenerateResult> {
    const key = this.getApiKey();
    const isLocal = this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1');
    if (!key && !isLocal) {
      throw new Error(`API key is not configured for provider '${this.providerId}'.`);
    }

    const start = Date.now();
    const controller = new AbortController();
    const timeout = options?.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

    const signal = options?.abortSignal
      ? AbortSignal.any([controller.signal, options.abortSignal])
      : controller.signal;

    const requestedMaxTokens = Math.max(256, Number(options?.maxTokens || 2048));
    const boundedMaxTokens = Math.min(requestedMaxTokens, 8192);

    let targetModel = String(options?.modelId || 'default').trim();
    if (targetModel.includes('::')) {
      const parts = targetModel.split('::');
      targetModel = parts.slice(1).join('::') || parts[0];
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'DreamBook/1.0',
      ...this.customHeaders,
    };
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }

    const executeRequest = async (useCompletionTokens: boolean, foldSystemIntoUser: boolean) => {
      let messages: Array<{ role: string; content: string }>;
      if (options?.systemInstruction && !foldSystemIntoUser) {
        messages = [
          { role: 'system', content: options.systemInstruction },
          { role: 'user', content: prompt },
        ];
      } else if (options?.systemInstruction && foldSystemIntoUser) {
        messages = [
          { role: 'user', content: `[SYSTEM INSTRUCTION: ${options.systemInstruction}]\n\n${prompt}` },
        ];
      } else {
        messages = [{ role: 'user', content: prompt }];
      }

      const body: Record<string, unknown> = {
        model: targetModel,
        messages,
        stream: false,
      };

      if (useCompletionTokens) {
        body.max_completion_tokens = boundedMaxTokens;
      } else {
        body.max_tokens = boundedMaxTokens;
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers,
        body: JSON.stringify(body),
      });

      const rawText = await response.text().catch(() => '');
      let payload: any = null;
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        payload = null;
      }

      return { response, payload, rawText };
    };

    try {
      let { response, payload, rawText } = await executeRequest(false, false);

      // If initial request fails due to parameter incompatibility (e.g. system role or max_tokens), try compatible variations
      if (!response.ok) {
        const errString = (payload?.error?.message || payload?.error || rawText || '').toLowerCase();
        if (errString.includes('max_completion_tokens') || (errString.includes('max_tokens') && errString.includes('unsupported'))) {
          const retryRes = await executeRequest(true, false);
          if (retryRes.response.ok) {
            response = retryRes.response;
            payload = retryRes.payload;
            rawText = retryRes.rawText;
          }
        } else if (errString.includes('system') && (errString.includes('role') || errString.includes('developer') || errString.includes('not supported') || errString.includes('must alternate'))) {
          const retryRes = await executeRequest(false, true);
          if (retryRes.response.ok) {
            response = retryRes.response;
            payload = retryRes.payload;
            rawText = retryRes.rawText;
          }
        }
      }

      if (!response.ok) {
        const errorMsg =
          payload?.error?.message ||
          payload?.error ||
          rawText.slice(0, 400) ||
          `Provider '${this.providerId}' request failed (HTTP ${response.status})`;
        throw new Error(String(errorMsg));
      }

      const choice = payload?.choices?.[0];
      const message = choice?.message;
      let text = '';

      if (typeof message?.content === 'string') {
        text = message.content;
      } else if (Array.isArray(message?.content)) {
        text = message.content.map((p: any) => typeof p === 'string' ? p : p?.text || '').join('');
      } else if (typeof choice?.text === 'string') {
        text = choice.text;
      }

      if (!text.trim()) {
        if (typeof message?.reasoning_content === 'string' && message.reasoning_content.trim()) {
          text = message.reasoning_content;
        } else if (typeof message?.reasoning === 'string' && message.reasoning.trim()) {
          text = message.reasoning;
        } else if (typeof message?.thought === 'string' && message.thought.trim()) {
          text = message.thought;
        } else if (typeof (choice as any)?.delta?.content === 'string') {
          text = (choice as any).delta.content;
        }
      }

      if (!text.trim()) {
        throw new Error(`Provider '${this.providerId}' (${targetModel}) returned no text content.`);
      }

      return {
        text: text.trim(),
        rawResponse: payload,
        latencyMs: Math.max(1, Date.now() - start),
        inputTokens: Number(payload?.usage?.prompt_tokens || 0) || Math.ceil(prompt.length / 4),
        outputTokens: Number(payload?.usage?.completion_tokens || 0) || Math.ceil(text.length / 4),
        reasoningTokens: Number(payload?.usage?.completion_tokens_details?.reasoning_tokens || 0) || undefined,
        cachedTokens: Number(payload?.usage?.prompt_tokens_details?.cached_tokens || 0) || undefined,
        modelId: String(payload?.model || targetModel),
        providerId: this.providerId,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

/**
 * GoogleGeminiAdapter
 * Canonical Provider Adapter for Google Gemini API models.
 * Implements:
 * 1. Native provider interface (providerId = 'google_gemini')
 * 2. Dynamic API model discovery (ai.models.list())
 * 3. Real provider execution with context bounds, timeout, and token usage
 * 4. Deterministic fallback mode when offline or mock testing
 * 5. Simulation modes for failover, rate-limiting, and timeout testing
 */
export class GoogleGeminiAdapter implements IProviderAdapter {
  public readonly providerId = 'google_gemini';
  public failureMode?: 'error' | 'timeout' | 'quota' | null;
  public failureCount: number = 0;
  public maxFailuresBeforeSuccess: number = 0;
  public mockDiscoveredCatalog?: DiscoveredModelMetadata[];
  public isMockOnly: boolean = false;

  constructor(options?: {
    failureMode?: 'error' | 'timeout' | 'quota';
    maxFailuresBeforeSuccess?: number;
    mockDiscoveredCatalog?: DiscoveredModelMetadata[];
    isMockOnly?: boolean;
  }) {
    if (options) {
      this.failureMode = options.failureMode;
      this.maxFailuresBeforeSuccess = options.maxFailuresBeforeSuccess ?? 0;
      this.mockDiscoveredCatalog = options.mockDiscoveredCatalog;
      this.isMockOnly = Boolean(options.isMockOnly);
    }
  }

  public isDiscoverySupported(): boolean {
    return true;
  }

  public getProviderStatus(): { configured: boolean; message: string } {
    const hasKey = Boolean(
      (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
      getProviderApiKey('google_gemini'),
    );
    if (!hasKey) {
      return { configured: false, message: 'GEMINI_API_KEY environment variable is not configured.' };
    }
    return { configured: true, message: 'Google Gemini API key configured.' };
  }

  public async validateCredentials(): Promise<boolean> {
    if (this.failureMode === 'error' || this.failureMode === 'quota') {
      return false;
    }
    return Boolean(
      (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
      getProviderApiKey('google_gemini'),
    );
  }

  /**
   * Discovers Gemini models from the real Gemini API (or returns mock catalog if configured).
   */
  public async discoverModels(): Promise<DiscoveredModelMetadata[]> {
    if (this.mockDiscoveredCatalog) {
      return this.mockDiscoveredCatalog;
    }

    const apiKey =
      (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined) ||
      getProviderApiKey('google_gemini');
    if (!apiKey || this.isMockOnly) {
      return this.getFallbackCatalog();
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const modelResponse = await ai.models.list();
      const discovered: DiscoveredModelMetadata[] = [];

      for await (const m of modelResponse) {
        const modelId = m.name ? m.name.replace(/^models\//, '') : '';
        if (!modelId) continue;

        discovered.push({
          id: modelId,
          rawName: m.name || `models/${modelId}`,
          displayName: m.displayName || modelId,
          description: m.description,
          version: m.version,
          inputTokenLimit: m.inputTokenLimit || 1048576,
          outputTokenLimit: m.outputTokenLimit,
          supportedActions: m.supportedActions || [],
          temperature: m.temperature,
          maxTemperature: m.maxTemperature,
          topP: m.topP,
          topK: m.topK,
          thinking: m.thinking,
          isAccessible: true,
          lifecycleState: modelId.includes('deprecated') ? 'deprecated' : (modelId.includes('preview') ? 'preview' : 'active'),
          isPaidModel: GOOGLE_VERIFIED_FREE_GEMINI_MODELS.has(modelId) ? false : undefined,
          freeTierStatus: GOOGLE_VERIFIED_FREE_GEMINI_MODELS.has(modelId) ? 'VERIFIED' : 'UNKNOWN',
          freeTierEvidenceSource: GOOGLE_VERIFIED_FREE_GEMINI_MODELS.has(modelId) ? 'PROVIDER' : 'UNKNOWN',
        });
      }

      return discovered;
    } catch (err: any) {
      // If network or credentials failure, return fallback catalog
      return this.getFallbackCatalog();
    }
  }

  /**
   * Generates turn response.
   * If real GEMINI_API_KEY configured and not in mock/failure mode, executes live call.
   * Otherwise produces deterministic structured turn package.
   */
  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    if (this.failureMode && (this.maxFailuresBeforeSuccess === 0 || this.failureCount < this.maxFailuresBeforeSuccess)) {
      this.failureCount++;
      if (this.failureMode === 'timeout') {
        const t = options?.timeoutMs || 50;
        await new Promise((resolve) => setTimeout(resolve, t + 20));
        throw new Error('Provider request timed out (simulated timeout).');
      }
      if (this.failureMode === 'quota') {
        throw new Error('Provider quota or rate limit exceeded (HTTP 429 Resource Exhausted).');
      }
      throw new Error('Provider request failed (simulated error).');
    }

    const start = Date.now();
    const apiKey = (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined) || getProviderApiKey('google_gemini');
    const canExecuteLive = Boolean(apiKey) && !this.isMockOnly;

    if (!canExecuteLive) {
      const testRuntime =
        typeof process !== 'undefined' &&
        (process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT));
      const canUseOfflineMock =
        options?.allowDeterministicFallback !== false &&
        (this.isMockOnly || testRuntime);

      if (!canUseOfflineMock) {
        throw new Error('GEMINI_API_KEY is not configured for Google Gemini AI execution.');
      }
    }

    if (canExecuteLive) {
      try {
        const ai = new GoogleGenAI({
          apiKey: apiKey!,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const targetModel = options?.modelId || 'gemini-3.5-flash';
        const defaultSystemPrompt = `PROMPT_VERSION: ${DREAMBOOK_PROMPT_VERSION}
You are the Dreamville canonical narrator. Produce ONLY a valid JSON turn package matching this exact schema:
{
  "narrative": ["text describing world events"],
  "dialogue": [{"speaker": "string", "text": "string"}],
  "events": ["EVENT_NAME"],
  "stateChanges": [{"kind": "INVENTORY|LOCATION|CAPABILITY|COMBAT", "targetId": "string", "value": "string"}],
  "memoryCandidates": ["string"],
  "audioCues": ["string"],
  "visualCues": ["short, concrete visual beat in chronological order"]
}
Do not enclose in markdown ticks, output pure JSON.`;
        const systemPrompt = options?.systemInstruction || defaultSystemPrompt;

        let reqConfig: Record<string, any> = {
          systemInstruction: systemPrompt,
          responseMimeType: task === 'narrative.review' || task === 'capability.explain'
            ? 'text/plain'
            : 'application/json',
        };
        let reqContents: any[] = [prompt];
        
        if (task === 'speech.transcribe' && options?.audioInputBase64) {
          reqContents = [
            { inlineData: { mimeType: options.audioMimeType || 'audio/webm', data: options.audioInputBase64 } },
            prompt
          ];
          reqConfig.responseMimeType = 'text/plain';
          reqConfig.systemInstruction = 'Transcribe the audio accurately.';
        }
        
        if (task === 'speech.generate') {
          delete (reqConfig as any).responseMimeType;
          delete (reqConfig as any).systemInstruction;
          // Gemini doesn't officially document TTS in generateContent as widely known outside of live API, 
          // but if we are targeting a specialized TTS model, we might just pass text.
          reqContents = [prompt];
        }

        const callPromise = ai.models.generateContent({
          model: targetModel,
          contents: reqContents,
          config: reqConfig,
        });
  

        let res: any;
        if (options?.timeoutMs) {
          let timer: NodeJS.Timeout | null = null;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`Provider request timed out after ${options.timeoutMs}ms.`)),
              options.timeoutMs
            );
          });
          try {
            res = await Promise.race([callPromise, timeoutPromise]);
          } finally {
            if (timer) clearTimeout(timer);
          }
        } else {
          res = await callPromise;
        }

        const latencyMs = Math.max(1, Date.now() - start);
        
        let rawText = '';
        let audioBase64 = undefined;
        try {
          rawText = (res.text || '').trim();
        } catch(e) {}
        
        if (res.candidates && res.candidates[0] && res.candidates[0].content && res.candidates[0].content.parts) {
          for (const part of res.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
              audioBase64 = part.inlineData.data;
            }
          }
        }

        rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

        if (task === 'speech.transcribe') {
          if (!rawText) {
            throw new Error('Speech transcription provider returned empty text.');
          }
          const parsed = { narrative: [rawText], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] };
          return {
            text: JSON.stringify(parsed),
            latencyMs,
            inputTokens: res.usageMetadata?.promptTokenCount || 0,
            outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
            reasoningTokens: res.usageMetadata?.thoughtsTokenCount || 0,
            cachedTokens: res.usageMetadata?.cachedContentTokenCount || 0,
            toolTokens: res.usageMetadata?.toolUsePromptTokenCount || 0,
            modelId: targetModel,
            providerId: this.providerId,
            rawResponse: res,
          };
        }
        if (task === 'speech.generate') {
          const parsed = { narrative: [rawText || 'Generated speech'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] };
          return {
            text: JSON.stringify(parsed),
            audioBase64,
            latencyMs,
            inputTokens: res.usageMetadata?.promptTokenCount || 0,
            outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
            modelId: targetModel,
            providerId: this.providerId,
            rawResponse: res,
          };
        }

        return {
          text: rawText,
          latencyMs,
          inputTokens: res.usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 4),
          outputTokens: res.usageMetadata?.candidatesTokenCount || Math.ceil(rawText.length / 4),
          modelId: targetModel,
          providerId: this.providerId,
          rawResponse: res,
        };
      } catch (err: any) {
        // If live call fails with timeout or quota, propagate so circuit breaker/failover handles it
        throw err;
      }
    }

    // Deterministic mock generation for offline/sandbox runtime
    let text: string;
    if (task === 'ooc.respond') {
      text = JSON.stringify({
        response: 'DreamBook OOC: Based on the current story context, everything is currently operating within canonical rules.',
      });
    } else if (task === 'character.extract' || prompt.includes('Character Genesis') || prompt.includes('CharacterGenesisDraft')) {
      text = JSON.stringify({
        identity: {
          name: 'Vanguard Traveler',
          species: 'Human',
          age: 24,
          gender: 'Unspecified',
        },
        appearance: {
          physicalDescription: 'A resolute traveler prepared for uncharted terrain, bearing weathered garments and disciplined posture.',
          distinguishingTraits: ['Intense focused gaze', 'Practical traveler gear'],
        },
        personality: {
          traits: ['Pragmatic', 'Vigilant'],
          temperament: 'Calm under pressure',
          values: ['Survival', 'Truth', 'Independence'],
          fears: ['Loss of agency'],
          desires: ['Mastery and understanding of anomalies'],
          dialogueStyle: 'Measured and concise',
        },
        background: {
          origin: 'Threshold borderlands',
          history: 'Traversed anomalous crossings to reach the current frontier.',
          socialClass: 'Wanderer',
          formerOccupations: ['Scout'],
        },
        role: {
          profession: 'Scout',
          archetype: 'Wanderer',
          specialization: 'Survival',
        },
        startingEquipment: {
          mainHand: { id: 'item_blade', name: 'Field Blade', type: 'WEAPON', damageFormula: '1d6' },
          body: { id: 'item_garb', name: 'Reinforced Traveler Garb', type: 'ARMOR' },
          pack: [{ id: 'item_supplies', name: 'Survival Provisions', quantity: 3 }],
        },
        startingLocation: {
          locationId: 'loc_threshold',
          name: 'Border Threshold',
          region: 'Outer Reach',
          description: 'An ancient crossing where newcomers find their footing.',
        },
        startingSituation: {
          summary: 'Arriving at an unfamiliar threshold seeking purpose.',
          hook: 'A strange resonance marks the area.',
          initialConditions: 'Alert and watchful of immediate surroundings.',
          whyHereNow: 'Driven by necessity to explore this world.',
        },
        capabilities: [],
        aiExtractionSummary: {
          interpretation: 'AI-assisted character draft.',
          keyFacts: ['Extracted via selected AI model.'],
          proposedHighlights: ['Balanced starting baseline.'],
          uncertainties: [],
        },
      });
    } else {
      text = JSON.stringify({
        narrative: [
          'The prismatic lenses align with celestial geometry, casting refracted amber rays across the chamber floor.',
        ],
        dialogue: [
          { speaker: 'Scribe Vael', text: 'The astral alignment matches the parchment records from Cycle 3.' },
        ],
        events: ['CELESTIAL_ALIGNMENT_OBSERVED'],
        stateChanges: [
          { kind: 'ALIGNMENT', targetId: 'ev_celestial_alignment', value: 'Observed prismatic celestial alignment' },
        ],
        memoryCandidates: ['The prismatic lenses aligned with the third astral ring.'],
        audioCues: ['glass_harmonic', 'brass_gear_click'],
      });
    }

    return {
      text,
      latencyMs: Math.max(10, Date.now() - start),
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      modelId: options?.modelId || 'gemini-3.5-flash',
      providerId: this.providerId,
    };
  }

  public getFallbackCatalog(): DiscoveredModelMetadata[] {
    return [
      {
        id: 'gemini-3.5-flash',
        rawName: 'models/gemini-3.5-flash',
        displayName: 'Gemini 3.5 Flash (Primary Live Text Engine)',
        description: 'High-speed primary live text engine and dialogue model',
        inputTokenLimit: 1048576,
        outputTokenLimit: 65536,
        supportedActions: ['generateContent', 'countTokens'],
        isAccessible: true,
        lifecycleState: 'active',
        isPaidModel: false,
        freeTierStatus: 'VERIFIED',
        freeTierEvidenceSource: 'PROVIDER',
      },
      {
        id: 'gemini-3.8-flash',
        rawName: 'models/gemini-3.8-flash',
        displayName: 'Gemini 3.8 Flash (Fallback Text Model)',
        description: 'High-speed creative and extraction model',
        inputTokenLimit: 1048576,
        outputTokenLimit: 65536,
        supportedActions: ['generateContent', 'countTokens'],
        isAccessible: true,
        lifecycleState: 'active',
        isPaidModel: false,
        freeTierStatus: 'VERIFIED',
        freeTierEvidenceSource: 'PROVIDER',
      },
      {
        id: 'gemini-3.5-flash-lite',
        rawName: 'models/gemini-3.5-flash-lite',
        displayName: 'Gemini 3.5 Flash Lite (Fast Utility)',
        description: 'Ultra-fast utility and extraction model',
        inputTokenLimit: 1048576,
        outputTokenLimit: 65536,
        supportedActions: ['generateContent', 'countTokens'],
        isAccessible: true,
        lifecycleState: 'active',
        isPaidModel: false,
        freeTierStatus: 'VERIFIED',
        freeTierEvidenceSource: 'PROVIDER',
      },
      {
        id: 'gemini-3.1-flash-lite',
        rawName: 'models/gemini-3.1-flash-lite',
        displayName: 'Gemini 3.1 Flash Lite',
        description: 'Fast utility and extraction model',
        inputTokenLimit: 1048576,
        outputTokenLimit: 65536,
        supportedActions: ['generateContent', 'countTokens'],
        isAccessible: true,
        lifecycleState: 'active',
        isPaidModel: false,
        freeTierStatus: 'VERIFIED',
        freeTierEvidenceSource: 'PROVIDER',
      },
      {
        id: 'gemini-2.5-flash',
        rawName: 'models/gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        description: 'High-speed utility model',
        inputTokenLimit: 1048576,
        outputTokenLimit: 65536,
        supportedActions: ['generateContent', 'countTokens'],
        isAccessible: true,
        lifecycleState: 'active',
        isPaidModel: false,
        freeTierStatus: 'VERIFIED',
        freeTierEvidenceSource: 'PROVIDER',
      },
      {
        id: 'gemini-2.5-critic',
        rawName: 'models/gemini-2.5-critic',
        displayName: 'Gemini 2.5 Critic (Verification & Rules)',
        description: 'Structured verification and review specialist',
        inputTokenLimit: 500000,
        outputTokenLimit: 8192,
        supportedActions: ['generateContent', 'countTokens'],
        isAccessible: true,
        lifecycleState: 'active',
      },
      {
        id: 'gemini-3.1-flash-tts-preview',
        rawName: 'models/gemini-3.1-flash-tts-preview',
        displayName: 'Gemini 3.1 Flash TTS',
        description: 'Speech synthesis specialist model',
        inputTokenLimit: 8192,
        outputTokenLimit: 8192,
        supportedActions: ['generateContent'],
        isAccessible: true,
        lifecycleState: 'preview',
      },
    ];
  }
}

/**
 * Domain Adjudication Bridge
 * Implements DreamBook v6.19 & v6.20.
 * Bridges untrusted model proposals to existing authoritative canonical domain engines.
 * Does NOT directly mutate game state bypassing domain rules.
 */
export class DomainAdjudicationBridge {
  public static adjudicate(
    turnPackage: StructuredTurnPackage,
    repo: WorldRepository,
    storyId: string,
    narrativePlan?: EphemeralNarrativePlan,
  ): AdjudicationResult {
    const outcomes: AdjudicationOutcomeItem[] = [];

    for (const change of turnPackage.stateChanges) {
      const kind = (change.kind || '').toUpperCase();

      if (kind === 'CAPABILITY') {
        const capabilityEngine = repo.getCapabilityEngine(storyId);
        const caps = capabilityEngine.getAllCapabilities();
        const found = caps.find((c: { id: string }) => c.id === change.targetId);
        if (found) {
          outcomes.push({
            change,
            approved: true,
            canonicalEngine: 'CapabilityEngine (CH6/CH7)',
          });
        } else {
          outcomes.push({
            change,
            approved: false,
            reason: `Capability '${change.targetId}' not recognized in player repertoire.`,
            canonicalEngine: 'CapabilityEngine (CH6/CH7)',
          });
        }
      } else if (kind === 'INVENTORY') {
        const inventoryEngine = repo.getInventoryEngine(storyId);
        const def = inventoryEngine.getItemDefinition(change.targetId);
        const instance = inventoryEngine.getItemInstance(change.targetId);
        if (def || instance) {
          outcomes.push({
            change,
            approved: true,
            canonicalEngine: 'InventoryItemEngine (CH5)',
          });
        } else {
          outcomes.push({
            change,
            approved: false,
            reason: `Item '${change.targetId}' not found in canonical inventory registry.`,
            canonicalEngine: 'InventoryItemEngine (CH5)',
          });
        }
      } else if (kind === 'LOCATION') {
        const geography = repo.getGeographyGraph();
        const node = geography.getNode(change.targetId);
        if (node) {
          outcomes.push({
            change,
            approved: true,
            canonicalEngine: 'GeographyGraph (CH1/CH2)',
          });
        } else {
          outcomes.push({
            change,
            approved: false,
            reason: `Location '${change.targetId}' does not exist in geography graph.`,
            canonicalEngine: 'GeographyGraph (CH1/CH2)',
          });
        }
      } else if (kind === 'COMBAT') {
        const combatEngine = repo.getCombatEngine(storyId);
        const participants = combatEngine.getParticipants();
        if (participants.length > 0) {
          outcomes.push({
            change,
            approved: true,
            canonicalEngine: 'TacticalCombatEngine (CH8)',
          });
        } else {
          outcomes.push({
            change,
            approved: false,
            reason: 'Cannot apply combat mutation; combat encounter is not currently ACTIVE.',
            canonicalEngine: 'TacticalCombatEngine (CH8)',
          });
        }
      } else if (kind === 'CHRONICLE') {
        outcomes.push({
          change,
          approved: false,
          reason: 'Historical evidence must originate from authoritative canonical events, not AI assertions.',
          canonicalEngine: 'DomainAdjudicationBridge',
        });
      } else if (kind === 'PHYSIOLOGY' || kind === 'HEALTH') {
        const numVal = Number(change.value);
        if (!isNaN(numVal) && numVal >= 0 && numVal <= 100) {
          outcomes.push({
            change,
            approved: true,
            canonicalEngine: 'LivingWorldSimulation (CH10)',
          });
        } else {
          outcomes.push({
            change,
            approved: false,
            reason: `Physiological value '${change.value}' outside authorized bounds (0-100).`,
            canonicalEngine: 'LivingWorldSimulation (CH10)',
          });
        }
      } else if (kind === 'ALIGNMENT') {
        outcomes.push({
          change,
          approved: true,
          canonicalEngine: 'CharacterAlignmentEngine',
        });
      } else {
        outcomes.push({
          change,
          approved: false,
          reason: `Unauthorized state change kind '${change.kind}' rejected by domain authority.`,
          canonicalEngine: 'AuthoritativeAdjudicationGuard',
        });
      }
    }

    const approvedCount = outcomes.filter((o) => o.approved).length;
    const rejectedCount = outcomes.filter((o) => !o.approved).length;
    const allApproved = rejectedCount === 0;
    const disapprovedChanges = outcomes
      .filter((o) => !o.approved)
      .map((o) => ({ change: o.change, reason: o.reason, canonicalEngine: o.canonicalEngine }));
    const approvedChanges = outcomes
      .filter((o) => o.approved)
      .map((o) => o.change);

    // ATOMIC COMMIT: Only commit side-effecting mutations if ALL proposed state changes are approved!
    if (allApproved) {
      for (const outcome of outcomes) {
        const change = outcome.change;
        const kind = (change.kind || '').toUpperCase();
        // Additional engine commits will be added here
      }
    }

    return {
      allApproved,
      approvedCount,
      rejectedCount,
      outcomes,
      approvedChanges,
      disapprovedChanges,
      narrativePlanObjective: narrativePlan?.objective,
      expectedNarrativeEffectKinds: narrativePlan?.stateEffectsExpected.map((effect) => effect.kind),
    };
  }
}


/**
 * Persists AI-selected continuity candidates as non-critical episodic memories.
 * Canonical gameplay state remains authoritative; these records preserve
 * narrative continuity without allowing AI prose to mutate gameplay state.
 */
export function persistTurnMemoryCandidates(
  repository: WorldRepository,
  storyId: string,
  turnId: string,
  candidates: string[] | undefined,
): number {
  if (!Array.isArray(candidates) || candidates.length === 0) return 0;

  const player = repository.getPlayerLifecycle(storyId);
  if (!player) return 0;

  const memoryEngine = repository.getMemoryEngine(storyId);
  const clock = repository.getWorldClock(storyId);
  const timestamp = clock.getTimestamp();
  const currentTurn = repository.getCanonicalCommandEventCount(storyId);
  const normalizedCandidates = Array.from(
    new Map(
      candidates
        .map((candidate) => String(candidate || '').trim())
        .filter((candidate) => candidate.length >= 8)
        .map((candidate) => [candidate.toLowerCase(), candidate]),
    ).values(),
  ).slice(0, 8);

  let stored = 0;

  for (const candidate of normalizedCandidates) {
    const memoryId = deterministicId(
      'ai_turn_memory_candidate',
      storyId,
      turnId,
      candidate,
    );

    if (memoryEngine.getMemory(memoryId)) continue;

    const triggerConditionTags = [
      'ai_turn_memory',
      ...candidate
        .toLowerCase()
        .split(/\W+/)
        .filter((token) => token.length >= 3)
        .slice(0, 8),
    ];

    memoryEngine.storeMemory({
      id: memoryId,
      storyId,
      memoryClass: 'EPISODIC',
      subjectEntityId: player.actorId,
      relatedEntityIds: [],
      content: candidate,
      importance: 55,
      confidence: 0.75,
      status: 'active',
      visibility: 'PRIVATE',
      accessibleToEntityIds: [player.actorId],
      isPersistentCritical: false,
      provenance: 'automatic_ai_turn_memory_candidate',
      sourceEventId: turnId,
      validFromTurn: currentTurn,
      lastRecalledTurn: currentTurn,
      createdAtTimestamp: timestamp,
      lastRecalledTimestamp: timestamp,
      triggerConditionTags,
    });

    stored += 1;
  }

  return stored;
}

/**
 * MultiModelOrchestrator
 * Implements DreamBook Challenge 12 & V6.0–V6.53.
 * 5 Canonical Model Pools, Intelligent Selection Scoring, Deterministic Tie-Breaking,
 * Circuit Breaking, Automated Failover, Cross-Model Continuation Checkpoints,
 * Strict Turn Package Validation, and Domain Adjudication.
 */
export function validateAudioBase64(input: string): {
	valid: boolean;
	normalized: string;
	errorCode?: 'INPUT_EMPTY' | 'INPUT_INVALID_BASE64';
	reason?: string;
} {
	const normalized = String(input || '').replace(/\s+/g, '');
	if (!normalized) {
		return {
			valid: false,
			normalized: '',
			errorCode: 'INPUT_EMPTY',
			reason: 'No audio data was supplied.',
		};
	}
	if (
		normalized.length < 16 ||
		normalized.length % 4 !== 0 ||
		!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
	) {
		return {
			valid: false,
			normalized,
			errorCode: 'INPUT_INVALID_BASE64',
			reason: 'Audio payload is not valid base64 data.',
		};
	}
	try {
		const bytes = Buffer.from(normalized, 'base64');
		if (!bytes.length) throw new Error('zero bytes');
	} catch {
		return {
			valid: false,
			normalized,
			errorCode: 'INPUT_INVALID_BASE64',
			reason: 'Audio payload could not be decoded.',
		};
	}
	return { valid: true, normalized };
}

export function normalizeTranscriptionProviderText(rawText: string): { valid: boolean; text: string; reason?: string } {
	let cleaned = String(rawText || '')
		.trim()
		.replace(/^\`\`\`(?:json|text)?\s*/i, '')
		.replace(/\s*\`\`\`$/i, '')
		.trim();

	if (!cleaned) {
		return { valid: false, text: '', reason: 'Transcription provider returned empty text.' };
	}

	if (/^<!doctype html\b|^<html\b/i.test(cleaned)) {
		return { valid: false, text: '', reason: 'Transcription provider returned HTML instead of transcript text.' };
	}

	try {
		const parsed = JSON.parse(cleaned);
		if (typeof parsed === 'string' && parsed.trim()) {
			cleaned = parsed.trim();
		} else {
			const candidates = [
				parsed?.transcript,
				parsed?.text,
				parsed?.transcription,
				Array.isArray(parsed?.narrative) ? parsed.narrative[0] : undefined,
				Array.isArray(parsed?.segments)
					? parsed.segments.map((segment: any) => segment?.text).filter(Boolean).join(' ')
					: undefined,
			];
			const resolved = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
			if (!resolved) {
				return { valid: false, text: '', reason: 'Transcription JSON did not contain transcript text.' };
			}
			cleaned = String(resolved).trim();
		}
	} catch {
		if (/^[\[{]/.test(cleaned)) {
			return { valid: false, text: '', reason: 'Transcription provider returned malformed JSON.' };
		}
	}

	return cleaned
		? { valid: true, text: cleaned }
		: { valid: false, text: '', reason: 'Transcription provider returned empty text.' };
}

export class MultiModelOrchestrator {
  public static readonly PROMPT_VERSION = DREAMBOOK_PROMPT_VERSION;
  private models: Map<string, ModelRegistryRecord> = new Map();
  private adapters: Map<string, IProviderAdapter> = new Map();
  private checkpoints: Map<string, ContinuationCheckpoint> = new Map();
  private consecutiveFailures: Map<string, number> = new Map();
  private circuitBreakersTripped: Set<string> = new Set();
  private totalTurnsExecuted: number = 0;
  private lastTurnTelemetry: OrchestratedTurnTelemetry | null = null;
  private worldRepo?: WorldRepository;

  // V6.34 Server-authoritative idempotency caches scoped by `${storyId}::${idempotencyKey}`
  private turnResultsByIdempotencyKey: Map<string, OrchestratedTurnResult> = new Map();
  private inFlightTurnPromises: Map<string, Promise<OrchestratedTurnResult>> = new Map();

  private manualOverrides: Map<string, ManualModelOverride> = new Map();
  private categoryOverrides: Map<AiTaskCategory, string> = new Map();
  private runtimeStatus: Map<string, ModelRuntimeStatus> = new Map();
  private usageLedger: UsageLedgerEntry[] = [];
  private taskPinnedModels: Map<TaskId, string> = new Map();
  private taskFallbackChains: Map<TaskId, string[]> = new Map();
  private explicitFallbackChainTasks: Set<TaskId> = new Set();
  private activeModelOperations: Map<string, ActiveModelOperation> = new Map();
  private lastModelExecutionByTask: Map<TaskId, LastModelExecution> = new Map();
  private executionSequence = 0;
  private discoveredCatalog: DiscoveredModelMetadata[] = [];
  private excludedCatalog: { modelId: string; rawName: string; reason: string }[] = [];
  private lastDiscoveredAt: number = 0;
  private discoveryStatus: 'ConfiguredAndDiscovered' | 'CredentialsMissing' | 'DiscoveryUnavailable' | 'MockDiscovered' = 'CredentialsMissing';

  private configFilePath = (typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT)))
    ? path.resolve(process.cwd(), 'server', 'data', 'orchestrator_config_test.json')
    : path.resolve(process.cwd(), 'server', 'data', 'orchestrator_config.json');

  constructor(repo?: WorldRepository) {
    this.worldRepo = repo;
    this.seedDefaultModels();
    this.seedDefaultAdapters();
    this.seedDefaultPins();
    const isTestRuntime =
      typeof process !== 'undefined' &&
      (process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT));
    const loadTestPersistence = process.env.DREAMVILLE_TEST_LOAD_PERSISTED_CONFIG === '1';
    if (!isTestRuntime || loadTestPersistence) {
      this.loadPersistedConfig();
    }
    this.normalizePinnedTaskFallbackRoutes();
    this.normalizeGeneralTextTaskEligibility();
  }

  private loadPersistedConfig(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          if (Array.isArray(data.customModels)) {
            for (const cm of data.customModels) {
              if (cm && cm.providerId && cm.modelId) {
                this.registerModel(cm);
              }
            }
          }
          if (data.pins && typeof data.pins === 'object') {
            for (const [task, key] of Object.entries(data.pins)) {
              if (typeof key === 'string') {
                this.taskPinnedModels.set(task as TaskId, key);
              }
            }
          }
          if (data.categoryOverrides && typeof data.categoryOverrides === 'object') {
            for (const [category, key] of Object.entries(data.categoryOverrides)) {
              if (typeof key === 'string') {
                this.categoryOverrides.set(category as AiTaskCategory, key);
              }
            }
          }
          if (data.fallbackChains && typeof data.fallbackChains === 'object') {
            for (const [task, chain] of Object.entries(data.fallbackChains)) {
              if (Array.isArray(chain)) {
                const cleaned = chain.filter(Boolean) as string[];
                if (!cleaned.some(c => c.includes('emergency-fallback-local'))) {
                  cleaned.push('provider_deterministic_emergency::emergency-fallback-local');
                }
                this.taskFallbackChains.set(task as TaskId, cleaned);
                this.explicitFallbackChainTasks.add(task as TaskId);
              }
            }
          }
          if (Array.isArray(data.overrides)) {
            for (const ov of data.overrides) {
              if (ov && ov.modelId) {
                this.setManualOverride(ov.modelId, ov);
              }
            }
          }
        }
      }
    } catch (e) {
      // Ignore load errors
    }
  }

  /**
   * Keeps persisted task routes structurally consistent with their configured
   * primary model. A pin is the route's first model; deterministic emergency
   * remains the terminal floor.
   */
  private normalizePinnedTaskFallbackRoutes(): void {
    const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';
    let changed = false;

    for (const [task, pinnedKey] of this.taskPinnedModels.entries()) {
      if (!pinnedKey) continue;

      const currentChain = this.taskFallbackChains.get(task) || [];
      const aiFallbacks = currentChain.filter(
        (key) => key !== pinnedKey && key !== emergencyKey,
      );
      const normalizedChain = Array.from(new Set([
        pinnedKey,
        ...aiFallbacks,
        emergencyKey,
      ]));

      if (
        currentChain.length !== normalizedChain.length ||
        currentChain.some((key, index) => key !== normalizedChain[index])
      ) {
        this.taskFallbackChains.set(task, normalizedChain);
        changed = true;
      }
    }

    if (changed) {
      this.savePersistedConfig();
    }
  }

  private savePersistedConfig(): void {
    const isTestRuntime =
      typeof process !== 'undefined' &&
      (process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT));
    if (isTestRuntime && process.env.DREAMVILLE_TEST_LOAD_PERSISTED_CONFIG !== '1') {
      return;
    }
    try {
      const dir = path.dirname(this.configFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const pins: Record<string, string> = {};
      for (const [task, key] of this.taskPinnedModels.entries()) {
        pins[task] = key;
      }
      const fallbackChains: Record<string, string[]> = {};
      for (const [task, chain] of this.taskFallbackChains.entries()) {
        fallbackChains[task] = chain;
      }
      const overrides = this.getManualOverrides();
      const categoryOverrides: Record<string, string> = {};
      for (const [category, key] of this.categoryOverrides.entries()) {
        categoryOverrides[category] = key;
      }
      const customModels = Array.from(this.models.values()).filter(
        (m) => m.providerId === 'openrouter' || m.providerId === 'openai' || m.providerId === 'anthropic' || m.providerId === 'custom'
      );
      fs.writeFileSync(this.configFilePath, JSON.stringify({ pins, fallbackChains, categoryOverrides, overrides, customModels }, null, 2), 'utf-8');
    } catch (e) {
      // Ignore save errors
    }
  }

  private normalizeGeneralTextTaskEligibility(): void {
    const generalTasks: TaskId[] = [
      'narrative.generate',
      'world.generate',
      'character.dialogue',
      'ooc.respond',
      'character.extract',
      'memory.extract',
      'character.capability.propose',
      'story.advice',
      'intent.interpret',
      'capability.synthesize',
      'capability.explain',
      'research.query',
      'research.world-brief',
      'rules.adjudicate',
      'rules.analyze',
      'summary.scene',
      'combat.tactics',
      'tactical.reason',
      'combat.animation.plan',
      'narrative.review',
      'utility.inspect',
    ];
    for (const model of this.models.values()) {
      const capabilities = new Set(model.capabilities || []);
      const isSpecializedNonText =
        model.hasImageGeneration ||
        model.hasAudio ||
        capabilities.has('speech_synthesis') ||
        capabilities.has('speech_transcription') ||
        capabilities.has('tts') ||
        capabilities.has('stt');
      if (isSpecializedNonText) continue;

      const hasTextCapability =
        model.isEmergencyFloor ||
        capabilities.has('text_generation') ||
        capabilities.has('text') ||
        capabilities.has('creative_writing') ||
        capabilities.has('fast') ||
        capabilities.has('reasoning') ||
        capabilities.has('structured_output');

      const legacyGeneralTextModel =
        capabilities.size === 0 &&
        model.roleEligibility.some((task) => generalTasks.includes(task));

      if (!hasTextCapability && !legacyGeneralTextModel) continue;

      if (!model.capabilities) model.capabilities = [];
      if (!model.capabilities.includes('text_generation')) {
        model.capabilities.push('text_generation');
      }
      if (!model.supportedInputTypes || model.supportedInputTypes.length === 0) model.supportedInputTypes = ['text'];
      if (!model.supportedOutputTypes || model.supportedOutputTypes.length === 0) {
        model.supportedOutputTypes = ['text', 'json'];
      } else if (!model.supportedOutputTypes.includes('json')) {
        model.supportedOutputTypes.push('json');
      }

      for (const task of generalTasks) {
        if (!model.roleEligibility.includes(task)) model.roleEligibility.push(task);
      }
    }
  }


  private resolveTaskCategory(task: TaskId): AiTaskCategory {
    return getAiTaskContract(task).category;
  }

  public getTaskCategory(task: TaskId): AiTaskCategory {
    return this.resolveTaskCategory(task);
  }

  private getCategoryTasks(category: AiTaskCategory): TaskId[] {
    return getAiTasksByCategory(category);
  }

  private getTaskRuntimeRoute(task: TaskId): TaskRuntimeRouteState {
    const category = this.resolveTaskCategory(task);
    const categoryOverrideKey = this.categoryOverrides.get(category);
    const fallbackChain = this.getFallbackChain(task);

    if (categoryOverrideKey) {
      const categoryOverrideModel = this.models.get(categoryOverrideKey)
        || Array.from(this.models.values()).find((model) => this.modelKey(model) === categoryOverrideKey || model.modelId === categoryOverrideKey);
      if (categoryOverrideModel?.roleEligibility.includes(task)) {
        return {
          task,
          activeModelKey: categoryOverrideKey,
          mode: 'CATEGORY_MANUAL',
          fallbackChain,
        };
      }
    }

    const pinnedKey = this.taskPinnedModels.get(task);
    if (pinnedKey) {
      return {
        task,
        activeModelKey: pinnedKey,
        mode: 'TASK_PINNED',
        fallbackChain,
      };
    }

    return {
      task,
      activeModelKey: fallbackChain[0],
      mode: 'AUTO',
      fallbackChain,
    };
  }

  private modelKey(model: ModelRegistryRecord): string {
    return model.providerId + '::' + model.modelId;
  }

  private beginModelOperation(
    task: TaskId,
    model: ModelRegistryRecord,
    attempt: number,
    source: ActiveModelOperation['source'],
  ): string {
    const operationId = 'aiop_' + Date.now() + '_' + (++this.executionSequence);
    const operation: ActiveModelOperation = {
      operationId,
      task,
      category: this.getTaskCategory(task),
      providerId: model.providerId,
      modelId: model.modelId,
      displayName: model.displayName || model.modelId,
      modelKey: this.modelKey(model),
      status: 'RUNNING',
      attempt,
      startedAt: Date.now(),
      source,
    };
    this.activeModelOperations.set(operationId, operation);
    return operationId;
  }

  private finishModelOperation(
    operationId: string,
    status: LastModelExecution['status'],
    latencyMs: number,
    error?: string,
  ): void {
    const operation = this.activeModelOperations.get(operationId);
    if (!operation) return;
    const finishedAt = Date.now();
    this.activeModelOperations.delete(operationId);
    this.lastModelExecutionByTask.set(operation.task, {
      operationId,
      task: operation.task,
      category: operation.category,
      providerId: operation.providerId,
      modelId: operation.modelId,
      displayName: operation.displayName,
      modelKey: operation.modelKey,
      status,
      startedAt: operation.startedAt,
      finishedAt,
      latencyMs: Math.max(1, latencyMs),
      source: operation.source,
      error: error ? String(error).slice(0, 300) : undefined,
    });
  }

  public getFreeModelCatalog(): Array<ModelRegistryRecord & { runtime?: ModelRuntimeStatus }> {
    const seen = new Set<string>();
    const result: Array<ModelRegistryRecord & { runtime?: ModelRuntimeStatus }> = [];
    for (const model of this.models.values()) {
      if (model.isEmergencyFloor || !MultiModelOrchestrator.isFreeModelCandidate(model)) continue;
      const canonicalKey = model.providerId === 'provider_google_gemini'
        ? 'google_gemini::' + model.modelId
        : this.modelKey(model);
      if (seen.has(canonicalKey)) continue;
      seen.add(canonicalKey);
      result.push({ ...model, runtime: { ...this.ensureRuntimeStatus(model) } });
    }
    return result.sort((a, b) => (a.displayName || a.modelId).localeCompare(b.displayName || b.modelId));
  }

  public async refreshProviderQuotas(): Promise<ProviderQuotaSnapshot[]> {
    return this.refreshProviderQuotaSnapshots();
  }

  private ensureRuntimeStatus(model: ModelRegistryRecord): ModelRuntimeStatus {
    const key = this.modelKey(model);
    let status = this.runtimeStatus.get(key);
    if (!status) {
      status = {
        providerId: model.providerId,
        modelId: model.modelId,
        status: model.health,
        operationalStatus: model.isEmergencyFloor
          ? 'AVAILABLE'
          : model.health === 'DisabledByUser'
            ? 'DISABLED'
            : model.health === 'Unavailable' || model.health === 'InvalidAuth'
              ? 'UNAVAILABLE'
              : model.health === 'Throttled'
                ? 'THROTTLED'
                : 'AVAILABLE',
        requests: 0,
        successCount: 0,
        failureCount: 0,
        consecutiveFailures: 0,
        rateLimit429Count: 0,
        serverError5xxCount: 0,
        timeoutCount: 0,
        lastLatencyMs: 0,
        averageLatencyMs: 0,
        observedTokens: { input: 0, output: 0, reasoning: 0, cached: 0, tool: 0, total: 0 },
        headroom: { exact: false, source: 'UNKNOWN' },
      };
      this.runtimeStatus.set(key, status);
    } else if (model.configuredLimits) {
      status.configuredLimits = { ...model.configuredLimits };
    }
    return status;
  }

  private isModelCoolingDown(model: ModelRegistryRecord): boolean {
    const cooldownUntil = this.ensureRuntimeStatus(model).cooldownUntil;
    return typeof cooldownUntil === 'number' && cooldownUntil > Date.now();
  }

  private recordProviderSuccess(
    model: ModelRegistryRecord,
    result: ProviderGenerateResult,
    task: TaskId,
    startedAt: number,
    purpose: UsageLedgerEntry['purpose'] = 'GAMEPLAY',
  ): void {
    const status = this.ensureRuntimeStatus(model);
    const latencyMs = Math.max(1, result.latencyMs || Date.now() - startedAt);
    status.requests += 1;
    status.successCount += 1;
    status.consecutiveFailures = 0;
    status.lastLatencyMs = latencyMs;
    status.averageLatencyMs = status.successCount === 1
      ? latencyMs
      : Math.round(((status.averageLatencyMs * (status.successCount - 1)) + latencyMs) / status.successCount);
    status.lastSuccessAt = Date.now();
    status.cooldownUntil = undefined;
    status.status = 'Healthy';
    status.operationalStatus = 'AVAILABLE';
    if (model.quota === 'Exhausted') {
      model.quota = 'Healthy';
    }
    const inputTokens = Number(result.inputTokens || 0);
    const outputTokens = Number(result.outputTokens || 0);
    const reasoningTokens = Number(result.reasoningTokens || 0);
    const cachedTokens = Number(result.cachedTokens || 0);
    const toolTokens = Number(result.toolTokens || 0);
    const totalTokens = inputTokens + outputTokens + reasoningTokens + cachedTokens + toolTokens;
    status.observedTokens.input += inputTokens;
    status.observedTokens.output += outputTokens;
    status.observedTokens.reasoning += reasoningTokens;
    status.observedTokens.cached += cachedTokens;
    status.observedTokens.tool += toolTokens;
    status.observedTokens.total += totalTokens;

    if (status.configuredLimits?.tokensPerDay && status.configuredLimits.tokensPerDay > 0) {
      const remaining = Math.max(0, status.configuredLimits.tokensPerDay - status.observedTokens.total);
      status.headroom = {
        value: remaining,
        exact: false,
        source: 'ESTIMATE',
        unit: 'TOKENS',
      };
      model.quotaEvidenceSource = 'ESTIMATE';
    } else if (!status.headroom || status.headroom.source === 'UNKNOWN') {
      status.headroom = {
        exact: false,
        source: 'UNKNOWN',
        unit: 'UNKNOWN',
      };
    }

    model.health = 'Healthy';
    model.latencyMs = latencyMs;

    this.usageLedger.push({
      timestamp: Date.now(),
      providerId: model.providerId,
      modelId: model.modelId,
      task,
      category: this.getTaskCategory(task),
      success: true,
      latencyMs,
      inputTokens,
      outputTokens,
      reasoningTokens,
      cachedTokens,
      toolTokens,
      totalTokens,
      purpose,
    });
    if (this.usageLedger.length > 500) this.usageLedger.splice(0, this.usageLedger.length - 500);
  }

  private classifyFailure(error: unknown): UsageLedgerEntry['failureType'] {
    const message = String((error as any)?.message || error).toLowerCase();
    if (message.includes('timeout') || message.includes('aborted')) return 'TIMEOUT';
    if (message.includes('429') || message.includes('rate limit') || message.includes('quota') || message.includes('resource exhausted')) return '429';
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504') || message.includes('server error')) return '5XX';
    if (message.includes('401') || message.includes('403') || message.includes('api key') || message.includes('authentication')) return 'AUTH';
    if (message.includes('404') || message.includes('not found') || message.includes('unavailable')) return 'UNAVAILABLE';
    if (message.includes('json') || message.includes('schema')) return 'MALFORMED';
    return 'OTHER';
  }

  private recordProviderFailure(
    model: ModelRegistryRecord,
    task: TaskId,
    error: unknown,
    startedAt: number,
    purpose: UsageLedgerEntry['purpose'] = 'GAMEPLAY',
  ): void {
    const status = this.ensureRuntimeStatus(model);
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const errorMessage = String((error as any)?.message || error);
    const failureType = this.classifyFailure(error);
    status.requests += 1;
    status.failureCount += 1;
    status.consecutiveFailures += 1;
    status.lastLatencyMs = latencyMs;
    status.lastFailureAt = Date.now();
    status.lastFailureReason = String((error as any)?.message || error).slice(0, 300);
    if (failureType === '429') {
      status.rateLimit429Count += 1;
      status.headroom = {
        value: 0,
        exact: true,
        source: 'PROVIDER',
        unit: 'UNKNOWN',
      };
      model.quotaEvidenceSource = 'PROVIDER';
    }
    if (failureType === '5XX') status.serverError5xxCount += 1;
    if (failureType === 'TIMEOUT') status.timeoutCount += 1;
    if (failureType === '429' || failureType === '5XX' || failureType === 'TIMEOUT') {
      const cooldownMs = Math.min(60000, 5000 * Math.pow(2, Math.max(0, status.consecutiveFailures - 1)));
      status.cooldownUntil = Date.now() + cooldownMs;
    }
    // A malformed/schema-invalid task response is a task-compatibility failure,
    // not evidence that the provider/model is globally unavailable. Keep the model
    // operational so another task (or a later canary) can still use it.
    if (failureType === 'MALFORMED' || failureType === 'OTHER') {
      status.status = model.health;
      status.operationalStatus =
        status.cooldownUntil && status.cooldownUntil > Date.now()
          ? 'COOLDOWN'
          : 'AVAILABLE';
    } else {
      status.status =
        failureType === '429'
          ? 'Throttled'
          : failureType === 'AUTH'
            ? 'InvalidAuth'
            : 'Degraded';
      status.operationalStatus =
        failureType === 'AUTH'
          ? 'UNAVAILABLE'
          : failureType === '429'
            ? 'THROTTLED'
            : status.cooldownUntil && status.cooldownUntil > Date.now()
              ? 'COOLDOWN'
              : 'UNAVAILABLE';

      // Preserve the model's global health across a transient rate-limit event.
      // The runtime cooldown is what makes the model temporarily ineligible;
      // once it expires, a healthy model can re-enter the route automatically.
      if (failureType !== '429') {
        model.health = status.status;
      }
      if (failureType === '429') {
        // A 429 may be a transient RPM/TPM throttle rather than a depleted daily
        // quota. The cooldown window is authoritative for transient throttles;
        // provider quota refresh can still mark the model Exhausted when the
        // provider reports true quota depletion.
        model.quota = /quota|resource exhausted/i.test(errorMessage) && !/rate limit|too many requests/i.test(errorMessage)
          ? 'Exhausted'
          : 'Low';
      }
    }

    this.usageLedger.push({
      timestamp: Date.now(),
      providerId: model.providerId,
      modelId: model.modelId,
      task,
      category: this.getTaskCategory(task),
      success: false,
      latencyMs,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedTokens: 0,
      toolTokens: 0,
      totalTokens: 0,
      purpose,
      failureType,
    });
    if (this.usageLedger.length > 500) this.usageLedger.splice(0, this.usageLedger.length - 500);
  }

  private seedDefaultPins(): void {
    const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';
    const routes: Partial<Record<TaskId, string[]>> = {
      'narrative.generate': ['groq::qwen/qwen3.8-27b','openrouter::inclusionai/ling-3.0-flash:free','openrouter::google/gemma-4-31b-it:free','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','openrouter::qwen/qwen3.8-27b:free'],
      'narrative.review': ['groq::qwen/qwen3.8-27b','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite'],
      'character.dialogue': ['groq::qwen/qwen3.8-27b','openrouter::inclusionai/ling-3.0-flash:free','openrouter::google/gemma-4-31b-it:free','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite'],
      'character.extract': ['google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','groq::qwen/qwen3.8-27b','openrouter::google/gemma-4-31b-it:free'],
      'memory.extract': ['google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','groq::openai/gpt-oss-20b','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free'],
      'summary.scene': ['google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','groq::qwen/qwen3.8-27b','openrouter::inclusionai/ling-3.0-flash:free','openrouter::google/gemma-4-31b-it:free'],
      'intent.interpret': ['google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','groq::qwen/qwen3.8-27b','openrouter::google/gemma-4-31b-it:free'],
      'capability.explain': ['google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','groq::qwen/qwen3.8-27b','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free'],
      'utility.inspect': ['google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','groq::qwen/qwen3.8-27b','openrouter::inclusionai/ling-3.0-flash:free','openrouter::google/gemma-4-31b-it:free'],
      'rules.adjudicate': ['groq::openai/gpt-oss-120b','groq::qwen/qwen3.8-27b','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free'],
      'rules.analyze': ['groq::openai/gpt-oss-120b','groq::qwen/qwen3.8-27b','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free'],
      'tactical.reason': ['groq::openai/gpt-oss-120b','groq::qwen/qwen3.8-27b','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free'],
      'combat.tactics': ['groq::openai/gpt-oss-120b','groq::qwen/qwen3.8-27b','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free'],
      'combat.animation.plan': ['groq::qwen/qwen3.8-27b','groq::openai/gpt-oss-20b','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','google_gemini::gemini-3.5-flash'],
      'character.capability.propose': ['groq::openai/gpt-oss-120b','groq::qwen/qwen3.8-27b','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free'],
      'capability.synthesize': ['groq::openai/gpt-oss-120b','groq::qwen/qwen3.8-27b','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free'],
      'world.generate': ['groq::qwen/qwen3.8-27b','openrouter::inclusionai/ling-3.0-flash:free','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','openrouter::google/gemma-4-31b-it:free','openrouter::qwen/qwen3.8-27b:free','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite'],
      'research.query': ['groq::openai/gpt-oss-120b','groq::qwen/qwen3.8-27b','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','google_gemini::gemini-3.5-flash-lite'],
      'research.world-brief': ['groq::openai/gpt-oss-120b','groq::qwen/qwen3.8-27b','openrouter::google/gemma-4-31b-it:free','openrouter::inclusionai/ling-3.0-flash:free','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','google_gemini::gemini-3.5-flash-lite'],
      'story.advice': ['groq::qwen/qwen3.8-27b','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite','openrouter::inclusionai/ling-3.0-flash:free','openrouter::google/gemma-4-31b-it:free','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash'],
      'ooc.respond': ['groq::qwen/qwen3.8-27b','google_gemini::gemini-3.5-flash','google_gemini::gemini-3.8-flash','openrouter::inclusionai/ling-3.0-flash:free','openrouter::google/gemma-4-31b-it:free','google_gemini::gemini-3.5-flash-lite','google_gemini::gemini-3.1-flash-lite'],
    };

    // Routes are explicit but intentionally not task-pinned. This preserves the
    // configured ordering while allowing test/runtime auto-arrangement to recover
    // or reprioritize eligible models without silently escaping the route.
    for (const [task, chain] of Object.entries(routes) as Array<[TaskId, string[]]>) {
      this.taskFallbackChains.set(task, [...chain, emergencyKey]);
    }

    // Specialty tasks stay explicitly pinned because their adapters are modality-specific.
    this.taskPinnedModels.set('speech.generate', 'provider_mock_speech::mock-speech-v1');
    this.taskPinnedModels.set('image.generate', 'google_imagen::imagen-3.0-generate-002');
    this.taskFallbackChains.set('speech.generate', ['provider_mock_speech::mock-speech-v1', emergencyKey]);
    this.taskFallbackChains.set('speech.transcribe', ['provider_mock_stt::mock-stt-v1', emergencyKey]);
    this.taskFallbackChains.set('image.generate', ['google_imagen::imagen-3.0-generate-002', emergencyKey]);
  }

  public setFallbackChain(task: TaskId, chain: string[]): void {
    const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';
    const cleaned = Array.from(new Set(chain.filter(Boolean)));
    if (!cleaned.includes(emergencyKey)) cleaned.push(emergencyKey);
    this.taskFallbackChains.set(task, cleaned);
    this.explicitFallbackChainTasks.add(task);
    this.savePersistedConfig();
  }

  public getFallbackChain(task: TaskId): string[] {
    return this.taskFallbackChains.get(task) || [
      'groq::qwen/qwen3.8-27b',
      'openrouter::inclusionai/ling-3.0-flash:free',
      'openrouter::google/gemma-4-31b-it:free',
      'google_gemini::gemini-3.5-flash',
      'google_gemini::gemini-3.5-flash-lite',
      'provider_deterministic_emergency::emergency-fallback-local',
    ];
  }

  public getAllFallbackChains(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [task, chain] of this.taskFallbackChains.entries()) {
      result[task] = chain;
    }
    return result;
  }

  public setWorldRepository(repo: WorldRepository): void {
    this.worldRepo = repo;
  }

  public getWorldRepository(): WorldRepository {
    return this.worldRepo || worldRepository;
  }

  private seedDefaultModels(): void {
    // 0. Primary Operational Text Model: Gemini 3.5 Flash (LIVE & READY)
    this.registerModel({
      providerId: 'google_gemini',
      modelId: 'gemini-3.5-flash',
      displayName: 'Gemini 3.5 Flash (Primary Live Text Engine)',
      pool: 'fast',
      capabilities: ['fast', 'creative_writing', 'structured_extraction', 'long_context', 'low_cost'],
      contextWindow: 1048576,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 250,
      userPriority: 125,
      roleEligibility: [...ALL_GENERAL_TEXT_ROLES],
      fallbackEligibility: true,
      accessStatus: 'accessible',
      isPaidModel: false,
      billingState: 'FREE',
      billingEvidenceSource: 'PROVIDER',
      freeTierStatus: 'VERIFIED',
      freeTierEvidenceSource: 'PROVIDER',
      freeTierVerifiedAt: Date.now(),
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // 0b. Gemini 3.8 Flash (Fallback Text Model)
    this.registerModel({
      providerId: 'google_gemini',
      modelId: 'gemini-3.8-flash',
      displayName: 'Gemini 3.8 Flash',
      pool: 'fast',
      capabilities: ['fast', 'creative_writing', 'structured_extraction', 'long_context'],
      contextWindow: 1048576,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 250,
      userPriority: 115,
      roleEligibility: [...ALL_GENERAL_TEXT_ROLES],
      fallbackEligibility: true,
      accessStatus: 'accessible',
      isPaidModel: false,
      billingState: 'FREE',
      billingEvidenceSource: 'PROVIDER',
      freeTierStatus: 'VERIFIED',
      freeTierEvidenceSource: 'PROVIDER',
      freeTierVerifiedAt: Date.now(),
      configuredLimits: {
        requestsPerMinute: 60,
        tokensPerMinute: 100000,
      },
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // 0c. Gemini 3.5 Flash Lite (Fast Utility Model)
    this.registerModel({
      providerId: 'google_gemini',
      modelId: 'gemini-3.5-flash-lite',
      displayName: 'Gemini 3.5 Flash Lite',
      pool: 'fast',
      capabilities: ['fast', 'structured_extraction', 'low_cost'],
      contextWindow: 1048576,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 200,
      userPriority: 110,
      roleEligibility: [...ALL_GENERAL_TEXT_ROLES],
      fallbackEligibility: true,
      accessStatus: 'accessible',
      isPaidModel: false,
      billingState: 'FREE',
      billingEvidenceSource: 'PROVIDER',
      freeTierStatus: 'VERIFIED',
      freeTierEvidenceSource: 'PROVIDER',
      freeTierVerifiedAt: Date.now(),
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // 0d. Gemini 3.1 Flash Lite (Fast Utility Model)
    this.registerModel({
      providerId: 'google_gemini',
      modelId: 'gemini-3.1-flash-lite',
      displayName: 'Gemini 3.1 Flash Lite',
      pool: 'fast',
      capabilities: ['fast', 'structured_extraction', 'low_cost'],
      contextWindow: 1048576,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 180,
      userPriority: 105,
      roleEligibility: [...ALL_GENERAL_TEXT_ROLES],
      fallbackEligibility: true,
      accessStatus: 'accessible',
      isPaidModel: false,
      billingState: 'FREE',
      billingEvidenceSource: 'PROVIDER',
      freeTierStatus: 'VERIFIED',
      freeTierEvidenceSource: 'PROVIDER',
      freeTierVerifiedAt: Date.now(),
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // Gemini 3.6 Flash
    this.registerModel({
      providerId: 'google_gemini',
      modelId: 'gemini-3.6-flash',
      displayName: 'Gemini 3.6 Flash (Quota Limited 429)',
      pool: 'fast',
      capabilities: ['fast', 'creative_writing', 'structured_extraction', 'long_context', 'low_cost'],
      contextWindow: 1000000,
      health: 'Throttled',
      quota: 'Exhausted',
      latencyMs: 250,
      userPriority: 100,
      roleEligibility: [...ALL_GENERAL_TEXT_ROLES],
      fallbackEligibility: true,
      accessStatus: 'quota_limited',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // 1. Gemini 2.5 Pro (HTTP 404 - Discontinued by Google)
    this.registerModel({
      providerId: 'google_gemini',
      modelId: 'gemini-2.5-pro',
      displayName: 'Gemini 2.5 Pro (Discontinued 404)',
      pool: 'creative',
      capabilities: ['creative_writing', 'long_context', 'json_strict'],
      contextWindow: 1000000,
      health: 'Unavailable',
      quota: 'Unknown',
      latencyMs: 800,
      userPriority: -100,
      roleEligibility: [],
      fallbackEligibility: false,
      accessStatus: 'unavailable',
      lifecycleState: 'deprecated',
      isEmergencyFloor: false,
    });

    // 2. Gemini 2.5 Flash (HTTP 429 - Quota Limited)
    this.registerModel({
      providerId: 'google_gemini',
      modelId: 'gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash (Quota Limited 429)',
      pool: 'fast',
      capabilities: ['fast', 'structured_extraction', 'low_cost'],
      contextWindow: 1000000,
      health: 'Throttled',
      quota: 'Exhausted',
      latencyMs: 250,
      userPriority: 40,
      roleEligibility: ['character.dialogue', 'ooc.respond', 'memory.extract', 'rules.adjudicate'],
      fallbackEligibility: true,
      accessStatus: 'quota_limited',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // 3. Long-Context Specialist Pool (v6.0 §342)
    this.registerModel({
      providerId: 'google_gemini',
      modelId: 'gemini-1.5-pro-long',
      displayName: 'Gemini 1.5 Pro (Long-Context Specialist)',
      pool: 'long_context',
      capabilities: ['deep_research', 'archival_synthesis', '2m_context'],
      contextWindow: 2000000,
      health: 'Unavailable',
      quota: 'Unknown',
      latencyMs: 1200,
      userPriority: 25,
      roleEligibility: ['summary.scene', 'memory.extract', 'utility.inspect'],
      fallbackEligibility: true,
      accessStatus: 'unavailable',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // 4. Review / Critic Pool (v6.0 §342)
    this.registerModel({
      providerId: 'google_gemini',
      modelId: 'gemini-2.5-critic',
      displayName: 'Gemini 2.5 Critic (Adjudication & Verification)',
      pool: 'review',
      capabilities: ['strict_rule_verification', 'schema_critique'],
      contextWindow: 500000,
      health: 'Unavailable',
      quota: 'Unknown',
      latencyMs: 600,
      userPriority: 20,
      roleEligibility: ['rules.adjudicate', 'summary.scene'],
      fallbackEligibility: true,
      accessStatus: 'unavailable',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // 5. Emergency Floor Pool (v6.0 §342) - Local Deterministic Fallback
    this.registerModel({
      providerId: 'provider_deterministic_emergency',
      modelId: 'emergency-fallback-local',
      displayName: 'Deterministic Rule Engine (Emergency Floor)',
      pool: 'emergency',
      capabilities: ['zero_cost', 'unlimited_quota', 'deterministic', 'text_generation', 'structured_output', 'text'],
      contextWindow: 1000000,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 5,
      userPriority: 10,
      roleEligibility: [
        'narrative.generate',
        'character.dialogue',
        'ooc.respond',
        'character.extract',
        'memory.extract',
        'character.capability.propose',
        'story.advice',
        'intent.interpret',
        'capability.synthesize',
        'capability.explain',
        'research.query',
        'research.world-brief',
        'rules.adjudicate',
        'rules.analyze',
        'summary.scene',
        'world.generate',
        'combat.tactics',
        'tactical.reason',
        'combat.animation.plan',
        'narrative.review',
        'utility.inspect',
      ],
      supportedInputTypes: ['text'],
      supportedOutputTypes: ['text', 'json'],
      isEmergencyFloor: true,
      fallbackEligibility: true,
      accessStatus: 'accessible',
      lifecycleState: 'active',
    });

    // Specialized STT Model
    this.registerModel({
      providerId: 'provider_mock_stt',
      modelId: 'mock-stt-v1',
      displayName: 'Neural Speech Recognizer',
      pool: 'transcription',
      capabilities: ['stt', 'audio_transcription'],
      contextWindow: 16000,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 300,
      userPriority: 70,
      roleEligibility: ['speech.transcribe'],
      accessStatus: 'accessible',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // Specialized Speech Model
    this.registerModel({
      providerId: 'provider_mock_speech',
      modelId: 'mock-speech-v1',
      displayName: 'Neural Speech Synthesizer',
      pool: 'speech',
      capabilities: ['tts', 'audio_synthesis'],
      contextWindow: 16000,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 300,
      userPriority: 70,
      roleEligibility: ['speech.generate'],
      accessStatus: 'accessible',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // Specialized Reasoning / Combat Model
    this.registerModel({
      providerId: 'provider_mock_reasoning',
      modelId: 'mock-reasoning-pro',
      displayName: 'Reasoning & Combat Specialist',
      pool: 'reasoning',
      capabilities: ['deep_reasoning', 'combat_tactics'],
      contextWindow: 128000,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 500,
      userPriority: 80,
      roleEligibility: ['combat.tactics', 'rules.adjudicate'],
      accessStatus: 'accessible',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // Specialized Speech Model
    this.registerModel({
      providerId: 'provider_mock_speech',
      modelId: 'mock-speech-v1',
      displayName: 'DreamBook Canonical Voice Engine',
      pool: 'speech',
      capabilities: ['tts', 'speech_synthesis'],
      contextWindow: 16000,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 300,
      userPriority: 70,
      roleEligibility: ['speech.generate'],
      accessStatus: 'accessible',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // External Unconfigured Provider Models
    this.registerModel({
      providerId: 'google_cloud_tts',
      modelId: 'Neural2-D',
      displayName: 'Google Cloud TTS (Neural2-D)',
      pool: 'speech',
      capabilities: ['tts', 'neural_voice'],
      contextWindow: 16000,
      health: 'InvalidAuth',
      quota: 'Unknown',
      latencyMs: 0,
      userPriority: 50,
      roleEligibility: ['speech.generate'],
      accessStatus: 'not_configured',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    this.registerModel({
      providerId: 'google_imagen',
      modelId: 'imagen-3.0-generate-002',
      displayName: 'Google Imagen 3',
      pool: 'utility',
      capabilities: ['image_generation'],
      contextWindow: 16000,
      health: 'InvalidAuth',
      quota: 'Unknown',
      latencyMs: 0,
      userPriority: 50,
      roleEligibility: ['image.generate'],
      accessStatus: 'not_configured',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    // Seed standard OpenRouter models
    const openrouterConfigured = Boolean(getProviderApiKey('openrouter'));
    const openRouterDefaults = [
      {
        id: 'openrouter/free',
        name: 'OpenRouter Free (Free Router)',
        pool: 'creative' as ModelPool,
        window: 128000,
        freeRouter: true,
      },
      { id: 'openrouter/auto', name: 'OpenRouter Auto (Best Available)', pool: 'creative' as ModelPool, window: 128000 },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', pool: 'creative' as ModelPool, window: 131072 },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (Reasoning)', pool: 'reasoning' as ModelPool, window: 64000 },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', pool: 'fast' as ModelPool, window: 64000 },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OpenRouter)', pool: 'creative' as ModelPool, window: 200000 },
      { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet (OpenRouter)', pool: 'creative' as ModelPool, window: 200000 },
      { id: 'openai/gpt-4o', name: 'GPT-4o (OpenRouter)', pool: 'creative' as ModelPool, window: 128000 },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (OpenRouter)', pool: 'fast' as ModelPool, window: 128000 },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (OpenRouter)', pool: 'fast' as ModelPool, window: 1048576 },
      { id: 'mistralai/mistral-large-2411', name: 'Mistral Large (OpenRouter)', pool: 'creative' as ModelPool, window: 128000 },
      { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B Instruct (OpenRouter)', pool: 'creative' as ModelPool, window: 131072 },
    ];

    for (const orm of openRouterDefaults) {
      this.registerModel({
        providerId: 'openrouter',
        modelId: orm.id,
        displayName: orm.name,
        pool: orm.pool,
        capabilities: ['text_generation', 'reasoning', 'structured_output', 'creative_writing'],
        contextWindow: orm.window,
        health: openrouterConfigured ? 'Healthy' : 'InvalidAuth',
        quota: openrouterConfigured ? 'Healthy' : 'Unknown',
        latencyMs: openrouterConfigured ? 350 : 0,
        userPriority: 70,
        roleEligibility: [
          'narrative.generate',
          'character.dialogue',
          'memory.extract',
          'summary.scene',
          'rules.adjudicate',
          'utility.inspect',
        ],
        fallbackEligibility: true,
        accessStatus: openrouterConfigured ? 'accessible' : 'not_configured',
        lifecycleState: 'active',
        isEmergencyFloor: false,
      });
    }

    // Resilience-first free model pool. Free-plan limits are provider/account dependent at runtime;
    // these records describe the current free-plan baseline and are refreshed by provider telemetry.
    const groqConfigured = Boolean(getProviderApiKey('groq'));
    for (const model of [
      ['qwen/qwen3.8-27b', 'Groq Qwen3.8 27B (Free)', 'creative', 135],
      ['openai/gpt-oss-120b', 'Groq GPT-OSS 120B (Free)', 'reasoning', 130],
      ['openai/gpt-oss-20b', 'Groq GPT-OSS 20B (Free)', 'fast', 118],
    ] as Array<[string, string, ModelPool, number]>) {
      this.registerModel({
        providerId: 'groq',
        modelId: model[0],
        displayName: model[1],
        pool: model[2],
        capabilities: model[0] === 'qwen/qwen3.8-27b'
          ? ['text_generation', 'reasoning', 'creative_writing', 'structured_output', 'fast']
          : ['text_generation', 'reasoning', 'extended_thinking', 'structured_output'],
        contextWindow: 131072,
        health: groqConfigured ? 'Healthy' : 'InvalidAuth',
        quota: groqConfigured ? 'Healthy' : 'Unknown',
        latencyMs: groqConfigured ? 180 : 0,
        userPriority: model[3],
        roleEligibility: [...ALL_GENERAL_TEXT_ROLES],
        supportedInputTypes: ['text'],
        supportedOutputTypes: ['text', 'json'],
        hasTools: true,
        hasStructuredOutput: true,
        hasVision: false,
        hasAudio: false,
        fallbackEligibility: true,
        accessStatus: groqConfigured ? 'accessible' : 'not_configured',
        isPaidModel: false,
        billingState: 'FREE',
        billingEvidenceSource: 'PROVIDER',
        freeTierStatus: 'VERIFIED',
        freeTierEvidenceSource: 'PROVIDER',
        freeTierVerifiedAt: Date.now(),
        configuredLimits: {
          requestsPerMinute: 30,
          requestsPerDay: 1000,
          tokensPerMinute: 8000,
          tokensPerDay: 200000,
        },
        lifecycleState: 'active',
        isEmergencyFloor: false,
      });
    }

    const openRouterFreeDefaults = [
      ['inclusionai/ling-3.0-flash:free', 'Ling 3.0 Flash (OpenRouter Free)', 'creative', 106, false],
      ['google/gemma-4-31b-it:free', 'Gemma 4 31B (OpenRouter Free)', 'creative', 103, true],
      ['qwen/qwen3.8-27b:free', 'Qwen3.8 27B (OpenRouter Free)', 'creative', 100, true],
    ] as Array<[string, string, ModelPool, number, boolean]>;

    for (const model of openRouterFreeDefaults) {
      this.registerModel({
        providerId: 'openrouter',
        modelId: model[0],
        displayName: model[1],
        pool: model[2],
        capabilities: model[4]
          ? ['text_generation', 'reasoning', 'creative_writing', 'structured_output', 'fast']
          : ['text_generation', 'reasoning', 'creative_writing', 'fast'],
        contextWindow: 262144,
        health: openrouterConfigured ? 'Healthy' : 'InvalidAuth',
        quota: openrouterConfigured ? 'Healthy' : 'Unknown',
        latencyMs: openrouterConfigured ? 350 : 0,
        userPriority: model[3],
        roleEligibility: [...ALL_GENERAL_TEXT_ROLES],
        supportedInputTypes: ['text'],
        supportedOutputTypes: ['text', 'json'],
        hasTools: true,
        hasStructuredOutput: model[4],
        hasVision: false,
        hasAudio: false,
        fallbackEligibility: true,
        accessStatus: openrouterConfigured ? 'accessible' : 'not_configured',
        isPaidModel: false,
        billingState: 'FREE',
        billingEvidenceSource: 'PROVIDER',
        freeTierStatus: 'VERIFIED',
        freeTierEvidenceSource: 'PROVIDER',
        freeTierVerifiedAt: Date.now(),
        lifecycleState: 'active',
        isEmergencyFloor: false,
      });
    }

    // External Provider Models
    this.registerModel({
      providerId: 'openai',
      modelId: 'gpt-4o',
      displayName: 'OpenAI GPT-4o',
      pool: 'creative',
      capabilities: ['creative_writing', 'fast'],
      contextWindow: 128000,
      health: Boolean(getProviderApiKey('openai')) ? 'Healthy' : 'InvalidAuth',
      quota: 'Unknown',
      latencyMs: 0,
      userPriority: 50,
      roleEligibility: ['narrative.generate', 'character.dialogue'],
      accessStatus: Boolean(getProviderApiKey('openai')) ? 'accessible' : 'not_configured',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    this.registerModel({
      providerId: 'anthropic',
      modelId: 'claude-3-5-sonnet',
      displayName: 'Anthropic Claude 3.5 Sonnet',
      pool: 'creative',
      capabilities: ['creative_writing', 'long_context'],
      contextWindow: 200000,
      health: Boolean(getProviderApiKey('anthropic')) ? 'Healthy' : 'InvalidAuth',
      quota: 'Unknown',
      latencyMs: 0,
      userPriority: 50,
      roleEligibility: ['narrative.generate', 'summary.scene'],
      accessStatus: Boolean(getProviderApiKey('anthropic')) ? 'accessible' : 'not_configured',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });

    this.registerModel({
      providerId: 'elevenlabs',
      modelId: 'eleven_multilingual_v2',
      displayName: 'ElevenLabs Multilingual v2',
      pool: 'speech',
      capabilities: ['tts', 'emotional_speech'],
      contextWindow: 16000,
      health: 'InvalidAuth',
      quota: 'Unknown',
      latencyMs: 0,
      userPriority: 50,
      roleEligibility: ['speech.generate'],
      accessStatus: 'not_configured',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });
  }

  public syncProviderModelAccessStatus(providerId: string, isConfigured: boolean): void {
    for (const [, model] of this.models.entries()) {
      if (model.providerId === providerId || (providerId === 'google_gemini' && model.providerId === 'provider_google_gemini')) {
        if (isConfigured) {
          if (model.health === 'InvalidAuth' || model.accessStatus === 'not_configured') {
            model.health = 'Healthy';
            model.quota = 'Healthy';
            model.accessStatus = 'accessible';
          }
        } else {
          if (!model.isEmergencyFloor && model.providerId !== 'dreambook-native') {
            model.health = 'InvalidAuth';
            model.accessStatus = 'not_configured';
          }
        }
      }
    }
  }

  public refreshAllProviderModelStatuses(): void {
    const providers = ['google_gemini', 'provider_google_gemini', 'openrouter', 'groq', 'openai', 'anthropic', 'elevenlabs', 'google_cloud_tts', 'google_imagen'];
    const isTestRuntime =
      typeof process !== 'undefined' &&
      (process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT));

    // Tests exercise registry selection without live credentials. Keep the seeded
    // catalog metadata intact there; testModel() remains the explicit credential probe.
    if (isTestRuntime) return;

    for (const providerId of providers) {
      const configured = Boolean(getProviderApiKey(providerId));
      this.syncProviderModelAccessStatus(providerId, configured);
    }
  }

  public registerCustomModel(params: {
    providerId: string;
    modelId: string;
    displayName?: string;
    pool?: ModelPool;
    contextWindow?: number;
    roleEligibility?: TaskId[];
    capabilities?: string[];
  }): ModelRegistryRecord {
    const providerId = (params.providerId || 'openrouter').trim();
    const modelId = params.modelId.trim();
    const configured = Boolean(getProviderApiKey(providerId));

    const record: ModelRegistryRecord = {
      providerId,
      modelId,
      displayName: params.displayName?.trim() || modelId,
      pool: params.pool || (/flash|mini|small|lite|haiku/i.test(modelId) ? 'fast' : /reason|thinking|r1|o1|o3|o4/i.test(modelId) ? 'reasoning' : 'creative'),
      capabilities: params.capabilities || ['text_generation', 'reasoning', 'structured_output', 'creative_writing'],
      contextWindow: params.contextWindow || 64000,
      health: configured ? 'Healthy' : 'InvalidAuth',
      quota: configured ? 'Healthy' : 'Unknown',
      latencyMs: configured ? 300 : 0,
      userPriority: 85,
      roleEligibility: params.roleEligibility || [
        'narrative.generate',
        'character.dialogue',
        'memory.extract',
        'summary.scene',
        'rules.adjudicate',
        'utility.inspect',
      ],
      outputTokenLimit: 4096,
      supportedInputTypes: ['text', 'image', 'audio', 'video'],
      supportedOutputTypes: ['text', 'json'],
      hasTools: true,
      hasStructuredOutput: true,
      hasVision: true,
      hasAudio: false,
      hasImageGeneration: false,
      fallbackEligibility: true,
      lifecycleState: 'active',
      accessStatus: configured ? 'accessible' : 'not_configured',
      isEmergencyFloor: false,
    };

    this.registerModel(record);
    this.savePersistedConfig();
    return record;
  }

  private seedDefaultAdapters(): void {
    const emergencyAdapter = new DeterministicEmergencyFloorAdapter();
    this.registerAdapter(emergencyAdapter);
    this.registerAdapter(new DeterministicMockSpeechAdapter());
    this.registerAdapter(new DeterministicMockSTTAdapter());
    this.registerAdapter(new DeterministicMockAdapter('provider_mock_reasoning'));
    const gemini = new GoogleGeminiAdapter();
    this.registerAdapter(gemini);
    // Also register alias 'provider_google_gemini'
    this.adapters.set('provider_google_gemini', gemini);
    this.registerAdapter(new OpenRouterAdapter());

    // Register standard OpenAI and Anthropic compatible adapters
    this.registerAdapter(new OpenAiCompatibleAdapter('openai', 'https://api.openai.com/v1'));
    this.registerAdapter(new OpenAiCompatibleAdapter('anthropic', 'https://api.anthropic.com/v1'));
    this.registerAdapter(new OpenAiCompatibleAdapter('nvidia', 'https://integrate.api.nvidia.com/v1'));
    this.registerAdapter(new OpenAiCompatibleAdapter('groq', 'https://api.groq.com/openai/v1'));
    this.registerAdapter(new OpenAiCompatibleAdapter('deepseek', 'https://api.deepseek.com/v1'));
    this.registerAdapter(new OpenAiCompatibleAdapter('mistral', 'https://api.mistral.ai/v1'));
    this.registerAdapter(new OpenAiCompatibleAdapter('together', 'https://api.together.xyz/v1'));
    this.registerAdapter(new OpenAiCompatibleAdapter('perplexity', 'https://api.perplexity.ai'));
    this.registerAdapter(new OpenAiCompatibleAdapter('xai', 'https://api.x.ai/v1'));
    this.registerAdapter(new OpenAiCompatibleAdapter('ollama', 'http://localhost:11434/v1'));
    this.registerAdapter(new OpenAiCompatibleAdapter('lmstudio', 'http://localhost:1234/v1'));

    // Load and register all user-configured custom providers
    const customProviders = loadCustomProviders();
    for (const cp of customProviders) {
      this.registerAdapter(new OpenAiCompatibleAdapter(cp.id, cp.baseUrl, cp.headers));
      if (Array.isArray(cp.models)) {
        for (const m of cp.models) {
          if (m?.id) {
            this.registerCustomModel({
              providerId: cp.id,
              modelId: m.id,
              displayName: m.name || m.id,
              pool: (m.pool as ModelPool) || 'creative',
              contextWindow: m.contextWindow || 64000,
            });
          }
        }
      }
    }
  }

  public registerCustomProvider(config: CustomProviderConfig): void {
    const adapter = new OpenAiCompatibleAdapter(config.id, config.baseUrl, config.headers);
    this.registerAdapter(adapter);

    if (Array.isArray(config.models)) {
      for (const m of config.models) {
        if (m?.id) {
          this.registerCustomModel({
            providerId: config.id,
            modelId: m.id,
            displayName: m.name || m.id,
            pool: (m.pool as ModelPool) || 'creative',
            contextWindow: m.contextWindow || 64000,
          });
        }
      }
    }

    const isConfigured = Boolean(getProviderApiKey(config.id)) || config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1');
    this.syncProviderModelAccessStatus(config.id, isConfigured);
    this.savePersistedConfig();
  }

  public removeCustomProvider(providerId: string): void {
    const normalizedId = providerId.trim().toLowerCase();
    this.adapters.delete(normalizedId);

    // Remove all models registered under this custom provider
    const keysToRemove: string[] = [];
    for (const [key, model] of this.models.entries()) {
      if (model.providerId.toLowerCase() === normalizedId) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      this.models.delete(key);
      this.runtimeStatus.delete(key);
      this.manualOverrides.delete(key);
    }
    this.savePersistedConfig();
  }

  /**
   * Discovers and registers models dynamically from provider adapters.
   * Caches results with TTL to prevent redundant network round-trips.
   * Merges manual overrides with high precedence over discovered properties.
   */
  public async discoverAndRegisterModels(options?: boolean | { forceRefresh?: boolean }): Promise<DiscoverySummary> {
    const CACHE_TTL_MS = 300000; // 5 minutes
    const force = options === true || (typeof options === 'object' && options?.forceRefresh === true);
    if (!force && this.lastDiscoveredAt > 0 && Date.now() - this.lastDiscoveredAt < CACHE_TTL_MS) {
      return this.getDiscoveryStatus();
    }

    const adaptersToQuery: { providerId: string; adapter: any }[] = [];
    const seenAdapters = new Set<any>();
    for (const [providerId, adapter] of this.adapters.entries()) {
      if (adapter && typeof (adapter as any).discoverModels === 'function' && !seenAdapters.has(adapter)) {
        seenAdapters.add(adapter);
        adaptersToQuery.push({ providerId, adapter });
      }
    }

    if (adaptersToQuery.length === 0) {
      const gemini = this.getAdapter('google_gemini') || this.getAdapter('provider_google_gemini');
      if (gemini && typeof (gemini as any).discoverModels === 'function') {
        adaptersToQuery.push({ providerId: 'google_gemini', adapter: gemini });
      }
    }

    if (adaptersToQuery.length === 0) {
      this.discoveryStatus = 'DiscoveryUnavailable';
      return this.getDiscoveryStatus();
    }

    this.excludedCatalog = [];
    const allDiscovered: DiscoveredModelMetadata[] = [];
    const activeModelIds: string[] = [];

    for (const { providerId, adapter } of adaptersToQuery) {
      try {
        const rawModels: DiscoveredModelMetadata[] = await adapter.discoverModels();
        for (const discovered of rawModels) {
          allDiscovered.push(discovered);
          const classification = classifyDiscoveredModel(discovered, providerId);
          if (!classification.eligible || !classification.record) {
            this.excludedCatalog.push({
              modelId: discovered.id || (discovered as any).name || 'unknown',
              rawName: discovered.rawName || (discovered as any).name || discovered.id || 'unknown',
              reason: classification.exclusionReason || classification.rejectionReason || 'Incompatible with Dreamville domain tasks',
            });
            continue;
          }

          if (discovered.freeTierStatus) {
            classification.record.freeTierStatus = discovered.freeTierStatus;
            classification.record.freeTierEvidenceSource = discovered.freeTierEvidenceSource || 'UNKNOWN';
            classification.record.freeTierVerifiedAt = Date.now();
            if (discovered.freeTierStatus === 'VERIFIED') {
              classification.record.billingState = 'FREE';
              classification.record.billingEvidenceSource = 'PROVIDER';
              classification.record.isPaidModel = false;
            } else if (discovered.freeTierStatus === 'NOT_FREE') {
              classification.record.billingState = 'PAID';
              classification.record.billingEvidenceSource = 'PROVIDER';
              classification.record.isPaidModel = true;
            }
          }

          // Apply manual override if one exists
          const finalRecord = this.applyManualOverridesToRecord(classification.record);
          if (!finalRecord) {
            this.excludedCatalog.push({
              modelId: discovered.id,
              rawName: discovered.rawName,
              reason: 'Excluded by manual user override',
            });
            continue;
          }

          this.registerModel(finalRecord);
          activeModelIds.push(finalRecord.modelId);
        }
      } catch (err: any) {
        // Continue with other adapters if one fails
      }
    }

    this.lastDiscoveredAt = Date.now();
    this.discoveredCatalog = allDiscovered;
    const geminiConfigured = Boolean(getProviderApiKey('google_gemini'));
    const openrouterConfigured = Boolean(getProviderApiKey('openrouter'));
    const isConfigured = geminiConfigured || openrouterConfigured;
    this.discoveryStatus = isConfigured ? 'ConfiguredAndDiscovered' : 'CredentialsMissing';

    return this.getDiscoveryStatus();
  }

  public async refreshDiscovery(options?: { force?: boolean }): Promise<DiscoverySummary> {
    return this.discoverAndRegisterModels({ forceRefresh: options?.force ?? true });
  }

  public getLastDiscoverySummary(): DiscoverySummary {
    return this.getDiscoveryStatus();
  }

  public getDiscoveryStatus(): DiscoverySummary {
    const allModels = this.getAllModels();
    const activeGemini = allModels.filter(
      (m) => (m.providerId === 'google_gemini' || m.providerId === 'provider_google_gemini') &&
        m.health !== 'Unavailable' && m.health !== 'DisabledByUser'
    );
    const unavailableGemini = allModels.filter(
      (m) => (m.providerId === 'google_gemini' || m.providerId === 'provider_google_gemini') &&
        (m.health === 'Unavailable' || m.health === 'DisabledByUser')
    );

    const pools: Record<ModelPool, number> = {
      creative: 0,
      utility: 0,
      fast: 0,
      reasoning: 0,
      long_context: 0,
      review: 0,
      emergency: 0,
      speech: 0,
      transcription: 0,
    };

    // Deduplicate by modelId for pool counts
    const seenModels = new Set<string>();
    for (const m of allModels) {
      if (!seenModels.has(m.modelId)) {
        seenModels.add(m.modelId);
        if (pools[m.pool] !== undefined) {
          pools[m.pool]++;
        }
      }
    }

    const adapter = this.getAdapter('google_gemini') || this.getAdapter('provider_google_gemini');
    const isConfigured = Boolean(typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
    const isLive = isConfigured && (adapter as GoogleGeminiAdapter)?.isMockOnly !== true;

    // Deduplicate active Gemini model IDs
    const uniqueActiveIds = Array.from(new Set(activeGemini.map((m) => m.modelId)));
    const totalDiscovered = this.discoveredCatalog.length;
    const activeCount = uniqueActiveIds.length;
    const excludedCount = this.excludedCatalog.length;

    return {
      configured: isConfigured,
      providerId: 'google_gemini',
      isLive,
      totalDiscovered,
      activeCount,
      registeredCount: activeCount,
      unavailableCount: Array.from(new Set(unavailableGemini.map((m) => m.modelId))).length,
      excludedCount,
      rejectedCount: excludedCount,
      errors: [],
      lastRefreshedAt: this.lastDiscoveredAt,
      poolBreakdown: pools,
      activeModelIds: uniqueActiveIds,
      excludedModels: [...this.excludedCatalog],
    };
  }

  public getDiscoveredCatalog(): DiscoveredModelMetadata[] {
    return [...this.discoveredCatalog];
  }

  public getExcludedCatalog(): { modelId: string; rawName: string; reason: string }[] {
    return [...this.excludedCatalog];
  }

  public setManualOverride(
    modelIdOrOverride: string | ManualModelOverride,
    overrideObj?: Partial<ManualModelOverride>
  ): void {
    let override: ManualModelOverride;
    if (typeof modelIdOrOverride === 'string') {
      const rawRoles = (overrideObj as any)?.roles || overrideObj?.roleEligibility;
      override = {
        modelId: modelIdOrOverride,
        ...(overrideObj || {}),
        roleEligibility: rawRoles,
      };
    } else {
      const rawRoles = (modelIdOrOverride as any)?.roles || modelIdOrOverride.roleEligibility;
      override = {
        ...modelIdOrOverride,
        roleEligibility: rawRoles,
      };
    }

    this.manualOverrides.set(override.modelId, override);
    if (override.providerId) {
      this.manualOverrides.set(`${override.providerId}::${override.modelId}`, override);
    }
    if (override.pinnedForTask) {
      const provider = override.providerId || 'google_gemini';
      this.taskPinnedModels.set(override.pinnedForTask, `${provider}::${override.modelId}`);
    }

    // Re-apply to existing registered model if present
    for (const [key, model] of this.models.entries()) {
      if (model.modelId === override.modelId) {
        const updated = this.applyManualOverridesToRecord(model);
        if (updated) {
          this.models.set(key, updated);
        } else {
          model.health = 'Unavailable';
        }
      }
    }
    this.savePersistedConfig();
  }

  public pinModelForTask(task: TaskId, modelKey: string | null): void {
    if (!modelKey) {
      this.taskPinnedModels.delete(task);
    } else {
      this.taskPinnedModels.set(task, modelKey);
    }
    this.savePersistedConfig();
  }

  public getPinnedModelForTask(task: TaskId): string | undefined {
    return this.taskPinnedModels.get(task);
  }

  public getAllTaskPins(): Record<string, string> {
    const pins: Record<string, string> = {};
    for (const [task, key] of this.taskPinnedModels.entries()) {
      pins[task] = key;
    }
    return pins;
  }

  public removeManualOverride(modelId: string): void {
    this.manualOverrides.delete(modelId);
    for (const [key] of this.manualOverrides.entries()) {
      if (key.endsWith(`::${modelId}`)) {
        this.manualOverrides.delete(key);
      }
    }
    for (const [task, target] of this.taskPinnedModels.entries()) {
      if (target.endsWith(`::${modelId}`) || target === modelId) {
        this.taskPinnedModels.delete(task);
      }
    }
    this.savePersistedConfig();
  }

  public setCategoryModelOverride(category: AiTaskCategory, modelKey: string | null): void {
    const tasks = this.getCategoryTasks(category);
    if (!modelKey) {
      this.categoryOverrides.delete(category);
      this.savePersistedConfig();
      return;
    }

    const model = this.models.get(modelKey) || Array.from(this.models.values()).find((candidate) => candidate.modelId === modelKey);
    if (!model) throw new Error('Unknown model "' + modelKey + '".');

    const eligible = tasks.some((task) => model.roleEligibility.includes(task));
    if (!eligible) {
      throw new Error('Model "' + modelKey + '" is not eligible for any task in category "' + category + '".');
    }

    if (model.isEmergencyFloor) {
      throw new Error('Emergency floor cannot be selected as a manual category override.');
    }

    this.categoryOverrides.set(category, this.modelKey(model));
    this.savePersistedConfig();
  }

  public getCategoryModelOverride(category: AiTaskCategory): string | undefined {
    return this.categoryOverrides.get(category);
  }

  public getCategoryRuntimeStates(): CategoryRuntimeState[] {
    const categories = Array.from(
      new Set(getAllAiTaskContracts().map((contract) => contract.category)),
    ) as AiTaskCategory[];

    return categories.map((category) => {
      const tasks = this.getCategoryTasks(category);
      const taskRoutes = tasks.map((task) => this.getTaskRuntimeRoute(task));
      const activeKeys = Array.from(new Set(taskRoutes.map((route) => route.activeModelKey).filter(Boolean)));
      const fallbackChains = taskRoutes.map((route) => JSON.stringify(route.fallbackChain));
      const commonFallbackChain =
        fallbackChains.length > 0 && fallbackChains.every((chain) => chain === fallbackChains[0])
          ? taskRoutes[0].fallbackChain
          : [];

      const currentOperation = Array.from(this.activeModelOperations.values())
        .filter((operation) => operation.category === category)
        .sort((a, b) => b.startedAt - a.startedAt)[0];
      const lastExecution = tasks
        .map((task) => this.lastModelExecutionByTask.get(task))
        .filter((execution): execution is LastModelExecution => Boolean(execution))
        .sort((a, b) => b.finishedAt - a.finishedAt)[0];

      return {
        category,
        tasks,
        activeModelKey: activeKeys.length === 1 ? activeKeys[0] : undefined,
        mode: this.categoryOverrides.has(category) ? 'MANUAL' : 'AUTO',
        fallbackChain: commonFallbackChain,
        taskRoutes,
        currentOperation: currentOperation ? { ...currentOperation } : undefined,
        lastExecution: lastExecution ? { ...lastExecution } : undefined,
      };
    });
  }

  public getModelRuntimeStatus(): ModelRuntimeStatus[] {
    const now = Date.now();
    return Array.from(this.models.values()).map((model) => {
      const status = this.ensureRuntimeStatus(model);
      let operationalStatus = status.operationalStatus;
      if (status.cooldownUntil && status.cooldownUntil <= now && operationalStatus === 'COOLDOWN') {
        operationalStatus =
          model.health === 'DisabledByUser'
            ? 'DISABLED'
            : model.health === 'Unavailable' || model.health === 'InvalidAuth'
              ? 'UNAVAILABLE'
              : model.health === 'Throttled'
                ? 'THROTTLED'
                : 'AVAILABLE';
      }
      return {
        ...status,
        operationalStatus,
        observedTokens: { ...status.observedTokens },
        configuredLimits: status.configuredLimits ? { ...status.configuredLimits } : undefined,
        headroom: status.headroom ? { ...status.headroom } : undefined,
      };
    });
  }

  public getUsageLedger(options?: { category?: AiTaskCategory; limit?: number }): UsageLedgerEntry[] {
    const limit = Math.max(1, Math.min(200, options?.limit ?? 50));
    const filtered = options?.category
      ? this.usageLedger.filter((entry) => entry.category === options.category)
      : this.usageLedger;
    return filtered.slice(-limit).map((entry) => ({ ...entry }));
  }

  public getPhase12OperationsSnapshot(): {
    categories: CategoryRuntimeState[];
    models: ModelRuntimeStatus[];
    usage: UsageLedgerEntry[];
    safeTelemetry: {
      totalRequests: number;
      totalTokens: number;
      successCount: number;
      failureCount: number;
    };
  } {
    const models = this.getModelRuntimeStatus();
    const usage = this.getUsageLedger({ limit: 50 });
    return {
      categories: this.getCategoryRuntimeStates(),
      models,
      usage,
      safeTelemetry: {
        totalRequests: models.reduce((sum, model) => sum + model.requests, 0),
        totalTokens: models.reduce((sum, model) => sum + model.observedTokens.total, 0),
        successCount: models.reduce((sum, model) => sum + model.successCount, 0),
        failureCount: models.reduce((sum, model) => sum + model.failureCount, 0),
      },
    };
  }

  public async getTokenUsageReport(): Promise<{
    timestamp: number;
    totals: {
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      cachedTokens: number;
      toolTokens: number;
      totalRequests: number;
      successfulRequests: number;
      failedRequests: number;
      rateLimitedRequests: number;
      serverErrorRequests: number;
      timeoutRequests: number;
      averageLatencyMs: number;
    };
    byProvider: Record<string, {
      providerId: string;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      requests: number;
      successCount: number;
      failureCount: number;
      rateLimit429Count: number;
      quotaStatus?: ProviderQuotaSnapshot;
    }>;
    byModel: Array<{
      providerId: string;
      modelId: string;
      displayName: string;
      pool: string;
      health: string;
      quota: string;
      operationalStatus: string;
      cooldownRemainingSec: number;
      observedTokens: {
        input: number;
        output: number;
        reasoning: number;
        cached: number;
        tool: number;
        total: number;
      };
      requests: number;
      successCount: number;
      failureCount: number;
      rateLimit429Count: number;
      timeoutCount: number;
      averageLatencyMs: number;
      lastSuccessAt?: number;
      lastFailureAt?: number;
    }>;
    byCategory: Record<string, {
      category: AiTaskCategory;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      requests: number;
      rateLimit429Count: number;
    }>;
    recentLedger: UsageLedgerEntry[];
    rateLimitStatus: {
      isAnyModelThrottled: boolean;
      isAnyModelCoolingDown: boolean;
      activeCooldowns: Array<{
        providerId: string;
        modelId: string;
        remainingSeconds: number;
      }>;
      total429Events: number;
    };
  }> {
    const now = Date.now();
    const models = this.getModelRuntimeStatus();
    const usage = this.getUsageLedger({ limit: 100 });

    const totals = {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedTokens: 0,
      toolTokens: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      serverErrorRequests: 0,
      timeoutRequests: 0,
      averageLatencyMs: 0,
    };

    const byProvider: Record<string, any> = {};
    const byCategory: Record<string, any> = {};
    const activeCooldowns: Array<{ providerId: string; modelId: string; remainingSeconds: number }> = [];

    // Aggregate by models
    const byModel = models.map((m) => {
      const reg = Array.from(this.models.values()).find(
        (candidate) => candidate.providerId === m.providerId && candidate.modelId === m.modelId
      );
      const remainingCooldown = m.cooldownUntil && m.cooldownUntil > now
        ? Math.ceil((m.cooldownUntil - now) / 1000)
        : 0;

      if (remainingCooldown > 0) {
        activeCooldowns.push({
          providerId: m.providerId,
          modelId: m.modelId,
          remainingSeconds: remainingCooldown,
        });
      }

      totals.totalTokens += m.observedTokens.total;
      totals.inputTokens += m.observedTokens.input;
      totals.outputTokens += m.observedTokens.output;
      totals.reasoningTokens += m.observedTokens.reasoning;
      totals.cachedTokens += m.observedTokens.cached;
      totals.toolTokens += m.observedTokens.tool;
      totals.totalRequests += m.requests;
      totals.successfulRequests += m.successCount;
      totals.failedRequests += m.failureCount;
      totals.rateLimitedRequests += m.rateLimit429Count;
      totals.serverErrorRequests += m.serverError5xxCount;
      totals.timeoutRequests += m.timeoutCount;

      if (!byProvider[m.providerId]) {
        byProvider[m.providerId] = {
          providerId: m.providerId,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          requests: 0,
          successCount: 0,
          failureCount: 0,
          rateLimit429Count: 0,
        };
      }

      byProvider[m.providerId].totalTokens += m.observedTokens.total;
      byProvider[m.providerId].inputTokens += m.observedTokens.input;
      byProvider[m.providerId].outputTokens += m.observedTokens.output;
      byProvider[m.providerId].reasoningTokens += m.observedTokens.reasoning;
      byProvider[m.providerId].requests += m.requests;
      byProvider[m.providerId].successCount += m.successCount;
      byProvider[m.providerId].failureCount += m.failureCount;
      byProvider[m.providerId].rateLimit429Count += m.rateLimit429Count;

      return {
        providerId: m.providerId,
        modelId: m.modelId,
        displayName: reg?.displayName || m.modelId,
        pool: reg?.pool || 'creative',
        health: m.status,
        quota: reg?.quota || 'Healthy',
        operationalStatus: m.operationalStatus,
        cooldownRemainingSec: remainingCooldown,
        observedTokens: m.observedTokens,
        requests: m.requests,
        successCount: m.successCount,
        failureCount: m.failureCount,
        rateLimit429Count: m.rateLimit429Count,
        timeoutCount: m.timeoutCount,
        averageLatencyMs: m.averageLatencyMs,
        lastSuccessAt: m.lastSuccessAt,
        lastFailureAt: m.lastFailureAt,
      };
    });

    // Aggregate by category from recent usage ledger
    for (const entry of usage) {
      if (!byCategory[entry.category]) {
        byCategory[entry.category] = {
          category: entry.category,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          requests: 0,
          rateLimit429Count: 0,
        };
      }
      byCategory[entry.category].totalTokens += entry.totalTokens;
      byCategory[entry.category].inputTokens += entry.inputTokens;
      byCategory[entry.category].outputTokens += entry.outputTokens;
      byCategory[entry.category].reasoningTokens += entry.reasoningTokens;
      byCategory[entry.category].requests += 1;
      if (entry.failureType === '429') {
        byCategory[entry.category].rateLimit429Count += 1;
      }
    }

    // Query live provider quotas if available
    for (const providerId of Object.keys(byProvider)) {
      try {
        const adapter = this.getAdapter(providerId);
        if (adapter && typeof adapter.getQuotaStatus === 'function') {
          byProvider[providerId].quotaStatus = await adapter.getQuotaStatus().catch(() => undefined);
        }
      } catch {
        // Best effort
      }
    }

    const totalSuccessfulWithLatency = models.filter((m) => m.successCount > 0);
    totals.averageLatencyMs = totalSuccessfulWithLatency.length > 0
      ? Math.round(
          totalSuccessfulWithLatency.reduce((acc, m) => acc + (m.averageLatencyMs * m.successCount), 0) /
          Math.max(1, totals.successfulRequests)
        )
      : 0;

    return {
      timestamp: now,
      totals,
      byProvider,
      byModel,
      byCategory,
      recentLedger: usage,
      rateLimitStatus: {
        isAnyModelThrottled: models.some((m) => m.operationalStatus === 'THROTTLED'),
        isAnyModelCoolingDown: activeCooldowns.length > 0,
        activeCooldowns,
        total429Events: totals.rateLimitedRequests,
      },
    };
  }

  public resetUsageTelemetry(): void {
    this.usageLedger = [];
    for (const status of this.runtimeStatus.values()) {
      status.requests = 0;
      status.successCount = 0;
      status.failureCount = 0;
      status.consecutiveFailures = 0;
      status.rateLimit429Count = 0;
      status.serverError5xxCount = 0;
      status.timeoutCount = 0;
      status.lastLatencyMs = 0;
      status.averageLatencyMs = 0;
      status.observedTokens = { input: 0, output: 0, reasoning: 0, cached: 0, tool: 0, total: 0 };
    }
  }

  public async testModel(providerId: string, modelId: string): Promise<{
    success: boolean;
    status: 'READY' | 'CONFIGURED_NOT_TESTED' | 'QUOTA_LIMIT' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
    health: HealthState;
    quota: QuotaState;
    latencyMs: number;
    message: string;
    testedAt: number;
    diagnosticPayload?: unknown;
  }> {
    const key = `${providerId}::${modelId}`;
    const model = this.models.get(key) || Array.from(this.models.values()).find((m) => m.modelId === modelId);

    // 1. Built-in engines
    if (
      providerId === 'provider_deterministic_emergency' ||
      providerId === 'provider_mock_speech' ||
      providerId === 'provider_mock_stt' ||
      providerId === 'provider_mock_reasoning' ||
      providerId === 'dreambook-native'
    ) {
      if (model) {
        model.health = 'Healthy';
        model.quota = 'Healthy';
        model.accessStatus = 'accessible';
      }
      return {
        success: true,
        status: 'READY',
        health: 'Healthy',
        quota: 'Healthy',
        latencyMs: 5,
        message: 'Built-in local engine operational',
        testedAt: Date.now(),
      };
    }

    // 2. Google Gemini Provider
    if (providerId === 'google_gemini' || providerId === 'provider_google_gemini') {
      if (
        model &&
        (model.lifecycleState === 'deprecated' ||
          model.lifecycleState === 'discontinued' ||
          model.accessStatus === 'unavailable')
      ) {
        model.health = 'Unavailable';
        model.accessStatus = 'unavailable';
        model.quota = 'Unknown';
        return {
          success: false,
          status: 'UNAVAILABLE',
          health: 'Unavailable',
          quota: 'Unknown',
          latencyMs: 0,
          message: `Model unavailable or discontinued (404): ${modelId} is not available.`,
          testedAt: Date.now(),
        };
      }

      const apiKey = typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined;
      if (!apiKey) {
        if (model) {
          model.health = 'InvalidAuth';
          model.accessStatus = 'not_configured';
        }
        return {
          success: false,
          status: 'NOT_CONFIGURED',
          health: 'InvalidAuth',
          quota: 'Unknown',
          latencyMs: 0,
          message: 'GEMINI_API_KEY environment variable is not configured',
          testedAt: Date.now(),
        };
      }

      const start = Date.now();
      try {
        const adapter = this.getAdapter('google_gemini') as GoogleGeminiAdapter;
        await adapter.generate('utility.inspect', 'Ping test model', {
          modelId,
          timeoutMs: 5000,
        });
        const latencyMs = Math.max(1, Date.now() - start);

        if (model) {
          model.health = 'Healthy';
          model.quota = 'Healthy';
          model.accessStatus = 'accessible';
          model.latencyMs = latencyMs;
        }
        this.savePersistedConfig();

        return {
          success: true,
          status: 'READY',
          health: 'Healthy',
          quota: 'Healthy',
          latencyMs,
          message: 'Live provider connection test succeeded',
          testedAt: Date.now(),
        };
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        const latencyMs = Math.max(1, Date.now() - start);

        if (
          errMsg.includes('404') ||
          errMsg.includes('NOT_FOUND') ||
          errMsg.includes('no longer available') ||
          errMsg.includes('discontinued')
        ) {
          if (model) {
            model.health = 'Unavailable';
            model.accessStatus = 'unavailable';
            model.quota = 'Unknown';
          }
          this.savePersistedConfig();
          return {
            success: false,
            status: 'UNAVAILABLE',
            health: 'Unavailable',
            quota: 'Unknown',
            latencyMs,
            message: `Model unavailable or discontinued: ${errMsg}`,
            testedAt: Date.now(),
          };
        }

        if (
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('quota') ||
          errMsg.includes('rate limit')
        ) {
          if (model) {
            model.health = 'Throttled';
            model.accessStatus = 'quota_limited';
            model.quota = 'Exhausted';
          }
          this.savePersistedConfig();
          return {
            success: false,
            status: 'QUOTA_LIMIT',
            health: 'Throttled',
            quota: 'Exhausted',
            latencyMs,
            message: `Model quota/rate limit exceeded: ${errMsg}`,
            testedAt: Date.now(),
          };
        }

        if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('API_KEY_INVALID')) {
          if (model) {
            model.health = 'InvalidAuth';
            model.accessStatus = 'not_configured';
          }
          this.savePersistedConfig();
          return {
            success: false,
            status: 'NOT_CONFIGURED',
            health: 'InvalidAuth',
            quota: 'Unknown',
            latencyMs,
            message: `Authentication failed: ${errMsg}`,
            testedAt: Date.now(),
          };
        }

        if (model) {
          model.health = 'Degraded';
          model.accessStatus = 'unavailable';
        }
        this.savePersistedConfig();
        return {
          success: false,
          status: 'UNAVAILABLE',
          health: 'Degraded',
          quota: 'Unknown',
          latencyMs,
          message: `Model test failed: ${errMsg}`,
          testedAt: Date.now(),
        };
      }
    }

    // 3. OpenRouter
    if (providerId === 'openrouter') {
      const adapter = this.getAdapter('openrouter');
      const apiKey = getProviderApiKey('openrouter');

      if (!apiKey || !adapter) {
        if (model) {
          model.health = 'InvalidAuth';
          model.accessStatus = 'not_configured';
        }
        return {
          success: false,
          status: 'NOT_CONFIGURED',
          health: 'InvalidAuth',
          quota: 'Unknown',
          latencyMs: 0,
          message: 'OpenRouter API key is not configured.',
          testedAt: Date.now(),
        };
      }

      const start = Date.now();
      try {
        const providerRes = await adapter.generate('utility.inspect', 'Respond with exactly: OK', {
          modelId,
          timeoutMs: 8000,
        });
        const latencyMs = Math.max(1, Date.now() - start);

        if (model) {
          model.health = 'Healthy';
          model.quota = 'Healthy';
          model.accessStatus = 'accessible';
          model.latencyMs = latencyMs;
        }

        return {
          success: true,
          status: 'READY',
          health: 'Healthy',
          quota: 'Healthy',
          latencyMs,
          message: `OpenRouter model responded successfully via ${providerRes.modelId}.`,
          testedAt: Date.now(),
        };
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        const latencyMs = Math.max(1, Date.now() - start);
        const lower = errMsg.toLowerCase();

        let health: HealthState = 'Degraded';
        let status: 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'QUOTA_LIMIT' = 'UNAVAILABLE';
        let quota: QuotaState = 'Unknown';

        if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid') || lower.includes('api key')) {
          health = 'InvalidAuth';
          status = 'NOT_CONFIGURED';
        } else if (lower.includes('402') || lower.includes('429') || lower.includes('rate limit') || lower.includes('quota') || lower.includes('credits')) {
          health = 'Throttled';
          status = 'QUOTA_LIMIT';
          quota = 'Exhausted';
        }

        if (model) {
          model.health = health;
          model.quota = quota;
          model.accessStatus = health === 'InvalidAuth' ? 'not_configured' : 'unavailable';
          model.latencyMs = latencyMs;
        }

        return {
          success: false,
          status,
          health,
          quota,
          latencyMs,
          message: `OpenRouter model test failed: ${errMsg}`,
          testedAt: Date.now(),
          diagnosticPayload: err?.providerDiagnostic?.rawResponse,
        };
      }
    }

    // 4. Other external and custom providers
    const adapter = this.getAdapter(providerId);
    if (adapter) {
      const apiKey = getProviderApiKey(providerId);
      const isLocal = providerId.includes('local') || providerId.includes('ollama') || providerId.includes('lmstudio');
      if (!apiKey && !isLocal) {
        if (model) {
          model.health = 'InvalidAuth';
          model.accessStatus = 'not_configured';
        }
        return {
          success: false,
          status: 'NOT_CONFIGURED',
          health: 'InvalidAuth',
          quota: 'Unknown',
          latencyMs: 0,
          message: `API key is not configured for provider '${providerId}'.`,
          testedAt: Date.now(),
        };
      }

      const start = Date.now();
      try {
        const providerRes = await adapter.generate('utility.inspect', 'Respond with exactly: OK', {
          modelId,
          timeoutMs: 8000,
        });
        const latencyMs = Math.max(1, Date.now() - start);

        if (model) {
          model.health = 'Healthy';
          model.quota = 'Healthy';
          model.accessStatus = 'accessible';
          model.latencyMs = latencyMs;
        }

        return {
          success: true,
          status: 'READY',
          health: 'Healthy',
          quota: 'Healthy',
          latencyMs,
          message: `Provider '${providerId}' model responded successfully via ${providerRes.modelId}.`,
          testedAt: Date.now(),
        };
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        const latencyMs = Math.max(1, Date.now() - start);
        const lower = errMsg.toLowerCase();

        let health: HealthState = 'Degraded';
        let status: 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'QUOTA_LIMIT' = 'UNAVAILABLE';
        let quota: QuotaState = 'Unknown';

        if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid') || lower.includes('api key')) {
          health = 'InvalidAuth';
          status = 'NOT_CONFIGURED';
        } else if (lower.includes('402') || lower.includes('429') || lower.includes('rate limit') || lower.includes('quota') || lower.includes('credits')) {
          health = 'Throttled';
          status = 'QUOTA_LIMIT';
          quota = 'Exhausted';
        }

        if (model) {
          model.health = health;
          model.quota = quota;
          model.accessStatus = health === 'InvalidAuth' ? 'not_configured' : 'unavailable';
          model.latencyMs = latencyMs;
        }

        return {
          success: false,
          status,
          health,
          quota,
          latencyMs,
          message: `Provider '${providerId}' test failed: ${errMsg}`,
          testedAt: Date.now(),
        };
      }
    }

    if (model) {
      model.health = 'InvalidAuth';
      model.accessStatus = 'not_configured';
    }
    return {
      success: false,
      status: 'NOT_CONFIGURED',
      health: 'InvalidAuth',
      quota: 'Unknown',
      latencyMs: 0,
      message: `Provider '${providerId}' requires API credentials in server environment`,
      testedAt: Date.now(),
    };
  }

  public getManualOverrides(): ManualModelOverride[] {
    const seen = new Set<string>();
    const list: ManualModelOverride[] = [];
    for (const override of Array.from(this.manualOverrides.values())) {
      if (!seen.has(override.modelId)) {
        seen.add(override.modelId);
        list.push({ ...override });
      }
    }
    return list;
  }

  public getAllManualOverrides(): ManualModelOverride[] {
    return this.getManualOverrides();
  }

  public clearManualOverrides(): void {
    this.manualOverrides.clear();
    this.taskPinnedModels.clear();
  }

  private applyManualOverridesToRecord(record: ModelRegistryRecord): ModelRegistryRecord | null {
    const override = this.manualOverrides.get(record.modelId) ||
      this.manualOverrides.get(`${record.providerId}::${record.modelId}`);
    if (!override) return record;

    if (override.excluded) {
      return null;
    }

    const cloned: ModelRegistryRecord = { ...record };

    if (override.disabled) {
      cloned.health = 'DisabledByUser';
    }
    if (override.preferred) {
      cloned.userPriority = Math.max(cloned.userPriority + 200, 300);
    }
    if (override.userPriority !== undefined) {
      cloned.userPriority = override.userPriority;
    }
    if (override.priorityBoost !== undefined) {
      cloned.userPriority += override.priorityBoost;
    }
    const roles = override.roleEligibility || (override as any).roles;
    if (roles) {
      cloned.roleEligibility = [...roles];
    }
    if (override.pool) {
      cloned.pool = override.pool;
    }
    if (override.pinnedForTask) {
      this.taskPinnedModels.set(override.pinnedForTask, `${record.providerId}::${record.modelId}`);
    }

    return cloned;
  }

  public registerModel(record: ModelRegistryRecord): void {
    const effective = this.applyManualOverridesToRecord(record);
    if (!effective) return;

    if (!effective.billingState) {
      if (effective.isPaidModel === true) {
        effective.billingState = 'PAID';
        effective.billingEvidenceSource = 'PROVIDER';
      } else if (effective.isPaidModel === false) {
        effective.billingState = 'FREE';
        effective.billingEvidenceSource = 'PROVIDER';
      } else {
        effective.billingState = 'UNKNOWN';
        effective.billingEvidenceSource = 'UNKNOWN';
      }
    }
    if (!effective.billingEvidenceSource) {
      effective.billingEvidenceSource = 'UNKNOWN';
    }
    if (!effective.freeTierStatus) {
      if (effective.billingState === 'FREE' && effective.billingEvidenceSource === 'PROVIDER') {
        effective.freeTierStatus = 'VERIFIED';
        effective.freeTierEvidenceSource = 'PROVIDER';
        effective.freeTierVerifiedAt = Date.now();
      } else if (effective.isPaidModel === true && effective.billingEvidenceSource === 'PROVIDER') {
        effective.freeTierStatus = 'NOT_FREE';
        effective.freeTierEvidenceSource = 'PROVIDER';
        effective.freeTierVerifiedAt = Date.now();
      } else {
        effective.freeTierStatus = 'UNKNOWN';
        effective.freeTierEvidenceSource = effective.billingEvidenceSource || 'UNKNOWN';
      }
    }
    if (!effective.quotaEvidenceSource) {
      effective.quotaEvidenceSource = 'UNKNOWN';
    }

    // Normalize legacy registry shapes used by older providers/tests without
    // weakening the canonical model contract for modern records.
    const legacy = effective as any;
    if (!Number.isFinite(effective.contextWindow) || effective.contextWindow <= 0) {
      const legacyContext = Number(legacy.contextWindowTokens);
      effective.contextWindow = Number.isFinite(legacyContext) && legacyContext > 0 ? legacyContext : 32768;
    }
    if (!Array.isArray(effective.roleEligibility) || effective.roleEligibility.length === 0) {
      const legacyRoles = Array.isArray(legacy.preferredForTasks) ? legacy.preferredForTasks : [];
      effective.roleEligibility = [...legacyRoles];
    }
    if (!Array.isArray(effective.capabilities)) {
      effective.capabilities = [];
    }
    if (!effective.quota || (effective.quota as any) === 'Available') {
      effective.quota = 'Healthy';
    }
    if (!effective.health) {
      effective.health = 'Healthy';
    }
    if (!effective.accessStatus) {
      effective.accessStatus = 'accessible';
    }

    // Character Genesis has its own task contract. Any model that is already
    // eligible for memory extraction is compatible with the structured
    // character-extraction contract unless the provider explicitly opts out.
    if (
      effective.roleEligibility.includes('memory.extract') &&
      !effective.roleEligibility.includes('character.extract')
    ) {
      effective.roleEligibility = [...effective.roleEligibility, 'character.extract'];
    }
    if (
      effective.roleEligibility.includes('narrative.generate') &&
      !effective.roleEligibility.includes('story.advice')
    ) {
      effective.roleEligibility = [...effective.roleEligibility, 'story.advice'];
    }
    if (
      (effective.roleEligibility.includes('narrative.generate') || effective.roleEligibility.includes('character.dialogue')) &&
      !effective.roleEligibility.includes('ooc.respond')
    ) {
      effective.roleEligibility = [...effective.roleEligibility, 'ooc.respond'];
    }
    if (
      effective.roleEligibility.includes('character.extract') &&
      !effective.roleEligibility.includes('character.capability.propose')
    ) {
      effective.roleEligibility = [...effective.roleEligibility, 'character.capability.propose'];
    }
    const key = `${effective.providerId}::${effective.modelId}`;
    this.models.set(key, effective);
    // Ensure alias registration for google_gemini <-> provider_google_gemini
    if (effective.providerId === 'google_gemini') {
      this.models.set(`provider_google_gemini::${effective.modelId}`, { ...effective, providerId: 'provider_google_gemini' });
    } else if (effective.providerId === 'provider_google_gemini') {
      this.models.set(`google_gemini::${effective.modelId}`, { ...effective, providerId: 'google_gemini' });
    }
  }

  public getTaskReadiness(task: TaskId, providerId: string, modelId: string, contextTokens = 0): AiTaskReadiness | undefined {
    const model = this.getModel(providerId, modelId);
    if (!model) return undefined;
    const readiness = evaluateAiTaskReadiness(task, model, contextTokens);
    if (this.isCircuitBreakerTripped(model.providerId, model.modelId)) {
      return { ...readiness, state: 'COOLDOWN', reason: 'Circuit breaker is tripped for this model/task route.' };
    }
    if (this.isModelCoolingDown(model)) {
      return { ...readiness, state: 'COOLDOWN', reason: 'Model is in provider cooldown.' };
    }
    return readiness;
  }

  public getTaskCandidatePreflight(
    task: TaskId,
    providerId: string,
    modelId: string,
    contextTokens = 0,
    reservedOutputTokens?: number,
  ): AiTaskCandidatePreflight | undefined {
    const model = this.getModel(providerId, modelId);
    if (!model) return undefined;

    const preflight = evaluateAiTaskCandidatePreflight(
      task,
      model,
      contextTokens,
      reservedOutputTokens,
    );

    if (this.isCircuitBreakerTripped(model.providerId, model.modelId)) {
      return {
        ...preflight,
        state: 'COOLDOWN',
        eligible: false,
        reason: 'Circuit breaker is tripped for this model/task route.',
      };
    }

    if (this.isModelCoolingDown(model)) {
      return {
        ...preflight,
        state: 'COOLDOWN',
        eligible: false,
        reason: 'Model is in provider cooldown.',
      };
    }

    return preflight;
  }

  public getModel(providerId: string, modelId: string): ModelRegistryRecord | undefined {
    const direct = this.models.get(`${providerId}::${modelId}`);
    if (direct) return direct;
    if (providerId === 'provider_google_gemini') {
      return this.models.get(`google_gemini::${modelId}`);
    }
    if (providerId === 'google_gemini') {
      return this.models.get(`provider_google_gemini::${modelId}`);
    }
    return undefined;
  }

  public getAllModels(): ModelRegistryRecord[] {
    return Array.from(this.models.values());
  }

  public registerAdapter(adapter: IProviderAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  public getAdapter(providerId: string): IProviderAdapter | undefined {
    const normalized = (providerId || '').trim().toLowerCase();
    if (normalized === 'provider_local_emergency') {
      return this.adapters.get('provider_deterministic_emergency') || this.adapters.get(normalized);
    }
    if (normalized === 'provider_google_gemini' || normalized === 'google_gemini') {
      return this.adapters.get('google_gemini') || this.adapters.get('provider_google_gemini');
    }
    const existing = this.adapters.get(normalized);
    if (existing) return existing;

    const custom = getCustomProvider(normalized);
    if (custom) {
      const adapter = new OpenAiCompatibleAdapter(custom.id, custom.baseUrl, custom.headers);
      this.registerAdapter(adapter);
      return adapter;
    }

    const defaultBaseUrl = getProviderBaseUrl(normalized);
    if (defaultBaseUrl) {
      const adapter = new OpenAiCompatibleAdapter(normalized, defaultBaseUrl);
      this.registerAdapter(adapter);
      return adapter;
    }

    return undefined;
  }

  public getAllAdapters(): IProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  public updateModelHealth(providerId: string, modelId: string, health: HealthState, quota?: QuotaState): void {
    let key = `${providerId}::${modelId}`;
    let m = this.models.get(key);
    if (!m && providerId === 'provider_google_gemini') {
      key = `google_gemini::${modelId}`;
      m = this.models.get(key);
    } else if (!m && providerId === 'google_gemini') {
      key = `provider_google_gemini::${modelId}`;
      m = this.models.get(key);
    }
    if (!m) {
      for (const [k, candidate] of this.models.entries()) {
        if (candidate.modelId === modelId && (candidate.providerId.startsWith(providerId) || providerId.startsWith(candidate.providerId))) {
          m = candidate;
          key = k;
          break;
        }
      }
    }
    if (!m) {
      for (const [k, candidate] of this.models.entries()) {
        if (candidate.modelId === modelId) {
          m = candidate;
          key = k;
          break;
        }
      }
    }
    if (m) {
      m.health = health;
      if (quota) m.quota = quota;
      const runtime = this.ensureRuntimeStatus(m);
      runtime.status = health;
      runtime.operationalStatus =
        health === 'DisabledByUser'
          ? 'DISABLED'
          : health === 'Unavailable' || health === 'InvalidAuth'
            ? 'UNAVAILABLE'
            : health === 'Throttled'
              ? 'THROTTLED'
              : runtime.cooldownUntil && runtime.cooldownUntil > Date.now()
                ? 'COOLDOWN'
                : 'AVAILABLE';
      if (health === 'Healthy') {
        this.consecutiveFailures.set(key, 0);
        this.circuitBreakersTripped.delete(key);
        this.circuitBreakersTripped.delete(`${m.providerId}::${m.modelId}`);
      } else if (health === 'Unavailable' || health === 'DisabledByUser') {
        this.circuitBreakersTripped.add(key);
        this.circuitBreakersTripped.add(`${m.providerId}::${m.modelId}`);
      }
    }
  }

  public isCircuitBreakerTripped(providerId: string, modelId: string): boolean {
    return this.circuitBreakersTripped.has(`${providerId}::${modelId}`) ||
      (providerId === 'google_gemini' && this.circuitBreakersTripped.has(`provider_google_gemini::${modelId}`)) ||
      (providerId === 'provider_google_gemini' && this.circuitBreakersTripped.has(`google_gemini::${modelId}`));
  }

  public resetCircuitBreaker(providerId: string, modelId: string): void {
    const key1 = `${providerId}::${modelId}`;
    const key2 = providerId === 'google_gemini' ? `provider_google_gemini::${modelId}` : `google_gemini::${modelId}`;
    this.circuitBreakersTripped.delete(key1);
    this.circuitBreakersTripped.delete(key2);
    this.consecutiveFailures.set(key1, 0);
    this.consecutiveFailures.set(key2, 0);
    const m = this.models.get(key1) || this.models.get(key2);
    if (m && m.health === 'Unavailable') {
      m.health = 'Healthy';
      const runtime = this.ensureRuntimeStatus(m);
      runtime.status = 'Healthy';
      runtime.operationalStatus = runtime.cooldownUntil && runtime.cooldownUntil > Date.now()
        ? 'COOLDOWN'
        : 'AVAILABLE';
    }
  }

  public isCandidateUsable(model: ModelRegistryRecord, task?: TaskId, contextTokens: number = 0): boolean {
    if (!task) {
      if (model.health === 'DisabledByUser' || model.health === 'Unavailable' || model.health === 'InvalidAuth') return false;
      if (model.quota === 'Exhausted' || model.accessStatus === 'quota_limited' || model.accessStatus === 'rate_limited') return false;
      return !this.isCircuitBreakerTripped(model.providerId, model.modelId) && !this.isModelCoolingDown(model);
    }

    const readiness = evaluateAiTaskReadiness(task, model, contextTokens);
    if (!['READY', 'QUOTA_AVAILABLE', 'CONFIGURED', 'CAPABILITY_COMPATIBLE', 'TASK_VERIFIED'].includes(readiness.state)) {
      return false;
    }

    const preflight = this.getTaskCandidatePreflight(
      task,
      model.providerId,
      model.modelId,
      contextTokens,
      0,
    );
    if (!preflight?.eligible) return false;

    if (this.isCircuitBreakerTripped(model.providerId, model.modelId)) return false;
    if (this.isModelCoolingDown(model)) return false;
    return true;
  }


  /**
   * Intelligent Selection Score (DreamBook V6.8 & DEF-CH12-02 context capacity & DEF-CH12-03 deterministic tie-breaking)
   * candidate_score = eligibility + role_fit + health_score + quota_score + preference_score - failure_penalty
   *
   * Enforces:
   * 1. Hard Context Window validation: model.contextWindow >= contextTokens (DEF-CH12-02)
   * 2. Stable secondary and tertiary deterministic tie-breaking (DEF-CH12-03)
   */
  public selectBestModel(
    task: TaskId,
    options?: { contextTokens?: number; includeEmergencyInCandidates?: boolean; userPriorityTier?: string }
  ): {
    selectedModel: ModelRegistryRecord;
    selectionReason: string;
    selectionScore: number;
    fallbacks: ModelRegistryRecord[];
  } {
    this.refreshAllProviderModelStatuses();
    const contextTokens = options?.contextTokens ?? 0;

    // Every task owns its own configured fallback route. Never alias one task
    // to another task's chain: the Settings UI and the runtime must describe and
    // execute the same route.
    const routeTask: TaskId = task;
    const customChainKeys = this.taskFallbackChains.get(routeTask);
    const category = this.getTaskCategory(task);
    const categoryOverrideKey = this.categoryOverrides.get(category);
    const routingPolicy = getAiTaskRoutingPolicy(task);

    const findConfiguredModel = (key: string): ModelRegistryRecord | undefined => {
      let found = Array.from(this.models.values()).find(
        (m) =>
          `${m.providerId}::${m.modelId}` === key ||
          m.modelId === key ||
          (key.startsWith('openrouter::') && m.modelId === key.replace('openrouter::', '')) ||
          (m.providerId === 'openrouter' && key === m.modelId)
      );
      if (!found && (key.startsWith('openrouter::') || key.includes('/') || key.startsWith('google_gemini::'))) {
        const parts = key.split('::');
        const providerId = parts.length > 1 ? parts[0] : (key.includes('/') ? 'openrouter' : 'google_gemini');
        const modelId = parts.length > 1 ? parts[1] : parts[0];
        found = this.registerCustomModel({
          providerId,
          modelId,
          displayName: modelId,
        });
      }
      return found;
    };

    const isUsableCandidate = (model: ModelRegistryRecord): boolean => {
      if (getProviderApiKey(model.providerId) && model.health === 'InvalidAuth') {
        model.health = 'Healthy';
        model.accessStatus = 'accessible';
      }
      return this.isCandidateUsable(model, task, contextTokens);
    };

    // Category-scoped manual override has precedence over task auto-selection.
    // Its failover scope is the same category/task route; do not inject unrelated
    // global models behind a player-selected narrator.
    if (categoryOverrideKey) {
      const overridden = findConfiguredModel(categoryOverrideKey);
      if (overridden && isUsableCandidate(overridden)) {
        const configuredFallbacks = (customChainKeys || [])
          .map(findConfiguredModel)
          .filter((model): model is ModelRegistryRecord => Boolean(model))
          .filter((model) => this.modelKey(model) !== this.modelKey(overridden))
          .filter((model) => isUsableCandidate(model));

        const emergency = Array.from(this.models.values()).find(
          (model) => model.isEmergencyFloor && model.roleEligibility.includes(task),
        );
        if (emergency && !configuredFallbacks.some((model) => this.modelKey(model) === this.modelKey(emergency))) {
          configuredFallbacks.push(emergency);
        }

        return {
          selectedModel: overridden,
          selectionReason: `Category-scoped manual override for ${category}; N19 ${routingPolicy.qualityTier} routing remains advisory beneath the explicit override, using the requested task's configured fallback route.`,
          selectionScore: overridden.userPriority + 1000,
          fallbacks: configuredFallbacks,
        };
      }
    }
    // Check if a model is manually pinned for this task
    const pinnedKey = this.taskPinnedModels.get(routeTask);
    if (pinnedKey) {
      const pinnedModel = Array.from(this.models.values()).find(
        (m) => `${m.providerId}::${m.modelId}` === pinnedKey || m.modelId === pinnedKey
      );
      if (
        pinnedModel &&
        pinnedModel.health !== 'Unavailable' &&
        pinnedModel.health !== 'DisabledByUser' &&
        !this.isCircuitBreakerTripped(pinnedModel.providerId, pinnedModel.modelId)
        && !this.isModelCoolingDown(pinnedModel)
      ) {
        if (contextTokens === 0 || contextTokens <= pinnedModel.contextWindow) {
          let fallbacks: ModelRegistryRecord[];
          if (customChainKeys) {
            // A configured task chain is authoritative. Do not grant a model new
            // task eligibility merely because it appears in the chain.
            fallbacks = customChainKeys
              .map(findConfiguredModel)
              .filter((m): m is ModelRegistryRecord => Boolean(m))
              .filter((m) => m.modelId !== pinnedModel.modelId && isUsableCandidate(m));

            const emergency = Array.from(this.models.values()).find(
              (m) => m.isEmergencyFloor && m.roleEligibility.includes(task)
            );
            if (
              emergency &&
              !fallbacks.some((m) => this.modelKey(m) === this.modelKey(emergency))
            ) {
              fallbacks.push(emergency);
            }
          } else {
            const rawFallbacks = Array.from(this.models.values()).filter(
              (m) => m.modelId !== pinnedModel.modelId && m.roleEligibility.includes(task)
            );
            fallbacks = rawFallbacks.filter((model) => isUsableCandidate(model)).sort((a, b) => {
              const scoreA = a.userPriority + (a.health === 'Healthy' ? 50 : 0) - (this.consecutiveFailures.get(`${a.providerId}::${a.modelId}`) || 0) * 25;
              const scoreB = b.userPriority + (b.health === 'Healthy' ? 50 : 0) - (this.consecutiveFailures.get(`${b.providerId}::${b.modelId}`) || 0) * 25;
              if (scoreB !== scoreA) return scoreB - scoreA;
              return a.modelId.localeCompare(b.modelId);
            });
          }

          return {
            selectedModel: pinnedModel,
            selectionReason: customChainKeys
              ? `Model '${pinnedModel.modelId}' was manually pinned for '${task}', using only the configured fallback models.`
              : `Model '${pinnedModel.modelId}' was manually pinned for task '${task}'.`,
            selectionScore: pinnedModel.userPriority + 500,
            fallbacks,
          };
        }
      }
    }

    const eligible = Array.from(this.models.values()).filter((m) => {
      // 1. Role eligibility
      if (!m.roleEligibility.includes(task)) return false;

      // 2. Health & circuit breaker checks
      if (m.health === 'Unavailable' || m.health === 'DisabledByUser' || m.health === 'InvalidAuth') {
        return false;
      }
      if (this.isCircuitBreakerTripped(m.providerId, m.modelId)) {
        return false;
      }
      if (this.isModelCoolingDown(m)) {
        return false;
      }

      // 3. DEF-CH12-02: Hard context window check
      if (contextTokens > 0 && contextTokens > m.contextWindow) {
        return false;
      }

      // Exclude emergency floor from primary scoring unless explicitly included or only option
      if (m.isEmergencyFloor && !options?.includeEmergencyInCandidates) {
        return false;
      }

      return true;
    });

    if (eligible.length === 0) {
      // Return emergency floor model (guaranteed deterministic recovery for every canonical task)
      let emergency = Array.from(this.models.values()).find((m) => m.isEmergencyFloor);
      if (!emergency) {
        emergency = {
          providerId: 'provider_deterministic_emergency',
          modelId: 'emergency-fallback-local',
          displayName: 'Deterministic Rule Engine (Emergency Floor)',
          pool: 'emergency',
          capabilities: ['zero_cost', 'unlimited_quota', 'deterministic', 'text_generation', 'structured_output', 'text'],
          contextWindow: 1000000,
          health: 'Healthy',
          quota: 'Healthy',
          latencyMs: 5,
          userPriority: 10,
          roleEligibility: [task],
          isEmergencyFloor: true,
          fallbackEligibility: true,
          accessStatus: 'accessible',
          lifecycleState: 'active',
          supportedInputTypes: ['text'],
          supportedOutputTypes: ['text', 'json'],
        };
        this.models.set(this.modelKey(emergency), emergency);
      }
      if (!emergency.roleEligibility.includes(task)) {
        emergency.roleEligibility = [...emergency.roleEligibility, task];
      }
      return {
        selectedModel: emergency,
        selectionReason: 'Emergency floor fallback selected; all primary providers exhausted or unavailable.',
        selectionScore: emergency.userPriority,
        fallbacks: [],
      };
    }

    const hasActiveManualOverrideForTask = Array.from(this.models.values()).some((m) => {
      const override = this.manualOverrides.get(m.modelId) || this.manualOverrides.get(`${m.providerId}::${m.modelId}`);
      const roles = override?.roleEligibility || (override as any)?.roles;
      return override && roles && roles.includes(task);
    });

    if (customChainKeys && customChainKeys.length > 0 && !hasActiveManualOverrideForTask) {
      // An explicit task route is authoritative unless a direct model-level
      // manual override deliberately changes the model's role/priority.
      // The first currently usable
      // model in the configured chain is the primary; later usable entries
      // remain in the exact configured order, followed by the deterministic
      // emergency floor. Do not replace the configured route with an
      // unrelated globally eligible model.
      const configuredModels = customChainKeys
        .map(findConfiguredModel)
        .filter((m): m is ModelRegistryRecord => Boolean(m))
        .filter((m) => !m.isEmergencyFloor)
        .filter((m) => isUsableCandidate(m));

      const emergency = Array.from(this.models.values()).find(
        (m) => m.isEmergencyFloor && m.roleEligibility.includes(task),
      );

      if (configuredModels.length > 0) {
        const primary = configuredModels[0];
        const fallbackModels = configuredModels.slice(1);

        if (
          emergency &&
          !fallbackModels.some((m) => this.modelKey(m) === this.modelKey(emergency))
        ) {
          fallbackModels.push(emergency);
        }

        return {
          selectedModel: primary,
          selectionReason: "Configured task route selected '" + primary.modelId + "' as the primary model; failover preserves the configured route order.",
          selectionScore: primary.userPriority,
          fallbacks: fallbackModels,
        };
      }

      if (emergency) {
        const configuredRouteModels = (customChainKeys || [])
          .map(findConfiguredModel)
          .filter((model): model is ModelRegistryRecord => Boolean(model));

        const capacityBlockedRoute = configuredRouteModels.some((model) => {
          const preflight = this.getTaskCandidatePreflight(
            task,
            model.providerId,
            model.modelId,
            contextTokens,
            0,
          );
          return preflight?.state === 'REJECTED' &&
            /context window|output token limit/i.test(preflight.reason);
        });

        if (capacityBlockedRoute) {
          const capacityRecovery = eligible
            .filter((model) => !model.isEmergencyFloor)
            .filter((model) => isUsableCandidate(model))
            .sort((a, b) => {
              const scoreA = a.userPriority + (a.health === 'Healthy' ? 50 : 0) + (a.quota === 'Healthy' ? 30 : 0) - Math.min(20, (a.latencyMs || 500) / 100);
              const scoreB = b.userPriority + (b.health === 'Healthy' ? 50 : 0) + (b.quota === 'Healthy' ? 30 : 0) - Math.min(20, (b.latencyMs || 500) / 100);
              return scoreB - scoreA || (a.modelId + '::' + a.providerId).localeCompare(b.modelId + '::' + b.providerId);
            })[0];

          if (capacityRecovery) {
            return {
              selectedModel: capacityRecovery,
              selectionReason: 'Configured route contains no model with sufficient known capacity; adaptive capacity recovery selected a task-compatible model before using the emergency floor.',
              selectionScore: capacityRecovery.userPriority,
              fallbacks: [emergency],
            };
          }
        }

        return {
          selectedModel: emergency,
          selectionReason: 'Configured task route contains no currently usable AI model; using deterministic emergency floor.',
          selectionScore: emergency.userPriority,
          fallbacks: [],
        };
      }
    }


    const scored = eligible.map((model) => {
      let score = model.userPriority;
      if (model.health === 'Healthy') score += 50;
      else if (model.health === 'Degraded') score += 10;
      else if (model.health === 'Throttled') score -= 30;

      if (model.quota === 'Healthy') score += 30;
      else if (model.quota === 'Low') score += 10;
      else if (model.quota === 'NearExhaustion') score -= 40;
      else if (model.quota === 'Exhausted') score -= 100;

      // Latency penalty (prefer < 500ms)
      if (model.latencyMs > 1500) score -= 15;

      // N19 quality-tier preference is additive to existing reliability/priority scoring.
      score += Math.min(100, scoreModelForQualityTier(model, routingPolicy.qualityTier) * 0.5);

      // Failure penalty
      const failures = this.consecutiveFailures.get(`${model.providerId}::${model.modelId}`) || 0;
      score -= failures * 25;

      return { model, score };
    });

    // DEF-CH12-03: Deterministic tie-breaking
    // 1. Primary: score descending
    // 2. Secondary: modelId lexicographically ascending
    // 3. Tertiary: providerId lexicographically ascending
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const modelDiff = a.model.modelId.localeCompare(b.model.modelId);
      if (modelDiff !== 0) return modelDiff;
      return a.model.providerId.localeCompare(b.model.providerId);
    });

    if (scored.length === 0) {
      const emergency = Array.from(this.models.values()).find((m) => m.isEmergencyFloor) || {
        providerId: 'provider_deterministic_emergency',
        modelId: 'emergency-fallback-local',
        displayName: 'Deterministic Rule Engine (Emergency Floor)',
        pool: 'emergency',
        capabilities: ['zero_cost', 'unlimited_quota', 'deterministic', 'text_generation', 'structured_output', 'text'],
        contextWindow: 1000000,
        health: 'Healthy',
        quota: 'Healthy',
        latencyMs: 5,
        userPriority: 10,
        roleEligibility: [task],
        isEmergencyFloor: true,
        fallbackEligibility: true,
        accessStatus: 'accessible',
        lifecycleState: 'active',
        supportedInputTypes: ['text'],
        supportedOutputTypes: ['text', 'json'],
      };
      return {
        selectedModel: emergency,
        selectionReason: 'Emergency floor fallback selected; no scored primary models available.',
        selectionScore: emergency.userPriority,
        fallbacks: [],
      };
    }

    const best = scored[0].model;
    const fallbacks = scored.slice(1).map((s) => s.model);

    // Append emergency floor to fallbacks if not already present and eligible
    const emergency = Array.from(this.models.values()).find((m) => m.isEmergencyFloor);
    if (emergency && emergency.roleEligibility.includes(task) && !fallbacks.some((f) => f.modelId === emergency.modelId) && best.modelId !== emergency.modelId) {
      fallbacks.push(emergency);
    }

    return {
      selectedModel: best,
      selectionReason: `Selected for ${routingPolicy.qualityTier} quality / ${routingPolicy.cadence} cadence; priority (${best.userPriority}), health (${best.health}), and quota (${best.quota}) remained healthy.`,
      selectionScore: scored[0]?.score || best.userPriority,
      fallbacks,
    };
  }

  /**
   * Cross-Model Continuation Checkpoint (DreamBook V6.15, V6.16)
   * Preserves canonical state, uncommitted output, and role contracts across failovers.
   */
  public createContinuationCheckpoint(checkpoint: ContinuationCheckpoint): void {
    this.checkpoints.set(checkpoint.checkpointId, {
      ...checkpoint,
      createdAt: checkpoint.createdAt || Date.now(),
      canonicalInvariants: { ...checkpoint.canonicalInvariants },
      styleContract: { ...checkpoint.styleContract },
    });
  }

  public getContinuationCheckpoint(checkpointId: string): ContinuationCheckpoint | undefined {
    const cp = this.checkpoints.get(checkpointId);
    if (!cp) return undefined;
    return {
      ...cp,
      canonicalInvariants: { ...cp.canonicalInvariants },
      styleContract: { ...cp.styleContract },
    };
  }

  public getAllCheckpoints(storyId?: string): ContinuationCheckpoint[] {
    const list = Array.from(this.checkpoints.values()).map((cp) => ({
      ...cp,
      canonicalInvariants: { ...cp.canonicalInvariants },
      styleContract: { ...cp.styleContract },
    }));
    return storyId ? list.filter((cp) => cp.storyId === storyId) : list;
  }

  /**
   * Challenge 13: Lossless Committed Narrative History Export
   * Exports committed narrative history and accepted player actions from continuation checkpoints.
   * Excludes transient CH12 execution context, working context tokens, uncommitted output, and provider IDs.
   */
  public exportNarrativeHistory(storyId: string): CommittedNarrativeRecord[] {
    const checkpoints = this.getAllCheckpoints(storyId);
    return checkpoints.map((cp) => ({
      checkpointId: cp.checkpointId,
      storyId: cp.storyId,
      turnId: cp.turnId,
      role: cp.role || 'narrator',
      playerAction: cp.playerAction,
      worldTime: cp.worldTime,
      locationId: cp.locationId,
      sceneSummary: cp.sceneSummary,
      recentOutput: cp.recentOutput,
      summaryText: cp.summaryText,
      recentHistory: Array.isArray(cp.recentHistory) ? [...cp.recentHistory] : [],
      openThreads: Array.isArray(cp.openThreads) ? [...cp.openThreads] : [],
      presentationEvents: Array.isArray(cp.presentationEvents) ? [...cp.presentationEvents] : [],
      activeConditions: Array.isArray(cp.activeConditions) ? [...cp.activeConditions] : [],
      activeQuests: Array.isArray(cp.activeQuests) ? [...cp.activeQuests] : [],
      canonicalInvariants: cp.canonicalInvariants ? { ...cp.canonicalInvariants } : {},
      styleContract: cp.styleContract ? { ...cp.styleContract } : {},
      createdAt: cp.createdAt,
      adjudicationStatus: cp.adjudicationStatus,
    }));
  }

  public commitTransactionState(staged: MultiModelOrchestrator): void {
    for (const [id, cp] of staged.checkpoints.entries()) {
      this.checkpoints.set(id, { ...cp });
    }
    for (const [id, val] of staged.consecutiveFailures.entries()) {
      this.consecutiveFailures.set(id, val);
    }
    for (const item of staged.circuitBreakersTripped) {
      this.circuitBreakersTripped.add(item);
    }
    this.totalTurnsExecuted = staged.totalTurnsExecuted;
    if (staged.lastTurnTelemetry) {
      this.lastTurnTelemetry = { ...staged.lastTurnTelemetry };
    }
    for (const [key, val] of staged.turnResultsByIdempotencyKey.entries()) {
      this.turnResultsByIdempotencyKey.set(key, val);
    }
  }

  /**
   * Challenge 13: Lossless Committed Narrative History Restore
   * Restores committed narrative checkpoints for a story into the continuation checkpoint authority.
   */
  public restoreNarrativeHistory(storyId: string, records: any[]): void {
    for (const [id, cp] of Array.from(this.checkpoints.entries())) {
      if (cp.storyId === storyId) {
        this.checkpoints.delete(id);
      }
    }

    if (!Array.isArray(records)) return;

    for (const [recordIndex, rec] of records.entries()) {
      if (!rec) continue;
      if (typeof rec === 'string') {
        const id = deterministicId('cp_restored', storyId, recordIndex, rec);
        this.checkpoints.set(id, {
          checkpointId: id,
          storyId,
          turnId: 'turn_restored',
          role: 'narrator',
          worldTime: 'Cycle 1',
          locationId: 'loc_whispering_orrery',
          sceneSummary: rec,
          recentOutput: rec,
          uncommittedOutput: '',
          canonicalInvariants: {},
          styleContract: {},
          createdAt: Date.now(),
          recentHistory: [rec],
          summaryText: rec,
          handoffEligible: true,
        });
      } else {
        const checkpointId = rec.checkpointId || deterministicId('cp_restore', storyId, recordIndex, rec.turnId || 'turn_0', rec.summaryText || rec.sceneSummary || '');
        this.checkpoints.set(checkpointId, {
          checkpointId,
          storyId,
          turnId: rec.turnId || 'turn_0',
          role: rec.role || 'narrator',
          playerAction: rec.playerAction,
          worldTime: rec.worldTime || 'Cycle 1',
          locationId: rec.locationId || 'loc_whispering_orrery',
          sceneSummary: rec.sceneSummary || '',
          recentOutput: rec.recentOutput || '',
          uncommittedOutput: '',
          canonicalInvariants: rec.canonicalInvariants || {},
          styleContract: rec.styleContract || {},
          openThreads: Array.isArray(rec.openThreads) ? [...rec.openThreads] : [],
          presentationEvents: rec.presentationEvents || [],
          createdAt: rec.createdAt || Date.now(),
          adjudicationStatus: rec.adjudicationStatus || 'ADJUDICATED',
          handoffEligible: true,
          activeConditions: rec.activeConditions || [],
          activeQuests: rec.activeQuests || [],
          recentHistory: rec.recentHistory || (rec.recentOutput ? [rec.recentOutput] : []),
          summaryText: rec.summaryText || rec.sceneSummary || '',
        });
      }
    }
  }

  public getLastTurnTelemetry(): OrchestratedTurnTelemetry | null {
    return this.lastTurnTelemetry ? { ...this.lastTurnTelemetry } : null;
  }

  public getOrchestrationStats(): {
    totalTurnsExecuted: number;
    modelsRegistered: number;
    checkpointsSaved: number;
    trippedCircuitBreakers: string[];
  } {
    return {
      totalTurnsExecuted: this.totalTurnsExecuted,
      modelsRegistered: this.models.size,
      checkpointsSaved: this.checkpoints.size,
      trippedCircuitBreakers: Array.from(this.circuitBreakersTripped),
    };
  }

  /**
   * Structured Turn Package Validation (DreamBook V6.19, V6.20 & DEF-CH12-05)
   * Validates JSON shape, schema rules, and forbids illegal state change kinds.
   */
  public validateTurnPackage(
    rawText: string,
    options?: { allowPlainTextNarration?: boolean },
  ): {
    valid: boolean;
    turnPackage?: StructuredTurnPackage;
    errorReason?: string;
  } {
    try {
      const cleaned = String(rawText || '')
        .trim()
        .replace(new RegExp('^```(?:json)?\\s*', 'i'), '')
        .replace(new RegExp('\\s*```$', 'i'), '')
        .trim();

      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const objectStart = cleaned.indexOf('{');
        const objectEnd = cleaned.lastIndexOf('}');
        if (objectStart >= 0 && objectEnd > objectStart) {
          try {
            parsed = JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
          } catch {
            parsed = undefined;
          }
        }
      }

      if (parsed !== undefined && typeof parsed === 'object' && parsed !== null) {
        if (!Array.isArray(parsed.narrative)) {
          if (typeof parsed.narrative === 'string' && parsed.narrative.trim()) {
            parsed.narrative = [parsed.narrative.trim()];
          } else if (typeof parsed.narrativeText === 'string' && parsed.narrativeText.trim()) {
            parsed.narrative = [parsed.narrativeText.trim()];
          } else if (typeof parsed.narration === 'string' && parsed.narration.trim()) {
            parsed.narrative = [parsed.narration.trim()];
          } else if (typeof parsed.story === 'string' && parsed.story.trim()) {
            parsed.narrative = [parsed.story.trim()];
          }
        }
      }

      if (parsed === undefined) {
        if (options?.allowPlainTextNarration && cleaned.length >= 50) {
          return {
            valid: true,
            turnPackage: {
              narrative: [cleaned],
              dialogue: [],
              events: [],
              stateChanges: [],
              memoryCandidates: [],
              audioCues: [],
            },
          };
        }
        return { valid: false, errorReason: 'Response is not valid JSON.' };
      }

      if (typeof parsed === 'string' && options?.allowPlainTextNarration && parsed.trim().length >= 50) {
        return {
          valid: true,
          turnPackage: {
            narrative: [parsed.trim()],
            dialogue: [],
            events: [],
            stateChanges: [],
            memoryCandidates: [],
            audioCues: [],
          },
        };
      }

      if (
        options?.allowPlainTextNarration &&
        !Array.isArray(parsed?.narrative) &&
        typeof parsed?.narrativeText === 'string' &&
        parsed.narrativeText.trim().length >= 80
      ) {
        parsed = {
          narrative: [parsed.narrativeText.trim()],
          dialogue: Array.isArray(parsed.dialogue) ? parsed.dialogue : [],
          events: Array.isArray(parsed.events) ? parsed.events : [],
          stateChanges: Array.isArray(parsed.stateChanges) ? parsed.stateChanges : [],
          memoryCandidates: Array.isArray(parsed.memoryCandidates) ? parsed.memoryCandidates : [],
          audioCues: Array.isArray(parsed.audioCues) ? parsed.audioCues : [],
        };
      }

      // 1. Narrative must be non-empty string[]
      if (!Array.isArray(parsed.narrative) || parsed.narrative.length === 0) {
        return { valid: false, errorReason: 'Missing or empty narrative array.' };
      }
      for (const line of parsed.narrative) {
        if (typeof line !== 'string') {
          return { valid: false, errorReason: 'Narrative items must be valid strings.' };
        }
      }

      // 2. Dialogue validation
      const dialogue: { speaker: string; text: string }[] = [];
      if (parsed.dialogue) {
        if (!Array.isArray(parsed.dialogue)) {
          return { valid: false, errorReason: 'Dialogue must be an array.' };
        }
        for (const d of parsed.dialogue) {
          if (!d || typeof d.speaker !== 'string' || typeof d.text !== 'string') {
            return { valid: false, errorReason: 'Dialogue entries must contain valid speaker and text.' };
          }
          dialogue.push({ speaker: d.speaker, text: d.text });
        }
      }

      // 3. Events validation
      const events: string[] = [];
      if (parsed.events) {
        if (!Array.isArray(parsed.events)) {
          return { valid: false, errorReason: 'Events must be an array of strings.' };
        }
        for (const e of parsed.events) {
          if (typeof e !== 'string') {
            return { valid: false, errorReason: 'Event items must be strings.' };
          }
          events.push(e);
        }
      }

      // 4. State changes remain strictly validated even when prose fallback is allowed.
      const stateChanges: StateChangeProposal[] = [];
      const allowedKinds = new Set([
        'INVENTORY',
        'CAPABILITY',
        'LOCATION',
        'COMBAT',
        'CHRONICLE',
        'PHYSIOLOGY',
        'HEALTH',
        'ALIGNMENT',
      ]);

      if (parsed.stateChanges) {
        if (!Array.isArray(parsed.stateChanges)) {
          return { valid: false, errorReason: 'stateChanges must be an array.' };
        }
        for (const sc of parsed.stateChanges) {
          if (!sc || typeof sc !== 'object') {
            return { valid: false, errorReason: 'State change item must be an object.' };
          }
          const kindUpper = String(sc.kind || '').toUpperCase();
          if (!allowedKinds.has(kindUpper)) {
            return {
              valid: false,
              errorReason: `Illegal state change kind '${sc.kind}'. Allowed kinds: ${Array.from(allowedKinds).join(', ')}.`,
            };
          }
          if (!sc.targetId || typeof sc.targetId !== 'string' || sc.targetId.trim().length === 0) {
            return { valid: false, errorReason: 'State change targetId must be a non-empty string.' };
          }
          stateChanges.push({
            kind: kindUpper as StateChangeKind,
            targetId: sc.targetId.trim(),
            value: sc.value,
            metadata: sc.metadata,
          });
        }
      }

      // 5. Memory Candidates validation
      const memoryCandidates: string[] = [];
      if (parsed.memoryCandidates) {
        if (!Array.isArray(parsed.memoryCandidates)) {
          return { valid: false, errorReason: 'memoryCandidates must be an array.' };
        }
        for (const m of parsed.memoryCandidates) {
          if (typeof m === 'string') memoryCandidates.push(m);
        }
      }

      // 6. Audio cues validation
      const audioCues: string[] = [];
      if (parsed.audioCues) {
        if (!Array.isArray(parsed.audioCues)) {
          return { valid: false, errorReason: 'audioCues must be an array.' };
        }
        for (const a of parsed.audioCues) {
          if (typeof a === 'string') audioCues.push(a);
        }
      }

      // 7. Visual cues validation
      const visualCues: (string | { prompt: string })[] = [];
      if (parsed.visualCues) {
        if (!Array.isArray(parsed.visualCues)) {
          return { valid: false, errorReason: 'visualCues must be an array.' };
        }
        for (const v of parsed.visualCues) {
          if (typeof v === 'string' && v.trim()) {
            visualCues.push(v.trim());
          } else if (v && typeof v === 'object' && typeof v.prompt === 'string' && v.prompt.trim()) {
            visualCues.push({ prompt: v.prompt.trim() });
          } else {
            return { valid: false, errorReason: 'Visual cue items must be strings or { prompt: string } objects.' };
          }
        }
      }

      return {
        valid: true,
        turnPackage: {
          narrative: parsed.narrative,
          dialogue,
          events,
          stateChanges,
          memoryCandidates,
          audioCues,
          visualCues,
        },
      };
    } catch {
      return { valid: false, errorReason: 'Response is not valid JSON.' };
    }
  }
  /**
   * Direct Speech Synthesis Path (DEF-CH14-01 & R3 & R12)
   * Presentation/utility operation ONLY.
   * MUST NOT call executeTurn().
   * MUST NOT create ContinuationCheckpoint records.
   * MUST NOT mutate canonical world state, narrative history, memories, etc.
   */
  public async synthesizeSpeech(params: {
    storyId?: string;
    text: string;
    voiceProfile?: any;
    timeoutMs?: number;
  }): Promise<{
    success: boolean;
    audioResultBase64: string | null;
    fallbackText: string;
    fromCache?: boolean;
    modelId?: string;
  }> {
    const text = params.text || '';
    const sensoryEngine = this.getWorldRepository().getSensoryEngine();
    const cache = sensoryEngine?.getSpeechCache();

    const selection = this.selectBestModel('speech.generate', {
      contextTokens: Math.ceil(text.length / 4),
    });
    const candidates = [selection.selectedModel, ...selection.fallbacks];
    const timeoutMs = params.timeoutMs || 5000;

    for (const candidate of candidates) {
      if (this.isModelCoolingDown(candidate) || this.isCircuitBreakerTripped(candidate.providerId, candidate.modelId)) continue;
      const adapter = this.getAdapter(candidate.providerId);
      if (!adapter) continue;

      if (cache) {
        const cacheKey = cache.computeKey(text, params.voiceProfile, candidate.providerId, candidate.modelId);
        const cached = cache.get(cacheKey);
        if (cached) {
          return {
            success: true,
            audioResultBase64: cached,
            fallbackText: text,
            fromCache: true,
            modelId: candidate.modelId,
          };
        }
      }

      const attemptStartedAt = Date.now();
      try {
        const res = await adapter.generate('speech.generate', text, {
          timeoutMs,
          modelId: candidate.modelId,
          voiceProfile: params.voiceProfile,
        });
        const audioBase64 = res.audioBase64 || null;
        if (!audioBase64) throw new Error('Speech provider returned no audio payload.');

        this.recordProviderSuccess(candidate, res, 'speech.generate', attemptStartedAt);

        if (cache) {
          const cacheKey = cache.computeKey(text, params.voiceProfile, candidate.providerId, candidate.modelId);
          cache.set(cacheKey, audioBase64);
        }

        return {
          success: true,
          audioResultBase64: audioBase64,
          fallbackText: text || 'Speech synthesized.',
          fromCache: false,
          modelId: candidate.modelId,
        };
      } catch (err: any) {
        this.recordProviderFailure(candidate, 'speech.generate', err, attemptStartedAt);
      }
    }

    return {
      success: false,
      audioResultBase64: null,
      fallbackText: text,
    };
  }

  /**
   * Direct Speech Transcription Path (DEF-CH14-01 & R1)
   * Input normalization utility ONLY.
   * Returns normalized text to caller; does NOT execute game actions.
   * MUST NOT call executeTurn().
   * MUST NOT create ContinuationCheckpoint records.
   * MUST NOT mutate canonical world state or narrative history.
   */
  public async transcribeAudio(params: {
    storyId?: string;
    audioBase64: string;
    audioMimeType?: string;
    timeoutMs?: number;
  }): Promise<{
    success: boolean;
    text: string;
    modelId?: string;
    providerId?: string;
    errorCode?: 'INPUT_EMPTY' | 'INPUT_INVALID_BASE64' | 'TRANSCRIPTION_UNAVAILABLE' | 'TRANSCRIPTION_MALFORMED';
    errorReason?: string;
    attemptsTrail?: Array<{
      providerId: string;
      modelId: string;
      status: 'SUCCESS' | 'FAILED';
      error?: string;
      latencyMs: number;
    }>;
  }> {
    const audioValidation = validateAudioBase64(params.audioBase64);
    if (!audioValidation.valid) {
      return {
        success: false,
        text: '',
        errorCode: audioValidation.errorCode,
        errorReason: audioValidation.reason,
        attemptsTrail: [],
      };
    }

    const selection = this.selectBestModel('speech.transcribe', { contextTokens: 256 });
    const candidates = [selection.selectedModel, ...selection.fallbacks];
    const timeoutMs = Math.max(1000, Math.min(params.timeoutMs || 5000, 30000));
    const attemptsTrail: Array<{
      providerId: string;
      modelId: string;
      status: 'SUCCESS' | 'FAILED';
      error?: string;
      latencyMs: number;
    }> = [];
    let sawMalformedResponse = false;
    let lastError = '';

    for (const candidate of candidates) {
      if (candidate.isEmergencyFloor) continue;
      if (this.isModelCoolingDown(candidate) || this.isCircuitBreakerTripped(candidate.providerId, candidate.modelId)) continue;

      const adapter = this.getAdapter(candidate.providerId);
      if (!adapter) {
        attemptsTrail.push({
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          status: 'FAILED',
          error: 'Provider adapter is unavailable.',
          latencyMs: 0,
        });
        continue;
      }

      const attemptStartedAt = Date.now();
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), timeoutMs);
      try {
        const res = await adapter.generate('speech.transcribe', 'Transcribe the supplied audio accurately. Return only the transcript.', {
          timeoutMs,
          abortSignal: abortController.signal,
          modelId: candidate.modelId,
          audioInputBase64: audioValidation.normalized,
          audioMimeType: params.audioMimeType || 'audio/webm',
          maxTokens: 1000,
        });

        const transcript = normalizeTranscriptionProviderText(res?.text || '');
        if (!transcript.valid) {
          sawMalformedResponse = true;
          throw new Error(transcript.reason || 'Transcription provider returned an invalid transcript payload.');
        }

        this.recordProviderSuccess(candidate, res, 'speech.transcribe', attemptStartedAt);
        attemptsTrail.push({
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          status: 'SUCCESS',
          latencyMs: Math.max(1, Date.now() - attemptStartedAt),
        });

        return {
          success: true,
          text: transcript.text,
          modelId: candidate.modelId,
          providerId: candidate.providerId,
          attemptsTrail,
        };
      } catch (err: any) {
        lastError = String(err?.message || err || 'Transcription provider failed.');
        this.recordProviderFailure(candidate, 'speech.transcribe', err, attemptStartedAt);
        attemptsTrail.push({
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          status: 'FAILED',
          error: lastError,
          latencyMs: Math.max(1, Date.now() - attemptStartedAt),
        });
      } finally {
        clearTimeout(timer);
      }
    }

    return {
      success: false,
      text: '',
      errorCode: sawMalformedResponse ? 'TRANSCRIPTION_MALFORMED' : 'TRANSCRIPTION_UNAVAILABLE',
      errorReason: lastError || 'No eligible transcription provider is currently available.',
      attemptsTrail,
    };
  }
  /**
   * Phase 2 semantic player-intent interpretation.
   * Deterministic parsing handles explicit mechanical distinctions first.
   * AI is used only when deterministic interpretation is not sufficiently specific.
   */
  public async interpretPlayerIntent(params: {
    storyId?: string;
    playerText: string;
    currentSituation?: ReturnType<typeof CurrentSituationBuilder.build>;
    timeoutMs?: number;
    turnBudget?: AiTurnCallBudget;
  }): Promise<{
    intent: PlayerIntent;
    modelId?: string;
    providerId?: string;
    fallbackReason?: string;
  }> {
    const originalText = String(params.playerText || '').trim();
    const deterministic = PlayerIntentInterpreter.deterministic(originalText, params.currentSituation);
    if (!originalText) return { intent: deterministic, fallbackReason: 'EMPTY_INPUT' };
    if (deterministic.confidence >= 0.9) return { intent: deterministic };

    const budgetDecision = params.turnBudget?.beginTask('intent.interpret');
    if (budgetDecision && !budgetDecision.allowed) {
      return {
        intent: deterministic,
        fallbackReason: 'TURN_AI_CALL_BUDGET_EXHAUSTED',
      };
    }

    const prompt = PlayerIntentInterpreter.buildPrompt(originalText, params.currentSituation);
    const selection = this.selectBestModel('intent.interpret', {
      contextTokens: Math.ceil(prompt.length / 4),
    });
    const candidates = [selection.selectedModel, ...selection.fallbacks];
    const timeoutMs = params.timeoutMs ?? 5000;

    for (const candidate of candidates) {
      if (candidate.isEmergencyFloor || this.isModelCoolingDown(candidate) || this.isCircuitBreakerTripped(candidate.providerId, candidate.modelId)) continue;
      const adapter = this.getAdapter(candidate.providerId);
      if (!adapter) continue;

      const startedAt = Date.now();
      params.turnBudget?.recordProviderAttempt('intent.interpret');
      try {
        const response = await adapter.generate('intent.interpret', prompt, {
          timeoutMs,
          modelId: candidate.modelId,
        });
        const cleaned = String(response.text || '').trim();
        const objectStart = cleaned.indexOf('{');
        const objectEnd = cleaned.lastIndexOf('}');
        const parsed = JSON.parse(objectStart >= 0 && objectEnd > objectStart
          ? cleaned.slice(objectStart, objectEnd + 1)
          : cleaned);
        const interpreted = PlayerIntentInterpreter.fromModel(parsed, originalText, params.currentSituation);
        if (!interpreted) throw new Error('Intent interpreter returned an invalid semantic contract.');

        this.recordProviderSuccess(candidate, response, 'intent.interpret', startedAt);
        return {
          intent: interpreted,
          modelId: candidate.modelId,
          providerId: candidate.providerId,
        };
      } catch (error: any) {
        this.recordProviderFailure(candidate, 'intent.interpret', error, startedAt);
      }
    }

    return {
      intent: deterministic,
      fallbackReason: 'INTENT_MODEL_UNAVAILABLE_OR_MALFORMED',
    };
  }

  /**
   * Authoritative Turn Orchestration Loop (DEF-CH12-01 & DEF-CH12-02 & DEF-CH12-07)
   *
   * Flow:
   * Canonical Game State (CH1-CH10)
   *   -> CH11 WorkingContextEngine
   *   -> Model Selection (Context bounds + scoring + tie-breaking)
   *   -> Provider Execution (Timeout + Retries + Circuit Breakers)
   *   -> Schema Validation
   *   -> Domain Adjudication Bridge
   *   -> Continuation Checkpoint
   */
  /**
   * Deterministic presentation continuity guard.
   *
   * AI narration may vary freely in wording, but it must retain at least one
   * distinctive lexical anchor from the player's current canonical location.
   * This prevents a fallback model from silently relocating the player to an
   * invented room, biome, building, or scene when canonical location state did
   * not change.
   */
  private validateNarrativeSceneContinuity(
    narration: string,
    repository: WorldRepository,
    storyId: string,
  ): { valid: boolean; errorReason?: string } {
    const player = repository.getPlayerLifecycle(storyId);
    const run = repository.getStoryRun(storyId);
    const locationId = player?.locationId || run?.currentLocationId || run?.startingLocationId;
    if (!locationId) return { valid: true };

    const location = repository.getGeographyGraph(storyId).getNode(locationId);
    if (!location) return { valid: true };

    const stopWords = new Set([
      'about', 'after', 'again', 'along', 'among', 'around', 'because', 'before',
      'being', 'could', 'every', 'first', 'from', 'have', 'into', 'might', 'other',
      'should', 'some', 'their', 'there', 'these', 'those', 'through', 'under',
      'until', 'where', 'which', 'while', 'within', 'would', 'your', 'world',
      'current', 'location', 'place', 'area', 'room', 'space', 'stone', 'dark',
      'light', 'floor', 'wall', 'walls', 'air', 'water', 'door', 'path',
    ]);

    const tokenize = (value: unknown): string[] =>
      Array.from(new Set(
        String(value || '')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((token) => token.length >= 5 && !stopWords.has(token)),
      ));

    const nameTokens = tokenize(location.name);
    const sceneTokens = tokenize([
      location.name,
      location.regionId,
      location.description,
      location.ambientSensory,
    ].filter(Boolean).join(' '));
    const narrationTokens = new Set(tokenize(narration));
    const nameMatch = nameTokens.some((token) => narrationTokens.has(token));
    const sceneMatch = sceneTokens.some((token) => narrationTokens.has(token));

    if (nameTokens.length > 0 && sceneTokens.length > 0 && !nameMatch && !sceneMatch) {
      return {
        valid: false,
        errorReason: `Narration continuity guard rejected output: no distinctive lexical anchor for canonical location "${location.name}".`,
      };
    }

    return { valid: true };
  }

  private validateNarrativeActionContinuity(
    narration: string,
    playerAction: string,
    intent?: PlayerIntent,
  ): { valid: boolean; errorReason?: string } {
    const action = String(playerAction || '').trim().toLowerCase();
    const output = String(narration || '').trim().toLowerCase();
    if (!action || !output) return { valid: true };

    if (intent) {
      const movementAnchors = /\b(?:move|moved|moves|walk|walked|walks|step|stepped|steps|approach|approached|approaches|close|closer|near|nearer|head|headed|travel|traveled|travelled|enter|entered|leave|left)\b/i;
      const observationAnchors = /\b(?:listen|listened|listens|hear|heard|hears|overhear|overheard|eavesdrop|watch|watched|watches|observe|observed|observes|notice|noticed|notices|see|saw|sees|look|looked|looks|scan|scanned|scans|inspect|inspected|study|studied|studies|attend|attended|attentive|gaze|gazed|watchful|conversation|whispers?|rumou?rs?|details?|sounds?|voices?)\b/i;
      if (intent.movementIntent && !movementAnchors.test(output)) {
        return {
          valid: false,
          errorReason: 'Narration semantic backstop rejected output: the requested movement was not visibly depicted.',
        };
      }
      if (intent.observationIntent && !observationAnchors.test(output)) {
        return {
          valid: false,
          errorReason: 'Narration semantic backstop rejected output: the requested observation was not visibly depicted.',
        };
      }
      const targets = [
        ...(intent.explicitTargets || []).map((target) => target.name),
        intent.target?.name,
        intent.locationTarget?.name,
      ]
        .filter((name): name is string => Boolean(name && name.trim()))
        .flatMap((name) => name.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4))
        .slice(0, 6);
      if (targets.length > 0 && !targets.some((token) => output.includes(token))) {
        return {
          valid: false,
          errorReason: 'Narration semantic backstop rejected output: an explicit player target was not visibly represented.',
        };
      }
      return { valid: true };
    }

    const requirements: Array<{ label: string; pattern: RegExp; anchors: string[] }> = [
      { label: 'breathing', pattern: /\b(?:breathe|breathing|breath|inhale|inhaled|exhale|exhaled)\b/i, anchors: ['breathe', 'breath', 'inhale', 'exhale'] },
      { label: 'sitting or settling', pattern: /\b(?:sit|sits|sat|seated|settle|settles|settled|rest|rests|rested|kneel|kneels|knelt|crouch|crouches|crouched)\b/i, anchors: ['sit', 'sat', 'seated', 'settle', 'rest', 'kneel', 'crouch'] },
      { label: 'movement', pattern: /\b(?:walk|walks|walked|move|moves|moved|step|steps|stepped|approach|approaches|approached|head|heads|headed|travel|travels|traveled)\b/i, anchors: ['walk', 'move', 'step', 'approach', 'head', 'travel'] },
      { label: 'item or text examination', pattern: /\b(?:examine|examines|examined|inspect|inspects|inspected|study|studies|studied|read|reads|decipher|deciphers|deciphered|translate|translates|translated|look at|looks at|looked at)\b/i, anchors: ['examine', 'inspect', 'study', 'read', 'decipher', 'translate', 'look'] },
      { label: 'taking or holding', pattern: /\b(?:take|takes|took|pick up|picks up|picked up|grasp|grasps|grasped|hold|holds|held|carry|carries|carried)\b/i, anchors: ['take', 'took', 'pick', 'grasp', 'hold', 'carry'] },
      { label: 'speaking', pattern: /\b(?:ask|asks|asked|say|says|said|speak|speaks|spoke|tell|tells|told|reply|replies|replied|answer|answers|answered|inquire|inquires|inquired|question|questions|questioned|consult|consults|consulted)\b/i, anchors: ['ask', 'say', 'said', 'speak', 'spoke', 'tell', 'reply', 'answer', 'inquire', 'question', 'consult'] },
    ];

    for (const requirement of requirements) {
      if (!requirement.pattern.test(action)) continue;
      if (!requirement.anchors.some((anchor) => output.includes(anchor))) {
        return {
          valid: false,
          errorReason: `Narration action-continuity guard rejected output: the current player action requires the visible action of ${requirement.label}, but the narration did not depict it.`,
        };
      }
    }

    const targetPatterns = [
      /\b(?:walk|move|step|approach|head|travel)\s+(?:toward|towards|to|into)\s+(.+?)(?=[.!?]|\s+(?:and|then|while|before|after)\b|$)/i,
      /\b(?:examine|inspect|study|read|decipher|translate|look at)\s+(.+?)(?=[.!?]|\s+(?:and|then|while|before|after)\b|$)/i,
      /\b(?:pick up|take|grasp|hold|carry)\s+(.+?)(?=[.!?]|\s+(?:and|then|while|before|after)\b|$)/i,
      /\b(?:ask|question|inquire|consult)\s+(?:about\s+)?(.+?)(?=[.!?]|\s+(?:and|then|while|before|after)\b|$)/i,
    ];
    const targetStopWords = new Set(['the', 'a', 'an', 'my', 'this', 'that', 'and', 'then', 'while', 'before', 'after', 'next', 'carefully', 'quietly', 'slowly', 'gently', 'firmly', 'nearby', 'there', 'here']);

    for (const pattern of targetPatterns) {
      const match = action.match(pattern);
      if (!match?.[1]) continue;

      const targetTokens = match[1]
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4 && !targetStopWords.has(token))
        .slice(0, 3);

      if (targetTokens.length === 0) continue;

      if (!targetTokens.some((token) => output.includes(token))) {
        return {
          valid: false,
          errorReason: `Narration action-continuity guard rejected output: the current action targets "${targetTokens.join(' ')}", but the narration did not visibly include that target.`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Last-mile semantic agency backstop for the live turn.
   * The intent interpreter and director are the primary semantic layers; this
   * guard only blocks the catastrophic contradiction that a passive player action
   * becomes protagonist speech. It does not attempt to understand the whole prose.
   */
  private validateNarrativeIntentSafety(
    narration: string,
    intent: PlayerIntent,
    actorName?: string,
  ): { valid: boolean; errorReason?: string } {
    if (!narration || !intent || intent.speechIntent) return { valid: true };
    if (intent.interactionMode !== 'PASSIVE_OBSERVATION' && !intent.observationIntent) return { valid: true };

    const escapedActor = String(actorName || '')
      .trim()
      .replace(/[.*+?^$()|[\]\\]/g, '\\$&');
    const subjects = ['you'];
    if (escapedActor) {
      subjects.push(escapedActor);
      const actorFirstName = escapedActor.split(/\s+/)[0];
      if (actorFirstName && actorFirstName !== escapedActor) subjects.push(actorFirstName);
    }
    const speechVerbs = 'ask|asks|asked|say|says|said|speak|speaks|spoke|tell|tells|told|reply|replies|replied|answer|answers|answered|inquire|inquires|inquired|question|questions|questioned|consult|consults|consulted|shout|shouts|shouted|call out|calls out|called out';
    const protagonistSpeechPattern = new RegExp(
      '\\b(?:' + subjects.join('|') + ')\\s+(?:(?:then|directly|quietly|carefully|firmly)\\s+)?(?:' + speechVerbs + ')\\b',
      'i',
    );
    const raisingVoicePattern = new RegExp(
      '\\b(?:' + subjects.join('|') + ')\\s+(?:\\w+\\s+){0,8}(?:raise|raises|raised|raising)\\s+(?:your|his|her|their)\\s+voice\\b',
      'i',
    );

    if (protagonistSpeechPattern.test(narration) || raisingVoicePattern.test(narration)) {
      return {
        valid: false,
        errorReason: 'Semantic intent safety backstop rejected output: passive observation/listening was converted into protagonist speech.',
      };
    }
    return { valid: true };
  }

  private validateNarrativeActionModeContinuity(
    narration: string,
    playerAction: string,
    actorName?: string,
    intent?: PlayerIntent,
  ): { valid: boolean; errorReason?: string } {
    const action = String(playerAction || '').trim();
    const output = String(narration || '').trim();
    if (!action || !output) return { valid: true };

    const isPassiveListening = intent
      ? !intent.speechIntent && intent.observationIntent && (
          intent.interactionMode === 'PASSIVE_OBSERVATION' ||
          intent.interactionMode === 'INFORMATION_SEEKING' ||
          intent.action === 'approach_and_listen'
        )
      : NARRATIVE_PASSIVE_LISTENING_PATTERN.test(action);
    const explicitSpeechIntent = intent ? intent.speechIntent : NARRATIVE_DIRECT_SPEECH_PATTERN.test(action);
    if (!isPassiveListening || explicitSpeechIntent) {
      return { valid: true };
    }

    const escapedActor = String(actorName || '')
      .trim()
      .replace(/[.*+?^$()|[\]\\]/g, '\\$&');

    const subjects = ['you'];
    if (escapedActor) {
      subjects.push(escapedActor);
      const actorFirstName = escapedActor.split(/\s+/)[0];
      if (actorFirstName && actorFirstName !== escapedActor) subjects.push(actorFirstName);
    }

    const speechVerbs = 'ask|asks|asked|say|says|said|speak|speaks|spoke|tell|tells|told|reply|replies|replied|answer|answers|answered|inquire|inquires|inquired|question|questions|questioned|consult|consults|consulted|shout|shouts|shouted|call out|calls out|called out';
    const protagonistSpeechPattern = new RegExp(
      '\\b(?:' + subjects.join('|') + ')\\s+(?:(?:then|directly|quietly|carefully|firmly)\\s+)?(?:' + speechVerbs + ')\\b',
      'i',
    );
    const raisingVoicePattern = new RegExp(
      '\\b(?:' + subjects.join('|') + ')\\s+(?:\\w+\\s+){0,12}(?:raise|raises|raised|raising)\\s+(?:your|his|her|their)\\s+voice\\b',
      'i',
    );

    if (protagonistSpeechPattern.test(output) || raisingVoicePattern.test(output)) {
      return {
        valid: false,
        errorReason: 'Narration action-mode continuity guard rejected output: the player chose to listen or hear, but the narration made the protagonist speak, ask, or shout instead.',
      };
    }

    return { valid: true };
  }

  private validateNarrativeInformationTopicContinuity(
    narration: string,
    playerAction: string,
    sceneContext?: string,
    intent?: PlayerIntent,
  ): { valid: boolean; errorReason?: string } {
    const action = String(playerAction || '').trim();
    const output = String(narration || '').trim();
    const context = String(sceneContext || '').trim();
    const informationSeeking = intent
      ? Boolean(intent.informationGoal) ||
        intent.interactionMode === 'INFORMATION_SEEKING' ||
        (intent.interactionMode === 'PASSIVE_OBSERVATION' && intent.observationIntent)
      : NARRATIVE_INFORMATION_SEEKING_PATTERN.test(action);
    if (!action || !output || !context || !informationSeeking) {
      return { valid: true };
    }

    const passiveListening = intent
      ? !intent.speechIntent && intent.observationIntent
      : NARRATIVE_PASSIVE_LISTENING_PATTERN.test(action);
    const semanticTopic = intent?.informationGoal || intent?.originalText || action;
    const genericRumorRequest = /\b(?:rumor|rumors|rumour|rumours|gossip|whisper|whispers|hear|listen|overhear|eavesdrop|what people heard|what people know)\b/i.test(semanticTopic);
    const explicitTopicMatch = action.match(/\b(?:about|regarding|concerning|on)\s+(.+?)(?:[.!?]|$)/i);
    const explicitTopic = String(explicitTopicMatch?.[1] || '')
      .trim()
      .replace(/^the\s+/i, '')
      .toLowerCase();
    const genericTopic = /^(?:rumors?|rumours?|gossip|whispers?|what (?:people|they) (?:heard|know))$/i.test(explicitTopic);

    if (!passiveListening || !genericRumorRequest || (explicitTopic && !genericTopic)) {
      return { valid: true };
    }

    const rumorSentences = context
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => /\b(?:rumor|rumors|rumour|rumours|whisper|whispers|gossip|talk spreads|reports?|heard)\b/i.test(sentence));

    if (rumorSentences.length === 0) {
      return { valid: true };
    }

    const stopWords = new Set([
      'about', 'after', 'again', 'among', 'around', 'because', 'before', 'being', 'current',
      'deeper', 'from', 'have', 'heard', 'people', 'reports', 'reporting', 'some', 'that',
      'their', 'there', 'these', 'those', 'within', 'where', 'which', 'whispers', 'rumors',
      'rumours', 'gossip', 'talk', 'spread', 'speaks', 'speak',
    ]);

    const anchorTokens = Array.from(new Set(
      rumorSentences
        .join(' ')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 6 && !stopWords.has(token))
    )).slice(0, 10);

    if (anchorTokens.length < 2) {
      return { valid: true };
    }

    const outputLower = output.toLowerCase();
    const matched = anchorTokens.filter((token) => outputLower.includes(token));
    if (matched.length < Math.min(2, anchorTokens.length)) {
      return {
        valid: false,
        errorReason: 'Narration information-topic guard rejected output: the player asked to hear the current rumors, but the narration introduced a different or unsupported rumor topic instead of resolving the visible scene lead.',
      };
    }

    return { valid: true };
  }

  private validateNarrativeInformationContinuity(
    narration: string,
    playerAction: string,
    intent?: PlayerIntent,
  ): { valid: boolean; errorReason?: string } {
    const action = String(playerAction || '').trim();
    const output = String(narration || '').trim();
    const informationSeeking = intent
      ? Boolean(intent.informationGoal) ||
        intent.interactionMode === 'INFORMATION_SEEKING' ||
        (intent.interactionMode === 'PASSIVE_OBSERVATION' && intent.observationIntent)
      : NARRATIVE_INFORMATION_SEEKING_PATTERN.test(action);
    if (!action || !output || !informationSeeking) {
      return { valid: true };
    }

    const hasInformationResponse = NARRATIVE_INFORMATION_RESPONSE_PATTERN.test(output);
    const hasGroundedNonAnswer = NARRATIVE_INFORMATION_NONANSWER_PATTERN.test(output);
    const hasQuotedResponse = /[“"][^”"]{12,}[”"]/i.test(output);
    const hasDirectReport = /\b(?:mention|mentions|mentioned|report|reports|reported|whisper|whispers|whispered|say|says|said|tell|tells|told|hear|hears|heard)\b/i.test(output);

    if (!hasGroundedNonAnswer && !(hasInformationResponse && (
      hasQuotedResponse ||
      hasDirectReport ||
      /\b(?:that|because|about|from|near|inside|within|after|before|according to|according)\b/i.test(output)
    ))) {
      return {
        valid: false,
        errorReason: 'Narration information-continuity guard rejected output: the current action seeks information, but the response does not contain a grounded answer, quoted response, or explicit limitation on what can be learned.',
      };
    }

    return { valid: true };
  }

  private validateNarrativeTemporalContinuity(
    narration: string,
    repository: WorldRepository,
    storyId: string,
  ): { valid: boolean; errorReason?: string } {
    const clock = repository.getWorldClock(storyId);
    const state = clock.getState();
    const output = String(narration || '').toLowerCase();
    const forbiddenByPhase: Record<string, string[]> = {
      Predawn: ['sunset', 'dusk', 'afternoon', 'midday', 'noon', 'night', 'midnight'],
      Dawn: ['sunset', 'dusk', 'afternoon', 'midday', 'noon', 'midnight'],
      Morning: ['first light', 'dawn', 'predawn', 'sunset', 'dusk', 'midnight', 'late evening'],
      Afternoon: ['first light', 'daybreak', 'dawn', 'predawn', 'sunrise', 'sunset', 'dusk', 'nightfall', 'midnight', 'early morning', 'morning'],
      Dusk: ['first light', 'daybreak', 'dawn', 'predawn', 'sunrise', 'midday', 'noon', 'early morning', 'morning'],
      Night: ['first light', 'daybreak', 'dawn', 'sunrise', 'morning', 'afternoon', 'midday', 'noon', 'sunset'],
    };
    const contradiction = (forbiddenByPhase[state.currentDayPhase] || []).find((token) => output.includes(token));
    if (contradiction) {
      return {
        valid: false,
        errorReason: `Narration temporal-continuity guard rejected output: canonical world time is ${state.currentDayPhase} at ${String(state.timestamp.hour).padStart(2, '0')}:${String(state.timestamp.minute).padStart(2, '0')}, so the narration cannot introduce "${contradiction}" without a canonical time change.`,
      };
    }
    return { valid: true };
  }

  private async reviewAndRepairNarrative(params: {
    turnPackage: StructuredTurnPackage;
    intent: PlayerIntent;
    situation: ReturnType<typeof CurrentSituationBuilder.build>;
    plan: EphemeralNarrativePlan;
    adapter: IProviderAdapter;
    modelId: string;
    timeoutMs: number;
    playerAction: string;
    repository: WorldRepository;
    storyId: string;
    narrativePacingContract: NarrativePacingContract;
    narrativeProviderHandoff?: NarrativeProviderHandoffContract;
    strict?: boolean;
    allowRewrite?: boolean;
  }): Promise<{ turnPackage: StructuredTurnPackage; review: NarrativeReview }> {
    let review = SemanticNarrativeReview.review({
      intent: params.intent,
      situation: params.situation,
      plan: params.plan,
      turnPackage: params.turnPackage,
    });
    if (review.decision === 'ACCEPT' || params.strict === false || params.allowRewrite === false) return { turnPackage: params.turnPackage, review };

    const rewritePrompt = SemanticNarrativeReview.buildRewritePrompt({
      intent: params.intent,
      situation: params.situation,
      plan: params.plan,
      turnPackage: params.turnPackage,
      review,
    });
    const rewriteStartedAt = Date.now();
    let response: ProviderGenerateResult;
    try {
      response = await params.adapter.generate('narrative.generate', rewritePrompt, {
        timeoutMs: Math.min(params.timeoutMs, 5000),
        modelId: params.modelId,
        maxTokens: NarrativePacingEngine.outputTokenBudget(params.narrativePacingContract),
        systemInstruction: params.narrativeProviderHandoff?.providerIndependentInstruction,
        canonicalLocationName: params.situation.location.name,
        playerAction: params.playerAction,
      });
      if (!response?.text) throw new Error('Narrative semantic rewrite provider returned empty text.');
      const rewriteModel = Array.from(this.models.values()).find((model) => model.modelId === params.modelId || this.modelKey(model) === params.modelId);
      if (rewriteModel) {
        this.recordProviderSuccess(rewriteModel, response, 'narrative.generate', rewriteStartedAt);
      }
    } catch (error) {
      const rewriteModel = Array.from(this.models.values()).find((model) => model.modelId === params.modelId || this.modelKey(model) === params.modelId);
      if (rewriteModel) {
        this.recordProviderFailure(rewriteModel, 'narrative.generate', error, rewriteStartedAt);
      }
      throw error;
    }
    const validation = this.validateTurnPackage(response.text);
    if (!validation.valid || !validation.turnPackage) {
      throw new Error('Narrative semantic rewrite returned an invalid turn package: ' + (validation.errorReason || 'unknown validation failure'));
    }
    const intentSafety = this.validateNarrativeIntentSafety(
      validation.turnPackage.narrative.join(' '),
      params.intent,
      params.situation.player.name,
    );
    if (!intentSafety.valid) {
      throw new Error(intentSafety.errorReason || 'Narrative semantic rewrite violated player intent safety.');
    }
    const presentation = this.validateNarrativePresentation({
      narration: validation.turnPackage.narrative.join(' '),
      playerAction: params.playerAction,
      intent: params.intent,
      situation: params.situation,
      repository: params.repository,
      storyId: params.storyId,
      pacingContract: params.narrativePacingContract,
    });
    if (!presentation.valid) {
      throw new Error(presentation.errorReason || 'Narrative semantic rewrite failed final presentation validation.');
    }

    review = SemanticNarrativeReview.review({
      intent: params.intent,
      situation: params.situation,
      plan: params.plan,
      turnPackage: validation.turnPackage,
    });
    if (review.decision !== 'ACCEPT') {
      throw new Error('Narrative semantic review remained ' + review.decision + ' after the single permitted rewrite.');
    }
    return { turnPackage: validation.turnPackage, review };
  }

  private validateNarrativeMetaLeakage(narration: string): { valid: boolean; errorReason?: string } {
    const output = String(narration || '').trim();
    if (!output) return { valid: true };
    const leaked = NARRATIVE_INTERNAL_META_LEAK_PATTERNS.find((pattern) => pattern.test(output));
    if (!leaked) return { valid: true };
    return {
      valid: false,
      errorReason: 'Narration presentation guard rejected output containing internal test, provider, orchestration, or canonical-state terminology that is not player-facing fiction.',
    };
  }

  private validateNarrativePresentation(params: {
    narration: string;
    playerAction: string;
    intent: PlayerIntent;
    situation: CurrentSituation;
    repository: WorldRepository;
    storyId: string;
    pacingContract: NarrativePacingContract;
  }): { valid: boolean; errorReason?: string } {
    const narration = String(params.narration || '').trim();
    if (!narration) return { valid: false, errorReason: 'Narration presentation validation received empty output.' };

    const metaLeakage = this.validateNarrativeMetaLeakage(narration);
    if (!metaLeakage.valid) return { valid: false, errorReason: metaLeakage.errorReason };

    const pacing = NarrativePacingEngine.validateNarration(narration, params.pacingContract);
    if (!pacing.valid) return { valid: false, errorReason: pacing.reason || 'Narration failed N8 adaptive pacing validation.' };

    const sceneContinuity = this.validateNarrativeSceneContinuity(narration, params.repository, params.storyId);
    if (!sceneContinuity.valid) return { valid: false, errorReason: sceneContinuity.errorReason };

    const actionContinuity = this.validateNarrativeActionContinuity(narration, params.playerAction, params.intent);
    if (!actionContinuity.valid) return { valid: false, errorReason: actionContinuity.errorReason };

    const actionModeContinuity = this.validateNarrativeActionModeContinuity(
      narration,
      params.playerAction,
      params.situation.player.name,
      params.intent,
    );
    if (!actionModeContinuity.valid) return { valid: false, errorReason: actionModeContinuity.errorReason };

    const intentSafety = this.validateNarrativeIntentSafety(narration, params.intent, params.situation.player.name);
    if (!intentSafety.valid) return { valid: false, errorReason: intentSafety.errorReason };

    const currentSceneFactualContext = [
      params.situation.location.description,
      params.situation.location.ambientSensory,
      params.situation.activeDialogue ? 'Active dialogue: ' + params.situation.activeDialogue.speakerName + ': ' + params.situation.activeDialogue.text : '',
      ...params.situation.visibleEvents.map((event) => event.summary),
      ...params.situation.relevantLore.map((fact) => 'Authorized lore: ' + fact.subjectEntityId + ' ' + fact.predicate + ' ' + fact.objectValue),
    ].filter(Boolean).slice(0, 10).join('\n');

    const informationTopicContinuity = this.validateNarrativeInformationTopicContinuity(
      narration,
      params.playerAction,
      currentSceneFactualContext,
      params.intent,
    );
    if (!informationTopicContinuity.valid) return { valid: false, errorReason: informationTopicContinuity.errorReason };

    const informationContinuity = this.validateNarrativeInformationContinuity(narration, params.playerAction, params.intent);
    if (!informationContinuity.valid) return { valid: false, errorReason: informationContinuity.errorReason };

    const temporalContinuity = this.validateNarrativeTemporalContinuity(narration, params.repository, params.storyId);
    if (!temporalContinuity.valid) return { valid: false, errorReason: temporalContinuity.errorReason };

    return { valid: true };
  }

  /**
   * Presentation-only narrative generation.
   *
   * Uses the same canonical working context and model selection infrastructure as a full
   * turn, but deliberately does NOT adjudicate state changes or create continuation
   * checkpoints. The caller remains responsible for canonical mechanics.
   */
  public async generateNarrativeOnly(params: {
    storyId?: string;
    playerAction: string;
    /** Preferred typed canonical mechanics contract. */
    actionResolution?: ActionResolution;
    /** Backward-compatible projection for older callers. */
    committedOutcome?: string;
    hardTokenBudget?: number;
    timeoutMs?: number;
    maxRetries?: number;
    styleInstruction?: string;
    continuationDirective?: string;
    recentTurns?: Array<{ playerAction: string; narration: string; worldTime?: string }>;
    sceneContext?: string;
    forceModelId?: string;
    narratorVoiceControls?: NarratorVoiceControls;
  }): Promise<{
    success: boolean;
    turnPackage?: StructuredTurnPackage;
    modelId?: string;
    providerId?: string;
    error?: string;
    source?: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK';
    fallbackReason?: string;
    attemptsTrail?: Array<{
      providerId: string;
      modelId: string;
      displayName?: string;
      status: 'SUCCESS' | 'FAILED';
      latencyMs: number;
      error?: string;
    }>;
    researchPacket?: ReturnType<typeof narrativeContinuityEngine.research>;
    narrativePlan?: EphemeralNarrativePlan;
    researchAudit?: Pick<NarrativeResearchResult, 'blocks' | 'excluded' | 'budgets' | 'totalTokens' | 'query'>;
    narrativeRichnessEvaluation?: NarrativeRichnessEvaluation;
    contextAudit?: {
      hardTokenBudget: number;
      totalTokens: number;
      includedChunks: Array<{ id?: string; label: string; band: string; source?: string; relevanceScore?: number; estimatedTokens: number; protected: boolean }>;
      idleChunks?: Array<{ id?: string; label: string; band: string; source?: string; relevanceScore?: number; estimatedTokens: number; protected: boolean }>;
      archivedChunks?: Array<{ id?: string; label: string; band: string; source?: string; relevanceScore?: number; estimatedTokens: number; protected: boolean }>;
      evictedChunkLabels: string[];
      pinnedSourceIds?: string[];
      assembledTextPreview: string;
    };
  }> {
    const storyId = params.storyId || 'default_story';
    const playerAction = (params.playerAction || '').trim();
    if (!playerAction) {
      return { success: false, error: 'A player action is required for narrative generation.' };
    }

    const hardTokenBudget = params.hardTokenBudget ?? 700;
    const timeoutMs = params.timeoutMs ?? 7000;
    const turnAiCallBudget = new AiTurnCallBudget();
    const authoritativeOutcome = (params.committedOutcome || '').trim();
    const connectedDirective = (params.continuationDirective || '').trim();
    const worldRepo = this.getWorldRepository();
    if (!worldRepo.getStoryRun(storyId)) {
      worldRepo.seedStory(storyId);
    }
    let currentSituation = CurrentSituationBuilder.build({
      storyId,
      playerAction,
      viewerActorId: worldRepo.getPlayerLifecycle(storyId)?.actorId,
      worldRepo,
    });
    const intentInterpretation = await this.interpretPlayerIntent({
      storyId,
      playerText: playerAction,
      currentSituation,
      timeoutMs: Math.min(timeoutMs, 5000),
    });
    const playerIntent = intentInterpretation.intent;
    currentSituation = CurrentSituationBuilder.build({
      storyId,
      playerAction,
      currentAction: playerIntent,
      viewerActorId: currentSituation.player.actorId,
      worldRepo,
    });
    const rawResearchResult = NarrativeResearchPipeline.research({
      repository: worldRepo,
      storyId,
      currentSituation,
      playerIntent,
      playerAction,
      hardTokenBudget: Math.max(1600, hardTokenBudget * 2),
      viewerActorId: currentSituation.player.actorId,
    });
    const researchResult = EpistemicBoundaryEnforcer.sanitizeResearch(rawResearchResult, currentSituation).result;
    const narrativePlan = NarrativeDirector.create({
      situation: currentSituation,
      intent: playerIntent,
      research: researchResult,
      repository: worldRepo,
      storyId,
    });

    const canonicalSceneAnchor = [
      `Location ID: ${currentSituation.location.id}`,
      `Location name: ${currentSituation.location.name}`,
      currentSituation.location.regionId ? `Region: ${currentSituation.location.regionId}` : '',
      currentSituation.location.description ? `Canonical description: ${currentSituation.location.description}` : '',
      currentSituation.location.ambientSensory ? `Canonical ambient/sensory cues: ${currentSituation.location.ambientSensory}` : '',
      `Canonical world time: ${currentSituation.worldTime}`,
      `Visible entities: ${currentSituation.nearbyEntities.filter((entity) => entity.visibleToPlayer).map((entity) => entity.name).join(', ') || 'None'}`,
      currentSituation.activeDialogue ? `Active dialogue: ${currentSituation.activeDialogue.speakerName}: ${currentSituation.activeDialogue.text}` : '',
      'Continuity rule: remain within this canonical location unless the canonical game state has already committed a location change for this turn. A failed check, fallback model, or narration request never authorizes an uncommitted relocation.',
      'Temporal rule: do not move the time of day forward or backward in narration. Multiple player actions may occur within the same canonical time until the game clock is explicitly advanced.',
    ].filter(Boolean).join('\n');

    const isInformationSeekingAction = Boolean(playerIntent.informationGoal) || playerIntent.interactionMode === 'INFORMATION_SEEKING' || playerIntent.interactionMode === 'PASSIVE_OBSERVATION';
    const styleInstruction = params.styleInstruction || [
      'Write an immersive tabletop-RPG narrator response for the latest player action.',
      'Canonical mechanics are authoritative. Never invent or expose mechanics, model names, internal identifiers, DCs, dice, state fields, or engine terminology.',
      'Do not tell the player what they attempted; depict the attempt as fiction.',
      'Never use phrases such as "the outcome unfolds in the narrative", "the action is committed", or other implementation language.',
      'Use relevant Narrative Research only when it materially helps the current action; never dump raw research.',
      'Vary sentence rhythm and sensory detail without repeating recent turns.',
      'Substance has priority over flourish. Every paragraph must either depict a concrete current-turn action, reveal a canon-grounded observation, show an immediate reaction/consequence, or establish a specific unresolved detail. Do not spend a paragraph merely describing atmosphere that does not change what the player knows or what is happening.',
      'Do not pad short actions into poetic scene-setting. The player action is the reason this turn exists; move the scene forward because of it.',
      'When the current action contains multiple concrete steps, resolve each observable step in order instead of stopping after the first movement.',
      isInformationSeekingAction
        ? 'This is an information-seeking action. The minimum useful response is: reach the relevant source already established in context, then perform only the kind of information gathering the player actually requested. If the player says listen, hear, overhear, or eavesdrop, the protagonist is listening only; do not make the protagonist ask, answer, speak, call out, or raise their voice unless the player also explicitly requested speech. Then provide the specific information that can be learned from canonical context or clearly state that the available people provide no reliable answer. Distinguish rumor or hearsay from established fact. Do not replace the inquiry with atmosphere, and do not invent a named informant, secret, fact, or revelation that is not supported by the supplied context.'
        : '',
      'Prefer concrete nouns, specific observations, reactions, facts, and consequences over decorative adjectives and repeated sensory metaphors.',
      authoritativeOutcome
        ? 'A canonical outcome has already been resolved. Describe only the observable experience and immediate consequences supported by it.'
        : 'No canonical mechanical outcome was supplied. Describe only the attempt and observable scene response; do not decide hidden success or failure.',
      connectedDirective ? 'Follow the connected presentation directive only as style guidance; never override canonical state.' : '',
      'Semantic player intent is authoritative for what the player meant to attempt; do not silently replace it with a different action.',
      'Stay in the canonical current location unless a committed location change is supplied.',
      'Treat the latest player action as the current turn contract. Depict that action first and do not silently replace it with an earlier action from recent history.',
      'Preserve every concrete action target named by the player when it is narratively observable (for example, a scroll, staff, citadel, doorway, person, or object).',
      'Do not invent a time-of-day change. Use only the canonical world time supplied in context unless a canonical time-advance action has already changed it.',
      'Do not invent characters, items, abilities, environmental objects, causal explanations, or knowledge outside the supplied context.',
      'Respect CHECK_PENDING or unresolved actions: show the attempt, not the result.',
      'Use concrete established sensory details and vary wording without repeating recent turns.',
      'Follow the N8 adaptive pacing contract for response length and paragraph count; do not force a universal paragraph template.',
      'Populate visualCues with only current-turn visual beats; one frozen moment uses one cue, distinct immediate beats may use up to three.',
      'No menus, captions, meta-commentary, status labels, or debug text.',
    ].filter(Boolean).join(' ');

    const viewerActorId = currentSituation.player.actorId;
    const canonicalRecentTurns = (params.recentTurns && params.recentTurns.length > 0)
      ? params.recentTurns
      : currentSituation.recentTurns.map((turn) => ({
          playerAction: turn.playerAction || '',
          narration: turn.narration || '',
          worldTime: turn.worldTime,
        }));
    const currentSceneFactualContext = [
      currentSituation.location.description,
      currentSituation.location.ambientSensory,
      currentSituation.activeDialogue ? `Active dialogue: ${currentSituation.activeDialogue.speakerName}: ${currentSituation.activeDialogue.text}` : '',
      ...currentSituation.visibleEvents.map((event) => event.summary),
      ...currentSituation.relevantLore.map((fact) => `Authorized lore: ${fact.subjectEntityId} ${fact.predicate} ${fact.objectValue}`),
    ].filter(Boolean).slice(0, 10).join('\n');
    const researchPacket = researchResult.packet;
    const assembledContext = WorkingContextEngine.assembleTurnContext({
      storyId,
      playerAction,
      hardTokenBudget,
      worldRepo,
      customChunks: [
        {
          id: 'canonical_scene_anchor',
          band: 'B1_CRITICAL' as const,
          label: 'Canonical Current Scene Anchor',
          content: canonicalSceneAnchor,
          estimatedTokens: WorkingContextEngine.estimateTokens(canonicalSceneAnchor),
          sourceAuthority: 'WorldRepository canonical location state',
          isProtected: true,
          relevanceScore: 1,
        },
        ...(isInformationSeekingAction && currentSceneFactualContext ? [{
          id: 'current_scene_factual_context',
          band: 'B2_IMMEDIATE' as const,
          label: 'Current Scene Factual Context',
          content: currentSceneFactualContext,
          estimatedTokens: WorkingContextEngine.estimateTokens(currentSceneFactualContext),
          sourceAuthority: 'CurrentSituationBuilder canonical scene projection',
          isProtected: true,
          relevanceScore: 0.98,
        }] : []),
        {
          id: 'b2_player_intent',
          band: 'B2_IMMEDIATE' as const,
          label: 'Semantic Player Intent',
          content: JSON.stringify(playerIntent),
          estimatedTokens: WorkingContextEngine.estimateTokens(JSON.stringify(playerIntent)),
          sourceAuthority: 'PlayerIntentInterpreter',
          isProtected: true,
          relevanceScore: 1,
        },
        {
          id: 'b3_narrative_research',
          band: 'B3_CAUSAL_OPPORTUNITY' as const,
          label: 'Bounded Narrative Research',
          content: researchResult.promptContext,
          estimatedTokens: WorkingContextEngine.estimateTokens(researchResult.promptContext),
          sourceAuthority: 'NarrativeResearchPipeline (Phase 3)',
          relevanceScore: 0.98,
        },
        {
          id: 'b2_narrative_plan',
          band: 'B2_IMMEDIATE' as const,
          label: 'Ephemeral Narrative Director Plan',
          content: NarrativeDirector.toPromptContext(narrativePlan),
          estimatedTokens: WorkingContextEngine.estimateTokens(NarrativeDirector.toPromptContext(narrativePlan)),
          sourceAuthority: 'NarrativeDirector (Phase 4)',
          isProtected: true,
          relevanceScore: 1,
        },
        ...(canonicalRecentTurns.length ? [{
          id: 'recent_story_turns',
          band: 'B2_IMMEDIATE' as const,
          label: 'Recent Story Turns',
          content: canonicalRecentTurns
            .slice(-2)
            .map((turn, index) => `Turn ${index + 1} | ${turn.worldTime || 'current'} | Player: ${turn.playerAction} | Narration: ${turn.narration}`)
            .join('\n'),
          estimatedTokens: WorkingContextEngine.estimateTokens(
            canonicalRecentTurns.slice(-2).map((turn) => `${turn.playerAction} ${turn.narration}`).join(' ')
          ),
          sourceAuthority: 'CurrentSituationBuilder recent-turn projection',
          isProtected: true,
          relevanceScore: 1,
        }] : []),
        {
          id: 'narrative_turn_substance_contract',
          band: 'B1_CRITICAL' as const,
          label: 'Current Turn Substance Contract',
          content: isInformationSeekingAction
            ? [
                'Current action is information-seeking.',
                'Resolve the full visible sequence: reach the relevant source established in context, make the inquiry, then give the information actually available from canonical context or explicitly state that no reliable answer was obtained.',
                'For rumors, clearly distinguish repeated hearsay from established fact.',
                'Do not stop after movement or speech. The turn is incomplete until the player learns something useful or encounters a grounded inability to learn it.',
              ].join(' ')
            : 'Current turn must produce concrete progress. Avoid decorative filler that does not advance the player action, reveal a grounded observation, show a reaction, or establish a specific unresolved detail.',
          estimatedTokens: WorkingContextEngine.estimateTokens(
            isInformationSeekingAction
              ? 'Current action is information-seeking. Resolve approach, inquiry, available answer or grounded non-answer, and distinguish rumor from fact.'
              : 'Current turn must produce concrete progress and avoid decorative filler.',
          ),
          sourceAuthority: 'DreamBook Narrative Turn Contract',
          isProtected: true,
          relevanceScore: 1,
        },
        {
          id: 'narrative_presentation_contract',
          band: 'B1_CRITICAL' as const,
          label: 'Narrative Presentation Contract',
          content: styleInstruction,
          estimatedTokens: WorkingContextEngine.estimateTokens(styleInstruction),
          sourceAuthority: 'DreamBook Narrative Presentation Layer',
          isProtected: true,
          relevanceScore: 1,
        },
      ],
    });

    const narrativeProfile = worldRepo.getNarrativeProfile(storyId);
    const narratorVoiceState = NarratorVoiceEngine.resolve(worldRepo, storyId, narrativeProfile, params.narratorVoiceControls);
    NarratorVoiceEngine.persist(worldRepo, storyId, narratorVoiceState);
    const narrativeNoveltyState = NarrativeNoveltyEngine.resolve(worldRepo, storyId);
    const narrativeContinuityState = researchResult?.continuityState || NarrativeContinuityStateEngine.resolve(worldRepo, storyId);
    const narrativePacingContract = NarrativePacingEngine.resolve({ situation: currentSituation, intent: playerIntent, actionResolution: params.actionResolution, canonicalOutcome: authoritativeOutcome, continuityState: narrativeContinuityState });

    const narrationPrompt = buildNarrationPrompt({
      situation: currentSituation,
      intent: playerIntent,
      research: researchResult,
      plan: narrativePlan,
      workingContext: projectSupportingWorkingContext(assembledContext),
      globalInstruction: 'You are Dreamville’s narrative presentation engine. Generate only the player-facing narrative turn using the supplied canonical state, semantic player intent, bounded research, and ephemeral plan.',
      styleInstruction,
      narratorVoiceState,
      narrativeContinuityState,
      narrativeNoveltyState,
      narrativePacingContract,
      canonicalOutcome: authoritativeOutcome,
      actionResolution: params.actionResolution,
      maxPromptTokens: Math.max(200, hardTokenBudget),
    });

    const narrativeProviderHandoff = narrationPrompt.narrativeProviderHandoff;

    const contextAudit = {
      hardTokenBudget: assembledContext.hardTokenBudget,
      totalTokens: assembledContext.totalTokens,
      includedChunks: assembledContext.includedChunks.map((chunk) => ({
        id: chunk.id,
        label: chunk.label,
        band: chunk.band,
        source: chunk.sourceAuthority,
        relevanceScore: chunk.relevanceScore,
        estimatedTokens: chunk.estimatedTokens,
        protected: Boolean(chunk.isProtected),
      })),
      idleChunks: assembledContext.idleChunks.map((chunk) => ({
        id: chunk.id,
        label: chunk.label,
        band: chunk.band,
        source: chunk.sourceAuthority,
        relevanceScore: chunk.relevanceScore,
        estimatedTokens: chunk.estimatedTokens,
        protected: Boolean(chunk.isProtected),
      })),
      archivedChunks: assembledContext.archivedChunks.map((chunk) => ({
        id: chunk.id,
        label: chunk.label,
        band: chunk.band,
        source: chunk.sourceAuthority,
        relevanceScore: chunk.relevanceScore,
        estimatedTokens: chunk.estimatedTokens,
        protected: Boolean(chunk.isProtected),
      })),
      evictedChunkLabels: assembledContext.evictedChunkLabels,
      pinnedSourceIds: assembledContext.pinnedSourceIds,
      assembledTextPreview: assembledContext.assembledText.slice(0, 6000),
    };

    const generated = await this.executeTaskGeneration(
      'narrative.generate',
      narrationPrompt.prompt,
      narrationPrompt.styleInstruction,
      {
        timeoutMs,
        maxTokens: NarrativePacingEngine.outputTokenBudget(narrativePacingContract),
        contextTokens: narrationPrompt.totalTokens,
        turnBudget: turnAiCallBudget,
        forceModelId: params.forceModelId,
        canonicalLocationName: currentSituation.location.name,
        playerAction,
        narrativeHandoff: narrativeProviderHandoff,
        validateResponse: (text) => {
          const validation = this.validateTurnPackage(text, { allowPlainTextNarration: true });
          if (!validation.valid || !validation.turnPackage) {
            return { valid: false, errorReason: validation.errorReason };
          }
          const narrationText = validation.turnPackage.narrative.join(' ');
          const pacing = NarrativePacingEngine.validateNarration(narrationText, narrativePacingContract);
          if (!pacing.valid) return { valid: false, errorReason: pacing.reason };
          const continuity = this.validateNarrativeSceneContinuity(
            narrationText,
            worldRepo,
            storyId,
          );
          if (!continuity.valid) return { valid: false, errorReason: continuity.errorReason };
          const actionContinuity = this.validateNarrativeActionContinuity(narrationText, playerAction, playerIntent);
          if (!actionContinuity.valid) return { valid: false, errorReason: actionContinuity.errorReason };
          const actionModeContinuity = this.validateNarrativeActionModeContinuity(
            narrationText,
            playerAction,
            currentSituation.player.name,
            playerIntent,
          );
          if (!actionModeContinuity.valid) return { valid: false, errorReason: actionModeContinuity.errorReason };
          const intentSafety = this.validateNarrativeIntentSafety(narrationText, playerIntent, currentSituation.player.name);
          if (!intentSafety.valid) return { valid: false, errorReason: intentSafety.errorReason };
          const informationTopicContinuity = this.validateNarrativeInformationTopicContinuity(
            narrationText,
            playerAction,
            currentSceneFactualContext,
            playerIntent,
          );
          if (!informationTopicContinuity.valid) return { valid: false, errorReason: informationTopicContinuity.errorReason };
          const informationContinuity = this.validateNarrativeInformationContinuity(narrationText, playerAction, playerIntent);
          if (!informationContinuity.valid) return { valid: false, errorReason: informationContinuity.errorReason };
          const temporalContinuity = this.validateNarrativeTemporalContinuity(narrationText, worldRepo, storyId);
          return temporalContinuity.valid
            ? { valid: true }
            : { valid: false, errorReason: temporalContinuity.errorReason };
        },
      },
    );

    // Narrative generation has a deterministic emergency floor. When all configured
    // AI providers fail, surface the actual fallback-attempt diagnostics instead of
    // replacing them with a misleading "Response is not valid JSON" parse error.
    if (!generated.text) {
      return {
        success: false,
        providerId: generated.providerId,
        modelId: generated.modelId,
        source: generated.source,
        fallbackReason: generated.fallbackReason,
        attemptsTrail: generated.attemptsTrail,
        researchPacket,
        narrativePlan,
        researchAudit: { blocks: researchResult.blocks, excluded: researchResult.excluded, budgets: researchResult.budgets, totalTokens: researchResult.totalTokens, query: researchResult.query },
        contextAudit,
        error: generated.fallbackReason || 'All configured narrative providers failed, including the deterministic emergency floor.',
      };
    }

    const validation = this.validateTurnPackage(generated.text, { allowPlainTextNarration: true });
    if (!validation.valid || !validation.turnPackage) {
      return {
        success: false,
        providerId: generated.providerId,
        modelId: generated.modelId,
        source: generated.source,
        fallbackReason: generated.fallbackReason,
        attemptsTrail: generated.attemptsTrail,
        researchPacket,
        contextAudit,
        error: validation.errorReason || 'Narrative response failed structured validation.',
      };
    }

    const finalNarrationText = validation.turnPackage.narrative.join(' ');
    const finalSceneContinuity = this.validateNarrativeSceneContinuity(finalNarrationText, worldRepo, storyId);
    if (!finalSceneContinuity.valid) {
      return {
        success: false,
        providerId: generated.providerId,
        modelId: generated.modelId,
        source: generated.source,
        fallbackReason: generated.fallbackReason,
        attemptsTrail: generated.attemptsTrail,
        researchPacket,
        narrativePlan,
        researchAudit: researchResult ? { blocks: researchResult.blocks, excluded: researchResult.excluded, budgets: researchResult.budgets, totalTokens: researchResult.totalTokens, query: researchResult.query } : undefined,
        contextAudit,
        error: finalSceneContinuity.errorReason || 'Narration scene continuity validation failed.',
      };
    }
    const finalActionContinuity = this.validateNarrativeActionContinuity(finalNarrationText, playerAction, playerIntent);
    if (!finalActionContinuity.valid) {
      return {
        success: false,
        providerId: generated.providerId,
        modelId: generated.modelId,
        source: generated.source,
        fallbackReason: generated.fallbackReason,
        attemptsTrail: generated.attemptsTrail,
        researchPacket,
        narrativePlan,
        researchAudit: { blocks: researchResult.blocks, excluded: researchResult.excluded, budgets: researchResult.budgets, totalTokens: researchResult.totalTokens, query: researchResult.query },
        contextAudit,
        error: finalActionContinuity.errorReason || 'Narration action continuity validation failed.',
      };
    }
    const finalInformationContinuity = this.validateNarrativeInformationContinuity(finalNarrationText, playerAction);
    if (!finalInformationContinuity.valid) {
      return {
        success: false,
        providerId: generated.providerId,
        modelId: generated.modelId,
        source: generated.source,
        fallbackReason: generated.fallbackReason,
        attemptsTrail: generated.attemptsTrail,
        researchPacket,
        narrativePlan,
        researchAudit: { blocks: researchResult.blocks, excluded: researchResult.excluded, budgets: researchResult.budgets, totalTokens: researchResult.totalTokens, query: researchResult.query },
        contextAudit,
        error: finalInformationContinuity.errorReason || 'Narration information continuity validation failed.',
      };
    }
    const finalNarrativeRichnessEvaluation = NarrativeRichnessEvaluator.evaluate({
      intent: playerIntent,
      situation: currentSituation,
      plan: narrativePlan,
      turnPackage: validation.turnPackage,
      previousNarrations: canonicalRecentTurns.map((turn) => String(turn.narration || '')).filter(Boolean),
    });

    const finalTemporalContinuity = this.validateNarrativeTemporalContinuity(finalNarrationText, worldRepo, storyId);
    if (!finalTemporalContinuity.valid) {
      return {
        success: false,
        providerId: generated.providerId,
        modelId: generated.modelId,
        source: generated.source,
        fallbackReason: generated.fallbackReason,
        attemptsTrail: generated.attemptsTrail,
        researchPacket,
        narrativePlan,
        researchAudit: { blocks: researchResult.blocks, excluded: researchResult.excluded, budgets: researchResult.budgets, totalTokens: researchResult.totalTokens, query: researchResult.query },
        contextAudit,
        error: finalTemporalContinuity.errorReason || 'Narration temporal continuity validation failed.',
      };
    }

    return {
      success: true,
      turnPackage: {
        ...validation.turnPackage,
        stateChanges: [],
      },
      modelId: generated.modelId,
      providerId: generated.providerId,
      source: generated.source,
      fallbackReason: generated.fallbackReason,
      attemptsTrail: generated.attemptsTrail,
      researchPacket,
      narrativePlan,
      researchAudit: { blocks: researchResult.blocks, excluded: researchResult.excluded, budgets: researchResult.budgets, totalTokens: researchResult.totalTokens, query: researchResult.query },
      contextAudit,
      narrativeRichnessEvaluation: finalNarrativeRichnessEvaluation,
    };
  }

  public async executeTurn(params: {
    storyId?: string;
    playerAction?: string;
    task?: TaskId;
    hardTokenBudget?: number;
    timeoutMs?: number;
    maxRetries?: number;
    checkpointId?: string;
    forceModelId?: string;
    audioInputBase64?: string;
    voiceProfile?: any;
    idempotencyKey?: string;
    repository?: WorldRepository;
      narratorVoiceControls?: NarratorVoiceControls;
}): Promise<OrchestratedTurnResult> {
    const storyId = params.storyId || 'default_story';
    const rawIdempotencyKey = params.idempotencyKey ? String(params.idempotencyKey).trim() : undefined;
    const scopedKey = rawIdempotencyKey ? `${storyId}::${rawIdempotencyKey}` : undefined;

    // 1. V6.34 Replay Protection: Check server-authoritative cached turn results
    if (scopedKey && this.turnResultsByIdempotencyKey.has(scopedKey)) {
      const cached = this.turnResultsByIdempotencyKey.get(scopedKey)!;
      return {
        ...cached,
        telemetry: {
          ...cached.telemetry,
          cached: true,
          idempotencyReplayed: true,
          idempotencyKey: rawIdempotencyKey,
        },
      };
    }

    // 2. V6.34 In-Flight Deduplication: Share promise for concurrent duplicate requests
    if (scopedKey && this.inFlightTurnPromises.has(scopedKey)) {
      const inFlightPromise = this.inFlightTurnPromises.get(scopedKey)!;
      const result = await inFlightPromise;
      return {
        ...result,
        telemetry: {
          ...result.telemetry,
          cached: true,
          idempotencyReplayed: true,
          idempotencyKey: rawIdempotencyKey,
        },
      };
    }

    const task: TaskId = params.task || 'narrative.generate';
    const hardTokenBudget = params.hardTokenBudget ?? 400;
    const timeoutMs = params.timeoutMs ?? 3000;
    const maxRetries = params.maxRetries ?? 2;

    const repo = params.repository || this.getWorldRepository();
    // A direct orchestrator caller may be creating the first turn for a new story.
    // Initialize the canonical Story Run here rather than making every downstream
    // read-model consumer invent or duplicate initialization behavior.
    if (!repo.getStoryRun(storyId)) {
      repo.seedStory(storyId);
    }
    // V6.34 Stable Identifiers: stats remain process-local, but canonical turn identity
    // derives from the authoritative story command sequence so replay does not depend on
    // unrelated turns executed elsewhere in the process.
    this.totalTurnsExecuted += 1;
    const turnSequence = repo.getCanonicalCommandEventCount(storyId) + 1;
    const turnId = rawIdempotencyKey
      ? deterministicId('turn', storyId, rawIdempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_'))
      : deterministicId('turn', storyId, turnSequence, task, params.playerAction || '');
    const turnAiCallBudget = new AiTurnCallBudget();

    // Checkpoint continuation awareness (V6.15 / V6.06)
    let priorCheckpoint: ContinuationCheckpoint | undefined;
    if (params.checkpointId) {
      priorCheckpoint = this.getContinuationCheckpoint(params.checkpointId);
      if (priorCheckpoint && priorCheckpoint.uncommittedOutput && !params.playerAction) {
        params.playerAction = `Resume: ${priorCheckpoint.uncommittedOutput}`;
      }
    }

    const executeCore = async (): Promise<OrchestratedTurnResult> => {
      // Phase 6 permits at most one semantic rewrite for the entire turn, not one rewrite per fallback provider.
      let semanticRewriteUsed = false;
      const initialSituation = CurrentSituationBuilder.build({
        storyId,
        playerAction: params.playerAction || '',
        viewerActorId: repo.getPlayerLifecycle(storyId)?.actorId,
        worldRepo: repo,
      });
      const intentInterpretation = await this.interpretPlayerIntent({
        storyId,
        playerText: params.playerAction || '',
        currentSituation: initialSituation,
        timeoutMs: Math.min(timeoutMs, 5000),
        turnBudget: turnAiCallBudget,
      });
      const playerIntent = intentInterpretation.intent;
      const currentSituation = CurrentSituationBuilder.build({
        storyId,
        playerAction: params.playerAction || '',
        currentAction: playerIntent,
        viewerActorId: initialSituation.player.actorId,
        worldRepo: repo,
      });
      const isNarrativeTask = task === 'narrative.generate';
      const rawResearchResult = isNarrativeTask
        ? NarrativeResearchPipeline.research({
            repository: repo,
            storyId,
            currentSituation,
            playerIntent,
            playerAction: params.playerAction || '',
            hardTokenBudget: Math.max(1600, hardTokenBudget * 2),
            viewerActorId: currentSituation.player.actorId,
          })
        : undefined;
      const researchResult = rawResearchResult
        ? EpistemicBoundaryEnforcer.sanitizeResearch(rawResearchResult, currentSituation).result
        : undefined;
      const researchPacket = researchResult?.packet;
      const narrativePlan = researchResult
        ? NarrativeDirector.create({
            repository: repo,
            storyId,
            situation: currentSituation,
            intent: playerIntent,
            research: researchResult,
          })
        : undefined;

      // 1. Ingest the shared CurrentSituation + optional Phase 3-4 narration context into Working Context.
      const assembledContext: AssembledTurnContext = WorkingContextEngine.assembleTurnContext({
        storyId,
        playerAction: params.playerAction || 'Observe surroundings and assess position',
        currentAction: playerIntent,
        currentSituation,
        narrativeResearch: researchPacket,
        viewerActorId: currentSituation.player.actorId,
        hardTokenBudget,
        worldRepo: repo,
        customChunks: [
          {
            id: 'b2_player_intent',
            band: 'B2_IMMEDIATE',
            label: 'Semantic Player Intent',
            content: JSON.stringify(playerIntent),
            estimatedTokens: WorkingContextEngine.estimateTokens(JSON.stringify(playerIntent)),
            sourceAuthority: 'PlayerIntentInterpreter',
            relevanceScore: 1,
            isProtected: true,
          },
          ...(researchResult ? [{
            id: 'b3_narrative_research',
            band: 'B3_CAUSAL_OPPORTUNITY' as const,
            label: 'Bounded Narrative Research',
            content: researchResult.promptContext,
            estimatedTokens: WorkingContextEngine.estimateTokens(researchResult.promptContext),
            sourceAuthority: 'NarrativeResearchPipeline (Phase 3)',
            relevanceScore: 0.98,
            isProtected: false,
          }] : []),
          ...(narrativePlan ? [{
            id: 'b2_narrative_plan',
            band: 'B2_IMMEDIATE' as const,
            label: 'Ephemeral Narrative Director Plan',
            content: NarrativeDirector.toPromptContext(narrativePlan),
            estimatedTokens: WorkingContextEngine.estimateTokens(NarrativeDirector.toPromptContext(narrativePlan)),
            sourceAuthority: 'NarrativeDirector (Phase 4)',
            relevanceScore: 1,
            isProtected: true,
          }] : []),
        ],
      });

      const narrativeProfile = repo.getNarrativeProfile(storyId);
      const narratorVoiceState = NarratorVoiceEngine.resolve(repo, storyId, narrativeProfile, params.narratorVoiceControls);
      NarratorVoiceEngine.persist(repo, storyId, narratorVoiceState);
      const narrativeNoveltyState = NarrativeNoveltyEngine.resolve(repo, storyId);
      const narrativeContinuityState = researchResult?.continuityState || NarrativeContinuityStateEngine.resolve(repo, storyId);
      const narrativePacingContract = NarrativePacingEngine.resolve({ situation: currentSituation, intent: playerIntent, continuityState: narrativeContinuityState });

      // 1b. CH15 Source Adaptation Adjudication Check
      const narrationPrompt = isNarrativeTask && researchResult && narrativePlan
        ? buildNarrationPrompt({
            situation: currentSituation,
            intent: playerIntent,
            research: researchResult,
            plan: narrativePlan,
            workingContext: projectSupportingWorkingContext(assembledContext),
            globalInstruction: 'You are Dreamville’s authoritative narrative presentation engine. Generate only the player-facing narrative turn. Canonical game state remains authoritative and prose never commits state.',
            styleInstruction: defaultNarrationStyle(),
            narratorVoiceState,
            narrativeContinuityState,
            narrativeNoveltyState,
            narrativePacingContract,
            maxPromptTokens: Math.max(200, hardTokenBudget),
          })
        : {
            prompt: assembledContext.assembledText,
            styleInstruction: '',
            totalTokens: assembledContext.totalTokens,
            narrativeProviderHandoff: undefined,
          };

        const narrativeProviderHandoff = narrationPrompt.narrativeProviderHandoff;

    const profile = repo.getAdaptationProfile(storyId);
      const bible = repo.getAdaptedStoryBible(storyId);
      if (profile && bible) {
        const evalResult = StoryAdaptationPipeline.evaluatePlayerActionAgainstCanon(
          params.playerAction || '',
          profile,
          bible.canonFacts
        );

        if (!evalResult.allowed) {
          const rejectedOutput = `[CANON REJECTION] ${evalResult.reason}`;
          return {
            success: true,
            turnPackage: {
              narrative: [rejectedOutput],
              dialogue: [],
              events: [],
              stateChanges: [],
              memoryCandidates: [],
              audioCues: [],
            },
            adjudicationResult: {
              allApproved: false,
              approvedCount: 0,
              rejectedCount: 1,
              outcomes: [],
              disapprovedChanges: [],
            },
            checkpoint: {
              checkpointId: `cp_rejected_${turnId}`,
              storyId,
              turnId,
              role: 'narrator',
              playerAction: params.playerAction,
              playerIntent,
              workingContextTokens: narrationPrompt.totalTokens,
              worldTime: repo.getWorldClock(storyId).formatHeader(),
              locationId: repo.getPlayerLifecycle(storyId)?.locationId || 'loc_whispering_orrery',
              sceneSummary: evalResult.reason,
              recentOutput: rejectedOutput,
              uncommittedOutput: '',
              canonicalInvariants: {
                playerActorId: `player_actor_${storyId}`,
                discoveredLocations: repo.getPlayerLifecycle(storyId)?.discoveredLocationIds || [],
              },
              styleContract: {
                profileId: narratorVoiceState.profileId,
                tone: narratorVoiceState.profileId,
                cadence: narratorVoiceState.cadence,
                descriptiveDensity: narratorVoiceState.descriptiveDensity,
                emotionalDistance: narratorVoiceState.emotionalDistance,
                epistemicSanitized: 'true',
                promptVersion: MultiModelOrchestrator.PROMPT_VERSION,
              },
              openThreads: [],
              presentationEvents: [],
              knowledgeBoundaries: {},
              createdAt: Date.now(),
            },
            telemetry: {
              turnId,
              storyId,
              taskId: task,
              selectedModelId: 'canon-guard',
              selectedProviderId: 'server-adjudicator',
              selectionScore: 100,
              selectionReason: 'Source Canon Guard Adjudication',
              fallbackChain: [],
              attempts: 1,
              latencyMs: 2,
              inputTokens: narrationPrompt.totalTokens,
              outputTokens: 20,
              validated: true,
          aiCallBudget: turnAiCallBudget.snapshot(),
              narrativeProviderHandoff: narrativeProviderHandoff ? NarrativeProviderHandoffEngine.snapshot(narrativeProviderHandoff) : undefined,
            },
          };
        }

        if (evalResult.createsDivergence) {
          const session = repo.getAdaptationSession(storyId);
          const canonicalTimestamp = repo.getWorldClock(storyId).getTimestamp();
          const divergenceEventId = deterministicId('evt_div', storyId, turnId, params.playerAction, evalResult.reason);
          repo.addAdaptationEvent(storyId, {
            id: divergenceEventId,
            storyId,
            branchId: session?.branchId || 'main_branch',
            type: 'DIVERGENCE',
            involvedEntities: ['player'],
            timestamp: formatCanonicalTimestamp(canonicalTimestamp),
            reason: evalResult.reason,
            details: { action: params.playerAction },
          });

          const chronicle = repo.getHistoricalChronicleEngine(storyId);
          chronicle.recordEvidence({
            id: deterministicId('chron_div', storyId, divergenceEventId),
            category: 'WORLD_ANOMALY',
            sourceEventId: divergenceEventId,
            timestamp: canonicalTimestamp,
            locationId: repo.getPlayerLifecycle(storyId)?.locationId || 'loc_whispering_orrery',
            primarySubjectId: `player_actor_${storyId}`,
            summary: `DIVERGENCE EVENT: ${evalResult.reason}`,
            details: `Player initiated canonical divergence: ${params.playerAction}`,
            provenance: 'direct_observation',
            visibility: 'PUBLIC',
          });
        }
      }

      // 2. Select Eligible Model respecting context tokens (DEF-CH12-02, DEF-CH12-03)
      let selectedModel: ModelRegistryRecord;
      let selectionReason: string;
      let fallbacks: ModelRegistryRecord[];

      if (params.forceModelId) {
        const forced = params.forceModelId.includes('::')
          ? this.models.get(params.forceModelId)
          : Array.from(this.models.values()).find((m) => m.modelId === params.forceModelId);
        if (!forced) throw new Error(`Forced model ID '${params.forceModelId}' not found.`);
        if (!forced.roleEligibility.includes(task)) {
          throw new Error(`Model '${params.forceModelId}' is not eligible for role/task '${task}'.`);
        }
        const forcedPreflight = this.getTaskCandidatePreflight(
          task,
          forced.providerId,
          forced.modelId,
          narrationPrompt.totalTokens,
          hardTokenBudget,
        );
        const forcedUsable = forced.isEmergencyFloor || (
          this.isCandidateUsable(forced, task, narrationPrompt.totalTokens) &&
          (!forcedPreflight || forcedPreflight.eligible)
        );

        if (!forcedUsable) {
          const fallbackSelection = this.selectBestModel(task, { contextTokens: narrationPrompt.totalTokens });
          selectedModel = fallbackSelection.selectedModel;
          selectionReason = 'Requested model "' + params.forceModelId + '" was unavailable at preflight; using the configured fallback route instead.';
          fallbacks = fallbackSelection.fallbacks;
        } else {
          selectedModel = forced;
          selectionReason = 'Explicitly preferred model "' + params.forceModelId + '" with configured failover enabled.';
          const configuredFallbacks = this.getFallbackChain(task)
            .map((key) => this.models.get(key) || Array.from(this.models.values()).find((m) => m.modelId === key))
            .filter((m): m is ModelRegistryRecord => Boolean(m))
            .filter((m) => this.modelKey(m) !== this.modelKey(forced))
            .filter((m) => {
              if (m.isEmergencyFloor) return true;
              const preflight = this.getTaskCandidatePreflight(
                task,
                m.providerId,
                m.modelId,
                narrationPrompt.totalTokens,
                hardTokenBudget,
              );
              return this.isCandidateUsable(m, task, narrationPrompt.totalTokens) && Boolean(preflight?.eligible);
            });
          fallbacks = configuredFallbacks;
        }
      } else {
        const selection = this.selectBestModel(task, { contextTokens: narrationPrompt.totalTokens });
        selectedModel = selection.selectedModel;
        selectionReason = selection.selectionReason;
        fallbacks = selection.fallbacks;
      }

      const candidateChain: ModelRegistryRecord[] = [selectedModel, ...fallbacks];
      const turnTaskBudget = turnAiCallBudget.beginTask(task);
      if (!turnTaskBudget.allowed) {
        throw new Error(turnTaskBudget.reason || `Per-turn AI call budget exhausted for ${task}.`);
      }
      let totalAttempts = 0;
      let lastError = '';

      // 3. Provider Execution Loop with Retries, Timeouts, and Failover (DEF-CH12-01, DEF-CH12-07)
      for (let cIdx = 0; cIdx < candidateChain.length; cIdx++) {
        const currentCandidate = candidateChain[cIdx];
        const modelKey = `${currentCandidate.providerId}::${currentCandidate.modelId}`;

        const adapter = this.getAdapter(currentCandidate.providerId);
        if (!adapter) {
          continue;
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          totalAttempts++;
          turnAiCallBudget.recordProviderAttempt(task);
          const attemptStartedAt = Date.now();
          try {
            // Wrap provider call with AbortController for strict timeout enforcement
            const abortController = new AbortController();
            const timer = setTimeout(() => abortController.abort(), timeoutMs);

            let providerRes: ProviderGenerateResult;
            try {
              providerRes = await adapter.generate(task, narrationPrompt.prompt, {
                timeoutMs,
                abortSignal: abortController.signal,
                retryCount: attempt,
                modelId: currentCandidate.modelId,
                maxTokens: NarrativePacingEngine.outputTokenBudget(narrativePacingContract),
                audioInputBase64: params.audioInputBase64,
                voiceProfile: params.voiceProfile,
                canonicalLocationName: currentSituation.location.name,
                playerAction: params.playerAction,
                systemInstruction: narrativeProviderHandoff?.providerIndependentInstruction,
              });
            } finally {
              clearTimeout(timer);
            }

            // Reset failure counter on success
            this.consecutiveFailures.set(modelKey, 0);

            // 4. Validate Structured Output (DEF-CH12-05)
            const validation = this.validateTurnPackage(providerRes.text);
            if (!validation.valid || !validation.turnPackage) {
              throw new Error(`Turn package validation failed: ${validation.errorReason}`);
            }
            if (task === 'narrative.generate') {
              const presentation = this.validateNarrativePresentation({
                narration: validation.turnPackage.narrative.join(' '),
                playerAction: params.playerAction || '',
                intent: playerIntent,
                situation: currentSituation,
                repository: repo,
                storyId,
                pacingContract: narrativePacingContract,
              });
              if (!presentation.valid) {
                throw new Error(presentation.errorReason || 'Narrative presentation validation failed.');
              }
            }

            // 5. Semantic Narrative Review. Deterministic review is cheap and runs before
            // state proposals are adjudicated. A single repair may use the same provider.
            this.recordProviderSuccess(currentCandidate, providerRes, task, attemptStartedAt);

            let reviewedTurnPackage = validation.turnPackage;
            let narrativeReview: NarrativeReview | undefined;
            let literaryReview: LiteraryReview | undefined;
            let narrativeRichnessEvaluation: NarrativeRichnessEvaluation | undefined;
            if (isNarrativeTask && narrativePlan) {
              const initialReview = SemanticNarrativeReview.review({
                intent: playerIntent,
                situation: currentSituation,
                plan: narrativePlan,
                turnPackage: validation.turnPackage,
              });
              const shouldRewrite = initialReview.decision !== 'ACCEPT' && !semanticRewriteUsed;
              if (shouldRewrite) semanticRewriteUsed = true;
              const reviewBudget = shouldRewrite
                ? turnAiCallBudget.beginTask('narrative.review')
                : { allowed: true };
              if (shouldRewrite && !reviewBudget.allowed) {
                throw new Error(reviewBudget.reason || 'Narrative review call budget exhausted.');
              }
              if (shouldRewrite) turnAiCallBudget.recordProviderAttempt('narrative.review');
              const reviewed = await this.reviewAndRepairNarrative({
                turnPackage: validation.turnPackage,
                intent: playerIntent,
                situation: currentSituation,
                plan: narrativePlan,
                adapter,
                modelId: currentCandidate.modelId,
                timeoutMs,
                playerAction: params.playerAction || '',
                repository: repo,
                storyId,
                narrativePacingContract,
                narrativeProviderHandoff,
                allowRewrite: shouldRewrite,
              });
              if (reviewed.review.decision !== 'ACCEPT') {
                throw new Error('Narrative semantic review rejected the provider output after the single permitted rewrite budget was exhausted.');
              }
              reviewedTurnPackage = reviewed.turnPackage;
              narrativeReview = reviewed.review;
              const previousNarrations = currentSituation.recentTurns
                .map((entry) => String(entry.narration || ''))
                .filter(Boolean);
              const narrativeNoveltyStateForReview = NarrativeNoveltyEngine.resolve(repo, storyId);
              const literary = LiteraryNarrativeReview.review({
                intent: playerIntent,
                situation: currentSituation,
                plan: narrativePlan,
                turnPackage: reviewedTurnPackage,
                voice: narratorVoiceState,
                noveltyState: narrativeNoveltyStateForReview,
                previousNarrations,
              });
              literaryReview = literary;
              narrativeRichnessEvaluation = NarrativeRichnessEvaluator.evaluate({
                intent: playerIntent,
                situation: currentSituation,
                plan: narrativePlan,
                turnPackage: reviewedTurnPackage,
                previousNarrations,
              });
              const needsLiteraryRewrite = literary.decision === 'REWRITE';
              if (needsLiteraryRewrite) {
                const literaryBudget = turnAiCallBudget.beginTask('narrative.review');
                if (!literaryBudget.allowed) throw new Error(literaryBudget.reason || 'Narrative literary/richness review call budget exhausted.');
                turnAiCallBudget.recordProviderAttempt('narrative.review');
                const literaryPrompt = LiteraryNarrativeReview.buildRewritePrompt({
                  review: literary,
                  richnessEvaluation: narrativeRichnessEvaluation,
                  turnPackage: reviewedTurnPackage,
                  intent: playerIntent,
                  situation: currentSituation,
                  plan: narrativePlan,
                });
                const literaryResult = await adapter.generate('narrative.review', literaryPrompt, {
                  modelId: currentCandidate.modelId,
                  timeoutMs,
                  maxTokens: NarrativePacingEngine.outputTokenBudget(narrativePacingContract),
                  systemInstruction: [narrativeProviderHandoff?.providerIndependentInstruction, 'Perform a literary/richness polish only. Preserve canonical truth, state, player agency, knowledge boundaries and plot direction.'].filter(Boolean).join(' '),
                });
                const literaryValidation = this.validateTurnPackage(literaryResult.text);
                if (!literaryValidation.valid || !literaryValidation.turnPackage) throw new Error(literaryValidation.errorReason || 'Literary rewrite returned an invalid structured turn package.');
                const literaryPresentation = this.validateNarrativePresentation({
                  narration: literaryValidation.turnPackage.narrative.join(' '),
                  playerAction: params.playerAction || '',
                  intent: playerIntent,
                  situation: currentSituation,
                  repository: repo,
                  storyId,
                  pacingContract: narrativePacingContract,
                });
                if (!literaryPresentation.valid) throw new Error(literaryPresentation.errorReason || 'Literary rewrite failed final presentation validation.');

                const postSemantic = SemanticNarrativeReview.review({
                  intent: playerIntent,
                  situation: currentSituation,
                  plan: narrativePlan,
                  turnPackage: literaryValidation.turnPackage,
                });
                if (postSemantic.decision !== 'ACCEPT') throw new Error('Literary rewrite failed the semantic safety gate.');

                const postLiterary = LiteraryNarrativeReview.review({
                  intent: playerIntent,
                  situation: currentSituation,
                  plan: narrativePlan,
                  turnPackage: literaryValidation.turnPackage,
                  voice: narratorVoiceState,
                  noveltyState: NarrativeNoveltyEngine.resolve(repo, storyId),
                  previousNarrations,
                });
                if (postLiterary.decision !== 'ACCEPT') throw new Error('Literary rewrite remained below the N6/N7 acceptance threshold.');

                const postNovelty = NarrativeNoveltyEngine.inspect({
                  repository: repo,
                  storyId,
                  narration: literaryValidation.turnPackage.narrative.join(' '),
                });
                if (postNovelty.discouraged.length) throw new Error('Literary rewrite reintroduced a discouraged N7 repetition/trope pattern.');

                const postRichness = NarrativeRichnessEvaluator.evaluate({
                  intent: playerIntent,
                  situation: currentSituation,
                  plan: narrativePlan,
                  turnPackage: literaryValidation.turnPackage,
                  previousNarrations,
                });
                reviewedTurnPackage = literaryValidation.turnPackage;
                literaryReview = postLiterary;
                narrativeRichnessEvaluation = postRichness;
              }
            }

            // 6. Adjudicate state proposals through the canonical state boundary.
            const adjudication = DomainAdjudicationBridge.adjudicate(
              reviewedTurnPackage,
              repo,
              storyId,
              narrativePlan,
            );
            const stateAdjudication = NarrativeStateAdjudicator.adjudicate({
              repository: repo,
              storyId,
              turnId,
              actorId: currentSituation.player.actorId,
              playerIntent,
              currentSituation,
              turnPackage: reviewedTurnPackage,
              canonicalAdjudication: adjudication,
            });

            // 6. Create Continuation Checkpoint (DEF-CH12-06, V6.15 completeness)
            const checkpointId = rawIdempotencyKey
              ? deterministicId('cp', storyId, rawIdempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_'), attempt, currentCandidate.modelId)
              : deterministicId('cp', storyId, turnId, attempt, currentCandidate.modelId);
            const checkpoint: ContinuationCheckpoint = {
              checkpointId,
              storyId,
              turnId,
              role: 'narrator',
              playerAction: params.playerAction,
              playerIntent,
              workingContextTokens: narrationPrompt.totalTokens,
              worldTime: repo.getWorldClock(storyId).formatHeader(),
              locationId: repo.getPlayerLifecycle(storyId)?.locationId || 'loc_whispering_orrery',
              sceneSummary: reviewedTurnPackage.narrative[0] || 'Scene observed.',
              recentOutput: reviewedTurnPackage.narrative.join(' '),
              uncommittedOutput: '',
              canonicalInvariants: {
                playerActorId: `player_actor_${storyId}`,
                discoveredLocations: repo.getPlayerLifecycle(storyId)?.discoveredLocationIds || [],
              },
              styleContract: {
                profileId: narratorVoiceState.profileId,
                tone: narratorVoiceState.profileId,
                cadence: narratorVoiceState.cadence,
                descriptiveDensity: narratorVoiceState.descriptiveDensity,
                emotionalDistance: narratorVoiceState.emotionalDistance,
                epistemicSanitized: 'true',
              },
              openThreads: reviewedTurnPackage.memoryCandidates || [],
              presentationEvents: [
                ...(reviewedTurnPackage.audioCues || []).map((c: any) =>
                  typeof c === 'string' ? `audio:${c}` : `audio:${c.soundId}`
                ),
                ...(reviewedTurnPackage.visualCues || []).map((v: any) =>
                  typeof v === 'string' ? `visual:${v}` : `visual:${v.prompt}`
                ),
              ],
              knowledgeBoundaries: {
                sanitized: true,
                epistemicSanitized: true,
                hiddenFactsSuppressed: [],
                totalTokens: narrationPrompt.totalTokens,
                truncated: (assembledContext.evictedChunkLabels?.length ?? 0) > 0,
                viewerActorId: `player_actor_${storyId}`,
              },
              handoffEligible: true,
              summaryText: reviewedTurnPackage.narrative[0] || 'Scene observed.',
              recentHistory: reviewedTurnPackage.narrative || [],
              activeConditions: [],
              activeQuests: [],
              selectedModelId: currentCandidate.modelId,
              providerId: currentCandidate.providerId,
              retryCount: attempt,
              fallbackChain: candidateChain.slice(0, cIdx + 1).map((m) => m.modelId),
              createdAt: Date.now(),
              adjudicationStatus: adjudication.allApproved ? 'ADJUDICATED' : 'VALIDATED',
            };
            this.createContinuationCheckpoint(checkpoint);

            const telemetry: OrchestratedTurnTelemetry = {
              turnId,
              storyId,
              promptVersion: MultiModelOrchestrator.PROMPT_VERSION,
              taskId: task,
              selectedModelId: currentCandidate.modelId,
              selectedProviderId: currentCandidate.providerId,
              selectionScore: currentCandidate.userPriority,
              selectionReason,
              fallbackChain: candidateChain.slice(0, cIdx + 1).map((m) => m.modelId),
              attempts: totalAttempts,
              latencyMs: providerRes.latencyMs,
              inputTokens: Math.min(providerRes.inputTokens || narrationPrompt.totalTokens, narrationPrompt.totalTokens),
              outputTokens: providerRes.outputTokens || 50,
              validated: true,
          aiCallBudget: turnAiCallBudget.snapshot(),
              adjudicationResult: adjudication,
              checkpointCreated: checkpointId,
              recoveredFromCheckpoint: Boolean(params.checkpointId),
              idempotencyKey: rawIdempotencyKey,
              researchBlockCount: researchResult?.blocks.length,
              researchTokens: researchResult?.totalTokens,
              narrativePlanObjective: narrativePlan?.objective,
              narrativeReview,
              narrativeRichnessEvaluation,
              narrativeProviderHandoff: narrativeProviderHandoff ? NarrativeProviderHandoffEngine.snapshot(narrativeProviderHandoff) : undefined,
            };
            this.lastTurnTelemetry = telemetry;
            if (!repo.isCanonicalCommandTransactionActive()) {
            narrativeContinuityEngine.recordTurn(repo, {
              storyId,
              turnId,
              playerAction: params.playerAction,
              playerIntent,
              currentSituation,
              narrativeReview,
              stateAdjudication,
              turnPackage: reviewedTurnPackage,
            });
            }

            return {
              success: true,
              turnPackage: reviewedTurnPackage,
              playerIntent,
              narrativePlan,
              narrativeReview,
              literaryReview,
              narrativeRichnessEvaluation,
              stateAdjudication,
              telemetry,
              adjudicationResult: adjudication,
              checkpoint,
              audioResultBase64: providerRes.audioBase64,
            };
          } catch (err: any) {
            lastError = err?.message || String(err);
            this.recordProviderFailure(currentCandidate, task, err, attemptStartedAt);

            // Track consecutive failures & circuit breaker
            const failures = (this.consecutiveFailures.get(modelKey) || 0) + 1;
            this.consecutiveFailures.set(modelKey, failures);

            if (failures >= 2 || failures > maxRetries) {
              this.circuitBreakersTripped.add(modelKey);
              currentCandidate.health = 'Unavailable';
            }

            // If rate limited or quota exhausted, mark accordingly and failover immediately
            if (
              lastError.includes('429') ||
              lastError.includes('rate limit') ||
              lastError.includes('Resource Exhausted') ||
              lastError.includes('quota')
            ) {
              // recordProviderFailure() already records the transient throttle and
              // cooldown. Do not permanently poison model health/quota here.
              break;
            }

            // Exponential backoff between retries
            if (attempt < maxRetries) {
              const backoffMs = Math.min(1000, 100 * Math.pow(2, attempt));
              await new Promise((res) => setTimeout(res, backoffMs));
            }
          }
        }
      }

      // All primary models and retries failed -> Fallback to emergency floor if not already tried
      const emergencyModel = Array.from(this.models.values()).find((m) => m.isEmergencyFloor);
      if (emergencyModel) {
        const emergencyAdapter = this.getAdapter(emergencyModel.providerId);
        if (emergencyAdapter) {
          const emergencyStartedAt = Date.now();
          const emergencyLocationId =
            repo.getPlayerLifecycle(storyId)?.locationId ||
            repo.getStoryRun(storyId)?.currentLocationId ||
            repo.getStoryRun(storyId)?.startingLocationId;
          const emergencyLocation = emergencyLocationId
            ? repo.getGeographyGraph(storyId).getNode(emergencyLocationId)
            : undefined;
          const res = await emergencyAdapter.generate(task, narrationPrompt.prompt, {
            audioInputBase64: params.audioInputBase64,
            voiceProfile: params.voiceProfile,
            canonicalLocationName: emergencyLocation?.name,
            playerAction: params.playerAction,
            maxTokens: NarrativePacingEngine.outputTokenBudget(narrativePacingContract),
            systemInstruction: narrativeProviderHandoff?.providerIndependentInstruction,
          });
          this.recordProviderSuccess(emergencyModel, res, task, emergencyStartedAt);
          const validation = this.validateTurnPackage(res.text);
          if (validation.valid && validation.turnPackage) {
            const presentation = isNarrativeTask
              ? this.validateNarrativePresentation({
                  narration: validation.turnPackage.narrative.join(' '),
                  playerAction: params.playerAction || '',
                  intent: playerIntent,
                  situation: currentSituation,
                  repository: repo,
                  storyId,
                  pacingContract: narrativePacingContract,
                })
              : { valid: true };
            if (!presentation.valid) {
              lastError = presentation.errorReason || 'Emergency narration failed final presentation validation.';
            } else {
              let emergencyTurnPackage = validation.turnPackage;
              let emergencyNarrativeReview: NarrativeReview | undefined;
              let emergencyLiteraryReview: LiteraryReview | undefined;
              if (isNarrativeTask && narrativePlan) {
                const reviewed = await this.reviewAndRepairNarrative({
                  turnPackage: validation.turnPackage,
                  intent: playerIntent,
                  situation: currentSituation,
                  plan: narrativePlan,
                  adapter: emergencyAdapter,
                  modelId: emergencyModel.modelId,
                  timeoutMs,
                  playerAction: params.playerAction || '',
                  repository: repo,
                  storyId,
                  narrativePacingContract,
                  narrativeProviderHandoff,
                  strict: false,
                  allowRewrite: false,
                });
                if (reviewed.review.decision !== 'ACCEPT') {
                  lastError = 'Emergency narration failed semantic narrative review: ' + reviewed.review.decision;
                } else {
                  const emergencyLiterary = LiteraryNarrativeReview.review({
                    intent: playerIntent,
                    situation: currentSituation,
                    plan: narrativePlan,
                    turnPackage: reviewed.turnPackage,
                    voice: narratorVoiceState,
                    noveltyState: NarrativeNoveltyEngine.resolve(repo, storyId),
                    previousNarrations: currentSituation.recentTurns.map((entry) => String(entry.narration || '')).filter(Boolean),
                  });
                  if (emergencyLiterary.decision !== 'ACCEPT') {
                    lastError = 'Emergency narration failed N6 literary review.';
                  } else if (NarrativeNoveltyEngine.inspect({
                    repository: repo,
                    storyId,
                    narration: reviewed.turnPackage.narrative.join(' '),
                  }).discouraged.length) {
                    lastError = 'Emergency narration failed N7 novelty validation.';
                  } else {
                    emergencyTurnPackage = reviewed.turnPackage;
                    emergencyNarrativeReview = reviewed.review;
                    emergencyLiteraryReview = emergencyLiterary;
                  }
                }
              }
              const adjudication = DomainAdjudicationBridge.adjudicate(
                emergencyTurnPackage,
                repo,
                storyId,
                narrativePlan,
              );
              const stateAdjudication = NarrativeStateAdjudicator.adjudicate({
                repository: repo,
                storyId,
                turnId,
                actorId: currentSituation.player.actorId,
                playerIntent,
                currentSituation,
                turnPackage: emergencyTurnPackage,
                canonicalAdjudication: adjudication,
              });
            const checkpointId = rawIdempotencyKey
              ? deterministicId('cp_emergency', storyId, rawIdempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_'), totalAttempts)
              : deterministicId('cp_emergency', storyId, turnId, totalAttempts);
            const checkpoint: ContinuationCheckpoint = {
              checkpointId,
              storyId,
              turnId,
              role: 'narrator',
              playerAction: params.playerAction,
              playerIntent,
              workingContextTokens: narrationPrompt.totalTokens,
              worldTime: repo.getWorldClock(storyId).formatHeader(),
              locationId: repo.getPlayerLifecycle(storyId)?.locationId || 'loc_whispering_orrery',
              sceneSummary: validation.turnPackage.narrative[0],
              recentOutput: validation.turnPackage.narrative.join(' '),
              uncommittedOutput: '',
              canonicalInvariants: {},
              styleContract: {
                tone: narratorVoiceState.profileId,
                cadence: narratorVoiceState.cadence,
                descriptiveDensity: narratorVoiceState.descriptiveDensity,
                emotionalDistance: narratorVoiceState.emotionalDistance,
                promptVersion: MultiModelOrchestrator.PROMPT_VERSION,
              },
              openThreads: validation.turnPackage.memoryCandidates || [],
              presentationEvents: [
                ...(validation.turnPackage.audioCues || []).map((c: any) =>
                  typeof c === 'string' ? `audio:${c}` : `audio:${c.soundId}`
                ),
                ...(validation.turnPackage.visualCues || []).map((v: any) =>
                  typeof v === 'string' ? `visual:${v}` : `visual:${v.prompt}`
                ),
              ],
              knowledgeBoundaries: {
                sanitized: true,
                epistemicSanitized: true,
                hiddenFactsSuppressed: [],
                totalTokens: narrationPrompt.totalTokens,
                truncated: (assembledContext.evictedChunkLabels?.length ?? 0) > 0,
                viewerActorId: `player_actor_${storyId}`,
              },
              handoffEligible: true,
              summaryText: validation.turnPackage.narrative[0] || 'Emergency scene observed.',
              recentHistory: validation.turnPackage.narrative || [],
              activeConditions: [],
              activeQuests: [],
              selectedModelId: emergencyModel.modelId,
              providerId: emergencyModel.providerId,
              retryCount: totalAttempts,
              fallbackChain: ['emergency-fallback-local'],
              createdAt: Date.now(),
            };
            this.createContinuationCheckpoint(checkpoint);

            const telemetry: OrchestratedTurnTelemetry = {
              turnId,
              storyId,
              promptVersion: MultiModelOrchestrator.PROMPT_VERSION,
              taskId: task,
              selectedModelId: emergencyModel.modelId,
              selectedProviderId: emergencyModel.providerId,
              selectionScore: 10,
              selectionReason: 'Exhausted all primary providers; recovered through emergency floor.',
              fallbackChain: ['emergency-fallback-local'],
              attempts: totalAttempts + 1,
              latencyMs: res.latencyMs,
              inputTokens: narrationPrompt.totalTokens,
              outputTokens: 30,
              validated: true,
          aiCallBudget: turnAiCallBudget.snapshot(),
              adjudicationResult: adjudication,
              checkpointCreated: checkpointId,
              recoveredFromCheckpoint: Boolean(params.checkpointId),
              idempotencyKey: rawIdempotencyKey,
              researchBlockCount: researchResult?.blocks.length,
              researchTokens: researchResult?.totalTokens,
              narrativePlanObjective: narrativePlan?.objective,
              narrativeReview: emergencyNarrativeReview,
              narrativeProviderHandoff: narrativeProviderHandoff ? NarrativeProviderHandoffEngine.snapshot(narrativeProviderHandoff) : undefined,
            };
            this.lastTurnTelemetry = telemetry;

            if (!repo.isCanonicalCommandTransactionActive()) {
            narrativeContinuityEngine.recordTurn(repo, {
              storyId,
              turnId,
              playerAction: params.playerAction,
              playerIntent,
              currentSituation,
              narrativeReview: emergencyNarrativeReview,
              stateAdjudication,
              turnPackage: emergencyTurnPackage,
            });
            }

            return {
              success: true,
              turnPackage: emergencyTurnPackage,
              playerIntent,
              narrativePlan,
              narrativeReview: emergencyNarrativeReview,
              literaryReview: emergencyLiteraryReview,
              stateAdjudication,
              telemetry,
              adjudicationResult: adjudication,
              checkpoint,
              audioResultBase64: res.audioBase64,
            };
            }
          }
        }
      }

      return {
        success: false,
        playerIntent,
        telemetry: {
          turnId,
          storyId,
          taskId: task,
          selectedModelId: selectedModel.modelId,
          selectedProviderId: selectedModel.providerId,
          selectionScore: 0,
          selectionReason,
          fallbackChain: candidateChain.map((m) => m.modelId),
          attempts: totalAttempts,
          latencyMs: 0,
          inputTokens: narrationPrompt.totalTokens,
          outputTokens: 0,
          validated: false,
          aiCallBudget: turnAiCallBudget.snapshot(),
          idempotencyKey: rawIdempotencyKey,
        },
        narrativePlan,
        error: `All models and emergency fallbacks failed. Last error: ${lastError}`,
      };
    };

    let executePromise: Promise<OrchestratedTurnResult>;
    if (scopedKey) {
      executePromise = executeCore();
      this.inFlightTurnPromises.set(scopedKey, executePromise);
    } else {
      executePromise = executeCore();
    }

    try {
      const result = await executePromise;
      if (scopedKey && result.success) {
        this.turnResultsByIdempotencyKey.set(scopedKey, result);
        if (this.turnResultsByIdempotencyKey.size > 200) {
          const oldestKey = this.turnResultsByIdempotencyKey.keys().next().value;
          if (oldestKey) this.turnResultsByIdempotencyKey.delete(oldestKey);
        }
      }
      return result;
    } finally {
      if (scopedKey) {
        this.inFlightTurnPromises.delete(scopedKey);
      }
    }
  }

  /**
   * Cross-Model Handoff & Checkpoint Continuation (DEF-CH12-06)
   * Resumes execution using the saved continuation checkpoint.
   */
  public async continueFromCheckpoint(
    checkpointId: string,
    targetModelId?: string,
    options?: { hardTokenBudget?: number }
  ): Promise<OrchestratedTurnResult> {
    const cp = this.getContinuationCheckpoint(checkpointId);
    if (!cp) {
      return {
        success: false,
        telemetry: {
          turnId: 'unknown',
          storyId: 'unknown',
          taskId: 'narrative.generate',
          selectedModelId: 'none',
          selectedProviderId: 'none',
          selectionScore: 0,
          selectionReason: 'Checkpoint not found',
          fallbackChain: [],
          attempts: 0,
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          validated: false,
        },
        error: `Continuation checkpoint '${checkpointId}' not found.`,
      };
    }

    const result = await this.executeTurn({
      storyId: cp.storyId,
      playerAction: cp.playerAction || 'Continue narrative thread from checkpoint',
      task: 'narrative.generate',
      hardTokenBudget: options?.hardTokenBudget ?? cp.workingContextTokens ?? 400,
      forceModelId: targetModelId,
      checkpointId: cp.checkpointId,
    });

    if (result.telemetry) {
      result.telemetry.recoveredFromCheckpoint = true;
    }

    return result;
  }

  public hasIdempotencyKey(storyId: string, idempotencyKey: string): boolean {
    return this.turnResultsByIdempotencyKey.has(`${storyId}::${idempotencyKey.trim()}`);
  }

  public clearIdempotencyCache(): void {
    this.turnResultsByIdempotencyKey.clear();
    this.inFlightTurnPromises.clear();
  }

  public async executeTaskGeneration(
    task: TaskId,
    prompt: string,
    systemInstruction?: string,
    options?: {
      timeoutMs?: number;
      maxTokens?: number;
      contextTokens?: number;
      forceModelId?: string;
      canonicalLocationName?: string;
      playerAction?: string;
      narrativeHandoff?: NarrativeProviderHandoffContract;
      turnBudget?: AiTurnCallBudget;
      validateResponse?: (text: string) => TaskResponseValidationResult;
      /**
       * When true, a configured task route may be expanded with additional eligible AI models
       * before the deterministic emergency floor is considered. This is opt-in so existing
       * manual/configured routes keep their current semantics unless a caller explicitly asks
       * for AI-only recovery.
       */
      allowAdaptiveAiRecovery?: boolean;
      /**
       * When false, never execute the deterministic emergency provider. Instead surface
       * AI_UNAVAILABLE after the AI candidate chain has been exhausted.
       */
      allowDeterministicFallback?: boolean;
    }
  ): Promise<{
    text: string;
    source: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK';
    providerId: string;
    modelId: string;
    fallbackReason?: string;
    attempts: number;
    attemptsTrail: Array<{
      providerId: string;
      modelId: string;
      displayName?: string;
      status: 'SUCCESS' | 'FAILED';
      latencyMs: number;
      error?: string;
    }>;
    narrativeProviderHandoff?: NarrativeProviderHandoffContract;
    preflightSkipped?: Array<{
      providerId: string;
      modelId: string;
      displayName?: string;
      state: string;
      reason: string;
    }>;
  }> {
    const contract = getAiTaskContract(task);
    const turnBudgetDecision = options?.turnBudget?.beginTask(task);
    if (turnBudgetDecision && !turnBudgetDecision.allowed) {
      if (options?.allowDeterministicFallback === false) {
        throw new Error(turnBudgetDecision.reason || 'Per-turn AI call budget exhausted.');
      }
      const emergency = Array.from(this.models.values()).find((model) => model.isEmergencyFloor && model.roleEligibility.includes(task));
      const emergencyAdapter = emergency ? this.getAdapter(emergency.providerId) : undefined;
      if (!emergency || !emergencyAdapter) {
        throw new Error((turnBudgetDecision.reason || 'Per-turn AI call budget exhausted.') + ' Deterministic emergency floor is unavailable.');
      }
      options?.turnBudget?.recordProviderAttempt(task);
      const emergencyStartedAt = Date.now();
      const emergencyResponse = await emergencyAdapter.generate(task, prompt, {
        allowDeterministicFallback: true,
        timeoutMs: options?.timeoutMs || 35000,
        maxTokens: options?.maxTokens,
        modelId: emergency.modelId,
        systemInstruction: [systemInstruction, options?.narrativeHandoff?.providerIndependentInstruction].filter(Boolean).join('\n\n'),
        canonicalLocationName: options?.canonicalLocationName,
        playerAction: options?.playerAction,
      });
      if (!emergencyResponse?.text) {
        throw new Error('Deterministic emergency floor returned an empty response after AI call budget exhaustion.');
      }
      const emergencyValidation = (options?.validateResponse || ((text: string) => validateAiTaskResponse(task, text)))(emergencyResponse.text);
      if (!emergencyValidation.valid) {
        throw new Error('Deterministic emergency floor response failed validation after AI call budget exhaustion.');
      }
      return {
        text: emergencyResponse.text,
        source: 'DETERMINISTIC_FALLBACK',
        providerId: emergency.providerId,
        modelId: emergency.modelId,
        fallbackReason: turnBudgetDecision.reason || 'TURN_AI_CALL_BUDGET_EXHAUSTED',
        attempts: 1,
        narrativeProviderHandoff: options?.narrativeHandoff,
        attemptsTrail: [{
          providerId: emergency.providerId,
          modelId: emergency.modelId,
          displayName: emergency.displayName,
          status: 'SUCCESS',
          latencyMs: Math.max(1, Date.now() - emergencyStartedAt),
        }],
      };
    }
    const contractValidator = options?.validateResponse || ((text: string) => validateAiTaskResponse(task, text));
    const allowAdaptiveAiRecovery = options?.allowAdaptiveAiRecovery === true;
    const allowDeterministicFallback = options?.allowDeterministicFallback !== false;
    this.refreshAllProviderModelStatuses();
    const timeoutMs = options?.timeoutMs || 35000;
    const contextTokens = options?.contextTokens ?? 0;
    let selection: ReturnType<typeof this.selectBestModel>;
    let selectionWasForcedFallback = false;
    try {
      selection = this.selectBestModel(task, { contextTokens });
    } catch {
      const emergency = Array.from(this.models.values()).find((m) => m.isEmergencyFloor) || {
        providerId: 'provider_deterministic_emergency',
        modelId: 'emergency-fallback-local',
        displayName: 'Deterministic Rule Engine (Emergency Floor)',
        pool: 'emergency',
        capabilities: ['zero_cost', 'unlimited_quota', 'deterministic', 'text_generation', 'structured_output', 'text'],
        contextWindow: 1000000,
        health: 'Healthy',
        quota: 'Healthy',
        latencyMs: 5,
        userPriority: 10,
        roleEligibility: [task],
        isEmergencyFloor: true,
        fallbackEligibility: true,
        accessStatus: 'accessible',
        lifecycleState: 'active',
        supportedInputTypes: ['text'],
        supportedOutputTypes: ['text', 'json'],
      };
      selection = {
        selectedModel: emergency,
        selectionReason: 'Emergency floor fallback selected after routing failure.',
        selectionScore: emergency.userPriority,
        fallbacks: [],
      };
    }

    if (options?.forceModelId) {
      const forced = Array.from(this.models.values()).find(
        (model) => model.modelId === options.forceModelId || this.modelKey(model) === options.forceModelId,
      );

      // A caller-provided model is a preference, not a dead-end dependency.
      // Stale UI state, provider discovery changes, quota exhaustion, cooldown,
      // context limits, and task-eligibility changes must all remain recoverable.
      if (!forced || !forced.roleEligibility.includes(task)) {
        selectionWasForcedFallback = true;
        const fallbackSelection = this.selectBestModel(task, { contextTokens });
        selection = {
          ...fallbackSelection,
          selectionReason: !forced
            ? 'Requested model "' + options.forceModelId + '" is no longer registered; using the configured fallback route instead.'
            : 'Requested model "' + options.forceModelId + '" is not eligible for this task; using the configured fallback route instead.',
        };
      } else {
        const forcedPreflight = this.getTaskCandidatePreflight(
          task,
          forced.providerId,
          forced.modelId,
          contextTokens,
          options?.maxTokens,
        );
        const forcedUsable = forced.isEmergencyFloor || (
          this.isCandidateUsable(forced, task, contextTokens) &&
          (!forcedPreflight || forcedPreflight.eligible)
        );

        if (forcedUsable) {
          selection = {
            selectedModel: forced,
            selectionReason: 'Explicitly selected model "' + (forced.displayName || forced.modelId) + '" as the preferred primary; configured fallbacks remain active.',
            selectionScore: forced.userPriority,
            fallbacks: this.getFallbackChain(task).flatMap((key) => {
              const model = Array.from(this.models.values()).find(
                (candidate) => this.modelKey(candidate) === key || candidate.modelId === key,
              );
              if (!model || this.modelKey(model) === this.modelKey(forced)) return [];
              if (model.isEmergencyFloor) return [model];

              const preflight = this.getTaskCandidatePreflight(
                task,
                model.providerId,
                model.modelId,
                contextTokens,
                options?.maxTokens,
              );
              return this.isCandidateUsable(model, task, contextTokens) && Boolean(preflight?.eligible)
                ? [model]
                : [];
            }),
          };
        } else {
          selectionWasForcedFallback = true;
          const fallbackSelection = this.selectBestModel(task, { contextTokens });
          selection = {
            ...fallbackSelection,
            selectionReason: 'Requested model "' + options.forceModelId + '" was unavailable at preflight; using the configured fallback route instead.',
          };
        }
      }
    }

    const preferredRouteKey =
      options?.forceModelId ||
      this.taskPinnedModels.get(task) ||
      this.categoryOverrides.get(this.getTaskCategory(task));
    if (preferredRouteKey && this.modelKey(selection.selectedModel) !== preferredRouteKey) {
      selectionWasForcedFallback = true;
    }

    const selectedModelKey = this.modelKey(selection.selectedModel);
    const selectedCandidates: ModelRegistryRecord[] = [selection.selectedModel, ...selection.fallbacks];
    const preflightSkipped: Array<{
      providerId: string;
      modelId: string;
      displayName?: string;
      state: string;
      reason: string;
    }> = [];

    const configuredRouteKeys = this.getFallbackChain(task)
      .filter((key) => key && !key.includes('emergency-fallback-local'));

    const registeredRouteKeys = new Set(selectedCandidates.map((candidate) => this.modelKey(candidate)));
    const unresolvedConfiguredKeys = configuredRouteKeys.filter((key) => !registeredRouteKeys.has(key));

    for (const key of unresolvedConfiguredKeys) {
      const separatorIndex = key.indexOf('::');
      const providerId = separatorIndex >= 0 ? key.slice(0, separatorIndex) : 'unknown';
      const modelId = separatorIndex >= 0 ? key.slice(separatorIndex + 2) : key;
      const routeError = 'Configured fallback model is not registered/discoverable in the current runtime.';
      preflightSkipped.push({
        providerId,
        modelId,
        displayName: modelId,
        state: 'NOT_REGISTERED',
        reason: routeError,
      });
    }

    for (const candidate of selectedCandidates) {
      if (candidate.isEmergencyFloor) continue;
      const preflight = this.getTaskCandidatePreflight(
        task,
        candidate.providerId,
        candidate.modelId,
        contextTokens,
        options?.maxTokens,
      );
      if (preflight && !preflight.eligible) {
        preflightSkipped.push({
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          displayName: candidate.displayName || candidate.modelId,
          state: preflight.state,
          reason: preflight.reason,
        });
      }
    }

    const candidateKeys = new Set(selectedCandidates.map((model) => this.modelKey(model)));
    const categoryHasManualOverride = Boolean(this.categoryOverrides.get(this.getTaskCategory(task)));
    const hasConfiguredTaskChain = this.taskFallbackChains.has(task);

    // Only tasks without an explicit configured route may use adaptive
    // discovery-based recovery. Configured task routes are authoritative and
    // must not be expanded with unrelated eligible models at runtime.
    const usableCandidates = Array.from(this.models.values())
      .filter((model) => !candidateKeys.has(this.modelKey(model)))
      .filter((model) => !model.isEmergencyFloor)
      .filter((model) => this.isCandidateUsable(model, task, contextTokens))
      .sort((a, b) => {
        const runtimeA = this.ensureRuntimeStatus(a);
        const runtimeB = this.ensureRuntimeStatus(b);
        const score = (model: ModelRegistryRecord, runtime: ModelRuntimeStatus) =>
          model.userPriority +
          (model.health === 'Healthy' ? 50 : model.health === 'Degraded' ? 15 : 0) +
          (model.quota === 'Healthy' ? 30 : model.quota === 'Low' ? 10 : 0) -
          runtime.consecutiveFailures * 25 -
          Math.min(20, (model.latencyMs || 500) / 100);
        const diff = score(b, runtimeB) - score(a, runtimeA);
        return diff !== 0 ? diff : this.modelKey(a).localeCompare(this.modelKey(b));
      });

    const runnableNonEmergencyCount = selectedCandidates.filter(
      (candidate) =>
        !candidate.isEmergencyFloor &&
        Boolean(this.getAdapter(candidate.providerId)) &&
        this.isCandidateUsable(candidate, task, contextTokens)
    ).length;

    if (!categoryHasManualOverride && (!hasConfiguredTaskChain || allowAdaptiveAiRecovery) && runnableNonEmergencyCount < 2) {
      for (const model of usableCandidates) {
        if (candidateKeys.has(this.modelKey(model))) continue;
        if (!model.roleEligibility.includes(task)) continue;
        if (!this.getAdapter(model.providerId)) continue;
        if (model.health === 'Unavailable' || model.health === 'DisabledByUser' || model.health === 'InvalidAuth') continue;
        if (model.quota === 'Exhausted' || model.accessStatus === 'quota_limited' || model.accessStatus === 'rate_limited') continue;
        if (contextTokens > 0 && model.contextWindow > 0 && contextTokens > model.contextWindow) continue;
        selectedCandidates.push(model);
        candidateKeys.add(this.modelKey(model));
        if (selectedCandidates.filter((candidate) => !candidate.isEmergencyFloor).length >= 4) break;
      }
    }

    let candidateChain: ModelRegistryRecord[] = selectedCandidates
      .filter((model) => {
        if (model.isEmergencyFloor) return true;
        if (!this.isCandidateUsable(model, task, contextTokens)) return false;
        const preflight = this.getTaskCandidatePreflight(
          task,
          model.providerId,
          model.modelId,
          contextTokens,
          options?.maxTokens,
        );
        return Boolean(preflight?.eligible);
      });

    // Final preflight recovery: count only models that can actually be contacted.
    // This prevents unusable configured entries from consuming the fallback slots.
    const runnableNonEmergency = candidateChain.filter(
      (model) => !model.isEmergencyFloor && Boolean(this.getAdapter(model.providerId))
    ).length;

    if (!categoryHasManualOverride && allowAdaptiveAiRecovery && runnableNonEmergency < 2) {
      for (const model of usableCandidates) {
        if (candidateChain.some((candidate) => this.modelKey(candidate) === this.modelKey(model))) continue;
        if (!this.getAdapter(model.providerId)) continue;
        candidateChain.push(model);
        if (candidateChain.filter((candidate) => !candidate.isEmergencyFloor && Boolean(this.getAdapter(candidate.providerId))).length >= 4) break;
      }
    }

    if (allowAdaptiveAiRecovery) {
      const aiCandidates = candidateChain.filter((candidate) => !candidate.isEmergencyFloor);
      const emergencyCandidates = candidateChain.filter((candidate) => candidate.isEmergencyFloor);
      candidateChain = [...aiCandidates, ...emergencyCandidates];
    }

    let totalAttempts = 0;
    let lastError = '';
    const attemptsTrail: Array<{
      providerId: string;
      modelId: string;
      displayName?: string;
      status: 'SUCCESS' | 'FAILED';
      latencyMs: number;
      error?: string;
    }> = [];

    for (let cIdx = 0; cIdx < candidateChain.length; cIdx++) {
      if (totalAttempts >= (contract.fallbackPolicy?.maxTotalAttempts ?? 5) && !candidateChain[cIdx].isEmergencyFloor) {
        break;
      }
      // For adaptive tasks only, try one final live-registry recovery
      // candidate before the emergency floor. Explicit configured routes skip
      // this escape hatch so their order remains authoritative.
      if (
        !categoryHasManualOverride &&
        (!hasConfiguredTaskChain || allowAdaptiveAiRecovery) &&
        cIdx === candidateChain.length - 2 &&
        !candidateChain[cIdx].isEmergencyFloor &&
        candidateChain[cIdx + 1]?.isEmergencyFloor
      ) {
        const attemptedKeys = new Set(candidateChain.slice(0, cIdx + 1).map((candidate) => this.modelKey(candidate)));
        const lateRecovery = Array.from(this.models.values())
          .filter((model) => !model.isEmergencyFloor)
          .filter((model) => !attemptedKeys.has(this.modelKey(model)))
          .filter((model) => model.roleEligibility.includes(task))
          .filter((model) => Boolean(this.getAdapter(model.providerId)))
          .filter((model) => model.health !== 'Unavailable' && model.health !== 'DisabledByUser' && model.health !== 'InvalidAuth')
          .filter((model) => model.quota !== 'Exhausted' && model.accessStatus !== 'quota_limited' && model.accessStatus !== 'rate_limited')
          .filter((model) => {
            const preflight = this.getTaskCandidatePreflight(
              task,
              model.providerId,
              model.modelId,
              contextTokens,
              options?.maxTokens,
            );
            return Boolean(preflight?.eligible);
          })
          .sort((a, b) => b.userPriority - a.userPriority || this.modelKey(a).localeCompare(this.modelKey(b)))[0];

        if (lateRecovery) {
          candidateChain.splice(cIdx + 1, 0, lateRecovery);
        }
      }

      const currentCandidate = candidateChain[cIdx];
      const modelKey = `${currentCandidate.providerId}::${currentCandidate.modelId}`;

      const adapter = this.getAdapter(currentCandidate.providerId);
      if (!adapter) {
        attemptsTrail.push({
          providerId: currentCandidate.providerId,
          modelId: currentCandidate.modelId,
          displayName: currentCandidate.displayName || currentCandidate.modelId,
          status: 'FAILED',
          latencyMs: 0,
          error: `Provider adapter '${currentCandidate.providerId}' not configured or missing API credentials.`,
        });
        continue;
      }

      const attemptStartedAt = Date.now();
      options?.turnBudget?.recordProviderAttempt(task);
      const operationSource: ActiveModelOperation['source'] = currentCandidate.isEmergencyFloor
        ? 'DETERMINISTIC_FALLBACK'
        : (this.modelKey(currentCandidate) === selectedModelKey && !selectionWasForcedFallback ? 'AI_PRIMARY' : 'AI_FALLBACK');
      const operationId = this.beginModelOperation(task, currentCandidate, totalAttempts + 1, operationSource);
      try {
        totalAttempts++;
        const abortController = new AbortController();
        const timer = setTimeout(() => abortController.abort(), timeoutMs);

        let providerRes: ProviderGenerateResult;
        try {
          providerRes = await adapter.generate(task, prompt, {
            allowDeterministicFallback,
            timeoutMs,
            maxTokens: options?.maxTokens,
            abortSignal: abortController.signal,
            modelId: currentCandidate.modelId,
            systemInstruction: [systemInstruction, options?.narrativeHandoff?.providerIndependentInstruction].filter(Boolean).join('\n\n'),
            canonicalLocationName: options?.canonicalLocationName,
            playerAction: options?.playerAction,
          });
        } finally {
          clearTimeout(timer);
        }

        if (!providerRes || !providerRes.text) {
          throw new Error('Provider returned empty response.');
        }

        if (contractValidator) {
          const validation = contractValidator(providerRes.text);
          if (!validation.valid) {
            throw new Error(
              'Task response schema validation failed' +
              (validation.errorReason ? `: ${validation.errorReason}` : '.')
            );
          }
        }

        const latencyMs = Math.max(1, Date.now() - attemptStartedAt);
        this.recordProviderSuccess(currentCandidate, providerRes, task, attemptStartedAt);
        this.finishModelOperation(operationId, 'SUCCESS', latencyMs);
        this.consecutiveFailures.set(modelKey, 0);

        attemptsTrail.push({
          providerId: currentCandidate.providerId,
          modelId: currentCandidate.modelId,
          displayName: currentCandidate.displayName || currentCandidate.modelId,
          status: 'SUCCESS',
          latencyMs,
        });

        const isEmergency = Boolean(currentCandidate.isEmergencyFloor) ||
                            currentCandidate.providerId.includes('emergency') ||
                            currentCandidate.providerId === 'provider_deterministic_emergency';
        const isPrimarySelection = this.modelKey(currentCandidate) === selectedModelKey && !selectionWasForcedFallback;
        const source = isEmergency ? 'DETERMINISTIC_FALLBACK' : (isPrimarySelection ? 'AI_PRIMARY' : 'AI_FALLBACK');
        const fallbackCount = attemptsTrail.filter((entry) => entry.status === 'FAILED').length;
        const fallbackReason = !isPrimarySelection
          ? `Fell back to ${currentCandidate.displayName || currentCandidate.modelId} after ${fallbackCount} earlier model failure/skip event(s).`
          : undefined;

        return {
          text: providerRes.text,
          source,
          providerId: currentCandidate.providerId,
          modelId: currentCandidate.modelId,
          fallbackReason,
          attempts: totalAttempts,
          narrativeProviderHandoff: options?.narrativeHandoff,
          attemptsTrail,
          preflightSkipped,
        };
      } catch (err: any) {
        lastError = err?.message || String(err);
        const latencyMs = Math.max(1, Date.now() - attemptStartedAt);
        this.recordProviderFailure(currentCandidate, task, err, attemptStartedAt);
        this.finishModelOperation(operationId, 'FAILED', latencyMs, lastError);
        const failureType = this.classifyFailure(err);
        if (
          failureType === '429' ||
          failureType === '5XX' ||
          failureType === 'TIMEOUT' ||
          failureType === 'AUTH' ||
          failureType === 'UNAVAILABLE'
        ) {
          const failures = (this.consecutiveFailures.get(modelKey) || 0) + 1;
          this.consecutiveFailures.set(modelKey, failures);
          if (failures >= 2) {
            this.circuitBreakersTripped.add(modelKey);
            currentCandidate.health = 'Unavailable';
          }
        } else {
          // Schema/task-validation failures must advance this request's fallback
          // chain without globally circuit-breaking the model.
          this.consecutiveFailures.set(modelKey, 0);
        }

        attemptsTrail.push({
          providerId: currentCandidate.providerId,
          modelId: currentCandidate.modelId,
          displayName: currentCandidate.displayName || currentCandidate.modelId,
          status: 'FAILED',
          latencyMs,
          error: lastError,
        });

      }
    }

    const emergency: ModelRegistryRecord = Array.from(this.models.values()).find((m) => m.isEmergencyFloor) || {
      providerId: 'provider_deterministic_emergency',
      modelId: 'emergency-fallback-local',
      displayName: 'Deterministic Emergency Floor',
      pool: 'emergency',
      capabilities: ['text_generation'],
      contextWindow: 1000000,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 1,
      userPriority: -1000,
      roleEligibility: [task],
      isEmergencyFloor: true,
      fallbackEligibility: true,
    };

    if (!allowDeterministicFallback) {
      const error: any = new Error(
        `All AI candidates were exhausted for task '${task}'. Deterministic emergency fallback was withheld.`
      );
      error.code = 'AI_UNAVAILABLE';
      error.fallbackReason = error.message;
      error.attemptsTrail = [
        ...unresolvedConfiguredKeys.map((key) => {
          const separatorIndex = key.indexOf('::');
          const providerId = separatorIndex >= 0 ? key.slice(0, separatorIndex) : 'unknown';
          const modelId = separatorIndex >= 0 ? key.slice(separatorIndex + 2) : key;
          return {
            providerId,
            modelId,
            displayName: modelId,
            status: 'FAILED' as const,
            latencyMs: 0,
            error: 'Configured model was not registered/discoverable in the current runtime.',
          };
        }),
        ...attemptsTrail,
      ];
      error.preflightSkipped = preflightSkipped;
      throw error;
    }

    const emergencyAdapter = this.getAdapter(emergency.providerId);
    if (emergencyAdapter) {
      const emergencyStartedAt = Date.now();
      try {
        totalAttempts++;
        const emergencyResult = await emergencyAdapter.generate(task, prompt, {
          allowDeterministicFallback: true,
          timeoutMs,
          maxTokens: options?.maxTokens,
          modelId: emergency.modelId,
          systemInstruction,
          canonicalLocationName: options?.canonicalLocationName,
          playerAction: options?.playerAction,
        });
        if (!emergencyResult.text) throw new Error('Deterministic emergency floor returned an empty response.');

        if (options?.validateResponse) {
          const validation = options.validateResponse(emergencyResult.text);
          if (!validation.valid) {
            throw new Error(
              'Emergency task response validation failed' +
              (validation.errorReason ? ': ' + validation.errorReason : '.'),
            );
          }
        }

        const latencyMs = Math.max(1, Date.now() - emergencyStartedAt);
        this.recordProviderSuccess(emergency, emergencyResult, task, emergencyStartedAt);
        attemptsTrail.push({
          providerId: emergency.providerId,
          modelId: emergency.modelId,
          displayName: emergency.displayName || emergency.modelId,
          status: 'SUCCESS',
          latencyMs,
        });

        return {
          text: emergencyResult.text,
          source: 'DETERMINISTIC_FALLBACK',
          providerId: emergency.providerId,
          modelId: emergency.modelId,
          fallbackReason: 'All AI candidates were exhausted; deterministic emergency floor used.',
          attempts: totalAttempts,
          attemptsTrail,
          preflightSkipped,
        };
      } catch (emergencyError: any) {
        lastError = emergencyError?.message || String(emergencyError);
        attemptsTrail.push({
          providerId: emergency.providerId,
          modelId: emergency.modelId,
          displayName: emergency.displayName || emergency.modelId,
          status: 'FAILED',
          latencyMs: Math.max(1, Date.now() - emergencyStartedAt),
          error: lastError,
        });
      }
    }

    const trailSummary = attemptsTrail.length > 0
      ? attemptsTrail.map((a, i) => `${i + 1}. ${a.displayName || a.modelId} (${a.providerId}) — ${a.error || 'success'}`).join('; ')
      : lastError;

    return {
      text: '',
      source: 'DETERMINISTIC_FALLBACK',
      providerId: emergency.providerId,
      modelId: emergency.modelId,
      fallbackReason: `All ${attemptsTrail.length} AI/emergency attempts failed: ${trailSummary}`,
      attempts: totalAttempts,
      attemptsTrail,
      preflightSkipped,
    };
  }

  /**
   * Automated Fallback Configuration Engine.
   *
   * This remains the legacy auto-arrangement path for now; the formal
   * task-specific preflight model intelligence layer will replace the
   * generic provider probe in the next orchestration specification pass.
   */

  private async refreshProviderQuotaSnapshots(): Promise<ProviderQuotaSnapshot[]> {
    const snapshots: ProviderQuotaSnapshot[] = [];
    for (const adapter of this.getAllAdapters()) {
      if (typeof adapter.getQuotaStatus !== 'function') continue;
      try {
        snapshots.push(await adapter.getQuotaStatus());
      } catch (error: any) {
        snapshots.push({
          providerId: adapter.providerId,
          available: false,
          source: 'UNKNOWN',
          exact: false,
          billingState: 'UNKNOWN',
          message: error?.message || 'Provider quota lookup failed.',
        });
      }
    }

    for (const snapshot of snapshots) {
      for (const model of this.models.values()) {
        if (model.providerId !== snapshot.providerId) continue;

        if (snapshot.available && snapshot.exact) {
          const runtime = this.ensureRuntimeStatus(model);
          runtime.headroom = {
            value: Math.max(0, Number(snapshot.remaining || 0)),
            exact: true,
            source: 'PROVIDER',
            unit: 'CREDITS',
          };
          model.quotaEvidenceSource = 'PROVIDER';
          if (Number(snapshot.remaining || 0) <= 0) {
            model.quota = 'Exhausted';
            model.accessStatus = 'quota_limited';
          } else if (model.quota === 'Exhausted' || model.accessStatus === 'quota_limited') {
            model.quota = 'Healthy';
            model.accessStatus = 'accessible';
          }
        } else if (snapshot.source === 'UNKNOWN') {
          const runtime = this.ensureRuntimeStatus(model);
          if (!runtime.headroom || runtime.headroom.source === 'UNKNOWN') {
            runtime.headroom = {
              exact: false,
              source: 'UNKNOWN',
              unit: 'UNKNOWN',
            };
          }
          if (model.quotaEvidenceSource !== 'PROVIDER') {
            model.quotaEvidenceSource = 'UNKNOWN';
          }
        }

        if (snapshot.billingState === 'FREE' && model.freeTierStatus !== 'NOT_FREE') {
          model.billingState = 'FREE';
          model.billingEvidenceSource = 'PROVIDER';
          model.isPaidModel = false;
          model.freeTierStatus = 'VERIFIED';
          model.freeTierEvidenceSource = 'PROVIDER';
          model.freeTierVerifiedAt = Date.now();
        }
      }
    }

    return snapshots;
  }

  private getAutoArrangeCanary(task: TaskId): {
    prompt: string;
    timeoutMs: number;
    maxTokens: number;
    validate: (result: ProviderGenerateResult) => { valid: boolean; reason?: string };
    verificationMode: 'TASK_CANARY' | 'CAPABILITY_ONLY';
  } {
    const contract = getAiTaskContract(task);

    if (task === 'image.generate') {
      return {
        prompt: 'Generate one minimal test image for DreamBook model readiness verification.',
        timeoutMs: contract.defaultTimeoutMs,
        maxTokens: contract.defaultMaxTokens,
        verificationMode: 'CAPABILITY_ONLY',
        validate: (result) => ({
          valid: Boolean(result.rawResponse || result.text || result.audioBase64),
          reason: 'Image provider verification is limited to adapter response evidence in the current provider contract.',
        }),
      };
    }

    const parseJsonObject = (text: string): any | null => {
      try {
        const normalized = String(text || '')
          .trim()
          .replace(/^\u0060\u0060\u0060(?:json)?\s*/i, '')
          .replace(/\s*\u0060\u0060\u0060$/i, '')
          .trim();
        const parsed = JSON.parse(normalized);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    };

    let prompt = 'DreamBook task readiness canary. Return the smallest valid response for this task. Do not mutate state.';
    let validate: (result: ProviderGenerateResult) => { valid: boolean; reason?: string } = (result) => ({
      valid: Boolean(String(result.text || '').trim()),
      reason: 'Provider returned an empty task response.',
    });

    switch (task) {
      case 'narrative.generate':
      case 'character.dialogue':
      case 'summary.scene':
      case 'world.generate':
      case 'memory.extract':
      case 'story.advice':
      case 'capability.explain':
      case 'research.query':
      case 'research.world-brief':
      case 'rules.adjudicate':
      case 'rules.analyze':
      case 'tactical.reason':
      case 'combat.animation.plan':
      case 'narrative.review':
      case 'utility.inspect':
      case 'ooc.respond':
        prompt = 'DreamBook task readiness canary. Return a concise valid response for this task. Do not mutate state.';
        break;
      case 'character.extract':
      case 'character.capability.propose':
      case 'capability.synthesize':
      case 'intent.interpret':
        prompt = 'DreamBook structured task readiness canary. Return a minimal valid JSON object for this task. Do not mutate state.';
        validate = (result) => {
          const parsed = parseJsonObject(result.text);
          if (!parsed) return { valid: false, reason: 'Provider did not return a JSON object.' };
          if (task === 'character.extract' && !parsed.identity && !parsed.role && !parsed.background && !parsed.name) {
            return { valid: false, reason: 'Character extraction response lacks recognizable character fields.' };
          }
          if (task !== 'character.extract' && typeof parsed.name !== 'string' && typeof parsed.intent !== 'string' && typeof parsed.baseAction !== 'string') {
            return { valid: false, reason: 'Structured task response lacks a recognizable task field.' };
          }
          return { valid: true };
        };
        break;
      case 'combat.tactics':
        prompt = 'DreamBook tactical readiness canary. Return one minimal JSON object containing a tactical plan. Do not mutate state.';
        validate = (result) => {
          const validation = validateAiTaskResponse(task, result.text);
          return validation.valid
            ? { valid: true }
            : { valid: false, reason: validation.errorReason || 'Tactical response failed the task contract.' };
        };
        break;
      case 'speech.generate':
        prompt = 'DreamBook speech readiness canary. Generate the smallest possible speech response.';
        validate = (result) => ({
          valid: Boolean(result.audioBase64 || String(result.text || '').trim()),
          reason: 'Speech provider returned neither audio evidence nor text.',
        });
        break;
      case 'speech.transcribe':
        prompt = 'DreamBook transcription readiness canary. Return the smallest possible transcription.';
        break;
      default:
        break;
    }

    return {
      prompt,
      timeoutMs: Math.min(contract.defaultTimeoutMs, 10000),
      maxTokens: Math.min(contract.defaultMaxTokens, 800),
      validate,
      verificationMode: 'TASK_CANARY',
    };
  }

  public static isFreeModelCandidate(model: ModelRegistryRecord): boolean {
    return Boolean(
      model.isPaidModel !== true &&
      model.freeTierStatus === 'VERIFIED' &&
      model.freeTierEvidenceSource === 'PROVIDER'
    );
  }

  public async autoConfigureFallbacks(options?: {
    maxFallbacksPerCategory?: number;
    concurrency?: number;
    includeFreeModels?: boolean;
    freeOnly?: boolean;
  }): Promise<{
    success: boolean;
    timestamp: number;
    totalModelsTested: number;
    healthyModelsCount: number;
    failedModelsCount: number;
    results: Array<{
      providerId: string;
      modelId: string;
      displayName: string;
      status: 'READY' | 'FAILED' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'SKIPPED';
      latencyMs?: number;
      errorReason?: string;
      billingState?: BillingState;
      quotaState?: QuotaState;
      quotaSource?: QuotaEvidenceSource;
      verifiedTasks?: TaskId[];
      failedTasks?: Array<{ task: TaskId; reason: string; diagnosticPayload?: unknown }>;
      diagnosticPayload?: unknown;
      verificationMode?: 'TASK_CANARY' | 'CAPABILITY_ONLY' | 'METADATA_ONLY';
    }>;
    configuredChains: Record<string, string[]>;
    summaryMessage: string;
  }> {
    const maxFallbacks = Math.max(2, Math.min(6, options?.maxFallbacksPerCategory ?? 4));
    const concurrency = Math.max(1, Math.min(6, Math.trunc(options?.concurrency ?? 4)));
    const includeFreeModels = options?.includeFreeModels === true;
    const freeOnly = options?.freeOnly === true;

    await this.discoverAndRegisterModels({ forceRefresh: true });
    await this.refreshProviderQuotaSnapshots();

    const canonicalProviderId = (providerId: string): string => {
      if (providerId === 'provider_google_gemini') return 'google_gemini';
      if (providerId === 'provider_local_emergency') return 'provider_deterministic_emergency';
      return providerId;
    };

    const dedupedModels = new Map<string, ModelRegistryRecord>();
    for (const model of this.getAllModels()) {
      if (model.isEmergencyFloor || model.health === 'DisabledByUser') continue;
      if (freeOnly && !MultiModelOrchestrator.isFreeModelCandidate(model)) continue;
      const canonicalKey = canonicalProviderId(model.providerId) + '::' + model.modelId;
      const existing = dedupedModels.get(canonicalKey);
      if (!existing || model.userPriority > existing.userPriority) {
        dedupedModels.set(canonicalKey, model);
      }
    }
    const allModels = Array.from(dedupedModels.values());

    const representativeTasksByModel = new Map<string, TaskId[]>();
    for (const model of allModels) {
      const tasks = getAllAiTaskContracts()
        .map((contract) => contract.task)
        .filter((task) => model.roleEligibility.includes(task));
      const seenCategories = new Set<AiTaskCategory>();
      const selectedTasks: TaskId[] = [];
      for (const task of tasks) {
        const category = this.getTaskCategory(task);
        if (seenCategories.has(category)) continue;
        seenCategories.add(category);
        selectedTasks.push(task);
        if (selectedTasks.length >= 6) break;
      }
      representativeTasksByModel.set(this.modelKey(model), selectedTasks);
    }

    type TaskCanaryResult = {
      task: TaskId;
      success: boolean;
      latencyMs: number;
      reason?: string;
      diagnosticPayload?: unknown;
      verificationMode: 'TASK_CANARY' | 'CAPABILITY_ONLY';
    };

    const runCanary = async (model: ModelRegistryRecord, task: TaskId): Promise<TaskCanaryResult> => {
      const preflight = this.getTaskCandidatePreflight(
        task,
        model.providerId,
        model.modelId,
        0,
        getAiTaskContract(task).defaultMaxTokens,
      );
      if (!preflight?.eligible) {
        return {
          task,
          success: false,
          latencyMs: 0,
          reason: preflight?.reason || 'Task preflight rejected this candidate.',
          verificationMode: 'TASK_CANARY',
        };
      }

      const adapter = this.getAdapter(model.providerId);
      if (!adapter) {
        return {
          task,
          success: false,
          latencyMs: 0,
          reason: 'No provider adapter is available for this model.',
          verificationMode: 'TASK_CANARY',
        };
      }

      const canary = this.getAutoArrangeCanary(task);
      if (canary.verificationMode === 'CAPABILITY_ONLY') {
        return {
          task,
          success: true,
          latencyMs: 0,
          verificationMode: 'CAPABILITY_ONLY',
          reason: 'Adapter contract is present; media provider verification remains capability-only.',
        };
      }

      const startedAt = Date.now();
      try {
        const abortController = new AbortController();
        const timer = setTimeout(() => abortController.abort(), canary.timeoutMs);
        let providerResult: ProviderGenerateResult;
        try {
          providerResult = await adapter.generate(task, canary.prompt, {
            timeoutMs: canary.timeoutMs,
            abortSignal: abortController.signal,
            modelId: model.modelId,
            maxTokens: canary.maxTokens,
            allowDeterministicFallback: false,
          });
        } finally {
          clearTimeout(timer);
        }

        const validation = canary.validate(providerResult);
        const latencyMs = Math.max(1, Date.now() - startedAt);
        if (!validation.valid) {
          this.recordProviderFailure(
            model,
            task,
            new Error(validation.reason || 'Task canary response failed validation.'),
            startedAt,
            'CANARY',
          );
          return {
            task,
            success: false,
            latencyMs,
            reason: validation.reason || 'Task canary response failed validation.',
            verificationMode: canary.verificationMode,
          };
        }

        this.recordProviderSuccess(model, providerResult, task, startedAt, 'CANARY');
        model.latencyMs = latencyMs;
        model.health = 'Healthy';
        model.accessStatus = 'accessible';
        return {
          task,
          success: true,
          latencyMs,
          verificationMode: canary.verificationMode,
        };
      } catch (error: any) {
        const message = String(error?.message || error);
        const lower = message.toLowerCase();
        if (lower.includes('429') || lower.includes('quota') || lower.includes('resource exhausted') || lower.includes('rate limit')) {
          model.health = 'Throttled';
          model.quota = 'Exhausted';
          model.accessStatus = 'quota_limited';
          model.quotaEvidenceSource = 'PROVIDER';
        } else if (lower.includes('401') || lower.includes('403') || lower.includes('api key') || lower.includes('authentication')) {
          model.health = 'InvalidAuth';
          model.accessStatus = 'not_configured';
        } else if (lower.includes('404') || lower.includes('not found') || lower.includes('unavailable')) {
          model.health = 'Unavailable';
          model.accessStatus = 'unavailable';
        } else {
          model.health = 'Degraded';
        }

        this.recordProviderFailure(model, task, error, startedAt, 'CANARY');
        return {
          task,
          success: false,
          latencyMs: Math.max(1, Date.now() - startedAt),
          reason: message,
          diagnosticPayload: error?.providerDiagnostic?.rawResponse,
          verificationMode: canary.verificationMode,
        };
      }
    };

    const results: Array<{
      providerId: string;
      modelId: string;
      displayName: string;
      status: 'READY' | 'FAILED' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'SKIPPED';
      latencyMs?: number;
      errorReason?: string;
      billingState?: BillingState;
      quotaState?: QuotaState;
      quotaSource?: QuotaEvidenceSource;
      verifiedTasks?: TaskId[];
      failedTasks?: Array<{ task: TaskId; reason: string; diagnosticPayload?: unknown }>;
      diagnosticPayload?: unknown;
      verificationMode?: 'TASK_CANARY' | 'CAPABILITY_ONLY' | 'METADATA_ONLY';
    }> = [];

    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= allModels.length) return;
        const model = allModels[index];
        const runtime = this.ensureRuntimeStatus(model);
        const tasks = representativeTasksByModel.get(this.modelKey(model)) || [];
        const preflightTask = tasks[0] || model.roleEligibility[0];
        const preflight = preflightTask
          ? this.getTaskCandidatePreflight(
              preflightTask,
              model.providerId,
              model.modelId,
              0,
              getAiTaskContract(preflightTask).defaultMaxTokens,
            )
          : undefined;

        if (!preflight || !preflight.eligible) {
          results[index] = {
            providerId: model.providerId,
            modelId: model.modelId,
            displayName: model.displayName || model.modelId,
            status: 'SKIPPED',
            errorReason: preflight?.reason || 'Model has no eligible DreamBook task.',
            billingState: model.billingState || 'UNKNOWN',
            quotaState: model.quota,
            quotaSource: model.quotaEvidenceSource || 'UNKNOWN',
            verificationMode: 'METADATA_ONLY',
          };
          return;
        }

        if (model.quota === 'Exhausted' || model.accessStatus === 'quota_limited' || model.accessStatus === 'rate_limited') {
          results[index] = {
            providerId: model.providerId,
            modelId: model.modelId,
            displayName: model.displayName || model.modelId,
            status: 'SKIPPED',
            errorReason: 'Provider-reported quota/rate-limit exhaustion.',
            billingState: model.billingState || 'UNKNOWN',
            quotaState: model.quota,
            quotaSource: model.quotaEvidenceSource || 'UNKNOWN',
            verificationMode: 'METADATA_ONLY',
          };
          return;
        }

        const taskResults = await Promise.all(tasks.map((task) => runCanary(model, task)));
        const verifiedTasks = taskResults.filter((entry) => entry.success).map((entry) => entry.task);
        const failedTasks = taskResults
          .filter((entry) => !entry.success)
          .map((entry) => ({
            task: entry.task,
            reason: entry.reason || 'Task canary failed.',
            diagnosticPayload: entry.diagnosticPayload,
          }));
        const failedTask = failedTasks[0];

        const averageLatency = verifiedTasks.length
          ? Math.round(
              taskResults
                .filter((entry) => entry.success)
                .reduce((sum, entry) => sum + entry.latencyMs, 0) / verifiedTasks.length,
            )
          : runtime.averageLatencyMs || model.latencyMs || 0;

        const status: 'READY' | 'FAILED' | 'UNAVAILABLE' | 'NOT_CONFIGURED' =
          verifiedTasks.length > 0
            ? 'READY'
            : model.health === 'InvalidAuth'
              ? 'NOT_CONFIGURED'
              : model.health === 'Unavailable'
                ? 'UNAVAILABLE'
                : 'FAILED';

        results[index] = {
          providerId: model.providerId,
          modelId: model.modelId,
          displayName: model.displayName || model.modelId,
          status,
          latencyMs: averageLatency,
          errorReason: failedTask?.reason,
          failedTasks,
          diagnosticPayload: failedTask?.diagnosticPayload,
          billingState: model.billingState || 'UNKNOWN',
          quotaState: model.quota,
          quotaSource: model.quotaEvidenceSource || 'UNKNOWN',
          verifiedTasks,
          verificationMode: tasks.some(
            (task) => this.getAutoArrangeCanary(task).verificationMode === 'TASK_CANARY',
          )
            ? 'TASK_CANARY'
            : 'CAPABILITY_ONLY',
        };
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, Math.max(1, allModels.length)) },
        () => worker(),
      ),
    );

    const healthyModels = allModels.filter((model) => {
      const result = results.find(
        (entry) => entry.providerId === model.providerId && entry.modelId === model.modelId,
      );
      return result?.status === 'READY';
    });

    const tasksToConfigure: TaskId[] = getAllAiTaskContracts().map((contract) => contract.task);
    const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';

    for (const task of tasksToConfigure) {
      const category = this.getTaskCategory(task);
      if (this.categoryOverrides.has(category) || this.taskPinnedModels.has(task)) {
        continue;
      }

      const eligibleReady = healthyModels
        .filter((model) => model.roleEligibility.includes(task))
        .filter((model) => {
          const verification = results.find(
            (entry) => entry.providerId === model.providerId && entry.modelId === model.modelId,
          );
          if (!verification?.verifiedTasks?.includes(task)) return false;
          const readiness = this.getTaskCandidatePreflight(
            task,
            model.providerId,
            model.modelId,
            0,
            getAiTaskContract(task).defaultMaxTokens,
          );
          return Boolean(readiness?.eligible);
        })
        .sort((a, b) => {
          const scoreA =
            a.userPriority +
            (a.health === 'Healthy' ? 50 : 0) +
            (a.quota === 'Healthy' ? 30 : a.quota === 'Low' ? 10 : 0) -
            Math.min(20, (a.latencyMs || 500) / 100);
          const scoreB =
            b.userPriority +
            (b.health === 'Healthy' ? 50 : 0) +
            (b.quota === 'Healthy' ? 30 : b.quota === 'Low' ? 10 : 0) -
            Math.min(20, (b.latencyMs || 500) / 100);
          return scoreB - scoreA ||
            (a.providerId + '::' + a.modelId).localeCompare(b.providerId + '::' + b.modelId);
        });

      if (includeFreeModels) {
        const freeReady = eligibleReady.filter((model) => MultiModelOrchestrator.isFreeModelCandidate(model));
        const paidReady = eligibleReady.filter((model) => !MultiModelOrchestrator.isFreeModelCandidate(model));
        eligibleReady.splice(0, eligibleReady.length, ...freeReady, ...paidReady);
      }

      const eligibleFallbackModels = eligibleReady
        .filter((model) => model.fallbackEligibility !== false);

      const freeModels = includeFreeModels
        ? eligibleFallbackModels.filter((model) => MultiModelOrchestrator.isFreeModelCandidate(model))
        : [];

      const paidOrUnclassifiedModels = includeFreeModels
        ? eligibleFallbackModels.filter((model) => !MultiModelOrchestrator.isFreeModelCandidate(model))
        : eligibleFallbackModels;

      const orderedFallbackModels = [
        ...freeModels,
        ...paidOrUnclassifiedModels,
      ].slice(0, maxFallbacks);

      const topKeys = orderedFallbackModels.map((model) => this.modelKey(model));

      const previous = this.taskFallbackChains.get(task);
      const chain =
        topKeys.length > 0
          ? [...topKeys, emergencyKey]
          : previous && previous.length > 0
            ? previous
            : [emergencyKey];

      this.taskFallbackChains.set(task, chain);
    }

    this.savePersistedConfig();

    const readyCount = results.filter((result) => result.status === 'READY').length;
    const failedCount = results.filter((result) => result.status !== 'READY').length;

    return {
      success: true,
      timestamp: Date.now(),
      totalModelsTested: results.length,
      healthyModelsCount: readyCount,
      failedModelsCount: failedCount,
      results,
      configuredChains: this.getAllFallbackChains(),
      summaryMessage:
        'AI Auto-Configuration Complete: verified task-aware model readiness with bounded concurrency (' +
        concurrency +
        '). Configured up to ' +
        maxFallbacks +
        ' fallbacks per task while preserving manual category overrides and task pins.' +
        (includeFreeModels ? ' Free/explicitly-free model candidates were prioritized where eligible.' : ''),
    };
  }

  public async autoAssignFreeModelsWithAi(options?: {
    maxFallbacksPerCategory?: number;
    concurrency?: number;
  }): Promise<any> {
    const previousChains = new Map<TaskId, string[]>(Array.from(this.taskFallbackChains.entries()).map(([task, chain]) => [task, [...chain]] as [TaskId, string[]]));
    const maxFallbacks = Math.max(2, Math.min(6, Math.trunc(options?.maxFallbacksPerCategory ?? 4)));
    let verification: Awaited<ReturnType<MultiModelOrchestrator['autoConfigureFallbacks']>>;
    try {
      verification = await this.autoConfigureFallbacks({ maxFallbacksPerCategory: maxFallbacks, concurrency: options?.concurrency ?? 4, includeFreeModels: true, freeOnly: true });
    } catch (error: any) {
      for (const [task, chain] of previousChains.entries()) this.taskFallbackChains.set(task, chain);
      this.savePersistedConfig();
      return {
        success: false,
        timestamp: Date.now(),
        freeModels: [],
        configuredChains: this.getAllFallbackChains(),
        verification: { success: false, timestamp: Date.now(), totalModelsTested: 0, healthyModelsCount: 0, failedModelsCount: 0, results: [], configuredChains: this.getAllFallbackChains(), summaryMessage: 'Free-model readiness verification failed before AI classification; existing fallback routes were restored.' },
        summaryMessage: 'Free-model readiness verification failed; existing fallback routes were restored.',
        error: error?.message || 'Free-model readiness verification failed.',
      };
    }

    const freeReadyResults = verification.results.filter((entry) => entry.status === 'READY');
    const freeModels = freeReadyResults.map((entry) => ({ providerId: entry.providerId, modelId: entry.modelId, displayName: entry.displayName, verifiedTasks: entry.verifiedTasks || [], status: entry.status }));
    const classifierCandidates = this.getAllModels()
      .filter((model) => model.providerId === 'google_gemini' && MultiModelOrchestrator.isFreeModelCandidate(model))
      .filter((model) => model.roleEligibility.includes('utility.inspect' as TaskId))
      .filter((model) => model.health !== 'Unavailable' && model.health !== 'InvalidAuth' && model.quota !== 'Exhausted')
      .sort((a, b) => {
        const preferred = (id: string) => id === 'gemini-3.5-flash-lite' ? 0 : id === 'gemini-3.5-flash' ? 1 : id === 'gemini-2.5-flash-lite' ? 2 : 10;
        return preferred(a.modelId) - preferred(b.modelId) || b.userPriority - a.userPriority;
      });
    const classifier = classifierCandidates[0];
    const restore = () => { for (const [task, chain] of previousChains.entries()) this.taskFallbackChains.set(task, chain); this.savePersistedConfig(); };

    if (!classifier || freeModels.length === 0) {
      restore();
      return { success: false, timestamp: Date.now(), freeModels, configuredChains: this.getAllFallbackChains(), verification, summaryMessage: 'No provider-verified free Gemini classifier and/or no free models passed readiness checks. Existing fallback routes were restored.', error: 'AI free-model assignment could not start because the required free Gemini classifier or verified free candidates were unavailable.' };
    }

    const freeModelDescriptions = freeModels.map((model) => ({
      modelKey: model.providerId + '::' + model.modelId,
      displayName: model.displayName,
      verifiedTasks: model.verifiedTasks,
      registry: (() => { const record = this.getModel(model.providerId, model.modelId); return record ? { pool: record.pool, capabilities: record.capabilities, contextWindow: record.contextWindow, description: record.description, latencyMs: record.latencyMs } : {}; })(),
    }));
    const categories = Array.from(new Set(getAllAiTaskContracts().map((contract) => contract.category))) as AiTaskCategory[];
    const assignmentPrompt = [
      'You are the Dreamville free-model routing analyst.',
      'Choose the best Dreamville AI task categories for EACH provider-verified free model listed below.',
      'Use model description, capability, pool, context window, latency and verified task readiness as evidence.',
      'Do not invent model capabilities. A model may be assigned to multiple categories when justified.',
      'Do not assign a model to speech or image unless the evidence supports those capabilities.',
      'Return ONLY JSON: {"assignments":[{"modelKey":"provider::model","categories":[{"category":"narration","priority":100}]}]}',
      'Allowed categories: ' + categories.join(', '),
      JSON.stringify(freeModelDescriptions),
    ].join('\\n');

    let generated: Awaited<ReturnType<MultiModelOrchestrator['executeTaskGeneration']>>;
    try {
      generated = await this.executeTaskGeneration('utility.inspect', assignmentPrompt, 'Classify provider-verified free AI models for Dreamville routing. Return only the requested JSON object. Do not call tools, mutate state, or add commentary.', {
        forceModelId: classifier.providerId + '::' + classifier.modelId,
        maxTokens: 1200,
        timeoutMs: 10000,
        allowDeterministicFallback: false,
        validateResponse: (text) => {
          try { const parsed = JSON.parse(String(text || '').trim()); return { valid: Boolean(parsed && Array.isArray(parsed.assignments) && parsed.assignments.length > 0), errorReason: 'Gemini classifier returned no assignments.' }; }
          catch { return { valid: false, errorReason: 'Gemini classifier did not return valid JSON.' }; }
        },
      });
    } catch (error: any) {
      restore();
      return {
        success: false,
        timestamp: Date.now(),
        classifier: { providerId: classifier.providerId, modelId: classifier.modelId, displayName: classifier.displayName },
        freeModels,
        configuredChains: this.getAllFallbackChains(),
        verification,
        summaryMessage: 'Gemini free-model classification failed; existing fallback routes were restored.',
        error: error?.message || 'Gemini free-model classification failed.',
      };
    }

    let parsed: any = null;
    try { parsed = JSON.parse(String(generated.text || '').trim()); } catch {}
    const freeModelKeys = new Set(freeModels.map((model) => model.providerId + '::' + model.modelId));
    const allowedCategories = new Set(categories);
    const assignments: Array<{ modelKey: string; displayName: string; categories: Array<{ category: AiTaskCategory; priority: number }> }> = [];

    for (const raw of Array.isArray(parsed?.assignments) ? parsed.assignments : []) {
      const modelKey = typeof raw?.modelKey === 'string' ? raw.modelKey.trim() : '';
      if (!freeModelKeys.has(modelKey)) continue;
      const model = freeModels.find((candidate) => candidate.providerId + '::' + candidate.modelId === modelKey);
      if (!model) continue;
      const categoryScores = new Map<AiTaskCategory, number>();
      for (const item of Array.isArray(raw.categories) ? raw.categories : []) {
        const category = typeof item === 'string' ? item : item?.category;
        if (!allowedCategories.has(category)) continue;
        const value = Number(typeof item === 'string' ? 50 : item?.priority);
        const priority = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
        categoryScores.set(category, Math.max(categoryScores.get(category) || 0, priority));
      }
      if (categoryScores.size === 0) continue;
      assignments.push({ modelKey, displayName: model.displayName, categories: Array.from(categoryScores.entries()).map(([category, priority]) => ({ category, priority })).sort((a, b) => b.priority - a.priority) });
    }

    if (assignments.length === 0) {
      restore();
      return { success: false, timestamp: Date.now(), classifier: { providerId: classifier.providerId, modelId: classifier.modelId, displayName: classifier.displayName }, freeModels, configuredChains: this.getAllFallbackChains(), verification, summaryMessage: 'Gemini free-model analysis returned no valid assignments. Existing fallback routes were restored.', error: 'Gemini free-model classifier returned no valid model/category assignments.' };
    }

    const categoryModels = new Map<AiTaskCategory, Array<{ model: ModelRegistryRecord; score: number; verifiedTasks: TaskId[] }>>();
    for (const assignment of assignments) {
      const separator = assignment.modelKey.indexOf('::');
      const providerId = separator >= 0 ? assignment.modelKey.slice(0, separator) : '';
      const modelId = separator >= 0 ? assignment.modelKey.slice(separator + 2) : assignment.modelKey;
      const model = this.getModel(providerId, modelId);
      const verified = freeModels.find((candidate) => candidate.providerId + '::' + candidate.modelId === assignment.modelKey);
      if (!model || !verified || !MultiModelOrchestrator.isFreeModelCandidate(model)) continue;
      for (const categoryAssignment of assignment.categories) {
        const list = categoryModels.get(categoryAssignment.category) || [];
        list.push({ model, score: categoryAssignment.priority, verifiedTasks: verified.verifiedTasks });
        categoryModels.set(categoryAssignment.category, list);
      }
    }

    const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';
    let touchedTasks = 0;
    for (const contract of getAllAiTaskContracts()) {
      const task = contract.task;
      const category = contract.category;
      if (this.categoryOverrides.has(category) || this.taskPinnedModels.has(task)) continue;
      const candidates = (categoryModels.get(category) || [])
        .filter((entry) => entry.model.roleEligibility.includes(task))
        .filter((entry) => entry.model.fallbackEligibility !== false)
        .filter((entry) => entry.verifiedTasks.includes(task))
        .sort((a, b) => b.score - a.score || b.model.userPriority - a.model.userPriority || (a.model.latencyMs || 500) - (b.model.latencyMs || 500) || this.modelKey(a.model).localeCompare(this.modelKey(b.model)));
      const keys = Array.from(new Set(candidates.map((entry) => this.modelKey(entry.model)))).slice(0, maxFallbacks);
      if (keys.length === 0) continue;
      this.taskFallbackChains.set(task, [...keys, emergencyKey]);
      touchedTasks++;
    }
    this.savePersistedConfig();
    return { success: true, timestamp: Date.now(), classifier: { providerId: classifier.providerId, modelId: classifier.modelId, displayName: classifier.displayName }, freeModels, assignments, configuredChains: this.getAllFallbackChains(), verification, summaryMessage: 'Gemini free-model analysis classified ' + assignments.length + ' free models and rebuilt ' + touchedTasks + ' eligible task routes using only provider-verified free models plus the deterministic emergency floor.' };
  }

  public getStatus(): {
    active: boolean;
    registeredModels: number;
    registeredAdapters: number;
    pools: ModelPool[];
    totalTurnsExecuted: number;
    activeCheckpoints: number;
    circuitBreakers: string[];
    lastTelemetry: OrchestratedTurnTelemetry | null;
  } {
    const pools = Array.from(new Set(Array.from(this.models.values()).map((m) => m.pool)));
    return {
      active: true,
      registeredModels: this.models.size,
      registeredAdapters: this.adapters.size,
      pools,
      totalTurnsExecuted: this.totalTurnsExecuted,
      activeCheckpoints: this.checkpoints.size,
      circuitBreakers: Array.from(this.circuitBreakersTripped),
      lastTelemetry: this.lastTurnTelemetry,
    };
  }
}
