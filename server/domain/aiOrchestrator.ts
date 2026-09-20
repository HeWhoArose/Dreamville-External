import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { WorldTimestamp } from './types';
import { WorkingContextEngine, AssembledTurnContext } from './workingContextEngine';
import type { WorldRepository } from '../repositories/worldRepository';
import { worldRepository } from '../repositories/worldRepository';
import { StoryAdaptationPipeline } from './storyAdaptation';

export type TaskId =
  | 'narrative.generate'
  | 'character.dialogue'
  | 'memory.extract'
  | 'rules.adjudicate'
  | 'summary.scene'
  | 'speech.generate'
  | 'speech.transcribe'
  | 'combat.tactics'
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
  modelId: string;
  providerId: string;
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
      case 'narrative.generate':
      default:
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
  const capabilities: string[] = ['text_generation', 'reasoning', 'structured_output'];
  if (discovered.thinking) {
    capabilities.push('extended_thinking');
  }
  if ((discovered.inputTokenLimit || 0) >= 1000000) {
    capabilities.push('long_context');
  }

  let pool: ModelPool = 'creative';
  let roleEligibility: TaskId[] = ['narrative.generate', 'summary.scene'];
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
    const apiKey = typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined;
    const canExecuteLive = Boolean(apiKey) && !this.isMockOnly;

    if (canExecuteLive) {
      try {
        const ai = new GoogleGenAI({
          apiKey: apiKey!,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const targetModel = options?.modelId || 'gemini-2.5-flash';
        const systemPrompt = `You are the Dreamville canonical narrator. Produce ONLY a valid JSON turn package matching this exact schema:
{
  "narrative": ["text describing world events"],
  "dialogue": [{"speaker": "string", "text": "string"}],
  "events": ["EVENT_NAME"],
  "stateChanges": [{"kind": "INVENTORY|LOCATION|CAPABILITY|COMBAT", "targetId": "string", "value": "string"}],
  "memoryCandidates": ["string"],
  "audioCues": ["string"]
}
Do not enclose in markdown ticks, output pure JSON.`;

        
        let reqConfig = {
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

        let parsed: any;
        if (task === 'speech.transcribe') {
          rawText = rawText || 'Transcribed text';
          parsed = { narrative: [rawText], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] };
          return {
            text: JSON.stringify(parsed),
            latencyMs,
            inputTokens: res.usageMetadata?.promptTokenCount || 0,
            outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
            modelId: targetModel,
            providerId: this.providerId,
            rawResponse: res,
          };
        }
        if (task === 'speech.generate') {
          parsed = { narrative: [rawText || 'Generated speech'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] };
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
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parsed = {
            narrative: [rawText || 'The world advances under celestial geometry.'],
            dialogue: [],
            events: ['REAL_GEMINI_OUTPUT'],
            stateChanges: [],
            memoryCandidates: [],
            audioCues: [],
          };
          rawText = JSON.stringify(parsed);
        }

        if (!Array.isArray(parsed.narrative) || parsed.narrative.length === 0) {
          parsed.narrative = ['The celestial armatures turn steadily in the chamber.'];
          rawText = JSON.stringify(parsed);
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
    const text = JSON.stringify({
      narrative: [
        'The prismatic lenses align with celestial geometry, casting refracted amber rays across the chamber floor.',
      ],
      dialogue: [
        { speaker: 'Scribe Vael', text: 'The astral alignment matches the parchment records from Cycle 3.' },
      ],
      events: ['CELESTIAL_ALIGNMENT_OBSERVED'],
      stateChanges: [
        { kind: 'CHRONICLE', targetId: 'ev_celestial_alignment', value: 'Observed prismatic celestial alignment' },
      ],
      memoryCandidates: ['The prismatic lenses aligned with the third astral ring.'],
      audioCues: ['glass_harmonic', 'brass_gear_click'],
    });

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
  private taskPinnedModels: Map<TaskId, string> = new Map();
  private taskFallbackChains: Map<TaskId, string[]> = new Map();
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
  }

  private loadPersistedConfig(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          if (data.pins && typeof data.pins === 'object') {
            for (const [task, key] of Object.entries(data.pins)) {
              if (typeof key === 'string') {
                this.taskPinnedModels.set(task as TaskId, key);
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
      fs.writeFileSync(this.configFilePath, JSON.stringify({ pins, fallbackChains, overrides }, null, 2), 'utf-8');
    } catch (e) {
      // Ignore save errors
    }
  }

  private seedDefaultPins(): void {
    this.taskPinnedModels.set('narrative.generate', 'google_gemini::gemini-3.6-flash');
    this.taskPinnedModels.set('character.dialogue', 'google_gemini::gemini-3.6-flash');
    this.taskPinnedModels.set('memory.extract', 'google_gemini::gemini-3.6-flash');
    this.taskPinnedModels.set('summary.scene', 'google_gemini::gemini-3.6-flash');
    this.taskPinnedModels.set('rules.adjudicate', 'google_gemini::gemini-3.6-flash');
    this.taskPinnedModels.set('utility.inspect', 'google_gemini::gemini-3.6-flash');
    this.taskPinnedModels.set('speech.generate', 'provider_mock_speech::mock-speech-v1');
    this.taskPinnedModels.set('image.generate', 'google_imagen::imagen-3.0-generate-002');

    // Default Fallback Chains
    const defaultChain = [
      'google_gemini::gemini-3.6-flash',
      'google_gemini::gemini-2.5-flash',
      'provider_deterministic_emergency::emergency-fallback-local',
    ];
    this.taskFallbackChains.set('narrative.generate', defaultChain);
    this.taskFallbackChains.set('character.dialogue', defaultChain);
    this.taskFallbackChains.set('memory.extract', defaultChain);
    this.taskFallbackChains.set('summary.scene', defaultChain);
    this.taskFallbackChains.set('rules.adjudicate', defaultChain);
    this.taskFallbackChains.set('utility.inspect', defaultChain);
  }

  public setFallbackChain(task: TaskId, chain: string[]): void {
    this.taskFallbackChains.set(task, chain.filter(Boolean));
    this.savePersistedConfig();
  }

  public getFallbackChain(task: TaskId): string[] {
    return this.taskFallbackChains.get(task) || [
      'google_gemini::gemini-3.6-flash',
      'google_gemini::gemini-2.5-flash',
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
    // 0. Primary Operational Text Model: Gemini 3.6 Flash (LIVE & READY)
    this.registerModel({
      providerId: 'google_gemini',
      modelId: 'gemini-3.6-flash',
      displayName: 'Gemini 3.6 Flash (Primary Live Text Engine)',
      pool: 'fast',
      capabilities: ['fast', 'creative_writing', 'structured_extraction', 'long_context', 'low_cost'],
      contextWindow: 1000000,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 250,
      userPriority: 120,
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
        'memory.extract',
        'rules.adjudicate',
        'summary.scene',
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

    this.registerModel({
      providerId: 'openai',
      modelId: 'gpt-4o',
      displayName: 'OpenAI GPT-4o',
      pool: 'creative',
      capabilities: ['creative_writing', 'fast'],
      contextWindow: 128000,
      health: 'InvalidAuth',
      quota: 'Unknown',
      latencyMs: 0,
      userPriority: 50,
      roleEligibility: ['narrative.generate', 'character.dialogue'],
      accessStatus: 'not_configured',
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
      health: 'InvalidAuth',
      quota: 'Unknown',
      latencyMs: 0,
      userPriority: 50,
      roleEligibility: ['narrative.generate', 'summary.scene'],
      accessStatus: 'not_configured',
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
    const gemini = this.getAdapter('google_gemini') as GoogleGeminiAdapter;
    const isConfigured = Boolean(typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
    this.discoveryStatus = isConfigured && !gemini?.isMockOnly ? 'ConfiguredAndDiscovered' : 'MockDiscovered';

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

    // 3. Other External Providers
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
    }
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
    const contextTokens = options?.contextTokens ?? 0;

    // Check if a model is manually pinned for this task
    const pinnedKey = this.taskPinnedModels.get(task);
    if (pinnedKey) {
      const pinnedModel = Array.from(this.models.values()).find(
        (m) => `${m.providerId}::${m.modelId}` === pinnedKey || m.modelId === pinnedKey
      );
      if (
        pinnedModel &&
        pinnedModel.health !== 'Unavailable' &&
        pinnedModel.health !== 'DisabledByUser' &&
        !this.isCircuitBreakerTripped(pinnedModel.providerId, pinnedModel.modelId)
      ) {
        if (contextTokens === 0 || contextTokens <= pinnedModel.contextWindow) {
          const rawFallbacks = Array.from(this.models.values()).filter(
            (m) => m.modelId !== pinnedModel.modelId && m.roleEligibility.includes(task)
          );
          const fallbacks = rawFallbacks.sort((a, b) => {
            const scoreA = a.userPriority + (a.health === 'Healthy' ? 50 : 0) - (this.consecutiveFailures.get(`${a.providerId}::${a.modelId}`) || 0) * 25;
            const scoreB = b.userPriority + (b.health === 'Healthy' ? 50 : 0) - (this.consecutiveFailures.get(`${b.providerId}::${b.modelId}`) || 0) * 25;
            if (scoreB !== scoreA) return scoreB - scoreA;
            return a.modelId.localeCompare(b.modelId);
          });
          return {
            selectedModel: pinnedModel,
            selectionReason: `Model '${pinnedModel.modelId}' was manually pinned for task '${task}'.`,
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
        const anyModel = Array.from(this.models.values()).find((m) => m.roleEligibility.includes(task));
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

    const customChainKeys = this.taskFallbackChains.get(task);

    const scored = eligible.map((model) => {
      let score = model.userPriority;
      if (customChainKeys) {
        const chainIndex = customChainKeys.findIndex((k) => k === `${model.providerId}::${model.modelId}` || k === model.modelId);
        if (chainIndex !== -1) {
          score += (customChainKeys.length - chainIndex) * 200;
        }
      }
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

    for (const rec of records) {
      if (!rec) continue;
      if (typeof rec === 'string') {
        const id = `cp_restored_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
        const checkpointId = rec.checkpointId || `cp_${storyId}_${rec.turnId || Date.now()}`;
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

    // Check pinned or best model for speech.generate
    const pinned = this.getPinnedModelForTask('speech.generate');
    const targetModelId = pinned || 'mock-speech-v1';
    const providerId = 'provider_mock_speech';

    // R12: Check derived speech cache
    if (cache) {
      const cacheKey = cache.computeKey(text, params.voiceProfile, providerId, targetModelId);
      const cached = cache.get(cacheKey);
      if (cached) {
        return {
          success: true,
          audioResultBase64: cached,
          fallbackText: text,
          fromCache: true,
          modelId: targetModelId,
        };
      }
    }

    try {
      let adapter = this.getAdapter(providerId);
      let selectedModelId = targetModelId;

      if (!adapter) {
        adapter = this.getAdapter('google_gemini');
        selectedModelId = 'gemini-2.5-flash';
      }

      if (!adapter) {
        return {
          success: false,
          audioResultBase64: null,
          fallbackText: text,
        };
      }

      const timeoutMs = params.timeoutMs || 5000;
      const res = await adapter.generate('speech.generate', text, {
        timeoutMs,
        modelId: selectedModelId,
        voiceProfile: params.voiceProfile,
      });

      const audioBase64 = res.audioBase64 || null;

      if (audioBase64 && cache) {
        const cacheKey = cache.computeKey(text, params.voiceProfile, providerId, selectedModelId);
        cache.set(cacheKey, audioBase64);
      }

      return {
        success: !!audioBase64,
        audioResultBase64: audioBase64,
        fallbackText: text || 'Speech synthesized.',
        fromCache: false,
        modelId: selectedModelId,
      };
    } catch (err: any) {
      return {
        success: false,
        audioResultBase64: null,
        fallbackText: text,
      };
    }
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
    const pinned = this.getPinnedModelForTask('speech.transcribe');
    const targetModelId = pinned || 'mock-stt-v1';
    const providerId = 'provider_mock_stt';

    try {
      let adapter = this.getAdapter(providerId);
      let selectedModelId = targetModelId;

      if (!adapter) {
        adapter = this.getAdapter('google_gemini');
        selectedModelId = 'gemini-2.5-flash';
      }

      if (!adapter) {
        return {
          success: false,
          text: '',
        };
      }

      const timeoutMs = params.timeoutMs || 5000;
      const res = await adapter.generate('speech.transcribe', 'Transcribe user audio input', {
        timeoutMs,
        modelId: selectedModelId,
        audioInputBase64: audioBase64,
      });

      let transcribedText = '';
      try {
        const parsed = JSON.parse(res.text);
        transcribedText = parsed.narrative?.[0] || res.text;
      } catch {
        transcribedText = res.text;
      }

      return {
        success: true,
        text: transcribedText || 'Transcribed text',
        modelId: selectedModelId,
      };
    } catch (err: any) {
      return {
        success: false,
        text: '',
      };
    }
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

    // V6.34 Stable Identifiers: Deterministically scoped when idempotencyKey is present
    const turnId = rawIdempotencyKey
      ? `turn_${storyId}_${rawIdempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : `turn_${Date.now()}_${++this.totalTurnsExecuted}`;
    const repo = this.getWorldRepository();

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
          repo.addAdaptationEvent(storyId, {
            id: `evt_div_${Date.now()}`,
            storyId,
            branchId: session?.branchId || 'main_branch',
            type: 'DIVERGENCE',
            involvedEntities: ['player'],
            timestamp: new Date().toISOString(),
            reason: evalResult.reason,
            details: { action: params.playerAction },
          });

          const chronicle = repo.getHistoricalChronicleEngine(storyId);
          chronicle.recordEvidence({
            id: `chron_div_${Date.now()}`,
            category: 'WORLD_ANOMALY',
            sourceEventId: `evt_div_${Date.now()}`,
            timestamp: repo.getWorldClock(storyId).getTimestamp(),
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
        selectedModel = forced;
        selectionReason = `Explicitly forced model '${params.forceModelId}'.`;
        fallbacks = Array.from(this.models.values()).filter((m) => m.modelId !== params.forceModelId);
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

        // Circuit breaker check
        if (this.isCircuitBreakerTripped(currentCandidate.providerId, currentCandidate.modelId)) {
          continue;
        }

        const adapter = this.getAdapter(currentCandidate.providerId);
        if (!adapter) {
          continue;
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          totalAttempts++;
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
            const adjudication = DomainAdjudicationBridge.adjudicate(
              validation.turnPackage,
              repo,
              storyId
            );

            // 6. Create Continuation Checkpoint (DEF-CH12-06, V6.15 completeness)
            const checkpointId = rawIdempotencyKey
              ? `cp_${storyId}_${rawIdempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
              : `cp_${Date.now()}_${turnId}`;
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
              taskId: task,
              selectedModelId: currentCandidate.modelId,
              selectedProviderId: currentCandidate.providerId,
              selectionScore: currentCandidate.userPriority,
              selectionReason,
              fallbackChain: candidateChain.slice(0, cIdx + 1).map((m) => m.modelId),
              attempts: totalAttempts,
              latencyMs: providerRes.latencyMs,
              inputTokens: providerRes.inputTokens || assembledContext.totalTokens,
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
              const backoffMs = Math.min(100, 20 * Math.pow(2, attempt));
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
          const res = await emergencyAdapter.generate(task, assembledContext.assembledText, {
            audioInputBase64: params.audioInputBase64,
            voiceProfile: params.voiceProfile,
          });
          const validation = this.validateTurnPackage(res.text);
          if (validation.valid && validation.turnPackage) {
            const adjudication = DomainAdjudicationBridge.adjudicate(
              validation.turnPackage,
              repo,
              storyId
            );
            const checkpointId = rawIdempotencyKey
              ? `cp_emergency_${storyId}_${rawIdempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
              : `cp_emergency_${Date.now()}`;
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
              styleContract: { tone: 'deterministic_emergency' },
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
    options?: { timeoutMs?: number }
  ): Promise<{
    text: string;
    source: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK';
    providerId: string;
    modelId: string;
    fallbackReason?: string;
    attempts: number;
  }> {
    const timeoutMs = options?.timeoutMs || 15000;
    const selection = this.selectBestModel(task);
    const candidateChain: ModelRegistryRecord[] = [selection.selectedModel, ...selection.fallbacks];
    let totalAttempts = 0;
    let lastError = '';

    for (let cIdx = 0; cIdx < candidateChain.length; cIdx++) {
      const currentCandidate = candidateChain[cIdx];
      const modelKey = `${currentCandidate.providerId}::${currentCandidate.modelId}`;

      if (this.isCircuitBreakerTripped(currentCandidate.providerId, currentCandidate.modelId)) {
        continue;
      }

      const adapter = this.getAdapter(currentCandidate.providerId);
      if (!adapter) {
        continue;
      }

      try {
        totalAttempts++;
        const abortController = new AbortController();
        const timer = setTimeout(() => abortController.abort(), timeoutMs);

        let providerRes: ProviderGenerateResult;
        try {
          providerRes = await adapter.generate(task, prompt, {
            timeoutMs,
            abortSignal: abortController.signal,
            modelId: currentCandidate.modelId,
            systemInstruction,
          });
        } finally {
          clearTimeout(timer);
        }

        this.consecutiveFailures.set(modelKey, 0);

        if (!providerRes || !providerRes.text) {
          throw new Error('Provider returned empty response.');
        }

        const isEmergency = Boolean(currentCandidate.isEmergencyFloor) ||
                            currentCandidate.providerId.includes('emergency') ||
                            currentCandidate.providerId === 'provider_deterministic_emergency';
        const source = isEmergency ? 'DETERMINISTIC_FALLBACK' : (cIdx === 0 ? 'AI_PRIMARY' : 'AI_FALLBACK');
        const fallbackReason = cIdx > 0 ? `Primary model unavailable or exhausted; fell back to ${currentCandidate.modelId}` : undefined;

        return {
          text: isEmergency ? '' : providerRes.text,
          source,
          providerId: currentCandidate.providerId,
          modelId: currentCandidate.modelId,
          fallbackReason,
          attempts: totalAttempts,
        };
      } catch (err: any) {
        lastError = err?.message || String(err);
        const failures = (this.consecutiveFailures.get(modelKey) || 0) + 1;
        this.consecutiveFailures.set(modelKey, failures);
        if (failures >= 2) {
          this.circuitBreakersTripped.add(modelKey);
          currentCandidate.health = 'Unavailable';
        }
      }
    }

    const emergency = Array.from(this.models.values()).find((m) => m.isEmergencyFloor) || {
      providerId: 'provider_deterministic_emergency',
      modelId: 'emergency-fallback-local',
    };

    return {
      text: '',
      source: 'DETERMINISTIC_FALLBACK',
      providerId: emergency.providerId,
      modelId: emergency.modelId,
      fallbackReason: `All AI providers failed. Last error: ${lastError}`,
      attempts: totalAttempts,
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
