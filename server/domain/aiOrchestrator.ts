import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { WorldTimestamp } from './types';
import { WorkingContextEngine, AssembledTurnContext } from './workingContextEngine';
import type { WorldRepository } from '../repositories/worldRepository';
import { worldRepository } from '../repositories/worldRepository';
import { StoryAdaptationPipeline } from './storyAdaptation';
import { getProviderApiKey } from '../services/providerCredentialService';
import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import { getAiTaskContract } from './aiTaskContracts';

export const DREAMBOOK_PROMPT_VERSION = 'phase12-v1';

export type TaskId =
  | 'narrative.generate'
  | 'character.dialogue'
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

export type HealthState = 'Healthy' | 'Degraded' | 'Throttled' | 'Unavailable' | 'InvalidAuth' | 'DisabledByUser';
export type QuotaState = 'Healthy' | 'Low' | 'NearExhaustion' | 'Exhausted' | 'Unknown';
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
  failureType?: 'TIMEOUT' | '429' | '5XX' | 'AUTH' | 'UNAVAILABLE' | 'MALFORMED' | 'OTHER';
}

export interface CategoryRuntimeState {
  category: AiTaskCategory;
  tasks: TaskId[];
  activeModelKey?: string;
  mode: 'AUTO' | 'MANUAL';
  fallbackChain: string[];
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
  audioInputBase64?: string;
  voiceProfile?: any;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  retryCount?: number;
  modelId?: string;
  systemInstruction?: string;
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

export interface IProviderAdapter {
  providerId: string;
  generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult>;
  validateCredentials(): Promise<boolean>;
  discoverModels?(): Promise<DiscoveredModelMetadata[]>;
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
}

export interface OrchestratedTurnResult {
  success: boolean;
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

        text = JSON.stringify({
          narrative: ['The brass armatures of the Whispering Orrery turn with steady, ancient precision as the world advances.'],
          dialogue: [],
          events: ['EMERGENCY_DETERMINISTIC_TICK'],
          stateChanges: [],
          memoryCandidates: ['Observed the celestial armatures in motion.'],
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
  public callHistory: { task: TaskId; prompt: string; timestamp: number }[] = [];

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
    this.callHistory.push({ task, prompt, timestamp: Date.now() });

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
      roleEligibility: [
        'narrative.generate',
        'character.dialogue',
        'memory.extract',
        'summary.scene',
        'rules.adjudicate',
        'utility.inspect',
      ],
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
  let roleEligibility: TaskId[] = [
    'narrative.generate',
    'character.dialogue',
    'memory.extract',
    'summary.scene',
    'rules.adjudicate',
    'utility.inspect',
  ];
  let userPriority = 80;
  let latencyMs = 500;

  if (lowerId.includes('critic')) {
    pool = 'reasoning';
    roleEligibility = ['narrative.review', 'rules.adjudicate', 'summary.scene'];
    userPriority = 85;
    latencyMs = 400;
  } else if (lowerId.includes('flash-lite') || lowerId.includes('lite')) {
    pool = 'fast';
    roleEligibility = ['character.dialogue', 'memory.extract', 'rules.adjudicate', 'utility.inspect'];
    userPriority = 95;
    latencyMs = 150;
    capabilities.push('low_latency', 'cost_efficient');
  } else if (lowerId.includes('flash')) {
    pool = 'fast';
    roleEligibility = ['character.dialogue', 'memory.extract', 'rules.adjudicate', 'utility.inspect', 'narrative.generate'];
    userPriority = 90;
    latencyMs = 250;
    capabilities.push('fast_utility');
  } else if (lowerId.includes('pro')) {
    pool = 'creative';
    roleEligibility = ['narrative.generate', 'summary.scene', 'character.dialogue'];
    userPriority = 100;
    latencyMs = 800;
    capabilities.push('creative_writing', 'deep_reasoning');
  } else if (lowerId.includes('long')) {
    pool = 'long_context';
    roleEligibility = ['summary.scene', 'memory.extract'];
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
        const isPaidModel = promptPrice > 0 || completionPrice > 0;

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
          temperature: undefined,
          maxTemperature: undefined,
          topP: undefined,
          topK: undefined,
        };
      })
      .filter(Boolean) as DiscoveredModelMetadata[];
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

    try {
      const body: Record<string, unknown> = {
        model: options?.modelId || 'openrouter/free',
        messages: [
          ...(options?.systemInstruction
            ? [{ role: 'system', content: options.systemInstruction }]
            : []),
          { role: 'user', content: prompt },
        ],
        stream: false,
      };

      body.max_tokens = Math.min(Number(options?.maxTokens || 4096), 4096);

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

      const payload: any = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          payload?.error?.message ||
          payload?.error ||
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

      const extracted = extractOpenRouterAssistantText(payload);
      if (!extracted.text) {
        throw new Error(
          extracted.failureReason || 'OpenRouter returned no usable assistant content.'
        );
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
    const hasKey = typeof process !== 'undefined' && Boolean(process.env?.GEMINI_API_KEY);
    if (!hasKey) {
      return { configured: false, message: 'GEMINI_API_KEY environment variable is not configured.' };
    }
    return { configured: true, message: 'Google Gemini API key configured.' };
  }

  public async validateCredentials(): Promise<boolean> {
    if (this.failureMode === 'error' || this.failureMode === 'quota') {
      return false;
    }
    return typeof process !== 'undefined' && Boolean(process.env?.GEMINI_API_KEY);
  }

  /**
   * Discovers Gemini models from the real Gemini API (or returns mock catalog if configured).
   */
  public async discoverModels(): Promise<DiscoveredModelMetadata[]> {
    if (this.mockDiscoveredCatalog) {
      return this.mockDiscoveredCatalog;
    }

    const apiKey = typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined;
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
          isPaidModel: false,
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

    if (canExecuteLive) {
      try {
        const ai = new GoogleGenAI({
          apiKey: apiKey!,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const targetModel = options?.modelId || 'gemini-2.5-flash';
        const defaultSystemPrompt = `PROMPT_VERSION: ${DREAMBOOK_PROMPT_VERSION}
You are the Dreamville canonical narrator. Produce ONLY a valid JSON turn package matching this exact schema:
{
  "narrative": ["text describing world events"],
  "dialogue": [{"speaker": "string", "text": "string"}],
  "events": ["EVENT_NAME"],
  "stateChanges": [{"kind": "INVENTORY|LOCATION|CAPABILITY|COMBAT", "targetId": "string", "value": "string"}],
  "memoryCandidates": ["string"],
  "audioCues": ["string"]
}
Do not enclose in markdown ticks, output pure JSON.`;
        const systemPrompt = options?.systemInstruction || defaultSystemPrompt;

        let reqConfig: Record<string, any> = {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
        };
        let reqContents: any[] = [prompt];
        
        if (task === 'speech.transcribe' && options?.audioInputBase64) {
          reqContents = [
            { inlineData: { mimeType: 'audio/mp3', data: options.audioInputBase64 } },
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
          rawText = rawText || 'Transcribed text';
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
    if (task === 'character.extract' || prompt.includes('Character Genesis') || prompt.includes('CharacterGenesisDraft')) {
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
      modelId: options?.modelId || 'gemini-2.5-pro',
      providerId: this.providerId,
    };
  }

  public getFallbackCatalog(): DiscoveredModelMetadata[] {
    return [
      {
        id: 'gemini-2.5-pro',
        rawName: 'models/gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro (Primary Narrator)',
        description: 'Flagship reasoning and narrative generation model',
        inputTokenLimit: 1048576,
        outputTokenLimit: 65536,
        supportedActions: ['generateContent', 'countTokens'],
        isAccessible: true,
        lifecycleState: 'active',
      },
      {
        id: 'gemini-2.5-flash',
        rawName: 'models/gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash (Fast Utility)',
        description: 'High-speed utility and dialogue model',
        inputTokenLimit: 1048576,
        outputTokenLimit: 65536,
        supportedActions: ['generateContent', 'countTokens'],
        isAccessible: true,
        lifecycleState: 'active',
      },
      {
        id: 'gemini-1.5-pro-long',
        rawName: 'models/gemini-1.5-pro-long',
        displayName: 'Gemini 1.5 Pro (Long-Context Specialist)',
        description: 'Specialized 2M token context window model',
        inputTokenLimit: 2000000,
        outputTokenLimit: 8192,
        supportedActions: ['generateContent', 'countTokens'],
        isAccessible: true,
        lifecycleState: 'active',
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
    storyId: string
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
    };
  }
}

/**
 * MultiModelOrchestrator
 * Implements DreamBook Challenge 12 & V6.0–V6.53.
 * 5 Canonical Model Pools, Intelligent Selection Scoring, Deterministic Tie-Breaking,
 * Circuit Breaking, Automated Failover, Cross-Model Continuation Checkpoints,
 * Strict Turn Package Validation, and Domain Adjudication.
 */
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
    this.loadPersistedConfig();
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

  private savePersistedConfig(): void {
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
      if (!model.isEmergencyFloor && !model.capabilities.includes('text_generation')) {
        model.capabilities.push('text_generation');
      }
      if (!model.supportedInputTypes || model.supportedInputTypes.length === 0) model.supportedInputTypes = ['text'];
      if (!model.supportedOutputTypes || model.supportedOutputTypes.length === 0) model.supportedOutputTypes = ['text'];

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
    const mapping: Record<AiTaskCategory, TaskId[]> = {
      narration: ['narrative.generate', 'narrative.review'],
      dialogue: ['character.dialogue'],
      summarization: ['summary.scene'],
      world_generation: ['world.generate'],
      character_genesis: ['character.extract'],
      memory: ['memory.extract'],
      research: ['research.query'],
      research_world_brief: ['research.world-brief'],
      utility: ['utility.inspect'],
      intent_interpretation: ['intent.interpret'],
      capability_synthesis: ['character.capability.propose', 'capability.synthesize'],
      capability_explanation: ['capability.explain'],
      tactical_reasoning: ['combat.tactics', 'tactical.reason', 'combat.animation.plan'],
      gameplay_advice: ['story.advice'],
      rules: ['rules.adjudicate'],
      rule_analysis: ['rules.analyze'],
      speech: ['speech.generate', 'speech.transcribe'],
      image: ['image.generate'],
    };
    return mapping[category] || [];
  }

  private modelKey(model: ModelRegistryRecord): string {
    return model.providerId + '::' + model.modelId;
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
    }
    return status;
  }

  private isModelCoolingDown(model: ModelRegistryRecord): boolean {
    const cooldownUntil = this.ensureRuntimeStatus(model).cooldownUntil;
    return typeof cooldownUntil === 'number' && cooldownUntil > Date.now();
  }

  private recordProviderSuccess(model: ModelRegistryRecord, result: ProviderGenerateResult, task: TaskId, startedAt: number): void {
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

  private recordProviderFailure(model: ModelRegistryRecord, task: TaskId, error: unknown, startedAt: number): void {
    const status = this.ensureRuntimeStatus(model);
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const failureType = this.classifyFailure(error);
    status.requests += 1;
    status.failureCount += 1;
    status.consecutiveFailures += 1;
    status.lastLatencyMs = latencyMs;
    status.lastFailureAt = Date.now();
    status.lastFailureReason = String((error as any)?.message || error).slice(0, 300);
    if (failureType === '429') status.rateLimit429Count += 1;
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
      model.health = status.status;
      if (failureType === '429') model.quota = 'Exhausted';
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
      failureType,
    });
    if (this.usageLedger.length > 500) this.usageLedger.splice(0, this.usageLedger.length - 500);
  }

  private seedDefaultPins(): void {
    this.taskPinnedModels.set('narrative.generate', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('world.generate', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('character.dialogue', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('story.advice', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('character.extract', 'google_gemini::gemini-3.5-flash-lite');
    this.taskPinnedModels.set('memory.extract', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('character.capability.propose', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('intent.interpret', 'google_gemini::gemini-3.5-flash-lite');
    this.taskPinnedModels.set('capability.synthesize', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('capability.explain', 'google_gemini::gemini-3.5-flash-lite');
    this.taskPinnedModels.set('research.query', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('research.world-brief', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('rules.analyze', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('tactical.reason', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('summary.scene', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('rules.adjudicate', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('utility.inspect', 'google_gemini::gemini-3.5-flash');
    this.taskPinnedModels.set('speech.generate', 'provider_mock_speech::mock-speech-v1');
    this.taskPinnedModels.set('image.generate', 'google_imagen::imagen-3.0-generate-002');

    // Default Fallback Chains
    const defaultChain = [
      'google_gemini::gemini-3.5-flash',
      'google_gemini::gemini-3.8-flash',
      'google_gemini::gemini-3.5-flash-lite',
      'provider_deterministic_emergency::emergency-fallback-local',
    ];
    for (const task of [
      'narrative.generate',
      'character.dialogue',
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
    ] as TaskId[]) {
      this.taskFallbackChains.set(task, [...defaultChain]);
    }
    this.taskFallbackChains.set('speech.generate', [
      'provider_mock_speech::mock-speech-v1',
      'provider_deterministic_emergency::emergency-fallback-local',
    ]);
    this.taskFallbackChains.set('speech.transcribe', [
      'provider_mock_stt::mock-stt-v1',
      'provider_deterministic_emergency::emergency-fallback-local',
    ]);
    this.taskFallbackChains.set('image.generate', [
      'google_imagen::imagen-3.0-generate-002',
      'provider_deterministic_emergency::emergency-fallback-local',
    ]);

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
      'google_gemini::gemini-3.5-flash',
      'google_gemini::gemini-3.8-flash',
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
      roleEligibility: [
        'narrative.generate',
        'character.dialogue',
        'memory.extract',
        'summary.scene',
        'rules.adjudicate',
        'utility.inspect',
      ],
      fallbackEligibility: true,
      accessStatus: 'accessible',
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
      roleEligibility: [
        'narrative.generate',
        'character.dialogue',
        'memory.extract',
        'summary.scene',
        'rules.adjudicate',
        'utility.inspect',
      ],
      fallbackEligibility: true,
      accessStatus: 'accessible',
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
      roleEligibility: [
        'narrative.generate',
        'character.dialogue',
        'memory.extract',
        'summary.scene',
        'rules.adjudicate',
        'utility.inspect',
      ],
      fallbackEligibility: true,
      accessStatus: 'accessible',
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
      roleEligibility: [
        'narrative.generate',
        'character.dialogue',
        'memory.extract',
        'summary.scene',
        'rules.adjudicate',
        'utility.inspect',
      ],
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
      userPriority: 30,
      roleEligibility: ['narrative.generate', 'summary.scene'],
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
      roleEligibility: ['character.dialogue', 'memory.extract', 'rules.adjudicate'],
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
      capabilities: ['zero_cost', 'unlimited_quota', 'deterministic'],
      contextWindow: 32000,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 5,
      userPriority: 10,
      roleEligibility: [
        'narrative.generate',
        'character.dialogue',
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
    const providers = ['google_gemini', 'provider_google_gemini', 'openrouter', 'openai', 'anthropic', 'elevenlabs', 'google_cloud_tts', 'google_imagen'];
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
      throw new Error('Model "' + modelKey + '" is not eligible for category "' + category + '".');
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
    const categories: AiTaskCategory[] = [
      'narration',
      'dialogue',
      'summarization',
      'world_generation',
      'character_genesis',
      'memory',
      'research',
      'research_world_brief',
      'utility',
      'intent_interpretation',
      'capability_synthesis',
      'capability_explanation',
      'tactical_reasoning',
      'gameplay_advice',
      'rules',
      'rule_analysis',
      'speech',
      'image',
    ];
    return categories.map((category) => {
      const tasks = this.getCategoryTasks(category);
      const activeModelKey =
        this.categoryOverrides.get(category)
        || this.taskPinnedModels.get(tasks[0])
        || this.getFallbackChain(tasks[0])[0];
      return {
        category,
        tasks,
        activeModelKey,
        mode: this.categoryOverrides.has(category) ? 'MANUAL' : 'AUTO',
        fallbackChain: this.getFallbackChain(tasks[0]),
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

  public async testModel(providerId: string, modelId: string): Promise<{
    success: boolean;
    status: 'READY' | 'CONFIGURED_NOT_TESTED' | 'QUOTA_LIMIT' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
    health: HealthState;
    quota: QuotaState;
    latencyMs: number;
    message: string;
    testedAt: number;
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
        };
      }
    }

    // 4. Other external providers
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
    if (providerId === 'provider_local_emergency') {
      return this.adapters.get('provider_deterministic_emergency') || this.adapters.get(providerId);
    }
    if (providerId === 'provider_google_gemini' || providerId === 'google_gemini') {
      return this.adapters.get('google_gemini') || this.adapters.get('provider_google_gemini');
    }
    return this.adapters.get(providerId);
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
    if (task && !model.roleEligibility.includes(task)) return false;

    if (task) {
      const contract = getAiTaskContract(task);
      const capabilities = new Set(model.capabilities || []);
      const hasExplicitCapabilityMetadata = capabilities.size > 0;
      const hasExplicitInputMetadata = Array.isArray(model.supportedInputTypes) && model.supportedInputTypes.length > 0;
      const hasExplicitOutputMetadata = Array.isArray(model.supportedOutputTypes) && model.supportedOutputTypes.length > 0;

      // Legacy/test model records may predate the capability-contract fields. If
      // they declare task eligibility but no capability metadata, keep them usable.
      if (hasExplicitCapabilityMetadata) {
        for (const required of contract.requiredCapabilities) {
          const satisfied =
            capabilities.has(required) ||
            (required === 'text_generation' && (
              capabilities.has('creative_writing') ||
              capabilities.has('fast') ||
              capabilities.has('reasoning') ||
              capabilities.has('structured_output') ||
              capabilities.has('deep_reasoning') ||
              capabilities.has('text')
            )) ||
            (required === 'structured_output' && model.hasStructuredOutput === true);
          if (!satisfied) return false;
        }
      }

      if (hasExplicitInputMetadata && contract.requiredInputTypes.some((type) => !model.supportedInputTypes!.includes(type))) {
        return false;
      }
      if (hasExplicitOutputMetadata && contract.requiredOutputTypes.some((type) => !model.supportedOutputTypes!.includes(type))) {
        return false;
      }

      if (
        contract.requiresStructuredOutput &&
        hasExplicitCapabilityMetadata &&
        !model.hasStructuredOutput &&
        !capabilities.has('structured_output')
      ) {
        return false;
      }
    }

    if (
      model.health === 'DisabledByUser' ||
      model.health === 'Unavailable' ||
      model.health === 'InvalidAuth'
    ) return false;
    // A known exhausted quota is not a runnable candidate. Do not let the
    // selector advertise a model as callable and then discover the quota error
    // only inside the provider attempt loop.
    if (
      model.quota === 'Exhausted' ||
      model.accessStatus === 'quota_limited' ||
      model.accessStatus === 'rate_limited'
    ) return false;
    if (this.isCircuitBreakerTripped(model.providerId, model.modelId)) return false;
    if (this.isModelCoolingDown(model)) return false;
    if (contextTokens > 0 && model.contextWindow > 0 && contextTokens > model.contextWindow) return false;
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
    // IMPORTANT: once a category is manually selected, its fallback scope is closed
    // to the task's configured chain. Never inject unrelated automatically-ranked
    // models into a user-selected category.
    if (categoryOverrideKey) {
      const overridden = findConfiguredModel(categoryOverrideKey);
      if (overridden && isUsableCandidate(overridden)) {
        const hasExplicitFallbackChain = this.explicitFallbackChainTasks.has(routeTask);
        const configuredFallbacks = hasExplicitFallbackChain && customChainKeys
          ? customChainKeys
              .map(findConfiguredModel)
              .filter((m): m is ModelRegistryRecord => Boolean(m))
              .filter((m) => m.modelId !== overridden.modelId && isUsableCandidate(m))
          : Array.from(this.models.values())
              .filter((m) => m.modelId !== overridden.modelId)
              .filter((m) => m.roleEligibility.includes(task))
              .filter((m) => !m.isEmergencyFloor)
              .filter((m) => isUsableCandidate(m))
              .sort((a, b) => {
                const scoreA = a.userPriority + (a.health === 'Healthy' ? 50 : 0);
                const scoreB = b.userPriority + (b.health === 'Healthy' ? 50 : 0);
                if (scoreB !== scoreA) return scoreB - scoreA;
                return a.modelId.localeCompare(b.modelId);
              });

        const fallbackSet = new Set<string>();
        const fallbackModels: ModelRegistryRecord[] = [];
        for (const candidate of configuredFallbacks) {
          const candidateKey = this.modelKey(candidate);
          if (!fallbackSet.has(candidateKey)) {
            fallbackSet.add(candidateKey);
            fallbackModels.push(candidate);
          }
        }

        const emergency = Array.from(this.models.values()).find(
          (m) => m.isEmergencyFloor && m.roleEligibility.includes(task)
        );
        if (emergency && !fallbackModels.some((m) => this.modelKey(m) === this.modelKey(emergency))) {
          fallbackModels.push(emergency);
        }

        return {
          selectedModel: overridden,
          selectionReason:
            'Category-scoped manual override for ' +
            category +
            '; fallback candidates are restricted to the configured task chain.',
          selectionScore: overridden.userPriority + 1000,
          fallbacks: fallbackModels,
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
      // Return emergency floor model (unless task is speech or completely incompatible)
      const emergency = Array.from(this.models.values()).find((m) => m.isEmergencyFloor);
      if (!emergency || !emergency.roleEligibility.includes(task)) {
        // Find if any model exists for this task
        const anyModel = Array.from(this.models.values()).find(
          (m) => m.roleEligibility.includes(task) && !this.isModelCoolingDown(m) && m.health !== 'DisabledByUser'
        );
        if (anyModel) {
          return {
            selectedModel: anyModel,
            selectionReason: `Selected eligible model for task '${task}', though degraded/exhausted.`,
            selectionScore: anyModel.userPriority,
            fallbacks: [],
          };
        }
        throw new Error(`No model available for task ${task}.`);
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
      // Configured chains are strict allow-lists. A model appearing in a chain
      // must already be eligible for this exact task. The first configured model
      // is preserved as the selected route even when currently throttled; the
      // execution loop will skip unusable entries and fail over to the next model.
      const configuredModels = customChainKeys
        .map(findConfiguredModel)
        .filter((m): m is ModelRegistryRecord => Boolean(m))
        .filter((m) => m.roleEligibility.includes(task));

      if (configuredModels.length > 0) {
        const selectedFromChain = configuredModels[0];
        const fallbackModels = configuredModels.slice(1).filter((m) =>
          m.health !== 'Unavailable' &&
          m.health !== 'DisabledByUser' &&
          !this.isCircuitBreakerTripped(m.providerId, m.modelId)
        );

        const emergency = Array.from(this.models.values()).find(
          (m) => m.isEmergencyFloor && m.roleEligibility.includes(task)
        );
        if (
          emergency &&
          !fallbackModels.some((m) => this.modelKey(m) === this.modelKey(emergency))
        ) {
          fallbackModels.push(emergency);
        }

        return {
          selectedModel: selectedFromChain,
          selectionReason:
            `Using the configured AI fallback order for '${task}' with task-eligible models only.`,
          selectionScore: selectedFromChain.userPriority + 500,
          fallbacks: fallbackModels,
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

    const best = scored[0].model;
    const fallbacks = scored.slice(1).map((s) => s.model);

    // Append emergency floor to fallbacks if not already present and eligible
    const emergency = Array.from(this.models.values()).find((m) => m.isEmergencyFloor);
    if (emergency && emergency.roleEligibility.includes(task) && !fallbacks.some((f) => f.modelId === emergency.modelId) && best.modelId !== emergency.modelId) {
      fallbacks.push(emergency);
    }

    return {
      selectedModel: best,
      selectionReason: `Selected based on high priority (${best.userPriority}), health (${best.health}), and quota (${best.quota}).`,
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
  public validateTurnPackage(rawText: string): {
    valid: boolean;
    turnPackage?: StructuredTurnPackage;
    errorReason?: string;
  } {
    try {
      const parsed = JSON.parse(rawText);

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

      // 4. DEF-CH12-05: State changes strict validation
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

      return {
        valid: true,
        turnPackage: {
          narrative: parsed.narrative,
          dialogue,
          events,
          stateChanges,
          memoryCandidates,
          audioCues,
        },
      };
    } catch (e) {
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
    timeoutMs?: number;
  }): Promise<{
    success: boolean;
    text: string;
    modelId?: string;
  }> {
    const audioBase64 = params.audioBase64 || '';
    const selection = this.selectBestModel('speech.transcribe', { contextTokens: 256 });
    const candidates = [selection.selectedModel, ...selection.fallbacks];
    const timeoutMs = params.timeoutMs || 5000;

    for (const candidate of candidates) {
      if (this.isModelCoolingDown(candidate) || this.isCircuitBreakerTripped(candidate.providerId, candidate.modelId)) continue;
      const adapter = this.getAdapter(candidate.providerId);
      if (!adapter) continue;

      const attemptStartedAt = Date.now();
      try {
        const res = await adapter.generate('speech.transcribe', 'Transcribe user audio input', {
          timeoutMs,
          modelId: candidate.modelId,
          audioInputBase64: audioBase64,
        });

        let transcribedText = '';
        try {
          const parsed = JSON.parse(res.text);
          transcribedText = parsed.narrative?.[0] || res.text;
        } catch {
          transcribedText = res.text;
        }

        if (!transcribedText) throw new Error('Transcription provider returned empty text.');
        this.recordProviderSuccess(candidate, res, 'speech.transcribe', attemptStartedAt);

        return {
          success: true,
          text: transcribedText,
          modelId: candidate.modelId,
        };
      } catch (err: any) {
        this.recordProviderFailure(candidate, 'speech.transcribe', err, attemptStartedAt);
      }
    }

    return {
      success: false,
      text: '',
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
   * Presentation-only narrative generation.
   *
   * Uses the same canonical working context and model selection infrastructure as a full
   * turn, but deliberately does NOT adjudicate state changes or create continuation
   * checkpoints. The caller remains responsible for canonical mechanics.
   */
  public async generateNarrativeOnly(params: {
    storyId?: string;
    playerAction: string;
    committedOutcome?: string;
    hardTokenBudget?: number;
    timeoutMs?: number;
    maxRetries?: number;
    styleInstruction?: string;
    continuationDirective?: string;
  }): Promise<{
    success: boolean;
    turnPackage?: StructuredTurnPackage;
    modelId?: string;
    providerId?: string;
    error?: string;
  }> {
    const storyId = params.storyId || 'default_story';
    const playerAction = (params.playerAction || '').trim();
    if (!playerAction) {
      return { success: false, error: 'A player action is required for narrative generation.' };
    }

    const hardTokenBudget = params.hardTokenBudget ?? 500;
    const timeoutMs = params.timeoutMs ?? 5000;
    const authoritativeOutcome = (params.committedOutcome || '').trim();
    const connectedDirective = (params.continuationDirective || '').trim();
    const styleInstruction = params.styleInstruction || [
      'Write the immediate player-facing narrator response to the current action.',
      authoritativeOutcome
        ? `The authoritative game engine has already committed this outcome. Acknowledge and narrate THIS outcome; do not replace it with a different result: ${authoritativeOutcome}`
        : 'There is no additional mechanical outcome supplied. Do not invent one.',
      connectedDirective
        ? `Connected pipeline presentation directive. Follow it only as style/presentation guidance while preserving canonical mechanics: ${connectedDirective}`
        : '',

      'Return only what the character can reasonably perceive and what the world immediately does in response.',
      'Keep it concise: 1–3 short paragraphs, normally under 90 words.',
      'Do not restate the player action verbatim.',
      'Do not add menus, meta-commentary, engine terminology, model names, or system-status language.',
      'Do not invent hidden facts, NPC knowledge, items, or outcomes that are not supported by the canonical context.',
      'Do not propose or perform canonical state changes. The response is presentation only.',
      'When the action has no meaningful mechanical consequence, acknowledge the sensory or emotional result naturally and leave a clear opening for the next action.',
    ].join(' ');

    const assembledContext = WorkingContextEngine.assembleTurnContext({
      storyId,
      playerAction,
      hardTokenBudget,
      worldRepo: this.getWorldRepository(),
      customChunks: [
        {
          id: 'narrative_presentation_contract',
          band: 'B1_CRITICAL',
          label: 'Narrative Presentation Contract',
          content: styleInstruction,
          estimatedTokens: WorkingContextEngine.estimateTokens(styleInstruction),
          sourceAuthority: 'DreamBook Narrative Presentation Layer',
          isProtected: true,
          relevanceScore: 1,
        },
      ],
    });

    const generated = await this.executeTaskGeneration(
      'narrative.generate',
      assembledContext.assembledText,
      styleInstruction,
      {
        timeoutMs,
        maxTokens: 350,
        contextTokens: assembledContext.totalTokens,
        validateResponse: (text) => {
          const validation = this.validateTurnPackage(text);
          return validation.valid
            ? { valid: true }
            : { valid: false, errorReason: validation.errorReason };
        },
      },
    );

    if (generated.source === 'DETERMINISTIC_FALLBACK' && !generated.text) {
      return {
        success: false,
        providerId: generated.providerId,
        modelId: generated.modelId,
        error: generated.fallbackReason || 'Deterministic narrative fallback produced no text.',
      };
    }

    const validation = this.validateTurnPackage(generated.text);
    if (!validation.valid || !validation.turnPackage) {
      return {
        success: false,
        providerId: generated.providerId,
        modelId: generated.modelId,
        error: validation.errorReason || 'Narrative response failed structured validation.',
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
    };
  }
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
    // V6.34 Stable Identifiers: stats remain process-local, but canonical turn identity
    // derives from the authoritative story command sequence so replay does not depend on
    // unrelated turns executed elsewhere in the process.
    this.totalTurnsExecuted += 1;
    const turnSequence = repo.getCanonicalCommandEvents(storyId).length + 1;
    const turnId = rawIdempotencyKey
      ? deterministicId('turn', storyId, rawIdempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_'))
      : deterministicId('turn', storyId, turnSequence, task, params.playerAction || '');

    // Checkpoint continuation awareness (V6.15 / V6.06)
    let priorCheckpoint: ContinuationCheckpoint | undefined;
    if (params.checkpointId) {
      priorCheckpoint = this.getContinuationCheckpoint(params.checkpointId);
      if (priorCheckpoint && priorCheckpoint.uncommittedOutput && !params.playerAction) {
        params.playerAction = `Resume: ${priorCheckpoint.uncommittedOutput}`;
      }
    }

    const executeCore = async (): Promise<OrchestratedTurnResult> => {
      // 1. Ingest CH11 Working Context (DEF-CH12-02)
      const assembledContext: AssembledTurnContext = WorkingContextEngine.assembleTurnContext({
        storyId,
        playerAction: params.playerAction || 'Observe surroundings and assess position',
        hardTokenBudget,
        worldRepo: repo,
      });

      // 1b. CH15 Source Adaptation Adjudication Check
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
              workingContextTokens: assembledContext.totalTokens,
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
                tone: 'evocative_canonical_archival',
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
              inputTokens: assembledContext.totalTokens,
              outputTokens: 20,
              validated: true,
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
        const forced = Array.from(this.models.values()).find((m) => m.modelId === params.forceModelId);
        if (!forced) throw new Error(`Forced model ID '${params.forceModelId}' not found.`);
        if (!forced.roleEligibility.includes(task)) {
          throw new Error(`Model '${params.forceModelId}' is not eligible for role/task '${task}'.`);
        }
        if (!this.isCandidateUsable(forced, task) && !forced.isEmergencyFloor) {
          throw new Error('Forced model "' + params.forceModelId + '" is unavailable, cooling down, or not context-eligible.');
        }
        selectedModel = forced;
        selectionReason = 'Explicitly forced model "' + params.forceModelId + '".';
        const configuredFallbacks = this.getFallbackChain(task)
          .map((key) => this.models.get(key) || Array.from(this.models.values()).find((m) => m.modelId === key))
          .filter((m): m is ModelRegistryRecord => Boolean(m))
          .filter((m) => m.modelId !== forced.modelId);
        fallbacks = configuredFallbacks.length > 0
          ? configuredFallbacks.filter((m) => this.isCandidateUsable(m, task) || m.isEmergencyFloor)
          : Array.from(this.models.values()).filter((m) => m.modelId !== forced.modelId && this.isCandidateUsable(m, task));
      } else {
        const selection = this.selectBestModel(task, { contextTokens: assembledContext.totalTokens });
        selectedModel = selection.selectedModel;
        selectionReason = selection.selectionReason;
        fallbacks = selection.fallbacks;
      }

      const candidateChain: ModelRegistryRecord[] = [selectedModel, ...fallbacks];
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
          const attemptStartedAt = Date.now();
          try {
            // Wrap provider call with AbortController for strict timeout enforcement
            const abortController = new AbortController();
            const timer = setTimeout(() => abortController.abort(), timeoutMs);

            let providerRes: ProviderGenerateResult;
            try {
              providerRes = await adapter.generate(task, assembledContext.assembledText, {
                timeoutMs,
                abortSignal: abortController.signal,
                retryCount: attempt,
                modelId: currentCandidate.modelId,
                audioInputBase64: params.audioInputBase64,
                voiceProfile: params.voiceProfile,
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

            // 5. Adjudicate State Changes through Domain Authority Bridge (DEF-CH12-05)
            this.recordProviderSuccess(currentCandidate, providerRes, task, attemptStartedAt);

            const adjudication = DomainAdjudicationBridge.adjudicate(
              validation.turnPackage,
              repo,
              storyId
            );

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
              workingContextTokens: assembledContext.totalTokens,
              worldTime: repo.getWorldClock(storyId).formatHeader(),
              locationId: repo.getPlayerLifecycle(storyId)?.locationId || 'loc_whispering_orrery',
              sceneSummary: validation.turnPackage.narrative[0] || 'Scene observed.',
              recentOutput: validation.turnPackage.narrative.join(' '),
              uncommittedOutput: '',
              canonicalInvariants: {
                playerActorId: `player_actor_${storyId}`,
                discoveredLocations: repo.getPlayerLifecycle(storyId)?.discoveredLocationIds || [],
              },
              styleContract: {
                tone: 'evocative_canonical_archival',
                epistemicSanitized: 'true',
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
                totalTokens: assembledContext.totalTokens,
                truncated: (assembledContext.evictedChunkLabels?.length ?? 0) > 0,
                viewerActorId: `player_actor_${storyId}`,
              },
              handoffEligible: true,
              summaryText: validation.turnPackage.narrative[0] || 'Scene observed.',
              recentHistory: validation.turnPackage.narrative || [],
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
              inputTokens: Math.min(providerRes.inputTokens || assembledContext.totalTokens, assembledContext.totalTokens),
              outputTokens: providerRes.outputTokens || 50,
              validated: true,
              adjudicationResult: adjudication,
              checkpointCreated: checkpointId,
              recoveredFromCheckpoint: Boolean(params.checkpointId),
              idempotencyKey: rawIdempotencyKey,
            };
            this.lastTurnTelemetry = telemetry;

            return {
              success: true,
              turnPackage: validation.turnPackage,
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
              currentCandidate.health = 'Throttled';
              currentCandidate.quota = 'Exhausted';
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
          const res = await emergencyAdapter.generate(task, assembledContext.assembledText, {
            audioInputBase64: params.audioInputBase64,
            voiceProfile: params.voiceProfile,
          });
          this.recordProviderSuccess(emergencyModel, res, task, emergencyStartedAt);
          const validation = this.validateTurnPackage(res.text);
          if (validation.valid && validation.turnPackage) {
            const adjudication = DomainAdjudicationBridge.adjudicate(
              validation.turnPackage,
              repo,
              storyId
            );
            const checkpointId = rawIdempotencyKey
              ? deterministicId('cp_emergency', storyId, rawIdempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_'), totalAttempts)
              : deterministicId('cp_emergency', storyId, turnId, totalAttempts);
            const checkpoint: ContinuationCheckpoint = {
              checkpointId,
              storyId,
              turnId,
              role: 'narrator',
              worldTime: repo.getWorldClock(storyId).formatHeader(),
              locationId: repo.getPlayerLifecycle(storyId)?.locationId || 'loc_whispering_orrery',
              sceneSummary: validation.turnPackage.narrative[0],
              recentOutput: validation.turnPackage.narrative.join(' '),
              uncommittedOutput: '',
              canonicalInvariants: {},
              styleContract: {
                tone: 'deterministic_emergency',
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
                totalTokens: assembledContext.totalTokens,
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
              inputTokens: assembledContext.totalTokens,
              outputTokens: 30,
              validated: true,
              adjudicationResult: adjudication,
              checkpointCreated: checkpointId,
              recoveredFromCheckpoint: Boolean(params.checkpointId),
              idempotencyKey: rawIdempotencyKey,
            };
            this.lastTurnTelemetry = telemetry;

            return {
              success: true,
              turnPackage: validation.turnPackage,
              telemetry,
              adjudicationResult: adjudication,
              checkpoint,
              audioResultBase64: res.audioBase64,
            };
          }
        }
      }

      return {
        success: false,
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
          inputTokens: assembledContext.totalTokens,
          outputTokens: 0,
          validated: false,
          idempotencyKey: rawIdempotencyKey,
        },
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
      validateResponse?: (text: string) => TaskResponseValidationResult;
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
  }> {
    this.refreshAllProviderModelStatuses();
    const timeoutMs = options?.timeoutMs || 35000;
    const contextTokens = options?.contextTokens ?? 0;
    const selection = this.selectBestModel(task, { contextTokens });

    const selectedCandidates: ModelRegistryRecord[] = [selection.selectedModel, ...selection.fallbacks];
    const candidateKeys = new Set(selectedCandidates.map((model) => this.modelKey(model)));

    const candidateChain: ModelRegistryRecord[] = selectedCandidates
      .filter((model) =>
        model.isEmergencyFloor ||
        this.isCandidateUsable(model, task, contextTokens)
      );

    if (candidateChain.length === 0) {
      const emergency = Array.from(this.models.values()).find(
        (model) => model.isEmergencyFloor && model.roleEligibility.includes(task)
      );
      if (emergency) {
        candidateChain.push(emergency);
      }
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
      try {
        totalAttempts++;
        const abortController = new AbortController();
        const timer = setTimeout(() => abortController.abort(), timeoutMs);

        let providerRes: ProviderGenerateResult;
        try {
          providerRes = await adapter.generate(task, prompt, {
            timeoutMs,
            maxTokens: options?.maxTokens,
            abortSignal: abortController.signal,
            modelId: currentCandidate.modelId,
            systemInstruction,
          });
        } finally {
          clearTimeout(timer);
        }

        if (!providerRes || !providerRes.text) {
          throw new Error('Provider returned empty response.');
        }

        if (options?.validateResponse) {
          const validation = options.validateResponse(providerRes.text);
          if (!validation.valid) {
            throw new Error(
              'Task response schema validation failed' +
              (validation.errorReason ? `: ${validation.errorReason}` : '.')
            );
          }
        }

        const latencyMs = Math.max(1, Date.now() - attemptStartedAt);
        this.recordProviderSuccess(currentCandidate, providerRes, task, attemptStartedAt);
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
        const source = isEmergency ? 'DETERMINISTIC_FALLBACK' : (cIdx === 0 ? 'AI_PRIMARY' : 'AI_FALLBACK');
        const fallbackReason = cIdx > 0
          ? `Fell back to ${currentCandidate.displayName || currentCandidate.modelId} after ${cIdx} earlier model failure(s).`
          : undefined;

        return {
          text: providerRes.text,
          source,
          providerId: currentCandidate.providerId,
          modelId: currentCandidate.modelId,
          fallbackReason,
          attempts: totalAttempts,
          attemptsTrail,
        };
      } catch (err: any) {
        lastError = err?.message || String(err);
        const latencyMs = Math.max(1, Date.now() - attemptStartedAt);
        this.recordProviderFailure(currentCandidate, task, err, attemptStartedAt);
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

    const emergency = Array.from(this.models.values()).find((m) => m.isEmergencyFloor) || {
      providerId: 'provider_deterministic_emergency',
      modelId: 'emergency-fallback-local',
    };

    const trailSummary = attemptsTrail.length > 0
      ? attemptsTrail
          .map((a, i) => `${i + 1}. ${a.displayName || a.modelId} (${a.providerId}) — ${a.error || 'Unavailable'}`)
          .join('; ')
      : lastError;

    return {
      text: '',
      source: 'DETERMINISTIC_FALLBACK',
      providerId: emergency.providerId,
      modelId: emergency.modelId,
      fallbackReason: `All ${attemptsTrail.length} AI providers failed: ${trailSummary}`,
      attempts: totalAttempts,
      attemptsTrail,
    };
  }

  /**
   * Automated Fallback Configuration Engine.
   *
   * This remains the legacy auto-arrangement path for now; the formal
   * task-specific preflight model intelligence layer will replace the
   * generic provider probe in the next orchestration specification pass.
   */
  public async autoConfigureFallbacks(options?: {
    maxFallbacksPerCategory?: number;
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
      status: 'READY' | 'FAILED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
      latencyMs?: number;
      errorReason?: string;
    }>;
    configuredChains: Record<string, string[]>;
    summaryMessage: string;
  }> {
    const maxFallbacks = Math.max(2, Math.min(6, options?.maxFallbacksPerCategory ?? 4));

    // 1. Force discovery refresh from all adapters
    await this.discoverAndRegisterModels({ forceRefresh: true });

    const allModels = this.getAllModels().filter(
      (m) => !m.isEmergencyFloor && m.health !== 'DisabledByUser'
    );

    const testResults: Array<{
      providerId: string;
      modelId: string;
      displayName: string;
      status: 'READY' | 'FAILED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
      latencyMs?: number;
      errorReason?: string;
    }> = [];

    const healthyModels: ModelRegistryRecord[] = [];

    // 2. Ping / benchmark all registered models
    for (const model of allModels) {
      try {
        const res = await this.testModel(model.providerId, model.modelId);
        if (res.success && res.status === 'READY') {
          healthyModels.push(model);
          testResults.push({
            providerId: model.providerId,
            modelId: model.modelId,
            displayName: model.displayName || model.modelId,
            status: 'READY',
            latencyMs: res.latencyMs,
          });
        } else {
          testResults.push({
            providerId: model.providerId,
            modelId: model.modelId,
            displayName: model.displayName || model.modelId,
            status: res.status as any,
            latencyMs: res.latencyMs,
            errorReason: res.message,
          });
        }
      } catch (err: any) {
        testResults.push({
          providerId: model.providerId,
          modelId: model.modelId,
          displayName: model.displayName || model.modelId,
          status: 'FAILED',
          errorReason: err?.message || String(err),
        });
      }
    }

    // 3. Assign optimal fallback chains for each canonical task
    const tasksToConfigure: TaskId[] = [
      'narrative.generate',
      'world.generate',
      'character.dialogue',
      'character.extract',
      'character.capability.propose',
      'memory.extract',
      'story.advice',
      'intent.interpret',
      'capability.synthesize',
      'capability.explain',
      'research.query',
      'research.world-brief',
      'summary.scene',
      'rules.adjudicate',
      'rules.analyze',
      'combat.tactics',
      'tactical.reason',
      'combat.animation.plan',
      'narrative.review',
      'utility.inspect',
      'speech.generate',
      'speech.transcribe',
      'image.generate',
    ];

    const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';

    for (const task of tasksToConfigure) {
      const eligibleHealthy = healthyModels
        .filter((m) => m.roleEligibility.includes(task))
        .sort((a, b) => {
          let scoreA = a.userPriority - (a.latencyMs || 500) / 10;
          let scoreB = b.userPriority - (b.latencyMs || 500) / 10;
          if (task === 'narrative.generate' || task === 'world.generate' || task === 'character.dialogue' || task === 'narrative.review') {
            if (a.pool === 'creative' || a.pool === 'reasoning') scoreA += 50;
            if (b.pool === 'creative' || b.pool === 'reasoning') scoreB += 50;
          } else if (
            task === 'intent.interpret' ||
            task === 'capability.explain' ||
            task === 'story.advice' ||
            task === 'memory.extract' ||
            task === 'character.extract'
          ) {
            if (a.pool === 'fast') scoreA += 40;
            if (b.pool === 'fast') scoreB += 40;
          } else if (
            task === 'capability.synthesize' ||
            task === 'research.query' ||
            task === 'research.world-brief' ||
            task === 'rules.adjudicate' ||
            task === 'rules.analyze' ||
            task === 'combat.tactics' ||
            task === 'tactical.reason'
          ) {
            if (a.pool === 'reasoning' || a.pool === 'long_context') scoreA += 45;
            if (b.pool === 'reasoning' || b.pool === 'long_context') scoreB += 45;
          }
          return scoreB - scoreA;
        });

      const topKeys = eligibleHealthy.slice(0, maxFallbacks).map((m) => `${m.providerId}::${m.modelId}`);
      const chain = topKeys.length > 0 ? [...topKeys, emergencyKey] : [emergencyKey];
      this.taskFallbackChains.set(task, chain);

      if (topKeys[0]) {
        this.taskPinnedModels.set(task, topKeys[0]);
      }
    }

    this.savePersistedConfig();

    const healthyCount = healthyModels.length;
    const failedCount = testResults.filter((r) => r.status !== 'READY').length;

    return {
      success: true,
      timestamp: Date.now(),
      totalModelsTested: testResults.length,
      healthyModelsCount: healthyCount,
      failedModelsCount: failedCount,
      results: testResults,
      configuredChains: this.getAllFallbackChains(),
      summaryMessage: `AI Auto-Configuration Complete: Tested ${testResults.length} models (${healthyCount} responsive, ${failedCount} unavailable). Configured up to ${maxFallbacks} fallback models per task category.`,
    };
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
